/**
 * A compact, durable signal for sentences that need more practice than their
 * normal spaced-review date would provide.
 *
 * The spaced-repetition ladder remains authoritative for formal reviews. This
 * module only decides which already-seen sentences may occupy the lesson's
 * optional familiar half between those dates.
 */

import { isSnoozed } from "@/lib/memoryStrength";

export type AnswerPerformance = {
  attempts: number;
  mistakes: number;
  /**
   * Checks where the words were right and the letters were not.
   *
   * Counted apart from mistakes because the two ask for different things. A
   * misspelling is answered by writing the phrase again; not knowing it is
   * answered by meeting it again, which the review schedule already does.
   * Only this number buys the writing stages back — see typingFailed.
   */
  slips?: number;
};

type AdaptivePracticeFields = {
  /** Rungs climbed on the review ladder (see memoryStrength). */
  successes?: number;
  /** Answer checks made while practising this sentence. */
  answerAttempts?: number;
  /** Incorrect checks made while practising this sentence. */
  answerMistakes?: number;
  /**
   * Recent difficulty that rises quickly on mistakes and fades slowly through
   * clean practice. Unlike the lifetime counters, this can recover.
   */
  difficultyDebt?: number;
  lastMistakeAt?: string;
  /**
   * When the learner last wrote this phrase with the right words and a wrong
   * letter. Kept apart from lastMistakeAt: a slip is what the writing stages
   * are for, and a blank is not.
   */
  lastSpellingSlipAt?: string;
  /** Consecutive runs that ended in a mistake; a clean run resets it to 0. */
  missRun?: number;
  lastAnswerAt?: string;
  /** Last optional familiar-half repetition; does not move the SRS due date. */
  reinforcedAt?: string;
  lastGrade?: string;
  permanent?: boolean;
  dueAt?: string;
  /** When the grade was last moved — read to tell today's phrases from older
   *  ones, which is what makes a same-day check a same-day check. */
  updatedAt?: string;
};

type SentenceDifficultyInput = {
  de?: string;
  en?: string;
  level?: string;
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const ADAPTIVE_REPEAT_COOLDOWN_MS = 10 * MINUTE_MS;
const ADAPTIVE_REPEAT_THRESHOLD = 0.48;

const ADVANCED_WORDS = new Set([
  // English connectors and high-value abstract vocabulary.
  "although", "apparently", "consequently", "despite", "eventually",
  "furthermore", "however", "meanwhile", "nevertheless", "otherwise",
  "presumably", "regarding", "subsequently", "therefore", "unless",
  "whereas", "whether", "would've", "should've", "could've",
  // German structures and connectors that make production/word order harder.
  "allerdings", "anschließend", "beziehungsweise", "deshalb", "damit",
  "falls", "inzwischen", "nachdem", "obwohl", "sobald", "sondern",
  "stattdessen", "trotzdem", "während", "wahrscheinlich", "weder",
  "weshalb", "worden", "würde", "hätte", "könnte", "müsste", "sollte",
]);

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const words = (text: string) =>
  String(text ?? "")
    .toLocaleLowerCase("de-DE")
    .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];

/**
 * Estimate production difficulty from both languages. CEFR metadata sets the
 * frame; sentence length, clauses, advanced connectors and long compounds add
 * detail within that frame.
 */
export function inherentSentenceDifficulty(item: SentenceDifficultyInput): number {
  const deWords = words(item.de ?? "");
  const enWords = words(item.en ?? "");
  const allWords = [...deWords, ...enWords];
  const maxWords = Math.max(deWords.length, enWords.length);

  const level = String(item.level ?? "");
  const levelWeight = /C[12]/i.test(level) ? 0.45
    : /B2/i.test(level) ? 0.32
      : /B1/i.test(level) ? 0.18 : 0;
  const lengthWeight = clamp((maxWords - 5) * 0.035, 0, 0.45);
  const advancedWeight = Math.min(
    0.3,
    allWords.filter((word) => ADVANCED_WORDS.has(word)).length * 0.1
  );
  const longWordWeight = Math.min(
    0.2,
    allWords.filter((word) => word.length >= 11).length * 0.045
  );
  const clauseSignals = `${item.de ?? ""} ${item.en ?? ""}`.match(/[,;:—]|\b(?:dass|weil|wenn|ob|which|that|because|while)\b/giu)?.length ?? 0;
  const clauseWeight = Math.min(0.16, clauseSignals * 0.035);

  return clamp(levelWeight + lengthWeight + advancedWeight + longWordWeight + clauseWeight);
}

/** Apply one sentence route's aggregate result in a single storage write. */
export function recordAnswerPerformance<T extends AdaptivePracticeFields>(
  prior: T | undefined,
  performance: AnswerPerformance | undefined,
  now = Date.now()
): T & AdaptivePracticeFields {
  const attempts = Math.max(0, Math.round(Number(performance?.attempts) || 0));
  const mistakes = Math.min(attempts, Math.max(0, Math.round(Number(performance?.mistakes) || 0)));
  const slips = Math.min(attempts, Math.max(0, Math.round(Number(performance?.slips) || 0)));
  if (!attempts) return { ...(prior ?? {} as T) };

  const correct = attempts - mistakes;
  const priorDebt = Math.max(0, Number(prior?.difficultyDebt) || 0);
  // One slip is recoverable; repeated slips survive the successful checks that
  // follow and make the sentence return. Later clean routes gradually pay the
  // debt back down instead of making a phrase permanently "hard".
  const difficultyDebt = clamp(priorDebt + mistakes * 1.25 - correct * 0.07, 0, 8);
  const timestamp = new Date(now).toISOString();

  return {
    ...(prior ?? {} as T),
    answerAttempts: Math.max(0, Number(prior?.answerAttempts) || 0) + attempts,
    answerMistakes: Math.max(0, Number(prior?.answerMistakes) || 0) + mistakes,
    difficultyDebt,
    lastAnswerAt: timestamp,
    // Runs ending in a mistake, one after another. Cleared by a clean run,
    // because the point is not how often a phrase has ever been missed but
    // whether it is being missed NOW — see missedTwiceRunning.
    missRun: mistakes > 0 ? Math.max(0, Number(prior?.missRun) || 0) + 1 : 0,
    ...(mistakes > 0 ? { lastMistakeAt: timestamp } : {}),
    ...(slips > 0 ? { lastSpellingSlipAt: timestamp } : {}),
  };
}

/**
 * Missed once, met again, missed again.
 *
 * One miss means the phrase has not been learnt yet, and the answer to that
 * is meeting it again — which is what the review it earns is for. Missing it
 * on that review says the meeting was not enough: this phrase is not
 * sticking, and writing it out is worth the learner's time now in a way it
 * was not the first time round. So the writing stages, which a single blank
 * deliberately does not buy, are bought by the second one.
 */
export function missedTwiceRunning(record: AdaptivePracticeFields | undefined): boolean {
  return (Math.max(0, Number(record?.missRun) || 0)) >= 2;
}

/**
 * Did the learner's last run end on a MISSPELLING, rather than on not knowing
 * the phrase?
 *
 * The distinction decides whether the phrase comes back on the writing route.
 * Getting the words wrong is not a spelling problem: it means the phrase is
 * not learnt yet, and being asked to write it out six times teaches nothing —
 * meeting it again does, which is what the review it also earns is for.
 */
export function lastRunHadSpellingSlip(record: AdaptivePracticeFields | undefined): boolean {
  const answered = Date.parse(String(record?.lastAnswerAt ?? ""));
  const slipped = Date.parse(String(record?.lastSpellingSlipAt ?? ""));
  return Number.isFinite(answered) && Number.isFinite(slipped) && slipped >= answered;
}

/**
 * Higher values return earlier in the familiar half. A sentence must have
 * actually been practised: pressing "Know it" alone never activates this path.
 */
export function adaptiveRepeatPriority(
  record: AdaptivePracticeFields | undefined,
  item: SentenceDifficultyInput,
  now = Date.now()
): number {
  const attempts = Math.max(0, Number(record?.answerAttempts) || 0);
  if (!attempts) return 0;

  const debt = clamp((Number(record?.difficultyDebt) || 0) / 3);
  const inherent = inherentSentenceDifficulty(item);
  const lastMistakeAt = record?.lastMistakeAt ? Date.parse(record.lastMistakeAt) : 0;
  const mistakeAge = Number.isFinite(lastMistakeAt) && lastMistakeAt > 0
    ? Math.max(0, now - lastMistakeAt)
    : Number.POSITIVE_INFINITY;
  // A recent slip matters, but fades fully after a month. Lifetime attempt and
  // mistake totals remain useful diagnostics without permanently pinning one
  // old problem sentence ahead of every other difficult item.
  const recentMistake = Number.isFinite(mistakeAge)
    ? clamp(1 - mistakeAge / (30 * DAY_MS))
    : 0;

  return inherent * 0.75 + debt * 0.9 + recentMistake * 0.15;
}

/**
 * A sentence the learner reached and answered at least once, but left without
 * earning a mastery grade. It belongs in the familiar half on its next visit;
 * treating it as fresh would quietly replace one of the three genuinely new
 * phrases promised by Continue Learning.
 */
// Whether the last run had ANY mistake in it used to be asked here, to decide
// whether a phrase came back on the writing route. It is the wrong question:
// a wrong answer means the phrase is not learnt, which the review it earns is
// the answer to, and lastRunHadSpellingSlip above asks the right one. The
// mistake itself is still recorded — it drives difficulty and the due date.

export function isAttemptedPracticeEligible(
  record: AdaptivePracticeFields | undefined,
  now = Date.now()
): boolean {
  return Boolean(
    record
      && !record.lastGrade
      && !record.permanent
      // Putting a phrase off is the learner's own decision about when to see it
      // again. It outranks every reason this module has for showing it sooner.
      && !isSnoozed(record, now)
      && Math.max(0, Number(record.answerAttempts) || 0) > 0
  );
}

/**
 * Whether a known sentence may repeat before its mastery review is due.
 * A short cooldown after an optional repetition guarantees rotation and keeps
 * one difficult sentence from occupying a familiar slot every lesson.
 */
/** Same calendar day, in the learner's own timezone rather than UTC. */
function isSameLocalDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

/**
 * A phrase learned earlier today, offered back before the day is out.
 *
 * The ladder starts at a day, so nothing learned today is due today, and a
 * sitting could only fill its review slots with material from yesterday or
 * earlier. On the first day of a course there is none, which is why a first
 * day was all new material and no checking.
 *
 * This is not the formal review and does not pretend to be: it takes a
 * familiar slot only when the genuinely due ones do not fill them, it never
 * moves the due date, and it is worth half a rung rather than one. What it
 * buys is finding out the same afternoon whether the morning stuck.
 *
 * Once per day. A phrase re-checked every sitting is being drilled, which is
 * the thing the spacing exists to avoid.
 */
export function isSameDayCheckEligible(
  record: AdaptivePracticeFields | undefined,
  now = Date.now()
): boolean {
  if (!record || record.lastGrade !== "know" || record.permanent) return false;
  if (isSnoozed(record, now)) return false;
  const dueAt = record.dueAt ? Date.parse(record.dueAt) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(dueAt) && now >= dueAt) return false; // the real review owns it
  // Learned today, not merely graded today. updatedAt moves on every grade, so
  // without this a review passed this morning was offered again this afternoon
  // and its half rung banked on top — two sittings a day climbed past the
  // three-day rung without ever waiting three days. Only the first rung is a
  // phrase that was new today.
  if ((Number(record.successes) || 0) > 1) return false;
  const learnedAt = record.updatedAt ? Date.parse(record.updatedAt) : 0;
  if (!Number.isFinite(learnedAt) || learnedAt <= 0) return false;
  if (!isSameLocalDay(learnedAt, now)) return false;
  // Already checked since it was learned; the next word on it is tomorrow's.
  const reinforcedAt = record.reinforcedAt ? Date.parse(record.reinforcedAt) : 0;
  if (Number.isFinite(reinforcedAt) && reinforcedAt >= learnedAt) return false;
  return true;
}

export function isAdaptiveReinforcementEligible(
  record: AdaptivePracticeFields | undefined,
  item: SentenceDifficultyInput,
  now = Date.now()
): boolean {
  if (!record || record.lastGrade !== "know" || record.permanent) return false;
  if (isSnoozed(record, now)) return false; // put off by hand — nothing overrides that
  const dueAt = record.dueAt ? Date.parse(record.dueAt) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(dueAt) && now >= dueAt) return false; // formal review owns it
  const reinforcedAt = record.reinforcedAt ? Date.parse(record.reinforcedAt) : 0;
  if (Number.isFinite(reinforcedAt) && reinforcedAt > 0 && now - reinforcedAt < ADAPTIVE_REPEAT_COOLDOWN_MS) {
    return false;
  }
  return adaptiveRepeatPriority(record, item, now) >= ADAPTIVE_REPEAT_THRESHOLD;
}
