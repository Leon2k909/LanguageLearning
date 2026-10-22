import { getAuthUser, getScopedKey, loadScopedJson, saveScopedJson, type UserProfile } from "@/lib/profileStorage";
import { recordDeclaredKnown, recordStruggle } from "@/lib/memoryStrength";

const ACTIVITY_LOG_KEY = "activity-log";
export const COMPLETED_KEY = "session-completed";

export type ActivitySession = {
  ts: number;          // epoch ms recorded
  durationSec: number; // real time spent in the session
  sentences: number;
  dialogues: number;
  /**
   * Newer lesson records use an interaction/focus-aware clock. Legacy records
   * deliberately omit this flag so they cannot skew pace estimates.
   */
  activeTimed?: boolean;
  timingVersion?: 1;
  progressBefore?: number;
  progressAfter?: number;
  progressGained?: number;
  lessonId?: string;
};

export type GradeRecord = {
  lastGrade?: string;
  updatedAt?: string;
  /** spaced-repetition ladder fields — see lib/memoryStrength.ts */
  successes?: number;
  intervalDays?: number;
  dueAt?: string;
  /** explicit hold date used by review controls and Listen */
  snoozedUntil?: string;
  permanent?: boolean;
  /** most recent optional practice rep that did not alter the review date */
  reinforcedAt?: string;
  /** answer checks accumulated across completed/abandoned sentence routes */
  answerAttempts?: number;
  /** incorrect answer checks accumulated across sentence routes */
  answerMistakes?: number;
  /** recent difficulty signal; rises on mistakes and fades through clean reps */
  difficultyDebt?: number;
  lastMistakeAt?: string;
  lastAnswerAt?: string;
  /** graded passive-listening exposures — visible in trackers, never a mastery signal */
  listens?: number;
  listenedAt?: string;
};
export type GradeStore = Record<string, GradeRecord>;

const DAY_MS = 86_400_000;
const MAX_SESSION_SEC = 7_200; // cap a single session at 2h to ignore "left tab open"

function normalizeLegacyGrade(grade: string | undefined) {
  if (grade === "know" || grade === "known" || grade === "easy" || grade === "good") return "know";
  if (grade === "struggle" || grade === "hard" || grade === "again") return "struggle";
  return null;
}

function loadLegacyGradeStore(): GradeStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("german-lab-review-state");
    if (!raw) return {};
    const legacy = JSON.parse(raw);
    if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return {};

    const migrated: GradeStore = {};
    for (const [id, rec] of Object.entries<any>(legacy)) {
      const lastGrade = normalizeLegacyGrade(rec?.lastGrade);
      if (!lastGrade) continue;
      migrated[id] = {
        lastGrade,
        updatedAt: typeof rec?.updatedAt === "string" ? rec.updatedAt : new Date().toISOString(),
      };
    }
    return migrated;
  } catch {
    return {};
  }
}

export function loadActivitySessions(profile: UserProfile | null = getAuthUser()): ActivitySession[] {
  const raw = loadScopedJson<ActivitySession[]>(ACTIVITY_LOG_KEY, [], profile);
  return Array.isArray(raw) ? raw : [];
}

export function recordActivitySession(entry: ActivitySession, profile: UserProfile | null = getAuthUser()) {
  const log = loadActivitySessions(profile);
  log.push({ ...entry, durationSec: Math.min(MAX_SESSION_SEC, Math.max(0, Math.round(entry.durationSec))) });
  saveScopedJson(ACTIVITY_LOG_KEY, log.slice(-500), profile);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("activity-updated"));
}

/**
 * How many separate days have any learning on them, all time.
 *
 * The streak answers "how many in a row", which is zero the morning after one
 * missed evening. This answers "how many at all", so it only ever grows. A day
 * counts once however much was done on it.
 *
 * Derived from what is already recorded rather than counted from now on: the
 * session log, and the last time each item was graded or heard. That makes it
 * right for everything already done instead of starting at zero. It is a floor
 * rather than a tally — a grade record keeps only its latest timestamp, so a
 * day whose every item was answered again later is not visible any more.
 *
 * Local calendar days, so a session at half past eleven belongs to the evening
 * it happened in rather than to the next day in UTC.
 */
export function countLearningDays(profile: UserProfile | null = getAuthUser()): number {
  const days = new Set<string>();
  const add = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const d = new Date(ms);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  };
  try {
    for (const session of loadActivitySessions(profile)) add(Number(session?.ts));
    for (const record of Object.values(loadGradeStore(profile))) {
      if (record?.updatedAt) add(Date.parse(record.updatedAt));
      if (record?.listenedAt) add(Date.parse(record.listenedAt));
    }
  } catch {
    return days.size;
  }
  return days.size;
}

export function loadGradeStore(profile: UserProfile | null = getAuthUser()): GradeStore {
  if (typeof window !== "undefined") {
    const scopedKey = getScopedKey(COMPLETED_KEY, profile);
    if (window.localStorage.getItem(scopedKey) == null) {
      const migrated = loadLegacyGradeStore();
      if (Object.keys(migrated).length > 0) {
        saveGradeStore(migrated, profile);
        return migrated;
      }
    }
  }

  const raw = loadScopedJson<any>(COMPLETED_KEY, {}, profile) ?? {};
  if (Array.isArray(raw)) {
    // legacy array form: ids known with no timestamp
    return Object.fromEntries(raw.map((id: string) => [id, { lastGrade: "know" }]));
  }
  return raw && typeof raw === "object" ? raw : {};
}

export function saveGradeStore(store: GradeStore, profile: UserProfile | null = getAuthUser()) {
  saveScopedJson(COMPLETED_KEY, store, profile);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("grades-updated"));
}

export type ItemStatus = "known" | "struggle" | "new";

/** Find the stored grade and the canonical-or-legacy key that currently owns it. */
export function gradeEntryForId(store: GradeStore, id: string, aliases: string[] = []) {
  for (const key of [id, ...aliases]) {
    const record = store?.[key];
    if (record?.lastGrade) return { key, record };
  }
  return undefined;
}

/**
 * Find any progress record, including a sentence that has mistakes recorded but
 * was skipped before receiving a mastery grade. A graded alias still wins over
 * an ungraded canonical record so legacy mastery is never hidden.
 */
export function progressEntryForId(store: GradeStore, id: string, aliases: string[] = []) {
  const keys = [id, ...aliases];
  for (const key of keys) {
    const record = store?.[key];
    if (record?.lastGrade) return { key, record };
  }
  for (const key of keys) {
    const record = store?.[key];
    if (record && typeof record === "object") return { key, record };
  }
  return undefined;
}

/** Replace any legacy alias record with one canonical grade entry. */
export function setCanonicalGradeRecord(
  store: GradeStore,
  id: string,
  aliases: string[] = [],
  record: GradeRecord
) {
  for (const alias of aliases) {
    if (alias !== id) delete store[alias];
  }
  store[id] = record;
}

export function statusForId(store: GradeStore, id: string, aliases: string[] = []): ItemStatus {
  for (const key of [id, ...aliases]) {
    const grade = store?.[key]?.lastGrade;
    if (grade === "know") return "known";
    if (grade === "struggle") return "struggle";
  }
  return "new";
}

/** Set or clear an item's status. status="new" removes it from the store. */
export function setItemStatus(
  id: string,
  status: ItemStatus,
  profile: UserProfile | null = getAuthUser(),
  aliases: string[] = []
) {
  const store = loadGradeStore(profile);
  if (status === "new") {
    delete store[id];
    for (const alias of aliases) delete store[alias];
  } else if (status === "known") {
    // Same declaration as the lesson's "Know it" skip button — jumps most
    // of the way up the ladder rather than climbing one rung. See
    // recordDeclaredKnown in memoryStrength.ts.
    setCanonicalGradeRecord(store, id, aliases, recordDeclaredKnown(progressEntryForId(store, id, aliases)?.record));
  } else {
    setCanonicalGradeRecord(store, id, aliases, recordStruggle(Date.now(), progressEntryForId(store, id, aliases)?.record));
  }
  saveGradeStore(store, profile);
  return store;
}

/**
 * Bulk version of setItemStatus — one load/save cycle for many items instead
 * of N, so a bulk-select action in the tracker doesn't hammer localStorage
 * (and fire N separate "grades-updated" events) for a multi-item selection.
 */
export function setItemsStatus(
  items: { id: string; aliases?: string[] }[],
  status: ItemStatus,
  profile: UserProfile | null = getAuthUser()
) {
  const store = loadGradeStore(profile);
  for (const { id, aliases = [] } of items) {
    if (status === "new") {
      delete store[id];
      for (const alias of aliases) delete store[alias];
    } else if (status === "known") {
      setCanonicalGradeRecord(store, id, aliases, recordDeclaredKnown(progressEntryForId(store, id, aliases)?.record));
    } else {
      setCanonicalGradeRecord(store, id, aliases, recordStruggle(Date.now(), progressEntryForId(store, id, aliases)?.record));
    }
  }
  saveGradeStore(store, profile);
  return store;
}


type DayBucket = { dayStart: number; minutes: number; items: number; listened: number };

export function summarizeActivity(
  sessions: ActivitySession[],
  grades: GradeStore,
  days: number,
  now = Date.now()
) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  // Days by calendar date, never by multiples of 24 hours: a range that spans a
  // clock change has one 23- or 25-hour day in it, and dividing by DAY_MS put
  // everything from midnight to one in the morning on the day before.
  const dayStartFor = (offset: number) => {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() + offset);
    return d.getTime();
  };
  const rangeStart = dayStartFor(-(days - 1));
  const idx = (ts: number) => {
    if (!Number.isFinite(ts) || ts < rangeStart) return -1;
    const at = new Date(ts);
    at.setHours(0, 0, 0, 0);
    // Midnight to midnight is 23, 24 or 25 hours, so rounding is exact.
    return Math.round((at.getTime() - rangeStart) / DAY_MS);
  };

  const buckets: DayBucket[] = Array.from({ length: days }, (_, i) => ({
    dayStart: dayStartFor(i - (days - 1)),
    minutes: 0,
    items: 0,
    listened: 0,
  }));

  let totalSec = 0;
  let sessionsCount = 0;
  for (const s of sessions) {
    const i = idx(s.ts);
    if (i < 0 || i >= days) continue;
    buckets[i].minutes += s.durationSec / 60;
    totalSec += s.durationSec;
    sessionsCount += 1;
  }

  let itemsCount = 0;
  let knownCount = 0;
  // Listen exposures live on the same grade records but are counted apart:
  // hearing an item is real activity, never a mastery signal, so it must not
  // inflate the graded-items numbers. Only the LATEST listen has a timestamp
  // (listenedAt), so the in-range figure counts items heard, while the
  // exposure total is honest only as an all-time number.
  let listenedCount = 0;
  let totalListens = 0;
  for (const rec of Object.values(grades)) {
    totalListens += Number(rec?.listens) || 0;
    if (rec?.listenedAt) {
      const heardAt = Date.parse(rec.listenedAt);
      if (!Number.isNaN(heardAt)) {
        const i = idx(heardAt);
        if (i >= 0 && i < days) {
          buckets[i].listened += 1;
          listenedCount += 1;
        }
      }
    }
    if (!rec?.updatedAt) continue;
    const t = Date.parse(rec.updatedAt);
    if (Number.isNaN(t)) continue;
    const i = idx(t);
    if (i < 0 || i >= days) continue;
    buckets[i].items += 1;
    itemsCount += 1;
    if (rec.lastGrade === "know") knownCount += 1;
  }

  const activeDays = buckets.filter((b) => b.minutes > 0 || b.items > 0 || b.listened > 0).length;

  return {
    hours: totalSec / 3600,
    sessionsCount,
    itemsCount,
    knownCount,
    listenedCount,
    totalListens,
    activeDays,
    buckets,
  };
}
