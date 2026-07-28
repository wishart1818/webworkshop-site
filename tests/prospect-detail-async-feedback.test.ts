import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runProspectDetailActionOnce } from "../components/engine/ProspectDetail";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("prospect outreach regeneration enters pending immediately and prevents duplicate requests", async () => {
  const guard = { current: false };
  const pendingStates: boolean[] = [];
  const request = deferred<{ ok: boolean; message: string }>();
  let requests = 0;
  const outreachSent = 0;
  const action = async () => {
    requests += 1;
    return request.promise;
  };

  const first = runProspectDetailActionOnce(guard, (pending) => pendingStates.push(pending), action);
  assert.equal(guard.current, true);
  assert.deepEqual(pendingStates, [true]);

  const duplicate = await runProspectDetailActionOnce(guard, (pending) => pendingStates.push(pending), action);
  assert.equal(duplicate.started, false);
  assert.equal(requests, 1);

  request.resolve({ ok: true, message: "Outreach regenerated with the current script." });
  const completed = await first;
  assert.equal(completed.started, true);
  assert.equal(completed.value?.ok, true);
  assert.equal(guard.current, false);
  assert.deepEqual(pendingStates, [true, false]);
  assert.equal(outreachSent, 0);
});

test("prospect detail action guard restores its pending state after a safe failure", async () => {
  const guard = { current: false };
  const pendingStates: boolean[] = [];
  const safeError = new Error("This prospect changed before regeneration completed.");

  await assert.rejects(
    runProspectDetailActionOnce(
      guard,
      (pending) => pendingStates.push(pending),
      async () => {
        throw safeError;
      },
    ),
    safeError,
  );

  assert.equal(guard.current, false);
  assert.deepEqual(pendingStates, [true, false]);
});

test("Prospect Outreach renders guarded loading, success, and safe failure feedback without send behavior", () => {
  const detailSource = readFileSync("components/engine/ProspectDetail.tsx", "utf8");
  const engineSource = readFileSync("components/ProspectEngine.tsx", "utf8");
  const css = readFileSync("app/engine/engine.css", "utf8");
  const outreachView = detailSource.slice(
    detailSource.indexOf("function OutreachView"),
    detailSource.indexOf("function DraftSection"),
  );

  assert.match(detailSource, /const \[outreachRegenerating, setOutreachRegenerating\] = useState\(false\)/);
  assert.match(detailSource, /const \[reviewPackageRefreshing, setReviewPackageRefreshing\] = useState\(false\)/);
  assert.match(outreachView, /aria-busy=\{outreachRegenerating\}/);
  assert.match(outreachView, /disabled=\{outreachRegenerating \|\| reviewPackageRefreshing\}/);
  assert.match(outreachView, /Regenerating…/);
  assert.match(outreachView, /Refreshing package…/);
  assert.match(outreachView, /engine-button__spinner/);
  assert.match(detailSource, /Outreach regenerated with the current script\./);
  assert.match(detailSource, /result\.value\.message/);
  assert.match(detailSource, /error instanceof Error \? error\.message/);
  assert.match(engineSource, /return \{ ok: false, message \}/);
  assert.match(css, /\.engine-button__spinner/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.engine-button__spinner\s*{[\s\S]*animation: none/);
  assert.doesNotMatch(outreachView, /fetch\(|sendApproved|sendEmail|submitContactForm|TWILIO|autoSend/i);
});
