// "Turn the phone sideways."
//
// The console drew a 16:9 picture and everything in this project is fitted into
// that shape, so a phone held upright shows a 1280x720 stage about a third of
// the screen tall with black above and below it. Rather than let that be the
// first impression, a portrait handheld gets our own overlay asking for
// landscape, and it goes away the moment the device is turned.
//
// It is OUR page furniture, in the launcher's visual language (app/styles.css,
// the `.rotate` block next to `.launcher`), and it covers the launcher AND both
// dashboards. Nothing about it reaches inside `.xui-canvas`: the dashboards are
// the console's own art and are never restyled.
//
// WHO SEES IT. Two conditions, both required, and no user-agent string is read:
//
//   1. `matchMedia('(orientation: portrait)')` - the window is taller than wide.
//   2. The device is a HANDHELD: its primary pointer is coarse (or it cannot
//      hover), AND its longest edge is at most MAX_HANDHELD_PX. A desktop
//      window that merely happens to be tall fails the first half; a touch
//      monitor fails the second.
//
// THE LOCK is offered, never depended on. `screen.orientation.lock` exists on
// Android Chrome and (outside full screen) usually rejects; iOS Safari does not
// implement it at all. So the button is a convenience wrapped in try/catch and
// the copy tells the reader what to do without it.

/** The longest edge, in CSS pixels, that still counts as a handheld. An iPad
 *  in portrait is 768x1024 and wants the prompt; a 1440p desktop does not. */
export const MAX_HANDHELD_PX = 1366;

const COPY = {
  eyebrow: 'Landscape',
  head: 'Turn your phone sideways',
  body: 'The Xbox 360 drew a 16 by 9 picture, the shape of a TV. Turn the device and the dashboard fills the screen.',
  lock: 'Rotate to landscape',
  fallback: 'If the screen does not turn, unlock rotation in Control Center or Quick Settings first.',
};

export interface OrientationState {
  portrait: boolean;
  handheld: boolean;
  overlay: boolean;
  canLock: boolean;
}

/** Is this a phone or a tablet, as opposed to a desktop window of any shape? */
export function isHandheld(): boolean {
  if (typeof matchMedia !== 'function') return false;
  const coarse = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
  if (!coarse) return false;
  return Math.max(innerWidth, innerHeight) <= MAX_HANDHELD_PX;
}

export function isPortrait(): boolean {
  if (typeof matchMedia === 'function') return matchMedia('(orientation: portrait)').matches;
  return innerHeight > innerWidth;
}

export interface OrientationWatch {
  /** Re-read the orientation and re-publish it. The app calls this once the
   *  route has built `window.__dash`, which does not exist yet when the watch
   *  is installed. */
  refresh(): void;
  dispose(): void;
}

/**
 * Watch the orientation and cover the page while a handheld is upright.
 *
 * The overlay is BUILT when it is needed and REMOVED when it is not, rather
 * than hidden: a full-window element that is only display:none still costs a
 * paint decision, and the compositor budget (LEARNINGS, "Compositor layers are
 * the budget") is the one thing a phone has less of than a laptop.
 */
export function watchOrientation(host: HTMLElement = document.body): OrientationWatch {
  let el: HTMLElement | null = null;

  const canLock = (): boolean =>
    typeof screen !== 'undefined' && typeof (screen.orientation as { lock?: unknown } | undefined)?.lock === 'function';

  const build = (): HTMLElement => {
    const root = div('rotate');
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-label', COPY.head);

    const card = div('rotate-card');
    const glyph = div('rotate-glyph');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.appendChild(div('rotate-phone'));
    card.appendChild(glyph);
    card.appendChild(text('div', 'rotate-eyebrow', COPY.eyebrow));
    card.appendChild(text('h1', 'rotate-head', COPY.head));
    card.appendChild(div('rotate-rule'));
    card.appendChild(text('p', 'rotate-body', COPY.body));

    if (canLock()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rotate-lock';
      button.textContent = COPY.lock;
      // Inside the gesture, and silent when the platform refuses. Chrome only
      // allows a lock in full screen and Safari has no lock at all, so this is
      // a shortcut for the people it happens to work for and nothing more.
      button.addEventListener('click', () => {
        try {
          const p = (screen.orientation as unknown as { lock(o: string): Promise<void> }).lock('landscape');
          void p?.catch(() => {});
        } catch { /* unsupported or refused: the copy already says what to do */ }
      });
      card.appendChild(button);
      card.appendChild(text('p', 'rotate-note', COPY.fallback));
    }

    root.appendChild(card);
    return root;
  };

  const apply = (): void => {
    const portrait = isPortrait();
    const handheld = isHandheld();
    const want = portrait && handheld;
    if (want && !el) { el = build(); host.appendChild(el); }
    else if (!want && el) { el.remove(); el = null; }
    document.body.dataset['rotate'] = want ? 'true' : 'false';
    const t = (window as { __dash?: { orientation?: OrientationState } }).__dash;
    if (t) t.orientation = { portrait, handheld, overlay: want, canLock: canLock() };
  };

  // Three signals, because no one of them fires everywhere: the media query is
  // the reliable one on a phone, `resize` covers a desktop window being dragged
  // narrow, and visualViewport moves when a mobile browser's toolbar does.
  const mq = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
  mq?.addEventListener('change', apply);
  addEventListener('resize', apply);
  addEventListener('orientationchange', apply);
  visualViewport?.addEventListener('resize', apply);

  apply();

  return {
    refresh: apply,
    dispose: () => {
      mq?.removeEventListener('change', apply);
      removeEventListener('resize', apply);
      removeEventListener('orientationchange', apply);
      visualViewport?.removeEventListener('resize', apply);
      el?.remove();
      el = null;
      delete document.body.dataset['rotate'];
    },
  };
}

function div(className: string): HTMLElement {
  const n = document.createElement('div');
  n.className = className;
  return n;
}

function text(tag: string, className: string, s: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = className;
  n.textContent = s;
  return n;
}
