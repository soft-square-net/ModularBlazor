// Components ▸ Plugins ▸ Countdown: the sample plugin's component, behaviour and API, documented like a component.
import { use, hasPlugin, getPlugin, createComponent, createMudButton, t, formatDate } from 'mudtail';
import countdown from '../../plugins/countdown.plugin.js';
import { componentPage, esc } from './page.js';

const ensure = () => { if (!hasPlugin('countdown')) use(countdown); };

/** An ISO date `ms` from now, rounded up to the minute when it is far enough away to read well. */
const fromNow = (ms) => {
  const time = Date.now() + ms;
  return new Date(ms > 120_000 ? Math.ceil(time / 60_000) * 60_000 : time).toISOString();
};

const log = (text) => {
  const p = document.createElement('p');
  p.className = 'cp-tree-log';
  p.setAttribute('role', 'status');
  p.textContent = text;
  return p;
};

/** The full countdown with an event log. */
function mountMatch(el) {
  ensure();
  const host = document.createElement('div');
  const status = log(t('demo.cd.waiting', {}, 'Events appear here.'));
  let ticks = 0;
  const handle = createComponent('countdown', host, { to: fromNow(2 * 86400_000 + 5 * 3600_000), label: t('Northbridge v Harbour City') }, {
    tick: (parts) => { ticks += 1; status.textContent = t('demo.cd.tick', { count: ticks, total: Math.round(parts.total / 1000) }, 'tick #{count}: {total} seconds to go'); },
    done: () => { status.textContent = t('demo.cd.doneEvent', {}, 'done: the match is live.'); },
  });
  el.append(host, status);
  return () => handle.dispose();
}

/** Compact countdowns in a fixtures list. */
function mountFixtures(el) {
  ensure();
  const fixtures = [
    ['Ridgeway v Old Town', 3.5],
    ['Coastal United v Northbridge', 7.25],
    ['Harbour City v Ridgeway', 26],
  ];
  const list = document.createElement('div');
  list.className = 'flex flex-col gap-3';
  const handles = fixtures.map(([teams, hours]) => {
    const to = fromNow(hours * 3600_000);
    const row = document.createElement('div');
    row.className = 'flex flex-wrap items-center justify-between gap-3 rounded-mud border border-line px-4 py-2';
    row.innerHTML = `<div><div class="font-semibold">${esc(t(teams))}</div><div class="text-xs text-ink-muted">${esc(formatDate(to, { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</div></div>`;
    const host = document.createElement('div');
    row.appendChild(host);
    list.appendChild(row);
    return createComponent('countdown', host, { to, size: 'sm', units: ['hours', 'minutes', 'seconds'], label: t('demo.cd.kickoffIn', {}, 'Kick-off in') });
  });
  el.appendChild(list);
  return () => handles.forEach((h) => h.dispose());
}

/** setTarget(): move the kick-off; a near target reaches zero and raises done. */
function mountTarget(el) {
  ensure();
  const host = document.createElement('div');
  const status = log(t('demo.cd.targetHint', {}, 'Move the kick-off, or set it 10 seconds away and watch it go live.'));
  let target = Date.now() + 3600_000;
  const handle = createComponent('countdown', host, { to: new Date(target).toISOString(), units: ['hours', 'minutes', 'seconds'], label: t('demo.cd.delayed', {}, 'Delayed kick-off') }, {
    done: () => { status.textContent = t('demo.cd.doneEvent', {}, 'done: the match is live.'); },
  });
  const set = (time) => { target = time; handle.setTarget(new Date(target).toISOString()); status.textContent = t('demo.cd.moved', { time: formatDate(target, { timeStyle: 'medium' }) }, 'setTarget({time})'); };
  const bar = document.createElement('div');
  bar.className = 'cp-row';
  bar.append(
    createMudButton({ variant: 'outlined', size: 'small', text: t('demo.cd.plus15', {}, '+15 minutes'), onClick: () => set(Math.max(target, Date.now()) + 15 * 60_000) }),
    createMudButton({ variant: 'outlined', size: 'small', text: t('demo.cd.in10', {}, 'In 10 seconds'), onClick: () => set(Date.now() + 10_000) }),
    createMudButton({ variant: 'text', size: 'small', text: t('demo.cd.remaining', {}, 'remaining()'), onClick: () => { status.textContent = JSON.stringify(handle.remaining()); } }),
  );
  el.append(bar, host, status);
  return () => handle.dispose();
}

/** The behaviour on a match card rendered elsewhere. */
function mountCard(el) {
  ensure();
  const to = fromNow(5 * 3600_000 + 40 * 60_000);
  el.innerHTML = `
    <article class="max-w-sm overflow-hidden rounded-mud border border-line bg-surface">
      <div class="bg-countdown-digit-bg px-4 py-3 text-countdown-digit-fg">
        <div class="text-xs font-semibold uppercase tracking-wider text-countdown-accent">${esc(t('Cup'))}</div>
        <div class="text-lg font-bold">${esc(t('Coastal United v Northbridge'))}</div>
      </div>
      <div data-mud="countdown" data-to="${esc(to)}" class="flex items-baseline justify-center gap-1 px-4 py-4 text-3xl font-bold tabular-nums">
        <span data-unit="hours"></span><span class="text-ink-muted">:</span><span data-unit="minutes"></span><span class="text-ink-muted">:</span><span data-unit="seconds"></span>
      </div>
    </article>`;
}

/** The plugin's API: one clock for every countdown, paused and resumed together. */
function mountApi(el) {
  ensure();
  const status = log('');
  const show = () => {
    const api = getPlugin('countdown');
    status.textContent = `count() → ${api.count()} · format(…) → ${api.format(fromNow(90 * 60_000))}`;
  };
  const bar = document.createElement('div');
  bar.className = 'cp-row';
  bar.append(
    createMudButton({ variant: 'outlined', size: 'small', text: t('demo.cd.pause', {}, 'pauseAll()'), onClick: () => { getPlugin('countdown').pauseAll(); show(); } }),
    createMudButton({ variant: 'outlined', size: 'small', text: t('demo.cd.resume', {}, 'resumeAll()'), onClick: () => { getPlugin('countdown').resumeAll(); show(); } }),
  );
  el.append(bar, status);
  show();
}

export const COUNTDOWN_PAGE = {
  id: 'countdown', label: 'Countdown', icon: 'timer',
  render: () => componentPage({
    title: 'Countdown', trail: ['Components', 'Plugins'], kinds: ['Plugin', 'JS', 'Behaviour', 'Blazor'],
    lead: 'A kick-off countdown from the sample <code>countdown</code> plugin (<code>demo/plugins/countdown.plugin.js</code>): a component, a <code>data-mud</code> behaviour and an API. Digits follow the language and the numerals setting, and change with a short GSAP animation (none with reduced motion).',
    examples: [
      {
        title: 'Match header',
        description: 'Days, hours, minutes and seconds. <code>tick</code> fires every second with the time left, <code>done</code> once when it reaches zero.',
        code: `
          import { use, createComponent } from 'mudtail';
          import countdown from './plugins/countdown.plugin.js';

          use(countdown);
          const match = createComponent('countdown', host, { to: '2026-11-12T19:45:00Z', label: 'Northbridge v Harbour City' }, {
            tick: (parts) => …,          // { days, hours, minutes, seconds, total }
            done: () => …,
          });
          match.dispose();`,
        mount: mountMatch,
      },
      {
        title: 'Compact, in a fixtures list',
        description: '<code>size: \'sm\'</code> and the <code>units</code> to show. Every countdown on the page shares one clock.',
        code: `
          createComponent('countdown', host, { to, size: 'sm', units: ['hours', 'minutes', 'seconds'], label: 'Kick-off in' });`,
        mount: mountFixtures,
      },
      {
        title: 'Moving the kick-off',
        description: '<code>setTarget(date)</code> restarts it; <code>remaining()</code> returns the time left.',
        code: `
          match.setTarget('2026-11-12T20:00:00Z');
          match.remaining();   // { days, hours, minutes, seconds, total }`,
        mount: mountTarget,
      },
      {
        title: 'Behaviour on a rendered match card',
        description: 'Markup from the server or Blazor: the behaviour only sets <code>data-value</code> on the <code>[data-unit]</code> spans, and CSS shows it. The card uses Tailwind utilities made from the plugin\'s tokens.',
        html: `
          <article class="rounded-mud border border-line bg-surface">
            <div class="bg-countdown-digit-bg text-countdown-digit-fg …">Coastal United v Northbridge</div>
            <div data-mud="countdown" data-to="2026-11-12T19:45:00Z" class="… tabular-nums">
              <span data-unit="hours"></span>:<span data-unit="minutes"></span>:<span data-unit="seconds"></span>
            </div>
          </article>`,
        mount: mountCard,
      },
      {
        title: 'The plugin\'s API',
        description: '<code>getPlugin(\'countdown\')</code> returns what the plugin\'s <code>setup()</code> returned.',
        code: `
          const api = getPlugin('countdown');
          api.pauseAll(); api.resumeAll();
          api.count();                       // live countdowns
          api.format('2026-11-12T19:45:00Z'); // "00 Days 01 Hours 30 Minutes 00 Seconds"`,
        mount: mountApi,
      },
      {
        title: 'Blazor',
        description: 'Load the plugin once, then use it like a built-in component.',
        language: 'Razor / C#',
        code: `
          <div @ref="host"></div>

          @code {
              ElementReference host;
              IJSObjectReference? countdown;

              protected override async Task OnAfterRenderAsync(bool firstRender)
              {
                  if (!firstRender) return;
                  var mud = await JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default");
                  await mud.InvokeAsync<JsonElement>("loadPlugin", "./_content/MyCompany.Plugins/countdown.plugin.js");
                  countdown = await mud.InvokeAsync<IJSObjectReference>("create", "countdown", host,
                      new { to = Match.KickOff, label = Match.Title, size = "sm" }, DotNetObjectReference.Create(this));
              }

              [JSInvokable] public Task OnMudEvent(string name, JsonElement payload)
                  => name == "done" ? InvokeAsync(() => { IsLive = true; StateHasChanged(); }) : Task.CompletedTask;

              public async ValueTask DisposeAsync() { if (countdown is not null) await countdown.InvokeVoidAsync("dispose"); }
          }`,
      },
    ],
    api: [
      { title: 'Options', rows: [
        ['to', 'The target: an ISO date, a <code>Date</code> or a timestamp.'],
        ['label', 'The text above the digits (default: <em>Kick-off</em>, translated).'],
        ['units', 'Which of <code>days</code>, <code>hours</code>, <code>minutes</code>, <code>seconds</code> to show (default: all four). A hidden larger unit is folded into the largest one shown.'],
        ['size', '<code>\'sm\'</code> for the compact version.'],
      ] },
      { title: 'Events and methods', rows: [
        ['tick', 'Every second: <code>{ days, hours, minutes, seconds, total }</code> (<code>total</code> in milliseconds).'],
        ['done', 'Once, when it reaches zero; the label changes to <em>Live now</em>.'],
        ['setTarget(to), remaining()', 'Move the target; the time left.'],
        ['getElement(), dispose()', 'The root element; remove it and stop its clock.'],
      ] },
      { title: 'Behaviour', rows: [
        ['data-mud="countdown" data-to', 'On any element with <code>[data-unit="days|hours|minutes|seconds"]</code> children; their <code>data-value</code> is set, and <code>data-done</code> on the element at zero.'],
      ] },
      { title: 'Plugin', rows: [
        ['use(countdown, { animate })', '<code>animate: false</code> turns the digit animation off.'],
        ['getPlugin(\'countdown\')', '<code>remaining(to)</code>, <code>format(to)</code>, <code>pauseAll()</code>, <code>resumeAll()</code>, <code>count()</code>.'],
        ['Tokens', '<code>--mud-countdown-digit-bg</code>, <code>--mud-countdown-digit-fg</code>, <code>--mud-countdown-accent</code>, <code>--mud-countdown-gap</code>.'],
      ] },
    ],
  }),
};
