import { ui, uiDate, uiFmt, uiNumber } from "@/lib/i18n";
import type { CountryId, CountryPack } from "@/lib/countryStudies";
import { COUNTRY_PACKS, countryPack } from "@/lib/countryPacks";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, BarChart3, Bell, BellOff, BookOpen, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, ClipboardCheck, Clock3, Coins, Crown, Flag, MessageCircle, RefreshCw, Sun, Users, Gamepad2, Route, EyeOff, Eye, GraduationCap, Headphones, Home, Landmark, Layers, Languages, WholeWord, Leaf, LockKeyhole, Medal, LogOut, Menu, MessageCircleMore, PawPrint, Pencil, MessageSquareText, Search, RotateCcw, SlidersHorizontal, Trash2, Settings2, ShoppingBag, Target, Trophy, UserPlus, UserRound, UsersRound, Volume2, X, MessagesSquare, FlaskConical } from "lucide-react";
import {
  lazy,
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { CourseSwitcher } from "@/components/course/CourseSwitcher";
import {
  translationLanguagesFor,
  setTranslationLanguage,
  useTranslationLanguage,
  type TranslationLanguage,
} from "@/lib/courseTranslation";
import { DIRECTION_CHANGE_EVENT, getLearningDirection, learningEnglish, learningFrench, learningPolish, learningPortuguese, learningSpanish, setLearningDirection } from "@/lib/direction";
import { courseSides, translationLanguagesNeeded } from "@/lib/courseLanguages";
import { getEnglishVariant, resolveEnglishVariant, setEnglishVariant } from "@/lib/englishVariant";
import { buildCatalogSearchText, normalizeCatalogSearchText } from "@/lib/catalogSearch";
import { buildCatalog } from "@/session";
import {
  buildPracticeQuestion,
  practiceCandidates,
  type PracticeQuestion,
} from "@/lib/practiceQuestions";
import {
  applyPracticeAnswer,
  loadPracticeRecallState,
  savePracticeRecallState,
  selectPracticeItem,
  type PracticeRecallState,
} from "@/lib/practiceRecall";
import { requestVocabFilter, requestVocabLibraryFirst, requestVocabLibraryOpen, takeVocabLibraryFirst } from "@/lib/vocabFilterRequest";

import { getAuthUser, loadScopedJson, saveScopedJson, setAuthUser, type UserProfile } from "@/lib/profileStorage";
import { getStreak, recordStreakDay } from "@/lib/streak";
import { getLevelInfo, MILESTONES, type GamificationStats } from "@/lib/gamificationProgress";
import type { Blueprint, Part } from "@/lib/types";
import {
  getActiveCourseId,
  loadCourseProgress,
  saveCourseProgress,
  setActiveCourseId as persistActiveCourseId,
} from "@/lib/courses";
import { getCourse } from "@/lib/courseRegistry";
import { FlagRoundel } from "@/components/course/FlagRoundel";
import { learningFlagId } from "@/lib/learningFlag";
import { arrangePodium } from "@/lib/leaderboardPodium";
import { duoUnitAnchorId, scrollToAnchorWhenReady } from "@/lib/scrollToAnchor";
import { buildDuoPath } from "@/lib/duoPath";
import { UK_TIMELINE } from "@/lib/lifeInTheUkTimeline";
import {
  HIDDEN_NAV_EVENT,
  canHideNavItem,
  hideNavItem,
  loadHiddenNav,
  navRowId,
  navSectionId,
  showAllNavItems,
  showNavItem,
} from "@/lib/navPreferences";
import { isNavDrag, readNavDrag, startNavDrag, type NavDragOrigin } from "@/lib/navDrag";
import { useMotivationQuote } from "@/lib/motivationQuotes";
import {
  CURRENCY_AUTO,
  CURRENCY_CODES,
  currencyIsAutomatic,
  currencyLabel,
  loadCurrency,
  packPrice,
  premiumPrice,
  saveCurrency,
  type CurrencyCode,
  type PriceTier,
} from "@/lib/currency";
import { countLearningDays, loadActivitySessions } from "@/lib/activity";
import { countFadingVocab, countKnownSplit, countKnownVocab, FLUENCY_STAGES, FLUENT_PHRASE_TARGET, FLUENT_WORD_TARGET, getFluency } from "@/lib/fluency";
import { activePackProgress, type PackProgress } from "@/lib/packProgress";
import { useSlideSelect } from "@/lib/slideSelect";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_PREFS_EVENT,
  dismissNotifications,
  getMutedNotificationKinds,
  getNotificationStatus,
  markNotificationsRead,
  restoreDismissedNotifications,
  setAllNotificationsMuted,
  setNotificationKindMuted,
  type NotificationKind,
} from "@/lib/notificationPrefs";
import { estimateFluencyHours, LEARNING_TIME_UPDATED_EVENT, loadLearningTimeStats } from "@/lib/learningTime";
import { hasLeonSocialPreview } from "@/lib/socialPreview";
import { getHomeCardOpen, setHomeCardOpen, type HomeCard } from "@/lib/homeCards";
import {
  GUIDED_BACKGROUND_EVENT,
  getGuidedBackground,
  getGuidedCustomBackground,
  type GuidedBackground,
} from "@/lib/guidedBackground";
import { FriendsPanel } from "@/components/social/FriendsPanel";
import { formatFriendCode, getFriendCode } from "@/lib/friendCode";
import { FRIENDS_EVENT, loadFriends } from "@/lib/friendStore";
import { PlusSquare } from "lucide-react";
import { getLessonContent, setLessonContent, type LessonContent } from "@/lib/lessonContent";

/*
 * Supplied artwork for the home page, used exactly as given.
 *
 * All three belong to the German course for now — "Bitte erstelle jetzt noch
 * keine Logik für andere Sprachen" — so they are imported flat rather than
 * chosen per language - except the face of the language card, which now has
 * a German picture of its own and falls back to the general one for any
 * other course. The skyline sits behind the mascot in the banner; the
 * other two are the faces of the two cards under "Was möchtest du heute
 * lernen?".
 */
import homeBannerImage from "./assets/home-banner-sunrise-v1.webp";
import scenerySpeechBubbles from "./assets/guided-speech-bubbles-v2.webp";
import sceneryFlightPath from "./assets/guided-flight-path-v1.webp";
import sceneryFlowerGarden from "./assets/guided-flower-garden-v1.webp";
import scenerySoftDawn from "./assets/guided-soft-dawn-v1.webp";
import sceneryMonkeyWorld from "./assets/guided-monkey-world-v2.webp";
import homeLanguagesImage from "./assets/home-languages-de-v2.webp";
import homeLanguagesGermanImage from "./assets/home-languages-german-v1.webp";
import homeLanguagesUkImage from "./assets/home-languages-uk-v1.webp";
import homeLanguagesUsImage from "./assets/home-languages-us-v1.webp";
import homeLanguagesFrImage from "./assets/home-languages-fr-v1.webp";
import homeLanguagesPlImage from "./assets/home-languages-pl-v1.webp";
import homeLanguagesEsImage from "./assets/home-languages-es-v1.webp";
import homeLanguagesItImage from "./assets/home-languages-it-v1.webp";
import homeLanguagesPtImage from "./assets/home-languages-pt-v1.webp";
import homeLanguagesRuImage from "./assets/home-languages-ru-v1.webp";
import homeLanguagesHiImage from "./assets/home-languages-hi-v1.webp";
import homeLanguagesZhImage from "./assets/home-languages-zh-v1.webp";
import homeCountryArtDe from "./assets/home-country-de-v2.webp";
import homeCountryArtEs from "./assets/home-country-es-v1.webp";
import homeCountryArtFr from "./assets/home-country-fr-v2.webp";
import homeCountryArtIt from "./assets/home-country-it-v1.webp";
import homeCountryArtPl from "./assets/home-country-pl-v1.webp";
import homeCountryArtRu from "./assets/home-country-ru-v1.webp";
import homeCountryArtUk from "./assets/home-country-uk-v2.webp";
import achievementAtlas from "./assets/achievements-v1/achievement-atlas-v3.webp";
import backpackReward from "./assets/rewards-v3/backpack.webp";
import flameReward from "./assets/rewards-v3/flame.webp";
import heartReward from "./assets/rewards-v3/heart.webp";
import starReward from "./assets/rewards-v3/star.webp";
import trophyReward from "./assets/rewards-v3/trophy.webp";
import "./new-ui-prototype.css";

const loadGamificationPanel = () => import("@/Gamification");
const GamificationPanel = lazy(loadGamificationPanel);
const LearningLibraryView = lazy(() => import("@/components/lab/LearnView").then((module) => ({ default: module.LearnView })));
const TestsView = lazy(() => import("@/components/tests/TestsView").then((module) => ({ default: module.TestsView })));
const ListenView = lazy(() => import("@/components/listen/ListenView").then((module) => ({ default: module.ListenView })));
const GamesView = lazy(() => import("@/games/GamesView").then((module) => ({ default: module.GamesView })));
const ClozeTabContent = lazy(() => import("@/lab/ClozeTabContent"));
const GrammarTabContent = lazy(() => import("@/lab/GrammarTabContent"));
const ConversationAndReading = lazy(() => import("@/components/conversation/ConversationAndReading").then((module) => ({ default: module.ConversationAndReading })));
const CourseDashboardView = lazy(() => import("@/components/course/CourseDashboardView").then((module) => ({ default: module.CourseDashboardView })));
const CourseLessonsView = lazy(() => import("@/components/course/CourseLessonsView").then((module) => ({ default: module.CourseLessonsView })));
const CourseSession = lazy(() => import("@/components/course/CourseSession").then((module) => ({ default: module.CourseSession })));
const CourseShell = lazy(() => import("@/components/course/CourseShell").then((module) => ({ default: module.CourseShell })));
const CreateView = lazy(() => import("@/components/create/CreateView").then((module) => ({ default: module.CreateView })));
const DuoPathView = lazy(() => import("@/components/duo/DuoPathView").then((module) => ({ default: module.DuoPathView })));
const TopicRoundView = lazy(() => import("@/components/duo/TopicRoundView").then((module) => ({ default: module.TopicRoundView })));
const UkPracticeView = lazy(() => import("@/components/course/UkPracticeView").then((module) => ({ default: module.UkPracticeView })));
const UkTestView = lazy(() => import("@/components/lifeInTheUk/UkTestView").then((module) => ({ default: module.UkTestView })));
const UkTimelineView = lazy(() => import("@/components/lifeInTheUk/UkTimelineView").then((module) => ({ default: module.UkTimelineView })));
const UkSearchView = lazy(() => import("@/components/lifeInTheUk/UkSearchView").then((module) => ({ default: module.UkSearchView })));

type PrototypeView = "home" | "path" | "learn" | "practice" | "listen" | "games" | "social" | "tests" | "grammar" | "passages" | "shop" | "progress" | "profile" | "more" | "life-in-uk" | "create";
type RewardKind = "heart" | "flame" | "star" | "trophy" | "backpack";
type ShopBadgeId = "leaf" | RewardKind | "crown";

// Days learned is not part of the shared stats object because it is not
// stored — it is counted from the records each time it is shown.
type PrototypeStats = GamificationStats & { learningDays: number };

type PrototypeSearchItem = {
  id: string;
  title: string;
  subtitle: string;
  group: "Page" | "Unit" | "Lesson" | "Word bank" | "Game" | "Country studies";
  actionLabel: "Open" | "Start";
  searchText: string;
  onSelect: () => void;
};

type NavigationItem = {
  id: PrototypeView;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type Milestone = (typeof MILESTONES)[number];

// Life in the UK sits in the nav rather than inside the course switcher. It
// is a course you revise alongside German, not instead of it, so burying it
// behind "switch course" made it both hard to find and wrong in kind —
// picking it there swaps the whole app over. Its own destination keeps German
// exactly where it is.
//
// It sits ABOVE "More", not below. "More" is the overflow drawer and reads as
// the end of the list; anything under it looks like a stray rather than a
// destination of its own.
const NAVIGATION: NavigationItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "path", label: "Learn", icon: Route },
  { id: "learn", label: "Lessons", icon: BookOpen },
  { id: "practice", label: "Practice", icon: MessageSquareText },
  { id: "listen", label: "Listen", icon: Headphones },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "life-in-uk", label: "Life in UK", icon: Landmark },
  { id: "more", label: "More", icon: Menu },
];

const MOBILE_NAVIGATION: NavigationItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "learn", label: "Lessons", icon: BookOpen },
  { id: "practice", label: "Practice", icon: MessageSquareText },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "more", label: "More", icon: Menu },
];

const SOCIAL_NAVIGATION_ITEM: NavigationItem = { id: "social", label: "Friends", icon: UsersRound };

const SHOP_NAVIGATION_ITEM: NavigationItem = { id: "shop", label: "Shop", icon: ShoppingBag };
// Create sits with the other beta entries: it is the newest thing here and
// the two accounts that can see beta are the two people using the app.
const CREATE_NAVIGATION_ITEM: NavigationItem = { id: "create", label: "Create", icon: PlusSquare };
// Learn is the lesson path, and it is still being worked on, so it sits with
// the other beta entries rather than in the main navigation everyone sees.
const LEARN_PATH_NAVIGATION_ITEM: NavigationItem = { id: "path", label: "Learn", icon: Route };
/**
 * Conversation: somebody speaking to you, or somebody writing to you.
 *
 * This entry used to say Passages and carry only the reading half, while the
 * talking half was a card on the Learn row with no nav entry at all. They were
 * never two features — both put real language in front of you and ask you to
 * follow a whole thought — so they are one destination now, and this is its
 * door. The id stays `passages` because it is written into stored nav
 * preferences; renaming it would orphan anybody who had hidden or restored it.
 *
 * Still beta, and still gated with the rest: it is one of the newer things
 * here and the accounts that can see beta are the two people using the app.
 */
const PASSAGES_NAVIGATION_ITEM: NavigationItem = { id: "passages", label: "Conversation", icon: MessagesSquare };

/**
 * Every destination that can appear in a nav, for looking a hidden one up.
 *
 * The restore list only has ids to work from, and an id it cannot name would
 * render as "life-in-uk" — which is not what the row said when it was hidden,
 * and so not something anybody would recognise as the thing they put away.
 */
const ALL_NAV_ITEMS: NavigationItem[] = [
  ...NAVIGATION,
  SOCIAL_NAVIGATION_ITEM,
  SHOP_NAVIGATION_ITEM,
];

/** Which half of the Life in the UK course a nav row opens. */
type UkTab = "learn" | "practice" | "exam" | "timeline" | "search";

/**
 * The sidebar's two collapsible sections.
 *
 * The nav reads as what it is: one heading per thing
 * being studied, with the flag of what is being studied on it, and the ways
 * into it folded underneath. Three settings
 * feed it and they stay separate: the app language names everything, the
 * course being learned picks the first flag, and the country picks the
 * second.
 *
 * Only the labels and the arrangement live here. Every row still navigates to
 * the destination it always did.
 */
/**
 * The rows under "Sprachen lernen".
 *
 * Three destinations the nav already had, and Speaking, which has nothing
 * behind it yet: that row is shown because the section is incomplete without
 * it, and says so rather than pretending, because inventing the feature is
 * not the job. Vocabulary was here for a while and then taken back out —
 * the tracker it pointed at is on the profile page, which
 * is where it already lived.
 */
type LanguageRow =
  | { kind: "nav"; id: PrototypeView }
  | { kind: "view"; icon: ComponentType<{ className?: string }>; label: string; view: PrototypeView }
  | { kind: "soon"; icon: ComponentType<{ className?: string }>; label: string };

/**
 * An id for everything in the sidebar, so everything can be put away.
 *
 * The three headings are layout rather than destinations, and several rows are
 * tabs or scroll positions rather than views, so none of them had an id the
 * hidden list could hold. These give them one. Dragging a heading takes the
 * whole section; dragging a row inside takes just that row; and because they
 * are ordinary strings in the same preference, Show all and the count need to
 * know nothing about the distinction.
 */
const SECTION_LANGUAGES = navSectionId("languages");
const SECTION_COUNTRY = navSectionId("country");
const SECTION_BETA = navSectionId("beta");
const ROW_SPEAKING = navRowId("speaking");
const ROW_VOCABULARY = navRowId("vocabulary-library");
const ukTabRowId = (tab: UkTab) => navRowId(`uk-${tab}`);

/**
 * What a put-away thing is called in the list that offers it back.
 *
 * A hidden id has to name itself there or the drawer fills up with
 * "section:beta" and the way back stops being a way back. Nav items are
 * resolved from ALL_NAV_ITEMS by the list itself; everything else is named
 * here, from the same constants that label the row on screen, so a heading
 * cannot end up called one thing in the sidebar and another in the drawer.
 */
function navHideLabel(id: string): string {
  if (id === SECTION_LANGUAGES) return ui("Language learning");
  if (id === SECTION_COUNTRY) return ui("Country studies");
  if (id === SECTION_BETA) return ui("Beta");
  if (id === ROW_SPEAKING) return ui("Speaking");
  if (id === ROW_VOCABULARY) return ui("Vocabulary library");
  const ukSection = UK_SECTIONS.find((section) => ukTabRowId(section.tab) === id);
  if (ukSection) return ui(ukSection.label);
  return id;
}

const LANGUAGE_SECTION_ROWS: LanguageRow[] = [
  { kind: "nav", id: "learn" },
  { kind: "nav", id: "practice" },
  { kind: "nav", id: "listen" },
  { kind: "soon", icon: MessageCircleMore, label: "Speaking" },
  { kind: "view", icon: WholeWord, label: "Vocabulary library", view: "progress" },
];

/** Anything the learner does with the page. None of these fire for a
 *  programmatic scroll, which a scroll listener could not tell apart. */
const HANDS_ON_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Land on the vocabulary tracker, not at the top of the page holding it.
 *
 * The tracker — Sätze and Wörter — sits on the progress page, and the row that
 * opens it used to drop you at the top of the page to find it yourself. It
 * arrives at the card instead of near it now. The section loads when it is
 * scrolled to, which is why this keeps looking for a few seconds rather than
 * once.
 */
function scrollToVocabularyLibrary() {
  if (typeof window === "undefined") return;
  let waited = 0;
  let corrections = 0;
  let timer = 0;
  let stopped = false;
  // The corrections below run for seconds after the click, and they were
  // fighting the learner for the page: scroll up to read something and the
  // next correction hauled you back down to the card. The moment a hand is on
  // the page, this stops and stays stopped.
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    for (const name of HANDS_ON_EVENTS) window.removeEventListener(name, stop);
  };
  for (const name of HANDS_ON_EVENTS) window.addEventListener(name, stop, { passive: true });
  const land = () => {
    if (stopped) return;
    const target = document.querySelector(".np-vocabulary-anchor");
    if (!target) {
      // The page is lazy twice over — the progress view, then the folds
      // inside it — and the tracker only mounts once its fold is reached, so
      // the card can be several seconds behind the click.
      if (waited++ < 200) timer = window.setTimeout(land, 50);
      else stop();
      return;
    }
    const box = target.getBoundingClientRect();
    // Near the top of the window is where it belongs — but a reading that says
    // so is not the end of it. The fold is the first of four, so it starts
    // near the top and is pushed down as the panel above it settles. A single
    // check here declared victory and left the card 900px down the page.
    if (box.top < 0 || box.top >= 160) {
      // "auto", not "smooth": a smooth scroll issued while the view is still
      // being built never started here — eleven of them in a row left the page
      // at the top, measured with window.scrollTo hooked. A jump also matches
      // what navigating does everywhere else in the shell.
      window.scrollTo({ behavior: "auto", top: box.top + window.scrollY - 24 });
    }
    // Everything around the card is still loading and still growing, so one
    // scroll lands short — measured at 2,154px short the first time. Keep
    // watching for a couple of seconds, then leave the page alone whatever
    // happened.
    if (corrections++ < 10) timer = window.setTimeout(land, 300);
    else stop();
  };
  timer = window.setTimeout(land, 60);
}

const LANGUAGE_SECTION_IDS: PrototypeView[] = LANGUAGE_SECTION_ROWS
  .flatMap((row) => (row.kind === "nav" ? [row.id] : []));

/** Practice is a pencil in the sidebar; a speech bubble everywhere else. */
/**
 * The face of the language card.
 *
 * Keyed on the language being learned rather than on a German-or-not flag,
 * which handed French the German scene for as long as it lasted. All four
 * courses have their own now, and an unknown code still falls back rather
 * than being given somebody else's country. British and
 * American English are the same course read with a different spelling, so
 * they are told apart here too - the British one has its own scene, the
 * American one keeps the general picture until somebody draws it one.
 */
/**
 * Scenes drawn before their courses exist. courseRegistry lists every one of
 * these as unavailable, so none of them can be the active course and none of
 * these pictures can be reached today. They are here so the scene is waiting
 * rather than remembered: the day a course opens, its card wears its own
 * country instead of the general German photograph somebody has to notice.
 *
 * A table rather than a run of if-branches, because six unreachable branches
 * in a row read as something to tidy away, and the tidying would land long
 * before anybody remembered what they were for.
 */
const PLANNED_CARD_ART: Record<string, string> = {
  es: homeLanguagesEsImage,
  it: homeLanguagesItImage,
  pt: homeLanguagesPtImage,
  ru: homeLanguagesRuImage,
  hi: homeLanguagesHiImage,
  zh: homeLanguagesZhImage,
};

function languageCardArt(targetCode: string, englishVariant: "british" | "american" | null) {
  if (targetCode === "de") return homeLanguagesGermanImage;
  if (targetCode === "fr") return homeLanguagesFrImage;
  if (targetCode === "pl") return homeLanguagesPlImage;
  if (targetCode === "es") return homeLanguagesEsImage;
  // American English was reading homeLanguagesImage, which is the German
  // scene the fallback happens to point at - so somebody learning American
  // English was shown Germany on their own course card. It has its own
  // picture now, and the two spellings are two places rather than one and a
  // borrowed one.
  if (targetCode === "en") return englishVariant === "american" ? homeLanguagesUsImage : homeLanguagesUkImage;
  return PLANNED_CARD_ART[targetCode] ?? homeLanguagesImage;
}

const NAV_GROUP_ICONS: Partial<Record<PrototypeView, ComponentType<{ className?: string }>>> = {
  practice: Pencil,
};

const UK_SECTIONS: Array<{ icon: ComponentType<{ className?: string }>; label: string; tab: UkTab }> = [
  { icon: BookOpen, label: "Lessons", tab: "learn" },
  { icon: Pencil, label: "Practice", tab: "practice" },
  { icon: ClipboardCheck, label: "Tests", tab: "exam" },
  { icon: Clock3, label: "Timeline", tab: "timeline" },
];

/**
 * Country studies holds more than one country, and each brings its own flag.
 *
 * It used to hold only the UK, with this constant naming it. Germany sits
 * beside it now — same sections, same order, its own material — so the group
 * lists its countries and the head shows whichever is selected. english-uk is
 * the union flag; german is black-red-gold. Neither has separate artwork of
 * its own to reuse.
 */
const COUNTRY_STUDIES_FALLBACK_FLAG_ID = "english-uk";

const NAV_GROUPS_KEY = "gl-nav-groups-v1";
const PROGRESS_SECTIONS_KEY = "gl-progress-sections-v1";

/**
 * Which parts of "Dein Fortschritt" are folded open.
 *
 * This panel folds the way the sidebar's sections do.
 * The whole thing collapses from its own heading, and the two blocks inside
 * it that have headings of their own fold on their own as well, so a long
 * right-hand column can be cut down to whichever part is being looked at.
 * Everything starts open, which is how the panel looked before it folded.
 */
type ProgressSectionState = {
  achievements: boolean;
  panel: boolean;
  recent: boolean;
};

function loadProgressSections(profile: UserProfile | null): ProgressSectionState {
  const stored = loadScopedJson<Partial<ProgressSectionState>>(PROGRESS_SECTIONS_KEY, {}, profile);
  return {
    achievements: stored?.achievements !== false,
    panel: stored?.panel !== false,
    recent: stored?.recent !== false,
  };
}

type NavGroupState = { beta: boolean; country: boolean; languages: boolean };

/** Both sections start open, which is how the nav looked before it folded. */
function loadNavGroups(profile: UserProfile | null): NavGroupState {
  const stored = loadScopedJson<Partial<NavGroupState>>(NAV_GROUPS_KEY, {}, profile);
  return {
    beta: stored?.beta !== false,
    country: stored?.country !== false,
    languages: stored?.languages !== false,
  };
}

const PROTOTYPE_SIDEBAR_MIN = 188;
const PROTOTYPE_SIDEBAR_MAX = 330;
const PROTOTYPE_SIDEBAR_STACKED_BRAND_MAX = 212;
const PROTOTYPE_SIDEBAR_COMPACT_BRAND_MAX = 240;
const PROTOTYPE_SIDEBAR_KEY = "prototype-sidebar-width";

const PROTOTYPE_SEARCH_PAGES: Array<{
  id: PrototypeView;
  title: string;
  subtitle: string;
  keywords: string;
}> = [
  { id: "home", title: "Home", subtitle: "Your course, progress, lesson path, and fluency outlook.", keywords: "dashboard today continue learning" },
  { id: "learn", title: "Lessons", subtitle: "Browse every German lesson and word-bank pack.", keywords: "learn modules packs vocabulary phrases" },
  { id: "practice", title: "Practice", subtitle: "Choose useful phrases and review conversational German.", keywords: "review recall sentences conversation" },
  { id: "listen", title: "Listen", subtitle: "Both languages read aloud while you do something else.", keywords: "listen audio hear tts hands-free passive hören" },
  { id: "games", title: "Games", subtitle: "Spelling, recall, verbs, and quick-recognition games.", keywords: "play word snake falling letters shooter minesweeper slither" },
  { id: "tests", title: "Tests", subtitle: "Build vocabulary, phrase, mixed, or weak-spot tests.", keywords: "quiz assessment level search filters" },
  { id: "grammar", title: "Grammar", subtitle: "Cloze practice and accessible grammar explanations.", keywords: "fill blanks rules sentence structure" },
  { id: "progress", title: "Progress and achievements", subtitle: "Levels, streaks, XP, milestones, and activity.", keywords: "stats achievements streak level xp" },
  { id: "profile", title: "Profile and settings", subtitle: "Account, learning direction, sound, and preferences.", keywords: "account settings language sound preferences" },
  { id: "more", title: "More", subtitle: "Course switching and the rest of Micheon's tools.", keywords: "courses switch full app options" },
  { id: "life-in-uk", title: "Life in UK", subtitle: "British history, government, law and traditions.", keywords: "life in the uk citizenship test british history government settlement indefinite leave to remain ilr home office einbürgerung" },
];

const LEON_SOCIAL_SEARCH_PAGE = {
  id: "social" as const,
  title: "Friends and leaderboard",
  subtitle: "See friend activity, weekly XP, streaks, and the private friends league preview.",
  keywords: "friends social leaderboard league add friend invite challenge weekly xp",
};

const LEON_SHOP_SEARCH_PAGE = {
  id: "shop" as const,
  title: "Shop",
  subtitle: "Unlock and equip profile badges with earned coins.",
  keywords: "rewards coins badge cosmetics",
};

const PROTOTYPE_SEARCH_GAMES = [
  ["Word Snake", "Spell German words by steering through letters."],
  ["Falling Letters", "Catch the correct letters before they leave the screen."],
  ["Letter Tap", "Tap the right letter quickly to train visual recall."],
  ["Verb Shooter", "Choose the right verb form before time runs out."],
  ["Vocab Minesweeper", "Translate carefully and avoid wrong picks."],
  ["Vocab Slither", "Match target words while keeping the run alive."],
] as const;

function clampPrototypeSidebarWidth(width: number) {
  return Math.min(PROTOTYPE_SIDEBAR_MAX, Math.max(PROTOTYPE_SIDEBAR_MIN, Math.round(width)));
}

function defaultPrototypeSidebarWidth() {
  if (typeof window === "undefined") return 272;
  if (window.innerWidth <= 1100) return 216;
  if (window.innerWidth <= 1280) return 244;
  return 272;
}

const PREVIEW_PROFILE: UserProfile = {
  id: "micheon-preview",
  name: "Learner",
  email: "preview@micheon.app",
  joinedAt: "2026-01-01T00:00:00.000Z",
  externalWordsLearned: 0,
};

const SHOP_PURCHASES_KEY = "prototypeShopPurchases";
const SHOP_EQUIPPED_KEY = "prototypeShopEquippedBadge";

type CoinPack = {
  id: string;
  coins: number;
  /** Index into the price points for whichever currency is showing — the
      packs no longer carry "£1.99" as a string, because only one learner in
      the world reads prices that way. */
  tier: PriceTier;
  label: string;
  note: string;
  featured?: boolean;
};
const COIN_PACKS: readonly CoinPack[] = [
  { id: "pocket", coins: 500, tier: 0, label: "Pocket pack", note: "A small boost for profile rewards." },
  { id: "popular", coins: 1_200, tier: 1, label: "Popular pack", note: "Enough for several pins and future rewards.", featured: true },
  { id: "power", coins: 3_000, tier: 2, label: "Power pack", note: "A bigger balance for regular learners." },
  { id: "vault", coins: 6_500, tier: 3, label: "Coin vault", note: "The largest preview bundle in the shop." },
];

const SHOP_ITEMS: ReadonlyArray<{
  id: ShopBadgeId;
  name: string;
  description: string;
  price: number;
  tone: string;
}> = [
  { id: "leaf", name: ui("Fresh start pin"), description: ui("A calm green badge for your profile."), price: 60, tone: "mint" },
  { id: "star", name: ui("Bright star pin"), description: ui("A cheerful badge for steady progress."), price: 90, tone: "yellow" },
  { id: "heart", name: ui("Kind heart pin"), description: ui("A warm badge for patient learners."), price: 110, tone: "rose" },
  { id: "flame", name: ui("Streak flame pin"), description: ui("Show that you keep coming back."), price: 140, tone: "orange" },
  { id: "backpack", name: ui("Explorer pin"), description: ui("A travel badge for curious learners."), price: 170, tone: "violet" },
  { id: "trophy", name: ui("Champion pin"), description: ui("A gold badge for your biggest wins."), price: 220, tone: "blue" },
  { id: "crown", name: ui("Conversation crown"), description: ui("The top profile badge in the reward shop."), price: 260, tone: "gold" },
];

type SocialFriend = {
  id: string;
  name: string;
  initials: string;
  level: string;
  status: string;
  statusKind: "online" | "today" | "recent";
  streak: number;
  weeklyXp: number;
  tone: "rose" | "blue" | "gold" | "violet";
};

type SocialLeaderboardEntry = {
  id: string;
  name: string;
  initials: string;
  weeklyXp: number;
  streak: number;
  movement: string;
  tone: SocialFriend["tone"] | "green";
  current?: boolean;
};

/*
 * There is no table of people here any more.
 *
 * Four invented friends with invented streaks sat at this spot, and every
 * button under them said the action was a preview. The list is what other
 * copies of the app have actually sent now, so the only names on screen are
 * of people who chose to connect — see components/social/FriendsPanel.
 */

function isShopBadgeId(value: unknown): value is ShopBadgeId {
  return typeof value === "string" && SHOP_ITEMS.some((item) => item.id === value);
}

const REWARD_IMAGE: Record<RewardKind, string> = {
  heart: heartReward,
  flame: flameReward,
  star: starReward,
  trophy: trophyReward,
  backpack: backpackReward,
};

function RewardIcon({ kind, className = "" }: { kind: RewardKind; className?: string }) {
  return <img alt="" aria-hidden="true" className={`np-reward-icon ${className}`.trim()} decoding="async" height={256} loading="lazy" src={REWARD_IMAGE[kind]} width={256} />;
}

const ACHIEVEMENT_ART_ID: Record<string, string> = {
  lessons_10: "first_session",
  reviews_250: "reviews_50",
  xp_2500: "xp_500",
  words_1000: "words_200",
  streak_30: "streak_3",
  lessons_100: "week",
};

function AchievementArt({ id }: { id: string }) {
  const artId = ACHIEVEMENT_ART_ID[id] ?? id;
  return (
    <span
      aria-hidden="true"
      className={`np-achievement-art np-achievement-art--${artId}`}
      style={{ backgroundImage: `url(${achievementAtlas})` }}
    />
  );
}

function ShopBadgeArt({ id }: { id: ShopBadgeId }) {
  if (id === "leaf") return <Leaf aria-hidden="true" />;
  if (id === "crown") return <Crown aria-hidden="true" />;
  return <RewardIcon kind={id} />;
}

function BrandMark() {
  return (
    <div className="np-brand">
      <span className="np-brand-icon">
        <img alt="" src="/icon-64.png" />
      </span>
      <span className="np-brand-copy">
        <strong>{ui("MICHEON")}</strong>
        <small>
          <span>{ui("Made with love by")}</span>
          <span>Leon &amp; Michelle</span>
        </small>
      </span>
    </div>
  );
}

/**
 * Start the work while the pointer is still travelling.
 *
 * Games felt slow to open and the click was never the problem: navigate()
 * already asks for the catalogue the moment it runs. The problem is what
 * "asking" costs. The catalogue is a 3.9 MB chunk that is deliberately kept
 * off the first-paint path and requested on idle with a two-second timeout,
 * and building it means resolving 485 blueprints. Measured on the production
 * build, the chunk starts at ~2.4 s and the parts are ready at ~3.3 s. Click
 * Games inside that window and you wait for the remainder; click after it and
 * the view opens in 384 ms.
 *
 * Hovering a nav item precedes clicking it by a few hundred milliseconds, and
 * that time is otherwise spent doing nothing. So intent — pointer over, or
 * keyboard focus — starts the catalogue and pulls the view's chunk down. It
 * costs nothing at startup because it only fires when somebody is already on
 * their way there.
 */
const VIEW_PREFETCH: Partial<Record<PrototypeView, () => void>> = {
  path: () => { void import("@/components/duo/DuoPathView"); },
  // Lessons holds the unit path now, which is what search scrolls to — so
  // this chunk is on the critical path of a search result, not just of a
  // click on the nav row.
  learn: () => { void import("@/components/lab/LearnView"); },
  games: () => { void import("@/games/GamesView"); },
  listen: () => { void import("@/components/listen/ListenView"); },
  tests: () => { void import("@/components/tests/TestsView"); },
  "life-in-uk": () => { void import("@/components/course/CourseLessonsView"); },
};

/**
 * Views whose content needs the full catalogue before they can render.
 *
 * `path` is not one of them any more: the Learn screen is three cards and a
 * lesson count now that the unit path moved into Lessons, and it read nothing
 * from the catalogue to draw them. `passages` is, because Conversation lives
 * there and builds its scenarios from the packs — a route that never asked
 * would show "0 scenes" and an empty grid, which reads as broken rather than
 * loading.
 */
const NEEDS_CATALOGUE: PrototypeView[] = ["learn", "games", "tests", "listen", "passages"];

function Sidebar({
  courseFlagId,
  createUnlocked,
  learnPathUnlocked,
  passagesUnlocked,
  activeView,
  gamesUnlocked,
  onNavigate,
  countryId,
  onOpenUkSection,
  onPrefetch,
  onSwitchCourse,
  onResize,
  profile,
  shopUnlocked,
  socialPreviewUnlocked,
  ukTab,
  width,
}: {
  activeView: PrototypeView;
  /** The course being learned — decides the first flag, nothing else. */
  courseFlagId: string;
  createUnlocked: boolean;
  learnPathUnlocked: boolean;
  passagesUnlocked: boolean;
  gamesUnlocked: boolean;
  onNavigate: (view: PrototypeView) => void;
  /** Which country studies country is selected. */
  countryId: CountryId;
  /** Opens a country on one of its sections, the way search already does. */
  onOpenUkSection: (tab: UkTab, country?: CountryId) => void;
  /** The course picker, opened by pressing the flag. */
  onSwitchCourse: () => void;
  onPrefetch: (view: PrototypeView) => void;
  onResize: (width: number, persist?: boolean) => void;
  profile: UserProfile | null;
  shopUnlocked: boolean;
  socialPreviewUnlocked: boolean;
  ukTab: UkTab;
  width: number;
}) {
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  /**
   * Destinations the learner has put away.
   *
   * Kept in state and re-read on the event rather than on every render,
   * because the mobile bar reads the same preference and the two have to agree
   * the moment one of them changes it.
   */
  const [hidden, setHidden] = useState<string[]>(() => loadHiddenNav());
  const [restoreOpen, setRestoreOpen] = useState(false);
  /**
   * Whether the country chooser hanging off the Country studies flag is open.
   *
   * Closed on any click outside it and on Escape, the way the lesson-content
   * menu behaves, so it never strands itself open behind another screen.
   */
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);

  useEffect(() => {
    if (!countryMenuOpen) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest?.(".np-nav-country-picker")) setCountryMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCountryMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [countryMenuOpen]);
  /** Which sections are folded open. Remembered per profile. */
  const [groups, setGroups] = useState<NavGroupState>(() => loadNavGroups(profile));
  const toggleGroup = (id: keyof NavGroupState) => {
    setGroups((current) => {
      const next = { ...current, [id]: !current[id] };
      saveScopedJson(NAV_GROUPS_KEY, next, profile);
      return next;
    });
  };
  useEffect(() => {
    const sync = () => setHidden(loadHiddenNav());
    window.addEventListener(HIDDEN_NAV_EVENT, sync);
    return () => window.removeEventListener(HIDDEN_NAV_EVENT, sync);
  }, []);

  const isHidden = (id: string) => hidden.includes(id);

  /**
   * Dragging a row onto More puts it away; dragging one out of More brings
   * it back. Both ends write the same preference the cross and the restore
   * list write, so the keyboard route is untouched — drag is an addition,
   * never the only way in.
   */
  const [dropTarget, setDropTarget] = useState<"more" | "nav" | null>(null);
  const dragProps = (id: string) => ({
    draggable: canHideNavItem(id),
    onDragStart: (event: React.DragEvent) => startNavDrag(event.dataTransfer, id, "sidebar"),
    onDragEnd: () => setDropTarget(null),
  });
  /**
   * Each zone takes one direction only. dragover bubbles out of the More row
   * into the sidebar around it, so without this both would claim the drag and
   * whichever fired last would win the highlight — which was the sidebar,
   * every time, leaving the row you were actually aiming at unmarked.
   */
  const acceptDrop = (
    zone: "more" | "nav",
    from: NavDragOrigin,
    apply: (id: string) => void
  ) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!isNavDrag(event.dataTransfer, from)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(zone);
    },
    onDragLeave: () => setDropTarget((current) => (current === zone ? null : current)),
    onDrop: (event: React.DragEvent) => {
      const id = readNavDrag(event.dataTransfer, from);
      setDropTarget(null);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      apply(id);
    },
  });

  // The finished app and the building site, kept visibly apart. Games,
  // Friends and Shop all have rough edges, so together they form a labelled
  // Beta section at the foot of the nav — and only on one account. Every
  // other account gets the main navigation and nothing half-built.
  const navigationItems = NAVIGATION.filter((item) => item.id !== "games" && item.id !== "path");
  const betaItems = [
    ...(learnPathUnlocked ? [LEARN_PATH_NAVIGATION_ITEM] : []),
    ...(passagesUnlocked ? [PASSAGES_NAVIGATION_ITEM] : []),
    ...(createUnlocked ? [CREATE_NAVIGATION_ITEM] : []),
    ...(gamesUnlocked ? [NAVIGATION.find((item) => item.id === "games")!] : []),
    ...(socialPreviewUnlocked ? [SOCIAL_NAVIGATION_ITEM] : []),
    ...(shopUnlocked ? [SHOP_NAVIGATION_ITEM] : []),
  ];
  const visibleNavigation = navigationItems.filter((item) => !isHidden(item.id));
  const languageItems = LANGUAGE_SECTION_IDS
    .map((id) => visibleNavigation.find((item) => item.id === id))
    .filter((item): item is NavigationItem => Boolean(item));
  const languageRows: Array<{ item: NavigationItem | null; row: LanguageRow }> =
    LANGUAGE_SECTION_ROWS.flatMap((row): Array<{ item: NavigationItem | null; row: LanguageRow }> => {
      // The two rows that are not destinations carry their own hide ids, so
      // they answer to the preference the same way a nav item does.
      if (row.kind === "soon") return isHidden(ROW_SPEAKING) ? [] : [{ item: null, row }];
      if (row.kind === "view") return isHidden(ROW_VOCABULARY) ? [] : [{ item: null, row }];
      const item = visibleNavigation.find((entry) => entry.id === row.id);
      return item ? [{ item, row }] : [];
    });
  const countryItem = visibleNavigation.find((item) => item.id === "life-in-uk") ?? null;
  const brandLayoutClass = width <= PROTOTYPE_SIDEBAR_STACKED_BRAND_MAX
    ? " is-brand-stacked"
    : width <= PROTOTYPE_SIDEBAR_COMPACT_BRAND_MAX
      ? " is-brand-compact"
      : "";

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    resizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = width;
    let latestWidth = width;
    document.documentElement.classList.add("is-resizing-prototype-sidebar");

    const move = (pointerEvent: PointerEvent) => {
      latestWidth = clampPrototypeSidebarWidth(startWidth + pointerEvent.clientX - startX);
      onResize(latestWidth);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.documentElement.classList.remove("is-resizing-prototype-sidebar");
      resizeCleanupRef.current = null;
    };
    const finish = () => {
      onResize(latestWidth, true);
      cleanup();
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  // Press a nav button, keep the mouse down, slide to another, release to
  // pick it — the gesture the old build had on its top nav.
  const sidebarRef = useRef<HTMLElement | null>(null);
  useSlideSelect(sidebarRef, ".np-side-nav button");

  return (
    <aside className={`np-sidebar${brandLayoutClass}`} ref={sidebarRef}>
      <BrandMark />
      <nav
        aria-label={ui("Prototype navigation")}
        className={`np-side-nav${dropTarget === "nav" ? " is-drop-target" : ""}`}
        {...acceptDrop("nav", "more", (id) => setHidden(showNavItem(id)))}
      >
        {/*
          One heading per thing being studied, with what is being studied on
            it. The two courses fold, with Home above them, Beta listed flat
            below, and the
          row goes; it changes which rows sit together.
        */}
        {navigationItems.filter((item) => !isHidden(item.id)).map((item) => item).filter((item) => item.id === "home").map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={activeView === item.id ? "page" : undefined}
              className={activeView === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              onFocus={() => onPrefetch(item.id)}
              onPointerEnter={() => onPrefetch(item.id)}
              type="button"
            >
              <span aria-hidden="true" className="np-nav-visual"><Icon className="np-nav-icon" /></span>
              <span>{ui(item.label)}</span>
            </button>
          );
        })}

        {languageRows.length > 0 && !isHidden(SECTION_LANGUAGES) && (
          <div className={`np-nav-group${groups.languages ? " is-open" : ""}`}>
            <button
              aria-expanded={groups.languages}
              className={`np-nav-group-head${!groups.languages && languageItems.some((item) => item.id === activeView) ? " is-active" : ""}`}
              onClick={() => toggleGroup("languages")}
              type="button"
              {...dragProps(SECTION_LANGUAGES)}
            >
              {/* The flag is the language, so pressing it is where you change
                  the language — a span with a button role, because a button
                  inside a button is invalid and screen readers flatten it.
                  It opens the course picker that already exists; nothing about
                  choosing a course changed. */}
              <span
                role="button"
                tabIndex={0}
                aria-label={ui("Change the language you are learning")}
                className="np-nav-flag is-pressable"
                onClick={(event) => { event.stopPropagation(); onSwitchCourse(); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSwitchCourse();
                }}
                title={ui("Change the language you are learning")}
              >
                <FlagRoundel id={courseFlagId} />
              </span>
              <span>{ui("Language learning")}</span>
              <ChevronDown aria-hidden="true" className="np-nav-group-chevron" />
            </button>
            {groups.languages && (
              <div className="np-nav-group-items">
                {languageRows.map(({ item, row }) => {
                  if (row.kind === "soon") {
                    // Shown, and honest about it. The section reads wrong
                    // without the row, and worse with a row that goes nowhere
                    // without saying so.
                    //
                    // Draggable even though it is disabled: a disabled button
                    // is unclickable, not unmovable, and "all of them" includes
                    // the one row you might most want out of the way.
                    const SoonIcon = row.icon;
                    return (
                      <button
                        className="is-soon"
                        disabled
                        key={row.label}
                        title={ui("Not built yet.")}
                        type="button"
                        {...dragProps(ROW_SPEAKING)}
                      >
                        <span aria-hidden="true" className="np-nav-visual"><SoonIcon className="np-nav-icon" /></span>
                        <span>{ui(row.label)}</span>
                        <b className="np-nav-soon">{ui("Soon")}</b>
                      </button>
                    );
                  }
                  if (row.kind === "view") {
                    const ViewIcon = row.icon;
                    const viewActive = activeView === row.view;
                    return (
                      <button
                        aria-current={viewActive ? "page" : undefined}
                        className={viewActive ? "is-active" : ""}
                        key={row.label}
                        onClick={() => { requestVocabLibraryFirst(); requestVocabLibraryOpen(); onNavigate(row.view); scrollToVocabularyLibrary(); }}
                        onFocus={() => onPrefetch(row.view)}
                        onPointerEnter={() => onPrefetch(row.view)}
                        title={ui("Your vocabulary library, on the progress page.")}
                        type="button"
                        {...dragProps(ROW_VOCABULARY)}
                      >
                        <span aria-hidden="true" className="np-nav-visual"><ViewIcon className="np-nav-icon" /></span>
                        <span>{ui(row.label)}</span>
                      </button>
                    );
                  }
                  if (!item) return null;
                  const Icon = NAV_GROUP_ICONS[item.id] ?? item.icon;
                  const active = item.id === activeView
                    || (item.id === "practice" && (activeView === "tests" || activeView === "grammar"));
                  return (
                    <button
                      aria-current={active ? "page" : undefined}
                      className={active ? "is-active" : ""}
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      onFocus={() => onPrefetch(item.id)}
                      onPointerEnter={() => onPrefetch(item.id)}
                      type="button"
                      {...dragProps(item.id)}
                    >
                      <span aria-hidden="true" className="np-nav-visual"><Icon className="np-nav-icon" /></span>
                      <span>{ui(item.label)}</span>
                      {/* Hiding lives on the row it hides, revealed by hovering it.
                          A permanent cross on eleven rows would be eleven invitations
                          to dismantle the nav; nested inside the button it would be a
                          button inside a button, which is invalid and which screen
                          readers flatten. So it is a sibling, positioned over the row,
                          and it stops the click from also navigating. */}
                      {canHideNavItem(item.id) && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={uiFmt("Hide {label}", { label: ui(item.label) })}
                          className="np-nav-hide"
                          onClick={(event) => { event.stopPropagation(); setHidden(hideNavItem(item.id)); }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            setHidden(hideNavItem(item.id));
                          }}
                        >
                          <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {countryItem && !isHidden(SECTION_COUNTRY) && (
          <div className={`np-nav-group${groups.country ? " is-open" : ""}`}>
            {/* The heading drags as the section, not as Life in the UK. It used
                to carry that one item's id, so putting the heading away was
                indistinguishable from putting one row away — and the row it
                happened to name is the one the whole group hangs on. */}
            <button
              aria-expanded={groups.country}
              className={`np-nav-group-head${!groups.country && activeView === "life-in-uk" ? " is-active" : ""}`}
              onClick={() => toggleGroup("country")}
              type="button"
              {...dragProps(SECTION_COUNTRY)}
            >
              {/* The flag is the country chooser, the same way the language
                  group's flag changes the language being learned. */}
              <span
                role="button"
                tabIndex={0}
                aria-label={ui("Choose the country you are studying")}
                aria-haspopup="menu"
                aria-expanded={countryMenuOpen}
                className="np-nav-flag is-pressable"
                onClick={(event) => { event.stopPropagation(); setCountryMenuOpen((open) => !open); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setCountryMenuOpen((open) => !open);
                }}
              >
                <FlagRoundel id={countryPack(countryId).flagId ?? COUNTRY_STUDIES_FALLBACK_FLAG_ID} />
              </span>
              <span>{ui("Country studies")}</span>
              <ChevronDown aria-hidden="true" className="np-nav-group-chevron" />
              <span
                role="button"
                tabIndex={0}
                aria-label={uiFmt("Hide {label}", { label: ui("Country studies") })}
                className="np-nav-hide"
                onClick={(event) => { event.stopPropagation(); setHidden(hideNavItem(SECTION_COUNTRY)); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setHidden(hideNavItem(SECTION_COUNTRY));
                }}
              >
                <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </button>
            {countryMenuOpen && (
              <div className="np-nav-country-picker" role="menu" aria-label={ui("Country studies")}>
                {COUNTRY_PACKS.map((entry) => {
                  const selected = countryId === entry.id;
                  return (
                    <button
                      aria-checked={selected}
                      className={"np-nav-country-option" + (selected ? " is-active" : "")}
                      key={entry.id}
                      onClick={() => {
                        setCountryMenuOpen(false);
                        // Keep the section you were on when swapping country,
                        // so choosing Germany from the Timeline lands on the
                        // German timeline rather than back at the lessons.
                        onOpenUkSection(ukTab, entry.id);
                      }}
                      onFocus={() => onPrefetch("life-in-uk")}
                      onPointerEnter={() => onPrefetch("life-in-uk")}
                      role="menuitemradio"
                      type="button"
                    >
                      <span aria-hidden="true" className="np-nav-visual">
                        <FlagRoundel id={entry.flagId} />
                      </span>
                      {/* The country, not the course title. The title says
                          "– Land und Kultur" after every one of them, which
                          the group heading above already says once, and in a
                          menu this narrow it cost three lines a row and broke
                          Großbritannien in half. The card and the course
                          chooser keep the full title; they have the room and
                          the reader is choosing a course there. */}
                      <span>{ui(entry.country)}</span>
                      {selected && <Check aria-hidden="true" className="np-nav-country-tick" />}
                    </button>
                  );
                })}
              </div>
            )}
            {groups.country && (
              <div className="np-nav-group-items">
                {/* Only the selected country's sections. Which country that is
                    is said by the flag above and by the chooser it opens, so
                    repeating it as a row here would be a second answer to a
                    question already answered. */}
                {UK_SECTIONS.filter((section) => !isHidden(ukTabRowId(section.tab))).map((section) => {
                  const Icon = section.icon;
                  const active = activeView === "life-in-uk" && ukTab === section.tab;
                  return (
                    <button
                      aria-current={active ? "page" : undefined}
                      className={active ? "is-active" : ""}
                      key={section.tab}
                      onClick={() => onOpenUkSection(section.tab)}
                      onFocus={() => onPrefetch("life-in-uk")}
                      onPointerEnter={() => onPrefetch("life-in-uk")}
                      type="button"
                      {...dragProps(ukTabRowId(section.tab))}
                    >
                      <span aria-hidden="true" className="np-nav-visual"><Icon className="np-nav-icon" /></span>
                      <span>{ui(section.label)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {betaItems.filter((item) => !isHidden(item.id)).length > 0 && !isHidden(SECTION_BETA) && (
          <div className={`np-nav-group np-nav-group--beta${groups.beta ? " is-open" : ""}`}>
            {/* A heading like the two above it. This used to be a violet
                "Beta" pill, which made the newest section read as a warning
                label rather than a place to go, and left it the only heading
                in the sidebar that did not look like one. The first cell holds
                a flask rather than a flag, which is what the two sections above
                it carry and what a section that is not a language cannot: it
                says in a picture what the rows underneath say in words, that
                this is still being tested. The state key stays "beta" — it is
                stored per profile, so renaming it would spring the fold back to
                its default for anyone who had already set it. */}
            <button
              aria-expanded={groups.beta}
              className={`np-nav-group-head${!groups.beta && betaItems.some((item) => item.id === activeView) ? " is-active" : ""}`}
              onClick={() => toggleGroup("beta")}
              type="button"
              {...dragProps(SECTION_BETA)}
            >
              <span aria-hidden="true" className="np-nav-beta-mark"><FlaskConical /></span>
              <span>{ui("Beta")}</span>
              <ChevronDown aria-hidden="true" className="np-nav-group-chevron" />
            </button>
            {groups.beta && (
              <div className="np-nav-group-items">
            {betaItems.filter((item) => !isHidden(item.id)).map((item) => {
              const Icon = item.icon;
              const active = item.id === activeView;
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={active ? "is-active" : ""}
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  onFocus={() => onPrefetch(item.id)}
                  onPointerEnter={() => onPrefetch(item.id)}
                  title={ui("Still in testing — expect rough edges.")}
                  type="button"
                  {...dragProps(item.id)}
                >
                  <span aria-hidden="true" className="np-nav-visual"><Icon className="np-nav-icon" /></span>
                  <span>{ui(item.label)}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={uiFmt("Hide {label}", { label: ui(item.label) })}
                    className="np-nav-hide"
                    onClick={(event) => { event.stopPropagation(); setHidden(hideNavItem(item.id)); }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      setHidden(hideNavItem(item.id));
                    }}
                  >
                    <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
              </div>
            )}
          </div>
        )}

        {/*
          The foot of the nav: the overflow drawer, and the way back.

          Hiding something with no visible route to undo it is how a nav ends
          up permanently missing an entry nobody can find again. Once anything
          is put away, the restore control appears at the bottom of the nav;
          until then there is nothing here to restore, so no empty footer is
          shown.
        */}
        {hidden.length > 0 && (
          <div className="np-nav-footer">
            {/* Dragging a row here puts it away, which is where a row dragged
                off the nav was already going — it used to be dropped on More,
                and the row it landed on is the one that lists it afterwards.
                The zone keeps its name so both ends of the drag still agree. */}
            <button
              aria-expanded={restoreOpen}
              aria-label={uiFmt("Hidden ({n})", { n: hidden.length })}
              className={`np-nav-hidden-toggle${dropTarget === "more" ? " is-drop-target" : ""}`}
              onClick={() => setRestoreOpen((open) => !open)}
              type="button"
              {...acceptDrop("more", "sidebar", (id) => setHidden(hideNavItem(id)))}
            >
              <span aria-hidden="true" className="np-nav-visual"><EyeOff className="np-nav-icon" /></span>
              <span>{ui("Hidden apps")}</span>
              <b className="np-nav-hidden-count">{hidden.length}</b>
            </button>
            {restoreOpen && (
              <div className="np-nav-hidden-list">
                {hidden.map((id) => {
                  const item = ALL_NAV_ITEMS.find((entry) => entry.id === id);
                  const label = item ? ui(item.label) : navHideLabel(id);
                  return (
                    <button
                      aria-label={uiFmt("Show {label}", { label })}
                      className="np-nav-hidden-row"
                      key={id}
                      onClick={() => setHidden(showNavItem(id))}
                      type="button"
                    >
                      <span className="truncate">{label}</span>
                      {/* The eye lives here and only here. On a visible row it was
                          eleven standing invitations to dismantle the nav, and
                          with a mouse things are put away by dragging; on a
                          put-away row it is the whole point of opening the
                          drawer. */}
                      <span aria-hidden="true" className="np-nav-hidden-show"><Eye className="h-3.5 w-3.5" /></span>
                    </button>
                  );
                })}
                {hidden.length > 1 && (
                  <button
                    className="np-nav-hidden-row is-all"
                    onClick={() => setHidden(showAllNavItems())}
                    type="button"
                  >
                    {ui("Show all")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="np-sidebar-spacer" />
      <button
        aria-label={ui("Resize sidebar")}
        aria-orientation="vertical"
        aria-valuemax={PROTOTYPE_SIDEBAR_MAX}
        aria-valuemin={PROTOTYPE_SIDEBAR_MIN}
        aria-valuenow={width}
        className="np-sidebar-resizer"
        onDoubleClick={() => onResize(defaultPrototypeSidebarWidth(), true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onResize(width - 8, true);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            onResize(width + 8, true);
          } else if (event.key === ui("Home")) {
            event.preventDefault();
            onResize(PROTOTYPE_SIDEBAR_MIN, true);
          } else if (event.key === "End") {
            event.preventDefault();
            onResize(PROTOTYPE_SIDEBAR_MAX, true);
          }
        }}
        onPointerDown={startResize}
        role="separator"
        title={ui("Drag to resize. Double-click to reset.")}
        type="button"
      />
    </aside>
  );
}

function StatChip({ kind, value, label }: { kind: RewardKind; value: string; label: string }) {
  return (
    /* No note about scope any more: every figure here counts the chosen
       language, so there is nothing to warn about. */
    <div className="np-stat-chip">
      <span aria-hidden="true" className={`np-stat-chip__art np-stat-chip__art--${kind}`}>
        <RewardIcon kind={kind} />
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

/**
 * The line under the greeting, per screen.
 *
 * The default is an invitation to start a lesson, and it is right on every
 * screen you open in order to learn. It is wrong on the ones you open for
 * something else: settings is where you change something, progress is where
 * you look back, More is where you go when you are looking for a thing, and
 * Friends is a list of people rather than anything to practise. Those say so.
 *
 * Anything not named here keeps the invitation.
 */
const HEADER_SUBTITLES: Partial<Record<PrototypeView, string>> = {
  more: "What are you looking for?",
  profile: "What would you like to change?",
  progress: "How far have you come?",
  social: "Here are your friends.",
};

function Header({
  avatar,
  view,
  onSignOut,
  equippedBadge,
  onNavigate,
  onProfileIntent,
  onSearchOpen,
  searchCatalogLoading,
  searchItems,
  socialPreviewUnlocked,
  stats,
  userEmail,
  userName,
}: {
  avatar?: string;
  /** Where you are: the greeting's second line and the figures both follow it. */
  view: PrototypeView;
  onSignOut: () => void;
  equippedBadge: ShopBadgeId | null;
  onNavigate: (view: PrototypeView) => void;
  onProfileIntent: () => void;
  onSearchOpen: () => void;
  searchCatalogLoading: boolean;
  searchItems: PrototypeSearchItem[];
  socialPreviewUnlocked: boolean;
  stats: PrototypeStats;
  userEmail?: string | null;
  userName: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const firstName = userName.trim().split(/\s+/)[0] || "there";
  const [mutedNotifications, setMutedNotifications] = useState<Set<NotificationKind>>(() => getMutedNotificationKinds());
  const [notificationStatus, setNotificationStatus] = useState(() => getNotificationStatus());
  const [notificationFiltersOpen, setNotificationFiltersOpen] = useState(false);
  useEffect(() => {
    const sync = () => {
      setMutedNotifications(getMutedNotificationKinds());
      setNotificationStatus(getNotificationStatus());
    };
    window.addEventListener(NOTIFICATION_PREFS_EVENT, sync);
    window.addEventListener("storage-sync-completed", sync);
    return () => {
      window.removeEventListener(NOTIFICATION_PREFS_EVENT, sync);
      window.removeEventListener("storage-sync-completed", sync);
    };
  }, []);
  // Written from the learner's real numbers, so the streak note only appears
  // when there is a streak to talk about.
  // Clearing one is about today's showing, not the kind — tomorrow's streak
  // note is a different notification and should come back. Muting is the
  // control for "never show me this kind".
  // The learner's own calendar day, not UTC's: in New Zealand the UTC date
  // turns over at lunchtime, and everything cleared that morning came back.
  const calendarNow = new Date();
  const today = `${calendarNow.getFullYear()}-${String(calendarNow.getMonth() + 1).padStart(2, "0")}-${String(calendarNow.getDate()).padStart(2, "0")}`;
  const allNotifications: Array<{ id: string; kind: NotificationKind; title: string; body: string; view: PrototypeView }> = [
    { id: `reviews:${today}`, kind: "reviews", title: ui("Your review is ready"), body: ui("Revisit a few useful phrases while they are still fresh."), view: "practice" },
    { id: `games:${today}`, kind: "games", title: ui("Seven games are ready"), body: ui("Try a short spelling, recall, or vocabulary game."), view: "games" },
    stats.streak > 0
      ? { id: `streak:${today}`, kind: "streak" as const, title: uiFmt("{n}-day streak", { n: stats.streak }), body: ui("One short block today keeps it going."), view: "home" as PrototypeView }
      : { id: `streak:${today}`, kind: "streak" as const, title: ui("Start a streak today"), body: ui("A single lesson is enough to begin one."), view: "practice" as PrototypeView },
    { id: `progress:${today}`, kind: "progress", title: ui("See how far you have come"), body: ui("Your vocabulary total and next milestone are on your profile."), view: "profile" },
  ];
  const notifications = allNotifications.filter((item) =>
    !mutedNotifications.has(item.kind) && !notificationStatus.dismissed.has(item.id));
  const unreadNotifications = notifications.filter((item) => !notificationStatus.read.has(item.id));
  const allNotificationsMuted = mutedNotifications.size >= NOTIFICATION_KINDS.length;
  const clearedSomething = allNotifications.some((item) => notificationStatus.dismissed.has(item.id));
  const applyNotificationChange = (change: () => void) => {
    change();
    setNotificationStatus(getNotificationStatus());
  };
  const filteredSearchItems = useMemo(() => {
    const terms = normalizeCatalogSearchText(searchQuery).split(" ").filter(Boolean);
    const matches = terms.length
      ? searchItems.filter((item) => terms.every((term) => item.searchText.includes(term)))
      : searchItems.filter((item) => item.group === "Page");
    return matches.slice(0, 9);
  }, [searchItems, searchQuery]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const selectSearchItem = (item: PrototypeSearchItem) => {
    closeSearch();
    item.onSelect();
  };

  const openNotification = (view: PrototypeView) => {
    closeSearch();
    setNotificationsOpen(false);
    onNavigate(view);
  };

  const openProfileDestination = (view: PrototypeView) => {
    closeSearch();
    setProfileOpen(false);
    onNavigate(view);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !searchWrapRef.current?.contains(event.target)) closeSearch();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!profileOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  return (
    <header className="np-header">
      <div className="np-greeting">
        <p>{uiFmt("Hi, {name}!", { name: firstName })}</p>
        <span>{ui(HEADER_SUBTITLES[view] ?? "Ready to learn today?")}</span>
      </div>
      {/* The cell stays whether or not it has figures in it: it is the middle
          column of a three-column header, and taking it out would move the
          search and the avatar into its place instead of leaving them right. */}
      <div className="np-header-stats">
        {view === "home" && <>
        <StatChip kind="flame" label={ui("Days learned")} value={uiNumber(stats.learningDays)} />
        {/* No " XP" on the value. Its neighbours are bare numbers and the
            label underneath already reads "Total XP", so the unit made this
            one chip look different from the two beside it for no gain — and
            said XP twice. The stats strip further down the page has always
            shown it bare, so this matches that too. */}
        <StatChip kind="star" label={ui("Total XP")} value={uiNumber(stats.totalXp)} />
        <StatChip kind="trophy" label={ui("Lessons done")} value={uiNumber(stats.sessionsCompleted)} />
        </>}
      </div>
      <div className="np-header-actions">
        <div className="np-search-wrap" ref={searchWrapRef}>
          <button
            aria-controls="prototype-global-search"
            aria-expanded={searchOpen}
            aria-label={ui("Search Micheon")}
            className={`np-icon-button np-desktop-search${searchOpen ? " is-active" : ""}`}
            onClick={() => {
              setNotificationsOpen(false);
              setProfileOpen(false);
              if (searchOpen) closeSearch();
              else {
                onSearchOpen();
                setSearchOpen(true);
              }
            }}
            type="button"
          >
            <Search />
          </button>
          <AnimatePresence initial={false}>
            {searchOpen && (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                aria-label={ui("Search Micheon")}
                className="np-search-panel"
                exit={{ opacity: 0, scale: 0.985, y: -6 }}
                id="prototype-global-search"
                initial={{ opacity: 0, scale: 0.985, y: -9 }}
                role="dialog"
                transition={{ duration: 0.16 }}
              >
                <label className="np-search-field">
                  <Search aria-hidden="true" />
                  <input
                    aria-label={ui("Search lessons, pages, and games")}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && filteredSearchItems[0]) selectSearchItem(filteredSearchItems[0]);
                    }}
                    placeholder={ui("Search lessons, pages, games, or a German phrase…")}
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                  />
                  {searchQuery && (
                    <button
                      aria-label={ui("Clear search")}
                      onClick={() => {
                        setSearchQuery("");
                        searchInputRef.current?.focus();
                      }}
                      type="button"
                    >
                      <X />
                    </button>
                  )}
                </label>

                <div className="np-search-panel-heading">
                  <strong>{searchQuery ? ui("Search results") : ui("Quick links")}</strong>
                  <small>{searchCatalogLoading
                    ? ui("Loading lessons…")
                    : `${filteredSearchItems.length} ${filteredSearchItems.length === 1 ? "result" : "results"}`}</small>
                </div>

                <div className="np-search-results">
                  {filteredSearchItems.length > 0 ? filteredSearchItems.map((item) => (
                    <button data-testid="prototype-search-result" key={item.id} onClick={() => selectSearchItem(item)} type="button">
                      <span className="np-search-result-group">{ui(item.group)}</span>
                      <div>
                        <strong>{ui(item.title)}</strong>
                        <small>{ui(item.subtitle)}</small>
                      </div>
                      <span className="np-search-result-action">{ui(item.actionLabel)}<ChevronRight /></span>
                    </button>
                  )) : searchCatalogLoading ? (
                    <div className="np-search-empty">
                      <strong>{ui("Loading lesson search")}</strong>
                      <span>{ui("Pages and games are ready now.")}</span>
                    </div>
                  ) : (
                    <div className="np-search-empty">
                      <strong>{ui("No matching result")}</strong>
                      <span>{ui("Try a lesson name, topic, German phrase, or game.")}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="np-notification-wrap">
          <button
            aria-expanded={notificationsOpen}
            aria-label={allNotificationsMuted
              ? ui("Notifications, all muted")
              : uiFmt("{n} unread notifications", { n: unreadNotifications.length })}
            className={`np-icon-button np-notification${allNotificationsMuted ? " is-muted" : ""}`}
            onClick={() => {
              closeSearch();
              setProfileOpen(false);
              setNotificationsOpen((open) => !open);
            }}
            type="button"
          >
            {allNotificationsMuted ? <BellOff /> : <Bell />}
            {unreadNotifications.length > 0 && <span aria-hidden="true">{unreadNotifications.length}</span>}
          </button>
          <AnimatePresence initial={false}>
            {notificationsOpen && (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="np-notification-panel"
                exit={{ opacity: 0, scale: 0.98, y: -5 }}
                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                role="dialog"
                transition={{ duration: 0.16 }}
              >
                <div className="np-notification-heading">
                  <div>
                    <strong>{ui("Notifications")}</strong>
                    <small>{allNotificationsMuted
                      ? ui("All muted")
                      : unreadNotifications.length > 0
                        ? uiFmt("{n} unread of {total}", { n: unreadNotifications.length, total: notifications.length })
                        : uiFmt("{n} shown, all read", { n: notifications.length })}</small>
                  </div>
                  {/* One right-aligned cluster: with the heading's
                      space-between, two loose buttons left the filter toggle
                      floating mid-panel. */}
                  <div className="np-notification-heading-buttons">
                    <button
                      aria-expanded={notificationFiltersOpen}
                      aria-label={ui("Filter notifications")}
                      className={`np-notification-filter-toggle${notificationFiltersOpen ? " is-open" : ""}`}
                      onClick={() => setNotificationFiltersOpen((open) => !open)}
                      type="button"
                    >
                      <SlidersHorizontal aria-hidden="true" />
                    </button>
                    <button aria-label={ui("Close notifications")} onClick={() => setNotificationsOpen(false)} type="button">
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {notifications.length > 0 && (
                  <div className="np-notification-actions">
                    <button
                      disabled={unreadNotifications.length === 0}
                      onClick={() => applyNotificationChange(() =>
                        markNotificationsRead(notifications.map((item) => item.id)))}
                      type="button"
                    >
                      <CheckCheck aria-hidden="true" />
                      {ui("Mark all as read")}
                    </button>
                    <button
                      onClick={() => applyNotificationChange(() =>
                        dismissNotifications(notifications.map((item) => item.id)))}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                      {ui("Clear all")}
                    </button>
                  </div>
                )}
                {notificationFiltersOpen && (
                  <div className="np-notification-filters">
                    <div className="np-notification-filters-head">
                      <span>{ui("Show")}</span>
                      <button
                        onClick={() => setMutedNotifications(setAllNotificationsMuted(!allNotificationsMuted))}
                        type="button"
                      >
                        {allNotificationsMuted ? ui("Unmute all") : ui("Mute all")}
                      </button>
                    </div>
                    <div className="np-notification-filter-chips">
                      {NOTIFICATION_KINDS.map((kind) => {
                        const muted = mutedNotifications.has(kind.id);
                        return (
                          <button
                            aria-pressed={!muted}
                            className={muted ? "is-muted" : ""}
                            key={kind.id}
                            onClick={() => setMutedNotifications(setNotificationKindMuted(kind.id, !muted))}
                            type="button"
                          >
                            {muted ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
                            {ui(kind.label)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="np-notification-list">
                  {notifications.length > 0 ? notifications.map((notification) => {
                    const unread = !notificationStatus.read.has(notification.id);
                    return (
                      <div className={`np-notification-row${unread ? " is-unread" : ""}`} key={notification.id}>
                        <button
                          className="np-notification-open"
                          onClick={() => {
                            applyNotificationChange(() => markNotificationsRead([notification.id]));
                            openNotification(notification.view);
                          }}
                          type="button"
                        >
                          {/* A read row keeps a quiet dot — the running number
                              it used to show read as clutter, not information. */}
                          <span><span className={`np-notification-dot${unread ? "" : " is-read"}`} /></span>
                          <div><strong>{ui(notification.title)}</strong><small>{ui(notification.body)}</small></div>
                          <ChevronRight />
                        </button>
                        <div className="np-notification-row-actions">
                          {unread && (
                            <button
                              aria-label={uiFmt("Mark {name} as read", { name: ui(notification.title) })}
                              onClick={() => applyNotificationChange(() => markNotificationsRead([notification.id]))}
                              title={ui("Mark as read")}
                              type="button"
                            >
                              <Check aria-hidden="true" />
                            </button>
                          )}
                          <button
                            aria-label={uiFmt("Delete {name}", { name: ui(notification.title) })}
                            onClick={() => applyNotificationChange(() => dismissNotifications([notification.id]))}
                            title={ui("Delete")}
                            type="button"
                          >
                            <X aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="np-notification-empty">
                      <BellOff aria-hidden="true" />
                      <strong>{allNotificationsMuted ? ui("Nothing to show") : ui("You are all caught up")}</strong>
                      <span>{allNotificationsMuted
                        ? ui("Every kind of notification is muted. Use the filter above to bring some back.")
                        : ui("Cleared notifications come back tomorrow. Mute a kind above to stop it for good.")}</span>
                      {clearedSomething && !allNotificationsMuted && (
                        <button
                          className="np-notification-restore"
                          onClick={() => applyNotificationChange(() => restoreDismissedNotifications())}
                          type="button"
                        >
                          <RotateCcw aria-hidden="true" />
                          {ui("Undo clear")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="np-profile-wrap" ref={profileMenuRef}>
          <button
            aria-controls="prototype-profile-menu"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label={ui("Open profile menu")}
            className={`np-profile-button${profileOpen ? " is-open" : ""}`}
            onFocus={onProfileIntent}
            onClick={() => {
              closeSearch();
              setNotificationsOpen(false);
              setProfileOpen((open) => !open);
            }}
            onPointerEnter={onProfileIntent}
            type="button"
          >
            {/* The photo, when there is one. The top bar only ever drew the
                initial, so uploading a picture changed the profile page and
                nothing else — the one place you look at every day. */}
            <span className="np-profile-avatar-mark">
              {avatar
                ? <img alt="" className="np-profile-avatar-photo" src={avatar} />
                : <b>{firstName[0]?.toUpperCase() ?? "?"}</b>}
              {equippedBadge && <i className="np-equipped-badge"><ShopBadgeArt id={equippedBadge} /></i>}
            </span>
            <ChevronDown />
          </button>
          <AnimatePresence initial={false}>
            {profileOpen && (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="np-profile-menu"
                exit={{ opacity: 0, scale: 0.98, y: -5 }}
                id="prototype-profile-menu"
                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                role="menu"
                transition={{ duration: 0.16 }}
              >
                <div className="np-profile-menu-summary">
                  <span aria-hidden="true" className="np-profile-avatar-mark">
                    {avatar
                      ? <img alt="" className="np-profile-avatar-photo" src={avatar} />
                      : <b>{firstName[0]?.toUpperCase() ?? "?"}</b>}
                    {equippedBadge && <i className="np-equipped-badge"><ShopBadgeArt id={equippedBadge} /></i>}
                  </span>
                  <div>
                    <strong>{firstName}</strong>
                    <small>{userEmail || ui("Learning German")}</small>
                  </div>
                </div>
                <div className="np-profile-menu-actions">
                  {/* Progress leads the menu. It is the one thing here you
                      look at daily; settings and the social preview are not. */}
                  <button onClick={() => openProfileDestination("progress")} role="menuitem" type="button">
                    <span><BarChart3 /></span>
                    <div><strong>{ui("Your progress")}</strong><small>{ui("Levels, achievements, and activity")}</small></div>
                    <ChevronRight />
                  </button>
                  <button onClick={() => openProfileDestination("profile")} role="menuitem" type="button">
                    <span><CircleUserRound /></span>
                    <div><strong>{ui("Profile and settings")}</strong><small>{ui("Account, appearance, and preferences")}</small></div>
                    <ChevronRight />
                  </button>
                  {socialPreviewUnlocked && (
                    <button onClick={() => openProfileDestination("social")} role="menuitem" type="button">
                      <span><UsersRound /></span>
                      <div><strong>{ui("Friends and leaderboard")}</strong><small>{ui("Your private social preview")}</small></div>
                      <ChevronRight />
                    </button>
                  )}
                  <button onClick={() => openProfileDestination("more")} role="menuitem" type="button">
                    <span><Menu /></span>
                    <div><strong>{ui("More options")}</strong><small>{ui("Courses and the full Micheon app")}</small></div>
                    <ChevronRight />
                  </button>
                  {/* Signing out was buried at the bottom of Profile settings —
                      three screens from the avatar you would naturally click to
                      find it. */}
                  <button className="np-profile-menu-signout" onClick={onSignOut} role="menuitem" type="button">
                    <span><LogOut /></span>
                    <div><strong>{ui("Sign out")}</strong><small>{ui("Your progress stays saved on this device")}</small></div>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
/**
 * The motivational banner: her skyline behind, the mascot in front of it.
 *
 * The mascot is not a cut-out — it is drawn into the top of the existing hero
 * artwork, on grass. Rather than fake a cut-out badly, the right-hand slice of
 * that picture is laid over the skyline behind a soft elliptical mask, so its
 * grass fades into the meadow the skyline already has on that side.
 */
/**
 * The picture each scene lends the banner.
 *
 * Two are missing on purpose. Plain canvas is the option for wanting no
 * scenery, so it keeps the app's own banner. And monkey world has the mascot
 * painted into it — he was taken off this banner at her word, and a setting is
 * no way to put him back. Both fall through to the banner that has always been
 * here.
 */
const BANNER_SCENERY: Partial<Record<GuidedBackground, { src: string; frame: string }>> = {
  // Centre, all four, because each file now has the banner's own shape. They
  // arrived with black bars baked in and at ratios from 2:1 to 3:1: trimmed to
  // their real edges, then to 5.5 to 1, which sits between the widths this box
  // takes. There is no band left to place.
  // Right, and a band through the middle. The bubbles float in the right
  // half of this picture and the left is an empty wash, so a narrow window
  // should trim the wash — and the banner keeps the row of them rather than
  // the sky above or the ground below.
  bubbles: { src: scenerySpeechBubbles, frame: "right 52%" },
  // Right, not centre. In a narrow window the banner stops being a strip and
  // starts trimming the SIDES — at 900px only 43% of the width survives, 29%
  // off each end. This picture keeps its aeroplane and its globe in the right
  // half and empty sky in the left, so a centred trim took the aeroplane away
  // entirely and left a piece of ocean. Anchored right, the trim comes off the
  // sky and both survive.
  atlas: { src: sceneryFlightPath, frame: "right center" },
  garden: { src: sceneryFlowerGarden, frame: "center" },
  dawn: { src: scenerySoftDawn, frame: "center" },
  // Right, like the globe: the monkeys hang from a branch on the right of this
  // picture and the left is open sky over the valley, so a narrow window
  // should trim the sky rather than them.
  //
  // This scene used to be left out on purpose, because the artwork it had was
  // the app's own mascot and she had asked for him to come off this banner.
  // The picture is hers now and named for the banner, so the exception has no
  // reason left.
  monkey: { src: sceneryMonkeyWorld, frame: "right 38%" },
};

/**
 * The banner picture, following the scenery chosen for a lesson.
 *
 * Read on mount and kept in step through the event the setting fires, so
 * choosing a scene changes this page while it is open rather than at the next
 * start. A picture of your own is used here too: that is the whole point of
 * having put one there.
 */
function useBannerScenery(): { src: string; frame?: string } {
  const [scene, setScene] = useState<GuidedBackground>(() => getGuidedBackground());
  const [own, setOwn] = useState<string | null>(() => getGuidedCustomBackground());
  useEffect(() => {
    const refresh = () => {
      setScene(getGuidedBackground());
      setOwn(getGuidedCustomBackground());
    };
    window.addEventListener(GUIDED_BACKGROUND_EVENT, refresh);
    // Another window of the same profile counts as well.
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(GUIDED_BACKGROUND_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  // A picture of your own has no framing anyone can know in advance, so it
  // takes the middle. The sunrise keeps the placement written for it in CSS.
  if (scene === "custom" && own) return { src: own, frame: "center" };
  return BANNER_SCENERY[scene] ?? { src: homeBannerImage };
}

function HomeBanner() {
  const scenery = useBannerScenery();
  return (
    <section className="np-home-banner">
      <img
        alt=""
        className="np-home-banner-sky"
        decoding="async"
        fetchPriority="high"
        loading="eager"
        src={scenery.src}
        style={scenery.frame ? { objectPosition: scenery.frame } : undefined}
      />
      <div aria-hidden="true" className="np-home-banner-wash" />
      <div className="np-home-banner-copy">
        <p>{useMotivationQuote()}</p>
      </div>
    </section>
  );
}

/**
 * The second card: the citizenship course, with its own progress.
 *
 * Britain is the only country the course covers, and choosing another one is
 * work still in flight, so this reports what exists rather than
 * inventing a picker for it. Its progress is the real count of lessons
 * completed in that course.
 */
/**
 * The language half of "What would you like to learn today?".
 *
 * Deliberately the same shape as CountryCard below: her reference draws the
 * two as a pair — badge, title, a line of description, a panel naming what is
 * selected with a Change beside it, a progress panel, one Continue button.
 * The course hero that used to sit here was a different object altogether,
 * and beside the country card it read as two unrelated things.
 *
 * Which language is being learnt is not chosen here — the Change button opens
 * the existing course picker, exactly as the flag in the rail does.
 */
function LanguageCard({
  contentMenuOpen,
  lessonContent,
  onOpen,
  onPickContent,
  onSwitchCourse,
  onToggleContentMenu,
  onToggleFold,
  open,
  packProgress,
  profile,
  stats,
}: {
  contentMenuOpen: boolean;
  lessonContent: LessonContent;
  onOpen: () => void;
  onPickContent: (value: LessonContent) => void;
  onSwitchCourse: () => void;
  onToggleContentMenu: () => void;
  /** Folds the card away to the left, and back out again. */
  onToggleFold: () => void;
  open: boolean;
  packProgress: PackProgress | null;
  profile: UserProfile | null;
  stats: PrototypeStats;
}) {
  const sides = courseSides();
  // Same rule as the rail: the built-in courses are told apart by which way
  // round the learner is going, not by the stored course id — several accounts
  // store "german", and reading it alone showed some of them the wrong flag.
  const courseFlagId = learningFlagId(getActiveCourseId(profile));
  // Which English, for the picture: the two spellings are one course, and the
  // scene behind it is the one thing that can tell them apart on this card.
  const englishVariant = sides.target.code === "en" ? resolveEnglishVariant(getEnglishVariant()) : null;
  const percent = packProgress ? packProgress.percent : 0;

  return (
    <article className={`np-home-choice np-home-choice--language${open ? "" : " is-folded"}`}>
      {/* The handle sits in the corner the card folds towards, and the arrow
          points the way it will go — so it turns round rather than becoming a
          second icon. Outside the hero, because it has to stay put while
          everything under it is folded away. */}
      <button
        aria-expanded={open}
        aria-label={open ? ui("Fold this card away") : ui("Open this card")}
        className="np-home-choice-fold"
        onClick={onToggleFold}
        title={open ? ui("Fold this card away") : ui("Open this card")}
        type="button"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      {/* Folded, the card is a slice of its own picture with its flag and its
          name down it. A blank strip would be a thing to work out rather than
          a thing to recognise. */}
      {!open && (
        <span aria-hidden="true" className="np-home-choice-spine">
          <span className="np-home-choice-spine-flag"><FlagRoundel id={courseFlagId} /></span>
          <b>{ui("Language learning")}</b>
        </span>
      )}
      {/* Two halves. Only the heading and the current language stay in the
          picture; the building blocks and the continue row all sit below it.
          to its foot, so far more of the artwork is visible; progress and the
          button sit below it on the plain card. */}
      <div className="np-home-choice-hero">
        <img alt="" className="np-course-art" data-course={sides.target.code} decoding="async" fetchPriority="high" height={833} loading="eager" src={languageCardArt(sides.target.code, englishVariant)} width={1200} />
        <div aria-hidden="true" className="np-home-choice-wash" />
        <div className="np-home-choice-body">
          <span aria-hidden="true" className="np-home-choice-flag"><FlagRoundel id={courseFlagId} /></span>
          <h2>{ui("Language learning")}</h2>
          <p>{ui("Learn a new language step by step and build your skills.")}</p>

          {/* One bubble holding both choices, on her call: "lektionsinhalt
              kann gern in der selben bubble sein wie aktuelle sprache". They
              are two fields divided by a rule rather than two panels. */}
          <div className="np-home-choice-panel np-home-choice-panel--pair">
            <div className="np-home-choice-field">
              <small>{ui("Current language")}</small>
              <span className="np-home-choice-value">
                <FlagRoundel id={courseFlagId} />
                <strong>{ui(sides.target.label)}</strong>
                <button className="np-home-choice-change" onClick={onSwitchCourse} type="button">
                  {ui("Change")}
                </button>
              </span>
            </div>

            {/* The same choice the next-lesson strip used to carry: whether a
                sitting is made of sentences, words, or both. Same three values
                and the same store — only where it lives has changed. */}
            <div className="np-home-choice-field np-home-choice-field--content">
              <small>{ui("Lesson content")}</small>
              <span className="np-home-choice-value">
                <span aria-hidden="true" className="np-home-choice-icon"><Layers /></span>
                <strong>{ui(lessonContent === "words" ? "Words" : lessonContent === "mixed" ? "Both" : "Sentences")}</strong>
                <button
                  aria-expanded={contentMenuOpen}
                  aria-haspopup="menu"
                  aria-label={ui("What your lessons are made of")}
                  className="np-home-choice-change"
                  onClick={onToggleContentMenu}
                  type="button"
                >
                  {ui("Change")}
                  <ChevronDown aria-hidden="true" />
                </button>
              </span>

              {contentMenuOpen && (
                <div aria-label={ui("What your lessons are made of")} className="np-home-content-menu" role="menu">
                  {([
                    ["sentences", "Sentences", "Phrases, sentences and dialogues — the course as it has always been."],
                    ["words", "Words", "Single words with their meanings, most common first."],
                    ["mixed", "Both", "Four sentence slots and two word slots in each sitting."],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      aria-checked={lessonContent === value}
                      key={value}
                      onClick={() => onPickContent(value)}
                      role="menuitemradio"
                      type="button"
                    >
                      <strong>{ui(label)}</strong>
                      <small>{ui(hint)}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="np-home-choice-foot">
        <div className="np-home-choice-panel np-home-choice-panel--progress">
          <small>{ui("Your progress")}</small>
          <div className="np-home-choice-row">
            <span aria-hidden="true" className="np-home-choice-icon"><BookOpen /></span>
            <span className="np-home-choice-lesson">
              <strong>{packProgress ? ui(packProgress.title) : ui("Everyday essentials")}</strong>
              <small>{uiFmt("Lesson {n}", { n: uiNumber(stats.sessionsCompleted + 1) })}</small>
            </span>
            <b>{percent}&nbsp;%</b>
          </div>
          <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="np-progress-track"
            role="progressbar"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>

        <button className="np-home-choice-cta" onClick={onOpen} type="button">
          {ui("Continue learning")}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

/**
 * The Country studies artwork, one per country.
 *
 * There used to be a single picture here and it draws Berlin — the
 * Brandenburg Gate, the Fernsehturm, a yellow Deutsche Post box. Choosing the
 * United Kingdom left that scene sitting under a Union Jack roundel, which
 * says the card does not know which country you picked.
 *
 * Keyed by pack id rather than branched on, so a third country is one line
 * here and no new condition. The artwork lives in the view, not on the pack:
 * src/lib holds the material, and a bundler asset import does not belong in
 * a data module that other modules load for the questions alone.
 */
const COUNTRY_ART: Record<CountryId, string> = {
  de: homeCountryArtDe,
  es: homeCountryArtEs,
  fr: homeCountryArtFr,
  it: homeCountryArtIt,
  pl: homeCountryArtPl,
  ru: homeCountryArtRu,
  uk: homeCountryArtUk,
};

function CountryCard({
  onChangeCountry,
  onOpen,
  onToggleFold,
  open,
  pack,
  profile,
}: {
  /**
   * Opens the course chooser — the same dialog the language card opens,
   * on her instruction that the two cards work identically.
   */
  onChangeCountry: () => void;
  onOpen: () => void;
  /** Folds the card away to the right, and back out again. */
  onToggleFold: () => void;
  open: boolean;
  pack: CountryPack;
  profile: UserProfile | null;
}) {
  // The SELECTED country's course, not the British one. This card used to
  // name life-in-the-uk outright, so choosing Germany left it counting 23
  // British lessons and reporting progress through them under a German flag.
  const courseId = pack.course.id;
  const course = getCourse(courseId);
  const lessons = course?.lessons ?? [];
  const completed = loadCourseProgress(courseId, profile);
  const done = completed.length;
  const percent = lessons.length > 0 ? Math.round((Math.min(done, lessons.length) / lessons.length) * 100) : 0;
  const nextLesson = lessons.find((lesson) => !completed.includes(lesson.id));

  return (
    <article className={`np-home-choice np-home-choice--country${open ? "" : " is-folded"}`}>
      {/* The mirror of the language card's: this one folds right, so its
          handle is in the right corner and its arrow points that way. */}
      <button
        aria-expanded={open}
        aria-label={open ? ui("Fold this card away") : ui("Open this card")}
        className="np-home-choice-fold"
        onClick={onToggleFold}
        title={open ? ui("Fold this card away") : ui("Open this card")}
        type="button"
      >
        <ChevronRight aria-hidden="true" />
      </button>
      {!open && (
        <span aria-hidden="true" className="np-home-choice-spine">
          <span className="np-home-choice-spine-flag"><FlagRoundel id={pack.flagId} /></span>
          <b>{ui("Country studies")}</b>
        </span>
      )}
      {/* Same two halves as LanguageCard. The pair has to keep matching — they
          are drawn as one choice with two sides, and splitting only one of them
          would leave the row lopsided. */}
      <div className="np-home-choice-hero">
        <img alt="" className="np-home-choice-art" decoding="async" loading="eager" src={COUNTRY_ART[pack.id]} />
        <div aria-hidden="true" className="np-home-choice-wash" />
        <div className="np-home-choice-body">
          <span className="np-home-choice-flag"><FlagRoundel id={pack.flagId} /></span>
          <h2>{ui("Country studies")}</h2>
          <p>{ui("Discover the history, culture and society of the country you are studying.")}</p>

          {/* Exactly the language card's control, down to the markup: a
              label, the flag, the name, and a Change that opens the course
              chooser. This had a dropdown of its own for one version, which
              is a second control shaped like the first rather than the same
              one — two places to learn, and two places to keep in step. */}
          <div className="np-home-choice-panel">
            <small>{ui("Selected country")}</small>
            <span className="np-home-choice-value">
              <FlagRoundel id={pack.flagId} />
              {/* Off the pack. This was a two-way conditional, so the
                  French course arrived wearing the words "United
                  Kingdom" under a French flag. */}
              <strong>{ui(pack.country)}</strong>
              <button className="np-home-choice-change" onClick={onChangeCountry} type="button">
                {ui("Change")}
              </button>
            </span>
          </div>
        </div>
      </div>

      <div className="np-home-choice-foot">
        <div className="np-home-choice-panel np-home-choice-panel--progress">
          <small>{ui("Your progress")}</small>
          <div className="np-home-choice-row">
            <span aria-hidden="true" className="np-home-choice-icon"><Landmark /></span>
            <span className="np-home-choice-lesson">
              <strong>{course?.name ? ui(course.name) : ui("Country studies")}</strong>
              <small>{nextLesson ? uiFmt("Lesson {n}", { n: uiNumber(Math.min(done + 1, lessons.length)) }) : ui("Course complete")}</small>
            </span>
            <b>{percent}&nbsp;%</b>
          </div>
          <div
            aria-label={uiFmt("{pct}% through {pack}", { pct: percent, pack: ui(pack.label) })}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="np-progress-track"
            role="progressbar"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>

        <button className="np-home-choice-cta" onClick={onOpen} type="button">
          {ui("Continue learning")}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

/**
 * Read a phrase aloud in the language it is written in.
 *
 * The tag was hardcoded to de-DE, which made a German voice read English
 * answers aloud to anyone learning English.
 */
function playPhrase(text: string, langTag: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langTag;
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

/** How many right in a row fills the streak bar. */
const PRACTICE_STREAK_TARGET = 10;

/**
 * Ten questions' worth of phrases is the least this card can work with.
 *
 * A question needs one right answer and three wrong ones from the same
 * catalogue, and drawing four out of five would show the same three
 * distractors every time.
 */
const PRACTICE_MIN_POOL = 10;

function PracticeCard({
  apiParts,
  compact = false,
  onRequestCatalogue,
}: {
  apiParts: Record<string, Part>;
  compact?: boolean;
  onRequestCatalogue: () => void;
}) {
  // Built from the course catalogue, so the supply is every phrase the course
  // teaches rather than the three that used to be written in here. Rebuilt
  // when the direction changes, because which side is asked follows the course.
  const candidates = useMemo(() => practiceCandidates(buildCatalog(apiParts)), [apiParts]);
  const ready = candidates.length >= PRACTICE_MIN_POOL;

  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  /** Only the first answer to a question counts. */
  const scored = useRef(false);

  useEffect(() => {
    if (!ready) onRequestCatalogue();
  }, [onRequestCatalogue, ready]);

  const drawQuestion = useCallback((
    from: PracticeRecallState,
    justAskedId?: string
  ): PracticeQuestion | null => {
    const pick = selectPracticeItem(from, candidates, justAskedId);
    return pick ? buildPracticeQuestion(pick, candidates) : null;
  }, [candidates]);

  // First question once the catalogue arrives, and a fresh one if the course
  // changes underneath — a new pool means the phrase on screen may no longer
  // be part of what is being learned.
  useEffect(() => {
    if (!ready) return;
    setQuestion((current) => (
      current && candidates.some((candidate) => candidate.id === current.id)
        ? current
        : drawQuestion(loadPracticeRecallState())
    ));
    setSelected(null);
    scored.current = false;
  }, [candidates, drawQuestion, ready]);

  const answer = (index: number) => {
    if (!question) return;
    setSelected(index);
    if (scored.current) return;
    scored.current = true;
    const isRight = Boolean(question.options[index]?.correct);
    savePracticeRecallState(applyPracticeAnswer(loadPracticeRecallState(), question.id, isRight));
    setStreak((value) => (isRight ? value + 1 : 0));
  };

  const nextQuestion = () => {
    const drawn = drawQuestion(loadPracticeRecallState(), question?.id);
    setSelected(null);
    scored.current = false;
    if (drawn) setQuestion(drawn);
  };

  if (!question) {
    return (
      <section className={`np-practice-card${compact ? " np-practice-card--compact" : ""}`}>
        <div className="np-section-heading">
          <div>
            <h2>{ui("Choose the phrase")}</h2>
            <p>{ui("Pick what people actually say in a normal conversation.")}</p>
          </div>
        </div>
        <p className="np-practice-loading">{ui("Getting the next phrases ready…")}</p>
      </section>
    );
  }

  const chosen = selected === null ? null : question.options[selected];
  const correct = Boolean(chosen?.correct);
  const solution = question.options.find((option) => option.correct);

  return (
    <section className={`np-practice-card${compact ? " np-practice-card--compact" : ""}`}>
      <div className="np-section-heading">
        <div>
          <h2>{ui("Choose the phrase")}</h2>
          <p>{ui("Pick what people actually say in a normal conversation.")}</p>
        </div>
        <div className="np-mini-progress">
          <strong>{uiFmt("{n} in a row", { n: streak })}</strong>
          <div>
            <i style={{ width: `${Math.min(100, (streak % PRACTICE_STREAK_TARGET || (streak ? PRACTICE_STREAK_TARGET : 0)) / PRACTICE_STREAK_TARGET * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="np-practice-grid">
        <div className="np-prompt-card">
          <span className="np-prompt-language">{ui(question.promptLanguageKey)}</span>
          {solution && (
            <button
              aria-label={ui("Hear the answer")}
              className="np-sound-button"
              onClick={() => playPhrase(solution.text, question.answerLangTag)}
              type="button"
            >
              <Volume2 />
            </button>
          )}
          <MessageCircleMore aria-hidden="true" className="np-prompt-symbol" />
          <strong>{question.prompt}</strong>
          <small>{question.context ? ui(question.context) : ui("Everyday conversation")}</small>
        </div>

        <div aria-label={ui("Answer choices")} className="np-answer-list">
          {question.options.map((option, index) => {
            const picked = selected === index;
            const state = picked ? (option.correct ? "correct" : "wrong") : "idle";
            return (
              <button
                aria-pressed={picked}
                className={`np-answer np-answer--${state}`}
                key={option.text}
                onClick={() => answer(index)}
                type="button"
              >
                <span>{String.fromCharCode(65 + index)}</span>
                <strong>{option.text}</strong>
                {state === "correct" ? <Check /> : <ChevronRight />}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {chosen && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-live="polite"
            className={`np-feedback ${correct ? "is-correct" : "is-wrong"}`}
            exit={{ opacity: 0, y: 5 }}
            initial={{ opacity: 0, y: 10 }}
            key={`${question.id}-${selected}`}
            role="status"
          >
            <RewardIcon kind={correct ? "star" : "heart"} />
            <div>
              <strong>{correct ? ui("Exactly right!") : ui("Try another one")}</strong>
              {/* A miss is told what it picked and what was wanted. Skipping
                  that would leave the phrase to come back around with nothing
                  learned in between. */}
              <p>
                {correct
                  ? uiFmt("“{phrase}” is the one people use.", { phrase: chosen.text })
                  : uiFmt("“{phrase}” means “{meaning}”. The one you want is “{answer}”.", {
                    answer: solution?.text ?? "",
                    meaning: chosen.meaning,
                    phrase: chosen.text,
                  })}
              </p>
            </div>
            {/* Shown after a miss too: the phrase comes back on its own in a
                few questions, so there is nothing to be stuck on. */}
            <button className="np-feedback-next" onClick={nextQuestion} type="button">
              {ui("Next phrase")}
              <ChevronRight />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * The way back out of a feature that fills the page.
 *
 * Tests and Grammar are opened from the Practice hub; Passages from the beta
 * entries in the nav. Each then fills the page on its own, and the nav keeps
 * the place it came from lit — so the app already treats them as somewhere
 * you went INTO, but there was nothing to come back with. The nav entry is a
 * different gesture from undoing the step you just took, and on a narrow
 * window the sidebar is not even on screen.
 *
 * The caption names its destination because they no longer share one. A
 * control reading "Back to Practice" that lands you Home is worse than no
 * control at all: it is the only thing on screen claiming to know where you
 * came from, and it is wrong.
 */
function FeatureBackBar({ back, label, onBack }: { back?: string; label: string; onBack: () => void }) {
  return (
    <div className="np-feature-back">
      <button className="np-feature-back__btn" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" />
        {back ?? ui("Back to Practice")}
      </button>
      <span className="np-feature-back__where">{label}</span>
    </div>
  );
}

function PracticeHub({
  apiParts,
  onNavigate,
  onRequestCatalogue,
}: {
  apiParts: Record<string, Part>;
  onNavigate: (view: PrototypeView) => void;
  onRequestCatalogue: () => void;
}) {
  const tools = [
    {
      description: ui("Search by level or topic, then build a focused test from words, phrases, or weak spots."),
      icon: ClipboardCheck,
      label: ui("Tests"),
      meta: ui("Focused recall"),
      tone: "mint",
      view: "tests" as const,
    },
    {
      description: ui("Practise useful sentence patterns with short explanations and fill-in-the-gap activities."),
      icon: GraduationCap,
      label: ui("Grammar"),
      meta: ui("Patterns in context"),
      tone: "yellow",
      view: "grammar" as const,
    },
  ];

  return (
    <div className="np-practice-hub">
      <section className="np-practice-launcher">
        <div className="np-page-intro">
          <span className="np-page-icon"><MessageSquareText /></span>
          <div>
            <small>{ui("Practice hub")}</small>
            <h1>{ui("Choose what to strengthen")}</h1>
            <p>{ui("Keep conversational phrases central, or open a focused test or grammar activity.")}</p>
          </div>
        </div>
        <div className="np-practice-tools">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button key={ui(tool.label)} onClick={() => onNavigate(tool.view)} type="button">
                <span className={`np-feature-directory-icon np-feature-directory-icon--${tool.tone}`}><Icon /></span>
                <span>
                  <small>{tool.meta}</small>
                  <strong>{ui(tool.label)}</strong>
                  <p>{ui(tool.description)}</p>
                </span>
                <ChevronRight />
              </button>
            );
          })}
        </div>
      </section>
      <PracticeCard apiParts={apiParts} onRequestCatalogue={onRequestCatalogue} />
    </div>
  );
}

/**
 * The packs the course will actually serve next.
 *
 * These three rows used to be hardcoded: lesson "12 — Keep the conversation
 * going", numbers and titles that matched nothing the learner would ever be
 * taught, and a View all button wired to nothing at all. Both were exactly
 * mock data, and it had to go. The rows are now the real upcoming
 * packs with their real names and real progress, and View all opens the
 * lessons library where the rest of them live.
 */
function FluencyOutlook({ onOpenFading, profile, vocab }: {
  /** Opens the vocabulary library on the fading items. */
  onOpenFading: () => void;
  profile: UserProfile | null;
  vocab: number;
}) {
  const [revision, setRevision] = useState(0);
  const fluency = getFluency(vocab);
  // Recomputed with the revision counter, so finishing a lesson updates it.
  const fading = useMemo(() => countFadingVocab(profile), [profile, revision]);
  // The two lanes of the Fluent target: ~4,000 active words is the
  // research-backed core, and the rest of the road is phrases banked
  // several at a sitting. One undifferentiated "7,778 to go" read as
  // 7,778 hard words and looked unclimbable — the split is the truth.
  const split = useMemo(() => countKnownSplit(profile), [profile, revision]);
  const wordsToGo = Math.max(0, FLUENT_WORD_TARGET - split.words);
  const phrasesToGo = Math.max(0, FLUENT_PHRASE_TARGET - split.phrases);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("activity-updated", refresh);
    window.addEventListener(DIRECTION_CHANGE_EVENT, refresh);
    window.addEventListener(LEARNING_TIME_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("activity-updated", refresh);
      window.removeEventListener(DIRECTION_CHANGE_EVENT, refresh);
      window.removeEventListener(LEARNING_TIME_UPDATED_EVENT, refresh);
    };
  }, []);

  // Hours to FLUENT — the whole road. A next-stage estimate was tried and
  // rejected: the number on the card is the real distance
  // to fluency, straight-line extrapolation and all. The label names the
  // destination so nobody mistakes the span — and the next milestone rides
  // underneath, so 300-odd hours to a native-scale bar stops reading as the
  // distance to the first rewarding conversation.
  const estimate = useMemo(
    () => estimateFluencyHours(fluency.toFluent, loadLearningTimeStats(profile), { knownUnits: fluency.vocab }),
    [fluency.toFluent, fluency.vocab, profile, revision]
  );

  // Three stages, not the whole ladder: where you are, where you are going
  // next, and the far end. The seven-stop rail said the same thing in a shape
  // nobody read — she drew three cards, and three is also all that is
  // actionable at any moment.
  const nextStage = FLUENCY_STAGES[Math.min(fluency.index + 1, FLUENCY_STAGES.length - 1)];
  const finalStage = FLUENCY_STAGES[FLUENCY_STAGES.length - 1];
  // Each card says what the stage IS and what it COSTS. The middle one used
  // to say only the first and the far one only the second, which left the
  // milestone actually being worked towards without a number on it.
  const stages = [
    {
      icon: <Sun />,
      label: fluency.cur.label,
      note: uiFmt("{count} items known", { count: uiNumber(fluency.vocab) }),
      target: "",
      current: true,
    },
    {
      icon: <Users />,
      label: nextStage.label,
      note: nextStage === finalStage ? "" : ui(nextStage.blurb),
      // From the stage's own threshold, so it follows a recalibrated ladder.
      // One figure rather than two lanes: only Fluent is split into words and
      // phrases.
      target: nextStage === finalStage
        ? ""
        : uiFmt("Goal: {count} words and phrases", { count: uiNumber(nextStage.min) }),
      current: false,
    },
    {
      icon: <Flag />,
      label: finalStage.label,
      note: ui(finalStage.blurb),
      target: uiFmt("Target: {words} words + {phrases} phrases", {
        phrases: uiNumber(FLUENT_PHRASE_TARGET),
        words: uiNumber(FLUENT_WORD_TARGET),
      }),
      current: false,
    },
  ];

  // The ring is drawn rather than filled with a border trick, so the sweep is
  // exact at any percentage and the cap stays round.
  const RING = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RING;

  return (
    <section className="np-fluency-outlook">
      <div className="np-fluency-side">
        <div className="np-fluency-heading">
          <span aria-hidden="true"><Target /></span>
          <div>
            <h2>{ui("Your path to fluent conversations")}</h2>
            <p>{ui("A realistic outlook based on useful words and phrases you can recall.")}</p>
            {/* Progress is kept per course, so switching from English to German
                drops this from 11% to 1% — both true, and baffling next to a
                total XP that counts them together. Naming the course is the
                cheapest way to make the number mean what it says. */}
            <p className="np-fluency-course">
              {uiFmt("Counts your {language} course only", {
                /* A third language arrived after this line was written. Asking
                   "is it English?" and calling everything else German labelled
                   a French course German. */
                language: ui(learningEnglish() ? "English" : learningFrench() ? "French" : "German"),
              })}
            </p>
          </div>
        </div>

        <div
          aria-label={uiFmt("{pct}% to fluent", { pct: fluency.overallPct })}
          className="np-fluency-ring"
          role="img"
        >
          <svg aria-hidden="true" viewBox="0 0 140 140">
            <circle className="np-fluency-ring__track" cx="70" cy="70" r={RING} />
            <circle
              className="np-fluency-ring__arc"
              cx="70"
              cy="70"
              r={RING}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, fluency.overallPct)) / 100)}
            />
          </svg>
          <span className="np-fluency-ring__label">
            <strong>{uiNumber(fluency.overallPct)}<i>%</i></strong>
            <small>{ui(fluency.cur.label)}</small>
          </span>
        </div>
      </div>

      <div className="np-fluency-main">
        <div className="np-fluency-stages">
          {stages.map((stage, index) => (
            <Fragment key={stage.label}>
              {index > 0 && <span aria-hidden="true" className="np-fluency-stages__arrow"><ChevronRight /></span>}
              <div className={"np-fluency-stage" + (stage.current ? " is-current" : "")}>
                <span aria-hidden="true" className="np-fluency-stage__icon">{stage.icon}</span>
                {stage.current && <span className="np-fluency-stage__now">{ui("Current")}</span>}
                <strong>{ui(stage.label)}</strong>
                {stage.note && <small>{stage.note}</small>}
                {stage.target && <small className="np-fluency-stage__target">{stage.target}</small>}
              </div>
            </Fragment>
          ))}
        </div>
        {/* One strip of figures, divided rather than stacked. The hours
            estimate rides along as the fourth: her drawing has three, but the
            number it carried is the answer to "how long is this going to
            take" and deleting it to match a sketch would be a worse card. */}
        <div className="np-fluency-figures">
          <span>
            <i aria-hidden="true"><BookOpen /></i>
            {uiFmt("{words} more words", { words: uiNumber(wordsToGo) })}
          </span>
          <span>
            <i aria-hidden="true"><MessageCircle /></i>
            {uiFmt("{phrases} more phrases", { phrases: uiNumber(phrasesToGo) })}
          </span>
          {fading > 0 && (
            <button
              className="np-fluency-figures__fading"
              onClick={onOpenFading}
              title={ui("Opens your vocabulary library on these items.")}
              type="button"
            >
              <i aria-hidden="true"><RefreshCw /></i>
              {fading === 1
                ? ui("1 item is fading · review it")
                : uiFmt("{count} items are fading · review them", { count: uiNumber(fading) })}
            </button>
          )}
          <span>
            <i aria-hidden="true"><Clock3 /></i>
            {uiFmt("About {hours} hours to fluent", { hours: uiNumber(estimate.hoursRemaining) })}
          </span>
        </div>
      </div>
    </section>
  );
}

function AchievementBadge({ achievement, standalone, stats }: { achievement: Milestone; standalone: boolean; stats: PrototypeStats }) {
  const unlocked = achievement.check(stats);
  const progress = Math.min(achievement.current(stats), achievement.target);

  return (
    <div
      aria-label={`${ui(achievement.label)}. ${unlocked
        ? ui("Unlocked")
        : uiFmt("{progress} of {target} {unit}", {
          progress,
          target: achievement.target,
          unit: ui(achievement.unit),
        })}. ${ui(achievement.desc)}`}
      className={`np-achievement${unlocked ? " is-unlocked" : " is-locked"}`}
    >
      <span className="np-achievement-visual">
        <AchievementArt id={achievement.id} />
        <span aria-hidden="true" className="np-achievement-state">{unlocked ? <Check /> : <LockKeyhole />}</span>
      </span>
      <small>{ui(achievement.label)}</small>
      {standalone && (
        <span className="np-achievement-detail">
          {unlocked
            ? ui("Unlocked")
            : uiFmt("{progress} / {target} {unit}", {
              progress,
              target: achievement.target,
              unit: ui(achievement.unit),
            })}
        </span>
      )}
    </div>
  );
}

/** "Today", "Yesterday", or a short date — the learner's own words for when. */
function describeSessionDay(ts: number): string {
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diff = startOfToday.getTime() - ts;
  if (diff < 0) return ui("Today");
  if (diff < day) return ui("Yesterday");
  return uiDate(ts, { day: "numeric", month: "short" });
}

/**
 * "3 sentences, 1 conversation" — in the reader's language.
 *
 * Written out here rather than inline because German needs both halves as
 * whole keys: the singular and the plural are different words, and a sentence
 * assembled from fragments would only ever come out in English word order.
 */
function describeSessionContent(sentences: number, dialogues: number): string {
  const sentenceLabel = sentences === 1
    ? ui("1 sentence")
    : uiFmt("{count} sentences", { count: uiNumber(sentences) });
  if (dialogues <= 0) return sentenceLabel;
  const dialogueLabel = dialogues === 1
    ? ui("1 conversation")
    : uiFmt("{count} conversations", { count: uiNumber(dialogues) });
  return `${sentenceLabel}, ${dialogueLabel}`;
}

function ProgressPanel({
  onNavigate,
  onViewAllAchievements,
  standalone = false,
  stats,
  userName,
}: {
  /** Each figure is a way in; without this they are numbers with no arrow. */
  onNavigate?: (view: PrototypeView) => void;
  onViewAllAchievements?: () => void;
  standalone?: boolean;
  stats: PrototypeStats;
  userName: string;
}) {
  const firstName = userName.trim().split(/\s+/)[0] || "there";
  const earnedAchievements = MILESTONES.filter((achievement) => achievement.check(stats)).length;
  // The learner's actual last three sittings, newest first. The block used to
  // show three invented lessons to everybody; real records or no card at all.
  const recentSessions = useMemo(
    () => loadActivitySessions().slice(-3).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.sessionsCompleted]
  );
  const visibleAchievements = standalone ? MILESTONES : MILESTONES.slice(0, 4);
  const nextAchievement = MILESTONES.find((achievement) => !achievement.check(stats));
  const nextProgress = nextAchievement ? Math.min(nextAchievement.current(stats), nextAchievement.target) : 1;
  const nextTarget = nextAchievement?.target ?? 1;
  const nextProgressPercent = Math.round((nextProgress / nextTarget) * 100);
  const { cur, nxt, pct } = getLevelInfo(stats.totalXp);
  const profile = getAuthUser();
  const [sections, setSections] = useState<ProgressSectionState>(() => loadProgressSections(profile));
  const toggleSection = (id: keyof ProgressSectionState) => {
    setSections((current) => {
      const next = { ...current, [id]: !current[id] };
      saveScopedJson(PROGRESS_SECTIONS_KEY, next, profile);
      return next;
    });
  };

  // On the progress screen the panel is the page. Nothing sits beside it to
  // hand the width back to, so there it neither folds nor offers to — the
  // heading is a heading. In the right rail, where folding buys the page a
  // whole column, the control stays.
  const panelOpen = standalone || sections.panel;
  const heading = (
    <>
      <div>
        <h2>{ui("Your progress")}</h2>
        <p>
          {uiFmt("{earned} of {total} achievements unlocked, {name}.", {
            earned: earnedAchievements,
            name: firstName,
            total: MILESTONES.length,
          })}
        </p>
      </div>
      <AchievementArt id="week" />
    </>
  );

  return (
    <section className={`np-progress-panel${standalone ? " np-progress-panel--standalone" : ""}${panelOpen ? " is-open" : " is-folded"}`}>
      {/* Folded, the panel closes sideways into a rail at the edge of the
          column rather than collapsing downwards, so the title turns with it
          and stays readable. */}
      {standalone ? (
        <div className="np-progress-title">{heading}</div>
      ) : (
        <button
          aria-expanded={sections.panel}
          aria-label={ui("Your progress")}
          className="np-progress-title"
          onClick={() => toggleSection("panel")}
          title={sections.panel ? ui("Fold away") : ui("Your progress")}
          type="button"
        >
          {sections.panel
            ? <ChevronRight aria-hidden="true" className="np-side-chevron" />
            : <ChevronLeft aria-hidden="true" className="np-side-chevron" />}
          {heading}
        </button>
      )}

      {panelOpen && (
        <>

      <div className="np-level-card">
        <span aria-hidden="true" className="np-level-card__weave" />
        <span className="np-level-badge">
          {/* Not ui("Level"): that string means a CEFR level elsewhere and is
              "Niveau" in German, which clashed with the "Stufe" on the line
              beside it. */}
          <small>{ui("XP level")}</small>
          <strong>{cur.level}</strong>
        </span>
        <div className="np-level-copy">
          <strong>{ui(cur.label)}</strong>
          {/* Two pieces rather than one sentence: the remaining XP carries the
              accent, and a colour cannot be given to half a text node. Both
              halves are translated; "XP" is the same word in all three. */}
          <small>
            {nxt ? (
              <>
                <b>{uiNumber(nxt.xpRequired - stats.totalXp)} XP</b>
                {" "}
                {uiFmt("to level {level}", { level: nxt.level })}
              </>
            ) : ui("Highest level reached")}
          </small>
          <div className="np-progress-track np-progress-track--level"><span style={{ width: `${pct}%` }} /></div>
          {/* Where the bar has got to, in the same numbers the bar is drawn
              from: the total on its own said nothing about how far it is. */}
          <p className="np-level-total">
            <b>{uiNumber(stats.totalXp)}</b>
            {nxt ? ` / ${uiNumber(nxt.xpRequired)} XP` : " XP"}
          </p>
        </div>
      </div>

      {/* Each figure leads somewhere: the two about progress to the progress
          page, the lesson count to the lessons. The arrow is only drawn when
          there is somewhere to go, so it never promises a click that does
          nothing. */}
      <div className="np-progress-stats">
        {([
          ["xp_500", uiNumber(stats.totalXp), "Total XP", "gold", "progress"],
          ["streak_3", uiNumber(stats.learningDays), "Days learned", "green", "progress"],
          ["first_session", uiNumber(stats.sessionsCompleted), "Lessons done", "accent", "learn"],
        ] as const).map(([art, value, label, tone, target]) => {
          const body = (
            <>
              <span className="np-progress-stat__art"><AchievementArt id={art} /></span>
              <strong>{value}</strong>
              <small>{ui(label)}</small>
              {onNavigate && <span aria-hidden="true" className="np-progress-stat__go"><ArrowRight /></span>}
            </>
          );
          return onNavigate ? (
            <button className="np-progress-stat" data-tone={tone} key={label} onClick={() => onNavigate(target)} type="button">
              {body}
            </button>
          ) : (
            <div className="np-progress-stat" data-tone={tone} key={label}>{body}</div>
          );
        })}
      </div>

      <div className="np-badges-block">
        {/* Two sibling buttons, not one inside the other: the title folds the
            block, "View all" opens the page. */}
        <div className="np-block-heading">
          <button
            aria-expanded={sections.achievements}
            className="np-block-toggle"
            onClick={() => toggleSection("achievements")}
            type="button"
          >
            <strong>{ui("Achievements")}</strong>
            <ChevronDown aria-hidden="true" className={`np-fold-chevron${sections.achievements ? " is-open" : ""}`} />
          </button>
          {standalone ? (
            <span className="np-achievement-count">{uiFmt("{count} unlocked", { count: earnedAchievements })}</span>
          ) : (
            <button onClick={onViewAllAchievements} type="button">{ui("View all")}</button>
          )}
        </div>
        {sections.achievements && (
          <div className={`np-badge-list${standalone ? " np-badge-list--expanded" : ""}`}>
            {visibleAchievements.map((achievement) => (
              <AchievementBadge achievement={achievement} key={achievement.id} standalone={standalone} stats={stats} />
            ))}
          </div>
        )}
      </div>

      <div className="np-goal-card">
        <div>
          <strong>{nextAchievement ? ui("Next achievement") : ui("All achievements unlocked")}</strong>
          <small>{nextAchievement ? ui(nextAchievement.label) : ui("You reached every current milestone.")}</small>
          <div className="np-progress-track"><span style={{ width: `${nextAchievement ? nextProgressPercent : 100}%` }} /></div>
          <p>{nextAchievement ? `${nextProgress} / ${nextTarget} ${ui(nextAchievement.unit)}` : ui("Complete")}</p>
        </div>
        <AchievementArt id={nextAchievement?.id ?? "week"} />
      </div>

      {recentSessions.length > 0 && (
        <div className="np-completed-block">
          <div className="np-block-heading">
            <button
              aria-expanded={sections.recent}
              className="np-block-toggle"
              onClick={() => toggleSection("recent")}
              type="button"
            >
              <strong>{ui("Recently completed")}</strong>
              <ChevronDown aria-hidden="true" className={`np-fold-chevron${sections.recent ? " is-open" : ""}`} />
            </button>
          </div>
          {sections.recent && recentSessions.map((session, index) => (
            <div className="np-completed-row" key={`${session.ts}-${index}`}>
              <CheckCircle2 />
              <span>
                <strong>{describeSessionDay(session.ts)}</strong>
                <small>{describeSessionContent(session.sentences, session.dialogues)}</small>
              </span>
              <b>{Math.max(1, Math.round(session.durationSec / 60))} min</b>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </section>
  );
}

function HomeView({
  apiParts,
  countryId,
  onChangeCountry,
  onOpenCountryCourse,
  onOpenFading,
  onPractice,
  onRequestCatalogue,
  profile,
  onSwitchCourse,
  stats,
  vocab,
}: {
  apiParts: Record<string, Part>;
  /** Which country studies country the card should show. */
  countryId: CountryId;
  /** Opens the course chooser on the country courses. */
  onChangeCountry: () => void;
  /** The citizenship course, opened from the second card. */
  onOpenCountryCourse: () => void;
  /** The vocabulary library, opened on the items that are fading. */
  onOpenFading: () => void;
  onPractice: () => void;
  onRequestCatalogue: () => void;
  profile: UserProfile | null;
  onSwitchCourse: () => void;
  stats: PrototypeStats;
  vocab: number;
}) {
  const catalogueReady = Object.keys(apiParts).length > 0;
  // The lesson path and the hero's "how much longer" both need the real
  // catalogue. It stays off the first-paint path — startup performance is
  // gated — and is fetched once the browser is idle instead, so the
  // dashboard shows real packs a moment later rather than inventing rows.
  useEffect(() => {
    if (catalogueReady) return undefined;
    const request = () => onRequestCatalogue();
    const idle = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    }).requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(request, { timeout: 2_000 });
      return () => (window as typeof window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(request, 800);
    return () => window.clearTimeout(timer);
  }, [catalogueReady, onRequestCatalogue]);
  // Recomputed when the catalogue arrives or a lesson lands, so the hero's
  // "how much longer" tracks what was just learned.
  const packProgress = useMemo(() => activePackProgress(apiParts, profile), [apiParts, profile, stats.sessionsCompleted]);
  const [lessonContent, setLessonContentState] = useState<LessonContent>(() => getLessonContent());
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  /**
   * Which of the two cards is unfolded. Read once on mount and written on
   * every change, so the page comes back the way it was left.
   */
  const [cardsOpen, setCardsOpen] = useState<Record<HomeCard, boolean>>(() => ({
    language: getHomeCardOpen("language"),
    country: getHomeCardOpen("country"),
  }));
  const foldCard = (card: HomeCard) => {
    setCardsOpen((was) => {
      const next = !was[card];
      setHomeCardOpen(card, next);
      return { ...was, [card]: next };
    });
  };
  // The menu closes the way every menu should: outside click or Escape.
  useEffect(() => {
    if (!contentMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.(".np-home-choice-field--content")) setContentMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContentMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [contentMenuOpen]);

  return (
    <div className="np-home-view">
      {/*
        The order the page is laid out in: the motivational
        banner, the question, the two cards it answers, then the figures.
        The fluency outlook and the lesson path keep their places below —
        they were not in the reference because it only showed the top of the
        page, and nothing asked for them to go.
      */}
      <HomeBanner />

      <h2 className="np-home-question">
        {ui("What would you like to learn {today}?").split("{today}").map((part, index) => (
          <Fragment key={index}>
            {index > 0 && <em>{ui("today")}</em>}
            {part}
          </Fragment>
        ))}
      </h2>

      <div className="np-home-choices">
        <LanguageCard
          contentMenuOpen={contentMenuOpen}
          lessonContent={lessonContent}
          onOpen={onPractice}
          onToggleFold={() => foldCard("language")}
          open={cardsOpen.language}
          onPickContent={(value) => {
            setLessonContent(value);
            setLessonContentState(value);
            setContentMenuOpen(false);
          }}
          onSwitchCourse={onSwitchCourse}
          onToggleContentMenu={() => setContentMenuOpen((open) => !open)}
          packProgress={packProgress}
          profile={profile}
          stats={stats}
        />

        <CountryCard
          onChangeCountry={onChangeCountry}
          onOpen={onOpenCountryCourse}
          onToggleFold={() => foldCard("country")}
          open={cardsOpen.country}
          pack={countryPack(countryId)}
          profile={profile}
        />
      </div>

      <FluencyOutlook onOpenFading={onOpenFading} profile={profile} vocab={vocab} />
    </div>
  );
}

function FeatureLoading() {
  return (
    <section aria-label={ui("Loading learning content")} className="np-feature-loading">
      <span />
      <div><i /><i /><i /></div>
    </section>
  );
}

function AccountGate({ onRequestSignIn }: { onRequestSignIn: () => void }) {
  return (
    <section className="np-page-card np-account-gate">
      <div className="np-page-intro">
        <span className="np-page-icon"><CircleUserRound /></span>
        <div><h1>{ui("Sign in to manage your profile")}</h1><p>{ui("Your lessons and games are available in preview mode. Sign in to save account, pet, course, and flashcard changes.")}</p></div>
      </div>
      <button className="np-primary-button" onClick={onRequestSignIn} type="button">
        {ui("Open sign in")}
        <ChevronRight />
      </button>
    </section>
  );
}

function ShopView({
  availableCoins,
  equippedBadge,
  onChooseBadge,
  ownedBadges,
}: {
  availableCoins: number;
  equippedBadge: ShopBadgeId | null;
  onChooseBadge: (id: ShopBadgeId) => void;
  ownedBadges: ShopBadgeId[];
}) {
  const [previewMessage, setPreviewMessage] = useState("");
  // Guessed from the locale on first visit, remembered once chosen. Held in
  // state rather than read per render so the whole shop repricing is one
  // update rather than one per price.
  const [currency, setCurrency] = useState<CurrencyCode>(() => loadCurrency());
  const [currencyAuto, setCurrencyAuto] = useState(() => currencyIsAutomatic());

  const previewPurchase = (message: string) => {
    setPreviewMessage(message);
  };

  return (
    <section className="np-shop-view">
      <div className="np-shop-hero">
        <div className="np-shop-heading">
          <span><ShoppingBag /></span>
          <div>
            <small>{ui("Reward shop")}</small>
            <h1>{ui("Make your profile yours")}</h1>
            <p>{ui("Earn coins by learning, then use them on profile pins.")}</p>
          </div>
        </div>
        <div aria-live="polite" className="np-shop-balance">
          <Coins />
          <div><strong>{uiNumber(availableCoins)}</strong><small>{ui("Micheon coins")}</small></div>
        </div>
      </div>

      <div className="np-shop-note">
        <Coins />
        <p>{ui("You start with 80 welcome coins. More coins come from XP, completed lessons, and reviews. Buying a pin never reduces your XP.")}</p>
      </div>

      {previewMessage && (
        <div aria-live="polite" className="np-shop-preview-message" data-testid="shop-preview-message" role="status">
          <CheckCircle2 />
          <div><strong>{ui("Shop preview")}</strong><p>{previewMessage}</p></div>
          <button aria-label={ui("Dismiss message")} onClick={() => setPreviewMessage("")} type="button"><X /></button>
        </div>
      )}

      <section aria-labelledby="coin-packs-heading" className="np-shop-purchase-section">
        <div className="np-shop-section-heading">
          <div><h2 id="coin-packs-heading">{ui("Buy Micheon coins")}</h2><p>{ui("Choose a coin pack for profile pins and future shop rewards.")}</p></div>
          <div className="np-shop-heading-actions">
            <label className="np-currency-picker">
              <span>{ui("Currency")}</span>
              <select
                aria-label={ui("Display currency")}
                data-testid="shop-currency"
                onChange={(event) => {
                  const next = event.target.value as CurrencyCode | typeof CURRENCY_AUTO;
                  saveCurrency(next);
                  setCurrencyAuto(next === CURRENCY_AUTO);
                  setCurrency(loadCurrency());
                }}
                value={currencyAuto ? CURRENCY_AUTO : currency}
              >
                <option value={CURRENCY_AUTO}>{ui("Automatic")} ({currency})</option>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>{code} — {ui(currencyLabel(code))}</option>
                ))}
              </select>
            </label>
            <span>{ui("Checkout preview")}</span>
          </div>
        </div>

        <div className="np-coin-pack-grid">
          {COIN_PACKS.map((pack) => (
            <article className={`np-coin-pack${pack.featured ? " is-featured" : ""}`} key={pack.id}>
              <div className="np-coin-pack-icon"><Coins /></div>
              <div className="np-coin-pack-copy">
                <small>{pack.featured ? ui("Most popular") : pack.label}</small>
                <h3>{uiFmt("{coins} coins", { coins: uiNumber(pack.coins) })}</h3>
                <p>{ui(pack.note)}</p>
              </div>
              <button
                data-testid={`shop-coin-pack-${pack.coins}`}
                onClick={() => previewPurchase(uiFmt(
                  "{coins} coins are not charged or added yet. Checkout will be connected later.",
                  { coins: uiNumber(pack.coins) }
                ))}
                type="button"
              >
                <span>{packPrice(pack.tier, currency)}</span>
                {ui("Buy coins")}
              </button>
            </article>
          ))}
        </div>
        <p className="np-shop-checkout-note">{ui("Preview prices only. Payments are not connected, so these buttons will not charge you.")}</p>
      </section>

      <section aria-labelledby="premium-heading" className="np-premium-card">
        <div className="np-premium-copy">
          <span className="np-premium-mark"><Crown /></span>
          <div>
            <small>{ui("Micheon Premium")}</small>
            <h2 id="premium-heading">{ui("Learn better together")}</h2>
            <p>{ui("A future membership for learners who want more motivation from the people they know.")}</p>
          </div>
        </div>
        <div className="np-premium-benefits" aria-label={ui("Planned Premium features")}>
          <span><UserRound /><strong>{ui("Add friends")}</strong></span>
          <span><Trophy /><strong>{ui("Friendly leaderboards")}</strong></span>
          <span><MessageCircleMore /><strong>{ui("Learn together")}</strong></span>
        </div>
        <div className="np-premium-action">
          <div><strong>{premiumPrice(currency)}</strong><span>{ui("per month, preview price")}</span></div>
          <button
            data-testid="shop-premium-buy"
            onClick={() => previewPurchase(ui("Premium checkout and its social features are not connected yet."))}
            type="button"
          >
            {ui("Get Premium")}
            <ChevronRight />
          </button>
          <small>{ui("No charge is made. Friends, leaderboards, and learning together are planned features.")}</small>
        </div>
      </section>

      <div className="np-shop-section-heading">
        <div><h2>{ui("Profile pins")}</h2><p>{ui("Your equipped pin appears on the profile button.")}</p></div>
        <span>{uiFmt("{owned} of {total} owned", { owned: ownedBadges.length, total: SHOP_ITEMS.length })}</span>
      </div>

      <div className="np-shop-grid">
        {SHOP_ITEMS.map((item) => {
          const owned = ownedBadges.includes(item.id);
          const equipped = equippedBadge === item.id;
          const shortfall = Math.max(0, item.price - availableCoins);
          const disabled = equipped || (!owned && shortfall > 0);
          const buttonLabel = equipped
            ? ui("Equipped")
            : owned
              ? ui("Equip")
              : shortfall > 0
                ? uiFmt("Need {n} more", { n: shortfall })
                : ui("Buy and equip");

          return (
            <article className={`np-shop-item${owned ? " is-owned" : ""}${equipped ? " is-equipped" : ""}`} key={item.id}>
              <span className={`np-shop-item-art np-shop-item-art--${item.tone}`}><ShopBadgeArt id={item.id} /></span>
              <div className="np-shop-item-copy">
                <small>{ui("Profile pin")}</small>
                <h3>{ui(item.name)}</h3>
                <p>{ui(item.description)}</p>
              </div>
              <div className="np-shop-item-footer">
                <span>{owned ? ui("Owned") : <><Coins /> {item.price}</>}</span>
                <button aria-pressed={equipped} disabled={disabled} onClick={() => onChooseBadge(item.id)} type="button">
                  {buttonLabel}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SocialAvatar({ initials, photo, tone }: { initials: string; photo?: string; tone: SocialLeaderboardEntry["tone"] }) {
  return (
    <span aria-hidden="true" className={`np-social-avatar np-social-avatar--${tone}`}>
      {photo ? <img alt="" className="np-social-avatar-photo" src={photo} /> : initials}
    </span>
  );
}

function SocialView({ avatar, stats, userName }: { avatar?: string; stats: PrototypeStats; userName: string }) {
  /**
   * Whose account this is, rather than whose it was.
   *
   * Both labels here named one fixed account, from when one account was all
   * the gate let in. It lets in two now — see SOCIAL_PREVIEW_EMAILS — so the
   * other one was being told, on its own screen, that the screen belonged to
   * somebody else. The badge says "your account" rather than a possessive,
   * which no name has to be bent into.
   */
  const previewName = userName.trim().split(/\s+/)[0] || userName.trim();
  const [activeSection, setActiveSection] = useState<"friends" | "leaderboard">("friends");
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  /**
   * Two different things were being said in one banner.
   *
   * "Add friend is a preview in this release" and "that code is twenty letters"
   * are not the same kind of message: the first says nothing happened, the
   * second is a real app telling you what you typed. Both went through
   * previewNotice, so the working Friends list reported itself under the
   * heading "UI preview only" and read as a mock-up of itself.
   */
  const [notice, setNotice] = useState<string | null>(null);
  const firstName = userName.trim().split(/\s+/)[0] || "Leon";
  const levelLabel = getLevelInfo(stats.totalXp).cur.label;
  /**
   * The real list, kept here as well because the leaderboard ranks the same
   * people. It follows the store's event for the same reason the panel does:
   * the peer connection writes to it and knows nothing about React.
   */
  const [realFriends, setRealFriends] = useState(() => loadFriends());
  useEffect(() => {
    const sync = () => setRealFriends(loadFriends());
    window.addEventListener(FRIENDS_EVENT, sync);
    return () => window.removeEventListener(FRIENDS_EVENT, sync);
  }, []);
  /**
   * You and your friends, ranked on the figure everybody actually has.
   *
   * It was a weekly table, which the app cannot honestly fill: sessions are
   * recorded without an XP figure, so there is no way to say what anyone
   * earned in the last seven days — not for a friend, and not even for
   * yourself. Total XP is a real number on both sides.
   */
  const leaderboard = useMemo(() => {
    const rows = [
      { id: "me", name: firstName, initials: firstName.slice(0, 1).toUpperCase(), photo: avatar, weeklyXp: stats.totalXp, streak: stats.streak, movement: "", tone: "green" as const, current: true },
      ...realFriends.map((friend) => ({
        id: friend.code,
        name: friend.profile?.name ?? friend.name,
        initials: (friend.profile?.name ?? friend.name).slice(0, 1).toUpperCase(),
        photo: friend.profile?.photo,
        weeklyXp: friend.profile?.totalXp ?? 0,
        streak: friend.profile?.streak ?? 0,
        movement: "",
        tone: "blue" as const,
        current: false,
      })),
    ];
    return rows.sort((a, b) => b.weeklyXp - a.weeklyXp);
  }, [avatar, firstName, realFriends, stats.streak, stats.totalXp]);
  const podium = arrangePodium(leaderboard);

  const showPreviewNotice = (action: string) => {
    setPreviewNotice(uiFmt("{action} is a preview in this release. Nothing was sent or changed.", { action }));
  };

  return (
    <section className="np-page-card np-social-view">
      <div className="np-social-hero">
        <span aria-hidden="true" className="np-social-hero-icon"><UsersRound /></span>
        <div className="np-social-hero-copy">
          <span>{uiFmt("Only {name}", { name: previewName })}</span>
          <h1>{ui("Learn better together")}</h1>
          <p>{ui("Keep up with friends, compare weekly XP, and turn practice into a friendly routine.")}</p>
        </div>
        <div className="np-social-private-badge">
          <LockKeyhole aria-hidden="true" />
          <span><strong>{ui("Private preview")}</strong><small>{ui("Visible only on your account")}</small></span>
        </div>
      </div>

      <div aria-label={ui("Social sections")} className="np-social-tabs" role="tablist">
        <button
          aria-controls="social-friends-panel"
          aria-selected={activeSection === "friends"}
          className={activeSection === "friends" ? "is-active" : ""}
          onClick={() => setActiveSection("friends")}
          role="tab"
          type="button"
        >
          <UsersRound aria-hidden="true" />
          <span><strong>{ui("Friends")}</strong><small>{uiFmt("{n} learning partners", { n: realFriends.length })}</small></span>
        </button>
        <button
          aria-controls="social-leaderboard-panel"
          aria-selected={activeSection === "leaderboard"}
          className={activeSection === "leaderboard" ? "is-active" : ""}
          onClick={() => setActiveSection("leaderboard")}
          role="tab"
          type="button"
        >
          <Medal aria-hidden="true" />
          <span><strong>{ui("Leaderboard")}</strong><small>{ui("You and your friends by total XP")}</small></span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {notice && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="np-social-notice"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -6 }}
            role="status"
          >
            <CheckCircle2 aria-hidden="true" />
            <span><small>{notice}</small></span>
            <button aria-label={ui("Dismiss message")} onClick={() => setNotice(null)} type="button"><X /></button>
          </motion.div>
        )}
        {previewNotice && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="np-social-preview-notice"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -6 }}
            role="status"
          >
            <CheckCircle2 aria-hidden="true" />
            <span><strong>{ui("UI preview only")}</strong><small>{previewNotice}</small></span>
            <button aria-label={ui("Dismiss preview message")} onClick={() => setPreviewNotice(null)} type="button"><X /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {activeSection === "friends" ? (
        <div className="np-social-layout" id="social-friends-panel" role="tabpanel">
          <FriendsPanel
            avatar={avatar}
            levelLabel={levelLabel}
            onNotice={(message) => setNotice(message)}
            stats={stats}
            userName={userName}
          />

          <aside className="np-social-side-stack">
            <section className="np-social-side-card np-social-side-card--invite">
              <span className="np-social-side-icon"><UserPlus /></span>
              <small>{ui("Grow your circle")}</small>
              <h2>{ui("Invite a learning partner")}</h2>
              <p>{ui("Send them your code. Their app asks yours to connect, you accept, and after that your figures pass straight between the two.")}</p>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(formatFriendCode(getFriendCode()));
                  setNotice(ui("Your code is copied. Send it to whoever you are adding."));
                }}
                type="button"
              >
                {ui("Copy your code")} <ChevronRight />
              </button>
            </section>
          </aside>
        </div>
      ) : (
        <div className="np-social-layout" id="social-leaderboard-panel" role="tabpanel">
          <section className="np-social-panel np-leaderboard-panel">
            <div className="np-social-panel-heading">
              <div><span>{ui("Friends league")}</span><h2>{ui("This week")}</h2><p>{ui("XP earned from Monday to Sunday.")}</p></div>
              <div className="np-leaderboard-time"><Clock3 /><span><strong>{ui("3 days left")}</strong><small>{ui("Resets Monday")}</small></span></div>
            </div>

            {podium.length ? (
              <div
                aria-label={ui("You and your friends by total XP")}
                className="np-leaderboard-podium"
                data-places={podium.length}
              >
                {podium.map((entry) => {
                  const rank = leaderboard.findIndex((candidate) => candidate.id === entry.id) + 1;
                  return (
                    <div className={`np-podium-place np-podium-place--${rank}`} key={entry.id}>
                      <span className="np-podium-rank">{rank === 1 ? <Medal aria-label={ui("First place")} /> : rank}</span>
                      <SocialAvatar initials={entry.initials} photo={entry.photo} tone={entry.tone} />
                      <strong>{entry.name}</strong>
                      <small>{uiNumber(entry.weeklyXp)} XP</small>
                      <i aria-hidden="true" />
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="np-leaderboard-list">
              {leaderboard.map((entry, index) => (
                <article className={entry.current ? "is-current" : ""} key={entry.id}>
                  <strong className="np-leaderboard-rank">{index + 1}</strong>
                  <SocialAvatar initials={entry.initials} photo={entry.photo} tone={entry.tone} />
                  <span className="np-leaderboard-person">
                    <strong>{entry.name}{entry.current && <small>{ui("You")}</small>}</strong>
                    <small>{uiFmt("{days}-day streak", { days: entry.streak })}</small>
                  </span>
                  <span className="np-leaderboard-xp">
                    <strong>{uiNumber(entry.weeklyXp)} XP</strong>
                    <small>{uiFmt("{movement} this week", { movement: entry.movement })}</small>
                  </span>
                </article>
              ))}
            </div>
          </section>

          <aside className="np-social-side-stack">
            <section className="np-social-side-card np-social-side-card--target">
              <span className="np-social-side-icon"><Target /></span>
              <small>{ui("Your weekly goal")}</small>
              <h2>{ui("685 XP to go")}</h2>
              <p>{ui("You have earned 2,315 of your 3,000 XP target.")}</p>
              <div className="np-social-progress"><span style={{ width: "77%" }} /></div>
              <strong className="np-social-target-caption">{ui("77% complete")}</strong>
            </section>
            <section className="np-social-side-card">
              <span className="np-social-side-icon np-social-side-icon--gold"><Trophy /></span>
              <small>{ui("League reward")}</small>
              <h2>{ui("Finish in the top three")}</h2>
              <p>{ui("Leon is currently second. A short lesson could close the gap.")}</p>
              <button onClick={() => showPreviewNotice(ui("League details"))} type="button">{ui("How leagues work")} <ChevronRight /></button>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

function MoreView({
  onNavigate,
  passagesUnlocked,
  shopUnlocked,
  socialPreviewUnlocked,
}: {
  onNavigate: (view: PrototypeView) => void;
  /** Beta, and its only other entry is the sidebar, which narrow windows hide. */
  passagesUnlocked: boolean;
  shopUnlocked: boolean;
  socialPreviewUnlocked: boolean;
}) {
  // The same preference the sidebar reads, kept in step through the same
  // event, because either end can change it.
  const [hiddenNav, setHiddenNav] = useState<string[]>(() => loadHiddenNav());
  const [stashActive, setStashActive] = useState(false);
  /**
   * Somewhere to say what is missing.
   *
   * There is no account and no server here — nothing in the app can post a
   * message anywhere — so the honest thing it can do is take what was written
   * and hand it to the clipboard, for the writer to send wherever they like.
   * Where it should go by itself is a decision that has not been made yet;
   * when it is, it attaches to this one place.
   */
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  useEffect(() => {
    const sync = () => setHiddenNav(loadHiddenNav());
    window.addEventListener(HIDDEN_NAV_EVENT, sync);
    return () => window.removeEventListener(HIDDEN_NAV_EVENT, sync);
  }, []);

  const features: Array<{
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    tone: string;
    action: () => void;
    narrowOnly?: boolean;
  }> = [
    ...(socialPreviewUnlocked ? [{
      title: ui("Friends and leaderboard"),
      description: ui("See friend activity, weekly XP, streaks, and the private friends league preview."),
      icon: UsersRound,
      tone: "teal",
      action: () => onNavigate("social"),
    }] : []),
    // Only under 1280px, where the sidebar is gone and the mobile bar is a
    // fixed five columns: this card is the sole way into the citizenship
    // course there. Wider, the sidebar already lists it and the card repeated
    // something two centimetres away.
    { title: ui("Country studies"), description: ui("Lessons, timed exam simulations, a timeline and searchable history."), icon: Landmark, tone: "yellow", narrowOnly: true, action: () => onNavigate("life-in-uk") },
    // Same reasoning, and narrow only for the same reason: wider, the beta
    // list in the sidebar already carries it.
    ...(passagesUnlocked ? [{
      title: ui("Conversation"),
      description: ui("Somebody speaks and you answer, or somebody writes and you say what they meant."),
      icon: MessagesSquare,
      tone: "violet",
      narrowOnly: true,
      action: () => onNavigate("passages"),
    }] : []),
    { title: ui("Progress"), description: ui("See your streak, achievements, recent lessons, and goals."), icon: BarChart3, tone: "blue", action: () => onNavigate("progress") },
    ...(shopUnlocked ? [{ title: ui("Reward shop"), description: ui("Earn coins through learning and collect profile pins."), icon: ShoppingBag, tone: "yellow", action: () => onNavigate("shop") }] : []),
    { title: ui("Profile and settings"), description: ui("Manage your account, sound, learning mode, and goals."), icon: Settings2, tone: "green", action: () => onNavigate("profile") },
    // A paw, not a person. One mark has to stand for both halves, and it is
    // the pets half that has a shape of its own — the same paw the Haustier
    // category wears, so the card and where it lands agree.
    { title: ui("Pets and flashcards"), description: ui("Choose pets, adjust coaching, and set how flashcards flip."), icon: PawPrint, tone: "orange", action: () => onNavigate("profile") },
    // Last, and deliberately: it is the one card that does not take you into
    // the app, so it does not belong among the ones that do.
    { title: ui("Feedback and wishes"), description: ui("Say what is missing, what got in the way, or what you would like next."), icon: MessageSquareText, tone: "violet", action: () => { setFeedbackOpen(true); setFeedbackCopied(false); } },
  ];

  return (
    <section className="np-page-card np-more-view">
      <div className="np-page-intro">
        <span className="np-page-icon"><Menu /></span>
        <div><h1>{ui("Everything in one place")}</h1><p>{ui("Courses, pets, flashcards, rewards, progress, and account settings all live inside Micheon.")}</p></div>
      </div>

      {/*
        The other end of the drag.

        A sidebar row dropped on More lands here, and dragging one of these
        back onto the sidebar returns it. The zone is always visible, even
        with nothing in it, because a drop target nobody can see is a feature
        nobody finds — and clicking a card restores it too, so the whole
        thing works without ever dragging anything.
      */}
      <div
        className={`np-more-stash${stashActive ? " is-drop-target" : ""}`}
        onDragOver={(event) => {
          if (!isNavDrag(event.dataTransfer, "sidebar")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setStashActive(true);
        }}
        onDragLeave={() => setStashActive(false)}
        onDrop={(event) => {
          const id = readNavDrag(event.dataTransfer, "sidebar");
          setStashActive(false);
          if (!id) return;
          event.preventDefault();
          setHiddenNav(hideNavItem(id));
        }}
      >
        <p className="np-more-stash-title">
          {hiddenNav.length > 0
            ? uiFmt("Put away ({n})", { n: hiddenNav.length })
            : ui("Put away")}
        </p>
        <p className="np-more-stash-hint">
          {ui("Drag anything out of the sidebar to park it here, and drag it back when you want it. Clicking one puts it back too.")}
        </p>
        {hiddenNav.length > 0 && (
          <div className="np-more-stash-items">
            {hiddenNav.map((id) => {
              const item = ALL_NAV_ITEMS.find((entry) => entry.id === id);
              const Icon = item?.icon ?? Menu;
              return (
                <button
                  className="np-more-stash-item"
                  draggable
                  key={id}
                  onClick={() => setHiddenNav(showNavItem(id))}
                  onDragStart={(event) => startNavDrag(event.dataTransfer, id, "more")}
                  title={ui("Put back in the sidebar")}
                  type="button"
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span>{item ? ui(item.label) : id}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="np-feature-directory">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <button className={feature.narrowOnly ? "np-more-only-narrow" : undefined} key={ui(feature.title)} onClick={feature.action} type="button">
              <span className={`np-feature-directory-icon np-feature-directory-icon--${feature.tone}`}><Icon /></span>
              <span><strong>{ui(feature.title)}</strong><small>{ui(feature.description)}</small></span>
              <ChevronRight />
            </button>
          );
        })}
      </div>

      {feedbackOpen && (
        <div className="np-feedback-panel">
          <div className="np-feedback-head">
            <strong>{ui("Feedback and wishes")}</strong>
            <button
              aria-label={ui("Close")}
              className="np-feedback-close"
              onClick={() => setFeedbackOpen(false)}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <textarea
            className="np-feedback-input"
            onChange={(event) => { setFeedback(event.target.value); setFeedbackCopied(false); }}
            placeholder={ui("What did you notice, and what would you like?")}
            rows={5}
            value={feedback}
          />
          <div className="np-feedback-actions">
            <button
              className="np-feedback-copy"
              disabled={!feedback.trim()}
              onClick={() => {
                void navigator.clipboard?.writeText(feedback.trim());
                setFeedbackCopied(true);
              }}
              type="button"
            >
              {feedbackCopied ? ui("Copied") : ui("Copy")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function isPrototypeBulkPartKey(key: string) {
  return key.startsWith("wordbank") || key.startsWith("tatoeba");
}

function usePrototypeParts(requested: boolean) {
  const [apiParts, setApiParts] = useState<Record<string, Part>>({});

  useEffect(() => {
    if (!requested) return undefined;

    let active = true;
    let removeListeners = () => {};

    const load = async () => {
      const [api, curriculum, contentBank, customContent, data, translations] = await Promise.all([
        import("@/lib/api"),
        import("@/lib/curriculum"),
        import("@/lib/contentBank"),
        import("@/lib/customContent"),
        import("@/lib/data"),
        import("@/lib/translations"),
      ]);
      if (!active) return;

      const resolved: Record<string, Part> = {};
      for (const [key, blueprint] of Object.entries(data.allPartBlueprints)) {
        resolved[key] = api.buildApiPartFromResolved(blueprint as Blueprint, {});
      }

      /**
       * Every language on screen before anything is built from it.
       *
       * French and Polish are read out of a table that is fetched rather than
       * bundled, so that a learner doing German alone never downloads them.
       * The cost of that is this await: build the catalogue while the table is
       * still in flight and every entry it would have translated is dropped,
       * which shows up as a course that is simply missing lessons rather than
       * as anything that looks like an error.
       *
       * The COURSE is not the only thing that reads those tables. Listen
       * explains a card in whatever the app is written in, so a German course
       * in a French app needs French as much as the French course does —
       * asking the course alone answered "nothing" and left Listen empty.
       */
      const rebuild = async () => {
        if (!active) return;
        await Promise.all(translationLanguagesNeeded().map(translations.ensureTranslations));
        if (!active) return;
        setApiParts(curriculum.orderParts(contentBank.filterPartsForLearningDirection({
          ...resolved,
          ...contentBank.buildBundledParts(),
          ...contentBank.buildTatoebaParts(),
          ...customContent.buildCustomParts(),
        })));
      };

      void rebuild();
      const onRebuild = () => { void rebuild(); };
      window.addEventListener(customContent.CUSTOM_CONTENT_EVENT, onRebuild);
      window.addEventListener("gl-direction-change", onRebuild);
      // Changing the app's language changes which table is needed, not just
      // which words are on the buttons.
      window.addEventListener("gl-interface-language-change", onRebuild);
      removeListeners = () => {
        window.removeEventListener(customContent.CUSTOM_CONTENT_EVENT, onRebuild);
        window.removeEventListener("gl-direction-change", onRebuild);
        window.removeEventListener("gl-interface-language-change", onRebuild);
      };
    };

    void load().catch((error) => console.error("[prototype] unable to load lesson catalogue", error));
    return () => {
      active = false;
      removeListeners();
    };
  }, [requested]);

  return apiParts;
}

function MobileNav({ activeView, gamesUnlocked, onNavigate }: { activeView: PrototypeView; gamesUnlocked: boolean; onNavigate: (view: PrototypeView) => void }) {
  // Same preference as the sidebar, so hiding something on the desktop does
  // not leave it sitting in the phone bar. There is no hide control here — a
  // five-item bar has no room for one, and More still reaches everything.
  const [hidden, setHidden] = useState<string[]>(() => loadHiddenNav());
  useEffect(() => {
    const sync = () => setHidden(loadHiddenNav());
    window.addEventListener(HIDDEN_NAV_EVENT, sync);
    return () => window.removeEventListener(HIDDEN_NAV_EVENT, sync);
  }, []);
  return (
    <nav aria-label={ui("Mobile prototype navigation")} className="np-mobile-nav">
      {MOBILE_NAVIGATION.filter((item) => (item.id !== "games" || gamesUnlocked) && !hidden.includes(item.id)).map((item) => {
        const Icon = item.icon;
        const active = item.id === activeView
          || (item.id === "practice" && (activeView === "tests" || activeView === "grammar"))
          // Kept as its own clause: check-social-preview pins the list below
          // verbatim, because that list is the gate routing the private
          // preview through More. Life in the UK is not gated, so it is added
          // here rather than by editing the pinned literal.
          || (item.id === "more" && ["social", "shop", "progress", "profile"].includes(activeView))
          || (item.id === "more" && activeView === "life-in-uk")
          || (item.id === "more" && activeView === "passages");
        return (
          <button aria-current={active ? "page" : undefined} className={active ? "is-active" : ""} key={item.id} onClick={() => onNavigate(item.id)} type="button">
            <Icon />
            <span>{ui(item.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function NewUiPrototype({
  onRequestSignIn,
  profile,
}: {
  onRequestSignIn: () => void;
  profile: UserProfile | null;
}) {
  const [activeView, setActiveView] = useState<PrototypeView>("home");
  const [courseSwitcherOpen, setCourseSwitcherOpen] = useState(false);
  // Which half of the catalogue the chooser opens on. Set by whichever
  // card asked for it, so changing the country does not begin with a list
  // of languages.
  const [courseSwitcherScope, setCourseSwitcherScope] = useState<"all" | "country">("all");
  const openCourseSwitcher = useCallback((next: "all" | "country") => {
    setCourseSwitcherScope(next);
    setCourseSwitcherOpen(true);
  }, []);
  const [storedCourseId, setActiveCourseId] = useState(() => getActiveCourseId(profile));
  // The direction is the source of truth for the two built-in courses: an
  // install that has been learning English since before English was listed
  // still has "german" stored, and would otherwise show the wrong course.
  const activeCourseId = (storedCourseId === "german" || storedCourseId === "french" || storedCourseId === "polish" || storedCourseId === "spanish" || storedCourseId === "portuguese" || storedCourseId.startsWith("english"))
    ? (learningEnglish()
        ? (resolveEnglishVariant(getEnglishVariant()) === "american" ? "english-us" : "english-uk")
        : learningFrench() ? "french"
        : learningPolish() ? "polish"
        : learningSpanish() ? "spanish"
        : learningPortuguese() ? "portuguese"
        : "german")
    : storedCourseId;
  const [courseReaderOpen, setCourseReaderOpen] = useState(false);
  const [courseReaderLesson, setCourseReaderLesson] = useState<string | undefined>(undefined);
  const [courseSessionLesson, setCourseSessionLesson] = useState<string | undefined>(undefined);
  // Life in the UK runs beside the language course instead of replacing it, so
  // it carries its own lesson and reader state. Reusing the active-course state
  // would have meant that opening it switched you off German.
  /**
   * Which country studies country is open.
   *
   * Not persisted on purpose: the two are separate courses with separate
   * progress, and opening the app on whichever was last looked at would be a
   * surprise for someone who only ever studies one of them. Country studies
   * opens on the UK, which is where the feature started.
   */
  const [countryId, setCountryId] = useState<CountryId>("uk");
  const [ukLessonId, setUkLessonId] = useState<string | undefined>(undefined);
  const [ukReaderOpen, setUkReaderOpen] = useState(false);
  // Learn a topic, then answer questions on it. Two halves of one destination
  // rather than two nav entries, because they are the same activity.
  const [ukTab, setUkTab] = useState<"learn" | "practice" | "exam" | "timeline" | "search">("learn");
  const translationLanguage = useTranslationLanguage();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const fallback = defaultPrototypeSidebarWidth();
    const stored = Number(loadScopedJson(PROTOTYPE_SIDEBAR_KEY, fallback, profile));
    return Number.isFinite(stored) ? clampPrototypeSidebarWidth(stored) : fallback;
  });
  const [stats, setStats] = useState<PrototypeStats>(() => ({
    totalXp: loadScopedJson("totalXp", 0, profile) as number,
    sessionsCompleted: loadScopedJson("sessionsCompleted", 0, profile) as number,
    totalReviews: loadScopedJson("totalReviews", 0, profile) as number,
    streak: getStreak(profile),
    externalWords: loadScopedJson("externalWords", profile?.externalWordsLearned ?? 0, profile) as number,
    learningDays: countLearningDays(profile),
  }));
  /**
   * Finishing a lesson can add a day, and it is the kind of number you look
   * at right after finishing one.
   */
  useEffect(() => {
    const recount = () => setStats((current) => ({ ...current, learningDays: countLearningDays(profile) }));
    window.addEventListener("activity-updated", recount);
    return () => window.removeEventListener("activity-updated", recount);
  }, [profile]);
  /**
   * These are kept per learning direction, so they have to be re-read when it
   * changes — otherwise the header prints one language's figures over another
   * that has nothing done in it. XP joined the lesson count in being kept per
   * course, and only the lesson count was being re-read, so switching language
   * left the old XP on screen until the app was restarted.
   *
   * Days learned is counted from the records rather than stored, so it is
   * recounted here rather than re-read.
   */
  useEffect(() => {
    const sync = () => {
      setStats((current) => ({
        ...current,
        sessionsCompleted: loadScopedJson("sessionsCompleted", 0, profile) as number,
        totalXp: loadScopedJson("totalXp", 0, profile) as number,
        learningDays: countLearningDays(profile),
      }));
    };
    window.addEventListener(DIRECTION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(DIRECTION_CHANGE_EVENT, sync);
  }, [profile]);

  const [ownedShopBadges, setOwnedShopBadges] = useState<ShopBadgeId[]>(() => {
    const stored = loadScopedJson<unknown[]>(SHOP_PURCHASES_KEY, [], profile);
    return Array.isArray(stored) ? stored.filter(isShopBadgeId) : [];
  });
  const [equippedShopBadge, setEquippedShopBadge] = useState<ShopBadgeId | null>(() => {
    const stored = loadScopedJson<unknown>(SHOP_EQUIPPED_KEY, null, profile);
    return isShopBadgeId(stored) ? stored : null;
  });
  const [partsRequested, setPartsRequested] = useState(false);
  const apiParts = usePrototypeParts(partsRequested);
  const requestParts = useCallback(() => setPartsRequested(true), []);
  /**
   * The topic round stays inside Learn rather than becoming a view: it is
   * one of the ways in, not a destination the sidebar needs a row for.
   * Opening it is what asks for the catalogue — the Learn row itself never
   * does, and must not, since it is on the path of every first click.
   */
  const [topicRoundOpen, setTopicRoundOpen] = useState(false);
  const openTopicRound = () => {
    requestParts();
    setTopicRoundOpen(true);
  };
  const reduceMotion = useReducedMotion();
  const effectiveProfile = profile ?? PREVIEW_PROFILE;
  const leonOnlyFeaturesUnlocked = hasLeonSocialPreview(profile?.email);
  const socialPreviewUnlocked = leonOnlyFeaturesUnlocked;
  const shopUnlocked = leonOnlyFeaturesUnlocked;
  // Games are a build lab right now — several don't work. One account
  // keeps them (badged Beta); every other account sees no Games tab and a
  // coming-soon card if it lands on the view another way.
  const gamesUnlocked = leonOnlyFeaturesUnlocked;
  const createUnlocked = leonOnlyFeaturesUnlocked;
  const learnPathUnlocked = leonOnlyFeaturesUnlocked;
  const passagesUnlocked = leonOnlyFeaturesUnlocked;
  const activeCourse = getCourse(activeCourseId) ?? getCourse("german");
  const activeCourseName = activeCourse?.name ?? "German";
  const courseHasReader = Boolean(activeCourse?.lessons?.length);
  const sessionLesson = activeCourse?.lessons?.find((lesson) => lesson.id === courseSessionLesson);
  const activePack = countryPack(countryId);

  /**
   * Choose which country studies country the app is on.
   *
   * This used to step to the next one, on the argument that the sidebar
   * already had a picker and a second one was a dialog too many. That held
   * while there were two countries. At three, stepping means clicking until
   * the right one comes round, and the card is not a dialog — it is a menu
   * inside the card, the same as the one the language card beside it has.
   *
   * The lesson being read is still cleared, because lesson ids do not cross
   * countries.
   */
  const pickCountry = useCallback((id: CountryId) => {
    setCountryId(id);
    setUkLessonId(undefined);
    setUkReaderOpen(false);
  }, []);
  const ukCourse = getCourse(activePack.course.id);
  const ukLesson = ukCourse?.lessons?.find((lesson) => lesson.id === ukLessonId);
  const partsReady = Object.keys(apiParts).length > 0;
  const earnedShopCoins = 80
    + Math.floor(stats.totalXp / 100)
    + (stats.sessionsCompleted * 2)
    + Math.floor(stats.totalReviews / 20);
  const spentShopCoins = ownedShopBadges.reduce((total, id) => (
    total + (SHOP_ITEMS.find((item) => item.id === id)?.price ?? 0)
  ), 0);
  const availableShopCoins = Math.max(0, earnedShopCoins - spentShopCoins);
  // Same two steps as the button buried in Profile settings: clear the local
  // session and reload back to the login screen. Progress stays on the device.
  const signOutOfPrototype = useCallback(() => {
    setAuthUser(null);
    window.location.reload();
  }, []);
  const knownVocab = countKnownVocab(profile, stats.externalWords);
  const searchableLessons = useMemo(() => Object.entries(apiParts).map(([id, part]) => ({
    id,
    title: part.theme || part.label,
    subtitle: `${part.level} · ${part.description || part.focus}`,
    group: (isPrototypeBulkPartKey(id) ? "Word bank" : "Lesson") as "Word bank" | "Lesson",
    searchText: buildCatalogSearchText([
      id,
      part.label,
      part.level,
      part.theme,
      part.description,
      part.focus,
      ...(part.phrases ?? []).flatMap((phrase) => [phrase.de, phrase.en]),
      ...(part.vocab ?? []).flatMap((word) => [word.de, word.en]),
    ]),
  })), [apiParts]);

  /**
   * The path's units, flattened for search.
   *
   * Built from the same buildDuoPath the path view uses rather than a second
   * reading of the packs, so a unit found here is the unit that is actually
   * there — numbering included, which is derived from pack order and would
   * drift the moment two places worked it out separately.
   */
  const searchableUnits = useMemo(() => buildDuoPath(apiParts).units.map((unit) => ({
    number: unit.number,
    title: unit.title,
    level: unit.level,
    percent: unit.percent,
    nodeTitles: unit.nodes.map((node) => node.title),
  })), [apiParts]);

  useEffect(() => {
    const previousTitle = document.title;
    document.documentElement.classList.add("is-ui-prototype");
    document.title = "Micheon";
    return () => {
      document.documentElement.classList.remove("is-ui-prototype");
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--prototype-sidebar-width", `${sidebarWidth}px`);
    return () => {
      document.documentElement.style.removeProperty("--prototype-sidebar-width");
    };
  }, [sidebarWidth]);

  useEffect(() => {
    let cancelled = false;
    const warmProfile = () => {
      if (!cancelled) void loadGamificationPanel();
    };
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(warmProfile, { timeout: 3500 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }

    const timer = window.setTimeout(warmProfile, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!socialPreviewUnlocked && activeView === "social") setActiveView("home");
    if (!shopUnlocked && activeView === "shop") setActiveView("home");
    // Learn moved into beta, so an account without it must not be left sitting
    // on a view that no longer has a way back to itself.
    if (!learnPathUnlocked && activeView === "path") setActiveView("home");
    if (!createUnlocked && activeView === "create") setActiveView("home");
    // Passages moved into beta the same way, so the same rule applies: an
    // account that cannot open it must not be left looking at it.
    if (!passagesUnlocked && activeView === "passages") setActiveView("home");
  }, [activeView, createUnlocked, learnPathUnlocked, passagesUnlocked, shopUnlocked, socialPreviewUnlocked]);

  // Pointer over a nav item, or keyboard focus on it, is intent. Start the
  // catalogue and pull the chunk now rather than at the click. Both calls are
  // idempotent: setPartsRequested is a boolean already true after the first,
  // and a repeated dynamic import resolves from the module cache.
  const prefetchView = (view: PrototypeView) => {
    // Not before the page has finished loading. The catalogue is kept off the
    // first-paint path on purpose, and a pointer that merely happens to be
    // resting over the sidebar while the app boots would otherwise drag 3.9 MB
    // straight back into it — undoing the deferral by accident.
    if (document.readyState !== "complete") return;
    if (NEEDS_CATALOGUE.includes(view)) setPartsRequested(true);
    VIEW_PREFETCH[view]?.();
  };

  /**
   * Which view Lessons opens on, for the one caller that knows better.
   *
   * Search sending somebody to Unit 12 has to land on the path, because that
   * is what draws unit cards. Everything else opens the lesson list, so this
   * is cleared on the way out — otherwise a search once would leave Lessons
   * opening on the path for the rest of the session.
   */
  const [lessonsInitialView, setLessonsInitialView] = useState<"list" | "path">("list");
  useEffect(() => {
    if (activeView !== "learn") setLessonsInitialView("list");
  }, [activeView]);

  // Which way round the progress page is built this visit. The vocabulary
  // card is the last thing on that page and the thing two rows are named
  // after, so those rows ask for it first — see takeVocabLibraryFirst.
  const [vocabFirst, setVocabFirst] = useState(false);

  const navigate = (view: PrototypeView) => {
    if ((view === "social" && !socialPreviewUnlocked) || (view === "shop" && !shopUnlocked)) {
      setActiveView("home");
      return;
    }
    // The same list the prefetch uses, and read from the same place: it was
    // written out twice, so a view added to one copy silently missed the
    // other — arriving with no catalogue, or dragging 3.9 MB it never needs.
    if (NEEDS_CATALOGUE.includes(view)) setPartsRequested(true);
    setVocabFirst(view === "progress" && takeVocabLibraryFirst());
    // Leaving Learn closes the round, so coming back lands on the row of
    // ways in rather than halfway through a board from last time.
    setTopicRoundOpen(false);
    setActiveView(view);
    const scrollToTop = () => window.scrollTo({ top: 0, behavior: "auto" });
    scrollToTop();
    window.requestAnimationFrame(() => {
      scrollToTop();
      window.requestAnimationFrame(scrollToTop);
    });
  };

  const openGuidedSession = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.set("guided", "continue");
    window.location.assign(url.toString());
  };

  /**
   * The same door as Continue learning, with a smaller course behind it.
   *
   * A sentinel rather than a pack id, because which pack the fast track opens
   * on depends on what is already finished, and that is known where the
   * sitting is built rather than here. Sending a resolved id from this side
   * would bake in an answer computed before the lesson engine had loaded.
   */
  const openFastTrack = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.set("guided", "fast");
    window.location.assign(url.toString());
  };

  const openGuidedLesson = (partId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.set("guided", partId);
    window.location.assign(url.toString());
  };

  const updateStats = (next: Partial<PrototypeStats>) => {
    setStats((current) => {
      const updated = { ...current, ...next };
      Object.entries(next).forEach(([key, value]) => saveScopedJson(key, value, profile));
      return updated;
    });
  };

  const resizeSidebar = (nextWidth: number, persist = false) => {
    const next = clampPrototypeSidebarWidth(nextWidth);
    setSidebarWidth(next);
    if (persist) saveScopedJson(PROTOTYPE_SIDEBAR_KEY, next, profile);
  };

  const selectCourse = (courseId: string) => {
    // A country course is not a language course. The dialog lists both,
    // and picking one of the country rows used to set activeCourseId —
    // which is what the language card reads for its flag and its lesson
    // count. Choosing Germany there left the language side of the home
    // page reporting progress through a citizenship course. Country
    // choice has its own store; this routes it there and leaves the
    // language alone.
    const country = COUNTRY_PACKS.find((entry) => entry.course.id === courseId);
    if (country) {
      pickCountry(country.id);
      setCourseSwitcherOpen(false);
      navigate("home");
      return;
    }
    // German, English, French and Polish are the same built-in course read four
    // ways, so picking one has to move the direction as well as the id. Without
    // this, choosing English left the app teaching German.
    // The two English courses are the same course with a different spelling
    // and accent, so picking one sets both. Doing it here means the choice is
    // made once, in the place you choose the language, instead of being a
    // second setting you have to know to go and find.
    if (courseId === "english-uk" || courseId === "english-us") {
      setLearningDirection("learn-en");
      setEnglishVariant(courseId === "english-uk" ? "british" : "american");
    }
    else if (courseId === "german") setLearningDirection("learn-de");
    else if (courseId === "french") setLearningDirection("learn-fr");
    else if (courseId === "polish") setLearningDirection("learn-pl");
    else if (courseId === "spanish") setLearningDirection("learn-es");
    else if (courseId === "italian") setLearningDirection("learn-it");
    else if (courseId === "portuguese") setLearningDirection("learn-pt");
    else if (courseId === "russian") setLearningDirection("learn-ru");
    else if (courseId === "greek") setLearningDirection("learn-el");
    else if (courseId === "albanian") setLearningDirection("learn-sq");
    persistActiveCourseId(courseId, profile);
    setActiveCourseId(courseId);
    setCourseReaderOpen(false);
    setCourseSessionLesson(undefined);
    setCourseSwitcherOpen(false);
    navigate("home");
  };

  const openCourseReader = (lessonId?: string) => {
    setCourseReaderLesson(lessonId);
    setCourseReaderOpen(true);
  };

  const completeCourseLesson = (lessonId: string) => {
    const done = loadCourseProgress(activeCourseId, profile);
    if (!done.includes(lessonId)) saveCourseProgress(activeCourseId, [...done, lessonId], profile);
    updateStats({ streak: recordStreakDay(profile) });
    setCourseSessionLesson(undefined);
  };

  const completeUkLesson = (lessonId: string) => {
    // Against the course actually being read. Keyed to life-in-the-uk, a
    // finished German lesson was recorded as a British one — which both
    // stopped the German course ever filling up and filled the British one
    // with lessons nobody had opened.
    const countryCourseId = activePack.course.id;
    const done = loadCourseProgress(countryCourseId, profile);
    if (!done.includes(lessonId)) saveCourseProgress(countryCourseId, [...done, lessonId], profile);
    updateStats({ streak: recordStreakDay(profile) });
    setUkLessonId(undefined);
  };

  const chooseShopBadge = (id: ShopBadgeId) => {
    if (!shopUnlocked) return;
    const item = SHOP_ITEMS.find((candidate) => candidate.id === id);
    if (!item) return;

    if (!ownedShopBadges.includes(id)) {
      if (availableShopCoins < item.price) return;
      const nextOwned = [...ownedShopBadges, id];
      setOwnedShopBadges(nextOwned);
      saveScopedJson(SHOP_PURCHASES_KEY, nextOwned, profile);
    }

    setEquippedShopBadge(id);
    saveScopedJson(SHOP_EQUIPPED_KEY, id, profile);
  };

  const searchItems: PrototypeSearchItem[] = [
    ...[
      ...PROTOTYPE_SEARCH_PAGES.filter((page) => page.id !== "games" || gamesUnlocked),
      ...(socialPreviewUnlocked ? [LEON_SOCIAL_SEARCH_PAGE] : []),
      ...(shopUnlocked ? [LEON_SHOP_SEARCH_PAGE] : []),
    ].map((page) => ({
      id: `page-${page.id}`,
      title: ui(page.title),
      subtitle: ui(page.subtitle),
      group: "Page" as const,
      actionLabel: "Open" as const,
      searchText: buildCatalogSearchText([page.title, page.subtitle, ui(page.title), ui(page.subtitle), page.keywords]),
      onSelect: () => navigate(page.id),
    })),
    // The timeline in the global search box, so a date typed anywhere in the
    // app reaches the event. Only the 42 events, not all 230 questions —
    // searching "the" should not return a third of the citizenship course.
    ...UK_TIMELINE.map((entry) => ({
      id: `uk-event-${entry.id}`,
      title: entry.title,
      subtitle: `${entry.displayYear} · ${ui(activePack.label)}`,
      group: "Country studies" as const,
      actionLabel: "Open" as const,
      searchText: buildCatalogSearchText([
        entry.title,
        entry.summary,
        entry.displayYear,
        String(entry.year),
        ...entry.tags,
      ]),
      onSelect: () => { setUkTab("timeline"); navigate("life-in-uk"); },
    })),
    ...searchableLessons.map((lesson) => ({
      ...lesson,
      id: `lesson-${lesson.id}`,
      actionLabel: "Start" as const,
      onSelect: () => openGuidedLesson(lesson.id),
    })),
    // The path's units. A lesson was already findable by name, but the unit
    // holding it was not, so "unit 12" or the name of a unit reached nothing
    // and the only way to a unit was scrolling the path to it.
    //
    // The nodes inside each unit go into the same search text: they are what
    // the unit is FOR, and somebody looking for the unit that teaches the
    // dative is looking for a word that appears on a node, not in the title.
    ...searchableUnits.map((unit) => ({
      id: `unit-${unit.number}`,
      title: `${uiFmt("Unit {n}", { n: unit.number })} · ${unit.title}`,
      // The percentage rather than "3 of 5 units", which is what the nearest
      // existing phrase says and would be counting the wrong thing: these are
      // the lessons inside one unit. The unit's own card prints this figure.
      subtitle: [unit.level, `${unit.percent}%`].filter(Boolean).join(" · "),
      group: "Unit" as const,
      actionLabel: "Open" as const,
      searchText: buildCatalogSearchText([
        unit.title,
        unit.level,
        `unit ${unit.number}`,
        uiFmt("Unit {n}", { n: unit.number }),
        ...unit.nodeTitles,
      ]),
      onSelect: () => {
        // The units are drawn by the path, and the path is a view of Lessons
        // now — landing on the lesson list would scroll to an anchor that is
        // not on screen, which looks exactly like search having done nothing.
        setLessonsInitialView("path");
        navigate("learn");
        scrollToAnchorWhenReady(duoUnitAnchorId(unit.number));
      },
    })),
    // Games only surface in search on the account that can open them.
    ...(gamesUnlocked ? PROTOTYPE_SEARCH_GAMES.map(([title, subtitle]) => ({
      id: `game-${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title,
      subtitle,
      group: "Game" as const,
      actionLabel: "Open" as const,
      searchText: buildCatalogSearchText([title, subtitle, "practice play"]),
      onSelect: () => navigate("games"),
    })) : []),
  ];

  // The vocabulary library, mastery, totals and milestones, which used to be
  // the tail of the settings page. Signed out there is nothing of the sort to
  // show, so the progress panel stands on its own. Written here rather than
  // where it is used because it goes above or below that panel depending on
  // what was asked for: the panel is 1,189px tall and the card is under it,
  // so a learner who asked for the card by name spent a second and a half
  // looking at something else and then watched the page jump.
  const progressExtras = profile ? (
    <div className="np-feature-host np-progress-extras">
      <Suspense fallback={<FeatureLoading />}>
        <GamificationPanel
          apiParts={apiParts}
          onRequestCatalogue={requestParts}
          onUpdateStats={updateStats}
          progressOnly
          stats={stats}
          user={profile}
        />
      </Suspense>
    </div>
  ) : null;

  const mainView = activeView === "home" ? (
    courseHasReader && activeCourse ? (
      <div className="np-feature-host">
        <Suspense fallback={<FeatureLoading />}>
          <CourseDashboardView
            course={activeCourse}
            onBrowseLessons={() => navigate("learn")}
            onOpenLesson={(lessonId) => setCourseSessionLesson(lessonId)}
            onOpenReader={() => openCourseReader()}
          />
        </Suspense>
      </div>
    ) : (
      <HomeView
        apiParts={apiParts}
        countryId={countryId}

        onOpenCountryCourse={() => navigate("life-in-uk")}
        onOpenFading={() => {
          requestVocabLibraryFirst();
          requestVocabLibraryOpen();
          requestVocabFilter("fading");
          navigate("progress");
          scrollToVocabularyLibrary();
        }}
        onPractice={openGuidedSession}
        onRequestCatalogue={requestParts}
        profile={profile}
        onChangeCountry={() => openCourseSwitcher("country")}
        onSwitchCourse={() => openCourseSwitcher("all")}
        stats={stats}
        vocab={knownVocab}
      />
    )
  ) : activeView === "path" && topicRoundOpen ? (
    // The topic round, inside Learn. Its back bar returns to the row of ways
    // in rather than to Home, because that row is where it was opened from.
    <div className="np-feature-host">
      <FeatureBackBar back={ui("Back to Learn")} label={ui("Topic round")} onBack={() => navigate("path")} />
      <Suspense fallback={<FeatureLoading />}>
        <TopicRoundView apiParts={apiParts} catalogueReady={partsReady} profile={effectiveProfile} />
      </Suspense>
    </div>
  ) : activeView === "path" ? (
    // Every way in, on one screen. The guided session button is the same call
    // the dashboard hero makes; nothing about that route changed.
    <div className="np-feature-host">
      <Suspense fallback={<FeatureLoading />}>
        <DuoPathView
          lessonsCompleted={stats.sessionsCompleted}
          onConversation={() => navigate("passages")}
          onFastTrack={openFastTrack}
          onGuidedSession={openGuidedSession}
          onTopicRound={openTopicRound}
        />
      </Suspense>
    </div>
  ) : activeView === "learn" ? (
    <div className="np-feature-host">
      {courseHasReader && activeCourse ? (
        <Suspense fallback={<FeatureLoading />}>
          <CourseLessonsView
            course={activeCourse}
            onOpenLesson={(lessonId) => setCourseSessionLesson(lessonId)}
            onOpenReader={() => openCourseReader()}
          />
        </Suspense>
      ) : partsReady ? (
        <Suspense fallback={<FeatureLoading />}>
          <LearningLibraryView apiParts={apiParts} initialView={lessonsInitialView} onOpenLesson={openGuidedLesson} />
        </Suspense>
      ) : <FeatureLoading />}
    </div>
  ) : activeView === "practice" ? (
    <PracticeHub
      apiParts={apiParts}
      onNavigate={navigate}
      onRequestCatalogue={requestParts}
    />
  ) : activeView === "listen" ? (
    <div className="np-feature-host">
      <FeatureLoading />
    </div>
  ) : activeView === "games" && gamesUnlocked ? (
    <div className="np-feature-host">
      {/* No partsReady gate: the games library is a list of titles and needs
          no catalogue. GamesView waits for one only once a game is opened. */}
      <Suspense fallback={<FeatureLoading />}>
        <GamesView apiParts={apiParts} catalogueReady={partsReady} />
      </Suspense>
    </div>
  ) : activeView === "games" ? (
    <section className="np-page-card">
      <div className="np-page-intro">
        <span className="np-page-icon"><Gamepad2 /></span>
        <div>
          <h1>{ui("Games are coming soon")}</h1>
          <p>{ui("Learning games are still being built and tested. They will appear here once they are ready.")}</p>
        </div>
      </div>
    </section>
  ) : activeView === "social" && socialPreviewUnlocked ? (
    <SocialView avatar={profile?.avatar} stats={stats} userName={profile?.name ?? PREVIEW_PROFILE.name} />
  ) : activeView === "tests" ? (
    <div className="np-feature-host">
      <FeatureBackBar label={ui("Tests")} onBack={() => navigate("practice")} />
      {partsReady ? (
        <Suspense fallback={<FeatureLoading />}>
          <TestsView apiParts={apiParts} profile={effectiveProfile} />
        </Suspense>
      ) : <FeatureLoading />}
    </div>
  ) : activeView === "passages" && passagesUnlocked ? (
    <div className="np-feature-host">
      <FeatureBackBar back={ui("Back to Home")} label={ui("Conversation")} onBack={() => navigate("home")} />
      <Suspense fallback={<FeatureLoading />}>
        <ConversationAndReading apiParts={apiParts} />
      </Suspense>
    </div>
  ) : activeView === "grammar" ? (
    <div className="np-feature-host guided-session np-grammar-view">
      <FeatureBackBar label={ui("Grammar")} onBack={() => navigate("practice")} />
      <Suspense fallback={<FeatureLoading />}>
        <ClozeTabContent />
        <GrammarTabContent />
      </Suspense>
    </div>
  ) : activeView === "shop" && shopUnlocked ? (
    <ShopView
      availableCoins={availableShopCoins}
      equippedBadge={equippedShopBadge}
      onChooseBadge={chooseShopBadge}
      ownedBadges={ownedShopBadges}
    />
  ) : activeView === "progress" ? (
    <>
      {vocabFirst ? progressExtras : null}
      <ProgressPanel onNavigate={navigate} standalone stats={stats} userName={profile?.name ?? PREVIEW_PROFILE.name} />
      {vocabFirst ? null : progressExtras}
    </>
  ) : activeView === "profile" ? (
    profile ? (
      <div className="np-feature-host">
        <Suspense fallback={<FeatureLoading />}>
          <GamificationPanel
            activeCourseName={activeCourseName}
            apiParts={apiParts}
            onRequestCatalogue={requestParts}
            onSwitchCourse={() => openCourseSwitcher("all")}
            onUpdateStats={updateStats}
            profileOnly
            stats={stats}
            user={profile}
          />
        </Suspense>
      </div>
    ) : <AccountGate onRequestSignIn={onRequestSignIn} />
  ) : activeView === "create" ? (
    <div className="np-feature-host">
      <Suspense fallback={<FeatureLoading />}>
        <CreateView apiParts={apiParts} />
      </Suspense>
    </div>
  ) : activeView === "life-in-uk" ? (
    <div className="np-feature-host">
      {ukCourse ? (

        <Suspense fallback={<FeatureLoading />}>
          <div className="np-uk-tabs" role="tablist" aria-label={ui("Country studies sections")}>
            <button
              aria-selected={ukTab === "learn"}
              className={ukTab === "learn" ? "is-active" : ""}
              onClick={() => setUkTab("learn")}
              role="tab"
              type="button"
            >
              {ui("Learn")}
            </button>
            <button
              aria-selected={ukTab === "practice"}
              className={ukTab === "practice" ? "is-active" : ""}
              onClick={() => setUkTab("practice")}
              role="tab"
              type="button"
            >
              {ui("Practice")}
            </button>
            {/* Learn → practise → find the gaps → sit the exam. The three new
                tabs continue the same left-to-right order someone revising
                actually moves through, and reuse this tab bar rather than
                introducing a second style of one. */}
            <button
              aria-selected={ukTab === "exam"}
              className={ukTab === "exam" ? "is-active" : ""}
              onClick={() => setUkTab("exam")}
              role="tab"
              type="button"
            >
              {ui("Exam")}
            </button>
            <button
              aria-selected={ukTab === "timeline"}
              className={ukTab === "timeline" ? "is-active" : ""}
              onClick={() => setUkTab("timeline")}
              role="tab"
              type="button"
            >
              {ui("Timeline")}
            </button>
            <button
              aria-selected={ukTab === "search"}
              className={ukTab === "search" ? "is-active" : ""}
              onClick={() => setUkTab("search")}
              role="tab"
              type="button"
            >
              {ui("Search")}
            </button>
            {/* Last, and pushed to the far right by margin-left:auto. It sat
                between two tabs before, where it read as a broken tab rather
                than a control, and went unfound. Only on Learn,
                because it is the only tab showing cards to translate. */}
            {/* Both courses now, filtered by the language each is written in:
                Life in the UK is English and offers German, Leben in
                Deutschland is German and offers English. It was UK-only while
                the only table read English. */}
            {ukTab === "learn" && translationLanguagesFor(activePack.contentLang).length > 1 && (
              <label className="np-uk-translation">
                <Languages aria-hidden="true" />
                <span>{ui("Tap a card for")}</span>
                <select
                  aria-label={ui("Translation language")}
                  onChange={(event) => setTranslationLanguage(event.target.value as TranslationLanguage)}
                  value={translationLanguage}
                >
                  {translationLanguagesFor(activePack.contentLang).map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.id === "off" ? ui("No translation") : language.endonym}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {ukTab === "learn" ? (
            <CourseLessonsView
              course={ukCourse}
              onOpenLesson={(lessonId) => setUkLessonId(lessonId)}
              onOpenReader={() => setUkReaderOpen(true)}
            />
          ) : ukTab === "practice" ? (
            <UkPracticeView
              /* Keyed on the country: switching remounts the screen, so no
                 session, test, timer or cached progress from the other one
                 can survive into it and be written to the wrong store. */
              key={activePack.id}
              onOpenLesson={(lessonId) => { setUkTab("learn"); setUkLessonId(lessonId); }}
              pack={activePack}
              profile={profile}
            />
          ) : ukTab === "exam" ? (
            <UkTestView
              key={activePack.id}
              onOpenLesson={(lessonId) => { setUkTab("learn"); setUkLessonId(lessonId); }}
              pack={activePack}
            />
          ) : ukTab === "timeline" ? (
            <UkTimelineView key={activePack.id} pack={activePack} />
          ) : (
            <UkSearchView
              key={activePack.id}
              onOpenLesson={(lessonId) => { setUkTab("learn"); setUkLessonId(lessonId); }}
              pack={activePack}
            />
          )}
        </Suspense>
      ) : <FeatureLoading />}
    </div>
  ) : (
    <MoreView
      onNavigate={navigate}
      passagesUnlocked={passagesUnlocked}
      shopUnlocked={shopUnlocked}
      socialPreviewUnlocked={socialPreviewUnlocked}
    />
  );

  // Not on home: she asked for it off the opening screen, which has been
  // getting shorter deliberately. It stays on Üben, and the achievements page
  // it links to is still reachable from the avatar menu, More and search.
  const showRightRail = !courseHasReader && activeView === "practice";

  return (
    <div className="new-ui-prototype">
      <div className="np-window">
        <div
          className="np-shell"
          style={{ "--np-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
        >
          <Sidebar
            activeView={activeView}
            courseFlagId={learningFlagId(activeCourseId)}
            createUnlocked={createUnlocked}
            learnPathUnlocked={learnPathUnlocked}
            passagesUnlocked={passagesUnlocked}
            gamesUnlocked={gamesUnlocked}
            onNavigate={navigate}
            countryId={countryId}
            onOpenUkSection={(tab, country) => {
              // Switching country resets the lesson being read: lesson ids do
              // not cross countries, and a stale one would leave the reader
              // showing nothing.
              if (country && country !== countryId) {
                setCountryId(country);
                setUkLessonId(undefined);
                setUkReaderOpen(false);
              }
              setUkTab(tab);
              navigate("life-in-uk");
            }}
            onSwitchCourse={() => openCourseSwitcher("all")}
            onPrefetch={prefetchView}
            onResize={resizeSidebar}
            profile={profile}
            shopUnlocked={shopUnlocked}
            socialPreviewUnlocked={socialPreviewUnlocked}
            ukTab={ukTab}
            width={sidebarWidth}
          />
          <div className="np-app-area">
            <Header
              view={activeView}
              avatar={profile?.avatar}
              onSignOut={signOutOfPrototype}
              equippedBadge={shopUnlocked ? equippedShopBadge : null}
              onNavigate={navigate}
              onProfileIntent={() => { void loadGamificationPanel(); }}
              onSearchOpen={requestParts}
              searchCatalogLoading={partsRequested && !partsReady}
              searchItems={searchItems}
              socialPreviewUnlocked={socialPreviewUnlocked}
              stats={stats}
              userEmail={profile?.email}
              userName={profile?.name ?? PREVIEW_PROFILE.name}
            />
            <div className={`np-content-grid${showRightRail ? "" : " np-content-grid--wide"}`}>
              {(activeView !== "listen" || !partsReady) && (
                <motion.main
                  animate={{ opacity: 1, y: 0 }}
                  className="np-main"
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  key={activeView}
                  transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {mainView}
                </motion.main>
              )}
              {partsReady && (
                <main
                  aria-hidden={activeView !== "listen"}
                  className={activeView === "listen" ? "np-main" : "hidden"}
                >
                  <Suspense fallback={<FeatureLoading />}>
                    <ListenView
                      active={activeView === "listen"}
                      apiParts={apiParts}
                      key={`${profile?.id ?? "default"}:${getLearningDirection()}`}
                      learningDirection={getLearningDirection()}
                      onOpen={() => navigate("listen")}
                      profile={profile}
                    />
                  </Suspense>
                </main>
              )}
              {showRightRail && (
                <aside className="np-right-rail">
                  <ProgressPanel
                    onNavigate={navigate}
                    onViewAllAchievements={() => navigate("progress")}
                    stats={stats}
                    userName={profile?.name ?? PREVIEW_PROFILE.name}
                  />
                </aside>
              )}
            </div>
          </div>
        </div>
        <MobileNav activeView={activeView} gamesUnlocked={gamesUnlocked} onNavigate={navigate} />
        <CourseSwitcher
          activeCountryCourseId={activePack.course.id}
          activeCourseId={activeCourseId}
          scope={courseSwitcherScope}
          onClose={() => setCourseSwitcherOpen(false)}
          onSelect={selectCourse}
          open={courseSwitcherOpen}
        />
        {courseReaderOpen && activeCourse && courseHasReader && (
          <Suspense fallback={<FeatureLoading />}>
            <CourseShell
              course={activeCourse}
              initialLessonId={courseReaderLesson}
              onExit={() => setCourseReaderOpen(false)}
            />
          </Suspense>
        )}
        {sessionLesson && activeCourse && (
          <Suspense fallback={<FeatureLoading />}>
            <CourseSession
              course={activeCourse}
              lesson={sessionLesson}
              onComplete={() => completeCourseLesson(sessionLesson.id)}
              onExit={() => setCourseSessionLesson(undefined)}
            />
          </Suspense>
        )}
        {ukReaderOpen && ukCourse && (
          <Suspense fallback={<FeatureLoading />}>
            <CourseShell course={ukCourse} onExit={() => setUkReaderOpen(false)} />
          </Suspense>
        )}
        {ukLesson && ukCourse && (
          <Suspense fallback={<FeatureLoading />}>
            <CourseSession
              course={ukCourse}
              lesson={ukLesson}
              onComplete={() => completeUkLesson(ukLesson.id)}
              onExit={() => setUkLessonId(undefined)}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
