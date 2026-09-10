# Gemini owner rehearsal monitor

This collector observes an owner-operated rehearsal. It cannot approve independent
closed-beta acceptance, verify serialized settlement payouts, or establish useful
AI compute from simulation receipts. Existing seed processes and chain data are
not modified. Historical incomplete windows remain incomplete.

## Runtime

A private, IAM-authenticated Cloud Run service collects the public Google explorer,
both public WebSocket upgrades, and a sanitized status uploaded independently by
each Windows participant every five minutes. Each upload is bound to that
participant's public `1QGC...` address; there is no shared back-checker object.
Cloud Storage saves each observation before any interpretation. Object generation
preconditions protect concurrent state changes.
The runtime can create evidence but cannot overwrite or delete evidence objects;
only the window's control and incoming status prefixes are mutable.

Gemini 2.5 Flash-Lite reviews bounded summaries once per UTC hour. It has no tools,
credentials in its prompt, infrastructure control, or authority over test results.
Invalid or unavailable model output is recorded separately from node evidence.
A successful live model connection check is required before the baseline starts.
The model and collector run in Google Cloud even when Codex is closed.

Each Windows participant recorder uses an expiring signed URL limited to its own
address-bound status object. Its private configuration must remain outside Git
and logs. Windows must remain signed in and awake for the local node and recorder
to run. Neither the installer nor recorder starts, stops, or modifies the node.
Do not install a recorder configuration on a possibly compromised computer:
rebuild and independently check the machine first. Recorder status is only
availability evidence; canonical public blocks remain the source of truth for
contribution.

## Window and limitations

The baseline requires both owner participant addresses, plus one current,
connected, nonproducing participant-recorder status for each address. Partial
epochs are excluded. The window starts at the next full 144-block epoch and
targets three consecutive epochs, with at least 72 hours of observations and an
absolute stop within five days. Missing evidence, restarts, changed blocks and
gaps remain in the result even after recovery.
Cloud Scheduler is paused when collection completes or reaches its deadline.
Repeated requests after closure cannot extend the window.

Every raw observation is saved. A chain identity, supply, canonical-history, or
participant-coverage failure is immediately terminal. A single failed public
transport probe or delayed participant-recorder upload is retained as a warning and
escalates only after three consecutive five-minute samples; this avoids treating
one client-side timeout or observer/upload race as proof of a sustained outage.
The monitor records each missing participant once per canonical block, including
the public address and height, rather than inflating one absence on every poll.
Warnings remain visible for operator disposition but do not silently become
acceptance failures.

WebSocket upgrade success does not prove node admission or Fly chain agreement.
Private seed logs, backup restoration, bans, independent operator provenance,
and serialized payout verification require separate evidence. Monitor findings
do not reset or waive these requirements.

## Deployment

1. Build the node package and run its tests plus `node --test deploy/monitor/review.test.mjs`.
2. Run `node deploy/monitor/stage.mjs .tmp/monitor-build-UNIQUE` from the package.
   This creates a new allowlisted context with hashes; it excludes credentials,
   local chain state, tests, dependencies, and private business documents.
3. Provision private Storage and Artifact Registry resources and dedicated build,
   runtime, and scheduler service accounts. `provision.ps1` records the intended
   resource boundaries and preserves existing IAM bindings.
4. Build with `cloudbuild.yaml`, a dedicated build service account, and
   `CLOUD_LOGGING_ONLY`. Record the resulting image digest.
5. Deploy the image to authenticated Cloud Run with minimum zero, maximum one,
   concurrency one, 512 MiB memory, one CPU, request-based billing and a 120-second
   timeout. Set `MONITOR_ARMED=false` initially.
6. Configure `GOOGLE_CLOUD_PROJECT`, `MONITOR_BUCKET`, `MONITOR_WINDOW_ID`,
   `MONITOR_DEADLINE_UTC`, the two comma-separated `MONITOR_PARTICIPANTS`, and the
   full `MONITOR_SCHEDULER_JOB` name. Create a five-minute OIDC scheduler job using
   the dedicated invoker account, then pause it during enrollment.
7. On each participant machine, first confirm its local `/status` reports the
   expected public address, `"role": "participant"`, and `"participating": true`.
   Then make an authenticated POST to
   `/enroll-participant-recorder?participant=1QGC...` for that exact enrolled
   address. Save the returned address-bound configuration privately with a
   machine-local `historyPath`, install `Install-JgcSoakObserver.ps1`, and verify
   the first upload from each machine. Do not paste a signed URL into a task or log.
8. POST `/test-gemini`, check the successful model response, and POST `/tick` to
   inspect preflight findings. Only then deploy with `MONITOR_ARMED=true` and
   resume the scheduler. Verify durable observations from scheduled invocations.

GET `/status` reports the window and latest advisory review. Cloud Run IAM must
protect every route; the application does not implement a separate login.
The health endpoint checks service startup, not Google permissions or node health.
To stop early, pause this window's Cloud Scheduler job and disable its dedicated
Windows observer task. Preserve the evidence bucket and record the interruption.

## Cost bounds

At most 121 ordinary/final review attempts are recorded per window; preflight
retries are separately limited to one per UTC hour. Inputs are at most 12 KB,
outputs at most 384 tokens, and collection stops within five days. A maximum of
one Cloud Run instance and bounded network requests limit resource use. These
are workload limits, not a guaranteed currency cap. Account budgets alert but
do not automatically stop spending. Existing seed costs are separate.

At the September 2026 published prices, Gemini Flash-Lite text input is USD
$0.10 per million tokens and output is $0.40 per million tokens. Model reviews
should cost pennies for this window; Cloud Run, builds, storage, image retention,
and Scheduler add usage charges subject to the account's free allowances.
Check [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing),
[Cloud Run pricing](https://cloud.google.com/run/pricing), and
[Scheduler pricing](https://cloud.google.com/scheduler/pricing) before reuse.
Model availability and prices must be rechecked before later windows.
