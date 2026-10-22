// Guided session engine — every step is a full sentence exercise

import { isDueForReview, isSnoozed, overdueBy } from "@/lib/memoryStrength";
import { packMeta } from "@/lib/curriculum";
import { conversationPriorityScore } from "@/lib/conversationPriority";
import { sentenceCommonality } from "@/lib/corpusFrequency";
import { getLearningMode, phraseForLearningMode } from "@/lib/learningMode";
import { matchingVisibleKeys, sentenceIdentityKey, takeMatchingSafe } from "@/lib/germanTextMatch";
import {
  adaptiveRepeatPriority,
  isAdaptiveReinforcementEligible,
  isSameDayCheckEligible,
  isAttemptedPracticeEligible,
} from "@/lib/adaptivePractice";

const EX = {
  SENTENCE: "sentence",   // read + listen + choose + type a full sentence
  DIALOGUE: "dialogue",   // line-by-line conversation practice
  COMPLETE: "complete",
};

function hasSentenceShape(text: string) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length >= 1;
}

function stableIdPart(value: any) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function getVocabId(partKey: string, word: any, index: number) {
  if (word?.id) return String(word.id);
  const semanticKey = word?.lookup || word?.de || word?.word || index;
  return `${partKey}-vocab-${stableIdPart(semanticKey)}`;
}

function findRecord(reviewState: any, itemId: string, aliases: string[] = []) {
  for (const id of [itemId, ...aliases]) {
    const rec = reviewState?.[id];
    if (rec?.lastGrade) return rec;
  }
  return undefined;
}

// "Known" only holds until the item's spaced-repetition review comes due —
// then it re-enters lessons as a review.
function isKnownItem(reviewState: any, itemId: string, aliases: string[] = []) {
  const rec = findRecord(reviewState, itemId, aliases);
  return rec?.lastGrade === "know" && !isDueForReview(rec);
}

/**
 * Build a session where every step is a full-sentence exercise.
 * Every sentence is hand-written: vocab words appear only through their
 * predefined example sentences; phrases and dialogue lines are used as-is.
 */
export function buildSession(part: any, _studyItems: any[], reviewState: any, _reviewStep: number) {
  const partKey = part.partKey ?? "part";
  const vocab: any[]     = part.vocab     ?? [];
  const phrases: any[]   = part.phrases   ?? [];
  const dialogues: any[] = part.dialogues ?? [];
  const learningMode = getLearningMode();

  const queue: any[] = [];
  const usedSentences = new Set<string>();
  // Niche/casual packs label every item so uncommon German is never
  // mistaken for the everyday thing to say.
  const tierNote = packMeta(partKey).note;
  const coachingLanguage = part.coachingLanguage;

  /**
   * How well this phrase is already known, so a lesson can stop drilling
   * something the learner has recalled correctly several times running.
   *
   * "strong" needs BOTH a real run of successes and a spacing interval that
   * only comes from surviving earlier reviews or from the learner declaring it
   * known outright (recordDeclaredKnown) — one lucky correct answer cannot
   * reach it, and a struggle resets the run to zero (see recordSuccess).
   */
  const masteryOf = (rec: any): "new" | "learning" | "strong" => {
    if (!rec || rec.lastGrade !== "know") return rec ? "learning" : "new";
    // Stored, a permanent item's Infinity interval is null — not "learning".
    if (rec.permanent) return "strong";
    const successes = Number(rec.successes) || 0;
    const interval = Number(rec.intervalDays) || 0;
    if (successes >= 3 && interval >= 10) return "strong";
    return "learning";
  };

  const addSentence = (de: string, en: string, id: string, aliases: string[] = [], fr?: string, use?: string, lookup?: string, short?: string, when?: string, say?: string, long?: string, group?: string, lessonPriority?: number, shortLabel?: string, buildsOn?: string, originalDe?: string) => {
    // Keyed so a closing "." and "!" cannot count as two sentences.
    const key = sentenceIdentityKey(de).toLowerCase();
    if (usedSentences.has(key)) return;
    // Claim this sentence text up front, even if we're about to skip it for being
    // known. The same German sentence appears in the data under several ids (e.g.
    // as a vocab example AND a phrase). Without claiming it here, marking one copy
    // "known" would skip that id but let an identical sentence with a different id
    // slip back in on the next session.
    usedSentences.add(key);
    const rec = findRecord(reviewState, id, aliases);
    const progressRecord = findProgressRecord(reviewState, id, aliases);
    const item = {
      id, aliases, de, en, fr, use, lookup, tierNote, coachingLanguage,
      short, shortLabel, when, say, long, group, lessonPriority, partKey,
      buildsOn, originalDe,
      kind: lookup ? "vocab" : "phrase",
      level: part.level, mastery: masteryOf(progressRecord),
    };
    // Snoozing is the learner's own decision about when to see this again, so
    // it outranks every reason the app has for showing it sooner — a struggle
    // mark, adaptive reinforcement, an unfinished attempt, and being new.
    //
    // Checked against progressRecord, NOT rec: rec only exists once something
    // has been GRADED, so putting off a phrase you have never answered wrote a
    // record that nothing here could see. That is the whole reason a put-off
    // new sentence came straight back on the next Continue Learning.
    if (isSnoozed(progressRecord)) return;
    if (isAttemptedPracticeEligible(progressRecord)) {
      // Reaching and answering a sentence makes it familiar, even when the
      // learner skips before earning a grade. Bring it back quickly without
      // spending one of the lesson's three genuinely new slots.
      queue.push({
        type: EX.SENTENCE,
        review: true,
        reviewReason: "attempted",
        optionalPractice: true,
        repeatPriority: adaptiveRepeatPriority(progressRecord, item),
        interval: 0,
        item,
      });
      return;
    }
    if (rec?.lastGrade === "struggle") {
      queue.push({ type: EX.SENTENCE, review: true, reviewReason: "struggle", interval: 0, item });
      return;
    }
    if (rec?.lastGrade === "know") {
      if (!isDueForReview(rec)) {
        // Learned earlier today: offer it back as the closed-book check, so a
        // sitting on day one has something to test rather than only new
        // material. Worth half a rung, and the due date does not move.
        if (isSameDayCheckEligible(rec)) {
          queue.push({
            type: EX.SENTENCE,
            review: true,
            reviewReason: "same-day",
            reinforcement: true,
            interval: rec.intervalDays ?? 1,
            item,
          });
          return;
        }
        if (!isAdaptiveReinforcementEligible(rec, item)) return;
        // Difficult sentences and phrases with repeated wrong attempts can use
        // a familiar slot before their formal SRS date. This is optional
        // reinforcement only: it never moves the mastery due date.
        queue.push({
          type: EX.SENTENCE,
          review: true,
          reviewReason: "adaptive",
          reinforcement: true,
          repeatPriority: adaptiveRepeatPriority(rec, item),
          interval: rec.intervalDays ?? 1,
          item,
        });
        return;
      }
      // interval = how many days it's currently spaced by (1 = learned ~a day
      // ago and weakest; larger = higher mastery). The review picker uses it to
      // favour recent phrases and mix in one older one.
      queue.push({ type: EX.SENTENCE, review: true, overdue: overdueBy(rec), interval: rec.intervalDays ?? 1, item });
      return;                                            // due — back in as a review
    }
    queue.push({ type: EX.SENTENCE, item });
  };

  // ── Vocab words ──────────────────────────────────────────────
  // Hand-written example sentences ONLY. Words without a predefined example
  // (and its predefined translation) are skipped — no fabricated carrier
  // drills ("Ich sehe den …"), no guessed translations.
  vocab.forEach((word, i) => {
    const id = getVocabId(partKey, word, i);
    const aliases = [`${partKey}-vocab-${i}`];
    if (hasSentenceShape(word.example) &&
        word.example.trim().toLowerCase() !== word.de.trim().toLowerCase() &&
        word.exampleEn?.trim()) {
      addSentence(word.example, word.exampleEn, id, aliases, word.exampleFr, word.use, word.lookup ?? word.de);
    }
  });

  // ── Phrases ──────────────────────────────────────────────────
  phrases.forEach((ph, i) => {
    if (!hasSentenceShape(ph.de)) return;
    const lessonPhrase = phraseForLearningMode(ph, learningMode);
    addSentence(
      lessonPhrase.de,
      lessonPhrase.en,
      // Bundled phrases have no id and stay index-keyed. Learner-added ones
      // carry their own, because deleting one from the middle of a custom pack
      // would otherwise shift every id after it onto the wrong word, handing
      // them somebody else's grade history.
      ph.id ?? `${partKey}-phrase-${i}`,
      [],
      lessonPhrase.fr,
      lessonPhrase.use,
      undefined,
      lessonPhrase.short,
      lessonPhrase.when,
      lessonPhrase.say,
      lessonPhrase.long,
      lessonPhrase.group,
      lessonPhrase.lessonPriority,
      lessonPhrase.shortLabel,
      // A phrase that extends one the learner already knows. Scoring places
      // it directly after its base, however the two packs are ranked.
      ph.buildsOn,
      ph.de
    );
  });

  // ── Dialogue lines ───────────────────────────────────────────
  dialogues.forEach((d, di) => {
    const usable = (d.lines ?? [])
      .map((line: any, li: number) => ({
        ...phraseForLearningMode(line, learningMode),
        originalIndex: li,
        // Legacy progress was keyed by the SOURCE German, before any
        // learning-mode rewriting existed. Building the alias from the
        // rewritten text instead would silently orphan that progress the
        // moment a mode changes the wording — which Conversation mode now
        // does for every spoken ich-form.
        originalDe: line?.de ?? "",
        id: line?.id ?? `${partKey}-dlg-${di}-${li}`,
      }))
      .filter((line: any, li: number) => {
        if (!hasSentenceShape(line.de)) return false;
        const legacyDialogueId = `dialogue-${d?.title ?? "line"}-${li}-${line.originalDe}`;
        if (!isKnownItem(reviewState, line.id, [legacyDialogueId])) return true;
        const rec = findRecord(reviewState, line.id, [legacyDialogueId]);
        return isAdaptiveReinforcementEligible(rec, { ...line, level: part.level });
      });
    const newDialogueLines = usable.filter((line: any) => {
      const legacyDialogueId = `dialogue-${d?.title ?? "line"}-${line.originalIndex}-${line.originalDe}`;
      const progressRecord = findProgressRecord(reviewState, line.id, [legacyDialogueId]);
      // Dialogue capstones only contain genuinely unseen lines. Attempted,
      // struggling and adaptive-known lines still receive their individual
      // sentence drill, but completing a fresh dialogue must not accidentally
      // promote their spaced-review grade.
      return !progressRecord?.lastGrade && !isAttemptedPracticeEligible(progressRecord);
    });
    if (newDialogueLines.length >= 2) {
      // First show the full dialogue for context
      // A difficult known line may return as an individual adaptive review,
      // but it must not be smuggled into a fresh-dialogue capstone: completing
      // that dialogue would otherwise advance its formal SRS schedule.
      queue.push({ type: EX.DIALOGUE, dialogue: { ...d, coachingLanguage, lines: newDialogueLines } });
    }
    // Then drill each new or adaptively selected line as a sentence exercise.
    usable.forEach((line: any) => {
      const legacyDialogueId = `dialogue-${d?.title ?? "line"}-${line.originalIndex}-${line.originalDe}`;
      addSentence(
        line.de,
        line.en,
        line.id,
        [`${partKey}-dlg-${di}-${line.originalIndex}`, legacyDialogueId],
        line.fr,
        line.use,
        undefined,
        line.short,
        line.when,
        line.say,
        line.long,
        line.group,
        line.lessonPriority,
        line.shortLabel
      );
    });
  });

  // ── New phrases: 3 per lesson, most common first, no in-lesson repeat ──
  // A phrase is shown ONCE when new. Its repetition now happens ACROSS
  // lessons: it returns tomorrow as an "old" review, and the spaced-repetition
  // ladder pushes it further out each time you recall it (1, 3, 10, 30, 180
  // days) — so it takes longer and longer to come back as you master it.
  // Reviews win a visible-answer collision because their schedule is
  // time-sensitive. Fresh selection then scans farther down the pack to fill
  // its slots without producing an impossible Quick Match round.
  const dueSteps = queue.filter((s) => s.review);
  const lessonMix = lessonMixForBacklog(dueSteps.length);
  const reviews = pickReviews(dueSteps, lessonMix.reviewSlots);
  const reviewKeys = reviews.flatMap(matchingKeysForStep);
  // Bases a chained phrase may point at: every sentence this pack teaches,
  // scored the same way the fresh queue is, learned or not. A known base is
  // exactly the interesting case — its extension should arrive next.
  const packBaseScores = new Map<string, number>();
  const notePackBase = (de: unknown, kind: "vocab" | "phrase" | "dialogue", lessonPriority?: number) => {
    const text = String(de ?? "").trim();
    if (!text) return;
    const score = conversationPriorityScore({
      partKey, kind,
      commonality: sentenceCommonality(text, null),
      lessonPriority,
    });
    const key = sentenceIdentityKey(text).toLowerCase();
    const prev = packBaseScores.get(key);
    if (prev == null || score < prev) packBaseScores.set(key, score);
  };
  phrases.forEach((ph) => notePackBase(ph?.de, "phrase", ph?.lessonPriority));
  vocab.forEach((word) => notePackBase(word?.example, "vocab"));
  dialogues.forEach((d) => (d.lines ?? []).forEach((line: any) => notePackBase(line?.de, "dialogue")));

  const freshRows = queue
    .filter((s) => s.type === EX.SENTENCE && !s.review)
    .map((step, index) => ({
      step,
      index,
      de: String(step.item?.de ?? ""),
      originalDe: step.item?.originalDe ? String(step.item.originalDe) : undefined,
      buildsOn: step.item?.buildsOn ? String(step.item.buildsOn) : undefined,
      score: conversationPriorityScore({
        partKey,
        kind: step.item?.kind,
        commonality: sentenceCommonality(step.item?.de ?? "", null),
        lessonPriority: step.item?.lessonPriority,
      }),
    }));
  resolveChainScores(freshRows, packBaseScores);
  const freshSentences = pickFresh(
    orderWithChains(
      freshRows.sort((a, b) => a.score - b.score || a.index - b.index)
    ).map(({ step }) => step),
    lessonMix.freshSlots,
    reviewKeys
  );
  const servedDe = new Set(freshSentences.map((s) => String(s.item?.de ?? "").trim().toLowerCase()));

  // ── Dialogues are capstones, placed right after their lines are drilled ──
  // Only run a dialogue when a line of it was drilled this lesson, so a capped
  // lesson never opens a conversation whose lines you haven't seen.
  const newBlock: any[] = [...freshSentences];
  const dialogueSteps = queue
    .filter((s) => s.type === EX.DIALOGUE)
    .filter((d: any) => dialogueIsEarned(d, servedDe));
  for (const d of dialogueSteps) {
    const lineTexts = new Set(
      (d.dialogue?.lines ?? []).map((l: any) => String(l.de ?? "").trim().toLowerCase())
    );
    let lastIdx = -1;
    newBlock.forEach((s, i) => {
      if (s.type === EX.SENTENCE && lineTexts.has(String(s.item?.de ?? "").trim().toLowerCase())) lastIdx = i;
    });
    if (lastIdx === -1) newBlock.push(d);
    else newBlock.splice(lastIdx + 1, 0, d);
  }

  // 3 new, then 3 old.
  const ordered = [...newBlock, ...reviews];
  ordered.push({ type: EX.COMPLETE });
  return ordered;
}

/**
 * May this conversation run yet?
 *
 * A capstone used to open on ONE of its lines being taught, which meant the
 * rest arrived with it however far down the course they sat: across the 634
 * conversations, the median gap between a conversation's earliest and latest
 * line is 6,382 places and 79% reach more than 2,000 places ahead. That is how
 * "Ich war ein totaler Streber - fast nur Einsen im Zeugnis." (10,250th of
 * 12,647 by how commonly it is said) turned up in the second lesson of its
 * pack: it shares a conversation with a line ranked 3,563rd.
 *
 * Most of the conversation now has to be on the table before it runs. Lines
 * still get their own drill in ranked order, so the conversation assembles
 * over a few lessons rather than arriving whole and early.
 */
export function dialogueIsEarned(step: any, servedDe: ReadonlySet<string>): boolean {
  const lines = (step?.dialogue?.lines ?? [])
    .map((l: any) => String(l?.de ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (!lines.length) return false;
  const served = lines.filter((text: string) => servedDe.has(text)).length;
  return served >= Math.ceil(lines.length / 2);
}

/**
 * How a sitting splits its six slots between reviews and new material.
 *
 * A sitting is at most SIX sentences. The first cut of the backlog fix grew
 * a session to eleven, which is the failure this rule exists to prevent:
 * three reviews and three new things, and extended sentences
 * in the next continue learning". So the session never grows; instead, a due
 * backlog TRADES new-material slots for review slots. That drains review
 * debt just as surely — every review served is a review served, and every
 * new phrase NOT introduced is future debt not banked — while a sitting
 * stays a sitting.
 *
 *   quiet (≤3 due)     3 reviews + 3 new
 *   building (4-9)     4 reviews + 2 new
 *   loaded (10+)       5 reviews + 1 new — something new every day, always
 */
export function lessonMixForBacklog(dueCount: number): { reviewSlots: number; freshSlots: number } {
  const due = Math.max(0, Math.floor(dueCount));
  if (due >= 10) return { reviewSlots: 5, freshSlots: 1 };
  if (due >= 4) return { reviewSlots: 4, freshSlots: 2 };
  return { reviewSlots: OLD_PER_LESSON, freshSlots: NEW_PER_LESSON };
}

/** At most NEW_PER_LESSON brand-new phrases per lesson. */
const NEW_PER_LESSON = 3;
/** At most OLD_PER_LESSON due reviews per lesson. */
const OLD_PER_LESSON = 3;

/**
 * A newly learned phrase may return in the familiar half before tomorrow's
 * formal review, but only while it is still on the first two ladder rungs.
 * Items explicitly declared known start near the top of the ladder, so this
 * deliberately honours "Know it" and leaves those items alone until due.
 */
export function isReinforcementEligible(record: any, now = Date.now()): boolean {
  if (!record || record.lastGrade !== "know" || record.permanent || isDueForReview(record, now)) return false;
  // isDueForReview is false for a snoozed item, so without this a phrase put
  // off by hand would qualify for the familiar half by virtue of being put off.
  if (isSnoozed(record, now)) return false;
  // Old installs stored only { lastGrade, updatedAt }. There is no evidence
  // that those items were explicitly skipped, so let them occupy the familiar
  // half and rotate without changing their inferred review schedule.
  if (record.successes == null && record.intervalDays == null) return true;
  const successes = Number(record.successes);
  const intervalDays = Number(record.intervalDays);
  return Number.isFinite(successes)
    && Number.isFinite(intervalDays)
    && successes > 0
    && successes <= 2
    && intervalDays <= 3;
}

function findProgressRecord(reviewState: any, itemId: string, aliases: string[] = []) {
  const ids = [itemId, ...aliases];
  const graded = ids.map((id) => reviewState?.[id]).find((rec) => rec?.lastGrade);
  return graded ?? ids.map((id) => reviewState?.[id]).find((rec) => rec && typeof rec === "object");
}

/**
 * When a selected phrase belongs to a related set, keep the rest of the lesson
 * in that set where possible. This teaches contrasts such as Bis gleich / Bis
 * später / Bis bald together instead of scattering them across the course.
 */
const matchingPairForStep = (step: any) => ({
  german: String(step?.item?.de ?? ""),
  english: String(step?.item?.en ?? ""),
});

const matchingKeysForStep = (step: any) => {
  const pair = matchingPairForStep(step);
  return matchingVisibleKeys(pair.german, pair.english);
};

export function pickFresh(fresh: any[], n: number, blockedKeys: Iterable<string> = []): any[] {
  const first = fresh[0];
  const group = first?.item?.group;
  if (!group) return takeMatchingSafe(fresh, n, matchingPairForStep, blockedKeys);

  const related = fresh.filter((step) => step.item?.group === group);
  const others = fresh.filter((step) => step.item?.group !== group);
  return takeMatchingSafe([...related, ...others], n, matchingPairForStep, blockedKeys);
}

/**
 * Choose which due reviews to show. Favours the WEAKEST memories (shortest
 * spacing interval — usually phrases learned a day or two ago) for most of the
 * slots, and reserves one slot for a more-mastered OLDER phrase, so a lesson's
 * "old" half is mostly recent with an occasional long-tail review. Deduped by
 * both visible matching columns; ties are broken by most-overdue.
 */
/**
 * Chained phrases take their place in the queue from their base.
 *
 * A sentence marked `buildsOn` extends one the learner meets earlier —
 * "Ich weiß nicht." grows into "Ich weiß nicht, ob ich das schaffe." Scored
 * on its own merits the longer sentence lands thousands of places later and
 * the connection is lost; scored as base + 1 it is served immediately after
 * its base, which is where extending a thought actually teaches something.
 *
 * Rows are mutated in place. Bases may be rows themselves or already-known
 * sentences supplied via `externalBaseScores` (keyed by sentenceIdentityKey,
 * lower-cased, on both the served and the authored wording — learning modes
 * rewrite one but not the other). Chains resolve up to three links deep; an
 * unresolvable buildsOn leaves the row's own score untouched.
 */
/**
 * Derive the chains nobody authored.
 *
 * `buildsOn` was hand-written onto a few dozen phrases, but the course is
 * full of unmarked chains: "Ich", then "Ich habe", then
 * "Ich habe ein Fahrrad", each a complete thought on its own. When one
 * unseen sentence is a word-boundary prefix of another, the longer one IS
 * an extension of the shorter, and serving them together teaches the growth
 * of the sentence the same way the authored chains do.
 *
 * Rules, conservative on purpose:
 *  - authored buildsOn always wins; this only fills blanks;
 *  - the base must be PRESENT in the same unseen pool — chaining onto a
 *    sentence learned long ago would let thousands of extensions inherit an
 *    old low score and flood the queue;
 *  - the longest present prefix wins, so three-step chains resolve link by
 *    link exactly like authored ones;
 *  - the extension may add at most four words. "Ich habe" growing into
 *    "Ich habe ein Fahrrad" is a teaching step; growing into a fourteen-word
 *    subordinate clause is a different sentence that must earn its own rank.
 */
export function deriveImplicitChains<T extends { de?: string; originalDe?: string; buildsOn?: string; score?: number }>(
  rows: T[]
): void {
  // The question mark is stripped for CHAIN matching only. Identity keys
  // keep it (a statement and a question are different sentences), but for
  // ordering, "Wie geht es?" is plainly the base "Wie geht es dir?" grows
  // from — and with the ? in the key, no question could ever be a base.
  const keyOf = (text: unknown) => sentenceIdentityKey(String(text ?? "")).toLowerCase().replace(/\?+$/, "").trim();
  const deByKey = new Map<string, { de: string; score?: number }>();
  for (const row of rows) {
    for (const text of [row.de, row.originalDe]) {
      const key = keyOf(text);
      if (key.length < 2) continue;
      const existing = deByKey.get(key);
      if (!existing || (row.score != null && (existing.score == null || row.score < existing.score))) {
        deByKey.set(key, { de: String(text), score: row.score });
      }
    }
  }
  const implicit: Array<{ row: T; baseDe: string; extraTokens: number }> = [];
  for (const row of rows) {
    if (row.buildsOn) continue;
    const rowKey = keyOf(row.de);
    const tokens = rowKey.split(/\s+/);
    if (tokens.length < 2) continue;
    // Longest prefix first; stop at the four-words-added bound.
    for (let cut = tokens.length - 1; cut >= Math.max(1, tokens.length - 4); cut -= 1) {
      const prefix = tokens.slice(0, cut).join(" ")
        // A base ending mid-clause carries its comma in the identity key
        // ("ich weiß nicht," …) — strip trailing punctuation the way the
        // key itself strips it at sentence end.
        .replace(/[,;:]+$/, "");
      const base = deByKey.get(prefix);
      // A chain pulls its extension BACK to a base served earlier — it must
      // never push a well-ranked sentence later. If the base scores worse
      // than the extension (chain inheritance would demote it), no link.
      if (base !== undefined && prefix !== rowKey
        && !(base.score != null && row.score != null && base.score > row.score)) {
        implicit.push({ row, baseDe: base.de, extraTokens: tokens.length - cut });
        break;
      }
    }
  }
  // At most three derived extensions per base, closest steps first. "Ich
  // weiß nicht." is the prefix of NINETY-FIVE course sentences; gluing them
  // all behind it would turn the course into a wall of one opening. The
  // shortest continuations are the teaching steps; the rest keep their own
  // rank and arrive when they earn it.
  const perBase = new Map<string, Array<{ row: T; baseDe: string; extraTokens: number }>>();
  for (const link of implicit) {
    const list = perBase.get(link.baseDe) ?? [];
    list.push(link);
    perBase.set(link.baseDe, list);
  }
  for (const list of perBase.values()) {
    list.sort((a, b) => a.extraTokens - b.extraTokens);
    for (const link of list.slice(0, 3)) link.row.buildsOn = link.baseDe;
  }
}

export function resolveChainScores(
  rows: Array<{ score: number; de?: string; originalDe?: string; buildsOn?: string }>,
  externalBaseScores?: Map<string, number>
): void {
  const keyOf = (text: unknown) => sentenceIdentityKey(String(text ?? "")).toLowerCase();
  for (let pass = 0; pass < 3; pass += 1) {
    const scoreOf = new Map<string, number>(externalBaseScores ?? []);
    for (const row of rows) {
      for (const key of [keyOf(row.de), keyOf(row.originalDe ?? row.de)]) {
        if (!key) continue;
        const prev = scoreOf.get(key);
        if (prev == null || row.score < prev) scoreOf.set(key, row.score);
      }
    }
    // Which identities are still queued as rows: a base that is present must
    // come before its extension (+1); a base already learned and gone leaves
    // its extension standing exactly in its place (+0), so a tied stranger
    // cannot slot in between the learned base and its follow-up.
    const rowKeys = new Set<string>();
    for (const row of rows) {
      rowKeys.add(keyOf(row.de));
      rowKeys.add(keyOf(row.originalDe ?? row.de));
    }
    let changed = false;
    for (const row of rows) {
      if (!row.buildsOn) continue;
      const baseKey = keyOf(row.buildsOn);
      const base = scoreOf.get(baseKey);
      if (base == null) continue;
      const want = rowKeys.has(baseKey) ? base + 1 : base;
      if (row.score !== want) {
        row.score = want;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * Score-sorted rows, with every chained row pulled directly behind its base.
 *
 * Score inheritance alone cannot guarantee adjacency: short bases often TIE
 * (identical commonality, same pack), and a sort puts all tied bases before
 * all their +1 extensions, splitting every pair. This pass walks the sorted
 * order and, after emitting a row, emits whatever builds on it — so a chain
 * holds together whatever the scores say, and rows without chains keep their
 * exact sorted positions.
 */
export function orderWithChains<T extends { de?: string; originalDe?: string; buildsOn?: string }>(
  sorted: T[]
): T[] {
  const keyOf = (text: unknown) => sentenceIdentityKey(String(text ?? "")).toLowerCase();
  const byBase = new Map<string, T[]>();
  for (const row of sorted) {
    if (!row.buildsOn) continue;
    const key = keyOf(row.buildsOn);
    const list = byBase.get(key);
    if (list) list.push(row);
    else byBase.set(key, [row]);
  }
  if (!byBase.size) return sorted;
  const emitted = new Set<T>();
  const out: T[] = [];
  const emit = (row: T, depth: number) => {
    if (emitted.has(row)) return;
    emitted.add(row);
    out.push(row);
    if (depth >= 3) return;
    for (const key of [keyOf(row.de), keyOf(row.originalDe ?? row.de)]) {
      for (const follower of byBase.get(key) ?? []) emit(follower, depth + 1);
    }
  };
  for (const row of sorted) emit(row, 0);
  return out;
}

export function pickReviews(
  due: any[],
  n: number,
  blockedKeys: Iterable<string> = [],
  /**
   * Reviews the sitting would rather have, ahead of weaker ones: in
   * conversation order, the lines of the conversation the fresh exchange is
   * from. A preference, not a filter — when nothing due fits, the weakest
   * come as they always did.
   */
  prefer: (step: any) => boolean = () => false
): any[] {
  const isOptionalFamiliar = (step: any) => Boolean(
    step?.reinforcement || step?.optionalPractice || step?.reviewReason === "attempted"
  );
  const weakestFirst = [...due].sort((a, b) =>
    Number(prefer(b)) - Number(prefer(a))
    || Number(isOptionalFamiliar(a)) - Number(isOptionalFamiliar(b))
    || (a.interval ?? 1) - (b.interval ?? 1)
    || (b.repeatPriority ?? 0) - (a.repeatPriority ?? 0)
    || (b.overdue ?? 0) - (a.overdue ?? 0)
  );
  const uniquePool = takeMatchingSafe(
    weakestFirst,
    weakestFirst.length,
    matchingPairForStep,
    blockedKeys
  );
  // Optional adaptive/attempted reps never displace formal due reviews.
  const formalReviews = uniquePool.filter((step) => !isOptionalFamiliar(step));
  const uniqueWeakest = formalReviews.length >= n ? formalReviews : uniquePool;
  if (uniqueWeakest.length <= n) return uniqueWeakest;
  
  const firstGroup = uniqueWeakest[0]?.item?.group;
  if (firstGroup) {
    const groupMatches = uniqueWeakest.filter((r) => r.item?.group === firstGroup);
    if (groupMatches.length > 1) {
      const rest = uniqueWeakest.filter((r) => r.item?.group !== firstGroup);
      return [...groupMatches, ...rest].slice(0, n);
    }
  }

  const picks: any[] = uniqueWeakest.slice(0, Math.max(0, n - 1));   // n-1 most-recent/weakest
  const has = (r: any) => picks.includes(r);
  const older = [...uniqueWeakest]
    .sort((a, b) => (b.interval ?? 1) - (a.interval ?? 1) || (b.overdue ?? 0) - (a.overdue ?? 0))
    .find((r) => !has(r));                                          // one most-mastered, not already picked
  if (older) picks.push(older);
  for (const r of uniqueWeakest) { if (picks.length >= n) break; if (!has(r)) picks.push(r); }  // backfill
  return picks.slice(0, n);
}

/** Urgent attempts first; within each kind, rotate the least-recently seen. */
export function rankReinforcementCandidates<T extends { successes: number; lastPractised: number; index: number; practiceUrgency?: number; repeatPriority?: number }>(
  candidates: T[]
): T[] {
  return [...candidates].sort((a, b) =>
    (b.practiceUrgency ?? 0) - (a.practiceUrgency ?? 0)
    || a.lastPractised - b.lastPractised
    || (b.repeatPriority ?? 0) - (a.repeatPriority ?? 0)
    || a.successes - b.successes
    || a.index - b.index
  );
}

/**
 * Build Continue Learning's review and fresh halves without letting a weak
 * backlog consume the whole lesson. Explicit struggles own the first review
 * slots, ordinary due reviews come next, and weak recently learned phrases
 * backfill any remaining familiar slots. Genuinely new phrases are selected
 * independently. Visible primary answers are deduped across BOTH languages,
 * because Quick Match can be flipped in either direction.
 */
/**
 * Which struggles go first.
 *
 * The phrase you failed most recently leads. That is usually the one the pet
 * just asked about, or the one you pressed Struggle on last lesson, and being
 * told "I'll bring that back" and then not seeing it for weeks is the fastest
 * way to stop trusting the app.
 *
 * Only the lead is claimed by recency. The rest run longest-waiting first, so
 * an older backlog still drains instead of being buried under every new miss.
 */
export function orderStrugglingReviews(struggling: any[]): any[] {
  if (struggling.length <= 1) return [...struggling];
  const at = (step: any) => Number(step?.struggledAt) || 0;
  const byOldest = [...struggling].sort((a, b) => at(a) - at(b));
  const newest = [...struggling].sort((a, b) => at(b) - at(a))[0];
  if (!at(newest)) return byOldest;
  return [newest, ...byOldest.filter((step) => step !== newest)];
}

export function selectContinueLearningMix(
  rankedFresh: any[],
  struggling: any[],
  due: any[],
  freshLimit = NEW_PER_LESSON,
  reviewLimit = OLD_PER_LESSON,
  reinforcement: any[] = [],
  _targetField: "de" | "en" = "de",
  /** Reviews to take ahead of weaker ones when they are due — see pickReviews. */
  prefer: (step: any) => boolean = () => false
): { fresh: any[]; reviews: any[] } {
  const takeUnique = (steps: any[], limit: number, blocked = new Set<string>()) => {
    return takeMatchingSafe(steps, limit, matchingPairForStep, blocked);
  };

  // Struggles are required and keep their own order; the preference decides
  // among what is merely due, and among reinforcement.
  const priorityReviews = takeUnique(orderStrugglingReviews(struggling), reviewLimit);
  const selectedReviewKeys = new Set(priorityReviews.flatMap(matchingKeysForStep));
  const duePool = takeUnique(due, due.length, selectedReviewKeys);
  const dueReviews = pickReviews(
    duePool,
    Math.max(0, reviewLimit - priorityReviews.length),
    selectedReviewKeys,
    prefer
  );
  const scheduledReviews = [...priorityReviews, ...dueReviews];
  const scheduledReviewKeys = new Set(scheduledReviews.flatMap(matchingKeysForStep));
  const preferredFirst = [...reinforcement].sort((a, b) => Number(prefer(b)) - Number(prefer(a)));
  const reinforcementReviews = takeUnique(
    preferredFirst,
    Math.max(0, reviewLimit - scheduledReviews.length),
    scheduledReviewKeys
  );
  const reviews = [...scheduledReviews, ...reinforcementReviews];
  const reviewKeys = new Set(reviews.flatMap(matchingKeysForStep));
  const fresh = takeUnique(rankedFresh, freshLimit, reviewKeys);

  return { fresh, reviews };
}

/**
 * Replace a preview card without introducing German or English text already
 * visible in another card. Candidates remain curriculum-ranked; the active
 * pack wins when it has a safe replacement, then the global list backfills it.
 */
export function pickPreviewReplacement(
  candidates: any[],
  blockedPairs: Iterable<{ de: string; en: string }>,
  preferredPart?: string
) {
  const blocked = new Set(
    Array.from(blockedPairs).flatMap((pair) => matchingVisibleKeys(pair.de, pair.en))
  );
  const available = takeMatchingSafe(
    candidates,
    candidates.length,
    (item) => ({ german: String(item?.de ?? ""), english: String(item?.en ?? "") }),
    blocked
  );
  return available.find((item) => item.partKey === preferredPart) ?? available[0];
}

// ── Catalog of every learnable item (for the word/sentence tracker) ──
export type CatalogItem = {
  id: string;
  aliases?: string[];
  de: string;
  en: string;
  kind: "vocab" | "phrase" | "dialogue";
  partKey: string;
  partLabel: string;
  level?: string;
  lookup?: string;
  /** usage context from the data, e.g. "Informal", "Asking the time" */
  use?: string;
  fr?: string;
  short?: string;
  shortLabel?: string;
  when?: string;
  say?: string;
  long?: string;
  group?: string;
  lessonPriority?: number;
  tierNote?: string;
  coachingLanguage?: "de" | "en" | "both";
  /** Sentence this one extends; scoring serves it right after its base. */
  buildsOn?: string;
  /** Authored wording, kept because learning modes rewrite `de`. */
  originalDe?: string;
};

/**
 * Produce every learnable item for a part using the SAME stable IDs that
 * buildSession assigns, so the tracker and the lesson engine stay in sync.
 */
export function buildPartCatalog(part: any, partKey: string): CatalogItem[] {
  const vocab: any[]     = part?.vocab     ?? [];
  const phrases: any[]   = part?.phrases   ?? [];
  const dialogues: any[] = part?.dialogues ?? [];
  const partLabel = part?.theme ?? part?.label ?? partKey;
  const level = part?.level;
  const tierNote = packMeta(partKey).note;
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  const learningMode = getLearningMode();

  const push = (
    de: string,
    en: string,
    id: string,
    kind: CatalogItem["kind"],
    lookup?: string,
    aliases: string[] = [],
    use?: string,
    coaching: Partial<Pick<CatalogItem, "fr" | "short" | "shortLabel" | "when" | "say" | "long" | "group" | "lessonPriority" | "buildsOn" | "originalDe">> = {}
  ) => {
    const key = sentenceIdentityKey(de).toLowerCase();
    if (!de.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ id, aliases, de, en, kind, partKey, partLabel, level, lookup, use, tierNote, coachingLanguage: part?.coachingLanguage, ...coaching });
  };

  // Hand-written examples only — mirrors buildSession, so the tracker
  // never lists a sentence the lessons cannot teach.
  vocab.forEach((word, i) => {
    const id = getVocabId(partKey, word, i);
    const aliases = [`${partKey}-vocab-${i}`];
    if (hasSentenceShape(word.example) &&
        word.example.trim().toLowerCase() !== word.de.trim().toLowerCase() &&
        word.exampleEn?.trim()) {
      push(word.example, word.exampleEn, id, "vocab", word.lookup ?? word.de, aliases, word.use, {
        fr: word.exampleFr,
      });
    }
  });

  phrases.forEach((ph, i) => {
    if (!hasSentenceShape(ph.de)) return;
    const catalogPhrase = phraseForLearningMode(ph, learningMode);
    push(catalogPhrase.de, catalogPhrase.en, ph.id ?? `${partKey}-phrase-${i}`, "phrase", undefined, [], catalogPhrase.use, {
      fr: catalogPhrase.fr,
      short: catalogPhrase.short,
      shortLabel: catalogPhrase.shortLabel,
      when: catalogPhrase.when,
      say: catalogPhrase.say,
      long: catalogPhrase.long,
      group: catalogPhrase.group,
      lessonPriority: catalogPhrase.lessonPriority,
      buildsOn: ph.buildsOn,
      originalDe: ph.de,
    });
  });

  dialogues.forEach((d, di) => {
    (d.lines ?? []).forEach((line: any, li: number) => {
      if (!hasSentenceShape(line.de)) return;
      const catalogLine = phraseForLearningMode(line, learningMode);
      const id = line?.id ?? `${partKey}-dlg-${di}-${li}`;
      const legacyDialogueId = `dialogue-${d?.title ?? "line"}-${li}-${line?.de ?? ""}`;
      push(catalogLine.de, catalogLine.en, id, "dialogue", undefined, [`${partKey}-dlg-${di}-${li}`, legacyDialogueId], catalogLine.use, {
        fr: catalogLine.fr,
        short: catalogLine.short,
        shortLabel: catalogLine.shortLabel,
        when: catalogLine.when,
        say: catalogLine.say,
        long: catalogLine.long,
        group: catalogLine.group,
        lessonPriority: catalogLine.lessonPriority,
      });
    });
  });

  return out;
}

const answerAlternatives = (value: string): string[] => String(value ?? "")
  .split(/\s+\/\s+/u)
  .map((answer) => answer.trim())
  .filter(Boolean);

const mergeAnswerAlternatives = (primary: string, duplicate: string): string => {
  const answers: string[] = [];
  const seen = new Set<string>();
  for (const answer of [...answerAlternatives(primary), ...answerAlternatives(duplicate)]) {
    const key = sentenceIdentityKey(answer).toLocaleLowerCase("en-GB");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers.join(" / ");
};

/**
 * The same German sentence is authored in several packs, phrase banks and
 * dialogues. It is one thing for a learner to remember even when two sources
 * phrase its English gloss differently. Keep the earliest curriculum owner,
 * retain every valid English answer, and carry every later id as an alias so
 * existing progress follows the surviving card instead of disappearing.
 *
 * Words use their own lemma-aware catalogue builder; this function handles the
 * sentence/phrase/dialogue catalogue shared by the tracker, tests, games and
 * pet prompts.
 */
function dedupeCatalogItems(items: CatalogItem[]): CatalogItem[] {
  const out: CatalogItem[] = [];
  const byGerman = new Map<string, CatalogItem>();

  for (const item of items) {
    const key = sentenceIdentityKey(item.de).toLocaleLowerCase("de-DE");
    const existing = byGerman.get(key);
    if (!key || !existing) {
      const canonical = { ...item, aliases: [...(item.aliases ?? [])] };
      out.push(canonical);
      if (key) byGerman.set(key, canonical);
      continue;
    }

    existing.en = mergeAnswerAlternatives(existing.en, item.en);
    existing.aliases = [...new Set([
      ...(existing.aliases ?? []),
      item.id,
      ...(item.aliases ?? []),
    ])].filter((id) => id && id !== existing.id);
    if (!existing.short && item.short) existing.short = item.short;
    if (!existing.long && item.long) existing.long = item.long;
  }

  return out;
}

/**
 * One catalogue per parts map, shared by everyone who asks for it.
 *
 * Four separate places build this from the same object — the word tracker, the
 * tests bank, the games deck and the mascot's quiz pool — and each was walking
 * all 8,000 items again. The parts map is built once and then never mutated, so
 * its identity is a safe key; a WeakMap means it is collected with the map
 * rather than pinning the whole course in memory.
 *
 * The array is returned as-is rather than copied. Callers already treat it as
 * read-only (they filter and map, which allocate their own arrays), and copying
 * 8,000 items on every call would give back most of what the cache saves.
 */
const catalogCache = new WeakMap<object, { mode: string; items: CatalogItem[] }>();

export function buildCatalog(apiParts: Record<string, any>): CatalogItem[] {
  // The learning mode is part of the answer, not just of the input: it decides
  // whether a phrase is taught in its short spoken form or its full one. Keying
  // on the parts map alone would keep serving the old wording after the setting
  // changed, which is a far worse bug than the one being fixed.
  const mode = String(getLearningMode());
  const cacheable = Boolean(apiParts) && typeof apiParts === "object";
  if (cacheable) {
    const cached = catalogCache.get(apiParts);
    if (cached && cached.mode === mode) return cached.items;
  }
  const raw: CatalogItem[] = [];
  for (const [partKey, part] of Object.entries(apiParts ?? {})) {
    raw.push(...buildPartCatalog({ ...part, partKey }, partKey));
  }
  const out = dedupeCatalogItems(raw);
  if (cacheable) catalogCache.set(apiParts, { mode, items: out });
  return out;
}
