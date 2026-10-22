#!/usr/bin/env node
/**
 * The desktop app, its local server and its release pipeline only do what
 * they are meant to, for whom they are meant to.
 *
 * Found together in one audit:
 *  - No window had a navigation guard and nothing answered permission
 *    requests, so a link dragged onto the frameless window took it to another
 *    site, which then held the preload bridge (update settings, launch at
 *    login, the extension installer) and got the camera and microphone without
 *    a prompt, because Electron grants everything by default.
 *  - The local server answered any Host and any Origin. A page using DNS
 *    rebinding could read or wipe the progress store; any page could post a
 *    form at a write route. And every request body was parsed with an 80 MB
 *    limit, inside the process that owns the windows.
 *  - The release build held a token that could write releases while it ran
 *    npm ci and a few hundred scripts, and the updater trusts whatever
 *    latest.yml the release carries.
 *  - The dev server's own storage route took a text/plain post from anywhere.
 *  - An override pinned shell-quote to the version with the advisory.
 *  - The extension asked for every site's data when it fetches one address,
 *    and kept sentences from mail and banking pages in an exportable list.
 *
 * The server half runs against a real server on a scratch store.
 */
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n?/gu, "\n");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

let failed = 0;
const check = (name, ok, detail) => {
  if (ok) { console.log(`ok   ${name}`); return; }
  failed += 1;
  console.error(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
};

// ── the Electron shell ─────────────────────────────────────────────────────
const main = code("electron/main.js");
check("every web contents refuses navigation away from the app",
  /app\.on\("web-contents-created"[\s\S]*?"will-navigate"[\s\S]*?if \(isAppUrl\(url\)\) return;\s*event\.preventDefault\(\);/u.test(main)
    && /"will-redirect"/u.test(main) && /"will-attach-webview", \(event\) => event\.preventDefault\(\)/u.test(main));
check("only the app's own origins count as the app",
  /const APP_ORIGINS = new Set\(\[`http:\/\/localhost:\$\{PORT\}`, `http:\/\/127\.0\.0\.1:\$\{PORT\}`\]\)/u.test(main));
check("permissions are granted only for the clipboard and fullscreen, only to the app",
  /const GRANTED_PERMISSIONS = new Set\(\["clipboard-sanitized-write", "fullscreen"\]\)/u.test(main)
    && /setPermissionRequestHandler\([\s\S]*?callback\(GRANTED_PERMISSIONS\.has\(permission\) && isAppUrl\(asking\)\)/u.test(main)
    && /installPermissionPolicy\(\);\s*if \(!\(await openMainWindowOrExplain\(\)\)\) return;/u.test(main));
check("no window is ever opened by the page",
  !/action: "allow"/u.test(main) && /setWindowOpenHandler\(\(\{ url \}\) => \{\s*openInBrowser\(url\);\s*return \{ action: "deny" \};/u.test(main));
check("a main window that cannot open explains itself and still starts the updater",
  /async function openMainWindowOrExplain\(\)[\s\S]*?catch \(error\)[\s\S]*?setupAutoUpdate\(\);[\s\S]*?dialog\.showMessageBox/u.test(main)
    && /if \(autoUpdateStarted\) return;\s*autoUpdateStarted = true;/u.test(main));
check("the updater does not ask for block maps the release never uploads",
  main.includes("autoUpdater.disableDifferentialDownload = true;")
    && read(".github/workflows/release.yml").includes(".blockmap files are deliberately NOT uploaded"));

// ── the release pipeline ───────────────────────────────────────────────────
const release = read(".github/workflows/release.yml");
const job = (name) => {
  const start = release.indexOf(`\n  ${name}:\n`);
  const next = release.slice(start + 1).search(/\n {2}[a-z-]+:\n/u);
  return start < 0 ? "" : release.slice(start, next < 0 ? undefined : start + 1 + next);
};
check("the workflow is read-only unless a job says otherwise", /^permissions:\n {2}contents: read$/mu.test(release));
check("the build job cannot write releases and keeps no token",
  /permissions:\n\s+contents: read/u.test(job("build")) && job("build").includes("persist-credentials: false")
    && !job("build").includes("gh release"));
check("only the publish job attaches and publishes, from the build's artifact",
  /needs: \[prepare-release, build\]/u.test(job("publish")) && /contents: write/u.test(job("publish"))
    && job("publish").includes("actions/download-artifact@v4") && job("publish").includes("gh release upload")
    && job("publish").includes("--draft=false"));
check("the packaged app is checked for its runtime modules before it ships",
  job("build").includes('node scripts/check-packaged-deps.cjs "release/win-unpacked/resources/app.asar"'));
check("a failed publish is reported, and only a published release closes the report",
  release.includes("needs.publish.result == 'failure'") && release.includes("if: needs.publish.result == 'success'"));

// ── dependencies ───────────────────────────────────────────────────────────
const pkg = JSON.parse(read("package.json"));
const [major, minor] = String(pkg.overrides?.["shell-quote"] ?? "").split(".").map(Number);
check("shell-quote is not pinned to a version with the advisory", !pkg.overrides?.["shell-quote"] || major > 1 || minor >= 11,
  `overrides pin shell-quote ${pkg.overrides?.["shell-quote"]}`);
check("the dead adm-zip override is gone", !("adm-zip" in (pkg.overrides ?? {})));
check("peerjs is bundled by Vite, not shipped as a runtime module", !("peerjs" in (pkg.dependencies ?? {})) && "peerjs" in (pkg.devDependencies ?? {}));

// ── the dev server ─────────────────────────────────────────────────────────
const vite = code("vite.config.js");
check("the dev storage route refuses foreign hosts and non-JSON or cross-site writes",
  /if \(!loopback\.has\(hostOf\(req\.headers\.host\)\) \|\| \(req\.method !== "GET" && \(!originOk \|\| !jsonBody\)\)\)/u.test(vite));

// ── the extension ──────────────────────────────────────────────────────────
const manifest = JSON.parse(read("public/micheon-immersion-extension/manifest.json"));
check("the extension asks only for the app's own address",
  JSON.stringify(manifest.host_permissions) === JSON.stringify(["http://127.0.0.1:41730/*"])
    && manifest.permissions.includes("activeTab"));
const gloss = read("public/micheon-immersion-extension/src/content-gloss.js");
check("sentences from mail, chat and banking pages are never kept",
  gloss.includes("if (sentence && !IS_PRIVATE_PAGE) seen.add(sentence);") && /IS_PRIVATE_PAGE = [^;]*mail\\\.google\\\.com/u.test(gloss));

// ── the server, for real ───────────────────────────────────────────────────
function request(port, { method = "GET", pathName = "/api/health", host, origin, contentType, body }) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host ?? `127.0.0.1:${port}` };
    if (origin) headers.Origin = origin;
    if (contentType) headers["Content-Type"] = contentType;
    if (body != null) headers["Content-Length"] = Buffer.byteLength(body);
    const req = http.request({ host: "127.0.0.1", port, method, path: pathName, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

(async () => {
  process.env.APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), "micheon-security-check-"));
  process.env.MICHEON_WORKSPACE_STORAGE = "off";
  const { startServer, isTrustedRequest } = await import(pathToFileURL(path.join(root, "server/index.js")).href);

  check("the rule: loopback names only, local or extension origins for writes", [
    [{ method: "GET", host: "localhost:41730" }, true],
    [{ method: "GET", host: "127.0.0.1:41730" }, true],
    [{ method: "GET", host: "[::1]:41730" }, true],
    [{ method: "GET", host: "localhost:5173" }, true], // the dev proxy keeps its own Host
    [{ method: "GET", host: "rebind.attacker.example:41730" }, false],
    [{ method: "POST", host: "localhost:41730", origin: "http://localhost:41730" }, true],
    [{ method: "POST", host: "localhost:41730" }, true],
    [{ method: "POST", host: "127.0.0.1:41730", origin: "chrome-extension://abcdefghijklmnop" }, true],
    [{ method: "POST", host: "localhost:41730", origin: "https://attacker.example" }, false],
    [{ method: "POST", host: "localhost:41730", origin: "null" }, false],
    [{ method: "DELETE", host: "localhost:41730", origin: "https://attacker.example" }, false],
  ].every(([input, expected]) => isTrustedRequest(input) === expected));

  const server = await startServer(0);
  const port = server.address().port;
  try {
    check("a rebinding Host is refused", await request(port, { host: `rebind.attacker.example:${port}` }) === 403);
    check("the app's own read is served", await request(port, {}) === 200);
    const items = JSON.stringify({ items: { "gl-security-probe": "1" } });
    check("a cross-site write to the progress store is refused",
      await request(port, { method: "POST", pathName: "/api/storage", origin: "https://attacker.example", contentType: "application/json", body: items }) === 403);
    check("the app's own write to the progress store is accepted",
      await request(port, { method: "POST", pathName: "/api/storage", origin: `http://localhost:${port}`, contentType: "application/json", body: items }) === 200);
    check("a cross-site form post cannot install a pet",
      await request(port, { method: "POST", pathName: "/api/pet-gallery/anything/install", origin: "https://attacker.example", contentType: "application/x-www-form-urlencoded", body: "" }) === 403);
    const twoMegabytes = JSON.stringify({ pad: "x".repeat(2 * 1024 * 1024) });
    check("an ordinary route will not parse a body of megabytes",
      await request(port, { method: "POST", pathName: "/api/pet-gallery/anything/install", origin: `http://localhost:${port}`, contentType: "application/json", body: twoMegabytes }) === 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  if (failed) {
    console.error(`\n${failed} desktop security check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDesktop security checks passed.");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
