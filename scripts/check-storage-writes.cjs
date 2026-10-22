#!/usr/bin/env node
/**
 * Saving progress never blocks the process that owns the windows.
 *
 * The desktop app runs the Express server inside Electron's main process, and
 * the store is the whole shared progress file — hundreds of kilobytes,
 * rewritten on every grade. A synchronous write there stalls the process
 * every window lives on, at exactly the moments the learner is doing
 * something; with an overlay on screen those stalls read as the app "causing
 * lag". So the save path must answer from memory, write asynchronously, and
 * replace the file atomically so a crash mid-write cannot tear the only copy
 * of someone's progress.
 *
 * Checked behaviourally against a real server on a scratch APPDATA, then
 * pinned in source, because the behaviour half alone cannot see atomicity —
 * a torn write only shows up as a corrupted file on the one day it matters.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server/index.js"), "utf8").replace(/\r\n?/gu, "\n");

// ── source pins ────────────────────────────────────────────────────────────
const code = source
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/^\s*\/\/.*$/gmu, "");
assert.ok(
  !code.includes("writeFileSync"),
  "server/index.js writes with writeFileSync again — every save stalls the Electron main process"
);
assert.ok(
  /await fs\.promises\.writeFile\(tmp, raw\);\s*await fs\.promises\.rename\(tmp,/u.test(code),
  "storage writes are no longer atomic: bytes must land in a temp file that rename() swaps in whole"
);
assert.ok(
  code.includes("pendingStorageWrite = JSON.stringify(next);")
    && code.includes("pendingStorageWrite = null;"),
  "storage writes are no longer coalesced: a burst of grades should write the last snapshot once, not every snapshot"
);
assert.ok(
  /sharedStorageCache = next;\s*pendingStorageWrite/u.test(code),
  "the cache must be updated before the disk is asked anything, so a read after a save sees that save"
);

// ── behaviour, against a real server on a scratch store ────────────────────
async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "micheon-storage-check-"));
  process.env.APPDATA = scratch;
  // And nothing in the workspace: the dev mirror there is somebody's real data.
  process.env.MICHEON_WORKSPACE_STORAGE = "off";

  const { startServer } = await import(pathToFileURL(path.join(root, "server/index.js")).href);
  const server = await startServer(0);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/storage`;

  try {
    // A payload big enough that a synchronous write would be measurable, and
    // recognisable enough to find in the file afterwards.
    const items = {};
    for (let i = 0; i < 2000; i += 1) items[`probe-${i}`] = "x".repeat(150);
    items["probe-marker"] = "storage-write-check";

    const saved = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    assert.strictEqual(saved.status, 200, "the save should be accepted");

    // The very next read serves the save from memory, before any disk I/O
    // has necessarily finished.
    const readBack = await (await fetch(url)).json();
    assert.strictEqual(readBack.items["probe-marker"], "storage-write-check",
      "a read straight after a save must already see it");

    // The bytes reach disk shortly after, whole and parseable.
    const file = path.join(scratch, "germ", "shared-progress.json");
    let onDisk = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
        if (onDisk?.items?.["probe-marker"] === "storage-write-check") break;
      } catch { /* not written yet */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(onDisk?.items?.["probe-marker"] === "storage-write-check",
      "the save never reached the AppData file");
    assert.ok(!fs.existsSync(`${file}.tmp`),
      "the temp file should be renamed away, not left beside the store");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  console.log("check-storage-writes: saves answer from memory, land atomically, and never block the main process");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
