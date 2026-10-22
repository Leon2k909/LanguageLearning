/**
 * Runs on every page. Two things, both entirely offline against Micheon's
 * own bundled word list (data/words.json) -- no translation API, no network
 * call beyond loading that one local file:
 *
 *   1. Glossing: a word already in the list gets a dotted underline and a
 *      hover/focus tooltip with its translation. German page -> English
 *      gloss (reinforcement of what you're learning). Non-German page ->
 *      German gloss on English words that have a taught equivalent (recall
 *      prompt, so pages you'd otherwise read in English still teach).
 *   2. Missing-vocabulary collection: on German text, a real-looking German
 *      word that ISN'T in the list gets counted with the sentence it
 *      appeared in. This is a candidate list for a human (or a future
 *      authoring pass) to review -- never auto-added, same as every other
 *      pack in Micheon.
 *
 * YouTube and X are special cases. Their page chrome renders in the ACCOUNT's
 * interface language, so page-level language detection reads a German-locale
 * YouTube as "German page" even under an English video -- that poisoned the
 * candidate list once already. But video titles and descriptions on
 * German-learning channels are exactly the vocabulary worth reading. So on
 * YouTube this script scans ONLY the watch page's title + description
 * containers, and decides German-or-not per container from that container's
 * own text, never from the page around it. X is similarly limited to actual
 * tweet bodies: account names, trends, timestamps and translated interface
 * controls are not language-learning evidence.
 */
(() => {
  const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
  const GERMAN_LETTER_RE = /^[A-Za-zÄÖÜäöüß'’-]+$/;
  // A mention, email address or URL can contain fragments that look like
  // ordinary German words. They are identities/addresses, not vocabulary:
  // never underline them and never export them as missing candidates.
  const NON_VOCAB_SPAN_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[A-Za-z]{2,}|@[A-Za-z0-9_]{1,64}|(?:https?:\/\/|www\.)[^\s<>"']+/giu;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE"]);
  const MISSING_VOCAB_CAP = 3000;
  const FLUSH_DELAY_MS = 4000;
  // Pointer movement is noisy: crossing letters, inline elements, or two
  // copies of the same word can emit several hit-test changes in a few
  // milliseconds. Wait for the learner to settle on a word before speaking,
  // and do not immediately repeat the same pronunciation from a neighbouring
  // range. Explicit clicks still replay instantly.
  const HOVER_SPEAK_DELAY_MS = 280;
  const SAME_WORD_SPEAK_COOLDOWN_MS = 1200;
  const runWhenIdle = window.requestIdleCallback
    ? window.requestIdleCallback.bind(window)
    : (callback, options = {}) => window.setTimeout(
        () => callback({ didTimeout: true, timeRemaining: () => 0 }),
        Math.min(Number(options.timeout) || 50, 50),
      );
  // Unicode-aware boundaries, not \b. JS's \b is ASCII-only, so `\büber\b`
  // can NEVER match: a space followed by "ü" is non-word followed by
  // non-word, which is not a boundary. Every umlaut-initial hint word was
  // silently dead, weakening the German detection this gate exists for.
  const GERMAN_HINT_RE = /(?<![\p{L}])(?:und|nicht|der|die|das|ist|sind|ich|du|wir|mit|für|auch|über|sei|ein|eine|zum|zur|auf|dem|den)(?![\p{L}])/gu;

  const IS_YOUTUBE = /(^|\.)youtube\.com$/.test(location.hostname);
  // Mail, chat and banking pages are somebody's private correspondence. Words
  // met there still count towards the word bank, but the sentence around them
  // is never kept: the list is stored, shown and exportable, and nobody
  // expects a line from their inbox or their bank to turn up in it.
  const IS_PRIVATE_PAGE = /(^|\.)(mail\.google\.com|outlook\.(?:live|office|office365)\.com|mail\.yahoo\.com|(?:mail\.)?proton\.me|web\.whatsapp\.com|messenger\.com|web\.telegram\.org|app\.slack\.com|discord\.com|teams\.microsoft\.com|icloud\.com|gmx\.(?:net|de|com)|web\.de|t-online\.de|paypal\.com)$/.test(location.hostname)
    || /(^|[.-])(bank|banking|sparkasse|volksbank)([.-]|$)/.test(location.hostname);
  const IS_X = /(^|\.)(?:x|twitter)\.com$/.test(location.hostname);
  // Title first, then the description in its collapsed and expanded homes.
  // YouTube reshuffles its DOM between deploys, so several selectors --
  // scanning is cheap, node-level dedup makes rescans safe.
  const YT_SCAN_SELECTORS = [
    "ytd-watch-metadata h1",
    "#description-inline-expander",
    "ytd-text-inline-expander",
    "#description",
  ];
  // Comments are judged one by one, never as part of the video: a German
  // comment under an English video is real reading material (German-dubbed
  // videos especially -- their descriptions are English, the German is in
  // the audio and the comment section), and an English reply under a German
  // video is not.
  // #content-text is the comment BODY in both YouTube's old
  // (ytd-comment-renderer) and current (ytd-comment-view-model) markup.
  // Matching on it directly rather than through a renderer element name
  // survives the next rename of the wrapper, which is the part YouTube
  // actually churns.
  const YT_COMMENT_SELECTOR = "#content-text";
  const X_POST_SELECTOR = 'article [data-testid="tweetText"]';
  const X_REINFORCEMENT_SELECTORS = [
    'header[role="banner"] nav[role="navigation"]',
    '[data-testid="sidebarColumn"]',
  ];
  const X_CHROME_SELECTOR = X_REINFORCEMENT_SELECTORS.join(", ");

  let settings = { glossEnabled: true, collectMissingVocab: true, ttsOnHover: true, ttsOnClick: true, hoverDelayMs: 200 };
  // German capitalises every noun and nothing else, so a word's authored
  // case IS its part-of-speech signal -- "Daten" (data, a noun) and "daten"
  // (to date someone, a verb) are different words that happen to share
  // letters, not the same word in two cases. Losing that by lowercasing
  // everything for lookup produced exactly that mix-up on first real-page
  // testing (spiegel.de glossed "Daten" as "to date"). Match on exact
  // authored case; the only case-insensitive fallback is ALL-CAPS text
  // (headlines, nav labels), which discards case entirely so there is no
  // noun/verb signal left to lose there. Position-based recovery of
  // ordinary sentence-initial Titlecase words was tried and reverted: it
  // cannot actually tell "capitalised because it's a real noun this list
  // doesn't teach" apart from "capitalised only by sentence position",
  // and a wrong gloss teaches something false, which is worse than a
  // missed one.
  let byDeExact = new Map();       // authored-case German -> { en, deDisplay }
  let byDeLowerAny = new Map();    // lowercase German (all entries) -> { en, deDisplay }
  let byEn = new Map();   // lowercase English (first word of gloss only) -> { de, deDisplay }
  let isGermanPage = false;
  // "strong" | "weak" | "none" -- see detectGerman. Anything short of
  // "strong" means each passage must prove itself before its unknown words
  // are collected.
  let germanConfidence = "none";
  let ytGermanFound = false;
  let xGermanFound = false;
  let missingCounts = new Map();   // German word -> count
  let missingExamples = new Map(); // German word -> up to four distinct real sentences
  let englishCounts = new Map();   // English word we hold no German for -> count
  let englishExamples = new Map();
  let flushTimer = null;
  let ytScanTimer = null;
  let xScanTimer = null;
  // X is a virtualised React feed. Scheduling arbitrary mutation roots lets
  // a tiny counter/image update promote itself to the whole article (or the
  // whole sidebar), repeatedly walking text that cannot contain vocabulary.
  // Keep only the actual tweet/nav containers whose own text changed.
  const xPendingPosts = new Set();
  const xPendingChrome = new Set();
  const xChangedTextNodes = new Set();
  let xNeedsDetachedCleanup = false;
  // A node can first be seen in reinforcement-only site chrome and later be
  // reused by an SPA as authored text. Keep those scans distinct so the
  // lighter pass cannot permanently suppress collection on that node.
  const processed = new WeakMap();

  // The sentence a missing word appeared in is worth more than the word
  // alone -- it's real usage, the same kind of context Micheon's own "use"
  // field captures by hand for every taught word. A single text node is
  // often only a FRAGMENT of the visible sentence (inline <strong>/<a> tags
  // split it in the DOM), so this reads the whole containing element's
  // text, not just the one node the match was found in.
  function extractSentence(node, tokenStart) {
    const container = node.parentElement?.closest("p, li, h1, h2, h3, h4, blockquote, td, dd, figcaption") || node.parentElement;
    const full = (container?.textContent || node.nodeValue || "").replace(/\s+/g, " ").trim();
    if (!full) return "";
    const approxPoint = Math.min(full.length - 1, Math.max(0, tokenStart));
    const before = full.slice(0, approxPoint);
    const after = full.slice(approxPoint);
    const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
    const endMatch = after.search(/[.!?](\s|$)/);
    const end = endMatch === -1 ? after.length : endMatch + 1;
    const sentence = full.slice(start === -1 ? 0 : start + 2, approxPoint + end).trim();
    return sentence.length > 4 && sentence.length <= 220 ? sentence : full.slice(0, 200);
  }

  function excludedTextRanges(text) {
    const ranges = [];
    NON_VOCAB_SPAN_RE.lastIndex = 0;
    let match;
    while ((match = NON_VOCAB_SPAN_RE.exec(text))) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    return ranges;
  }

  function overlapsExcludedRange(start, end, ranges) {
    return ranges.some((range) => start < range.end && end > range.start);
  }

  function candidateAppearsOutsideExcludedText(text, candidate) {
    const target = String(candidate || "").toLocaleLowerCase("de-DE");
    const ranges = excludedTextRanges(text);
    // Use a private matcher here. WORD_RE is also the iterator owned by
    // processTextNode; resetting that shared global regex from reconciliation
    // would make nested or future callers skip/repeat page tokens.
    const candidateWordRe = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
    let match;
    while ((match = candidateWordRe.exec(text))) {
      if (match[0].toLocaleLowerCase("de-DE") !== target) continue;
      if (!overlapsExcludedRange(match.index, match.index + match[0].length, ranges)) return true;
    }
    return false;
  }

  function exampleSupportsCandidate(example, candidate) {
    return sentenceLooksGerman(example) && candidateAppearsOutsideExcludedText(example, candidate);
  }

  /**
   * How German is this page? Three answers, not two.
   *
   *   "strong" -- the document says so (lang=de*): trusted wholesale.
   *   "weak"   -- it says otherwise, or says nothing, but the text reads
   *               German. Gloss it, but only collect from passages that are
   *               themselves German.
   *   "none"   -- English-to-German recall glossing only.
   *
   * This used to return false the instant a lang attribute said anything
   * other than German, WITHOUT ever looking at the text -- so a German
   * article on a site that declares lang="en" (a forum thread, a
   * mixed-language feed) collected nothing at all, permanently and silently.
   */
  function detectGerman() {
    const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
    if (htmlLang.startsWith("de")) {
      germanConfidence = "strong";
      return true;
    }
    const sample = (document.body?.innerText || "").slice(0, 4000).toLowerCase();
    const hits = (sample.match(GERMAN_HINT_RE) || []).length;
    germanConfidence = hits >= 6 ? "weak" : "none";
    return germanConfidence === "weak";
  }

  // Per-container German check for YouTube. Vocabulary-list descriptions
  // are stopword-light ("06:09 neugierig" has no function word at all), so
  // umlaut/ß-bearing words count as a second, independent signal.
  function looksGermanBlock(text) {
    const sample = text.slice(0, 3000).toLowerCase();
    const stopHits = (sample.match(GERMAN_HINT_RE) || []).length;
    const umlautWords = (sample.match(/[a-zäöüß'’-]*[äöüß][a-zäöüß'’-]*/g) || []).length;
    return stopHits >= 4 || umlautWords >= 3;
  }

  // Words that mark a comment as German even though the taught word list
  // doesn't carry them standalone (Micheon teaches "danke" and "sehr"
  // inside sentences, not as word entries). Two distinct hits are required
  // before a comment counts, so an English sentence containing "gut" or
  // "toll" once doesn't flip.
  const COMMENT_GERMAN_WORDS = new Set([
    "danke", "bitte", "hallo", "sehr", "gut", "gute", "guten", "gutes", "super", "toll", "genau",
    "stimmt", "wirklich", "leider", "vielen", "dank", "liebe", "lieber", "servus", "moin", "geil",
    "krass", "endlich", "immer", "heute", "warum", "danach", "deutsch", "deutsche", "lernen", "lerne",
  ]);

  function knownGermanSignalCount(sample, limit = 2) {
    const seen = new Set();
    // Never borrow WORD_RE here. This helper is called by
    // sentenceLooksGerman() from inside processTextNode's own WORD_RE loop.
    // Resetting/reusing that same global RegExp moves the outer iterator
    // backwards; a tweet containing an unknown word can then revisit that
    // word forever, pegging the X tab until it hangs or crashes.
    const signalWordRe = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
    let match;
    while ((match = signalWordRe.exec(sample)) && seen.size < limit) {
      const token = match[0].toLowerCase();
      if (byDeLowerAny.has(token) || COMMENT_GERMAN_WORDS.has(token)) seen.add(token);
    }
    return seen.size;
  }

  // Comment-sized German check. Comments are short and carry few function
  // words ("Sehr gutes Video, danke!" has no article and no umlaut), so
  // alongside the usual signals this counts words the taught list itself
  // recognises -- the list IS a German dictionary of everything worth
  // glossing here -- plus the everyday comment words above that the list
  // deliberately teaches through sentences instead.
  function commentLooksGerman(text) {
    const sample = text.slice(0, 600).toLowerCase();
    if ((sample.match(GERMAN_HINT_RE) || []).length >= 2) return true;
    const knownSignals = knownGermanSignalCount(sample);
    return knownSignals >= 2 || (/[äöüß]/.test(sample) && knownSignals >= 1);
  }

  // Stricter, sentence-sized version of the same check. YouTube descriptions
  // on German-learning channels mix English paragraphs with the German
  // content ("Following the English audio..." right above the vocab list),
  // and a container-level judgement can't see that seam -- verified on real
  // content, where the English half of a description polluted the candidate
  // list with "the", "and" and "app". Words are only collected when their
  // OWN sentence carries at least one German signal.
  /**
   * Does this sentence read as English?
   *
   * Needed because the German test could only ever vote yes. knownGermanSignal
   * Count says "the glossary holds this token", and the glossary holds "in",
   * "was", "will", "hat", "man", "so", "die", "war", "boot", "kind", "band",
   * "fast", "arm" and "rock" -- every one of them an ordinary English word
   * too. Two of those turn up in almost any English sentence, so English prose
   * on a German page counted as German and its words were collected as German
   * vocabulary. Measured on a real export: 123 of 346 entries came in that way.
   *
   * So English gets a vote of its own, from function words that CANNOT be
   * German. Every candidate was checked against the other language before it
   * went in -- "was", "will", "hat", "man", "in", "so", "die", "all", "also",
   * "her", "bald", "an" and "am" are German words and are therefore absent,
   * however English they look.
   */
  const ENGLISH_HINT_RE = /(?<![\p{L}])(?:the|of|and|to|is|it|that|for|you|with|this|but|have|from|they|we|are|been|would|there|which|their|when|your|were|what|about|his|him|she|its|our|out|not|one|as|at|by|or|if|on|no|do|does|did|than|then|them|these|those|being|into|only|just|more|most|some|any|each|other|over|after|before|because|while|where|who|whose|why|how|both|many|much|such|very|can|could|should|may|might|must|shall)(?![\p{L}])/gu;

  function germanHintCount(sentence) {
    return (String(sentence || "").toLowerCase().match(GERMAN_HINT_RE) || []).length;
  }

  function sentenceLooksEnglish(sentence) {
    const sample = String(sentence || "").toLowerCase();
    const englishHits = (sample.match(ENGLISH_HINT_RE) || []).length;
    if (englishHits < 2) return false;
    // German function words are the only thing that outranks them: a German
    // sentence quoting an English phrase should still count as German.
    return englishHits > (sample.match(GERMAN_HINT_RE) || []).length;
  }

  function sentenceLooksGerman(sentence) {
    const sample = sentence.toLowerCase();
    if (sentenceLooksEnglish(sample)) return false;
    const stopHits = (sample.match(GERMAN_HINT_RE) || []).length;
    if (stopHits >= 2) return true;
    const knownSignals = knownGermanSignalCount(sample);
    return knownSignals >= 2 || (stopHits >= 1 && (knownSignals >= 1 || /[äöüß]/.test(sample)));
  }

  function buildIndexes(words) {
    for (const w of words) {
      const entry = { en: w.en, deDisplay: w.deDisplay, ex: w.ex, exEn: w.exEn, exSrc: w.exSrc, core: w.core };
      if (!byDeExact.has(w.de)) byDeExact.set(w.de, entry);
      const lowerKey = w.de.toLowerCase();
      if (!byDeLowerAny.has(lowerKey)) byDeLowerAny.set(lowerKey, entry);
      // Only index short English glosses for the reverse direction -- "to
      // give up, to quit" as a hover prompt on the word "give" would be
      // actively misleading about what's being asked for. Verb entries are
      // excluded outright: stripping their "to " made the English word
      // "date" (nearly always the calendar noun in real text) gloss as
      // "daten" (to date someone), and "collect" landed on "abholen" --
      // a wrong sense taught confidently. A missing gloss is silent; a
      // wrong one isn't. On genuine collisions between the remaining
      // entries, a noun (der/die/das) beats anything else: it's the
      // concrete, dictionary-shaped sense a hover should teach.
      // A trailing qualifier is a note to the reader, not part of the word.
      // "because (keeps normal word order)" was failing the letters-only test
      // and taking weil and denn out of the reverse direction entirely, along
      // with every other gloss the course had bothered to explain.
      const enFirst = w.en.split(",")[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
      // A gloss written "bill or invoice" names two meanings, and taking it
      // as one three-word phrase kept 118 words out of this index entirely:
      // hovering "bill" found nothing while die Rechnung sat in the
      // glossary. Each side of the "or" is a claim in its own right — the
      // first with full standing, the rest only where nothing else objects.
      const claims = enFirst.split(/\s+or\s+/i);
      claims.forEach((claim, position) => {
        const cleaned = claim.trim();
        if (!/^[A-Za-z' -]+$/.test(cleaned) || /^to\s/i.test(cleaned) || cleaned.split(/\s+/).length > 2) return;
        const enKey = cleaned.toLowerCase();
        const isNoun = /^(der|die|das)\s/.test(w.deDisplay);
        const isCore = w.core === 1;
        const existing = byEn.get(enKey);
        // A word marked core is the everyday one for that meaning, and it
        // wins outright: "always" used to land on stets, because stets
        // happened to be indexed first, when the word a reader wants is immer.
        const better = position === 0
          ? (!existing
            || (isCore && !existing.isCore)
            || (isNoun && !existing.isNoun && !existing.isCore))
          : !existing;
        if (better) {
          byEn.set(enKey, { de: w.de, deDisplay: w.deDisplay, isNoun, isCore });
        }
      });
    }

    // Second pass: the other names for the same word. One German word is one
    // entry, so when the course calls die Nutzung "use" and the pages a
    // learner reads call it "usage", only the first spelling used to arrive.
    // These fill keys nothing else claimed, so an authored gloss always wins.
    for (const w of words) {
      for (const alternative of w.enAlt || []) {
        const enKey = alternative.toLowerCase();
        if (!/^[a-z' -]+$/.test(enKey) || /^to\s/.test(enKey) || enKey.split(/\s+/).length > 2) continue;
        if (byEn.has(enKey)) continue;
        byEn.set(enKey, {
          de: w.de,
          deDisplay: w.deDisplay,
          isNoun: /^(der|die|das)\s/.test(w.deDisplay),
          isCore: w.core === 1,
        });
      }
    }

    // Third pass: verbs, at last, and only into keys nothing else wants.
    // Excluding them outright is what made "read", "send", "reply" and
    // "decide" silent on an English page — most of the English verbs anybody
    // writes. The original objection stands and is now enforced rather than
    // approximated: "date" is claimed by das Datum before this runs, so it
    // cannot become daten, and any word with a noun sense we teach keeps it.
    for (const w of words) {
      const enFirst = w.en.split(",")[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
      const verb = /^to\s+(.+)$/i.exec(enFirst);
      if (!verb) continue;
      // "to believe or think" claims both verbs, first one first.
      const enKey = verb[1].split(/\s+or\s+(?:to\s+)?/i)[0].toLowerCase().trim();
      if (!/^[a-z' -]+$/.test(enKey) || enKey.split(/\s+/).length > 2) continue;
      const record = { de: w.de, deDisplay: w.deDisplay, isNoun: false, isCore: w.core === 1, isVerb: true };
      if (!byEn.has(enKey)) byEn.set(enKey, record);
      // An -ed or -ing form is a verb and nothing else, so it may be indexed
      // even when the bare word belongs to a noun: "change" stays die
      // Änderung while "changed" reaches ändern. This is where "decided",
      // "created", "managed" and "shared" were disappearing.
      const head = enKey.split(" ")[0];
      if (head.length < 2 || head.includes("'")) continue;
      const forms = [];
      if (head.endsWith("e")) forms.push(`${head}d`, `${head.slice(0, -1)}ing`);
      else if (/[^aeiou]y$/.test(head)) forms.push(`${head.slice(0, -1)}ied`, `${head}ing`);
      else if (/[^aeiou][aeiou][bdglmnprt]$/.test(head)) {
        forms.push(`${head}ed`, `${head + head.slice(-1)}ed`, `${head + head.slice(-1)}ing`, `${head}ing`);
      } else forms.push(`${head}ed`, `${head}ing`);
      for (const form of forms) {
        if (!byEn.has(form)) byEn.set(form, record);
      }
    }
  }

  /**
   * English words a plural rule must never touch: they end in s and are not
   * plurals of anything, and "its" resolving to es taught the wrong word.
   */
  const ENGLISH_S_WORDS = new Set([
    "its", "as", "was", "has", "is", "this", "his", "us", "yes", "does",
    "always", "perhaps", "unless", "news", "gas", "bus", "plus", "less",
    "else", "thus", "series", "species", "means", "goes", "says", "wants",
  ]);

  /**
   * An English plural, pointed at the singular the glossary stores.
   *
   * The reverse direction matched exactly, so "plugins", "customers",
   * "workflows" and fifty more found nothing while their singulars sat in
   * the glossary. A dictionary answers the plural with the dictionary form,
   * which is what a hover card shows anyway.
   */
  function englishSingularEntry(lower) {
    if (ENGLISH_S_WORDS.has(lower) || !lower.endsWith("s")) return null;
    const shapes = [];
    if (/[^aeiou]ies$/.test(lower) && lower.length > 4) shapes.push(`${lower.slice(0, -3)}y`);
    if (/(ch|sh|s|x|z)es$/.test(lower) && lower.length > 4) shapes.push(lower.slice(0, -2));
    if (/[^sui]s$/.test(lower) && lower.length > 3) shapes.push(lower.slice(0, -1));
    for (const shape of shapes) {
      const hit = byEn.get(shape);
      if (hit) return hit;
    }
    return null;
  }

  // Articles, pronouns, conjunctions, prepositions and auxiliary-verb forms:
  // Micheon teaches these through the sentences they appear in rather than
  // as standalone flashcards, so they never show up as their own word-list
  // entry. Left unfiltered, they dominated the real candidate list on
  // first testing ("die" 165x, "und" 168x) and buried every genuinely new
  // word this is supposed to surface -- excluded on purpose, not missing.
  const STOPWORDS = new Set([
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen", "eines",
    "und", "oder", "aber", "doch", "denn", "sondern", "als", "wie", "wenn", "dass", "weil", "ob",
    "ich", "du", "er", "sie", "es", "wir", "ihr", "mich", "dich", "sich", "uns", "euch",
    "mir", "ihm", "ihn", "ihnen", "wer", "wen", "wem", "wessen",
    "mein", "dein", "sein", "ihre", "unser", "euer", "ihren", "ihrer", "ihrem", "seinen", "seiner", "seinem",
    "unsere", "unserer", "unserem", "unseren", "ihres", "dessen", "deren",
    "in", "im", "ins", "an", "am", "ans", "auf", "aufs", "aus", "bei", "beim", "bis", "durch", "für", "fürs", "gegen", "mit", "nach",
    "ohne", "seit", "um", "unter", "von", "vor", "zu", "zum", "zur", "über", "hinter", "neben", "zwischen",
    "ist", "sind", "war", "waren", "wird", "werden", "wurde", "wurden", "hat", "haben", "hatte", "hatten",
    "kann", "können", "muss", "müssen", "soll", "sollen", "will", "wollen", "darf", "dürfen", "mag", "mögen",
    "nicht", "kein", "keine", "auch", "noch", "nur", "schon", "so", "sehr", "hier", "dort", "jetzt",
    "alle", "alles", "allem", "allen", "aller", "andere", "anderen", "jede", "jeder", "jedes", "jeden", "man", "mehr",
    "was", "habe", "sei", "dir", "deine", "deiner", "deinem", "deinen", "meine", "meiner",
    "meinem", "meinen", "seine", "dies", "diese", "dieser", "dieses", "diesen", "einige", "eure",
    "vom", "dar", "hin", "bevor", "gibt", "werde", "zwei",
  ]);

  // Not vocabulary: names, cities, brands, web fragments and English filler
  // that survive the letter checks. Case-insensitive, so collisions with
  // real German words are excluded from the LIST rather than handled --
  // no "Ernst" (seriousness), "Ritter" (knight), "brave" (well-behaved),
  // "also" (therefore), "Sparkasse", "Cola": a learner losing those to a
  // name filter would be worse than a stray name getting through.
  const NOT_VOCAB = new Set([
    // first names common in German and English text
    "alexander", "andreas", "anna", "ashley", "ben", "brandon", "brian", "charles", "christian",
    "christina", "christopher", "clara", "daniel", "david", "dennis", "elias", "elizabeth", "emilia",
    "emily", "emma", "erik", "fabian", "felix", "florian", "hannah", "hanna", "heinrich", "jan",
    "jana", "james", "jason", "jennifer", "jessica", "johanna", "johannes", "john", "jonas", "joseph",
    "joshua", "julia", "justin", "katharina", "katrin", "kevin", "klara", "klaus", "laura", "lea",
    "lena", "leon", "linda", "lisa", "lukas", "lucas", "ludwig", "manfred", "marco", "marie", "mark",
    "markus", "martin", "mary", "matthias", "matthew", "max", "maximilian", "melanie", "mia",
    "michael", "michelle", "monika", "moritz", "nadine", "nele", "nick", "niklas", "nico", "nina",
    "noah", "oliver", "oskar", "patricia", "patrick", "paul", "peter", "petra", "philipp", "ralf",
    "richard", "robert", "ryan", "sabrina", "sandra", "sara", "sarah", "sebastian", "simon", "sofia",
    "sophie", "stefan", "stephanie", "susanne", "sven", "thomas", "tim", "tobias", "tom", "uwe",
    "vanessa", "wilhelm", "william", "wolfgang",
    // cities (countries stay collectable -- they're real vocabulary)
    "amsterdam", "athen", "augsburg", "berlin", "bochum", "bonn", "bremen", "brüssel", "budapest",
    "dortmund", "dresden", "dublin", "duisburg", "düsseldorf", "edinburgh", "essen", "frankfurt",
    "hamburg", "hannover", "helsinki", "istanbul", "karlsruhe", "kassel", "kiel", "kopenhagen",
    "köln", "leipzig", "lissabon", "london", "madrid", "mannheim", "moskau", "münchen", "nürnberg",
    "oslo", "paris", "peking", "potsdam", "prag", "rom", "rostock", "stockholm", "stuttgart",
    "tokio", "warschau", "washington", "wien", "wiesbaden", "wuppertal", "zürich",
    // brands, products, platforms
    "adidas", "airbnb", "aldi", "amazon", "android", "anthropic", "apple", "audi", "babbel", "bmw",
    "chatgpt", "chrome", "claude", "deepl", "discord", "disney", "duolingo", "easyjet", "ebay",
    "edeka", "facebook", "fanta", "fifa", "firefox", "ford", "fortnite", "gmail", "google", "haribo",
    "honda", "ikea", "instagram", "iphone", "ipad", "joytan", "lego", "lidl", "linkedin", "lufthansa",
    "marvel", "mastercard", "mcdonalds", "mercedes", "microsoft", "milka", "minecraft", "netflix",
    "nike", "nintendo", "nutella", "openai", "opel", "paypal", "pepsi", "pinterest", "playmobil",
    "playstation", "pokemon", "porsche", "puma", "reddit", "rewe", "roblox", "rossmann", "ryanair",
    "safari", "samsung", "shein", "sky", "slack", "snapchat", "spotify", "starbucks", "telegram",
    "telekom", "temu", "tesla", "tiktok", "toyota", "twitch", "twitter", "uber", "visa", "vodafone",
    "volkswagen", "whatsapp", "wikipedia", "windows", "xbox", "youtube", "zalando", "zara",
    // web and file fragments
    "api", "aug", "com", "dev", "html", "http", "https", "jpg", "jun", "min", "mp3", "mp4", "net",
    "org", "pdf", "php", "png", "sta", "stat", "std", "url", "www",
    // English filler that shows up inside otherwise-German sentences
    "and", "app", "apps", "are", "audio", "beginner", "best", "but", "can", "channel", "comment",
    "comments", "could", "course", "courses", "download", "english", "follow", "for", "free", "from",
    "german", "get", "got", "has", "have", "hello", "here", "how", "intermediate", "just", "learn",
    "learning", "lesson", "lessons", "like", "more", "most", "new", "not", "one", "phrases", "please",
    "sentences", "share", "should", "some", "subscribe", "than", "thank", "thanks", "that", "the",
    "their", "them", "then", "there", "they", "this", "time", "two", "video", "videos", "vocabulary",
    "welcome", "were", "what", "when", "where", "which", "who", "why", "with", "words", "would",
    "you", "your", "actual", "actually", "all", "anyone", "apart", "around", "attic", "away", "back",
    "been", "being", "build", "building", "called", "catch", "change", "click", "close", "closest",
    "companies", "conductor", "create", "creator", "critical", "days", "description", "did", "doing",
    "done", "dressed", "dude", "dynamic", "each", "earth", "edit", "effort", "else", "even", "ever",
    "every", "excellent", "experience", "falling", "fantasy", "feel", "feels", "finds", "flying",
    "future", "game", "germany", "giving", "glorious", "guy", "hes", "him", "hit", "house",
    "immediately", "important", "improvement", "input", "interface", "internal", "its", "joke", "keep",
    "know", "label", "least", "left", "legal", "lets", "life", "listed", "long", "lot", "love",
    "machine", "made", "may", "mean", "means", "meanwhile", "meets", "mobile", "model", "models",
    "much", "must", "native", "need", "next", "nice", "night", "numbers", "old", "only", "our",
    "output", "over", "owner", "page", "pay", "people", "pixel", "play", "plugin", "popular", "pretty",
    "price", "pricing", "probably", "promoting", "purely", "putting", "ready", "reasoning", "recursive",
    "relationship", "research", "restore", "rich", "ridiculous", "right", "role", "room", "running",
    "scale", "seems", "self", "selling", "separate", "serve", "setup", "showing", "since", "sitting",
    "slipped", "smart", "sounds", "spawns", "spotted", "staff", "standards", "stateless", "streams",
    "stuff", "such", "sure", "teaser", "terminal", "terrible", "themes", "through", "throw", "tied",
    "tips", "too", "trailer", "transcribe", "trying", "twice", "updates", "used", "useful", "vanilla",
    "watch", "watching", "way", "web", "weeks", "while", "wife", "within", "wonderful", "workload", "worried", "wow",
    "alignment", "allocation", "analysis", "artificial", "bench", "beta", "core", "developers", "dish", "extra",
    "fold", "high", "his", "index", "intelligence", "iteration", "lab", "leak", "micro", "north", "per",
    "picker", "podcasts", "pushing", "reached", "slaving", "tbh", "token", "tours", "trek", "ultra",
    // additional brands, account names and English feed chrome observed in
    // the second real-world export
    "adonis", "anakin", "ananth", "andy", "angaisb", "balogun", "basil", "blueemi", "bluedev",
    "burnham", "choblin", "codex", "cursor", "daybreak", "elon", "farzyness", "gemini", "glm",
    "grok", "haider", "harshith", "hqmank", "jacobgold", "jones", "linux", "lumina", "manus",
    "marcelkargul", "musk", "notjazii", "omni", "owen", "polymarket", "qwen", "reset", "spacexai",
    "techdevnotes", "teslanacho", "theojaffee", "tibo", "trends", "yusuf", "zia",
    "about", "after", "agents", "already", "another", "boats", "coming", "continued", "delay",
    "does", "give", "good", "great", "instead", "meeting", "native", "never", "news", "now",
    "paper", "planning", "politics", "prime", "pro", "really", "release", "reports", "said",
    "small", "students", "suggested", "sunny", "testing", "told", "use", "users", "waiting", "work", "year",
    // Model and account names observed in the 2026-08-13 X export. They are
    // useful context on that page, but they are not reusable German words.
    "astra", "britannia", "brin", "chimney", "copilot", "crys", "deepseek", "devon", "fable",
    "glimmer", "gpt", "hale", "hermes", "holmes", "jarvis", "karoline", "leavitt", "leunen",
    "loughborough", "macrohard", "moira", "moonshot", "muse", "mythos", "optimus", "opus", "prober",
    "prosper", "puppet", "ramsay", "reuters", "ron", "sandbach", "sergey", "sherlock", "sol",
    "apache", "atg", "baron", "celebrity", "ceuta", "dosent", "fable-", "gboard", "giga",
    "hilarious", "londoner", "moat", "mog", "opus-", "ramada", "starlink", "stewart", "terra",
    "thorn", "trump", "unsloth",
    // Storefront brands, product lines, addresses and English development
    // copy observed in the 2026-08-13 export. These are page context, not
    // reusable German vocabulary, so do not make the learner export them
    // again after the useful words below have been reconciled.
    "amex", "apex", "blackcore", "category", "command", "electron", "gravastar", "hollyhill",
    "hosting", "klarna", "mediamarkt", "paribas", "repo", "rubberdome", "rüdesheimer", "saturn",
    "series", "sites", "steelseries", "submenu", "targobank", "turtle", "valorant", "vulcan",
    "access", "anything", "because", "built", "changing", "checkout", "codes", "content-", "custom",
    "databases", "existing", "features", "final", "install", "installing", "into", "itself", "keyboard",
    "keeping", "keys", "list", "looking", "mods", "node", "open", "press", "profile", "project", "public",
    "question", "rapid", "run", "same", "seconds", "services", "someone", "sound", "specifically",
    "support", "supported", "switches", "tell", "want", "wireless", "without", "yep",
    // Fragments and malformed product-page tokens that cannot become a
    // dependable glossary entry.
    "erst-", "handbgelenkauflage", "kasernenstr", "aktionsgerätes", "schnellstart-", "aktivierungs-",
    // People, places, products and English tech words riding inside German
    // sentences, from the 2026-08-25 export. Named one by one on purpose:
    // German capitalises every noun, so "always capitalised" would have taken
    // Demonstranten, Ärmelkanal, Schlauchboot and Schurkenstaat with it.
    // Countries are still absent from this list -- Katar and die Ukraine are
    // vocabulary a learner reading the news genuinely wants. "Echo" stays out
    // too: das Echo is a real German noun, whatever it named on the page.
    "amerikasee", "backend", "bnet", "britain", "cline", "compute", "dell", "diablo", "drogan",
    "essex", "farage", "gemma", "groq", "haiku", "headless", "howard", "inspiron", "lineup",
    "micheon", "nigel", "omarchy", "ontario", "philpott", "raze", "steam", "vice", "wardogs",
    "concu", "backend-", "dialogue-first", "low-poly", "mock-up",
    "alpha", "flash", "fran", "mac", "ontariosee", "ontariosees",
  ]);

  function looksLikeRealGermanCandidate(token) {
    if (token.length < 3 || token.length > 30) return false;
    if (!GERMAN_LETTER_RE.test(token)) return false;
    if (/^[A-ZÄÖÜ]+$/.test(token)) return false; // ALLCAPS: acronym/brand, not a word to learn
    // An uppercase letter anywhere past the first is brand-case (YouTube,
    // iPhone, TikTok, PayPal) -- German words never capitalise mid-word.
    if (/[A-ZÄÖÜ]/.test(token.slice(1))) return false;
    // Apostrophes are English contractions and possessives ("don't",
    // "Anna's"); the rare German ones ("geht's") aren't dictionary forms
    // worth collecting either.
    if (/['’]/.test(token)) return false;
    if (STOPWORDS.has(token.toLowerCase())) return false;
    if (NOT_VOCAB.has(token.toLowerCase())) return false;
    // The commonest English words are not German vocabulary, and a German
    // page is full of them. The de-inflection rules already refuse to guess
    // at this list; collecting the same words as "missing German" only fills
    // the export a reviewer reads with had, let, other, everyone and stood.
    if (ENGLISH_NEVER_GUESS.has(token.toLowerCase())) return false;
    return true;
  }

  /**
   * Is this token a person, place or product rather than a word?
   *
   * Capitalisation cannot answer that. German capitalises EVERY noun, so a
   * rule reading "always capitalised mid-sentence" throws away Demonstranten,
   * Ärmelkanal, Schlauchboot, Schurkenstaat and Abstellgleis along with the
   * names -- all real words a learner reading the news needs. NOT_VOCAB
   * carries the ones worth naming outright; the only structural rule here is
   * the one shape that cannot be a German noun: a capitalised word standing
   * directly behind a title or a known first name is that person's surname.
   */
  function looksLikeName(token, sentence) {
    if (!/^[A-ZÄÖÜ]/.test(token)) return false;
    const text = String(sentence || "");
    if (!text) return false;
    const before = text.slice(0, text.indexOf(token));
    const preceding = before.match(/([\p{Lu}][\p{L}]+)[\s.]+$/u);
    if (!preceding) return false;
    const lead = preceding[1].toLowerCase();
    return NAME_LEAD_INS.has(lead) || NOT_VOCAB.has(lead);
  }

  // Words that introduce a name. A capitalised word after one of these is the
  // person, not vocabulary -- "Präsident Trump", "Premierminister Farage".
  const NAME_LEAD_INS = new Set([
    "bundeskanzler", "bundeskanzlerin", "bundespräsident", "dr", "frau", "herr", "kanzler",
    "kanzlerin", "minister", "ministerin", "premierminister", "präsident", "präsidentin",
    "professor", "senator", "senatorin", "sir", "trainer", "trainerin",
  ]);

  /**
   * An English word worth reporting as a gap in the course.
   *
   * Only reached when the reverse index already failed to find German for it,
   * so by definition this is something the reader met and Micheon cannot say.
   * Short words and the everyday filler are dropped: the useful signal is the
   * topic word ("asylum", "trustworthiness", "monetized"), not "seeing".
   */
  function looksLikeEnglishTopicWord(token, lower) {
    if (lower.length < 5 || lower.length > 24) return false;
    if (!/^[a-z][a-z-]*[a-z]$/.test(lower)) return false;
    if (/[äöüß]/.test(lower)) return false;
    if (STOPWORDS.has(lower) || NOT_VOCAB.has(lower) || ENGLISH_NEVER_GUESS.has(lower)) return false;
    // Already German, just lowercase and unknown to the glossary -- that is
    // the other bucket's business, not this one.
    return !byDeLowerAny.has(lower);
  }

  function noteMissing(counts, examples, word, sentence) {
    counts.set(word, (counts.get(word) || 0) + 1);
    const seen = examples.get(word) || new Set();
    if (sentence && !IS_PRIVATE_PAGE) seen.add(sentence);
    while (seen.size > 4) seen.delete(seen.values().next().value);
    examples.set(word, seen);
    scheduleFlush();
  }

  function examplesForMissing(entry) {
    const candidates = [
      ...(Array.isArray(entry?.examples) ? entry.examples : []),
      entry?.example,
    ];
    return [...new Set(candidates
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 4 && value.length <= 220))]
      .slice(0, 4);
  }

  /**
   * Is this collected word one we can now answer?
   *
   * Reconciliation runs on every page load, so an updated glossary should
   * clear the words it has learned without anybody pressing anything. It was
   * only asking two questions though — is this word in the glossary exactly,
   * and is it in the hand-written alias list — while the hover card had grown
   * two more ways to answer: the de-inflection rules, and the German we hold
   * for an English word. So a word stayed on the list after the very release
   * that taught it, and turned up again in the next export.
   *
   * This asks exactly what a hover asks. If the card would say something,
   * the word is not missing any more.
   */
  function candidateAlreadyTaught(word) {
    const lower = String(word || "").toLowerCase();
    if (findGermanEntry(word, { allowCaseFold: true })) return true;
    if (findGermanEntry(lower, { allowCaseFold: true })) return true;
    if (!ENGLISH_NEVER_GUESS.has(lower) && /^[a-z][a-z'-]{2,}$/.test(lower)) {
      if (byEn.get(lower) || englishSingularEntry(lower)) return true;
    }
    return false;
  }

  async function reconcileStoredCandidates() {
    const { missingVocab = {} } = await chrome.storage.local.get("missingVocab");
    const cleaned = {};
    let removed = 0;
    for (const [word, entry] of Object.entries(missingVocab)) {
      if (!looksLikeRealGermanCandidate(word) || candidateAlreadyTaught(word)) {
        removed += 1;
        continue;
      }
      const priorExamples = examplesForMissing(entry);
      const examples = priorExamples.filter((example) => exampleSupportsCandidate(example, word));
      // Old extension builds sometimes collected navigation labels, account
      // names and English feed chrome. If every captured sentence fails the
      // German check, this came from noisy UI rather than useful German prose.
      if (priorExamples.length > 0 && examples.length === 0) {
        removed += 1;
        continue;
      }
      cleaned[word] = {
        count: Math.max(1, Number(entry?.count) || 1),
        example: examples[0] || "",
        examples,
      };
    }
    const changed = removed > 0 || JSON.stringify(cleaned) !== JSON.stringify(missingVocab);
    if (changed) await chrome.storage.local.set({ missingVocab: cleaned });
    return { ok: true, removed, remaining: Object.keys(cleaned).length };
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushMissingVocab, FLUSH_DELAY_MS);
  }

  function mergeInto(store, counts, examples) {
    for (const [word, count] of counts) {
      const prior = store[word];
      const observed = examples.get(word) || new Set();
      const merged = [...new Set([...examplesForMissing(prior), ...observed])].slice(0, 4);
      store[word] = {
        count: (prior?.count || 0) + count,
        example: merged[0] || "",
        examples: merged,
      };
    }
    return Object.fromEntries(
      Object.entries(store)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, MISSING_VOCAB_CAP)
    );
  }

  async function flushMissingVocab() {
    flushTimer = null;
    if (missingCounts.size === 0 && englishCounts.size === 0) return;
    const stored = await chrome.storage.local.get(["missingVocab", "missingEnglish"]);
    const patch = {};
    if (missingCounts.size) {
      patch.missingVocab = mergeInto(stored.missingVocab || {}, missingCounts, missingExamples);
    }
    if (englishCounts.size) {
      patch.missingEnglish = mergeInto(stored.missingEnglish || {}, englishCounts, englishExamples);
    }
    missingCounts = new Map();
    missingExamples = new Map();
    englishCounts = new Map();
    englishExamples = new Map();
    await chrome.storage.local.set(patch);
  }

  // ── tooltip ───────────────────────────────────────────────────────────
  // One shared element at the document root (position: fixed), placed from
  // the hovered word's viewport rect and clamped to the screen. See the
  // stylesheet for why this replaced a per-word ::after tooltip. Attached
  // to <html> rather than <body>: a transformed ancestor re-anchors
  // position:fixed to itself, and pages transform <body> more often than
  // they transform the root element.
  let tipEl = null;
  let tipTextEl = null;
  let tipExampleEl = null;
  let tipSpeakEl = null;
  // Viewport rect of the word the tip currently belongs to, captured when
  // it was shown. Kept as a plain rectangle rather than an element
  // reference on purpose: the element can be destroyed by the page at any
  // moment (see hideWhenPointerLeaves) and the geometry still has to work.
  let anchorRect = null;
  let tipShown = false;

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "micheon-gloss-tip";
    tipEl.dataset.micheon = "1";
    tipTextEl = document.createElement("span");
    tipTextEl.className = "micheon-gloss-tip-text";
    tipSpeakEl = document.createElement("button");
    tipSpeakEl.className = "micheon-gloss-tip-speak";
    tipSpeakEl.type = "button";
    tipSpeakEl.title = "Play the German";
    tipSpeakEl.textContent = "🔊";
    tipSpeakEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearPendingHoverSpeech();
      speakGerman(tipEl?.dataset.micheonDe || "", { force: true });
    });
    // The example sits under the gloss, not beside it: a hover card that
    // says only "house" tells you what the word means and nothing about how
    // it is used, which is the reason to hover a word on a German page at all.
    tipExampleEl = document.createElement("span");
    tipExampleEl.className = "micheon-gloss-tip-example";
    tipEl.appendChild(tipTextEl);
    tipEl.appendChild(tipSpeakEl);
    tipEl.appendChild(tipExampleEl);
    document.documentElement.appendChild(tipEl);
    return tipEl;
  }

  // Every visual property is written as an important INLINE style. The
  // stylesheet's `all: unset !important` outranks any plain declaration and
  // even out-specified class rules failed against it; an important inline
  // style is the one thing that reliably wins.
  function paintTip(visible) {
    if (!tipEl) return;
    tipEl.style.setProperty("opacity", visible ? "1" : "0", "important");
    tipEl.style.setProperty("visibility", visible ? "visible" : "hidden", "important");
    // The tip body stays click-through even while visible, so it never
    // swallows a click meant for the page underneath it. Only the speaker
    // button takes clicks, and it re-enables itself in the stylesheet.
    tipEl.style.setProperty("pointer-events", "none", "important");
    if (tipSpeakEl) tipSpeakEl.style.setProperty("pointer-events", visible ? "auto" : "none", "important");
    tipEl.classList.toggle("micheon-visible", visible);
    tipShown = visible;
  }

  // The range entry the tip is currently showing; also the once-per-hover
  // guard for spoken audio.
  let activeEntry = null;
  let pendingHoverSpeech = null;
  let lastSpokenText = "";
  let lastSpokenAt = 0;

  function clearPendingHoverSpeech() {
    if (pendingHoverSpeech !== null) {
      clearTimeout(pendingHoverSpeech);
      pendingHoverSpeech = null;
    }
  }

  // The extension catalogue stores dictionary forms so the app and
  // extension share one teachable item. Real pages naturally contain
  // conjugations, declined adjectives and plurals. These aliases came from
  // the reviewed Immersion export and point those observed forms back to an
  // existing lemma instead of falsely reporting each one as missing vocab.
  // This is deliberately curated rather than a suffix guesser: German
  // morphology has too many collisions for a confident hover definition.
  const OBSERVED_FORM_TO_LEMMA = new Map(Object.entries({
    // The closed classes, written out, because no suffix rule reaches them:
    // "bist" does not contain "sein" and "jedem" does not contain "jeder".
    // These are among the commonest words on any German page — jedem alone
    // turned up eighteen times in one export — and every one of them was
    // being reported as unknown vocabulary.
    "bin": "sein", "bist": "sein", "ist": "sein", "sind": "sein", "seid": "sein",
    "war": "sein", "warst": "sein", "waren": "sein", "wart": "sein",
    "wäre": "sein", "wären": "sein", "gewesen": "sein", "sei": "sein", "seien": "sein",
    "habe": "haben", "hast": "haben", "hat": "haben", "habt": "haben",
    "hatte": "haben", "hattest": "haben", "hatten": "haben", "hättest": "haben",
    "hätte": "haben", "hätten": "haben", "gehabt": "haben",
    "werde": "werden", "wirst": "werden", "wird": "werden", "werdet": "werden",
    "wurde": "werden", "wurden": "werden", "würde": "werden", "würden": "werden",
    "kann": "können", "kannst": "können", "könnt": "können", "konnte": "können",
    "konnten": "können", "könnte": "können", "könnten": "können", "gekonnt": "können",
    "muss": "müssen", "musst": "müssen", "müsst": "müssen", "musste": "müssen",
    "mussten": "müssen", "müsste": "müssen", "gemusst": "müssen",
    "will": "wollen", "willst": "wollen", "wollt": "wollen", "wollte": "wollen",
    "wollten": "wollen", "gewollt": "wollen",
    "soll": "sollen", "sollst": "sollen", "sollt": "sollen", "sollte": "sollen",
    "sollten": "sollen", "gesollt": "sollen",
    "darf": "dürfen", "darfst": "dürfen", "dürft": "dürfen", "durfte": "dürfen",
    "durften": "dürfen", "dürfte": "dürfen",
    "mag": "mögen", "magst": "mögen", "mögt": "mögen", "mochte": "mögen",
    "jeder": "jeder", "jede": "jeder", "jedes": "jeder", "jedem": "jeder",
    "jeden": "jeder", "jedwede": "jeder",
    "dieser": "dieser", "diese": "dieser", "dieses": "dieser", "diesem": "dieser",
    "diesen": "dieser",
    "welcher": "welcher", "welche": "welcher", "welches": "welcher",
    "welchem": "welcher", "welchen": "welcher",
    "mancher": "manche", "manche": "manche", "manches": "manche",
    "manchem": "manche", "manchen": "manche",
    // Strong verbs change their stem vowel, which no suffix rule can undo:
    // dachte is denken, eingebrochen is einbrechen, teilnimmt is teilnehmen.
    // These were reaching nothing, and the one thing worse would be a guess —
    // the suffix rules would happily read "dachte" as the noun Dach.
    "dachte": "denken", "dachten": "denken", "gedacht": "denken",
    "eingebrochen": "einbrechen", "einbrach": "einbrechen",
    "teilnimmt": "teilnehmen", "teilnimm": "teilnehmen",
    "hereingebrochen": "hereinbrechen",
    "anderem": "andere", "anderen": "andere", "anderer": "andere", "anderes": "andere",
    "besonderem": "besonders", "besonderen": "besonders", "besonderer": "besonders",
    "modi": "Modus", "modus": "Modus",
    "eigener": "eigen", "eigene": "eigen", "eigenes": "eigen",
    "eigenem": "eigen", "eigenen": "eigen",
    "übersetzt": "übersetzen",
    "vereinigtes": "vereinigen",
    "bots": "Bot",
    "sieht": "sehen",
    "sieh": "sehen",
    "gefragt": "fragen",
    "zieht": "ziehen",
    "informationen": "Information",
    "funktionen": "Funktion",
    "antworten": "antworten",
    "schalte": "schalten",
    "spar": "sparen",
    "statistiken": "Statistik",
    "mitteilungen": "Mitteilung",
    "startseite": "Startseite",
    "premium": "Premium-Abo",
    "kollektive": "kollektiv",
    "anmerkungen": "Anmerkung",
    "vorgeschlagene": "vorschlagen",
    "booste": "boosten",
    "bedingungen": "Bedingung",
    "gestartet": "starten",
    "unterstützten": "unterstützen",
    "projekten": "Projekt",
    "personen": "Person",
    "folgt": "folgen",
    "benutzt": "benutzen",
    "läuft": "laufen",
    "agenten": "Agent",
    "länder": "Land",
    "wärmeren": "warm",
    "gartenschläuche": "Gartenschlauch",
    "erbärmlichen": "erbärmlich",
    "verabscheue": "verabscheuen",
    "frühen": "früh",
    "echte": "echt",
    "echten": "echt",
    "möchtest": "möchten",
    "neues": "neu",
    "repostet": "reposten",
    "gepostet": "posten",
    "gezweifelt": "zweifeln",
    "geworden": "werden",
    "meisten": "meist",
    "anwendungsfälle": "Anwendungsfall",
    "stellenabbauten": "Stellenabbau",
    "erledigter": "erledigen",
    "tools": "Tool",
    "aktive": "aktiv",
    "bietet": "bieten",
    "könnte": "können",
    "modelle": "Modell",
    "sagt": "sagen",
    "kannst": "können",
    "versprochen": "versprechen",
    "sammelt": "sammeln",
    "gesammelt": "sammeln",
    "schwedische": "schwedisch",
    "schwedischen": "schwedisch",
    "schwedischer": "schwedisch",
    "schwedisches": "schwedisch",
    "tote": "tot",
    "toten": "tot",
    "toter": "tot",
    "totes": "tot",
    "zusätzlichen": "zusätzlich",
    "überschritten": "überschreiten",
    "angesprochen": "ansprechen",
    "behauptete": "behaupten",
    "beträgt": "betragen",
    "beweist": "beweisen",
    "boote": "Boot",
    "dinge": "Ding",
    "eigene": "eigen",
    "dümmer": "dumm",
    "erzählt": "erzählen",
    "extreme": "extrem",
    "freizugeben": "freigeben",
    "gegenden": "Gegend",
    "gemeinden": "Gemeinde",
    "gesamten": "ganz",
    "gebiete": "Gebiet",
    "gelöst": "lösen",
    "geschwister": "Geschwister",
    "hätten": "haben",
    "kurzbefehle": "Kurzbefehl",
    "menschen": "Mensch",
    "monaten": "Monat",
    "perfektes": "perfekt",
    "passiert": "passieren",
    "preise": "Preis",
    "scheint": "scheinen",
    "spricht": "sprechen",
    "treffe": "treffen",
    "verdammte": "verdammt",
    "veröffentlicht": "veröffentlichen",
    "verfasst": "verfassen",
    "verfügt": "verfügen",
    "verärgert": "verärgern",
    "wohlhabende": "wohlhabend",
    "ärmsten": "arm",
    "angezeigt": "anzeigen",
    "anzuzeigen": "anzeigen",
    "aufgehoben": "aufheben",
    "außergewöhnliche": "außergewöhnlich",
    "behoben": "beheben",
    "benötigt": "benötigen",
    "bestehender": "bestehen",
    "bewertungen": "Bewertung",
    "britischen": "britisch",
    "empfohlen": "empfehlen",
    "erreicht": "erreichen",
    "grundlegende": "grundlegend",
    "gelandet": "landen",
    "landet": "landen",
    "lehnt": "ablehnen",
    "umzusteigen": "umsteigen",
    "verliert": "verlieren",
    "weigern": "weigern",
    "wähle": "wählen",
    "aktuelle": "aktuell",
    "auszuprobieren": "ausprobieren",
    "gegeben": "geben",
    "abgesagt": "absagen",
    "berichtet": "berichten",
    "erstellt": "erstellen",
    "generierter": "generieren",
    "kleine": "klein",
    "kleinen": "klein",
    "plant": "planen",
    "risse": "Riss",
    "tage": "Tag",
    "bleibt": "bleiben",
    "chemische": "chemisch",
    "chinesischer": "chinesisch",
    "dachtest": "denken",
    "denke": "denken",
    "dumme": "dumm",
    "einzelnen": "einzeln",
    "erwartungen": "Erwartung",
    "fortschritte": "Fortschritt",
    "gesunken": "sinken",
    "großer": "groß",
    "höchstes": "hoch",
    "inhalte": "Inhalt",
    "konversationen": "Konversation",
    "langjährigen": "langjährig",
    "nutzern": "Nutzer",
    "probleme": "Problem",
    "seines": "sein",
    "sofortige": "sofort",
    "starte": "starten",
    "ständigen": "ständig",
    "tiefen": "tief",
    "typen": "Typ",
    "verdammter": "verdammt",
    "vereinigten": "vereinigen",
    "vergangenen": "vergangen",
    "verkäufe": "Verkauf",
    "vorhandenen": "vorhanden",
    "waldbrände": "Waldbrand",
    "zweiten": "zweite",
    // Reviewed 2026-08-13 Immersion export. These are ordinary inflections
    // of words Micheon already teaches, not 100+ genuinely missing lessons.
    "bedeutende": "bedeutend",
    "gleichen": "gleich",
    "gleicher": "gleich",
    "stellt": "darstellen",
    "gesagt": "sagen",
    "wäre": "sein",
    "gewinnt": "gewinnen",
    "großartiges": "großartig",
    "verbesserte": "verbessern",
    "wochen": "Woche",
    "hinzu": "hinzufügen",
    "fügen": "hinzufügen",
    "fügt": "hinzufügen",
    "kommt": "kommen",
    "beste": "gut",
    "ergänzenden": "ergänzen",
    "ersten": "erste",
    "erzielt": "erzielen",
    "gemeinschaften": "Gemeinschaft",
    "herausragender": "herausragend",
    "lokalen": "lokal",
    "lokale": "lokal",
    "massive": "massiv",
    "nächsten": "nächste",
    "schließt": "schließen",
    "sollte": "sollen",
    "verdopple": "verdoppeln",
    "verdoppelt": "verdoppeln",
    "zurückgegeben": "zurückgeben",
    "enthüllt": "enthüllen",
    "liegt": "liegen",
    "menschliches": "menschlich",
    "weitere": "weiter",
    "weiteres": "weiter",
    "abgestimmt": "abstimmen",
    "allgemeinen": "allgemein",
    "aufgaben": "Aufgabe",
    "aufruft": "aufrufen",
    "befindet": "befinden",
    "bezeichnet": "bezeichnen",
    "bringt": "bringen",
    "gehofft": "hoffen",
    "genommen": "nehmen",
    "große": "groß",
    "großen": "groß",
    "hotels": "Hotel",
    "komplexe": "komplex",
    "mehreren": "mehrere",
    "nehme": "nehmen",
    "preises": "Preis",
    "quellen": "Quelle",
    "schlägt": "schlagen",
    "steck": "stecken",
    "trifft": "treffen",
    "versucht": "versuchen",
    "wiederholungen": "Wiederholung",
    "worte": "Wort",
    "zieh": "ziehen",
    "geringeren": "gering",
    "hauses": "Haus",
    "milliarden": "Milliarde",
    "augenhöhe": "Augenhöhe",
    "bildschirmgrößen": "Bildschirmgröße",
    "teamkollegen": "Teamkollege",
    "beamter": "Beamte",
    "kritiker": "Kritiker",
    "moderatorin": "Moderatorin",
    "pressesprecherin": "Pressesprecherin",
    "satellitenbilder": "Satellitenbild",
    "zeichnungen": "Zeichnung",
    "abgeschnitten": "abschneiden",
    "abgeschoben": "abschieben",
    "abzustoßen": "abstoßen",
    "afghanischen": "afghanisch",
    "analysiert": "analysieren",
    "anspruchsvolle": "anspruchsvoll",
    "anzuziehen": "anziehen",
    "aufgefordert": "auffordern",
    "ausgerollt": "ausrollen",
    "ausgezeichnetes": "ausgezeichnet",
    "bedroht": "bedrohen",
    "beeindruckender": "beeindruckend",
    "eingebaut": "einbauen",
    "eingesammelt": "einsammeln",
    "eingeschaltet": "einschalten",
    "einmaligen": "einmalig",
    "einschließlich": "einschließlich",
    "entscheidender": "entscheidend",
    "enttäuschend": "enttäuschend",
    "festzustellen": "feststellen",
    "freut": "freuen",
    "führendes": "führen",
    "gefährliche": "gefährlich",
    "gehalten": "halten",
    "gehasst": "hassen",
    "geliefert": "liefern",
    "genutzt": "nutzen",
    "geöffnet": "öffnen",
    "gespeichert": "speichern",
    "mitzuhalten": "mithalten",
    "objekte": "Objekt",
    "öffentliche": "öffentlich",
    "platzierte": "platzieren",
    "routinen": "Routine",
    "sonnige": "sonnig",
    "spielt": "spielen",
    "technische": "technisch",
    "trainiert": "trainieren",
    "überfüllte": "überfüllt",
    "umzusetzen": "umsetzen",
    "untergebracht": "unterbringen",
    "unvollständige": "unvollständig",
    "verändert": "verändern",
    "verbleibenden": "verbleiben",
    "verkabelt": "verkabeln",
    "verkleinert": "verkleinern",
    "verlegt": "verlegen",
    "verteilt": "verteilen",
    "verursacht": "verursachen",
    "verzögert": "verzögern",
    "vorgestellt": "vorstellen",
    "wichtiger": "wichtig",
    "wichtigsten": "wichtig",
    "wöchentlichen": "wöchentlich",
    "zurückgeblieben": "zurückbleiben",
    "zurücktritt": "zurücktreten",
    "zurückzuführen": "zurückführen",
    "zusammengetrieben": "zusammentreiben",
    // More forms from the same export. Keeping these as lookup aliases means
    // the learner sees the authored dictionary entry and the exporter stops
    // reporting normal conjugation/plural/adjective endings as new lessons.
    "punkte": "Punkt",
    "benchmarks": "Benchmark",
    "initiale": "initial",
    "migranten": "Migrant",
    "erklärt": "erklären",
    "mehrstufige": "mehrstufig",
    "sag": "sagen",
    "sage": "sagen",
    "sagst": "sagen",
    "typische": "typisch",
    "illegaler": "illegal",
    "internen": "intern",
    "weißen": "weiß",
    "würde": "werden",
    "aktuellen": "aktuell",
    "alten": "alt",
    "ausgeführt": "ausführen",
    "bewältigt": "bewältigen",
    "bilder": "Bild",
    "dokumente": "Dokument",
    "einfachem": "einfach",
    "einzigartige": "einzigartig",
    "einziger": "einzig",
    "empfehlungen": "Empfehlung",
    "erkennt": "erkennen",
    "erlebt": "erleben",
    "erledigt": "erledigen",
    "festgestellt": "feststellen",
    "frühe": "früh",
    "fähigkeiten": "Fähigkeit",
    "ganzen": "ganz",
    "gebauter": "bauen",
    "gesehen": "sehen",
    "gespräche": "Gespräch",
    "grünen": "grün",
    "gutes": "gut",
    "hab": "haben",
    "halte": "halten",
    "hasst": "hassen",
    "hast": "haben",
    "heilige": "heilig",
    "herzlichen": "herzlich",
    "heutigen": "heute",
    "hilft": "helfen",
    "hinzugefügt": "hinzufügen",
    "hohen": "hoch",
    "häuser": "Haus",
    "ideen": "Idee",
    "intelligente": "intelligent",
    "kinder": "Kind",
    "kleinster": "klein",
    "kommenden": "kommen",
    "komplexer": "komplex",
    "kostenlosen": "kostenlos",
    "kritischen": "kritisch",
    "lass": "lassen",
    "letzten": "letzte",
    "letzter": "letzte",
    "liebend": "lieben",
    "liebten": "lieben",
    "löscht": "löschen",
    "millionen": "Million",
    "minuten": "Minute",
    "modells": "Modell",
    "musst": "müssen",
    "männer": "Mann",
    "naiven": "naiv",
    "neue": "neu",
    "neueste": "neu",
    "niedrigsten": "niedrig",
    "nutzt": "nutzen",
    "probiere": "probieren",
    "projekte": "Projekt",
    "realen": "real",
    "ressourcen": "Ressource",
    "riesigen": "riesig",
    "schaut": "schauen",
    "schichten": "Schicht",
    "schneidet": "schneiden",
    "schulen": "Schule",
    "sehe": "sehen",
    "spaniens": "Spanien",
    "steht": "stehen",
    "straßen": "Straße",
    "stunden": "Stunde",
    "systeme": "System",
    "szenen": "Szene",
    "tages": "Tag",
    "verschiedene": "verschieden",
    "versionen": "Version",
    "verrückter": "verrückt",
    "wollte": "wollen",
    "zeiten": "Zeit",
    // Inflections and display forms from the 2026-08-13 shopping/device
    // export. Mapping them to the hardcoded lemma makes highlighting work
    // immediately and removes the resolved form from future exports.
    "sekunden": "Sekunde",
    "monatliche": "monatlich",
    "monate": "Monat",
    "produkte": "Produkt",
    "gewählten": "wählen",
    "tastaturen": "Tastatur",
    "teilzahlungen": "Teilzahlung",
    "drittanbietern": "Drittanbieter",
    "volljährige": "volljährig",
    "eigenen": "eigen",
    "schnelle": "schnell",
    "tasten": "Taste",
    "würden": "werden",
    "volle": "voll",
    "finanzierungen": "Finanzierung",
    "höchsten": "hoch",
    "jahren": "Jahr",
    "abnehmbare": "abnehmbar",
    "basierend": "basieren",
    "betriebssysteme": "Betriebssystem",
    "einstellungen": "Einstellung",
    "gesetzlichen": "gesetzlich",
    "gesetzliche": "gesetzlich",
    "jeweiligen": "jeweilig",
    "leistungen": "Leistung",
    "aktionen": "Aktion",
    "ausgeschlossen": "ausschließen",
    "bestellt": "bestellen",
    "erhältst": "erhalten",
    "kabellose": "kabellos",
    "kostenlose": "kostenlos",
    "magnetische": "magnetisch",
    "märkten": "Markt",
    "passe": "anpassen",
    "schneller": "schnell",
    "unterstützt": "unterstützen",
    "verträge": "Vertrag",
    "deutschen": "deutsch",
    "eingaben": "Eingabe",
    "erstklassige": "erstklassig",
    "geräte": "Gerät",
    "kombinationen": "Kombination",
    "präziser": "präzise",
    "sattes": "satt",
    "tastenanschläge": "Tastendruck",
    "vorteile": "Vorteil",
    "anzupassen": "anpassen",
    "ausgewählte": "auswählen",
    "ausgewählten": "auswählen",
    "durchgeführt": "durchführen",
    "effekte": "Effekt",
    "effektive": "effektiv",
    "flache": "flach",
    "griffige": "griffig",
    "individuellen": "individuell",
    "integrierter": "integriert",
    "mechanischen": "mechanisch",
    "produkten": "Produkt",
    "reaktionen": "Reaktion",
    "richtungswechsel": "Richtungswechsel",
    "tastenkappen": "Tastenkappe",
    "versendet": "versenden",
    "zahlungsoptionen": "Zahlungsoption",
    "änderungen": "Änderung",
    "erfolgt": "erfolgen",
    "gilt": "gelten",
    "kontaktieren": "kontaktieren",
    "ermöglicht": "ermöglichen",
    "sorgt": "sorgen",
    "auslieferung": "Auslieferung",
    "vorbestellung": "Vorbestellung",
    "versandkosten": "Versandkosten",
    "lieferumfang": "Lieferumfang",
    "kaufpreis": "Kaufpreis",
    "ratenkauf": "Ratenkauf",
    "sofortversand": "Sofortversand",
    "wohnsitz": "Wohnsitz",
    "widerrufsrecht": "Widerrufsrecht",
    "widerrufsfrist": "Widerrufsfrist",
    "jahreszins": "Jahreszins",
    "sollzinssatz": "Sollzinssatz",
    "kreditrahmen": "Kreditrahmen",
    "mindestrate": "Mindestrate",
    "schlussrate": "Schlussrate",
    "einmalzahlung": "Einmalzahlung",
    "handballenauflage": "Handballenauflage",
    "beleuchtung": "Beleuchtung",
    "schalter": "Schalter",
    "gehäuse": "Gehäuse",
    "helligkeit": "Helligkeit",
    "latenz": "Latenz",
    "präzision": "Präzision",
    "komfort": "Komfort",
    "elektronik": "Elektronik",
    "aktivierung": "Aktivierung",
    "deaktivierung": "Deaktivierung",
    "auslösepunkt": "Auslösepunkt",
    "abtastrate": "Abtastrate",
  }));

  /**
   * The strong verbs, written as principal parts.
   *
   * A strong verb changes its stem vowel, and no suffix rule can undo that:
   * gefunden does not contain finden, gibt does not contain geben, gegangen
   * does not contain gehen. The map above had picked these up one at a time as
   * somebody noticed them, and the newest export shows what that leaves: of the
   * fifty-one commonest strong forms, thirty-six resolved to nothing, and every
   * one of their infinitives was already in the glossary. These are not rare
   * words -- they are sein, geben, gehen, nehmen, finden, sprechen -- so the
   * reader was getting silence on the most ordinary verbs on the page while
   * obscure compounds glossed fine.
   *
   * Written by verb rather than by form, because that is how the language is
   * organised and how the list stays checkable: each line is one verb's parts,
   * and check-immersion-extension asserts that no form is claimed by two verbs.
   *
   * A separable verb contributes only its JOINED participle (aufgenommen). Its
   * separated forms are two tokens on the page -- nimmt ... auf -- which a
   * single-token lookup can never see, and its bare stem belongs to the base
   * verb, where it would fight with it.
   */
  const STRONG_VERB_FORMS = {
    "sein": "gewesen",
    "werden": "ward worden",
    "geben": "gab gaben gabst gabt gegeben gibst gibt gäbe gäben",
    "nehmen": "genommen nahm nahmen nimmst nimmt nähme",
    "sprechen": "gesprochen sprach sprachen sprachst spracht sprichst spricht spräche",
    "sehen": "gesehen sah sahen siehst sieht sähe",
    "gehen": "gegangen ging ginge gingen gingst",
    "stehen": "gestanden stand standen stände stünde",
    "verstehen": "verstand verstanden verstünde",
    "bestehen": "bestand bestanden",
    "entstehen": "entstand entstanden",
    "finden": "fand fanden fandst fände gefunden",
    "stattfinden": "stattgefunden",
    "kommen": "gekommen kam kamen kamst käme",
    "bekommen": "bekam bekamen bekäme",
    "nennen": "genannt nannte nannten",
    "bringen": "brachte brachten gebracht",
    "verbringen": "verbracht verbrachte",
    "kennen": "gekannt kannte kannten",
    "erkennen": "erkannt erkannte erkannten",
    "wissen": "gewusst wusste wussten wüsste",
    "treffen": "getroffen traf trafen triffst trifft träfe",
    "helfen": "geholfen half halfen hilfst hilft hülfe",
    "erscheinen": "erschien erschienen",
    "scheinen": "geschienen schien schienen",
    "steigen": "gestiegen stieg stiegen",
    "entscheiden": "entschied entschieden",
    "schreiben": "geschrieben schrieb schrieben",
    "bleiben": "blieb blieben geblieben",
    "lesen": "gelesen las lasen liest läse",
    "essen": "aß aßen gegessen isst äße",
    "trinken": "getrunken trank tranken tränke",
    "singen": "gesungen sang sangen",
    "sitzen": "gesessen saß saßen säße",
    "liegen": "gelegen lag lagen läge",
    "laufen": "gelaufen lief liefen läufst läuft",
    "fahren": "fuhr fuhren fährst fährt gefahren",
    "tragen": "getragen trug trugen trägst trägt trüge",
    "schlagen": "geschlagen schlug schlugen schlägst schlägt",
    "halten": "gehalten hielt hielten hält hältst",
    "enthalten": "enthielt enthielten enthält enthältst",
    "behalten": "behielt behielten behält behältst",
    "fallen": "fiel fielen fällst fällt gefallen",
    "gefallen": "gefiel gefielen gefällst gefällt",
    "lassen": "gelassen ließ ließe ließen lässt",
    "verlassen": "verließ verließen verlässt",
    "schlafen": "geschlafen schlief schliefen schläfst schläft",
    "raten": "geraten riet rieten rät rätst",
    "waschen": "gewaschen wusch wuschen wäschst wäscht",
    "wachsen": "gewachsen wuchs wuchsen wächst",
    "ziehen": "gezogen zog zogen zöge",
    "fliegen": "flog flogen flöge geflogen",
    "schließen": "geschlossen schließt schloss schlossen",
    "verlieren": "verlor verloren verlöre",
    "schießen": "geschossen schoss schossen",
    "werfen": "geworfen warf warfen wirfst wirft würfe",
    "sterben": "gestorben starb starben stirbst stirbt",
    "brechen": "brach brachen brichst bricht gebrochen",
    "versprechen": "versprach versprichst verspricht",
    "empfehlen": "empfahl empfiehlst empfiehlt empfohlen",
    "stehlen": "gestohlen stahl stiehlst stiehlt",
    "befehlen": "befahl befiehlst befiehlt befohlen",
    "messen": "gemessen maß maßen misst",
    "vergessen": "vergaß vergaßen vergessen vergisst",
    "gewinnen": "gewann gewannen gewonnen gewönne",
    "beginnen": "begann begannen begonnen begönne",
    "schwimmen": "geschwommen schwamm schwammen",
    "springen": "gesprungen sprang sprangen",
    "zwingen": "gezwungen zwang zwangen",
    "gelingen": "gelang gelangen gelungen",
    "klingen": "geklungen klang klangen",
    "binden": "band banden gebunden",
    "verschwinden": "verschwand verschwanden verschwunden",
    "schneiden": "geschnitten schnitt schnitten",
    "greifen": "gegriffen griff griffen",
    "reiten": "geritten ritt ritten",
    "streiten": "gestritten stritt stritten",
    "leiden": "gelitten litt litten",
    "bitten": "bat baten gebeten",
    "beißen": "biss bissen gebissen",
    "reißen": "gerissen riss rissen",
    "heißen": "geheißen hieß hießen",
    "rufen": "gerufen rief riefen",
    "tun": "getan tat taten tust tut",
    "fangen": "fing fingen gefangen",
    "anfangen": "angefangen",
    "hängen": "gehangen hing hingen",
    "gelten": "galt galten gegolten gilt giltst",
    "treten": "getreten trat traten tritt trittst",
    "bieten": "bot boten geboten",
    "anbieten": "angeboten",
    "verbieten": "verbot verboten",
    "schieben": "geschoben schob schoben",
    "heben": "gehoben hob hoben",
    "lügen": "gelogen log logen",
    "betrügen": "betrog betrogen",
    "riechen": "gerochen roch rochen",
    "biegen": "bog bogen gebogen",
    "fliehen": "floh flohen geflohen",
    "frieren": "fror froren gefroren",
    "genießen": "genoss genossen",
    "gießen": "gegossen goss gossen",
    "sinken": "gesunken sank sanken",
    "laden": "geladen lud luden lädst lädt",
    "einladen": "eingeladen",
    "graben": "gegraben grub gruben gräbst gräbt",
    "geschehen": "geschah geschahen geschieht",
    "werben": "geworben warb warben wirbst wirbt",
    "stechen": "gestochen stach stachen stichst sticht",
    "brennen": "brannte brannten gebrannt",
    "rennen": "gerannt rannte rannten",
    "senden": "gesandt sandte sandten",
    "wenden": "gewandt wandte wandten",
    "schaffen": "geschaffen schuf schufen",
    "erschaffen": "erschuf erschufen",
    "ausgeben": "ausgegeben",
    "aufnehmen": "aufgenommen",
    "teilnehmen": "teilgenommen",
    "annehmen": "angenommen",
    "zunehmen": "zugenommen",
    "abnehmen": "abgenommen",
    "mitnehmen": "mitgenommen",
    "ansehen": "angesehen",
    "aussehen": "ausgesehen",
    "fernsehen": "ferngesehen",
    "vergehen": "vergangen",
    "umgehen": "umgegangen",
    "eingehen": "eingegangen",
    "ausgehen": "ausgegangen",
    "angehen": "angegangen",
    "vorgehen": "vorgegangen",
    "zurückkommen": "zurückgekommen",
    "ankommen": "angekommen",
    "mitkommen": "mitgekommen",
    "herausfinden": "herausgefunden",
    "antreiben": "angetrieben",
    "treiben": "getrieben trieb trieben",
    "übereinstimmen": "übereingestimmt",
  };
  const STRONG_FORM_TO_LEMMA = new Map();
  for (const [lemma, forms] of Object.entries(STRONG_VERB_FORMS)) {
    for (const form of forms.split(" ")) STRONG_FORM_TO_LEMMA.set(form, lemma);
  }

  /**
   * German words are inflected, and a glossary holds dictionary forms.
   *
   * OBSERVED_FORM_TO_LEMMA above is a hand-written list of forms somebody
   * noticed and added one at a time. It does not scale: an export of the
   * words the extension could not identify ran to 276 entries, and 47 of them
   * were plain inflections of words already in the glossary — fühlt for
   * fühlen, neuen for neu, geladen for laden, sollten for sollen. Hovering
   * any of those did nothing, and every one was logged as unknown vocabulary.
   * know.
   *
   * The rules below are deliberately timid. Each one proposes a lemma and is
   * only believed if that lemma is ALREADY an entry, and verb rules further
   * demand that the result be an infinitive. That second condition is what
   * stops "dachte" — past tense of denken — resolving to the noun "Dach":
   * "dachen" is not a word we hold, so the guess is thrown away and the
   * reader gets nothing rather than something wrong.
   */
  /**
   * English words that must never be guessed at as German.
   *
   * German pages are full of English — every X timeline mixes them — and the
   * de-inflection rules are suffix rules, so they will happily turn "were"
   * into wer, "under" into und, "want" into wann and "better" into das Bett.
   * Each of those is a confident wrong answer on a word the reader already
   * knows, which is worse than the silence it replaced.
   *
   * A German word that happens to be spelled like an English one is not
   * affected: findGermanEntry looks the word up exactly, and consults its
   * alias list, before any of this runs. This only refuses to GUESS.
   */
  const ENGLISH_NEVER_GUESS = new Set((
    "the of and to in is you that it he was for on are as with his they be at "
    + "have this from or had by but some what there we can out other were all "
    + "your when up use word how said an each she which do their time if will "
    + "way about many then them would write like so these her long make thing "
    + "see him two has look more day could go come did my sound no most who "
    + "over know water than call first people may down side been now find any "
    + "new work part take get place made live where after back little only "
    + "round year came show every good me give our under name very through "
    + "just form much great think say help low line before turn cause same "
    + "mean differ move right boy old too does tell sentence set three want "
    + "air well also play small end put home read hand port large spell add "
    + "even land here must big high such follow act why ask men change went "
    + "light kind off need house picture try us again animal point mother "
    + "world near build self earth father head stand own page should country "
    + "found answer school grow study still learn plant cover food sun four "
    + "thought let keep eye never last door between city tree cross since "
    + "hard start might story saw far sea draw left late run while press "
    + "close night real life few north open seem together next white children "
    + "begin got walk example ease paper often always music those both mark "
    + "book letter until mile river car feet care second group carry took "
    + "rain eat room friend began idea fish mountain stop once base hear "
    + "horse cut sure watch color face wood main enough plain girl usual "
    + "young ready above ever red list though feel talk bird soon body dog "
    + "family direct pose leave song measure state product black short class "
    + "wind question happen complete ship area half rock order fire south "
    + "problem piece told knew pass farm top whole king size heard best hour "
    + "better true during hundred five remember step early hold west ground "
    + "interest reach fast verb sing listen six table travel less morning ten "
    + "simple several vowel toward war lay against pattern slow center love "
    + "person money serve appear road map science rule govern pull cold "
    + "notice voice fall power town fine certain fly unit lead cry dark "
    + "machine note wait plan figure star box noun field rest correct able "
    + "pound done beauty drive stood contain front teach week final gave "
    + "green quick develop sleep warm free minute strong special mind behind "
    + "clear tail produce fact street inch lot nothing course stay wheel full "
    + "force blue object decide surface deep moon island foot yet busy test "
    + "record boat common gold possible plane age dry wonder laugh thousand "
    + "ago ran check game shape yes miss brought heat snow bed bring sit "
    + "perhaps fill east weight language among share thread post send reply"
  ).split(" "));

  /**
   * The prefixes a separable verb splits off. Written once and used by both
   * the participle rule (angerufen) and the zu-infinitive one
   * (bereitzustellen), because a prefix missing from either list is a whole
   * family of words going silent — "heraus" was, and herausgekommen with it.
   */
  // Longest first: the alternation is tried in order, and a short prefix
  // matching the front of a longer one is a whole family of words going quiet.
  // Each addition below came from a real export -- übereingestimmt,
  // vorausgesetzt, rausgekommen, weitergemacht.
  const SEPARABLE_PREFIX = "gegenüber|hinterher|zusammen|zurecht|zurück|voraus|vorbei"
    + "|vorüber|überein|entgegen|entlang|herunter|herein|heraus|hervor|herauf|herab"
    + "|hinunter|hinüber|hinaus|hinein|hinauf|runter|rüber|herum|umher|empor|weiter"
    + "|nieder|wieder|voran|davon|dabei|fort|heim|teil|fern|raus|rein|hoch|statt|nach"
    + "|durch|frei|fest|über|los|mit|vor|weg|ein|aus|auf|bei|ab|an|um|zu|her";
  const SEPARATED_PARTICIPLE = new RegExp(`^(${SEPARABLE_PREFIX})ge(.{2,})(t|en)$`);
  /**
   * German also puts zu INSIDE a separable verb: "bereitzustellen" is
   * bereitstellen, "herauszufinden" is herausfinden. No suffix rule reaches
   * that, and no prefix list is needed either — putting the two halves back
   * together has to produce a verb we already hold, which is guard enough.
   */
  const ZU_INFIX = /^([a-zäöüß]{2,})zu([a-zäöüß]{2,}e?n)$/;

  function inflectedGermanEntry(token) {
    const lower = token.toLowerCase();
    if (ENGLISH_NEVER_GUESS.has(lower)) return null;
    const held = (candidate) => byDeLowerAny.get(candidate) || null;
    // Reversing an umlaut covers wächst → wachsen and läuft → laufen.
    const plain = lower.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u");
    // Some plurals are nothing BUT the umlaut — Mangel/Mängel, Apfel/Äpfel,
    // Vater/Väter, Tochter/Töchter — so there is no ending to strip and the
    // reversed spelling is already the word.
    if (plain !== lower) {
      const unumlauted = held(plain);
      if (unumlauted) return unumlauted;
    }
    const stems = new Set();

    const addVerbStems = (word) => {
      // ge-...-t and ge-...-en participles: geteilt, geladen.
      const participle = /^ge(.{2,})(t|en)$/.exec(word);
      if (participle) stems.add(participle[1]);
      // A stem ending in t, d, m or n cannot pronounce a bare -t, so its
      // participle takes a linking -e-: getestet, gearbeitet, geredet, geöffnet,
      // gewartet, gesendet, geleitet. The rule above reads getestet as
      // ge + teste + t and proposes testeen, so the whole class -- every verb of
      // that shape in the language -- resolved to nothing.
      const linked = /^ge(.{2,}[tdmn])et$/.exec(word);
      if (linked) stems.add(linked[1]);
      const linkedSeparated = new RegExp(
        "^(" + SEPARABLE_PREFIX + ")ge(.{2,}[tdmn])et$"
      ).exec(word);
      if (linkedSeparated) stems.add(linkedSeparated[1] + linkedSeparated[2]);
      // A separable verb buries its ge in the middle: eingelöst is einlösen,
      // angerufen is anrufen. Without this the prefix hides the whole verb.
      const separated = SEPARATED_PARTICIPLE.exec(word);
      if (separated) stems.add(separated[1] + separated[2]);
      for (const ending of ["est", "eten", "ete", "et", "ten", "te", "st", "en", "t", "e"]) {
        if (word.length > ending.length + 2 && word.endsWith(ending)) {
          stems.add(word.slice(0, -ending.length));
        }
      }
      // Treating the bare token as a stem would catch imperatives — "mach"
      // is machen — and it was tried and removed. Against three hundred
      // common English words it invented fourteen German ones: back became
      // backen, off became offen, such became suchen, less became lesen. Two
      // imperatives are not worth ten confident wrong answers.
    };
    // Verbs in -eln and -ern drop the schwa in the ich form: ich bezweifle is
    // bezweifeln, ich sammle is sammeln, ich ändre is ändern. Stripping the
    // -e and adding -en gives "bezweiflen", which is not a word, so the whole
    // class resolved to nothing however common the verb.
    const schwa = /^(.{2,})([lr])e$/.exec(lower);
    if (schwa) {
      const hit = held(`${schwa[1]}e${schwa[2]}n`);
      if (hit) return hit;
    }
    addVerbStems(lower);
    if (plain !== lower) addVerbStems(plain);

    // A present participle declines like an adjective, so "funktionierenden"
    // has to lose two endings, not one, before the verb underneath shows.
    const participle = /^(.{3,})end(e|en|es|er|em)?$/.exec(lower);
    if (participle) stems.add(participle[1]);

    const zuInfix = ZU_INFIX.exec(lower);
    if (zuInfix) {
      const joined = held(zuInfix[1] + zuInfix[2]);
      if (joined) return joined;
    }

    // A verb only resolves to an infinitive. The bare -n infinitive belongs
    // to verbs whose stem ends in l or r — sammeln, ändern — and letting any
    // stem try it made "neuen" resolve to "neun", the number nine, the day
    // counting was finally taught.
    for (const stem of stems) {
      const candidates = /[lr]$/.test(stem) ? [`${stem}en`, `${stem}n`] : [`${stem}en`];
      for (const infinitive of candidates) {
        const hit = held(infinitive);
        if (hit) return hit;
      }
    }

    // Adjective and noun endings resolve to a base that must already exist,
    // and must not itself be an infinitive, or every verb would match here.
    // German plurals umlaut the stem as well as adding the ending — Hintergrund
    // becomes Hintergründe, Haus becomes Häuser, Stadt becomes Städte — and the
    // umlaut-reversed spelling was being computed and then handed only to the
    // verb rules. Every plural of that shape resolved to nothing.
    const bases = [];
    for (const word of plain === lower ? [lower] : [lower, plain]) {
      for (const ending of ["sten", "ste", "eren", "ere", "en", "er", "es", "em", "e", "n", "s"]) {
        if (word.length <= ending.length + 2 || !word.endsWith(ending)) continue;
        const base = word.slice(0, -ending.length);
        bases.push(base);
        if (/(en|ln|rn)$/.test(base)) continue;
        const hit = held(base);
        if (hit) return hit;
      }
    }

    // A participle used as an adjective wears two endings, and only the outer
    // one is adjectival: "veröffentlichtes" is veröffentlicht is
    // veröffentlichen, "geführte" is geführt is führen. Strip the adjective
    // ending first, then ask the verb rules about what is left.
    const deeper = new Set();
    const outer = stems;
    for (const base of bases) {
      const before = new Set(outer);
      addVerbStems(base);
      for (const stem of outer) if (!before.has(stem)) deeper.add(stem);
    }
    for (const stem of deeper) {
      for (const infinitive of [`${stem}en`, `${stem}n`]) {
        const hit = held(infinitive);
        if (hit) return hit;
      }
    }

    return null;
  }

  function findGermanEntry(token, { allowCaseFold = false } = {}) {
    const exact = byDeExact.get(token);
    if (exact) return exact;
    const lower = token.toLowerCase();
    const heldEntry = (lemma) =>
      (lemma ? byDeExact.get(lemma) || byDeLowerAny.get(lemma.toLowerCase()) || null : null);
    // An alias whose lemma we do NOT hold used to end the search here and return
    // null, so a single entry could silence a word the suffix rules would have
    // found. Falling through costs nothing: the rules get exactly the question
    // they would have got had the alias never been written.
    const observed = heldEntry(OBSERVED_FORM_TO_LEMMA.get(lower));
    if (observed) return observed;
    const strong = () => heldEntry(STRONG_FORM_TO_LEMMA.get(lower));
    // German capitalises its nouns, so a lowercase token cannot be one and the
    // verb reading is safe to take first. A capitalised token might be either --
    // band is the past of binden, Band is a noun -- so there the noun rules get
    // first refusal and the verb table catches what is left, which is the
    // sentence-initial verb: Gibt es noch einen Platz?
    if (token === lower) {
      const asVerb = strong();
      if (asVerb) return asVerb;
    }
    const inflected = inflectedGermanEntry(token);
    if (inflected) return inflected;
    if (token !== lower) {
      const asVerb = strong();
      if (asVerb) return asVerb;
    }
    // Navigation labels are isolated from authored prose before enabling
    // this. Their initial capital is UI styling rather than German noun
    // grammar, so "Entdecken" can safely resolve to the verb "entdecken".
    return allowCaseFold ? byDeLowerAny.get(lower) || null : null;
  }

  function speakGerman(text, { force = false, reason = "hover" } = {}) {
    const spokenText = String(text || "").replace(/\s+/g, " ").trim();
    if (!spokenText) return;
    const now = Date.now();
    if (!force && spokenText === lastSpokenText && now - lastSpokenAt < SAME_WORD_SPEAK_COOLDOWN_MS) {
      return;
    }
    lastSpokenText = spokenText;
    lastSpokenAt = now;
    // chrome.* throws "Extension context invalidated" in a page injected
    // before the extension was reloaded. Pronunciation is a nicety; an
    // exception here would take the whole handler down.
    try { chrome.runtime.sendMessage({ type: "micheon-tts", text: spokenText, reason }); } catch { /* stale context */ }
  }

  function scheduleHoverSpeech(entry) {
    clearPendingHoverSpeech();
    if (!settings.ttsOnHover || !entry?.de) return;
    pendingHoverSpeech = setTimeout(() => {
      pendingHoverSpeech = null;
      if (activeEntry === entry && tipVisible()) speakGerman(entry.de);
    }, HOVER_SPEAK_DELAY_MS);
  }

  /**
   * How long the pointer rests on a word before its card opens.
   *
   * Reading drags the pointer over every word between where it was and where
   * the reader is looking, and each of those used to open a card and take the
   * page's attention on the way past. A dwell means only the word actually
   * being looked at answers.
   *
   * Read from settings on each use rather than captured, so changing it in
   * the popup takes effect on the page already open. Clamped because it is a
   * stored value and a wrong one should be a poor choice, not a word that
   * never answers at all.
   */
  const HOVER_TIP_DELAY_MAX = 2000;
  let pendingHoverTip = null;
  let pendingHoverEntry = null;

  function hoverTipDelay() {
    const raw = Number(settings.hoverDelayMs);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, HOVER_TIP_DELAY_MAX);
  }

  function clearPendingHoverTip() {
    if (pendingHoverTip) {
      clearTimeout(pendingHoverTip);
      pendingHoverTip = null;
    }
    pendingHoverEntry = null;
  }

  /**
   * Ask for a word's card, subject to the dwell.
   *
   * A word already waiting keeps its own timer rather than being restarted by
   * the next mousemove over the same word — a hand is never perfectly still,
   * and restarting on every sample means the wait never finishes.
   */
  function requestTipForEntry(entry) {
    if (entry === activeEntry) { clearPendingHoverTip(); return; }
    const delay = hoverTipDelay();
    if (!delay) { clearPendingHoverTip(); showTipForEntry(entry); return; }
    if (pendingHoverEntry === entry) return;
    clearPendingHoverTip();
    pendingHoverEntry = entry;
    pendingHoverTip = setTimeout(() => {
      pendingHoverTip = null;
      const waited = pendingHoverEntry;
      pendingHoverEntry = null;
      if (waited) showTipForEntry(waited);
    }, delay);
  }

  function hideTip() {
    clearPendingHoverSpeech();
    clearPendingHoverTip();
    anchorRect = null;
    activeEntry = null;
    paintTip(false);
  }

  function showTipForEntry(entry) {
    if (entry === activeEntry) return;
    const rect = entry.range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { hideTip(); return; }
    const tip = ensureTip();
    tipTextEl.textContent = entry.gloss;
    // About half the glossary has an example; the rest shows nothing rather
    // than an invented one.
    if (tipExampleEl) {
      if (entry.ex) {
        // No source credit on the card itself. CC BY wants attribution
        // "reasonable to the medium", and a hover tooltip is not it: the app's
        // credits page names Tatoeba, which is where a reader would look. The
        // sentence id still travels with the entry, so a bad one stays
        // traceable without putting a licence notice on every word.
        tipExampleEl.textContent = entry.exEn ? entry.ex + " — " + entry.exEn : entry.ex;
        tipExampleEl.style.display = "";
      } else {
        tipExampleEl.textContent = "";
        tipExampleEl.style.display = "none";
      }
    }
    tip.dataset.micheonDe = entry.de || "";
    // Measured while hidden -- visibility:hidden keeps layout, which is why
    // it is used here rather than display:none.
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
    let top = rect.top - th - 6;
    if (top < 4) top = rect.bottom + 6;
    tip.style.setProperty("left", `${Math.round(left)}px`, "important");
    tip.style.setProperty("top", `${Math.round(top)}px`, "important");
    anchorRect = rect;
    activeEntry = entry;
    paintTip(true);
    // Hearing the word is the default learning mode; the popup can turn it
    // off. The short settling delay prevents a sweep across several words
    // from creating overlapping audio and repeated tooltip announcements.
    scheduleHoverSpeech(entry);
  }

  function tipVisible() {
    return Boolean(tipEl && tipShown);
  }

  /**
   * Dismissal is decided by POINTER GEOMETRY, not by mouseout events.
   *
   * Two earlier attempts failed here, both for the same underlying reason:
   * a page can destroy the hovered element while the tip is up (React
   * re-renders on X do this constantly), and the browser fires no leave
   * event for a node that no longer exists. A timer-based watchdog didn't
   * save it either -- re-arming a delay on every mousemove means continuous
   * movement resets it forever and it never fires, which is exactly the
   * "it just sits there" the learner kept seeing.
   *
   * So: while the tip is visible, the pointer either is inside the box that
   * spans the word and the tip together, or the tip goes. No events from
   * the page are trusted, no timers are involved, and a destroyed element
   * changes nothing because the anchor is a cached rectangle.
   */
  function hideWhenPointerLeaves(x, y) {
    if (!tipVisible()) return;
    const tipRect = tipEl.getBoundingClientRect();
    if (!anchorRect) { hideTip(); return; }
    // The union of both rects covers the gap the cursor crosses to reach
    // the speaker button; the padding keeps that crossing forgiving without
    // making the tip cling to the pointer.
    const pad = 12;
    const left = Math.min(anchorRect.left, tipRect.left) - pad;
    const right = Math.max(anchorRect.right, tipRect.right) + pad;
    const top = Math.min(anchorRect.top, tipRect.top) - pad;
    const bottom = Math.max(anchorRect.bottom, tipRect.bottom) + pad;
    if (x < left || x > right || y < top || y > bottom) hideTip();
  }

  function initTooltip() {
    // Gaming mice can emit hundreds of mousemove events per second. A caret
    // hit-test plus Range geometry on every one is expensive on an infinite
    // React feed, so coalesce movement to one DOM read per paint.
    let pointerFrame = 0;
    let pointerSample = null;
    const runPointerHitTest = () => {
      pointerFrame = 0;
      const sample = pointerSample;
      pointerSample = null;
      if (!sample) return;
      const entry = glossAtPoint(sample.x, sample.y);
      // Hovering waits; clicking below does not. Asking for a word and
      // choosing one are different intentions.
      if (entry) requestTipForEntry(entry);
      else {
        clearPendingHoverTip();
        hideWhenPointerLeaves(sample.x, sample.y);
      }
    };
    document.addEventListener("mousemove", (e) => {
      if (e.target?.closest?.(".micheon-gloss-tip")) return; // browsing the tip itself
      // On X, almost every pointer move is over video, buttons, avatars or
      // feed whitespace. Calling caretRangeFromPoint there still forces a
      // layout hit-test despite there being no possible gloss. Restrict the
      // expensive path to the two text surfaces Immersion scans.
      if (IS_X) {
        const insideGlossableText = Boolean(e.target?.closest?.(`${X_POST_SELECTOR}, ${X_CHROME_SELECTOR}`));
        if (!insideGlossableText) {
          pointerSample = null;
          hideWhenPointerLeaves(e.clientX, e.clientY);
          return;
        }
      }
      pointerSample = { x: e.clientX, y: e.clientY };
      if (!pointerFrame) pointerFrame = requestAnimationFrame(runPointerHitTest);
    }, { capture: true, passive: true });
    // Clicking a glossed word replays its German (toggleable in the popup).
    // Deliberately does NOT preventDefault: a glossed word inside a link
    // must still navigate -- the page always wins ties.
    document.addEventListener("click", (e) => {
      if (e.target?.closest?.(".micheon-gloss-tip")) return;
      if (!settings.ttsOnClick) return;
      if (IS_X && !e.target?.closest?.(`${X_POST_SELECTOR}, ${X_CHROME_SELECTOR}`)) return;
      const entry = glossAtPoint(e.clientX, e.clientY);
      if (entry) {
        showTipForEntry(entry);
        clearPendingHoverSpeech();
        speakGerman(entry.de, { force: true, reason: "click" });
      }
    }, true);
    // Belt and braces for the cases a mousemove never arrives for: the
    // pointer leaving the window entirely, a click elsewhere, a scroll (a
    // fixed tip does not follow its word), a tab switch, or the page being
    // hidden.
    document.addEventListener("mouseleave", hideTip);
    document.addEventListener("mousedown", (e) => {
      if (e.target?.closest?.(".micheon-gloss-tip")) return;
      if (IS_X && !e.target?.closest?.(`${X_POST_SELECTOR}, ${X_CHROME_SELECTOR}`)) {
        hideTip();
        return;
      }
      if (glossAtPoint(e.clientX, e.clientY)) return; // click-to-speak keeps the tip
      hideTip();
    }, true);
    window.addEventListener("scroll", hideTip, { capture: true, passive: true });
    window.addEventListener("blur", hideTip);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hideTip();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideTip();
    }, true);
  }

  /**
   * ── zero-mutation glossing (CSS Custom Highlight API) ─────────────────
   *
   * The extension used to wrap each matched word in a <span>. That REWRITES
   * the page's DOM, and on React/Polymer apps the framework still believes
   * it owns those nodes: the next re-render of anything we touched throws
   * (React's removeChild on a node we replaced) and takes the feature with
   * it. That killed X's translate toggle three separate ways -- the button
   * label, the status label next to it, and the tweet body itself -- and
   * skip-lists can never enumerate every element a framework might redraw.
   *
   * The Highlight API styles TEXT RANGES with no DOM change at all, so
   * there is nothing for a framework to trip over. The price: no elements
   * to hover, so the tooltip is driven by caret hit-testing on mousemove,
   * and keyboard focus on individual glosses is gone. When a page's text
   * node is replaced by the app, the range collapses harmlessly and the
   * mutation observer re-walks the new node.
   */
  const HIGHLIGHTS_SUPPORTED = typeof Highlight !== "undefined" && typeof CSS !== "undefined" && CSS.highlights;
  const glossHighlight = HIGHLIGHTS_SUPPORTED ? new Highlight() : null;
  if (glossHighlight) CSS.highlights.set("micheon-gloss", glossHighlight);
  // Text node -> [{start, end, gloss, de, range}], offsets sorted, for caret
  // hit-testing. WeakMap so dead nodes take their entries with them.
  const glossIndex = new WeakMap();
  // CSS.highlights retains its Range objects, so keep the corresponding text
  // nodes enumerable as well. X can remove a huge virtualised article tree;
  // pruning this small set is much cheaper than walking every removed DOM
  // subtree just to discover that almost all of it was never glossed.
  const glossedTextNodes = new Set();
  let glossRangeCount = 0;

  function registerGloss(node, start, end, gloss, de, ex, exEn, exSrc) {
    if (!glossHighlight) return;
    let list = glossIndex.get(node);
    if (list?.some((entry) => entry.start === start && entry.end === end && entry.gloss === gloss)) return;
    const range = document.createRange();
    try {
      range.setStart(node, start);
      range.setEnd(node, end);
    } catch { return; }
    glossHighlight.add(range);
    if (!list) { list = []; glossIndex.set(node, list); }
    list.push({ start, end, gloss, de, ex, exEn, exSrc, range });
    glossedTextNodes.add(node);
    glossRangeCount += 1;
  }

  function unregisterTextNode(node) {
    const list = glossIndex.get(node);
    if (!list) return;
    if (activeEntry && list.includes(activeEntry)) hideTip();
    for (const entry of list) glossHighlight.delete(entry.range);
    glossRangeCount = Math.max(0, glossRangeCount - list.length);
    glossIndex.delete(node);
    glossedTextNodes.delete(node);
    processed.delete(node);
  }

  function pruneDetachedGlosses() {
    for (const node of glossedTextNodes) {
      if (!node.isConnected) unregisterTextNode(node);
    }
  }

  function unregisterGlosses(root) {
    if (!glossHighlight || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      unregisterTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) unregisterTextNode(node);
  }

  function glossAtPoint(x, y) {
    const caret = document.caretRangeFromPoint?.(x, y);
    const node = caret?.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const list = glossIndex.get(node);
    if (!list) return null;
    const offset = caret.startOffset;
    for (const entry of list) {
      // DOM Range end offsets are exclusive. Treating them as inclusive made
      // two adjacent highlighted words both eligible at their shared edge,
      // which caused tooltip flicker and duplicate pronunciation requests.
      if (offset < entry.start || offset >= entry.end) continue;
      if (entry.range.collapsed) return null; // node was replaced under us
      const overPaintedWord = Array.from(entry.range.getClientRects()).some((rect) => (
        x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1
      ));
      if (overPaintedWord) return entry;
    }
    return null;
  }

  function processTextNode(node, germanMode, collectMissing = true, caseInsensitiveGerman = false) {
    const processedMask = processed.get(node) || 0;
    const passMask = collectMissing ? 2 : 1;
    if ((processedMask & passMask) !== 0) return;
    const text = node.nodeValue;
    if (!text || text.trim().length < 3) return;
    processed.set(node, processedMask | passMask);

    const excludedRanges = excludedTextRanges(text);
    WORD_RE.lastIndex = 0;
    let match;
    while ((match = WORD_RE.exec(text))) {
      const token = match[0];
      if (overlapsExcludedRange(match.index, match.index + token.length, excludedRanges)) continue;
      const lower = token.toLowerCase();
      let hit = null;

      if (germanMode) {
        hit = findGermanEntry(token, { allowCaseFold: caseInsensitiveGerman });
        if (!hit && /^[A-ZÄÖÜ]+$/.test(token)) {
          // All-caps discards case entirely (headlines, nav labels) -- no
          // noun/verb signal survives that to protect, so the full index
          // is fair game here.
          hit = byDeLowerAny.get(lower);
        }
        // Deliberately NOT recovering ordinary sentence-initial Titlecase
        // words against non-noun entries: "position in the sentence" can't
        // actually distinguish a real capitalised noun this list doesn't
        // teach from a lowercase-authored word capitalised only by
        // position -- confirmed on real content, where sentence-initial
        // "Daten" (data, a noun Micheon doesn't teach) kept resolving to
        // "daten" (to date someone, a verb it does). A missed gloss is
        // silent; a wrong one actively teaches something false, so this
        // stays exact-case-or-nothing for ordinary Titlecase tokens.
        // A German page is full of English — every tech timeline is — and the
        // reader is here to learn German. If the word is not German but we
        // know the German FOR it, that is the more useful card, and it is
        // the direction this extension already offers on English pages.
        //
        // Only content words. The reverse index holds "the", "is" and "make"
        // too, and glossing those would underline half an English sentence to
        // teach nothing; ENGLISH_NEVER_GUESS is already the list of words too
        // common to be worth it.
        if (!hit && !ENGLISH_NEVER_GUESS.has(lower) && /^[a-z][a-z'-]{2,}$/.test(lower)) {
          const german = byEn.get(lower) || englishSingularEntry(lower);
          if (german) {
            registerGloss(node, match.index, match.index + token.length,
              german.deDisplay, german.deDisplay);
            continue;
          }
        }
        if (!hit && collectMissing && settings.collectMissingVocab) {
          const sentence = extractSentence(node, match.index);
          // A sentence that is German carries at least one German function
          // word. Requiring that of an all-ASCII candidate closes the last
          // hole: "casual", "inventions", "takeaway" and "somebody" all
          // reached the German bucket through the weak known-word signal,
          // where every "signal" was a word both languages own. A token
          // spelt with an umlaut or ß needs no such corroboration.
          const germanSpelt = /[äöüßÄÖÜ]/.test(token);
          const isEnglish = sentenceLooksEnglish(sentence)
            || (!germanSpelt && germanHintCount(sentence) === 0);
          if (!isEnglish && looksLikeRealGermanCandidate(token) && !looksLikeName(token, sentence)) {
            // YouTube and X containers may mix languages internally, so the
            // candidate's own sentence still has to look German. A page that
            // declares lang="de" is trusted for everything EXCEPT a sentence
            // that reads as English -- half the web's German pages carry
            // English quotes, and those words are not German vocabulary.
            const trustPageLanguage = !IS_YOUTUBE && !IS_X && germanConfidence === "strong";
            if (trustPageLanguage || sentenceLooksGerman(sentence)) {
              noteMissing(missingCounts, missingExamples, lower, sentence);
            }
          } else if (isEnglish && looksLikeEnglishTopicWord(token, lower)
              && !looksLikeName(token, sentence)) {
            // Reading English is not a waste. An English word we hold no
            // German for is the reader telling us what they read ABOUT and
            // cannot yet say -- a gap in the course, pointed at from the
            // other side. Kept in its own bucket so nothing here is ever
            // mistaken for a German word we failed to teach.
            noteMissing(englishCounts, englishExamples, lower, sentence);
          }
        }
        if (hit) {
          registerGloss(node, match.index, match.index + token.length, hit.en, token, hit.ex, hit.exEn, hit.exSrc);
        }
      } else {
        hit = byEn.get(lower) || englishSingularEntry(lower);
        if (hit) {
          registerGloss(node, match.index, match.index + token.length, hit.deDisplay, hit.deDisplay);
        }
      }
    }
  }

  function walk(root, germanMode, {
    collectMissing = true,
    caseInsensitiveGerman = false,
    includeInteractive = false,
  } = {}) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.isConnected) processTextNode(root, germanMode, collectMissing, caseInsensitiveGerman);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
      && root.nodeType !== Node.DOCUMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const parent = n.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        // Never rewrite text inside interactive controls. It's UI chrome,
        // not vocabulary -- and on React apps it's actively destructive:
        // X's "Übersetzung zeigen" button died because React tried to
        // re-render a text node this script had already replaced, and the
        // resulting DOM exception killed the button's update.
        // Only skip the control's own label, not an entire card or feed post
        // whose outer wrapper happens to be clickable.
        const tag = parent.tagName;
        if (!includeInteractive
          && (tag === "BUTTON" || tag === "LABEL" || tag === "SUMMARY" || parent.getAttribute("role") === "button")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    // Process off the main thread's critical path, in batches, so a huge
    // page (long article, infinite-scroll feed) doesn't jank the tab.
    let i = 0;
    function step(deadline) {
      while (i < nodes.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
        if (nodes[i].isConnected) processTextNode(nodes[i], germanMode, collectMissing, caseInsensitiveGerman);
        i += 1;
      }
      if (i < nodes.length) runWhenIdle(step, { timeout: 1000 });
    }
    runWhenIdle(step, { timeout: 1000 });
  }

  // Batch ordinary-page mutations. Busy SPAs update timers, feeds and player
  // chrome continuously; walking every mutation synchronously causes visible
  // jank and can starve clicks. A throttle still makes progress on pages that
  // never become completely quiet.
  const MUTATION_PASS_MS = 400;
  const MAX_PENDING_ROOTS = 200;
  let pendingRoots = new Set();
  let pendingTexts = new Set();
  let mutationTimer = null;

  function runMutationPass() {
    mutationTimer = null;
    const roots = pendingRoots;
    const texts = pendingTexts;
    pendingRoots = new Set();
    pendingTexts = new Set();
    for (const textNode of texts) {
      if (textNode.isConnected) processTextNode(textNode, isGermanPage);
    }
    if (roots.size > MAX_PENDING_ROOTS) {
      walk(document.body, isGermanPage);
      return;
    }
    for (const root of roots) {
      if (root.isConnected) walk(root, isGermanPage);
    }
  }

  function scheduleMutationPass() {
    if (!mutationTimer) mutationTimer = setTimeout(runMutationPass, MUTATION_PASS_MS);
  }

  function observeNewContent() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") {
          unregisterGlosses(m.target);
          pendingTexts.add(m.target);
          continue;
        }
        for (const removed of m.removedNodes) unregisterGlosses(removed);
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            if (added.dataset?.micheon) continue; // our own insertion
            pendingRoots.add(added);
          } else if (added.nodeType === Node.TEXT_NODE) {
            pendingTexts.add(added);
          }
        }
      }
      if (pendingRoots.size || pendingTexts.size) scheduleMutationPass();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  // ── YouTube mode ──────────────────────────────────────────────────────
  // Only the watch page's title + description containers, each judged by
  // its own text. The rest of the page (chrome, comments, sidebar) is
  // never scanned: the account's interface language and other people's
  // usernames aren't vocabulary.
  function scanYouTube() {
    // The metadata containers below only exist on a video page; the rest of
    // YouTube is covered by the whole-page walk started in initYouTube.
    if (location.pathname !== "/watch" && !location.pathname.startsWith("/shorts")) return;
    const containers = [];
    for (const sel of YT_SCAN_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) containers.push(el);
    }
    // Judge the VIDEO once, from the richest text present, then gloss every
    // container. YouTube keeps two copies of the description -- the full
    // text (hidden until "…more") and a one-line collapsed snippet -- and
    // judging each element on its own text left the snippet unglossed:
    // one line of a German vocab list can't pass a language check that the
    // full description passes easily. Whether this video is German isn't a
    // per-element question.
    // German text gets English glosses; anything else gets the SAME
    // English-to-German recall glosses every other site on the web gets.
    // Without that else, YouTube was the one place on the internet where a
    // non-German page produced nothing at all in either direction -- and
    // since a German-dubbed or German-teaching video usually has English
    // metadata, that was most of the videos worth opening.
    if (containers.length > 0) {
      const combined = containers.map((el) => el.textContent || "").join("\n");
      const germanMeta = looksGermanBlock(combined);
      if (germanMeta) ytGermanFound = true;
      for (const el of containers) walk(el, germanMeta);
    }

    // Comments load lazily as the page scrolls; the throttled rescan picks
    // each batch up as it arrives. Judged one at a time, because a German
    // comment under an English video is exactly the material worth reading.
    for (const el of document.querySelectorAll(YT_COMMENT_SELECTOR)) {
      const text = el.textContent || "";
      if (text.trim().length < 8) continue;
      const germanComment = commentLooksGerman(text);
      if (germanComment) ytGermanFound = true;
      // Only the German verdict drives collection (processTextNode collects
      // in German mode only), so the candidate list stays clean either way.
      walk(el, germanComment);
    }
  }

  function scheduleYouTubeScan() {
    // The title/description mount late and keep mutating (the "…more"
    // expansion swaps in the full text), so this must re-scan over time --
    // but as a THROTTLE, not a debounce. A debounce that resets on every
    // mutation never fires on YouTube, which mutates continuously (player
    // progress, live comment stream); verified live, where the visible
    // description snippet stayed ungloosed because the quiet window the
    // debounce waited for never came, so the snippet was never glossed.
    // Node-level dedup keeps the repeated
    // scans cheap.
    if (ytScanTimer) return; // one already queued -- let it run
    ytScanTimer = setTimeout(() => {
      ytScanTimer = null;
      scanYouTube();
    }, 1200);
  }

  function initYouTube() {
    document.addEventListener("yt-navigate-finish", () => {
      ytGermanFound = false;
      scheduleYouTubeScan();
    });
    const observer = new MutationObserver(scheduleYouTubeScan);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleYouTubeScan();
    // Read the rest of YouTube like any other site as well. Collection still
    // requires each mixed-language passage to look German, so interface text
    // cannot turn an English video into German vocabulary.
    isGermanPage = detectGerman();
    walk(document.body, isGermanPage);
    observeNewContent();
  }

  // ── X / Twitter mode ──────────────────────────────────────────────────
  // X repeats account names, trends, translated UI and timestamps all over
  // the DOM. Only tweet bodies are real authored text, so only those may
  // produce glosses or missing-vocabulary candidates.
  function scanXPost(el) {
    if (!el?.isConnected || !el.matches?.(X_POST_SELECTOR)) return;
    const text = (el.textContent || "").trim();
    if (text.length < 3) return;
    const germanPost = commentLooksGerman(text);
    if (germanPost) xGermanFound = true;
    // X often renders one whole tweet as a single text node. Passing the
    // container still handles inline links, but only this exact tweet body
    // is walked—not the surrounding article with every action/counter.
    walk(el, germanPost);
  }

  function scanXChrome(root) {
    const scope = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!scope?.isConnected) return;
    const chromeRoot = scope.matches?.(X_CHROME_SELECTOR) ? scope : scope.closest?.(X_CHROME_SELECTOR);
    if (!chromeRoot && root.nodeType !== Node.DOCUMENT_NODE) return;
    // Navigation labels are useful reinforcement (for example Mitteilungen),
    // but repeated site chrome is not evidence that a word should enter the
    // missing-vocabulary export. Gloss it against Micheon's catalogue while
    // keeping collection restricted to authored post text above.
    walk(chromeRoot || root, true, {
      collectMissing: false,
      caseInsensitiveGerman: true,
      includeInteractive: true,
    });
  }

  function collectXTargets(root) {
    const scope = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!scope) return;

    if (scope.nodeType === Node.ELEMENT_NODE) {
      const containingPost = scope.matches(X_POST_SELECTOR) ? scope : scope.closest(X_POST_SELECTOR);
      if (containingPost) xPendingPosts.add(containingPost);
      const containingChrome = scope.matches(X_CHROME_SELECTOR) ? scope : scope.closest(X_CHROME_SELECTOR);
      if (containingChrome) xPendingChrome.add(containingChrome);
    }

    // Added wrappers can contain several newly mounted tweets. Query only
    // that added subtree once; never promote it to document/body/article.
    if (scope.querySelectorAll) {
      for (const post of scope.querySelectorAll(X_POST_SELECTOR)) xPendingPosts.add(post);
      for (const chromeRoot of scope.querySelectorAll(X_CHROME_SELECTOR)) xPendingChrome.add(chromeRoot);
    }
  }

  function scheduleXFlush() {
    if (xScanTimer) return;
    xScanTimer = setTimeout(() => {
      xScanTimer = null;
      const changedTextNodes = [...xChangedTextNodes];
      const shouldPruneDetached = xNeedsDetachedCleanup;
      const posts = [...xPendingPosts];
      const chromeRoots = [...xPendingChrome];
      xChangedTextNodes.clear();
      xNeedsDetachedCleanup = false;
      xPendingPosts.clear();
      xPendingChrome.clear();
      // Keep all Highlight/Range work outside the mutation callback so React
      // gets the main thread back immediately. Detached cleanup is O(glossed
      // text nodes), not O(every node in every removed X subtree).
      for (const node of changedTextNodes) unregisterTextNode(node);
      if (shouldPruneDetached) pruneDetachedGlosses();
      for (const post of posts) scanXPost(post);
      for (const chromeRoot of chromeRoots) scanXChrome(chromeRoot);
    }, 180);
  }

  function initX() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          xChangedTextNodes.add(mutation.target);
          collectXTargets(mutation.target);
          continue;
        }
        if (mutation.removedNodes.length > 0) xNeedsDetachedCleanup = true;
        for (const added of mutation.addedNodes) collectXTargets(added);
      }
      scheduleXFlush();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    collectXTargets(document);
    scheduleXFlush();
  }

  // ── popup status ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "micheon-reconcile-missing-vocab") {
      reconcileStoredCandidates().then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
      return true;
    }
    if (message?.type !== "micheon-page-status") return undefined;
    sendResponse({
      ok: true,
      youtube: IS_YOUTUBE,
      watchPage: !IS_YOUTUBE || location.pathname === "/watch",
      german: IS_YOUTUBE ? ytGermanFound : IS_X ? xGermanFound : isGermanPage,
      glossed: glossRangeCount,
    });
    return undefined;
  });

  async function init() {
    const stored = await chrome.storage.local.get("settings");
    settings = { ...settings, ...(stored.settings || {}) };
    if (!settings.glossEnabled) return;
    // Popup toggles (sound on hover/click, collection) apply immediately,
    // without a page reload.
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.settings?.newValue) {
          settings = { ...settings, ...changes.settings.newValue };
        }
      });
    } catch { /* stale extension context */ }
    if (!HIGHLIGHTS_SUPPORTED) {
      console.warn("[Micheon] this browser lacks the CSS Custom Highlight API -- words are collected but not underlined.");
    }

    const url = chrome.runtime.getURL("data/words.json");
    const words = await fetch(url).then((r) => r.json());
    buildIndexes(words);
    await reconcileStoredCandidates();
    initTooltip();

    if (IS_YOUTUBE) {
      initYouTube();
    } else if (IS_X) {
      initX();
    } else {
      isGermanPage = detectGerman();
      walk(document.body, isGermanPage);
      observeNewContent();
    }
    window.addEventListener("beforeunload", flushMissingVocab);
  }

  // A rejection anywhere in init() would leave the page with no glossing and
  // no signal at all -- most likely when a reloaded extension orphans an
  // already-injected script and every chrome.* call starts throwing. Say so
  // in the console rather than dying silently.
  function start() {
    init().catch((error) => {
      console.warn("[Micheon] glossing did not start:", error?.message ?? error,
        "-- if the extension was just reloaded, reload this page.");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
