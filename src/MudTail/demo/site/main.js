// Public-site showcase: renders a news / sports / arts front page with the same markup a Razor page
// would emit, then lets autoInit attach the behaviours. Nothing here is library code.
import '../i18n/index.js'; // first: sets the language (and direction) before anything renders
import '../../src/styles/mudtail.scss';
import '../styles/demo.css';
import { initTheme, autoInit, setDirection, getDirection, getLocale } from 'mudtail';
import { languageButton } from '../i18n/index.js';
import { art, SITE_NAME, NAV, BREAKING, HERO, LATEST, MOST_READ, MATCHES, TABLE, GALLERY } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  moon: '<svg class="mud-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg class="mud-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

// ---------- Components (the markup contract) ----------

function articleCard(a, i, variant = '') {
  return `
  <article class="mud-article ${variant}">
    <a class="mud-article__media" href="#longread" tabindex="-1" aria-hidden="true">
      <img src="${art(i + 1)}" alt="" loading="lazy">
      ${a.live ? '<span class="mud-badge mud-badge--live">Live</span>' : ''}
    </a>
    <div class="mud-article__body">
      <a class="mud-kicker" href="#latest">${esc(a.kicker)}</a>
      <h3 class="mud-article__title"><a href="#longread">${esc(a.title)}</a></h3>
      ${a.excerpt && variant !== 'mud-article--row' ? `<p class="mud-article__excerpt">${esc(a.excerpt)}</p>` : ''}
      <div class="mud-meta"><span>${esc(a.author)}</span><time>${esc(a.time)}</time>${a.read ? `<span>${esc(a.read)}</span>` : ''}</div>
    </div>
  </article>`;
}

function megaNav() {
  const items = NAV.map((n) => {
    const id = `nav-${slug(n.title)}`;
    const panel = n.columns ? `
      <button type="button" class="mud-mega-nav__expander" aria-controls="${id}" aria-label="${esc(n.title)} sections"></button>
      <div class="mud-mega-nav__panel" id="${id}">
        <div class="mud-mega-nav__columns">
          ${n.columns.map((c) => `<div><h3 class="mud-mega-nav__heading">${esc(c.heading)}</h3><ul>${c.links.map((l) => `<li><a href="${n.href}">${esc(l)}</a></li>`).join('')}</ul></div>`).join('')}
          <div class="mud-mega-nav__feature">${articleCard(HERO[n.feature % HERO.length] ?? LATEST[0], n.feature, 'mud-article--row')}</div>
        </div>
      </div>` : '';
    return `<li class="mud-mega-nav__item"><a class="mud-mega-nav__link" href="${n.href}">${esc(n.title)}</a>${panel}</li>`;
  }).join('');
  return `<nav class="mud-mega-nav" id="site-nav" data-mud="mega-nav" aria-label="Main"><ul class="mud-mega-nav__list mud-container">${items}</ul></nav>`;
}

function ticker() {
  return `
  <div class="mud-ticker" data-mud="ticker" data-speed="70" aria-label="Breaking news">
    <span class="mud-ticker__label">Breaking</span>
    <div class="mud-ticker__viewport">
      <ul class="mud-ticker__track">${BREAKING.map(([t, h]) => `<li><time>${t}</time><a href="#latest">${esc(h)}</a></li>`).join('')}</ul>
    </div>
    <button type="button" class="mud-ticker__toggle"></button>
  </div>`;
}

function scoreChip(m) {
  const team = ([, code, score]) => `<span class="mud-score-chip__team"><img class="mud-crest" src="${art(code.charCodeAt(0), 64, 64)}" alt=""> ${code} ${score !== undefined ? `<b class="mud-score">${score}</b>` : ''}</span>`;
  return `<a class="mud-score-chip" data-status="${m.status}" href="#sport"><span class="mud-score-chip__status">${esc(m.status === 'upcoming' ? m.kickoff : m.label)}</span>${team(m.home)}${team(m.away)}</a>`;
}

function matchCard(m) {
  const team = ([name, code]) => `<div class="mud-match__team"><img class="mud-crest mud-crest--lg" src="${art(code.charCodeAt(0), 96, 96)}" alt=""><span>${esc(name)}</span></div>`;
  const centre = m.status === 'upcoming'
    ? `<span class="mud-match__kickoff">${esc(m.kickoff)}</span>`
    : `<div class="mud-match__score" aria-label="${m.home[2]} to ${m.away[2]}"><b class="mud-score">${m.home[2]}</b><span>–</span><b class="mud-score">${m.away[2]}</b></div>`;
  return `
  <article class="mud-match" data-status="${m.status}" ${m.status === 'live' ? 'data-mud="score-strip"' : ''}>
    <header class="mud-match__header"><span class="mud-match__competition">${esc(m.comp)}</span><span class="mud-match__status">${esc(m.status === 'live' ? `Live ${m.label}` : m.label)}</span></header>
    <div class="mud-match__teams">${team(m.home)}${centre}${team(m.away)}</div>
    ${m.events.length ? `<ul class="mud-match__events">${m.events.map(([side, e]) => `<li data-side="${side}">${esc(e)}</li>`).join('')}</ul>` : ''}
    <footer class="mud-match__footer"><span>${esc(m.venue)}</span><a href="#sport">Match centre</a></footer>
  </article>`;
}

function leagueTable() {
  const rows = TABLE.map(([team, p, w, d, l, gd, form, zone], i) => `
    <tr ${zone ? `data-zone="${zone}"` : ''} ${team === 'Northbridge' ? 'aria-current="true"' : ''}>
      <td class="mud-league-table__pos">${i + 1}</td>
      <th scope="row" class="mud-league-table__team"><span><img class="mud-crest" src="${art(team.charCodeAt(0), 64, 64)}" alt="">${esc(team)}</span></th>
      <td>${p}</td><td class="mud-league-table__optional">${w}</td><td class="mud-league-table__optional">${d}</td><td class="mud-league-table__optional">${l}</td>
      <td>${gd > 0 ? `+${gd}` : gd}</td><td class="mud-league-table__pts">${w * 3 + d}</td>
      <td class="mud-league-table__optional"><span class="mud-form">${[...form].map((r) => `<span class="mud-form__result" data-result="${r}" title="${{ W: 'Won', D: 'Drawn', L: 'Lost' }[r]}">${r}</span>`).join('')}</span></td>
    </tr>`).join('');
  return `
  <div class="mud-table-scroll">
    <table class="mud-league-table">
      <caption>Premier League</caption>
      <thead><tr><th scope="col">#</th><th scope="col" class="mud-league-table__team">Team</th><th scope="col"><abbr title="Played">P</abbr></th>
        <th scope="col" class="mud-league-table__optional"><abbr title="Won">W</abbr></th><th scope="col" class="mud-league-table__optional"><abbr title="Drawn">D</abbr></th><th scope="col" class="mud-league-table__optional"><abbr title="Lost">L</abbr></th>
        <th scope="col"><abbr title="Goal difference">GD</abbr></th><th scope="col"><abbr title="Points">Pts</abbr></th><th scope="col" class="mud-league-table__optional">Form</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="mud-zone-legend"><span style="--zone: var(--mud-palette-success)">Champions League</span><span style="--zone: var(--mud-palette-info)">Europa League</span><span style="--zone: var(--mud-palette-warning)">Play-off</span><span style="--zone: var(--mud-palette-error)">Relegation</span></div>`;
}

function gallery() {
  return `
  <div class="mud-masonry" data-mud="lightbox" data-mud-reveal="fade" >
    ${GALLERY.map(([title, artist, w, h], i) => `
      <figure class="mud-masonry__item">
        <a href="${art(i + 20, w * 1.5, h * 1.5)}" data-mud-lightbox-item data-caption="${esc(`${title} — ${artist}`)}">
          <img src="${art(i + 20, w / 2, h / 2)}" width="${w / 2}" height="${h / 2}" alt="${esc(title)}" loading="lazy">
        </a>
        <figcaption>${esc(title)} <span>${esc(artist)}</span></figcaption>
      </figure>`).join('')}
  </div>`;
}

// ---------- Page ----------

function page() {
  const today = new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `
  <div class="mud-site">
    <a class="mud-skip-link" href="#main">Skip to content</a>
    <div class="mud-reading-progress" data-mud="reading-progress" data-target="#longread" aria-hidden="true"></div>

    <header class="mud-site-header">
      <div class="mud-topbar mud-container">
        <span>${esc(today)}</span>
        <nav aria-label="Showcase">
          <a href="./">← Framework dashboard</a>
          <a href="#" id="demo-dir">Switch to RTL</a>
          <a href="#" id="demo-score">Simulate a goal</a>
        </nav>
      </div>
      <div class="mud-masthead mud-container">
        <button type="button" class="mud-icon-btn mud-nav-toggle" data-mud-nav-toggle aria-controls="site-nav" aria-label="Menu">${ICON.menu}</button>
        <a class="mud-logo" href="#">${SITE_NAME}</a>
        <div class="mud-masthead__actions">
          <button type="button" class="mud-icon-btn" aria-label="Search">${ICON.search}</button>
          <button type="button" class="mud-icon-btn mud-theme-toggle" data-mud="theme-toggle" aria-label="Dark mode">${ICON.moon}${ICON.sun}</button>
          <a href="#">Sign in</a>
        </div>
      </div>
      ${megaNav()}
    </header>

    ${ticker()}
    <div class="mud-score-strip mud-scroller" data-mud="score-strip" aria-label="Live scores">${MATCHES.map(scoreChip).join('')}${MATCHES.map(scoreChip).join('')}</div>

    <main id="main" class="mud-site-main mud-container">
      <section class="mud-hero-grid" aria-label="Top stories" data-mud-reveal data-mud-reveal-stagger="0.08">
        ${articleCard(HERO[0], 0, 'mud-article--overlay mud-article--lead')}
        ${HERO.slice(1).map((a, i) => articleCard(a, i + 1)).join('')}
      </section>

      <div class="mud-split mud-section" id="latest">
        <section>
          <div class="mud-section__header"><h2 class="mud-section__title">Latest</h2><a class="mud-section__more" href="#">All news</a></div>
          <div class="mud-card-grid" data-mud-reveal data-mud-reveal-stagger="0.06">${LATEST.map((a, i) => articleCard(a, i + 6)).join('')}</div>
        </section>
        <aside>
          <div class="mud-section__header"><h2 class="mud-section__title">Most read</h2></div>
          <ol class="mud-article-list" data-mud-reveal="slide-end">
            ${MOST_READ.map((t) => `<li><article class="mud-article"><div class="mud-article__body"><h3 class="mud-article__title"><a href="#longread">${esc(t)}</a></h3></div></article></li>`).join('')}
          </ol>
        </aside>
      </div>

      <section class="mud-section" id="sport" style="--mud-accent: #16a34a">
        <div class="mud-section__header"><h2 class="mud-section__title">Sport</h2><a class="mud-section__more" href="#">Fixtures &amp; results</a></div>
        <div class="mud-split" style="--mud-split-aside: 500px">
          <div class="mud-card-grid" style="--mud-card-min: 280px" data-mud-reveal data-mud-reveal-stagger="0.08">${MATCHES.map(matchCard).join('')}</div>
          <div data-mud-reveal="slide-end">${leagueTable()}</div>
        </div>
      </section>

      <section class="mud-section" id="art" style="--mud-accent: #b45309; --mud-font-headline: Georgia, 'Times New Roman', serif">
        <div class="mud-section__header"><h2 class="mud-section__title">Culture · New acquisitions</h2><a class="mud-section__more" href="#">Visit the collection</a></div>
        ${gallery()}
      </section>

      <section class="mud-section" id="longread" style="--mud-font-headline: Georgia, 'Times New Roman', serif">
        <div class="mud-section__header"><h2 class="mud-section__title">The long read</h2></div>
        <article class="mud-prose" data-mud-reveal>
          <p class="mud-kicker">Climate</p>
          <h1 style="font-family: var(--mud-font-headline); font-size: clamp(1.8rem, 1.2rem + 2vw, 2.8rem); line-height: 1.15; margin: 0.2em 0">${esc(HERO[0].title)}</h1>
          <div class="mud-meta"><span>${esc(HERO[0].author)}</span><time>${esc(HERO[0].time)}</time><span>${esc(HERO[0].read)}</span></div>
          <figure><img src="${art(1, 1200, 640)}" alt="Wetland channels at low tide"><figcaption>Low tide over the restored channels. The scroll bar at the top of the page tracks this article.</figcaption></figure>
          ${Array.from({ length: 4 }, (_, k) => `
          <p>When the last of the old sandbars washed away, the village kept its boats but lost its harbour. The channels silted up, the reed beds thinned, and the birds that once arrived every autumn stopped coming. For twenty years the delta was described in reports as "beyond practical restoration".</p>
          <p>Then a retired dredger captain, a group of fishermen and two hydrologists from the university began moving sand by hand — and later by a borrowed barge — to rebuild the shapes the river used to make on its own. Their method is slow and cheap, and it seems to work.</p>
          ${k === 1 ? '<blockquote>"We are not building the delta. We are giving the river its tools back."</blockquote>' : ''}
          ${k === 2 ? '<h2>What the water remembers</h2>' : ''}`).join('')}
        </article>
      </section>
    </main>

    <footer class="mud-site-footer">
      <div class="mud-container mud-site-footer__columns">
        <div><a class="mud-logo" href="#">${SITE_NAME}</a><p>Independent news, sport and culture.</p></div>
        <div><h2>Sections</h2><ul>${NAV.map((n) => `<li><a href="${n.href}">${esc(n.title)}</a></li>`).join('')}</ul></div>
        <div><h2>About</h2><ul><li><a href="#">Who we are</a></li><li><a href="#">Contact</a></li><li><a href="#">Careers</a></li></ul></div>
        <div><h2>Follow</h2><ul><li><a href="#">Newsletter</a></li><li><a href="#">Podcasts</a></li><li><a href="#">RSS</a></li></ul></div>
      </div>
      <div class="mud-container mud-site-footer__bottom"><span>© ${new Date().getFullYear()} The Daily Mud (fictional showcase)</span><span>Built with MudTail</span></div>
    </footer>
  </div>`;
}

// ---------- Boot ----------

initTheme();
const root = document.getElementById('root');
root.innerHTML = page();
autoInit(document.body);
document.querySelector('.mud-topbar nav').append(languageButton('mud-site-lang'));

// Showcase controls: direction switch, and a live goal to show the score flash (as a Blazor re-render would).
const dirLink = document.getElementById('demo-dir');
const syncDirLabel = () => { dirLink.textContent = getDirection() === 'rtl' ? 'Switch to LTR' : 'Switch to RTL'; };
dirLink.addEventListener('click', (e) => {
  e.preventDefault();
  setDirection(getDirection() === 'rtl' ? 'ltr' : 'rtl');
  syncDirLabel();
});
syncDirLabel();

document.getElementById('demo-score').addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelectorAll('[data-status="live"] .mud-score').forEach((s, i) => {
    if (i % 2 === 0) s.textContent = String(Number(s.textContent) + 1);
  });
});
