// Components: editorial (news / sport / art) building blocks and the IDE dock.
import { MudDock, createStatCard, getIconSvg } from 'mudtail';
import { componentPage } from './page.js';
import { art } from '../../site/data.js';

const BEHAVIOUR = (name, extra = '') => ({ title: 'Behaviour', rows: [
  [`data-mud="${name}"`, `Started by <code>autoInit</code> (the Default layout runs it on every page), or one element at a time with <code>mud.behavior("${name}", element)</code> from Blazor.${extra}`],
] });

const card = (i, kicker, title, variant = '', extra = '') => `
  <article class="mud-article ${variant}">
    <a class="mud-article__media" href="#" tabindex="-1" aria-hidden="true"><img src="${art(i)}" alt="">${extra}</a>
    <div class="mud-article__body">
      <a class="mud-kicker" href="#">${kicker}</a>
      <h3 class="mud-article__title"><a href="#">${title}</a></h3>
      <div class="mud-meta"><span>Lina Haddad</span><time>2h ago</time></div>
    </div>
  </article>`;

const IMG = '<img src="…" alt="">';

export const EDITORIAL_PAGES = [
  {
    id: 'article-cards', label: 'Article cards', icon: 'docs',
    render: () => componentPage({
      title: 'Article cards and grids', kinds: ['CSS'],
      lead: 'Cards for stories, and the grids that lay out a front page. The whole card is clickable through its title link, and other links inside it stay usable.',
      examples: [
        {
          title: 'Variants', description: 'Default, row (image beside the text) and overlay (text on the image).',
          html: `<div class="mud-card-grid" style="--mud-card-min: 220px">
            ${card(3, 'Science', 'Night-sky survey spots a comet visible in March')}
            ${card(5, 'Sport', 'Northbridge striker signs four-year extension', 'mud-article--row')}
            ${card(8, 'Live', 'Election night: every district as it comes in', 'mud-article--overlay', '<span class="mud-badge mud-badge--live">Live</span>')}
          </div>`,
          code: `
            <article class="mud-article [mud-article--row | mud-article--overlay | mud-article--lead]">
              <a class="mud-article__media" href="…" tabindex="-1" aria-hidden="true">${IMG}</a>
              <div class="mud-article__body">
                <a class="mud-kicker" href="…">Science</a>
                <h3 class="mud-article__title"><a href="…">Headline</a></h3>
                <p class="mud-article__excerpt">…</p>
                <div class="mud-meta"><span>Author</span><time>2h ago</time></div>
              </div>
            </article>`,
        },
        {
          title: 'Hero grid', description: 'The first child is the lead story (2×2 on desktop, full width on tablets, stacked on phones).',
          html: `<div class="mud-hero-grid">
            ${card(1, 'Climate', 'The quiet engineers rebuilding a river delta', 'mud-article--overlay mud-article--lead')}
            ${card(2, 'Politics', 'Coalition talks resume')}
            ${card(4, 'Health', 'Clinics extend weekend hours')}
            ${card(6, 'Economy', 'Ports bet on electric ferries')}
            ${card(7, 'Education', 'A four-day timetable trial')}
          </div>`,
          code: `
            <section class="mud-hero-grid">
              <article class="mud-article mud-article--overlay mud-article--lead">…</article>
              <article class="mud-article">…</article>   <!-- × 4 -->
            </section>`,
        },
        {
          title: 'Most read', description: 'A numbered list; the accent colour comes from <code>--mud-accent</code>.',
          html: `
            <ol class="mud-article-list" style="max-inline-size: 360px; --mud-accent: #b45309">
              <li><article class="mud-article"><div class="mud-article__body"><h3 class="mud-article__title"><a href="#">Coastal rail line reopens</a></h3></div></article></li>
              <li><article class="mud-article"><div class="mud-article__body"><h3 class="mud-article__title"><a href="#">A comet visible in March</a></h3></div></article></li>
              <li><article class="mud-article"><div class="mud-article__body"><h3 class="mud-article__title"><a href="#">Our streets were designed for cars</a></h3></div></article></li>
            </ol>`,
        },
      ],
      api: [{ title: 'Classes', rows: [
        ['.mud-article', 'Card; modifiers <code>--lead</code>, <code>--row</code>, <code>--overlay</code>. Parts: <code>__media</code>, <code>__body</code>, <code>__title</code>, <code>__excerpt</code>.'],
        ['.mud-kicker, .mud-meta, .mud-badge(--live)', 'Section label, byline / time line, badges.'],
        ['.mud-hero-grid, .mud-card-grid, .mud-split', 'Front-page grid, auto-fill grid (<code>--mud-card-min</code>), main + aside (<code>--mud-split-aside</code>).'],
        ['.mud-section (+ __header, __title, __more)', 'Section with an accent-underlined title.'],
        ['--mud-accent, --mud-font-headline', 'Per-section accent colour and headline font.'],
      ] }],
    }),
  },
  {
    id: 'ticker', label: 'News ticker', icon: 'bell',
    render: () => componentPage({
      title: 'Breaking-news ticker', kinds: ['CSS', 'Behaviour'],
      lead: 'Headlines scrolling with GSAP. It pauses on hover and keyboard focus, has a pause button, runs the other way in RTL, and becomes a hand-scrolled strip with reduced motion.',
      examples: [{
        title: 'Ticker',
        html: `
          <div class="mud-ticker" data-mud="ticker" data-speed="70" aria-label="Breaking news">
            <span class="mud-ticker__label">Breaking</span>
            <div class="mud-ticker__viewport">
              <ul class="mud-ticker__track">
                <li><time>10:42</time><a href="#">Coastal rail line reopens two weeks early</a></li>
                <li><time>10:15</time><a href="#">Car-free weekends for the old harbour</a></li>
                <li><time>09:58</time><a href="#">Northbridge striker signs extension</a></li>
              </ul>
            </div>
            <button type="button" class="mud-ticker__toggle"></button>
          </div>`,
      }],
      api: [
        { title: 'Markup', rows: [['.mud-ticker', 'Container; <code>data-speed</code> in px per second (default 70).'], ['__label, __viewport, __track', 'Label, clipping area, the moving list.'], ['__toggle', 'Optional pause / play button (the script sets its label and <code>aria-pressed</code>).']] },
        BEHAVIOUR('ticker', ' It rebuilds when Blazor re-renders the headlines.'),
      ],
    }),
  },
  {
    id: 'live-scores', label: 'Live scores', icon: 'test',
    render: () => componentPage({
      title: 'Live scores and match card', kinds: ['CSS', 'Behaviour'],
      lead: 'A scrollable score strip and a match card. When Blazor re-renders a new score, <code>data-mud="score-strip"</code> flashes it.',
      examples: [
        {
          title: 'Score strip', description: 'Press the button to change a score, as a Blazor re-render would.',
          html: `
            <div class="mud-score-strip mud-scroller" data-mud="score-strip" aria-label="Live scores">
              <a class="mud-score-chip" data-status="live" href="#"><span class="mud-score-chip__status">72'</span>
                <span class="mud-score-chip__team">NBR <b class="mud-score">2</b></span><span class="mud-score-chip__team">HBC <b class="mud-score">1</b></span></a>
              <a class="mud-score-chip" data-status="ht" href="#"><span class="mud-score-chip__status">HT</span>
                <span class="mud-score-chip__team">EAS <b class="mud-score">0</b></span><span class="mud-score-chip__team">KSP <b class="mud-score">0</b></span></a>
              <a class="mud-score-chip" data-status="upcoming" href="#"><span class="mud-score-chip__status">20:00</span>
                <span class="mud-score-chip__team">SGT</span><span class="mud-score-chip__team">IRV</span></a>
            </div>`,
          mount(el) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mud-button-root mud-button-outlined mud-button-primary mud-button-small';
            b.style.marginBlockStart = '12px';
            b.textContent = 'Simulate a goal';
            b.addEventListener('click', () => { const s = el.querySelector('[data-status="live"] .mud-score'); s.textContent = String(Number(s.textContent) + 1); });
            el.appendChild(b);
          },
        },
        {
          title: 'Match card',
          html: `
            <article class="mud-match" data-status="live" data-mud="score-strip" style="max-inline-size: 420px">
              <header class="mud-match__header"><span class="mud-match__competition">Premier League</span><span class="mud-match__status">Live 72'</span></header>
              <div class="mud-match__teams">
                <div class="mud-match__team"><img class="mud-crest mud-crest--lg" src="${art(78, 96, 96)}" alt=""><span>Northbridge</span></div>
                <div class="mud-match__score"><b class="mud-score">2</b><span>–</span><b class="mud-score">1</b></div>
                <div class="mud-match__team"><img class="mud-crest mud-crest--lg" src="${art(72, 96, 96)}" alt=""><span>Harbour City</span></div>
              </div>
              <ul class="mud-match__events"><li data-side="home">Okafor 23'</li><li data-side="away">Lindqvist 51'</li><li data-side="home">Okafor 66' (pen)</li></ul>
              <footer class="mud-match__footer"><span>Riverside Park</span><a href="#">Match centre</a></footer>
            </article>`,
        },
      ],
      api: [
        { title: 'Classes', rows: [
          ['.mud-score-strip.mud-scroller', 'Snapping horizontal strip of <code>.mud-score-chip</code>s.'],
          ['data-status', '<code>live</code> (pulsing dot), <code>ht</code>, <code>ft</code>, <code>upcoming</code>.'],
          ['.mud-match', 'Match card: <code>__header</code>, <code>__teams</code>, <code>__team</code>, <code>__score</code> or <code>__kickoff</code>, <code>__events</code>, <code>__footer</code>.'],
          ['.mud-score, .mud-crest(--lg)', 'Score numbers and team crests.'],
        ] },
        BEHAVIOUR('score-strip'),
      ],
    }),
  },
  {
    id: 'league-table', label: 'League table', icon: 'database',
    render: () => componentPage({
      title: 'League table', kinds: ['CSS'],
      lead: 'Standings with qualification zones, the followed team highlighted, a form guide, and a team column that stays visible while the numbers scroll on phones.',
      examples: [{
        title: 'Standings',
        html: `
          <div class="mud-table-scroll" style="max-inline-size: 640px">
            <table class="mud-league-table">
              <caption>Premier League</caption>
              <thead><tr><th scope="col">#</th><th scope="col" class="mud-league-table__team">Team</th><th scope="col">P</th><th scope="col">GD</th><th scope="col">Pts</th><th scope="col" class="mud-league-table__optional">Form</th></tr></thead>
              <tbody>
                <tr data-zone="champions" aria-current="true"><td class="mud-league-table__pos">1</td><th scope="row" class="mud-league-table__team"><span>Northbridge</span></th><td>12</td><td>+27</td><td class="mud-league-table__pts">29</td>
                  <td class="mud-league-table__optional"><span class="mud-form"><span class="mud-form__result" data-result="W">W</span><span class="mud-form__result" data-result="W">W</span><span class="mud-form__result" data-result="D">D</span></span></td></tr>
                <tr data-zone="europe"><td class="mud-league-table__pos">2</td><th scope="row" class="mud-league-table__team"><span>Westmoor</span></th><td>12</td><td>+14</td><td class="mud-league-table__pts">24</td>
                  <td class="mud-league-table__optional"><span class="mud-form"><span class="mud-form__result" data-result="W">W</span><span class="mud-form__result" data-result="L">L</span><span class="mud-form__result" data-result="W">W</span></span></td></tr>
                <tr data-zone="relegation"><td class="mud-league-table__pos">3</td><th scope="row" class="mud-league-table__team"><span>Fernhill</span></th><td>12</td><td>−18</td><td class="mud-league-table__pts">6</td>
                  <td class="mud-league-table__optional"><span class="mud-form"><span class="mud-form__result" data-result="L">L</span><span class="mud-form__result" data-result="L">L</span><span class="mud-form__result" data-result="D">D</span></span></td></tr>
              </tbody>
            </table>
          </div>`,
      }],
      api: [{ title: 'Markup', rows: [
        ['.mud-table-scroll > table.mud-league-table', 'Scrolls sideways when narrow.'],
        ['tr[data-zone]', '<code>champions</code>, <code>europe</code>, <code>playoff</code>, <code>relegation</code>: a coloured edge on the position cell.'],
        ['tr[aria-current="true"]', 'The followed team.'],
        ['.mud-league-table__team / __pos / __pts / __optional', 'Sticky team column, position, points, columns hidden on phones.'],
        ['.mud-form > .mud-form__result[data-result]', 'W / D / L form guide.'],
      ] }],
    }),
  },
  {
    id: 'gallery', label: 'Gallery & lightbox', icon: 'palette',
    render: () => componentPage({
      title: 'Gallery and lightbox', kinds: ['CSS', 'Behaviour'],
      lead: 'A masonry gallery; with <code>data-mud="lightbox"</code> the images open full screen with keyboard, swipe and focus handling. Without the script the links just open the image.',
      examples: [{
        title: 'Masonry', description: 'Click an image, then use the arrow keys or swipe; Esc closes.',
        html: `
          <div class="mud-masonry" data-mud="lightbox" style="--mud-masonry-cols: 3">
            ${[[900, 1200], [1200, 800], [900, 900], [900, 1300], [1200, 760], [900, 1100]].map(([w, h], i) => `
            <figure class="mud-masonry__item">
              <a href="${art(i + 20, w * 1.5, h * 1.5)}" data-mud-lightbox-item data-caption="Study No. ${i + 1}">
                <img src="${art(i + 20, w / 3, h / 3)}" alt="Study No. ${i + 1}" loading="lazy">
              </a>
              <figcaption>Study No. ${i + 1} <span>Collection 2026</span></figcaption>
            </figure>`).join('')}
          </div>`,
      }],
      api: [
        { title: 'Markup', rows: [['.mud-masonry', 'Columns: 1 → 4 by width, or set <code>--mud-masonry-cols</code>.'], ['figure.mud-masonry__item > a[data-mud-lightbox-item]', 'The link\'s <code>href</code> is the full image; <code>data-caption</code> or the <code>figcaption</code> is the caption (inserted as text).']] },
        BEHAVIOUR('lightbox', ' From code: <code>lightbox(items, index)</code> / <code>openLightbox(items, index)</code>.'),
      ],
    }),
  },
  {
    id: 'mega-nav', label: 'Mega-nav & header', icon: 'menu',
    render: () => componentPage({
      title: 'Site header and mega-nav', kinds: ['CSS', 'Behaviour'],
      lead: 'The public-site masthead and navigation. Panels open on hover or with the arrow button; below 1024px the nav folds behind a menu button and panels open inline. The Blazor <code>PublicLayout</code> renders exactly this.',
      examples: [{
        title: 'Header', description: 'Open "Sport" with its arrow; Esc closes it and returns focus.',
        html: `
          <header class="mud-site-header" style="position: relative">
            <div class="mud-masthead mud-container">
              <button type="button" class="mud-icon-btn mud-nav-toggle" data-mud-nav-toggle aria-controls="cp-nav" aria-label="Menu">☰</button>
              <a class="mud-logo" href="#">The Daily <b>Mud</b></a>
              <div class="mud-masthead__actions"><a href="#">Sign in</a></div>
            </div>
            <nav class="mud-mega-nav" id="cp-nav" data-mud="mega-nav" aria-label="Main">
              <ul class="mud-mega-nav__list mud-container">
                <li class="mud-mega-nav__item"><a class="mud-mega-nav__link active" href="#">News</a></li>
                <li class="mud-mega-nav__item"><a class="mud-mega-nav__link" href="#">Sport</a>
                  <button type="button" class="mud-mega-nav__expander" aria-controls="cp-nav-sport" aria-label="Sport sections"></button>
                  <div class="mud-mega-nav__panel" id="cp-nav-sport"><div class="mud-mega-nav__columns">
                    <div><h3 class="mud-mega-nav__heading">Football</h3><ul><li><a href="#">Premier League</a></li><li><a href="#">Transfers</a></li></ul></div>
                    <div><h3 class="mud-mega-nav__heading">More</h3><ul><li><a href="#">Tennis</a></li><li><a href="#">Formula 1</a></li></ul></div>
                  </div></div></li>
                <li class="mud-mega-nav__item"><a class="mud-mega-nav__link" href="#">Culture</a></li>
              </ul>
            </nav>
          </header>`,
      }],
      api: [
        { title: 'Markup', rows: [['.mud-site-header, .mud-masthead, .mud-logo, .mud-icon-btn', 'Header parts.'], ['.mud-mega-nav (+ __list, __item, __link, __expander, __panel, __columns, __heading, __feature)', 'The nav. Don\'t render <code>aria-expanded</code> or <code>data-open</code>: the script owns them.'], ['[data-mud-nav-toggle][aria-controls]', 'Menu button for small screens.']] },
        BEHAVIOUR('mega-nav'),
      ],
    }),
  },
  {
    id: 'stat-hero', label: 'Stat hero card', icon: 'gauge',
    render: () => componentPage({
      title: 'Stat hero card', kinds: ['CSS', 'Behaviour', 'JS', 'Blazor'],
      lead: 'A "how we compare" block for the public site: an eyebrow, a headline and a lead over a card of horizontal bars, one highlighted with a gradient and a large value. The bars grow in when the card scrolls into view. Use it for page speed, reader trust, match statistics, ticket sales or exhibition visitors.',
      examples: [
        {
          title: 'Dark hero (markup)',
          description: 'The markup a Razor page writes. <code>--mud-stat-value</code> sets each bar; <code>is-highlight</code> marks the one to stand out; <code>data-mud="stat-bars"</code> animates them.',
          html: `
            <section class="mud-stat-hero mud-stat-hero--dark" aria-labelledby="sh-title">
              <header class="mud-stat-hero__head">
                <p class="mud-stat-hero__eyebrow">Best-in-class speed</p>
                <h2 class="mud-stat-hero__title" id="sh-title">The fastest front page in the region</h2>
                <p class="mud-stat-hero__lead">Every page is built from Blazor WebAssembly modules and MudTail, so it opens fast on any phone.</p>
              </header>
              <figure class="mud-stat-card" data-mud="stat-bars">
                <figcaption class="mud-stat-card__caption">% of page visits that load in under two seconds</figcaption>
                <ol class="mud-stat-bars">
                  <li class="mud-stat-bar is-highlight" style="--mud-stat-value: 71">
                    <span class="mud-stat-bar__label">The Daily Mud</span>
                    <span class="mud-stat-bar__track"><span class="mud-stat-bar__fill"><span class="mud-stat-bar__icon" aria-hidden="true">${getIconSvg('news', 20)}</span></span><span class="mud-stat-bar__value">71%</span></span>
                  </li>
                  <li class="mud-stat-bar" style="--mud-stat-value: 48">
                    <span class="mud-stat-bar__label">Regional dailies</span>
                    <span class="mud-stat-bar__track"><span class="mud-stat-bar__fill"><span class="mud-stat-bar__icon" aria-hidden="true">${getIconSvg('globe', 20)}</span></span><span class="mud-stat-bar__value">48%</span></span>
                  </li>
                  <li class="mud-stat-bar" style="--mud-stat-value: 35">
                    <span class="mud-stat-bar__label">News aggregators</span>
                    <span class="mud-stat-bar__track"><span class="mud-stat-bar__fill"><span class="mud-stat-bar__icon" aria-hidden="true">${getIconSvg('dashboard', 20)}</span></span><span class="mud-stat-bar__value">35%</span></span>
                  </li>
                </ol>
                <p class="mud-stat-card__source"><a href="#">View the full dataset</a> · Fictional figures for this showcase.</p>
              </figure>
            </section>`,
        },
        {
          title: 'Match statistics (JavaScript, page theme)',
          description: '<code>createStatCard()</code> builds the same markup from data. <code>dark: false</code> follows the page theme (try dark mode); each bar can take its own gradient (<code>from</code> / <code>to</code>) and colour (<code>fill</code>), and <code>sort</code> puts the largest first.',
          code: `
            import { createStatCard } from 'mudtail';

            const { element, dispose } = createStatCard({
              dark: false,
              eyebrow: 'Matchday 12', title: 'Northbridge ran the midfield',
              caption: 'Pass accuracy',
              items: [
                { label: 'Northbridge', value: 89, icon: 'trophy', highlight: true, from: '#15803d', to: '#86efac' },
                { label: 'Harbour City', value: 74, icon: 'trophy', fill: '#93c5fd' },
                { label: 'League average', value: 79, icon: 'globe' },
              ],
              sort: true,
              source: 'Source: <a href="#">match data</a>',
            });
            host.appendChild(element);`,
          mount(el) {
            const card = createStatCard({
              dark: false,
              eyebrow: 'Matchday 12',
              title: 'Northbridge ran the midfield',
              lead: 'Northbridge completed more passes than any side this season, and won 2–1.',
              caption: 'Pass accuracy',
              items: [
                { label: 'Northbridge', value: 89, icon: 'trophy', highlight: true, from: '#15803d', to: '#86efac' },
                { label: 'Harbour City', value: 74, icon: 'trophy', fill: 'color-mix(in srgb, #3b82f6 35%, var(--mud-palette-surface))' },
                { label: 'League average', value: 79, icon: 'globe' },
              ],
              sort: true,
              source: 'Source: <a href="#">match data</a>',
            });
            card.element.style.border = '1px solid var(--mud-palette-lines-default)';
            el.appendChild(card.element);
            return card.dispose;
          },
        },
        {
          title: 'Compact card, plain numbers',
          description: 'Without a title it is just the card, for an article or a sidebar. <code>format: \'number\'</code> writes the value as a number; <code>max</code> sets the scale.',
          code: `
            createStatCard({
              compact: true, dark: false, caption: 'Visitors this weekend (thousands)', format: 'number', max: 50,
              items: [
                { label: 'City Gallery', value: 42, icon: 'image', highlight: true, from: '#b45309', to: '#fbbf24' },
                { label: 'Harbour Museum', value: 27, icon: 'image' },
                { label: 'Sculpture garden', value: 15, icon: 'image' },
              ],
            });`,
          mount(el) {
            const card = createStatCard({
              compact: true, dark: false, caption: 'Visitors this weekend (thousands)', format: 'number', max: 50,
              items: [
                { label: 'City Gallery', value: 42, icon: 'image', highlight: true, from: '#b45309', to: '#fbbf24' },
                { label: 'Harbour Museum', value: 27, icon: 'image' },
                { label: 'Sculpture garden', value: 15, icon: 'image' },
              ],
            });
            card.element.style.padding = '0';
            card.element.style.maxInlineSize = '640px';
            el.appendChild(card.element);
            return card.dispose;
          },
        },
      ],
      api: [
        { title: 'Classes', rows: [
          ['.mud-stat-hero', 'The block; <code>--dark</code> for the deep navy look with a glow (otherwise it follows the page theme). Head: <code>__head</code>, <code>__eyebrow</code>, <code>__title</code>, <code>__lead</code>.'],
          ['.mud-stat-card', 'The card: <code>__caption</code> (a <code>&lt;figcaption&gt;</code>), <code>.mud-stat-bars</code> (an <code>&lt;ol&gt;</code>), <code>__source</code>; <code>--compact</code>.'],
          ['.mud-stat-bar', 'A row: <code>__label</code>, <code>__track</code> &gt; <code>__fill</code> (with <code>__icon</code>) + <code>__value</code>. <code>is-highlight</code>: gradient and large value.'],
          ['Custom properties', '<code>--mud-stat-value</code>, <code>--mud-stat-max</code> (100), <code>--mud-stat-from</code> / <code>--mud-stat-to</code> (the gradient), <code>--mud-stat-fill</code>, <code>--mud-stat-label-width</code>.'],
        ] },
        { title: 'createStatCard(options)', rows: [
          ['eyebrow, title, lead, caption, source', 'Texts; <code>source</code> is trusted HTML (links).'],
          ['items', '<code>[{ label, value, display?, icon?, highlight?, from?, to?, fill? }]</code>.'],
          ['max, format, sort, dark, compact, animate, labelWidth', '<code>format</code>: <code>percent</code> (default), <code>number</code> or a function. Returns <code>{ element, dispose }</code>.'],
        ] },
        BEHAVIOUR('stat-bars', ' Options: <code>data-delay</code>, <code>data-duration</code>. It only animates <code>--mud-stat-progress</code>; without it (or with reduced motion) bars are full.'),
        { title: 'Blazor', rows: [['create("statCard", host, options)', 'Handle methods: update, dispose.']] },
      ],
    }),
  },
  {
    id: 'reveal', label: 'Scroll reveal & progress', icon: 'sparkles',
    render: () => componentPage({
      title: 'Scroll reveal and reading progress', kinds: ['Behaviour'],
      lead: 'GSAP entrance animations when content scrolls into view, and a reading-progress bar. Content is only hidden once the script runs, and never with reduced motion.',
      examples: [{
        title: 'Reveal', description: 'Scroll this page: the tiles animate in one after another (they appear at once with reduced motion).',
        html: `
          <div class="cp-grid" data-mud-reveal="fade-up" data-mud-reveal-stagger="0.1">
            <div class="cp-tile mud-elevation-2">fade-up</div><div class="cp-tile mud-elevation-2">staggered</div>
            <div class="cp-tile mud-elevation-2">by</div><div class="cp-tile mud-elevation-2">0.1s</div>
          </div>
          <div class="cp-row" style="margin-block-start: 16px">
            <div class="cp-tile mud-elevation-2" style="flex: 1" data-mud-reveal="slide-start">slide-start</div>
            <div class="cp-tile mud-elevation-2" style="flex: 1" data-mud-reveal="zoom">zoom</div>
            <div class="cp-tile mud-elevation-2" style="flex: 1" data-mud-reveal="slide-end">slide-end</div>
          </div>`,
      }],
      api: [{ title: 'Attributes', rows: [
        ['data-mud-reveal', '<code>fade-up</code> (default), <code>fade</code>, <code>zoom</code>, <code>slide-start</code>, <code>slide-end</code> (mirrored in RTL).'],
        ['data-mud-reveal-stagger, data-mud-reveal-delay', 'Animate the children in turn; delay in seconds.'],
        ['data-mud="reading-progress"', 'A <code>.mud-reading-progress</code> bar; <code>data-target</code> tracks one element instead of the page.'],
      ] }],
    }),
  },
  {
    id: 'dock', label: 'Dock layout', icon: 'dock',
    render: () => componentPage({
      title: 'Dock layout', kinds: ['JS', 'Blazor'],
      lead: 'The IDE docking workspace (see the full <a href="#/dock">VS 2026 Dock</a> view). Drag tabs onto a block\'s centre to merge, onto an edge to split; drag the empty tab bar to move a block; ⋯ for more.',
      examples: [{
        title: 'Two blocks',
        code: `
          import { MudDock } from 'mudtail';

          const dock = new MudDock({
            definitions: [
              { key: 'notes', title: 'Notes', render: () => '<p>…</p>' },
              { key: 'list', title: 'List', render: () => '<ul>…</ul>' },
            ],
            defaultLayout: (m) => ({ root: m.newSplit('row', [m.newGroup([m.createPanel('notes')]), m.newGroup([m.createPanel('list')])]) }),
          });
          host.appendChild(dock.getElement());   // the host needs a height
          // later: dock.dispose();`,
        mount(el) {
          const host = document.createElement('div');
          host.style.blockSize = '320px';
          const dock = new MudDock({
            definitions: [
              { key: 'notes', title: 'Notes', render: () => '<div style="padding: 12px">Drag this tab next to "List" or onto its edges.</div>' },
              { key: 'list', title: 'List', render: () => '<ul style="margin: 12px"><li>Merge in the centre</li><li>Split on an edge</li><li>Double-click the tab bar to maximize</li></ul>' },
              { key: 'note', title: 'Block', allowMultiple: true, render: () => '<div style="padding: 12px">A new block.</div>' },
            ],
            defaultLayout: (m) => ({ root: m.newSplit('row', [m.newGroup([m.createPanel('notes')]), m.newGroup([m.createPanel('list')], { weight: 1.4 })]) }),
          });
          host.appendChild(dock.getElement());
          el.appendChild(host);
          return () => dock.dispose();
        },
      }],
      api: [
        { title: 'Options', rows: [['definitions', '<code>[{ key, title, icon?, allowMultiple?, document?, render(panel, ctx) }]</code>.'], ['defaultLayout(model)', 'Returns <code>{ root, left?, right? }</code>; or <code>DockModel.layoutFrom(saved)</code>.'], ['storageKey', 'Save / restore the layout in localStorage.']] },
        { title: 'Blazor', rows: [['create("dock", host, options, dotNetRef)', 'Panels are Blazor components mounted as JS root components. See the README, "MudDock from Blazor".']] },
      ],
    }),
  },
];
