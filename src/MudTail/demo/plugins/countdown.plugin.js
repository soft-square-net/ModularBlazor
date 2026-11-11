// A sample MudTail plugin: a kick-off countdown for match pages and live coverage.
//
// It imports nothing: MudTail hands it the API (ctx.mudtail) and GSAP (ctx.gsap). So the same file works when a
// bundler imports it (use(countdown)) and when a page or Blazor loads it at runtime (loadPlugin('./countdown.plugin.js')).
//
//   Component (vanilla JS):  createComponent('countdown', host, { to: '2026-11-12T19:45:00Z', label: 'Kick-off' }, onEvent)
//   Component (Blazor):      mud.InvokeAsync<IJSObjectReference>("create", "countdown", host, options, dotNetRef)
//   Behaviour (any markup):  <div data-mud="countdown" data-to="2026-11-12T19:45:00Z">
//                              <span data-unit="days"></span> <span data-unit="hours"></span> …
//                            </div>
//   API:                     getPlugin('countdown').remaining(to), .pauseAll(), .resumeAll()
//   Events:                  tick ({ days, hours, minutes, seconds, total }) once a second, done when it reaches zero

const UNITS = ['days', 'hours', 'minutes', 'seconds'];
const LABELS = { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' };

/**
 * Milliseconds until the target, split into units. With `shown` (the units on screen), a hidden larger unit is folded into
 * the largest one shown, so 26 hours without a days cell reads 26:00:00, not 02:00:00.
 */
function split(ms, shown = UNITS) {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  const parts = { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, total };
  const size = { days: 86400, hours: 3600, minutes: 60, seconds: 1 };
  const top = UNITS.find((u) => shown.includes(u));
  if (top) for (const u of UNITS.slice(0, UNITS.indexOf(top))) { parts[top] += parts[u] * (size[u] / size[top]); parts[u] = 0; }
  return parts;
}

function toTime(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`countdown: "${value}" is not a date`);
  return time;
}

const STYLES = `
.mud-countdown { display: inline-flex; flex-direction: column; gap: .5rem; font-variant-numeric: tabular-nums; }
.mud-countdown__label { display: inline-flex; align-items: center; gap: .375rem; font-size: .75rem; font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase; color: var(--mud-countdown-accent); }
.mud-countdown__cells { display: flex; gap: var(--mud-countdown-gap); }
.mud-countdown__cell { display: flex; flex-direction: column; align-items: center; min-inline-size: 3.75rem; padding: .5rem .625rem;
  border-radius: var(--mud-default-borderradius); background: var(--mud-countdown-digit-bg); color: var(--mud-countdown-digit-fg);
  box-shadow: inset 0 -2px 0 rgb(0 0 0 / .18); }
.mud-countdown__value { display: block; font-size: 1.75rem; font-weight: 700; line-height: 1.1; }
.mud-countdown__unit { font-size: .6875rem; opacity: .75; }
.mud-countdown[data-state="done"] .mud-countdown__cells { opacity: .45; }
.mud-countdown[data-size="sm"] .mud-countdown__cell { min-inline-size: 2.75rem; padding: .25rem .375rem; }
.mud-countdown[data-size="sm"] .mud-countdown__value { font-size: 1.125rem; }
/* The behaviour version: markup rendered by the server or Blazor, values shown through an attribute it owns. */
[data-mud~="countdown"] [data-unit]::before { content: attr(data-value); }
`;

export default {
  name: 'countdown',
  version: '1.0.0',
  description: 'Kick-off countdown: a component, a data-mud behaviour and an API.',
  requires: { mudtail: '^0.1.0' },

  // --mud-countdown-* on :root (light) and for the dark theme. Colour tokens also become Tailwind colours
  // (bg-countdown-digit-bg, text-countdown-accent, …) through pluginTailwindCss / mudtail-plugin-css.
  tokens: {
    'countdown-digit-bg': { light: '#1f2937', dark: '#e5e7eb' },
    'countdown-digit-fg': { light: '#f9fafb', dark: '#111827' },
    'countdown-accent': 'var(--mud-palette-primary)',
    'countdown-gap': { value: '.375rem', tailwind: 'spacing' },
  },
  styles: STYLES,
  icons: { stopwatch: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2"/><path d="M10 2h4"/><path d="m19 5 1.5 1.5"/>' },
  messages: {
    ar: {
      'countdown.days': 'أيام', 'countdown.hours': 'ساعات', 'countdown.minutes': 'دقائق', 'countdown.seconds': 'ثوانٍ',
      'countdown.kickoff': 'ضربة البداية', 'countdown.live': 'مباشر الآن', 'countdown.label': '{label}: بعد {time}',
    },
  },

  setup(ctx, options) {
    const { mudtail, gsap } = ctx;
    const instances = new Set();
    let paused = false;
    const animate = options.animate !== false && !mudtail.prefersReducedMotion();
    const unitLabel = (unit) => ctx.t(`countdown.${unit}`, {}, LABELS[unit]);
    const digits = (n) => mudtail.formatNumber(n, { minimumIntegerDigits: 2, useGrouping: false }); // follows the numerals setting

    // One clock for every countdown on the page.
    let timer = null;
    const tickAll = () => { if (!paused) for (const i of instances) i.tick(); };
    const ensureClock = () => {
      if (!timer && instances.size) timer = setInterval(tickAll, 1000);
      if (timer && !instances.size) { clearInterval(timer); timer = null; }
    };
    ctx.track(() => { clearInterval(timer); timer = null; });

    function register(instance) {
      instances.add(instance);
      ensureClock();
      return () => { instances.delete(instance); ensureClock(); };
    }

    // ── the component: builds its own markup inside host (a Blazor host is rendered empty) ──
    ctx.component('countdown', (host, opts, emit) => {
      let target = toTime(opts.to);
      let done = false;
      const root = document.createElement('div');
      root.className = 'mud-countdown';
      if (opts.size) root.dataset.size = opts.size;
      root.setAttribute('role', 'timer');
      const head = document.createElement('div');
      head.className = 'mud-countdown__label';
      const cells = document.createElement('div');
      cells.className = 'mud-countdown__cells';
      const values = {};
      const units = opts.units ?? UNITS;
      for (const unit of units) {
        const cell = document.createElement('div');
        cell.className = 'mud-countdown__cell';
        cell.innerHTML = '<span class="mud-countdown__value"></span><span class="mud-countdown__unit"></span>';
        values[unit] = { value: cell.firstElementChild, label: cell.lastElementChild, last: null };
        cells.appendChild(cell);
      }
      root.append(head, cells);
      host?.appendChild(root);

      const labels = () => {
        head.innerHTML = `${mudtail.getIconSvg('stopwatch', 14)}<span>${escapeHtml(opts.label ?? ctx.t('countdown.kickoff', {}, 'Kick-off'))}</span>`;
        for (const unit of units) values[unit].label.textContent = unitLabel(unit);
      };

      const render = (force = false) => {
        const parts = split(target - Date.now(), units);
        for (const unit of units) {
          const slot = values[unit];
          if (!force && slot.last === parts[unit]) continue;
          slot.last = parts[unit];
          slot.value.textContent = digits(parts[unit]);
          if (animate && !force) gsap.fromTo(slot.value, { yPercent: -35, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
        }
        root.setAttribute('aria-label', ctx.t('countdown.label', { label: opts.label ?? ctx.t('countdown.kickoff', {}, 'Kick-off'), time: units.map((u) => `${parts[u]} ${unitLabel(u)}`).join(' ') }, '{label}: in {time}'));
        return parts;
      };

      const instance = {
        tick() {
          const parts = render();
          emit('tick', parts);
          if (parts.total === 0 && !done) {
            done = true;
            root.dataset.state = 'done';
            head.lastElementChild.textContent = ctx.t('countdown.live', {}, 'Live now');
            if (animate) gsap.fromTo(head, { scale: 1.15 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
            emit('done', null);
          }
        },
      };
      labels();
      render(true);
      const unregister = register(instance);
      const offLocale = ctx.on('locale', () => { labels(); render(true); });

      return {
        /** A new target date (ISO string, Date or timestamp). */
        setTarget(to) { target = toTime(to); done = false; delete root.dataset.state; labels(); render(true); },
        /** { days, hours, minutes, seconds, total } until the target. */
        remaining: () => split(target - Date.now(), units),
        getElement: () => root,
        dispose() { unregister(); offLocale(); gsap.killTweensOf([head, ...Object.values(values).map((v) => v.value)]); root.remove(); },
      };
    });

    // ── the behaviour: the markup is the server's or Blazor's; it only sets data-value attributes ──
    ctx.behavior('countdown', (el) => {
      const slots = UNITS.map((unit) => [unit, el.querySelector(`[data-unit="${unit}"]`)]).filter(([, node]) => node);
      if (!el.dataset.to || !slots.length) return null;
      const target = toTime(el.dataset.to);
      const instance = {
        tick() {
          const parts = split(target - Date.now(), slots.map(([u]) => u));
          for (const [unit, node] of slots) node.setAttribute('data-value', digits(parts[unit]));
          el.toggleAttribute('data-done', parts.total === 0);
        },
      };
      instance.tick();
      const unregister = register(instance);
      const offLocale = ctx.on('locale', () => instance.tick());
      return { dispose() { unregister(); offLocale(); } };
    });

    // ── the API: getPlugin('countdown') in JS; mud.InvokeAsync<IJSObjectReference>("plugin", "countdown") in C# ──
    return {
      remaining: (to) => split(toTime(to) - Date.now()),
      format: (to) => { const p = split(toTime(to) - Date.now()); return UNITS.map((u) => `${digits(p[u])} ${unitLabel(u)}`).join(' '); },
      pauseAll() { paused = true; },
      resumeAll() { paused = false; tickAll(); },
      count: () => instances.size,
    };
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
