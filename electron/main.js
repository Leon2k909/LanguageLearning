// Electron desktop wrapper for germ.
//
// It reuses the exact same web app: the bundled Express server (server/index.js)
// serves the built front-end AND the /api/tts endpoint, and this main process
// just starts that server and points a window at it. So the desktop build behaves
// identically to the website — including the premium Microsoft TTS voices, which
// work here because the server runs locally inside the app.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  screen,
  session,
  Tray,
} from "electron";
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import electronUpdater from "electron-updater";
import { setListenPlaying, startServer } from "../server/index.js";
import petHistoryGeometry from "./pet-history-geometry.cjs";
import desktopSettingsStore from "./desktop-settings.cjs";
import zoomSteps from "./zoom-steps.cjs";

const { autoUpdater } = electronUpdater;
const { clampHistoryBounds, placePetHistoryBounds } = petHistoryGeometry;
const { readDesktopSettings, writeDesktopSettings } = desktopSettingsStore;
const { clampZoomFactor, nextZoomStep } = zoomSteps;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local port for the embedded server. Deliberately uncommon so it won't collide
// with the dev server (3001) or other tooling on the user's machine.
const PORT = process.env.GERM_PORT || 41730;

/**
 * Only the app's own pages may run inside its windows.
 *
 * Every window here carries the preload bridge, which can change update
 * settings, launch at login, install the browser extension and more — and
 * the bridge cannot tell who is calling. Nothing stopped a window from being
 * navigated away: a link dragged onto the window, or a stray in-page link,
 * took the frameless window to someone else's page, which then held the
 * bridge with no way back. Electron also grants every permission it is asked
 * for by default, so that page got the camera and microphone without a prompt.
 *
 * So navigation outside the app is refused (an http link opens in the
 * browser instead), and the only permissions granted are the two the app
 * uses, to the app's own pages: writing to the clipboard and going fullscreen.
 */
const APP_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
const GRANTED_PERMISSIONS = new Set(["clipboard-sanitized-write", "fullscreen"]);

function isAppUrl(url) {
  try {
    return APP_ORIGINS.has(new URL(String(url)).origin);
  } catch {
    return false;
  }
}

/** Hand a web link to the learner's browser; anything that is not one goes nowhere. */
function openInBrowser(url) {
  try {
    const { protocol } = new URL(String(url));
    if (protocol === "https:" || protocol === "http:") void shell.openExternal(String(url));
  } catch { /* not a URL at all */ }
}

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, legacyUrl) => {
    const url = event?.url ?? legacyUrl;
    if (isAppUrl(url)) return;
    event.preventDefault();
    openInBrowser(url);
  });
  contents.on("will-redirect", (event, legacyUrl) => {
    if (!isAppUrl(event?.url ?? legacyUrl)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

function installPermissionPolicy() {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const asking = details?.requestingUrl || contents?.getURL?.() || "";
    callback(GRANTED_PERMISSIONS.has(permission) && isAppUrl(asking));
  });
}

let mainWindow = null;
let petWindow = null;
const petSurfaceTopLevels = new WeakMap();
let petHistoryWindow = null;
let petHistoryBounds = null;
let petHistoryAnchorBounds = null;
let petHistoryAttached = false;
let petHistoryProgrammaticMove = false;
let petHistoryProgrammaticMoveRevision = 0;
let petHistoryDestroyTimer = null;
let petHistoryShouldBeVisible = false;
let petOverlayUsesShape = false;
let petOverlayDragging = false;
let petOverlayDragDesktopBounds = null;
let petOverlayDragTimer = null;
let petOverlayDragWatchdog = null;
let petOverlayHitRegions = [];
/** Geometry of the shape currently applied, so identical updates are skipped. */
let petOverlayShapeSignature = null;
let petOverlayGeometrySignature = null;
let petOverlayGeometryRevision = 0;
let petOverlayPendingGeometryRevision = 0;
let petOverlayGeometryTransitionTimer = null;
let petDisplayMode = "desktop";
let serverStarted = false;
let desktopSettings = null;
let tray = null;
let appIsQuitting = false;
let listenMediaState = {
  available: false,
  playing: false,
  title: "",
  subtitle: "",
};

const LISTEN_MEDIA_SHORTCUTS = new Map([
  ["MediaPreviousTrack", "previous"],
  ["MediaPlayPause", "toggle"],
  ["MediaNextTrack", "next"],
]);
let listenThumbarIcons = null;

/**
 * Windows thumbnail buttons require NativeImage glyphs rather than text.
 * These tiny alpha-mask bitmaps stay crisp at the native 16px size and avoid
 * shipping a second icon family just for three operating-system controls.
 */
function createListenMediaGlyph(kind) {
  const size = 16;
  const bitmap = Buffer.alloc(size * size * 4);
  const pixel = (x, y, alpha = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = ((y * size) + x) * 4;
    bitmap[offset] = 255;
    bitmap[offset + 1] = 255;
    bitmap[offset + 2] = 255;
    bitmap[offset + 3] = alpha;
  };
  const rect = (left, top, right, bottom) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) pixel(x, y);
    }
  };
  const triangle = (direction, left, top, width, height) => {
    for (let row = 0; row < height; row += 1) {
      const half = Math.floor((row < height / 2 ? row : height - row - 1) * width / height) + 1;
      if (direction === "right") {
        for (let x = 0; x <= half; x += 1) pixel(left + x, top + row);
      } else {
        for (let x = 0; x <= half; x += 1) pixel(left + width - 1 - x, top + row);
      }
    }
  };

  if (kind === "pause") {
    rect(4, 3, 6, 12);
    rect(9, 3, 11, 12);
  } else if (kind === "play") {
    triangle("right", 5, 3, 8, 10);
  } else if (kind === "previous") {
    rect(3, 4, 4, 11);
    triangle("left", 5, 4, 8, 8);
  } else {
    triangle("right", 3, 4, 8, 8);
    rect(11, 4, 12, 11);
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 });
}

function getListenThumbarIcons() {
  if (!listenThumbarIcons) {
    listenThumbarIcons = {
      next: createListenMediaGlyph("next"),
      pause: createListenMediaGlyph("pause"),
      play: createListenMediaGlyph("play"),
      previous: createListenMediaGlyph("previous"),
    };
  }
  return listenThumbarIcons;
}

function sendListenMediaCommand(command) {
  if (!listenMediaState.available || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("listen-media:command", command);
}

function syncListenMediaShortcuts() {
  for (const [accelerator, command] of LISTEN_MEDIA_SHORTCUTS) {
    if (!listenMediaState.available) {
      if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator);
      continue;
    }
    if (globalShortcut.isRegistered(accelerator)) continue;
    try {
      globalShortcut.register(accelerator, () => sendListenMediaCommand(command));
    } catch { /* another media app may already own this key */ }
  }
}

function syncListenMediaControls() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // Keep the next-card timer and audio sequence punctual while minimized, but
  // hand Chromium its normal idle savings back as soon as Listen is paused.
  mainWindow.webContents.setBackgroundThrottling(!listenMediaState.playing);
  syncListenMediaShortcuts();
  if (process.platform !== "win32") return;
  if (!listenMediaState.available) {
    mainWindow.setThumbarButtons([]);
    return;
  }
  const icons = getListenThumbarIcons();
  mainWindow.setThumbarButtons([
    {
      click: () => sendListenMediaCommand("previous"),
      icon: icons.previous,
      tooltip: "Previous phrase",
    },
    {
      click: () => sendListenMediaCommand("toggle"),
      icon: listenMediaState.playing ? icons.pause : icons.play,
      tooltip: listenMediaState.playing ? "Pause Listen" : "Play Listen",
    },
    {
      click: () => sendListenMediaCommand("next"),
      icon: icons.next,
      tooltip: "Next phrase",
    },
  ]);
}

function clearListenMediaControls() {
  listenMediaState = { available: false, playing: false, title: "", subtitle: "" };
  for (const accelerator of LISTEN_MEDIA_SHORTCUTS.keys()) {
    if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setBackgroundThrottling(true);
    if (process.platform === "win32") mainWindow.setThumbarButtons([]);
  }
}

// Keep the transparent compositor surface close to the mascot instead of the
// size of the entire virtual desktop. The margin gives drag hit regions room
// to follow a fast cursor without turning the window back into a screen-sized
// surface.
const PET_OVERLAY_WINDOW_MARGIN = 128;
const PET_OVERLAY_RECENTER_INSET = 48;
const PET_OVERLAY_INITIAL_WIDTH = 480;
const PET_OVERLAY_INITIAL_HEIGHT = 560;
const PET_OVERLAY_CURSOR_INTERVAL_MS = 16;
// The history is its own deliberately small compositor surface. Its React
// panel is 620x560 with eight pixels of transparent breathing room per side.
// Never merge these bounds with the mascot overlay: the empty union between a
// moved panel and pet was the source of the former desktop-wide GPU cost.
const PET_HISTORY_WINDOW_WIDTH = 636;
const PET_HISTORY_WINDOW_HEIGHT = 576;
const PET_HISTORY_WINDOW_MARGIN = 8;
const PET_DESKTOP_TOP_LEVEL = "floating";
// `screen-saver` is Electron's highest ordinary Windows level. It gives game
// mode its best chance of staying visible without injecting into or hooking a
// game process. Exclusive fullscreen games can still own the final top layer.
const PET_GAME_TOP_LEVEL = process.platform === "win32" ? "screen-saver" : "floating";
const PET_DISPLAY_MODES = new Set(["app", "desktop", "games"]);

function normalizePetDisplayMode(value) {
  return PET_DISPLAY_MODES.has(value) ? value : "desktop";
}

/**
 * Who owns the mouse while the mascot floats, decided in one place.
 *
 * Everywhere else an overlay app draws INSIDE the game (Discord and Overwolf
 * inject a DLL and render into the game's own frames, which is why they add
 * no latency — and also why they need anti-cheat vendors to whitelist them).
 * A BrowserWindow can never do that, so this window's only honest job over a
 * game is to stay out of the input path entirely, and there are two ways it
 * failed to:
 *
 *  - setIgnoreMouseEvents(true, { forward: true }) is implemented on Windows
 *    as a LOW-LEVEL GLOBAL MOUSE HOOK. Every mouse move on the machine is
 *    routed through this process before the game sees it, and whenever this
 *    process is busy the whole system's cursor waits on it. That is felt as
 *    input delay in a game the mascot is not even touching.
 *  - The shaped overlay owns real input over the mascot's pixels, so a click
 *    that lands on the pet mid-fight goes to the pet and not the game.
 *
 * Games mode therefore means watch-only: plain click-through, no forwarding
 * hook, no input-owning shape — the window has no way to slow a game's input
 * because it is no longer standing in the road. Desktop mode keeps the shaped
 * interactive mascot exactly as before.
 */
function applyPetOverlayInputPolicy() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petDisplayMode === "games") {
    petWindow.setIgnoreMouseEvents(true);
    return;
  }
  if (petOverlayUsesShape) petWindow.setIgnoreMouseEvents(false);
  else petWindow.setIgnoreMouseEvents(true, { forward: true });
}

function keepPetSurfaceOnTop(window, moveToFront = false) {
  if (!window || window.isDestroyed() || petDisplayMode === "app") return;
  const level = petDisplayMode === "games" ? PET_GAME_TOP_LEVEL : PET_DESKTOP_TOP_LEVEL;
  const configuredLevel = petSurfaceTopLevels.get(window);
  if (configuredLevel !== level || !window.isAlwaysOnTop()) {
    window.setAlwaysOnTop(true, level);
    petSurfaceTopLevels.set(window, level);
  }
  // Electron's workspace API is useful on macOS/Linux but explicitly does
  // nothing on Windows. On Windows the configured topmost level is left alone
  // while another app is active instead of repeatedly fighting its z-order.
  if (process.platform !== "win32") {
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: petDisplayMode === "games",
    });
  }
  if (moveToFront && window.isVisible()) window.moveTop();
}

function reassertPetSurfacesAfterAppDeactivation() {
  if (petDisplayMode === "app") return;
  // A fullscreen game may finish its own z-order transition after Micheon has
  // already blurred/minimized. Two bounded, non-focusing raises cover that
  // hand-off. Never poll or reorder the overlay while a fullscreen game is
  // active: doing so can make Windows switch the game out of fullscreen.
  for (const delay of [80, 700]) {
    const timer = setTimeout(() => {
      keepPetSurfaceOnTop(petWindow, true);
      if (petHistoryShouldBeVisible) keepPetSurfaceOnTop(petHistoryWindow, true);
    }, delay);
    timer.unref?.();
  }
}

// Only allow one instance — a second launch focuses the existing window instead
// of trying to bind the port or create another overlay.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });
}

async function ensureServer() {
  if (serverStarted) return;
  await startServer(PORT);
  serverStarted = true;
}

function desktopSettingsPath() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

function getDesktopSettings() {
  if (!desktopSettings) desktopSettings = readDesktopSettings(desktopSettingsPath());
  return desktopSettings;
}

function saveDesktopSettings(value) {
  // Callers pass partial updates; merge over the current settings so saving
  // one preference can never reset another to its default.
  desktopSettings = writeDesktopSettings(desktopSettingsPath(), { ...getDesktopSettings(), ...value });
  if (desktopSettings.closeBehavior === "exit") destroyTray();
  return desktopSettings;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

function ensureTray() {
  if (tray) return tray;
  tray = new Tray(path.join(__dirname, "..", "dist", "icon.png"));
  tray.setToolTip("Micheon");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Micheon", click: showMainWindow },
    { type: "separator" },
    {
      label: "Quit Micheon",
      click: () => {
        appIsQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", showMainWindow);
  return tray;
}

function windowsSettingsSnapshot() {
  const launchAtLoginSupported = process.platform === "win32" && app.isPackaged;
  let launchAtLogin = false;
  if (process.platform === "win32") {
    try {
      launchAtLogin = app.getLoginItemSettings().openAtLogin;
    } catch {
      launchAtLogin = false;
    }
  }
  return {
    ...getDesktopSettings(),
    launchAtLogin,
    launchAtLoginSupported,
    platform: process.platform,
  };
}

/**
 * Give selectable text and form fields the native desktop editing menu.
 *
 * Chromium does not create this menu inside a frameless Electron window, so a
 * highlighted phrase otherwise appears copyable but right-clicking does
 * nothing. Keep the menu scoped to text interactions so Micheon's own
 * right-click controls, such as the audio mixer, continue to receive clicks.
 */
function installTextContextMenu(window) {
  window.webContents.on("context-menu", (_event, params) => {
    const hasSelection = Boolean(params.selectionText?.trim());
    if (!params.isEditable && !hasSelection) return;

    const template = params.isEditable
      ? [
          { role: "undo", enabled: params.editFlags.canUndo },
          { role: "redo", enabled: params.editFlags.canRedo },
          { type: "separator" },
          { role: "cut", enabled: params.editFlags.canCut },
          { role: "copy", enabled: params.editFlags.canCopy && hasSelection },
          { role: "paste", enabled: params.editFlags.canPaste },
          { type: "separator" },
          { role: "selectAll", enabled: params.editFlags.canSelectAll },
        ]
      : [{ role: "copy", enabled: params.editFlags.canCopy && hasSelection }];

    Menu.buildFromTemplate(template).popup({ window });
  });
}

/**
 * The whole desktop, in the points the renderer lays out in.
 *
 * This used to read display.bounds alone. On a display with a scale factor set,
 * bounds and workArea come back in DIFFERENT units — measured on this machine:
 *
 *   scale 1.00   bounds 1920x1080   workArea 1920x1032    agree
 *   scale 2.25   bounds  379x 213   workArea  854x 459    bounds ~2.25x small
 *
 * A 3440x1440 panel at 225% is 1529x640 points; bounds reported a fraction of
 * that, so the mascot was clamped into a small corner of the screen, its window
 * was sized from the same wrong figure — which is what clipped the sprite and
 * its menu — and dragging compared a real cursor position against a shrunken
 * coordinate space, which is what made it jump.
 *
 * Taking the union of both rectangles is self-correcting. Normally workArea is
 * the smaller of the two (it excludes the taskbar) and bounds decides the
 * answer, which is what lets the pet sit over the taskbar. When bounds comes
 * back wrong, workArea supplies the real extent instead. Neither can make the
 * desktop smaller than it is.
 */
function virtualDesktopBounds() {
  const rects = [];
  for (const display of screen.getAllDisplays()) {
    if (display?.bounds?.width > 0 && display?.bounds?.height > 0) rects.push(display.bounds);
    if (display?.workArea?.width > 0 && display?.workArea?.height > 0) rects.push(display.workArea);
  }
  if (rects.length === 0) return { x: 0, y: 0, width: 1280, height: 720 };

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Remember where the mascot was left.
 *
 * The renderer already saved its position inside the overlay window, but the
 * WINDOW itself was recreated bottom-right of the primary display on every
 * launch — so dragging the pet somewhere and restarting put it back in the
 * corner, and the saved coordinate was measured against a window that had
 * moved out from under it.
 *
 * Stored in desktop-settings.json rather than localStorage because it is a
 * property of the window, which the main process owns and the renderer cannot
 * see. Clamped on read: a monitor that has been unplugged since must not
 * strand the mascot at coordinates nothing can display.
 */
function savePetOverlayBounds() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const current = getDesktopSettings().petOverlayBounds;
  if (
    current
    && current.x === bounds.x && current.y === bounds.y
    && current.width === bounds.width && current.height === bounds.height
  ) return;
  saveDesktopSettings({ petOverlayBounds: bounds });
}

function initialPetOverlayBounds() {
  const desktopBounds = virtualDesktopBounds();
  const primary = screen.getPrimaryDisplay().workArea;
  const width = Math.min(PET_OVERLAY_INITIAL_WIDTH, desktopBounds.width);
  const height = Math.min(PET_OVERLAY_INITIAL_HEIGHT, desktopBounds.height);

  const saved = getDesktopSettings().petOverlayBounds;
  if (
    saved
    && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    && Number.isFinite(saved.width) && Number.isFinite(saved.height)
  ) {
    const savedWidth = Math.min(Math.max(120, saved.width), desktopBounds.width);
    const savedHeight = Math.min(Math.max(120, saved.height), desktopBounds.height);
    return {
      x: Math.min(
        Math.max(desktopBounds.x, saved.x),
        desktopBounds.x + desktopBounds.width - savedWidth
      ),
      y: Math.min(
        Math.max(desktopBounds.y, saved.y),
        desktopBounds.y + desktopBounds.height - savedHeight
      ),
      width: savedWidth,
      height: savedHeight,
    };
  }

  return {
    x: Math.min(
      desktopBounds.x + desktopBounds.width - width,
      Math.max(desktopBounds.x, primary.x + primary.width - width - 16)
    ),
    y: Math.min(
      desktopBounds.y + desktopBounds.height - height,
      Math.max(desktopBounds.y, primary.y + primary.height - height - 16)
    ),
    width,
    height,
  };
}

function currentPetOverlayGeometry() {
  const desktopBounds = petOverlayDragDesktopBounds ?? virtualDesktopBounds();
  const windowBounds = petWindow && !petWindow.isDestroyed()
    ? petWindow.getBounds()
    : initialPetOverlayBounds();
  return {
    height: windowBounds.height,
    originX: windowBounds.x - desktopBounds.x,
    originY: windowBounds.y - desktopBounds.y,
    revision: petOverlayGeometryRevision,
    viewportHeight: desktopBounds.height,
    viewportWidth: desktopBounds.width,
    width: windowBounds.width,
  };
}

function clearPetOverlayGeometryTransitionTimer() {
  if (petOverlayGeometryTransitionTimer) clearTimeout(petOverlayGeometryTransitionTimer);
  petOverlayGeometryTransitionTimer = null;
}

function finishPetOverlayGeometryTransition(revision = petOverlayPendingGeometryRevision) {
  if (!revision || revision !== petOverlayPendingGeometryRevision) return;
  petOverlayPendingGeometryRevision = 0;
  clearPetOverlayGeometryTransitionTimer();
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    petWindow.setOpacity(1);
  } catch {
    // The window can be destroyed between the acknowledgement and this call.
  }
}

/**
 * Hide a native bounds change until the renderer has rebased its desktop plane.
 * Moving the transparent BrowserWindow changes its origin immediately, while
 * the renderer learns that origin over IPC. Without this handshake Chromium
 * can show one stale frame at the left edge or clip the compacted pet/panel.
 */
function beginPetOverlayGeometryTransition() {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return 0;
  petOverlayGeometryRevision += 1;
  petOverlayPendingGeometryRevision = petOverlayGeometryRevision;
  clearPetOverlayGeometryTransitionTimer();
  try {
    petWindow.setOpacity(0);
  } catch {
    petOverlayPendingGeometryRevision = 0;
    return 0;
  }
  // Never strand the mascot invisible if the renderer crashes or is suspended.
  const revision = petOverlayPendingGeometryRevision;
  petOverlayGeometryTransitionTimer = setTimeout(
    () => finishPetOverlayGeometryTransition(revision),
    500
  );
  petOverlayGeometryTransitionTimer.unref?.();
  return revision;
}

function publishPetOverlayGeometry(force = false) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const geometry = currentPetOverlayGeometry();
  const signature = JSON.stringify(geometry);
  if (!force && signature === petOverlayGeometrySignature) return;
  petOverlayGeometrySignature = signature;
  petWindow.webContents.send("pet-overlay:geometry", geometry);
}

function syncPetOverlayBounds() {
  if (!petWindow || petWindow.isDestroyed()) return;
  // A monitor being added, removed, or repositioned changes the virtual
  // desktop origin. End the current gesture before applying that new
  // coordinate space so cursor samples never mix two desktop geometries.
  if (petOverlayDragging) finishPetOverlayDrag();
  const desktopBounds = virtualDesktopBounds();
  const current = petWindow.getBounds();
  const width = Math.min(current.width, desktopBounds.width);
  const height = Math.min(current.height, desktopBounds.height);
  const next = {
    x: Math.min(
      Math.max(desktopBounds.x, current.x),
      desktopBounds.x + desktopBounds.width - width
    ),
    y: Math.min(
      Math.max(desktopBounds.y, current.y),
      desktopBounds.y + desktopBounds.height - height
    ),
    width,
    height,
  };
  if (
    current.x !== next.x
    || current.y !== next.y
    || current.width !== next.width
    || current.height !== next.height
  ) {
    const resized = current.width !== next.width || current.height !== next.height;
    beginPetOverlayGeometryTransition();
    petWindow.setBounds(next, false);
    if (resized) {
      // Resizing the window can drop the native region, so never let the
      // skip-identical check suppress the re-apply. Moving preserves it.
      petOverlayShapeSignature = null;
      if (petOverlayDragging) applyPetOverlayDragShape();
      else restorePetOverlayShape();
    }
  } else if (!petOverlayDragging) restorePetOverlayShape();
  publishPetOverlayGeometry(true);
}

/**
 * Apply renderer rectangles without scaling them first. BrowserWindow bounds,
 * DOM rectangles, and setShape input are all DIP; Chromium performs the one
 * required DIP-to-device-pixel conversion for the target HWND internally.
 */
function applyPetOverlayShape(regions, preserveOnFailure = false) {
  if (!petWindow || petWindow.isDestroyed() || regions.length === 0) return false;
  // setShape is a native SetWindowRgn on Windows and is far too expensive to
  // call at frame rate. Skipping an identical shape costs one string compare
  // and removes nearly all of the calls, because a moving pet re-sends the same
  // geometry whenever it settles. Resizes explicitly clear this signature
  // because Windows can discard the native region while changing the surface.
  const signature = JSON.stringify(regions);
  if (signature === petOverlayShapeSignature) return true;
  try {
    petWindow.setShape(regions);
    petOverlayShapeSignature = signature;
    petOverlayUsesShape = true;
    applyPetOverlayInputPolicy();
    return true;
  } catch (error) {
    petOverlayShapeSignature = null;
    if (!preserveOnFailure) {
      petOverlayUsesShape = false;
      applyPetOverlayInputPolicy();
    }
    console.error("[pet] unable to shape overlay:", error?.message ?? error);
    return false;
  }
}

/**
 * Grow the overlay to the whole virtual desktop for a drag.
 *
 * Published synchronously so the renderer knows the new origin before the first
 * cursor sample arrives — otherwise the first move of every drag is drawn
 * against the old origin and the mascot jumps.
 */
function expandPetOverlayForDrag() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const desktopBounds = petOverlayDragDesktopBounds ?? virtualDesktopBounds();
  const current = petWindow.getBounds();
  if (
    current.x === desktopBounds.x
    && current.y === desktopBounds.y
    && current.width === desktopBounds.width
    && current.height === desktopBounds.height
  ) return;
  // Resizing drops the Windows window region, so the shape must be re-applied
  // rather than skipped as identical.
  beginPetOverlayGeometryTransition();
  petOverlayShapeSignature = null;
  petWindow.setBounds(desktopBounds, false);
  publishPetOverlayGeometry(true);
}

function applyPetOverlayDragShape() {
  if (!petOverlayDragging || !petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  // During a drag the complete compact window becomes the temporary hit area.
  // Its transparent margin follows the mascot, so Windows receives mouse-up
  // without an expensive SetWindowRgn call for every cursor update.
  applyPetOverlayShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }], true);
}

function compactPetOverlayToRegions(
  regions,
  rendererOrigin = {},
  desktopBounds = virtualDesktopBounds()
) {
  if (!petWindow || petWindow.isDestroyed() || regions.length === 0) return [];

  // Never move the native window mid-drag. The window origin is what the
  // renderer positions its content against, so every move shifted the ground
  // under a mascot that was being dragged across it — which is what the stutter
  // was. The drag already widened the window to the whole desktop, so there is
  // nothing to follow; it recompacts when the drag ends.
  if (petOverlayDragging) return [];

  const currentBounds = petWindow.getBounds();
  const originX = Number.isFinite(Number(rendererOrigin?.x))
    ? Number(rendererOrigin.x)
    : currentBounds.x - desktopBounds.x;
  const originY = Number.isFinite(Number(rendererOrigin?.y))
    ? Number(rendererOrigin.y)
    : currentBounds.y - desktopBounds.y;

  // Renderer rectangles are local to the compact native window. Rebase them
  // through the origin that produced that render so even an in-flight geometry
  // update cannot make a stale rectangle jump to another part of the desktop.
  const globalRegions = regions.map((region) => ({
    height: region.height,
    width: region.width,
    x: desktopBounds.x + originX + region.x,
    y: desktopBounds.y + originY + region.y,
  }));

  const desiredLeft = Math.max(
    desktopBounds.x,
    Math.floor(Math.min(...globalRegions.map((region) => region.x)) - PET_OVERLAY_WINDOW_MARGIN)
  );
  const desiredTop = Math.max(
    desktopBounds.y,
    Math.floor(Math.min(...globalRegions.map((region) => region.y)) - PET_OVERLAY_WINDOW_MARGIN)
  );
  const desiredRight = Math.min(
    desktopBounds.x + desktopBounds.width,
    Math.ceil(
      Math.max(...globalRegions.map((region) => region.x + region.width))
      + PET_OVERLAY_WINDOW_MARGIN
    )
  );
  const desiredBottom = Math.min(
    desktopBounds.y + desktopBounds.height,
    Math.ceil(
      Math.max(...globalRegions.map((region) => region.y + region.height))
      + PET_OVERLAY_WINDOW_MARGIN
    )
  );
  if (desiredRight <= desiredLeft || desiredBottom <= desiredTop) return [];

  const desiredBounds = {
    x: desiredLeft,
    y: desiredTop,
    width: desiredRight - desiredLeft,
    height: desiredBottom - desiredTop,
  };
  const regionLeft = Math.min(...globalRegions.map((region) => region.x));
  const regionTop = Math.min(...globalRegions.map((region) => region.y));
  const regionRight = Math.max(...globalRegions.map((region) => region.x + region.width));
  const regionBottom = Math.max(...globalRegions.map((region) => region.y + region.height));
  const desktopRight = desktopBounds.x + desktopBounds.width;
  const desktopBottom = desktopBounds.y + desktopBounds.height;
  const safeLeft = currentBounds.x <= desktopBounds.x
    ? currentBounds.x
    : currentBounds.x + PET_OVERLAY_RECENTER_INSET;
  const safeTop = currentBounds.y <= desktopBounds.y
    ? currentBounds.y
    : currentBounds.y + PET_OVERLAY_RECENTER_INSET;
  const safeRight = currentBounds.x + currentBounds.width >= desktopRight
    ? currentBounds.x + currentBounds.width
    : currentBounds.x + currentBounds.width - PET_OVERLAY_RECENTER_INSET;
  const safeBottom = currentBounds.y + currentBounds.height >= desktopBottom
    ? currentBounds.y + currentBounds.height
    : currentBounds.y + currentBounds.height - PET_OVERLAY_RECENTER_INSET;
  const regionsHaveRoom = regionLeft >= safeLeft
    && regionTop >= safeTop
    && regionRight <= safeRight
    && regionBottom <= safeBottom;
  const currentArea = currentBounds.width * currentBounds.height;
  const desiredArea = desiredBounds.width * desiredBounds.height;
  const needToShrink = currentArea > desiredArea * 1.5;
  // Let the content travel within the compact surface and only recenter near an
  // edge. Without this hysteresis, a drag moved the native BrowserWindow on
  // every cursor tick even though it already had ample transparent room.
  const nextBounds = regionsHaveRoom && !needToShrink ? currentBounds : desiredBounds;
  const moved = currentBounds.x !== nextBounds.x || currentBounds.y !== nextBounds.y;
  const resized = currentBounds.width !== nextBounds.width || currentBounds.height !== nextBounds.height;
  if (moved || resized) {
    // Moving preserves a Windows window region. Resizing can drop it.
    beginPetOverlayGeometryTransition();
    if (resized) petOverlayShapeSignature = null;
    petWindow.setBounds(nextBounds, false);
  }

  const localRegions = globalRegions
    .map((region) => {
      const x = Math.max(0, Math.floor(region.x - nextBounds.x));
      const y = Math.max(0, Math.floor(region.y - nextBounds.y));
      const localRight = Math.min(
        nextBounds.width,
        Math.ceil(region.x + region.width - nextBounds.x)
      );
      const localBottom = Math.min(
        nextBounds.height,
        Math.ceil(region.y + region.height - nextBounds.y)
      );
      if (localRight <= x || localBottom <= y) return null;
      return { x, y, width: localRight - x, height: localBottom - y };
    })
    .filter(Boolean);

  if (moved || resized) publishPetOverlayGeometry();
  return localRegions;
}

function restorePetOverlayShape() {
  if (petOverlayHitRegions.length > 0) applyPetOverlayShape(petOverlayHitRegions);
}

function stopPetOverlayCursorTracking() {
  if (petOverlayDragTimer) clearInterval(petOverlayDragTimer);
  petOverlayDragTimer = null;
}

function petOverlayCursorPoint() {
  if (!petWindow || petWindow.isDestroyed()) return null;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petOverlayDragDesktopBounds ?? virtualDesktopBounds();
  return {
    screenX: cursor.x,
    screenY: cursor.y,
    x: cursor.x - bounds.x,
    y: cursor.y - bounds.y,
  };
}

function startPetOverlayCursorTracking() {
  stopPetOverlayCursorTracking();
  let previousPoint = null;
  const sendCursor = () => {
    if (!petOverlayDragging || !petWindow || petWindow.isDestroyed()) {
      stopPetOverlayCursorTracking();
      return;
    }
    const point = petOverlayCursorPoint();
    if (!point || (previousPoint?.x === point.x && previousPoint?.y === point.y)) return;
    previousPoint = point;
    petWindow.webContents.send("pet-overlay:drag-cursor", point);
  };
  sendCursor();
  petOverlayDragTimer = setInterval(sendCursor, PET_OVERLAY_CURSOR_INTERVAL_MS);
  petOverlayDragTimer.unref?.();
  return previousPoint;
}

function finishPetOverlayDrag() {
  stopPetOverlayCursorTracking();
  if (petOverlayDragWatchdog) clearTimeout(petOverlayDragWatchdog);
  petOverlayDragWatchdog = null;
  if (!petOverlayDragging) return;
  petOverlayDragging = false;
  petOverlayDragDesktopBounds = null;
  // The stored regions are local to the window as it was BEFORE the drag
  // widened it, so re-applying them now would shape the wrong part of a
  // desktop-sized window and the mascot would simply stop being drawn. Drop
  // them and hold the full-window shape — everything stays visible — until the
  // renderer delivers regions measured against the window as it is now.
  petOverlayHitRegions = [];
  petOverlayShapeSignature = null;
  if (petWindow && !petWindow.isDestroyed() && !petWindow.webContents.isDestroyed()) {
    petWindow.webContents.send("pet-overlay:drag-ended");
    // Ask for those regions rather than waiting to be told: until they arrive
    // the overlay covers the desktop and swallows clicks meant for what is
    // behind it.
    petWindow.webContents.send("pet-overlay:resync");
  }
  // Where the mascot was dropped is where it should be next launch.
  savePetOverlayBounds();
}

function startPetOverlayDragWatchdog() {
  if (petOverlayDragWatchdog) clearTimeout(petOverlayDragWatchdog);
  petOverlayDragWatchdog = setTimeout(finishPetOverlayDrag, 20000);
  petOverlayDragWatchdog.unref?.();
}

// The overlay used to be a single-shot load: one failed loadURL (server busy,
// transient socket error) was swallowed by a .catch and the overlay stayed a
// blank transparent window for the entire session — enabling a pet visibly did
// nothing. The load now retries with backoff while the overlay exists, and
// showing the overlay again resets the budget.
let petOverlayLoaded = false;
let petOverlayLoadAttempts = 0;
let petOverlayLoadTimer = null;
let petOverlayDestroyTimer = null;

function clearPetOverlayLoadTimer() {
  if (petOverlayLoadTimer) clearTimeout(petOverlayLoadTimer);
  petOverlayLoadTimer = null;
}

function clearPetOverlayDestroyTimer() {
  if (petOverlayDestroyTimer) clearTimeout(petOverlayDestroyTimer);
  petOverlayDestroyTimer = null;
}

function resetPetOverlayLoadState() {
  clearPetOverlayLoadTimer();
  petOverlayLoaded = false;
  petOverlayLoadAttempts = 0;
}

/**
 * Keep the overlay's CSS pixel exactly one DIP.
 *
 * Every rectangle the renderer measures with getBoundingClientRect is in CSS
 * pixels, and every rectangle this file hands to setBounds/setShape is in DIP.
 * The two are only the same unit while the page zoom is 1. At any other zoom
 * the renderer reports a plane that is 1/zoom the size it actually paints, so
 * the compact window is positioned and sized against numbers Chromium never
 * used — which shows up as the mascot's shape being offset from the mascot and
 * a straight-edged slice missing from the speech bubble.
 *
 * Chromium's zoom is per-origin and persisted (per_host_zoom_levels in the
 * Preferences file), so a single accidental Ctrl+scroll or Ctrl+minus in the
 * main window used to break the mascot permanently, on every later launch,
 * with nothing in the UI to suggest why. Recorded on one machine as
 * localhost:-1.5 — zoom 1.2^-1.5 = 0.76, so a 420 DIP window laid itself out
 * as 552 CSS px and everything native was ~31% out. A trackpad pinch is the
 * easy way in: unlike the menu's fixed steps it produces fractional levels.
 *
 * Because the level is per-origin and the overlay shares its origin with the
 * main window, pinning it back to 0 normalises both — the app does not offer
 * zoom as a feature anywhere, and a mascot whose geometry is a native contract
 * cannot be the thing that honours an accidental pinch. Clearing it here is
 * also what repairs an install that has already stored a bad level.
 */
function pinPetOverlayZoom(contents) {
  if (!contents || contents.isDestroyed()) return;
  try {
    // setZoomLevel, not setZoomFactor: level 0 is the exact identity, while a
    // factor round-trips through the same 1.2^level curve and can land a hair
    // off 1.
    if (contents.getZoomLevel() !== 0) contents.setZoomLevel(0);
  } catch (error) {
    console.error("[pet] unable to pin overlay zoom:", error?.message ?? error);
  }
}

// ── Main-window zoom ─────────────────────────────────────────────────────
// Zoom IS offered as a feature, but only for the main window and only through
// applyMainZoom, which keeps the two contracts above intact: every change
// lands on the fixed ladder (zoom-steps.cjs), and the mascot surfaces — which
// share the origin and are silently re-zoomed by Chromium's per-origin map —
// are pinned straight back to level 0.
function applyMainZoom(factor) {
  if (!mainWindow || mainWindow.isDestroyed()) return 1;
  const next = clampZoomFactor(factor);
  mainWindow.webContents.setZoomFactor(next);
  pinPetOverlayZoom(petWindow?.webContents);
  pinPetOverlayZoom(petHistoryWindow?.webContents);
  saveDesktopSettings({ zoomFactor: next });
  mainWindow.webContents.send("zoom:changed", next);
  return next;
}

function currentMainZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return getDesktopSettings().zoomFactor;
  try {
    return clampZoomFactor(mainWindow.webContents.getZoomFactor());
  } catch {
    return getDesktopSettings().zoomFactor;
  }
}

function stepMainZoom(direction) {
  return applyMainZoom(nextZoomStep(currentMainZoom(), direction));
}

/**
 * Ctrl+= / Ctrl+- / Ctrl+0 for the main window.
 *
 * Electron's default menu only binds zoom-in to the literal "+" character,
 * which needs Shift on most layouts — so Ctrl+- zoomed out but Ctrl+= did
 * nothing to zoom back in. Handling the keys here accepts both the "=" key
 * and a shifted "+", and preventDefault stops the default menu roles from
 * double-stepping the ones they did catch. Ctrl+wheel arrives separately as
 * a zoom-changed request and walks the same ladder.
 */
function installMainZoomHandlers(contents) {
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const modifier = process.platform === "darwin" ? input.meta : input.control;
    if (!modifier || input.alt) return;
    if (input.key === "=" || input.key === "+") {
      event.preventDefault();
      stepMainZoom(1);
    } else if (input.key === "-" || input.key === "_") {
      event.preventDefault();
      stepMainZoom(-1);
    } else if (input.key === "0" && !input.shift) {
      event.preventDefault();
      applyMainZoom(1);
    }
  });
  contents.on("zoom-changed", (event, zoomDirection) => {
    event.preventDefault();
    stepMainZoom(zoomDirection === "in" ? 1 : -1);
  });
}

function loadPetOverlay() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petWindow.webContents.isLoading()) return;
  // Deliberately the same origin as the main window. Giving the overlay its own
  // hostname would hand it a private zoom bucket, but it would also hand it a
  // private localStorage — the overlay reads the pet's size and selection from
  // there — so the mascot would come back default-sized with the wrong pets.
  void petWindow.loadURL(`http://localhost:${PORT}/?pet-overlay=1`).catch((error) => {
    console.error("[pet] unable to load overlay:", error?.message ?? error);
    schedulePetOverlayLoadRetry();
  });
}

function schedulePetOverlayLoadRetry() {
  if (petOverlayLoadTimer || !petWindow || petWindow.isDestroyed()) return;
  if (!petWindow.isVisible()) return;
  if (petOverlayLoadAttempts >= 5) return;
  const delay = Math.min(15000, 1000 * 2 ** petOverlayLoadAttempts);
  petOverlayLoadAttempts += 1;
  petOverlayLoadTimer = setTimeout(() => {
    petOverlayLoadTimer = null;
    loadPetOverlay();
  }, delay);
  petOverlayLoadTimer.unref?.();
}

function createPetOverlayWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow;
  clearPetOverlayGeometryTransitionTimer();
  petOverlayPendingGeometryRevision = 0;
  const initialBounds = initialPetOverlayBounds();

  const overlay = new BrowserWindow({
    ...initialBounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    movable: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: "Micheon mascot",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The overlay used to opt out of Chromium's background throttling. That
      // kept sprite timers and transparent-surface composition running at full
      // speed even after the mascot window was hidden, which could make the
      // entire desktop stutter. Visible pets animate normally with the default
      // throttling; hidden pets now become genuinely idle.
      backgroundThrottling: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  petWindow = overlay;
  overlay.webContents.once("did-finish-load", () => {
    if (!overlay.isDestroyed() && !overlay.webContents.isDestroyed()) {
      overlay.webContents.send("pet-overlay:app-focused", petAppFocused);
    }
  });
  keepPetSurfaceOnTop(overlay);
  applyPetOverlayInputPolicy();
  overlay.on("move", () => {
    if (petWindow === overlay) publishPetOverlayGeometry();
  });
  overlay.on("resize", () => {
    if (petWindow === overlay) publishPetOverlayGeometry();
  });

  // At navigation commit, so the document's very first layout already uses the
  // same unit the native window is sized in. Waiting for did-finish-load would
  // let one wrongly-scaled frame be measured and shaped.
  overlay.webContents.on("did-navigate", () => pinPetOverlayZoom(overlay.webContents));
  // Nothing should be able to zoom a click-through mascot, but the level is
  // restored from the persisted per-origin store on load and can be changed by
  // a stray accelerator, so treat any change as something to undo rather than
  // trusting that it cannot happen.
  overlay.webContents.on("zoom-changed", () => pinPetOverlayZoom(overlay.webContents));

  overlay.webContents.on("did-finish-load", () => {
    if (petWindow !== overlay || overlay.isDestroyed()) return;
    clearPetOverlayLoadTimer();
    petOverlayLoaded = true;
    petOverlayLoadAttempts = 0;
    pinPetOverlayZoom(overlay.webContents);
    publishPetOverlayGeometry(true);
    if (overlay.isVisible()) overlay.webContents.send("pet-overlay:resync");
  });
  overlay.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      // Chromium reports ERR_ABORTED when a newer navigation replaces an older
      // one. It is not a failed overlay and must not consume the retry budget.
      if (!isMainFrame || errorCode === -3) return;
      if (petWindow !== overlay) return;
      finishPetOverlayDrag();
      petOverlayLoaded = false;
      console.error(`[pet] overlay load failed (${errorCode}):`, errorDescription);
      schedulePetOverlayLoadRetry();
    }
  );
  overlay.webContents.on("render-process-gone", (_event, details) => {
    if (petWindow !== overlay) return;
    finishPetOverlayDrag();
    petOverlayLoaded = false;
    console.error("[pet] overlay renderer exited:", details?.reason ?? "unknown");
    schedulePetOverlayLoadRetry();
  });
  loadPetOverlay();
  overlay.on("closed", () => {
    if (petWindow !== overlay) return;
    clearPetOverlayDestroyTimer();
    clearPetOverlayGeometryTransitionTimer();
    stopPetOverlayCursorTracking();
    if (petOverlayDragWatchdog) clearTimeout(petOverlayDragWatchdog);
    petOverlayDragWatchdog = null;
    resetPetOverlayLoadState();
    petWindow = null;
    petOverlayUsesShape = false;
    petOverlayDragging = false;
    petOverlayDragDesktopBounds = null;
    petOverlayHitRegions = [];
    petOverlayShapeSignature = null;
    petOverlayGeometrySignature = null;
    petOverlayPendingGeometryRevision = 0;
  });
  overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return overlay;
}

function clearPetHistoryDestroyTimer() {
  if (petHistoryDestroyTimer) clearTimeout(petHistoryDestroyTimer);
  petHistoryDestroyTimer = null;
}

function clampPetHistoryBounds(bounds) {
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const reference = bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
    ? bounds
    : primaryWorkArea;
  const workArea = screen.getDisplayMatching(reference)?.workArea ?? primaryWorkArea;
  return clampHistoryBounds(bounds, workArea, {
    height: PET_HISTORY_WINDOW_HEIGHT,
    margin: PET_HISTORY_WINDOW_MARGIN,
    width: PET_HISTORY_WINDOW_WIDTH,
  });
}

function normalizePetHistoryAnchorBounds(bounds) {
  const desktop = virtualDesktopBounds();
  const rawX = Number(bounds?.x);
  const rawY = Number(bounds?.y);
  const rawWidth = Number(bounds?.width);
  const rawHeight = Number(bounds?.height);
  if (
    !Number.isFinite(rawX)
    || !Number.isFinite(rawY)
    || !Number.isFinite(rawWidth)
    || !Number.isFinite(rawHeight)
    || rawWidth <= 0
    || rawHeight <= 0
  ) return null;
  const width = Math.min(desktop.width, Math.max(1, Math.round(rawWidth)));
  const height = Math.min(desktop.height, Math.max(1, Math.round(rawHeight)));
  return {
    x: Math.min(
      Math.max(desktop.x, Math.round(desktop.x + rawX)),
      desktop.x + desktop.width - width
    ),
    y: Math.min(
      Math.max(desktop.y, Math.round(desktop.y + rawY)),
      desktop.y + desktop.height - height
    ),
    width,
    height,
  };
}

function initialPetHistoryBounds({ attached = petHistoryAttached } = {}) {
  const mascot = petHistoryAnchorBounds
    ?? (petWindow && !petWindow.isDestroyed()
      ? petWindow.getBounds()
      : screen.getPrimaryDisplay().workArea);
  const reference = !attached && petHistoryBounds && Number.isFinite(petHistoryBounds.x)
    && Number.isFinite(petHistoryBounds.y)
    ? petHistoryBounds
    : mascot;
  const workArea = screen.getDisplayMatching(reference)?.workArea
    ?? screen.getPrimaryDisplay().workArea;
  return placePetHistoryBounds({
    attached,
    height: PET_HISTORY_WINDOW_HEIGHT,
    margin: PET_HISTORY_WINDOW_MARGIN,
    mascotBounds: mascot,
    storedBounds: petHistoryBounds,
    width: PET_HISTORY_WINDOW_WIDTH,
    workArea,
  });
}

function rememberPetHistoryBounds(historyWindow = petHistoryWindow) {
  if (!historyWindow || historyWindow.isDestroyed()) return;
  petHistoryBounds = clampPetHistoryBounds(historyWindow.getBounds());
}

function setPetHistoryBounds(historyWindow, bounds) {
  const revision = ++petHistoryProgrammaticMoveRevision;
  petHistoryProgrammaticMove = true;
  try {
    historyWindow.setBounds(bounds, false);
  } finally {
    // Some window managers report a programmatic setBounds through will-move.
    // Keep the guard through this native event turn, then let a real header
    // drag detach normally.
    setImmediate(() => {
      if (revision === petHistoryProgrammaticMoveRevision) {
        petHistoryProgrammaticMove = false;
      }
    });
  }
}

function syncAttachedPetHistoryBounds() {
  if (
    !petHistoryAttached
    || !petHistoryShouldBeVisible
    || !petHistoryWindow
    || petHistoryWindow.isDestroyed()
  ) return false;
  const current = petHistoryWindow.getBounds();
  const next = initialPetHistoryBounds({ attached: true });
  petHistoryBounds = next;
  if (
    current.x !== next.x
    || current.y !== next.y
    || current.width !== next.width
    || current.height !== next.height
  ) {
    setPetHistoryBounds(petHistoryWindow, next);
  }
  return true;
}

function syncPetHistoryBounds() {
  if (syncAttachedPetHistoryBounds()) return;
  if (petHistoryWindow && !petHistoryWindow.isDestroyed()) {
    const current = petHistoryWindow.getBounds();
    const next = clampPetHistoryBounds(current);
    petHistoryBounds = next;
    if (
      current.x !== next.x
      || current.y !== next.y
      || current.width !== next.width
      || current.height !== next.height
    ) {
      setPetHistoryBounds(petHistoryWindow, next);
    }
    return;
  }
  if (petHistoryBounds) petHistoryBounds = clampPetHistoryBounds(petHistoryBounds);
}

function createPetHistoryWindow() {
  if (petHistoryWindow && !petHistoryWindow.isDestroyed()) return petHistoryWindow;
  const initialBounds = initialPetHistoryBounds();
  const historyWindow = new BrowserWindow({
    ...initialBounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    movable: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: "Micheon pet messages",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  petHistoryWindow = historyWindow;
  keepPetSurfaceOnTop(historyWindow);
  // `will-move` is emitted for an interactive OS drag (not our setBounds
  // calls on Windows). The first real drag therefore detaches the panel, and
  // every later move in this open session preserves the user's chosen place.
  historyWindow.on("will-move", () => {
    if (
      petHistoryWindow === historyWindow
      && petHistoryShouldBeVisible
      && !petHistoryProgrammaticMove
    ) {
      petHistoryAttached = false;
    }
  });
  historyWindow.on("move", () => {
    if (petHistoryWindow === historyWindow) rememberPetHistoryBounds(historyWindow);
  });
  historyWindow.webContents.on("did-navigate", () => pinPetOverlayZoom(historyWindow.webContents));
  historyWindow.webContents.on("zoom-changed", () => pinPetOverlayZoom(historyWindow.webContents));
  historyWindow.webContents.on("did-finish-load", () => {
    if (petHistoryWindow !== historyWindow || historyWindow.isDestroyed()) return;
    pinPetOverlayZoom(historyWindow.webContents);
  });
  historyWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  historyWindow.on("closed", () => {
    if (petHistoryWindow !== historyWindow) return;
    clearPetHistoryDestroyTimer();
    petHistoryShouldBeVisible = false;
    petHistoryAttached = false;
    petHistoryProgrammaticMove = false;
    petHistoryWindow = null;
  });
  void historyWindow.loadURL(`http://localhost:${PORT}/?pet-history=1`).catch((error) => {
    console.error("[pet] unable to load message history:", error?.message ?? error);
  });
  return historyWindow;
}

function openPetHistoryWindow(anchorBounds) {
  const nextAnchor = normalizePetHistoryAnchorBounds(anchorBounds);
  if (nextAnchor) petHistoryAnchorBounds = nextAnchor;
  // Every click starts connected to the mascot. A prior detached position is
  // retained while that panel is open, but it must not make a later open look
  // like an unrelated floating window.
  petHistoryAttached = true;
  petHistoryShouldBeVisible = true;
  clearPetHistoryDestroyTimer();
  const historyWindow = createPetHistoryWindow();
  const reveal = () => {
    if (
      !petHistoryShouldBeVisible
      || petHistoryWindow !== historyWindow
      || historyWindow.isDestroyed()
    ) return;
    // Use the visible sprite bounds supplied by the overlay, rather than the
    // larger transparent compositor surface around it.
    const next = initialPetHistoryBounds({ attached: true });
    petHistoryBounds = next;
    setPetHistoryBounds(historyWindow, next);
    keepPetSurfaceOnTop(historyWindow, true);
    historyWindow.show();
    historyWindow.focus();
  };
  if (historyWindow.webContents.isLoading()) historyWindow.once("ready-to-show", reveal);
  else reveal();
}

function closePetHistoryWindow() {
  petHistoryShouldBeVisible = false;
  if (!petHistoryWindow || petHistoryWindow.isDestroyed()) return;
  rememberPetHistoryBounds();
  petHistoryWindow.hide();
  clearPetHistoryDestroyTimer();
  petHistoryDestroyTimer = setTimeout(() => {
    petHistoryDestroyTimer = null;
    if (
      petHistoryWindow
      && !petHistoryWindow.isDestroyed()
      && !petHistoryWindow.isVisible()
    ) {
      petHistoryWindow.destroy();
    }
  }, 1000);
  petHistoryDestroyTimer.unref?.();
}

function syncPetDesktopSurfaces() {
  syncPetOverlayBounds();
  syncPetHistoryBounds();
}

function setPetOverlayDisplayMode(mode) {
  const next = normalizePetDisplayMode(mode);
  petDisplayMode = next;

  for (const window of [mainWindow, petWindow, petHistoryWindow]) {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send("pet-overlay:display-mode", next);
  }

  if (next === "app") {
    setPetOverlayVisible(false);
    return;
  }

  // Switching into games mode must tear the forwarding hook down NOW, and
  // switching out must give the shaped mascot its input back — not wait for
  // the next shape update to happen to run.
  applyPetOverlayInputPolicy();
  keepPetSurfaceOnTop(petWindow, true);
  if (petHistoryShouldBeVisible) keepPetSurfaceOnTop(petHistoryWindow, true);
}

/**
 * Hold the mascot still while you are in something else.
 *
 * The pet has to stay ON SCREEN over a fullscreen game — hiding it is not
 * the answer — but a mascot that repaints keeps making the desktop compositor
 * redraw the screen over the top of the game, and that is the part of the
 * cost that is actually avoidable. The window has to stay where it is; the
 * animation does not.
 *
 * Micheon being the foreground app is the signal. It costs nothing, needs no
 * native module, and is right for the case that matters: while you are in a
 * game, Micheon is by definition not in front. The pet keeps its current
 * frame, so it is still visibly there.
 */
function broadcastPetAppFocus(focused) {
  petAppFocused = Boolean(focused);
  if (!petWindow || petWindow.isDestroyed() || petWindow.webContents.isDestroyed()) return;
  petWindow.webContents.send("pet-overlay:app-focused", petAppFocused);
}
let petAppFocused = true;

function setPetOverlayVisible(visible) {
  if (!visible || petDisplayMode === "app") {
    closePetHistoryWindow();
    finishPetOverlayDrag();
    finishPetOverlayGeometryTransition();
    clearPetOverlayLoadTimer();
    petWindow?.hide();
    clearPetOverlayDestroyTimer();
    petOverlayDestroyTimer = setTimeout(() => {
      petOverlayDestroyTimer = null;
      if (petWindow && !petWindow.isDestroyed() && !petWindow.isVisible()) {
        petWindow.destroy();
      }
    }, 1000);
    petOverlayDestroyTimer.unref?.();
    return;
  }
  clearPetOverlayDestroyTimer();
  const overlay = createPetOverlayWindow();
  // A prior renderer failure may have hit the transition safety path while the
  // window was hidden. Every explicit show starts from a visible opacity.
  if (!petOverlayPendingGeometryRevision) overlay.setOpacity(1);
  // A show is an explicit recovery request. If initial navigation or the
  // renderer failed previously, give it a fresh bounded retry budget instead
  // of repeatedly showing the same blank transparent window.
  if (!petOverlayLoaded) {
    clearPetOverlayLoadTimer();
    petOverlayLoadAttempts = 0;
    loadPetOverlay();
  }
  syncPetOverlayBounds();
  keepPetSurfaceOnTop(overlay);
  overlay.showInactive();
  keepPetSurfaceOnTop(overlay, true);
  // A hidden window runs no animation frames, so a hit-region sync scheduled
  // while hidden never completed and the overlay came back with no shape —
  // fully click-through, which looks exactly like the pet failing to appear.
  // Ask the renderer for fresh geometry every time the overlay is shown, and
  // drop the cached signature so the answer is definitely re-applied.
  petOverlayShapeSignature = null;
  const requestResync = () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.webContents.send("pet-overlay:resync");
  };
  // The permanent did-finish-load listener sends this after recovery. Sending
  // here as well is only needed for an already healthy renderer.
  if (petOverlayLoaded && !overlay.webContents.isLoading()) requestResync();
}

function eventCameFrom(event, window) {
  return Boolean(
    window
    && !window.isDestroyed()
    && event.sender.id === window.webContents.id
  );
}

async function createWindow() {
  // Boot the embedded web + TTS server first, then load it.
  await ensureServer();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    // Opens in the colour the learner last saw, so neither theme flashes the
    // other before the page paints.
    backgroundColor: getDesktopSettings().theme === "dark" ? "#0b0e13" : "#eff0ed",
    title: "Micheon",
    // Frameless: we draw our own title bar in the app (src/components/TitleBar.tsx)
    // for a clean, on-brand look like Discord/Slack.
    frame: false,
    icon: path.join(__dirname, "..", "dist", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  installTextContextMenu(mainWindow);
  installMainZoomHandlers(mainWindow.webContents);

  await mainWindow.loadURL(`http://localhost:${PORT}`);
  // Restore the saved zoom (and repair any stray per-origin level a pinch or
  // old install left behind — our stored ladder value is the authority).
  applyMainZoom(getDesktopSettings().zoomFactor);
  // The overlay is NOT created here. It uses a second lightweight renderer and
  // is created only when a pet is actually shown, so someone who never turns
  // one on never pays for it.

  // Tell the renderer when the window is maximized/restored so the title bar's
  // maximize button can show the correct icon.
  const sendMaxState = () =>
    mainWindow?.webContents.send("window:maximize-change", mainWindow.isMaximized());
  mainWindow.on("maximize", sendMaxState);
  mainWindow.on("unmaximize", sendMaxState);
  // The pet overlay has had this handler for months; the window the learner
  // actually works in did not, so a dead renderer meant a frozen app and no
  // evidence. Details go to renderer-crash.log in the profile folder, then
  // the window reloads — progress is written after every answer, so a reload
  // costs at most the exercise on screen.
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    try {
      fs.appendFileSync(
        path.join(app.getPath("userData"), "renderer-crash.log"),
        `${new Date().toISOString()} renderer gone: ${JSON.stringify(details)}\n`
      );
    } catch { /* the reload matters more than the log line */ }
    if (mainWindow && !mainWindow.isDestroyed() && details?.reason !== "clean-exit") {
      mainWindow.webContents.reload();
    }
  });
  mainWindow.webContents.on("unresponsive", () => {
    try {
      fs.appendFileSync(
        path.join(app.getPath("userData"), "renderer-crash.log"),
        `${new Date().toISOString()} renderer unresponsive\n`
      );
    } catch { /* observation only — never make it worse */ }
  });
  mainWindow.on("blur", reassertPetSurfacesAfterAppDeactivation);
  mainWindow.on("minimize", reassertPetSurfacesAfterAppDeactivation);
  mainWindow.on("close", (event) => {
    if (appIsQuitting || getDesktopSettings().closeBehavior !== "tray") return;
    event.preventDefault();
    ensureTray();
    mainWindow.hide();
  });

  // Open external links (http/https to other sites) in the user's real browser
  // instead of inside the app window. Nothing else opens a window: the app
  // never asks for one, and allowing the rest let file: and data: pages open
  // with the app's own session.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    clearListenMediaControls();
    mainWindow = null;
    clearPetHistoryDestroyTimer();
    if (petHistoryWindow && !petHistoryWindow.isDestroyed()) petHistoryWindow.destroy();
    if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  });
}

// ── Auto-update ──────────────────────────────────────────────────────────
// Checks the GitHub releases feed on launch (and hourly). When a newer version
// is published, it downloads it in the background and installs it silently the
// next time the app quits — so the user never re-downloads or reinstalls by
// hand. Only runs in the packaged app; a dev run has no update feed.
/**
 * What the updater last did, so the renderer can be told at any point.
 *
 * The "update downloaded" toast used to be the only signal, and it fires once.
 * Miss it — because the download finished before you opened the window, or you
 * dismissed it, or you restarted — and there is no way left to find out that an
 * update is sitting there waiting, or that the app checked at all. Keeping the
 * last result means the answer is always available on request.
 */
let updateStatus = {
  state: "idle",
  version: null,
  checkedAt: null,
  percent: null,
  transferred: null,
  total: null,
  bytesPerSecond: null,
};

function setUpdateStatus(state, version, details = {}) {
  const downloading = state === "downloading";
  const ready = state === "ready";
  const percent = Number(details.percent);
  updateStatus = {
    state,
    version: version ?? (downloading || ready ? updateStatus.version : null),
    checkedAt: downloading && updateStatus.checkedAt ? updateStatus.checkedAt : Date.now(),
    percent: ready
      ? 100
      : downloading
        ? Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : (updateStatus.percent ?? 0)))
        : null,
    transferred: downloading ? (Number(details.transferred) || updateStatus.transferred || 0) : null,
    total: downloading ? (Number(details.total) || updateStatus.total || 0) : null,
    bytesPerSecond: downloading ? (Number(details.bytesPerSecond) || 0) : null,
  };
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("update:status", updateStatus);
  }
}

/** Is the updater currently asked to keep quiet? */
function updateSnoozeActive() {
  const until = Number(getDesktopSettings().updateSnoozeUntil) || 0;
  return until > Date.now();
}

/**
 * Downloading without being asked is the part a postponed update must not do
 * — on a metered connection it is the whole cost. "auto" keeps today's
 * behaviour; the other modes wait to be told.
 */
function applyUpdatePreferences() {
  const { updateMode } = getDesktopSettings();
  const automatic = updateMode === "auto" && !updateSnoozeActive();
  autoUpdater.autoDownload = automatic;
  autoUpdater.autoInstallOnAppQuit = automatic;
  return automatic;
}

let autoUpdateStarted = false;

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  // A failed first window starts it early (see openMainWindowOrExplain), and
  // the listeners and timers below must exist once.
  if (autoUpdateStarted) return;
  autoUpdateStarted = true;
  applyUpdatePreferences();
  // Full downloads only. Differential updates need the .blockmap files, and the
  // release workflow deliberately does not upload them (they stalled on this
  // installer — see release.yml), so every update attempted a block-map fetch
  // that could only fail before falling back to the full download anyway.
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err?.message ?? err);
    setUpdateStatus("error");
  });
  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for updates…");
    setUpdateStatus("checking");
  });
  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update available:", info.version);
    setUpdateStatus("downloading", info.version, { percent: 0 });
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[updater] already up to date");
    setUpdateStatus("current");
  });
  autoUpdater.on("download-progress", (p) => {
    console.log(`[updater] downloading ${Math.round(p.percent)}%`);
    setUpdateStatus("downloading", updateStatus.version, {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    console.log("[updater] update downloaded:", info.version, "— will install on quit");
    setUpdateStatus("ready", info.version);
    // Let the app show a subtle "Update ready, restart to apply" hint if it wants.
    mainWindow?.webContents.send("update:downloaded", info.version);
  });

  // Micheon owns the complete visible update experience in the renderer. Using
  // checkForUpdatesAndNotify here would add an OS notification that cannot
  // follow the app theme and would duplicate the in-app progress panel.
  /**
   * The launch straight after an update does not ask for another one.
   *
   * Installing restarts the app, and the new copy's first act was to ask the
   * feed what was available. Releases here land several times a day, so the
   * answer was often "another one" — and finishing an update by being handed
   * the next update reads as the app updating twice for nothing. The version
   * that was running last time is on record, so the app can tell an ordinary
   * launch from the one that follows an install, and leave that first check
   * to the fifteen-minute timer.
   */
  const runningVersion = app.getVersion();
  const justUpdated = Boolean(getDesktopSettings().lastRunVersion)
    && getDesktopSettings().lastRunVersion !== runningVersion;
  saveDesktopSettings({ lastRunVersion: runningVersion });
  if (justUpdated) {
    console.log(`[updater] just updated to ${runningVersion} — leaving the first check to the timer`);
    setUpdateStatus("current", runningVersion);
  }
  if (!justUpdated && getDesktopSettings().updateMode !== "manual" && !updateSnoozeActive()) {
    autoUpdater.checkForUpdates().catch((e) => console.error("[updater] check failed:", e?.message ?? e));
  }
  // Re-check periodically for long-running sessions. Fifteen minutes rather than
  // an hour: the app is left open for hours at a time, and waiting up to a full
  // hour to even notice a release is what makes it look as though nothing is
  // happening. The check is one small request against the releases feed.
  const updateTimer = setInterval(() => {
    // Do not keep polling/downloading metadata after an update is already being
    // handled. The next app launch installs it and starts a fresh schedule.
    if (["checking", "downloading", "ready"].includes(updateStatus.state)) return;
    // Postponed, or set to manual: stay out of the way until asked. A snooze
    // that has expired simply stops matching here, so the next tick resumes.
    if (getDesktopSettings().updateMode === "manual" || updateSnoozeActive()) return;
    applyUpdatePreferences();
    autoUpdater.checkForUpdates().catch(() => {});
  }, 15 * 60 * 1000);
  updateTimer.unref?.();
}

/** The renderer asking directly — "check now", and what happened last time. */
/**
 * Catalogue search, answered from an index instead of by reading everything.
 *
 * The tracker used to walk all 16,308 sentences in JavaScript on every query,
 * after spending ~770ms building a search string for each one. Measured
 * against the same queries, SQLite's FTS5 answers them about 55 times faster
 * — 0.4ms against 28ms — and needs no warm-up at all, because the index is
 * built once at build time and shipped.
 *
 * node:sqlite is built into the Node that Electron 43 ships, so this adds no
 * native module and no rebuild step. Verified against the packaged app rather
 * than assumed: Electron 43.2.0 reports Node 24.18.0 with FTS5 present.
 *
 * The renderer cannot open the file itself — it has no filesystem — so the
 * query crosses to here and only the matching rows go back.
 */
let catalogueDb = null;
let catalogueDbFailed = false;

function catalogueDbPath() {
  // Packaged, the database is unpacked beside the asar because SQLite opens a
  // real path and an asar entry is not one. In development it sits in dist/.
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "dist", "catalogue.db")
    : path.join(__dirname, "..", "dist", "catalogue.db");
}

function openCatalogueDb() {
  if (catalogueDb || catalogueDbFailed) return catalogueDb;
  try {
    const file = catalogueDbPath();
    if (!fs.existsSync(file)) throw new Error(`no catalogue database at ${file}`);
    // This file is ESM; node:sqlite is a built-in with no ESM named export
    // in this runtime, so it comes in through a real require.
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
    catalogueDb = new DatabaseSync(file, { readOnly: true });
    return catalogueDb;
  } catch (error) {
    // Never fatal. The renderer keeps its own search and simply uses it.
    catalogueDbFailed = true;
    console.warn("catalogue database unavailable, falling back to in-memory search:", error?.message);
    return null;
  }
}

/**
 * FTS5 wants its own query syntax, and a search box hands us whatever the
 * learner typed. Quoting each word defuses the operators (AND, OR, NEAR, *, ")
 * so a stray character cannot become a syntax error, and the trailing star
 * keeps "versich" matching "Versicherung" the way a search box should.
 */
function toFtsQuery(raw) {
  const words = String(raw ?? "")
    .replace(/["*()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!words.length) return null;
  return words.map((word) => `"${word}"*`).join(" ");
}

ipcMain.handle("catalogue:search", (event, query) => {
  const db = openCatalogueDb();
  if (!db) return null;                    // null means "use your own search"
  const match = toFtsQuery(query);
  if (!match) return [];
  try {
    // Every match, not a page of them. The tracker counts what it found
    // ("172 of 16,308 items") and sorts the results itself, so a capped
    // result set would quietly report the wrong number and hide rows behind
    // a limit nobody could see. Ids only — a few hundred KB at the very
    // worst, against re-sending the catalogue.
    return db
      .prepare(
        `SELECT i.id FROM item_fts f JOIN item i ON i.id = f.id WHERE item_fts MATCH ?`
      )
      .all(match);
  } catch (error) {
    console.warn("catalogue search failed:", error?.message);
    return null;
  }
});

ipcMain.handle("update:get-status", () => {
  const settings = getDesktopSettings();
  return {
    ...updateStatus,
    currentVersion: app.getVersion(),
    supported: app.isPackaged,
    updateMode: settings.updateMode,
    snoozedUntil: updateSnoozeActive() ? settings.updateSnoozeUntil : 0,
    noticesHidden: settings.updateNoticesHidden === true,
  };
});

ipcMain.handle("update:set-preferences", (event, preferences) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted update request");
  const next = {};
  if (["auto", "ask", "manual"].includes(preferences?.updateMode)) {
    next.updateMode = preferences.updateMode;
  }
  if (preferences?.snoozeHours != null) {
    const hours = Math.max(0, Math.min(30 * 24, Number(preferences.snoozeHours) || 0));
    next.updateSnoozeUntil = hours > 0 ? Date.now() + hours * 60 * 60 * 1000 : 0;
  }
  if (typeof preferences?.noticesHidden === "boolean") {
    next.updateNoticesHidden = preferences.noticesHidden;
  }
  saveDesktopSettings(next);
  applyUpdatePreferences();
  const settings = getDesktopSettings();
  return {
    ...updateStatus,
    currentVersion: app.getVersion(),
    supported: app.isPackaged,
    updateMode: settings.updateMode,
    snoozedUntil: updateSnoozeActive() ? settings.updateSnoozeUntil : 0,
    noticesHidden: settings.updateNoticesHidden === true,
  };
});

/** "Download it now" — the escape hatch for ask/manual and for a snooze. */
ipcMain.handle("update:download-now", (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted update request");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  return autoUpdater.downloadUpdate().then(() => true).catch((e) => {
    console.error("[updater] manual download failed:", e?.message ?? e);
    return false;
  });
});

ipcMain.handle("update:check-now", async () => {
  if (!app.isPackaged) {
    return { state: "unsupported", currentVersion: app.getVersion(), supported: false };
  }
  // A transfer already running, or one already finished and waiting for the
  // restart, is not something to start again.
  //
  // Automatic mode leaves autoDownload on, so a check does not just ask the
  // feed a question — it hands whatever it finds straight to the downloader.
  // Ask "am I up to date?" while the background download is running, or after
  // it has finished, and the same version downloads a second time: the bar
  // fills, reaches the end, and starts again from nothing. The honest answer
  // to the question is the state already held here, so it is given without
  // touching the feed. The periodic check has always skipped these two states
  // for the same reason; only the button somebody presses did not.
  if (updateStatus.state === "downloading" || updateStatus.state === "ready") {
    return { ...updateStatus, currentVersion: app.getVersion(), supported: true };
  }
  try {
    setUpdateStatus("checking");
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("[updater] manual check failed:", error?.message ?? error);
    setUpdateStatus("error");
  }
  return { ...updateStatus, currentVersion: app.getVersion(), supported: true };
});

// The renderer owns the visible, branded restart transition. Once it is on
// screen, run NSIS silently so Windows' generic white/green installer never
// replaces Micheon's update experience, then reopen the app when it finishes.
ipcMain.on("update:install-now", () => {
  autoUpdater.quitAndInstall(true, true);
});

// Window-control IPC from the custom title bar.
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

ipcMain.on("listen-media:set-state", (event, state) => {
  if (!eventCameFrom(event, mainWindow)) return;
  listenMediaState = {
    available: state?.available === true,
    playing: state?.available === true && state?.playing === true,
    subtitle: typeof state?.subtitle === "string" ? state.subtitle.slice(0, 240) : "",
    title: typeof state?.title === "string" ? state.title.slice(0, 240) : "",
  };
  syncListenMediaControls();
  // Let the browser extension know, so its hover pronunciation stays quiet
  // while Listen is speaking rather than the two voices overlapping.
  setListenPlaying(listenMediaState.playing);
});
/**
 * How much room Micheon takes on disk.
 *
 * Split so the numbers mean something: the INSTALL is the program and the
 * German course compiled into it, which nothing in the app can remove; the
 * CACHE is what Chromium has accumulated and is safe to clear; SAVED is the
 * profile store. Directory walks are bounded — a runaway symlink or a huge
 * cache should not freeze the settings screen while it counts.
 */
function directorySize(dir, budgetMs = 400, deadline = Date.now() + budgetMs) {
  let total = 0;
  let stack = [dir];
  while (stack.length) {
    if (Date.now() > deadline) return { bytes: total, complete: false };
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { stack.push(full); continue; }
      try { total += fs.statSync(full).size; } catch { /* vanished mid-walk */ }
    }
  }
  return { bytes: total, complete: true };
}

ipcMain.handle("storage:get-usage", (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted storage request");
  const userData = app.getPath("userData");
  const install = directorySize(path.dirname(app.getAppPath()));
  const cache = directorySize(path.join(userData, "Cache"));
  const saved = directorySize(userData);
  return {
    installBytes: install.bytes,
    installComplete: install.complete,
    cacheBytes: cache.bytes,
    savedBytes: Math.max(0, saved.bytes - cache.bytes),
    version: app.getVersion(),
  };
});

/** Clear the browser cache. Never touches the profile store. */
ipcMain.handle("storage:clear-cache", async (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted storage request");
  try {
    await session.defaultSession.clearCache();
    return true;
  } catch (e) {
    console.error("[storage] clear cache failed:", e?.message ?? e);
    return false;
  }
});

// No browser lets a downloaded file silently install itself as an
// extension -- that gate exists specifically so a download can't do this,
// and there's no way around it that isn't the extension's own store review.
// What this CAN remove is the manual unzip: it copies the bundled,
// already-unpacked extension straight to a stable folder and opens it in
// Explorer, so the only steps left are the browser's own (Developer mode,
// Load unpacked). Re-copies every time so an app update to the extension
// never leaves a stale folder behind.
// Deletes files under `folder` that no longer exist in `source`, so an
// update can drop a file without the delete-everything-first approach
// below refuses to take.
function pruneRemovedFiles(source, folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const here = path.join(folder, entry.name);
    const there = path.join(source, entry.name);
    if (!fs.existsSync(there)) {
      fs.rmSync(here, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      pruneRemovedFiles(there, here);
    }
  }
}

function extensionSourceFolder() {
  // fs.cpSync can't walk a folder that's still packed inside app.asar --
  // it needs the real files asarUnpack puts alongside it in
  // app.asar.unpacked, not the virtual in-archive path used everywhere
  // else in this file for simple reads.
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "dist", "micheon-immersion-extension")
    : path.join(__dirname, "..", "dist", "micheon-immersion-extension");
}

function extensionDestinationFolder() {
  return path.join(app.getPath("documents"), "Micheon Immersion Extension");
}

function extensionVersion(folder) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8"));
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

function extensionInfo() {
  const source = extensionSourceFolder();
  const destination = extensionDestinationFolder();
  return {
    bundledVersion: extensionVersion(source),
    copiedVersion: extensionVersion(destination),
    path: destination,
  };
}

function copyExtensionFolder() {
  const source = extensionSourceFolder();
  if (!fs.existsSync(source)) throw new Error("bundled extension is missing from this build");
  const destination = extensionDestinationFolder();
  const previousVersion = extensionVersion(destination);
  // Overwrite in place, never delete-then-recreate. By the second time a
  // learner presses this button their browser already has THIS path loaded
  // as an unpacked extension, and removing the directory (manifest.json
  // included, however briefly) is how a browser decides the extension is
  // gone: it unloads it, new pages stop being glossed entirely, and pages
  // already open keep running the old copy -- which reads exactly like
  // "the update did nothing and now it's broken".
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { force: true, recursive: true });
  pruneRemovedFiles(source, destination);
  const version = extensionVersion(destination);
  if (!version) throw new Error("copied extension manifest is missing or invalid");
  return {
    path: destination,
    version,
    previousVersion,
    updated: Boolean(previousVersion && previousVersion !== version),
  };
}

// The Chromium browsers this machine might have, with every install home
// each of them actually uses (Brave in particular ships stable, beta and
// nightly under different folder names). First existing path wins.
const KNOWN_BROWSERS = [
  {
    id: "chrome",
    name: "Google Chrome",
    address: "chrome://extensions",
    paths: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(app.getPath("home"), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    ],
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    address: "edge://extensions",
    paths: [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
  },
  {
    id: "brave",
    name: "Brave",
    address: "brave://extensions",
    paths: [
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "C:\\Program Files\\BraveSoftware\\Brave-Browser-Nightly\\Application\\brave.exe",
      "C:\\Program Files\\BraveSoftware\\Brave-Browser-Beta\\Application\\brave.exe",
      "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      path.join(app.getPath("home"), "AppData", "Local", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    ],
  },
];

function installedBrowsers() {
  return KNOWN_BROWSERS
    .map((b) => ({ ...b, exe: b.paths.find((p) => fs.existsSync(p)) }))
    .filter((b) => b.exe);
}

ipcMain.handle("extension:browsers", (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted extension request");
  return installedBrowsers().map(({ id, name }) => ({ id, name }));
});

ipcMain.handle("extension:info", (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted extension request");
  return extensionInfo();
});

ipcMain.handle("extension:install", (event, browserId) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted extension request");
  try {
    const copied = copyExtensionFolder();
    // With a browser chosen, do everything a browser will allow from the
    // outside: launch it and put its extensions-page address in the
    // clipboard ready to paste. Chromium refuses scheme://extensions as a
    // command-line URL (verified against current Chrome, Edge and Brave --
    // each just opens its new-tab page), and no browser lets an external
    // program install the extension outright, so the last clicks stay in
    // the browser by design.
    const browser = browserId ? installedBrowsers().find((b) => b.id === browserId) : null;
    if (browser) {
      clipboard.writeText(browser.address);
      spawn(browser.exe, [], { detached: true, stdio: "ignore" }).unref();
    }
    shell.showItemInFolder(path.join(copied.path, "manifest.json"));
    return { ok: true, ...copied, address: browser?.address ?? null };
  } catch (e) {
    console.error("[extension] install failed:", e?.message ?? e);
    return {
      ok: false,
      path: null,
      address: null,
      version: null,
      previousVersion: null,
      updated: false,
    };
  }
});

ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

ipcMain.handle("windows-settings:get", (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted settings request");
  return windowsSettingsSnapshot();
});

ipcMain.handle("windows-settings:set-launch-at-login", (event, enabled) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted settings request");
  if (process.platform !== "win32" || !app.isPackaged) {
    throw new Error("Windows startup is only available in the installed app");
  }
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  return windowsSettingsSnapshot();
});

ipcMain.handle("windows-settings:set-close-behavior", (event, closeBehavior) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted settings request");
  saveDesktopSettings({ closeBehavior });
  return windowsSettingsSnapshot();
});

ipcMain.handle("windows-settings:set-theme", (event, theme) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted settings request");
  saveDesktopSettings({ theme: theme === "dark" ? "dark" : "light" });
  return windowsSettingsSnapshot();
});

ipcMain.handle("zoom:get", (event) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted zoom request");
  return currentMainZoom();
});

ipcMain.handle("zoom:set", (event, factor) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted zoom request");
  return applyMainZoom(factor);
});

ipcMain.handle("zoom:step", (event, direction) => {
  if (!eventCameFrom(event, mainWindow)) throw new Error("Untrusted zoom request");
  return stepMainZoom(Number(direction) > 0 ? 1 : -1);
});

ipcMain.on("pet-overlay:set-display-mode", (event, mode) => {
  const trustedSender = eventCameFrom(event, mainWindow) || eventCameFrom(event, petWindow);
  if (!trustedSender) return;
  setPetOverlayDisplayMode(mode);
});

ipcMain.on("pet-overlay:set-visible", (event, visible) => {
  const trustedSender = eventCameFrom(event, mainWindow) || eventCameFrom(event, petWindow);
  if (!trustedSender) return;
  setPetOverlayVisible(Boolean(visible));
});

ipcMain.on("pet-history:open", (event, mascotBounds) => {
  const trustedSender = eventCameFrom(event, mainWindow) || eventCameFrom(event, petWindow);
  if (!trustedSender) return;
  openPetHistoryWindow(mascotBounds);
});

ipcMain.on("pet-history:close", (event) => {
  if (!eventCameFrom(event, petHistoryWindow)) return;
  closePetHistoryWindow();
});

ipcMain.on("pet-overlay:set-history-anchor", (event, mascotBounds) => {
  if (!eventCameFrom(event, petWindow)) return;
  const next = normalizePetHistoryAnchorBounds(mascotBounds);
  if (!next) return;
  petHistoryAnchorBounds = next;
  syncAttachedPetHistoryBounds();
});

ipcMain.on("pet-overlay:set-interactive", (event, interactive) => {
  if (!eventCameFrom(event, petWindow) || !petWindow || petWindow.isDestroyed()) return;
  // Watch-only over games: the renderer cannot re-arm the forwarding hook or
  // claim input while a game may be running underneath. See the input policy.
  if (petDisplayMode === "games") return;
  // Windows-shaped overlays own input only over the mascot UI and therefore do
  // not need the fragile mousemove-driven click-through toggle.
  if (petOverlayUsesShape) return;
  petWindow.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on("pet-overlay:get-geometry", (event) => {
  if (!eventCameFrom(event, petWindow)) {
    event.returnValue = null;
    return;
  }
  event.returnValue = currentPetOverlayGeometry();
});

ipcMain.on("pet-overlay:geometry-applied", (event, revision) => {
  if (!eventCameFrom(event, petWindow)) return;
  const appliedRevision = Number(revision);
  if (!Number.isInteger(appliedRevision) || appliedRevision <= 0) return;
  finishPetOverlayGeometryTransition(appliedRevision);
});

ipcMain.on("pet-overlay:set-hit-regions", (event, payload) => {
  if (!eventCameFrom(event, petWindow) || !petWindow || petWindow.isDestroyed()) return;
  if (process.platform !== "win32" && process.platform !== "linux") return;
  // Zooming the MAIN window re-zooms this one too — same origin — but silently:
  // the level arrives through Chromium's per-origin zoom map, so no
  // zoom-changed fires here to undo it. Every zoom does force a relayout and
  // therefore a fresh measurement, which makes this the one path that sees it.
  // The check is a number comparison, so paying it per sync costs nothing.
  pinPetOverlayZoom(petWindow.webContents);
  const regions = Array.isArray(payload) ? payload : payload?.regions;
  const rendererOrigin = Array.isArray(payload) ? undefined : payload?.origin;
  if (!Array.isArray(regions) || regions.length === 0) return;

  const desktopBounds = petOverlayDragDesktopBounds ?? virtualDesktopBounds();
  const maximumCoordinate = Math.max(desktopBounds.width, desktopBounds.height) * 2;
  const rawRegions = regions
    .slice(0, 32)
    .map((region) => {
      const rawX = Number(region?.x);
      const rawY = Number(region?.y);
      const rawWidth = Number(region?.width);
      const rawHeight = Number(region?.height);
      if (
        !Number.isFinite(rawX)
        || !Number.isFinite(rawY)
        || !Number.isFinite(rawWidth)
        || !Number.isFinite(rawHeight)
        || Math.abs(rawX) > maximumCoordinate
        || Math.abs(rawY) > maximumCoordinate
      ) return null;

      const x = Math.floor(rawX);
      const y = Math.floor(rawY);
      const right = Math.ceil(rawX + Math.min(rawWidth, desktopBounds.width));
      const bottom = Math.ceil(rawY + Math.min(rawHeight, desktopBounds.height));
      if (right <= x || bottom <= y) return null;
      return { x, y, width: right - x, height: bottom - y };
    })
    .filter(Boolean);

  if (rawRegions.length === 0) return;
  const safeRegions = compactPetOverlayToRegions(rawRegions, rendererOrigin, desktopBounds);
  if (safeRegions.length === 0) return;
  petOverlayHitRegions = safeRegions;
  // Pixels outside these rectangles are neither drawn nor interactive. During
  // a drag, the compact window itself is the temporary local hit region.
  if (petOverlayDragging) applyPetOverlayDragShape();
  else applyPetOverlayShape(safeRegions);
});

ipcMain.on("pet-overlay:begin-drag", (event) => {
  if (!eventCameFrom(event, petWindow) || !petWindow || petWindow.isDestroyed()) {
    event.returnValue = { reason: "untrusted-sender", started: false };
    return;
  }
  if (process.platform !== "win32" && process.platform !== "linux") {
    event.returnValue = { started: true };
    return;
  }
  // Keep an enlarged local region alive, poll the native cursor, and move the
  // compact window with the mascot during the drag.
  try {
    petOverlayDragDesktopBounds = virtualDesktopBounds();
    petOverlayDragging = true;
    // Take the whole desktop for the duration of the gesture. The compact
    // window had to chase the cursor to stay under the mascot, and every one of
    // those moves changed the coordinate origin the renderer draws against. It
    // also fenced the pet: it could not be dragged past the window's own edge
    // before that window had caught up. One resize here, one at the end.
    expandPetOverlayForDrag();
    // Apply the full compact-window drag region NOW, synchronously, before this call
    // returns to the renderer. The pointer has not been established over the
    // new shape yet, so nothing can be disturbed by the change — whereas the
    // old flow reshaped one frame INTO the drag, under an active pointer,
    // which is the kind of SetWindowRgn-mid-gesture that can end it. It also
    // means later renderer region updates reuse one identical shape instead of
    // reshaping while the pointer is held.
    applyPetOverlayDragShape();
    const point = startPetOverlayCursorTracking();
    startPetOverlayDragWatchdog();
    event.returnValue = {
      geometry: currentPetOverlayGeometry(),
      screenX: point?.screenX,
      screenY: point?.screenY,
      started: true,
      x: point?.x,
      y: point?.y,
    };
  } catch (error) {
    petOverlayDragging = false;
    petOverlayDragDesktopBounds = null;
    stopPetOverlayCursorTracking();
    finishPetOverlayGeometryTransition();
    // The collar may already be applied; a failed drag must not leave it
    // behind as an oversized invisible hit area.
    petOverlayShapeSignature = null;
    restorePetOverlayShape();
    console.error("[pet] unable to begin drag:", error?.message ?? error);
    event.returnValue = { reason: "native-drag-failed", started: false };
  }
});

ipcMain.on("pet-overlay:end-drag", (event) => {
  if (!eventCameFrom(event, petWindow)) return;
  finishPetOverlayDrag();
});

ipcMain.on("pet-overlay:set-keyboard-interactive", (event, interactive) => {
  if (!eventCameFrom(event, petWindow) || !petWindow || petWindow.isDestroyed()) return;
  const enabled = Boolean(interactive);
  petWindow.setFocusable(enabled);
  if (enabled) petWindow.focus();
});

ipcMain.on("pet-overlay:wheel", (event, deltaX, deltaY) => {
  if (!eventCameFrom(event, petWindow) || !mainWindow || mainWindow.isDestroyed()) return;
  const dx = Number(deltaX);
  const dy = Number(deltaY);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  mainWindow.webContents.send(
    "pet-overlay:wheel",
    Math.max(-1600, Math.min(1600, dx)),
    Math.max(-1600, Math.min(1600, dy))
  );
});

ipcMain.on("pet-overlay:speak", (event, payload) => {
  const trustedSender = eventCameFrom(event, mainWindow)
    || eventCameFrom(event, petHistoryWindow);
  if (!trustedSender || !petWindow || petWindow.isDestroyed()) return;
  const message = payload?.message;
  if (!message || typeof message.id !== "string" || typeof message.text !== "string") return;
  const text = message.text.trim().slice(0, 240);
  const id = message.id.trim().slice(0, 96);
  if (!id || !text) return;
  const durationMs = Number(payload.options?.durationMs);
  const question = message.question;
  petWindow.webContents.send("pet-overlay:speech", {
    message: {
      createdAt: Number.isFinite(Number(message.createdAt)) ? Number(message.createdAt) : Date.now(),
      id,
      mood: typeof message.mood === "string" ? message.mood : "greeting",
      silent: message.silent === true,
      question: question && typeof question.itemId === "string"
        ? {
            aliases: Array.isArray(question.aliases)
              ? question.aliases.filter((value) => typeof value === "string").slice(0, 12)
              : [],
            answerLanguage: question.answerLanguage === "en" ? "en" : "de",
            confirm: question.confirm === true,
            de: typeof question.de === "string" ? question.de.slice(0, 180) : "",
            en: typeof question.en === "string" ? question.en.slice(0, 180) : "",
            itemId: question.itemId.slice(0, 180),
            recallSequence: Number.isSafeInteger(Number(question.recallSequence))
              && Number(question.recallSequence) > 0
              ? Number(question.recallSequence)
              : undefined,
          }
        : undefined,
      text,
      voiceLang: message.voiceLang === "de-DE"
        ? "de-DE"
        : message.voiceLang === "en-US"
          ? "en-US"
          : undefined,
    },
    options: {
      durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    },
  });
});

/**
 * Open the main window, or say why it cannot be opened.
 *
 * The window loads from the embedded server, so if port 41730 is taken the
 * server cannot start and createWindow throws. That used to end the startup
 * there: no window, no message, a process sitting invisible in the
 * background — and setupAutoUpdate, further down, never ran, so the one
 * channel that could deliver a fix was off too. The updater now starts
 * before the learner is asked what to do.
 */
async function openMainWindowOrExplain() {
  for (;;) {
    try {
      await createWindow();
      return true;
    } catch (error) {
      console.error("[startup] the main window could not open:", error);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      mainWindow = null;
      setupAutoUpdate();
      const busy = error?.code === "EADDRINUSE" || error?.code === "EACCES";
      const { response } = await dialog.showMessageBox({
        type: "error",
        title: "Micheon",
        message: "Micheon could not start.",
        detail: busy
          ? `Another program is using port ${PORT}, which Micheon needs for its lessons and voices. Close that program, then try again.`
          : String(error?.message ?? error),
        buttons: ["Try again", "Quit"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      console.log(`[startup] the learner chose ${response === 0 ? "to try again" : "to quit"}`);
      if (response !== 0) {
        app.quit();
        return false;
      }
    }
  }
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    installPermissionPolicy();
    if (!(await openMainWindowOrExplain())) return;
    // Works from inside a fullscreen game, which is the only place it helps.
    // The mascot holds still while another app is in front — see
    // broadcastPetAppFocus. blur/focus fire for every Micheon window, and the
    // overlay itself is focusable:false, so this only ever tracks real windows.
    app.on("browser-window-focus", () => broadcastPetAppFocus(true));
    app.on("browser-window-blur", () => {
      // A blur with nothing of ours focused means the user left for another
      // app; a blur that immediately precedes another of our windows focusing
      // is just a hand-off between them.
      setTimeout(() => broadcastPetAppFocus(Boolean(BrowserWindow.getFocusedWindow())), 120);
    });
    screen.on("display-added", syncPetDesktopSurfaces);
    screen.on("display-removed", syncPetDesktopSurfaces);
    screen.on("display-metrics-changed", syncPetDesktopSurfaces);
    setupAutoUpdate();
    // Speaking practice is a standard part of the desktop app. Start the
    // verified whisper.cpp/model download in the background on every launch;
    // the manager is a no-op once both files are ready, or after the learner
    // has explicitly chosen Uninstall in Settings.
    // Speech recognition was removed in 1.2.239. Anyone who ran a build
    // between 1.2.235 and 1.2.238 has a 574 MB model sitting in their profile
    // that nothing will ever read again, so it is cleared out once here.
    void (async () => {
      try {
        const leftover = path.join(app.getPath("userData"), "speech-recognition");
        await fs.promises.rm(leftover, { recursive: true, force: true });
      } catch { /* already gone, or in use — it can wait for the next launch */ }
    })();
  });
}

app.on("before-quit", () => {
  appIsQuitting = true;
  savePetOverlayBounds();
  clearListenMediaControls();
  destroyTray();
});

// macOS: re-create a window when the dock icon is clicked and none are open.
app.on("activate", () => {
  if (!hasSingleInstanceLock) return;
  if (mainWindow && !mainWindow.isDestroyed()) showMainWindow();
  else if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Quit when all windows are closed, except on macOS where apps stay alive.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
