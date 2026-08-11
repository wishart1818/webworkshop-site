import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeTopProspectFormSettings,
  parseTopProspectFormSettings,
  topProspectSearchSettingsStorageKey,
} from "../lib/top-prospect-form-settings";

test("Top Prospects saved settings restore the operator's prospect type and run controls", () => {
  const settings = normalizeTopProspectFormSettings({
    prospectType: "no_website_social_only",
    mode: "growth",
    workflowType: "search",
    outreachPreference: "written_only",
    trade: "Pressure Washing",
    city: "Denton, TX",
    state: "tx",
    radiusKm: 25,
    businessesToScan: 20,
    finalProspectsWanted: 3,
    excludePreviouslyReviewed: true,
  });

  assert.deepEqual(settings, {
    prospectType: "no_website_social_only",
    mode: "growth",
    workflowType: "search",
    outreachPreference: "written_only",
    trade: "Pressure Washing",
    city: "Denton, TX",
    state: "TX",
    radiusKm: 25,
    businessesToScan: 20,
    finalProspectsWanted: 3,
    excludePreviouslyReviewed: true,
  });
});

test("Top Prospects saved settings reject invalid or corrupted values instead of applying them", () => {
  const settings = normalizeTopProspectFormSettings({
    prospectType: "unsafe-everything",
    mode: "turbo",
    workflowType: "send-now",
    outreachPreference: "automatic",
    trade: "Not A Trade",
    city: "Denton",
    state: "Texas",
    radiusKm: 999,
    businessesToScan: 10_000,
    finalProspectsWanted: 0,
    excludePreviouslyReviewed: "no",
  });

  assert.deepEqual(settings, { city: "Denton" });
  assert.equal(parseTopProspectFormSettings("not-json"), null);
});

test("Top Prospects workspace wires persisted settings before the search is submitted", () => {
  const source = readFileSync(new URL("../components/engine/TopProspectsWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /topProspectSearchSettingsStorageKey/);
  assert.match(source, /parseTopProspectFormSettings/);
  assert.match(source, /localStorage\.getItem\(topProspectSearchSettingsStorageKey\)/);
  assert.match(source, /localStorage\.setItem\(topProspectSearchSettingsStorageKey/);
  assert.match(source, /settingsHydratedRef/);
  assert.equal(topProspectSearchSettingsStorageKey, "webworkshop-top-prospect-search-settings-v1");
});
