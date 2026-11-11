// MudTail Animator: styles, injected by the plugin (inside @layer components). Colours come from MudTail's palette
// tokens, so the Studio follows the theme and dark mode; the plugin adds a few --mud-animator-* tokens of its own.

export const ANIMATOR_TOKENS = {
  'animator-checker-a': { light: '#e5e7eb', dark: '#1f2937' },
  'animator-checker-b': { light: '#f3f4f6', dark: '#111827' },
  'animator-guide': '#f43f5e',
  'animator-select': 'var(--mud-palette-primary)',
  'animator-clip-core': { light: '#6366f1', dark: '#818cf8' },
  'animator-clip-svg': { light: '#0891b2', dark: '#22d3ee' },
  'animator-clip-text': { light: '#d97706', dark: '#fbbf24' },
  'animator-clip-motion': { light: '#059669', dark: '#34d399' },
  'animator-clip-physics': { light: '#dc2626', dark: '#f87171' },
  'animator-clip-other': { light: '#7c3aed', dark: '#a78bfa' },
};

/** What a page that only plays scenes needs: the stage, layers and player controls. */
export const ANIMATOR_PLAYER_CSS = `
/* ───── player & stage (sites) ───── */
.mud-anim-player { position: relative; display: block; width: 100%; }
.mud-anim-frame { position: relative; width: 100%; overflow: hidden; outline: none; touch-action: pan-y; }
.mud-anim-frame:focus-visible { box-shadow: 0 0 0 3px rgb(var(--mud-palette-primary-rgb) / .6); }
.mud-anim-stage { position: absolute; inset-block-start: 0; inset-inline-start: 0; overflow: hidden; direction: ltr; }
.mud-anim-layer { position: absolute; box-sizing: border-box; will-change: transform; }
.mud-anim-layer > svg { display: block; }
.mud-anim-text { width: 100%; height: 100%; white-space: pre-wrap; overflow-wrap: break-word; }
.mud-anim-text.is-editing { outline: 2px dashed var(--mud-animator-select); outline-offset: 4px; cursor: text; }
.mud-anim-caret::after { content: ''; display: inline-block; inline-size: .08em; block-size: 1em; margin-inline-start: .06em; vertical-align: -.1em; background: currentColor; animation: mud-anim-blink 1s steps(1) infinite; }
@keyframes mud-anim-blink { 50% { opacity: 0; } }
.mud-anim-media { display: block; width: 100%; height: 100%; }
.mud-anim-canvas { display: block; width: 100%; height: 100%; }
.mud-anim-html { overflow: hidden; }
.mud-anim-audio { color: var(--mud-palette-text-secondary); opacity: .7; }
.mud-anim-controls { display: flex; align-items: center; gap: .5rem; padding: .5rem .25rem 0; }
.mud-anim-ctl { display: inline-grid; place-items: center; inline-size: 2.25rem; block-size: 2.25rem; border: 1px solid var(--mud-palette-lines-default); border-radius: 999px; background: var(--mud-palette-surface); color: var(--mud-palette-text-primary); cursor: pointer; }
.mud-anim-ctl:hover { border-color: var(--mud-palette-primary); color: var(--mud-palette-primary); }
.mud-anim-scrub { flex: 1; accent-color: var(--mud-palette-primary); }
.mud-anim-dots { display: flex; flex: 1; justify-content: center; gap: .4rem; }
.mud-anim-dot { inline-size: .65rem; block-size: .65rem; border-radius: 999px; border: 0; padding: 0; background: var(--mud-palette-lines-default); cursor: pointer; transition: inline-size .25s, background .25s; }
.mud-anim-dot[aria-selected="true"] { inline-size: 1.6rem; background: var(--mud-palette-primary); }
@media (prefers-reduced-motion: reduce) { .mud-anim-caret::after { animation: none; } }

`;

/** The Studio (editor) on top of the player styles. */
export const ANIMATOR_STUDIO_CSS = `
/* ───── studio layout ───── */
.mud-anim-studio { --tl-left: 220px; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) minmax(170px, 33%) auto; block-size: 100%; min-block-size: 640px;
  background: var(--mud-palette-background); color: var(--mud-palette-text-primary); font-size: 13px; line-height: 1.35; overflow: hidden; position: relative; }
.mud-anim-studio *, .mud-anim-studio *::before, .mud-anim-studio *::after { box-sizing: border-box; }
.mud-anim-main { display: grid; grid-template-columns: 264px minmax(0, 1fr) 330px; min-block-size: 0; }
.mud-anim-left, .mud-anim-right { display: flex; flex-direction: column; min-block-size: 0; background: var(--mud-palette-surface); }
.mud-anim-left { border-inline-end: 1px solid var(--mud-palette-lines-default); }
.mud-anim-right { border-inline-start: 1px solid var(--mud-palette-lines-default); }
.mud-anim-center { display: flex; flex-direction: column; min-inline-size: 0; min-block-size: 0; }
.mud-anim-bottom { display: flex; flex-direction: column; min-block-size: 0; min-inline-size: 0; border-block-start: 1px solid var(--mud-palette-lines-default); background: var(--mud-palette-surface); }
.mud-anim-status { padding: .3rem .75rem; font-size: 12px; color: var(--mud-palette-text-secondary); border-block-start: 1px solid var(--mud-palette-lines-default); background: var(--mud-palette-surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 1180px) { .mud-anim-main { grid-template-columns: 220px minmax(0, 1fr) 290px; } }
@media (max-width: 900px) {
  .mud-anim-studio { grid-template-rows: auto auto auto auto; overflow: auto; block-size: auto; }
  .mud-anim-main { grid-template-columns: 1fr; }
  .mud-anim-center { block-size: 60vh; order: -1; }
  .mud-anim-left, .mud-anim-right { max-block-size: 45vh; border: 0; border-block-start: 1px solid var(--mud-palette-lines-default); }
  .mud-anim-bottom { block-size: 45vh; }
}

/* ───── top bar ───── */
.mud-anim-topbar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .4rem .6rem; background: var(--mud-palette-surface); border-block-end: 1px solid var(--mud-palette-lines-default); }
.mud-anim-brand { display: inline-flex; align-items: center; gap: .4rem; color: var(--mud-palette-primary); font-size: 14px; white-space: nowrap; }
.mud-anim-brand strong { color: var(--mud-palette-text-primary); }
.mud-anim-scene-name { min-inline-size: 8rem; max-inline-size: 16rem; padding: .3rem .5rem; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-weight: 600; }
.mud-anim-scene-name:hover, .mud-anim-scene-name:focus { border-color: var(--mud-palette-lines-default); background: var(--mud-palette-background); outline: none; }
.mud-anim-dirty { color: var(--mud-palette-warning, #f59e0b); font-size: 10px; }
.mud-anim-group { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: var(--mud-palette-background); }
.mud-anim-spacer { flex: 1; }
.mud-anim-time { min-inline-size: 7.5rem; padding: 0 .5rem; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--mud-palette-text-secondary); text-align: center; }
.mud-anim-ibtn { display: inline-flex; align-items: center; justify-content: center; gap: .3rem; min-inline-size: 30px; block-size: 30px; padding: 0 .35rem; border: 0; border-radius: 6px; background: transparent; color: var(--mud-palette-text-primary); cursor: pointer; }
.mud-anim-ibtn:hover:not(:disabled) { background: rgb(var(--mud-palette-primary-rgb) / .12); color: var(--mud-palette-primary); }
.mud-anim-ibtn[aria-pressed="true"] { background: rgb(var(--mud-palette-primary-rgb) / .18); color: var(--mud-palette-primary); }
.mud-anim-ibtn:disabled { opacity: .35; cursor: default; }
.mud-anim-ibtn.is-faint { opacity: .35; }
.mud-anim-ibtn.is-off { opacity: .55; }
.mud-anim-ibtn__text { font-size: 12px; }
.mud-anim-play { background: var(--mud-palette-primary) !important; color: var(--mud-palette-primary-contrast, #fff) !important; }
.mud-anim-btn { display: inline-flex; align-items: center; gap: .35rem; padding: .4rem .75rem; border: 1px solid var(--mud-palette-lines-default); border-radius: 8px; background: var(--mud-palette-surface); color: var(--mud-palette-text-primary); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
.mud-anim-btn:hover { border-color: var(--mud-palette-primary); color: var(--mud-palette-primary); }
.mud-anim-btn--primary { background: var(--mud-palette-primary); border-color: var(--mud-palette-primary); color: var(--mud-palette-primary-contrast, #fff); }
.mud-anim-btn--primary:hover { color: var(--mud-palette-primary-contrast, #fff); filter: brightness(1.08); }
.mud-anim-btn--text { border-color: transparent; background: transparent; padding-inline: .4rem; color: var(--mud-palette-primary); }
.mud-anim-btn--danger { color: var(--mud-palette-error); }
.mud-anim-btn svg, .mud-anim-ibtn svg { flex: none; }

/* ───── tabs, sections, fields ───── */
.mud-anim-tabs { display: flex; border-block-end: 1px solid var(--mud-palette-lines-default); }
.mud-anim-tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: .3rem; padding: .55rem .25rem; border: 0; border-block-end: 2px solid transparent; background: none; color: var(--mud-palette-text-secondary); font: inherit; font-weight: 600; cursor: pointer; }
.mud-anim-tab[aria-selected="true"] { color: var(--mud-palette-primary); border-block-end-color: var(--mud-palette-primary); }
.mud-anim-tab:disabled { opacity: .4; cursor: default; }
.mud-anim-library, .mud-anim-inspector { flex: 1; overflow: auto; padding: .5rem .65rem 1.5rem; }
.mud-anim-section { border-block-end: 1px solid var(--mud-palette-lines-default); padding-block: .25rem .6rem; }
.mud-anim-section__title { display: flex; align-items: center; gap: .5rem; padding: .45rem 0; cursor: pointer; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--mud-palette-text-secondary); list-style: none; }
.mud-anim-section__title::-webkit-details-marker { display: none; }
.mud-anim-section__title::before { content: '▸'; transition: rotate .15s; }
.mud-anim-section[open] > .mud-anim-section__title::before { rotate: 90deg; }
.mud-anim-section-title { margin: .75rem 0 .4rem; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--mud-palette-text-secondary); }
.mud-anim-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem .5rem; }
.mud-anim-field { display: flex; flex-direction: column; gap: .15rem; min-inline-size: 0; position: relative; }
.mud-anim-field--wide { grid-column: 1 / -1; }
.mud-anim-field__label { font-size: 11px; color: var(--mud-palette-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-field.is-override .mud-anim-field__label { color: var(--mud-palette-warning, #d97706); font-weight: 700; }
.mud-anim-field.is-override .mud-anim-field__label::before { content: '● '; }
.mud-anim-reset { position: absolute; inset-block-start: -4px; inset-inline-end: 0; min-inline-size: 22px; block-size: 22px; }
.mud-anim-input { inline-size: 100%; min-inline-size: 0; padding: .3rem .45rem; border: 1px solid var(--mud-palette-lines-inputs, var(--mud-palette-lines-default)); border-radius: 6px; background: var(--mud-palette-background); color: var(--mud-palette-text-primary); font: inherit; }
.mud-anim-input:focus { outline: 2px solid rgb(var(--mud-palette-primary-rgb) / .45); outline-offset: 0; border-color: var(--mud-palette-primary); }
.mud-anim-textarea { resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.mud-anim-range { accent-color: var(--mud-palette-primary); inline-size: 7rem; }
.mud-anim-check { accent-color: var(--mud-palette-primary); inline-size: 1rem; block-size: 1rem; }
.mud-anim-color { display: flex; gap: .3rem; align-items: center; }
.mud-anim-color input[type="color"] { flex: none; inline-size: 30px; block-size: 28px; padding: 0; border: 1px solid var(--mud-palette-lines-default); border-radius: 6px; background: none; cursor: pointer; }
.mud-anim-row { display: flex; align-items: center; gap: .4rem; }
.mud-anim-wrap-row { flex-wrap: wrap; }
.mud-anim-inline { display: inline-flex; align-items: center; gap: .35rem; margin-inline-end: .6rem; cursor: pointer; }
.mud-anim-note { margin: .4rem 0; font-size: 12px; color: var(--mud-palette-text-secondary); }
.mud-anim-note.is-override { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .4rem .55rem; border-radius: 8px; background: rgb(245 158 11 / .12); color: var(--mud-palette-text-primary); }
.mud-anim-badge { display: inline-block; padding: .1rem .45rem; border-radius: 999px; background: rgb(var(--mud-palette-primary-rgb) / .14); color: var(--mud-palette-primary); font-size: 11px; font-weight: 700; white-space: nowrap; }
.mud-anim-chip { padding: .15rem .55rem; border-radius: 999px; background: var(--mud-palette-background); font-size: 11px; color: var(--mud-palette-text-secondary); }
.mud-anim-chip.is-override { background: rgb(245 158 11 / .16); color: var(--mud-palette-warning, #b45309); font-weight: 700; }
.mud-anim-chipbtn { padding: .25rem .55rem; border: 1px solid var(--mud-palette-lines-default); border-radius: 999px; background: var(--mud-palette-surface); color: var(--mud-palette-text-primary); font: inherit; font-size: 12px; cursor: pointer; }
.mud-anim-chipbtn:hover, .mud-anim-chipbtn[aria-pressed="true"] { border-color: var(--mud-palette-primary); color: var(--mud-palette-primary); background: rgb(var(--mud-palette-primary-rgb) / .08); }
.mud-anim-card { padding: .55rem; margin-block-end: .5rem; border: 1px solid var(--mud-palette-lines-default); border-radius: 10px; background: var(--mud-palette-background); }
.mud-anim-card.is-current { border-color: var(--mud-palette-primary); }
.mud-anim-ins-head { display: flex; align-items: center; gap: .4rem; padding-block: .3rem .5rem; }
.mud-anim-ins-name { font-weight: 700; }
.mud-anim-ins-actions { display: flex; flex: none; }
.mud-anim-align { display: flex; flex-wrap: wrap; gap: 2px; }

/* ───── library ───── */
.mud-anim-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: .35rem; }
.mud-anim-tiles.is-small { grid-template-columns: repeat(4, 1fr); }
.mud-anim-tiles.is-icons { grid-template-columns: repeat(6, 1fr); gap: 2px; padding-block-end: .5rem; }
.mud-anim-tile { display: flex; flex-direction: column; align-items: center; gap: .25rem; padding: .5rem .25rem; border: 1px solid var(--mud-palette-lines-default); border-radius: 8px; background: var(--mud-palette-background); color: var(--mud-palette-text-primary); font: inherit; cursor: pointer; min-inline-size: 0; }
.mud-anim-tile:hover { border-color: var(--mud-palette-primary); color: var(--mud-palette-primary); }
.mud-anim-tile__art { display: grid; place-items: center; block-size: 30px; color: var(--mud-palette-primary); }
.mud-anim-tile__label { font-size: 11px; inline-size: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-iconbtn { display: grid; place-items: center; aspect-ratio: 1; border: 0; border-radius: 6px; background: none; color: var(--mud-palette-text-primary); cursor: pointer; }
.mud-anim-iconbtn:hover { background: rgb(var(--mud-palette-primary-rgb) / .12); color: var(--mud-palette-primary); }
.mud-anim-dropzone { display: flex; flex-direction: column; align-items: center; gap: .35rem; padding: 1rem; margin-block: .25rem .75rem; border: 2px dashed var(--mud-palette-lines-default); border-radius: 10px; color: var(--mud-palette-text-secondary); text-align: center; cursor: pointer; }
.mud-anim-dropzone.is-over, .mud-anim-dropzone:hover { border-color: var(--mud-palette-primary); color: var(--mud-palette-primary); }
.mud-anim-assets { display: flex; flex-direction: column; gap: .35rem; }
.mud-anim-asset { display: flex; align-items: center; gap: .5rem; padding: .3rem; border-radius: 8px; background: var(--mud-palette-background); }
.mud-anim-asset__thumb { flex: none; display: grid; place-items: center; inline-size: 48px; block-size: 40px; padding: 0; border: 1px solid var(--mud-palette-lines-default); border-radius: 6px; overflow: hidden; background: repeating-conic-gradient(var(--mud-animator-checker-a) 0 25%, var(--mud-animator-checker-b) 0 50%) 0 0 / 10px 10px; color: var(--mud-palette-text-secondary); cursor: pointer; }
.mud-anim-asset__thumb img { inline-size: 100%; block-size: 100%; object-fit: cover; }
.mud-anim-asset__meta { display: flex; flex-direction: column; min-inline-size: 0; flex: 1; }
.mud-anim-asset__name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-asset__info { font-size: 11px; color: var(--mud-palette-text-secondary); }
.mud-anim-tree { display: flex; flex-direction: column; }
.mud-anim-tree__item { display: flex; align-items: center; gap: .3rem; padding-block: .2rem; padding-inline-end: .2rem; border-radius: 6px; cursor: pointer; user-select: none; }
.mud-anim-tree__item:hover { background: var(--mud-palette-background); }
.mud-anim-tree__item.is-selected { background: rgb(var(--mud-palette-primary-rgb) / .14); color: var(--mud-palette-primary); }
.mud-anim-tree__item.is-hidden .mud-anim-tree__name { opacity: .45; text-decoration: line-through; }
.mud-anim-tree__item[data-drop="above"] { box-shadow: inset 0 2px 0 var(--mud-palette-primary); }
.mud-anim-tree__item[data-drop="below"] { box-shadow: inset 0 -2px 0 var(--mud-palette-primary); }
.mud-anim-tree__item[data-drop="into"] { outline: 2px solid var(--mud-palette-primary); }
.mud-anim-tree__icon { display: inline-grid; color: var(--mud-palette-text-secondary); }
.mud-anim-tree__name { flex: 1; min-inline-size: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-tree__count { padding: 0 .35rem; border-radius: 999px; background: rgb(var(--mud-palette-primary-rgb) / .14); color: var(--mud-palette-primary); font-size: 10px; font-weight: 700; }
.mud-anim-tree__item .mud-anim-ibtn { min-inline-size: 22px; block-size: 22px; padding: 0; }

/* ───── stage area ───── */
.mud-anim-stagebar { display: flex; align-items: center; gap: .4rem; padding: .3rem .6rem; border-block-end: 1px solid var(--mud-palette-lines-default); background: var(--mud-palette-surface); }
.mud-anim-stagebar__view { font-weight: 600; font-size: 12px; }
.mud-anim-zoom { min-inline-size: 3.5rem; padding: .2rem .35rem; border: 0; border-radius: 6px; background: var(--mud-palette-background); color: inherit; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; }
.mud-anim-viewport { position: relative; flex: 1; display: grid; place-items: center; overflow: auto; padding: 24px; outline: none; min-block-size: 0;
  background: repeating-conic-gradient(var(--mud-animator-checker-a) 0 25%, var(--mud-animator-checker-b) 0 50%) 0 0 / 20px 20px; }
.mud-anim-viewport.is-drop { box-shadow: inset 0 0 0 3px var(--mud-palette-primary); }
.mud-anim-wrap { position: relative; flex: none; box-shadow: 0 10px 40px rgb(0 0 0 / .25); }
.mud-anim-wrap > .mud-anim-stage { position: absolute; inset: 0 auto auto 0; }
.mud-anim-overlay { position: absolute; inset: 0 auto auto 0; pointer-events: none; direction: ltr; }
.mud-anim-sel, .mud-anim-sel-multi { position: absolute; pointer-events: auto; outline: calc(1.5px / var(--zoom, 1)) solid var(--mud-animator-select); cursor: move; }
.mud-anim-sel.is-locked { outline-style: dashed; cursor: default; }
.mud-anim-sel-multi__item { position: absolute; outline: calc(1px / var(--zoom, 1)) dashed var(--mud-animator-select); pointer-events: none; }
.mud-anim-sel__label { position: absolute; inset-block-end: 100%; inset-inline-start: 0; margin-block-end: calc(4px / var(--zoom, 1)); padding: calc(1px / var(--zoom, 1)) calc(5px / var(--zoom, 1)); border-radius: calc(4px / var(--zoom, 1));
  background: var(--mud-animator-select); color: #fff; font-size: calc(11px / var(--zoom, 1)); white-space: nowrap; pointer-events: none; }
.mud-anim-handle { position: absolute; inline-size: calc(10px / var(--zoom, 1)); block-size: calc(10px / var(--zoom, 1)); margin: calc(-5px / var(--zoom, 1)); border: calc(1.5px / var(--zoom, 1)) solid var(--mud-animator-select); border-radius: 2px; background: #fff; }
.mud-anim-handle--nw { left: 0; top: 0; cursor: nwse-resize; } .mud-anim-handle--n { left: 50%; top: 0; cursor: ns-resize; } .mud-anim-handle--ne { left: 100%; top: 0; cursor: nesw-resize; }
.mud-anim-handle--e { left: 100%; top: 50%; cursor: ew-resize; } .mud-anim-handle--se { left: 100%; top: 100%; cursor: nwse-resize; } .mud-anim-handle--s { left: 50%; top: 100%; cursor: ns-resize; }
.mud-anim-handle--sw { left: 0; top: 100%; cursor: nesw-resize; } .mud-anim-handle--w { left: 0; top: 50%; cursor: ew-resize; }
.mud-anim-rotate { position: absolute; left: 50%; top: calc(-28px / var(--zoom, 1)); inline-size: calc(12px / var(--zoom, 1)); block-size: calc(12px / var(--zoom, 1)); margin-inline-start: calc(-6px / var(--zoom, 1)); border-radius: 50%; background: var(--mud-animator-select); cursor: grab; }
.mud-anim-rotate::after { content: ''; position: absolute; left: 50%; top: 100%; inline-size: calc(1.5px / var(--zoom, 1)); block-size: calc(16px / var(--zoom, 1)); background: var(--mud-animator-select); }
.mud-anim-origin { position: absolute; inline-size: calc(8px / var(--zoom, 1)); block-size: calc(8px / var(--zoom, 1)); margin: calc(-4px / var(--zoom, 1)); border: calc(1.5px / var(--zoom, 1)) solid var(--mud-animator-select); border-radius: 50%; pointer-events: none; }
.mud-anim-guides { position: absolute; inset: 0; pointer-events: none; }
.mud-anim-guide { position: absolute; background: var(--mud-animator-guide); }
.mud-anim-guide--x { top: -10000px; bottom: -10000px; inline-size: calc(1px / var(--zoom, 1)); }
.mud-anim-guide--y { left: -10000px; right: -10000px; block-size: calc(1px / var(--zoom, 1)); }
.mud-anim-pathedit { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.mud-anim-pathedit__line { fill: none; stroke: var(--mud-animator-guide); stroke-width: calc(2px / var(--zoom, 1)); stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
.mud-anim-pathedit__point { fill: #fff; stroke: var(--mud-animator-guide); stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: all; cursor: move; }
.mud-anim-pathedit__point.is-start { fill: var(--mud-animator-guide); }

/* ───── timeline ───── */
.mud-anim-tlbar { display: flex; align-items: center; gap: .35rem; padding: .3rem .6rem; border-block-end: 1px solid var(--mud-palette-lines-default); }
.mud-anim-tlbar__title { margin-inline-end: .35rem; }
.mud-anim-tlbar__hint { font-size: 11px; color: var(--mud-palette-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-inline-size: 0; }
.mud-anim-tl { position: relative; flex: 1; overflow: auto; direction: ltr; min-block-size: 0; }
.mud-anim-tl__grid { position: relative; min-block-size: 100%; }
.mud-anim-tl__row { display: flex; block-size: 30px; border-block-end: 1px solid var(--mud-palette-lines-default); }
.mud-anim-tl__row--ruler { position: sticky; top: 0; z-index: 3; block-size: 28px; background: var(--mud-palette-surface); }
.mud-anim-tl__head { position: sticky; left: 0; z-index: 2; flex: none; inline-size: var(--tl-left); display: flex; align-items: center; gap: .25rem; padding-inline-end: .25rem;
  background: var(--mud-palette-surface); border-inline-end: 1px solid var(--mud-palette-lines-default); cursor: pointer; min-inline-size: 0; }
.mud-anim-tl__row--ruler .mud-anim-tl__head { z-index: 4; justify-content: flex-end; padding-inline: .5rem; cursor: default; }
.mud-anim-tl__time { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--mud-palette-primary); }
.mud-anim-tl__head.is-selected { background: rgb(var(--mud-palette-primary-rgb) / .12); color: var(--mud-palette-primary); }
.mud-anim-tl__head .mud-anim-ibtn { min-inline-size: 22px; block-size: 22px; padding: 0; }
.mud-anim-tl__kind { display: inline-grid; color: var(--mud-palette-text-secondary); }
.mud-anim-tl__name { flex: 1; min-inline-size: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-twisty { display: inline-grid; place-items: center; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
.mud-anim-tl__track { position: relative; flex: none; background-image: linear-gradient(to right, var(--mud-palette-lines-default) 1px, transparent 1px); background-size: var(--pps) 100%; }
.mud-anim-tl__track.is-selected { background-color: rgb(var(--mud-palette-primary-rgb) / .05); }
.mud-anim-tl__track.is-hidden { opacity: .45; }
.mud-anim-tl__ruler { position: relative; flex: none; cursor: ew-resize; user-select: none; }
.mud-anim-tick { position: absolute; top: 0; bottom: 0; padding: 2px 0 0 3px; font-size: 10px; line-height: 1; color: var(--mud-palette-text-secondary); pointer-events: none; }
.mud-anim-tick::before { content: ''; position: absolute; left: 0; bottom: 0; block-size: 6px; border-left: 1px solid var(--mud-palette-text-secondary); }
.mud-anim-tick.is-major::before { block-size: 12px; }
.mud-anim-tl__end { position: absolute; top: 0; bottom: 0; inline-size: 2px; background: var(--mud-palette-text-secondary); opacity: .5; }
.mud-anim-label { position: absolute; top: 1px; padding: 0 .35rem; border-radius: 3px 3px 3px 0; background: var(--mud-animator-guide); color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; cursor: grab; z-index: 1; }
.mud-anim-label::after { content: ''; position: absolute; left: 0; top: 100%; inline-size: 1.5px; block-size: 12px; background: var(--mud-animator-guide); }
.mud-anim-playhead { position: absolute; top: 0; bottom: 0; inline-size: 0; z-index: 5; pointer-events: none; }
.mud-anim-playhead::before { content: ''; position: absolute; top: 0; bottom: 0; left: -1px; inline-size: 2px; background: var(--mud-animator-guide); }
.mud-anim-playhead__knob { position: absolute; top: 2px; left: -7px; inline-size: 14px; block-size: 14px; border-radius: 3px 3px 50% 50%; background: var(--mud-animator-guide); pointer-events: auto; cursor: ew-resize; }
.mud-anim-tl__empty { padding: 1rem; color: var(--mud-palette-text-secondary); }
.mud-anim-clip { --c: var(--mud-animator-clip-core); position: absolute; top: 4px; block-size: 22px; display: flex; align-items: center; border-radius: 6px;
  background: color-mix(in srgb, var(--c) 30%, transparent); border: 1px solid var(--c); color: var(--mud-palette-text-primary); font-size: 11px; cursor: grab; overflow: visible; touch-action: none; }
.mud-anim-clip.is-selected { background: var(--c); color: #fff; box-shadow: 0 0 0 2px var(--mud-palette-surface), 0 0 0 4px var(--c); z-index: 1; }
.mud-anim-clip.is-disabled { opacity: .4; background-image: repeating-linear-gradient(45deg, transparent 0 4px, rgb(0 0 0 / .15) 4px 8px); }
.mud-anim-clip--morph, .mud-anim-clip--draw { --c: var(--mud-animator-clip-svg); }
.mud-anim-clip--split, .mud-anim-clip--typewriter, .mud-anim-clip--scramble, .mud-anim-clip--counter { --c: var(--mud-animator-clip-text); }
.mud-anim-clip--motionPath { --c: var(--mud-animator-clip-motion); }
.mud-anim-clip--physics2D, .mud-anim-clip--physicsProps, .mud-anim-clip--bounce, .mud-anim-clip--wiggle { --c: var(--mud-animator-clip-physics); }
.mud-anim-clip--canvas, .mud-anim-clip--media, .mud-anim-clip--css, .mud-anim-clip--set { --c: var(--mud-animator-clip-other); }
.mud-anim-clip__label { display: inline-flex; align-items: center; gap: .25rem; padding-inline: .4rem; min-inline-size: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.mud-anim-clip__edge { position: absolute; top: 0; bottom: 0; inline-size: 7px; cursor: ew-resize; z-index: 1; }
.mud-anim-clip__edge.is-start { left: -2px; } .mud-anim-clip__edge.is-end { right: -2px; }
.mud-anim-clip__repeat { position: absolute; left: 100%; top: 3px; bottom: 3px; border-radius: 0 4px 4px 0; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--c) 35%, transparent) 0 6px, transparent 6px 9px); pointer-events: none; }
.mud-anim-clip__repeat.is-infinite { mask-image: linear-gradient(to right, #000, transparent); }

/* ───── animate tab ───── */
.mud-anim-cliplist { display: flex; flex-direction: column; gap: 2px; }
.mud-anim-clipitem { display: flex; align-items: center; gap: .4rem; padding: .35rem .45rem; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.mud-anim-clipitem:hover { background: var(--mud-palette-background); }
.mud-anim-clipitem.is-selected { background: rgb(var(--mud-palette-primary-rgb) / .14); color: var(--mud-palette-primary); }
.mud-anim-clipitem.is-disabled { opacity: .5; }
.mud-anim-clipitem__name { flex: 1; font-weight: 600; min-inline-size: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-clipitem__time { font-size: 11px; color: var(--mud-palette-text-secondary); font-variant-numeric: tabular-nums; }
.mud-anim-clipedit { margin-block-end: .5rem; padding: .25rem .5rem .5rem; border: 1px solid rgb(var(--mud-palette-primary-rgb) / .4); border-radius: 10px; background: rgb(var(--mud-palette-primary-rgb) / .04); }
.mud-anim-presets__group h4 { margin: .5rem 0 .3rem; font-size: 11px; color: var(--mud-palette-text-secondary); }
.mud-anim-presets__list { display: flex; flex-wrap: wrap; gap: .25rem; }
.mud-anim-vars { display: flex; flex-direction: column; gap: .3rem; }
.mud-anim-vars__head, .mud-anim-vars__row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr) 24px; gap: .3rem; align-items: center; }
.mud-anim-vars__head { font-size: 11px; color: var(--mud-palette-text-secondary); }
.mud-anim-vars__key { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mud-anim-vars__row .mud-anim-ibtn { min-inline-size: 24px; block-size: 24px; padding: 0; }
.mud-anim-vars__row .mud-anim-color input[type="text"] { min-inline-size: 0; }
.mud-anim-ease__body { display: flex; flex-wrap: wrap; gap: .6rem; align-items: flex-start; margin-block-start: .4rem; }
.mud-anim-ease__box { position: relative; flex: none; border-radius: 8px; background: var(--mud-palette-background); }
.mud-anim-ease__fields { flex: 1; min-inline-size: 130px; display: flex; flex-direction: column; gap: .35rem; }
.mud-anim-ease__quick { display: flex; flex-wrap: wrap; gap: .2rem; }
.mud-anim-ease__quick .mud-anim-chipbtn { font-size: 10px; padding: .15rem .4rem; }
.mud-anim-ease__key { display: block; margin-block-start: .3rem; font: 11px ui-monospace, Consolas, monospace; color: var(--mud-palette-text-secondary); }
.mud-anim-ease__handle { position: absolute; left: 0; top: 0; inline-size: 14px; block-size: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--mud-palette-primary); border: 2px solid #fff; box-shadow: 0 1px 4px rgb(0 0 0 / .3); cursor: grab; }
.mud-anim-ease__handle.is-2 { background: var(--mud-animator-guide); }
.mud-anim-ease__arm { position: absolute; block-size: 1.5px; transform-origin: 0 50%; background: var(--mud-palette-text-secondary); pointer-events: none; }

/* ───── dialogs ───── */
.mud-anim-modal { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; background: rgb(0 0 0 / .45); }
.mud-anim-modal__panel { display: flex; flex-direction: column; inline-size: min(560px, 100%); max-block-size: 100%; border-radius: 14px; background: var(--mud-palette-surface); color: var(--mud-palette-text-primary); box-shadow: 0 24px 60px rgb(0 0 0 / .35); overflow: hidden; }
.mud-anim-modal__panel.is-wide { inline-size: min(980px, 100%); }
.mud-anim-modal__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 1rem; border-block-end: 1px solid var(--mud-palette-lines-default); }
.mud-anim-modal__head h2 { margin: 0; font-size: 16px; }
.mud-anim-modal__body { padding: 1rem; overflow: auto; display: flex; flex-direction: column; gap: .75rem; }
.mud-anim-modal__foot { display: flex; justify-content: flex-end; gap: .5rem; padding: .75rem 1rem; border-block-start: 1px solid var(--mud-palette-lines-default); }
.mud-anim-h3 { margin: .25rem 0; font-size: 13px; color: var(--mud-palette-text-secondary); text-transform: uppercase; letter-spacing: .05em; }
.mud-anim-templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .5rem; }
.mud-anim-template, .mud-anim-saved__open { display: flex; flex-direction: column; gap: .25rem; padding: .7rem .8rem; border: 1px solid var(--mud-palette-lines-default); border-radius: 10px; background: var(--mud-palette-background); color: inherit; font: inherit; text-align: start; cursor: pointer; }
.mud-anim-template:hover, .mud-anim-saved__open:hover { border-color: var(--mud-palette-primary); }
.mud-anim-template span, .mud-anim-saved__open span { font-size: 12px; color: var(--mud-palette-text-secondary); }
.mud-anim-saved { display: flex; flex-direction: column; gap: .35rem; }
.mud-anim-saved__row { display: flex; align-items: center; gap: .35rem; }
.mud-anim-saved__open { flex: 1; }
.mud-anim-snippet__head { display: flex; align-items: center; justify-content: space-between; }
.mud-anim-code { margin: .25rem 0 0; padding: .6rem .75rem; max-block-size: 220px; overflow: auto; border-radius: 8px; background: var(--mud-palette-background); font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre; direction: ltr; text-align: left; }
.mud-anim-table { inline-size: 100%; border-collapse: collapse; }
.mud-anim-table th, .mud-anim-table td { padding: .4rem .5rem; border-block-end: 1px solid var(--mud-palette-lines-default); text-align: start; vertical-align: top; }
.mud-anim-table th { white-space: nowrap; color: var(--mud-palette-primary); }
.mud-anim-preview__frame { display: flex; justify-content: center; padding: .5rem; border-radius: 10px; background: repeating-conic-gradient(var(--mud-animator-checker-a) 0 25%, var(--mud-animator-checker-b) 0 50%) 0 0 / 16px 16px; }
.mud-anim-preview__host { max-inline-size: 100%; }
.mud-anim-preview__log { max-block-size: 90px; overflow: auto; font: 11px/1.4 ui-monospace, Consolas, monospace; color: var(--mud-palette-text-secondary); }
`;

export const ANIMATOR_CSS = ANIMATOR_PLAYER_CSS + ANIMATOR_STUDIO_CSS;
