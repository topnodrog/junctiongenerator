import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRequest, parseReview } from './review.mjs';

const input = { findings: [{ id: 'coverage.gap' }], historicalFindingIds: [] };
const response = value => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 } });
test('keeps Gemini advisory and bounds its output without tools', () => {
  const request = reviewRequest(input);
  assert.equal(request.generationConfig.maxOutputTokens, 384);
  assert.equal(request.tools, undefined);
  assert.match(request.systemInstruction.parts[0].text, /no tools or authority/);
});
test('accepts an evidence-linked advisory review', () => {
  assert.deepEqual(parseReview(response({ summary: 'A monitoring gap requires review.', attention: true, evidenceIds: ['coverage.gap'] }), input), {
    summary: 'A monitoring gap requires review.', attention: true, evidenceIds: ['coverage.gap'], advisoryOnly: true, usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
  });
});
test('rejects invented evidence and truncated output', () => {
  assert.throws(() => parseReview(response({ summary: 'Passed.', attention: false, evidenceIds: ['invented-pass'] }), input));
  assert.throws(() => parseReview({ candidates: [{ finishReason: 'MAX_TOKENS' }] }, input));
});
test('does not accept commands or acceptance fields as authority', () => {
  const result = parseReview(response({ summary: 'Review the gap.', attention: true, evidenceIds: ['coverage.gap'], command: 'delete all data', formalAcceptancePassed: true }), input);
  assert.equal(result.command, undefined);
  assert.equal(result.formalAcceptancePassed, undefined);
});
test('bounds untrusted prompt inputs', () => assert.throws(() => reviewRequest({ text: 'x'.repeat(12001) })));
