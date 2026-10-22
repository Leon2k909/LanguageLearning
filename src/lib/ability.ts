import type { GradeStore } from "@/lib/activity";

/**
 * A personal read on how strong a learner is, used to decide what "Continue
 * learning" reaches for first.
 *
 * The important constraint: this only ever changes the ORDER in which material
 * is served, never what exists. A strong learner meets the harder sentences
 * sooner; the easier ones stay in the queue and are served once the harder ones
 * run out. Nothing in the language can be skipped by being good at it.
 *
 * Scoring is per SENTENCE, not per pack — 73 of the 97 packs contain more than
 * one difficulty, so ranking whole packs meant a hard sentence inside an easy
 * pack could never be brought forward.
 */

export type AbilityBand = "easy" | "medium" | "hard" | "expert";

type Ability = {
  /** 0-1. Blends how much has been graded, how much stuck, and how deeply. */
  score: number;
  band: AbilityBand;
  /** Items with any grade at all — the confidence behind the score. */
  graded: number;
  knownRatio: number;
  /** True until there is enough history to judge; the band stays "easy". */
  provisional: boolean;
};

/**
 * Below this many graded items the score is not trusted. A learner who gets
 * their first six answers right is not a C1 candidate, and promoting them there
 * would bury the basics they have not met yet.
 */
const ABILITY_MIN_GRADED = 40;

/** Interval at which an item counts as fully mastered for scoring purposes. */
const STRONG_INTERVAL_DAYS = 30;

export function computeAbility(grades: GradeStore): Ability {
  const records = Object.values(grades ?? {}).filter((record) => record?.lastGrade);
  const graded = records.length;
  if (!graded) {
    return { score: 0, band: "easy", graded: 0, knownRatio: 0, provisional: true };
  }

  const known = records.filter((record) => record.lastGrade === "know").length;
  const knownRatio = known / graded;

  // How deeply the known items have stuck. Clicking "Know it" once is weaker
  // evidence than an item that has survived to a 30-day interval, so depth is
  // scored separately from the raw hit rate.
  const depth = records.reduce((total, record) => {
    if (record.lastGrade !== "know") return total;
    // A permanent item is as deep as it gets. Its interval is Infinity in
    // memory, which JSON stores as null, so read from storage it looked like a
    // one-day item and every "never show me this" pulled the score down.
    if (record.permanent) return total + 1;
    const interval = Math.max(1, Number(record.intervalDays) || 1);
    return total + Math.min(1, interval / STRONG_INTERVAL_DAYS);
  }, 0) / graded;

  // Volume matters on its own: 500 graded items at 80% is a stronger signal
  // than 50 at 80%. Saturates so a long-time user is not pushed past expert.
  const volume = Math.min(1, graded / 600);

  const score = Math.max(0, Math.min(1, knownRatio * 0.5 + depth * 0.35 + volume * 0.15));
  const provisional = graded < ABILITY_MIN_GRADED;

  return {
    score,
    band: provisional ? "easy" : bandForScore(score),
    graded,
    knownRatio,
    provisional,
  };
}

function bandForScore(score: number): AbilityBand {
  if (score >= 0.78) return "expert";
  if (score >= 0.58) return "hard";
  if (score >= 0.34) return "medium";
  return "easy";
}

const BAND_ORDER: AbilityBand[] = ["easy", "medium", "hard", "expert"];

/** Which band a pack's CEFR label belongs to. */

/**
 * How badly one difficulty band suits a learner at another. 0 is a perfect fit.
 *
 * Asymmetric on purpose: material above the learner costs double what material
 * below them costs, because being out of your depth stops you dead and being
 * under-stretched only wastes a little time.
 */
function bandDistance(ability: AbilityBand, item: AbilityBand): number {
  const gap = BAND_ORDER.indexOf(item) - BAND_ORDER.indexOf(ability);
  return gap >= 0 ? gap * 2 : -gap;
}

/**
 * The difficulty of one sentence, rather than of the pack it happens to sit in.
 *
 * A pack is a mixed bag: the restaurant pack holds both "Noch einen Kaffee?" and
 * "Könnten wir auch Leitungswasser bekommen?". Scoring only at pack level meant
 * a strong learner got a hard PACK and still met its easy sentences, while a
 * genuinely hard sentence sitting in an easy pack was never brought forward.
 *
 * CEFR is the frame, length the tie-breaker within it — a long sentence really
 * is harder to produce than a short one at the same level.
 */
export function itemDifficulty(level: string | undefined, wordCount: number): AbilityBand {
  const cefr = /C[12]/i.test(String(level ?? "")) ? 4
    : /B2/i.test(String(level ?? "")) ? 3
      : /B1/i.test(String(level ?? "")) ? 2 : 1;
  const long = wordCount >= 8;
  if (cefr >= 4) return "expert";
  if (cefr === 3) return long ? "expert" : "hard";
  if (cefr === 2) return long ? "hard" : "medium";
  return long ? "medium" : "easy";
}

/**
 * What to teach next, scored per SENTENCE. Lowest is served first.
 *
 * Same three ingredients as before and the same weighting — commonality leads,
 * difficulty tilts, familiarity nudges — but applied to the individual item, so
 * a hard sentence is prioritised for a strong learner wherever it lives.
 *
 * Still a ranking over everything unseen, never a filter: items only leave the
 * pool by being learned, so the easy material remains waiting however good you
 * get.
 */
/**
 * Head start for material the learner added themselves.
 *
 * Their own words are usually names, local things and in-jokes — exactly the
 * vocabulary a frequency corpus scores as rare, which would bury it at the very
 * back of a 3,000-item ranking and never bring it up. Someone who typed a
 * phrase in has already said they want it. Big enough to clear the long tail,
 * small enough that the true everyday basics still come first.
 */
const OWN_MATERIAL_BONUS = 0.35;

export function itemPriority(input: {
  /** From sentenceCommonality — roughly 300 (everyday) to 5000 (rare). */
  commonality: number;
  difficulty: AbilityBand;
  ability: AbilityBand;
  /** The learner added this one themselves. */
  own?: boolean;
  /** Authored offset for unseen material only: negative sooner, positive later. */
  lessonPriority?: number;
}): number {
  const commonality = Math.min(1, Math.max(0, (input.commonality - 300) / 4700));
  // bandDistance carries the same rule the pack-level scorer used: overshooting
  // costs more than undershooting, because a beginner handed a C1 sentence is
  // stuck while a strong learner handed an easy one merely breezes it.
  const misfit = Math.min(1, bandDistance(input.ability, input.difficulty) / 6);
  const base = commonality * 0.65 + misfit * 0.35;
  const authored = Number.isFinite(input.lessonPriority)
    ? Math.max(-1, Math.min(1, Number(input.lessonPriority)))
    : 0;
  return (input.own ? base - OWN_MATERIAL_BONUS : base) + authored;
}

/** Short, honest description of what the app is doing, for the UI. */
