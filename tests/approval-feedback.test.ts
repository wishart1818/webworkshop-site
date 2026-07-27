import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("queue approval shows row-specific progress and optimistic confirmation", () => {
  const source = readFileSync("components/engine/AutonomousGrowthWorkspace.tsx", "utf8");
  assert.match(source, /approvingQueueItemId/);
  assert.match(source, /aria-busy=\{approving\}/);
  assert.match(source, /Approving\.\.\./);
  assert.match(source, /Validating the exact draft and safety gates/);
  assert.match(source, /queue: current\.queue\.map/);
  assert.match(source, /It has not been sent yet/);
});
