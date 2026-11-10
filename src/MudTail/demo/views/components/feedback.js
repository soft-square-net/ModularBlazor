// Components: Loading (spinners, skeletons, overlay, busy buttons, page loader) and Progress (linear, donut, ring).
import {
  createMudButton, createSpinner, showLoading, setButtonLoading, pageLoader, MudProgressLinear, MudProgressCircular, showToast,
} from 'mudtail';
import { componentPage } from './page.js';

const BLAZOR = (name, methods) => ({ title: 'Blazor', rows: [[`create("${name}", host, options)`, `Handle methods: ${methods}.`]] });

const button = (text, onClick, variant = 'outlined', color = 'primary') => createMudButton({ text, variant, color, size: 'small', onClick });
const row = (...children) => { const r = document.createElement('div'); r.className = 'cp-row'; r.append(...children); return r; };

const ARTICLE_SKELETON = `
  <div class="mud-card mud-elevation-1 cp-skeleton-card" aria-hidden="true">
    <span class="mud-skeleton mud-skeleton--media"></span>
    <div class="mud-card-content">
      <span class="mud-skeleton mud-skeleton--text" style="inline-size: 30%"></span>
      <span class="mud-skeleton mud-skeleton--title"></span>
      <span class="mud-skeleton mud-skeleton--text"></span>
      <span class="mud-skeleton mud-skeleton--text" style="inline-size: 85%"></span>
      <div style="display: flex; align-items: center; gap: 12px; margin-block-start: 12px">
        <span class="mud-skeleton mud-skeleton--circle" style="--mud-skeleton-size: 2rem"></span>
        <span class="mud-skeleton mud-skeleton--text" style="inline-size: 40%"></span>
      </div>
    </div>
  </div>`;

const ARTICLE_CARD = `
  <article class="mud-card mud-elevation-1 cp-skeleton-card">
    <div class="cp-skeleton-media">Photo</div>
    <div class="mud-card-content">
      <small style="color: var(--mud-palette-primary); font-weight: 700">CULTURE</small>
      <h3 style="margin: 6px 0">The new wing of the City Gallery opens its doors</h3>
      <p style="margin: 0; color: var(--mud-palette-text-secondary)">Three floors of contemporary work, and a rooftop sculpture garden.</p>
    </div>
  </article>`;

export const LOADING_PAGE = {
  id: 'loading', label: 'Loading', icon: 'loader',
  render: () => componentPage({
    title: 'Loading', kinds: ['CSS', 'JS', 'Blazor'],
    lead: 'Spinners, skeleton placeholders, a loading overlay, busy buttons and a page-top loader. Pick the pattern by what the reader is waiting for (see the first example). Every animation slows or stops for <code>prefers-reduced-motion</code>.',
    examples: [
      {
        title: 'Which loading pattern?',
        description: 'Suggested use for each component.',
        code: false,
        html: `
          <div class="cp-api__scroll"><table class="cp-api__table cp-choose"><tbody>
            <tr><th scope="row">Skeleton</th><td>First load of a content area (article lists, cards, a profile). The layout does not jump when the content arrives.</td></tr>
            <tr><th scope="row">Spinner</th><td>Short waits in a small place: a widget, a dropdown, a "load more" button.</td></tr>
            <tr><th scope="row">Overlay</th><td>Refreshing content that is already on screen (a table, a chart): it stays visible, dimmed.</td></tr>
            <tr><th scope="row">Busy button</th><td>A form or action is being sent: prevents a second click.</td></tr>
            <tr><th scope="row">Page loader</th><td>Moving between pages or modules (Blazor navigation, lazy-loaded DLLs).</td></tr>
            <tr><th scope="row">Progress bar</th><td>When the amount is known: uploads, steps, reading or match progress.</td></tr>
          </tbody></table></div>`,
      },
      {
        title: 'Spinners',
        description: 'Ring, dots, bars (an equaliser, for live audio or a live match) and pulse (a "live" beacon). Colour them with a tone class.',
        html: `
          <div class="cp-row">
            <span class="mud-spinner mud-spinner--small" role="status"><span class="mud-sr-only">Loading…</span></span>
            <span class="mud-spinner" role="status"><span class="mud-sr-only">Loading…</span></span>
            <span class="mud-spinner mud-spinner--large mud-spinner--dual mud-tone-secondary" role="status"><span class="mud-sr-only">Loading…</span></span>
            <span class="mud-spinner-dots mud-tone-info" role="status"><span></span><span class="mud-sr-only">Loading…</span></span>
            <span class="mud-spinner-bars mud-tone-success" role="status"><i></i><i></i><i></i><i></i><span class="mud-sr-only">Loading…</span></span>
            <span class="mud-spinner-pulse" aria-hidden="true"></span> <strong>LIVE</strong>
          </div>`,
      },
      {
        title: 'Size, line width and colours',
        description: 'Set <code>--mud-spinner-size</code>, <code>--mud-spinner-width</code>, <code>--mud-spinner-color</code> and <code>--mud-spinner-track</code>, or pass them to <code>createSpinner()</code>.',
        code: `
          import { createSpinner } from 'mudtail';

          host.append(
            createSpinner({ size: 56, thickness: 8, color: 'warning' }),
            createSpinner({ size: 56, thickness: 2, color: '#0ea5e9', trackColor: 'transparent' }),
            createSpinner({ variant: 'bars', size: 40, color: 'error' }),
          );

          <!-- the same in markup -->
          <span class="mud-spinner" style="--mud-spinner-size: 56px; --mud-spinner-width: 8px; --mud-spinner-color: var(--mud-palette-warning)"></span>`,
        mount(el) {
          el.appendChild(row(
            createSpinner({ size: 56, thickness: 8, color: 'warning' }),
            createSpinner({ size: 56, thickness: 2, color: '#0ea5e9', trackColor: 'transparent' }),
            createSpinner({ size: 56, thickness: 12, color: 'success', trackColor: 'var(--mud-palette-lines-default)' }),
            createSpinner({ variant: 'bars', size: 40, color: 'error' }),
            createSpinner({ variant: 'dots', size: 14, color: 'secondary' }),
          ));
        },
      },
      {
        title: 'Skeleton: an article card while it loads',
        description: 'Shapes: <code>--text</code>, <code>--title</code>, <code>--circle</code>, <code>--rect</code>, <code>--media</code> (16:9). Add <code>--pulse</code> for a fade instead of the shimmer.',
        code: ARTICLE_SKELETON,
        language: 'HTML / Razor',
        mount(el) {
          const holder = document.createElement('div');
          holder.className = 'cp-skeleton-grid';
          let timer = 0;
          const load = () => {
            holder.innerHTML = ARTICLE_SKELETON.repeat(2);
            clearTimeout(timer);
            timer = setTimeout(() => { holder.innerHTML = ARTICLE_CARD.repeat(2); }, 1800);
          };
          el.append(row(button('Reload', load)), holder);
          load();
          return () => clearTimeout(timer);
        },
      },
      {
        title: 'Loading overlay',
        description: 'Dims a container that is being refreshed, with a spinner and optional text. Its children are not touched, and it sets <code>aria-busy</code>.',
        code: `
          import { showLoading } from 'mudtail';

          const loading = showLoading(card, { text: 'Updating scores…', spinner: 'ring', blur: true });
          await refresh();
          loading.hide();          // show() again later; dispose() removes it`,
        mount(el) {
          const card = document.createElement('div');
          card.className = 'mud-card mud-elevation-1';
          card.style.maxInlineSize = '420px';
          card.innerHTML = `
            <div class="mud-card-header"><strong>Premier division</strong></div>
            <div class="mud-card-content">
              <div style="display: flex; justify-content: space-between; gap: 12px"><span>Northbridge</span><strong>2 – 1</strong><span>Harbour City</span></div>
              <div style="display: flex; justify-content: space-between; gap: 12px; margin-block-start: 8px"><span>Ridgeway</span><strong>0 – 0</strong><span>Old Town</span></div>
            </div>`;
          const loading = showLoading(card, { text: 'Updating scores…', blur: true, visible: false });
          let timer = 0;
          el.append(row(
            button('Refresh', () => { loading.show(); clearTimeout(timer); timer = setTimeout(() => loading.hide(), 1800); }),
            button('Dots spinner', () => {
              loading.dispose();
              const dots = showLoading(card, { spinner: 'dots', text: '' });
              clearTimeout(timer);
              timer = setTimeout(() => dots.dispose(), 1800);
            }, 'text'),
          ), card);
          return () => { clearTimeout(timer); loading.dispose(); };
        },
      },
      {
        title: 'Busy buttons',
        description: 'A spinner over the button\'s content, which keeps its width; the button is disabled until it is done.',
        code: `
          import { setButtonLoading } from 'mudtail';

          setButtonLoading(saveButton, true);
          await save();
          setButtonLoading(saveButton, false);`,
        mount(el) {
          const timers = [];
          const busy = (b, ms = 1500) => { setButtonLoading(b, true); timers.push(setTimeout(() => { setButtonLoading(b, false); showToast('Saved', 'success'); }, ms)); };
          const save = createMudButton({ text: 'Save article', onClick: () => busy(save) });
          const publish = createMudButton({ text: 'Publish', color: 'secondary', onClick: () => busy(publish, 2200) });
          const outline = createMudButton({ text: 'Send', variant: 'outlined', onClick: () => busy(outline) });
          el.appendChild(row(save, publish, outline));
          return () => timers.forEach(clearTimeout);
        },
      },
      {
        title: 'Page loader',
        description: 'A thin bar at the top of the window while a page or module loads. <code>start()</code> creeps towards 90 %, <code>done()</code> completes it; calls nest.',
        code: `
          import { pageLoader } from 'mudtail';

          pageLoader.start();
          await loadModule();
          pageLoader.done();       // or pageLoader.set(60) when you know how far it is`,
        mount(el) {
          let timer = 0;
          el.appendChild(row(
            button('Start', () => pageLoader.start(), 'filled'),
            button('Set 60 %', () => pageLoader.set(60)),
            button('Done', () => pageLoader.done(true)),
            button('Simulate navigation', () => { pageLoader.start(); clearTimeout(timer); timer = setTimeout(() => pageLoader.done(), 1600); }, 'text'),
          ));
          return () => { clearTimeout(timer); if (pageLoader.isActive()) pageLoader.done(true); };
        },
      },
    ],
    api: [
      { title: 'Classes', rows: [
        ['.mud-spinner', 'Ring. Modifiers <code>--small</code>, <code>--large</code>, <code>--dual</code>. Variables <code>--mud-spinner-size</code>, <code>--mud-spinner-width</code>, <code>--mud-spinner-color</code>, <code>--mud-spinner-track</code>.'],
        ['.mud-spinner-dots / -bars / -pulse', 'Dots (one inner <code>&lt;span&gt;</code>), bars (four <code>&lt;i&gt;</code>), pulse (empty).'],
        ['.mud-tone-*', '<code>primary</code>, <code>secondary</code>, <code>info</code>, <code>success</code>, <code>warning</code>, <code>error</code>, <code>dark</code>, <code>inherit</code>: the colour of spinners and progress bars.'],
        ['.mud-skeleton', 'Placeholder with a shimmer. Shapes <code>--text</code>, <code>--title</code>, <code>--circle</code>, <code>--rect</code>, <code>--media</code>; <code>--pulse</code>.'],
        ['.mud-loading', 'A container that can show <code>.mud-loading__overlay</code>: visible while the container has <code>aria-busy="true"</code> (or <code>.is-loading</code>).'],
      ] },
      { title: 'Functions', rows: [
        ['createSpinner(options)', '<code>variant</code> (ring | dots | bars | pulse), <code>color</code>, <code>size</code>, <code>thickness</code>, <code>trackColor</code>, <code>label</code> (false = decorative).'],
        ['showLoading(target, options)', '<code>text</code>, <code>spinner</code>, <code>color</code>, <code>blur</code>, <code>visible</code>. Returns <code>show</code>, <code>hide</code>, <code>setText</code>, <code>isVisible</code>, <code>dispose</code>.'],
        ['setButtonLoading(button, loading)', 'Busy state on or off.'],
        ['pageLoader', '<code>start()</code>, <code>set(percent)</code>, <code>done(force)</code>, <code>isActive()</code>.'],
      ] },
      { title: 'Blazor', rows: [
        ['create("spinner", host, options)', 'A spinner in an element Blazor renders empty.'],
        ['create("loading", element, options)', 'An overlay over any element. Handle methods: show, hide, setText, isVisible, dispose.'],
        ['buttonLoading(element, bool) / pageLoading(true | false | percent)', 'The busy button and the page loader from C#.'],
      ] },
    ],
  }),
};

export const PROGRESS_PAGE = {
  id: 'progress', label: 'Progress', icon: 'gauge',
  render: () => componentPage({
    title: 'Progress', kinds: ['CSS', 'JS', 'Blazor'],
    lead: 'Linear bars and circular progress. The value, colours, line width and borders are custom properties, so markup alone works (Razor), and <code>MudProgressLinear</code> / <code>MudProgressCircular</code> add labels in the page\'s digits, thresholds and indeterminate states.',
    examples: [
      {
        title: 'Linear: values and colours',
        html: `
          <div class="cp-stack" style="max-inline-size: 520px; gap: 14px">
            <div class="mud-progress" role="progressbar" aria-valuenow="25" aria-valuemin="0" aria-valuemax="100" style="--mud-progress-value: 25"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">25%</span></div>
            <div class="mud-progress mud-tone-success" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" style="--mud-progress-value: 60"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">60%</span></div>
            <div class="mud-progress mud-tone-warning" role="progressbar" aria-valuenow="80" aria-valuemin="0" aria-valuemax="100" style="--mud-progress-value: 80"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">80%</span></div>
            <div class="mud-progress mud-tone-error" role="progressbar" aria-valuenow="95" aria-valuemin="0" aria-valuemax="100" style="--mud-progress-value: 95"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">95%</span></div>
          </div>`,
      },
      {
        title: 'Sizes, stripes and labels',
        description: 'Sizes <code>--small</code> / <code>--large</code> (or <code>--mud-progress-height</code>), <code>--striped</code>, <code>--animated</code>, the value inside a tall bar, and a caption row with <code>--stacked</code>.',
        html: `
          <div class="cp-stack" style="max-inline-size: 520px; gap: 16px">
            <div class="mud-progress mud-progress--small" role="progressbar" aria-valuenow="40" style="--mud-progress-value: 40"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div></div>
            <div class="mud-progress mud-progress--large mud-progress--striped mud-progress--animated mud-tone-info" role="progressbar" aria-valuenow="72" style="--mud-progress-value: 72">
              <div class="mud-progress__track"><div class="mud-progress__bar"><span class="mud-progress__value">72%</span></div></div>
            </div>
            <div class="mud-progress mud-progress--stacked mud-tone-secondary" role="progressbar" aria-valuenow="3" aria-valuemax="5" aria-label="Season ticket sales" style="--mud-progress-value: 60">
              <span class="mud-progress__caption">Season ticket sales</span><span class="mud-progress__label">3 of 5 stands</span>
              <div class="mud-progress__track"><div class="mud-progress__bar"></div></div>
            </div>
            <div class="mud-progress mud-progress--steps mud-tone-success" role="progressbar" aria-valuenow="3" aria-valuemax="5" aria-label="Checkout step" style="--mud-progress-value: 60; --mud-progress-steps: 5; --mud-progress-height: 0.5rem">
              <div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">Step 3 of 5</span>
            </div>
          </div>`,
      },
      {
        title: 'Buffer and indeterminate',
        description: 'A buffer bar (e.g. how much of a video has loaded), and a sliding bar when the amount is not known.',
        html: `
          <div class="cp-stack" style="max-inline-size: 520px; gap: 16px">
            <div class="mud-progress" role="progressbar" aria-valuenow="35" style="--mud-progress-value: 35; --mud-progress-buffer: 65"><div class="mud-progress__track"><div class="mud-progress__buffer"></div><div class="mud-progress__bar"></div></div><span class="mud-progress__label">35%</span></div>
            <div class="mud-progress mud-progress--indeterminate" role="progressbar" aria-label="Loading"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div></div>
            <div class="mud-progress mud-progress--indeterminate mud-progress--small mud-tone-secondary" role="progressbar" aria-label="Loading"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div></div>
          </div>`,
      },
      {
        title: 'Borders, track and colours',
        description: '<code>--mud-progress-border-width</code> / <code>--mud-progress-border-color</code> put a border around the track; <code>--mud-progress-color</code> and <code>--mud-progress-track</code> take any colour; <code>--mud-progress-radius</code> squares it.',
        html: `
          <div class="cp-stack" style="max-inline-size: 520px; gap: 16px">
            <div class="mud-progress" role="progressbar" aria-valuenow="55" style="--mud-progress-value: 55; --mud-progress-height: 14px; --mud-progress-border-width: 2px; --mud-progress-border-color: var(--mud-palette-primary); --mud-progress-track: transparent"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">55%</span></div>
            <div class="mud-progress" role="progressbar" aria-valuenow="70" style="--mud-progress-value: 70; --mud-progress-height: 12px; --mud-progress-color: linear-gradient(90deg, #f43f5e, #f59e0b); --mud-progress-border-width: 1px; --mud-progress-border-color: #f59e0b"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">70%</span></div>
            <div class="mud-progress mud-progress--square" role="progressbar" aria-valuenow="45" style="--mud-progress-value: 45; --mud-progress-height: 10px; --mud-progress-color: #0f766e; --mud-progress-track: #ccfbf1; --mud-progress-border-width: 3px; --mud-progress-border-color: #0f766e"><div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">45%</span></div>
          </div>`,
      },
      {
        title: 'Linear in JavaScript, with thresholds',
        description: 'The colour follows the value: below 40 % red, then amber, from 75 % green. Drag the slider.',
        code: `
          import { MudProgressLinear } from 'mudtail';

          const bar = new MudProgressLinear({
            value: 30, labelPosition: 'top', caption: 'Budget used', height: 12,
            thresholds: [{ from: 0, color: 'error' }, { from: 40, color: 'warning' }, { from: 75, color: 'success' }],
          });
          host.appendChild(bar.getElement());
          bar.setValue(82);          // also setBuffer, setIndeterminate, update({ … })`,
        mount(el) {
          const bar = new MudProgressLinear({
            value: 30, labelPosition: 'top', caption: 'Budget used', height: 12,
            thresholds: [{ from: 0, color: 'error' }, { from: 40, color: 'warning' }, { from: 75, color: 'success' }],
          });
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.className = 'mud-slider';
          slider.min = '0'; slider.max = '100'; slider.value = '30';
          slider.setAttribute('aria-label', 'Value');
          slider.addEventListener('input', () => bar.setValue(Number(slider.value)));
          const wrap = document.createElement('div');
          wrap.className = 'cp-stack';
          wrap.style.cssText = 'max-inline-size: 520px; gap: 16px';
          wrap.append(bar.getElement(), slider);
          el.appendChild(wrap);
          return () => bar.dispose();
        },
      },
      {
        title: 'Circular: CSS donut',
        description: 'Markup only: <code>--mud-progress-value</code>, <code>--mud-progress-size</code>, <code>--mud-progress-thickness</code> (line width), <code>--mud-progress-border-width</code> and <code>--mud-progress-border-color</code> (both edges of the ring). <code>--ccw</code> fills counter-clockwise.',
        html: `
          <div class="cp-row" style="gap: 24px">
            <div class="mud-donut" role="progressbar" aria-valuenow="68" style="--mud-progress-value: 68"><span class="mud-donut__label">68%</span></div>
            <div class="mud-donut mud-tone-success" role="progressbar" aria-valuenow="90" style="--mud-progress-value: 90; --mud-progress-size: 6rem; --mud-progress-thickness: 16px"><span class="mud-donut__label">90%<small>passes</small></span></div>
            <div class="mud-donut mud-tone-warning" role="progressbar" aria-valuenow="45" style="--mud-progress-value: 45; --mud-progress-thickness: 6px; --mud-progress-border-width: 2px; --mud-progress-border-color: var(--mud-palette-warning)"><span class="mud-donut__label">45%</span></div>
            <div class="mud-donut mud-donut--ccw mud-tone-error" role="progressbar" aria-valuenow="30" style="--mud-progress-value: 30; --mud-progress-size: 4rem; --mud-progress-thickness: 22px"><span class="mud-donut__label">30%</span></div>
          </div>`,
      },
      {
        title: 'Circular: SVG ring playground',
        description: '<code>MudProgressCircular</code> draws an SVG ring with round caps. Change every option here.',
        code: `
          import { MudProgressCircular } from 'mudtail';

          const ring = new MudProgressCircular({
            value: 62, size: 120, thickness: 12, color: 'primary', trackColor: null,
            borderWidth: 2, borderColor: 'primary', linecap: 'round', sublabel: 'possession',
          });
          host.appendChild(ring.getElement());
          ring.update({ thickness: 20, color: '#16a34a' });`,
        mount(el) {
          const ring = new MudProgressCircular({ value: 62, size: 120, thickness: 12, color: 'primary', borderWidth: 2, borderColor: 'primary', sublabel: 'possession' });
          const controls = document.createElement('div');
          controls.className = 'cp-controls';
          const range = (label, key, min, max, value) => {
            const id = `pc-${key}`;
            const field = document.createElement('label');
            field.className = 'cp-control';
            field.htmlFor = id;
            field.innerHTML = `<span>${label}</span><output>${value}</output>`;
            const input = document.createElement('input');
            Object.assign(input, { type: 'range', id, min, max, value, className: 'mud-slider' });
            input.addEventListener('input', () => { field.querySelector('output').textContent = input.value; ring.update({ [key]: Number(input.value) }); });
            field.appendChild(input);
            return field;
          };
          const color = (label, key, value) => {
            const field = document.createElement('label');
            field.className = 'cp-control cp-control--color';
            field.innerHTML = `<span>${label}</span>`;
            const input = document.createElement('input');
            Object.assign(input, { type: 'color', value });
            input.addEventListener('input', () => ring.update({ [key]: input.value }));
            field.appendChild(input);
            return field;
          };
          const check = (label, onChange) => {
            const field = document.createElement('label');
            field.className = 'cp-control cp-control--check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.addEventListener('change', () => onChange(input.checked));
            field.append(input, document.createTextNode(` ${label}`));
            return field;
          };
          controls.append(
            range('Value', 'value', 0, 100, 62),
            range('Size', 'size', 48, 200, 120),
            range('Line width', 'thickness', 2, 40, 12),
            range('Border width', 'borderWidth', 0, 8, 2),
            color('Colour', 'color', '#594ae2'),
            color('Track colour', 'trackColor', '#e4e1fb'),
            color('Border colour', 'borderColor', '#594ae2'),
            check('Flat ends', (on) => ring.update({ linecap: on ? 'butt' : 'round' })),
            check('Counter-clockwise', (on) => ring.update({ counterClockwise: on })),
            check('Indeterminate', (on) => ring.setIndeterminate(on)),
          );
          const layout = document.createElement('div');
          layout.className = 'cp-playground';
          const stage = document.createElement('div');
          stage.className = 'cp-playground__stage';
          stage.appendChild(ring.getElement());
          layout.append(stage, controls);
          el.appendChild(layout);
          return () => ring.dispose();
        },
      },
      {
        title: 'Circular: match stats and KPIs',
        description: 'Thresholds, sub-labels, a custom label function and the indeterminate spinner.',
        code: `
          new MudProgressCircular({ value: 87, size: 96, thickness: 10, sublabel: 'pass accuracy',
            thresholds: [{ from: 0, color: 'error' }, { from: 60, color: 'warning' }, { from: 80, color: 'success' }] });
          new MudProgressCircular({ value: 7, max: 10, size: 96, thickness: 6, color: 'secondary',
            label: (v) => \`\${v}/10\`, sublabel: 'rating' });
          new MudProgressCircular({ indeterminate: true, size: 48, thickness: 5 });`,
        mount(el) {
          const rings = [
            new MudProgressCircular({ value: 87, size: 96, thickness: 10, sublabel: 'pass accuracy', thresholds: [{ from: 0, color: 'error' }, { from: 60, color: 'warning' }, { from: 80, color: 'success' }] }),
            new MudProgressCircular({ value: 41, size: 96, thickness: 10, sublabel: 'shots on target', thresholds: [{ from: 0, color: 'error' }, { from: 60, color: 'warning' }, { from: 80, color: 'success' }] }),
            new MudProgressCircular({ value: 7, max: 10, size: 96, thickness: 6, color: 'secondary', linecap: 'butt', label: (v) => `${v}/10`, sublabel: 'rating' }),
            new MudProgressCircular({ value: 75, size: 96, thickness: 18, color: 'info', borderWidth: 1, borderColor: 'info', startAngle: -135, sublabel: 'tickets' }),
            new MudProgressCircular({ indeterminate: true, size: 48, thickness: 5 }),
          ];
          el.appendChild(row(...rings.map((r) => r.getElement())));
          return () => rings.forEach((r) => r.dispose());
        },
      },
    ],
    api: [
      { title: 'Classes', rows: [
        ['.mud-progress', 'Linear bar: <code>.mud-progress__track</code> &gt; <code>.mud-progress__bar</code> (+ <code>__buffer</code>, <code>__value</code>), <code>.mud-progress__label</code>, <code>.mud-progress__caption</code>. Modifiers <code>--small</code>, <code>--large</code>, <code>--square</code>, <code>--striped</code>, <code>--animated</code>, <code>--indeterminate</code>, <code>--steps</code>, <code>--stacked</code>.'],
        ['.mud-donut', 'CSS circular progress with <code>.mud-donut__label</code>; <code>--ccw</code>. The centre is <code>--mud-donut-hole</code> (the surface colour).'],
        ['--mud-progress-*', '<code>--mud-progress-value</code>, <code>-buffer</code>, <code>-color</code>, <code>-track</code>, <code>-height</code>, <code>-radius</code>, <code>-size</code>, <code>-thickness</code>, <code>-border-width</code>, <code>-border-color</code>, <code>-steps</code>.'],
      ] },
      { title: 'MudProgressLinear options', rows: [
        ['value, min, max, buffer', 'The range (0–100 by default) and an optional buffer value.'],
        ['color, trackColor, thresholds', 'Palette names or CSS colours; thresholds <code>[{ from, color }]</code> by percentage.'],
        ['height, radius, size, borderWidth, borderColor', 'Dimensions (numbers are px) and the border around the track.'],
        ['striped, animated, steps, indeterminate', 'Look and state.'],
        ['label, labelPosition, caption', '<code>label</code>: true (the percentage), false, text or <code>(value, percent) =&gt; text</code>. <code>labelPosition</code>: end | inside | top.'],
      ] },
      { title: 'MudProgressCircular options', rows: [
        ['value, min, max, indeterminate', 'As above.'],
        ['size, thickness', 'Diameter and line width, in px.'],
        ['color, trackColor, thresholds', 'As above.'],
        ['borderWidth, borderColor', 'A border on the outer and inner edge of the ring.'],
        ['linecap, startAngle, counterClockwise', '<code>round</code> or <code>butt</code>; degrees from 12 o\'clock; direction.'],
        ['label, sublabel, fontSize', 'The centre text.'],
      ] },
      { title: 'Methods', rows: [['setValue, setBuffer, setIndeterminate, update(options), getValue, getElement, dispose', '<code>setBuffer</code> is linear only.']] },
      BLAZOR('progress', 'setValue, setBuffer, setIndeterminate, update, dispose'),
      BLAZOR('progressCircular', 'setValue, setIndeterminate, update, dispose'),
    ],
  }),
};
