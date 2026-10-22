export const PROFILE_STORAGE_KEY = "german-arena-profile";
export const AUTH_USER_KEY = "german-arena-auth";
export const SIGNED_OUT_KEY = "german-arena-signed-out";
export const KNOWN_PROFILES_KEY = "german-arena-known-profiles";
const SHARED_SYNC_PREFIXES = [
  "german-arena-",
  "active-part:",
  "german-lab-placement-done:",
  "german-lab-placement-result:",
  "session-completed:",
  "totalXp:",
  "sessionsCompleted:",
  "totalReviews:",
  "streak:",
  "streak-last-day:",
  "externalWords:",
  "activity-log:",
  "course-progress:",
  "active-course:",
  "english-variant:",
  "gl-",
  "vocab-mastery",
  "germ-mastery-set",
  "german-lab-review-state",
  "progress-seen-words",
  "falling-hs",
  "hole-hs",
  "snake-hs",
  "verbshooter-hs",
  "minesweeper-hs",
  "slither-hs",
  "whack-hs",
  "dashboardLayout",
  "dashboardHidden",
  "germ-notifications-muted",
  "german-lab-h5p",
];

// These belonged to the retired alternate-theme/custom-colour system. Keep
// the keys explicit during migration so an older shared profile cannot restore
// Butter, Lingo, Astryx, or inline colour overrides after the app updates.
const DEPRECATED_SHARED_KEYS = new Set([
  "gl-theme-preset",
  "gl-custom-theme",
]);

// Who is signed in stays on this device.
//
// It used to travel: the key starts with "german-arena-", so the session went
// through the same mirror as the progress and the desktop build and the web
// build kept handing each other whichever account had signed in last. The
// mirror is re-read on load AND on every window focus, so a second profile in
// the browser did not survive a click back into the window - signing in with
// a different address made no difference, because the address was never what
// was being restored.
//
// The learning data still travels, and it is stored per profile, so two
// accounts on one device keep their own progress either way. Only the session
// itself is local now, which is what makes them two accounts at all.
const SESSION_LOCAL_KEYS = new Set([AUTH_USER_KEY, SIGNED_OUT_KEY]);

// What the surface looks like stays on that surface.
//
// The accent and the hand-picked part colours are global keys — nothing scopes
// them to a profile — and they start with "gl-", so they travelled through the
// mirror alongside the progress. That is one colour for the desktop app and
// the browser together, and the tie is broken by a merge that cannot see
// individual keys: readSharedStorage in server/index.js compares one timestamp
// per FILE and then applies that whole file over the other. The packaged app
// writes only the AppData copy, so while it is open its copy is always the
// newer one. Every load of the web build pulled the app's accent back over
// whatever had been chosen in the browser, which meant the colour could not be
// changed there at all — it reverted on the next reload, every time.
//
// The learning data still travels. Only the paint is local now, which is what
// lets one machine run the app in one colour and the browser in another.
const APPEARANCE_LOCAL_KEYS = new Set(["gl-accent-colour", "gl-custom-colours"]);

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  avatar?: string;
  externalWordsLearned: number;
}

function slugify(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildProfileId(name: string, email: string) {
  const n = slugify(name);
  const e = slugify(email);
  return [n, e].filter(Boolean).join("--") || "anonymous";
}

function readKnownProfiles(): Record<string, UserProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KNOWN_PROFILES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Remember a profile keyed by its email so signing back in with the same email
 * reconnects to the exact same account — same id, so the same scoped progress.
 * Progress lives under the profile id, so a stable id per email is what keeps
 * "my progress lives on my email" true across sign-outs and re-logins.
 */
export function recordKnownProfile(user: UserProfile) {
  if (typeof window === "undefined" || !user?.email) return;
  const map = readKnownProfiles();
  const key = slugify(user.email);
  if (JSON.stringify(map[key]) === JSON.stringify(user)) return;
  map[key] = user;
  const raw = JSON.stringify(map);
  try { window.localStorage.setItem(KNOWN_PROFILES_KEY, raw); } catch { /* ignore */ }
  syncSharedItems({ [KNOWN_PROFILES_KEY]: raw });
}

/** Look up a previously-seen profile by email (case/format-insensitive). */
export function findProfileByEmail(email: string): UserProfile | null {
  if (!email) return null;
  return readKnownProfiles()[slugify(email)] || null;
}

// JSON.parse hands back a brand-new object every call, so calling getAuthUser()
// during render gave `user` a different identity on every pass. Components list
// it as a hook dependency, which meant those memos never actually memoised —
// the dashboard was rebuilding the whole course catalogue (~6ms of blocking
// work over 2,800 phrases) on EVERY render, which is what made the app stutter
// and then freeze under any hover that re-rendered.
//
// Caching on the raw string keeps identity stable while the stored profile is
// unchanged, and still returns a fresh object the moment it really changes.
let authUserRaw: string | null = null;
let authUserValue: UserProfile | null = null;

export function getAuthUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    if (!raw) {
      authUserRaw = null;
      authUserValue = null;
      return null;
    }
    if (raw !== authUserRaw) {
      authUserValue = JSON.parse(raw);
      authUserRaw = raw;
    }
    return authUserValue;
  } catch {
    authUserRaw = null;
    authUserValue = null;
    return null;
  }
}

/**
 * The key a course-scoped key stands for: "session-completed@learn-de:id" is
 * "session-completed:id" as far as the list above is concerned.
 *
 * Without this the split by course (see DIRECTION_SCOPED_KEYS) took every key
 * it scoped out of the mirror. The prefixes end in ":" and a scoped key has
 * "@learn-…" where the colon used to be, so completed lessons, XP, the lesson
 * count, the session log and the current part all stopped reaching the shared
 * file — and a device whose local storage was lost came back to nothing.
 */
function unscopedKey(key: string) {
  return key.replace(/@learn-[a-z]+(?=:)/u, "");
}

function shouldSyncKey(key: string) {
  if (SESSION_LOCAL_KEYS.has(key)) return false;
  if (APPEARANCE_LOCAL_KEYS.has(key)) return false;
  const base = unscopedKey(key);
  return SHARED_SYNC_PREFIXES.some((prefix) => base.startsWith(prefix));
}

/**
 * Which local writes the mirror has not caught up with yet.
 *
 * Re-reading the mirror on window focus takes a moment, and anything written
 * in that moment — the answer given straight after clicking back into the
 * window — is newer than the copy that comes back. Applying that copy wrote the
 * old value over the new one, and the next read-modify-write saved the loss.
 * Every write is stamped here; a hydrate leaves alone any key written after it
 * started, and any key still queued for or travelling to the mirror.
 */
let localWriteTick = 0;
const lastLocalWrite = new Map<string, number>();
let inFlightSharedItems: Record<string, string | null> = {};

const SHARED_SYNC_DELAY_MS = 100;
let pendingSharedItems: Record<string, string | null> = {};
let sharedSyncTimer: ReturnType<typeof setTimeout> | null = null;
let sharedSyncInFlight = false;
let sharedSyncPromise: Promise<void> | null = null;
let sharedSyncRetryDelay = 1000;

function scheduleSharedSync(delayMs = SHARED_SYNC_DELAY_MS) {
  if (sharedSyncTimer || sharedSyncInFlight) return;
  sharedSyncTimer = setTimeout(() => void flushSharedItems(), delayMs);
}

async function flushSharedItems(keepalive = false) {
  if (sharedSyncTimer) {
    clearTimeout(sharedSyncTimer);
    sharedSyncTimer = null;
  }
  if (sharedSyncPromise) {
    await sharedSyncPromise;
    if (Object.keys(pendingSharedItems).length > 0) await flushSharedItems(keepalive);
    return;
  }
  const items = pendingSharedItems;
  pendingSharedItems = {};
  if (Object.keys(items).length === 0) return;

  sharedSyncInFlight = true;
  inFlightSharedItems = items;
  const request = (async () => {
    let retry = false;
    try {
      const response = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        keepalive,
      });
      if (!response.ok) throw new Error(`storage sync http ${response.status}`);
      sharedSyncRetryDelay = 1000;
    } catch {
      // Newer pending values win when a failed batch is returned to the queue.
      pendingSharedItems = { ...items, ...pendingSharedItems };
      retry = true;
    } finally {
      sharedSyncInFlight = false;
      inFlightSharedItems = {};
      if (Object.keys(pendingSharedItems).length > 0) {
        if (retry) sharedSyncRetryDelay = Math.min(30000, sharedSyncRetryDelay * 2);
        scheduleSharedSync(retry ? sharedSyncRetryDelay : SHARED_SYNC_DELAY_MS);
      }
    }
  })();
  sharedSyncPromise = request;
  try {
    await request;
  } finally {
    if (sharedSyncPromise === request) sharedSyncPromise = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flushSharedItems(true));
}

// Queue a mirror write without the filter above. Only for deleting keys that
// must no longer be shared: the filter refuses them in both directions, which
// would otherwise leave an old entry sitting in the file with no way to clear
// it, ready for an older build to apply again.
function queueSharedItems(items: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  if (Object.keys(items).length === 0) return;
  // Local storage is already durable at this point. Coalesce the mirror writes
  // so completing one lesson does not cause a read/parse/write cycle for every
  // grade, streak, activity, and statistic updated in the same moment.
  localWriteTick += 1;
  for (const key of Object.keys(items)) lastLocalWrite.set(key, localWriteTick);
  Object.assign(pendingSharedItems, items);
  scheduleSharedSync();
}

function syncSharedItems(items: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  queueSharedItems(Object.fromEntries(Object.entries(items).filter(([key]) => shouldSyncKey(key))));
}

export function syncLocalStorageItem(key: string, value: string | null) {
  syncSharedItems({ [key]: value });
}

/** Flush queued mirror writes before an operation reloads or exits the app. */
export async function flushSharedStorage(keepalive = false) {
  await flushSharedItems(keepalive);
}

export async function hydrateLocalStorageFromSharedStorage() {
  if (typeof window === "undefined") return false;
  const deprecatedDeletes: Record<string, null> = {};
  for (const key of DEPRECATED_SHARED_KEYS) {
    if (window.localStorage.getItem(key) !== null) {
      window.localStorage.removeItem(key);
      deprecatedDeletes[key] = null;
    }
  }
  const startedAtTick = localWriteTick;
  const writtenSinceStart = (key: string) => (lastLocalWrite.get(key) ?? 0) > startedAtTick
    || key in pendingSharedItems
    || key in inFlightSharedItems;
  try {
    const response = await fetch("/api/storage", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    const items = data?.items && typeof data.items === "object" ? data.items : {};
    // Course progress that never reached the mirror while the scoped keys were
    // filtered out of it (see unscopedKey). Only scoped keys, and only ones the
    // mirror has no entry for: anything else missing from it may have been
    // deleted on purpose elsewhere, and must not be put back from here.
    const neverMirrored: Record<string, string> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || unscopedKey(key) === key || items[key] !== undefined || !shouldSyncKey(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value != null) neverMirrored[key] = value;
    }
    syncSharedItems(neverMirrored);
    // An older build mirrored the session, and that copy outlives the change:
    // it is skipped on the way in now, but it would sit in the file for good.
    // Clearing it there leaves the session on this device untouched.
    const staleSession: Record<string, string | null> = {};
    for (const key of SESSION_LOCAL_KEYS) {
      if (items[key] !== undefined) staleSession[key] = null;
    }
    queueSharedItems(staleSession);
    // Same for the colour an older build mirrored. It is ignored on the way in
    // now, but leaving it in the file keeps a copy of the app's accent sitting
    // there for any build still reading it. Clearing it there leaves the
    // colour on this device untouched.
    const staleAppearance: Record<string, string | null> = {};
    for (const key of APPEARANCE_LOCAL_KEYS) {
      if (items[key] !== undefined) staleAppearance[key] = null;
    }
    queueSharedItems(staleAppearance);
    let changed = false;
    let gradesChanged = false;
    let activityChanged = false;
    let masteryChanged = false;

    for (const [key, value] of Object.entries(items)) {
      if (DEPRECATED_SHARED_KEYS.has(key)) {
        window.localStorage.removeItem(key);
        deprecatedDeletes[key] = null;
        changed = true;
        continue;
      }
      if (typeof key !== "string" || typeof value !== "string" || !shouldSyncKey(key)) continue;
      if (writtenSinceStart(key)) continue;
      if (window.localStorage.getItem(key) !== value) {
        window.localStorage.setItem(key, value);
        changed = true;
        const base = unscopedKey(key);
        if (base.startsWith("session-completed:")) {
          gradesChanged = true;
        }
        if (base.startsWith("activity-log:")) {
          activityChanged = true;
        }
        if (key === "germ-mastery-set" || base.startsWith("vocab-mastery")) {
          masteryChanged = true;
        }
      }
    }

    if (Object.keys(deprecatedDeletes).length > 0) {
      syncSharedItems(deprecatedDeletes);
    }

    if (changed) {
      if (gradesChanged) {
        window.dispatchEvent(new Event("grades-updated"));
      }
      if (activityChanged) {
        window.dispatchEvent(new Event("activity-updated"));
      }
      if (masteryChanged) {
        try {
          const raw = window.localStorage.getItem("germ-mastery-set");
          const count = raw ? JSON.parse(raw).length : 0;
          window.dispatchEvent(new CustomEvent("vocab-mastery-updated", { detail: { count } }));
        } catch {}
      }
      window.dispatchEvent(new Event("storage-sync-completed"));
    }

    return changed;
  } catch {
    if (Object.keys(deprecatedDeletes).length > 0) {
      syncSharedItems(deprecatedDeletes);
    }
    return false;
  }
}

export function setAuthUser(user: UserProfile | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(AUTH_USER_KEY);
    syncSharedItems({ [AUTH_USER_KEY]: null });
    return;
  }
  const raw = JSON.stringify(user);
  window.localStorage.setItem(AUTH_USER_KEY, raw);
  syncSharedItems({ [AUTH_USER_KEY]: raw });
  // Remember this account by email so a later email-only login reconnects to it.
  recordKnownProfile(user);
  // Signing in (or saving a profile) clears any prior sign-out marker.
  try { window.localStorage.removeItem(SIGNED_OUT_KEY); } catch { /* ignore */ }
  syncSharedItems({ [SIGNED_OUT_KEY]: null });
}

/** Log out for real: drop the session and remember that it was intentional. */
export function signOut() {
  if (typeof window === "undefined") return;
  setAuthUser(null);
  try { window.localStorage.setItem(SIGNED_OUT_KEY, "1"); } catch { /* ignore */ }
  syncSharedItems({ [SIGNED_OUT_KEY]: "1" });
}

/**
 * Keys whose value belongs to ONE learning direction.
 *
 * These say where the learner is: which sentences are done, which words are
 * seen, what the placement decided. None of that carries across from learning
 * German to learning English — they are different courses through different
 * material. Switching used to leave the old figures in place, so the card
 * announced 98% of a pack that had never been opened in that direction.
 *
 * Deliberately NOT here: totalXp, totalReviews and streak, which measure how
 * much has been done rather than where you are — splitting a streak would
 * punish studying both languages on the same day. Also not course-progress,
 * which carries the Country studies courses, whose progress has nothing to do
 * with which way round sentences are shown.
 */
const DIRECTION_SCOPED_KEYS = new Set([
  "session-completed",
  "german-lab-review-state",
  "progress-seen-words",
  "vocab-mastery",
  "active-part",
  "german-lab-placement-done",
  "german-lab-placement-result",
  // The lesson counter belongs here too: the card reads it as "Lektion 222",
  // and showing that beside 0% of a pack nobody has opened in this direction
  // is the same contradiction, one line further down.
  "sessionsCompleted",
  // And the two figures beside it in the header. They were the last ones
  // still counting a life rather than a course, which read as a loss the
  // moment the course changed: 221 lessons went to 0 while 13,860 XP and 16
  // days stayed, so the same header said both that nothing had been done here
  // and that a great deal had. XP carries the level and the milestones with
  // it, and the session log carries this week, the activity card and the pace
  // estimate - all of them answers about one course.
  "totalXp",
  "activity-log",
]);

/** Marker for the one-time copy described at the top of this file. */
// Versioned: the set above grew after v1 ran, and a key added later would
// otherwise never be handed to the direction that earned it. Bumping this
// re-runs the copy, and the copy skips any target that already has a value,
// so nothing written since is overwritten.
const DIRECTION_SPLIT_KEY = "gl-direction-split-v3";

/**
 * The markers left by earlier runs, newest first.
 *
 * A re-run must hand the pre-split store to the course that EARNED it, not to
 * whichever one happens to be open. Those are the same thing only on the run
 * that first split a profile; by v3 a learner may well have moved on, and
 * copying a life's XP onto a course they have not started would credit them
 * for lessons they never did. The earlier marker recorded the direction it
 * ran for, which is exactly that answer.
 */
const EARLIER_SPLIT_KEYS = ["gl-direction-split-v2", "gl-direction-split"];

// Read straight from storage rather than through direction.ts: that module
// imports this one for the shared mirror, so asking it here would be a cycle
// that runs before either side is initialised. Keep this list in step with
// LearningDirection — a direction missing from it silently shares the German
// course's progress instead of getting its own.
const KNOWN_DIRECTIONS = new Set(["learn-de", "learn-en", "learn-fr", "learn-pl", "learn-es", "learn-pt", "learn-ru", "learn-el", "learn-sq"]);

function currentDirection(): string {
  if (typeof window === "undefined") return "learn-de";
  try {
    const stored = window.localStorage.getItem("gl-direction");
    return stored && KNOWN_DIRECTIONS.has(stored) ? stored : "learn-de";
  } catch {
    return "learn-de";
  }
}

export function getScopedKey(key: string, profile: UserProfile | null) {
  const profileId = profile?.id || "default";
  const base = DIRECTION_SCOPED_KEYS.has(key) ? `${key}@${currentDirection()}` : key;
  return `${base}:${profileId}`;
}

/**
 * Hand the pre-split store to the direction that earned it. Once, per profile.
 *
 * Copies rather than moves, and writes a marker first so a second call — or a
 * later switch to the other direction — cannot claim the same data twice.
 * Runs lazily on first read so no startup order has to be arranged for it.
 */
/** Which direction an earlier split ran for, if one did. */
function earlierSplitDirection(profileId: string): string | null {
  if (typeof window === "undefined") return null;
  for (const earlier of EARLIER_SPLIT_KEYS) {
    try {
      const recorded = window.localStorage.getItem(`${earlier}:${profileId}`);
      if (recorded && KNOWN_DIRECTIONS.has(recorded)) return recorded;
    } catch {
      return null;
    }
  }
  return null;
}

function migrateDirectionScoped(profile: UserProfile | null) {
  if (typeof window === "undefined") return;
  const profileId = profile?.id || "default";
  const marker = `${DIRECTION_SPLIT_KEY}:${profileId}`;
  try {
    if (window.localStorage.getItem(marker)) return;
    const direction = earlierSplitDirection(profileId) ?? currentDirection();
    window.localStorage.setItem(marker, direction);
    for (const key of DIRECTION_SCOPED_KEYS) {
      const legacy = window.localStorage.getItem(`${key}:${profileId}`);
      if (legacy == null) continue;
      const target = `${key}@${direction}:${profileId}`;
      if (window.localStorage.getItem(target) == null) window.localStorage.setItem(target, legacy);
    }
  } catch {
    // A blocked or full localStorage is not worth crashing a read over; the
    // learner sees an empty pack rather than a broken app.
  }
}

export function loadScopedJson<T>(key: string, fallback: T, profile: UserProfile | null = getAuthUser()): T {
  if (typeof window === "undefined") return fallback;
  if (DIRECTION_SCOPED_KEYS.has(key)) migrateDirectionScoped(profile);
  const storage = window.localStorage;
  const scopedKey = getScopedKey(key, profile);
  const raw = storage.getItem(scopedKey);

  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveScopedJson<T>(key: string, value: T, profile: UserProfile | null = getAuthUser()) {
  if (typeof window === "undefined") return;
  const scopedKey = getScopedKey(key, profile);
  const raw = JSON.stringify(value);
  window.localStorage.setItem(scopedKey, raw);
  syncSharedItems({ [scopedKey]: raw });
}

/** Batched writes for high-churn keys. */
