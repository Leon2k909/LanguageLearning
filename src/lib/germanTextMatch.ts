import { normalizeEnglishSpelling, variantGlossAlternatives } from "@/lib/englishVariant";
import { foldClockTimes, foldEnglishSynonyms } from "@/lib/englishSynonyms";

/**
 * Answer keys sometimes offer alternatives ("I like going to the cinema. / I
 * like going to the movies."). The UI shows only the FIRST (most common) one —
 * matching still accepts every alternative behind the scenes.
 */
export function primaryAnswer(s: string): string {
  return String(s ?? "").split(" / ")[0].trim();
}

const BRACKET_MASK = "\u0000";

/**
 * Everything inside brackets, blanked out.
 *
 * A separator inside brackets belongs to the note, not to a choice between
 * senses: "to catch (a ball or animal)" is one meaning with its use spelled
 * out, and cutting it at that "or" leaves "to catch (a ball" — an unfinished
 * phrase with a bracket hanging open. Sixteen cards read like that, among
 * them Schorle, Kapitän, Komödie and Abitur.
 *
 * Blanked rather than removed so every character keeps its position, and
 * blanked with a character no separator contains rather than with spaces:
 * a separator may begin with whitespace, so pad with spaces and "a (b) or c"
 * starts matching at the space after the a — swallowing the very bracket the
 * mask exists to protect.
 */
function maskBracketed(value: string): string {
  let depth = 0;
  let masked = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") {
      depth += 1;
      masked += BRACKET_MASK;
    } else if (character === ")") {
      if (depth > 0) depth -= 1;
      masked += BRACKET_MASK;
    } else {
      masked += depth > 0 ? BRACKET_MASK : character;
    }
  }
  return masked;
}

/**
 * Vocabulary glosses often name several equally valid senses, for example
 * "goal or aim" or "aim, destination". They are choices, not a phrase the
 * learner should have to reproduce in full. Sentence answers keep using
 * primaryAnswer()/matchEnglishPhrase(), so ordinary uses of "or" and commas
 * in complete sentences are never split by this word-only helper.
 */
function splitMeaningAlternatives(value: string, separator: RegExp): string[] {
  const original = String(value ?? "").trim();
  if (!original) return [];

  // Separators are found in the masked copy and applied to the real string.
  // Masking is character-for-character, so a match's offsets carry across.
  const scan = new RegExp(
    separator.source,
    separator.flags.includes("g") ? separator.flags : `${separator.flags}g`
  );
  const masked = maskBracketed(original);
  const alternatives: string[] = [];
  let cursor = 0;
  for (let match = scan.exec(masked); match; match = scan.exec(masked)) {
    if (!match[0]) {
      scan.lastIndex += 1;
      continue;
    }
    alternatives.push(original.slice(cursor, match.index).trim());
    cursor = match.index + match[0].length;
  }
  alternatives.push(original.slice(cursor).trim());

  const kept = alternatives.filter(Boolean);
  return kept.length ? kept : [original];
}

const ENGLISH_MEANING_SEPARATOR = /\s+\/\s+|[,;]|\s+or\s+/iu;
const GERMAN_MEANING_SEPARATOR = /\s+\/\s+|[,;]|\s+oder\s+/iu;

function englishMeaningAlternatives(value: string): string[] {
  return splitMeaningAlternatives(value, ENGLISH_MEANING_SEPARATOR);
}

export function germanMeaningAlternatives(value: string): string[] {
  return splitMeaningAlternatives(value, GERMAN_MEANING_SEPARATOR);
}

/**
 * What to ACCEPT, as opposed to what to show.
 *
 * Stepping over brackets is a rule about display: a card must not end in the
 * middle of its own note. Matching has no such duty and every reason to stay
 * generous, so it tries the bracket-blind pieces as well — somebody typing
 * "to catch a ball" for "to catch (a ball or animal)" was always right and
 * still is.
 */
function acceptedMeaningAlternatives(value: string, separator: RegExp): string[] {
  const bracketBlind = String(value ?? "")
    .trim()
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set([...splitMeaningAlternatives(value, separator), ...bracketBlind])];
}

export function primaryEnglishMeaning(value: string): string {
  return englishMeaningAlternatives(value)[0] ?? "";
}

export function primaryGermanMeaning(value: string): string {
  return germanMeaningAlternatives(value)[0] ?? "";
}

/**
 * What to SHOW, as opposed to what to accept.
 *
 * The alternatives split above treats a comma as "or", which is right for a
 * vocabulary gloss — "to learn, to study" really is two ways of saying one
 * thing — and catastrophic for a sentence, because German puts a comma before
 * every subordinate clause. Run over the catalogue it truncated 3,458 German
 * entries and 2,256 English ones:
 *
 *     "Nein, danke."                     shown as "Nein"
 *     "Entschuldigung, wo ist der Bahnhof?"  shown as "Entschuldigung"
 *     "Ich möchte einen Kaffee, bitte."  shown as "Ich möchte einen Kaffee"
 *
 * One question in five in the quick path was offering a fragment as an answer.
 * A slash is an explicit "either of these" written by an author; a comma is
 * grammar. So display splits on the slash alone and leaves punctuation where
 * the author put it.
 *
 * Matching still uses the comma-aware split, deliberately: accepting "Nein"
 * for "Nein, danke." is generous to a learner rather than wrong, and that
 * leniency is worth keeping.
 */
export function displayMeaning(value: string): string {
  const original = String(value ?? "").trim();
  if (!original) return "";
  const [first] = original.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  return first ?? original;
}

export function matchEnglishMeaning(input: string, target: string) {
  const whole = matchEnglishPhrase(input, target);
  if (whole.ok) return whole;

  // The card shows one variant's word; the learner may type their own.
  for (const alternative of [
    ...acceptedMeaningAlternatives(target, ENGLISH_MEANING_SEPARATOR),
    ...variantGlossAlternatives(target),
  ]) {
    const result = matchEnglishPhrase(input, alternative);
    if (result.ok) return result;
  }
  return whole;
}

export function matchGermanMeaning(input: string, target: string) {
  const whole = matchGermanSentence(input, target);
  if (whole.ok) return whole;

  for (const alternative of acceptedMeaningAlternatives(target, GERMAN_MEANING_SEPARATOR)) {
    const result = matchGermanSentence(input, alternative);
    if (result.ok) return result;
  }
  return whole;
}

type MatchingPair = { german: string; english: string };

/**
 * The matching screen shows only primaryAnswer(), so its collision key must do
 * the same. English spelling variants are folded as well: changing the user's
 * British/American preference must never turn two hidden ids into identical
 * visible buttons.
 */
/**
 * Two sentences that differ only in their closing full stop or exclamation
 * mark are the same sentence to a learner. Serving "Lange nicht gesehen." and
 * "Lange nicht gesehen!" one after the other reads as a bug, because it is
 * one — an exact-text comparison simply could not see it.
 *
 * A question mark is left alone: "Alles klar." and "Alles klar?" are a
 * statement and a question, which really are different sentences.
 */
export function sentenceIdentityKey(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*[.!…]+$/u, "")
    .trim();
}

export function matchingVisibleKey(text: string, language: "de" | "en"): string {
  const visible = primaryAnswer(text);
  const spellingNormalised = language === "en"
    ? normalizeEnglishSpelling(visible)
    : visible;
  return sentenceIdentityKey(spellingNormalised)
    .toLocaleLowerCase(language === "de" ? "de-DE" : "en-GB");
}

/** Namespaced keys for the two columns in a matching round. */
export function matchingVisibleKeys(german: string, english: string): string[] {
  const de = matchingVisibleKey(german, "de");
  const en = matchingVisibleKey(english, "en");
  return de && en ? [`de:${de}`, `en:${en}`] : [];
}

/**
 * Pick a one-to-one matching set, scanning later candidates to fill slots
 * skipped because either their visible German OR English is ambiguous.
 */
export function takeMatchingSafe<T>(
  candidates: T[],
  limit: number,
  pairOf: (candidate: T) => MatchingPair,
  blockedKeys: Iterable<string> = []
): T[] {
  if (limit <= 0) return [];
  const picked: T[] = [];
  const used = new Set(blockedKeys);

  for (const candidate of candidates) {
    const pair = pairOf(candidate);
    const keys = matchingVisibleKeys(pair.german, pair.english);
    if (keys.length !== 2 || keys.some((key) => used.has(key))) continue;
    keys.forEach((key) => used.add(key));
    picked.push(candidate);
    if (picked.length >= limit) break;
  }

  return picked;
}

/**
 * The clitic "'s" is "es", and both spellings are the same sentence.
 *
 * "Ich hab's" and "Ich hab es" are one sentence written two ways, and a
 * learner who types it out in full has not made a mistake. This ran on a list
 * of four verbs — machs, gibts, gehts, ists — and the content uses the clitic
 * on 57 different stems, so "hab es" against "hab's" was marked wrong and the
 * lesson would not move on.
 *
 * Expanded rather than collapsed, and BEFORE the apostrophe is dropped, since
 * the apostrophe is what identifies it. Collapsing runs into "sehe es" and
 * "seh's" reducing to different things; expanding does not.
 *
 * Case is ignored on purpose. The clitic attaches to verbs, which are
 * lower-case mid-sentence and capitalised at the start of one — "Gibt's noch
 * Kaffee?" — and all sixteen capitalised uses in the content are that. The
 * German genitive apostrophe that this could otherwise catch ("Anna's") does
 * not occur here, and is a spelling mistake in German besides.
 */
const CLITIC_S = /(\p{L})['’`´‘]s\b/gu;

/**
 * The same expansion for anyone who types it without the apostrophe.
 *
 * These have to agree: the target is expanded above whether or not the
 * learner reaches for the apostrophe, so "habs" has to arrive at "hab es"
 * too, or dropping the mark becomes a wrong answer. The stems are the ones
 * the course actually uses a clitic on, and none of them is a German word in
 * its own right with the s attached.
 */
const BARE_CLITIC_STEMS = [
  "geht", "hab", "gibt", "wenn", "läuft", "lauft", "war", "kann", "hat", "wird",
  "mach", "sag", "wie", "sieht", "steht", "reicht", "glaub", "krieg", "gib",
  "darf", "ob", "halt", "stört", "will", "schmeckt", "klappt", "kommt", "seh",
  "schaff", "kostet", "nehm", "nimm", "find", "stell", "versteh", "funktioniert",
  "soll", "tut", "stimmt", "ist", "geb", "lad", "überleg", "uberleg",
];
// Case-insensitive: the same stem is capitalised when it opens a sentence,
// and "Gibts noch Kaffee?" is the same typing shortcut as "gibts".
const BARE_CLITIC = new RegExp(`\\b(${BARE_CLITIC_STEMS.join("|")})s\\b`, "giu");

/** Normalize German learner input for comparison (typing or speech transcript). */

export function normalizeGermanInput(t: string) {
  return String(t ?? "")
    .toLowerCase()
    .trim()
    .replace(CLITIC_S, "$1 es")         // "hab's" == "hab es"
    .replace(BARE_CLITIC, "$1 es")      // and "habs" too
    .replace(/[’'`´‘]/g, "")            // apostrophes don't matter: "don't" == "dont"
    .replace(/[-–—/]/g, " ")            // hyphens, dashes, slashes act as spaces: "after-work" == "after work"
    .replace(/[.!?,;:"()“”„«»…]/g, "")  // drop sentence punctuation incl. curly/German/French quotes
    .replace(/\bachso\b/g, "ach so")    // both spellings are current; neither is a mistake
    .replace(/\bnaja\b/g, "na ja")      // same for Naja / Na ja
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "ae", "oe" and "ue" written for ä, ö and ü — but never straight after a
 * vowel, where the e is a real letter.
 *
 * Folding every "ue" made the e of an adjective or verb ending disappear: the
 * target "eine neue Idee" folded to "neu", so "eine neu Idee" came back as a
 * spelling slip when it is a grammar mistake, and so did "Ich bau" for "baue"
 * and "die blau Jacke". A spelled-out umlaut follows a consonant — fuer, Tuer,
 * moechte, Baeckerei — so that is the only place the fold runs.
 */
const UMLAUT_SPELLED_OUT = /(?<![aeiouy])([aou])e/g;
const UMLAUT_SPELLED_OUT_ANY_CASE = /(?<![aeiouyAEIOUY])([aouAOU])e/g;

export function normalizeGermanLenient(t: string) {
  return normalizeGermanInput(t)
    .replace(/ß/g, "ss")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    // Fold ALL diacritics (ä ö ü, and French é è ê à ç î ô û…) to their base
    // letter, so answers typed without accents still match leniently.
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(UMLAUT_SPELLED_OUT, "$1")
    // Colloquial / spoken contractions
    .replace(/\bnix\b/g, "nichts")
    .replace(/\bmachs\b/g, "mach es")
    .replace(/\bgibts\b/g, "gibt es")
    .replace(/\bgehts\b/g, "geht es")
    .replace(/\bists\b/g, "ist es")
    .replace(/\bachso\b/g, "ach so")   // both spellings are in use; accept either
    .replace(/\bgerne\b/g, "gern");
}

export function normalizeGermanInputCaseSensitive(t: string) {
  return String(t ?? "")
    .trim()
    // The same clitic expansion as the case-folding path above. German
    // matching is case-sensitive, so this normaliser decides most answers —
    // teaching only the other one that "hab's" is "hab es" fixed the sentences
    // that happen to reach it and left the rest marked wrong.
    .replace(CLITIC_S, "$1 es")
    .replace(BARE_CLITIC, "$1 es")
    .replace(/[’'`´‘]/g, "")            // apostrophes don't matter
    .replace(/[-–—/]/g, " ")            // hyphens, dashes, slashes act as spaces
    .replace(/[.!?,;:"()“”„«»…]/g, "")  // drop punctuation
    // Same Achso/Ach so fold, capitalisation preserved so this case-sensitive
    // path still compares like with like.
    .replace(/\bachso\b/gi, (m) => (m[0] === "A" ? "Ach so" : "ach so"))
    .replace(/\bnaja\b/gi, (m) => (m[0] === "N" ? "Na ja" : "na ja"))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGermanLenientCaseSensitive(t: string) {
  return normalizeGermanInputCaseSensitive(t)
    .replace(/ß/g, "ss")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(UMLAUT_SPELLED_OUT_ANY_CASE, "$1")
    // Case-INSENSITIVE match with the original capital put back, because this
    // normalizer preserves case on purpose. Written lowercase-only, these folds
    // silently did nothing at the start of a sentence — "Gibts?" stayed put
    // while the target "Gibt es?" folded, and the answer came back rejected for
    // a capitalisation error the learner never made.
    .replace(/\bnix\b/gi, keepCase("nichts"))
    .replace(/\bmachs\b/gi, keepCase("mach es"))
    .replace(/\bgibts\b/gi, keepCase("gibt es"))
    .replace(/\bgehts\b/gi, keepCase("geht es"))
    .replace(/\bists\b/gi, keepCase("ist es"))
    .replace(/\bachso\b/gi, keepCase("ach so"))  // both spellings are in use
    .replace(/\bgerne\b/gi, keepCase("gern"));
}

/** Replacement that carries the matched word's leading capital across. */
function keepCase(replacement: string) {
  return (match: string) =>
    match[0] === match[0].toUpperCase()
      ? replacement[0].toUpperCase() + replacement.slice(1)
      : replacement;
}

type GermanCaseNormalizer = (value: string) => string;

// These words are lowercase in ordinary German and are capitalised here only
// because they open a sentence. Nouns and the formal Sie/Ihr forms are
// deliberately absent: their capital letters carry real information and must
// still be taught. This lets a meaning-perfect answer such as
// "ich verstehe das nicht. ich auch nicht" pass without weakening noun checks.
//
// The list was a dozen words long, so "kannst du mir helfen", "heute gehe ich
// nach Hause" and "mir ist kalt" — right German, typed quickly — were wrong
// answers. It now covers the word classes that actually open the course's
// sentences: measured over all of them, pronouns, articles, prepositions,
// conjunctions, adverbs, the auxiliaries and modals, and the common
// imperatives account for nearly every first word that is not a noun.
// Still explicit, and still without sie/ihr and their forms: at the start of a
// sentence "sie" may be the formal Sie, which is exactly the capital to teach.
const LOWERCASEABLE_SENTENCE_OPENERS = new Set([
  // pronouns, never the sie/ihr forms
  "ich", "du", "er", "es", "wir", "man", "mich", "mir", "dich", "dir", "ihn", "ihm", "uns", "euch", "sich",
  "mein", "meine", "meinen", "meinem", "meiner", "meines", "dein", "deine", "deinen", "deinem", "deiner", "deines",
  "sein", "seine", "seinen", "seinem", "seiner", "seines", "unser", "unsere", "unseren", "unserem", "unserer",
  "euer", "eure", "euren", "eurem", "eurer", "jemand", "niemand", "selbst",
  // question words
  "wer", "wen", "wem", "wessen", "was", "wann", "warum", "wie", "wo", "woher", "wohin",
  "welche", "welcher", "welches", "welchen", "welchem", "wozu", "woran", "wofür", "womit", "worüber", "wieso", "weshalb",
  // articles and determiners
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines",
  "kein", "keine", "keinen", "keinem", "keiner", "dieser", "diese", "dieses", "diesen", "diesem",
  "jeder", "jede", "jedes", "jeden", "jedem", "alle", "alles", "manche", "mancher", "viele", "viel",
  "wenige", "etwas", "nichts", "beide", "mehr",
  // prepositions
  "in", "im", "ins", "an", "am", "ans", "auf", "aus", "bei", "beim", "mit", "nach", "von", "vom", "zu", "zum", "zur",
  "für", "über", "unter", "vor", "hinter", "neben", "zwischen", "ohne", "um", "gegen", "seit", "bis", "durch",
  "ab", "statt", "trotz", "während", "wegen", "außer",
  // conjunctions and linking adverbs
  "und", "oder", "aber", "denn", "sondern", "wenn", "weil", "dass", "ob", "als", "obwohl", "damit", "falls",
  "sobald", "bevor", "nachdem", "seitdem", "deshalb", "trotzdem", "also", "sonst", "darum", "dann", "danach",
  "dafür", "daran", "davon", "dazu", "je", "einerseits", "andererseits",
  // adverbs
  "hier", "da", "dort", "jetzt", "heute", "gestern", "morgen", "bald", "gleich", "schon", "noch", "immer", "nie",
  "oft", "manchmal", "selten", "gern", "gerne", "sehr", "so", "auch", "nur", "gerade", "eben", "erst", "zuerst",
  "endlich", "vielleicht", "leider", "natürlich", "eigentlich", "wahrscheinlich", "angeblich", "ungefähr", "etwa",
  "kaum", "fast", "ganz", "lieber", "besser", "einmal", "wieder", "zusammen", "allein", "oben", "unten", "vorne",
  "hinten", "links", "rechts", "drinnen", "draußen", "langsam", "schnell", "laut", "lange", "eher",
  "morgens", "mittags", "nachmittags", "abends", "nachts", "sonntags", "samstags", "ehrlich", "ernsthaft", "echt",
  "wirklich", "mal", "nicht",
  // auxiliaries and modals
  "bin", "bist", "ist", "sind", "seid", "war", "warst", "waren", "wart", "sei",
  "habe", "hab", "hast", "hat", "haben", "habt", "hatte", "hattest", "hatten", "hättest", "hätte",
  "werde", "wirst", "wird", "werden", "werdet", "würde", "würdest", "würden",
  "kann", "kannst", "können", "könnt", "könnte", "könntest", "könnten", "muss", "musst", "müssen", "müsst",
  "darf", "darfst", "dürfen", "soll", "sollst", "sollen", "sollte", "will", "willst", "wollen", "wollt",
  "möchte", "möchtest", "möchten", "mag", "magst",
  // common verbs and imperatives that open sentences
  "gibt", "gib", "geht", "gehst", "geh", "gehen", "kommt", "kommst", "komm", "weiß", "weißt", "lass", "mach", "machst",
  "machen", "sag", "sagen", "nimm", "nehmen", "schreib", "warte", "schau", "bleib", "frag", "stell", "zieh", "erzähl",
  "ruf", "fahr", "pass", "hör", "leg", "trink", "such", "probier", "bring", "vergiss", "sieh", "siehst", "kennst",
  "findest", "denk", "denkst", "brauchst", "steht", "passt", "stimmt", "reicht", "liegt",
  // interjections and replies
  "ja", "nein", "doch", "bitte", "danke", "hallo", "ach", "oh", "na", "naja", "tja", "hm", "hmm", "hey", "ey", "puh",
  "autsch", "ups", "okay", "genau", "klar", "gut", "schade", "richtig", "falsch", "egal", "guten", "gute",
  // numbers
  "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "zwanzig",
]);

/** The same openers as the lenient path sees them: umlauts and ß folded. */
let foldedSentenceOpeners: Set<string> | null = null;

function isLowercaseableOpener(word: string) {
  if (LOWERCASEABLE_SENTENCE_OPENERS.has(word)) return true;
  foldedSentenceOpeners ??= new Set([...LOWERCASEABLE_SENTENCE_OPENERS].map((opener) => normalizeGermanLenient(opener)));
  return foldedSentenceOpeners.has(word);
}

function targetSentenceStarts(target: string, normalize: GermanCaseNormalizer) {
  const starts = new Set<number>();
  let wordOffset = 0;
  // A spaced dash commonly separates two quoted speakers. Splitting it here
  // also covers authored dialogue where the quotation marks themselves are
  // optional learner formatting.
  for (const segment of String(target ?? "").split(/(?:[.!?…]+|(?:\s+[–—]\s+))/u)) {
    const words = normalize(segment).split(" ").filter(Boolean);
    if (!words.length) continue;
    starts.add(wordOffset);
    wordOffset += words.length;
  }
  return { starts, wordCount: wordOffset };
}

function differsOnlyByOptionalSentenceStartCase(
  input: string,
  target: string,
  normalize: GermanCaseNormalizer
) {
  const inputWords = normalize(input).split(" ").filter(Boolean);
  const targetWords = normalize(target).split(" ").filter(Boolean);
  const sentenceStarts = targetSentenceStarts(target, normalize);
  if (
    inputWords.length !== targetWords.length ||
    sentenceStarts.wordCount !== targetWords.length
  ) return false;

  let sawDifference = false;
  for (let index = 0; index < targetWords.length; index += 1) {
    const inputWord = inputWords[index];
    const targetWord = targetWords[index];
    if (inputWord === targetWord) continue;

    const targetLower = targetWord.toLocaleLowerCase("de-DE");
    if (
      !sentenceStarts.starts.has(index) ||
      !isLowercaseableOpener(targetLower) ||
      inputWord !== targetLower
    ) return false;
    sawDifference = true;
  }
  return sawDifference;
}

export function matchGermanPhrase(input: string, target: string): { ok: boolean; spellingNote: boolean; capitalizationError?: boolean; phrasingNote?: boolean } {
  const normInputCS = normalizeGermanInputCaseSensitive(input);
  const normTargetCS = normalizeGermanInputCaseSensitive(target);

  if (normInputCS === normTargetCS) {
    return { ok: true, spellingNote: false };
  }

  const lenientInputCS = normalizeGermanLenientCaseSensitive(input);
  const lenientTargetCS = normalizeGermanLenientCaseSensitive(target);

  if (lenientInputCS === lenientTargetCS) {
    return { ok: true, spellingNote: true };
  }

  // Check if it would match case-insensitively
  const normInputCI = normalizeGermanInput(input);
  const normTargetCI = normalizeGermanInput(target);
  const lenientInputCI = normalizeGermanLenient(input);
  const lenientTargetCI = normalizeGermanLenient(target);

  if (normInputCI === normTargetCI) {
    if (differsOnlyByOptionalSentenceStartCase(input, target, normalizeGermanInputCaseSensitive)) {
      return { ok: true, spellingNote: false };
    }
    return { ok: false, spellingNote: false, capitalizationError: true };
  }

  if (lenientInputCI === lenientTargetCI) {
    if (differsOnlyByOptionalSentenceStartCase(input, target, normalizeGermanLenientCaseSensitive)) {
      return { ok: true, spellingNote: true };
    }
    return { ok: false, spellingNote: false, capitalizationError: true };
  }

  return { ok: false, spellingNote: false };
}

// ─── German-side synonyms & coaching ────────────────────────────────────────
// The same philosophy as the English tiers, for typed GERMAN answers: genuinely
// interchangeable German passes silently; a literal English-transfer phrasing
// ("Ich bin kalt" for "Mir ist kalt") is rejected with a phrasingNote so the
// UI coaches instead of red-Xing. These run on normalizeGermanInput output
// (lowercase, punctuation stripped, umlauts INTACT), so patterns carry ö/oe
// alternates; lenient umlaut folding is applied after.
// NOTE: these live in matchGermanSentence, NOT matchGermanPhrase — the latter
// doubles as the raw comparator inside the English tiers, where German folds
// must never run.
const GERMAN_SYNONYMS: [RegExp, string][] = [
  // möchte (polite) and wollen both say "want" — person kept per pair
  [/\bm(?:ö|oe)chte\b/g, "will"],
  [/\bm(?:ö|oe)chtest\b/g, "willst"],
  [/\bm(?:ö|oe)chten\b/g, "wollen"],
  [/\b(super|prima|spitze|mega)\b/g, "toll"],
  [/\b(tschau|ciao)\b/g, "tschüss"],
  [/\b(hi|hey)\b/g, "hallo"],
  [/\bsorry\b/g, "entschuldigung"],       // Sorry is everyday German
  [/\bentschuldige\b/g, "entschuldigung"],
  [/\bpapa\b/g, "vater"],
  [/\bmama\b/g, "mutter"],
  // Cross-gender noun pairs fold WITH their article so each side stays
  // grammatical German ("das Klo" == "die Toilette", never "das Toilette").
  [/\bdas klo\b/g, "die toilette"],
  [/\bdem klo\b/g, "der toilette"],
  [/\bein klo\b/g, "eine toilette"],
  [/\baufs klo\b/g, "auf die toilette"],   // "Ich muss aufs Klo"
  [/\b(?:der|den) wagen\b/g, "das auto"],
  [/\bdem wagen\b/g, "dem auto"],
  [/\beinen wagen\b/g, "ein auto"],
  [/\bk(?:ö|oe)stlich\b/g, "lecker"],
  [/\bdefekt\b/g, "kaputt"],
  [/\bdoktor\b/g, "arzt"],
  [/\beventuell\b/g, "vielleicht"],
  [/\brasch\b/g, "schnell"],
  // ── Verified loanword/sibling pairs (adversarially checked against data.ts) ──
  [/\bklub\b/g, "verein"],                     // Traditionsklub — same gender
  [/\bschiri\b/g, "schiedsrichter"],           // everyone says Schiri
  [/\bgym\b/g, "fitnessstudio"],               // exact token only — never touches Gymnasium
  [/\bprotein\b/g, "eiweiß"],
  [/\brunterladen\b/g, "herunterladen"],
  [/\brunter\b/g, "herunter"],                 // colloquial adverb, same meaning
  [/\bsettings\b/g, "einstellungen"],
  [/\bcheaten\b/g, "schummeln"], [/\bcheatet\b/g, "schummelt"], [/\bgecheatet\b/g, "geschummelt"],
  [/\bwishlist\b/g, "wunschliste"],
  [/\bcontent\b/g, "inhalt"],
  // das Update / die Aktualisierung — cross-gender, article-paired first
  [/\bdas update\b/g, "die aktualisierung"],
  [/\bdem update\b/g, "der aktualisierung"],
  [/\bupdates\b/g, "aktualisierungen"], [/\bupdate\b/g, "aktualisierung"],
  [/\bcrush\b/g, "schwarm"],                   // der Crush = der Schwarm
  // das Tattoo / die Tätowierung — cross-gender
  [/\bdas tattoo\b/g, "die tätowierung"],
  [/\btattoos\b/g, "tätowierungen"], [/\btattoo\b/g, "tätowierung"],
  [/\bpennen\b/g, "schlafen"], [/\bpennt\b/g, "schläft"], [/\bpenne\b/g, "schlafe"], [/\bgepennt\b/g, "geschlafen"],
  [/\bsmartphone\b/g, "handy"],
  [/\bgigs\b/g, "auftritte"], [/\bgig\b/g, "auftritt"],
  [/\btannenbaum\b/g, "weihnachtsbaum"],
  [/\bkassenbon\b/g, "bon"],
  [/\bim angebot\b/g, "reduziert"],
  [/\bbewerbungsgespr(?:ä|ae)ch\b/g, "vorstellungsgespräch"],
  // kriegen == bekommen (colloquial "get") — person/tense kept per pair
  [/\bkriege\b/g, "bekomme"], [/\bkriegst\b/g, "bekommst"], [/\bkriegt\b/g, "bekommt"],
  [/\bkriegen\b/g, "bekommen"], [/\bgekriegt\b/g, "bekommen"],
  // The spoken "ich krieg" has to fold here too. The -e rules further down run
  // after this block, so a contracted "krieg" would otherwise never reach
  // "bekomme" while the written "kriege" already had — and the two spellings of
  // one sentence would stop matching each other. Both forms are anchored to
  // "ich" so the noun "der Krieg" is never touched.
  [/\bich krieg\b(?!e)/g, "ich bekomme"],
  [/\bkrieg\b(?!e)(?=\s+ich\b)/g, "bekomme"],

  // ── Written form vs. spoken form ────────────────────────────────────────
  // Germans drop the ich-form -e constantly ("ich hab", "ich geh", "ich mach",
  // "ich versteh") and always contract "gibt es" to "gibt's". Both spellings
  // are the same sentence, so both must be accepted whichever one is taught —
  // otherwise teaching the form people actually say would start rejecting the
  // form the learner read in a book, which is exactly the pettiness we're
  // trying to remove.
  //
  // Folded UP to the written -e form, and only after "ich", so ordinary nouns
  // are untouched: this can never turn "die Arbeit" into "die Arbeite" because
  // it only fires on "ich arbeit". Verbs whose ich-form has no -e to drop
  // (weiß, will, muss, kann, soll, darf, mag) are deliberately absent — adding
  // them would invent words like "ich weiße".
  [
    /\bich (hab|geh|mach|sag|komm|nehm|seh|steh|glaub|denk|find|frag|freu|f(?:ü|ue)hl|h(?:ö|oe)r|kauf|leb|lern|leg|mein|red|schau|schreib|spiel|such|trink|versteh|zeig|arbeit|wart|bleib|bring|krieg|setz|hol|brauch|werd|geb|les|ess|fahr|lass|hoff|versuch|zieh|trag|schlaf|sitz|lieg|lieb|zahl|schick|schaff|ruf|kenn|wohn|helf|lauf|sing|erinner|erkl(?:ä|ae)r|probier|erkl(?:ä|ae)r|erinner|probier|schaff|ruf|kenn|wohn|helf|lauf|sing)\b(?!e)/g,
    "ich $1e",
  ],
  // The same drop happens with the subject after the verb — "So hab ich das
  // noch nicht gesehen", "Das mach ich gleich", "Hab ich das gesagt?". Without
  // this the fold above only covered half the sentences it was written for,
  // and the most natural way to say an inverted sentence was marked wrong.
  [
    /\b(hab|geh|mach|sag|komm|nehm|seh|steh|glaub|denk|find|frag|freu|f(?:ü|ue)hl|h(?:ö|oe)r|kauf|leb|lern|leg|mein|red|schau|schreib|spiel|such|trink|versteh|zeig|arbeit|wart|bleib|bring|krieg|setz|hol|brauch|werd|geb|les|ess|fahr|lass|hoff|versuch|zieh|trag|schlaf|sitz|lieg|lieb|zahl|schick|schaff|ruf|kenn|wohn|helf|lauf|sing|erinner|erkl(?:ä|ae)r|probier|erkl(?:ä|ae)r|erinner|probier|schaff|ruf|kenn|wohn|helf|lauf|sing)\b(?!e)(?=\s+ich\b)/g,
    "$1e",
  ],
  // And the same drop at the END of a subordinate clause, which is where
  // German actually puts the verb after dass/weil/wenn/ob. The two rules
  // above only fire next to "ich", so "..., dass ich es nicht versteh" was
  // rejected while "ich versteh das" was accepted -- the same word, the same
  // speaker, marked wrong for standing in the position the grammar requires.
  //
  // Anchored on the conjunction plus "ich" so it stays a first-person fold,
  // and noun homographs (Arbeit, Krieg, Versuch, Schlaf, Sitz, mein) are left
  // out because this rule does not sit directly against "ich".
  [
    /\b(dass|weil|wenn|ob|obwohl|damit|bevor|nachdem|w(?:ä|ae)hrend|falls|solange|sobald|soda(?:ss|ß)) (ichs?)\b([^,.;!?]*?)\b(hab|geh|mach|sag|komm|nehm|seh|steh|glaub|denk|find|frag|freu|f(?:ü|ue)hl|h(?:ö|oe)r|kauf|leb|lern|leg|red|schreib|spiel|such|trink|versteh|zeig|wart|bleib|bring|hol|brauch|werd|geb|les|ess|fahr|lass|hoff|zieh|trag|lieg|zahl|schick|schaff|ruf|kenn|wohn|helf|lauf|sing|erinner|erkl(?:ä|ae)r|probier)\b(?!e)/g,
    "$1 $2$3$4e",
  ],
  // "gibt's" / "gibts" == "gibt es"; likewise "geht's", "hat's".
  [/\b(gibt|geht|hat|passt|klappt|läuft|l(?:ä|ae)uft)['’]?s\b/g, "$1 es"],
];

// Classic English→German literal transfers: understandable, but not German.
const GERMAN_NEAR_MISS: [RegExp, string][] = [
  // "I am cold/warm/hot/bored" — German uses the dative: "Mir ist kalt"
  [/\bich bin (kalt|warm|hei(?:ß|ss)|langweilig)\b/g, "mir ist $1"],
  // "I'm good/bad" as a state — German asks how it GOES: "Mir geht es gut"
  [/\bich bin gut\b/g, "mir geht es gut"],
  [/\bich bin schlecht\b/g, "mir geht es schlecht"],
];

const applyFolds = (t: string, folds: [RegExp, string][]) => {
  let s = t;
  for (const [re, sub] of folds) s = s.replace(re, sub);
  return s;
};

/**
 * Full German answer check: strict tiers first (via matchGermanPhrase), then
 * interchangeable-German synonyms (silent accept), then English-transfer
 * literals (rejected with phrasingNote so the UI coaches kindly).
 * Use THIS for German answers; matchGermanPhrase stays the raw comparator.
 */
export function matchGermanSentence(input: string, target: string): { ok: boolean; spellingNote: boolean; capitalizationError?: boolean; phrasingNote?: boolean } {
  const base = matchGermanPhrase(input, target);
  if (base.ok || base.capitalizationError) return base;
  const syn = (s: string) =>
    normalizeGermanLenient(applyFolds(normalizeGermanInput(s), GERMAN_SYNONYMS));
  const synInput = syn(input);
  const synTarget = syn(target);
  if (synInput === synTarget) return { ok: true, spellingNote: false };
  const near = (s: string) => normalizeGermanLenient(applyFolds(applyFolds(normalizeGermanInput(s), GERMAN_SYNONYMS), GERMAN_NEAR_MISS));
  if (near(input) === near(target)) return { ok: false, spellingNote: false, phrasingNote: true };
  return base;
}

// Expand common English contractions so "it's already late" == "it is already
// late", "let's start" == "let us start", etc. Applied to BOTH the answer key
// and the learner's input, so either form is accepted. (The 's/'d expansions
// are ambiguous in rare cases — "he's gone" as "he has" — an acceptable trade
// for beginner-level sentences.)
const CONTRACTIONS: [RegExp, string][] = [
  [/\blet[’'`´]?s\b/gi, "let us"],
  [/\bwon[’'`´]?t\b/gi, "will not"],
  [/\bcan[’'`´]?t\b/gi, "cannot"],
  [/\bshan[’'`´]?t\b/gi, "shall not"],
  // Only real auxiliary stems — a generic (\w+)nt would mangle ordinary words
  // ending in "nt" ("want" -> "wa not", "went" -> "we not", "moment"…).
  [/\b(do|does|did|is|are|was|were|has|have|had|would|should|could|must|need|ought)n[’'`´]?t\b/gi, "$1 not"],
  [/\bain[’'`´]?t\b/gi, "is not"],
  [/\bi[’'`´]?m\b/gi, "i am"],
  [/\b(\w+)[’'`´]re\b/gi, "$1 are"],             // you're, we're, they're
  [/\b(you|they)re\b/gi, "$1 are"],              // youre, theyre (avoiding 'were' conflict)
  [/\b(\w+)[’'`´]ve\b/gi, "$1 have"],            // I've, you've...
  [/\b(i|you|we|they)ve\b/gi, "$1 have"],        // ive, youve, weve, theyve
  [/\b(\w+)[’'`´]ll\b/gi, "$1 will"],
  // "ill" is only "i will" when a verb follows — otherwise it's the adjective (sick).
  [/\bill\b(?=\s+(be|go|come|see|do|get|have|take|make|try|call|text|send|tell|let|meet|ask|pay|wait|check|bring|pick|start|stop|talk|speak|write|help|show|give|grab|join|drive|walk|stay|leave|book|order)\b)/gi, "i will"],
  [/\b(you|he|she|it|they)ll\b/gi, "$1 will"], // youll, hell... (avoiding 'well' conflict)
  [/\b(\w+)[’'`´]d\b/gi, "$1 would"],
  [/\b(you|he|she|we|they)d\b/gi, "$1 would"],   // youd, hed... (avoiding 'id' conflict)
  // Before an unambiguous "happened", 's means HAS rather than IS:
  // "that's happened" == "that has happened". Keep this contextual and
  // ahead of the generic 's -> is fold so adjectives such as "it's tired"
  // are not rewritten as present-perfect forms.
  [/\b(it|that|what)[’'`´]?s\b(?=\s+(?:(?:just|already|only|never|always|ever|still|also|now)\s+)*happened\b)/gi, "$1 has"],
  // A noun phrase can contract "is" too. Keep this deliberately narrow:
  // generic word+'s expansion would mistake possessives ("John's coat") for
  // verbs, while this authored answer specifically uses "one more's coming".
  [/\bone more[’'`´]s\b/gi, "one more is"],
  [/\b(it|that|there|here|what|who|where|when|why|how|he|she)[’'`´]?s\b/gi, "$1 is"], // it's/its, that's/thats...
];

// Common text-speak, expanded on BOTH sides: the learner may type "pls", and
// some answer keys (the texting pack) themselves contain "rn"/"idk" — so the
// full words must also match those keys.
const TEXT_SPEAK: [RegExp, string][] = [
  [/\bpls\b/g, "please"], [/\bplz\b/g, "please"],
  [/\bthx\b/g, "thanks"], [/\btysm\b/g, "thank you so much"], [/\bty\b/g, "thank you"],
  [/\bu\b/g, "you"], [/\bur\b/g, "your"], [/\br\b/g, "are"], [/\bim\b/g, "i am"],
  [/\bik\b/g, "i know"], [/\blmk\b/g, "let me know"],
  [/\bidk\b/g, "i do not know"], [/\bdunno\b/g, "do not know"],
  [/\bcuz\b/g, "because"], [/\bcos\b/g, "because"], [/\bbc\b/g, "because"],
  [/\brn\b/g, "right now"], [/\bnvm\b/g, "never mind"], [/\bnp\b/g, "no problem"],
  [/\bbtw\b/g, "by the way"], [/\bomw\b/g, "on my way"],
  [/\btho\b/g, "though"], [/\bthru\b/g, "through"],
  [/\btmrw\b/g, "tomorrow"], [/\btmr\b/g, "tomorrow"],
  [/\bppl\b/g, "people"], [/\bmsg\b/g, "message"],
  [/\bokay\b/g, "ok"], [/\bkk\b/g, "ok"],
  [/\bgotta\b/g, "got to"], [/\bgn\b/g, "good night"],
  [/\bofc\b/g, "of course"],
  [/\bsec\b/g, "second"], [/\bmins?\b/g, "minutes"],
  // The clock abbreviations everyone actually writes. "sec" and "mins" were
  // already here; "hr" was not, so "can we meet an hr later" failed against
  // an answer key reading "an hour later".
  [/\bhrs\b/g, "hours"], [/\bhr\b/g, "hour"],
  [/\bwks\b/g, "weeks"], [/\bwk\b/g, "week"],
  [/\byrs\b/g, "years"], [/\byr\b/g, "year"],
  // Single-letter and clipped shorthand. "what are u worried abt" is a
  // complete, correct answer to "Was macht dir Sorgen?" and was marked wrong
  // purely on spelling nobody uses when typing quickly.
  [/\bu\b/g, "you"], [/\bur\b/g, "your"], [/\br\b/g, "are"],
  [/\babt\b/g, "about"], [/\bbout\b/g, "about"],
  [/\bpls\b/g, "please"], [/\bplz\b/g, "please"],
  [/\bthx\b/g, "thanks"], [/\bty\b/g, "thank you"],
  [/\bsmth\b/g, "something"], [/\bsth\b/g, "something"],
  [/\bb4\b/g, "before"], [/\bw\/\b/g, "with"],
  // Everyday clipped shorthand for "government" — a learner answering
  // "gov agency" for die Behörde has understood the German.
  [/\bgovt\b/g, "government"], [/\bgov\b/g, "government"],

  // apostrophe-less question contractions — unambiguous tokens
  [/\bwhats\b/g, "what is"], [/\bwhens\b/g, "when is"], [/\bwheres\b/g, "where is"],
  [/\bwhos\b/g, "who is"], [/\bwhys\b/g, "why is"], [/\bhows\b/g, "how is"],
  [/\bthats\b/g, "that is"], [/\btheres\b/g, "there is"], [/\bheres\b/g, "here is"],
  // The rest of the apostrophe-less contractions. Typing "id like a coffee"
  // is a correct answer to "Ich möchte einen Kaffee" -- the German was
  // understood, and the only thing missing is a punctuation mark that no
  // one reaches for at speed.
  //
  // Words that are ALSO ordinary English are deliberately absent: ill, wed,
  // lets, were and its all mean something on their own, and expanding them
  // would change a sentence rather than forgive a keystroke.
  [/\bim\b/g, "i am"],
  [/\bid\b/g, "i would"],
  [/\bive\b/g, "i have"],
  [/\byoure\b/g, "you are"],
  [/\byouve\b/g, "you have"],
  [/\byoud\b/g, "you would"],
  [/\byoull\b/g, "you will"],
  [/\bhes\b/g, "he is"],
  [/\bshes\b/g, "she is"],
  [/\btheyre\b/g, "they are"],
  [/\btheyve\b/g, "they have"],
  [/\btheyd\b/g, "they would"],
  [/\bdont\b/g, "do not"],
  [/\bdoesnt\b/g, "does not"],
  [/\bdidnt\b/g, "did not"],
  [/\bcant\b/g, "cannot"],
  [/\bwont\b/g, "will not"],
  [/\bwouldnt\b/g, "would not"],
  [/\bcouldnt\b/g, "could not"],
  [/\bshouldnt\b/g, "should not"],
  [/\bisnt\b/g, "is not"],
  [/\barent\b/g, "are not"],
  [/\bwasnt\b/g, "was not"],
  [/\bwerent\b/g, "were not"],
  [/\bhasnt\b/g, "has not"],
  [/\bhavent\b/g, "have not"],
  [/\bhadnt\b/g, "had not"],
];

function expandEnglishContractions(t: string) {
  let s = String(t ?? "").toLowerCase().replace(/[’`´]/g, "'");
  for (const [re, sub] of CONTRACTIONS) s = s.replace(re, sub);
  for (const [re, sub] of TEXT_SPEAK) s = s.replace(re, sub);
  return s;
}

// Digits fold to number words so "3 nights" == "three nights".
const NUM_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen",
  "14": "fourteen", "15": "fifteen", "16": "sixteen", "17": "seventeen",
  "18": "eighteen", "19": "nineteen", "20": "twenty", "30": "thirty",
  "40": "forty", "50": "fifty", "60": "sixty", "70": "seventy",
  "80": "eighty", "90": "ninety", "100": "one hundred",
};

// Canonicalize grammatical paraphrases that mean the same thing, so British
// and American forms both pass: "Have you got this?" == "Do you have this?",
// "She's got a car" == "She has a car". Both sides are reduced to the same
// bare form ("you have this") purely for comparison — never for display.
function canonicalizeEnglish(t: string) {
  const chained = t
    .replace(/\bgonna\b/g, "going to")
    .replace(/\bwanna\b/g, "want to")
    // "We're going to go to the seaside" is "we're going to the seaside"
    // with the motion verb spelled out. Both are the same future, and a
    // learner who writes the longer one has not made a mistake.
    .replace(new RegExp('\\bgoing to go to\\b', 'g'), 'going to')
    .replace(new RegExp('\\bgoing to come to\\b', 'g'), 'coming to')
    .replace(/\bthank you\b/g, "thanks")
    .replace(/\bper\b/g, "for")          // "per night" == "for the night" (articles drop in the same tier)
    .replace(/\bcould\b/g, "can")        // polite request forms are interchangeable for comprehension
    // German Konjunktiv "könnte" is equally "could" or "might" in English, and
    // "may" too. A learner translating "es könnte regnen" as "it could rain"
    // was being failed against an answer key that happened to say "might".
    .replace(/\bmight\b/g, "can")
    // "may" as a modal too — but not the month, so date contexts are excluded.
    .replace(/(?<!\b(?:in|of|until|till|since|from|by|during|early|late|mid) )\bmay\b/g, "can")
    .replace(/\bshall\b/g, "should")     // "Shall we meet?" == "Should we meet?"
    // "my kind of thing" / "my type of thing" / "my sort of thing" are the same
    // English. What the lesson is testing is whether the GERMAN was understood,
    // and all three show that it was.
    .replace(/\b(type|sort) of thing\b/g, "kind of thing")
    .replace(/\b(alright|all right)\b/g, "ok")   // "alright" == "all right" == "okay" ("okay" already folds to "ok")
    // whose/who's homophone: the app tests GERMAN comprehension — an English
    // homophone slip ("whos turn is it") shouldn't fail the lesson. "whose"
    // folds to "who is", the same form the contraction expander gives whos/who's.
    .replace(/\bwhose\b/g, "who is")
    .replace(/\b(\d{1,3})\b/g, (m) => NUM_WORDS[m] ?? m)  // "3 nights" == "three nights"
    .replace(/\b(do|does|did) (\w+) have\b/g, "$2 have")   // do-support: "do you have" -> "you have"
    .replace(/\bhave (\w+) got\b/g, "$1 have")             // "have you got" -> "you have"
    .replace(/\bhas (\w+) got\b/g, "$1 have")              // "has she got" -> "she have"
    .replace(/\b(\w+) (?:has|have|is) got\b/g, "$1 have")  // "she has/is got" (is = 's expansion) -> "she have"
    .replace(/\bhas\b/g, "have")                          // person-neutral for comparison only
    // German Perfekt ("Ich hab gesagt") is routinely rendered as either English
    // simple past or present perfect — "I said" and "I have said" are both
    // correct translations, so the auxiliary is dropped before a past
    // participle. Restricted to an explicit participle list plus regular -ed,
    // so ordinary "have" as a main verb ("I have a car") is untouched.
    // The adverb group matters: "I have ONLY said" must fold to "only said",
    // not lose the word or fail to match because have and said aren't adjacent.
    .replace(
      /\bhave ((?:just |already |only |never |always |ever |still |also |now )*)(been|said|done|gone|seen|made|taken|got|gotten|given|told|come|written|eaten|drunk|driven|spoken|brought|bought|thought|found|left|met|paid|put|read|run|sat|slept|stood|understood|won|lost|forgotten|heard|held|kept|known|learnt|learned|meant|sent|shown|spent|woken|worn|\w+ed)\b/g,
      "$1$2"
    )
    // English drops the complementiser "that" freely: "I said it might rain" is
    // the same sentence as "I said THAT it might rain". Only removed directly
    // after a reporting verb, so the demonstrative ("I don't want that") stays.
    // An object can sit between the verb and the complementiser: "told ME that".
    .replace(
      /\b(said|say|says|told|tell|tells|think|thought|know|knew|believe|believed|hope|hoped|mean|meant|heard|hear|see|saw|feel|felt|guess|guessed|suppose|reckon|wonder|wondered|noticed|notice|realised|realized|promise|promised|agree|agreed|admit|admitted|explained|explain|mentioned|mention|assume|assumed)( me| him| her| us| them| you| everyone)? that\b/g,
      "$1$2"
    )
    // ── Vetted similar-phrase folds (adversarially checked against data.ts) ──
    .replace(/\btonight\b/g, "this evening")
    .replace(/\b(on|over) the weekend\b/g, "at the weekend")
    .replace(/\bthis weekend\b/g, "at the weekend")
    .replace(/\bquarter after\b/g, "quarter past")
    .replace(/\bhalf (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, "half past $1")
    .replace(/\bclosest\b/g, "nearest")
    .replace(/\b(stay|stays|stayed|staying) at home\b/g, "$1 home")
    .replace(/\ba couple of\b/g, "a few")
    .replace(/\bkilogram(s)?\b/g, "kilo$1")
    .replace(/\bin total\b/g, "altogether")
    .replace(/\bdepart(s)?\b/g, "leave$1")
    .replace(/\bfill(s|ed|ing)? (in|out) \b/g, "fill$1 in ")
    .replace(/\b(cash register|cash desk)\b/g, "checkout")
    // A shop "till" is a checkout, but temporal "till Monday" means "until
    // Monday". Only fold till as the noun when a determiner or ordinal makes
    // that grammatical role unambiguous; the remaining temporal token is
    // handled below.
    .replace(
      /\b((?:a|an|the|another|this|that|each|every|first|second|third|next|nearest)\s+)till(s?)\b/g,
      "$1checkout$2"
    )
    .replace(/\bcarry[- ]on (luggage|baggage|bag|bags)\b/g, "hand luggage")
    .replace(/\bon sale\b/g, "on offer")
    .replace(/\bbattery is (almost |nearly )?(flat|empty)\b/g, "battery is $1dead")
    .replace(/\bno worries\b/g, "no problem")
    .replace(/\bpardon( me)?\b/g, "excuse me")
    .replace(/\bloan\b/g, "lend")
    .replace(/\b(cash machine|cashpoint|cash point)\b/g, "atm")
    // die Behörde is glossed "agency, authority", and people naturally write
    // "government agency" / "government authority" for it — the modifier adds
    // nothing the German didn't already say. Deliberately NOT "government
    // department": bare "department" must keep failing for
    // "ministry, government department" (das Ministerium is not die Abteilung).
    .replace(/\bgovernment (agenc(?:y|ies)|authorit(?:y|ies))\b/g, "$1")
    .replace(/\btake (out money|money out)\b/g, "withdraw money")
    .replace(/\bmy treat\b/g, "on me")
    .replace(/\bmore slowly\b/g, "slower")
    .replace(/\bmore quickly\b/g, "faster")
    .replace(/\b(sadly|regrettably)\b/g, "unfortunately")
    .replace(/\bi am afraid (i|we|that|it)\b/g, "unfortunately $1")
    .replace(/\blook out\b/g, "watch out")
    .replace(/\b(hang|hold) on\b/g, "wait")
    .replace(/\b(am|is|are) (almost |nearly )?finished\b/g, "$1 $2done")
    .replace(/\bhappy christmas\b/g, "merry christmas")
    .replace(/\bright (around|about) the corner\b/g, "just $1 the corner")
    .replace(/\bkinda\b/g, "kind of")
    .replace(/\bsorta\b/g, "sort of")
    .replace(/\bgimme\b/g, "give me")
    .replace(/\bsee ya\b/g, "see you")
    .replace(/\bsee you in a (moment|second|min|minute|short while)\b/g, "see you in a moment")
    .replace(/\bsee you (later today|in a bit)\b/g, "see you later")
    .replace(/\b(catch|see) you later\b/g, "see you later")
    .replace(/\bhave a (good|great|lovely) (day|rest of your day)\b/g, "have a nice day")
    .replace(/\bhave a (good|great|lovely) evening\b/g, "have a nice evening")
    .replace(/\bhave a (good|great|lovely) weekend\b/g, "have a nice weekend")
    .replace(/\btake care of yourself\b/g, "take care")
    .replace(/\blemme\b/g, "let me")
    .replace(/\boutta\b/g, "out of")
    .replace(/\bc'?mon\b/g, "come on")
    .replace(/\b(thanks (?:quite )?a lot|thanks so much|many thanks)\b/g, "thanks very much")
    .replace(/\bhow are you doing\b/g, "how are you")
    .replace(/\bhow is it going\b/g, "how are you")
    .replace(/\bi am called\b/g, "my name is")
    .replace(/\bi come from\b/g, "i am from")
    .replace(/\b(he|she|it) comes from\b/g, "$1 is from")
    .replace(/\b(you|we|they) come from\b/g, "$1 are from")
    .replace(/\b(tv|telly)\b/g, "television")
    .replace(/\bcab\b/g, "taxi")
    .replace(/\bpic\b/g, "photo")
    .replace(/\bpics\b/g, "photos")
    .replace(/\bbeverage\b/g, "drink")
    .replace(/\b(supper|evening meal)\b/g, "dinner")
    .replace(/\bphysician\b/g, "doctor")
    .replace(/\bunwell\b/g, "sick")
    .replace(/\b(medication|meds)\b/g, "medicine")
    .replace(/\bparking lot\b/g, "car park")
    .replace(/\bcentral station\b/g, "main station")
    .replace(/\bsleepy\b/g, "tired")
    .replace(/\bbrothers and sisters\b/g, "siblings")
    .replace(/\b1st\b/g, "first")
    .replace(/\b2nd\b/g, "second")
    .replace(/\b3rd\b/g, "third")
    .replace(/\bmister\b/g, "mr")
    .replace(/\bsettee\b/g, "sofa")
    .replace(/\breply\b/g, "answer")
    .replace(/\btalking\b/g, "speaking")
    .replace(/\bquick\b/g, "fast")
    .replace(/\bhow much does ((?:\w+ ){0,2}\w+) cost\b/g, "how much is $1")
    .replace(/\bairplane\b/g, "plane")
    .replace(/\bcongrats\b/g, "congratulations")
    .replace(/\bmaths\b/g, "math")
    .replace(/\b(burn|learn|dream|spell|smell|spoil)t\b/g, "$1ed")
    .replace(/\bwhilst\b/g, "while")
    .replace(/\bo'?clock\b/g, "")
    .replace(/\b(?:excuse me|pardon me|pardon|my apologies|apologies)\b/g, "sorry")
    .replace(/\bwhat are you called\b/g, "what is your name")
    .replace(/\binsane\b/g, "crazy")
    .replace(/\bstunning\b/g, "beautiful")
    .replace(/\btil{1,2}\b/g, "until")
    .replace(/\b(everything|everyone|everybody|nothing)'?s\b/g, "$1 is")
    .replace(/\bmatch\b/g, "game")
    .replace(/\bnil\b/g, "zero")
    .replace(/\bgo+a+l\b/g, "goal")
    .replace(/\bworkout\b/g, "training")
    .replace(/\boh,? my (?:god|gosh|goodness)\b/g, "omg")
    .replace(/\bbank holiday\b/g, "public holiday")
    .replace(/\bat the weekend\b/g, "on the weekend")
    .replace(/\b(?:ring|phone) (me|you|him|her|us|them)\b/g, "call $1")
    .replace(/\b(?:total|complete|utter|absolute) (?:rubbish|trash|garbage|crap|nonsense)\b/g, "total nonsense")
    .replace(/\b(drives?|driving) (me|you|him|her|us|them) mad\b/g, "$1 $2 crazy")
    .replace(/\bslower\b/g, "more slow")
    .replace(/\bstudy(ing)?\b/g, "learn$1")
    .replace(/\bwhat is (?:going on|happening)\b/g, "what is up")
    .replace(/\bwc\b/g, "toilet")
    // ── end vetted folds ──
    
    // Polite request / question equivalents
    .replace(/\bcould\b/g, "can")

    // Plural you: German "ihr" sentences display "you all" / "you two" /
    // "you both" / "you lot" so the group is visible, but English has no real
    // plural you — every way of saying it folds to plain "you" and is
    // accepted. "(all|both) right" is guarded so "Are you all right?" keeps
    // its meaning.
    .replace(/\b(?:yous|y[’']?all|yall)\b/g, "you")
    .replace(/\byou (?:guys|lot|two|both)\b/g, "you")
    .replace(/\b(?:all|both|the two) of you\b/g, "you")
    .replace(/\byou[’']?re (?:all|both)\b(?!\s+right\b)/g, "you are")
    .replace(/\byou are (?:all|both)\b(?!\s+right\b)/g, "you are")
    .replace(/\byou[’']?ll (?:all|both)\b/g, "you will")
    .replace(/\byou will (?:all|both)\b/g, "you will")
    .replace(/\byou (can|could|will|would|shall|should|must|may|might|do|did|have|had) (?:all|both)\b/g, "you $1")
    .replace(/\byou (?:all|both)\b(?!\s+right\b)/g, "you")
    // "thank you" already folded to "thanks" a few tiers up, taking the
    // "you" with it — catch the plural marker it left behind.
    .replace(/\bthanks (?:all|both)\b/g, "thanks")

    // Common vocabulary synonyms
    // "eine Katastrophe" is a catastrophe as readily as a disaster, and the
    // answer key can only print one of them.
    .replace(/\b(catastrophe|disaster)\b/g, "disaster")
    .replace(/\b(pretty good|quite well)\b/g, "pretty well")
    .replace(/\b(quite a lot|a lot|pretty much|lots|plenty)\b/g, "quite a lot")
    .replace(/\b(lots of|a lot of)\b/g, "quite a lot")
    .replace(/\bjust\b/g, "only")
    .replace(/\b(hi|hey)\b/g, "hello")
    .replace(/\byeah\b/g, "yes")
    .replace(/\b(bye|goodbye)\b/g, "bye")
    .replace(/\b(begin|commence)\b/g, "start")
    // ...but not after a copula: "the shop is shut" describes a state, and the
    // state is "closed", not "close". Folding it here left the two forms one
    // letter apart and the answer refused, which is the opposite of the point.
    // The state pairs are folded by the synonym table at the end instead.
    .replace(/(?<!\b(?:is|are|was|were|been) )\b(shut|lock)\b/g, "close")
    .replace(/\b(purchase|obtain)\b/g, "buy")
    .replace(/\b(receive|acquire)\b/g, "get")
    .replace(/\btalk\b/g, "speak")
    .replace(/\b(difficult|tough)\b/g, "hard")
    .replace(/\bsimple\b/g, "easy")
    .replace(/\bcorrect\b/g, "right")
    .replace(/\b(incorrect|false)\b/g, "wrong")
    .replace(/\bill\b/g, "sick")
    .replace(/\b(glad|pleased)\b/g, "happy")
    .replace(/\b(wonderful|excellent|awesome|superb|fantastic)\b/g, "great")
    .replace(/\blarge\b/g, "big")
    .replace(/\blittle\b/g, "small")
    .replace(/\bperhaps\b/g, "maybe")
    .replace(/\b(right away|straight away|instantly|at once)\b/g, "immediately")
    .replace(/\bquickly\b/g, "fast")
    .replace(/\bslowly\b/g, "slow")
    .replace(/\b(have to|need to|ought to)\b/g, "must")
    .replace(/\b(cellphone|cell phone|mobile phone|mobile)\b/g, "phone")
    .replace(/\bflat\b/g, "apartment")
    .replace(/\bvacation\b/g, "holiday")
    .replace(/\b(highway|freeway|expressway)\b/g, "motorway")
    .replace(/\brailroad\b/g, "railway")
    .replace(/\bbaggage\b/g, "luggage")
    .replace(/\bmovie theater\b/g, "cinema")
    .replace(/\bfilm\b/g, "movie")
    .replace(/\bcouch\b/g, "sofa")
    .replace(/\brefrigerator\b/g, "fridge")
    .replace(/\b(pretty|rather|fairly)\b/g, "quite")
    .replace(/\b(someone|somebody)\b/g, "someone")
    .replace(/\b(everyone|everybody)\b/g, "everyone")
    .replace(/\b(anyone|anybody)\b/g, "anyone")
    .replace(/\b(no one|nobody)\b/g, "no one")
    .replace(/\b(somewhere|anyplace|someplace)\b/g, "somewhere")
    .replace(/\b(sometimes|occasionally)\b/g, "sometimes")
    .replace(/\b(nowadays|today)\b/g, "these days")
    .replace(/\brecall\b/g, "remember")
    .replace(/\battempt\b/g, "try")
    .replace(/\bfancy\b/g, "like")
    .replace(/\bwould like\b/g, "want")
    .replace(/\bdad\b/g, "father")
    .replace(/\b(mom|mum|mam)\b/g, "mother")
    .replace(/\bfolks\b/g, "parents")
    .replace(/\bbro\b/g, "brother")
    .replace(/\b(kid|baby)\b/g, "child")
    .replace(/\blady\b/g, "woman")
    .replace(/\bguy\b/g, "man")
    .replace(/\blad\b/g, "boy")
    .replace(/\b(gal|lass)\b/g, "girl")
    .replace(/\bhubby\b/g, "husband")
    .replace(/\bwifey\b/g, "wife")
    .replace(/\bdoc\b/g, "doctor")
    .replace(/\b(coworker|co-worker)\b/g, "colleague")
    .replace(/\bemployer\b/g, "boss")
    .replace(/\btutor\b/g, "teacher")
    .replace(/\bpupil\b/g, "student")
    .replace(/\b(college|uni)\b/g, "university")
    .replace(/\b(bicycle|bike)\b/g, "bike")
    .replace(/\bmotorcycle\b/g, "motorbike")
    .replace(/\b(coffee shop|coffeehouse)\b/g, "cafe")
    .replace(/\beatery\b/g, "restaurant")
    .replace(/\bgrocery store\b/g, "supermarket")
    .replace(/\btown\b/g, "city")
    .replace(/\bnation\b/g, "country")
    .replace(/\broad\b/g, "street")
    .replace(/\blane\b/g, "path")
    .replace(/\bwoods\b/g, "forest")
    .replace(/\b(rubbish|garbage|waste)\b/g, "trash")
    .replace(/\b(dustbin|bin|garbage can|trash can)\b/g, "trashcan")
    .replace(/\b(photo|photograph|picture)\b/g, "photo")
    .replace(/\b(journey|tour|travel)\b/g, "trip")
    .replace(/\bplane ride\b/g, "flight")
    .replace(/\bguesthouse\b/g, "hotel")
    .replace(/\bchamber\b/g, "room")
    .replace(/\bfront desk\b/g, "reception")
    .replace(/\btimetable\b/g, "schedule")
    .replace(/\b(gasoline|gas)\b/g, "petrol")
    .replace(/\bgas station\b/g, "petrol station")
    .replace(/\bcookie\b/g, "biscuit")
    .replace(/\bcandy\b/g, "sweet")
    .replace(/\b(french fries|fries)\b/g, "chips")
    .replace(/\bpants\b/g, "trousers")
    .replace(/\brailway station\b/g, "train station")
    .replace(/\bmail office\b/g, "post office")
    .replace(/\bmailman\b/g, "postman")
    .replace(/\bmailbox\b/g, "letterbox")
    .replace(/\bavailable\b/g, "free")
    .replace(/\breserved\b/g, "booked")
    .replace(/\belevator\b/g, "lift")
    .replace(/\bcheck\b/g, "bill")
    .replace(/\b(restroom|bathroom|washroom|loo)\b/g, "toilet")
    .replace(/\b(arrange|schedule|set up)\b/g, "make")
    .replace(/\b(meeting|date)\b/g, "appointment")
    .replace(/\b(pub|bar)\b/g, "pub")
    .replace(/\b(underground|metro|tube)\b/g, "subway")
    .replace(/\bstore\b/g, "shop")
    .replace(/\bfootball\b/g, "soccer")
    .replace(/\b(purse|handbag)\b/g, "bag")
    .replace(/\bauto\b/g, "car")
    .replace(/\bmovies\b/g, "cinema")
    .replace(/\btalks\b/g, "speaks")
    .replace(/\btalked\b/g, "spoke")
    .replace(/\bkids\b/g, "children")
    .replace(/\b(grandma|granny|nana)\b/g, "grandmother")
    .replace(/\b(grandpa|granddad|grandad)\b/g, "grandfather")
    .replace(/\b(tasty|yummy)\b/g, "delicious")
    .replace(/\b(jumper|pullover|sweatshirt)\b/g, "sweater")
    .replace(/\bright now\b/g, "now")
    .replace(/\b(currently|at the moment)\b/g, "now")
    .replace(/\btruly\b/g, "really")
    .replace(/\bindeed\b/g, "really")
    // "sehr/echt/wirklich" all render as very OR really — interchangeable
    // intensifiers, so neither spelling of the learner's instinct is wrong.
    .replace(/\b(very|really)\b/g, "very")
    // "to"/"too" is a homophone slip, not a comprehension failure — but ONLY
    // before a degree word. A blanket to->too would wreck every infinitive
    // and preposition ("I want to go", "to the station").
    .replace(/\bto (?=(fast|quick|slow|much|many|late|early|big|small|large|hot|cold|warm|expensive|cheap|loud|quiet|hard|easy|long|short|far|near|old|young|tired|busy|difficult|heavy|light|strong|weak|often|soon|late)\b)/g, "too ")
    .replace(/\b(a little|a little bit|slightly)\b/g, "a bit")
    .replace(/\b(choose|select|pick)\b/g, "choose")
    .replace(/\bdiscover\b/g, "find")
    .replace(/\b(assist|aid)\b/g, "help")
    .replace(/\bdemonstrate\b/g, "show")
    .replace(/\bhalt\b/g, "stop")
    .replace(/\butilize\b/g, "use")
    .replace(/\b(drop by|drop in)\b/g, "visit")
    .replace(/\bawait\b/g, "wait")
    .replace(/\bnote down\b/g, "write")
    .replace(/\bclient\b/g, "customer")
    .replace(/\b(salesperson|salesclerk)\b/g, "clerk")
    .replace(/\bfood list\b/g, "menu")
    .replace(/\bpermit\b/g, "license")
    .replace(/\bsack\b/g, "bag")
    .replace(/\bcarton\b/g, "box")
    .replace(/\bpresent\b/g, "gift")
    .replace(/\bchair\b/g, "seat")
    .replace(/\byard\b/g, "garden")
    .replace(/\bhamlet\b/g, "village")
    .replace(/\bocean\b/g, "sea")
    .replace(/\bpond\b/g, "lake")
    .replace(/\bstream\b/g, "river")
    .replace(/\bhill\b/g, "mountain")
    .replace(/\b(handsome|lovely|gorgeous)\b/g, "beautiful")
    .replace(/\b(awful|horrible|dreadful)\b/g, "terrible")
    .replace(/\b(clever|intelligent|bright|shlau|schlau)\b/g, "smart")
    .replace(/\b(silly|dumb)\b/g, "stupid")
    .replace(/\bcourteous\b/g, "polite")
    .replace(/\bimpolite\b/g, "rude")
    .replace(/\bunfriendly\b/g, "mean")
    .replace(/\b(dull|tedious)\b/g, "boring")
    .replace(/\bthrilling\b/g, "exciting")
    .replace(/\bidle\b/g, "lazy")
    .replace(/\bwealthy\b/g, "rich")
    .replace(/\bsecure\b/g, "safe")
    .replace(/\brisky\b/g, "dangerous")
    .replace(/\binexpensive\b/g, "cheap")
    .replace(/\bcostly\b/g, "expensive")
    .replace(/\btidy\b/g, "clean")
    .replace(/\bmessy\b/g, "dirty")
    .replace(/\bnoisy\b/g, "loud")
    .replace(/\bsilent\b/g, "quiet")
    .replace(/\b(anyhow|in any case)\b/g, "anyway")
    .replace(/\b(probably|likely)\b/g, "probably")
    .replace(/\b(normally|typically)\b/g, "usually")
    .replace(/\bparticularly\b/g, "especially")
    .replace(/\ball of a sudden\b/g, "suddenly")
    .replace(/\b(at the moment|presently|right now)\b/g, "currently")
    .replace(/\bsearch for\b/g, "look for")
    .replace(/\bgo on\b/g, "continue")
    .replace(/\b(take place|occur)\b/g, "happen")
    .replace(/\blook after\b/g, "take care of")
    .replace(/\bparticipate\b/g, "take part")
    .replace(/\b(delay|put off)\b/g, "postpone")
    .replace(/\b(issue|trouble)\b/g, "problem")
    .replace(/\b(path|route)\b/g, "way")
    .replace(/\bview\b/g, "opinion")
    .replace(/\bchance\b/g, "opportunity")
    .replace(/\bcause\b/g, "reason")
    .replace(/\binformation\b/g, "info")
    .replace(/\bprecise\b/g, "exact")
    .replace(/\b(various|diverse)\b/g, "different")
    .replace(/\b(significant|vital)\b/g, "important")
    .replace(/\bwell-known\b/g, "famous")
    .replace(/\bwell-liked\b/g, "popular")
    .replace(/\bamusing\b/g, "funny")
    .replace(/\b(at the end|in the end)\b/g, "in the end")
    .replace(/\bevery day\b/g, "daily")
    .replace(/\bstudy(ing)?\b/g, "learn$1")   // lernen covers both; people interchange them
    .replace(/\bpossibly\b/g, "maybe")
    /**
     * A spoken question drops its auxiliary and its subject.
     *
     * "Kommst du mit?" is "Are you coming?", "Coming?" and "You coming?" —
     * one German question, several English ones a learner might reasonably
     * type, and an answer key that can print only one of them. Every
     * "Kommst du …" card had the same problem.
     *
     * Only the auxiliary-and-you opening moves, and only at the very start.
     * The pair goes as a unit, so no pronoun is ever equated with another:
     * "Am I coming?" is still not "Are you coming?", and what follows the
     * opening has to match as it always did.
     *
     * It runs LAST because it removes the very words the folds above look
     * for. Higher up it broke "Have you got a light?" = "Do you have a
     * light?" — both openings were gone before the rule that pairs them
     * could see either, and "Would you like a coffee?" = "Do you want a
     * coffee?" would have gone the same way.
     */
    .replace(/^(?:are|do|will|would|did|have|has|can|could|shall|should) you\b\s*/u, "")
    // ...and the bare "You coming?" form, where only the auxiliary was
    // dropped. Guarded to a following -ing verb, so a statement about what
    // you do ("you speak German") keeps its subject.
    .replace(/^you\s+(?=\w+ing\b)/u, "");
  // The rest of the folds live in a table rather than in this chain. They are
  // the same idea — words that may stand in for one another — but there are
  // enough of them now that a list you can read beats another hundred lines of
  // .replace, and a table can be checked wholesale by the gate.
  return foldClockTimes(foldEnglishSynonyms(chained));
}

// ─── Tier 7: "understandable" near-misses ───────────────────────────────────
// Classic German→English transfer: phrasings an English speaker fully
// understands but wouldn't say. These are accepted (the learner communicated)
// with a phrasingNote so the UI can coach: "people will understand you — more
// natural is: …". They run LAST, so a properly-phrased answer never gets
// flagged — only answers that failed every silent tier land here.
const NEAR_MISS: [RegExp, string][] = [
  // "ich will" = want — Germans say "I will…" for "I want to…", and will/can
  // requests blur ("Will you help?" / "Can you help?"). All soft-equal.
  [/\b(?:will|can|want(?:s)? to|would like to)\b/g, "~mod~"],
  // bekommen ≠ become: "Can I become a beer?" means "Can I get a beer?"
  [/\bbecome(s)?\b/g, "get$1"],
  [/\bbecame\b/g, "got"],
  [/\bchef\b/g, "boss"],                  // der Chef = the boss, not a cook
  [/\bhandy\b/g, "phone"],                // das Handy = mobile phone
  [/\bsince\b/g, "for"],                  // "I'm here since two weeks" (seit)
  // machen covers make AND do: "I make my homework" (tense kept per pair)
  [/\bmake\b/g, "do"], [/\bmakes\b/g, "does"],
  [/\bmade\b/g, "did"], [/\bmaking\b/g, "doing"],
  [/\bwith the (bus|train|tram|car|bike|taxi|subway)\b/g, "by $1"], // mit dem Bus
  [/\binformations\b/g, "info"],          // die Informationen (canonical form is "info")
  [/\bpersons\b/g, "people"],             // die Personen
];

function applyNearMiss(t: string): string {
  let s = t;
  for (const [re, sub] of NEAR_MISS) s = s.replace(re, sub);
  return s;
}

// Answer keys sometimes carry helper notes in parentheses, e.g.
// "Ok, sleep well. Love ya! (hab dich lieb)" — those are display hints, never
// something the learner should have to type.
function stripParentheticals(t: string) {
  return String(t ?? "").replace(/\([^)]*\)/g, " ");
}

// English articles are meaning-neutral for these translations: "I see the
// cash" and "I see cash" both show the German was understood.
function stripArticles(t: string) {
  return t.replace(/\b(a|an|the)\b/g, " ");
}

// True when a and b differ by at most one edit: insert/delete/substitute, or
// one adjacent swap ("learnign" == "learning").
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diffs.push(k);
    if (diffs.length === 1) return true; // substitution
    if (diffs.length === 2) {
      const [x, y] = diffs;
      return y === x + 1 && a[x] === b[y] && a[y] === b[x]; // adjacent swap
    }
    return false;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  if (l.length - s.length > 1) return false;
  let i = 0, j = 0, skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true;
    j++; // skip the extra char in the longer word
  }
  return true;
}

// A single edit at the very end of a word involving s/d is usually GRAMMAR,
// not a typo — "tastes" vs "tasted" (tense), "plays" vs "played". Those must
// not be forgiven; the learner's tense reading is part of the answer.
function isInflectionEdit(a: string, b: string): boolean {
  if (a.length === b.length) {
    return (
      a.slice(0, -1) === b.slice(0, -1) &&
      "sd".includes(a[a.length - 1]) &&
      "sd".includes(b[b.length - 1])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (long.length - short.length !== 1) return false;
  const last = long[long.length - 1];
  return long.slice(0, -1) === short && (last === "s" || last === "d");
}

// Word-by-word typo tolerance: same word count, each word exact or (length >= 5
// on both sides and within one edit), at most 2 fuzzy words per sentence.
// Final-letter s/d edits are excluded — that's tense/agreement, not spelling.
function typoClose(a: string, b: string): boolean {
  const wa = a.split(" ").filter(Boolean);
  const wb = b.split(" ").filter(Boolean);
  if (wa.length !== wb.length || wa.length === 0) return false;
  let fuzzy = 0;
  for (let k = 0; k < wa.length; k++) {
    if (wa[k] === wb[k]) continue;
    if (
      wa[k].length >= 5 && wb[k].length >= 5 &&
      withinOneEdit(wa[k], wb[k]) &&
      !isInflectionEdit(wa[k], wb[k])
    ) {
      if (++fuzzy > 2) return false;
      continue;
    }
    return false;
  }
  return fuzzy > 0;
}

/**
 * How English spells the -ing of a verb it is given.
 *
 * Forward only, and deliberately: going backwards from an -ing is ambiguous
 * — hoping and hopping arrive at the same place — while going forwards is
 * three rules and no guessing. So the learner's word is inflected and the
 * result compared with what the answer key actually wrote.
 */
function englishProgressive(base: string): string[] {
  const word = String(base ?? "").toLowerCase();
  if (word.length < 2) return [];
  const forms = new Set<string>([`${word}ing`]);
  // take → taking, come → coming. Not ee: see → seeing, not seing.
  if (word.endsWith("e") && !word.endsWith("ee")) forms.add(`${word.slice(0, -1)}ing`);
  // run → running, sit → sitting: a short verb ending consonant-vowel-consonant.
  if (/[^aeiou][aeiou][^aeiouwxy]$/u.test(word)) forms.add(`${word}${word.at(-1)}ing`);
  // lie → lying, die → dying.
  if (word.endsWith("ie")) forms.add(`${word.slice(0, -2)}ying`);
  return [...forms];
}

/**
 * The verb the learner wrote, and the verb it is if that was a third person.
 *
 * "She takes the bus" is the simple present of "take", and only the base
 * inflects to "taking". The -s is stripped speculatively, not decided: both
 * readings are offered and the comparison picks whichever reconstructs.
 */
function englishVerbBases(word: string): string[] {
  const bases = new Set<string>([word]);
  if (word.endsWith("ies") && word.length > 4) bases.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) bases.add(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 2) bases.add(word.slice(0, -1));
  return [...bases];
}

const PROGRESSIVE_AUX = new Set(["am", "is", "are", "was", "were"]);

/**
 * German has no progressive, so both English tenses render the same German.
 *
 * "Ich komme mit meiner Familie" is "I come with my family" and "I'm coming
 * with my family" equally — the distinction the learner is being marked
 * against does not exist in the sentence they were reading. Rejecting the
 * simple present marks a correct understanding of the German wrong.
 *
 * This is not leniency and is not gated behind it: it is two spellings of one
 * answer. It applies only to the side the learner is NOT learning — somebody
 * learning ENGLISH is being taught exactly this difference, and for them the
 * aspect is the answer rather than an accident of it.
 *
 * Aligned word by word rather than normalised in place, because the two
 * readings are different lengths — "I am coming" against "I come" — and the
 * auxiliary is the word that goes missing.
 */
export function sameEnglishAspect(input: string, target: string): boolean {
  const words = (value: string) => String(value ?? "")
    .toLowerCase()
    // The auxiliary is the word that decides this, and contracted it is not a
    // word at all — stripping the apostrophe first turns "I'm" into "im" and
    // hides the "am" this has to see.
    .replace(/\b(i)['’]?m\b/gu, "$1 am")
    .replace(/\b(he|she|it|that|there)['’]?s\b/gu, "$1 is")
    .replace(/\b(we|you|they)['’]?re\b/gu, "$1 are")
    .replace(/['’]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  const a = words(input);
  const b = words(target);
  let i = 0;
  let j = 0;
  let collapsed = 0;
  // One side may spend two words (auxiliary + -ing) where the other spends
  // one, so the two are walked with their own cursors rather than by index.
  const takeProgressive = (side: string[], at: number, other: string[], otherAt: number) => {
    if (!PROGRESSIVE_AUX.has(side[at])) return false;
    const verb = side[at + 1];
    if (!verb || !verb.endsWith("ing")) return false;
    return englishVerbBases(other[otherAt] ?? "")
      .some((base) => englishProgressive(base).includes(verb));
  };
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    if (takeProgressive(b, j, a, i)) { j += 2; i += 1; collapsed += 1; continue; }
    if (takeProgressive(a, i, b, j)) { i += 2; j += 1; collapsed += 1; continue; }
    return false;
  }
  return i === a.length && j === b.length && collapsed > 0;
}

/**
 * The same slip, judged for the language the learner is NOT learning.
 *
 * typoClose refuses to forgive a word shorter than five letters, and that is
 * right for the language being taught: in German a one-letter difference in a
 * short word is usually the answer itself — der against die, ihn against ihm,
 * ein against eine — and forgiving it teaches nothing. Applied to the side the
 * learner only has to make themselves understood in, the same rule protects
 * nothing and rejects teh, smal and rooom.
 *
 * So the length floor goes and the budget stays. Two slips per sentence, one
 * edit each, and the words must still line up one for one, which is what keeps
 * this from accepting a different sentence: every word has to be recognisably
 * the word that belongs there. Inflection edits stay excluded even here — a
 * final s or d is tense, and getting the tense wrong in the meaning is a
 * misread of the German rather than a slip of the finger.
 *
 * Only ever consulted AFTER the ordinary match has already failed, so it can
 * turn a rejection into a pass with a spelling note and can never turn a pass
 * into anything else.
 */
export function forgivableMeaningSlip(input: string, target: string): boolean {
  const tidy = (value: string) => String(value ?? "")
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const wa = tidy(input).split(" ").filter(Boolean);
  const wb = tidy(target).split(" ").filter(Boolean);
  if (wa.length !== wb.length || wa.length === 0) return false;
  let fuzzy = 0;
  for (let k = 0; k < wa.length; k++) {
    if (wa[k] === wb[k]) continue;
    if (forgivableWordSlip(wa[k], wb[k])) {
      if (++fuzzy > 2) return false;
      continue;
    }
    return false;
  }
  return fuzzy > 0;
}

/**
 * What a finger does, as opposed to what changes the word.
 *
 * Dropping a key, hitting one twice, or hitting two in the wrong order cannot
 * be anything but a slip, and stays forgivable at any length: teh for the,
 * smal for small, rooom for room. Substituting one letter is different — in a
 * short word it usually lands on another real word, and "the cat sat" for "the
 * bat sat" is a misread of the German being marked correct, not a typo. So a
 * substitution is only forgiven where the existing tolerance already forgave
 * it, at five letters and up, where an accidental real word is rare and
 * definately-for-definitely is the likelier reading.
 */
function forgivableWordSlip(a: string, b: string): boolean {
  if (isInflectionEdit(a, b)) return false;
  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diffs.push(k);
    if (diffs.length === 1) return a.length >= 5 && b.length >= 5; // substitution
    if (diffs.length === 2) {
      const [x, y] = diffs;
      return y === x + 1 && a[x] === b[y] && a[y] === b[x]; // two keys swapped
    }
    return false;
  }
  return withinOneEdit(a, b); // one key dropped or one struck twice
}

// Fold an -ing gerund to its base so "to listen" and "listening" compare equal
// ("listening" -> "listen", "running" -> "run", "swimming" -> "swim"). Only for
// words > 4 chars, so short non-gerunds (king, ring, sing) are left alone. Tense
// endings (-ed, -s) are deliberately NOT folded — those carry meaning.
function stemGerund(w: string): string {
  if (w.length > 4 && w.endsWith("ing")) {
    return w.slice(0, -3).replace(/([a-z])\1$/, "$1"); // drop "ing"; collapse a doubled consonant
  }
  return w;
}

// Reduce a sentence to its meaning-bearing words in ORDER: drop articles and the
// infinitive/preposition "to", and fold gerunds. Keeping the order means a
// reversed sentence ("the woman gives the man" vs "the man gives the woman")
// still fails, so this only forgives phrasing, never meaning.
function reduceForMeaning(s: string): string {
  const FUNC = new Set(["a", "an", "the", "to"]);
  return normalizeGermanInput(s)
    .split(" ")
    .filter((w) => w && !FUNC.has(w))
    .map(stemGerund)
    .join(" ");
}

/**
 * The words that carry the meaning, as an unordered set.
 *
 * English recall asks "did you understand the German", so the answer key is
 * one wording of the meaning and not the only one. "That's how I see it too"
 * and "I see it that way too" are the same thought built out of different
 * scaffolding; the scaffolding is what this drops.
 *
 * Pronouns keep their case (i is not me, he is not him) and negation is kept,
 * so answers that reverse who did what to whom still fail.
 */
const ENGLISH_SCAFFOLDING = new Set([
  "a", "an", "the", "to", "that", "this", "those", "these",
  "is", "are", "am", "was", "were", "be", "been", "being",
  "do", "does", "did", "so", "then", "just", "how", "way", "as", "there",
  "it", "and", "well", "please",
]);

// "also" normally sits beside the verb, while additive "too" / "as well"
// normally sit at the end. Preserve the fact that the additive meaning is
// present, but give it a position-independent comparison token. Restricting
// "too" to sentence-final position avoids folding "too expensive".
const ADDITIVE_MEANING_MARKER = "__additive__";

// Prepositions stay in deliberately. "of" is the entire difference between
// "could have" and the "could of" mistake the confusables pack teaches out,
// and "on the table" is not "under the table".

function meaningWords(s: string): string[] {
  return normalizeGermanInput(expandEnglishContractions(s))
    .replace(/\bas well\b/g, ADDITIVE_MEANING_MARKER)
    .replace(/\balso\b/g, ADDITIVE_MEANING_MARKER)
    .replace(/\btoo$/g, ADDITIVE_MEANING_MARKER)
    .split(" ")
    .filter(Boolean)
    .map(stemGerund)
    .filter((w) => !ENGLISH_SCAFFOLDING.has(w));
}

/**
 * Same meaning words, in any order — but only when both answers open on the
 * same one. That opening word is almost always the subject or the verb, so
 * "Peter calls Anna" is still refused for "Anna calls Peter" while a genuine
 * reshuffle of the same sentence is accepted.
 */
function sameMeaningUnordered(input: string, target: string): boolean {
  const a = meaningWords(input);
  const b = meaningWords(target);
  if (a.length < 2 || a.length !== b.length) return false;
  // Keep the first subject/verb as a safety anchor while allowing only the
  // additive marker to move around it.
  const firstAnchor = (words: string[]) =>
    words.find((word) => word !== ADDITIVE_MEANING_MARKER);
  if (firstAnchor(a) !== firstAnchor(b)) return false;
  const bag = [...b];
  for (const word of a) {
    const at = bag.indexOf(word);
    if (at === -1) return false;
    bag.splice(at, 1);
  }
  return true;
}

/**
 * Words that can begin a fronted adverbial.
 *
 * English lets a time or place phrase sit at either end: "At the weekend
 * we're going to the seaside" and "We're going to the seaside at the
 * weekend" are the same sentence, and a learner who fronts it has not made a
 * mistake.
 *
 * Only a phrase STARTING with one of these may move. Word order carries
 * meaning in English -- "the dog bit the man" is not "the man bit the dog" --
 * so accepting arbitrary reorderings would forgive real errors. An adjunct
 * moving does not change who did what to whom.
 */
const FRONTABLE = new Set([
  "at", "on", "in", "after", "before", "during", "since", "until", "by",
  "every", "each", "next", "last", "this", "tomorrow", "today", "yesterday",
  "tonight", "then", "usually", "normally", "sometimes", "often", "always",
  "never", "first", "afterwards", "later", "soon", "now", "sadly", "luckily",
  "honestly", "actually", "unfortunately", "hopefully",
]);

/**
 * The same sentence with a leading adverbial moved to the end.
 *
 * Returns nothing when the sentence does not begin with one, so the caller
 * simply does not get a second chance.
 */
function unfrontAdverbial(text: string): string[] {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  // "Sometimes I forget" is three words and still a fronted adverbial.
  if (words.length < 3) return [];
  if (!FRONTABLE.has(words[0].toLowerCase())) return [];
  const out: string[] = [];
  // An adverbial of one to five words. Beyond that it is not an adjunct any
  // more, it is most of the sentence.
  for (let take = 1; take <= Math.min(5, words.length - 2); take += 1) {
    out.push([...words.slice(take), ...words.slice(0, take)].join(" "));
  }
  return out;
}

export function matchEnglishPhrase(
  input: string,
  target: string,
  // Internal only — every external caller keeps the two-argument contract.
  // A fronted-adverbial rotation is tried once, at the outermost call; a
  // rotated variant recursing back in here must not roll its own rotations
  // on top, or a sentence with several frontable words compounds up to five
  // branches per level with no base case, which is a stack overflow away
  // from a live lesson (this is exactly what crashed one — see the crash
  // report reading "Maximum call stack size exceeded" through this file).
  allowAdverbialRetry = true
): { ok: boolean; spellingNote: boolean; capitalizationError?: boolean; phrasingNote?: boolean } {
  // "A / B" answer keys offer alternatives — accept a match against either
  // side (or the whole thing). Recurse per segment, slash-free.
  if (/\//.test(String(target ?? ""))) {
    const segments = String(target).split("/").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const r = matchEnglishPhrase(input, seg);
      if (r.ok) return r;
    }
    // fall through: compare against the whole key with "/" as a space
  }
  // "ur" is ambiguous text-speak (your / you are). The main table expands it to
  // "your"; if that fails, retry once with "you are" (recursion-safe: the
  // replacement removes the token).
  if (/\bur\b/i.test(String(input ?? ""))) {
    const alt = matchEnglishPhrase(String(input).replace(/\bur\b/gi, "you are"), target);
    if (alt.ok) return alt;
  }
  // A fronted time or place phrase is the same sentence. Tried on either
  // side: the learner may front one the answer key leaves trailing, or leave
  // one trailing that the key fronts.
  if (allowAdverbialRetry) {
    for (const moved of unfrontAdverbial(input)) {
      const alt = matchEnglishPhrase(moved, target, false);
      if (alt.ok) return alt;
    }
    for (const moved of unfrontAdverbial(target)) {
      const alt = matchEnglishPhrase(input, moved, false);
      if (alt.ok) return alt;
    }
  }
  const inputNorm = stripParentheticals(normalizeEnglishSpelling(input));
  const targetNorm = stripParentheticals(normalizeEnglishSpelling(target));
  // Tier 1: plain ("dont" == "don't" via apostrophe stripping).
  const plain = matchGermanPhrase(inputNorm, targetNorm);
  if (plain.ok) return plain;
  // Tier 2: contractions expanded ("it is" == "it's", "let us" == "let's").
  const inputC = expandEnglishContractions(inputNorm);
  const targetC = expandEnglishContractions(targetNorm);
  const contracted = matchGermanPhrase(inputC, targetC);
  if (contracted.ok) return contracted;
  // Tier 2.5: a dropped first-person subject, restored or omitted.
  //
  // English ellipsis: an answer key written the way people speak drops the
  // subject — "Found it, thanks!" — while the German it translates says the
  // subject out loud. A learner translating faithfully writes "I've found it,
  // thanks" and every other tier sees two extra tokens and refuses a sentence
  // that is, if anything, the closer translation. The reverse is the same
  // sentence too: a key that writes "I've found it" met by the elliptical
  // "Found it".
  //
  // First person only, deliberately. Elliptical English implies I/we from
  // context, so restoring "I" is safe where restoring "he" is not — "he found
  // it" answers a different question about who did the finding, and must stay
  // wrong. The prefixes are matched on the contraction-EXPANDED forms, so
  // "ive", "im" and "ill" arrive here already written out; longest first, so
  // "i have" is taken before "i" leaves "have" stranded.
  const ellipted = (text: string): string | null => {
    for (const prefix of ["i have ", "i had ", "i will ", "i would ", "i am ", "i "]) {
      if (text.startsWith(prefix) && text.length > prefix.length) return text.slice(prefix.length);
    }
    return null;
  };
  const inputSubjectless = ellipted(inputC);
  const targetSubjectless = ellipted(targetC);
  if (inputSubjectless) {
    const restored = matchGermanPhrase(inputSubjectless, targetC);
    if (restored.ok) return restored;
  }
  if (targetSubjectless) {
    const omitted = matchGermanPhrase(inputC, targetSubjectless);
    if (omitted.ok) return omitted;
  }
  if (inputSubjectless && targetSubjectless) {
    // "I found it" against a key of "I've found it": both said who, both said
    // what; the auxiliary is the only difference and German's Perfekt maps to
    // either English form.
    const both = matchGermanPhrase(inputSubjectless, targetSubjectless);
    if (both.ok) return both;
  }
  // Tier 3: articles ignored ("I see the cash" == "I see cash").
  const articles = matchGermanPhrase(stripArticles(inputC), stripArticles(targetC));
  if (articles.ok) return articles;
  // Tier 4: grammatical paraphrases ("Have you got X?" == "Do you have X?"),
  // alone and with articles ignored.
  const inputK = canonicalizeEnglish(inputC);
  const targetK = canonicalizeEnglish(targetC);
  const canonical = matchGermanPhrase(inputK, targetK);
  if (canonical.ok) return canonical;
  const canonicalArticles = matchGermanPhrase(stripArticles(inputK), stripArticles(targetK));
  if (canonicalArticles.ok) return canonicalArticles;
  // Tier 4.5: compound-word spacing — "wifi" == "Wi-Fi" == "wi fi",
  // "checkout" == "check-out". Hyphens became spaces during normalization, so
  // comparing with ALL spaces removed folds every compound-spacing variant.
  // Cross-compare every normalization form: a sloppy input ("isnt", "hes")
  // may only align with the target's UNexpanded form and vice versa.
  const spaceless = (s: string) => normalizeGermanInput(s).replace(/ /g, "");
  const inputForms = [inputNorm, inputC, inputK].map(spaceless);
  const targetForms = [targetNorm, targetC, targetK].map(spaceless);
  if (inputForms.some((i) => targetForms.includes(i))) {
    return { ok: true, spellingNote: false };
  }
  // Tier 5: small typos ("alredy" == "already") — flagged as a spelling note.
  // Tried on plain, contraction-expanded and canonical pairs, since a sloppy
  // input ("its") may only align with one form of the target.
  if (
    typoClose(normalizeGermanInput(inputNorm), normalizeGermanInput(targetNorm)) ||
    typoClose(normalizeGermanInput(inputC), normalizeGermanInput(targetC)) ||
    typoClose(normalizeGermanInput(inputK), normalizeGermanInput(targetK))
  ) {
    return { ok: true, spellingNote: true };
  }
  // Tier 6: meaning-reduced ordered match — folds gerund/infinitive
  // ("to listen" == "listening") and drops articles/"to", but keeps word order,
  // so valid rephrasings pass while reversed/wrong-order answers still fail.
  const reducedInput = reduceForMeaning(inputK);
  const reducedTarget = reduceForMeaning(targetK);
  if (reducedTarget && reducedInput === reducedTarget) {
    return { ok: true, spellingNote: false };
  }
  // Tier 6.5: the same meaning words in a different arrangement. English is
  // the learner's own language and this step is testing comprehension of the
  // German, so a correct thought worded differently must not come back as
  // "Not quite" — being told you are wrong when you are right is the one
  // failure that teaches nothing.
  if (sameMeaningUnordered(inputK, targetK)) {
    return { ok: true, spellingNote: false };
  }
  // Tier 7: recognizable German-style literal translation ("I will eat" for
  // "I want to eat", "Can I become a coffee?"). NOT accepted — a literal
  // transfer isn't the English being taught — but flagged so the UI can coach
  // kindly ("people would understand you — the natural way is …") instead of
  // showing a cold "wrong". Runs last: anything that matched a silent tier
  // above never reaches here.
  const inputM = applyNearMiss(inputK);
  const targetM = applyNearMiss(targetK);
  if (
    matchGermanPhrase(inputM, targetM).ok ||
    matchGermanPhrase(stripArticles(inputM), stripArticles(targetM)).ok ||
    (reduceForMeaning(targetM) && reduceForMeaning(inputM) === reduceForMeaning(targetM))
  ) {
    return { ok: false, spellingNote: false, phrasingNote: true };
  }
  return { ok: false, spellingNote: false };
}

// ── Paragraph grading ────────────────────────────────────────────────────────

/**
 * Words that carry no meaning of their own. Dropping them is what lets
 * "On the weekend, we often visit my parents" match "At the weekend we often
 * visit my parents": the difference is entirely function words.
 */
const PARAGRAPH_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "then", "also", "too",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "have", "has", "had",
  "to", "of", "in", "on", "at", "by", "for", "with", "from", "as", "into", "about",
  "it", "its", "this", "that", "these", "those", "there", "here",
  "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "our", "their",
  "very", "just", "some", "any", "not", "no",
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer",
  "und", "oder", "aber", "auch", "noch", "schon", "sehr", "nicht", "kein",
  "ich", "du", "er", "sie", "es", "wir", "ihr", "mich", "mir", "dich", "dir",
  "zu", "zum", "zur", "in", "im", "an", "am", "auf", "mit", "von", "vom", "bei", "für",
  "ist", "sind", "war", "waren", "sein", "haben", "hat", "hatte",
]);

/** Crude but effective stemmer: strips the endings that differ between two
 * correct translations ("practises"/"practices", "chopped"/"chopping"). */
function paragraphStem(word: string) {
  let w = word;
  if (w.length > 5) w = w.replace(/(ing|ed|es|s)$/, "");
  // British/American spelling differences that survive the -s/-ed strip.
  w = w.replace(/ise$/, "ize").replace(/isation$/, "ization").replace(/our$/, "or");
  return w;
}

function paragraphContentWords(text: string) {
  return new Set(
    String(text ?? "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !PARAGRAPH_STOPWORDS.has(w))
      .map(paragraphStem)
      .filter((w) => w.length > 2)
  );
}

/**
 * How many negations a text carries. Contractions are expanded first so
 * "didn't" and "did not" count the same, and "cannot" counts once.
 */
function countNegations(text: string) {
  const t = String(text ?? "")
    .toLocaleLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/\bcannot\b/g, "can not")
    .replace(/\b(do|does|did|is|are|was|were|has|have|had|would|should|could|must|wo|ca)nt\b/g, "$1 not");
  const matches = t.match(
    /\b(not|never|no|none|nobody|nothing|neither|nor|without|nicht|kein|keine|keinen|keinem|keiner|nie|niemals|niemand|nichts|ohne|weder)\b/g
  );
  return matches ? matches.length : 0;
}

type ParagraphMatch = {
  ok: boolean;
  spellingNote: boolean;
  phrasingNote?: boolean;
  /** 0-1 share of the reference's meaning-carrying words that were covered. */
  coverage: number;
  /** Content words from the reference the answer never mentioned. */
  missing: string[];
};

/**
 * Grade a whole-paragraph translation.
 *
 * A paragraph has many correct translations, so grading it by whole-string
 * comparison — which is what this used to do, reusing the single-sentence
 * matcher — rejected most correct answers. Measured against the app's own
 * reading passages, only 29% of legitimate paraphrases were accepted:
 * "On the weekend, we often visit my parents" and "I cut up the vegetables"
 * were both marked wrong.
 *
 * So a paragraph is graded on whether the MEANING arrived: what share of the
 * reference's content words (stemmed, function words dropped) the answer
 * covers. An exact match still short-circuits to the strict matcher, so a
 * word-perfect answer is never downgraded.
 */
export function matchParagraphAnswer(
  input: string,
  target: string,
  language: "de" | "en" = "en"
): ParagraphMatch {
  const strict = language === "de"
    ? matchGermanSentence(input, target)
    : matchEnglishPhrase(input, target);
  if (strict.ok) return { ...strict, coverage: 1, missing: [] };

  const want = paragraphContentWords(target);
  const got = paragraphContentWords(input);
  if (want.size === 0) return { ok: false, spellingNote: false, coverage: 0, missing: [] };

  // Counting content words cannot see meaning that lives in a function word.
  // "I never get up at seven" shares almost every word with "I usually get up
  // at seven" and means the opposite, so negation is compared separately —
  // otherwise a flipped sentence sails through at 93% coverage.
  if (countNegations(input) !== countNegations(target)) {
    return { ok: false, spellingNote: false, coverage: 0, missing: [...want].filter((w) => !got.has(w)) };
  }

  const missing = [...want].filter((w) => !got.has(w));
  const coverage = (want.size - missing.length) / want.size;

  // An answer that is far too short cannot have carried the meaning, even if
  // every word it does contain happens to appear in the reference.
  const lengthRatio = got.size / want.size;
  if (lengthRatio < 0.5) {
    return { ok: false, spellingNote: false, coverage, missing };
  }

  // 70% of the content words is a genuine translation with different wording.
  // Below that, enough is missing that it is worth showing the model answer.
  if (coverage >= 0.7) {
    return { ok: true, spellingNote: false, phrasingNote: coverage < 0.9, coverage, missing };
  }
  return { ok: false, spellingNote: false, coverage, missing };
}
