// The launcher: what a bare `/` shows.
//
// It is OUR page, not a dashboard's. Nothing here is a XUR scene, no skin
// visual is worn, and no timeline runs: a Blades page re-labelled into a
// chooser is a Blades page, and this is the one screen in the project that
// Microsoft never drew. What it borrows is the console's MATERIALS, and every
// one of them resolves through the extracted manifest so a smoke check can
// name where it came from:
//
//   the Xbox 360 logo   dashcomm/xboxLogo.png     the focal point
//   the A legend orb    shrdres/A-Button.png      the commit affordance; the
//                       console draws exactly this, a 32x32 orb with the
//                       letter A in near-black over it and the label to its
//                       left (dashuisk/skin.xur, visual legend_A: Button1 is
//                       the orb, XuiText1 is the "A" at TextColor 15,15,15,
//                       XuiTextPresenter1 is the label at 235,235,235)
//   the accent green    #8CC43B, a palette entry OF xboxLogo.png
//   the face            ConvectionUI, decoded from the console's own
//                       xenonclatin.xtt (app/styles.css @font-face)
//   the cues            shrdres/btn_Focus and shrdres/btn_Select, through the
//                       runtime's AudioBank, which indexes them out of the
//                       same manifest
//
// Everything else is plain CSS in app/styles.css, under `.launcher`.
//
// The page is authored in the console's OUTPUT space, 1280x720, so there is no
// canvas -> framebuffer transform for it to apply: the console's view mapping
// exists to put a 1120x770 Blades canvas on a 720p frame, and this page has no
// design canvas behind it. What the runtime's Viewport still does, and the
// reason it is here rather than a `width: 100vw`, is the SECOND transform: the
// 1280x720 output is fitted uniformly into whatever window it is opened in.
//
// Choosing navigates to `/?build=<id>`. That URL is the whole contract: the
// dashboards never know the launcher exists.
import {
  AssetIndex, Viewport, AudioBank, FRAMEBUFFER, FONT_FAMILY,
  createTelemetry, emptyReport, publish, startFpsMeter,
  InputRouter, Button, setActiveBuild,
} from '@runtime/index';
import { BUILDS, type BuildId } from '@runtime/build';

/** The console's output, and this page's design size. */
const OUTPUT = { w: FRAMEBUFFER.width, h: FRAMEBUFFER.height };

/** Art, as "<pack>/<path>" into the manifest. Nothing is drawn by hand. */
const ART = {
  logo: { pack: 'dashcomm', path: 'xboxLogo.png' },
  aButton: { pack: 'shrdres', path: 'A-Button.png' },
} as const;

/** The two cues the console plays for a chooser: move, and commit. */
const CUE = { focus: 'btn_Focus', select: 'btn_Select' } as const;

/** Frames, on the console's 60 Hz clock, so ?manual + stepFrames() reproduces
 *  every timing exactly. The intro is how long the page takes to settle; the
 *  commit delay is how long the chosen card holds its flash before the URL
 *  changes. */
const INTRO_FRAMES = 30;
const COMMIT_FRAMES = 18;

interface Choice {
  build: BuildId;
  /** The name, big. */
  name: string;
  /** The build number, small, above the name. */
  label: string;
  /** Two short concrete sentences. */
  blurb: string;
}

/** The copy. Ours, and the only words on the page. */
const CHOICES: readonly Choice[] = [
  {
    build: '6770', name: 'Blades', label: 'Build 6770',
    blurb: 'The dashboard the Xbox 360 launched with. Five blades you slide between, in its last 2008 release.',
  },
  {
    build: '9199', name: 'NXE', label: 'Build 9199',
    blurb: 'The New Xbox Experience, November 2008. Channels, panels and a queue replace the blades.',
  },
];
const TAGLINE = "Two Xbox 360 dashboards, running from the console's own files.";
const HINT = 'Left and Right choose';
const COMMIT_LABEL = 'Start';

/** What the smoke suite drives and reads. */
export interface LauncherApi {
  input: InputRouter;
  audio: AudioBank;
  /** One press, as the pad would send it. */
  press(button: string): boolean;
  /** Advance the launcher's own 60 Hz clock by hand. */
  stepFrames(n: number): void;
  state(): LauncherState;
}
export interface LauncherState {
  /** 'intro' until the page has settled, then 'ready', then 'going'. */
  phase: 'intro' | 'ready' | 'going';
  /** The cards take input. */
  armed: boolean;
  index: number;
  focusId: string | null;
  /** The build a press committed to, before the page leaves. */
  going: BuildId | null;
  frame: number;
  choices: { id: string; build: BuildId; name: string; label: string; blurb: string; focused: boolean }[];
  /** Every image on the page, with the manifest entry its URL came from. */
  art: Record<keyof typeof ART, { src: string; manifest: string | null }>;
  /** The two cue names, and whether the bank actually holds each .ogg. */
  cues: { focus: string; select: string; haveFocus: boolean; haveSelect: boolean };
}
declare global { interface Window { __launcher?: LauncherApi } }

export async function launcher(host: HTMLElement, onDispose: (fn: () => void) => void, params: URLSearchParams): Promise<void> {
  // The launcher belongs to neither build; its materials come out of the 6770
  // dump, which is the one both builds' packs are extracted alongside.
  setActiveBuild('6770');
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
  const assets = await AssetIndex.load(base, '6770');
  const t = createTelemetry(assets.build);
  onDispose(startFpsMeter(t));
  await loadFont(assets.base + 'assets/6770/fonts/', t.placeholders);

  const report = emptyReport('launcher');
  report.canvas = { w: OUTPUT.w, h: OUTPUT.h };

  /* ------------------------------------------------------------- the frame */

  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const viewport = new Viewport(viewportHost, { consoleView: false, canvas: OUTPUT });

  /* --------------------------------------------------------------- the page */

  /** An <img> whose src came out of the manifest, or a recorded miss. */
  const image = (key: keyof typeof ART, className: string, alt: string): HTMLImageElement => {
    const { pack, path } = ART[key];
    const url = assets.url(pack, path);
    if (!url) report.missingImages.push(`${pack}/${path}`);
    const img = document.createElement('img');
    img.className = className;
    img.src = url ?? '';
    img.alt = alt;
    img.draggable = false;
    return img;
  };

  const page = el('div', 'launcher');
  page.dataset['phase'] = 'intro';
  page.dataset['index'] = '0';

  page.appendChild(el('div', 'launcher-glow'));

  const head = el('div', 'launcher-head');
  head.appendChild(el('div', 'launcher-halo'));
  const logo = image('logo', 'launcher-logo', 'Xbox 360');
  head.appendChild(logo);
  head.appendChild(text('p', 'launcher-tagline', TAGLINE));
  page.appendChild(head);

  const deck = el('div', 'launcher-cards');
  deck.setAttribute('role', 'listbox');
  deck.setAttribute('aria-label', 'Dashboard');
  const cards = CHOICES.map((c) => {
    const card = el('div', 'launcher-card');
    card.id = `build-${c.build}`;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', 'false');
    card.dataset['build'] = c.build;
    card.dataset['focused'] = 'false';
    card.appendChild(text('div', 'launcher-build', c.label));
    card.appendChild(text('div', 'launcher-name', c.name));
    card.appendChild(el('div', 'launcher-rule'));
    card.appendChild(text('p', 'launcher-blurb', c.blurb));
    deck.appendChild(card);
    return { id: card.id, choice: c, el: card };
  });
  page.appendChild(deck);

  const legend = el('div', 'launcher-legend');
  legend.appendChild(text('span', 'launcher-hint', HINT));
  const commit = el('span', 'launcher-a');
  const orb = el('span', 'launcher-orb');
  const orbArt = image('aButton', 'launcher-orb-art', '');
  orb.appendChild(orbArt);
  orb.appendChild(text('span', 'launcher-orb-key', 'A'));
  commit.appendChild(orb);
  commit.appendChild(text('span', 'launcher-a-label', COMMIT_LABEL));
  legend.appendChild(commit);
  page.appendChild(legend);

  viewport.mount(page);
  publish(t, report);

  /* ----------------------------------------------------------- the machine */

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  for (const cue of [CUE.focus, CUE.select]) {
    if (!audio.has(cue)) t.placeholders.push(`cue ${cue}: no .ogg in the manifest's audio entries`);
  }

  let phase: LauncherState['phase'] = 'intro';
  let index = 0;
  let going: BuildId | null = null;
  let frame = 0;
  /** The frame the chosen card's flash ends on, or -1. */
  let commitAt = -1;
  let left = false;

  const setPhase = (p: LauncherState['phase']) => {
    phase = p;
    page.dataset['phase'] = p;
    host.dataset['launcher'] = p;
  };

  const paint = () => {
    page.dataset['index'] = String(index);
    for (const [i, card] of cards.entries()) {
      const on = i === index && phase !== 'intro';
      card.el.dataset['focused'] = on ? 'true' : 'false';
      card.el.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    sync();
  };

  /** Move focus. Silent on arrival, btn_Focus on every move after it. */
  const select = (next: number, silent = false) => {
    if (phase !== 'ready') return;
    const to = (next + cards.length) % cards.length;
    if (to === index && !silent) return;
    index = to;
    if (!silent) audio.play(CUE.focus, null, frame);
    paint();
  };

  const press = (): boolean => {
    if (phase !== 'ready') return false;
    going = cards[index]!.choice.build;
    audio.play(CUE.select, null, frame);
    setPhase('going');
    commitAt = frame + COMMIT_FRAMES;
    paint();
    return true;
  };

  const go = (id: BuildId) => {
    if (left) return;
    left = true;
    const url = new URL(location.href);
    url.search = `?build=${id}`;
    location.assign(url.toString());
  };

  const arm = () => {
    if (phase !== 'intro') return;
    setPhase('ready');
    select(index, true);
  };

  /** One frame of the launcher's own clock. Everything timed is timed here,
   *  never on wall time, so ?manual + stepFrames() reproduces it exactly. */
  const step = () => {
    frame++;
    if (phase === 'intro' && frame >= INTRO_FRAMES) arm();
    if (commitAt >= 0 && frame >= commitAt && going) { commitAt = -1; go(going); }
  };

  /* ------------------------------------------------------------- the input */

  for (const [i, card] of cards.entries()) {
    card.el.addEventListener('click', () => { select(i); press(); });
    card.el.addEventListener('pointerenter', () => select(i));
  }

  const router = new InputRouter();
  router.push({
    id: 'launcher',
    onButton: (b) => {
      if (b === Button.Left || b === Button.Up) select(index - 1);
      else if (b === Button.Right || b === Button.Down) select(index + 1);
      else if (b === Button.A || b === Button.Start) press();
    },
  });
  router.attach();

  // Coming BACK to the launcher from a dashboard.
  //
  // `go()` leaves the page with `location.assign`, and the browser may keep
  // this document alive in its back/forward cache: pressing Back then restores
  // it with every variable exactly as it was left, which means `phase` is
  // still 'going' and `left` is still true, so `select()` and `press()` both
  // refuse and the launcher sits frozen on the card that was chosen. (A page
  // that is NOT cached re-executes the module and arrives clean, which is why
  // this only bites some browsers - Tag hit it in Chrome, 2026-09-03.) A
  // restore fires `pageshow` with `persisted` true, and it is the only signal
  // that says "this document is being shown again"; take it as the arrival it
  // is and put the launcher back in its ready state.
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    left = false;
    going = null;
    commitAt = -1;
    setPhase('ready');
    select(index, true);
  };
  addEventListener('pageshow', onPageShow);
  onDispose(() => removeEventListener('pageshow', onPageShow));

  /* -------------------------------------------------------------- the start */

  // ?boot=none skips the intro: the page arrives settled and armed on frame 0,
  // which is what a suite that does not want to step 30 frames asks for.
  setPhase('intro');
  if (params.get('boot') === 'none') {
    page.classList.add('launcher-noboot');
    arm();
  } else {
    // The CSS transition that runs the intro starts on the next paint, so the
    // opening state gets a frame of its own to be rendered from.
    requestAnimationFrame(() => { if (phase === 'intro') page.dataset['phase'] = 'entering'; });
  }
  paint();

  let raf = 0;
  if (!params.has('manual')) {
    let last = performance.now();
    let carry = 0;
    const loop = (now: number) => {
      carry += (now - last) * 60 / 1000;
      last = now;
      // Whole frames only, and never a spiral of death after a stalled tab.
      for (let i = 0; i < Math.min(Math.floor(carry), 8); i++) step();
      carry -= Math.floor(carry);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function sync(): void {
    t.focusId = phase === 'intro' ? null : cards[index]!.id;
    t.input = router.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer }));
    t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
    t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
  }
  sync();

  const api: LauncherApi = {
    input: router, audio,
    press: (b) => { const ok = router.press(b as Button); sync(); return ok; },
    stepFrames: (n) => { for (let i = 0; i < n; i++) step(); sync(); },
    state: () => ({
      phase, armed: phase !== 'intro', index, going, frame,
      focusId: phase === 'intro' ? null : cards[index]!.id,
      choices: cards.map((c, i) => ({
        id: c.id, build: c.choice.build, name: c.choice.name,
        label: c.choice.label, blurb: c.choice.blurb,
        focused: c.el.dataset['focused'] === 'true' && i === index,
      })),
      art: {
        logo: { src: logo.src, manifest: manifestPathOf(assets, logo.src) },
        aButton: { src: orbArt.src, manifest: manifestPathOf(assets, orbArt.src) },
      },
      cues: { focus: CUE.focus, select: CUE.select, haveFocus: audio.has(CUE.focus), haveSelect: audio.has(CUE.select) },
    }),
  };
  window.__launcher = api;

  onDispose(() => {
    cancelAnimationFrame(raf);
    router.detach();
    audio.close();
    viewport.dispose();
    delete window.__launcher;
    delete host.dataset['launcher'];
  });
}

/* ------------------------------------------------------------------ helpers */

function el(tag: string, className: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = className;
  return n;
}

function text(tag: string, className: string, s: string): HTMLElement {
  const n = el(tag, className);
  n.textContent = s;
  return n;
}

/** "<pack>/<path>" of the manifest entry a served URL came from, or null. */
function manifestPathOf(assets: AssetIndex, url: string): string | null {
  const prefix = new URL(assets.base + 'assets/', location.href).toString();
  if (!url.startsWith(prefix)) return null;
  const out = url.slice(prefix.length);
  for (const pack of assets.manifest.packs) {
    for (const e of pack.entries) if (e.out === out) return `${pack.name}/${e.path}`;
  }
  return null;
}

/** The console face is extracted from the ROM, so a miss is a real placeholder. */
async function loadFont(fontDir: string, placeholders: string[]): Promise<void> {
  try {
    await document.fonts.load(`16px ${FONT_FAMILY}`);
    await document.fonts.ready;
    if (!document.fonts.check(`16px ${FONT_FAMILY}`)) {
      placeholders.push(`font ${FONT_FAMILY}: ConvectionUI.ttf is not in ${fontDir}, falling back to a system sans`);
    }
  } catch {
    placeholders.push(`font ${FONT_FAMILY}: could not be checked`);
  }
}

// The builds table is what the cards are made from; anything not in it is not
// offered, and anything in it must have a card.
if (CHOICES.length !== BUILDS.length || !BUILDS.every((b) => CHOICES.some((c) => c.build === b))) {
  throw new Error(`launcher: CHOICES do not match BUILDS (${BUILDS.join(', ')})`);
}
