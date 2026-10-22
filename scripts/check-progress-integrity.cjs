#!/usr/bin/env node
/**
 * Progress is kept, scheduled and judged the way the learner would expect.
 *
 * Each case below was a real fault, found together in one audit:
 *
 *  - The split by course scoped keys as "session-completed@learn-de:<id>",
 *    and the mirror's prefix list only knew "session-completed:". Completed
 *    lessons, XP, the lesson count and the session log stopped reaching the
 *    shared file, so a device that lost its local storage came back to none.
 *  - Re-reading the mirror on window focus wrote its copy over anything saved
 *    while the read was in flight: answer straight after clicking back into
 *    the window, and the answer was undone.
 *  - The activity chart divided by 24 hours, so across a clock change a
 *    session between midnight and one was filed under the day before.
 *  - A permanent item's Infinity interval is null once stored, and read back
 *    as a one-day item: every "never show me this" lowered the ability score.
 *  - The same-day check took "graded today" for "learned today", so a review
 *    passed in the morning was checked again in the afternoon and two sittings
 *    a day climbed past the three-day rung.
 *  - Typed answers: "ue" folded to "u" everywhere, so "eine neu Idee" passed
 *    as a spelling slip for "eine neue Idee"; and only a dozen first words
 *    could be typed lowercase, so "kannst du mir helfen" was a wrong answer,
 *    explained as a rule about German nouns — on every course.
 */
process.env.TZ = "Europe/London";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");

// ── a browser just big enough for the storage module ───────────────────────
const store = new Map();
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
global.window = {
  localStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
global.localStorage = localStorage;
global.navigator = { language: "en-GB", languages: ["en-GB"] };
global.document = { documentElement: { lang: "en" }, createElement: () => ({}) };
global.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } };
global.Event = class Event { constructor(type) { this.type = type; } };

let mirror = {};
let posts = [];
let holdReads = null;
global.fetch = async (url, init = {}) => {
  assert.ok(String(url).startsWith("/api/storage"), `unexpected fetch ${url}`);
  if ((init.method || "GET") === "POST") {
    const { items } = JSON.parse(init.body);
    posts.push(items);
    for (const [key, value] of Object.entries(items)) {
      if (value == null) delete mirror[key];
      else mirror[key] = value;
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }
  const snapshot = { ...mirror };
  if (holdReads) await holdReads;
  return { ok: true, json: async () => ({ items: snapshot }) };
};

const built = esbuild.buildSync({
  stdin: {
    contents: [
      'export { saveScopedJson, flushSharedStorage, hydrateLocalStorageFromSharedStorage } from "./src/lib/profileStorage.ts";',
      'export { summarizeActivity } from "./src/lib/activity.ts";',
      'export { computeAbility } from "./src/lib/ability.ts";',
      'export { isSameDayCheckEligible } from "./src/lib/adaptivePractice.ts";',
      'export { recordPermanent } from "./src/lib/memoryStrength.ts";',
      'export { matchGermanSentence } from "./src/lib/germanTextMatch.ts";',
    ].join("\n"),
    resolveDir: root,
    sourcefile: "progress-integrity-entry.ts",
    loader: "ts",
  },
  alias: { "@": path.join(root, "src") },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  target: "node20",
  logLevel: "silent",
});
const loaded = new Module("progress-integrity-entry", null);
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(built.outputFiles[0].text, path.join(root, "progress-integrity-entry.cjs"));
const {
  saveScopedJson, flushSharedStorage, hydrateLocalStorageFromSharedStorage,
  summarizeActivity, computeAbility, isSameDayCheckEligible, recordPermanent, matchGermanSentence,
} = loaded.exports;

let failed = 0;
const pending = [];
const check = (label, run) => {
  pending.push(async () => {
    store.clear();
    store.set("gl-direction", "learn-de");
    mirror = {};
    posts = [];
    holdReads = null;
    try {
      await run();
      console.log(`ok   ${label}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${label}\n     ${error.message}`);
    }
  });
};
const posted = () => Object.assign({}, ...posts);

// ── the mirror ─────────────────────────────────────────────────────────────
check("course-scoped progress reaches the mirror", async () => {
  saveScopedJson("session-completed", { "p-1": { lastGrade: "know" } });
  saveScopedJson("totalXp", 120);
  saveScopedJson("activity-log", [{ ts: 1, durationSec: 60 }]);
  saveScopedJson("sessionsCompleted", 4);
  await flushSharedStorage();
  const sent = posted();
  for (const key of ["session-completed", "totalXp", "activity-log", "sessionsCompleted"]) {
    assert.ok(`${key}@learn-de:default` in sent, `${key}@learn-de:default was never sent to the mirror`);
  }
});

check("progress the mirror never received is sent to it, and nothing else is", async () => {
  store.set("session-completed@learn-de:default", '{"p-1":{"lastGrade":"know"}}');
  store.set("streak:default", "3"); // unscoped and absent: may have been deleted elsewhere
  await hydrateLocalStorageFromSharedStorage();
  await flushSharedStorage();
  const sent = posted();
  assert.strictEqual(sent["session-completed@learn-de:default"], '{"p-1":{"lastGrade":"know"}}',
    "a completed-lessons record missing from the mirror was not backed up");
  assert.ok(!("streak:default" in sent), "an unscoped key missing from the mirror was put back from here");
});

check("a save made while the mirror is being re-read is not overwritten by it", async () => {
  // Both kinds of key: one the mirror has always carried, one it carries now.
  mirror = { "streak:default": "5", "totalXp@learn-de:default": "100", "course-progress:default": '{"a":1}' };
  store.set("streak:default", "5");
  store.set("totalXp@learn-de:default", "100");
  store.set("course-progress:default", '{"a":0}');
  let release;
  holdReads = new Promise((resolve) => { release = resolve; });
  const hydrating = hydrateLocalStorageFromSharedStorage();
  saveScopedJson("streak", 6); // the answer given straight after focus
  saveScopedJson("totalXp", 150);
  release();
  await hydrating;
  assert.strictEqual(store.get("streak:default"), "6", "the fresh streak was replaced by the older mirror copy");
  assert.strictEqual(store.get("totalXp@learn-de:default"), "150", "the fresh XP was replaced by the older mirror copy");
  assert.strictEqual(store.get("course-progress:default"), '{"a":1}', "keys nobody touched should still be refreshed from the mirror");
});

// ── the calendar ───────────────────────────────────────────────────────────
check("activity lands on the right day across the October clock change", () => {
  assert.strictEqual(new Date(2026, 9, 24, 12).getTimezoneOffset(), -60, "TZ=Europe/London was not honoured (BST)");
  assert.strictEqual(new Date(2026, 9, 26, 12).getTimezoneOffset(), 0, "TZ=Europe/London was not honoured (GMT)");
  const now = new Date(2026, 9, 27, 12, 0).getTime();
  const sessions = [
    { ts: new Date(2026, 9, 24, 0, 30).getTime(), durationSec: 600 }, // before the change
    { ts: new Date(2026, 9, 26, 0, 30).getTime(), durationSec: 300 }, // after it
  ];
  const { buckets } = summarizeActivity(sessions, {}, 7, now);
  const byDate = Object.fromEntries(buckets.map((bucket) => [new Date(bucket.dayStart).getDate(), bucket.minutes]));
  assert.strictEqual(byDate[24], 10, `the 24 October session went to the wrong day: ${JSON.stringify(byDate)}`);
  assert.strictEqual(byDate[26], 5, `the 26 October session went to the wrong day: ${JSON.stringify(byDate)}`);
  for (const bucket of buckets) {
    const start = new Date(bucket.dayStart);
    assert.ok(start.getHours() === 0 && start.getMinutes() === 0, `a day starts at ${start.toString()}, not midnight`);
  }
});

// ── the ladder ─────────────────────────────────────────────────────────────
check("a permanent item counts as fully learned once stored", () => {
  const stored = (record) => JSON.parse(JSON.stringify(record));
  const permanent = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`p${i}`, stored(recordPermanent())]));
  const oneDay = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`p${i}`, { lastGrade: "know", successes: 1, intervalDays: 1 }]));
  assert.strictEqual(stored(recordPermanent()).intervalDays, null, "expected the stored interval to be null (JSON has no Infinity)");
  assert.ok(computeAbility(permanent).score > computeAbility(oneDay).score,
    "permanent items scored no deeper than one-day items");
});

check("the same-day check is for what was learned today, not reviewed today", () => {
  const now = new Date(2026, 9, 20, 16, 0).getTime();
  const morning = new Date(now - 6 * 3600_000).toISOString();
  const learnedToday = { lastGrade: "know", successes: 1, intervalDays: 1, updatedAt: morning, dueAt: new Date(now + 18 * 3600_000).toISOString() };
  const reviewedToday = { lastGrade: "know", successes: 2, intervalDays: 3, updatedAt: morning, dueAt: new Date(now + 66 * 3600_000).toISOString() };
  assert.strictEqual(isSameDayCheckEligible(learnedToday, now), true, "a phrase learned this morning should get its afternoon check");
  assert.strictEqual(isSameDayCheckEligible(reviewedToday, now), false, "a review passed this morning was offered as a same-day check");
});

// ── typed German ───────────────────────────────────────────────────────────
const answer = (input, target) => matchGermanSentence(input, target);
check("a dropped adjective or verb ending is wrong, not a spelling slip", () => {
  assert.strictEqual(answer("eine neu Idee", "eine neue Idee").ok, false, '"eine neu Idee" passed');
  assert.strictEqual(answer("die blau Jacke", "die blaue Jacke").ok, false, '"die blau Jacke" passed');
});
check("umlauts spelled out are still accepted, with a note", () => {
  for (const [input, target] of [["fuer dich", "für dich"], ["Die Tuer ist zu.", "Die Tür ist zu."], ["Ich moechte bitte zahlen.", "Ich möchte bitte zahlen."]]) {
    const result = answer(input, target);
    assert.ok(result.ok && result.spellingNote, `"${input}" for "${target}": ${JSON.stringify(result)}`);
  }
  assert.ok(answer("Das Feuer ist heiß.", "Das Feuer ist heiß.").ok, "an exact answer with eue was rejected");
});
check("a lowercase first word that is not a noun is accepted", () => {
  for (const [input, target] of [
    ["kannst du mir helfen", "Kannst du mir helfen?"],
    ["mir ist kalt", "Mir ist kalt."],
    ["heute gehe ich nach Hause", "Heute gehe ich nach Hause."],
    ["fuer mich bitte einen Kaffee", "Für mich bitte einen Kaffee."], // the umlaut-folded path too
    ["ich verstehe das nicht", "Ich verstehe das nicht."],
  ]) {
    assert.ok(answer(input, target).ok, `"${input}" for "${target}" was marked wrong`);
  }
});
check("a lowercase noun or formal Sie at the start still needs its capital", () => {
  // Deliberate, and pinned in check-answer-matching too: those capitals carry
  // what the word is, which is the thing being taught.
  for (const [input, target] of [["tisch sieben ist frei.", "Tisch sieben ist frei."], ["sie haben recht.", "Sie haben recht."]]) {
    const result = answer(input, target);
    assert.ok(!result.ok && result.capitalizationError, `"${input}": ${JSON.stringify(result)}`);
  }
});
check("a lowercase noun inside the sentence is still a capital-letter error", () => {
  const result = answer("Ich habe einen hund.", "Ich habe einen Hund.");
  assert.ok(!result.ok && result.capitalizationError, JSON.stringify(result));
  const inside = answer("heute gehe ich nach hause", "Heute gehe ich nach Hause.");
  assert.ok(!inside.ok && inside.capitalizationError, JSON.stringify(inside));
});
check("the capital-letter message is translated and only states the German rule on German", () => {
  const lesson = fs.readFileSync(path.join(root, "src/GuidedSession.tsx"), "utf8");
  assert.ok(!lesson.includes("Capitalization error! In German"), "the hard-coded English German-rule message is back");
  assert.ok(/targetLang\.startsWith\("de"\)\s*\?\s*ui\("Check the capital letters: a sentence starts with one, and in German/u.test(lesson),
    "the German noun rule is no longer limited to German courses");
});

(async () => {
  for (const run of pending) await run();
  if (failed) {
    console.error(`\n${failed} progress check(s) failed.`);
    process.exit(1);
  }
  console.log("\nProgress integrity checks passed.");
  process.exit(0);
})();
