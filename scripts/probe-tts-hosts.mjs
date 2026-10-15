#!/usr/bin/env node
/**
 * Is the live speech service answering?
 *
 * Every clip the app speaks is synthesised through one of the hosts in
 * server/edgeSpeech.js. Those hosts belong to someone else and change without
 * notice: in October 2026 the original host began refusing handshakes, and
 * nothing noticed until the voice was arriving twenty seconds late. The
 * offline gate (check:tts-handshake) proves the client handles a refusal; it
 * cannot see the real service. This does, and the speech-health workflow runs
 * it on a schedule so a host going dark becomes an issue in the tracker rather
 * than a slow voice in the app.
 *
 * Healthy means the FIRST host, the one every clip tries first, opens at least
 * HEALTHY_SHARE of its handshakes. The others are reported but do not decide
 * the result: a fallback that is down costs nothing while the first host
 * holds, and one that is up does not make a failing first host acceptable,
 * because every clip still pays a refusal before it gets there.
 *
 * A failing first pass is measured again after a pause, so one dropped
 * connection on the runner does not raise an alarm.
 *
 * Usage: node scripts/probe-tts-hosts.mjs [--report <file.md>] [--attempts <n>]
 * Exit 0 healthy, 1 unhealthy, 2 the probe itself could not run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argValue = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const reportPath = argValue("--report");
const attempts = Math.max(1, Number(argValue("--attempts") ?? 10));
const HEALTHY_SHARE = 0.8;
const RECHECK_AFTER_MS = 60_000;
const SAMPLE_TEXT = "Guten Morgen, wie geht es dir?";
const SAMPLE_VOICE = "de-DE-KatjaNeural";

const writeReport = (markdown) => {
  if (reportPath) fs.writeFileSync(reportPath, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
};

/** The host's address without its key, which is fine to publish but noisy. */
const hostName = (url) => {
  try { return new URL(url).host; } catch { return String(url).slice(0, 60); }
};

async function probeHost(synthesizeSpeech, host) {
  const results = [];
  for (let i = 0; i < attempts; i += 1) {
    const started = Date.now();
    try {
      const audio = await synthesizeSpeech(SAMPLE_TEXT, SAMPLE_VOICE, "+0%", host);
      // A turn that ends with no audio is a failure the app would hear as silence.
      results.push(audio?.length > 0
        ? { ok: true, ms: Date.now() - started }
        : { ok: false, ms: Date.now() - started, why: "empty clip" });
    } catch (error) {
      results.push({
        ok: false,
        ms: Date.now() - started,
        why: error?.status ? `refused ${error.status}` : String(error?.message ?? error).slice(0, 80),
      });
    }
  }
  const opened = results.filter((r) => r.ok);
  const reasons = {};
  for (const r of results) if (!r.ok) reasons[r.why] = (reasons[r.why] ?? 0) + 1;
  const times = opened.map((r) => r.ms).sort((a, b) => a - b);
  return {
    host: hostName(host),
    share: opened.length / results.length,
    opened: opened.length,
    tried: results.length,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
    reasons,
  };
}

async function probeAll(synthesizeSpeech, hosts) {
  const out = [];
  for (const host of hosts) out.push(await probeHost(synthesizeSpeech, host));
  return out;
}

const table = (rows) => [
  "| Host | Role | Opened | Median | Failures |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map((r, i) => `| \`${r.host}\` | ${i === 0 ? "first choice" : "fallback"} | ${r.opened}/${r.tried} | ${
    r.medianMs === null ? "—" : `${r.medianMs} ms`} | ${
    Object.entries(r.reasons).map(([why, n]) => `${why} ×${n}`).join(", ") || "none"} |`),
].join("\n");

let speech;
try {
  speech = await import(pathToFileURL(path.join(root, "server", "edgeSpeech.js")).href);
} catch (error) {
  writeReport(`## Speech probe could not run\n\nLoading server/edgeSpeech.js failed: \`${String(error?.message ?? error)}\`\n`);
  process.exit(2);
}

const { SYNTHESIS_HOSTS, synthesizeSpeech } = speech;
let rows = await probeAll(synthesizeSpeech, SYNTHESIS_HOSTS);
let rechecked = false;
if (rows[0].share < HEALTHY_SHARE) {
  rechecked = true;
  await new Promise((resolve) => setTimeout(resolve, RECHECK_AFTER_MS));
  rows = await probeAll(synthesizeSpeech, SYNTHESIS_HOSTS);
}

const healthy = rows[0].share >= HEALTHY_SHARE;
const anyUp = rows.some((r) => r.share >= HEALTHY_SHARE);
const verdict = healthy
  ? "Speech is healthy: the first-choice host is answering."
  : anyUp
    ? "The first-choice speech host is failing. A fallback still answers, so clips play, but each one pays for a refusal first."
    : "No speech host is answering. The app cannot speak until one does.";

writeReport([
  `## ${healthy ? "Speech healthy" : anyUp ? "Speech degraded" : "Speech down"}`,
  "",
  verdict,
  "",
  table(rows),
  "",
  `Healthy means the first-choice host opens at least ${Math.round(HEALTHY_SHARE * 100)}% of ${attempts} handshakes.${
    rechecked ? " The first pass fell short, so this is the second measurement, taken a minute later." : ""}`,
  "",
  healthy ? "" : [
    "Where to look:",
    "- Time handshakes from a machine in the affected region: refusals have been regional before.",
    "- Compare `SYNTHESIS_HOSTS` and the token constants in `server/edgeSpeech.js` with the current edge-tts project (rany2/edge-tts), which tracks Microsoft's endpoint changes.",
    "- `npm run probe:tts-hosts` runs this same measurement locally.",
    "",
  ].join("\n"),
].join("\n"));

process.exit(healthy ? 0 : 1);
