// One synthesis request to Microsoft's Read Aloud service.
//
// This replaces the edge-tts-universal client, for two reasons found together.
//
// From October 2026 the legacy host (speech.platform.bing.com) refuses a large
// share of handshakes with a 403 — measured from the UK at between four and
// eight in ten, at random, whatever client version is claimed. Edge itself now
// synthesises through api.msedgeservices.com, which accepts the same token as a
// subscription key and opened twenty handshakes out of twenty in the same test.
//
// And the library could not report a refusal. It waited for the socket's
// "open" event with no error path, so a refused handshake left its promise
// pending until the server's twenty-second deadline gave up on it. With half
// the handshakes refused, half the clips arrived twenty seconds late or not at
// all — heard as a voice that lags behind the page.
//
// Here every way a connection can end settles the request at once: a refusal,
// a socket error, a close before the end of the turn, or silence from the
// service for too long. The caller decides whether to try again.

import { createHash, randomBytes, randomUUID } from "crypto";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

/** Where to ask, in order of preference. The legacy host still answers some. */
export const SYNTHESIS_HOSTS = [
  `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}`,
  `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`,
];

const WSS_HEADERS = {
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
};

// A handshake normally completes in 100-300ms and a refusal in under 200ms;
// four seconds of neither is a dead connection, not a slow one.
const HANDSHAKE_TIMEOUT_MS = 4_000;
// Audio arrives in a stream of small frames, so the right deadline is the gap
// between them rather than the whole clip: a long sentence is still allowed to
// take as long as it takes, a stalled stream is not.
const SILENCE_TIMEOUT_MS = 5_000;

/**
 * Seconds to add to the local clock, learned from the service's own Date
 * header when it refuses us. The token is a hash of the time in five-minute
 * steps, so a machine whose clock is a few minutes out is refused every time
 * until this is corrected.
 */
let clockSkewSeconds = 0;

function secMsGec() {
  let ticks = Date.now() / 1000 + clockSkewSeconds + 11_644_473_600;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100;
  return createHash("sha256")
    .update(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`, "ascii")
    .digest("hex")
    .toUpperCase();
}

function learnClockSkew(dateHeader) {
  const serverSeconds = Date.parse(String(dateHeader || "")) / 1000;
  if (!Number.isFinite(serverSeconds)) return;
  const skew = serverSeconds - Date.now() / 1000;
  // The header has whole-second precision; only a real offset is worth acting on.
  if (Math.abs(skew) > 60) clockSkewSeconds = skew;
}

/** "de-DE-KatjaNeural" -> the long name the service expects in SSML. */
export function serviceVoiceName(voice) {
  const match = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/u.exec(String(voice || ""));
  if (!match) return String(voice || "");
  let [, lang, region, name] = match;
  if (name.includes("-")) {
    const [extraRegion, shortName] = name.split("-");
    region += `-${extraRegion}`;
    name = shortName;
  }
  return `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
}

/** Control characters other than tab and newlines are not allowed in XML. */
function isXmlForbidden(char) {
  const code = char.charCodeAt(0);
  return code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
}

function escapeXml(text) {
  return Array.from(String(text), (char) => (isXmlForbidden(char) ? " " : char)).join("")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function timestamp() {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

/** A frame's text headers, from the part before the blank line. */
function frameHeaders(text) {
  const headers = {};
  for (const line of text.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) headers[line.slice(0, colon)] = line.slice(colon + 1).trim();
  }
  return headers;
}

/** Thrown for a handshake the service answered with an HTTP status instead. */
export class SynthesisRefused extends Error {
  constructor(status) {
    super(`tts handshake refused: ${status}`);
    this.status = status;
  }
}

/**
 * Synthesise one clip as MP3, through the given host.
 *
 * Resolves with the audio once the service ends its turn; rejects as soon as
 * the attempt has failed in any way. Never retries — see synthesizeOnce in
 * index.js for that.
 */
export function synthesizeSpeech(text, voice, rate, host = SYNTHESIS_HOSTS[0]) {
  return new Promise((resolve, reject) => {
    const url = `${host}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
      + `&ConnectionId=${randomUUID().replace(/-/gu, "")}`;
    const socket = new WebSocket(url, {
      headers: { ...WSS_HEADERS, Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};` },
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
    });
    const chunks = [];
    let settled = false;
    let silenceTimer;

    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(silenceTimer);
      try {
        if (error) socket.terminate();
        else socket.close();
      } catch { /* already closed */ }
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    const armSilence = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => settle(new Error("tts stream went silent")), SILENCE_TIMEOUT_MS);
    };

    socket.on("unexpected-response", (_request, response) => {
      learnClockSkew(response.headers.date);
      response.resume();
      settle(new SynthesisRefused(response.statusCode));
    });
    socket.on("error", (error) => settle(error));
    socket.on("close", () => settle(new Error("tts connection closed before the end of the clip")));

    socket.on("open", () => {
      armSilence();
      socket.send(
        `X-Timestamp:${timestamp()}\r\n`
        + "Content-Type:application/json; charset=utf-8\r\n"
        + "Path:speech.config\r\n\r\n"
        + '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false",'
        + '"wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
      );
      const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"
        + `<voice name='${serviceVoiceName(voice)}'>`
        + `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody>`
        + "</voice></speak>";
      socket.send(
        `X-RequestId:${randomUUID().replace(/-/gu, "")}\r\n`
        + "Content-Type:application/ssml+xml\r\n"
        + `X-Timestamp:${timestamp()}Z\r\n`
        + `Path:ssml\r\n\r\n${ssml}`
      );
    });

    socket.on("message", (data, isBinary) => {
      armSilence();
      const message = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (!isBinary) {
        const end = message.indexOf("\r\n\r\n");
        const headers = frameHeaders(message.subarray(0, end < 0 ? message.length : end).toString("utf8"));
        if (headers.Path === "turn.end") {
          if (chunks.length) settle();
          else settle(new Error("tts returned no audio"));
        }
        return;
      }
      // A binary frame: two bytes of header length, the headers, then audio.
      if (message.length < 2) return;
      const headerLength = message.readUInt16BE(0);
      if (headerLength + 2 > message.length) return;
      const headers = frameHeaders(message.subarray(2, headerLength + 2).toString("utf8"));
      const audio = message.subarray(headerLength + 2);
      if (headers.Path === "audio" && headers["Content-Type"] === "audio/mpeg" && audio.length) {
        chunks.push(audio);
      }
    });
  });
}
