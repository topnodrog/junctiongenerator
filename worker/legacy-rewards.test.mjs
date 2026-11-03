import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyDispensePreview } from "./legacy-rewards.mjs";

test("legacy dispense is an explicit read-only preview", () => {
  const preview = legacyDispensePreview([
    ["0x1111111111111111111111111111111111111111", "2", 1],
    ["0x2222222222222222222222222222222222222222", "3.5", 2],
  ]);
  assert.equal(preview.success, true);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.totalAmount, 5.5);
  assert.equal(preview.recipientCount, 2);
  assert.match(preview.message, /no database rows changed/i);
  assert.match(preview.message, /no on-chain transaction was submitted/i);
  assert.ok(!("batchId" in preview));
});

test("empty and malformed legacy batches stay harmless", () => {
  const preview = legacyDispensePreview([["bad-row"], ["wallet", "NaN"]]);
  assert.equal(preview.totalAmount, 0);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.recipientCount, 2);
  assert.equal(legacyDispensePreview(null).recipientCount, 0);
  assert.equal(legacyDispensePreview([]).message, "No pending claims. This legacy endpoint is read-only.");
});
