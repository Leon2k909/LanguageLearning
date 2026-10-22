import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { recordCrash } from "@/lib/crashReport";
import { AnimatePresence, motion, useReducedMotion, useAnimationControls } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usageNote, useUsageNotes } from "@/lib/usageNotes";
import {
  matchGermanPhrase as match,
  matchGermanMeaning,
  matchGermanSentence,
  matchEnglishMeaning,
  forgivableMeaningSlip,
  sameEnglishAspect,
  matchEnglishPhrase as matchEnglish,
  matchingVisibleKeys,
  primaryAnswer,
  primaryEnglishMeaning,
  primaryGermanMeaning,
  takeMatchingSafe,
} from "@/lib/germanTextMatch";
import { getMeaningPlacement } from "@/lib/meaningPlacement";
import { getMeaningLenience } from "@/lib/meaningLenience";
import { computeGap, gapEntryIsComplete, gapTranscriptionIsComplete, matchesGapInput, matchesGapTranscription, spokenWord } from "@/lib/gapFill";
import type { AnswerPerformance } from "@/lib/adaptivePractice";
import {
  ENGLISH_VARIANT_EVENT,
  englishVariantLabel,
  formatEnglishText,
  getEnglishVariant,
  resolveEnglishVariant,
  setEnglishVariant,
} from "@/lib/englishVariant";
import { matchLearningModeGermanAnswer } from "@/lib/learningMode";
import {
  FLASHCARD_FACE_KEY,
  FLASHCARD_MODE_EVENT,
  FLASHCARD_MODE_KEY,
  getFlashcardFace,
  getFlashcardMode,
  type FlashcardFace,
  type FlashcardMode,
} from "@/lib/flashcardMode";
import { effectsReduced } from "@/lib/effects";
import {
  GUIDED_BACKGROUND_EVENT,
  getGuidedBackground,
  getGuidedCustomBackground,
  type GuidedBackground,
} from "@/lib/guidedBackground";
import { getCompanion } from "@/lib/companion";
import { getLearningDirection, learningEnglish, targetLangTag } from "@/lib/direction";
import { courseSide, courseSides, LANGUAGE_LABEL, meaningLanguageFor, targetLanguage as courseTargetLanguage, type CourseLanguage } from "@/lib/courseLanguages";
import { matchFrenchMeaning, matchFrenchSentence } from "@/lib/frenchTextMatch";
import { matchPolishMeaning, matchPolishSentence, POLISH_SPECIAL_CHARACTERS } from "@/lib/polishTextMatch";
import { matchSpanishMeaning, matchSpanishSentence, SPANISH_SPECIAL_CHARACTERS } from "@/lib/spanishTextMatch";
import { matchItalianMeaning, matchItalianSentence, ITALIAN_SPECIAL_CHARACTERS } from "@/lib/italianTextMatch";
import { matchPortugueseMeaning, matchPortugueseSentence, PORTUGUESE_SPECIAL_CHARACTERS } from "@/lib/portugueseTextMatch";
import { matchRussianSentence } from "@/lib/russianTextMatch";
import { GREEK_SPECIAL_CHARACTERS, matchGreekMeaning, matchGreekSentence } from "@/lib/greekTextMatch";
import { ALBANIAN_SPECIAL_CHARACTERS, matchAlbanianMeaning, matchAlbanianSentence } from "@/lib/albanianTextMatch";
import { getRussianScript, resolveRussianScript, russianScriptLabel, RUSSIAN_SPECIAL_CHARACTERS, setRussianScript } from "@/lib/russianScript";
import { getGreekScript, greekScriptLabel, resolveGreekScript, setGreekScript } from "@/lib/greekScript";
import { courseLatinOf, courseShowsLatin, courseShowsNative, courseTextSecondLine, showCourseText, useCourseScript, withCourseLatin } from "@/lib/courseScript";

import {
  AUDIO_SETTINGS_EVENT,
  getSfxAudioVolume,
  getTtsAudioVolume,
} from "@/lib/audioMute";
import {
  BILINGUAL_SENTENCE_PHASES,
  buildSentencePhaseRoute,
  MASTERED_SENTENCE_PHASES as MASTERED_PHASES,
  replacementSentencePhaseWhenMuted,
  SECOND_SHOWING_PHASES,
  SENTENCE_PHASES,
  sentenceStageHeading,
  sentenceStageLabel,
  type SentencePhase as Phase,
} from "@/lib/guidedLessonPhases";
import { customStageRoute, getLessonStages } from "@/lib/lessonStages";
import { wordOrderTokensMatchSentence } from "@/lib/wordOrder";
import { wordPicture } from "@/lib/wordPictures";
import { wordPictureAsset } from "@/lib/wordPictureAssets";
import { MuteButton } from "@/components/MuteButton";
import { TtsWaveform } from "@/components/TtsWaveform";
import { useCodexPets } from "@/components/codexPets/CodexPetProvider";
import { detectRegister, REGISTER_LABEL } from "@/lib/register";
import { synonymCommonality, synonymNote } from "@/lib/wordFrequency";
import { germanWordGloss } from "@/lib/germanWordGloss";
import { englishWordGloss } from "@/lib/englishWordGloss";
import { getCodexPetFrequency } from "@/lib/codexPetCoaching";

import { TappableSentence } from "@/components/shared/TappableSentence";
import { toSpokenGerman } from "@/lib/spokenGerman";
import { tts, ttsSequence, TTS_SPEAKING_EVENT } from "@/lib/voice";
import { listenIsHoldingAudio } from "@/lib/listenSession";

/**
 * The speech a lesson makes on its own, as opposed to when it is asked.
 *
 * Listen can be left running while a lesson is opened, and then two things
 * want the speakers. tts() stops whatever is playing before it starts, so a
 * card reading itself aloud did not talk over a Listen session, it ended one —
 * a sentence at a time, silently, for as long as the lesson lasted.
 *
 * Between the two, Listen wins while it is playing, because it is the thing
 * the learner deliberately started and left running. The lesson is not
 * silenced: it stops volunteering. Every button that says a word out loud
 * still says it, because pressing one is a request and answering it is not
 * talking over anybody. Pausing or closing the Listen player hands the voice
 * straight back.
 */
function lessonSpeak(text: string, rate: number, lang: string): Promise<void> {
  if (listenIsHoldingAudio()) return Promise.resolve();
  return tts(text, rate, lang);
}
import { ui, uiOr, uiFmt, uiNumber } from "@/lib/i18n";
import { cefrBadgeLabel } from "@/lib/cefr";
import { ContinueLearningSettings } from "@/components/duo/ContinueLearningSettings";
import { germanSoundsAlike } from "@/lib/germanSoundAlike";
import { getSittingOrder, SITTING_ORDER_LABELS } from "@/lib/sittingOrder";
import { ArrowLeftRight, Settings2, Volume2, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, X, BookOpen, ArrowRight, MessageSquareQuote, RotateCcw, Languages, GripVertical, Eye, EyeOff, Lightbulb, Keyboard, ListChecks, MousePointerClick, SkipForward } from "lucide-react";
// TTS now runs through the /api/tts server (premium Microsoft voices in every
// browser) with an automatic fall back to the browser's built-in speechSynthesis.
// See src/lib/voice.ts.

// ── Subtle game-feel sounds (Web Audio, no assets) ────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!_audioCtx) _audioCtx = new Ctor();
    return _audioCtx;
  } catch { return null; }
}
/** The sound-effect context sleeps between dings for the same reason the
 *  voice one does — see AUDIO_IDLE_SUSPEND_MS in lib/voice.ts. A tone lasts a
 *  fifth of a second; the context used to stay awake for the whole session
 *  after the first one, keeping the renderer exempt from throttling. */
const SFX_IDLE_SUSPEND_MS = 4000;

/**
 * How long a correct answer waits before checking itself.
 *
 * Long enough that somebody still typing is not cut off — a short answer can
 * be the opening of a longer one — and short enough that it does not read as
 * the app hesitating over something it has already accepted.
 */
const AUTO_CHECK_PAUSE_MS = 450;
/**
 * How long the missing-word stage waits before playing its first option.
 *
 * Long enough for the sentence that opens the stage to be read, short enough
 * that it feels like the stage starting rather than something the learner
 * triggered by waiting.
 */
const MISSING_WORD_OPENING_MS = 700;

/**
 * How long a reading stage waits before going on by itself.
 *
 * Read and Meaning first ask for no answer — they show the phrase, speak it,
 * and wait for a press that is the same press every single time. Ten seconds
 * is long enough to read a sentence and hear it through, and the countdown is
 * on screen the whole time, so it is a stage that finishes rather than a
 * screen that is taken away.
 */
const READING_STAGE_MS = 10_000;
/** The stages that read to you and ask nothing back. */
const READING_PHASES: readonly Phase[] = ["Read", "MeaningFirst"];

/**
 * An answer reduced to the letters and digits in it, lower case.
 *
 * Only ever compared with another answer's shape, to ask whether one is the
 * beginning of the other. Punctuation and capitals are set aside because the
 * matcher sets them aside too — a line typed without its full stop is the
 * same answer, and must not read as an unfinished one.
 */
function answerShape(text: string): string {
  return String(text ?? "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
let sfxIdleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSfxIdleSuspend() {
  if (typeof window === "undefined") return;
  if (sfxIdleTimer !== null) clearTimeout(sfxIdleTimer);
  sfxIdleTimer = setTimeout(() => {
    sfxIdleTimer = null;
    if (_audioCtx && _audioCtx.state === "running") void _audioCtx.suspend().catch(() => {});
  }, SFX_IDLE_SUSPEND_MS);
}

function playTone(freqs: number[], dur = 0.12, type: OscillatorType = "sine", gain = 0.05) {
  const sfxVolume = getSfxAudioVolume();
  if (sfxVolume <= 0) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (sfxIdleTimer !== null) { clearTimeout(sfxIdleTimer); sfxIdleTimer = null; }
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const start = now + i * dur * 0.85;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain * sfxVolume, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(start); osc.stop(start + dur);
    });
    scheduleSfxIdleSuspend();
  } catch { /* ignore */ }
}
const playCorrect = () => playTone([523.25, 783.99], 0.12, "sine", 0.045);   // C5 → G5 ding
const playWrong = () => playTone([180], 0.18, "triangle", 0.04);             // soft low thunk
function insertAt(el: HTMLInputElement | null, char: string, set: (s: string) => void) {
  if (!el) return;
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  const next = el.value.slice(0, s) + char + el.value.slice(e);
  set(next);
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + char.length, s + char.length); });
}

// Section
/**
 * Register + usage context chips: tells the learner WHO you say this to
 * (du = friends/family vs Sie = polite), WHEN you'd use it, and — for vocab
 * items — how COMMON the word is (rank in the frequency word bank), so
 * same-meaning words are distinguishable ("Gegner" is a top-2,500 word,
 * "Feind" isn't). The usage note is hidden during Translate — some notes
 * would give the answer away.
 */
function UsageChips({ de, use: rawUse, lookup, tierNote, hideUse, short, shortLabel, long, synonyms }: { de: string; use?: string; lookup?: string; tierNote?: string; hideUse?: boolean; short?: string; shortLabel?: string; long?: string; synonyms?: Array<{ de: string; lookup?: string }> }) {
  // The note is written in English and read in six languages. usageNote gives
  // back whichever of those is available, and the hook redraws the chip when
  // the table for this language lands.
  useUsageNotes();
  const use = usageNote(rawUse);
  const register = detectRegister(de);
  // A combined synonym card names its own siblings below, which says
  // everything the pairwise note would — the note stays for cards without
  // a group (sentences whose key word has a taught sibling).
  // Hidden with the usage note during Translate: in the learn-English course
  // the meaning IS German, so a German synonym chip would hand the answer over.
  const groupSynonyms = hideUse ? [] : synonyms ?? [];
  const syn = groupSynonyms.length ? null : synonymNote(lookup);
  const isWarning = use && (
    use.toLowerCase().includes("uncommon") ||
    use.toLowerCase().includes("warning") ||
    use.toLowerCase().includes("incorrect") ||
    use.toLowerCase().includes("avoid")
  );
  const isSlang = use && (
    use.toLowerCase().includes("slang") ||
    use.toLowerCase().includes("informal") ||
    use.toLowerCase().includes("friends") ||
    use.toLowerCase().includes("colloquial") ||
    use.toLowerCase().includes("casual")
  );

  // Short colloquial form (e.g. "Weiß nicht" for "Ich weiß es nicht"). Hidden
  // during Translate — it's an alternative German phrasing and would give it away.
  const showShort = Boolean(short && !hideUse && short.trim().toLowerCase() !== de.trim().toLowerCase());
  // In Conversation mode the target itself is the short form. Keep the fuller
  // standard version visible in the same place where Exam mode shows the spoken
  // alternative, so the relationship between the two forms is unmistakable.
  const showLong = Boolean(long && !hideUse && long.trim().toLowerCase() !== de.trim().toLowerCase());
  // Two different things wear this chip and the learner cannot tell them
  // apart. A `short` is a genuinely different, shorter WORDING -- you could
  // type it instead. A `long` in Conversation mode is usually the same words
  // written out, where the only difference is the ich-form -e that gets
  // dropped in speech: "ich versteh" against "ich verstehe". One is a choice
  // about what to say, the other is only how it is said, and being told
  // "Full version" for both leaves you guessing which.
  const longIsSpokenForm = Boolean(
    long && toSpokenGerman(long).trim().toLowerCase() === de.trim().toLowerCase()
  );
  if (!register && !syn && !groupSynonyms.length && !tierNote && !showShort && !showLong && (!use || (hideUse && !isWarning && !isSlang))) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Niche/casual pack note — uncommon German is always labelled */}
      {tierNote && (
        <span
          title={ui("Not everyday neutral German — use in the right company")}
          className="fs-tier-note rounded-full px-2.5 py-1 text-[11px] font-black"
        >
          {uiOr(tierNote, "Besonderer Sprachgebrauch")}
        </span>
      )}
      {register === "informal" && (
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-600">
          {ui(REGISTER_LABEL.informal)}
        </span>
      )}
      {register === "plural" && (
        <span
          title={ui("The German is aimed at more than one person. English says \"you\" either way.")}
          className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-black text-amber-600"
        >
          {ui(REGISTER_LABEL.plural)}
        </span>
      )}
      {register === "formal" && (
        <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-black text-indigo-500">
          {ui(REGISTER_LABEL.formal)}
        </span>
      )}
      {syn ? (
        <span
          title={uiOr(syn.hint, "Hinweis zur Wortwahl")}
          className={syn.kind === "rare"
            ? "rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-black text-amber-600"
            : "rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-black text-sky-600"}
        >
          {uiOr(syn.label, "Hinweis zur Wortwahl")}
        </span>
      ) : null}
      {/* No bare frequency-tier chip here any more. "less common" with no
          referent read as a dangling comparison ("less common than WHAT?"),
            and commonality is backstage information — it orders and
          filters, it does not badge. The chips that survive all NAME their
          reference: the pairwise note above, the combined-card synonyms
          below. */}
      {/* The rest of a combined synonym card: same meaning, named and tiered,
          so the learner sees the words Germans reach for less often without
          being dealt a separate card for each one. */}
      {groupSynonyms.map((entry) => {
        // Measured against the word leading the card, not on its own. A bare
        // tier read as a dangling comparison for the same reason the chip
        // above it was removed: "common" next to a face of the same tier
        // says nothing. Unranked words (slang, function words) still get no
        // claim — being listed after the face already says who leads.
        const versus = synonymCommonality(lookup || de, entry.lookup || entry.de);
        return (
          <span
            key={entry.de}
            title={versus ? ui(versus.hint) : ui("Same meaning — the most common word leads this card.")}
            className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-black text-sky-600"
          >
            {ui("Also")}: {entry.de}{versus ? <> · {ui(versus.label)}</> : null}
          </span>
        );
      })}
      {use && (!hideUse || isWarning || isSlang) && (
        <span className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-bold border",
          isWarning
            ? "bg-rose-500/10 text-rose-600 font-black border-rose-500/20"
            : isSlang
              ? "bg-amber-500/10 text-amber-600 font-black border-amber-500/20"
              // Tokens, not raw zinc: bg-zinc-100 is #f4f4f5, so this usage note
            // sat on the dark session as a cream island.
            : "bg-[var(--surface-3)] text-[var(--text-3)] border-transparent"
        )}>
          {/* usageNote() above already gave this back in the reader's
              language. It used to be handed to uiOr() as well, from before
              the notes had tables of their own — and uiOr returns
              table[value] ?? table[fallback] ?? fallback, never the value it
              was given. A translated sentence is not a key in the INTERFACE
              table, so every note that came back translated was thrown away
              and the chip drew the words "Hinweis zur Verwendung" instead, in
              all seven languages, over fourteen thousand cards. */}
          {use}
        </span>
      )}
      {showShort && (
        <span
          title={shortLabel ? uiOr(shortLabel, "Hinweis zur Verwendung") : ui("A shorter wording people use. Typing either one is accepted.")}
          className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-black text-teal-600"
        >
          {shortLabel ? uiOr(shortLabel, "Hinweis zur Verwendung") : ui("Shorter, and fine to type")}: “{short}”
        </span>
      )}
      {showLong && (
        <span
          title={longIsSpokenForm
            ? ui("The same words. Only the spoken ending differs, and both are accepted.")
            : ui("Complete standard form")}
          className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-black text-teal-600"
        >
          {longIsSpokenForm ? ui("Written out (same words)") : ui("Full version")}: “{long}”
        </span>
      )}
    </div>
  );
}

// Windows Alt codes for each helper character, surfaced on hover so learners
// can graduate from clicking the buttons to typing the characters directly.
const GERMAN_ALT_CODES: Record<string, string> = {
  "Ä": "0196", "ä": "0228", "Ö": "0214", "ö": "0246", "Ü": "0220", "ü": "0252", "ß": "0223",
};

const FRENCH_ALT_CODES: Record<string, string> = {
  "é": "0233", "è": "0232", "ê": "0234", "à": "0224", "â": "0226",
  "ç": "0231", "î": "0238", "ô": "0244", "û": "0251", "œ": "0156",
};

function CharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {["Ä","ä","Ö","ö","Ü","ü","ß"].map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={`${c} · Alt + ${GERMAN_ALT_CODES[c]}`}
          aria-keyshortcuts={`Alt+${GERMAN_ALT_CODES[c]}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

/**
 * The accent row under a typing box, for whichever language that box is in.
 *
 * German needs ä ö ü ß, French needs é è ê ç, Polish needs ą ć ę ł ń ó ś ź ż,
 * and English needs nothing at all.
 * Which of the three belongs under a box depends on whether the box is asking
 * for the target or for the meaning — and there are ten of them, which is ten
 * chances to write `!learnEn` where a third course needs a third answer.
 */
// Written out per language rather than composed, so the German reads as
// German ("Deutsche Wörter zum Anordnen") rather than as a slot filled in.
const WORDS_TO_ARRANGE_LABEL: Record<"de" | "en" | "fr" | "pl" | "es" | "it" | "pt" | "ru" | "el" | "sq", string> = {
  de: "German words to arrange",
  en: "English words to arrange",
  fr: "French words to arrange",
  pl: "Polish words to arrange",
  es: "Spanish words to arrange",
  it: "Italian words to arrange",
  pt: "Portuguese words to arrange",
  ru: "Russian words to arrange",
  el: "Greek words to arrange",
  sq: "Albanian words to arrange",
};

function AccentKeys({ language, onInsert }: { language: "de" | "en" | "fr" | "pl" | "es" | "it" | "pt" | "ru" | "el" | "sq"; onInsert: (c: string) => void }) {
  if (language === "fr") return <FrenchCharBar onInsert={onInsert} />;
  if (language === "pl") return <PolishCharBar onInsert={onInsert} />;
  if (language === "es") return <SpanishCharBar onInsert={onInsert} />;
  if (language === "it") return <ItalianCharBar onInsert={onInsert} />;
  if (language === "pt") return <PortugueseCharBar onInsert={onInsert} />;
  if (language === "ru") return <RussianCharBar onInsert={onInsert} />;
  if (language === "el") return <GreekCharBar onInsert={onInsert} />;
  if (language === "sq") return <AlbanianCharBar onInsert={onInsert} />;
  if (language === "de") return <CharBar onInsert={onInsert} />;
  return null;
}

function AccentRow({ language, onInsert }: { language: "de" | "en" | "fr" | "pl" | "es" | "it" | "pt" | "ru" | "el" | "sq"; onInsert: (c: string) => void }) {
  useCourseScript();
  if (language === "en") return null;
  // The Cyrillic and Greek rows are not helpers beside the keyboard, they ARE
  // the keyboard, so each belongs on screen only while its alphabet is what
  // the learner reads. On the Latin setting the transcription is written in
  // letters the keyboard already has, which is the point of it.
  if (!courseShowsNative(language)) return null;
  return <div className="fs-charsrow"><AccentKeys language={language} onInsert={onInsert} /></div>;
}

// French accent helper row for the French typing phase
function FrenchCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {["é","è","ê","à","â","ç","î","ô","û","œ"].map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={`${c} · Alt + ${FRENCH_ALT_CODES[c]}`}
          aria-keyshortcuts={`Alt+${FRENCH_ALT_CODES[c]}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

/**
 * Polish accent helper row.
 *
 * No Alt+NNNN hint beside the letters, unlike the German and French rows.
 * Those codes address the active Windows ANSI code page, and a Western one
 * holds ä ö ü ß é è ç but not ą ć ę ł ń ś ź ż — Alt+0185 there produces ¹, not
 * ą. A wrong instruction is worse than a missing one, so the buttons are the
 * whole answer here.
 */
/**
 * Russian character row.
 *
 * Every other row on this screen offers the handful of letters a foreign
 * keyboard cannot reach. Russian has no such handful: not one of its
 * thirty-three letters is on a German, French or Polish keyboard, so this row
 * is not a helper beside the keyboard, it IS the keyboard. Both cases are
 * offered because a Russian sentence capitalises proper nouns mid-line —
 * "Я живу в Москве" — and with lower case alone that М could not be typed at
 * all.
 *
 * Only shown when the learner is reading Cyrillic. On the Latin setting the
 * transcriptions are written in letters the keyboard already has, which is
 * the point of them.
 */
function RussianCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {RUSSIAN_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

function PolishCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {POLISH_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}
/**
 * Spanish accent helper row.
 *
 * No Alt+NNNN hint, for the same reason the Polish row has none: those codes
 * address the active Windows code page, and the one a British or German
 * machine is set to does hold á é í ó ú ü ñ — but ¿ and ¡ are on it at 0191
 * and 0161 while the letters are not where a learner would guess. The buttons
 * are the whole answer here.
 *
 * ñ leads the row on purpose. Every other character on it passes with a
 * spelling note when it is missed; ñ does not, because año and ano are two
 * words. The one the matcher will not forgive is the one nearest the thumb.
 */
function SpanishCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SPANISH_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

/**
 * The Italian row.
 *
 * No Alt+NNNN hint, for the same reason the Spanish row has none.
 *
 * è leads it, and for the same reason ñ leads the Spanish one: every other
 * character here passes with a spelling note when it is missed, and è does
 * not, because it is the verb "is" and "e" is "and". é sits beside it rather
 * than being folded into it — Italian writes both and means different sounds:
 * perché takes the acute, caffè the grave.
 */
function ItalianCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ITALIAN_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

/**
 * The Greek row.
 *
 * Like the Russian one it is the keyboard rather than a helper beside it: no
 * Greek letter is on a German, French or English layout. So it follows the
 * alphabet switch the same way — on screen while Greek is, gone on the Latin
 * setting, where the answer is the transcription and the learner's own
 * keyboard already has every letter of it. See AccentRow.
 */
function GreekCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {GREEK_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

/**
 * The Albanian row: ë and ç, the two letters Albanian adds to the alphabet.
 * Typed as e and c they still pass, as a slip — see albanianTextMatch.ts —
 * but ë is the most frequent letter in Albanian, so it is one tap away.
 */
function AlbanianCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ALBANIAN_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

function PortugueseCharBar({ onInsert }: { onInsert: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PORTUGUESE_SPECIAL_CHARACTERS.map(c => (
        <motion.button key={c} type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title={c}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
          onMouseDown={e => { e.preventDefault(); onInsert(c); }}>
          {c}
        </motion.button>
      ))}
    </div>
  );
}

// Section
// The recognition rounds follow the first exposure: learners identify a whole
// spoken phrase, then identify one missing word from audio-only choices.
// Type and Translate each run twice to build memory through production. The
// final three rounds are deliberately closed-book: rehearsal ends at the
// write-from-memory stage,
// then the learner has to retrieve the target, meaning, and finally both.
const CLOSED_BOOK_PHASES: readonly Phase[] = MASTERED_PHASES;

/**
 * The short route for a phrase the learner already recalls reliably.
 *
 * Drilling something through the full lesson route when it has been recalled
 * correctly three times running is just tax on someone who knows it. A strong
 * item goes straight to the closed-book checks; getting one wrong drops it back
 * onto the full route, because the run of successes evidently didn't mean what
 * it looked like.
 */
function isClosedBookPhase(phase: Phase): boolean {
  return CLOSED_BOOK_PHASES.includes(phase);
}

type MissingWordPrompt = {
  answer: string;
  display: string;
};

function computeListeningGap(sentence: string): MissingWordPrompt {
  const tokens = String(sentence ?? "").trim().split(/\s+/).filter(Boolean);
  const candidates = tokens
    .map((token, index) => ({ index, answer: spokenWord(token) }))
    .filter(({ answer }) => answer.length >= 3)
    .sort((a, b) => b.answer.length - a.answer.length)
    .slice(0, 4)
    .sort((a, b) => choiceHash(`${sentence}|${a.index}`) - choiceHash(`${sentence}|${b.index}`));
  const selected = candidates[0] ?? (tokens.length ? { index: 0, answer: spokenWord(tokens[0]) } : null);
  if (!selected?.answer) return { answer: "", display: sentence };

  return {
    answer: selected.answer,
    display: tokens.map((token, index) => (index === selected.index ? "____" : token)).join(" "),
  };
}

type OrderToken = {
  id: string;
  text: string;
};

function buildOrderTokens(sentence: string): OrderToken[] {
  const tokens = String(sentence ?? "").trim().split(/\s+/).filter(Boolean).map((text, index) => ({
    id: `${index}-${text}`,
    text,
  }));
  if (tokens.length < 2) return tokens;

  let seed = Array.from(sentence).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
  const shuffled = [...tokens];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    const swapAt = seed % (index + 1);
    [shuffled[index], shuffled[swapAt]] = [shuffled[swapAt], shuffled[index]];
  }
  if (wordOrderTokensMatchSentence(shuffled, sentence)) {
    const visiblyDifferentIndex = shuffled.findIndex(
      (token, index) => index > 0 && token.text !== shuffled[0].text
    );
    if (visiblyDifferentIndex > 0) {
      [shuffled[0], shuffled[visiblyDifferentIndex]] = [shuffled[visiblyDifferentIndex], shuffled[0]];
    }
  }
  return shuffled;
}

function cleanTranslationToken(token: string): string {
  return String(token ?? "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’-]+$/gu, "");
}

function buildTranslationChoices(answer: string, pool: string[] = [], distractorLimit = 3): OrderToken[] {
  const answerTokens = String(answer ?? "").trim().split(/\s+/).filter(Boolean).map((text, index) => ({
    id: `answer-${index}-${text}`,
    text,
  }));
  const answerKey = choiceKey(primaryAnswer(answer));
  const seen = new Set(
    answerTokens
      .map((token) => choiceKey(cleanTranslationToken(token.text)))
      .filter(Boolean)
  );

  const distractors = pool
    .filter((candidate) => choiceKey(primaryAnswer(candidate)) !== answerKey)
    .flatMap((candidate) => primaryAnswer(candidate).trim().split(/\s+/))
    .map(cleanTranslationToken)
    .filter((word) => {
      const key = choiceKey(word);
      if (word.length < 2 || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => choiceHash(`${answer}|decoy|${a}`) - choiceHash(`${answer}|decoy|${b}`))
    .slice(0, distractorLimit)
    .map((text, index) => ({
      id: `decoy-${index}-${text}`,
      text,
    }));

  return [...answerTokens, ...distractors]
    .sort((a, b) => choiceHash(`${answer}|position|${a.id}`) - choiceHash(`${answer}|position|${b.id}`));
}

function moveOrderToken(tokens: OrderToken[], from: number, to: number): OrderToken[] {
  if (from === to || from < 0 || to < 0 || from >= tokens.length || to >= tokens.length) return tokens;
  const next = [...tokens];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function choiceKey(value: string): string {
  return String(value ?? "").trim().toLocaleLowerCase("de-DE");
}

function choiceHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildListeningChoices(answer: string, pool: string[], limit = 4): string[] {
  const answerKey = choiceKey(answer);
  const seen = new Set<string>([answerKey]);
  const distractors = pool
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      const key = choiceKey(value);
      if (!key || seen.has(key)) return false;
      // Same rule for the whole-sentence listening choice: two readings
      // that sound the same test the speaker, not the learner.
      if (germanSoundsAlike(value, answer)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => choiceHash(`${answer}|${a}`) - choiceHash(`${answer}|${b}`))
    .slice(0, Math.max(0, limit - 1));

  return [answer, ...distractors]
    .sort((a, b) => choiceHash(`position|${answer}|${a}`) - choiceHash(`position|${answer}|${b}`));
}

function buildMissingWordChoices(answer: string, pool: string[], limit = 3): string[] {
  const answerKey = choiceKey(answer);
  const seen = new Set<string>([answerKey]);
  const distractors = pool
    .flatMap((sentence) => String(sentence ?? "").trim().split(/\s+/))
    .map(spokenWord)
    .filter((word) => {
      const key = choiceKey(word);
      if (word.length < 2 || !key || seen.has(key)) return false;
      // The learner only hears these. A distractor that arrives at the ear
      // as the answer does — vier against wir, seid against seit — is not a
      // harder question but an unanswerable one, and the sort below makes it
      // likelier by preferring words the answer's length.
      if (germanSoundsAlike(word, answer)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const lengthDifference = Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length);
      return lengthDifference || choiceHash(`${answer}|${a}`) - choiceHash(`${answer}|${b}`);
    })
    .slice(0, Math.max(0, limit - 1));

  return [answer, ...distractors]
    .filter(Boolean)
    .sort((a, b) => choiceHash(`missing-position|${answer}|${a}`) - choiceHash(`missing-position|${answer}|${b}`));
}

// The names live beside the route so settings can show the same ones.
function phaseLabel(p: Phase, withFrench: boolean) {
  if (withFrench && p === "Type") return "German";
  return sentenceStageLabel(p);
}

// Big stage title for the lesson heading ("Build the sentence" style).
function phaseHeading(p: Phase, withFrench: boolean): string {
  if (withFrench && p === "Type") return "Type the German";
  return sentenceStageHeading(p);
}

// The sentence as tappable words — click any word to hear just that word.
// Hovering (or right-clicking) a German word opens a small popover with its
// meaning and a "Practice this word" action that saves it to the learner's own
// words, so a tricky spelling like Postfiliale can be drilled on its own later.

// Prototype-style stage route: numbered squares with labels on a progress
// line. Clicking a stage jumps to it (same behaviour the dots had).
/**
 * Conversation Beta's frame: the question this sentence answers.
 *
 * A phrase learned on its own is one you can recite. Shown as the reply to
 * something somebody actually asked, it is one you can use -- and the course
 * already contains the question, because these lines come from dialogues.
 * The structure notes sit beside it because the beta chooses sentences BY
 * their grammar, so saying which grammar is the point.
 */
function StageRoute({ current, currentIndex, withFrench = false, locked = false, onClickPhase, onClickStage, phases }: {
  current: Phase;
  /** The position in the route. A stage that runs twice has two positions and
   *  one name, so the name alone cannot say which of them is lit. */
  currentIndex?: number;
  withFrench?: boolean;
  locked?: boolean;
  onClickPhase?: (p: Phase) => void;
  onClickStage?: (index: number) => void;
  /** Overrides the default route, for a phrase taking the short mastered path. */
  phases?: Phase[];
}) {
  // The bar must show the route actually being run. A phrase on the short
  // mastered route would otherwise display the full route and complete after
  // three, which reads as the lesson breaking rather than as a shortcut earned.
  const allPhases: Phase[] = phases
    ? [...phases]
    : withFrench ? [...BILINGUAL_SENTENCE_PHASES] : [...SENTENCE_PHASES];
  const idx = currentIndex !== undefined && allPhases[currentIndex] === current
    ? currentIndex
    : allPhases.indexOf(current);
  const n = allPhases.length;
  // A stage run again is named as a repeat, the way the old route said Type
  // again. Two identical labels side by side read as the bar breaking.
  const stageNameAt = (p: Phase, index: number) => {
    const name = ui(phaseLabel(p, withFrench));
    const earlier = allPhases.slice(0, Math.max(0, index)).filter((q) => q === p).length;
    return earlier > 0 ? uiFmt("{stage} again", { stage: name }) : name;
  };
  const activeStageRef = useRef<HTMLButtonElement>(null);
  const shortcutMenuRef = useRef<HTMLDivElement>(null);
  const shortcutTriggerRef = useRef<HTMLButtonElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const half = 100 / (n * 2); // center of first/last column, in %
  // Fill runs from the first stage's center to the current stage's center.
  const fillPct = n > 1 ? (Math.max(idx, 0) / (n - 1)) * 100 : 0;
  useEffect(() => {
    activeStageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [current]);
  useEffect(() => {
    if (!shortcutsOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!shortcutMenuRef.current?.contains(event.target as Node)) setShortcutsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShortcutsOpen(false);
      window.requestAnimationFrame(() => shortcutTriggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [shortcutsOpen]);

  const shortcutForStage = (stageIndex: number) => {
    if (stageIndex < 9) {
      return { label: `Ctrl+${stageIndex + 1}`, aria: `Control+${stageIndex + 1}` };
    }
    if (stageIndex === 9) return { label: "Ctrl+0", aria: "Control+0" };
    return {
      label: `Ctrl+Shift+${stageIndex - 9}`,
      aria: `Control+Shift+${stageIndex - 9}`,
    };
  };

  return (
    <div className="fs-stagebar">
      <div className="fs-stagemeta">
        <div>
          <span>{ui("Stage")} {idx + 1} {ui("of")} {n}</span>
          <strong>{stageNameAt(current, idx)}</strong>
        </div>
        <div className="fs-stage-tools" ref={shortcutMenuRef}>
          <button
            ref={shortcutTriggerRef}
            type="button"
            className="fs-shortcut-trigger"
            aria-expanded={shortcutsOpen}
            aria-controls="lesson-keyboard-shortcuts"
            aria-label={ui("Keyboard shortcuts")}
            title={ui("Keyboard shortcuts")}
            onClick={() => setShortcutsOpen((open) => !open)}
          >
            <Keyboard aria-hidden="true" />
            <span className="fs-shortcut-trigger-keys"><kbd>←</kbd><kbd>→</kbd></span>
            <span className="fs-shortcut-trigger-label">{ui("Move stages")}</span>
          </button>
          {shortcutsOpen && (
            <div
              id="lesson-keyboard-shortcuts"
              className="fs-shortcut-panel"
              role="region"
              aria-label={ui("Keyboard shortcuts")}
            >
              <div className="fs-shortcut-head">
                <div>
                  <Keyboard aria-hidden="true" />
                  <strong>{ui("Keyboard shortcuts")}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShortcutsOpen(false);
                    window.requestAnimationFrame(() => shortcutTriggerRef.current?.focus());
                  }}
                  aria-label={ui("Close")}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="fs-shortcut-list">
                <div className="fs-shortcut-row">
                  <span><kbd>←</kbd><kbd>→</kbd></span>
                  <strong>{ui("Previous / next stage (when not typing)")}</strong>
                </div>
                <div className="fs-shortcut-row">
                  <span><kbd>Ctrl</kbd><kbd>{n <= 9 ? `1–${n}` : "1–9"}</kbd></span>
                  <strong>{ui("Jump directly to a stage")}</strong>
                </div>
                {n >= 10 && (
                  <div className="fs-shortcut-row">
                    <span><kbd>Ctrl</kbd><kbd>0</kbd></span>
                    <strong>{ui("Jump to stage 10")}</strong>
                  </div>
                )}
                {n > 10 && (
                  <div className="fs-shortcut-row">
                    <span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>{`1–${n - 10}`}</kbd></span>
                    <strong>{ui("Jump to stages 11–15")}</strong>
                  </div>
                )}
                <div className="fs-shortcut-row">
                  <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span>
                  <strong>{ui("Choose an answer")}</strong>
                </div>
                <div className="fs-shortcut-row">
                  <span><kbd>Enter</kbd></span>
                  <strong>{ui("Check / continue")}</strong>
                </div>
                <div className="fs-shortcut-row">
                  <span><kbd>Alt</kbd><kbd>K</kbd></span>
                  <strong>{ui("Know it")}</strong>
                </div>
                <div className="fs-shortcut-row">
                  <span><kbd>Alt</kbd><kbd>S</kbd></span>
                  <strong>{ui("Struggle")}</strong>
                </div>
              </div>
              <div className="fs-shortcut-altcodes">
                <div className="fs-shortcut-altcodes-head">
                  <strong>{ui("German characters")}</strong>
                  <span>{ui("Windows number pad")}</span>
                </div>
                <div className="fs-shortcut-altcodes-grid">
                  {[
                    ["ä", "0228"],
                    ["ö", "0246"],
                    ["ü", "0252"],
                    ["ß", "0223"],
                  ].map(([character, code]) => (
                    <div className="fs-shortcut-altcode" key={character}>
                      <strong>{character}</strong>
                      <span><kbd>Alt</kbd><b>+</b><code>{code}</code></span>
                    </div>
                  ))}
                </div>
                <p>{ui("Uppercase: Ä Alt + 0196 · Ö Alt + 0214 · Ü Alt + 0220")}</p>
              </div>
              <p>{ui("Stage numbers use Ctrl so Windows Alt-codes keep working. Hold Alt while typing the number-pad code, then release it. Arrow keys never take over an answer box.")}</p>
            </div>
          )}
        </div>
      </div>
      <div className="fs-stagetrack-scroll">
        <div className={cn("fs-stagetrack", n > 13 && "has-many-stages")} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          <div className="fs-stageline" style={{ left: `${half}%`, right: `${half}%` }} aria-hidden>
            <i style={{ width: `${fillPct}%` }} />
          </div>
          {allPhases.map((p, i) => {
            const stageShortcut = shortcutForStage(i);
            const stageName = stageNameAt(p, i);
            return (
              <button
                key={`${p}-${i}`}
                ref={i === idx ? activeStageRef : undefined}
                type="button"
                title={`${ui("Stage")} ${i + 1}: ${stageName} · ${stageShortcut.label}`}
                aria-label={`${ui("Stage")} ${i + 1}: ${stageName}. ${stageShortcut.label}`}
                aria-keyshortcuts={stageShortcut.aria}
                aria-current={i === idx ? "step" : undefined}
                onClick={() => (onClickStage ? onClickStage(i) : onClickPhase?.(p))}
                disabled={locked}
                className={cn(
                  "fs-stagebtn",
                  isClosedBookPhase(p) && "is-recall",
                  i === idx ? "is-active" : i < idx && "is-done"
                )}
              >
                <span>{i + 1}</span>
                <small>{stageName}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useStickyFocus(ref: React.RefObject<HTMLInputElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const el = () => ref.current;
    el()?.focus();

    const INTERACTIVE = "input, textarea, select, button, a, [contenteditable], [role='button'], [tabindex]";
    const shouldSkip = () => {
      // Something is highlighted — never yank focus away from a selection.
      const sel = window.getSelection?.();
      if (sel && !sel.isCollapsed && String(sel).trim().length > 0) return true;
      // The user is focused on another real control (button, other input…).
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && a !== el() && a.closest?.(INTERACTIVE)) return true;
      return false;
    };

    const restore = () => { if (!shouldSkip()) el()?.focus(); };
    // After a click/drag finishes, and after modifier-key shortcuts.
    const onMouseUp = () => setTimeout(restore, 0);
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Tab") return; setTimeout(restore, 0); };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [ref, active]);
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(
    element.isContentEditable
    || element.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
  );
}

function directStageShortcutIndex(event: KeyboardEvent): number | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  if (!match) return null;
  const digit = Number(match[1]);
  if (event.shiftKey) return digit >= 1 && digit <= 6 ? digit + 9 : null;
  return digit === 0 ? 9 : digit - 1;
}

function buildRecallHint(answer: string): string {
  const words = primaryAnswer(answer).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  // Every word gets its first letter and no more. Handing over a whole first
  // word gave most of a two-word answer away, and a word of one letter is
  // nothing but its first letter, so it stays hidden too.
  return words.map((word) => {
    const letters = Array.from(word).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
    let revealedLetter = letters < 2;
    return Array.from(word).map((character) => {
      if (!/[\p{L}\p{N}]/u.test(character)) return character;
      if (!revealedLetter) {
        revealedLetter = true;
        return character;
      }
      return "•";
    }).join("");
  }).join(" ");
}

function RecallHelp({
  answer,
  hint,
  label,
  onHelp,
}: {
  answer: string;
  hint?: string;
  label?: string;
  onHelp?: () => void;
}) {
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const shownText = level === 2 ? primaryAnswer(answer) : (hint ?? buildRecallHint(answer));

  return (
    <div className={cn("fs-recall-help", level > 0 && "is-open", level === 2 && "is-answer")}>
      <div className="fs-recall-help-row">
        <span className="fs-recall-help-label">
          <Lightbulb aria-hidden="true" className="h-4 w-4" />
          {label && <>{ui(label)} <span aria-hidden="true">·</span></>} {ui("Need help?")}
        </span>
        <button
          type="button"
          className="fs-recall-help-action"
          onClick={() => {
            if (level < 2) onHelp?.();
            setLevel(level === 0 ? 1 : level === 1 ? 2 : 1);
          }}
          aria-expanded={level > 0}
        >
          {level === 0 ? (
            <><Lightbulb aria-hidden="true" className="h-4 w-4" /> {ui("Hint")}</>
          ) : level === 1 ? (
            <><Eye aria-hidden="true" className="h-4 w-4" /> {ui("Show answer")}</>
          ) : (
            <><EyeOff aria-hidden="true" className="h-4 w-4" /> {ui("Hide answer")}</>
          )}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {level > 0 && (
          <motion.div
            key={level}
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            className="fs-recall-help-content"
            role="status"
            aria-live="polite"
          >
            <span>{ui(level === 2 ? "Answer" : "Hint")}</span>
            <strong>{shownText}</strong>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TranslationWordBank({
  tokens,
  selected,
  disabled,
  checked,
  correct,
  onPick,
  onRemove,
}: {
  tokens: OrderToken[];
  selected: OrderToken[];
  disabled: boolean;
  checked: boolean;
  correct: boolean;
  onPick: (token: OrderToken) => void;
  onRemove: (index: number) => void;
}) {
  const selectedIds = new Set(selected.map((token) => token.id));

  return (
    <div className={cn(
      "fs-translation-bank",
      checked && correct && "is-good",
      checked && !correct && "is-bad"
    )}>
      <div className="fs-translation-answer" aria-label={ui("Your answer")}>
        <span className="fs-translation-bank-label">{ui("Your answer")}</span>
        <div className="fs-translation-picked" aria-live="polite">
          {selected.length === 0 ? (
            <span className="fs-translation-placeholder">{ui("Choose words to build your answer.")}</span>
          ) : selected.map((token, index) => (
            <button
              key={`${token.id}-picked`}
              type="button"
              className="fs-translation-picked-word"
              onClick={() => onRemove(index)}
              disabled={disabled}
              aria-label={`${ui("Remove word")}: ${token.text}`}
            >
              {token.text}
            </button>
          ))}
        </div>
      </div>
      <div className="fs-translation-options" aria-label={ui("Available words")}>
        <span className="fs-translation-bank-label">{ui("Available words")}</span>
        <div>
          {tokens.map((token) => {
            const used = selectedIds.has(token.id);
            return (
              <button
                key={token.id}
                type="button"
                className={cn("fs-translation-option", used && "is-used")}
                onClick={() => onPick(token)}
                disabled={disabled || used}
                aria-hidden={used}
                tabIndex={used ? -1 : 0}
              >
                {token.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// A single labeled language row (German / French) for bilingual companion mode.
// `active` highlights the language the learner is currently being asked to type.
function LangBlock({ label, text, active, onHear, onKnown, onStruggle }: {
  label: string;
  text: string;
  active?: boolean;
  onHear: () => void;
  onKnown?: () => void;
  onStruggle?: () => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl p-4 transition-all",
      active
        ? "border-[1.5px] border-[var(--accent)] bg-white shadow-[0_0_0_3px_rgba(120,52,247,0.12)]"
        : "border border-zinc-100 bg-zinc-50/70"
    )}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">
          {label}
          {active && (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-black text-white">
              type this
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {onKnown && (
            <button
              type="button"
              onClick={onKnown}
              className="grade-btn grade-btn-known !h-7 !rounded-full !px-3 !text-xs"
            >
              {ui("Know it")}
            </button>
          )}
          {onStruggle && (
            <button
              type="button"
              onClick={onStruggle}
              className="grade-btn grade-btn-struggle !h-7 !rounded-full !px-3 !text-xs"
            >
              {ui("Struggle")}
            </button>
          )}
          <button
            type="button"
            aria-label={`Hear the ${label} sentence`}
            onClick={onHear}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-600 shadow-[inset_0_0_0_1px_#e4e4e7] transition-colors hover:bg-zinc-50"
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="text-2xl font-black leading-tight tracking-tight text-zinc-950 sm:text-3xl">
        {text}
      </div>
    </div>
  );
}

/**
 * The tag of the language this lesson teaches.
 *
 * This used to answer for French and English and send everything else to
 * German, which is how Polish, Spanish, Italian, Portuguese and Russian
 * lessons came to call themselves German: read out by a German voice, and —
 * because TappableSentence only transcribes when the tag says Russian — with
 * the alphabet setting reaching nothing. direction.ts already answers this
 * for every course, so it answers it here too; only the English variant is
 * this screen's own, because a British learner is marked against British.
 */
/**
 * Grade an answer typed into the meaning box, in whatever language that box
 * is written in.
 *
 * Each language already has a matcher for this — it is what the country tests
 * use — and they agree on their answer shape. Only the lesson still asked
 * "German or English", because until the meaning column could be a third
 * language there was nothing else to ask.
 */
function matchMeaningInLanguage(input: string, target: string, language: CourseLanguage) {
  if (language === "fr") return matchFrenchMeaning(input, target);
  if (language === "pl") return matchPolishMeaning(input, target);
  if (language === "es") return matchSpanishMeaning(input, target);
  if (language === "it") return matchItalianMeaning(input, target);
  if (language === "pt") return matchPortugueseMeaning(input, target);
  if (language === "ru") return matchRussianSentence(input, target);
  if (language === "el") return matchGreekMeaning(input, target);
  if (language === "sq") return matchAlbanianMeaning(input, target);
  if (language === "de") return matchGermanMeaning(input, target);
  return matchEnglishMeaning(input, target);
}

/**
 * What to say when the only thing wrong is a capital letter.
 *
 * It used to state the German rule on every course, so a French learner who
 * typed "paris" was told about German nouns — in English, whatever the app
 * language. The German rule is only offered where it is the rule.
 */
function capitalLetterHint(targetLang: string): string {
  return targetLang.startsWith("de")
    ? ui("Check the capital letters: a sentence starts with one, and in German so does every noun, and Sie, Ihnen and Ihr when they mean you.")
    : ui("Check the capital letters.");
}

function guidedTargetLanguageTag(): string {
  const direction = getLearningDirection();
  if (direction === "learn-en") {
    return resolveEnglishVariant(getEnglishVariant()) === "british" ? "en-GB" : "en-US";
  }
  return targetLangTag();
}

/**
 * The English variant, watched rather than read once.
 *
 * Every screen that shows English text needs the same answer, and the answer
 * can now change while a lesson is open.
 */
function useEnglishVariant() {
  const [variant, setVariant] = useState(() => getEnglishVariant());
  useEffect(() => {
    const sync = () => setVariant(getEnglishVariant());
    window.addEventListener(ENGLISH_VARIANT_EVENT, sync);
    return () => window.removeEventListener(ENGLISH_VARIANT_EVENT, sync);
  }, []);
  return variant;
}

/**
 * A whole line of course text, drawn in the alphabet the learner chose.
 *
 * TappableSentence does this for the lesson stages, word by word, so that a
 * word can be tapped and heard. Everywhere else a line of the course is
 * shown and not tapped — the preview flashcard, the matching board, an
 * answer in the feedback, a tile to put in order, the blanked sentence — and
 * each needs the same transformation without the splitting. Without it they
 * were the screens the Russian script setting never reached: Cyrillic
 * whatever was chosen, and no transcription under it on the both setting.
 *
 * Only what the eye reads changes. The text handed to the voice stays in the
 * course's own alphabet, because that is what its voice can pronounce.
 */
function CourseText({ code, text }: { code: string; text: string }) {
  useCourseScript();
  const second = courseTextSecondLine(code, text);
  return (
    <>
      {showCourseText(code, text)}
      {second && <span className="fs-translit-inline">{second}</span>}
    </>
  );
}

function PromptLanguageBadge({ label }: { label: string }) {
  const isGerman = label === "German";
  const isEnglish = label === "English";
  const isRussian = label === "Russian";
  const isGreek = label === "Greek";
  // Either alphabet switch, and the interface language that names it.
  useCourseScript();
  // The English side mirrors the German flag treatment, but honours the
  // profile's English-variant setting so British learners see their own flag.
  const stored = useEnglishVariant();
  const englishVariant = isEnglish ? resolveEnglishVariant(stored) : null;
  // The first two letters of the name happen to be the code for French and
  // German; they are not for Polish, which would read PO. A code is a code.
  const shortLabel = ({ German: "DE", English: "EN", French: "FR", Polish: "PL" } as Record<string, string>)[label]
    ?? label.slice(0, 2).toUpperCase();
  const title = englishVariant
    // The flag already says which variant you are being
    // marked against, so it is the obvious thing to press to change it —
    // rather than leaving the lesson for Settings and coming back.
    ? `${ui(englishVariantLabel(englishVariant))} — ${ui("tap to switch")}`
    : ui(label);

  if (isEnglish) {
    return (
      <button
        type="button"
        data-testid="english-variant-switch"
        className={cn("fs-prompt-language", "is-english", "is-switchable")}
        aria-label={title}
        title={title}
        onClick={() => setEnglishVariant(englishVariant === "british" ? "american" : "british")}
      >
        <i
          className={cn("fs-english-flag", englishVariant === "british" ? "is-british" : "is-american")}
          aria-hidden="true"
        />
      </button>
    );
  }

  /**
   * The Russian badge switches the ALPHABET, where the English one switches
   * the spelling — the same gesture in the same place, for the same reason:
   * the badge already says what you are being marked against, so it is the
   * obvious thing to press to change it, and leaving a lesson to find
   * Settings is not a switch.
   *
   * It shows the two letters themselves rather than a flag or a code. Аа
   * against Aa is the choice, drawn in the thing being chosen, and it needs
   * no translation to read.
   */
  if (isRussian) {
    const script = resolveRussianScript(getRussianScript());
    const scriptTitle = `${ui(russianScriptLabel(script))} — ${ui("tap to switch")}`;
    return (
      <button
        type="button"
        data-testid="russian-script-switch"
        className={cn("fs-prompt-language", "is-switchable")}
        aria-label={scriptTitle}
        title={scriptTitle}
        onClick={() => setRussianScript(
          // Three states now, so the badge steps through them rather than
          // flipping: Cyrillic, Latin, then both at once.
          script === "cyrillic" ? "latin" : script === "latin" ? "both" : "cyrillic"
        )}
      >
        {script === "cyrillic" ? "Аа" : script === "latin" ? "Aa" : "Аа/Aa"}
      </button>
    );
  }

  /**
   * The Greek badge, the same switch for the same reason. It draws αβ against
   * ab rather than the Russian pair's capital and small letter, because a
   * Greek capital alpha is the Latin A — Αα and Aa would be the same picture
   * on both sides of the choice.
   */
  if (isGreek) {
    const script = resolveGreekScript(getGreekScript());
    const scriptTitle = `${ui(greekScriptLabel(script))} — ${ui("tap to switch")}`;
    return (
      <button
        type="button"
        data-testid="greek-script-switch"
        className={cn("fs-prompt-language", "is-switchable")}
        aria-label={scriptTitle}
        title={scriptTitle}
        onClick={() => setGreekScript(
          script === "greek" ? "latin" : script === "latin" ? "both" : "greek"
        )}
      >
        {script === "greek" ? "αβ" : script === "latin" ? "ab" : "αβ/ab"}
      </button>
    );
  }

  return (
    <span
      className={cn("fs-prompt-language", isGerman && "is-german")}
      aria-label={title}
      title={title}
    >
      {isGerman ? (
        <i className="fs-german-flag" aria-hidden="true" />
      ) : isEnglish ? (
        <i
          className={cn("fs-english-flag", englishVariant === "british" ? "is-british" : "is-american")}
          aria-hidden="true"
        />
      ) : (
        shortLabel
      )}
    </span>
  );
}

type GuidedReviewLevel = "know" | "struggle" | "new" | "permanent" | 1 | 2 | 3 | 4 | 5;

/**
 * The rungs, described by what they actually do.
 *
 * These notes used to read "Review tomorrow", "Review in 3 days" and so on,
 * which was not true. A date on the ladder is the EARLIEST a review is asked
 * for, and an item you keep getting wrong is deliberately pulled back before
 * it -- that is the app working as intended, but the label promised something
 * else and so it read as a bug. Snooze is the control that genuinely holds an
 * item back; these set how strongly you know it.
 */
const GUIDED_REVIEW_LEVELS: Array<{ value: GuidedReviewLevel; label: string; note: string }> = [
  { value: "new", label: "New", note: "Starts over from the beginning" },
  { value: "struggle", label: "Struggling", note: "Comes back as soon as there is a slot" },
  { value: 1, label: "Not confident", note: "Comes back soon, often within a day" },
  { value: 2, label: "Familiar", note: "About 3 days away, sooner if you slip" },
  { value: 3, label: "Strong", note: "About 10 days away, sooner if you slip" },
  { value: 4, label: "Solid", note: "About 30 days away, sooner if you slip" },
  { value: 5, label: "Mastered", note: "About 180 days away, sooner if you slip" },
  { value: "permanent", label: "Never review", note: "Never comes back at all" },
];

/**
 * Putting something off, and meaning it.
 *
 * The rungs above are about how well you know a phrase, and the app is
 * allowed to bring those back early. These are a hard floor: nothing shows a
 * snoozed phrase before its date -- not a struggle mark, not the pet, not the
 * extra practice that repeated mistakes would normally earn it.
 */
const GUIDED_SNOOZE_CHOICES: Array<{ days: number; label: string; note: string }> = [
  { days: 1, label: "Tomorrow", note: "Nothing brings it back today" },
  { days: 3, label: "In 3 days", note: "Held back until then" },
  { days: 7, label: "In a week", note: "Held back until then" },
  { days: 30, label: "In a month", note: "Held back until then" },
];

function ReviewLevelPicker({
  onKnown,
  onSelect,
  onSnooze,
  disabled = false,
  knownAriaLabel,
  showShortcut = false,
  variant = "grade",
}: {
  onKnown: () => void;
  onSelect: (level: GuidedReviewLevel) => void;
  onSnooze?: (days: number) => void;
  disabled?: boolean;
  knownAriaLabel?: string;
  showShortcut?: boolean;
  variant?: "grade" | "flashcard";
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const openMenu = () => {
    cancelClose();
    if (!disabled) setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 180);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className={cn("fs-review-level fs-known-review", variant === "flashcard" && "is-flashcard")}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        scheduleClose();
      }}
      onFocusCapture={openMenu}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      ref={menuRef}
    >
      <div className="fs-known-review-trigger">
        <button
          aria-label={knownAriaLabel}
          className={variant === "flashcard" ? "fs-flashcard-known" : "grade-btn grade-btn-known"}
          disabled={disabled}
          onClick={onKnown}
          type="button"
        >
          {variant === "flashcard" && <CheckCircle2 className="h-4 w-4" />}
          {ui("Know it")}
          {showShortcut && <kbd className="grade-kbd">Alt K</kbd>}
        </button>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ui("More Know it options")}
          className="fs-known-review-more"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            cancelClose();
            setOpen((current) => !current);
          }}
          title={ui("More Know it options")}
          type="button"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="fs-review-level-menu" role="menu" aria-label={ui("Set review level")}>
          <div className="fs-review-level-menu-head">
            <strong>{ui("Set review level")}</strong>
            <span>{ui("How well do you know this? The app can still bring it back early if you keep slipping.")}</span>
          </div>
          <div className="fs-review-level-options">
            {GUIDED_REVIEW_LEVELS.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="menuitem"
                className={cn("fs-review-level-option", option.value === "struggle" && "is-struggle", option.value === "permanent" && "is-permanent")}
                onClick={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
              >
                <strong>{ui(option.label)}</strong>
                <small>{ui(option.note)}</small>
              </button>
            ))}
          </div>
          {onSnooze && (
            <div className="fs-review-snooze">
              <div className="fs-review-level-menu-head">
                <strong>{ui("Or put it off")}</strong>
                <span>{ui("This one is a promise. Nothing shows it before the date you pick.")}</span>
              </div>
              <div className="fs-review-level-options">
                {GUIDED_SNOOZE_CHOICES.map((choice) => (
                  <button
                    key={choice.days}
                    type="button"
                    role="menuitem"
                    className="fs-review-level-option is-snooze"
                    onClick={() => {
                      onSnooze(choice.days);
                      setOpen(false);
                    }}
                  >
                    <strong>{ui(choice.label)}</strong>
                    <small>{ui(choice.note)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * How long the "Marked as …" notice stays up before clearing itself. Long
 * enough to read the sentence it names and reach for Undo, short enough that
 * it is gone by the time the next card is being answered.
 */
const MANUAL_REVIEW_NOTICE_MS = 5000;

function reviewLevelDetails(level: GuidedReviewLevel) {
  if (level === "know") {
    return { label: "Known", note: "This item will return much later for a proper check." };
  }
  return GUIDED_REVIEW_LEVELS.find((option) => option.value === level) ?? GUIDED_REVIEW_LEVELS[0];
}

/**
 * Does choosing this level mean "I'm finished with this one for now"?
 *
 * Saying an item is Mastered — or that it should never be reviewed again —
 * and then being kept on it, still asked to pick its meaning, contradicts the
 * choice that was just made. Those levels schedule the item away, so the
 * lesson should move on exactly as "Know it" does.
 *
 * The two that stay put are the ones that ask for MORE practice, not less:
 * "Struggling" keeps the item in rotation, and "New" restarts it from scratch.
 */
function reviewLevelFinishesItem(level: GuidedReviewLevel): boolean {
  return level !== "struggle" && level !== "new";
}

// Only advances when the user types the sentence correctly.
/**
 * The "marked as …" note, shown inside the verdict card rather than above it.
 *
 * It used to be its own banner floating above "Not quite", which made one
 * moment look like two separate things happening: a verdict, and then an
 * unrelated red bar about scheduling. It is the same moment -- you got it
 * wrong, and here is what that means for when you see it again -- so it
 * belongs in the same card.
 */
/**
 * A conversation built from the phrases that are due.
 *
 * The beta used to be the ordinary thirteen-stage drill with the question
 * printed above it, which is not a conversation by any reading -- you still
 * read, chose, typed and translated the sentence in isolation, and the
 * question was decoration. This replaces the drill for those items: somebody
 * asks, you answer with the phrase, and that answer IS the review.
 *
 * One turn at a time, and the turns you have done stay on screen, so by the
 * end you are looking at a conversation you had rather than a list of
 * sentences you got right.
 */
function ManualReviewNote({ grade, notice, onUndo, onDismiss, onHold, onRelease }: {
  grade: string | null;
  notice?: { label: string; note: string; subject?: string } | null;
  onUndo?: () => void;
  onDismiss?: () => void;
  onHold?: () => void;
  onRelease?: () => void;
}) {
  if (grade !== "struggle" && !notice) return null;
  const isStruggle = grade === "struggle" || notice?.label === "Struggling";
  return (
    <span
      className={cn("fs-result-note", isStruggle && "is-struggle")}
      role="status"
      onMouseEnter={onHold}
      onMouseLeave={onRelease}
      onFocusCapture={onHold}
      onBlurCapture={onRelease}
    >
      <span className="fs-result-note-text">
        {isStruggle
          ? ui("Marked as struggle. This item will stay in practice instead of being skipped next time.")
          : `${ui("Marked as")} ${ui(notice?.label ?? "")}. ${ui(notice?.note ?? "")}`}
        {/* Which phrase. Once putting one off moves the lesson on, the note
            is describing something no longer on screen, and an Undo you
            cannot identify is one nobody will press. */}
        {notice?.subject && (
          <span className="fs-result-note-subject"> — “{notice.subject}”</span>
        )}
      </span>
      {notice && (
        <span className="fs-result-note-actions">
          <button type="button" className="fs-result-note-undo" onClick={onUndo}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {ui("Undo")}
          </button>
          <button
            type="button"
            className="fs-result-note-dismiss"
            aria-label={ui("Dismiss")}
            onClick={onDismiss}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      )}
    </span>
  );
}

/**
 * The CEFR level of what is on screen, when the catalogue knows one.
 *
 * The level belongs to the PACK, and every item in a pack carries its pack's
 * label — so this says "the lesson this came from is A2", not "this word is
 * A2". That is the claim the data can actually support, and the tooltip says
 * so rather than letting a bare badge overstate it. A per-word difficulty
 * would have to be invented, and inventing one is how a beginner ends up
 * being told a rare compound noun is A1.
 */
function CefrBadge({ level }: { level: unknown }) {
  const label = cefrBadgeLabel(level);
  if (!label) return null;
  return (
    <span className="fs-level-badge" title={ui("The level of the lesson this comes from")}>
      {label}
    </span>
  );
}

function SentenceExercise({ item, listeningChoicePool, translationChoicePool = [], onNext, onGradeItem, onReviewLevel, onSnooze, onAnswer, onSlip, manualReviewNotice, onUndoManualReview, onDismissManualReview, onHoldManualReview, onReleaseManualReview, markedLevel = null, onClearMark }: {
  item: any;
  listeningChoicePool: string[];
  translationChoicePool: string[];
  onNext: () => void;
  onGradeItem?: (itemId: string, grade: "know" | "struggle") => void;
  onReviewLevel?: (level: GuidedReviewLevel) => void;
  onSnooze?: (days: number) => void;
  onAnswer?: (correct: boolean) => void;
  /**
   * The right words with a wrong letter. Reported separately from onAnswer
   * because the two earn different things: a slip earns the writing stages,
   * a wrong answer earns another meeting with the phrase.
   */
  onSlip?: () => void;
  /** The pending mark for THIS item, so the banner can host Undo inline. */
  manualReviewNotice?: { label: string; note: string } | null;
  onUndoManualReview?: () => void;
  /** Pause the notice's own countdown while it is being read or aimed at. */
  onHoldManualReview?: () => void;
  onReleaseManualReview?: () => void;
  onDismissManualReview?: () => void;
  /**
   * The mark standing on this item right now, which is not the same thing as
   * the notice about it: the notice clears itself after a few seconds, the
   * mark stays until it is taken off. The grade buttons read this so they
   * still show what was decided once the notice has gone.
   */
  markedLevel?: GuidedReviewLevel | null;
  /** Press a lit button again to take its mark off. */
  onClearMark?: () => void;
}) {
  // The when- and say-boxes below draw card prose through usageNote(), which
  // is a plain lookup: the table for this language may land after the first
  // paint, and a subscription inside UsageChips would only redraw UsageChips.
  useUsageNotes();
  const shakeControls = useAnimationControls();
  const reactToAnswer = (ok: boolean, gentle = false, animate = true) => {
    onAnswer?.(ok);
    if (!animate) return;
    if (ok) shakeControls.start({ scale: [1, 1.05, 1], transition: { duration: 0.32 } });
    // A coached near-miss ("people would understand you") gets a soft pulse,
    // not the hard error shake — it's a teaching moment, not a slap.
    else if (gentle) shakeControls.start({ scale: [1, 1.02, 1], transition: { duration: 0.3 } });
    else shakeControls.start({ x: [0, -9, 9, -7, 7, -3, 0], transition: { duration: 0.42 } });
  };
  // A phrase the learner already recalls reliably starts on the closed-book
  // checks instead of the full route. Failing one of them sets this, which puts
  // the full route back — the short route is a reward for remembering, not a
  // permanent downgrade of how carefully the phrase is taught.
  const [recallFailed, setRecallFailed] = useState(false);
  /**
   * Set when this phrase's one typing test is missed, or declined.
   *
   * A new phrase is written out once: Hear & write, with nothing on the
   * screen to copy from. Passing that is the evidence the writing stages
   * existed to gather — the sound heard, the spelling right, the sentence
   * produced — so they are not asked for. Missing it is what buys them back.
   *
   * Reaching for the four options counts as missing it. They are there and
   * they are allowed, but picking one is recognition, and recognition is the
   * thing this stage is not.
   *
   * Held per phrase, and the component remounts for each one, so nothing has
   * to reset it.
   */
  // Seeded from the item, because the miss is remembered past the remount: a
  // phrase whose spelling was failed comes back as a struggle review carrying
  // typingFailed, so its spelling is checked again rather than waved through
  // the one-test route as if nothing had happened.
  const [typingFailed, setTypingFailed] = useState(() => Boolean(item?.typingFailed));
  // A phrase taught a couple of cards ago, back for its quick tap-through.
  const isSecondShowing = Boolean(item?.secondShowing);
  const masteredRoute = item?.mastery === "strong" && !recallFailed;
  const [audioMuted, setAudioMuted] = useState(
    () => getTtsAudioVolume(guidedTargetLanguageTag()) <= 0
  );
  const audioMutedRef = useRef(audioMuted);
  useEffect(() => {
    const syncAudioState = () => {
      // Listening checks require the voice for the language being learned.
      // Muting only German or only English must therefore remove those checks
      // even when sound effects and the other language remain audible.
      const muted = getTtsAudioVolume(guidedTargetLanguageTag()) <= 0;
      audioMutedRef.current = muted;
      setAudioMuted(muted);
    };
    syncAudioState();
    window.addEventListener(AUDIO_SETTINGS_EVENT, syncAudioState);
    return () => window.removeEventListener(AUDIO_SETTINGS_EVENT, syncAudioState);
  }, []);
  const [phase, setPhase] = useState<Phase>(
    item?.secondShowing
      ? SECOND_SHOWING_PHASES[0]
      : item?.mastery === "strong" ? MASTERED_PHASES[0] : "Read"
  );
  const currentPhaseRef = useRef<Phase>(phase);
  useEffect(() => { currentPhaseRef.current = phase; }, [phase]);
  /**
   * Where in the route the lesson is, by position.
   *
   * The stage used to be tracked by name alone, and moving on meant finding
   * that name in the route and taking the one after. That breaks the moment a
   * stage appears twice: from the second Type it finds the first, hands back
   * Type again, and never gets past it. The name still says WHAT to show —
   * which is all the stage branches below ever ask — and the step says WHERE,
   * which is what moving on needs.
   */
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  // Read once per card: the stages are a settings decision, and a card half
  // way through them is not where a change should take effect.
  const customRoute = useMemo(() => customStageRoute(getLessonStages()), []);
  /** The stages this phrase actually runs through. */
  // A vocabulary sitting reuses these exercises but not the whole march:
  // a single word runs the short word route (see guidedLessonPhases).
  const isWordItem = item?.kind === "word";
  // Two tiles have exactly one possible arrangement other than the shuffle
  // they start in, so dragging them "in order" tests nothing — drop the
  // stage rather than ship a one-move formality.
  const isOrderable = String(item?.de ?? "").trim().split(/\s+/).filter(Boolean).length > 2;
  // Everything that decides the route except the sound. The muted-stage
  // replacement below reads the same set: when it was handed its own shorter
  // list it judged a chained or failed-typing phrase against the lean route,
  // found Translate missing there, and sent every Next on Type back to Read.
  const routeOptions = () => ({
    mastered: masteredRoute,
    bilingual: hasFr,
    word: isWordItem,
    orderable: isOrderable,
    // Set by the lesson builder when this sentence extends one served a few
    // cards earlier: the introduce-from-cold stages are already spent.
    chained: Boolean(item?.chainedFromLesson),
    typingFailed,
    custom: customRoute,
    secondShowing: isSecondShowing,
  });
  const phaseRoute = (): Phase[] => buildSentencePhaseRoute({
    ...routeOptions(),
    audioMuted: audioMutedRef.current,
  });
  // True while the app voice is actually speaking — drives the waveform accent.
  const [ttsOn, setTtsOn] = useState(false);
  useEffect(() => {
    const onSpeak = (e: Event) => setTtsOn(Boolean((e as CustomEvent).detail));
    window.addEventListener(TTS_SPEAKING_EVENT, onSpeak);
    return () => window.removeEventListener(TTS_SPEAKING_EVENT, onSpeak);
  }, []);
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState(false);
  const [enInput, setEnInput] = useState("");
  const [enChecked, setEnChecked] = useState(false);
  const [translationMode, setTranslationMode] = useState<"bank" | "type">("type");
  const [translationPicked, setTranslationPicked] = useState<OrderToken[]>([]);
  /**
   * One entry per blank.
   *
   * The sentence can blank two words, and one box for both meant the learner
   * had to infer — from a plural in the placeholder — that a space-separated
   * pair was wanted. Two blanks now get two boxes, so the shape of the answer
   * is visible before anything is typed.
   *
   * The matcher still receives one joined string: it already accepts the
   * words in either order and refuses a missing one, and every rule about
   * hyphens, apostrophes and spellings lives behind that single entry point.
   * Splitting the ENTRY must not fork the JUDGING.
   */
  const [gapInputs, setGapInputs] = useState<string[]>([]);
  const gapInput = gapInputs.join(" ");
  const setGapInputAt = (index: number, value: string) => setGapInputs((previous) => {
    const next = [...previous];
    while (next.length <= index) next.push("");
    next[index] = value;
    return next;
  });
  const [gapChecked, setGapChecked] = useState(false);
  const gapInputRef = useRef<HTMLInputElement>(null);
  // Every box, and which one the caret was last in — the accent row has to
  // put its character where the learner is working, not always in the first.
  const gapInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const gapFocusIndex = useRef(0);
  const [meaningSelectChoice, setMeaningSelectChoice] = useState<string | null>(null);
  const [meaningSelectChecked, setMeaningSelectChecked] = useState(false);
  const [listeningChoice, setListeningChoice] = useState<string | null>(null);
  const [listeningChecked, setListeningChecked] = useState(false);
  // The listening stage is dictation first: hear it, write it. The four
  // options are still here, but as the way out rather than the way in —
  // recognising one of four is a far weaker test than producing the line, so
  // it is offered to anyone stuck instead of handed to everyone by default.
  const [listeningMode, setListeningMode] = useState<"type" | "pick">("type");
  const [listeningInput, setListeningInput] = useState("");
  const [listeningTypeChecked, setListeningTypeChecked] = useState(false);
  const [listeningMisses, setListeningMisses] = useState(0);
  const listeningInputRef = useRef<HTMLInputElement>(null);
  const [missingWordPreview, setMissingWordPreview] = useState<string | null>(null);
  const [missingWordChoice, setMissingWordChoice] = useState<string | null>(null);
  const [missingWordChecked, setMissingWordChecked] = useState(false);
  const [orderTokens, setOrderTokens] = useState<OrderToken[]>(() => buildOrderTokens(item.de));
  const [orderChecked, setOrderChecked] = useState(false);
  const [orderTouched, setOrderTouched] = useState(false);
  const [orderSelected, setOrderSelected] = useState<number | null>(null);
  const [orderDragging, setOrderDragging] = useState<string | null>(null);
  const [orderDropTarget, setOrderDropTarget] = useState<string | null>(null);
  const draggedOrderTokenId = useRef<string | null>(null);
  const suppressOrderClickRef = useRef(false);
  const orderAdvanceTimerRef = useRef<number | null>(null);

  // Final "Write it" stage: type the whole target sentence from its meaning.
  const [sayInput, setSayInput] = useState("");
  const [sayChecked, setSayChecked] = useState(false);
  const sayRef = useRef<HTMLInputElement>(null);
  const [recallBothTargetInput, setRecallBothTargetInput] = useState("");
  const [recallBothMeaningInput, setRecallBothMeaningInput] = useState("");
  const [recallBothTargetChecked, setRecallBothTargetChecked] = useState(false);
  const [recallBothChecked, setRecallBothChecked] = useState(false);
  // Is a verdict card on screen? If one is, it hosts the "marked as" note;
  // if not, the note needs a card of its own or Undo has nowhere to live.
  const verdictShowing = enChecked || gapChecked || meaningSelectChecked
    || listeningChecked || listeningTypeChecked || missingWordChecked || orderChecked || sayChecked
    || recallBothTargetChecked || recallBothChecked;
  const recallBothTargetRef = useRef<HTMLInputElement>(null);
  const recallBothMeaningRef = useRef<HTMLInputElement>(null);
  const [recallTransitionPending, setRecallTransitionPending] = useState(false);
  const recallTransitionPendingRef = useRef(false);
  const recallCompletionScheduledRef = useRef(false);
  const recallCompletionTimerRef = useRef<number | null>(null);
  const recallAdvanceTokenRef = useRef(0);
  const [frInput, setFrInput] = useState("");
  const [frChecked, setFrChecked] = useState(false);
  const [memDeInput, setMemDeInput] = useState("");
  const [memDeChecked, setMemDeChecked] = useState(false);
  const [memFrInput, setMemFrInput] = useState("");
  const [memFrChecked, setMemFrChecked] = useState(false);
  const [grade, setGrade] = useState<"know" | "struggle" | null>(null);
  // The lesson owns the pending mark; this banner is one of its two faces.
  // When the notice times out up there, the banner has to go with it —
  // otherwise the toast disappears and this copy sits on the card for ever.
  useEffect(() => {
    if (!manualReviewNotice) setGrade(null);
  }, [manualReviewNotice]);
  const inputRef = useRef<HTMLInputElement>(null);
  const enInputRef = useRef<HTMLInputElement>(null);
  const frInputRef = useRef<HTMLInputElement>(null);
  const memDeRef = useRef<HTMLInputElement>(null);
  const memFrRef = useRef<HTMLInputElement>(null);

  // The answer box stays focused so you can always just type — but selecting
  // text (the sentence, the meaning) is never interrupted. One hook per typing
  // phase; only the active phase's box claims focus.
  useStickyFocus(inputRef, phase === "Type");
  useStickyFocus(enInputRef, (phase === "Translate") && translationMode === "type");
  useStickyFocus(listeningInputRef, phase === "ListenPick" && listeningMode === "type");
  useStickyFocus(gapInputRef, phase === "Gap");
  useStickyFocus(sayRef, phase === "WriteFromMemory");
  useStickyFocus(frInputRef, phase === "French");
  const englishVariant = useEnglishVariant();
  // Which alphabet a Russian or Greek card is read in. The badge on the
  // typing prompt switches it mid-answer, and the grading below depends on
  // it — a transcription is a clean answer only while it is on screen — so
  // the answer already typed is graded again the moment it changes.
  const courseScriptKey = useCourseScript();
  // Learning direction: by default German is the target (item.de) and English the
  // meaning (item.en). When learning English, the session builder has already
  // swapped the fields, so item.de IS the English target — we just need the right
  // TTS/speech language and labels.
  const direction = useMemo(() => getLearningDirection(), []);
  const learnEn = direction === "learn-en";
  const learnFr = direction === "learn-fr";
  const learnPl = direction === "learn-pl";
  const learnEs = direction === "learn-es";
  const learnIt = direction === "learn-it";
  const learnPt = direction === "learn-pt";
  const learnRu = direction === "learn-ru";
  const learnEl = direction === "learn-el";
  const learnSq = direction === "learn-sq";
  // Only the German course teaches German. The umlaut bar, the German matcher
  // and the German synonym groups all hang off this, and every one of them is
  // wrong beside a French sentence — which is why it is asked as its own
  // question rather than as !learnEn.
  const targetIsGermanCourse = direction === "learn-de";
  const targetLanguage: "de" | "en" | "fr" | "pl" | "es" | "it" | "pt" | "ru" | "el" | "sq" =
    learnFr ? "fr" : learnPl ? "pl" : learnEs ? "es" : learnIt ? "it" : learnPt ? "pt"
      : learnRu ? "ru" : learnEl ? "el" : learnSq ? "sq" : learnEn ? "en" : "de";
  // Which language the meaning column is written in.
  //
  // The app language, wherever a table can fill it — a Polish reader was
  // getting English meanings in every course, which is the one line the app
  // did not say in their language. courseLanguages answers this for the whole
  // app and stepsForLearningDirection writes the column from the same answer,
  // so the two cannot drift; the six per-course helpers that used to be asked
  // here each narrowed it back to German or English.
  // Per CARD, not per course. stepsForLearningDirection stamps every item
  // with the language its meaning line really came out in, because a table
  // that does not reach a card leaves the English standing — and a chip that
  // says PL over an English line is a promise the card does not keep. The
  // label, the chips and the matcher that grades a typed meaning all read
  // this, so they cannot disagree with each other or with the line.
  const meaningLanguage: CourseLanguage =
    (item as { meaningCode?: CourseLanguage })?.meaningCode
    ?? meaningLanguageFor(courseTargetLanguage(direction));
  const meaningIsGerman = meaningLanguage === "de";
  const meaningIsEnglish = meaningLanguage === "en";
  // A picture of the word, where we have an honest one. It is a cue to the
  // MEANING, so any stage whose job is to produce or choose the meaning has to
  // go without: an apple beside "der Apfel" answers Translate before the
  // question is asked. Two thirds of the catalogue is abstract and comes back
  // empty — see wordPictures.ts for why that is deliberate.
  //
  // Keyed on the ENGLISH gloss wherever the card has one: learning English
  // moves it to item.de, and a French card whose meaning column is German has
  // no English on it at all.
  const picture = isWordItem
    ? wordPicture(learnEn ? item?.de : meaningIsGerman ? "" : (item?.originalEn ?? item?.en), item?.pos)
    : null;
  // A German speaker learning English hears this on every stage, so it has to
  // honour their British/American choice — it was pinned to American, which
  // made the setting look broken to anyone who picked British.
  const targetLang = guidedTargetLanguageTag();
  const targetLabel = learnFr ? "French"
    : learnPl ? "Polish"
    : learnEs ? "Spanish"
    : learnIt ? "Italian"
    : learnPt ? "Portuguese"
    : learnRu ? "Russian"
    : learnEl ? "Greek"
    : learnSq ? "Albanian"
    : learnEn ? "English"
    : "German";
  const meaningLabel = LANGUAGE_LABEL[meaningLanguage];
  // The tag beside each column. A pair of literals did while the meaning was
  // one of two; it is the language's own code now.
  const meaningChip = meaningLanguage.toUpperCase();
  const targetChip = courseTargetLanguage(direction).toUpperCase();
  // Spoken gap-fill: sentence with 1-2 words blanked, learner says the missing word(s).
  const gap = useMemo(() => computeGap(item.de), [item.de]);
  // The meaning text (item.en) is already English in normal mode (apply spelling
  // variant) but is German when learning English (show as-is).
  const displayEnglish = useMemo(
    () => (meaningIsEnglish ? formatEnglishText(item.en, englishVariant) : item.en),
    [item.en, englishVariant, meaningIsEnglish]
  );
  const listeningChoices = useMemo(
    () => buildListeningChoices(item.de, listeningChoicePool),
    [item.de, listeningChoicePool]
  );
  const listeningCorrect = listeningChoice !== null && choiceKey(listeningChoice) === choiceKey(item.de);
  const missingWord = useMemo(() => computeListeningGap(item.de), [item.de]);
  const missingWordChoices = useMemo(
    () => buildMissingWordChoices(missingWord.answer, listeningChoicePool),
    [missingWord.answer, listeningChoicePool]
  );
  const missingWordCorrect = missingWordChoice !== null
    && choiceKey(missingWordChoice) === choiceKey(missingWord.answer);
  // In learn-English mode the target text is English — use the English matcher
  // so contractions ("it's" == "it is") and spelling variants are accepted.
  const matchTarget = learnFr
    ? matchFrenchSentence
    : learnPl ? matchPolishSentence
    : learnEs ? matchSpanishSentence
    : learnIt ? matchItalianSentence
    : learnPt ? matchPortugueseSentence
    : learnRu ? matchRussianSentence
    : learnEl ? matchGreekSentence
    : learnSq ? matchAlbanianSentence
    : learnEn ? matchEnglish : matchGermanSentence;
  // Where the spoken short form is what we teach, the fuller written form the
  // learner will have met in a book stays correct too. Taking the better of the
  // two results means the shown answer is the one people say, without punishing
  // anyone who typed the one people write.
  /**
   * Every answer the target side will accept, in full.
   *
   * The card's own line, its written-out form where it has one, and the
   * siblings of a combined synonym card. The auto-check pause waits for one
   * thing only — that what has been typed is still growing towards a longer
   * answer — and that is a question about prefixes, so it needs the answers
   * themselves and not a measurement of them.
   */
  const acceptedAnswers = useMemo(
    () => withCourseLatin(targetLang, [item.de, item.long, ...(item.synonyms ?? []).map((entry: { de?: string }) => entry.de)]
      .map((form) => String(form ?? "").trim())
      .filter(Boolean)),
    // courseScriptKey: the Latin forms come and go with the alphabet switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.de, item.long, item.synonyms, targetLang, courseScriptKey]
  );

  const matchEither = React.useCallback(
    (typed: string) => {
      const primary = matchTarget(typed, item.de);
      if (primary.ok) return primary;
      if (item.long) {
        const alt = matchTarget(typed, item.long);
        if (alt.ok) return alt;
      }
      // A combined synonym card lists its siblings as the same meaning, so
      // typing one of them is a right answer, not a near miss. German-course
      // only: in the English course the target is English, where the merged
      // " / " alternatives already do this job.
      if (targetIsGermanCourse && item.kind === "word") {
        for (const entry of item.synonyms ?? []) {
          const alt = matchTarget(typed, entry.de);
          if (alt.ok) return alt;
        }
      }
      return primary;
    },
    // courseScriptKey: the Greek and Russian matchers read the alphabet
    // switch, so an answer typed before a switch is graded again after it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.de, item.long, item.kind, item.synonyms, targetIsGermanCourse, matchTarget, courseScriptKey]
  );
  const result   = useMemo(() => matchEither(input), [input, matchEither]);
  const sayResult = useMemo(() => matchEither(sayInput), [sayInput, matchEither]);
  // Written-from-hearing is graded exactly like written-from-reading: the same
  // tolerance for a slipped letter, the same acceptance of the fuller written
  // form and of a merged synonym. What is being tested is whether the sounds
  // resolved into the right sentence, not typing accuracy.
  const listeningTypeResult = useMemo(
    () => matchEither(listeningInput),
    [listeningInput, matchEither]
  );
  // The other half of the pair, used only to recognise an answer aimed at the
  // wrong box. `displayEnglish` is whichever side carries the meaning, so this
  // stays correct in both learning directions.
  const matchMeaning = React.useCallback(
    (typed: string) => {
      // Whichever language it is, this side is the one NOT being learned. The
      // strict answer is worked out first and only a rejection is revisited,
      // so nothing that passed can change and nothing about the target side is
      // touched — that half is the answer and stays marked as one.
      const forgiveSlips = (result: ReturnType<typeof matchEnglishMeaning>) => {
        if (result.ok) return result;
        // German has no progressive, so "I come" and "I'm coming" are one
        // answer to "Ich komme" — not a slip to be forgiven but a second
        // spelling of the same understanding, so it passes clean and is not
        // gated behind the lenience setting. Only ever asked about the side
        // the learner is not learning: somebody learning English is being
        // taught this exact difference, and matchMeaning is never their
        // target side.
        if (meaningIsEnglish && sameEnglishAspect(typed, displayEnglish)) {
          return { ...result, ok: true };
        }
        if (getMeaningLenience() !== "forgiving") return result;
        if (!forgivableMeaningSlip(typed, displayEnglish)) return result;
        return { ...result, ok: true, spellingNote: true };
      };
      if (meaningIsGerman && isWordItem) {
        const primary = matchGermanMeaning(typed, displayEnglish);
        if (primary.ok) return primary;
        // Combined synonym card with a German meaning side: any word of the
        // group is that meaning. Only the German course carries them, so this
        // loop is empty in the French one.
        for (const entry of item.synonyms ?? []) {
          const alt = matchGermanMeaning(typed, entry.de);
          if (alt.ok) return alt;
        }
        return forgiveSlips(primary);
      }
      return forgiveSlips(!meaningIsGerman && !meaningIsEnglish
        ? matchMeaningInLanguage(typed, displayEnglish, meaningLanguage)
        : meaningIsGerman
        ? matchGermanSentence(typed, displayEnglish)
        : isWordItem
          ? matchEnglishMeaning(typed, displayEnglish)
          : matchEnglish(typed, displayEnglish));
    },
    [displayEnglish, isWordItem, item.synonyms, meaningIsGerman, meaningIsEnglish, meaningLanguage]
  );
  const recallBothTargetResult = useMemo(
    () => matchEither(recallBothTargetInput),
    [recallBothTargetInput, matchEither]
  );
  const recallBothTargetReady = recallBothTargetChecked && recallBothTargetResult.ok;
  useStickyFocus(recallBothTargetRef, phase === "RecallBoth" && !recallBothTargetReady);
  useStickyFocus(
    recallBothMeaningRef,
    phase === "RecallBoth" && recallBothTargetReady && !recallBothChecked
  );
  // Translate phase: in learn-DE mode the answer is English; in learn-EN mode
  // the answer is German — each direction gets its own synonym/coach matcher.
  const shownEnglish = useMemo(
    () => isWordItem
      ? meaningIsGerman ? primaryGermanMeaning(displayEnglish)
        : meaningIsEnglish ? primaryEnglishMeaning(displayEnglish)
        : primaryAnswer(displayEnglish)
      : primaryAnswer(displayEnglish),
    [displayEnglish, isWordItem, meaningIsGerman, meaningIsEnglish]
  );
  /**
   * The other language: on the card under the target, or in the row below it.
   *
   * Read once per card rather than watched, because the placement is a
   * settings choice and a card being read is not where it changes. Both
   * shapes render the same two things — which language it is, and what it
   * says — so a stage passes them and does not care which it gets.
   */
  const meaningOnCard = useMemo(() => getMeaningPlacement() === "card", []);
  const secondLanguage = (chip: string, body: React.ReactNode) => (meaningOnCard ? (
    <p className="fs-board-meaning">
      <span className="fs-board-meaning-chip" aria-hidden="true">{chip}</span>
      {body}
    </p>
  ) : (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="fs-trow">
      <span className="fs-chip">{chip}</span>
      <p>{body}</p>
    </motion.div>
  ));

  const meaningSelectPool = useMemo(
    () => translationChoicePool.map((value) => {
      const displayValue = meaningIsEnglish ? formatEnglishText(value, englishVariant) : value;
      if (!isWordItem) return primaryAnswer(displayValue);
      if (meaningIsGerman) return primaryGermanMeaning(displayValue);
      if (meaningIsEnglish) return primaryEnglishMeaning(displayValue);
      return primaryAnswer(displayValue);
    }),
    [translationChoicePool, meaningIsGerman, meaningIsEnglish, englishVariant, isWordItem]
  );
  const meaningSelectChoices = useMemo(
    () => buildListeningChoices(shownEnglish, meaningSelectPool, 3),
    [shownEnglish, meaningSelectPool]
  );
  const meaningSelectCorrect = meaningSelectChoice !== null
    && choiceKey(meaningSelectChoice) === choiceKey(shownEnglish);
  const translationTokens = useMemo(
    () => buildTranslationChoices(shownEnglish, translationChoicePool),
    [shownEnglish, translationChoicePool]
  );
  const translationAnswer = translationMode === "bank"
    ? translationPicked.map((token) => token.text).join(" ")
    : enInput;
  const enResult = useMemo(
    () => matchMeaning(translationAnswer),
    [translationAnswer, matchMeaning]
  );
  const recallBothMeaningResult = useMemo(
    () => matchMeaning(recallBothMeaningInput),
    [recallBothMeaningInput, matchMeaning]
  );
  // Gap stage: the typed answer just needs to contain each missing word
  // (order-free, ß/case tolerant), so a single blank accepts the one word and
  // two blanks accept both in either order.
  // On the Latin setting of a Russian or Greek card the blanks are read in
  // Latin letters, and the key row that types the other alphabet is gone —
  // so they are filled in Latin letters too. Null wherever there is no
  // transcription on screen.
  const gapLatinWords = useMemo(
    () => (courseShowsLatin(targetLang)
      ? gap.words.map((word) => courseLatinOf(targetLang, word) ?? word)
      : null),
    // courseScriptKey: the alphabet switch decides whether there are any.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gap.words, targetLang, courseScriptKey]
  );
  const gapResult = useMemo(() => {
    return {
      ok: matchesGapInput(gapInput, gap.words)
        || (gapLatinWords !== null && matchesGapTranscription(gapInput, gapLatinWords)),
    };
  }, [gapInput, gap.words, gapLatinWords]);
  const orderIsCorrect = useMemo(
    () => wordOrderTokensMatchSentence(orderTokens, item.de),
    [orderTokens, item.de]
  );
  const orderLocked = orderChecked && orderIsCorrect;
  // French companion: tested as an extra phase when enabled and the item has French
  // — only in the German-learning direction.
  const companion = useMemo(() => getCompanion(), []);
  const hasFr = companion === "fr" && targetIsGermanCourse && typeof item.fr === "string" && item.fr.trim().length > 0;
  const frResult = useMemo(() => match(frInput, item.fr ?? ""), [frInput, item.fr]);
  const memDeResult = useMemo(() => matchEither(memDeInput), [memDeInput, matchEither]);
  const memFrResult = useMemo(() => match(memFrInput, item.fr ?? ""), [memFrInput, item.fr]);

  // Audio settings change lessons immediately. If the required target voice
  // is muted during an audio-only check, continue at the next stage that can
  // be done without sound instead of leaving an impossible stage active.
  useEffect(() => {
    if (!audioMuted) return;
    const replacement = replacementSentencePhaseWhenMuted(phase, routeOptions());
    if (!replacement || replacement === phase) return;
    currentPhaseRef.current = replacement;
    setPhase(replacement);
    // routeOptions derives from these and from values fixed for the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioMuted, hasFr, masteredRoute, typingFailed, phase]);

  useEffect(() => {
    const route = phaseRoute();
    if (route[stepRef.current] === phase) return;
    const at = route.indexOf(phase);
    if (at === -1) return;
    stepRef.current = at;
    setStep(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, masteredRoute, hasFr, audioMuted]);

  // A phase outside the current route renders NOTHING: every stage branch is
  // false, the header stays up, and the lesson looks dead. Routes change under
  // a live session — settings, updates that remove a stage, mastery flips —
  // so rather than trusting every path to notice, an impossible phase snaps to
  // the start of the route. A visible restart of one exercise beats a blank,
  // and the recovery is recorded so it shows up in the crash reports.
  useEffect(() => {
    const route = phaseRoute();
    if (route.length === 0 || route.includes(phase)) return;
    recordCrash({
      kind: "render",
      message: `guided phase "${phase}" is not in the current route [${route.join(", ")}] — recovered to "${route[0]}"`,
    });
    currentPhaseRef.current = route[0];
    setPhase(route[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, masteredRoute, hasFr, audioMuted]);

  // Play lesson audio automatically on first exposure and listening checks.
  // TTS is a no-op while muted, so the global mute still applies.
  useEffect(() => {
    if (audioMuted) return;
    // MeaningFirst plays it too: the point of that stage is meeting the pair
    // in the direction you speak in, and rehearsing a line you have only read
    // is how a learner ends up with a sentence they cannot say out loud.
    // RecallBoth plays it because otherwise nothing on the card says WHICH
    // phrase to recall. A sitting practises six and comes back to every one of
    // them, so "what you just practised" was six things and the learner had to
    // guess which before they could answer. Hearing it names the phrase and
    // prints neither answer, which is the whole point of a closed book.
    if (phase !== "Read" && phase !== "ListenPick"
      && phase !== "MeaningFirst" && phase !== "RecallBoth") return;
    if (phase === "ListenPick" || phase === "MeaningFirst" || phase === "RecallBoth") {
      lessonSpeak(item.de, 0.88, targetLang);
    }
    else if (hasFr) ttsSequence([{ text: item.de, lang: "de-DE" }, { text: item.fr, rate: 0.85, lang: "fr-FR" }]);
    else lessonSpeak(item.de, 0.88, targetLang);
    /* eslint-disable-next-line no-useless-return */
    return;
  }, [phase, step, item.de, item.fr, hasFr, audioMuted, targetLang]);

  // Focus input when entering Type or Translate phase
  useEffect(() => {
    if (phase === "Type")           setTimeout(() => inputRef.current?.focus(), 100);
    if (phase === "ListenPick" && listeningMode === "type")  setTimeout(() => listeningInputRef.current?.focus(), 100);
    if (phase === "Translate" && translationMode === "type") {
      setTimeout(() => enInputRef.current?.focus(), 100);
    }
    if (phase === "Gap")       setTimeout(() => gapInputRef.current?.focus(), 100);
    if (phase === "WriteFromMemory") setTimeout(() => sayRef.current?.focus(), 100);
    if (phase === "RecallBoth") setTimeout(() => recallBothTargetRef.current?.focus(), 100);
    if (phase === "French")    setTimeout(() => frInputRef.current?.focus(), 100);
    if (phase === "Memory")    setTimeout(() => memDeRef.current?.focus(), 100);
  }, [phase, step, translationMode, listeningMode]);

  /** Go to a position in the route. False when there is nothing there. */
  const moveToStep = (index: number): boolean => {
    const next = phaseRoute()[index];
    if (!next) return false;
    currentPhaseRef.current = next;
    stepRef.current = index;
    setStep(index);
    setPhase(next);
    return true;
  };

  const advance = () => {
    // Ignore a delayed auto-advance if the learner manually jumped elsewhere
    // during the success animation — checked by position as well as by name,
    // because a repeated stage shares its name with the step before it and a
    // late tick from the first would otherwise skip the second.
    if (currentPhaseRef.current !== phase || stepRef.current !== step) return;
    moveToStep(step + 1);
  };

  // Advance to the next phase, or finish the exercise if this was the last one.
  // Used by the typing steps so the second Translate round ends the exercise.
  const advanceOrFinish = () => {
    if (currentPhaseRef.current !== phase || stepRef.current !== step) return;
    if (!moveToStep(step + 1)) finishOrFrench();
  };

  // A press of Next, not a timer: it always moves. The position guard above
  // is for late ticks; a learner pressing Next on a stage they can see must
  // never get nothing back, whether the stage is last in the route or the
  // step counter has drifted from the stage shown. So the position comes from
  // the route itself, and the end of the route finishes the phrase.
  const advanceFromHere = () => {
    const route = phaseRoute();
    const at = route[stepRef.current] === phase ? stepRef.current : route.indexOf(phase);
    if (at < 0 || !moveToStep(at + 1)) finishOrFrench();
  };

  // The second Type / Translate rounds reuse the first round's input state, so
  // clear it when the round begins — otherwise it shows the previous answer as
  // already-correct.
  useEffect(() => {
    if (orderAdvanceTimerRef.current !== null) {
      window.clearTimeout(orderAdvanceTimerRef.current);
      orderAdvanceTimerRef.current = null;
    }
    recallAdvanceTokenRef.current += 1;
    if (recallCompletionTimerRef.current !== null) {
      window.clearTimeout(recallCompletionTimerRef.current);
      recallCompletionTimerRef.current = null;
    }
    recallTransitionPendingRef.current = false;
    setRecallTransitionPending(false);
    recallCompletionScheduledRef.current = false;
    if (phase === "MeaningSelect") {
      setMeaningSelectChoice(null);
      setMeaningSelectChecked(false);
    }
    if (phase === "ListenPick") {
      setListeningChoice(null);
      setListeningChecked(false);
      setListeningMode("type");
      setListeningInput("");
      setListeningTypeChecked(false);
      setListeningMisses(0);
    }
    if (phase === "MissingWord") {
      setMissingWordChoice(null);
      setMissingWordChecked(false);
      setMissingWordPreview(null);
    }
    if (phase === "Translate") {
      setEnInput("");
      setEnChecked(false);
      setTranslationPicked([]);
      setTranslationMode("type");
    }
    if (phase === "Gap") { setGapInputs([]); setGapChecked(false); }
    if (phase === "Order") {
      setOrderTokens(buildOrderTokens(item.de));
      setOrderChecked(false);
      setOrderTouched(false);
      setOrderSelected(null);
      setOrderDragging(null);
      setOrderDropTarget(null);
      draggedOrderTokenId.current = null;
      suppressOrderClickRef.current = false;
    }
    if (phase === "WriteFromMemory") { setSayInput(""); setSayChecked(false); }
    if (phase === "RecallBoth") {
      setRecallBothTargetInput("");
      setRecallBothMeaningInput("");
      setRecallBothTargetChecked(false);
      setRecallBothChecked(false);
    }
  }, [phase, step, item.de]);

  useEffect(() => () => {
    recallAdvanceTokenRef.current += 1;
    if (recallCompletionTimerRef.current !== null) {
      window.clearTimeout(recallCompletionTimerRef.current);
    }
    if (orderAdvanceTimerRef.current !== null) {
      window.clearTimeout(orderAdvanceTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (phase !== "MeaningSelect") return;
    const handleChoiceKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Enter" && meaningSelectChecked && meaningSelectCorrect) {
        event.preventDefault();
        advanceOrFinish();
        return;
      }
      if (meaningSelectChecked) return;
      const optionIndex = Number(event.key) - 1;
      const option = meaningSelectChoices[optionIndex];
      if (!option) return;
      event.preventDefault();
      const ok = choiceKey(option) === choiceKey(shownEnglish);
      setMeaningSelectChoice(option);
      setMeaningSelectChecked(true);
      reactToAnswer(ok);
      if (ok) window.setTimeout(advanceOrFinish, 900);
    };
    window.addEventListener("keydown", handleChoiceKey);
    return () => window.removeEventListener("keydown", handleChoiceKey);
  }, [
    phase,
    meaningSelectChecked,
    meaningSelectChoice,
    meaningSelectChoices,
    meaningSelectCorrect,
  ]);

  useEffect(() => {
    // Only while the options are on screen. In dictation mode the digits are
    // part of the answer, and Space belongs to the sentence being typed.
    if (phase !== "ListenPick" || listeningMode !== "pick") return;
    const handleChoiceKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (isTextEntryTarget(event.target)) return;
      if (listeningChecked) {
        // After a miss, Space / R / → replay the phrase and reopen the round —
        // the keyboard version of "Hear it and try again". Registered in the
        // capture phase so → wins over the bubble-phase stage-nav arrows,
        // which skip events that are already defaultPrevented.
        if (listeningCorrect) return;
        if (event.key === " " || event.key === "r" || event.key === "R" || event.key === "ArrowRight") {
          event.preventDefault();
          retryListening();
        }
        return;
      }
      const optionIndex = Number(event.key) - 1;
      const option = listeningChoices[optionIndex];
      if (!option) return;
      event.preventDefault();
      setListeningChoice(option);
      setListeningChecked(true);
      const ok = choiceKey(option) === choiceKey(item.de);
      reactToAnswer(ok);
      if (ok) window.setTimeout(advanceOrFinish, 900);
    };
    window.addEventListener("keydown", handleChoiceKey, true);
    return () => window.removeEventListener("keydown", handleChoiceKey, true);
  }, [phase, listeningMode, listeningChecked, listeningCorrect, listeningChoices, item.de, targetLang]);

  useEffect(() => {
    if (phase !== "MissingWord") return;
    const handleChoiceKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (isTextEntryTarget(event.target)) return;
      if (missingWordChecked) {
        // Same retry keys as the listening round: Space / R / → reopen it.
        if (missingWordCorrect) return;
        if (event.key === " " || event.key === "r" || event.key === "R" || event.key === "ArrowRight") {
          event.preventDefault();
          retryMissingWord();
        }
        return;
      }
      // A number PLAYS its option here; it does not answer with it.
      //
      // Every other choice round shows its options, so a number key committing
      // one is a considered choice. This round hides them behind audio on
      // purpose — the whole task is telling the three apart by ear — so the
      // same key was answering with an option the learner had not yet heard.
      // Pressing it again replays, which is what you want when deciding
      // between two similar words, and Enter commits whatever was last
      // played. That also makes the round finishable without a mouse, which it
      // was not: the play buttons had no keyboard route to them at all.
      const option = missingWordChoices[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        previewMissingWord(option);
        return;
      }
      if (event.key === "Enter" && missingWordPreview) {
        event.preventDefault();
        selectMissingWord(missingWordPreview);
      }
    };
    window.addEventListener("keydown", handleChoiceKey, true);
    return () => window.removeEventListener("keydown", handleChoiceKey, true);
  }, [phase, missingWordChecked, missingWordCorrect, missingWordChoices, missingWordPreview, missingWord.answer, item.de, targetLang]);

  const goBack = () => {
    if (recallTransitionPendingRef.current || recallCompletionScheduledRef.current) return;
    moveToStep(stepRef.current - 1);
  };

  const goToStep = (index: number) => {
    if (recallTransitionPendingRef.current || recallCompletionScheduledRef.current) return;
    moveToStep(index);
  };

  useEffect(() => {
    const handleStageShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.isComposing
        || recallTransitionPendingRef.current
        || recallCompletionScheduledRef.current
      ) return;

      const route = phaseRoute();
      const directIndex = directStageShortcutIndex(event);
      if (directIndex !== null) {
        if (!route[directIndex]) return;
        event.preventDefault();
        event.stopPropagation();
        goToStep(directIndex);
        return;
      }

      if (
        event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || phase === "Order"
        || isTextEntryTarget(event.target)
      ) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const offset = event.key === "ArrowLeft" ? -1 : 1;
      if (!route[stepRef.current + offset]) return;
      event.preventDefault();
      event.stopPropagation();
      goToStep(stepRef.current + offset);
    };

    window.addEventListener("keydown", handleStageShortcut);
    return () => window.removeEventListener("keydown", handleStageShortcut);
    // phaseRoute intentionally derives from these route inputs and the live
    // audio ref, which is updated synchronously by the mute event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, masteredRoute, hasFr, audioMuted]);

  // Auto-advance: once the typed answer is strictly correct (no lenient/typo
  // pass), confirm it automatically — no Check press needed.
  useEffect(() => {
    if (phase === "Type" && !checked && input.trim() && result.ok && !result.spellingNote) checkAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);
  useEffect(() => {
    if (
      (phase === "Translate")
      && !enChecked
      && translationAnswer.trim()
      && enResult.ok
      && !enResult.spellingNote
    ) {
      checkEnAnswer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationAnswer]);
  useEffect(() => {
    if (phase === "Gap" && !gapChecked && gapInput.trim() && gapResult.ok) checkGap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapInput]);
  useEffect(() => {
    if (phase === "WriteFromMemory" && !sayChecked && sayInput.trim() && sayResult.ok && !sayResult.spellingNote) checkSay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sayInput]);
  useEffect(() => {
    if (
      phase === "RecallBoth"
      && !recallBothTargetReady
      && recallBothTargetInput.trim()
      && recallBothTargetResult.ok
      && !recallBothTargetResult.spellingNote
    ) checkRecallBothTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recallBothTargetInput, recallBothTargetChecked]);
  useEffect(() => {
    if (
      phase === "RecallBoth"
      && !recallBothChecked
      && recallBothMeaningInput.trim()
      && recallBothMeaningResult.ok
      && !recallBothMeaningResult.spellingNote
    ) checkRecallBoth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recallBothMeaningInput, recallBothChecked]);
  useEffect(() => {
    if (
      phase === "Order"
      && orderTouched
      && !orderChecked
      && orderIsCorrect
      && orderDragging === null
      && draggedOrderTokenId.current === null
    ) {
      checkOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTokens, orderTouched, orderDragging]);
  useEffect(() => {
    if (phase === "French" && !frChecked && frInput.trim() && frResult.ok && !frResult.spellingNote) checkFrAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frInput]);
  useEffect(() => {
    if (
      phase === "Memory"
      && !memDeChecked
      && !memFrChecked
      && memDeInput.trim()
      && memFrInput.trim()
      && memDeResult.ok
      && memFrResult.ok
      && !memDeResult.spellingNote
      && !memFrResult.spellingNote
    ) {
      checkMemory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memDeInput, memFrInput]);

  /**
   * Answering in the wrong language is a slip, not a gap in knowledge.
   *
   * Typing the English translation into the German box means the learner knew
   * the pair perfectly well and aimed at the wrong half of it. Grading that as
   * a failure marks the phrase "struggle", drops a mastered item back onto the
   * full fifteen-stage route, and adds difficulty debt — all for a mis-aimed
   * answer. So these are caught before any of that, and the learner is simply
   * pointed at the right box.
   *
   * Only consulted once the expected side has already failed to match, so a
   * genuinely correct answer can never be mistaken for one of these.
   */
  const [wrongLanguageNotice, setWrongLanguageNotice] = useState<string | null>(null);
  const answeredOtherSide = (typed: string, expecting: "target" | "meaning") => {
    const trimmed = typed.trim();
    // Single characters and stray words match too easily to judge.
    if (trimmed.length < 3) return false;
    return expecting === "target"
      ? matchMeaning(trimmed).ok
      : matchEither(trimmed).ok;
  };
  const flagWrongLanguage = (expecting: "target" | "meaning") => {
    const wanted = expecting === "target" ? targetLabel : meaningLabel;
    const typedInstead = expecting === "target" ? meaningLabel : targetLabel;
    setWrongLanguageNotice(
      `${ui("That's the")} ${ui(typedInstead)} — ${ui("this one wants the")} ${ui(wanted)}.`
    );
  };
  useEffect(() => { setWrongLanguageNotice(null); }, [phase]);

  const checkAnswer = () => {
    if (!input.trim() || checked) return;
    if (!result.ok && answeredOtherSide(input, "target")) { flagWrongLanguage("target"); return; }
    setWrongLanguageNotice(null);
    setChecked(true);
    reactToAnswer(result.ok, !!result.phrasingNote);
    lessonSpeak(item.de, result.ok ? 0.88 : 0.75, targetLang);
    if (result.ok) {
      setTimeout(advanceOrFinish, 900);
    } else {
    }
  };

  const retry = () => { setInput(""); setChecked(false); };

  // After the English translation: go to the French phase if active, else finish.
  // A quick return is tap-only to the end — the French phase is typed, and a
  // phrase coming back for the second time in ten minutes is not where that
  // belongs.
  const finishOrFrench = () => { if (hasFr && !isSecondShowing) setPhase("French"); else onNext(); };

  const noteRecallStruggle = () => {
    // Failing a closed-book check on the short route means the run of correct
    // recalls that earned it didn't hold. Put the full route back and start it
    // from the beginning, so the phrase is retaught rather than just retried.
    if (masteredRoute) {
      setRecallFailed(true);
      setPhase("Read");
    }
    if (grade === "struggle") return;
    setGrade("struggle");
    if (item?.id) onGradeItem?.(item.id, "struggle");
  };

  const checkEnAnswer = () => {
    if (!translationAnswer.trim() || enChecked) return;
    if (!enResult.ok && answeredOtherSide(translationAnswer, "meaning")) { flagWrongLanguage("meaning"); return; }
    setWrongLanguageNotice(null);
    setEnChecked(true);
    reactToAnswer(enResult.ok, !!enResult.phrasingNote);
    if (enResult.ok) {
      setTimeout(advanceOrFinish, 900);
    } else {
    }
  };

  /**
   * A right answer moves on by itself.
   *
   * Typing the answer and then reaching for Enter is a second action for
   * something already finished, and on a stage whose whole job is "write what
   * you hear" it reads as the app not having noticed. So a correct answer
   * checks itself.
   *
   * Only a CLEAN match, though. matchGermanSentence also accepts answers with
   * something to say about them — a spelling slip, a capital letter, an
   * English turn of phrase — and those come with a note the learner is meant
   * to read. Skipping past the note would be a worse trade than the keystroke
   * it saves, so those still wait to be checked deliberately.
   *
   * And only after a pause. A short answer can be a prefix of a longer one,
   * so advancing on the keystroke that first matched would cut somebody off
   * mid-word; carrying on typing cancels it, because each keystroke restarts
   * the wait.
   */
  const autoCheckRef = useRef<number | null>(null);
  useEffect(() => {
    const clear = () => {
      if (autoCheckRef.current === null) return;
      window.clearTimeout(autoCheckRef.current);
      autoCheckRef.current = null;
    };
    clear();
    const clean = (outcome: { ok: boolean; spellingNote?: boolean; capitalizationError?: boolean; phrasingNote?: boolean }) =>
      outcome.ok && !outcome.spellingNote && !outcome.capitalizationError && !outcome.phrasingNote;

    /**
     * Reordering finishes the moment the words are in the right order.
     *
     * The typed stages below wait out a pause because what has been typed can
     * still grow. Nothing here can: every word is on the board from the
     * start, so an arrangement that matches the sentence is a finished answer
     * and there is nothing a further keystroke could turn it into. Waiting
     * would only be a delay, and asking for Check as well would be a second
     * action for something already done — the learner put the words in order,
     * which is the whole exercise.
     *
     * Still guarded on a move having been made, because a board nobody has
     * touched is the app's arrangement rather than the learner's. The shuffle
     * already refuses to deal a correct order, so this bites only on the one
     * sentence it cannot shuffle: every word the same.
     *
     * And not mid-drag. A word under the cursor has not landed yet, and the
     * order it is passing over is not one anybody chose.
     */
    if (phase === "Order") {
      if (!orderChecked && orderTouched && orderIsCorrect
        && orderDragging === null && draggedOrderTokenId.current === null) {
        checkOrder();
      }
      return clear;
    }

    let run: null | (() => void) = null;
    // What was typed, so a finished answer can be recognised as finished.
    let typed = "";
    let finishable = false;
    if (phase === "ListenPick" && listeningMode === "type" && !listeningTypeChecked
      && listeningInput.trim() && clean(listeningTypeResult)) {
      run = checkListeningTyped;
      typed = listeningInput;
      finishable = true;
    } else if (phase === "Type" && !checked
      && input.trim() && clean(result)) {
      run = checkAnswer;
      typed = input;
      finishable = true;
    } else if (phase === "Translate" && translationMode === "type"
      && !enChecked && translationAnswer.trim() && clean(enResult)) {
      run = checkEnAnswer;
    }
    if (!run) return clear;

    /**
     * Nothing to wait for once the answer cannot grow.
     *
     * The pause exists for one case: a correct short answer that is the
     * opening of a longer correct one, where checking on the spot would cut
     * somebody off mid-sentence. So the question is whether what has been
     * typed is still the beginning of some other answer this card takes.
     *
     * It used to be asked as a question about LENGTH — is this at least as
     * long as the longest answer the card accepts — and the two are the same
     * only on a card that accepts exactly one. They are not the same when the
     * card also takes a fuller written form, and they are not the same when
     * the line is typed without its full stop, which is most of the time on a
     * stage that dictates one. Both are finished answers that cannot grow,
     * and both sat out the wait for a growth that could never come.
     *
     * Compared with case, spacing and punctuation set aside, because the
     * matcher accepts an answer that differs from the card in any of them and
     * this must agree with the matcher about what counts as finished.
     */
    const typedKey = answerShape(typed);
    const stillGrowing = acceptedAnswers.some((form) => {
      const shape = answerShape(form);
      return shape.length > typedKey.length && shape.startsWith(typedKey);
    });
    const complete = finishable && typedKey.length > 0 && !stillGrowing;

    const go = run;
    if (complete) {
      go();
      return clear;
    }
    autoCheckRef.current = window.setTimeout(() => { autoCheckRef.current = null; go(); }, AUTO_CHECK_PAUSE_MS);
    return clear;
    // The handlers are rebuilt every render; the values they read are the
    // dependencies that matter, and listing the handlers would re-arm the
    // timer on every render instead of on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, listeningMode, listeningInput, listeningTypeChecked, listeningTypeResult,
    input, checked, result, translationMode, translationAnswer, enChecked, enResult,
    acceptedAnswers, orderChecked, orderTouched, orderIsCorrect, orderDragging]);

  const retryEn = () => {
    setEnInput("");
    setTranslationPicked([]);
    setEnChecked(false);
    if (translationMode === "type") setTimeout(() => enInputRef.current?.focus(), 50);
  };

  const chooseTranslationMode = (mode: "bank" | "type") => {
    if (mode === translationMode || (enChecked && enResult.ok)) return;
    if (mode === "type") {
      setEnInput(translationPicked.map((token) => token.text).join(" "));
      setTranslationPicked([]);
      setTimeout(() => enInputRef.current?.focus(), 50);
    } else {
      setEnInput("");
      setTranslationPicked([]);
    }
    setEnChecked(false);
    setTranslationMode(mode);
  };

  const pickTranslationToken = (token: OrderToken) => {
    if (enChecked || translationPicked.some((picked) => picked.id === token.id)) return;
    setTranslationPicked((picked) => [...picked, token]);
  };

  const removeTranslationToken = (index: number) => {
    if (enChecked) return;
    setTranslationPicked((picked) => picked.filter((_, pickedIndex) => pickedIndex !== index));
  };

  const chooseMeaningSelectAnswer = (choice: string) => {
    if (meaningSelectChecked) return;
    const ok = choiceKey(choice) === choiceKey(shownEnglish);
    setMeaningSelectChoice(choice);
    setMeaningSelectChecked(true);
    reactToAnswer(ok);
    if (ok) window.setTimeout(advanceOrFinish, 900);
  };

  const retryMeaningSelect = () => {
    setMeaningSelectChoice(null);
    setMeaningSelectChecked(false);
  };

  const chooseListeningAnswer = (choice: string) => {
    if (listeningChecked) return;
    setListeningChoice(choice);
    setListeningChecked(true);
    const ok = choiceKey(choice) === choiceKey(item.de);
    reactToAnswer(ok);
    if (ok) window.setTimeout(advanceOrFinish, 900);
  };

  const retryListening = () => {
    setListeningChoice(null);
    setListeningChecked(false);
    lessonSpeak(item.de, 0.88, targetLang);
  };

  const checkListeningTyped = () => {
    if (!listeningInput.trim()) return;
    if (listeningTypeChecked && listeningTypeResult.ok) return;
    // Answering in the wrong language here means the sounds were understood
    // and then written down as their meaning — worth saying so rather than
    // marking it simply wrong.
    if (!listeningTypeResult.ok && answeredOtherSide(listeningInput, "target")) {
      flagWrongLanguage("target");
      return;
    }
    setWrongLanguageNotice(null);
    setListeningTypeChecked(true);
    reactToAnswer(listeningTypeResult.ok, !!listeningTypeResult.phrasingNote);
    if (listeningTypeResult.ok) {
      // The words were right and the letters were not. THAT is what the
      // writing stages are for, and it is the only thing that buys them.
      if (listeningTypeResult.spellingNote || listeningTypeResult.capitalizationError) {
        setTypingFailed(true);
        onSlip?.();
      }
      lessonSpeak(item.de, 0.88, targetLang);
      window.setTimeout(advanceOrFinish, 900);
    } else {
      // Not being able to write the phrase is not a spelling problem: it has
      // not been learnt yet. Writing it out six times teaches nothing that
      // meeting it again does not, and the miss already sends it back round
      // — it counts as a mistake, which raises its difficulty and brings the
      // review forward. So the route stays lean and the schedule does the work.
      setListeningMisses((misses) => misses + 1);
      lessonSpeak(item.de, 0.75, targetLang);
    }
  };

  const retryListeningTyped = () => {
    setListeningInput("");
    setListeningTypeChecked(false);
    lessonSpeak(item.de, 0.88, targetLang);
    setTimeout(() => listeningInputRef.current?.focus(), 50);
  };

  // Taking the four options is allowed at any point, but it is not free: the
  // phrase is marked as a struggle, exactly as asking for a hint is, so it
  // comes back round instead of counting as heard and known.
  const showListeningChoices = () => {
    if (listeningMode === "pick") return;
    setListeningMode("pick");
    setListeningTypeChecked(false);
    // Taking the options says "I cannot produce this", which is a memory
    // problem and not a spelling one: it stays a struggle, so the phrase
    // comes back round, but it does not buy six stages of writing out a
    // phrase the learner has just said they cannot write.
    setWrongLanguageNotice(null);
    if (grade !== "struggle") {
      setGrade("struggle");
      if (item?.id) onGradeItem?.(item.id, "struggle");
    }
    lessonSpeak(item.de, 0.88, targetLang);
  };

  const backToListeningTyping = () => {
    if (listeningMode === "type" || (listeningChecked && listeningCorrect)) return;
    setListeningMode("type");
    setListeningChoice(null);
    setListeningChecked(false);
    lessonSpeak(item.de, 0.88, targetLang);
    setTimeout(() => listeningInputRef.current?.focus(), 50);
  };

  const selectMissingWord = (choice: string) => {
    if (missingWordChecked) return;
    const ok = choiceKey(choice) === choiceKey(missingWord.answer);
    setMissingWordPreview(null);
    setMissingWordChoice(choice);
    setMissingWordChecked(true);
    reactToAnswer(ok);
    if (ok) {
      lessonSpeak(item.de, 0.88, targetLang);
      window.setTimeout(advanceOrFinish, 900);
    }
  };

  /**
   * A reading stage counts itself down and then moves on.
   *
   * Held while the voice is still going, because a long sentence — or a
   * paragraph — can run past ten seconds, and taking the card away
   * mid-sentence is worse than any amount of waiting. The count restarts when
   * the audio stops, so what the learner gets is ten seconds of silence to
   * read in rather than ten seconds that began before the reading could.
   *
   * Tapping a word restarts it too. Somebody who stopped to hear one word is
   * the last person who should be hurried.
   */
  const [readingLeft, setReadingLeft] = useState<number | null>(null);
  const restartReadingCountdown = useCallback(() => {
    if (READING_PHASES.includes(phase)) setReadingLeft(READING_STAGE_MS / 1000);
  }, [phase]);

  useEffect(() => {
    if (!READING_PHASES.includes(phase)) {
      setReadingLeft(null);
      return undefined;
    }
    // Nothing counts down while the phrase is still being spoken.
    if (ttsOn) {
      setReadingLeft(READING_STAGE_MS / 1000);
      return undefined;
    }
    const tick = window.setInterval(() => {
      setReadingLeft((left) => {
        if (left === null) return null;
        if (left > 1) return left - 1;
        // The last tick advances. Cleared here rather than in a second effect
        // so the stage cannot be advanced twice by a tick that outlives it.
        window.clearInterval(tick);
        // advanceOrFinish: a reading stage can be the LAST stage of a route
        // when the sound is off, and advance() on the last stage is a no-op.
        if (currentPhaseRef.current === phase) advanceOrFinish();
        return null;
      });
    }, 1000);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, ttsOn]);

  const previewMissingWord = (choice: string) => {
    setMissingWordPreview(choice);
    lessonSpeak(choice, 0.78, targetLang);
  };

  /**
   * The first option plays itself when the stage opens.
   *
   * Three options, one word each, and every one of them behind a button:
   * answering took three presses before the learner could form an opinion.
   * Playing the first on arrival makes the common case hear-and-choose, and
   * the other two are still there for when it does not fit.
   *
   * It is the FIRST option, not the correct one. The options are audio and
   * nothing else, so an answer that favoured a position would make the stage
   * answerable by pressing that position without listening — which is the
   * whole of what it tests.
   *
   * Guarded on nothing having been played yet, so returning to the stage
   * after a wrong answer does not talk over the learner, and on the sentence
   * itself, because that plays on arrival too and two voices at once is
   * neither of them.
   */
  useEffect(() => {
    if (phase !== "MissingWord" || missingWordChecked) return;
    if (missingWordPreview !== null) return;
    const first = missingWordChoices[0];
    if (!first) return;
    const opening = window.setTimeout(() => previewMissingWord(first), MISSING_WORD_OPENING_MS);
    return () => window.clearTimeout(opening);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, missingWordChoices, missingWordChecked, missingWordPreview]);

  const retryMissingWord = () => {
    setMissingWordPreview(null);
    setMissingWordChoice(null);
    setMissingWordChecked(false);
  };

  const checkGap = () => {
    if (!gapInput.trim() || gapChecked) return;
    setGapChecked(true);
    reactToAnswer(gapResult.ok);
    if (gapResult.ok) { lessonSpeak(item.de, 0.88, targetLang); setTimeout(advanceOrFinish, 900); }
  };
  const retryGap = () => { setGapInputs([]); setGapChecked(false); setTimeout(() => gapInputRef.current?.focus(), 50); };

  const reorderToken = (from: number, to: number) => {
    if (from === to || orderLocked) return;
    if (orderAdvanceTimerRef.current !== null) {
      window.clearTimeout(orderAdvanceTimerRef.current);
      orderAdvanceTimerRef.current = null;
    }
    setOrderTokens((tokens) => moveOrderToken(tokens, from, to));
    setOrderChecked(false);
    setOrderTouched(true);
    setOrderSelected(null);
  };

  const reorderTokenById = (fromId: string, toId: string) => {
    if (!fromId || fromId === toId || orderLocked) return;
    if (orderAdvanceTimerRef.current !== null) {
      window.clearTimeout(orderAdvanceTimerRef.current);
      orderAdvanceTimerRef.current = null;
    }
    setOrderTokens((tokens) => {
      const from = tokens.findIndex((token) => token.id === fromId);
      const to = tokens.findIndex((token) => token.id === toId);
      return moveOrderToken(tokens, from, to);
    });
    setOrderChecked(false);
    setOrderTouched(true);
    setOrderSelected(null);
  };

  const selectOrderToken = (index: number) => {
    if (orderSelected === null) {
      setOrderSelected(index);
      return;
    }
    reorderToken(orderSelected, index);
  };

  const checkOrder = () => {
    if (orderChecked || orderDragging !== null || draggedOrderTokenId.current !== null) return;
    setOrderChecked(true);
    // A just-dropped word should stay planted. The green tokens and feedback
    // confirm success without scaling the entire drag surface under the cursor.
    reactToAnswer(orderIsCorrect, false, !orderIsCorrect);
    if (orderIsCorrect) {
      lessonSpeak(item.de, 0.88, targetLang);
      if (orderAdvanceTimerRef.current !== null) {
        window.clearTimeout(orderAdvanceTimerRef.current);
      }
      orderAdvanceTimerRef.current = window.setTimeout(() => {
        orderAdvanceTimerRef.current = null;
        advanceOrFinish();
      }, 1050);
    }
  };

  const retryOrder = () => {
    if (orderAdvanceTimerRef.current !== null) {
      window.clearTimeout(orderAdvanceTimerRef.current);
      orderAdvanceTimerRef.current = null;
    }
    setOrderTokens(buildOrderTokens(item.de));
    setOrderChecked(false);
    setOrderTouched(false);
    setOrderSelected(null);
    setOrderDragging(null);
    setOrderDropTarget(null);
    draggedOrderTokenId.current = null;
    suppressOrderClickRef.current = false;
  };

  const checkSay = () => {
    if (!sayInput.trim() || sayChecked) return;
    if (!sayResult.ok && answeredOtherSide(sayInput, "target")) { flagWrongLanguage("target"); return; }
    setWrongLanguageNotice(null);
    setSayChecked(true);
    reactToAnswer(sayResult.ok, !!sayResult.phrasingNote);
    if (sayResult.ok) {
      lessonSpeak(item.de, 0.88, targetLang);
      setTimeout(advanceOrFinish, 900);
    }
  };
  const retrySay = () => { setSayInput(""); setSayChecked(false); setTimeout(() => sayRef.current?.focus(), 50); };

  const checkRecallBothTarget = () => {
    if (
      !recallBothTargetInput.trim()
      || recallBothTargetReady
      || recallCompletionScheduledRef.current
    ) return;
    if (!recallBothTargetResult.ok && answeredOtherSide(recallBothTargetInput, "target")) {
      flagWrongLanguage("target");
      return;
    }
    setWrongLanguageNotice(null);
    setRecallBothTargetChecked(true);
    if (recallBothTargetResult.ok) {
      if (!(recallBothChecked && recallBothMeaningResult.ok)) {
        window.setTimeout(() => recallBothMeaningRef.current?.focus(), 50);
      }
      return;
    }
    reactToAnswer(false);
    noteRecallStruggle();
  };

  const checkRecallBoth = () => {
    if (
      !recallBothMeaningInput.trim()
      || recallBothChecked
      || recallCompletionScheduledRef.current
    ) return;
    if (
      !recallBothMeaningResult.ok
      && answeredOtherSide(recallBothMeaningInput, "meaning")
    ) { flagWrongLanguage("meaning"); return; }
    setWrongLanguageNotice(null);
    setRecallBothChecked(true);
    if (recallBothMeaningResult.ok) {
      if (!recallBothTargetReady) {
        window.setTimeout(() => recallBothTargetRef.current?.focus(), 50);
      }
      return;
    }
    reactToAnswer(false);
    noteRecallStruggle();
  };
  useEffect(() => {
    if (
      phase !== "RecallBoth"
      || recallCompletionScheduledRef.current
      || !recallBothTargetReady
      || !recallBothChecked
      || !recallBothMeaningResult.ok
    ) return;
    setWrongLanguageNotice(null);
    reactToAnswer(true);
    recallCompletionScheduledRef.current = true;
    recallCompletionTimerRef.current = window.setTimeout(() => {
      recallCompletionTimerRef.current = null;
      if (recallCompletionScheduledRef.current) onNext();
    }, 700);
    // Both sides are checked independently; this effect is their single
    // completion point so no extra "Check both" click can be required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recallBothTargetReady, recallBothChecked, recallBothMeaningResult.ok]);
  const retryRecallBoth = () => {
    if (recallCompletionTimerRef.current !== null) {
      window.clearTimeout(recallCompletionTimerRef.current);
      recallCompletionTimerRef.current = null;
    }
    setRecallBothMeaningInput("");
    setRecallBothChecked(false);
    recallCompletionScheduledRef.current = false;
    if (recallBothTargetReady) {
      setTimeout(() => recallBothMeaningRef.current?.focus(), 50);
    } else {
      setRecallBothTargetInput("");
      setRecallBothTargetChecked(false);
      setTimeout(() => recallBothTargetRef.current?.focus(), 50);
    }
  };

  const checkFrAnswer = () => {
    if (!frInput.trim() || frChecked) return;
    setFrChecked(true);
    reactToAnswer(frResult.ok);
    lessonSpeak(item.fr, frResult.ok ? 0.9 : 0.78, "fr-FR");
    if (frResult.ok) {
      setTimeout(hasFr ? advance : onNext, 900);
    } else {
    }
  };

  const retryFr = () => { setFrInput(""); setFrChecked(false); };

  const checkMemory = () => {
    if (!memDeInput.trim() && !memFrInput.trim()) return;
    if (!memDeResult.ok && answeredOtherSide(memDeInput, "target")) { flagWrongLanguage("target"); return; }
    setWrongLanguageNotice(null);
    setMemDeChecked(true);
    setMemFrChecked(true);
    const bothOk = memDeResult.ok && memFrResult.ok;
    reactToAnswer(bothOk);
    if (memDeResult.ok) lessonSpeak(item.de, 0.88, "de-DE");
    if (bothOk) setTimeout(onNext, 1000);
  };
  const retryMemory = () => {
    setMemDeInput(""); setMemDeChecked(false);
    setMemFrInput(""); setMemFrChecked(false);
    setTimeout(() => memDeRef.current?.focus(), 50);
  };

  const markKnown = () => {
    if (recallTransitionPendingRef.current || recallCompletionScheduledRef.current) return;
    setGrade("know");
    if (item?.id) onGradeItem?.(item.id, "know");
    onNext();
  };
  const isStruggling = markedLevel === "struggle";
  const markStruggle = () => {
    if (recallTransitionPendingRef.current || recallCompletionScheduledRef.current) return;
    // Pressing it while it is lit takes the mark off, which is the whole
    // point of showing the state on the button.
    if (isStruggling) {
      setGrade(null);
      onClearMark?.();
      return;
    }
    setGrade("struggle");
    if (item?.id) onGradeItem?.(item.id, "struggle");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // The answer box keeps focus permanently now, so Alt combos must work
      // while "typing" — Alt+K/S never inserts a character anyway.
      if (!event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        markKnown();
      }
      if (key === "s") {
        event.preventDefault();
        markStruggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // isStruggling and onClearMark decide what Alt S does now, so a stale
    // closure here would leave the shortcut re-marking an already-marked item.
  }, [item?.id, onGradeItem, isStruggling, onClearMark]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      {/* Stage route (full-bleed inside the card) */}
      <StageRoute
        current={phase}
        currentIndex={step}
        phases={phaseRoute()}
        withFrench={hasFr}
        locked={recallTransitionPending || recallCompletionScheduledRef.current}
        onClickStage={goToStep}
      />

      <div className="fs-card-body space-y-4">
        {/* Heading: eyebrow + stage title + Hear it / grade pills */}
        <div className="fs-heading">
          <div>
            <span className="fs-eyebrow"><i /> {ui("Sentence practice")}<CefrBadge level={item?.level} /></span>
            <h1 className="fs-h1">
              {ui(
                phase === "Translate"
                  ? `Write this in ${meaningLabel}`
                  : phase === "Read" && audioMuted
                    ? "Read the sentence"
                    : phaseHeading(phase, hasFr)
              )}
            </h1>
            <p className="fs-sub">
              {phase === "RecallBoth"
                    ? ui(audioMuted ? "No answers are shown now. Type both sides from memory." : "Listen to the phrase, then type both sides from memory.")
                    : hasFr
                      ? ui(audioMuted
                        ? "Read, choose, then type it in German and French."
                        : "Read, listen, choose, then type it in German and French.")
                      : ui(audioMuted
                        ? "Read, choose, type, translate, then recall."
                        : "Read, listen, choose, type, translate, then recall.")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {onReviewLevel ? (
              <ReviewLevelPicker
                disabled={recallTransitionPending || recallCompletionScheduledRef.current}
                knownAriaLabel={ui("Mark known and skip to the next item. Shortcut Alt K")}
                onKnown={markKnown}
                onSelect={onReviewLevel}
                onSnooze={onSnooze}
                showShortcut
              />
            ) : (
              <button
                aria-label={ui("Mark known and skip to the next item. Shortcut Alt K")}
                className="grade-btn grade-btn-known"
                onClick={markKnown}
                disabled={recallTransitionPending || recallCompletionScheduledRef.current}
                type="button"
              >
                {ui("Know it")}
                <kbd className="grade-kbd">Alt K</kbd>
              </button>
            )}
            <button
              aria-label={ui(isStruggling
                ? "Marked as a struggle. Press to take the mark off. Shortcut Alt S"
                : "Mark this item as a struggle. Shortcut Alt S")}
              aria-pressed={isStruggling}
              className={cn("grade-btn grade-btn-struggle", isStruggling && "is-marked")}
              onClick={markStruggle}
              disabled={recallTransitionPending || recallCompletionScheduledRef.current}
              type="button"
            >
              {ui(isStruggling ? "Struggling" : "Struggle")}
              <kbd className="grade-kbd">Alt S</kbd>
            </button>
            {/* No replay button here any more: tapping any word in the
                sentence speaks it, and two doors to the same audio confused
                  more than they helped, so the second one went. The
                speed menu it used to carry lives in the lesson header now. */}
          </div>
        </div>

        {/* Directly under the buttons that cause it. As a bar at the foot of
            the page it was so far from Struggle or Set level that pressing
            one looked as though nothing had happened. */}
      {/* Folding the note into the verdict card left it homeless whenever
          there was no verdict: snoozing or setting a level BEFORE answering
          suppressed the floating toast and had nowhere of its own to go, so
          Undo simply was not on screen. It gets its own card in that case. */}
      {!verdictShowing && (
        <div className="fs-standalone-note">
          <ManualReviewNote grade={grade} notice={manualReviewNotice} onUndo={() => { onUndoManualReview?.(); setGrade(null); }} onDismiss={() => onDismissManualReview?.()} onHold={onHoldManualReview} onRelease={onReleaseManualReview} />
        </div>
      )}

        {/* Register (du/Sie) + usage context. The chip is read off the GERMAN,
            which moves about: learning English puts it in item.en, and a French
            card keeps it in originalDe. Handing this the French instead would
            not merely find nothing — "Je voudrais du pain" contains the token
            "du", and a German register detector would call it informal on the
            strength of a French partitive article. The register itself still
            applies, because the French was translated to match it. */}
        {phase !== "MeaningSelect" && phase !== "ListenPick" && phase !== "MissingWord" && !isClosedBookPhase(phase) && (
          <UsageChips
            de={learnFr ? String(item.originalDe ?? "") : learnEn ? item.en : item.de}
            use={item.use ? formatEnglishText(item.use, englishVariant) : item.use}
            // The synonym note names other GERMAN words for the same thing.
            lookup={learnFr ? undefined : item.lookup}
            tierNote={item.tierNote ? formatEnglishText(item.tierNote, englishVariant) : item.tierNote}
            short={targetIsGermanCourse ? item.short : undefined}
            shortLabel={targetIsGermanCourse ? item.shortLabel : undefined}
            long={targetIsGermanCourse && phase !== "Read" ? item.long : undefined}
            hideUse={phase === "Translate"}
            synonyms={targetIsGermanCourse ? item.synonyms : undefined}
          />
        )}

        {/* When you'd actually say it. The usage chip explains the LANGUAGE;
            this explains the MOMENT — without it, a phrase like "Wie fällt das
            aus?" leaves you knowing the grammar and still not knowing when to
            open your mouth. Hidden during Translate for the same reason the
            usage note is: it can give the answer away. */}
        {item.when && phase !== "MeaningSelect" && phase !== "ListenPick" && phase !== "MissingWord" && phase !== "Translate" && !isClosedBookPhase(phase) && (
          <div className="fs-when">
            <span className="fs-when-label">{ui("When you'd say it")}</span>
            <p>{usageNote(item.when)}</p>
          </div>
        )}

        {/* How it actually sounds. Germans swallow far more than the spelling
            admits — gehen is "gehn", nichts is "nix", kannst du is "kannste" —
            so a learner who reads the line as written is understood but marked
            instantly as foreign. Keep this guidance on first exposure; hiding
            it during recall avoids handing over the spelling. */}
        {item.say && phase === "Read" && (
          <div className="fs-say">
            <span className="fs-when-label">{ui("How it's really said")}</span>
            <p>{usageNote(item.say)}</p>
          </div>
        )}

        {/* We teach the form people say; this is the fuller one they'll meet in
            print. Shown on Read only — during Type it would be a second answer
            on screen, and it counts as correct anyway (see matchEither). */}
        {item.long && phase === "Read" && (
          <div className="fs-say">
            <span className="fs-when-label">{ui("Written in full")}</span>
            <p><CourseText code={targetLang} text={item.long} /></p>
          </div>
        )}

        {phase === "MeaningSelect" ? (
          <div className="fs-board fs-meaning-select-board">
            <div className="fs-board-top">
              <span>{ui(targetLabel)}</span>
              <small>{ui("Select its meaning below")}</small>
            </div>
            <div className="fs-line">
              <TappableSentence text={item.de} lang={targetLang} meaningText={item.en} onWordAudio={restartReadingCountdown} />
            </div>
          </div>
        ) : phase === "ListenPick" ? (
          <button
            type="button"
            className={cn("fs-listening-prompt", ttsOn && "is-speaking")}
            onClick={() => tts(item.de, 0.82, targetLang)}
            aria-label={ui("Replay the phrase")}
          >
            <span className="fs-listening-disc"><Volume2 className="h-7 w-7" /></span>
            <span className="fs-listening-copy">
              <strong>{ui("Listen carefully")}</strong>
              <small>{ui("Tap to hear the phrase again")}</small>
            </span>
            <TtsWaveform active={ttsOn} bars={7} className="fs-listening-wave" />
          </button>
        ) : phase === "MissingWord" ? (
          <>
            <div className="fs-board">
              <div className="fs-board-top">
                <span>{ui(targetLabel)}</span>
                <small>{ui("Choose the sound that completes the sentence")}</small>
              </div>
              <div className="fs-line">
                {missingWordChecked && missingWordCorrect
                  ? <TappableSentence text={item.de} lang={targetLang} meaningText={item.en} onWordAudio={restartReadingCountdown} />
                  : <CourseText code={targetLang} text={missingWord.display} />}
              </div>
              {meaningOnCard && secondLanguage(meaningChip, shownEnglish)}
            </div>
            {!meaningOnCard && secondLanguage(meaningChip, shownEnglish)}
          </>
        ) : phase === "MeaningFirst" ? (
          /*
            The board, the other way round.

            Every other stage puts the target language on the big line and asks
            what it means. This one puts the meaning there and shows how it is
            said underneath, because that is the direction somebody who wants
            to SAY something reads it in — you start from the thought, not from
            the German. The target keeps its tappable words, so a word you are
            unsure of is still one tap from being heard on its own.
          */
          <>
            <div className="fs-board">
              <div className="fs-board-top">
                <span>{ui(meaningLabel)}</span>
                <small>{ui("What you want to say")}</small>
              </div>
              <div className="fs-line">{shownEnglish}</div>
              {/* The inverse board, so what joins it here is the target. Same
                  rule either way: the two halves of the card stay together. */}
              {meaningOnCard && secondLanguage(
                targetChip,
                <TappableSentence text={item.de} lang={targetLang} meaningText={item.en} onWordAudio={restartReadingCountdown} />
              )}
            </div>
            {!meaningOnCard && secondLanguage(
              targetChip,
              <TappableSentence text={item.de} lang={targetLang} meaningText={item.en} onWordAudio={restartReadingCountdown} />
            )}
          </>
        ) : phase === "RecallBoth" ? (
          <div className="fs-closed-recall-cue">
            <span><EyeOff aria-hidden="true" className="h-4 w-4" /> {ui("Closed-book recall")}</span>
            {audioMuted ? (
              <>
                {/*
                  With the sound off the phrase has to be named some other way,
                  or the stage is a question about which of six phrases this is.
                  The meaning is the smaller giveaway: it identifies the phrase
                  while leaving the German — the harder half, and the one the
                  first box asks for — still to be recalled.
                */}
                <strong>{shownEnglish}</strong>
                <small>{uiFmt("Type this in {language}, and type the meaning back.", { language: ui(targetLabel) })}</small>
              </>
            ) : (
              <>
                <strong>{ui("Listen, then type both sides from memory.")}</strong>
                <small>{ui("Neither answer is shown unless you choose Hint or Show answer.")}</small>
                <button
                  className="fs-closed-recall-again"
                  onClick={() => lessonSpeak(item.de, 0.88, targetLang)}
                  type="button"
                >
                  <Volume2 aria-hidden="true" className="h-4 w-4" />
                  {ui("Play it again")}
                </button>
              </>
            )}
          </div>
        ) : phase === "Order" ? (
          <div className="fs-reorder-prompt">
            <span>{ui(meaningLabel)}</span>
            <p>{shownEnglish}</p>
            <small>{ui(`Arrange the ${targetLabel} words below.`)}</small>
          </div>
        ) : hasFr ? (
          phase === "Memory" ? (
            /* ── Memory phase: only English shown, recall both languages ── */
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/70 px-5 py-4 text-center">
              <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-zinc-400">{ui("Meaning")}</p>
              <p className="text-2xl font-black text-zinc-950">{shownEnglish}</p>
            </div>
          ) : (
            /* ── Bilingual: German + French shown together, English as meaning ── */
            <div className="space-y-3">
              <LangBlock
                label="German"
                text={item.de}
                active={phase === "Type"}
                onHear={() => tts(item.de, 0.85, "de-DE")}
              />
              <LangBlock
                label="French"
                text={item.fr}
                active={phase === "French"}
                onHear={() => tts(item.fr, 0.85, "fr-FR")}
              />
              <div className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-500">
                Meaning: <span className="text-zinc-700">{shownEnglish}</span>
              </div>
            </div>
          )
        ) : (
          /* ── German only: prototype sentence board with tappable words ── */
          <>
            <div className="fs-board">
              <div className="fs-board-top">
                <span>{ui(targetLabel)}</span>
                <small>{ui("Tap a word to hear it")}</small>
              </div>
              {picture && phase !== "Translate" && (
                /* Decorative: the word and its meaning are both already in
                   the accessibility tree, and a screen reader announcing
                   "red apple" would hand over the answer. */
                /* Twemoji artwork rather than the system emoji font: the
                   Windows glyphs are flat and two-tone and looked nothing like
                   the illustrated set this was meant to be. The character is
                   still the key; the SVG is what gets drawn. */
                <div className="fs-picture" aria-hidden="true">
                  <img alt="" draggable={false} src={wordPictureAsset(picture) ?? undefined} />
                </div>
              )}
              <div className={cn(
                "fs-line transition-all duration-300",
                phase === "WriteFromMemory" && sayChecked && sayResult.ok ? "is-good" : "",
                phase === "WriteFromMemory" && sayChecked && !sayResult.ok ? "is-bad" : ""
              )}>
                {/* Retrieval stages hide the answer, then reveal it after a correct response. */}
                {phase === "Gap" && !(gapChecked && gapResult.ok) ? <CourseText code={targetLang} text={gap.display} />
                  : phase === "WriteFromMemory" && !sayChecked ? "• • •"
                  : <TappableSentence text={item.de} lang={targetLang} meaningText={item.en} onWordAudio={restartReadingCountdown} />}
              </div>
              {/* Translate is the exception, here as below: there the meaning
                  is the answer, so the card cannot be the one to give it. */}
              {meaningOnCard && phase !== "Translate"
                && secondLanguage(meaningChip, shownEnglish)}
            </div>
            <AnimatePresence>
              {/*
                Read shows the meaning too.

                It used to be the one stage that withheld it, because the stage
                straight after asked you to pick the meaning and reading it here
                would have handed over the answer. That stage has gone, and with
                it the only reason. What was left was an introduction that showed
                a sentence in a language you are still learning and declined to
                say what it meant — which is not reading, it is guessing.

                Translate still withholds it, and for the reason Read no longer
                has: there the meaning is the answer.
              */}
              {phase !== "Translate" && !meaningOnCard
                && secondLanguage(meaningChip, shownEnglish)}
              {phase === "Translate" && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="fs-trow">
                  <span className="fs-chip">{meaningChip}</span>
                  <p className="text-sm">
                    {uiFmt("What does this mean in {language}?", { language: ui(meaningLabel) })}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Aimed at the wrong box. Nothing has been graded, so this is a
            signpost rather than a verdict — no shake, no "Not quite". */}
        <AnimatePresence>
          {wrongLanguageNotice && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800"
              role="status"
            >
              <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{wrongLanguageNotice}</span>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Phase-specific controls */}
      <AnimatePresence mode="wait">

        {/* READ phase */}
        {phase === "Read" && (
          <motion.div key="read" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {audioMuted
                ? ui(hasFr
                  ? "Read the German and French sentences, then continue."
                  : "Read the sentence, then continue.")
                : hasFr
                  ? ui("Read and listen to the German and French.")
                  : ui("Read and listen — it plays automatically.")}
            </p>
            {/* One Hear-it only — the purple listen button in the heading replays. */}
            {/* advanceOrFinish, not advance: with the sound off Meaning first
                is the last stage of a word's route, and advance() on the last
                stage does nothing at all — a Continue that could not be
                pressed. */}
            <Button onClick={advanceOrFinish}
              className="continue-glow h-14 w-full rounded-2xl lesson-cta text-sm font-black">
              {ui("Continue")}
              {readingLeft === null
                ? null
                : <span className="lesson-cta-count">{uiFmt("{seconds}s", { seconds: uiNumber(readingLeft) })}</span>}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {phase === "MeaningFirst" && (
          <motion.div key="meaning-first" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {uiFmt("This is what you'd want to say. Here it is in {language}.", { language: ui(targetLabel) })}
            </p>
            {/* advanceOrFinish, not advance: with the sound off Meaning first
                is the last stage of a word's route, and advance() on the last
                stage does nothing at all — a Continue that could not be
                pressed. */}
            <Button onClick={advanceOrFinish}
              className="continue-glow h-14 w-full rounded-2xl lesson-cta text-sm font-black">
              {ui("Continue")}
              {readingLeft === null
                ? null
                : <span className="lesson-cta-count">{uiFmt("{seconds}s", { seconds: uiNumber(readingLeft) })}</span>}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {/* SELECT THE CORRECT MEANING phase */}
        {phase === "MeaningSelect" && (
          <motion.div
            key="meaning-select"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <p className="text-center text-sm font-semibold text-zinc-500">
              {ui("Choose the correct meaning.")}
            </p>
            <div className="fs-meaning-select-list" role="radiogroup" aria-label={ui("Meaning choices")}>
              {meaningSelectChoices.map((choice, choiceIndex) => {
                const isSelected = meaningSelectChoice === choice;
                const isAnswer = choiceKey(choice) === choiceKey(shownEnglish);
                return (
                  <button
                    key={`${choice}-${choiceIndex}`}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={meaningSelectChecked}
                    onClick={() => chooseMeaningSelectAnswer(choice)}
                    className={cn(
                      "fs-meaning-select-choice",
                      isSelected && "is-selected",
                      meaningSelectChecked && isAnswer && "is-correct",
                      meaningSelectChecked && isSelected && !isAnswer && "is-wrong"
                    )}
                  >
                    <kbd>{choiceIndex + 1}</kbd>
                    <strong>{choice}</strong>
                    <span className="fs-meaning-select-state" aria-hidden="true">
                      {meaningSelectChecked && isAnswer
                        ? <CheckCircle2 className="h-5 w-5" />
                        : meaningSelectChecked && isSelected
                          ? <X className="h-5 w-5" />
                          : <span />}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {meaningSelectChecked && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn("fs-result fs-meaning-select-result", meaningSelectCorrect ? "is-good" : "is-bad")}
                  aria-live="polite"
                >
                  <strong>{ui(meaningSelectCorrect ? "Excellent!" : "Not quite")}</strong>
                  <span>
                    {meaningSelectCorrect
                      ? ui("You selected the correct meaning.")
                      : <>{ui("Answer:")} <strong>{shownEnglish}</strong></>}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {meaningSelectChecked && meaningSelectCorrect ? null : meaningSelectChecked ? (
              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={retryMeaningSelect}
                  variant="outline"
                  className="h-12 flex-1 rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {ui("Try again")}
                </Button>
                <Button
                  type="button"
                  onClick={advance}
                  className="app-skip-button h-12 flex-1 rounded-2xl font-black"
                >
                  {ui("Skip")}
                </Button>
              </div>
            ) : (
              <div className="fs-meaning-actions fs-meaning-actions-centered">
                <button type="button" onClick={advance} className="fs-meaning-skip app-skip-button">
                  {ui("Skip")}
                </button>
              </div>
            )}
            <div className="fs-hint">
              <kbd>1-3</kbd> {ui("Choose an answer.")}
            </div>
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">
              {ui("← Back")}
            </button>
          </motion.div>
        )}

        {/* LISTEN & PICK phase */}
        {phase === "ListenPick" && (
          <motion.div
            key="listen-pick"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {listeningMode === "type" ? (
              <>
                <p className="text-center text-sm font-semibold text-zinc-500">
                  {ui(`Write down the ${targetLabel} you just heard.`)}
                </p>

                <motion.div animate={shakeControls}>
                  <div className={cn("fs-panel",
                    listeningTypeChecked && listeningTypeResult.ok && "is-good",
                    listeningTypeChecked && !listeningTypeResult.ok
                      && (listeningTypeResult.phrasingNote ? "is-coach" : "is-bad"))}>
                    <div className="fs-prompt">
                      <PromptLanguageBadge label={targetLabel} />
                      <strong>{ui("Type what you heard")}</strong>
                    </div>
                    <Input
                      ref={listeningInputRef}
                      className="fs-input"
                      aria-label={ui(`Type the ${targetLabel} you heard`)}
                      placeholder={ui("Type what you heard...")}
                      autoFocus
                      spellCheck={false}
                      value={listeningInput}
                      onChange={(event) => {
                        setListeningInput(event.target.value);
                        if (listeningTypeChecked) setListeningTypeChecked(false);
                      }}
                      onKeyDown={(event) => event.key === "Enter" && checkListeningTyped()}
                      disabled={listeningTypeChecked && listeningTypeResult.ok}
                    />
                    <button
                      type="button"
                      className="fs-check"
                      onClick={checkListeningTyped}
                      disabled={listeningTypeChecked && listeningTypeResult.ok}
                    >
                      <span className="fs-check-label">
                        {ui(listeningTypeChecked && listeningTypeResult.ok ? "Next" : "Check")}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
                <AccentRow language={targetLanguage} onInsert={(character) => insertAt(listeningInputRef.current, character, setListeningInput)} />

                <AnimatePresence>
                  {listeningTypeChecked && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={cn("fs-result", listeningTypeResult.ok ? "is-good" : "is-bad")}
                      role="status"
                    >
                      <strong>
                        {ui(listeningTypeResult.ok
                          ? (listeningTypeResult.spellingNote ? "Close enough — watch the spelling" : "That's it!")
                          : "Not quite")}
                      </strong>
                      <span>
                        {listeningTypeResult.ok
                          ? ui("You wrote down what was said.")
                          : ui("Play it once more and write what you hear.")}
                      </span>
                      <ManualReviewNote grade={grade} notice={manualReviewNotice} onUndo={() => { onUndoManualReview?.(); setGrade(null); }} onDismiss={() => onDismissManualReview?.()} onHold={onHoldManualReview} onRelease={onReleaseManualReview} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {listeningTypeChecked && !listeningTypeResult.ok && (
                  <Button
                    type="button"
                    onClick={retryListeningTyped}
                    variant="outline"
                    className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> {ui("Hear it and try again")}
                  </Button>
                )}

                {/* The way out. Quiet while the round is still going the
                    learner's way; after two misses it stops being a footnote
                    and says out loud that the easier version exists. */}
                {listeningMisses >= 2 ? (
                  <div className="fs-listening-rescue">
                    <p>{ui("Hard to catch? Take it as four options instead.")}</p>
                    <Button
                      type="button"
                      onClick={showListeningChoices}
                      className="h-12 w-full rounded-2xl font-black"
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      {ui("Show me the options")}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={showListeningChoices}
                    className="fs-listening-switch"
                  >
                    <ListChecks aria-hidden="true" className="h-4 w-4" />
                    {ui("Show me the options instead")}
                  </button>
                )}

                {!listeningTypeChecked && (
                  <div className="fs-hint"><kbd>↵</kbd> {ui("Press Enter when you are ready.")}</div>
                )}
              </>
            ) : (
              <>
            <p className="text-center text-sm font-semibold text-zinc-500">
              {ui(`Choose the ${targetLabel} phrase you heard.`)}
            </p>
            <div className="fs-listening-choices" role="group" aria-label={ui("Listening choices")}>
              {listeningChoices.map((choice, choiceIndex) => {
                const isSelected = listeningChoice === choice;
                const isAnswer = choiceKey(choice) === choiceKey(item.de);
                return (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={listeningChecked}
                    onClick={() => chooseListeningAnswer(choice)}
                    className={cn(
                      "fs-listening-choice",
                      listeningChecked && isAnswer && "is-correct",
                      listeningChecked && isSelected && !isAnswer && "is-wrong"
                    )}
                  >
                    <span>{choiceIndex + 1}</span>
                    <strong><CourseText code={targetLang} text={choice} /></strong>
                    {listeningChecked && isAnswer && <CheckCircle2 className="h-5 w-5" />}
                    {listeningChecked && isSelected && !isAnswer && <X className="h-5 w-5" />}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {listeningChecked && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn("fs-result", listeningCorrect ? "is-good" : "is-bad")}
                >
                  <strong>{ui(listeningCorrect ? "That's it!" : "Not quite")}</strong>
                  <span>
                    {listeningCorrect
                      ? ui("You matched the spoken phrase.")
                      : <>{ui("Answer:")} <strong><CourseText code={targetLang} text={item.de} /></strong></>}
                  </span>
                                  <ManualReviewNote grade={grade} notice={manualReviewNotice} onUndo={() => { onUndoManualReview?.(); setGrade(null); }} onDismiss={() => onDismissManualReview?.()} onHold={onHoldManualReview} onRelease={onReleaseManualReview} />
                </motion.div>
              )}
            </AnimatePresence>

            {!listeningCorrect && listeningChecked && (
              <>
                <Button
                  type="button"
                  onClick={retryListening}
                  className="h-12 w-full rounded-2xl bg-zinc-100 font-black text-zinc-700 hover:bg-zinc-200"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {ui("Hear it and try again")}
                </Button>
                <div className="fs-hint">
                  <kbd>{ui("Space")}</kbd> <kbd>R</kbd> <kbd>→</kbd> {ui("Try again")}
                </div>
              </>
            )}

            {/* Back to writing it, for anyone who took the options to see the
                shape of the sentence and now wants the real attempt. */}
            {!(listeningChecked && listeningCorrect) && (
              <button
                type="button"
                onClick={backToListeningTyping}
                className="fs-listening-switch"
              >
                <Keyboard aria-hidden="true" className="h-4 w-4" />
                {ui("Go back to writing it")}
              </button>
            )}
              </>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">
              {ui("← Back")}
            </button>
          </motion.div>
        )}

        {/* LISTEN FOR THE MISSING WORD phase */}
        {phase === "MissingWord" && (
          <motion.div
            key="missing-word"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            className="fs-missing-phase"
          >
            <p className="fs-missing-instruction">
              {ui("The first option plays itself. Choose it, or listen to the others.")}
            </p>
            {/* Said where the choosing happens, not in a help screen. The keys
                are the only way through this round without a mouse, and a
                shortcut nobody is told about is one nobody uses. */}
            <p className="fs-missing-keyhint">
              {ui("Press 1, 2 or 3 to hear an option again, then Enter to choose it.")}
            </p>
            <div className="fs-missing-audio-list" role="group" aria-label={ui("Missing-word audio choices")}>
              {missingWordChoices.map((choice, choiceIndex) => {
                const isSelected = missingWordChoice === choice;
                const isAnswer = choiceKey(choice) === choiceKey(missingWord.answer);
                return (
                  <div
                    key={`${choice}-${choiceIndex}`}
                    className={cn(
                      "fs-missing-audio-option",
                      isSelected && "is-selected",
                      // What Enter would choose. is-speaking lasts only as
                      // long as the audio, so on its own the keyboard route
                      // leaves nothing on screen saying which option is armed.
                      !missingWordChecked && missingWordPreview === choice && "is-armed",
                      ttsOn && missingWordPreview === choice && "is-speaking",
                      missingWordChecked && isAnswer && "is-correct",
                      missingWordChecked && isSelected && !isAnswer && "is-wrong"
                    )}
                  >
                    <span className="fs-missing-option-number">{choiceIndex + 1}</span>
                    <button
                      aria-label={`${ui("Play option")} ${choiceIndex + 1}`}
                      className="fs-missing-play"
                      onClick={() => previewMissingWord(choice)}
                      type="button"
                    >
                      <Volume2 className="h-5 w-5" />
                    </button>
                    <TtsWaveform
                      active={ttsOn && missingWordPreview === choice}
                      bars={9}
                      className="fs-missing-wave"
                    />
                    <button
                      aria-label={`${ui("Choose answer")} ${choiceIndex + 1}`}
                      aria-pressed={isSelected}
                      className="fs-missing-choose"
                      disabled={missingWordChecked}
                      onClick={() => selectMissingWord(choice)}
                      type="button"
                    >
                      {missingWordChecked && isAnswer
                        ? <CheckCircle2 className="h-5 w-5" />
                        : missingWordChecked && isSelected
                          ? <X className="h-5 w-5" />
                          : ui("Choose")}
                    </button>
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {missingWordChecked && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn("fs-missing-result fs-result", missingWordCorrect ? "is-good" : "is-bad")}
                  aria-live="polite"
                  role="status"
                >
                  <strong>{ui(missingWordCorrect ? "That's it!" : "Not quite")}</strong>
                  <span>
                    {missingWordCorrect
                      ? ui("You found the missing word.")
                      : <>{ui("The missing word is")} <strong><CourseText code={targetLang} text={missingWord.answer} /></strong>.</>}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {!missingWordCorrect && missingWordChecked && (
              <>
                <Button
                  type="button"
                  onClick={retryMissingWord}
                  className="h-12 w-full rounded-2xl bg-zinc-100 font-black text-zinc-700 hover:bg-zinc-200"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {ui("Listen and try again")}
                </Button>
                <div className="fs-hint">
                  <kbd>{ui("Space")}</kbd> <kbd>R</kbd> <kbd>→</kbd> {ui("Try again")}
                </div>
              </>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">
              {ui("← Back")}
            </button>
          </motion.div>
        )}

        {/* WRITE IT: read the meaning, then type the whole target sentence from memory. */}
        {phase === "WriteFromMemory" && (
          <motion.div key="write-from-memory" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {ui(`Type the whole ${targetLabel} sentence — from the ${meaningLabel} above.`)}
            </p>
            <motion.div animate={shakeControls}>
              <div className={cn("fs-panel",
                sayChecked && sayResult.ok && "is-good",
                sayChecked && !sayResult.ok && (sayResult.phrasingNote ? "is-coach" : "is-bad"))}>
                <div className="fs-prompt">
                  <PromptLanguageBadge label={targetLabel} />
                  <strong>{ui(`Type in ${targetLabel}`)}</strong>
                </div>
                <Input ref={sayRef}
                  className="fs-input"
                  placeholder={ui(`Type the ${targetLabel} sentence...`)}
                  autoFocus
                  spellCheck={false}
                  value={sayInput}
                  onChange={(e) => { setSayInput(e.target.value); if (sayChecked) setSayChecked(false); }}
                  onKeyDown={(e) => e.key === "Enter" && (sayChecked && sayResult.ok ? advanceOrFinish() : checkSay())}
                  disabled={sayChecked && sayResult.ok}
                />
                <button type="button" className="fs-check" onClick={sayChecked && sayResult.ok ? advanceOrFinish : checkSay}>
                  <span className="fs-check-label">{sayChecked && sayResult.ok ? ui("Next") : ui("Check")}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
            <AccentRow language={targetLanguage} onInsert={(c) => insertAt(sayRef.current, c, setSayInput)} />
            {!(sayChecked && sayResult.ok) && (
              <RecallHelp key={`${item.id}-write-${step}`} answer={showCourseText(targetLang, item.de)} />
            )}

            <AnimatePresence>
              {sayChecked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={cn("rounded-lg border p-4 text-center text-sm font-semibold",
                    sayResult.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" :
                    sayResult.phrasingNote ? "border-amber-500/25 bg-amber-500/10 text-amber-700" : "border-rose-500/20 bg-rose-500/10 text-rose-700")}>
                  {sayResult.ok
                    ? <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> {sayResult.spellingNote ? "Close — mind the spelling" : "Perfect!"}</span>
                    : sayResult.phrasingNote
                    ? <span className="space-y-1 block">
                        <span className="block">{ui("People would understand you — but that's the literal translation.")}</span>
                        <span className="block text-xs text-zinc-500">{ui("The natural way is:")} <span className="text-zinc-950"><CourseText code={targetLang} text={item.de} /></span></span>
                      </span>
                    : <>{ui("Not quite — the answer is")} <span className="text-zinc-950"><CourseText code={targetLang} text={item.de} /></span></>}
                </motion.div>
              )}
            </AnimatePresence>

            {sayChecked && !sayResult.ok ? (
              <div className="space-y-2">
                <Button onClick={retrySay} variant="outline"
                  className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
                </Button>
                <div className="fs-hint">{ui("Write it out to carry on — the answer is above.")}</div>
              </div>
            ) : (
              <div className="fs-hint"><kbd>↵</kbd> {ui("Press Enter when you are ready.")}</div>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}

        {/* CLOSED-BOOK: retrieve both sides without either sentence shown. */}
        {phase === "RecallBoth" && (
          <motion.div key="recall-both" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {uiFmt(
                "{target} is ready to type. You can answer either box first; a correct {target} answer moves focus to {meaning}.",
                { target: ui(targetLabel), meaning: ui(meaningLabel) }
              )}
            </p>
            <div className="fs-recall-pair">
              <div className="fs-recall-pair-column">
                <span className="fs-recall-language">{ui(targetLabel)}</span>
                <div className={cn(
                  "fs-panel",
                  recallBothTargetChecked && recallBothTargetResult.ok && "is-good",
                  recallBothTargetChecked && !recallBothTargetResult.ok && "is-bad"
                )}>
                  <div className="fs-prompt"><PromptLanguageBadge label={targetLabel} /><strong>{ui(`Type in ${targetLabel}`)}</strong></div>
                  <Input
                    ref={recallBothTargetRef}
                    autoFocus
                    className="fs-input"
                    aria-label={ui(`Recall the ${targetLabel}`)}
                    placeholder={ui(`Type in ${targetLabel}`)}
                    spellCheck={false}
                    value={recallBothTargetInput}
                    onChange={(event) => {
                      setRecallBothTargetInput(event.target.value);
                      if (recallBothTargetChecked) setRecallBothTargetChecked(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        checkRecallBothTarget();
                      }
                    }}
                    disabled={recallCompletionScheduledRef.current}
                  />
                </div>
                <div className="fs-recall-char-slot">
                  <AccentRow language={targetLanguage} onInsert={(character) => insertAt(recallBothTargetRef.current, character, setRecallBothTargetInput)} />
                </div>
                {!recallBothTargetReady && (
                  <RecallHelp
                    key={`${item.id}-recall-both-target-${step}`}
                    answer={showCourseText(targetLang, item.de)}
                    label={targetLabel}
                    onHelp={noteRecallStruggle}
                  />
                )}
              </div>

              <div className="fs-recall-pair-column">
                <span className="fs-recall-language">{ui(meaningLabel)}</span>
                <div className={cn(
                  "fs-panel",
                  recallBothChecked && recallBothMeaningResult.ok && "is-good",
                  recallBothChecked && !recallBothMeaningResult.ok && "is-bad"
                )}>
                  <div className="fs-prompt"><PromptLanguageBadge label={meaningLabel} /><strong>{ui(`Type in ${meaningLabel}`)}</strong></div>
                  <Input
                    ref={recallBothMeaningRef}
                    className="fs-input"
                    aria-label={ui(`Recall the ${meaningLabel} meaning`)}
                    placeholder={ui(`Type the ${meaningLabel} meaning...`)}
                    spellCheck={false}
                    value={recallBothMeaningInput}
                    onChange={(event) => {
                      setRecallBothMeaningInput(event.target.value);
                      if (recallBothChecked) setRecallBothChecked(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        checkRecallBoth();
                      }
                    }}
                    disabled={recallCompletionScheduledRef.current}
                  />
                </div>
                <div className="fs-recall-char-slot">
                  <AccentRow language={meaningLanguage} onInsert={(character) => insertAt(recallBothMeaningRef.current, character, setRecallBothMeaningInput)} />
                </div>
                {!(recallBothChecked && recallBothMeaningResult.ok) && (
                  <RecallHelp
                    key={`${item.id}-recall-both-meaning-${step}`}
                    answer={displayEnglish}
                    label={meaningLabel}
                    onHelp={noteRecallStruggle}
                  />
                )}
              </div>
            </div>

            {recallBothTargetChecked && recallBothChecked && (
              <div className={cn(
                "fs-result",
                recallBothTargetResult.ok && recallBothMeaningResult.ok ? "is-good" : "is-bad"
              )} role="status">
                <strong>{ui(recallBothTargetResult.ok && recallBothMeaningResult.ok ? "Both answers are correct." : "Not quite")}</strong>
                <span>
                  {ui(targetLabel)}: {ui(recallBothTargetResult.ok ? "Correct" : "Try again")}
                  <span aria-hidden="true"> · </span>
                  {ui(meaningLabel)}: {ui(recallBothMeaningResult.ok ? "Correct" : "Try again")}
                </span>
                <ManualReviewNote grade={grade} notice={manualReviewNotice} onUndo={() => { onUndoManualReview?.(); setGrade(null); }} onDismiss={() => onDismissManualReview?.()} onHold={onHoldManualReview} onRelease={onReleaseManualReview} />
              </div>
            )}

            {recallBothTargetChecked && recallBothChecked && !(recallBothTargetResult.ok && recallBothMeaningResult.ok) ? (
              <Button onClick={retryRecallBoth} variant="outline"
                className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
              </Button>
            ) : (
              <Button
                onClick={recallBothTargetReady ? checkRecallBoth : checkRecallBothTarget}
                disabled={
                  recallCompletionScheduledRef.current
                  || (recallBothTargetReady
                    ? !recallBothMeaningInput.trim()
                    : !recallBothTargetInput.trim())
                }
                className="continue-glow h-14 w-full rounded-2xl lesson-cta text-sm font-black"
              >
                {ui(
                  recallCompletionScheduledRef.current
                    ? "Done"
                    : recallBothTargetReady
                      ? `Check ${meaningLabel}`
                      : `Check ${targetLabel}`
                )} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            )}
            <button
              type="button"
              onClick={goBack}
              disabled={recallCompletionScheduledRef.current}
              className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)] disabled:cursor-default disabled:opacity-50"
            >
              {ui("← Back")}
            </button>
          </motion.div>
        )}

        {/* TYPE phase */}
        {phase === "Type" && (
          <motion.div key="type" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {/* Both of these were written as bare strings, so a German
                  interface showed them in English even though the translation
                  for the second one has been sitting in i18n all along. */}
              {hasFr ? ui("Now type the German sentence.") : ui("Now type the sentence exactly.")}
            </p>

            <motion.div animate={shakeControls}>
              <div className={cn("fs-panel",
                checked && result.ok && "is-good",
                checked && !result.ok && (result.phrasingNote ? "is-coach" : "is-bad"))}>
                <div className="fs-prompt">
                  <PromptLanguageBadge label={targetLabel} />
                  <strong>{ui(`Type in ${targetLabel}`)}</strong>
                </div>
                <Input ref={inputRef}
                  className="fs-input"
                  placeholder="Type the sentence..."
                  autoFocus
                  spellCheck={false}
                  value={input}
                  onChange={e => { setInput(e.target.value); if (checked) setChecked(false); }}
                  onKeyDown={e => e.key === "Enter" && (checked && result.ok ? advanceFromHere() : checkAnswer())}
                  disabled={checked && result.ok}
                />
                <button type="button" className="fs-check" onClick={checked && result.ok ? advanceFromHere : checkAnswer}>
                  <span className="fs-check-label">{checked && result.ok ? ui("Next") : ui("Check")}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
            <AccentRow language={targetLanguage} onInsert={c => insertAt(inputRef.current, c, setInput)} />

            {/* Feedback */}
            <AnimatePresence>
              {checked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={cn("rounded-lg border p-5 text-center space-y-2",
                    result.ok ? "border-emerald-500/20 bg-emerald-500/10" :
                    result.phrasingNote ? "border-amber-500/25 bg-amber-500/10" : "border-rose-500/20 bg-rose-500/10")}>
                  {result.ok ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold text-lg">
                      <CheckCircle2 className="h-5 w-5" />
                      {result.spellingNote ? ui("Close enough — watch the spelling") : ui("Perfect!")}
                    </div>
                  ) : result.phrasingNote ? (
                    <div className="space-y-1.5">
                      <div className="text-amber-700 font-semibold text-lg">
                        {ui("People would understand you — but that's the literal translation.")}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {ui("The natural way is:")} <span className="text-zinc-950 font-semibold"><CourseText code={targetLang} text={item.de} /></span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-rose-700 font-semibold">
                        {result.capitalizationError
                          ? capitalLetterHint(targetLang)
                          : ui("Not quite")}
                      </div>
                      <div className="text-xs text-zinc-500">{ui("Target:")} <span className="text-zinc-950 font-semibold"><CourseText code={targetLang} text={item.de} /></span></div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/*
              A wrong answer is repaired, not walked past.

              Skip used to sit beside Try again, directly under a panel that had
              just printed the sentence. So the cheapest way through a sentence
              you could not write was to read it and press the other button —
              and the one thing the stage exists to make you do, produce it, was
              the one thing you could decline. The closed-book recall stages
              never offered that; this brings the production stages into line.

              Nothing here is a trap. The answer is on screen, the grader
              forgives spelling and phrasing, the accent row supplies the
              characters, and the session's own exit is still a press away — so
              what is being asked for is a copy, which is the repair.
            */}
            {checked && !result.ok ? (
              <div className="space-y-2">
                <Button onClick={retry} variant="outline"
                  className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
                </Button>
                <div className="fs-hint">{ui("Write it out to carry on — the answer is above.")}</div>
              </div>
            ) : (
              <div className="fs-hint"><kbd>↵</kbd> {ui("Press Enter when you are ready.")}</div>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}

        {/* TRANSLATE phase */}
        {phase === "Translate" && (
          <motion.div key="translate" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {ui("Type the translation. Use the word bank if you need support.")}
            </p>

            <div className="fs-translation-toolbar">
              <div className="fs-translation-modes" role="group" aria-label={ui("Answer mode")}>
                <button
                  type="button"
                  className={cn(translationMode === "type" && "is-active")}
                  aria-pressed={translationMode === "type"}
                  onClick={() => chooseTranslationMode("type")}
                  disabled={enChecked && enResult.ok}
                >
                  <Keyboard aria-hidden="true" className="h-4 w-4" />
                  {ui("Type")}
                </button>
                <button
                  type="button"
                  className={cn(translationMode === "bank" && "is-active")}
                  aria-pressed={translationMode === "bank"}
                  onClick={() => chooseTranslationMode("bank")}
                  disabled={enChecked && enResult.ok}
                >
                  <MousePointerClick aria-hidden="true" className="h-4 w-4" />
                  {ui("Word bank")}
                </button>
              </div>
              {translationMode === "bank" && translationPicked.length > 0 && !enChecked && (
                <button
                  type="button"
                  className="fs-translation-clear"
                  onClick={() => setTranslationPicked([])}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  {ui("Clear")}
                </button>
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {translationMode === "bank" ? (
                <motion.div
                  key="translation-bank"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="space-y-3"
                >
                  <motion.div animate={shakeControls}>
                    <TranslationWordBank
                      tokens={translationTokens}
                      selected={translationPicked}
                      disabled={enChecked}
                      checked={enChecked}
                      correct={enResult.ok}
                      onPick={pickTranslationToken}
                      onRemove={removeTranslationToken}
                    />
                  </motion.div>
                  <Button
                    type="button"
                    onClick={enChecked && enResult.ok ? advanceOrFinish : checkEnAnswer}
                    disabled={translationPicked.length === 0 || (enChecked && !enResult.ok)}
                    className="continue-glow h-14 w-full rounded-2xl lesson-cta text-sm font-black"
                  >
                    {ui(enChecked && enResult.ok ? "Next" : "Check translation")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="translation-type"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="space-y-3"
                >
                  <motion.div animate={shakeControls}>
                    <div className={cn("fs-panel",
                      enChecked && enResult.ok && "is-good",
                      enChecked && !enResult.ok && (enResult.phrasingNote ? "is-coach" : "is-bad"))}>
                      <div className="fs-prompt">
                        <PromptLanguageBadge label={meaningLabel} />
                        <strong>{ui(`Type in ${meaningLabel}`)}</strong>
                      </div>
                      <Input ref={enInputRef}
                        className="fs-input"
                        placeholder={ui(`Type the ${meaningLabel} meaning...`)}
                        autoFocus
                        spellCheck={false}
                        value={enInput}
                        onChange={e => { setEnInput(e.target.value); if (enChecked) setEnChecked(false); }}
                        onKeyDown={e => e.key === "Enter" && (enChecked && enResult.ok ? advanceOrFinish() : checkEnAnswer())}
                        disabled={enChecked && enResult.ok}
                      />
                      <button type="button" className="fs-check" onClick={enChecked && enResult.ok ? advanceOrFinish : checkEnAnswer}>
                        <span className="fs-check-label">{enChecked && enResult.ok ? ui("Next") : ui("Check")}</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                  <AccentRow language={meaningLanguage} onInsert={c => insertAt(enInputRef.current, c, setEnInput)} />
                </motion.div>
              )}
            </AnimatePresence>
            {!(enChecked && enResult.ok) && (
              <RecallHelp key={`${item.id}-translate-${step}`} answer={shownEnglish} />
            )}
            <AnimatePresence>
              {enChecked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={cn("rounded-lg border p-5 text-center space-y-2",
                    enResult.ok ? "border-emerald-500/20 bg-emerald-500/10" :
                    enResult.phrasingNote ? "border-amber-500/25 bg-amber-500/10" : "border-rose-500/20 bg-rose-500/10")}>
                  {enResult.ok ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold text-lg">
                      <CheckCircle2 className="h-5 w-5" /> That's it!
                    </div>
                  ) : enResult.phrasingNote ? (
                    <div className="space-y-1.5">
                      <div className="text-amber-700 font-semibold text-lg">
                        {ui("People would understand you — but that's the literal translation.")}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {ui("The natural way is:")} <span className="text-zinc-950 font-semibold">{shownEnglish}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-rose-700 font-semibold">{ui("Not quite")}</div>
                      <div className="text-xs text-zinc-500">{ui("Answer:")} <span className="text-zinc-950 font-semibold">{shownEnglish}</span></div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {enChecked && !enResult.ok ? (
              <div className="space-y-2">
                <Button onClick={retryEn} variant="outline"
                  className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
                </Button>
                <div className="fs-hint">
                  {ui(translationMode === "type"
                    ? "Write it out to carry on — the answer is above."
                    : "Build it correctly to carry on — the answer is above.")}
                </div>
              </div>
            ) : translationMode === "type" ? (
              <div className="fs-hint"><kbd>↵</kbd> {ui("Press Enter when you are ready.")}</div>
            ) : (
              <div className="fs-hint">{ui("Choose the words, then check your answer.")}</div>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}

        {/* GAP phase — type the missing word(s) */}
        {phase === "Gap" && (
          <motion.div key="gap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              Fill the blank — type the missing {gap.words.length > 1 ? "words" : "word"}.
            </p>
            <motion.div animate={shakeControls}>
              <div className={cn("fs-panel",
                gapChecked && gapResult.ok && "is-good",
                gapChecked && !gapResult.ok && "is-bad")}>
                <div className="fs-prompt">
                  <PromptLanguageBadge label={targetLabel} />
                  <strong>{ui("Fill in")}</strong>
                </div>
                {/*
                  One box per blank, in sentence order. Two blanks used to
                  share a box, and the only sign that two words were wanted
                  was a plural in the placeholder — the shape of the answer
                  should be visible before anything is typed.

                  Enter moves to the next empty box first and only checks
                  from the last one, so the key means "done with this blank"
                  everywhere except where it means "done".

                  A finished word moves the caret on by itself: waiting for
                  Enter after the answer is already complete makes the box
                  feel stuck. Enter still works for the cases the check keeps
                  its hands off — see gapEntryIsComplete.
                */}
                <div className={cn("flex min-w-0 flex-1 items-center gap-2",
                  gap.words.length > 1 && "fs-gap-row")}>
                  {gap.words.map((_, index) => (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5" key={index}>
                      {gap.words.length > 1 && (
                        <span aria-hidden="true" className="text-xs font-black text-zinc-400">{index + 1}</span>
                      )}
                      <Input
                        ref={(node) => {
                          gapInputRefs.current[index] = node;
                          if (index === 0) gapInputRef.current = node;
                        }}
                        aria-label={uiFmt("Missing word {n}", { n: index + 1 })}
                        className="fs-input min-w-0"
                        placeholder="Type the missing word..."
                        autoFocus={index === 0}
                        spellCheck={false}
                        value={gapInputs[index] ?? ""}
                        onFocus={() => { gapFocusIndex.current = index; }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setGapInputAt(index, value);
                          if (gapChecked) setGapChecked(false);
                          const next = [...gapInputs];
                          while (next.length <= index) next.push("");
                          next[index] = value;
                          const nextIsEmpty = !(next[index + 1] ?? "").trim();
                          if (index < gap.words.length - 1 && nextIsEmpty
                            && (gapEntryIsComplete(next, index, gap.words)
                              || (gapLatinWords !== null && gapTranscriptionIsComplete(next, index, gapLatinWords)))) {
                            gapInputRefs.current[index + 1]?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          if (index < gap.words.length - 1 && !(gapChecked && gapResult.ok)) {
                            gapInputRefs.current[index + 1]?.focus();
                            return;
                          }
                          if (gapChecked && gapResult.ok) advanceOrFinish(); else checkGap();
                        }}
                        disabled={gapChecked && gapResult.ok}
                      />
                    </div>
                  ))}
                </div>
                <button type="button" className="fs-check" onClick={gapChecked && gapResult.ok ? advanceOrFinish : checkGap}>
                  <span className="fs-check-label">{gapChecked && gapResult.ok ? ui("Next") : ui("Check")}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
            <AccentRow
              language={targetLanguage}
              onInsert={(c) => {
                const index = Math.min(gapFocusIndex.current, gap.words.length - 1);
                insertAt(
                  gapInputRefs.current[index] ?? gapInputRef.current,
                  c,
                  (value) => setGapInputAt(index, value)
                );
              }}
            />
            {!(gapChecked && gapResult.ok) && (
              <RecallHelp
                key={`${item.id}-gap-${step}`}
                answer={showCourseText(targetLang, gap.words.join(" "))}
                hint={buildRecallHint(showCourseText(targetLang, gap.words.join(" ")))}
              />
            )}

            <AnimatePresence>
              {gapChecked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={cn("rounded-lg border p-4 text-center text-sm font-semibold",
                    gapResult.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-rose-500/20 bg-rose-500/10 text-rose-700")}>
                  {gapResult.ok
                    ? <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> That's it!</span>
                    : <>Not quite — the missing {gap.words.length > 1 ? "words are" : "word is"} <span className="text-zinc-950"><CourseText code={targetLang} text={gap.words.join(" ")} /></span></>}
                </motion.div>
              )}
            </AnimatePresence>

            {gapChecked && !gapResult.ok ? (
              <div className="space-y-2">
                <Button onClick={retryGap} variant="outline"
                  className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
                </Button>
                <div className="fs-hint">{ui("Write it out to carry on — the answer is above.")}</div>
              </div>
            ) : (
              <div className="fs-hint"><kbd>↵</kbd> {ui("Press Enter when you are ready.")}</div>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}

        {/* WORD ORDER phase — arrange the sentence before writing it unaided. */}
        {phase === "Order" && (
          <motion.div key="order" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="fs-order-phase space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              {ui("Drag the words into the correct order. You can also select a word, then choose where to move it.")}
            </p>

            <motion.div animate={shakeControls} className="fs-order-panel">
              <div
                className="fs-order-list"
                role="group"
                aria-label={ui(WORDS_TO_ARRANGE_LABEL[targetLanguage])}
              >
                {orderTokens.map((token, tokenIndex) => {
                  // The tiles are shuffled, so where a token sits now says
                  // nothing. What matters is whether it opens the SENTENCE:
                  // any other capital is a noun.
                  // A word hover explains the word in the language it is in.
                  // There is no French glossary, so a French tile carries no
                  // hover rather than a German one about a French word.
                  const hoverGloss = learnFr
                    ? undefined
                    : learnEn
                      ? englishWordGloss(token.text)
                      : germanWordGloss(token.text, {
                        midSentenceCapital: /^\p{Lu}/u.test(token.text)
                          && token.text !== String(item.de).trim().split(/\s+/)[0],
                      });
                  return (
                    <button
                      key={token.id}
                      type="button"
                      draggable={!orderLocked}
                      aria-disabled={orderLocked}
                      aria-pressed={orderSelected === tokenIndex}
                      aria-label={`${showCourseText(targetLang, token.text)}${hoverGloss ? `: ${hoverGloss}` : ""}, ${ui("position")} ${tokenIndex + 1}`}
                      data-gloss={hoverGloss ?? undefined}
                      className={cn(
                        "fs-order-token",
                        orderSelected === tokenIndex && "is-selected",
                        orderDragging === token.id && "is-dragging",
                        orderDropTarget === token.id && orderDragging !== token.id && "is-drop-target",
                        orderChecked && orderIsCorrect && "is-correct"
                      )}
                      onClick={() => {
                        if (suppressOrderClickRef.current) {
                          suppressOrderClickRef.current = false;
                          return;
                        }
                        if (!orderLocked) selectOrderToken(tokenIndex);
                      }}
                      onDragStart={(event) => {
                        if (orderLocked) {
                          event.preventDefault();
                          return;
                        }
                        suppressOrderClickRef.current = true;
                        draggedOrderTokenId.current = token.id;
                        setOrderDragging(token.id);
                        setOrderDropTarget(null);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", token.id);
                      }}
                      onDragEnd={() => {
                        draggedOrderTokenId.current = null;
                        setOrderDragging(null);
                        setOrderDropTarget(null);
                        window.setTimeout(() => {
                          suppressOrderClickRef.current = false;
                        }, 0);
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        if (orderLocked) return;
                        const fromId = draggedOrderTokenId.current;
                        if (!fromId || fromId === token.id) {
                          setOrderDropTarget(null);
                          return;
                        }
                        setOrderDropTarget(token.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (draggedOrderTokenId.current && draggedOrderTokenId.current !== token.id) {
                          setOrderDropTarget(token.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (orderLocked) return;
                        const fromId = draggedOrderTokenId.current || event.dataTransfer.getData("text/plain");
                        reorderTokenById(fromId, token.id);
                        draggedOrderTokenId.current = null;
                        setOrderDragging(null);
                        setOrderDropTarget(null);
                      }}
                      onKeyDown={(event) => {
                        if (orderLocked) return;
                        if (event.key === "ArrowLeft" && tokenIndex > 0) {
                          event.preventDefault();
                          reorderToken(tokenIndex, tokenIndex - 1);
                        }
                        if (event.key === "ArrowRight" && tokenIndex < orderTokens.length - 1) {
                          event.preventDefault();
                          reorderToken(tokenIndex, tokenIndex + 1);
                        }
                      }}
                    >
                      <GripVertical aria-hidden="true" className="h-4 w-4" />
                      <span><CourseText code={targetLang} text={token.text} /></span>
                    </button>
                  );
                })}
              </div>
              <p className="fs-order-help">{ui("Drag, click two words, or use the arrow keys to reorder.")}</p>
            </motion.div>
            <div className="fs-order-feedback">
              {!orderChecked && (
                <RecallHelp key={`${item.id}-order-${step}`} answer={showCourseText(targetLang, item.de)} />
              )}

              {orderChecked && (
                <div className={cn("fs-result", orderIsCorrect ? "is-good" : "is-bad")} role="status">
                  <strong>{ui(orderIsCorrect ? "Correct word order" : "Not quite")}</strong>
                  <span>{ui(orderIsCorrect ? "The sentence is ready to write from memory." : "Rearrange the words and check again.")}</span>
                                  <ManualReviewNote grade={grade} notice={manualReviewNotice} onUndo={() => { onUndoManualReview?.(); setGrade(null); }} onDismiss={() => onDismissManualReview?.()} onHold={onHoldManualReview} onRelease={onReleaseManualReview} />
                </div>
              )}

              {!orderChecked ? (
                <Button onClick={checkOrder}
                  className="continue-glow h-14 w-full rounded-2xl lesson-cta text-sm font-black">
                  {ui("Check word order")} <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              ) : !orderIsCorrect ? (
                <div className="flex gap-3">
                  <Button onClick={retryOrder} variant="outline"
                    className="h-12 flex-1 rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                    <RotateCcw className="mr-2 h-4 w-4" /> {ui("Shuffle again")}
                  </Button>
                  <Button onClick={advanceOrFinish}
                    className="app-skip-button h-12 flex-1 rounded-2xl font-black">
                    {ui("Skip")}
                  </Button>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}

        {/* FRENCH phase (companion language) */}
        {phase === "French" && (
          <motion.div key="french" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">{ui("Now type the same sentence in French.")}</p>
            <div className="space-y-3">
              <motion.div animate={shakeControls}>
                <div className={cn("fs-panel",
                  frChecked && frResult.ok && "is-good",
                  frChecked && !frResult.ok && "is-bad")}>
                  <div className="fs-prompt">
                    <span>FR</span>
                    <strong>{ui("Type in French")}</strong>
                  </div>
                  <Input ref={frInputRef}
                    className="fs-input"
                    placeholder="Type it in French..."
                    autoFocus
                    spellCheck={false}
                    value={frInput}
                    onChange={e => { setFrInput(e.target.value); if (frChecked) setFrChecked(false); }}
                    onKeyDown={e => e.key === "Enter" && (frChecked && frResult.ok ? onNext() : checkFrAnswer())}
                    disabled={frChecked && frResult.ok}
                  />
                  <button type="button" className="fs-check" onClick={frChecked && frResult.ok ? onNext : checkFrAnswer}>
                    <span className="fs-check-label">{frChecked && frResult.ok ? ui("Done") : ui("Check")}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
              <FrenchCharBar onInsert={c => insertAt(frInputRef.current, c, setFrInput)} />
            </div>
            <AnimatePresence>
              {frChecked && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={cn("rounded-lg border p-5 text-center space-y-2",
                    frResult.ok ? "border-emerald-500/20 bg-emerald-500/10" : "border-rose-500/20 bg-rose-500/10")}>
                  {frResult.ok ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold text-lg">
                      <CheckCircle2 className="h-5 w-5" /> {frResult.spellingNote ? "Close — mind the accents" : "Parfait !"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-rose-700 font-semibold">{ui("Not quite")}</div>
                      <div className="text-xs text-zinc-500">{ui("French:")} <span className="text-zinc-950 font-semibold">{item.fr}</span></div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {frChecked && !frResult.ok ? (
              <div className="space-y-2">
                <Button onClick={retryFr} variant="outline"
                  className="h-12 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
                </Button>
                <div className="fs-hint">{ui("Write it out to carry on — the answer is above.")}</div>
              </div>
            ) : (
              <div className="fs-hint"><kbd>↵</kbd> {ui("Press Enter when you are ready.")}</div>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}

        {/* MEMORY phase — recall both sentences without prompts */}
        {phase === "Memory" && (
          <motion.div key="memory" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            <p className="text-center text-sm font-semibold text-zinc-500">
              Recall both sentences from memory. Press Hint if you're stuck.
            </p>
            <div className="space-y-3">
              {/* German recall input */}
              <div className="space-y-1.5">
                <div className="flex items-center pl-1">
                  <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400">{ui("German")}</p>
                </div>
                <motion.div animate={shakeControls}>
                  <Input ref={memDeRef}
                    className={cn(
                      "h-14 rounded-2xl border-zinc-200 bg-white px-4 text-center text-base font-bold text-zinc-950 transition-all placeholder:text-zinc-400",
                      memDeChecked && memDeResult.ok  ? "border-emerald-300 bg-emerald-50" :
                      memDeChecked && !memDeResult.ok ? "border-rose-300 bg-rose-50" :
                                                        "focus:border-[var(--accent)]"
                    )}
                    placeholder="Type the German sentence..."
                    spellCheck={false}
                    value={memDeInput}
                    onChange={e => { setMemDeInput(e.target.value); if (memDeChecked) { setMemDeChecked(false); setMemFrChecked(false); } }}
                    onKeyDown={e => e.key === "Enter" && memFrRef.current?.focus()}
                    disabled={memDeChecked && memDeResult.ok && memFrChecked && memFrResult.ok}
                  />
                </motion.div>
                <CharBar onInsert={c => insertAt(memDeRef.current, c, setMemDeInput)} />
                {!(memDeChecked && memDeResult.ok) && (
                  <RecallHelp key={`${item.id}-memory-de-${step}`} answer={item.de} />
                )}
              </div>
              {/* French recall input */}
              <div className="space-y-1.5">
                <div className="flex items-center pl-1">
                  <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400">{ui("French")}</p>
                </div>
                <Input ref={memFrRef}
                  className={cn(
                    "h-14 rounded-2xl border-zinc-200 bg-white px-4 text-center text-base font-bold text-zinc-950 transition-all placeholder:text-zinc-400",
                    memFrChecked && memFrResult.ok  ? "border-emerald-300 bg-emerald-50" :
                    memFrChecked && !memFrResult.ok ? "border-rose-300 bg-rose-50" :
                                                      "focus:border-[var(--accent)]"
                  )}
                  placeholder="Type the French sentence..."
                  spellCheck={false}
                  value={memFrInput}
                  onChange={e => { setMemFrInput(e.target.value); if (memFrChecked) { setMemDeChecked(false); setMemFrChecked(false); } }}
                  onKeyDown={e => e.key === "Enter" && (!memDeChecked ? checkMemory() : undefined)}
                  disabled={memDeChecked && memDeResult.ok && memFrChecked && memFrResult.ok}
                />
                <FrenchCharBar onInsert={c => insertAt(memFrRef.current, c, setMemFrInput)} />
                {!(memFrChecked && memFrResult.ok) && (
                  <RecallHelp key={`${item.id}-memory-fr-${step}`} answer={item.fr ?? ""} />
                )}
              </div>
            </div>

            {/* Feedback */}
            <AnimatePresence>
              {(memDeChecked || memFrChecked) && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="space-y-2">
                  <div className={cn("rounded-lg border p-3 text-sm space-y-1",
                    memDeResult.ok ? "border-emerald-500/20 bg-emerald-500/10" : "border-rose-500/20 bg-rose-500/10")}>
                    <div className="flex items-center gap-2 font-semibold">
                      {memDeResult.ok
                        ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">{ui("German correct")}</span></>
                        : <><X className="h-4 w-4 text-rose-600" /><span className="text-rose-700">{ui("German")}: <span className="text-zinc-950">{item.de}</span></span></>}
                    </div>
                  </div>
                  <div className={cn("rounded-lg border p-3 text-sm space-y-1",
                    memFrResult.ok ? "border-emerald-500/20 bg-emerald-500/10" : "border-rose-500/20 bg-rose-500/10")}>
                    <div className="flex items-center gap-2 font-semibold">
                      {memFrResult.ok
                        ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">{ui("French correct")}</span></>
                        : <><X className="h-4 w-4 text-rose-600" /><span className="text-rose-700">{ui("French:")} <span className="text-zinc-950">{item.fr}</span></span></>}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            {memDeChecked && !(memDeResult.ok && memFrResult.ok) ? (
              <div className="space-y-2">
                <Button onClick={retryMemory} variant="outline"
                  className="h-14 w-full rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> {ui("Try again")}
                </Button>
                <div className="fs-hint">{ui("Write it out to carry on — the answer is above.")}</div>
              </div>
            ) : (
              <Button onClick={memDeChecked && memDeResult.ok && memFrResult.ok ? onNext : checkMemory}
                className="continue-glow h-14 w-full rounded-2xl lesson-cta text-sm font-black">
                {memDeChecked && memDeResult.ok && memFrResult.ok
                  ? <>{ui("Done")} <ArrowRight className="ml-2 h-5 w-5" /></>
                  : "Check both"}
              </Button>
            )}
            <button type="button" onClick={goBack} className="w-full text-center text-xs font-semibold text-zinc-400 transition-colors hover:text-[var(--accent)]">{ui("← Back")}</button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Section
function DialogueExercise({ dialogue, onNext, onGradeItem, onReviewLevel, onSnooze, onAnswer, markedLevels, onClearMark }: { dialogue: any; onNext: () => void; onGradeItem?: (itemId: string, grade: "know" | "struggle") => void; onReviewLevel?: (itemId: string, level: GuidedReviewLevel) => void; onSnooze?: (itemId: string, days: number) => void; onAnswer?: (correct: boolean) => void; markedLevels?: Record<string, GuidedReviewLevel>; onClearMark?: (itemId: string) => void }) {
  const lines: any[] = dialogue?.lines ?? [];
  const [lineIdx, setLineIdx] = useState(0);
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const missingLineHandled = useRef(false);
  const line = lines[lineIdx];
  const isLast = lineIdx >= lines.length - 1;
  const sides = courseSides();
  const learnEn = sides.target.code === "en";
  const learnFr = sides.target.code === "fr";
  const learnPl = sides.target.code === "pl";
  const learnEs = sides.target.code === "es";
  const learnIt = sides.target.code === "it";
  const learnPt = sides.target.code === "pt";
  const learnRu = sides.target.code === "ru";
  const learnEl = sides.target.code === "el";
  const learnSq = sides.target.code === "sq";
  // The alphabet a Russian or Greek line is read in, which the Greek and
  // Russian matchers read too — see the same hook in the lesson.
  const courseScriptKey = useCourseScript();
  const result = useMemo(
    () => learnFr
      ? matchFrenchSentence(input, line?.de ?? "")
      : learnPl
        ? matchPolishSentence(input, line?.de ?? "")
        : learnEs
          ? matchSpanishSentence(input, line?.de ?? "")
          : learnIt
            ? matchItalianSentence(input, line?.de ?? "")
          : learnPt
            ? matchPortugueseSentence(input, line?.de ?? "")
          : learnRu
            ? matchRussianSentence(input, line?.de ?? "")
          : learnEl
            ? matchGreekSentence(input, line?.de ?? "")
          : learnSq
            ? matchAlbanianSentence(input, line?.de ?? "")
          : learnEn
            ? matchEnglish(input, line?.de ?? "")
            : matchLearningModeGermanAnswer(input, { de: line?.de ?? "", long: line?.long }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, learnEn, learnFr, learnPl, learnEs, learnIt, learnPt, learnRu, learnEl, learnSq, line, courseScriptKey]
  );
  // A German speaker learning English hears this on every stage, so it has to
  // honour their British/American choice — it was pinned to American, which
  // made the setting look broken to anyone who picked British.
  const targetLang = sides.target.voice;
  // The companion is the SECOND language beside German. It has nothing to
  // offer a course whose first language is already French.
  const companionFr = useMemo(() => getCompanion() === "fr" && sides.target.code === "de", [sides.target.code]);

  useEffect(() => {
    if (line?.de) lessonSpeak(line.de, 0.88, targetLang);
  }, [line?.de, targetLang]);
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [lineIdx]);
  useEffect(() => {
    if (line) {
      missingLineHandled.current = false;
      return;
    }
    if (missingLineHandled.current) return;
    missingLineHandled.current = true;
    onNext();
  }, [line, onNext]);

  const checkLine = () => {
    if (!input.trim() || checked) return;
    setChecked(true);
    onAnswer?.(result.ok);
    lessonSpeak(line?.de ?? "", 0.88, targetLang);
    if (result.ok) setTimeout(nextLine, 900);
  };

  const nextLine = () => {
    if (isLast) { onNext(); return; }
    setLineIdx(i => i + 1);
    setInput("");
    setChecked(false);
  };

  useEffect(() => {
    if (line && !checked && input.trim() && result.ok && !result.spellingNote) checkLine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const lineGradeId = line?.id ?? `dialogue-${dialogue?.title ?? "line"}-${lineIdx}-${line?.de ?? ""}`;
  const markKnown = () => {
    onGradeItem?.(lineGradeId, "know");
    nextLine();
  };
  // Same toggle as the sentence exercise: the button shows the mark that is
  // standing, and pressing it while lit takes that mark off.
  const isStruggling = markedLevels?.[lineGradeId] === "struggle";
  const markStruggle = () => {
    if (isStruggling) {
      onClearMark?.(lineGradeId);
      return;
    }
    onGradeItem?.(lineGradeId, "struggle");
  };
  const skipLine = () => {
    // Skipping should unblock the learner without pretending the line was
    // known. Keep it in the short-term review queue, then move straight on.
    onGradeItem?.(lineGradeId, "struggle");
    onAnswer?.(false);
    nextLine();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!line) return;
      // The answer box keeps focus permanently now, so Alt combos must work
      // while "typing" — Alt+K/S never inserts a character anyway.
      if (!event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        markKnown();
      }
      if (key === "s") {
        event.preventDefault();
        markStruggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lineGradeId, onGradeItem, isStruggling, onClearMark]);

  if (!line) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full max-w-2xl">
      <div className="text-center space-y-1">
        <Badge variant="outline" className="dialogue-title-badge rounded-full px-5 py-2 text-base font-black uppercase tracking-[0.14em]">
          <MessageSquareQuote className="mr-2 h-5 w-5" /> {dialogue.title}
        </Badge>
        <div className="text-xs font-black tracking-wide text-zinc-500">{lineIdx + 1} / {lines.length}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {onReviewLevel ? (
            <ReviewLevelPicker
              knownAriaLabel="Mark known and skip this line. Shortcut Alt K"
              onKnown={markKnown}
              onSelect={(level) => onReviewLevel(lineGradeId, level)}
              onSnooze={onSnooze && ((days) => onSnooze(lineGradeId, days))}
              showShortcut
            />
          ) : (
            <button
              aria-label="Mark known and skip this line. Shortcut Alt K"
              className="grade-btn grade-btn-known"
              onClick={markKnown}
              type="button"
            >
              {ui("Know it")}
              <kbd className="grade-kbd">Alt K</kbd>
            </button>
          )}
          <button
            aria-label={ui(isStruggling
              ? "Marked as a struggle. Press to take the mark off. Shortcut Alt S"
              : "Mark this line as a struggle. Shortcut Alt S")}
            aria-pressed={isStruggling}
            className={cn("grade-btn grade-btn-struggle", isStruggling && "is-marked")}
            onClick={markStruggle}
            type="button"
          >
            {ui(isStruggling ? "Struggling" : "Struggle")}
            <kbd className="grade-kbd">Alt S</kbd>
          </button>
        </div>
      </div>

      {/* Conversation so far */}
      <div className="space-y-3 max-h-48 overflow-y-auto">
        {lines.slice(0, lineIdx).map((l: any, i: number) => (
          <div key={i} className={cn("flex gap-3", l.speaker === "B" && "flex-row-reverse")}>
            <div className="h-7 w-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[10px] font-black text-zinc-500 shrink-0">{l.speaker}</div>
            <div className={cn("max-w-[70%] rounded-2xl px-4 py-2.5 space-y-0.5",
              l.speaker === "A" ? "bg-white border border-zinc-200" : "bg-zinc-50 border border-zinc-200")}>
              <div className="text-sm font-black tracking-tight text-zinc-950"><CourseText code={targetLang} text={l.de} /></div>
              {companionFr && l.fr && <div className="text-sm font-black tracking-tight text-[var(--accent)]">{l.fr}</div>}
              <div className="text-xs font-semibold text-zinc-500">{l.en}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Current line to type */}
      <div className="rounded-[24px] border border-zinc-200 bg-white p-6 space-y-4 shadow-[0_14px_34px_rgba(25,27,38,0.06)]">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-[11px] font-black text-[var(--accent)] shrink-0">{line.speaker}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-zinc-400">
              {uiFmt("Type this in {language}", { language: ui(sides.target.label) })}
            </p>
            <div className="mt-0.5 text-xl font-black leading-tight tracking-tight text-zinc-950 sm:text-2xl">{line.en}</div>
            <div className="mt-1.5">
              {/* Register is read off the German — see the note on the other
                  UsageChips. A French line keeps it in originalDe. */}
              <UsageChips de={learnFr ? String(line.originalDe ?? "") : learnEn ? line.en : line.de} />
            </div>
            {companionFr && line.fr && (
              <div className="mt-1 text-sm font-black tracking-tight text-[var(--accent)]">
                <span className="mr-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-400">FR</span>
                {line.fr}
              </div>
            )}
          </div>
          <button onClick={() => tts(line.de, 0.88, targetLang)}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-600 shadow-[inset_0_0_0_1px_#e4e4e7] transition-colors hover:bg-zinc-50 hover:text-zinc-950">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
        <Input ref={inputRef}
          className={cn("h-14 rounded-2xl border-zinc-200 bg-white px-5 text-base font-bold text-zinc-950 transition-all placeholder:text-zinc-400",
            checked && result.ok ? "border-emerald-500/40" : checked ? "border-rose-500/40" : "focus:border-[var(--accent)]")}
          placeholder="Type this line..."
          spellCheck={false}
          value={input}
          onChange={e => { setInput(e.target.value); if (checked) setChecked(false); }}
          onKeyDown={e => e.key === "Enter" && (checked && result.ok ? nextLine() : checkLine())}
          disabled={checked && result.ok}
        />
        {/* The Cyrillic and Greek rows go with their alphabet, as in AccentRow. */}
        {courseShowsNative(sides.target.code) && (
          <AccentKeys language={sides.target.code} onInsert={c => insertAt(inputRef.current, c, setInput)} />
        )}
        {!(checked && result.ok) && (
          <RecallHelp key={`${lineGradeId}-dialogue`} answer={showCourseText(targetLang, line.de)} />
        )}
      </div>

      <AnimatePresence>
        {checked && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn("rounded-2xl border p-4 text-center",
              result.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-rose-500/20 bg-rose-500/10 text-rose-700")}>
            {result.ok ? <span className="text-sm font-black">{ui("Spot on!")}</span>
              : <div className="space-y-1">
                  <div className="text-sm font-black">
                    {result.capitalizationError
                      ? capitalLetterHint(targetLang)
                      : ui("Not quite")}
                  </div>
                  <div className="text-xs font-bold text-zinc-500"><CourseText code={targetLang} text={line.de} /></div>
                </div>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3">
        {checked && !result.ok && (
          <Button onClick={() => { setInput(""); setChecked(false); }} variant="outline"
            className="flex-1 h-14 rounded-2xl border-zinc-200 bg-white font-black text-zinc-700 hover:bg-zinc-50">
            <RotateCcw className="mr-2 h-4 w-4" /> Retry
          </Button>
        )}
        {!(checked && result.ok) && (
          <Button
            aria-label="Skip this line for now and keep it in practice"
            className="dialogue-skip-action h-14 rounded-2xl text-sm font-black"
            onClick={skipLine}
            type="button"
            variant="outline"
          >
            <SkipForward className="mr-2 h-4 w-4" /> {ui("Skip for now")}
          </Button>
        )}
        <Button onClick={checked && result.ok ? nextLine : checkLine}
          className={cn(
            "dialogue-primary-action h-14 rounded-2xl text-sm font-black",
            checked && "col-span-2"
          )}>
          {checked && result.ok ? (isLast ? "Done" : "Next line") : ui("Check")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

// Section
const CONFETTI_COLORS = ["#7834f7", "#a177ff", "#46d59a", "#ffd233", "#ff8528"];

/** One-shot confetti burst — pure framer-motion, no extra deps. Skipped for reduced-motion. */
function Confetti({ count = 40 }: { count?: number }) {
  const reduce = useReducedMotion() || effectsReduced();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (Math.random() * 2 - 1) * 280,
        y: 140 + Math.random() * 260,
        rot: (Math.random() * 2 - 1) * 540,
        delay: Math.random() * 0.2,
        dur: 1.5 + Math.random() * 1.1,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 8,
      })),
    [count]
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center overflow-visible" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0"
          style={{ width: p.w, height: p.h, backgroundColor: p.color, borderRadius: 2 }}
          initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], x: p.x, y: p.y, rotate: p.rot, scale: 1 }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.2, 0.6, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

// Section
/**
 * A single Sie-or-du situation question, shown at the end of a lesson that
 * taught a register-committing sentence.
 *
 * Getting it wrong is not punished — no XP loss, no repeat drilling. The point
 * is the explanation underneath, which is shown either way; a wrong answer just
 * brings the question back in a few days instead of a few months.
 */
function RegisterCheck({ question, onAnswer, onNext }: any) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === question.answer;

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    const isCorrect = i === question.answer;
    onAnswer?.(question.id, isCorrect);
    if (isCorrect) window.setTimeout(onNext, 1200);
  };

  return (
    <div className="fs-card-body w-full space-y-6 py-8">
      <div className="space-y-2 text-center">
        <span className="fs-when-label">{ui("Quick check")}</span>
        <p className="text-2xl font-semibold leading-snug tracking-tight">{question.prompt}</p>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        {question.options.map((opt: string, i: number) => {
          const isAnswer = i === question.answer;
          const state = !answered ? "idle" : isAnswer ? "right" : i === picked ? "wrong" : "muted";
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => choose(i)}
              className={
                "rounded-xl border-2 px-5 py-4 text-left text-base font-medium transition " +
                (state === "idle"
                  ? "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50"
                  : state === "right"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : state === "wrong"
                  ? "border-rose-400 bg-rose-50 text-rose-900"
                  : "border-zinc-100 text-zinc-400")
              }
            >
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-md space-y-4"
        >
          <p className="text-sm font-semibold">
            {correct ? ui("That's it.") : ui("Worth knowing:")}
          </p>
          <p className="text-sm leading-relaxed text-zinc-600">{question.explain}</p>
          {!correct && (
            <Button onClick={onNext} className="h-12 w-full rounded-lg text-sm font-semibold">
              {ui("Got it")} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}

const AUTO_FINISH_DELAY_MS = 2600;

function CompleteScreen({ onNext }: { onNext: () => void }) {
  // Auto-finish: the celebration plays, then the lesson closes itself and the
  // next one is queued up after the 2.6-second celebration — no "Finish"
  // press needed. Any key/click skips the wait, and the button stays for
  // anyone who reaches for it.
  const done = useRef(false);
  const [secondsRemaining, setSecondsRemaining] = useState(() => Math.ceil(AUTO_FINISH_DELAY_MS / 1000));
  const finish = () => { if (!done.current) { done.current = true; onNext(); } };
  useEffect(() => {
    const deadline = Date.now() + AUTO_FINISH_DELAY_MS;
    const updateCountdown = () => {
      setSecondsRemaining(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
    };
    const t = setTimeout(finish, AUTO_FINISH_DELAY_MS);
    const countdownTimer = window.setInterval(updateCountdown, 100);
    const skip = () => { clearTimeout(t); clearInterval(countdownTimer); finish(); };
    window.addEventListener("keydown", skip);
    window.addEventListener("mousedown", skip);
    return () => {
      clearTimeout(t);
      clearInterval(countdownTimer);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("mousedown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative w-full max-w-xl space-y-7 py-10 text-center"
    >
      <Confetti />

      {/* Springy success mark with an expanding ring */}
      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: "var(--accent)" }}
          initial={{ scale: 0.2, opacity: 0.4 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
        <motion.div
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 13, delay: 0.05 }}
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: "var(--accent)", boxShadow: "0 12px 34px rgba(120,52,247,0.45)" }}
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.25, 1] }}
            transition={{ delay: 0.22, duration: 0.4, ease: "easeOut" }}
          >
            <CheckCircle2 className="h-11 w-11 text-white" />
          </motion.span>
        </motion.div>
      </div>

      <div className="space-y-2">
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-4xl font-black tracking-tight text-zinc-950"
        >
          Lesson complete!
        </motion.div>
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm font-semibold text-zinc-500"
        >
          Nice work — that's another one in the bank. 🎉
        </motion.div>
        <div className="text-xs font-semibold text-zinc-500" aria-live="polite" aria-atomic="true">
          {uiFmt("Starting your next lesson in {seconds}…", { seconds: secondsRemaining })}
        </div>
      </div>

      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}>
        <Button
          onClick={onNext}
          className="continue-glow h-12 w-full rounded-2xl bg-zinc-950 text-sm font-black text-white hover:bg-zinc-800"
        >
          Finish <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </motion.div>
    </motion.div>
  );
}

// Section
type SessionPreviewCard = {
  id: string;
  /** The language being learned — item.de, whichever language that now is. */
  target: string;
  /** What it means, in the learner's own language — item.en after the swap. */
  meaning: string;
  /** What the meaning line is really in — see meaningLineFor. */
  meaningCode: CourseLanguage;
  use?: string;
  review: boolean;
  /** The pack's CEFR label, carried so the card can show what level this is. */
  level?: string;
};

function buildSessionPreviewCards(steps: any[]): SessionPreviewCard[] {
  const sides = courseSides();
  const englishVariant = getEnglishVariant();
  const seen = new Set<string>();
  const cards: SessionPreviewCard[] = [];

  for (const step of steps) {
    if (step?.type !== "sentence" || !step.item) continue;
    // The swap has already run, so the target is item.de and the meaning is
    // item.en in every course. The spelling variant applies to whichever of
    // the two is English, which is not always the same one.
    const rawTarget = String(step.item.de ?? "").trim();
    const rawMeaning = String(step.item.en ?? "").trim();
    const target = sides.target.code === "en" ? formatEnglishText(rawTarget, englishVariant) : rawTarget;
    const meaningCode: CourseLanguage = step.item?.meaningCode ?? sides.meaning.code;
    const meaning = meaningCode === "en" ? formatEnglishText(rawMeaning, englishVariant) : rawMeaning;
    if (!target || !meaning) continue;
    const keys = matchingVisibleKeys(target, meaning);
    if (keys.length !== 2 || keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    const key = keys.join("\u0000");
    cards.push({
      id: String(step.item.id ?? key),
      target,
      meaning,
      meaningCode,
      use: step.item.use ? formatEnglishText(step.item.use, englishVariant) : step.item.use,
      review: Boolean(step.review),
      level: step.item.level,
    });
    if (cards.length === 6) break;
  }

  return cards;
}

/**
 * The two faces of a flip card, turning on the Y axis.
 *
 * Both faces are always in the DOM and hidden by backface-visibility rather
 * than swapped on a timer — that is what makes the turn continuous instead of
 * a fade with a gap in the middle. The back is laid over the front absolutely
 * so the card keeps one height and nothing jumps as it turns.
 */
function FlipFace({ back, flipped, front, onFlip }: {
  back: React.ReactNode;
  flipped: boolean;
  front: React.ReactNode;
  onFlip: () => void;
}) {
  const reduceMotion = useReducedMotion() || effectsReduced();
  return (
    <div
      aria-live="polite"
      className="fs-flashcard-flip"
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        onFlip();
      }}
      role="button"
      style={{ cursor: "pointer", perspective: 1400 }}
      tabIndex={0}
      title={ui("Click or press space to flip")}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        initial={false}
        style={{ position: "relative", transformStyle: "preserve-3d" }}
        transition={reduceMotion
          ? { duration: 0 }
          : { duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={{ backfaceVisibility: "hidden" }}>{front}</div>
        <div
          style={{
            backfaceVisibility: "hidden",
            inset: 0,
            position: "absolute",
            transform: "rotateY(180deg)",
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}

function SessionFlashcardPreview({
  cards,
  index,
  onIndexChange,
  onKnown,
  onReviewLevel,
  onSnooze,
  notice,
  onUndoNotice,
  onDismissNotice,
  onSkip,
  onStart,
}: {
  cards: SessionPreviewCard[];
  index: number;
  onIndexChange: (index: number) => void;
  onKnown: (itemId: string) => void;
  onReviewLevel?: (itemId: string, level: GuidedReviewLevel) => void;
  onSnooze?: (itemId: string, days: number) => void;
  /** The preview is the intro, where the floating toast is suppressed, so it
   *  has to show the "put off" notice itself or Undo is nowhere. */
  notice?: { label: string; note: string; subject?: string } | null;
  onUndoNotice?: () => void;
  onDismissNotice?: () => void;
  onSkip: () => void;
  onStart: () => void;
}) {
  const card = cards[Math.min(index, cards.length - 1)];
  const isLast = index === cards.length - 1;
  const sides = courseSides();

  // One way in for every bit of speech on this screen. tts() already no-ops
  // when muted and stops whatever was playing, so rapid taps don't stack.
  const speak = (text: string, lang: string) => {
    if (!text) return;
    void tts(text, 0.82, lang).catch(() => {
      /* a missing voice must never break the card */
    });
  };

  const [mode, setMode] = useState<FlashcardMode>(getFlashcardMode);
  const [face, setFace] = useState<FlashcardFace>(getFlashcardFace);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const sync = () => {
      setMode(getFlashcardMode());
      setFace(getFlashcardFace());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === FLASHCARD_MODE_KEY || event.key === FLASHCARD_FACE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(FLASHCARD_MODE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FLASHCARD_MODE_EVENT, sync);
    };
  }, []);

  // A new card always starts face down. Carrying the flip over would show the
  // answer to a phrase you have not been asked about yet.
  useEffect(() => { setFlipped(false); }, [card?.id, mode, face]);

  const toggleFlip = () => setFlipped((current) => !current);

  // In "both" mode the language being learned is spoken on sight. On a flip
  // card that would give the answer away before the learner has tried, so it
  // only speaks the side actually facing them — and it speaks the TARGET
  // language, which for a German speaker learning English is the English.
  useEffect(() => {
    const spoken = card?.target;
    if (!spoken) return;
    const showingTarget = mode !== "flip"
      ? true
      : face === "target" ? !flipped : flipped;
    if (!showingTarget) return;
    const timer = window.setTimeout(() => speak(spoken, sides.target.voice), 180);
    return () => window.clearTimeout(timer);
  }, [card?.id, card?.target, sides.target.voice, mode, face, flipped]);

  // In the two-language layout the sentence remains a generous speech target.
  // On a flip card, a sentence click belongs to the card itself; the dedicated
  // speaker button remains available without accidentally revealing the back.
  const languageRow = (label: string, text: string, lang: string, htmlLang: string) => (
    <div className="fs-flashcard-language">
      <div
        onClick={mode === "both" ? (event) => { event.stopPropagation(); speak(text, lang); } : undefined}
        onKeyDown={(event) => {
          if (mode === "both" && event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            speak(text, lang);
          }
        }}
        role={mode === "both" ? "button" : undefined}
        style={{ cursor: mode === "both" ? "pointer" : "inherit" }}
        tabIndex={mode === "both" ? 0 : undefined}
        title={mode === "both" ? ui("Tap to hear it") : undefined}
      >
        <span>{ui(label)}</span>
        <strong lang={htmlLang}><CourseText code={htmlLang} text={text} /></strong>
      </div>
      <button
        type="button"
        aria-label={`${ui("Hear it")}: ${text}`}
        onClick={(event) => { event.stopPropagation(); speak(text, lang); }}
      >
        <Volume2 className="h-5 w-5" />
      </button>
    </div>
  );
  // "Target" means the language being LEARNED, which is not always German. A
  // German speaker learning English was shown the German side first with the
  // English hidden behind the flip — the card testing her on her own language.
  const targetRow = () => languageRow(sides.target.label, card.target, sides.target.voice, sides.target.htmlLang);
  const meaningSide = courseSide(card.meaningCode);
  const meaningRow = () => languageRow(meaningSide.label, card.meaning, meaningSide.voice, meaningSide.htmlLang);
  const frontSide = face === "target" ? targetRow() : meaningRow();
  const backSide = face === "target" ? meaningRow() : targetRow();

  const previous = () => onIndexChange(Math.max(0, index - 1));
  const next = () => {
    if (isLast) onStart();
    else onIndexChange(index + 1);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While the level menu is open its own keys win. Space on a focused
      // option would otherwise flip the card instead of choosing the level.
      if (event.target instanceof Element && event.target.closest(".fs-review-level")) return;
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        previous();
      }
      // Space turns the card over. Checked before Enter/ArrowRight so it can
      // never double as "next" and skip the card you were about to answer.
      if (event.key === " " && mode === "flip") {
        event.preventDefault();
        toggleFlip();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, isLast, mode, flipped]);

  return (
    <div className="fs-card-body fs-preview">
      <div className="fs-preview-head">
        <div className="fs-preview-heading-copy">
          <span className="fs-eyebrow"><i />{ui("Lesson preview")}</span>
          <h1 className="fs-h1">{ui("Meet today's phrases")}</h1>
          <p className="fs-sub">{ui("Review both languages before sentence practice.")}</p>
          {/*
            How the sitting was put together, beside what is in it.

            Listen and Continue learning each have their own order, both
            offering a choice called Conversation order, and neither the
            lesson nor the preview said which one built the sitting in front
            of you — so an order set in one place and expected in the other
            looks exactly like an order that does not work. The row already
            says how many phrases and which languages; how they were chosen
            belongs in the same breath.
          */}
          <div className="fs-preview-summary" aria-label={ui("Lesson preview")}>
            <span><BookOpen className="h-4 w-4" />{cards.length} {ui("Phrases")}</span>
            <span><Languages className="h-4 w-4" />{ui(sides.target.label)} + {ui(sides.meaning.label)}</span>
            <span><ListChecks className="h-4 w-4" />{ui(SITTING_ORDER_LABELS[getSittingOrder()])}</span>
          </div>
        </div>
        <span className="fs-preview-count">
          {index + 1} <small>{ui("of")} {cards.length}</small>
        </span>
      </div>

      {notice && (
        <div className="fs-standalone-note">
          <ManualReviewNote grade={null} notice={notice} onUndo={onUndoNotice} onDismiss={onDismissNotice} />
        </div>
      )}

      <div className="fs-preview-route" aria-label={ui("Flashcard progress")}>
        {cards.map((item, cardIndex) => (
          <button
            key={item.id}
            type="button"
            aria-label={`${ui("Flashcard")} ${cardIndex + 1}`}
            aria-current={cardIndex === index ? "step" : undefined}
            className={cn(
              cardIndex === index && "is-active",
              cardIndex < index && "is-seen"
            )}
            onClick={() => onIndexChange(cardIndex)}
          >
            {cardIndex + 1}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={card.id}
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -26 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn("fs-flashcard", mode === "flip" && "is-flippable")}
          onClick={mode === "flip" ? toggleFlip : undefined}
          title={mode === "flip" ? ui("Click or press space to flip") : undefined}
        >
          <div className="fs-flashcard-topline">
            <div className="fs-flashcard-badges">
              <div className="fs-flashcard-badge">
                {ui(card.review ? "Review phrase" : "New phrase")}
              </div>
              <CefrBadge level={card.level} />
            </div>
            {/* Both of these stop the click reaching the card, which would
                otherwise flip it while you were choosing. */}
            <span className="fs-flashcard-grade" onClick={(event) => event.stopPropagation()}>
              {onReviewLevel ? (
                <ReviewLevelPicker
                  onKnown={() => onKnown(card.id)}
                  onSelect={(level) => onReviewLevel(card.id, level)}
                  onSnooze={onSnooze && ((days) => onSnooze(card.id, days))}
                  variant="flashcard"
                />
              ) : (
                <button
                  type="button"
                  className="fs-flashcard-known"
                  onClick={() => onKnown(card.id)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {ui("Know it")}
                </button>
              )}
            </span>
          </div>

          <div className="fs-flashcard-content">
            {mode === "flip" ? (
              <FlipFace
                back={backSide}
                flipped={flipped}
                front={frontSide}
                onFlip={toggleFlip}
              />
            ) : (
              <>
                {targetRow()}
                <div className="fs-flashcard-divider" aria-hidden>
                  <span>{ui("means")}</span>
                </div>
                {meaningRow()}
              </>
            )}
          </div>

          {/* The usage note explains the answer, so on a flip card it waits
              until the card has actually been turned over. */}
          {card.use && (mode !== "flip" || flipped) && (
            <p className="fs-flashcard-note">{usageNote(card.use)}</p>
          )}

          <div className="fs-flashcard-footer">
            {mode === "flip" ? <RotateCcw className="h-4 w-4" /> : <Languages className="h-4 w-4" />}
            <span>{ui(mode === "flip" ? "Click or press space to flip" : "Both languages")}</span>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="fs-preview-actions">
        <button
          type="button"
          onClick={previous}
          disabled={index === 0}
          className="fs-preview-back"
        >
          <ChevronLeft className="h-4 w-4" />
          {ui("Previous")}
        </button>
        <div className="fs-preview-primary-actions">
          <button type="button" onClick={onSkip} className="fs-preview-skip">
            <SkipForward className="h-4 w-4" />
            {ui("Skip preview")}
          </button>
          <button type="button" onClick={next} className="fs-preview-next">
            {/* Where the last flashcard leads depends on what follows it: the
                matching round, unless this sitting has a single card and
                there is nothing to match it against. */}
            {ui(isLast ? (cards.length > 1 ? "Start matching" : "Start sentence practice") : "Next flashcard")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Which column is read first — the meaning, or the language being learned. */
type MatchDirection = "meaning-target" | "target-meaning";
type MatchingItem = SessionPreviewCard & { matchId: string };

function buildMatchingItems(cards: SessionPreviewCard[]): MatchingItem[] {
  const safeCards = takeMatchingSafe(
    cards,
    cards.length,
    (card) => ({ german: card.target, english: card.meaning })
  );
  return safeCards.map((card, index) => ({
    ...card,
    matchId: `${card.id}-${index}`,
    target: primaryAnswer(card.target),
    meaning: primaryAnswer(card.meaning),
  }));
}

function shuffledMatchTargets(
  items: MatchingItem[],
  direction: MatchDirection,
  // Which pass over the cards this is. The layout is derived from the cards
  // rather than rolled, so a re-render never deals a new board under the
  // cursor — but with a small session the same cards come round again, and
  // without this they would come round in the same two columns, which is a
  // memory test of the layout rather than of the language.
  pass = 0
): MatchingItem[] {
  const shuffled = [...items].sort(
    (a, b) => choiceHash(`match|${direction}|${pass}|${a.matchId}`) - choiceHash(`match|${direction}|${pass}|${b.matchId}`)
  );
  if (
    shuffled.length > 1
    && shuffled.every((item, index) => item.matchId === items[index]?.matchId)
  ) {
    shuffled.push(shuffled.shift()!);
  }
  return shuffled;
}

/**
 * Six pairs at a time. Six fits a phone without scrolling, and it is what the
 * standalone Matcher deals, so the two look like one exercise in two places.
 */
const SESSION_MATCH_BOARD = 6;

/**
 * Matching, on the phrases this session is teaching, for as long as you like.
 *
 * It used to be a gate: every pair on one board, Continue greyed out until the
 * last one landed, and then it was over whether or not you wanted it to be.
 * Both halves of that were wrong. Making it compulsory turned the one warm-up
 * in the session into a lock on the door, and ending it at the last pair took
 * away the thing matching is actually good for — going round again on the same
 * handful of phrases until they come without thinking.
 *
 * So it deals six at a time and refills: clear a board and the next one comes,
 * wrapping back to the start when the session's cards run out, because coming
 * round again for review is the point rather than a shortage. And Continue is
 * always live, so leaving is a decision rather than a reward.
 */
function SessionMatchingPairs({
  cards,
  onAnswer,
  onProgress,
  onComplete,
}: {
  cards: SessionPreviewCard[];
  onAnswer?: (correct: boolean) => void;
  /** Pairs landed on the board in front of you, and how many it holds. */
  onProgress: (matched: number, boardSize: number) => void;
  onComplete: () => void;
}) {
  const items = useMemo(() => buildMatchingItems(cards), [cards]);
  const sides = courseSides();
  // Start from the learner's own language, which is the easier way round —
  // except in the English course, which opened the other way before this and
  // keeps doing so.
  const [direction, setDirection] = useState<MatchDirection>(
    () => learningEnglish() ? "target-meaning" : "meaning-target"
  );
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() => new Set());
  const [wrongIds, setWrongIds] = useState<Set<string>>(() => new Set());
  const [resolving, setResolving] = useState(false);
  // Where in the session's cards this board starts, and how many pairs have
  // been landed on the boards before it.
  const [boardStart, setBoardStart] = useState(0);
  const [cleared, setCleared] = useState(0);
  const resetTimer = useRef<number | undefined>(undefined);
  const refillTimer = useRef<number | undefined>(undefined);

  const boardItems = useMemo(() => {
    if (items.length === 0) return [];
    const size = Math.min(SESSION_MATCH_BOARD, items.length);
    return Array.from({ length: size }, (_, offset) => items[(boardStart + offset) % items.length]);
  }, [items, boardStart]);

  const targetItems = useMemo(
    // The pass number, so a board of the same cards lays out differently the
    // second time round. Integer division rather than boardStart itself, or a
    // session of seven cards would call every board a new pass.
    () => shuffledMatchTargets(boardItems, direction, Math.floor(cleared / Math.max(1, boardItems.length))),
    [boardItems, direction, cleared]
  );
  const readingMeaningFirst = direction === "meaning-target";
  const sourceSide = readingMeaningFirst ? sides.meaning : sides.target;
  const targetSide = readingMeaningFirst ? sides.target : sides.meaning;
  const sourceText = (item: MatchingItem) => readingMeaningFirst ? item.meaning : item.target;
  const targetText = (item: MatchingItem) => readingMeaningFirst ? item.target : item.meaning;
  const boardCleared = boardItems.length > 0 && matchedIds.size === boardItems.length;
  /**
   * Whether a next board exists at all.
   *
   * The refill below advances by a whole board and wraps, which deals the
   * next six of a longer round. A lesson previews at most six cards and the
   * board holds six, so the wrap landed back on nought and re-dealt the very
   * same six — shuffled into new positions, which reads as a new board and is
   * not one. Somebody who had just matched all six was asked to match them
   * again, with the counter behind it saying six pairs so far.
   */
  const moreToDeal = items.length > boardItems.length;

  useEffect(() => {
    onProgress(matchedIds.size, boardItems.length);
  }, [matchedIds, boardItems.length, onProgress]);

  /**
   * A cleared board deals the next one — until the sitting's cards run out,
   * and then the round is done.
   *
   * After a beat either way, so the last pair is seen to land green instead of
   * vanishing under its replacement — the whole board turning over the instant
   * you match reads as having got something wrong.

   */
  useEffect(() => {
    if (!boardCleared || !moreToDeal) return;
    refillTimer.current = window.setTimeout(() => {
      setCleared((total) => total + boardItems.length);
      setBoardStart((start) => (start + boardItems.length) % items.length);
      setMatchedIds(new Set());
      setSourceId(null);
      setTargetId(null);
      setWrongIds(new Set());
    }, 620);
    return () => window.clearTimeout(refillTimer.current);
  }, [boardCleared, boardItems.length, items.length, moreToDeal]);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (refillTimer.current) window.clearTimeout(refillTimer.current);
  }, []);

  const resetRound = (nextDirection: MatchDirection) => {
    if (nextDirection === direction) return;
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    setDirection(nextDirection);
    setSourceId(null);
    setTargetId(null);
    setMatchedIds(new Set());
    setWrongIds(new Set());
    setResolving(false);
  };

  const checkPair = (nextSourceId: string, nextTargetId: string) => {
    if (nextSourceId === nextTargetId) {
      setMatchedIds((current) => {
        const next = new Set(current);
        next.add(nextSourceId);
        return next;
      });
      setSourceId(null);
      setTargetId(null);
      onAnswer?.(true);
      return;
    }

    setWrongIds(new Set([nextSourceId, nextTargetId]));
    setResolving(true);
    onAnswer?.(false);
    resetTimer.current = window.setTimeout(() => {
      setSourceId(null);
      setTargetId(null);
      setWrongIds(new Set());
      setResolving(false);
    }, 650);
  };

  // Every card you touch says itself out loud, in its own language — matching
  // was silent, so the one screen where you meet both sides of a phrase gave
  // you no idea how either of them sounds. tts() already no-ops when muted and
  // cancels whatever was playing, so tapping down a column doesn't stack up.
  const speakCard = (text: string, voice: string) => {
    if (!text) return;
    void tts(text, 0.95, voice).catch(() => {
      /* a missing voice must never block the match itself */
    });
  };

  const selectSource = (matchId: string) => {
    if (resolving || matchedIds.has(matchId)) return;
    const item = items.find((candidate) => candidate.matchId === matchId);
    if (item) speakCard(sourceText(item), sourceSide.voice);
    setSourceId(matchId);
    if (targetId) checkPair(matchId, targetId);
  };

  const selectTarget = (matchId: string) => {
    if (resolving || matchedIds.has(matchId)) return;
    const item = items.find((candidate) => candidate.matchId === matchId);
    if (item) speakCard(targetText(item), targetSide.voice);
    setTargetId(matchId);
    if (sourceId) checkPair(sourceId, matchId);
  };

  /**
   * The whole board is playable from the number row.
   *
   * A digit picks the row it is printed beside, and which column it lands in
   * is whichever one the board is waiting for: with nothing chosen it takes
   * the left, and once the left is chosen it takes the right. So a pair is
   * two presses — the same digit twice when the rows happen to line up, and
   * two different ones when they do not, which is the same rhythm as
   * clicking. Escape puts a half-made pair back.
   *
   * Deliberately no modifier and no focus requirement: this screen has no
   * text field, and a matcher you have to click into before the keys work is
   * one nobody discovers. Anything typed into an input elsewhere is left
   * alone all the same.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const from = event.target as HTMLElement | null;
      if (from && (from.tagName === "INPUT" || from.tagName === "TEXTAREA" || from.isContentEditable)) return;
      if (event.key === "Escape") {
        if (!sourceId && !targetId) return;
        event.preventDefault();
        setSourceId(null);
        setTargetId(null);
        return;
      }
      const row = Number(event.key);
      if (!Number.isInteger(row) || row < 1 || row > boardItems.length) return;
      if (resolving) return;
      const item = sourceId ? targetItems[row - 1] : boardItems[row - 1];
      if (!item || matchedIds.has(item.matchId)) return;
      event.preventDefault();
      if (sourceId) selectTarget(item.matchId);
      else selectSource(item.matchId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardItems, targetItems, sourceId, targetId, resolving, matchedIds]);

  return (
    <div className="fs-card-body fs-matching">
      <div className="fs-matching-head">
        <div>
          <span className="fs-eyebrow"><i />{ui("Quick match")}</span>
          <h1 className="fs-h1">{ui("Match today's phrases")}</h1>
          <p className="fs-sub">{ui("Choose one phrase from each column.")}</p>
          <p className="fs-sub fs-match-keys">{ui("Or use the number keys: one press for the left column, then one for the right. Escape undoes a half-made pair.")}</p>
        </div>

        <div className="fs-match-direction" role="group" aria-label={ui("Matching direction")}>
          <button
            type="button"
            aria-pressed={readingMeaningFirst}
            className={readingMeaningFirst ? "is-active" : undefined}
            onClick={() => resetRound("meaning-target")}
          >
            <span>{sides.meaning.code.toUpperCase()}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>{sides.target.code.toUpperCase()}</span>
            <small>{uiFmt("{from} to {to}", { from: ui(sides.meaning.label), to: ui(sides.target.label) })}</small>
          </button>
          <button
            type="button"
            aria-pressed={!readingMeaningFirst}
            className={!readingMeaningFirst ? "is-active" : undefined}
            onClick={() => resetRound("target-meaning")}
          >
            <span>{sides.target.code.toUpperCase()}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>{sides.meaning.code.toUpperCase()}</span>
            <small>{uiFmt("{from} to {to}", { from: ui(sides.target.label), to: ui(sides.meaning.label) })}</small>
          </button>
        </div>
      </div>

      <div className="fs-match-board">
        <div className="fs-match-column-head">
          <span>{ui(sourceSide.label)}</span>
          <ArrowLeftRight className="h-4 w-4" />
          <span>{ui(targetSide.label)}</span>
        </div>

        <div className="fs-match-grid">
          {boardItems.map((sourceItem, rowIndex) => {
            const targetItem = targetItems[rowIndex];
            const sourceMatched = matchedIds.has(sourceItem.matchId);
            const targetMatched = matchedIds.has(targetItem.matchId);
            return (
              <React.Fragment key={`${direction}-${sourceItem.matchId}`}>
                <button
                  type="button"
                  className={cn(
                    "fs-match-option",
                    sourceId === sourceItem.matchId && "is-selected",
                    sourceMatched && "is-matched",
                    wrongIds.has(sourceItem.matchId) && "is-wrong"
                  )}
                  aria-pressed={sourceId === sourceItem.matchId}
                  disabled={sourceMatched || resolving}
                  onClick={() => selectSource(sourceItem.matchId)}
                >
                  <kbd className="fs-match-key" aria-hidden>{rowIndex + 1}</kbd>
                  <span><CourseText code={sourceSide.code} text={sourceText(sourceItem)} /></span>
                  {sourceMatched && <CheckCircle2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className={cn(
                    "fs-match-option",
                    targetId === targetItem.matchId && "is-selected",
                    targetMatched && "is-matched",
                    wrongIds.has(targetItem.matchId) && "is-wrong"
                  )}
                  aria-pressed={targetId === targetItem.matchId}
                  disabled={targetMatched || resolving}
                  onClick={() => selectTarget(targetItem.matchId)}
                >
                  <kbd className="fs-match-key" aria-hidden>{rowIndex + 1}</kbd>
                  <span><CourseText code={targetSide.code} text={targetText(targetItem)} /></span>
                  {targetMatched && <CheckCircle2 className="h-4 w-4" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="fs-match-footer">
        <div className="fs-match-progress" aria-live="polite">
          <div>
            <strong>
              {boardCleared
                ? (moreToDeal
                  ? ui("Board cleared — here comes the next one")
                  : ui("Board cleared — that is every phrase in this lesson"))
                : `${ui("Matched")} ${matchedIds.size} ${ui("of")} ${boardItems.length}`}
            </strong>
            <span>
              {boardCleared && !moreToDeal
                ? ui("Start sentence practice whenever you are ready.")
                : cleared > 0
                  ? uiFmt("{n} pairs so far. Keep going, or move on whenever you like.", { n: cleared + matchedIds.size })
                  : ui("Keep going as long as you like — move on whenever you want.")}
            </span>
          </div>
          <div className="fs-match-progress-track" aria-hidden>
            <i style={{ width: `${boardItems.length ? (matchedIds.size / boardItems.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="fs-match-actions">
          {/* Never disabled. Leaving is the learner's call, not something the
              board grants once it is finished with them. */}
          <button
            type="button"
            className="fs-preview-next"
            onClick={onComplete}
          >
            {ui("Start sentence practice")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuidedSession({ steps, onComplete, onCancel, onGradeItem, onSetItemStrength, onSetItemPermanent, onUndoGradeItem, onPreviewKnown, onPreviewSwap, onRebuildSitting, onSnoozeItem, onAdvance, onRegisterAnswer, unseenPhrases = 0 }: any) {
  const { speak: petSpeak } = useCodexPets();
  const reduceMotion = useReducedMotion() || effectsReduced();
  const [guidedBackground, setGuidedBackground] = useState<GuidedBackground>(() => getGuidedBackground());
  // The gear beside mute and close: how Continue learning is put together.
  // A sitting is built once, on the way in, so a change here is for the next
  // one — the panel says so rather than pretending to reshuffle this one.
  const [sessionSettingsOpen, setSessionSettingsOpen] = useState(false);
  // The panel hangs under the header, wherever the header ends: measured,
  // because the header's height depends on the window and on Electron's
  // title bar above it, and a fixed offset overlapped it on both counts.
  const sessionHeaderRef = useRef<HTMLElement | null>(null);
  const [sessionSettingsTop, setSessionSettingsTop] = useState(0);
  useEffect(() => {
    if (!sessionSettingsOpen) return undefined;
    const measure = () => setSessionSettingsTop(Math.round((sessionHeaderRef.current?.getBoundingClientRect().bottom ?? 0) + 8));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sessionSettingsOpen]);
  const [guidedCustomBackground, setGuidedCustomBackground] = useState<string | null>(() => getGuidedCustomBackground());
  const [index, setIndex] = useState(0);
  const [previewActive, setPreviewActive] = useState(true);
  // The matching round, between meeting the phrases and producing one.
  const [matchingActive, setMatchingActive] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState(0);
  // The board in front of the learner, not the sitting's whole card list.
  const [matchingBoardSize, setMatchingBoardSize] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lessonNavigatorOpen, setLessonNavigatorOpen] = useState(false);
  const [completedLessonNumbers, setCompletedLessonNumbers] = useState<Set<number>>(() => new Set());
  const [lastManualReviewChange, setLastManualReviewChange] = useState<{
    itemIds: string[];
    label: string;
    note: string;
    /**
     * Where the learner was standing when the mark was made, but only when the
     * mark itself moved them on. Undo uses it to put them back; marks that
     * stay put leave it undefined so undoing them never shifts the lesson.
     */
    returnIndex?: number;
    /**
     * What was marked, in the learner's own words — once the lesson has moved
     * on, "Undo" on its own asks them to remember which card it belonged to.
     */
    subject?: string;
  } | null>(null);
  /**
   * The mark is done and saved; the notice only exists so it can be taken
   * back. Left on screen it becomes furniture — still there three cards
   * later, still offering to undo something the learner has forgotten. It
   * clears itself after a few seconds instead.
   *
   * The countdown does not run while the pointer is over the notice or the
   * keyboard focus is inside it, so it never vanishes from under someone who
   * is reaching for Undo, and moving away restarts the full window rather
   * than resuming a nearly-expired one.
   */
  const [reviewNoticeHeld, setReviewNoticeHeld] = useState(false);
  useEffect(() => {
    if (!lastManualReviewChange) {
      setReviewNoticeHeld(false);
      return undefined;
    }
    if (reviewNoticeHeld) return undefined;
    const timer = window.setTimeout(() => setLastManualReviewChange(null), MANUAL_REVIEW_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [lastManualReviewChange, reviewNoticeHeld]);
  const holdReviewNotice = useCallback(() => setReviewNoticeHeld(true), []);
  const releaseReviewNotice = useCallback(() => setReviewNoticeHeld(false), []);
  /**
   * The mark itself, which outlives the notice about it.
   *
   * The notice is a few seconds of "you can take that back"; the mark is a
   * decision. Tying the button's appearance to the notice meant Struggle went
   * back to looking unpressed while the item was still marked, so there was no
   * way to see what you had decided — or to change your mind — once the toast
   * had gone. This is what the button reads, and what pressing it again clears.
   */
  const [manualMarks, setManualMarks] = useState<Record<string, GuidedReviewLevel>>({});
  useEffect(() => {
    const syncGuidedBackground = () => {
      setGuidedBackground(getGuidedBackground());
      setGuidedCustomBackground(getGuidedCustomBackground());
    };
    window.addEventListener(GUIDED_BACKGROUND_EVENT, syncGuidedBackground);
    return () => window.removeEventListener(GUIDED_BACKGROUND_EVENT, syncGuidedBackground);
  }, []);
  const lessonProgressRef = useRef<HTMLDivElement | null>(null);
  const lessonProgressTriggerRef = useRef<HTMLButtonElement | null>(null);
  const comboRef = useRef(0);
  const correctPraiseIndex = useRef(0);
  const retryPraiseIndex = useRef(0);
  const announcedComplete = useRef(false);
  // Stage answers are collected in memory and flushed once when the sentence
  // is left. Persisting every check would write localStorage (and wake every
  // grades-updated listener) many times during one 16-stage route.
  const answerPerformanceRef = useRef(new Map<string, AnswerPerformance>());
  const safeSteps = Array.isArray(steps) && steps.length > 0 ? steps : [{ type: "complete" }];
  const lessonStepIndexes = useMemo(
    () => safeSteps.flatMap((candidate: any, candidateIndex: number) => candidate.type === "complete" ? [] : [candidateIndex]),
    [safeSteps]
  );
  const previewCards = useMemo(() => buildSessionPreviewCards(safeSteps), [steps]);
  /**
   * Name what was marked, so the notice can say which phrase it means. Ids are
   * opaque, and once the lesson has moved on the card is no longer on screen.
   */
  const describeMarkedItems = useCallback((ids: string[]): string | undefined => {
    const wanted = new Set(ids);
    const found: string[] = [];
    for (const candidate of safeSteps) {
      if (candidate?.type === "sentence" && wanted.has(String(candidate.item?.id))) {
        if (candidate.item?.de) found.push(String(candidate.item.de));
      }
      for (const line of candidate?.dialogue?.lines ?? []) {
        if (wanted.has(String(line?.id)) && line?.de) found.push(String(line.de));
      }
    }
    if (!found.length) return undefined;
    return found.length === 1 ? found[0] : `${found.length} lines`;
  }, [safeSteps]);

  const applyManualReviewChange = useCallback((
    itemIds: string[],
    level: GuidedReviewLevel,
    returnIndex?: number
  ) => {
    const ids = Array.from(new Set(itemIds.filter(Boolean)));
    if (!ids.length) return;
    ids.forEach((itemId) => {
      if (level === "know" || level === "struggle") onGradeItem?.(itemId, level);
      else if (level === "permanent") onSetItemPermanent?.(itemId);
      else onSetItemStrength?.(itemId, level === "new" ? 0 : level);
    });
    setManualMarks((current) => {
      const next = { ...current };
      for (const itemId of ids) next[itemId] = level;
      return next;
    });
    const details = reviewLevelDetails(level);
    setLastManualReviewChange({
      itemIds: ids,
      label: details.label,
      note: details.note,
      returnIndex,
      subject: describeMarkedItems(ids),
    });
  }, [describeMarkedItems, onGradeItem, onSetItemPermanent, onSetItemStrength]);

  /**
   * Take a mark back off an item by pressing its lit button again — the same
   * restore Undo performs, reached from the control that set it rather than
   * from a notice that has usually gone by the time anyone changes their mind.
   */
  const clearManualMark = useCallback((itemId: string) => {
    const id = String(itemId ?? "");
    if (!id || !onUndoGradeItem?.(id)) return;
    setManualMarks((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setLastManualReviewChange((current) => (
      current && current.itemIds.includes(id) ? null : current
    ));
  }, [onUndoGradeItem]);
  /**
   * Put an item off, and say so in the same notice the levels use.
   *
   * Unlike a level, this does not claim anything about how well it is known --
   * it only moves the earliest date it can reappear, and nothing overrides it.
   */

  const gradeItem = useCallback((itemId: string, grade: "know" | "struggle") => {
    applyManualReviewChange([itemId], grade);
  }, [applyManualReviewChange]);
  const markPreviewItemKnown = useCallback((itemId: string) => {
    if (onPreviewKnown) onPreviewKnown(itemId);
    else onGradeItem?.(itemId, "know");
  }, [onGradeItem, onPreviewKnown]);

  /**
   * Set a phrase's level from the preview, before the lesson has begun.
   *
   * Saying "Mastered" or "Never review" here means you already have this one,
   * so keeping it in today's six wastes a slot on something you know. The
   * levels that finish an item hand the slot back and a fresh phrase takes its
   * place, exactly as "Know it" does — the sitting stays six either way.
   *
   * "Struggling" and "New" ask for MORE practice, so those keep the card.
   */
  const setPreviewItemLevel = useCallback((itemId: string, level: GuidedReviewLevel) => {
    applyManualReviewChange([itemId], level);
    if (reviewLevelFinishesItem(level)) onPreviewSwap?.(itemId);
  }, [applyManualReviewChange, onPreviewSwap]);
  const listeningChoicePool = useMemo(
    () => safeSteps
      .filter((candidate: any) => candidate?.type === "sentence" && candidate.item?.de)
      .map((candidate: any) => String(candidate.item.de)),
    [steps]
  );
  const translationChoicePool = useMemo(
    () => safeSteps
      .filter((candidate: any) => candidate?.type === "sentence" && candidate.item?.en)
      .map((candidate: any) => String(candidate.item.en)),
    [steps]
  );
  const inPreview = previewActive && previewCards.length > 0;
  // One card cannot be matched against anything, so the round is skipped.
  const inMatching = matchingActive && previewCards.length > 1;
  const inIntro = inPreview || inMatching;

  useEffect(() => {
    if (!lessonNavigatorOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && lessonProgressRef.current?.contains(event.target)) return;
      setLessonNavigatorOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLessonNavigatorOpen(false);
      lessonProgressTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [lessonNavigatorOpen]);

  const registerAnswer = (ok: boolean, itemId?: string) => {
    if (itemId) {
      const current = answerPerformanceRef.current.get(itemId) ?? { attempts: 0, mistakes: 0 };
      answerPerformanceRef.current.set(itemId, {
        ...current,
        attempts: current.attempts + 1,
        mistakes: current.mistakes + (ok ? 0 : 1),
      });
    }
    // The praise filter: off silences the pet's cheering entirely, low keeps
    // only streak milestones. There was also a streak counter that popped over
    // the lesson at 3, 5, 10 and every 5 after; it was broken and it looked
    // it, so it is gone. The pet still says so.
    const praiseFrequency = getCodexPetFrequency("praise");
    if (ok) {
      const n = comboRef.current + 1;
      comboRef.current = n;
      playCorrect();
      if (n === 3 || n === 5 || n === 10 || (n > 10 && n % 5 === 0)) {
        if (praiseFrequency !== "off") {
          petSpeak(`${n} correct in a row! Excellent work.`, {
            durationMs: 3800,
            mood: "celebrate",
            voiceLang: "en-US",
          });
        }
      } else if (praiseFrequency !== "off" && praiseFrequency !== "low") {
        const messages = ["Well done!", "Sehr gut! Very good.", "Nice work!", "You got it."];
        petSpeak(messages[correctPraiseIndex.current++ % messages.length], {
          mood: "success",
          voiceLang: "en-US",
        });
      }
    } else {
      comboRef.current = 0;
      playWrong();
      if (praiseFrequency !== "off") {
        const messages = [
          "Nearly. Try once more.",
          "Keep going. Check the hint.",
          "No problem. You can get the next one.",
        ];
        petSpeak(messages[retryPraiseIndex.current++ % messages.length], {
          durationMs: 3400,
          mood: "encourage",
          voiceLang: "en-US",
        });
      }
    }
  };

  /**
   * A right-words-wrong-letters answer, remembered on the record.
   *
   * The sitting is rebuilt from storage every time, so without this the miss
   * is forgotten the moment the session ends and the phrase returns on the
   * lean route. Kept apart from the mistake count: only a slip brings the
   * writing stages back, here or on a later day.
   */
  const registerSlip = (itemId?: string) => {
    if (!itemId) return;
    const current = answerPerformanceRef.current.get(itemId) ?? { attempts: 0, mistakes: 0 };
    answerPerformanceRef.current.set(itemId, { ...current, slips: (current.slips ?? 0) + 1 });
  };

  const step = safeSteps[Math.min(index, safeSteps.length - 1)];
  const progress = inPreview
    ? Math.round(((previewIndex + 1) / previewCards.length) * 100)
    : safeSteps.length > 1 ? Math.round((index / (safeSteps.length - 1)) * 100) : 100;
  // Count only real exercises, not the final "lesson complete" summary screen,
  // so the header reads "4 of 6", not "4 of 7".
  const exerciseCount = lessonStepIndexes.length || 1;
  // How many more sittings the unseen material is worth, at the size of this
  // one. Rounded up, and never shown as nought while phrases remain: the last
  // partial sitting is still a sitting.
  const sittingsLeft = unseenPhrases > 0 ? Math.ceil(unseenPhrases / exerciseCount) : 0;
  const currentLessonIndex = lessonStepIndexes.indexOf(index);
  const exercisePos = currentLessonIndex >= 0 ? currentLessonIndex + 1 : exerciseCount;
  // Persist the item we're leaving immediately, so closing the app mid-session
  // doesn't lose progress (onComplete/onCancel only fire on full finish or the
  // in-app exit, never on an abrupt window/tab close).
  //
  // `skipped` matters: skipping used to travel the same path as a clean recall,
  // so pressing Skip (or Alt+Right, or Skip after a wrong answer) promoted the
  // item up the memory ladder and scheduled it months out — and inflated the
  // fluency estimate, which counts the same records. A skipped item is left
  // exactly as it was.
  const leaveStep = (skipped: boolean) => {
    const current = safeSteps[index];
    const itemId = current?.type === "sentence" ? current.item?.id : undefined;
    const performance = itemId ? answerPerformanceRef.current.get(itemId) : undefined;
    if (current) onAdvance?.(current, skipped, performance);
    if (itemId) answerPerformanceRef.current.delete(itemId);
    if (!skipped && currentLessonIndex >= 0) {
      setCompletedLessonNumbers((previous) => {
        const nextCompleted = new Set(previous);
        nextCompleted.add(currentLessonIndex + 1);
        return nextCompleted;
      });
    }
    if (index < safeSteps.length - 1) setIndex(i => i + 1); else onComplete();
  };
  const next = () => leaveStep(false);

  const handleCancel = () => {
    const current = safeSteps[index];
    const itemId = current?.type === "sentence" ? current.item?.id : undefined;
    const performance = itemId ? answerPerformanceRef.current.get(itemId) : undefined;
    // Closing the lesson is not a successful recall, but genuine wrong attempts
    // made before closing still belong to this sentence's difficulty history.
    if (current) onAdvance?.(current, true, performance);
    if (itemId) answerPerformanceRef.current.delete(itemId);
    onCancel(index);
  };
  const skipStep = () => {
    if (inIntro) return;
    petSpeak("No problem. Let's try the next one.", {
      durationMs: 2800,
      mood: "encourage",
      voiceLang: "en-US",
    });
    leaveStep(true);
  };

  /**
   * The "Set level" menu. Levels that finish the item move the lesson on, the
   * same way "Know it" does — otherwise the learner tells the app an item is
   * Mastered and is then made to keep drilling it. The index is recorded so
   * the Undo that now appears on the NEXT card can bring them back here.
   */
  /**
   * Write the snooze and say so. Does NOT decide what happens next, because
   * that differs by where you are: mid-lesson the exercise moves on, on the
   * preview the card is swapped for one you have not met.
   */
  const recordSnooze = (itemIds: string[], days: number, returnIndex?: number) => {
    const ids = Array.from(new Set(itemIds.filter(Boolean)));
    if (!ids.length) return false;
    ids.forEach((itemId) => onSnoozeItem?.(itemId, days));
    const choice = GUIDED_SNOOZE_CHOICES.find((option) => option.days === days);
    setLastManualReviewChange({
      itemIds: ids,
      // Built through uiFmt rather than glued together in JS. The old version
      // produced "Put off until in a month", which is wrong in English and
      // was dropped untranslated into the middle of a German sentence.
      label: choice ? uiFmt("Put off — {when}", { when: ui(choice.label) }) : ui("Put off"),
      note: "Nothing will show this before then.",
      // Captured before anything moves: once the card is swapped or the lesson
      // advances, the phrase is no longer in the step list to look up.
      subject: describeMarkedItems(ids),
      returnIndex,
    });
    return true;
  };

  const applyManualSnooze = (itemIds: string[], days: number) => {
    if (!recordSnooze(itemIds, days, index)) return;
    next();
  };

  /**
   * Putting a phrase off from the preview.
   *
   * next() is the EXERCISE's advance and does nothing useful here -- the
   * preview has its own card index -- so putting one off appeared to do
   * nothing at all. It hands the slot back like "Know it" does, so a phrase
   * you have not met takes its place and the sitting stays six.
   */
  const snoozePreviewItem = (itemId: string, days: number) => {
    if (!recordSnooze([itemId], days)) return;
    onPreviewSwap?.(itemId);
  };

  const applyReviewLevelFromPicker = (itemIds: string[], level: GuidedReviewLevel) => {
    const finishes = reviewLevelFinishesItem(level);
    applyManualReviewChange(itemIds, level, finishes ? index : undefined);
    if (finishes) next();
  };

  const struggleIdsForStep = (candidate: any): string[] => {
    if (candidate?.type === "sentence" && candidate.item?.id) return [String(candidate.item.id)];
    if (candidate?.type === "dialogue" && Array.isArray(candidate.dialogue?.lines)) {
      return candidate.dialogue.lines.flatMap((line: any) => line?.id ? [String(line.id)] : []);
    }
    return [];
  };

  const jumpToLesson = (lessonNumber: number, markCurrentAsStruggle = false) => {
    const targetIndex = lessonStepIndexes[lessonNumber - 1];
    if (!Number.isInteger(targetIndex) || targetIndex === index) {
      setLessonNavigatorOpen(false);
      return;
    }

    const current = safeSteps[index];
    const itemId = current?.type === "sentence" ? current.item?.id : undefined;
    const performance = itemId ? answerPerformanceRef.current.get(itemId) : undefined;
    if (markCurrentAsStruggle) {
      applyManualReviewChange(struggleIdsForStep(current), "struggle");
      petSpeak("Marked as a struggle. We will bring it back for more practice.", {
        durationMs: 3600,
        mood: "encourage",
        voiceLang: "en-US",
      });
    }
    if (current) onAdvance?.(current, true, performance);
    if (itemId) answerPerformanceRef.current.delete(itemId);
    setIndex(targetIndex);
    setLessonNavigatorOpen(false);
  };

  const markStruggleAndContinue = () => {
    const nextLessonNumber = currentLessonIndex + 2;
    if (nextLessonNumber <= lessonStepIndexes.length) {
      jumpToLesson(nextLessonNumber, true);
      return;
    }
    const current = safeSteps[index];
    // No returnIndex here: "continue" was the learner's explicit request, not a
    // side effect of grading, so undoing the mark must not drag them back.
    applyManualReviewChange(struggleIdsForStep(current), "struggle");
    setLessonNavigatorOpen(false);
    petSpeak("Marked as a struggle. We will bring it back for more practice.", {
      durationMs: 3600,
      mood: "encourage",
      voiceLang: "en-US",
    });
    leaveStep(true);
  };

  // Reverting a mark should never move you — unless the mark itself moved you.
  // Marking something Struggling keeps you on it, so undoing that must not jump
  // anywhere (it used to, restarting the exercise at stage one, which read as
  // losing your place). Marking something Mastered or Never review DOES move
  // the lesson on, so undoing that has to bring you back to it.
  const undoLastManualReviewChange = () => {
    if (!lastManualReviewChange) return;
    let restored = false;
    for (const itemId of lastManualReviewChange.itemIds) {
      if (onUndoGradeItem?.(itemId)) restored = true;
    }
    if (!restored) return;
    // Undo and the lit button show the same mark, so taking it back here has
    // to unlight the button too.
    setManualMarks((current) => {
      const next = { ...current };
      for (const itemId of lastManualReviewChange.itemIds) delete next[itemId];
      return next;
    });
    // Only marks that moved the learner on carry a returnIndex, so this puts
    // them back exactly where the mark was made without ever disturbing an
    // undo made on the spot.
    const { returnIndex } = lastManualReviewChange;
    if (Number.isInteger(returnIndex) && returnIndex !== index && returnIndex! < safeSteps.length) {
      setIndex(returnIndex!);
    }
    setLastManualReviewChange(null);
    petSpeak("Undone. You can decide again whenever you are ready.", {
      durationMs: 2600,
      mood: "encourage",
      voiceLang: "en-US",
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key !== "ArrowRight") return;
      event.preventDefault();
      skipStep();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inIntro, index, safeSteps.length]);

  const kind: string = step?.type || step?.kind || "complete";

  // When the pending mark belongs to the sentence on screen, the in-card
  // banner hosts Undo and the floating toast stays hidden — one notice, next
  // to the exercise it talks about.
  const manualNoticeInline = Boolean(
    lastManualReviewChange
    && step?.type === "sentence"
    && step.item?.id
    && lastManualReviewChange.itemIds.includes(String(step.item.id))
  );

  useEffect(() => {
    if (kind !== "complete" || announcedComplete.current) return;
    announcedComplete.current = true;
    petSpeak("Lesson complete. Great work — you’re ready to move on.", {
      durationMs: 6000,
      mood: "encourage",
      voiceLang: "en-US",
    });
  }, [kind, petSpeak]);

  const registerRegisterAnswer = (questionId: string, ok: boolean) => {
    registerAnswer(ok);
    onRegisterAnswer?.(questionId, ok);
  };

  const guidedBackgroundStyle = guidedBackground === "custom" && guidedCustomBackground
    ? { "--guided-custom-background": `url("${guidedCustomBackground}")` } as React.CSSProperties
    : undefined;

  return (
    <div
      className={cn("guided-session fs-app prototype-guided-session app-overlay fixed inset-0 z-[500] flex flex-col overflow-hidden font-sans", `guided-background-${guidedBackground}`)}
      style={guidedBackgroundStyle}
    >

      {/* Topbar: brand · lesson progress · mute/close */}
      <header className="fs-topbar" ref={sessionHeaderRef}>
        <div className="fs-brand">
          <img src="/icon-64.png" alt="" />
          <div className="fs-brand-copy">
            <span className="fs-brand-name">MICHEON</span>
            <span className="fs-brand-byline">{ui("made with love by Leon & Michelle")}</span>
          </div>
        </div>
        <div className="fs-progress" ref={lessonProgressRef}>
          <button
            ref={lessonProgressTriggerRef}
            type="button"
            className={cn("fs-progress-trigger", !inIntro && "is-navigable")}
            aria-expanded={!inIntro && lessonNavigatorOpen}
            aria-controls={!inIntro ? "lesson-navigator" : undefined}
            aria-haspopup={!inIntro ? "dialog" : undefined}
            disabled={inIntro}
            onClick={() => !inIntro && setLessonNavigatorOpen((open) => !open)}
            title={!inIntro ? ui("Choose any lesson") : undefined}
          >
            <div className="fs-progress-copy">
              <span>{ui(inPreview ? "Preview" : inMatching ? "Matching" : "Lesson")}</span>
              <strong>
                {inPreview ? previewIndex + 1 : inMatching ? matchingProgress : exercisePos} {ui("of")} {inPreview ? previewCards.length : inMatching ? Math.max(1, matchingBoardSize) : exerciseCount}
              </strong>
              {/*
                Where this sitting sits in the whole course.
                Sittings rather than a percentage, because a sitting is the
                unit the learner actually spends — and estimated from THIS
                sitting's length rather than a fixed number, since the route
                is shorter for words and for material already held. */}
              {sittingsLeft > 0 && (
                <small className="fs-progress-remaining">
                  {uiFmt("{phrases} new phrases left · about {sittings} more lessons", {
                    phrases: uiNumber(unseenPhrases),
                    sittings: uiNumber(sittingsLeft),
                  })}
                </small>
              )}
            </div>
            <div className="fs-progress-track"><i style={{ width: `${progress}%` }} /></div>
            <strong className="fs-progress-pct">{progress}%</strong>
            {!inIntro && <ChevronDown className="fs-progress-chevron" aria-hidden="true" />}
          </button>
          {!inIntro && lessonNavigatorOpen && (
            <div id="lesson-navigator" className="fs-lesson-navigator" role="dialog" aria-label={ui("Choose any lesson")}>
              <div className="fs-lesson-navigator-head">
                <div>
                  <strong>{ui("Choose any lesson")}</strong>
                  <span>{ui("Move freely without marking unfinished lessons as complete.")}</span>
                </div>
                <button type="button" aria-label={ui("Close lesson navigator")} onClick={() => setLessonNavigatorOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="fs-lesson-number-grid" aria-label={ui("Lessons in this session")}>
                {lessonStepIndexes.map((stepIndex, lessonOffset) => {
                  const lessonNumber = lessonOffset + 1;
                  const isCurrent = stepIndex === index;
                  const isCompleted = completedLessonNumbers.has(lessonNumber);
                  return (
                    <button
                      key={stepIndex}
                      type="button"
                      className={cn("fs-lesson-number", isCurrent && "is-current", isCompleted && "is-complete")}
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={`${ui("Lesson")} ${lessonNumber}${isCurrent ? `, ${ui("current")}` : isCompleted ? `, ${ui("complete")}` : ""}`}
                      onClick={() => jumpToLesson(lessonNumber)}
                    >
                      <span>{lessonNumber}</span>
                      {isCompleted ? <CheckCircle2 aria-hidden="true" /> : <small>{isCurrent ? ui("Now") : ui("Open")}</small>}
                    </button>
                  );
                })}
              </div>
              {struggleIdsForStep(step).length > 0 && currentLessonIndex >= 0 && (
                <button type="button" className="fs-lesson-struggle-next" onClick={markStruggleAndContinue}>
                  <span>
                    <strong>{ui("Mark as struggle and continue")}</strong>
                    <small>{ui("This lesson will return in priority practice.")}</small>
                  </span>
                  <SkipForward className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {import.meta.env.DEV && !inIntro && (
            <Button variant="ghost" onClick={skipStep} className="skip-step-btn app-skip-button">
              <span>{ui("Skip")}</span>
              <kbd>Alt →</kbd>
            </Button>
          )}
          <MuteButton
            className="fs-iconbtn shrink-0"
            iconClassName="h-4 w-4"
            panelClassName="prototype-audio-mixer"
          />
          <button
            type="button"
            aria-expanded={sessionSettingsOpen}
            aria-label={ui("How Continue learning is put together")}
            className="fs-iconbtn"
            data-testid="session-settings-button"
            onClick={() => setSessionSettingsOpen((open) => !open)}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button type="button" aria-label={ui("Close lesson")} className="fs-iconbtn" onClick={handleCancel}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {sessionSettingsOpen && (
        // Below the header only: the header (and Electron's title bar above
        // it) stays visible and clickable, so the gear closes what it opened.
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex items-start justify-end bg-black/40 p-3 sm:p-4"
          data-testid="session-settings"
          onClick={(event) => { if (event.target === event.currentTarget) setSessionSettingsOpen(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") setSessionSettingsOpen(false); }}
          role="presentation"
          style={{ top: sessionSettingsTop }}
        >
          <div
            aria-label={ui("How Continue learning is put together")}
            className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] p-1.5 shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3 px-3 pt-1.5">
              <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-3)]">
                {ui("Changing this rebuilds the sitting from the start.")}
              </p>
              <button type="button" aria-label={ui("Close")} className="fs-iconbtn shrink-0" onClick={() => setSessionSettingsOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {/*
              A change rebuilds the sitting on the spot rather than waiting
              for the next one: the learner pressed an order to see it, and a
              note saying "next time" was the panel apologising for not doing
              its job. Grades already given were saved as they were given.
            */}
            <ContinueLearningSettings onChange={() => { setSessionSettingsOpen(false); onRebuildSitting?.(); }} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="relative z-10 flex flex-1 items-start justify-center overflow-y-auto p-5 sm:p-7">
        <AnimatePresence mode="wait">
          <motion.div key={inPreview ? "preview" : inMatching ? "matching" : index}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full max-w-5xl justify-center">
            <div className={cn("fs-card relative", inPreview && "fs-card--preview")}>
              <div className="relative z-10 flex flex-col">
                {inPreview ? (
                  <SessionFlashcardPreview
                    cards={previewCards}
                    index={previewIndex}
                    onIndexChange={setPreviewIndex}
                    onKnown={markPreviewItemKnown}
                    onReviewLevel={setPreviewItemLevel}
                    onSnooze={snoozePreviewItem}
                    notice={lastManualReviewChange}
                    onUndoNotice={undoLastManualReviewChange}
                    onDismissNotice={() => setLastManualReviewChange(null)}
                    onSkip={() => { setPreviewActive(false); setMatchingActive(previewCards.length > 1); setMatchingProgress(0); }}
                    onStart={() => { setPreviewActive(false); setMatchingActive(previewCards.length > 1); setMatchingProgress(0); }}
                  />
                ) : inMatching ? (
                  <SessionMatchingPairs
                    cards={previewCards}
                    onAnswer={registerAnswer}
                    onProgress={(matched, boardSize) => {
                      setMatchingProgress(matched);
                      setMatchingBoardSize(boardSize);
                    }}
                    onComplete={() => {
                      setMatchingActive(false);
                      setMatchingProgress(0);
                    }}
                  />
                ) : (
                  <>
                    {kind === "sentence"  && <SentenceExercise key={`sentence-${index}`} item={step.item} listeningChoicePool={listeningChoicePool} translationChoicePool={translationChoicePool} onGradeItem={gradeItem} onReviewLevel={(level) => applyReviewLevelFromPicker([String(step.item?.id ?? "")], level)} onSnooze={(days) => applyManualSnooze([String(step.item?.id ?? "")], days)} onNext={next} onAnswer={(ok) => registerAnswer(ok, step.item?.id)} onSlip={() => registerSlip(step.item?.id)} manualReviewNotice={manualNoticeInline ? lastManualReviewChange : null} onUndoManualReview={undoLastManualReviewChange} onDismissManualReview={() => setLastManualReviewChange(null)} onHoldManualReview={holdReviewNotice} onReleaseManualReview={releaseReviewNotice} markedLevel={manualMarks[String(step.item?.id ?? "")] ?? null} onClearMark={() => clearManualMark(String(step.item?.id ?? ""))} />}
                    {kind === "dialogue"  && <div className="fs-card-body flex flex-col items-center"><DialogueExercise key={`dialogue-${index}`} dialogue={step.dialogue} onGradeItem={gradeItem} onReviewLevel={(itemId, level) => applyReviewLevelFromPicker([itemId], level)} onSnooze={(itemId, days) => applyManualSnooze([itemId], days)} onNext={next} onAnswer={registerAnswer} markedLevels={manualMarks} onClearMark={clearManualMark} /></div>}
                    {kind === "register"  && <RegisterCheck question={step.question} onAnswer={registerRegisterAnswer} onNext={next} />}
                    {kind === "complete"  && (
                      <div className="fs-card-body flex flex-col items-center">
                        <CompleteScreen onNext={onComplete} />
                      </div>
                    )}
                    {!["sentence","dialogue","complete","register"].includes(kind) && (
                      <div className="fs-card-body py-12 text-center space-y-4">
                        <div className="text-4xl font-semibold tracking-tight text-zinc-950">{step.item?.de ?? ""}</div>
                        <Button onClick={next} className="h-12 rounded-lg bg-zinc-950 px-8 text-sm font-semibold text-white hover:bg-zinc-800">
                          Continue <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {lastManualReviewChange && !inIntro && !manualNoticeInline && (
            <motion.div
              key={`${lastManualReviewChange.itemIds.join("-")}-${lastManualReviewChange.label}`}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="fs-grade-undo"
              role="status"
              onMouseEnter={holdReviewNotice}
              onMouseLeave={releaseReviewNotice}
              onFocusCapture={holdReviewNotice}
              onBlurCapture={releaseReviewNotice}
            >
              <div>
                <strong>
                  {ui("Marked as")} {ui(lastManualReviewChange.label)}
                  {lastManualReviewChange.subject ? <> — “{lastManualReviewChange.subject}”</> : null}
                </strong>
                <span>{ui(lastManualReviewChange.note)}</span>
              </div>
              <button
                type="button"
                onClick={undoLastManualReviewChange}
                aria-label={lastManualReviewChange.subject
                  ? `${ui("Undo")} — ${lastManualReviewChange.subject}`
                  : ui("Undo")}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {ui("Undo")}
              </button>
              <button
                type="button"
                className="fs-grade-undo-dismiss"
                aria-label={ui("Dismiss")}
                onClick={() => setLastManualReviewChange(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}

