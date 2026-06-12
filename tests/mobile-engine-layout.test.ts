import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/engine/engine.css", import.meta.url), "utf8");
const mobileStart = css.indexOf("@media (max-width: 767px)");
const mobileEnd = css.indexOf("@media (max-width: 420px)");
const mobileCss = css.slice(mobileStart, mobileEnd);

test("engine phone layout uses a single-column form flow", () => {
  assert.notEqual(mobileStart, -1);
  assert.match(mobileCss, /\.engine-top-prospect-launcher form\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.engine-discovery-form\s*{\s*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.engine-score-grid,\s*\.engine-two-col,\s*\.engine-form-grid\s*{\s*grid-template-columns: 1fr;/);
});

test("engine phone layout removes desktop-width result overflow", () => {
  assert.match(mobileCss, /\.engine-table__head\s*{\s*display: none;/);
  assert.match(mobileCss, /\.engine-table > button\s*{\s*min-width: 0;/);
  assert.match(mobileCss, /\.engine-pipeline\s*{\s*grid-template-columns: 1fr;\s*overflow-x: visible;/);
  assert.match(mobileCss, /\.engine-top-table article\s*{\s*min-width: 0;\s*grid-template-columns: 1fr;/);
  assert.doesNotMatch(mobileCss, /min-width:\s*36rem/);
});

test("engine phone controls and navigation account for iPhone interaction constraints", () => {
  assert.match(css, /padding-bottom: calc\(var\(--engine-mobile-nav-height\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /padding: 0\.4rem 0\.4rem calc\(0\.4rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /\.engine-top-prospect-launcher button\s*{\s*width: 100%;/);
  assert.match(mobileCss, /min-height: 2\.75rem;\s*font-size: 1rem;/);
});
