import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  prospectDetailActionIsCurrent,
  runProspectDetailActionOnce,
} from "../components/engine/ProspectDetail";

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
  const guard = { current: null };
  const pendingStates: boolean[] = [];
  const request = deferred<{ ok: boolean; message: string }>();
  let requests = 0;
  const outreachSent = 0;
  const action = async () => {
    requests += 1;
    return request.promise;
  };

  const first = runProspectDetailActionOnce(guard, (pending) => pendingStates.push(pending), action);
  assert.equal(typeof guard.current, "symbol");
  assert.deepEqual(pendingStates, [true]);

  const duplicate = await runProspectDetailActionOnce(guard, (pending) => pendingStates.push(pending), action);
  assert.equal(duplicate.started, false);
  assert.equal(requests, 1);

  request.resolve({ ok: true, message: "Outreach regenerated with the current script." });
  const completed = await first;
  assert.equal(completed.started, true);
  assert.equal(completed.value?.ok, true);
  assert.equal(guard.current, null);
  assert.deepEqual(pendingStates, [true, false]);
  assert.equal(outreachSent, 0);
});

test("prospect detail action guard restores its pending state after a safe failure", async () => {
  const guard = { current: null };
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

  assert.equal(guard.current, null);
  assert.deepEqual(pendingStates, [true, false]);
});

test("a prospect switch invalidates stale completion feedback without clearing the next prospect action", async () => {
  const guard = { current: null };
  const firstRequest = deferred<{ ok: boolean; message: string }>();
  const secondRequest = deferred<{ ok: boolean; message: string }>();
  const pendingOwners: string[] = [];
  const firstOwner = { prospectId: "prospect-a", selectionVersion: 0 };
  const secondOwner = { prospectId: "prospect-b", selectionVersion: 1 };

  const first = runProspectDetailActionOnce(
    guard,
    (pending) => pendingOwners.push(`a:${pending}`),
    () => firstRequest.promise,
  );

  guard.current = null;
  pendingOwners.push("a:false");
  assert.equal(prospectDetailActionIsCurrent(firstOwner, secondOwner.prospectId, secondOwner.selectionVersion), false);

  const second = runProspectDetailActionOnce(
    guard,
    (pending) => pendingOwners.push(`b:${pending}`),
    () => secondRequest.promise,
  );

  firstRequest.resolve({ ok: true, message: "Prospect A updated." });
  await first;
  assert.equal(typeof guard.current, "symbol");
  assert.deepEqual(pendingOwners, ["a:true", "a:false", "b:true"]);

  secondRequest.resolve({ ok: true, message: "Prospect B updated." });
  await second;
  assert.equal(guard.current, null);
  assert.deepEqual(pendingOwners, ["a:true", "a:false", "b:true", "b:false"]);
  assert.equal(prospectDetailActionIsCurrent(secondOwner, secondOwner.prospectId, secondOwner.selectionVersion), true);
});

test("mobile outreach actions switch tabs before starting and refreshed data stays scoped to the API prospect", () => {
  const detailSource = readFileSync("components/engine/ProspectDetail.tsx", "utf8");
  const engineSource = readFileSync("components/ProspectEngine.tsx", "utf8");
  const mobileAction = detailSource.slice(
    detailSource.indexOf("function runMobileOutreachAction"),
    detailSource.indexOf("useEffect(() => {", detailSource.indexOf("function runMobileOutreachAction")),
  );

  assert.ok(mobileAction.indexOf('setDetailTab("Outreach")') < mobileAction.indexOf("void action()"));
  assert.match(detailSource, /runMobileOutreachAction\(regenerateOutreachWithFeedback\)/);
  assert.match(detailSource, /runMobileOutreachAction\(refreshReviewPackageWithFeedback\)/);
  assert.match(detailSource, /outreachActionFeedback\?\.prospectId === prospect\.id/);
  assert.match(engineSource, /prospect\.id === payload\.updatedProspect!\.id \? payload\.updatedProspect! : prospect/);
  assert.match(engineSource, /await loadProspects\(\)/);
});

test("Prospect Outreach renders guarded loading, success, and safe failure feedback without send behavior", () => {
  const detailSource = readFileSync("components/engine/ProspectDetail.tsx", "utf8");
  const engineSource = readFileSync("components/ProspectEngine.tsx", "utf8");
  const css = readFileSync("app/engine/engine.css", "utf8");
  const outreachView = detailSource.slice(
    detailSource.indexOf("function OutreachView"),
    detailSource.indexOf("function DraftSection"),
  );

  assert.match(detailSource, /const outreachRegenerating = outreachRegenerationProspectId === prospect\.id/);
  assert.match(detailSource, /const reviewPackageRefreshing = reviewPackageRefreshProspectId === prospect\.id/);
  assert.match(detailSource, /prospectDetailActionIsCurrent\(owner, activeProspectRef\.current\.prospectId, activeProspectRef\.current\.selectionVersion\)/);
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
