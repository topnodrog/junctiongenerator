import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import WebSocket from 'ws';
import { parseExplorerEvidence } from '../../dist/ops/soak-evidence.js';
import { startMonitor, advanceMonitor, validateRunner, geminiReviewInput, observationFindings, SAMPLE_INTERVAL_MS } from '../../dist/ops/hosted-soak-monitor.js';
import { reviewRequest, parseReview } from './review.mjs';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const bucketName = process.env.MONITOR_BUCKET;
const windowId = process.env.MONITOR_WINDOW_ID;
const deadline = Date.parse(process.env.MONITOR_DEADLINE_UTC ?? '');
const participants = (process.env.MONITOR_PARTICIPANTS ?? '').split(',');
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite';
const schedulerJob = process.env.MONITOR_SCHEDULER_JOB;
const armed = process.env.MONITOR_ARMED === 'true';
if (!project || !bucketName || !windowId || !Number.isFinite(deadline) || !schedulerJob || !/^[a-z0-9-]+$/.test(windowId)) throw new Error('Incomplete monitor configuration');
const storage = new Storage({ projectId: project, timeout: 15000, retryOptions: { autoRetry: true, maxRetries: 2, totalTimeout: 20, maxRetryDelay: 3 } });
const bucket = storage.bucket(bucketName);
const control = `control/${windowId}`;
const stateName = `${control}/state.json`;
const runnerName = `incoming/${windowId}/back-checker.json`;
const endpoints = [
  { seed: 'seed-a', url: 'wss://seed-a.junctiongenerator.net' },
  { seed: 'seed-b', url: 'wss://jgc-testnet-seed-b.fly.dev' },
];

async function readJson(name) {
  const file = bucket.file(name);
  try {
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) > 2 * 1024 * 1024) throw new Error('Stored record exceeds its bound');
    const [data] = await bucket.file(name, { generation: metadata.generation }).download({ validation: 'crc32c' });
    return { value: JSON.parse(data.toString('utf8')), generation: metadata.generation };
  } catch (error) { if (Number(error.code) === 404) return null; throw error; }
}

async function putJson(name, value, generation = 0) {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > 2 * 1024 * 1024) throw new Error('Evidence exceeds its bound');
  await bucket.file(name).save(data, { resumable: false, contentType: 'application/json',
    preconditionOpts: { ifGenerationMatch: generation }, metadata: { cacheControl: 'no-store' }, validation: 'crc32c' });
}

async function updateJson(name, value) {
  const old = await readJson(name);
  await putJson(name, value, old?.generation ?? 0);
}

async function token() {
  const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Runtime authentication HTTP ${response.status}`);
  const data = await response.json();
  if (typeof data.access_token !== 'string') throw new Error('Runtime authentication unavailable');
  return data.access_token;
}

async function pauseScheduler() {
  const response = await fetch(`https://cloudscheduler.googleapis.com/v1/${schedulerJob}:pause`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const status = await fetch(`https://cloudscheduler.googleapis.com/v1/${schedulerJob}`, { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(15000) });
    if (!status.ok || (await status.json()).state !== 'PAUSED') throw new Error(`Scheduler pause HTTP ${response.status}`);
  }
}

function probe({ seed, url }) {
  const start = Date.now();
  return new Promise(resolve => {
    const ws = new WebSocket(url, { maxPayload: 65536, handshakeTimeout: 10000 });
    let finished = false;
    const finish = reachable => {
      if (finished) return; finished = true; clearTimeout(timer); ws.terminate();
      resolve({ seed, reachable, latencyMs: Date.now() - start });
    };
    const timer = setTimeout(() => finish(false), 12000);
    ws.once('open', () => finish(true)); ws.once('error', () => finish(false)); ws.once('close', () => finish(false));
  });
}

async function collect() {
  const results = await Promise.allSettled([
    (async () => {
      const response = await fetch('https://seed-a.junctiongenerator.net/explorer', { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Explorer HTTP ${response.status}`);
      const text = await response.text();
      if (Buffer.byteLength(text) > 512 * 1024) throw new Error('Explorer response exceeds its bound');
      const snapshot = parseExplorerEvidence(JSON.parse(text));
      for (const block of snapshot.recentBlocks) {
        if (!Array.isArray(block.participants) || block.participants.some(p => typeof p !== 'string')) throw new Error('Block participant evidence is malformed');
      }
      return snapshot;
    })(),
    Promise.all(endpoints.map(probe)),
    (async () => { const row = await readJson(runnerName); return row ? validateRunner(row.value, windowId) : null; })(),
  ]);
  return { capturedAt: new Date().toISOString(),
    explorer: results[0].status === 'fulfilled' ? results[0].value : null,
    ...(results[0].status === 'rejected' ? { explorerError: 'Explorer evidence unavailable or invalid' } : {}),
    transport: results[1].status === 'fulfilled' ? results[1].value : endpoints.map(e => ({ seed: e.seed, reachable: false, latencyMs: 0 })),
    runner: results[2].status === 'fulfilled' ? results[2].value : null,
  };
}

async function review(state, findings) {
  const hour = state.lastCapturedAt.slice(0, 13).replaceAll(':', '-');
  const reviewId = state.phase === 'observing' ? hour : `${hour}-final`;
  if (state.reviewAttempts >= 121 || await readJson(`review-attempts/${windowId}/${reviewId}.json`)) return;
  await putJson(`review-attempts/${windowId}/${reviewId}.json`, { attemptedAt: new Date().toISOString(), model, windowId });
  const input = geminiReviewInput(state, findings);
  let result;
  try {
    const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewRequest(input)), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    result = { status: 'reviewed', ...parseReview(await response.json(), input) };
  } catch (error) { result = { status: 'unavailable', reason: String(error.message).slice(0, 200), advisoryOnly: true }; }
  await putJson(`reviews/${windowId}/${reviewId}.json`, { capturedAt: new Date().toISOString(), model, input, ...result });
  await updateJson(`${control}/latest-review.json`, { capturedAt: new Date().toISOString(), model, ...result });
  state.reviewAttempts++; state.lastReviewHour = reviewId;
}

async function tick() {
  // Pause even if evidence storage is temporarily unavailable at the deadline.
  if (Date.now() >= deadline) await pauseScheduler();
  const saved = await readJson(stateName);
  if (Date.now() >= deadline || (saved && saved.value.phase !== 'observing')) {
    if (saved?.value.phase === 'observing') {
      const closed = { ...saved.value, phase: 'incomplete', closedAt: new Date().toISOString(), closureReason: 'Fixed collection deadline reached' };
      await putJson(stateName, closed, saved.generation);
    }
    await pauseScheduler();
    return { phase: saved?.value.phase === 'completed' ? 'completed' : 'incomplete', stopped: true };
  }
  if (saved && Date.now() - Date.parse(saved.value.lastCapturedAt) < SAMPLE_INTERVAL_MS - 30_000) return { phase: saved.value.phase, duplicateSlot: true };
  const observation = await collect();
  const evidenceName = `evidence/${windowId}/${observation.capturedAt.replaceAll(':', '-')}-${randomUUID()}.json`;
  // Persist the observations before interpreting them or calling the model.
  await putJson(evidenceName, observation);
  let state;
  let findings;
  if (!saved) {
    findings = observationFindings(observation, windowId);
    const visible = new Set(observation.explorer?.epoch.participants.map(p => p.address) ?? []);
    if (participants.some(address => !visible.has(address))) findings.push({ id: 'participant.baseline', severity: 'fail', message: 'Both owner participants must be visible before starting' });
    const modelCheck = await readJson(`${control}/model-preflight.json`);
    if (modelCheck?.value.status !== 'reviewed') findings.push({ id: 'gemini.preflight', severity: 'fail', message: 'Gemini must complete its connection check before starting' });
    if (!armed || findings.length) {
      await updateJson(`${control}/preflight.json`, { capturedAt: observation.capturedAt, armed, findings, evidenceName });
      return { phase: 'preflight', armed, findings };
    }
    state = startMonitor(windowId, participants, observation);
    state.hardEndAt = new Date(Math.min(deadline, Date.parse(state.hardEndAt))).toISOString();
  } else state = saved.value;
  const advanced = advanceMonitor(state, observation);
  state = advanced.state; findings = advanced.findings;
  await putJson(stateName, state, saved?.generation ?? 0);
  // A failed review must not discard a successfully saved observation.
  await review(state, findings);
  const updated = await readJson(stateName);
  if (updated?.value.evidenceHash === state.evidenceHash) await putJson(stateName, state, updated.generation);
  if (state.phase !== 'observing') await pauseScheduler();
  console.log(JSON.stringify({ windowId, phase: state.phase, capturedAt: state.lastCapturedAt, height: state.lastHeight, findings: findings.map(f => f.id) }));
  return { phase: state.phase, startedAt: state.startedAt, minimumEndAt: state.minimumEndAt, hardEndAt: state.hardEndAt,
    targetSettlementHeights: state.targetSettlementHeights, height: state.lastHeight, observations: state.observations, findings };
}

createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/healthz') { res.end('{"ok":true}'); return; }
    if (req.method === 'GET' && path === '/status') {
      const state = await readJson(stateName);
      const review = await readJson(`${control}/latest-review.json`);
      const summary = state ? { ...state.value, blocks: undefined } : null;
      res.end(JSON.stringify({ windowId, state: summary, review: review?.value ?? null, preflight: state ? undefined : (await readJson(`${control}/preflight.json`))?.value })); return;
    }
    if (req.method === 'POST' && path === '/enroll-back-checker') {
      if (Date.now() >= deadline) throw new Error('Window enrollment has expired');
      const [uploadUrl] = await bucket.file(runnerName).getSignedUrl({ version: 'v4', action: 'write', expires: deadline, contentType: 'application/json' });
      res.end(JSON.stringify({ windowId, expiresAt: new Date(deadline).toISOString(), uploadUrl })); return;
    }
    if (req.method === 'POST' && path === '/test-gemini') {
      if (Date.now() >= deadline) throw new Error('Window has expired');
      const prior = await readJson(`${control}/model-preflight.json`);
      if (prior?.value.status === 'reviewed') { res.end(JSON.stringify(prior.value)); return; }
      const hour = new Date().toISOString().slice(0, 13);
      await putJson(`review-attempts/${windowId}/preflight-${hour}.json`, { attemptedAt: new Date().toISOString(), model });
      const input = { scope: 'connection-check', findings: [], historicalFindingIds: [], limitations: ['Connection test only; no soak window has started and no node health is established'] };
      const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`, {
        method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewRequest(input)), signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) { res.statusCode = 503; res.end(JSON.stringify({ status: 'unavailable', httpStatus: response.status })); return; }
      const result = { status: 'reviewed', model, capturedAt: new Date().toISOString(), ...parseReview(await response.json(), input) };
      await updateJson(`${control}/model-preflight.json`, result);
      res.end(JSON.stringify(result)); return;
    }
    if (req.method === 'POST' && path === '/tick') { res.end(JSON.stringify(await tick())); return; }
    res.statusCode = 404; res.end('{"error":"not found"}');
  } catch (error) {
    console.error(JSON.stringify({ windowId, event: 'monitor-error', errorType: error.name ?? 'Error', code: error.code ?? null }));
    res.statusCode = 503; res.end('{"error":"monitor operation failed; evidence already saved is retained"}');
  }
}).listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
