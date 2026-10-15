const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const electronMain = read("electron/main.js");
const app = read("src/App.tsx");
const appStyles = read("src/index.css");
const guidedSession = read("src/GuidedSession.tsx");
const guidedBackground = read("src/lib/guidedBackground.ts");
const prototype = read("src/prototype/NewUiPrototype.tsx");
const styles = read("src/prototype/new-ui-prototype.css");
const theme = read("src/lib/theme.ts");
const mastery = read("src/components/lab/MasteryCard.tsx");
const learnView = read("src/components/lab/LearnView.tsx");
const testsView = read("src/components/tests/TestsView.tsx");
const documentHead = read("index.html");
const favicon = read("public/favicon.svg");
const primaryNavigation = (/const NAVIGATION:[\s\S]*?\n\];/.exec(prototype) || [""])[0];
const petReassertion = (/function reassertPetSurfacesAfterAppDeactivation\(\)[\s\S]*?^}/m.exec(electronMain) || [""])[0];
const guidedCanvas = (/\.guided-session\.fs-app\.prototype-guided-session\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];
const previewHead = (/prototype-guided-session \.fs-preview-head\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];
const previewScene = (/prototype-guided-session \.fs-preview-head::before\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];
const previewBlend = (/prototype-guided-session \.fs-preview-head::after\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];
const checkButton = (/prototype-guided-session \.fs-check\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];
const checkButtonHover = (/prototype-guided-session \.fs-check:hover\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];
const checkButtonDisabled = (/prototype-guided-session \.fs-check:disabled\s*\{([^}]*)\}/s.exec(appStyles) || ["", ""])[1];

let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }

  failures += 1;
  console.error(`FAIL ${name}`);
}

function pngSize(relativePath) {
  const file = fs.readFileSync(path.join(root, relativePath));
  const signature = file.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return {
    bytes: file.length,
    height: file.readUInt32BE(20),
    width: file.readUInt32BE(16),
  };
}

check("Electron imports the native Menu API", /import \{[^}]*\bMenu\b[^}]*\} from "electron";/.test(electronMain));
check("desktop text selections open a context menu", electronMain.includes('window.webContents.on("context-menu"'));
check("the desktop context menu supports Copy", electronMain.includes('{ role: "copy"'));
check("editable fields receive the standard editing actions", ["undo", "redo", "cut", "paste", "selectAll"].every((role) => electronMain.includes(`role: "${role}"`)));
check("custom non-text right-click controls stay untouched", electronMain.includes("if (!params.isEditable && !hasSelection) return;"));
check("the text menu is installed on the main app window", electronMain.includes("installTextContextMenu(mainWindow);"));
check("desktop pets use a normal always-on-top level", electronMain.includes('const PET_DESKTOP_TOP_LEVEL = "floating"'));
check("game-visible pets use the strongest ordinary Windows level", electronMain.includes('const PET_GAME_TOP_LEVEL = process.platform === "win32" ? "screen-saver" : "floating"'));
check("only game-visible pets opt into fullscreen workspaces", electronMain.includes('visibleOnFullScreen: petDisplayMode === "games"'));
check("Micheon-only pets do not open the desktop overlay", electronMain.includes('if (petDisplayMode === "app")') && electronMain.includes("setPetOverlayVisible(false)"));
check("pet overlays reassert their z-order after Micheon deactivates", electronMain.includes('mainWindow.on("blur", reassertPetSurfacesAfterAppDeactivation)') && electronMain.includes('mainWindow.on("minimize", reassertPetSurfacesAfterAppDeactivation)'));
check("immediate pet z-order recovery remains bounded", petReassertion.includes("for (const delay of [80, 700])") && petReassertion.includes("setTimeout") && !petReassertion.includes("setInterval"));
check("game-visible pets never poll the foreground z-order", !electronMain.includes("PET_GAME_Z_ORDER_INTERVAL_MS") && !electronMain.includes("syncPetGameZOrderWatchdog") && !electronMain.includes("petGameZOrderTimer"));
check("pet topmost levels only change when needed", electronMain.includes("const petSurfaceTopLevels = new WeakMap();") && electronMain.includes("configuredLevel !== level || !window.isAlwaysOnTop()") && electronMain.includes("petSurfaceTopLevels.set(window, level)"));

// These two used to pin CourseHero's bar — displayedProgress, a motion.span
// scaling from empty — on a component nothing rendered. It went in the
// dead-code pass. The bars people see are the home choice cards': a real
// progressbar role with its value bound, and a fill whose width IS the value.
check("course progress is exposed as a progressbar", prototype.includes('role="progressbar"') && prototype.includes("aria-valuenow={percent}") && prototype.includes("aria-valuemax={100}"));
check("the progress fill is the value, not a picture of one", prototype.includes("<span style={{ width: `${percent}%` }} />"));
check("course progress respects reduced-motion preferences", prototype.includes("const reduceMotion = useReducedMotion();") && prototype.includes("initial={reduceMotion ? false"));
check("search focus uses one clean outer ring", styles.includes(".np-search-field:focus-within") && styles.includes(".np-search-field input:focus-visible"));
check("the search input suppresses the nested browser outline", styles.includes("outline: 0 !important;") && styles.includes("box-shadow: none !important;"));
check("keyboard focus uses one non-green Micheon ring", /\.new-ui-prototype button:focus-visible,[\s\S]*?outline:\s*2px solid var\(--np-violet\);[\s\S]*?outline-offset:\s*2px;/s.test(styles) && !/\.new-ui-prototype button:focus-visible,[\s\S]{0,420}rgba\(79,\s*189,\s*81/s.test(styles));
check("test answers suppress the outer ring and keep their focused border", /\.new-ui-prototype \.test-answer-field:focus,[\s\S]*?outline:\s*none !important;[\s\S]*?box-shadow:\s*none !important;/s.test(appStyles) && testsView.includes("focus:border-[var(--accent)]"));
check("lesson-library search uses one focused border", learnView.includes('className="learn-library-search ') && /learn-library-search:focus-visible\s*\{[^}]*outline:\s*0;/s.test(styles));
check("light test cards define the yellow icon tile treatment", testsView.includes("bg-[var(--yellow-dim)]") && /\.np-feature-host\s*\{[^}]*--yellow-dim:\s*#fff1c7;[^}]*--yellow-ink:\s*#986000;/s.test(styles));
// "Level progress" and the mint-on-green hero bar were CourseHero's, which
// nothing rendered; the class np-progress-track--hero has no user in src/
// at all. What is live is the course card's bar, and it says where you are
// in words a screen reader can read, not just as a number.
check("the course progress bar says where you are in words", prototype.includes('aria-label={uiFmt("{pct}% through {pack}"'));
check("the mastery ring halo always has a valid radius", mastery.includes('r={dotR * 1.1}'));
check("the mastery ring halo has a defined first animation frame", mastery.includes('initial={reduce ? false : { r: dotR * 1.1, opacity: 0.55 }}'));
check("the mastery percentage uses its real progress ring on a light tile", /\.np-feature-host \.mastery-ring > svg\s*\{[^}]*display:\s*block;/s.test(styles) && /\.np-feature-host \.mastery-ring::after\s*\{[^}]*display:\s*none;/s.test(styles) && styles.includes("linear-gradient(145deg, #fdfff9 0%, #edf8e8 100%)"));
check("dark custom mastery cards use neutral readable surfaces instead of accent-on-accent text", /html\[data-theme="dark"\]\[data-accent="custom"\] \.np-feature-host \.mastery-card__milestone\.is-reached\s*\{[^}]*background:\s*rgba\(var\(--accent-rgb\), 0\.14\);/s.test(styles) && /html\[data-theme="dark"\]\[data-accent="custom"\] \.np-feature-host \.mastery-ring__value\s*\{[^}]*color:\s*var\(--text-1\);/s.test(styles));
check("dark custom search and social actions keep readable accent ink", /html\[data-theme="dark"\]\[data-accent="custom"\] \.np-search-result-action\s*\{[^}]*color:\s*var\(--accent-ink\);/s.test(styles) && /html\[data-theme="dark"\]\[data-accent="custom"\] \.np-social-side-card > small,[\s\S]*?color:\s*var\(--accent-ink\);/s.test(styles));
check("dark custom active navigation uses the foreground derived for its accent fill", /html\[data-theme="dark"\]\[data-accent="custom"\] \.np-side-nav button\.is-active\s*\{[^}]*color:\s*var\(--accent-text\);[^}]*background:\s*var\(--accent\);/s.test(styles));
// Redesigned twice (2026-08-19): three separately-boxed
// chips with bordered icon tiles inside, then one capsule that stretched
// across its grid column with the stats marooned mid-pill. The header stats
// now wear NO container at all — the illustrated reward art anchors each
// number and spacing does the grouping, which is what the product's
// "gamification chrome stays quiet" principle actually asks for.
//
// Pinned: the art still renders per kind, nothing reintroduces a frame
// (border/background/box-shadow on the group or the chips), and the climbing
// counters keep tabular figures so they cannot jitter as they grow.
{
  const statBlocks = (styles.match(/(?:^|\n)\s*\.np-(?:header-stats|stat-chip)(?:[^{\n]*)\{[^}]*\}/g) || []).join("\n");
  const framed = /(?:^|\n)\s*(?:border|background|box-shadow):/m.test(
    statBlocks.replace(/border-radius:[^;]*;/g, "")
  );
  check(
    "header stats stay unframed, art-led, and tabular",
    prototype.includes("np-stat-chip__art np-stat-chip__art--${kind}")
      && !framed
      && /\.np-stat-chip strong\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s.test(styles)
      && /\.np-stat-chip__art \.np-reward-icon\s*\{[^}]*filter:\s*drop-shadow/s.test(styles)
  );
}
check("the prototype title bar is one uninterrupted surface", appStyles.includes("background: #fffaf1;") && appStyles.includes(".titlebar--prototype::after") && appStyles.includes("content: none;"));
check("the prototype title bar carries no separator shadow", /\.titlebar--prototype\s*\{[^}]*box-shadow:\s*none;/s.test(appStyles));
check("the Electron window uses Micheon's custom frameless chrome", electronMain.includes("frame: false") && app.includes('<TitleBar variant="prototype" />'));
check("the custom title bar stays visible while the page scrolls", /\.titlebar\s*\{[^}]*position:\s*sticky;[^}]*inset:\s*0 0 auto;[^}]*z-index:\s*10000;/s.test(appStyles));
check("the custom title bar supports native-style double-click maximise", appStyles.includes(".titlebar-appmark") && read("src/components/TitleBar.tsx").includes("onDoubleClick={() => desktop.toggleMaximize()}"));
check("small prototype type uses the Windows text-optimised face", styles.includes('--np-font-text: "Segoe UI Variable Text"') && /\.new-ui-prototype\s*\{[^}]*font-family:\s*var\(--np-font-text\);/s.test(styles));
check("display type stays reserved for headings and actions", styles.includes(".new-ui-prototype strong,") && styles.includes("font-family: var(--np-font-display);"));
check("small prototype type has a readable desktop scale", styles.includes("--np-type-micro: 12px;") && styles.includes("--np-type-caption: 13px;") && styles.includes("--np-type-small: 14px;"));
// Under the title bar, not at the top of the window: the bar above the shell
// is 38px tall (see the sticky title bar checked above), so a sidebar catching
// at 0 has 38px of travel first and the logo visibly drifts up as you scroll.
check("the production sidebar stays pinned below the title bar on long pages", /\.np-sidebar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--titlebar-h,\s*0px\);[^}]*height:\s*var\(--app-h,\s*100dvh\);/s.test(styles));
check("the sidebar resize handle stays centered in the visible app height", /\.np-sidebar-resizer::after\s*\{[^}]*top:\s*50%;/s.test(styles));
check("the narrow sidebar reflows its brand before the wordmark or tagline can overflow", prototype.includes("PROTOTYPE_SIDEBAR_STACKED_BRAND_MAX = 212") && prototype.includes("PROTOTYPE_SIDEBAR_COMPACT_BRAND_MAX = 240") && prototype.includes('? " is-brand-stacked"') && prototype.includes('? " is-brand-compact"') && prototype.includes("<span>{ui(\"Made with love by\")}</span>") && /\.np-sidebar\.is-brand-compact \.np-brand\s*\{[^}]*gap:\s*10px;[^}]*padding-inline:\s*0;/s.test(styles) && /\.np-sidebar\.is-brand-stacked \.np-brand\s*\{[^}]*flex-direction:\s*column;[^}]*text-align:\s*center;/s.test(styles) && /\.np-brand strong\s*\{[^}]*white-space:\s*nowrap;/s.test(styles) && /\.np-sidebar:is\(\.is-brand-compact, \.is-brand-stacked\) \.np-brand small > span\s*\{[^}]*display:\s*block;[^}]*white-space:\s*nowrap;/s.test(styles));
check("the production shell does not trap sticky navigation in hidden overflow", styles.includes("overflow-x: clip;") && /\.np-window\s*\{[^}]*overflow:\s*clip;/s.test(styles));
check("Tests and Grammar live inside Practice instead of the primary sidebar", prototype.includes("function PracticeHub") && prototype.includes('label: ui("Tests")') && prototype.includes('label: ui("Grammar")') && !primaryNavigation.includes('id: "tests"') && !primaryNavigation.includes('id: "grammar"'));
check("the retired dashboard switch is not shipped", !prototype.includes("Need the original dashboard") && !app.includes("legacy-dashboard") && !app.includes("guided-theme"));
check("installs that never picked a theme migrate once to dark, after hydration", theme.includes('const DARK_DEFAULT_MIGRATION_KEY = "micheon-dark-default-v1"') && theme.includes('localStorage.setItem(KEY, "dark")') && theme.includes("THEME_CHOSEN_KEY") && app.indexOf("await hydrateLocalStorageFromSharedStorage()") < app.indexOf("migrateToDarkThemeDefault()"));
// Every backdrop the type offers must also be drawn, or picking one leaves the
// lesson on whatever the previous rule painted. The list grows; what it
// promises does not.
const GUIDED_BACKDROPS = ["monkey", "garden", "bubbles", "atlas", "dawn", "plain", "custom"];
check("the prototype guided lesson defaults to its dedicated monkey scene and retains personal backdrop choices", guidedCanvas.includes("--fs-bg: #fffaf1;") && guidedBackground.includes(`export type GuidedBackground = ${GUIDED_BACKDROPS.map((name) => `"${name}"`).join(" | ")};`) && guidedBackground.includes("saveGuidedCustomBackground") && GUIDED_BACKDROPS.every((name) => appStyles.includes(`guided-background-${name}`)) && appStyles.includes('url("./prototype/assets/guided-monkey-world-v2.webp")') && appStyles.includes('url("./prototype/assets/guided-flower-garden-v1.webp")') && !appStyles.includes(".prototype-guided-session::before"));
check("light lesson grading controls keep readable hover colours", /prototype-guided-session \.grade-btn-known:hover:not\(:disabled\)[\s\S]*?color:\s*#195f27;/s.test(appStyles) && /prototype-guided-session \.grade-btn-struggle:hover:not\(:disabled\)[\s\S]*?color:\s*#363530;/s.test(appStyles));
// The 52px replay pill (.fs-listen) was replaced by the listening prompt
// (.fs-listening-prompt, pinned in check-listening-dictation); its rule went
// in the dead-CSS pass, and an assertion on it had been passing on nothing.
check("the prototype guided lesson gets a wider learning canvas", /\.guided-session\.fs-app\.prototype-guided-session main > div\s*\{[^}]*max-width:\s*88rem;/s.test(appStyles));
check("word-order lessons compact at desktop heights instead of forcing a page scroll", guidedSession.includes('className="fs-order-phase space-y-4"') && /@media \(min-width: 900px\) and \(max-height: 1040px\)[\s\S]*?\.fs-card:has\(\.fs-order-phase\) \.fs-order-panel\s*\{[^}]*min-height:\s*144px;/s.test(appStyles) && /\.fs-card:has\(\.fs-order-phase\) \.fs-order-feedback\s*\{[^}]*min-height:\s*94px;/s.test(appStyles));
check("dark guided reorder prompts stay on a dark high-contrast surface", /html\[data-theme="dark"\] \.guided-session\.fs-app\.prototype-guided-session \.fs-reorder-prompt\s*\{[^}]*background:\s*#161b23;/s.test(appStyles));
check("the active guided stage uses Micheon green instead of legacy gold", /prototype-guided-session \.fs-stagebtn\.is-active > span\s*\{[^}]*background:\s*var\(--fs-grad\);[^}]*color:\s*#fff;/s.test(appStyles));
// The streak counter that popped over a lesson at 3, 5, 10 and every 5 after
// is gone: it was broken and it looked it. Asserted absent rather than
// deleted and forgotten, because a floating overlay is
// exactly the sort of thing that gets added back without anyone noticing, and
// its twenty-two style rules across four themes cost more than it earned. The
// pet still says so at the same milestones; that is the feedback that stayed.
check("the guided streak pop stays removed, markup and styles alike", !guidedSession.includes("fs-praise-pop") && !guidedSession.includes("setPraise") && !appStyles.includes("fs-praise"));
check("closed-book recall uses a high-contrast light learning surface", /prototype-guided-session \.fs-closed-recall-cue\s*\{[^}]*border-color:\s*rgba\(67,\s*184,\s*76,\s*0\.3\);[^}]*background:\s*linear-gradient\(180deg,\s*#fbfff8 0%,\s*#f1f8ec 100%\);/s.test(appStyles) && /prototype-guided-session \.fs-closed-recall-cue strong\s*\{[^}]*color:\s*#252a24;[^}]*font-weight:\s*950;/s.test(appStyles));
check("notifications close with a neutral icon action", prototype.includes('aria-label={ui("Close notifications")}') && prototype.includes('<X aria-hidden="true" />') && /\.np-notification-heading button\s*\{[^}]*background:\s*var\(--np-surface-soft\);/s.test(styles));
check("the lesson preview has its own focused surface", guidedSession.includes('inPreview && "fs-card--preview"'));
check("the lesson preview reuses the lightweight homepage course scene", appStyles.includes('url("./prototype/assets/micheon-hero-v3.webp")'));
check("the lesson preview blends its course scene without a centre seam", !previewHead.includes("url(") && previewScene.includes('url("./prototype/assets/micheon-hero-v3.webp") right center / auto 120% no-repeat') && previewScene.includes("rgba(0, 0, 0, 0.04) 48%") && previewBlend.includes("rgba(36, 168, 61, 0.96) 48%") && previewBlend.includes("transparent 82%"));
check("guided Check buttons use readable ink on a green tactile base with no inherited gold", checkButton.includes("color: #123c1a;") && checkButton.includes("0 4px 0 #248831") && checkButtonHover.includes("0 6px 0 #248831") && !`${checkButton}${checkButtonHover}`.includes("#a77b00"));
check("dark custom guided Check buttons use the foreground derived for their accent fill", /html\[data-theme="dark"\]\[data-accent="custom"\] \.guided-session\.fs-app\.prototype-guided-session \.fs-check\s*\{[^}]*color:\s*var\(--accent-text\);/s.test(appStyles));
check("disabled guided Check buttons keep their label readable in every accent", checkButtonDisabled.includes("opacity: 1;") && checkButtonDisabled.includes("cursor: not-allowed;") && /html:not\(\[data-theme="dark"\]\)\[data-accent="custom"\][\s\S]*?\.fs-check:disabled\s*\{[^}]*color:\s*var\(--accent-ink\);/s.test(appStyles) && /html\[data-theme="dark"\]\[data-accent="custom"\][\s\S]*?\.fs-check:disabled\s*\{[^}]*color:\s*var\(--accent-ink\);/s.test(appStyles));
check("the lesson preview exposes useful phrase and language context", guidedSession.includes('className="fs-preview-summary"') && guidedSession.includes('{cards.length} {ui("Phrases")}'));
check("the lesson preview uses tactile numbered route steps", /prototype-guided-session \.fs-preview-route button\s*\{[^}]*height:\s*38px;[^}]*color:\s*#77786f;/s.test(appStyles));
check("the lesson preview card has a stable content and helper hierarchy", guidedSession.includes('className="fs-flashcard-content"') && guidedSession.includes('className="fs-flashcard-footer"'));
check("the redesigned lesson preview has narrow-screen composition rules", /@media \(max-width: 600px\)[\s\S]*?prototype-guided-session main\s*\{[^}]*padding:\s*14px;/s.test(appStyles));

const screenshotPaths = [
  "docs/screenshots/micheon-home.png",
  "docs/screenshots/micheon-guided-lesson.png",
  "docs/screenshots/micheon-guided-session.png",
  "docs/screenshots/micheon-dark-accent.png",
  "docs/screenshots/micheon-lessons.png",
  "docs/screenshots/micheon-games.png",
];

check("the document advertises Micheon favicons at every common size", documentHead.includes('href="/favicon.svg') && documentHead.includes('href="/icon-64.png') && documentHead.includes('rel="apple-touch-icon"') && documentHead.includes('href="/icon.png'));
check("the conventional SVG favicon embeds Micheon's canonical artwork", favicon.includes('aria-label="Micheon"') && favicon.includes("data:image/png;base64,"));
check("the retired Vite starter icon cannot resurface", !fs.existsSync(path.join(root, "src/assets/vite.svg")) && !favicon.includes("#863bff"));
check("all showcase screenshots are real, full-size PNGs", screenshotPaths.every((relativePath) => {
  const size = pngSize(relativePath);
  return size && size.width >= 1200 && size.height >= 700 && size.bytes > 100_000;
}));

// A pack card opens its lesson through an overlay button at z-0, so anything
// painted over that overlay has to let clicks through or it becomes a dead
// patch that still looks pressable. The arrow on a lesson card did nothing
// at all: the footer strip was capturing every click in it, arrow included,
// and dropping them on the floor.
const learnFooter = (/<div className="[^"]*relative z-10 mt-6 flex items-center justify-between[^"]*"/.exec(learnView) || [""])[0];
check(
  "the pack card's footer strip lets clicks reach the card's own open-lesson target",
  learnFooter.includes("pointer-events-none")
);
check(
  "...while Pause, the one real control in that strip, still takes its own clicks",
  /aria-pressed=\{paused\}\s*\n\s*className="pointer-events-auto/.test(learnView)
);
check(
  "the decorative arrow is hidden from screen readers so the card is announced once",
  /<div aria-hidden="true" className="pointer-events-none flex h-10 w-10[^"]*rounded-full bg-\[#070707\]/.test(learnView)
);

// The lesson-content chip sits ON the Continue learning button, so it
// intercepts the pointer before the button's own :hover can fire, so hovering
// the chip left the Continue learning button flat underneath it and the two
// read as unconnected. The wrapper has to drive the lift for both
// halves, both halves have to follow the press back down, and the chip needs
// the button's transition or it teleports while the button eases there.
const tightStyles = styles.replace(/\s+/g, " ");
const styleHas = (snippet) => tightStyles.includes(snippet.replace(/\s+/g, " ").trim());

// The course-launch chip (.np-course-launch / .np-lesson-content-picker)
// belonged to the CourseHero, replaced by the LanguageCard in v1.2.438;
// its five lift/press rules went in the dead-CSS pass.

const socialPreview = pngSize("docs/micheon-social-preview.png");
check("the GitHub social preview uses the recommended 1280x640 canvas", socialPreview?.width === 1280 && socialPreview?.height === 640);
check("the GitHub social preview stays below GitHub's 1 MB limit", Boolean(socialPreview && socialPreview.bytes < 1_000_000));

if (failures) {
  console.error(`\n${failures} desktop-polish regression${failures === 1 ? "" : "s"}`);
  process.exit(1);
}

console.log("\nDesktop polish and repository showcase are guarded");
