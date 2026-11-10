// Progress components: MudProgressLinear (bar) and MudProgressCircular (SVG ring / donut).
// Both take a value between min and max, colours as palette names or any CSS colour, and optional thresholds that
// change the colour with the value (e.g. red → amber → green). Numbers are written with the active locale's digits.

import { formatNumber, t } from '../core/i18n.js';

const PALETTE = new Set(['primary', 'secondary', 'info', 'success', 'warning', 'error', 'dark']);
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A palette name → its token (var(--mud-palette-…)); anything else is used as a CSS colour. */
export function toneColor(color) {
  if (color == null || color === '') return '';
  const c = String(color).trim();
  return PALETTE.has(c) ? `var(--mud-palette-${c})` : c;
}

/**
 * The colour for a percentage from thresholds: [{ from: 0, color: 'error' }, { from: 50, color: 'warning' }, …]
 * (the last threshold whose `from` is ≤ the percentage), else `fallback`.
 */
export function colorForValue(percent, thresholds, fallback) {
  if (!Array.isArray(thresholds) || !thresholds.length) return fallback;
  const sorted = [...thresholds].sort((a, b) => a.from - b.from);
  let color = fallback;
  for (const step of sorted) if (percent >= step.from) color = step.color;
  return color;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const percentOf = (value, min, max) => (max > min ? clamp(((Number(value) || 0) - min) / (max - min), 0, 1) * 100 : 0);
const px = (v) => (typeof v === 'number' ? `${v}px` : String(v));

/** The default label: "42%" in the active locale's digits. */
function defaultLabel(percent) {
  return formatNumber(percent / 100, { style: 'percent', maximumFractionDigits: 0 });
}

function labelText(label, percent, value) {
  if (label === false || label == null) return '';
  if (label === true) return defaultLabel(percent);
  if (typeof label === 'function') return String(label(value, percent) ?? '');
  return String(label);
}

/**
 * Linear progress bar.
 *
 * options: {
 *   value=0, min=0, max=100, buffer?            buffer (secondary bar, e.g. video loaded) in the same range
 *   indeterminate=false                          a sliding bar when the amount is unknown
 *   color='primary', trackColor?, thresholds?    colours: palette names or CSS colours
 *   height?, radius?                             CSS lengths (numbers are px); size: 'small' | 'medium' | 'large'
 *   borderWidth?, borderColor?                   a border around the track
 *   striped=false, animated=false                stripes, moving stripes
 *   steps?                                       a segmented track with this many segments
 *   label=true                                   true (the percentage), false, a string, or (value, percent) => string
 *   labelPosition='end'                          'end' | 'inside' | 'top' (caption row above, with `caption`)
 *   caption?                                     a title shown with labelPosition 'top'
 *   ariaLabel?
 * }
 */
export class MudProgressLinear {
  constructor(options = {}) {
    this.options = { value: 0, min: 0, max: 100, label: true, labelPosition: 'end', color: 'primary', ...options };
    this.el = document.createElement('div');
    this.el.setAttribute('role', 'progressbar');
    this.el.innerHTML = '<span class="mud-progress__caption"></span><span class="mud-progress__label"></span>'
      + '<div class="mud-progress__track"><div class="mud-progress__buffer"></div><div class="mud-progress__bar"><span class="mud-progress__value"></span></div></div>';
    this.$ = {
      caption: this.el.querySelector('.mud-progress__caption'),
      label: this.el.querySelector('.mud-progress__label'),
      buffer: this.el.querySelector('.mud-progress__buffer'),
      value: this.el.querySelector('.mud-progress__value'),
    };
    this.render();
  }

  getElement() { return this.el; }
  getValue() { return this.options.value; }

  setValue(value) { this.options.value = Number(value) || 0; this.options.indeterminate = false; this.render(); }
  setBuffer(buffer) { this.options.buffer = buffer; this.render(); }
  setIndeterminate(on = true) { this.options.indeterminate = !!on; this.render(); }
  /** Changes any options and re-renders. */
  update(options = {}) { Object.assign(this.options, options); this.render(); }

  render() {
    const o = this.options;
    const percent = percentOf(o.value, o.min, o.max);
    const el = this.el;
    const size = o.size && o.size !== 'medium' ? ` mud-progress--${o.size}` : '';
    el.className = `mud-progress${size}${o.striped ? ' mud-progress--striped' : ''}${o.animated ? ' mud-progress--striped mud-progress--animated' : ''}`
      + `${o.indeterminate ? ' mud-progress--indeterminate' : ''}${o.steps ? ' mud-progress--steps' : ''}${o.labelPosition === 'top' ? ' mud-progress--stacked' : ''}`;

    const style = el.style;
    style.setProperty('--mud-progress-value', String(percent));
    setVar(style, '--mud-progress-buffer', o.buffer != null ? String(percentOf(o.buffer, o.min, o.max)) : null);
    setVar(style, '--mud-progress-color', toneColor(colorForValue(percent, o.thresholds, o.color)));
    setVar(style, '--mud-progress-track', toneColor(o.trackColor));
    setVar(style, '--mud-progress-height', o.height != null ? px(o.height) : null);
    setVar(style, '--mud-progress-radius', o.radius != null ? px(o.radius) : null);
    setVar(style, '--mud-progress-border-width', o.borderWidth != null ? px(o.borderWidth) : null);
    setVar(style, '--mud-progress-border-color', toneColor(o.borderColor));
    setVar(style, '--mud-progress-steps', o.steps ? String(o.steps) : null);
    this.$.buffer.hidden = o.buffer == null;

    const text = o.indeterminate ? '' : labelText(o.label, percent, o.value);
    const position = o.labelPosition;
    this.$.label.textContent = position === 'inside' ? '' : text;
    this.$.label.hidden = !text || position === 'inside';
    this.$.value.textContent = position === 'inside' ? text : '';
    this.$.caption.textContent = o.caption ?? '';
    this.$.caption.hidden = position !== 'top' || !o.caption;

    el.setAttribute('aria-valuemin', String(o.min));
    el.setAttribute('aria-valuemax', String(o.max));
    if (o.indeterminate) { el.removeAttribute('aria-valuenow'); el.removeAttribute('aria-valuetext'); }
    else { el.setAttribute('aria-valuenow', String(o.value)); el.setAttribute('aria-valuetext', text || defaultLabel(percent)); }
    el.setAttribute('aria-label', o.ariaLabel ?? o.caption ?? t('progress.label', {}, 'Progress'));
  }

  dispose() { this.el.remove(); }
}

/**
 * Circular progress: an SVG ring with round or flat caps, a track, and optional borders on both edges of the ring.
 *
 * options: {
 *   value=0, min=0, max=100, indeterminate=false
 *   size=80                    diameter in px
 *   thickness=8                line width of the ring in px
 *   color='primary', trackColor?, thresholds?
 *   borderWidth=0, borderColor?   a border on the outer and inner edge of the ring
 *   linecap='round'            'round' | 'butt'
 *   startAngle=0               degrees from 12 o'clock, clockwise
 *   counterClockwise=false
 *   label=true                 true (the percentage), false, a string, or (value, percent) => string
 *   sublabel?                  smaller text under the label (e.g. "complete")
 *   fontSize?                  label size (default: 22% of the diameter)
 *   ariaLabel?
 * }
 */
export class MudProgressCircular {
  constructor(options = {}) {
    this.options = { value: 0, min: 0, max: 100, size: 80, thickness: 8, borderWidth: 0, color: 'primary', linecap: 'round', startAngle: 0, label: true, ...options };
    this.el = document.createElement('div');
    this.el.setAttribute('role', 'progressbar');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const circle = (cls) => { const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('class', cls); svg.appendChild(c); return c; };
    this.$ = {
      svg,
      track: circle('mud-progress-circular__track'),
      outer: circle('mud-progress-circular__border'),
      inner: circle('mud-progress-circular__border'),
      arc: circle('mud-progress-circular__arc'),
      label: document.createElement('div'),
    };
    this.$.label.className = 'mud-progress-circular__label';
    this.el.append(svg, this.$.label);
    this.render();
  }

  getElement() { return this.el; }
  getValue() { return this.options.value; }

  setValue(value) { this.options.value = Number(value) || 0; this.options.indeterminate = false; this.render(); }
  setIndeterminate(on = true) { this.options.indeterminate = !!on; this.render(); }
  update(options = {}) { Object.assign(this.options, options); this.render(); }

  render() {
    const o = this.options;
    const size = Math.max(8, Number(o.size) || 80);
    const border = Math.max(0, Number(o.borderWidth) || 0);
    const thickness = clamp(Number(o.thickness) || 8, 1, size / 2 - 2 * border);
    const c = size / 2;
    const r = c - border - thickness / 2;
    const percent = percentOf(o.value, o.min, o.max);
    const color = toneColor(colorForValue(percent, o.thresholds, o.color)) || 'var(--mud-palette-primary)';
    const { svg, track, outer, inner, arc, label } = this.$;

    this.el.className = `mud-progress-circular${o.indeterminate ? ' is-indeterminate' : ''}`;
    this.el.style.inlineSize = `${size}px`;
    this.el.style.blockSize = `${size}px`;
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

    for (const node of [track, arc]) {
      node.setAttribute('cx', String(c));
      node.setAttribute('cy', String(c));
      node.setAttribute('r', String(r));
      node.setAttribute('stroke-width', String(thickness));
    }
    track.style.stroke = toneColor(o.trackColor) || `color-mix(in srgb, ${color} 16%, transparent)`;

    // Borders: centred on the ring's outer and inner edges, inside the diameter.
    const borderColor = toneColor(o.borderColor) || 'var(--mud-palette-lines-default)';
    [[outer, c - border / 2], [inner, c - border - thickness - border / 2]].forEach(([node, radius]) => {
      node.style.display = border > 0 && radius > 0 ? '' : 'none';
      node.setAttribute('cx', String(c));
      node.setAttribute('cy', String(c));
      node.setAttribute('r', String(Math.max(0, radius)));
      node.setAttribute('stroke-width', String(border));
      node.style.stroke = borderColor;
    });

    // The arc: pathLength 100 makes the dash pattern the percentage itself.
    arc.setAttribute('pathLength', '100');
    arc.setAttribute('stroke-linecap', o.linecap === 'butt' ? 'butt' : 'round');
    arc.style.stroke = color;
    // Rotate so 0 % is at 12 o'clock (plus startAngle), then mirror for counter-clockwise (transforms apply right to left).
    const flip = o.counterClockwise ? `translate(${size} 0) scale(-1 1) ` : '';
    arc.setAttribute('transform', `${flip}rotate(${-90 + (Number(o.startAngle) || 0)} ${c} ${c})`);
    if (o.indeterminate) { arc.style.strokeDasharray = ''; arc.style.opacity = ''; }
    else {
      arc.style.strokeDasharray = `${percent} 100`;
      arc.style.opacity = percent > 0 ? '' : '0'; // a round cap would show a dot at 0 %
    }

    const text = o.indeterminate ? '' : labelText(o.label, percent, o.value);
    label.textContent = text;
    if (o.sublabel && !o.indeterminate) {
      const small = document.createElement('small');
      small.textContent = o.sublabel;
      label.appendChild(small);
    }
    label.style.fontSize = o.fontSize != null ? px(o.fontSize) : `${Math.max(10, size * 0.22)}px`;

    const el = this.el;
    el.setAttribute('aria-valuemin', String(o.min));
    el.setAttribute('aria-valuemax', String(o.max));
    if (o.indeterminate) { el.removeAttribute('aria-valuenow'); el.removeAttribute('aria-valuetext'); }
    else { el.setAttribute('aria-valuenow', String(o.value)); el.setAttribute('aria-valuetext', text || defaultLabel(percent)); }
    el.setAttribute('aria-label', o.ariaLabel ?? t('progress.label', {}, 'Progress'));
  }

  dispose() { this.el.remove(); }
}

function setVar(style, name, value) {
  if (value == null || value === '') style.removeProperty(name);
  else style.setProperty(name, value);
}
