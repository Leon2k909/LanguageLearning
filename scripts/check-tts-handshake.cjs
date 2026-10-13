#!/usr/bin/env node
/**
 * Every way a synthesis connection can end has to end the request.
 *
 * The speech library this replaced waited for the socket to open with no
 * error path. When the service began refusing a share of handshakes with a
 * 403, each refusal left its request pending until a twenty-second deadline,
 * and the learner heard the voice arrive that late or not at all. The server
 * retries quickly now, which only works if a failed attempt says so at once.
 *
 * Runs offline against a local stand-in for the service: one that refuses,
 * one that accepts and hangs up mid-turn, and one that streams a clip the way
 * the real service does.
 */
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { WebSocketServer } = require("ws");

let failed = 0;
const check = (name, ok, detail) => {
  if (ok) { console.log(`ok   ${name}`); return; }
  failed += 1;
  console.error(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

/** Settles with what happened and how long it took, never waiting past a cap. */
async function outcome(promise, capMs = 3_000) {
  const started = Date.now();
  let timer;
  const result = await Promise.race([
    promise.then((value) => ({ value }), (error) => ({ error })),
    new Promise((resolve) => { timer = setTimeout(() => resolve({ hung: true }), capMs); }),
  ]);
  clearTimeout(timer);
  return { ...result, ms: Date.now() - started };
}

function binaryAudioFrame(bytes) {
  const headers = Buffer.from("X-RequestId:test\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n", "utf8");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(headers.length, 0);
  return Buffer.concat([length, headers, bytes]);
}

async function main() {
  const { synthesizeSpeech, SynthesisRefused, serviceVoiceName } = await import(
    pathToFileURL(path.resolve(__dirname, "../server/edgeSpeech.js")).href
  );

  // ── a refused handshake ────────────────────────────────────────────────
  const refusing = http.createServer();
  refusing.on("upgrade", (_req, socket) => {
    socket.end("HTTP/1.1 403 Forbidden\r\nDate: Tue, 13 Oct 2026 02:02:39 GMT\r\nContent-Length: 0\r\n\r\n");
  });
  const refusingPort = await listen(refusing);
  const refused = await outcome(synthesizeSpeech("Hallo", "de-DE-KatjaNeural", "+0%", `ws://127.0.0.1:${refusingPort}/v1?k=1`));
  check("a refused handshake rejects instead of hanging", !refused.hung && refused.error, JSON.stringify(refused));
  check("the refusal is reported as one, with its status",
    refused.error instanceof SynthesisRefused && refused.error.status === 403, String(refused.error));
  check("and it is reported within a second", refused.ms < 1_000, `${refused.ms}ms`);
  refusing.close();

  // ── accepted, then dropped before the end of the turn ─────────────────
  const dropping = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => dropping.on("listening", resolve));
  dropping.on("connection", (socket) => {
    socket.once("message", () => socket.terminate());
  });
  const dropped = await outcome(synthesizeSpeech("Hallo", "de-DE-KatjaNeural", "+0%", `ws://127.0.0.1:${dropping.address().port}/v1?k=1`));
  check("a connection dropped mid-turn rejects instead of hanging", !dropped.hung && dropped.error, JSON.stringify(dropped));
  dropping.close();

  // ── a clip streamed the way the service does it ───────────────────────
  const serving = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => serving.on("listening", resolve));
  const received = [];
  serving.on("connection", (socket, request) => {
    received.push({ url: request.url, messages: [] });
    socket.on("message", (data) => {
      received[received.length - 1].messages.push(data.toString("utf8"));
      if (!String(data).includes("Path:ssml")) return;
      socket.send("X-RequestId:test\r\nContent-Type:application/json\r\nPath:turn.start\r\n\r\n{}");
      socket.send(binaryAudioFrame(Buffer.from([0xff, 0xf3, 0x64, 0xc4])), { binary: true });
      socket.send(binaryAudioFrame(Buffer.from([1, 2, 3, 4])), { binary: true });
      socket.send("X-RequestId:test\r\nPath:turn.end\r\n\r\n");
    });
  });
  const served = await outcome(synthesizeSpeech(
    "Tom & Jerry's\u0007<café>", "de-DE-KatjaNeural", "-12%", `ws://127.0.0.1:${serving.address().port}/v1?k=1`
  ));
  check("a streamed clip resolves with every audio frame, in order",
    served.value && Buffer.compare(served.value, Buffer.from([0xff, 0xf3, 0x64, 0xc4, 1, 2, 3, 4])) === 0,
    JSON.stringify(served));
  const sent = received[0]?.messages.join("\n") ?? "";
  check("the request carries a fresh token and connection id",
    /Sec-MS-GEC=[0-9A-F]{64}&/u.test(received[0]?.url ?? "") && /ConnectionId=[0-9a-f]{32}$/u.test(received[0]?.url ?? ""),
    received[0]?.url);
  check("the text is escaped for SSML, control characters and all", sent.includes("Tom &amp; Jerry&apos;s &lt;café&gt;"), sent);
  check("the voice is named the way the service expects",
    sent.includes("Microsoft Server Speech Text to Speech Voice (de-DE, KatjaNeural)")
      && serviceVoiceName("en-AU-WilliamMultilingualNeural") === "Microsoft Server Speech Text to Speech Voice (en-AU, WilliamMultilingualNeural)",
    sent);
  check("the rate is passed through", sent.includes("rate='-12%'"), sent);
  serving.close();

  if (failed) {
    console.error(`\n${failed} TTS handshake check(s) failed.`);
    process.exit(1);
  }
  console.log("\nTTS handshake checks passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
