// The launcher: what a bare `/` shows. One card per dashboard, chosen with the
// pad or the keyboard the way the console's own menus are (Left/Right, A) or a
// click, and then the page navigates to `/?build=<id>`, which is the whole
// contract: the dashboards themselves never know the launcher exists.
import { BUILDS, BUILD_PROFILES, type BuildId } from '@runtime/build';
import { Button, InputRouter } from '@runtime/input/InputMap';

/** What each card says. */
const BLURB: Record<BuildId, { name: string; line: string }> = {
  '6770': { name: 'Blades', line: 'The launch dashboard: five blades, Xbox LIVE in the middle.' },
  '9199': { name: 'NXE', line: 'The New Xbox Experience: channels, panels, a queue.' },
};

export function launcher(host: HTMLElement, onDispose: (fn: () => void) => void): void {
  const root = document.createElement('div');
  root.className = 'launcher';
  root.innerHTML = `
    <div class="launcher-head">
      <div class="launcher-title">360dashboards</div>
      <div class="launcher-sub">Pick a dashboard. Left and Right to choose, A or Enter to start.</div>
    </div>
    <div class="launcher-cards" role="listbox" aria-label="Dashboards"></div>
    <div class="launcher-foot">Keyboard: arrows move, Enter is A, Escape is B, Q and E are the bumpers. A controller works too.</div>`;
  const cards = root.querySelector('.launcher-cards')!;
  const buttons: HTMLButtonElement[] = [];
  for (const id of BUILDS) {
    const b = BLURB[id];
    const p = BUILD_PROFILES[id];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'launcher-card';
    el.setAttribute('role', 'option');
    el.dataset['build'] = id;
    el.innerHTML = `
      <div class="launcher-card-name">${b.name}</div>
      <div class="launcher-card-build">${p.label}</div>
      <div class="launcher-card-line">${b.line}</div>
      <div class="launcher-card-meta">Build ${p.id}, ${p.canvas.width}x${p.canvas.height} canvas</div>`;
    el.addEventListener('click', () => go(id));
    el.addEventListener('focus', () => select(buttons.indexOf(el)));
    cards.appendChild(el);
    buttons.push(el);
  }
  host.appendChild(root);

  let ix = 0;
  const select = (i: number) => {
    ix = (i + buttons.length) % buttons.length;
    buttons.forEach((c, k) => {
      c.classList.toggle('is-selected', k === ix);
      c.setAttribute('aria-selected', k === ix ? 'true' : 'false');
    });
  };
  const go = (id: BuildId) => {
    const url = new URL(location.href);
    url.search = `?build=${id}`;
    location.assign(url.toString());
  };
  select(0);
  buttons[0]?.focus({ preventScroll: true });

  const router = new InputRouter();
  router.push({
    id: 'launcher',
    onButton: (b) => {
      if (b === Button.Left || b === Button.Up || b === Button.LB) select(ix - 1);
      else if (b === Button.Right || b === Button.Down || b === Button.RB) select(ix + 1);
      else if (b === Button.A || b === Button.Start) go(BUILDS[ix]!);
    },
  });
  router.attach();
  onDispose(() => { router.detach(); root.remove(); });
}
