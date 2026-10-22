// Small TTS proxy + static server for germ.
//
// Why this exists: the high-quality "Microsoft … Online (Natural)" voices you
// hear in Edge are Azure neural voices streamed from Microsoft's cloud. Browsers
// other than Edge are blocked from connecting to that service (it needs a
// WebSocket header browsers aren't allowed to set). A *server*, however, has full
// control over the connection, so it can generate the exact same audio and hand
// the browser a plain MP3 — which plays identically in every browser and on mobile.
//
// This is free (no API key, no Azure account) but uses Microsoft's Read Aloud
// endpoint unofficially, so treat it as best-effort. The client deliberately has
// no fallback voice (see src/lib/voice.ts): a failed clip is retried, then skipped.

import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { SYNTHESIS_HOSTS, synthesizeSpeech } from "./edgeSpeech.js";
import {
  exportUserManagedPetBundles,
  getCodexPetCatalog,
  importUserManagedPetBundles,
  removeUserManagedPet,
  resolveCodexPetSpritesheet,
} from "./codexPets.js";
import { fetchGalleryPage, installGalleryPet, installedGalleryIds, removeGalleryPet } from "./petGallery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default neural voice per language. Override per-request with ?voice=.
//
// en-GB was missing here, and the miss fell through to DEFAULT_VOICE — so a
// learner who picked British English was read to in GERMAN, by Katja. Every
// language the app can ask for needs an entry, and the fallback below has to
// land on the right LANGUAGE rather than on whatever the default happens to be.
const VOICE_BY_LANG = {
  "de-DE": "de-DE-KatjaNeural",
  "de-AT": "de-AT-IngridNeural",
  "de-CH": "de-CH-LeniNeural",
  de: "de-DE-KatjaNeural",
  "fr-FR": "fr-FR-DeniseNeural",
  fr: "fr-FR-DeniseNeural",
  "pl-PL": "pl-PL-ZofiaNeural",
  pl: "pl-PL-ZofiaNeural",
  "es-ES": "es-ES-ElviraNeural",
  es: "es-ES-ElviraNeural",
  "it-IT": "it-IT-ElsaNeural",
  it: "it-IT-ElsaNeural",
  "pt-PT": "pt-PT-RaquelNeural",
  "ru-RU": "ru-RU-SvetlanaNeural",
  pt: "pt-PT-RaquelNeural",
  ru: "ru-RU-SvetlanaNeural",
  "el-GR": "el-GR-AthinaNeural",
  el: "el-GR-AthinaNeural",
  "sq-AL": "sq-AL-AnilaNeural",
  sq: "sq-AL-AnilaNeural",
  "en-US": "en-US-AvaNeural",
  "en-GB": "en-GB-SoniaNeural",
  "en-AU": "en-AU-NatashaNeural",
  "en-IE": "en-IE-EmilyNeural",
  en: "en-US-AvaNeural",
};
const DEFAULT_VOICE = "de-DE-KatjaNeural";

/**
 * The voices offered in the app's voice picker.
 *
 * A curated list rather than all 322 Microsoft voices: these are the ones a
 * learner of any of the five courses would actually want, named the way a
 * person would describe them.
 */
const VOICE_CHOICES = {
  "de-DE": [
    { id: "de-DE-KatjaNeural", label: "Katja", note: "German — female" },
    { id: "de-DE-ConradNeural", label: "Conrad", note: "German — male" },
    { id: "de-DE-AmalaNeural", label: "Amala", note: "German — female" },
    { id: "de-DE-KillianNeural", label: "Killian", note: "German — male" },
    { id: "de-DE-SeraphinaMultilingualNeural", label: "Seraphina", note: "German — female, multilingual" },
    { id: "de-AT-IngridNeural", label: "Ingrid", note: "Austrian German — female" },
    { id: "de-AT-JonasNeural", label: "Jonas", note: "Austrian German — male" },
    { id: "de-CH-LeniNeural", label: "Leni", note: "Swiss German — female" },
    { id: "de-CH-JanNeural", label: "Jan", note: "Swiss German — male" },
  ],
  "en-GB": [
    { id: "en-GB-SoniaNeural", label: "Sonia", note: "British — female" },
    { id: "en-GB-RyanNeural", label: "Ryan", note: "British — male" },
    { id: "en-GB-LibbyNeural", label: "Libby", note: "British — female" },
    { id: "en-GB-ThomasNeural", label: "Thomas", note: "British — male" },
    { id: "en-GB-MaisieNeural", label: "Maisie", note: "British — younger female" },
    { id: "en-IE-EmilyNeural", label: "Emily", note: "Irish — female" },
    { id: "en-IE-ConnorNeural", label: "Connor", note: "Irish — male" },
    { id: "en-AU-NatashaNeural", label: "Natasha", note: "Australian — female" },
    { id: "en-AU-WilliamMultilingualNeural", label: "William", note: "Australian — male" },
  ],
  "en-US": [
    { id: "en-US-AvaNeural", label: "Ava", note: "American — female" },
    { id: "en-US-AndrewNeural", label: "Andrew", note: "American — male" },
    { id: "en-US-EmmaNeural", label: "Emma", note: "American — female" },
    { id: "en-US-BrianNeural", label: "Brian", note: "American — male" },
    { id: "en-US-AriaNeural", label: "Aria", note: "American — female" },
    { id: "en-US-GuyNeural", label: "Guy", note: "American — male" },
  ],
  "fr-FR": [
    { id: "fr-FR-DeniseNeural", label: "Denise", note: "French — female" },
    { id: "fr-FR-HenriNeural", label: "Henri", note: "French — male" },
    { id: "fr-FR-EloiseNeural", label: "Eloise", note: "French — female" },
    { id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne", note: "French — female, multilingual" },
  ],
  "pl-PL": [
    { id: "pl-PL-ZofiaNeural", label: "Zofia", note: "Polish — female" },
    { id: "pl-PL-MarekNeural", label: "Marek", note: "Polish — male" },
  ],
  "es-ES": [
    { id: "es-ES-ElviraNeural", label: "Elvira", note: "Spanish — female" },
    { id: "es-ES-AlvaroNeural", label: "Álvaro", note: "Spanish — male" },
  ],
  "it-IT": [
    { id: "it-IT-ElsaNeural", label: "Elsa", note: "Italian — female" },
    { id: "it-IT-DiegoNeural", label: "Diego", note: "Italian — male" },
  ],
  "pt-PT": [
    { id: "pt-PT-RaquelNeural", label: "Raquel", note: "Portuguese — female" },
    { id: "pt-PT-DuarteNeural", label: "Duarte", note: "Portuguese — male" },
  ],
  "ru-RU": [
    { id: "ru-RU-SvetlanaNeural", label: "Svetlana", note: "Russian — female" },
    { id: "ru-RU-DmitryNeural", label: "Dmitry", note: "Russian — male" },
  ],
  "el-GR": [
    { id: "el-GR-AthinaNeural", label: "Athina", note: "Greek — female" },
    { id: "el-GR-NestorasNeural", label: "Nestoras", note: "Greek — male" },
  ],
  "sq-AL": [
    { id: "sq-AL-AnilaNeural", label: "Anila", note: "Albanian — female" },
    { id: "sq-AL-IlirNeural", label: "Ilir", note: "Albanian — male" },
  ],
};

/** Every voice we are willing to synthesise with, so ?voice= cannot be anything. */
const ALLOWED_VOICES = new Set([
  ...Object.values(VOICE_CHOICES).flat().map((v) => v.id),
  ...Object.values(VOICE_BY_LANG),
]);

/**
 * Pick a voice for a language tag.
 *
 * Falls back along the tag rather than to a fixed default: en-NZ has no entry,
 * but it is English, and an English sentence read by a German voice is worse
 * than one read in the wrong English accent.
 */
function voiceForLang(lang) {
  const tag = String(lang || "").trim();
  if (VOICE_BY_LANG[tag]) return VOICE_BY_LANG[tag];
  const base = tag.split(/[-_]/)[0].toLowerCase();
  return VOICE_BY_LANG[base] || DEFAULT_VOICE;
}

// Convert a SpeechSynthesis-style rate (1.0 = normal) to edge-tts "+N%"/"-N%".
function ratePercent(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r === 1) return "+0%";
  const pct = Math.max(-50, Math.min(100, Math.round((r - 1) * 100)));
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

// Bounded in-memory cache so repeated sentences (very common in a lesson) are
// instant and we don't re-hit Microsoft for the same text. Count alone was not
// enough because clips vary greatly in size, so cap bytes as well.
const CACHE_MAX_ENTRIES = 128;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const cache = new Map(); // key -> Buffer
let cacheBytes = 0;
const pendingSynthesis = new Map();
const synthesisQueue = [];
// Three slots so one slow clip cannot serialize a two-language card while the
// immersion extension also asks for German.
const MAX_CONCURRENT_SYNTHESES = 3;
let activeSyntheses = 0;
// A refused handshake now fails in a fifth of a second (see edgeSpeech.js), so
// trying again straight away is cheap, and it is how a clip survives a service
// that turns away a share of connections at random. The attempts alternate
// between hosts, so one that has stopped answering costs one try, not all.
// Stop starting new ones once the app's own fetch is close to giving up: it
// waits nine seconds, and a clip that arrives after that is never heard.
const SYNTHESIS_MAX_ATTEMPTS = 8;
const SYNTHESIS_BUDGET_MS = 8_000;

function cacheGet(key) {
  const buf = cache.get(key);
  if (buf) {
    cache.delete(key); // refresh recency
    cache.set(key, buf);
  }
  return buf;
}
function cacheSet(key, buf) {
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cacheBytes -= existing.byteLength;
  }
  cache.set(key, buf);
  cacheBytes += buf.byteLength;
  while (
    cache.size > 1
    && (cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES)
  ) {
    const oldestKey = cache.keys().next().value;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    cacheBytes -= oldest?.byteLength ?? 0;
  }
}

function withSynthesisSlot(task) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeSyntheses += 1;
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      } finally {
        activeSyntheses -= 1;
        synthesisQueue.shift()?.();
      }
    };
    if (activeSyntheses < MAX_CONCURRENT_SYNTHESES) void run();
    else synthesisQueue.push(run);
  });
}

/**
 * Sonia can compress the unstressed syllables in an isolated "occurrence" so
 * far that the word sounds misspelled. Edge's consumer endpoint deliberately
 * rejects custom SSML, but it does support rate control. A small slowdown was
 * the clearest Sonia rendering in a local en-GB recognition check. Keep this
 * narrow so sentences, other words, other voices, and already-slower learner
 * settings retain their requested pace.
 */
export function pronunciationRateFor(text, voice, requestedRate) {
  const rate = String(requestedRate || "+0%");
  if (
    String(voice || "") !== "en-GB-SoniaNeural"
    || !/^occurrences?[.!?]?$/iu.test(String(text || "").trim())
  ) return rate;

  const match = /^([+-])(\d+)%$/u.exec(rate);
  const percentage = match
    ? Number(match[2]) * (match[1] === "-" ? -1 : 1)
    : 0;
  return percentage <= -10 ? rate : "-10%";
}

/** Index of the host that answered last, so the next clip starts there. */
let preferredHost = 0;

async function synthesizeWithRetries(text, voice, rate) {
  const started = Date.now();
  let lastError;
  for (let attempt = 0; attempt < SYNTHESIS_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0 && Date.now() - started > SYNTHESIS_BUDGET_MS) break;
    // Every attempt is a fresh connection with a freshly minted token.
    const host = (preferredHost + attempt) % SYNTHESIS_HOSTS.length;
    try {
      const buf = await synthesizeSpeech(text, voice, rate, SYNTHESIS_HOSTS[host]);
      preferredHost = host;
      return buf;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("tts synthesis failed");
}

function synthesizeOnce(key, text, voice, rate) {
  const pending = pendingSynthesis.get(key);
  if (pending) return pending;

  // Failures surface to the route as a 502 instead of wedging the pipeline.
  const promise = withSynthesisSlot(async () => {
    const buf = await synthesizeWithRetries(text, voice, rate);
    cacheSet(key, buf);
    return buf;
  });
  pendingSynthesis.set(key, promise);
  const release = () => {
    if (pendingSynthesis.get(key) === promise) pendingSynthesis.delete(key);
  };
  void promise.then(release, release);
  return promise;
}

const app = express();
// Pet spritesheets travel as base64 inside the private transfer archive. The
// pet module applies the tighter per-file and total limits; this only prevents
// Express from rejecting a valid multi-pet archive before that validation runs.
app.use(express.json({ limit: "80mb" }));

const appdataDir = path.join(process.env.APPDATA || os.homedir(), "germ");
const appdataFile = path.join(appdataDir, "shared-progress.json");
const workspaceFile = path.resolve(__dirname, "../shared-progress.json");
// The packaged server lives inside app.asar, which is immutable. Trying to
// mirror progress there failed and logged on every POST; the AppData copy is the
// intended production store. Keep the workspace mirror only for local dev.
// A check that starts this server on a scratch APPDATA sets the variable too:
// otherwise its probe keys land in the developer's real workspace copy.
const workspaceStorageEnabled = !/[\\/]app\.asar[\\/]/i.test(__dirname)
  && process.env.MICHEON_WORKSPACE_STORAGE !== "off";
let sharedStorageCache = null;

function readSharedStorage() {
  if (sharedStorageCache) return sharedStorageCache;
  let appdataData = { items: {} };
  let workspaceData = { items: {} };

  try {
    if (fs.existsSync(appdataFile)) {
      appdataData = JSON.parse(fs.readFileSync(appdataFile, "utf8"));
    }
  } catch (e) {
    console.error("Error reading AppData storage:", e);
  }

  if (workspaceStorageEnabled) {
    try {
      if (fs.existsSync(workspaceFile)) {
        workspaceData = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
      }
    } catch (e) {
      console.error("Error reading workspace storage:", e);
    }
  }

  const mergedItems = { ...(appdataData.items || {}), ...(workspaceData.items || {}) };
  const appdataTime = appdataData.updatedAt ? new Date(appdataData.updatedAt).getTime() : 0;
  const workspaceTime = workspaceData.updatedAt ? new Date(workspaceData.updatedAt).getTime() : 0;
  let mergedUpdatedAt = appdataData.updatedAt || workspaceData.updatedAt || new Date().toISOString();

  if (appdataTime > workspaceTime) {
    Object.assign(mergedItems, appdataData.items || {});
    mergedUpdatedAt = appdataData.updatedAt;
  } else if (workspaceTime > appdataTime) {
    Object.assign(mergedItems, workspaceData.items || {});
    mergedUpdatedAt = workspaceData.updatedAt;
  }

  sharedStorageCache = {
    items: mergedItems,
    updatedAt: mergedUpdatedAt
  };
  return sharedStorageCache;
}

/**
 * Saves must never block the process that owns the windows.
 *
 * In the desktop app this server runs INSIDE Electron's main process, and the
 * store it writes is the whole shared progress file — around 400KB and
 * growing with every learned word. writeFileSync of that, on every grade the
 * renderer records, stalls the process that every window, menu and (until
 * recently) mouse hook lives on; each stall is small alone and they land
 * exactly when the learner is doing something.
 *
 * So writes are asynchronous, atomic and coalesced. Atomic because a crash
 * mid-write must not tear the only copy of someone's progress: the bytes go
 * to a sibling temp file first and rename() replaces the real one in a single
 * step. Coalesced because only the LAST snapshot matters: if saves arrive
 * faster than the disk, the pending one is replaced rather than queued, so a
 * burst of grading writes once, not thirty times. The in-memory cache is
 * updated first and reads serve from it, so nothing ever waits on the disk to
 * see its own save.
 */
let pendingStorageWrite = null;
let storageWriteRunning = false;

async function flushSharedStorageWrites() {
  if (storageWriteRunning) return;
  storageWriteRunning = true;
  try {
    while (pendingStorageWrite) {
      const raw = pendingStorageWrite;
      pendingStorageWrite = null;
      try {
        await fs.promises.mkdir(appdataDir, { recursive: true });
        const tmp = `${appdataFile}.tmp`;
        await fs.promises.writeFile(tmp, raw);
        await fs.promises.rename(tmp, appdataFile);
      } catch (e) {
        console.error("Failed to write to AppData storage:", e);
      }
      if (workspaceStorageEnabled) {
        try {
          const tmp = `${workspaceFile}.tmp`;
          await fs.promises.writeFile(tmp, raw);
          await fs.promises.rename(tmp, workspaceFile);
        } catch (e) {
          console.error("Failed to write to workspace storage:", e);
        }
      }
    }
  } finally {
    storageWriteRunning = false;
  }
}

function writeSharedStorage(next) {
  sharedStorageCache = next;
  pendingStorageWrite = JSON.stringify(next);
  void flushSharedStorageWrites();
}

app.get("/api/storage", (_req, res) => {
  res.json(readSharedStorage());
});

app.post("/api/storage", (req, res) => {
  const incoming = req.body?.items;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ error: "missing items" });
  }

  const current = readSharedStorage();
  const items = { ...(current.items || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key !== "string") continue;
    if (value == null) delete items[key];
    else items[key] = String(value);
  }
  const next = { ...current, items, updatedAt: new Date().toISOString() };
  writeSharedStorage(next);
  res.json({ ok: true, count: Object.keys(items).length });
});

app.get("/api/codex-pets", (_req, res) => {
  res.set("Cache-Control", "no-store");
  // One explicit refresh scans manifests once; the spritesheet requests that
  // immediately follow reuse that result instead of repeating the same disk
  // walk for every thumbnail.
  res.json(getCodexPetCatalog({ fresh: true }));
});

app.get("/api/codex-pets/transfer", (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(exportUserManagedPetBundles());
  } catch (error) {
    res.status(400).json({ error: String(error?.message ?? error) });
  }
});

app.post("/api/codex-pets/transfer", (req, res) => {
  try {
    res.json(importUserManagedPetBundles(req.body?.pets));
  } catch (error) {
    res.status(400).json({ error: String(error?.message ?? error) });
  }
});

// Browse and install pets from codex-pets.net. Routed through the server so
// the page never makes cross-origin requests and an install is one audited
// step rather than a download the renderer unpacks itself.
app.get("/api/pet-gallery", async (req, res) => {
  try {
    const page = await fetchGalleryPage({ page: req.query.page, search: req.query.search });
    res.set("Cache-Control", "no-store");
    res.json({ ...page, installed: installedGalleryIds() });
  } catch (error) {
    res.status(502).json({ error: String(error?.message ?? error) });
  }
});

app.post("/api/pet-gallery/:id/install", async (req, res) => {
  try {
    res.json(await installGalleryPet(req.params.id));
  } catch (error) {
    res.status(400).json({ error: String(error?.message ?? error) });
  }
});

app.delete("/api/pet-gallery/:id", (req, res) => {
  try {
    res.json(removeGalleryPet(req.params.id));
  } catch (error) {
    res.status(400).json({ error: String(error?.message ?? error) });
  }
});

app.delete("/api/codex-pets/:source/:id", (req, res) => {
  try {
    res.json(removeUserManagedPet(req.params.source, req.params.id));
  } catch (error) {
    res.status(400).json({ error: String(error?.message ?? error) });
  }
});

app.get("/api/codex-pets/:source/:id/spritesheet", (req, res) => {
  const spritesheet = resolveCodexPetSpritesheet(req.params.source, req.params.id);
  if (!spritesheet) return res.status(404).json({ error: "pet not found" });

  res.set("Cache-Control", "private, max-age=3600");
  res.set("Content-Type", "image/webp");
  return res.sendFile(spritesheet, { dotfiles: "allow" });
});

const PARENTHETICAL_ANNOTATION = /\s*\([^()]*\)/gu;

function removeParentheticalAnnotations(value) {
  let result = value;
  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result.replace(PARENTHETICAL_ANNOTATION, "");
  }
  return result.replace(/\s{2,}/gu, " ").trim();
}

// "wind" the verb, told apart from "wind" the weather: one spelling, two
// words, and the synthesiser read "things that wind me up" as the breeze.
// Edge rejects custom SSML, so the spelling sent to it is the only lever, and
// wynd is an ordinary word with the sound wanted. Matched by construction —
// object plus particle, "wind your neck in", or the hyphenated wind-up — so
// "wind force eight" and "the wind whistles up top" are left alone. Mirrors
// src/lib/spokenText.ts; check-spoken-text holds the two together.
const WIND_VERB = new RegExp(
  String.raw`\bwind(s|ing)?\b(?=`
  + String.raw`(?:\s+(?:me|him|her|it|us|them|you|myself|yourself|himself|herself|ourselves|themselves|someone|somebody|people))?`
  + String.raw`(?:\s+(?:right|back|really|properly|slowly|down|up))*`
  + String.raw`\s+(?:up|down)\b`
  + String.raw`|\s+your\s+neck\s+in\b`
  + String.raw`|-up\b)`,
  "giu"
);

// The adjective carries an old two-syllable reading — the cursèd earth —
// and the voice reaches for it, which turned the gloss on verflucht into
// curs-id. Modern English says adjective and verb alike as one syllable.
// Word-bounded, so accursed keeps its own three.
const CURSED_ADJECTIVE = /\bcursed\b/giu;

function applyPronunciationOverrides(value) {
  // Keep display spelling intact while steering German neural voices around
  // the doubled "st" seam that they can over-articulate in selbstständig.
  return value
    .replace(/selbstständig/giu, (match) =>
      match.startsWith("S") ? "Selbständig" : "selbständig"
    )
    .replace(WIND_VERB, (match) =>
      (match.startsWith("W") ? "Wynd" : "wynd") + match.slice(4)
    )
    .replace(CURSED_ADJECTIVE, (match) =>
      match.startsWith("C") ? "Curst" : "curst"
    );
}

export function firstSpokenAlternative(value) {
  const text = String(value || "").trim();
  const separatorIndex = text.search(/\s+\/\s+/u);
  const firstAlternative = separatorIndex === -1
    ? text
    : text.slice(0, separatorIndex).trim();

  return applyPronunciationOverrides(removeParentheticalAnnotations(firstAlternative)
    .replace(/\band\/or\b/giu, "and or")
    .replace(/\bund\/oder\b/giu, "und oder")
    .replace(/(\p{L}+)\/\p{L}+/gu, "$1")
    .trim());
}

app.get("/api/tts", async (req, res) => {
  const text = firstSpokenAlternative(String(req.query.text || "").slice(0, 600));
  if (!text) return res.status(400).json({ error: "missing text" });

  const lang = String(req.query.lang || "de-DE");
  // A requested voice has to be one we know: it goes straight into an upstream
  // request, and an unknown name would only fail there anyway.
  const asked = String(req.query.voice || "");
  const voice = ALLOWED_VOICES.has(asked) ? asked : voiceForLang(lang);
  const rate = ratePercent(req.query.rate);
  const synthesisRate = pronunciationRateFor(text, voice, rate);
  const pronunciationOverride = synthesisRate === rate ? "default" : "occurrence-clarity";

  const key = `${voice}|${synthesisRate}|${text}`;
  const cached = cacheGet(key);
  if (cached) {
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "private, no-store");
    res.set("X-TTS-Cache", "hit");
    res.set("X-TTS-Pronunciation", pronunciationOverride);
    return res.send(cached);
  }

  try {
    const buf = await synthesizeOnce(key, text, voice, synthesisRate);
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "private, no-store");
    res.set("X-TTS-Cache", "miss");
    res.set("X-TTS-Pronunciation", pronunciationOverride);
    return res.send(buf);
  } catch (err) {
    // The client retries once on a 502 and then passes over the clip.
    console.error("[tts] synth failed:", err?.message || err);
    return res.status(502).json({ error: "tts upstream failed" });
  }
});

/** The voices the picker offers, and which one each language uses by default. */
app.get("/api/tts/voices", (_req, res) => {
  res.json({
    choices: VOICE_CHOICES,
    defaults: Object.fromEntries(Object.keys(VOICE_CHOICES).map((lang) => [lang, voiceForLang(lang)])),
  });
});

// Whether the app's Listen mode is speaking right now. The desktop shell
// keeps this current; the browser extension reads it so its own hover
// pronunciation never talks over a hands-free listening session.
let listenPlaying = false;
export function setListenPlaying(value) {
  listenPlaying = value === true;
}
app.get("/api/listen-state", (_req, res) => res.json({ playing: listenPlaying }));

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  cached: cache.size,
  cachedBytes: cacheBytes,
  queuedSyntheses: synthesisQueue.length,
  synthesizing: activeSyntheses,
}));

// In production, serve the built front-end and let the SPA handle routing.
const dist = path.resolve(__dirname, "../dist");
app.use(express.static(dist));
// Catch-all (Express 5 dropped string "*" routes) — send index.html for any
// non-API GET so client-side routing works on refresh/deep links.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist, "index.html"));
});

// Start listening. Returns a promise that resolves once the server is up, so
// callers (e.g. the Electron main process) can wait before loading the window.
export function startServer(port = process.env.PORT || 3001, host = "127.0.0.1") {
  const resolvedPort = Number(port);
  if (!Number.isInteger(resolvedPort) || resolvedPort < 0 || resolvedPort > 65_535) {
    return Promise.reject(new RangeError(`Invalid server port: ${port}`));
  }

  return new Promise((resolve, reject) => {
    const srv = app.listen(resolvedPort, host);
    const onError = (error) => reject(error);

    srv.once("error", onError);
    srv.once("listening", () => {
      srv.off("error", onError);
      const address = srv.address();
      const listeningPort = typeof address === "object" && address ? address.port : resolvedPort;
      console.log(`germ TTS server listening on http://${host}:${listeningPort}`);
      resolve(srv);
    });
  });
}

// Auto-start when run directly (node server/index.js), but not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
