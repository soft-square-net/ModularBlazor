// Fictional sample content for the public-site showcase. Images are generated SVGs (no network).

const PALETTES = [
  ['#1e3a8a', '#60a5fa'], ['#7c2d12', '#fb923c'], ['#14532d', '#4ade80'], ['#581c87', '#c084fc'],
  ['#831843', '#f472b6'], ['#134e4a', '#2dd4bf'], ['#78350f', '#fbbf24'], ['#1f2937', '#9ca3af'],
  ['#3b0764', '#f0abfc'], ['#0c4a6e', '#38bdf8'], ['#422006', '#facc15'], ['#4c0519', '#fb7185'],
];

/** A generated "photo": layered gradient shapes, deterministic per seed. */
export function art(seed, w = 1200, h = 675) {
  const [a, b] = PALETTES[seed % PALETTES.length];
  const r = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const circles = [0, 1, 2].map((n) =>
    `<circle cx="${Math.round(r(n) * w)}" cy="${Math.round(r(n + 3) * h)}" r="${Math.round((0.18 + r(n + 6) * 0.35) * Math.max(w, h))}" fill="${n % 2 ? b : '#fff'}" opacity="${(0.08 + r(n + 9) * 0.18).toFixed(2)}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>${circles}
<path d="M0 ${h * 0.78} Q ${w * 0.3} ${h * (0.6 + r(12) * 0.2)} ${w * 0.6} ${h * 0.76} T ${w} ${h * 0.7} V ${h} H 0 Z" fill="#000" opacity="0.18"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const SITE_NAME = 'The Daily <b>Mud</b>';

export const NAV = [
  { title: 'News', href: '#news', columns: [
    { heading: 'World', links: ['Europe', 'Middle East', 'Africa', 'Americas', 'Asia'] },
    { heading: 'Home', links: ['Politics', 'Economy', 'Education', 'Health'] },
    { heading: 'Explore', links: ['Science', 'Climate', 'Technology'] },
  ], feature: 1 },
  { title: 'Sport', href: '#sport', columns: [
    { heading: 'Football', links: ['Premier League', 'Champions League', 'Transfers', 'Fixtures', 'Tables'] },
    { heading: 'More sport', links: ['Tennis', 'Formula 1', 'Basketball', 'Athletics', 'Squash'] },
  ], feature: 5 },
  { title: 'Culture', href: '#art', columns: [
    { heading: 'Arts', links: ['Painting', 'Sculpture', 'Photography', 'Architecture'] },
    { heading: 'Screen & stage', links: ['Film', 'Theatre', 'Music', 'Books'] },
  ], feature: 9 },
  { title: 'Business', href: '#latest' },
  { title: 'Opinion', href: '#latest' },
  { title: 'Long reads', href: '#longread' },
];

export const BREAKING = [
  ['10:42', 'Coastal rail line reopens after storm repairs finish two weeks early'],
  ['10:15', 'City council approves car-free weekends for the old harbour district'],
  ['09:58', 'Northbridge striker signs four-year contract extension'],
  ['09:31', 'National gallery to open its restored east wing in spring'],
  ['09:02', 'Inflation eases for a third straight month, figures show'],
];

export const HERO = [
  { kicker: 'Climate', title: 'The quiet engineers rebuilding a river delta one sandbar at a time', excerpt: 'Fishermen, hydrologists and a retired dredger captain are restoring wetlands that vanished a generation ago.', author: 'Lina Haddad', time: '35 min ago', read: '9 min read', live: false },
  { kicker: 'Politics', title: 'Coalition talks resume as both sides soften budget demands', author: 'Omar Saleh', time: '1h ago' },
  { kicker: 'Live', title: 'Election night: results from every district as they come in', author: 'Newsroom', time: 'Live', live: true },
  { kicker: 'Science', title: 'Night-sky survey spots a comet that will be visible in March', author: 'Mira Chen', time: '2h ago' },
  { kicker: 'Health', title: 'Walk-in clinics extend weekend hours across the region', author: 'Sara Nabil', time: '3h ago' },
];

export const LATEST = [
  { kicker: 'Economy', title: 'Small ports bet on electric ferries to win back day-trippers', excerpt: 'Three harbour towns have pooled funds for a shared charging pier.', author: 'Daniel Ruiz', time: '4h ago' },
  { kicker: 'Education', title: 'Schools trial a four-day timetable for final-year students', excerpt: 'Teachers say the fifth day is for projects, not homework.', author: 'Hana Youssef', time: '5h ago' },
  { kicker: 'Technology', title: 'A community-built map is now the most accurate in the valley', excerpt: 'Volunteers walked every lane with handheld GPS units over two summers.', author: 'Leo Martins', time: '6h ago' },
  { kicker: 'World', title: 'Border crossing adds night shifts to ease summer queues', excerpt: 'Wait times fell by half in the first week of the trial.', author: 'Nour Adel', time: '6h ago' },
  { kicker: 'Business', title: 'Family bakery chain opens its recipes to apprentices', excerpt: 'The training kitchen takes twelve students a year.', author: 'Peter Holm', time: '7h ago' },
  { kicker: 'Opinion', title: 'Our streets were designed for cars. They do not have to stay that way', excerpt: 'A planner on what changed her mind about the ring road.', author: 'Aya Farouk', time: '8h ago' },
];

export const MOST_READ = [
  'Coastal rail line reopens after storm repairs',
  'The quiet engineers rebuilding a river delta',
  'Night-sky survey spots a comet visible in March',
  'Northbridge striker signs four-year extension',
  'Our streets were designed for cars',
];

export const MATCHES = [
  { status: 'live', label: "72'", comp: 'Premier League', home: ['Northbridge', 'NBR', 2], away: ['Harbour City', 'HBC', 1], venue: 'Riverside Park', events: [['home', "Okafor 23'"], ['away', "Lindqvist 51'"], ['home', "Okafor 66' (pen)"]] },
  { status: 'ht', label: 'HT', comp: 'Premier League', home: ['Eastfield', 'EAS', 0], away: ['Kingsport', 'KSP', 0], venue: 'The Foundry', events: [] },
  { status: 'ft', label: 'FT', comp: 'Cup · Quarter-final', home: ['Westmoor', 'WES', 3], away: ['Old Quay', 'OLQ', 2], venue: 'Moor Lane', events: [['home', "Reyes 12'"], ['away', "Tan 40'"], ['home', "Reyes 77'"], ['away', "Abara 81'"], ['home', "Kowal 90+2'"]] },
  { status: 'upcoming', label: 'Today', comp: 'Premier League', home: ['Southgate', 'SGT'], away: ['Ironvale', 'IRV'], venue: 'Gatehouse Stadium', kickoff: '20:00', events: [] },
];

export const TABLE = [
  ['Northbridge', 12, 9, 2, 1, 27, 'WWDWW', 'champions'],
  ['Harbour City', 12, 8, 3, 1, 19, 'WDWWL', 'champions'],
  ['Westmoor', 12, 7, 3, 2, 14, 'WWLDW', 'europe'],
  ['Kingsport', 12, 6, 4, 2, 9, 'DDWWW', 'europe'],
  ['Eastfield', 12, 5, 4, 3, 6, 'LWDWD', ''],
  ['Old Quay', 12, 4, 4, 4, 1, 'WLDLW', ''],
  ['Southgate', 12, 3, 3, 6, -5, 'LLWDL', 'playoff'],
  ['Ironvale', 12, 2, 4, 6, -9, 'DLLWL', 'relegation'],
  ['Fernhill', 12, 1, 3, 8, -18, 'LLDLL', 'relegation'],
];

export const GALLERY = [
  ['Tide Study No. 4', 'R. Amari, 2024', 900, 1200], ['Harbour at Dusk', 'L. Okonkwo, 2021', 1200, 800],
  ['Untitled (Blue Field)', 'S. Varga, 2019', 900, 900], ['Glass Orchard', 'N. Idris, 2023', 900, 1350],
  ['The Long Table', 'M. Ferreira, 2020', 1200, 750], ['Salt Lines', 'Y. Tanaka, 2022', 900, 1100],
  ['Window, Morning', 'A. Rahman, 2018', 1000, 1000], ['Copper Rain', 'J. Lind, 2024', 900, 1300],
  ['Three Boats', 'E. Duarte, 2017', 1200, 820], ['Field Notes', 'K. Mensah, 2023', 900, 1150],
  ['Evening Market', 'F. Rossi, 2021', 1200, 900], ['Paper Moon', 'H. Saad, 2022', 900, 1250],
];

// Stat hero (fictional figures): % of page visits that load in under two seconds.
export const SPEED = [
  { label: 'The Daily Mud', value: 71, icon: 'news', highlight: true },
  { label: 'Regional dailies', value: 48, icon: 'globe' },
  { label: 'National papers', value: 45, icon: 'docs' },
  { label: 'News aggregators', value: 35, icon: 'dashboard' },
  { label: 'Tabloids', value: 28, icon: 'image' },
];
