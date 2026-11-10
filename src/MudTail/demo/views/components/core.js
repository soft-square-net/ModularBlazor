// Components: core UI (buttons … grid) and the JavaScript components (dialog, drawer, tabs, accordion, tooltip, toast).
import { getIconSvg, createMudButton, MudDialog, MudDrawer, MudTabs, MudAccordion, attachTooltip, showToast } from 'mudtail';
import { componentPage, esc } from './page.js';

const icon = (name, size = 16) => getIconSvg(name, size);
const BLAZOR = (name, methods, events) => ({ title: 'Blazor', rows: [[`create("${name}", host, options, dotNetRef)`, `Handle methods: ${methods}. Events (OnMudEvent): ${events}.`]] });

export const CORE_PAGES = [
  {
    id: 'buttons', label: 'Buttons', icon: 'sparkles',
    render: () => componentPage({
      title: 'Buttons', kinds: ['CSS', 'JS'],
      lead: 'Filled, outlined and text buttons in four colours and three sizes, with a GSAP ripple when created through <code>createMudButton()</code>.',
      examples: [
        {
          title: 'Variants and colours',
          html: `
            <div class="cp-row">
              <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium">Primary</button>
              <button type="button" class="mud-button-root mud-button-filled mud-button-secondary mud-button-medium">Secondary</button>
              <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-medium">Outlined</button>
              <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-medium">Text</button>
              <button type="button" class="mud-button-root mud-button-filled mud-button-error mud-button-medium">Delete</button>
              <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium" disabled>Disabled</button>
            </div>`,
        },
        {
          title: 'Sizes and icons',
          html: `
            <div class="cp-row">
              <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small">Small</button>
              <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium">Medium</button>
              <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-large">Large</button>
              <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-medium">${icon('download')} Download</button>
              <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-icon" aria-label="Settings">${icon('sliders', 18)}</button>
            </div>`,
        },
        {
          title: 'With ripple (JavaScript)',
          code: `
            import { createMudButton } from 'mudtail';

            host.appendChild(createMudButton({
              text: 'Publish', variant: 'filled', color: 'primary', size: 'medium',
              onClick: () => showToast('Published', 'success'),
            }));`,
          mount(el) {
            const row = document.createElement('div');
            row.className = 'cp-row';
            row.append(
              createMudButton({ text: 'Publish', onClick: () => showToast('Published', 'success') }),
              createMudButton({ text: 'Save draft', variant: 'outlined' }),
            );
            el.appendChild(row);
          },
        },
      ],
      api: [
        { title: 'Classes', rows: [
          ['.mud-button-root', 'Base class.'],
          ['.mud-button-filled / -outlined / -text', 'Variant.'],
          ['.mud-button-primary / -secondary / -surface / -error', 'Colour.'],
          ['.mud-button-small / -medium / -large', 'Size; <code>.mud-button-icon</code> for icon-only buttons (give them an <code>aria-label</code>).'],
        ] },
        { title: 'createMudButton(options)', rows: [['text, variant, color, size', 'As the classes above.'], ['icon, iconPosition', 'SVG markup; <code>start</code> or <code>end</code>.'], ['onClick(e, button)', 'Click handler; the ripple runs first.'], ['disabled, type, ariaLabel, className', 'Usual button attributes.']] },
        BLAZOR('button', '<code>dispose</code>', '<code>click</code>'),
      ],
    }),
  },
  {
    id: 'cards', label: 'Cards & paper', icon: 'dashboard',
    render: () => componentPage({
      title: 'Cards and paper', kinds: ['CSS'],
      lead: 'Surfaces for grouping content: <code>.mud-paper</code> is a plain surface, <code>.mud-card</code> adds header, media, content and actions.',
      examples: [
        {
          title: 'Card',
          html: `
            <div class="mud-card mud-elevation-2" style="max-inline-size: 360px">
              <div class="mud-card-header"><strong>Match report</strong><span class="mud-badge mud-badge--live">Live</span></div>
              <div class="mud-card-content">Northbridge lead 2–1 after a second-half penalty. Harbour City push for an equaliser.</div>
              <div class="mud-card-actions">
                <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small">Read more</button>
                <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-small">Share</button>
              </div>
            </div>`,
        },
        {
          title: 'Paper',
          html: `
            <div class="cp-row">
              <div class="mud-paper mud-elevation-1" style="padding: 16px">Elevated</div>
              <div class="mud-paper mud-paper-outlined" style="padding: 16px">Outlined</div>
              <div class="mud-paper mud-paper-outlined mud-paper-square" style="padding: 16px">Square</div>
            </div>`,
        },
      ],
      api: [{ title: 'Classes', rows: [
        ['.mud-paper', 'Surface; modifiers <code>mud-paper-outlined</code>, <code>mud-paper-square</code>.'],
        ['.mud-card', 'Card with <code>.mud-card-header</code>, <code>.mud-card-media</code>, <code>.mud-card-content</code>, <code>.mud-card-actions</code>.'],
      ] }],
    }),
  },
  {
    id: 'typography', label: 'Typography', icon: 'docs',
    render: () => componentPage({
      title: 'Typography', kinds: ['CSS'],
      lead: 'The type scale as classes, so the look stays independent of the HTML level you need for the document outline.',
      examples: [{
        title: 'Scale',
        html: `
          <div class="mud-typography mud-typography-h3">Heading 3</div>
          <div class="mud-typography mud-typography-h5">Heading 5</div>
          <div class="mud-typography mud-typography-subtitle1">Subtitle 1</div>
          <div class="mud-typography mud-typography-body1">Body 1: the default reading size for paragraphs.</div>
          <div class="mud-typography mud-typography-body2">Body 2: secondary text and dense layouts.</div>
          <div class="mud-typography mud-typography-caption">Caption: image credits and footnotes</div>
          <div class="mud-typography mud-typography-overline">Overline</div>`,
      }],
      api: [{ title: 'Classes', rows: [['.mud-typography-h1 … -h6', 'Headings.'], ['-subtitle1 / -subtitle2', 'Subtitles.'], ['-body1 / -body2', 'Body text.'], ['-caption / -overline / -button', 'Small text styles.']] }],
    }),
  },
  {
    id: 'elevation', label: 'Elevation & rounding', icon: 'dock',
    render: () => componentPage({
      title: 'Elevation and rounding', kinds: ['CSS'],
      lead: 'Shadow levels <code>.mud-elevation-0</code> to <code>-24</code>, and radius utilities, including logical start / end corners that mirror in RTL.',
      examples: [
        { title: 'Elevation', html: `<div class="cp-grid">${[0, 1, 2, 4, 8, 12, 16, 24].map((n) => `<div class="cp-tile mud-elevation-${n}">${n}</div>`).join('')}</div>` },
        { title: 'Rounding', html: `<div class="cp-grid">${['mud-rounded-0', 'mud-rounded', 'mud-rounded-lg', 'mud-rounded-full', 'mud-rounded-t', 'mud-rounded-s', 'mud-rounded-e'].map((c) => `<div class="cp-tile mud-elevation-2 ${c}">.${c}</div>`).join('')}</div>` },
      ],
      api: [{ title: 'Classes', rows: [['.mud-elevation-{0…24}', 'Shadow depth.'], ['.mud-rounded, -sm, -md, -lg, -xl, -2xl, -full, -0', 'Radius; <code>.mud-rounded</code> follows the theme radius.'], ['.mud-rounded-t / -b / -l / -r', 'Physical sides.'], ['.mud-rounded-s / -e', 'Logical start / end sides (swap in RTL).']] }],
    }),
  },
  {
    id: 'grid', label: 'Grid', icon: 'dashboard',
    render: () => componentPage({
      title: 'Grid', kinds: ['CSS'],
      lead: 'A 12-column responsive grid built on logical properties, so it mirrors in RTL. Tailwind\'s grid utilities work alongside it.',
      examples: [{
        title: 'Responsive columns', description: 'Full width on phones, halves from <code>md</code>, thirds and a two-thirds column from <code>lg</code>.',
        html: `
          <div class="mud-row" style="row-gap: 12px">
            <div class="mud-col-12 mud-col-md-6 mud-col-lg-4"><div class="cp-cell">12 · md-6 · lg-4</div></div>
            <div class="mud-col-12 mud-col-md-6 mud-col-lg-4"><div class="cp-cell">12 · md-6 · lg-4</div></div>
            <div class="mud-col-12 mud-col-md-12 mud-col-lg-4"><div class="cp-cell">12 · md-12 · lg-4</div></div>
            <div class="mud-col-12 mud-col-lg-8"><div class="cp-cell">12 · lg-8</div></div>
            <div class="mud-col-12 mud-col-lg-4"><div class="cp-cell">12 · lg-4</div></div>
          </div>`,
      }],
      api: [{ title: 'Classes', rows: [['.mud-container', 'Centred, padded, capped at <code>--mud-container-max</code> (1280px).'], ['.mud-row', 'Flex row with gutters.'], ['.mud-col-{1…12}', 'Column span.'], ['.mud-col-{sm|md|lg|xl}-{1…12}', 'Span from that breakpoint up.']] }],
    }),
  },
  {
    id: 'dialog', label: 'Dialog', icon: 'docs',
    render: () => componentPage({
      title: 'Dialog', kinds: ['JS', 'Blazor'],
      lead: 'A modal dialog with a GSAP entrance, built in JavaScript and appended to <code>&lt;body&gt;</code>.',
      examples: [{
        title: 'Confirm',
        code: `
          import { MudDialog } from 'mudtail';

          const dialog = new MudDialog({
            title: 'Unpublish article?',
            content: 'Readers will no longer see it. You can publish it again later.',
            actions: [
              { label: 'Cancel', variant: 'text', color: 'surface' },
              { label: 'Unpublish', color: 'error', onClick: (e, d) => { showToast('Unpublished'); d.close(); } },
            ],
          });
          dialog.open();
          // later: dialog.dispose();`,
        mount(el) {
          const dialog = new MudDialog({
            title: 'Unpublish article?',
            content: 'Readers will no longer see it. You can publish it again later.',
            actions: [
              { label: 'Cancel', variant: 'text', color: 'surface' },
              { label: 'Unpublish', color: 'error', onClick: (_e, d) => { showToast('Unpublished', 'success'); d.close(); } },
            ],
          });
          el.appendChild(createMudButton({ text: 'Open dialog', onClick: () => dialog.open() }));
          return () => dialog.dispose();
        },
      }],
      api: [
        { title: 'Options', rows: [['title', 'Dialog title.'], ['content', 'HTML string or element (escape user content).'], ['actions', '<code>[{ label, variant, color, onClick(e, dialog) }]</code>; without <code>onClick</code> a button closes the dialog.'], ['maxWidth', 'CSS width cap.'], ['onClose', 'Called after it closes.']] },
        { title: 'Methods', rows: [['open() / close()', 'Show and hide (animated).'], ['dispose()', 'Removes it from the page.']] },
        BLAZOR('dialog', '<code>open</code>, <code>close</code>, <code>dispose</code>', '<code>action</code> (action id), <code>close</code>'),
      ],
    }),
  },
  {
    id: 'drawer', label: 'Drawer', icon: 'menu',
    render: () => componentPage({
      title: 'Drawer', kinds: ['JS', 'Blazor'],
      lead: 'A panel that slides in from an edge. <code>start</code> and <code>end</code> follow the writing direction; <code>left</code>, <code>right</code>, <code>top</code> and <code>bottom</code> are physical.',
      examples: [{
        title: 'Anchors',
        code: `
          import { MudDrawer } from 'mudtail';

          const drawer = new MudDrawer({ anchor: 'end', title: 'Filters' });
          drawer.setContent('<p>…</p>');
          drawer.open();
          // later: drawer.dispose();`,
        mount(el) {
          const row = document.createElement('div');
          row.className = 'cp-row';
          const drawers = ['start', 'end', 'top', 'bottom'].map((anchor) => {
            const d = new MudDrawer({ anchor, title: `Anchor: ${anchor}` });
            d.setContent(`<p>This drawer is anchored to <strong>${esc(anchor)}</strong>. Click outside or the ✕ to close.</p>`);
            row.appendChild(createMudButton({ text: anchor, variant: 'outlined', onClick: () => d.open() }));
            return d;
          });
          el.appendChild(row);
          return () => drawers.forEach((d) => d.dispose());
        },
      }],
      api: [
        { title: 'Options', rows: [['anchor', '<code>start</code> | <code>end</code> | <code>left</code> | <code>right</code> | <code>top</code> | <code>bottom</code>.'], ['variant', '<code>temporary</code> (with overlay), <code>persistent</code>, <code>mini</code>.'], ['title, width, open', 'Header text, size, initial state.'], ['onOpen / onClose', 'Callbacks.']] },
        { title: 'Methods', rows: [['open() / close() / toggle()', 'Animated.'], ['setContent(htmlOrElement), setTitle(text), setAnchor(anchor)', 'Update it.'], ['dispose()', 'Removes the drawer and its overlay.']] },
        BLAZOR('drawer', '<code>open</code>, <code>close</code>, <code>toggle</code>, <code>setContent</code>, <code>setTitle</code>, <code>setAnchor</code>, <code>dispose</code>', '<code>open</code>, <code>close</code>'),
      ],
    }),
  },
  {
    id: 'tabs', label: 'Tabs', icon: 'dock',
    render: () => componentPage({
      title: 'Tabs', kinds: ['JS', 'Blazor'],
      lead: 'Tabs with an animated indicator, in six positions. <code>start</code> / <code>end</code> follow the writing direction.',
      examples: [{
        title: 'Positions',
        code: `
          import { MudTabs } from 'mudtail';

          const tabs = new MudTabs({
            position: 'top',            // top | bottom | start | end | left | right
            tabs: [{ id: 'news', label: 'News', content: '…' }, { id: 'sport', label: 'Sport', badge: 3, content: '…' }],
            onChange: (id) => console.log(id),
          });
          host.appendChild(tabs.getElement());`,
        mount(el) {
          const select = document.createElement('div');
          select.innerHTML = `<div class="mud-input-control" style="max-inline-size: 220px"><label class="mud-input-label" for="tabs-pos">Position</label>
            <div class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense"><select id="tabs-pos" class="mud-input-slot">
            ${['top', 'bottom', 'start', 'end'].map((p) => `<option>${p}</option>`).join('')}</select></div></div>`;
          const tabs = new MudTabs({
            tabs: [
              { id: 'news', label: 'News', content: '<p>Top stories from the newsroom.</p>' },
              { id: 'sport', label: 'Sport', badge: 3, content: '<p>Three live matches right now.</p>' },
              { id: 'culture', label: 'Culture', content: '<p>New acquisitions at the gallery.</p>' },
            ],
          });
          select.querySelector('select').addEventListener('change', (e) => tabs.setPosition(e.target.value));
          el.append(select, tabs.getElement());
          return () => tabs.dispose();
        },
      }],
      api: [
        { title: 'Options', rows: [['tabs', '<code>[{ id, label, icon?, badge?, content }]</code> (content: HTML string or element).'], ['position, activeId', 'Placement and the starting tab.'], ['onChange(id)', 'Called when the tab changes.']] },
        { title: 'Methods', rows: [['setActive(id), setPosition(position)', 'Change it.'], ['getElement()', 'The element to insert.'], ['dispose()', 'Removes it.']] },
        BLAZOR('tabs', '<code>setActive</code>, <code>setPosition</code>, <code>dispose</code>', '<code>change</code> (tab id)'),
      ],
    }),
  },
  {
    id: 'accordion', label: 'Accordion', icon: 'chevronDown',
    render: () => componentPage({
      title: 'Accordion', kinds: ['JS', 'Blazor'],
      lead: 'Expandable panels with a GSAP height animation. One panel at a time, or several with <code>multiExpand</code>.',
      examples: [{
        title: 'FAQ',
        code: `
          import { MudAccordion } from 'mudtail';

          const accordion = new MudAccordion({
            panels: [{ id: 'q1', title: 'How do I subscribe?', content: '…', expanded: true }, …],
            multiExpand: false,
          });
          host.appendChild(accordion.getElement());`,
        mount(el) {
          const acc = new MudAccordion({ panels: [
            { id: 'q1', title: 'How do I subscribe?', content: '<p>Choose a plan on the Subscribe page; you can cancel any time.</p>', expanded: true },
            { id: 'q2', title: 'Can I read offline?', content: '<p>Yes, in the app: save articles for later.</p>' },
            { id: 'q3', title: 'How do I report a mistake?', content: '<p>Use the "Report an error" link under any article.</p>' },
          ] });
          el.appendChild(acc.getElement());
          return () => acc.dispose();
        },
      }],
      api: [
        { title: 'Options', rows: [['panels', '<code>[{ id, title, icon?, content, expanded? }]</code>.'], ['multiExpand', 'Allow several open panels.']] },
        BLAZOR('accordion', '<code>dispose</code>', 'none'),
      ],
    }),
  },
  {
    id: 'tooltip', label: 'Tooltip', icon: 'help',
    render: () => componentPage({
      title: 'Tooltip', kinds: ['JS', 'Blazor'],
      lead: 'A small label on hover. <code>start</code> / <code>end</code> follow the writing direction. Keep tooltips for extra hints: the information should not live only in them.',
      examples: [{
        title: 'Positions',
        code: `
          import { attachTooltip } from 'mudtail';

          const detach = attachTooltip(button, 'Save (Ctrl+S)', 'top');   // top | bottom | start | end | left | right
          // later: detach();`,
        mount(el) {
          const row = document.createElement('div');
          row.className = 'cp-row';
          const detachers = ['top', 'bottom', 'start', 'end'].map((pos) => {
            const b = createMudButton({ text: pos, variant: 'outlined' });
            row.appendChild(b);
            return attachTooltip(b, `Tooltip on ${pos}`, pos);
          });
          el.appendChild(row);
          return () => detachers.forEach((d) => d());
        },
      }],
      api: [{ title: 'Function', rows: [['attachTooltip(element, text, position)', 'Returns a function that removes it.'], ['Blazor: tooltip(element, text, position)', 'Returns a handle with <code>dispose</code>.']] }],
    }),
  },
  {
    id: 'toast', label: 'Toast', icon: 'bell',
    render: () => componentPage({
      title: 'Toast', kinds: ['JS', 'Blazor'],
      lead: 'A short message at the inline-end corner (bottom-right in LTR, bottom-left in RTL) that disappears on its own. Colours come from the theme.',
      examples: [{
        title: 'Types',
        code: `
          import { showToast } from 'mudtail';
          showToast('Article saved', 'success');   // info | success | warning | error`,
        mount(el) {
          const row = document.createElement('div');
          row.className = 'cp-row';
          [['info', 'primary'], ['success', 'primary'], ['warning', 'secondary'], ['error', 'error']].forEach(([type, color]) => {
            row.appendChild(createMudButton({ text: type, color, variant: 'outlined', onClick: () => showToast(`This is a ${type} toast`, type) }));
          });
          el.appendChild(row);
        },
      }],
      api: [{ title: 'Function', rows: [['showToast(message, type)', '<code>info</code>, <code>success</code>, <code>warning</code> or <code>error</code>. The message is inserted as text.'], ['Blazor: toast(message, type)', 'Same, from C#.']] }],
    }),
  },
];
