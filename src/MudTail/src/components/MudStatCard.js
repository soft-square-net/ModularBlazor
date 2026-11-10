// Builds the stat hero / stat card markup (see src/styles/_stat-hero.scss) from data, for pages rendered in JavaScript.
// Razor pages write the same markup themselves and let autoInit (data-mud="stat-bars") animate it.

import { getIconSvg } from '../core/icons.js';
import { formatNumber } from '../core/i18n.js';
import { attachBehavior } from '../behaviors/autoInit.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uid = 0;

/**
 * @param {object} o
 * @param {string} [o.eyebrow] [o.title] [o.lead]   the hero head (left out when there is no title: a plain card)
 * @param {string} [o.caption]                       what the numbers measure
 * @param {Array} o.items   [{ label, value, display?, icon?: name | svg, highlight?, from?, to?, fill? }]
 *                          display: the text shown (default: value as a percentage of max, in the page's digits)
 * @param {number} [o.max=100]
 * @param {'percent'|'number'|((value) => string)} [o.format='percent']
 * @param {string} [o.source]   trusted HTML under the bars (links to the data)
 * @param {boolean} [o.dark=true]  the dark marketing look; false follows the page theme
 * @param {boolean} [o.compact] [o.animate=true] [o.sort=false]  sort: largest first
 * @param {string} [o.labelWidth]  CSS width of the label column
 * @returns {{ element: HTMLElement, dispose(): void }}
 */
export function createStatCard(o = {}) {
  const max = o.max ?? 100;
  const items = [...(o.items ?? [])];
  if (o.sort) items.sort((a, b) => b.value - a.value);
  const fmt = typeof o.format === 'function' ? o.format
    : o.format === 'number' ? (v) => formatNumber(v)
      : (v) => formatNumber(v / max, { style: 'percent', maximumFractionDigits: 0 });
  const icon = (i) => (!i ? '' : i.trim().startsWith('<') ? i : getIconSvg(i, 20));
  const titleId = `mud-stat-${++uid}`;

  const bars = items.map((it) => {
    const vars = [`--mud-stat-value: ${Number(it.value) || 0}`, it.from ? `--mud-stat-from: ${it.from}` : '', it.to ? `--mud-stat-to: ${it.to}` : '', it.fill ? `--mud-stat-fill: ${it.fill}` : '']
      .filter(Boolean).join('; ');
    return `<li class="mud-stat-bar${it.highlight ? ' is-highlight' : ''}" style="${esc(vars)}">
        <span class="mud-stat-bar__label">${esc(it.label)}</span>
        <span class="mud-stat-bar__track">
          <span class="mud-stat-bar__fill">${it.icon ? `<span class="mud-stat-bar__icon" aria-hidden="true">${icon(it.icon)}</span>` : ''}</span>
          <span class="mud-stat-bar__value">${esc(it.display ?? fmt(it.value))}</span>
        </span>
      </li>`;
  }).join('');

  // No data-mud here: this function attaches the behaviour itself, so an autoInit on the page doesn't attach it twice.
  const card = `<figure class="mud-stat-card${o.compact ? ' mud-stat-card--compact' : ''}">
      ${o.caption ? `<figcaption class="mud-stat-card__caption">${esc(o.caption)}</figcaption>` : ''}
      <ol class="mud-stat-bars"${o.title ? ` aria-labelledby="${titleId}"` : ''}>${bars}</ol>
      ${o.source ? `<p class="mud-stat-card__source">${o.source}</p>` : ''}
    </figure>`;

  const el = document.createElement(o.title ? 'section' : 'div');
  el.className = `mud-stat-hero${o.dark === false ? '' : ' mud-stat-hero--dark'}`;
  if (o.labelWidth) el.style.setProperty('--mud-stat-label-width', o.labelWidth);
  if (o.title) el.setAttribute('aria-labelledby', titleId);
  el.innerHTML = `${o.title ? `<header class="mud-stat-hero__head">
      ${o.eyebrow ? `<p class="mud-stat-hero__eyebrow">${esc(o.eyebrow)}</p>` : ''}
      <h2 class="mud-stat-hero__title" id="${titleId}">${esc(o.title)}</h2>
      ${o.lead ? `<p class="mud-stat-hero__lead">${esc(o.lead)}</p>` : ''}
    </header>` : ''}${card}`;

  const behavior = o.animate === false ? null : attachBehavior('stat-bars', el.querySelector('.mud-stat-card'));
  return {
    element: el,
    dispose() { behavior?.dispose(); el.remove(); },
  };
}
