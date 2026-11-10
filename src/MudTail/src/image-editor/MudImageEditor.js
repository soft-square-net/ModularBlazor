// MudImageEditor: a Photoshop-style image editor in the browser.
//   Tools: move / pan, crop (aspect ratios, rule of thirds, handles), brush, highlighter, text, rectangle, ellipse,
//   arrow, eyedropper. Zoom (wheel, pinch, buttons, fit, 100 %), rotate 90°, straighten, flip, adjustments
//   (light, colour, effects), filter presets with live thumbnails, histogram, before / after, undo / redo, resize,
//   output sizes (cover / contain / width …) in WebP / JPEG / PNG, download, and upload to an API as multipart
//   form data or as a binary stream, with progress. Every edit is non-destructive until export.
//
//   const editor = new MudImageEditor({
//     src: '/images/photo.jpg',
//     sizes: [{ name: 'thumbnail', width: 160, height: 160, fit: 'cover' }, { name: 'article', width: 1200, fit: 'width' }],
//     upload: { url: '/api/v1/media/images', mode: 'multipart' },   // or mode: 'stream' (one binary request per size)
//     // upload.includeOriginal: true also sends the untouched original (multipart part "original", or upload.originalUrl in stream mode)
//     onUpload: (result) => …,
//   });
//   host.appendChild(editor.getElement());

import { getIconSvg } from '../core/icons.js';
import { t, formatNumber } from '../core/i18n.js';
import { MudProgressLinear } from '../components/MudProgress.js';
import { showToast } from '../core/animations.js';
import {
  DEFAULT_ADJUSTMENTS, FILTER_PRESETS, ASPECT_RATIOS, SIZE_PRESETS, presetAdjustments, applyAdjustments, histogram, mapPoint, mapRect,
  centeredCrop, resizeCrop, moveCrop, clampRect, resolveRatio, fitSize, extension, formatBytes,
} from './pipeline.js';
import { loadSource, compose, drawAnnotation, cropCanvas, geometryBounds, angleOf, nameFromUrl } from './render.js';
import { createRecipe, normalizeRecipe, normalizeOutput, scaleEdit, matchSource, fingerprint } from './recipe.js';
import { renderOutputs } from './outputs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (key, fallback, params = {}) => t(`imageEditor.${key}`, params, fallback);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clone = (o) => JSON.parse(JSON.stringify(o));
let uid = 0;

const TOOLS = [
  { id: 'move', icon: 'hand', key: 'V', label: () => L('tool.move', 'Move and zoom') },
  { id: 'crop', icon: 'crop', key: 'C', label: () => L('tool.crop', 'Crop') },
  { id: 'brush', icon: 'brush', key: 'B', label: () => L('tool.brush', 'Brush') },
  { id: 'highlighter', icon: 'highlighter', key: 'H', label: () => L('tool.highlighter', 'Highlighter') },
  { id: 'text', icon: 'type', key: 'T', label: () => L('tool.text', 'Text') },
  { id: 'rect', icon: 'square', key: 'U', label: () => L('tool.rect', 'Rectangle') },
  { id: 'ellipse', icon: 'circle', key: 'O', label: () => L('tool.ellipse', 'Ellipse') },
  { id: 'arrow', icon: 'arrowUpRight', key: 'A', label: () => L('tool.arrow', 'Arrow') },
  { id: 'eyedropper', icon: 'pipette', key: 'I', label: () => L('tool.eyedropper', 'Eyedropper') },
];

const ADJUST_GROUPS = [
  { id: 'light', label: () => L('group.light', 'Light'), items: [
    ['exposure', -100, 100, () => L('adj.exposure', 'Exposure')], ['brightness', -100, 100, () => L('adj.brightness', 'Brightness')],
    ['contrast', -100, 100, () => L('adj.contrast', 'Contrast')], ['highlights', -100, 100, () => L('adj.highlights', 'Highlights')],
    ['shadows', -100, 100, () => L('adj.shadows', 'Shadows')],
  ] },
  { id: 'color', label: () => L('group.color', 'Colour'), items: [
    ['temperature', -100, 100, () => L('adj.temperature', 'Temperature')], ['tint', -100, 100, () => L('adj.tint', 'Tint')],
    ['saturation', -100, 100, () => L('adj.saturation', 'Saturation')], ['vibrance', -100, 100, () => L('adj.vibrance', 'Vibrance')],
    ['hue', -180, 180, () => L('adj.hue', 'Hue')],
  ] },
  { id: 'effects', label: () => L('group.effects', 'Effects'), items: [
    ['vignette', 0, 100, () => L('adj.vignette', 'Vignette')], ['grain', 0, 100, () => L('adj.grain', 'Grain')],
    ['sharpen', 0, 100, () => L('adj.sharpen', 'Sharpen')], ['blur', 0, 20, () => L('adj.blur', 'Blur')],
    ['grayscale', 0, 100, () => L('adj.grayscale', 'Black and white')], ['sepia', 0, 100, () => L('adj.sepia', 'Sepia')],
    ['invert', 0, 100, () => L('adj.invert', 'Invert')],
  ] },
];

const PRESET_LABELS = {
  none: () => L('preset.none', 'Original'), vivid: () => L('preset.vivid', 'Vivid'), warm: () => L('preset.warm', 'Warm'),
  cool: () => L('preset.cool', 'Cool'), fade: () => L('preset.fade', 'Fade'), mono: () => L('preset.mono', 'Mono'),
  noir: () => L('preset.noir', 'Noir'), sepia: () => L('preset.sepia', 'Sepia'), vintage: () => L('preset.vintage', 'Vintage'),
  drama: () => L('preset.drama', 'Drama'), matte: () => L('preset.matte', 'Matte'), newsprint: () => L('preset.newsprint', 'Newsprint'),
};

const FITS = ['cover', 'contain', 'width', 'height', 'inside', 'fill'];
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function initialState() {
  return { quarter: 0, angle: 0, flipH: false, flipV: false, adjust: { ...DEFAULT_ADJUSTMENTS }, preset: 'none', crop: null, annotations: [], background: null, resize: null };
}

export class MudImageEditor {
  /**
   * @param {object} o
   * @param {string|Blob|HTMLImageElement} [o.src]   the image to open (also later: open(src))
   * @param {Array} [o.sizes]     output sizes [{ name, width?, height?, fit?, enabled? }] (default: thumbnail, card, article, hero)
   * @param {'webp'|'jpeg'|'png'|'avif'} [o.format='webp']   [o.quality=0.86]
   * @param {object} [o.upload]   { url, method='POST', mode='multipart'|'stream', fieldName='files', headers?, withCredentials?, data?,
   *   recipeUrl?, includeOriginal=false, originalUrl? }. includeOriginal also sends the untouched original file (the bytes
   *   that were opened): a multipart part named "original", or in stream mode one request to originalUrl before the sizes.
   * @param {(files, editor) => any} [o.onSave]   your own saving instead of `upload` (files: [{ name, blob, width, height, type }])
   * @param {(result) => void} [o.onUpload]  [o.onExport(files)] [o.onChange(state)] [o.onError(error)] [o.onOpen(info)]
   * @param {number} [o.previewSize=1600]   the longest side of the working preview (exports are always full size)
   * @param {string} [o.height]   CSS height of the editor (default 640px)
   * @param {string[]} [o.tools]  tool ids to show (default all)
   * @param {string} [o.fileName]  the base name of exported files (default: the opened file's name)
   */
  constructor(o = {}) {
    this.options = { format: 'webp', quality: 0.86, previewSize: 1600, ...o };
    this.sizes = (o.sizes ?? SIZE_PRESETS.filter((s) => ['thumbnail', 'card', 'article', 'hero'].includes(s.name))).map((s) => ({ enabled: true, fit: 'cover', ...s }));
    this.format = this.options.format;
    this.quality = this.options.quality;
    this.id = `mud-ie-${++uid}`;
    this.source = null;
    this.sourceBlob = null;
    this.state = initialState();
    this.history = [];
    this.future = [];
    this.tool = 'move';
    this.toolOptions = { color: '#ff3e7f', size: 8, fill: false, fontSize: 72, bold: true, font: 'system-ui, sans-serif', ratio: 'free', thirds: true };
    this.view = { zoom: 1, panX: 0, panY: 0, fit: true };
    this.preview = null; // { canvas, scale }
    this.pendingCrop = null;
    this.drag = null;
    this.exports = [];
    this.urls = new Set();
    this.disposed = false;
    this._build();
    if (o.src) this.open(o.src);
    else this._render();
  }

  // ───────────────────────── public API ─────────────────────────

  getElement() { return this.el; }

  /** Opens an image: a URL, data URL, File / Blob or an <img>. Resolves when it is ready. */
  async open(src) {
    this._busy(true, L('opening', 'Opening the image…'));
    try {
      // Read the original's bytes when possible: their SHA-256 goes into the recipe, so it can be matched later.
      let blob = src instanceof Blob ? src : null;
      if (!blob && typeof src === 'string') {
        try { const res = await fetch(src); if (res.ok) blob = await res.blob(); } catch { /* not fetchable: load it as an image */ }
      }
      const source = await loadSource(blob ?? src);
      if (blob) {
        source.bytes = blob.size;
        source.type = blob.type || source.type;
        source.sha256 = await fingerprint(blob);
        if (src instanceof Blob && src.name) source.name = src.name.replace(/\.[a-z0-9]+$/i, '');
        else if (typeof src === 'string' && !src.startsWith('data:') && !src.startsWith('blob:')) source.name = nameFromUrl(src);
      }
      this.source = source;
      this.sourceBlob = blob; // the untouched original, for upload.includeOriginal (null when its bytes could not be read)
      this.fileName = this.options.fileName ?? source.name ?? 'image';
      this.state = initialState();
      this.history = [];
      this.future = [];
      this.pendingCrop = null;
      this.view = { zoom: 1, panX: 0, panY: 0, fit: true };
      this._thumbsKey = null;
      this._clearExports();
      this._recompose();
      this._syncPanels();
      this._announce(L('opened', 'Opened {name}, {width} × {height} pixels.', { name: this.fileName, width: formatNumber(source.width), height: formatNumber(source.height) }));
      this.options.onOpen?.({ name: this.fileName, width: source.width, height: source.height, type: source.type });
    } catch (e) {
      this._error(L('openError', 'The image could not be opened. It may be blocked by the server (CORS) or not an image.'), e);
    } finally {
      this._busy(false);
    }
  }

  /** The edit as plain data (save it, and restore it with setState). */
  getState() { return clone(this.state); }

  /**
   * The recipe: the original's identity, every edit and the output settings, as JSON-ready data. Store it with the
   * original; renderRecipe(original, recipe) regenerates the same files, applyRecipe(recipe) reopens the edit here.
   * `files` (default: the last export) records what was produced.
   */
  getRecipe({ files = this.exports } = {}) {
    if (!this.source) return null;
    return createRecipe({
      source: { name: this.source.name ?? this.fileName, width: this.source.width, height: this.source.height, type: this.source.type, bytes: this.source.bytes, sha256: this.source.sha256 },
      edit: this.state,
      output: { format: this.format, quality: this.quality, includeOriginal: true, fileName: this._baseName(), sizes: this.sizes.filter((s) => s.enabled !== false) },
      files,
    });
  }

  /**
   * Applies a recipe (object or JSON) to the open image: the edit (scaled when this original has another
   * resolution), the sizes, format and quality. Resolves to { ok, warnings }; warnings are 'different-file',
   * 'different-resolution' and 'different-proportions'. With { verify: 'strict' } a different original is refused.
   */
  async applyRecipe(input, { verify = 'warn' } = {}) {
    if (!this.source) { this._announce(L('openFirst', 'Open an image first.')); return { ok: false, warnings: ['no-image'] }; }
    let recipe;
    try { recipe = normalizeRecipe(input); } catch (e) {
      this._error(L('recipeInvalid', 'This recipe cannot be used: {reason}', { reason: e.message }), e);
      return { ok: false, warnings: [], error: e.message };
    }
    const { scale, warnings } = matchSource(recipe, this.source);
    if (verify === 'strict' && (warnings.includes('different-file') || warnings.includes('different-proportions'))) {
      this._error(L('recipeOtherImage', 'This recipe was made for another image.'), new Error(warnings.join(', ')));
      return { ok: false, warnings };
    }
    const edit = scaleEdit(recipe.edit, scale);
    this.format = recipe.output.format;
    this.quality = recipe.output.quality;
    this.sizes = recipe.output.sizes.map((s) => ({ ...s, enabled: true }));
    this.pendingCrop = null;
    if (this.tool === 'crop') this.tool = 'move';
    this._commit(() => { this.state = { ...initialState(), ...edit }; });
    this._syncExportSettings();
    this._renderSizes();
    this._syncTools();
    const message = warnings.length
      ? L('recipeAppliedWarn', 'Recipe applied, with a warning: {warnings}.', { warnings: warnings.map((w) => L(`warning.${w}`, w)).join(', ') })
      : L('recipeApplied', 'Recipe applied.');
    this._announce(message);
    showToast(message, warnings.length ? 'warning' : 'success');
    return { ok: true, warnings };
  }
  setState(state) { this._commit(() => { this.state = { ...initialState(), ...clone(state) }; }); }

  undo() {
    if (!this.history.length) return;
    this.future.push(clone(this.state));
    this.state = this.history.pop();
    this._afterChange();
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(clone(this.state));
    this.state = this.future.pop();
    this._afterChange();
  }

  /** Back to the image as it was opened. */
  reset() { if (this.source) this._commit(() => { this.state = initialState(); this.pendingCrop = null; }); }

  setTool(id) {
    if (!TOOLS.some((x) => x.id === id) || id === this.tool) return;
    if (this.tool === 'crop' && id !== 'crop') this.pendingCrop = null;
    this._commitText();
    this.tool = id;
    if (id === 'crop' && this.source) this.pendingCrop = this.state.crop ? { ...this.state.crop } : centeredCrop(this._bounds(), this.toolOptions.ratio === 'free' ? null : this.toolOptions.ratio);
    this.view.fit = true;
    this._syncTools();
    this._render();
  }

  rotate(direction = 1) {
    this._transform({ quarter: ((this.state.quarter + (direction > 0 ? 1 : 3)) % 4) });
  }

  flip(axis = 'h') {
    this._transform(axis === 'h' ? { flipH: !this.state.flipH } : { flipV: !this.state.flipV });
  }

  /** Straightens by a fine angle (-45…45 degrees). */
  straighten(angle) { this._transform({ angle: clamp(Number(angle) || 0, -45, 45) }); }

  /** Sets adjustments (merged), e.g. { contrast: 20 }. */
  adjust(values) { this._commit(() => { this.state.adjust = { ...this.state.adjust, ...values }; this.state.preset = 'custom'; }); }

  applyPreset(name) { this._commit(() => { this.state.adjust = { ...presetAdjustments(name), blur: this.state.adjust.blur }; this.state.preset = name; }); }

  /** Crops to a rectangle in the rotated image's pixels, or to an aspect ratio ('16:9', 1.5, 'original'), centred. */
  crop(rectOrRatio) {
    if (!this.source) return;
    const bounds = this._bounds();
    const rect = rectOrRatio && typeof rectOrRatio === 'object' ? clampRect(rectOrRatio, bounds) : centeredCrop(bounds, rectOrRatio);
    this._commit(() => { this.state.crop = rect; });
  }

  /** The output size of the edited image: { width, height } (one may be omitted), or null for the cropped size. */
  resize(size) { this._commit(() => { this.state.resize = size && (size.width || size.height) ? { width: size.width || null, height: size.height || null } : null; }); }

  zoomTo(zoom, anchor = null) {
    const z = clamp(zoom, 0.02, 32);
    const stage = this.$.stage.getBoundingClientRect();
    const ax = anchor?.x ?? stage.width / 2;
    const ay = anchor?.y ?? stage.height / 2;
    const before = this._toImage(ax, ay);
    this.view.zoom = z;
    this.view.fit = false;
    const after = this._toImage(ax, ay);
    this.view.panX += (after.x - before.x) * z;
    this.view.panY += (after.y - before.y) * z;
    this._render();
  }

  zoomIn() { this.zoomTo(this.view.zoom * 1.25); }
  zoomOut() { this.zoomTo(this.view.zoom / 1.25); }
  zoomFit() { this.view = { ...this.view, fit: true, panX: 0, panY: 0 }; this._render(); }
  zoomActual() { this.zoomTo(1); }

  /** The edited image (crop, edits, optional resize) as a Blob. */
  async exportImage({ format = this.format, quality = this.quality, size = this.state.resize } = {}) {
    const [file] = await renderOutputs(this.source, { ...this.state, resize: size }, normalizeOutput({ format, quality, sizes: [], includeOriginal: true }), { fileName: this._baseName() });
    return file.blob;
  }

  /**
   * Renders the enabled output sizes (plus "original": the edited image at its own size). Resolves to
   * [{ name, width, height, type, size, blob, url }].
   */
  async exportSizes({ sizes = this.sizes.filter((s) => s.enabled !== false), format = this.format, quality = this.quality, includeOriginal = true } = {}) {
    if (!this.source) return [];
    this._busy(true, L('rendering', 'Rendering the sizes…'));
    try {
      await new Promise((r) => setTimeout(r, 30)); // let the overlay paint before the heavy work
      // The same function renderRecipe() uses: a recipe replayed later gives these exact files.
      const output = normalizeOutput({ format, quality, includeOriginal, sizes });
      const files = await renderOutputs(this.source, this.state, output, { fileName: this._baseName() });
      this._clearExports();
      this.exports = files.map((f) => { const url = URL.createObjectURL(f.blob); this.urls.add(url); return { ...f, url }; });
      this._renderExports();
      this._renderRecipe();
      this.options.onExport?.(this.exports, this.getRecipe());
      return this.exports;
    } catch (e) {
      this._error(L('exportError', 'The image could not be exported.'), e);
      return [];
    } finally {
      this._busy(false);
    }
  }

  /**
   * Sends files to the API: options.upload (multipart form or a binary stream per file) or options.onSave.
   * Renders the sizes first when none are rendered. Resolves to { ok, results }.
   */
  async upload(files = null) {
    const list = files ?? (this.exports.length ? this.exports : await this.exportSizes());
    if (!list.length) return { ok: false, results: [] };
    const bar = this.$.uploadBar;
    bar.update({ value: 0, indeterminate: false });
    this.$.uploadBox.hidden = false;
    this.$.uploadStatus.textContent = L('uploading', 'Uploading {count} files…', { count: formatNumber(list.length) });
    try {
      let result;
      const recipe = this.getRecipe({ files: list });
      if (this.options.onSave) result = { ok: true, results: [await this.options.onSave(list, this, recipe)] };
      else if (this.options.upload?.url) result = await this._sendAll(list, recipe, (p) => bar.setValue(p * 100));
      else throw new Error(L('noUpload', 'No upload address is set (options.upload.url or onSave).'));
      result.recipe = recipe;
      bar.setValue(100);
      this.$.uploadStatus.textContent = L('uploaded', 'Saved {count} files.', { count: formatNumber(list.length) });
      showToast(L('uploaded', 'Saved {count} files.', { count: formatNumber(list.length) }), 'success');
      this.options.onUpload?.(result);
      return result;
    } catch (e) {
      this.$.uploadStatus.textContent = e?.message || L('uploadError', 'The upload failed.');
      this._error(L('uploadError', 'The upload failed.'), e);
      return { ok: false, error: e?.message, results: [] };
    }
  }

  /** Downloads one exported file (by name) or the edited image. */
  async download(name = null) {
    const file = name ? this.exports.find((f) => f.name === name) : null;
    const blob = file?.blob ?? await this.exportImage();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file?.fileName ?? `${this._baseName()}-edited.${extension(blob.type)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  dispose() {
    this.disposed = true;
    this._ro?.disconnect();
    document.removeEventListener('keyup', this._onKeyUp);
    this._clearExports();
    this.el.remove();
  }

  // ───────────────────────── building ─────────────────────────

  _build() {
    const o = this.options;
    const tools = TOOLS.filter((x) => !o.tools || o.tools.includes(x.id));
    const btn = (action, icon, label, extra = '') => `<button type="button" class="mud-ie__btn" data-ie="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${getIconSvg(icon, 18)}</button>`;
    const el = document.createElement('div');
    el.className = 'mud-image-editor';
    el.style.setProperty('--mud-ie-height', o.height ?? '640px');
    el.innerHTML = `
      <div class="mud-ie__toolbar" role="toolbar" aria-label="${esc(L('toolbar', 'Image editor'))}">
        <button type="button" class="mud-ie__btn mud-ie__btn--text" data-ie="open">${getIconSvg('imagePlus', 18)}<span>${esc(L('open', 'Open'))}</span></button>
        <span class="mud-ie__sep"></span>
        ${btn('undo', 'undo', L('undo', 'Undo (Ctrl+Z)'))}${btn('redo', 'redo', L('redo', 'Redo (Ctrl+Y)'))}
        <span class="mud-ie__sep"></span>
        ${btn('rotate-left', 'rotateLeft', L('rotateLeft', 'Rotate left'))}${btn('rotate-right', 'rotateRight', L('rotateRight', 'Rotate right'))}
        ${btn('flip-h', 'flipH', L('flipH', 'Flip horizontally'))}${btn('flip-v', 'flipV', L('flipV', 'Flip vertically'))}
        <span class="mud-ie__sep"></span>
        ${btn('zoom-out', 'zoomOut', L('zoomOut', 'Zoom out (−)'))}
        <button type="button" class="mud-ie__zoom" data-ie="zoom-fit" title="${esc(L('zoomFit', 'Fit to screen (0)'))}"></button>
        ${btn('zoom-in', 'zoomIn', L('zoomIn', 'Zoom in (+)'))}${btn('zoom-actual', 'scanEye', L('zoomActual', 'Actual pixels (1)'))}
        <span class="mud-ie__sep"></span>
        ${btn('compare', 'split', L('compare', 'Hold to see the original'), 'aria-pressed="false"')}
        ${btn('reset', 'refresh', L('reset', 'Reset all edits'))}
        <span class="mud-ie__grow"></span>
        <button type="button" class="mud-ie__btn mud-ie__btn--text" data-ie="download">${getIconSvg('download', 18)}<span>${esc(L('download', 'Download'))}</span></button>
        <button type="button" class="mud-ie__btn mud-ie__btn--primary" data-ie="save">${getIconSvg('upload', 18)}<span>${esc(L('save', 'Save'))}</span></button>
      </div>
      <div class="mud-ie__options" aria-live="off"></div>
      <div class="mud-ie__body">
        <div class="mud-ie__tools" role="toolbar" aria-orientation="vertical" aria-label="${esc(L('tools', 'Tools'))}">
          ${tools.map((x) => `<button type="button" class="mud-ie__tool" data-tool="${x.id}" aria-pressed="false" title="${esc(`${x.label()} (${x.key})`)}" aria-label="${esc(x.label())}" aria-keyshortcuts="${x.key}">${getIconSvg(x.icon, 20)}</button>`).join('')}
        </div>
        <div class="mud-ie__stage" tabindex="0" aria-label="${esc(L('canvas', 'Image canvas'))}" role="application">
          <canvas class="mud-ie__canvas"></canvas>
          <textarea class="mud-ie__text-input" rows="1" hidden aria-label="${esc(L('tool.text', 'Text'))}"></textarea>
          <div class="mud-ie__empty">${getIconSvg('imagePlus', 40)}<p>${esc(L('empty', 'Open an image, drop one here or paste it.'))}</p>
            <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium" data-ie="open">${esc(L('openImage', 'Open an image'))}</button></div>
          <div class="mud-ie__drop" hidden>${getIconSvg('imagePlus', 40)}<span>${esc(L('drop', 'Drop to open'))}</span></div>
          <div class="mud-ie__busy" hidden><span class="mud-spinner" aria-hidden="true"></span><span class="mud-ie__busy-text"></span></div>
          <span class="mud-ie__badge" hidden>${esc(L('before', 'Original'))}</span>
        </div>
        <aside class="mud-ie__panel">
          <canvas class="mud-ie__histogram" width="256" height="72" role="img" aria-label="${esc(L('histogram', 'Histogram'))}"></canvas>
          <div class="mud-ie__tabs" role="tablist">
            ${[['adjust', L('tab.adjust', 'Adjust')], ['filters', L('tab.filters', 'Filters')], ['transform', L('tab.transform', 'Transform')], ['export', L('tab.export', 'Export')]]
              .map(([id, label], i) => `<button type="button" role="tab" id="${this.id}-tab-${id}" aria-controls="${this.id}-panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${id}">${esc(label)}</button>`).join('')}
          </div>
          <div class="mud-ie__panels">
            <section role="tabpanel" id="${this.id}-panel-adjust" aria-labelledby="${this.id}-tab-adjust" data-panel="adjust">${this._adjustHtml()}</section>
            <section role="tabpanel" id="${this.id}-panel-filters" aria-labelledby="${this.id}-tab-filters" data-panel="filters" hidden><div class="mud-ie__presets"></div></section>
            <section role="tabpanel" id="${this.id}-panel-transform" aria-labelledby="${this.id}-tab-transform" data-panel="transform" hidden>${this._transformHtml()}</section>
            <section role="tabpanel" id="${this.id}-panel-export" aria-labelledby="${this.id}-tab-export" data-panel="export" hidden>${this._exportHtml()}</section>
          </div>
        </aside>
      </div>
      <div class="mud-ie__status" data-no-i18n><span data-status="size"></span><span data-status="zoom"></span><span data-status="pos"></span><span data-status="hint"></span></div>
      <input type="file" accept="image/*" hidden>
      <div class="mud-sr-only" aria-live="polite"></div>`;
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = {
      stage: q('.mud-ie__stage'), canvas: q('.mud-ie__canvas'), text: q('.mud-ie__text-input'), empty: q('.mud-ie__empty'),
      drop: q('.mud-ie__drop'), busy: q('.mud-ie__busy'), busyText: q('.mud-ie__busy-text'), badge: q('.mud-ie__badge'),
      options: q('.mud-ie__options'), hist: q('.mud-ie__histogram'), presets: q('.mud-ie__presets'), file: q('input[type="file"]'),
      live: q('[aria-live="polite"]'), zoom: q('.mud-ie__zoom'), status: q('.mud-ie__status'), exportList: q('.mud-ie__exports'),
      uploadBox: q('.mud-ie__upload'), uploadStatus: q('.mud-ie__upload-status'),
    };
    this.$.uploadBar = new MudProgressLinear({ value: 0, label: true, ariaLabel: L('uploadProgress', 'Upload progress') });
    this.$.uploadBox.prepend(this.$.uploadBar.getElement());
    this._bind();
    this._syncTools();
    this._ro = new ResizeObserver(() => this._render());
    this._ro.observe(this.$.stage);
  }

  _slider(key, min, max, label, value, step = 1) {
    return `<label class="mud-ie__slider" data-adjust="${key}">
      <span class="mud-ie__slider-head"><span>${esc(label)}</span><output>${formatNumber(value)}</output></span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" class="mud-slider">
    </label>`;
  }

  _adjustHtml() {
    return ADJUST_GROUPS.map((g) => `<details class="mud-ie__group" open><summary>${esc(g.label())}</summary>
      ${g.items.map(([key, min, max, label]) => (key === 'invert'
        ? `<label class="mud-switch mud-ie__switch" data-adjust="invert"><input type="checkbox" role="switch"><span class="mud-switch-track"><span class="mud-switch-thumb"></span></span> ${esc(label())}</label>`
        : this._slider(key, min, max, label(), 0, key === 'blur' ? 0.5 : 1))).join('')}
    </details>`).join('') + `<button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-ie="reset-adjust">${esc(L('resetAdjust', 'Reset adjustments'))}</button>
    <p class="mud-ie__hint">${esc(L('adjustHint', 'Double-click a slider to reset it.'))}</p>`;
  }

  _transformHtml() {
    return `
      <h4 class="mud-ie__heading">${esc(L('rotation', 'Rotation'))}</h4>
      <div class="mud-ie__row">
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="rotate-left">${getIconSvg('rotateLeft', 16)} 90°</button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="rotate-right">${getIconSvg('rotateRight', 16)} 90°</button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="flip-h">${getIconSvg('flipH', 16)} ${esc(L('flipShortH', 'Flip H'))}</button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="flip-v">${getIconSvg('flipV', 16)} ${esc(L('flipShortV', 'Flip V'))}</button>
      </div>
      ${this._slider('straighten', -45, 45, L('straighten', 'Straighten'), 0, 0.5).replace('data-adjust="straighten"', 'data-transform="straighten"')}
      <label class="mud-ie__field"><span>${esc(L('background', 'Background (corners, transparency)'))}</span>
        <span class="mud-ie__row"><input type="color" value="#ffffff" data-transform="background"><label class="mud-checkbox"><input type="checkbox" data-transform="transparent" checked> ${esc(L('transparent', 'Transparent'))}</label></span></label>
      <h4 class="mud-ie__heading">${esc(L('resizeTitle', 'Image size'))}</h4>
      <div class="mud-ie__size">
        <label><span>${esc(L('width', 'Width'))}</span><span class="mud-input-wrapper mud-input-wrapper--dense"><input type="number" min="1" class="mud-input-slot" data-resize="width"></span></label>
        <button type="button" class="mud-ie__btn mud-ie__lock" data-ie="lock" aria-pressed="true" title="${esc(L('keepRatio', 'Keep the proportions'))}" aria-label="${esc(L('keepRatio', 'Keep the proportions'))}">${getIconSvg('lock', 16)}</button>
        <label><span>${esc(L('height', 'Height'))}</span><span class="mud-input-wrapper mud-input-wrapper--dense"><input type="number" min="1" class="mud-input-slot" data-resize="height"></span></label>
      </div>
      <div class="mud-ie__row">
        <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" data-ie="apply-size">${esc(L('applySize', 'Apply size'))}</button>
        <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-ie="clear-size">${esc(L('clearSize', 'Original size'))}</button>
      </div>
      <p class="mud-ie__hint" data-info="size"></p>
      <h4 class="mud-ie__heading">${esc(L('cropTitle', 'Crop'))}</h4>
      <div class="mud-ie__ratios">${ASPECT_RATIOS.map((r) => `<button type="button" class="mud-ie__chip" data-ratio="${r.id}">${esc(r.id === 'free' ? L('ratio.free', 'Free') : r.id === 'original' ? L('ratio.original', 'Original') : r.label)}</button>`).join('')}</div>
      <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-ie="clear-crop">${esc(L('clearCrop', 'Remove the crop'))}</button>`;
  }

  _exportHtml() {
    const formats = ['webp', 'jpeg', 'png', 'avif'];
    return `
      <div class="mud-ie__export-settings">
        <label class="mud-ie__field"><span>${esc(L('format', 'Format'))}</span>
          <span class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense"><select class="mud-input-slot" data-export="format">
            ${formats.map((f) => `<option value="${f}" ${f === this.format ? 'selected' : ''}>${f.toUpperCase()}</option>`).join('')}</select></span></label>
        ${this._slider('quality', 10, 100, L('quality', 'Quality'), Math.round(this.quality * 100)).replace('data-adjust="quality"', 'data-export="quality"')}
      </div>
      <h4 class="mud-ie__heading">${esc(L('sizes', 'Sizes to create'))}</h4>
      <div class="mud-ie__sizes"></div>
      <details class="mud-ie__add-size"><summary>${esc(L('addSize', 'Add a size'))}</summary>
        <div class="mud-ie__add-grid">
          <label><span>${esc(L('sizeName', 'Name'))}</span><span class="mud-input-wrapper mud-input-wrapper--dense"><input class="mud-input-slot" data-new="name" placeholder="${esc(L('sizeNamePlaceholder', 'banner'))}"></span></label>
          <label><span>${esc(L('width', 'Width'))}</span><span class="mud-input-wrapper mud-input-wrapper--dense"><input type="number" min="1" class="mud-input-slot" data-new="width" placeholder="1500"></span></label>
          <label><span>${esc(L('height', 'Height'))}</span><span class="mud-input-wrapper mud-input-wrapper--dense"><input type="number" min="1" class="mud-input-slot" data-new="height" placeholder="500"></span></label>
          <label><span>${esc(L('fit', 'Fit'))}</span><span class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense"><select class="mud-input-slot" data-new="fit">${FITS.map((f) => `<option value="${f}">${esc(L(`fit.${f}`, f))}</option>`).join('')}</select></span></label>
        </div>
        <div class="mud-ie__presets-row">${SIZE_PRESETS.map((p) => `<button type="button" class="mud-ie__chip" data-size-preset="${p.name}">${esc(L(`size.${p.name}`, p.name))} ${p.width ?? ''}${p.height ? `×${p.height}` : ''}</button>`).join('')}</div>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="add-size">${getIconSvg('plus', 14)} ${esc(L('add', 'Add'))}</button>
      </details>
      <div class="mud-ie__row">
        <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" data-ie="render">${getIconSvg('layers', 16)} ${esc(L('render', 'Create the sizes'))}</button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="save">${getIconSvg('upload', 16)} ${esc(L('upload', 'Upload'))}</button>
      </div>
      <div class="mud-ie__upload" hidden><p class="mud-ie__upload-status" role="status"></p></div>
      <ul class="mud-ie__exports" aria-label="${esc(L('created', 'Created files'))}"></ul>
      <h4 class="mud-ie__heading">${esc(L('recipe', 'Recipe'))}</h4>
      <p class="mud-ie__hint">${esc(L('recipeHint', 'Every operation on the original, and the sizes to make. Store it with the original to regenerate the same files later.'))}</p>
      <div class="mud-ie__row">
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="recipe-copy">${getIconSvg('copy', 14)} ${esc(L('recipeCopy', 'Copy'))}</button>
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" data-ie="recipe-download">${getIconSvg('download', 14)} ${esc(L('recipeDownload', 'Download .json'))}</button>
        <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-ie="recipe-load">${getIconSvg('upload', 14)} ${esc(L('recipeLoad', 'Load…'))}</button>
      </div>
      <details class="mud-ie__recipe">
        <summary>${esc(L('recipeShow', 'Show / paste the recipe'))}</summary>
        <textarea class="mud-ie__recipe-text" rows="10" spellcheck="false" dir="ltr" aria-label="${esc(L('recipe', 'Recipe'))}"></textarea>
        <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" data-ie="recipe-apply">${esc(L('recipeApply', 'Apply this recipe'))}</button>
      </details>
      <input type="file" accept="application/json,.json" data-recipe-file hidden>`;
  }

  // ───────────────────────── events ─────────────────────────

  _bind() {
    const el = this.el;
    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('input', (e) => this._onInput(e));
    el.addEventListener('change', (e) => this._onChange(e));
    el.addEventListener('dblclick', (e) => {
      const box = e.target.closest('[data-adjust], [data-transform="straighten"]');
      if (!box || !e.target.matches('input[type="range"]')) return;
      if (box.dataset.transform) this.straighten(0); else this.adjust({ [box.dataset.adjust]: 0 });
    });
    el.addEventListener('keydown', (e) => this._onKey(e));
    this._onKeyUp = (e) => { if (e.key === ' ' && this._spacePan) { this._spacePan = false; this._syncCursor(); } };
    document.addEventListener('keyup', this._onKeyUp);

    // Tabs (arrow keys between them)
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    el.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const rtl = getComputedStyle(el).direction === 'rtl';
      const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
      this._selectTab(tabs[next].dataset.tab, true);
    });

    // Compare: hold
    const compare = el.querySelector('[data-ie="compare"]');
    const on = () => { this._comparing = true; compare.setAttribute('aria-pressed', 'true'); this._render(); };
    const off = () => { if (!this._comparing) return; this._comparing = false; compare.setAttribute('aria-pressed', 'false'); this._render(); };
    compare.addEventListener('pointerdown', on);
    compare.addEventListener('pointerup', off);
    compare.addEventListener('pointerleave', off);
    compare.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); on(); } });
    compare.addEventListener('keyup', off);

    // Files: open, drop, paste
    this.$.file.addEventListener('change', () => { const f = this.$.file.files?.[0]; if (f) this.open(f); this.$.file.value = ''; });
    const recipeFile = el.querySelector('[data-recipe-file]');
    recipeFile.addEventListener('change', async () => {
      const f = recipeFile.files?.[0];
      recipeFile.value = '';
      if (f) this.applyRecipe(await f.text());
    });
    el.querySelector('.mud-ie__recipe').addEventListener('toggle', (e) => { if (e.target.open) this._renderRecipe(); });
    const stage = this.$.stage;
    stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { e.preventDefault(); this.$.drop.hidden = false; } });
    stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) this.$.drop.hidden = true; });
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      this.$.drop.hidden = true;
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) this.open(f);
    });
    el.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); this.open(f); }
    });

    // Canvas pointer input
    stage.addEventListener('pointerdown', (e) => this._pointerDown(e));
    stage.addEventListener('pointermove', (e) => this._pointerMove(e));
    stage.addEventListener('pointerup', (e) => this._pointerUp(e));
    stage.addEventListener('pointercancel', (e) => this._pointerUp(e, true));
    stage.addEventListener('pointerleave', () => { this.$.status.querySelector('[data-status="pos"]').textContent = ''; });
    stage.addEventListener('wheel', (e) => {
      if (!this.source) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      this.zoomTo(this._zoom() * factor, { x: e.clientX - r.left, y: e.clientY - r.top });
    }, { passive: false });

    // Text tool input
    const text = this.$.text;
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this._cancelText(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._commitText(); }
      e.stopPropagation();
    });
    text.addEventListener('input', () => { text.rows = Math.max(1, text.value.split('\n').length); });
    text.addEventListener('blur', () => this._commitText());
  }

  _onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { this._selectTab(tab.dataset.tab); return; }
    const tool = e.target.closest('[data-tool]');
    if (tool) { this.setTool(tool.dataset.tool); return; }
    const preset = e.target.closest('[data-preset]');
    if (preset) { this.applyPreset(preset.dataset.preset); return; }
    const ratio = e.target.closest('[data-ratio]');
    if (ratio) { this.toolOptions.ratio = ratio.dataset.ratio; this.setTool('crop'); this._applyRatio(); this._renderOptions(); return; }
    const sizePreset = e.target.closest('[data-size-preset]');
    if (sizePreset) { this._addSize(SIZE_PRESETS.find((p) => p.name === sizePreset.dataset.sizePreset)); return; }
    const sizeToggle = e.target.closest('[data-size-toggle]');
    if (sizeToggle) { const s = this.sizes[Number(sizeToggle.dataset.sizeToggle)]; s.enabled = sizeToggle.checked; return; }
    const sizeRemove = e.target.closest('[data-size-remove]');
    if (sizeRemove) { this.sizes.splice(Number(sizeRemove.dataset.sizeRemove), 1); this._renderSizes(); return; }
    const dl = e.target.closest('[data-download]');
    if (dl) { this.download(dl.dataset.download); return; }
    const action = e.target.closest('[data-ie]')?.dataset.ie;
    if (!action) return;
    const needsImage = !['open'].includes(action);
    if (needsImage && !this.source) { if (action !== 'compare') this._announce(L('openFirst', 'Open an image first.')); return; }
    switch (action) {
      case 'open': this.$.file.click(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'rotate-left': this.rotate(-1); break;
      case 'rotate-right': this.rotate(1); break;
      case 'flip-h': this.flip('h'); break;
      case 'flip-v': this.flip('v'); break;
      case 'zoom-in': this.zoomIn(); break;
      case 'zoom-out': this.zoomOut(); break;
      case 'zoom-fit': this.zoomFit(); break;
      case 'zoom-actual': this.zoomActual(); break;
      case 'reset': this.reset(); break;
      case 'reset-adjust': this._commit(() => { this.state.adjust = { ...DEFAULT_ADJUSTMENTS }; this.state.preset = 'none'; }); break;
      case 'download': this.download(); break;
      case 'save': this.upload(); break;
      case 'render': this.exportSizes(); break;
      case 'apply-crop': this._applyCrop(); break;
      case 'cancel-crop': this.pendingCrop = null; this.setTool('move'); break;
      case 'swap-ratio': this._swapRatio(); break;
      case 'clear-crop': this._commit(() => { this.state.crop = null; }); this.pendingCrop = this.tool === 'crop' ? centeredCrop(this._bounds(), null) : null; this._render(); break;
      case 'clear-annotations': this._commit(() => { this.state.annotations = []; }); break;
      case 'lock': { const b = e.target.closest('[data-ie]'); b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); break; }
      case 'apply-size': this._applySize(); break;
      case 'clear-size': this.resize(null); break;
      case 'add-size': this._addSize(); break;
      case 'recipe-copy': this._copyRecipe(); break;
      case 'recipe-download': this._downloadRecipe(); break;
      case 'recipe-load': this.el.querySelector('[data-recipe-file]').click(); break;
      case 'recipe-apply': this.applyRecipe(this.el.querySelector('.mud-ie__recipe-text').value); break;
      default: break;
    }
  }

  _onInput(e) {
    const t = e.target;
    const adj = t.closest('[data-adjust]');
    if (adj && t.type === 'range') {
      this._beginLive();
      this.state.adjust = { ...this.state.adjust, [adj.dataset.adjust]: Number(t.value) };
      this.state.preset = 'custom';
      adj.querySelector('output').textContent = formatNumber(Number(t.value));
      this._recompose(true);
      return;
    }
    if (t.closest('[data-transform="straighten"]') && t.type === 'range') {
      this._beginLive();
      this._mapTo({ ...this.state, angle: Number(t.value) });
      t.closest('label').querySelector('output').textContent = `${formatNumber(Number(t.value))}°`;
      this._recompose(true);
      return;
    }
    if (t.matches('[data-export="quality"] input')) {
      this.quality = Number(t.value) / 100;
      t.closest('label').querySelector('output').textContent = formatNumber(Number(t.value));
      return;
    }
    if (t.matches('[data-resize]')) { this._linkResize(t); return; }
    if (t.matches('[data-opt]')) { this._readOption(t); }
  }

  _onChange(e) {
    const t = e.target;
    if ((t.closest('[data-adjust]') || t.closest('[data-transform="straighten"]')) && t.type === 'range') { this._endLive(); return; }
    if (t.closest('[data-adjust="invert"]')) { this.adjust({ invert: t.checked ? 100 : 0 }); return; }
    if (t.matches('[data-transform="background"], [data-transform="transparent"]')) {
      const color = this.el.querySelector('[data-transform="background"]').value;
      const transparent = this.el.querySelector('[data-transform="transparent"]').checked;
      this._commit(() => { this.state.background = transparent ? null : color; });
      return;
    }
    if (t.matches('[data-export="format"]')) { this.format = t.value; return; }
    if (t.matches('[data-size-field]')) {
      const [i, field] = t.dataset.sizeField.split(':');
      const s = this.sizes[Number(i)];
      s[field] = field === 'fit' ? t.value : Number(t.value) || null;
      return;
    }
    if (t.matches('[data-opt]')) this._readOption(t);
  }

  _onKey(e) {
    if (e.target.matches('input, textarea, select') && e.target !== this.$.stage) {
      if (e.key === 'Enter' && e.target.matches('[data-resize]')) this._applySize();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (ctrl) return;
    if (e.key === ' ' && e.target === this.$.stage) { e.preventDefault(); this._spacePan = true; this._syncCursor(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomIn(); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomOut(); return; }
    if (e.key === '0') { this.zoomFit(); return; }
    if (e.key === '1') { this.zoomActual(); return; }
    if (e.key === 'Enter' && this.tool === 'crop') { e.preventDefault(); this._applyCrop(); return; }
    if (e.key === 'Escape' && this.tool === 'crop') { this.pendingCrop = null; this.setTool('move'); return; }
    if (e.key === '[') { this.toolOptions.size = Math.max(1, this.toolOptions.size - 2); this._renderOptions(); return; }
    if (e.key === ']') { this.toolOptions.size = Math.min(200, this.toolOptions.size + 2); this._renderOptions(); return; }
    const tool = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (tool && e.target.closest('.mud-ie__stage, .mud-ie__tools, .mud-ie__toolbar')) { this.setTool(tool.id); }
  }

  _readOption(t) {
    const key = t.dataset.opt;
    if (key === 'ratio') { this.toolOptions.ratio = t.value; this._applyRatio(); return; }
    this.toolOptions[key] = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? Number(t.value) : t.value;
    const out = t.closest('label')?.querySelector('output');
    if (out) out.textContent = formatNumber(Number(t.value));
    if (key === 'thirds') this._render();
  }

  // ───────────────────────── state ─────────────────────────

  _snapshot() { return clone(this.state); }

  _commit(fn) {
    if (!this.source) return;
    this.history.push(this._snapshot());
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    fn();
    this._afterChange();
  }

  /** Slider drags: one history step for the whole drag. */
  _beginLive() {
    if (this._live || !this.source) return;
    this._live = true;
    this.history.push(this._snapshot());
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  }

  _endLive() {
    if (!this._live) return;
    this._live = false;
    this._afterChange();
  }

  _afterChange() {
    if (this.tool === 'crop') this.pendingCrop = this.state.crop ? { ...this.state.crop } : centeredCrop(this._bounds(), null);
    this._recompose();
    this._syncPanels();
    this._renderRecipe();
    this.options.onChange?.(this.getState());
  }

  /** Changes rotation / flips, carrying the crop and annotations to their new places. */
  _transform(patch) {
    if (!this.source) return;
    this._commit(() => this._mapTo({ ...this.state, ...patch }));
  }

  _mapTo(next) {
    const s = this.state;
    const w = this.source.width;
    const h = this.source.height;
    const from = { deg: angleOf(s), flipH: s.flipH, flipV: s.flipV };
    const to = { deg: angleOf(next), flipH: next.flipH, flipV: next.flipV };
    const map = (p) => mapPoint(p, w, h, from, to);
    const crop = s.crop ? mapRect(s.crop, w, h, from, to) : null;
    const annotations = s.annotations.map((a) => {
      if (a.type === 'brush' || a.type === 'highlighter') return { ...a, points: a.points.map(map) };
      if (a.type === 'arrow' || a.type === 'line') { const p1 = map({ x: a.x1, y: a.y1 }); const p2 = map({ x: a.x2, y: a.y2 }); return { ...a, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }; }
      if (a.type === 'text') { const p = map({ x: a.x, y: a.y }); return { ...a, x: p.x, y: p.y }; }
      const r = mapRect({ x: a.x, y: a.y, width: a.w, height: a.h }, w, h, from, to);
      return { ...a, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (this.pendingCrop) this.pendingCrop = mapRect(this.pendingCrop, w, h, from, to);
    this.state = { ...next, crop, annotations };
  }

  // ───────────────────────── rendering ─────────────────────────

  _bounds() { return this.source ? geometryBounds(this.source, this.state) : { width: 1, height: 1 }; }

  /** The region shown: the whole image while cropping, otherwise the crop (or the whole image). */
  _region() {
    const b = this._bounds();
    if (this.tool === 'crop' || !this.state.crop) return { x: 0, y: 0, width: b.width, height: b.height };
    return this.state.crop;
  }

  _zoom() {
    if (!this.view.fit) return this.view.zoom;
    const r = this._region();
    const stage = this.$.stage.getBoundingClientRect();
    const pad = this.tool === 'crop' ? 48 : 24;
    return Math.max(0.01, Math.min((stage.width - pad * 2) / r.width, (stage.height - pad * 2) / r.height, 8));
  }

  /** Screen position (stage pixels) of the region's top-left corner. */
  _origin() {
    const r = this._region();
    const z = this._zoom();
    const stage = this.$.stage.getBoundingClientRect();
    const panX = this.view.fit ? 0 : this.view.panX;
    const panY = this.view.fit ? 0 : this.view.panY;
    return { x: (stage.width - r.width * z) / 2 + panX, y: (stage.height - r.height * z) / 2 + panY };
  }

  /** Stage pixels → image pixels (the rotated box). */
  _toImage(sx, sy) {
    const r = this._region();
    const z = this._zoom();
    const o = this._origin();
    return { x: r.x + (sx - o.x) / z, y: r.y + (sy - o.y) / z };
  }

  _toScreen(x, y) {
    const r = this._region();
    const z = this._zoom();
    const o = this._origin();
    return { x: o.x + (x - r.x) * z, y: o.y + (y - r.y) * z };
  }

  /** Rebuilds the working preview (adjustments etc.) on the next frame. `fast` skips the histogram while dragging. */
  _recompose(fast = false) {
    if (!this.source) { this._render(); return; }
    this._fast = fast;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const b = this._bounds();
      const scale = Math.min(1, this.options.previewSize / Math.max(b.width, b.height));
      this.preview = { canvas: compose(this.source, this.state, scale), scale };
      this._before = null;
      this._render();
      if (!this._fast) { this._drawHistogram(); this._renderPresets(); }
      else { clearTimeout(this._histTimer); this._histTimer = setTimeout(() => this._drawHistogram(), 200); }
    });
  }

  _render() {
    if (this.disposed) return;
    const stage = this.$.stage;
    const canvas = this.$.canvas;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = stage.getBoundingClientRect();
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.$.empty.hidden = !!this.source;
    this.el.classList.toggle('has-image', !!this.source);
    if (!this.source || !this.preview) { this._renderStatus(); return; }

    const r = this._region();
    const z = this._zoom();
    const o = this._origin();
    const s = this.preview.scale;
    let img = this.preview.canvas;
    if (this._comparing) {
      this._before ??= compose(this.source, { ...this.state, adjust: { ...DEFAULT_ADJUSTMENTS }, annotations: [] }, s);
      img = this._before;
    }
    this.$.badge.hidden = !this._comparing;
    ctx.imageSmoothingEnabled = z < 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.drawImage(img, r.x * s, r.y * s, r.width * s, r.height * s, o.x, o.y, r.width * z, r.height * z);
    ctx.restore();

    // The annotation being drawn.
    if (this.draft) {
      ctx.save();
      ctx.translate(o.x - r.x * z, o.y - r.y * z);
      ctx.scale(z, z);
      drawAnnotation(ctx, this.draft);
      ctx.restore();
    }
    if (this.tool === 'crop' && this.pendingCrop) this._drawCrop(ctx, width, height);
    this._renderStatus();
  }

  _drawCrop(ctx, width, height) {
    const c = this.pendingCrop;
    const a = this._toScreen(c.x, c.y);
    const b = this._toScreen(c.x + c.width, c.y + c.height);
    const w = b.x - a.x;
    const h = b.y - a.y;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(a.x, a.y, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(a.x, a.y, w, h);
    if (this.toolOptions.thirds) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(a.x + (w * i) / 3, a.y); ctx.lineTo(a.x + (w * i) / 3, b.y);
        ctx.moveTo(a.x, a.y + (h * i) / 3); ctx.lineTo(b.x, a.y + (h * i) / 3);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    for (const p of Object.values(this._handlePoints(a, b))) {
      ctx.beginPath();
      ctx.rect(p.x - 5, p.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
    // Size label
    const label = `${formatNumber(Math.round(c.width))} × ${formatNumber(Math.round(c.height))}`;
    ctx.font = '600 12px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 12;
    const ly = a.y > 26 ? a.y - 24 : a.y + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(a.x, ly, tw, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, a.x + 6, ly + 13);
    ctx.restore();
  }

  _handlePoints(a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return { nw: a, n: { x: mx, y: a.y }, ne: { x: b.x, y: a.y }, e: { x: b.x, y: my }, se: b, s: { x: mx, y: b.y }, sw: { x: a.x, y: b.y }, w: { x: a.x, y: my } };
  }

  _drawHistogram() {
    const c = this.$.hist;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this.preview) return;
    const p = this.preview.canvas;
    const data = p.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.width, p.height);
    const h = histogram(data, Math.max(1, Math.floor((p.width * p.height) / 120000)));
    const max = Math.max(1, ...h.l.slice(2, 254), ...h.r.slice(2, 254), ...h.g.slice(2, 254), ...h.b.slice(2, 254));
    const draw = (bins, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, c.height);
      for (let i = 0; i < 256; i++) ctx.lineTo(i, c.height - Math.min(1, bins[i] / max) * (c.height - 2));
      ctx.lineTo(255, c.height);
      ctx.fill();
    };
    ctx.globalCompositeOperation = 'source-over';
    draw(h.l, 'rgba(148,163,184,0.45)');
    ctx.globalCompositeOperation = 'lighter';
    draw(h.r, 'rgba(239,68,68,0.45)');
    draw(h.g, 'rgba(34,197,94,0.45)');
    draw(h.b, 'rgba(59,130,246,0.45)');
  }

  _renderPresets() {
    if (!this.source || this.$.presets.closest('[hidden]')) return;
    const key = JSON.stringify([this.state.quarter, this.state.angle, this.state.flipH, this.state.flipV, this.state.crop, this.source.width]);
    if (key !== this._thumbsKey) {
      this._thumbsKey = key;
      const b = this._bounds();
      const thumbScale = 120 / Math.max(b.width, b.height);
      const base = compose(this.source, { ...this.state, adjust: { ...DEFAULT_ADJUSTMENTS }, annotations: [] }, thumbScale);
      const crop = this.state.crop;
      const src = crop ? cropCanvas(base, { x: crop.x * thumbScale, y: crop.y * thumbScale, width: Math.max(1, crop.width * thumbScale), height: Math.max(1, crop.height * thumbScale) }) : base;
      this.$.presets.innerHTML = Object.keys(FILTER_PRESETS).map((name) => `<button type="button" class="mud-ie__preset" data-preset="${name}" aria-pressed="false"><canvas width="${src.width}" height="${src.height}"></canvas><span>${esc(PRESET_LABELS[name]?.() ?? name)}</span></button>`).join('');
      this.$.presets.querySelectorAll('[data-preset]').forEach((btn) => {
        const cv = btn.querySelector('canvas');
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, cv.width, cv.height);
        ctx.putImageData(applyAdjustments(data, presetAdjustments(btn.dataset.preset)), 0, 0);
      });
    }
    this.$.presets.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === this.state.preset)));
  }

  _renderStatus() {
    const st = this.$.status;
    const z = this.source ? this._zoom() : 1;
    this.$.zoom.textContent = `${formatNumber(Math.round(z * 100))}%`;
    if (!this.source) { st.querySelector('[data-status="size"]').textContent = ''; st.querySelector('[data-status="zoom"]').textContent = ''; return; }
    const r = this.tool === 'crop' && this.pendingCrop ? this.pendingCrop : this._region();
    const out = this.state.resize ? fitSize(r.width, r.height, { ...this.state.resize, fit: this.state.resize.width && this.state.resize.height ? 'fill' : this.state.resize.width ? 'width' : 'height' }) : null;
    st.querySelector('[data-status="size"]').textContent = `${formatNumber(Math.round(r.width))} × ${formatNumber(Math.round(r.height))} px${out ? ` → ${formatNumber(out.width)} × ${formatNumber(out.height)}` : ''}`;
    st.querySelector('[data-status="zoom"]').textContent = `${formatNumber(Math.round(z * 100))}%`;
    st.querySelector('[data-status="hint"]').textContent = this._hint();
    this.el.querySelector('[data-ie="undo"]').disabled = !this.history.length;
    this.el.querySelector('[data-ie="redo"]').disabled = !this.future.length;
  }

  _hint() {
    switch (this.tool) {
      case 'crop': return L('hint.crop', 'Drag the handles or the frame. Enter applies, Esc cancels.');
      case 'brush': case 'highlighter': return L('hint.brush', 'Draw on the image. [ and ] change the size.');
      case 'text': return L('hint.text', 'Click where the text goes. Enter adds it, Shift+Enter starts a new line.');
      case 'eyedropper': return L('hint.eyedropper', 'Click a colour in the image to use it.');
      case 'move': return L('hint.move', 'Drag to pan, scroll to zoom. Space+drag pans with any tool.');
      default: return L('hint.shape', 'Drag to draw.');
    }
  }

  // ───────────────────────── panels ─────────────────────────

  _selectTab(id, focus = false) {
    this.el.querySelectorAll('[role="tab"]').forEach((tb) => {
      const on = tb.dataset.tab === id;
      tb.setAttribute('aria-selected', String(on));
      tb.tabIndex = on ? 0 : -1;
      if (on && focus) tb.focus();
    });
    this.el.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== id; });
    if (id === 'filters') this._renderPresets();
    if (id === 'export') this._renderSizes();
    if (id === 'transform') this._syncSizeInputs();
  }

  _syncPanels() {
    const a = this.state.adjust;
    this.el.querySelectorAll('[data-adjust]').forEach((box) => {
      const key = box.dataset.adjust;
      const input = box.querySelector('input');
      if (key === 'invert') { input.checked = (a.invert ?? 0) >= 50; return; }
      input.value = a[key] ?? 0;
      box.querySelector('output').textContent = formatNumber(Number(a[key] ?? 0));
    });
    const straighten = this.el.querySelector('[data-transform="straighten"]');
    straighten.querySelector('input').value = this.state.angle;
    straighten.querySelector('output').textContent = `${formatNumber(this.state.angle)}°`;
    this.el.querySelector('[data-transform="transparent"]').checked = !this.state.background;
    if (this.state.background) this.el.querySelector('[data-transform="background"]').value = this.state.background;
    this._syncSizeInputs();
    this._renderPresets();
    this._renderOptions();
    this._render();
  }

  _syncTools() {
    this.el.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
    this.el.dataset.activeTool = this.tool;
    this._syncCursor();
    this._renderOptions();
  }

  _syncCursor() {
    const cursor = this._spacePan || this.tool === 'move' ? 'grab' : this.tool === 'text' ? 'text' : this.tool === 'eyedropper' ? 'copy' : this.tool === 'crop' ? 'default' : 'crosshair';
    this.$.stage.style.cursor = cursor;
  }

  /** The options bar above the canvas changes with the tool, like Photoshop's. */
  _renderOptions() {
    const o = this.toolOptions;
    const color = `<label class="mud-ie__opt"><span>${esc(L('opt.color', 'Colour'))}</span><input type="color" data-opt="color" value="${esc(o.color)}"></label>`;
    const size = (label, key, min, max) => `<label class="mud-ie__opt mud-ie__opt--range"><span>${esc(label)}</span><input type="range" class="mud-slider" min="${min}" max="${max}" data-opt="${key}" value="${o[key]}"><output>${formatNumber(o[key])}</output></label>`;
    let html = '';
    switch (this.tool) {
      case 'crop':
        html = `<label class="mud-ie__opt"><span>${esc(L('opt.ratio', 'Ratio'))}</span><span class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense"><select class="mud-input-slot" data-opt="ratio">
            ${ASPECT_RATIOS.map((r) => `<option value="${r.id}" ${r.id === o.ratio ? 'selected' : ''}>${esc(r.id === 'free' ? L('ratio.free', 'Free') : r.id === 'original' ? L('ratio.original', 'Original') : r.label)}</option>`).join('')}</select></span></label>
          <button type="button" class="mud-ie__btn" data-ie="swap-ratio" title="${esc(L('swapRatio', 'Portrait / landscape'))}" aria-label="${esc(L('swapRatio', 'Portrait / landscape'))}">${getIconSvg('refresh', 16)}</button>
          <label class="mud-checkbox mud-ie__opt"><input type="checkbox" data-opt="thirds" ${o.thirds ? 'checked' : ''}> ${esc(L('opt.thirds', 'Rule of thirds'))}</label>
          <span class="mud-ie__grow"></span>
          <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-small" data-ie="cancel-crop">${esc(L('cancel', 'Cancel'))}</button>
          <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" data-ie="apply-crop">${getIconSvg('check', 14)} ${esc(L('applyCrop', 'Apply crop'))}</button>`;
        break;
      case 'brush': case 'highlighter':
        html = `${color}${size(L('opt.size', 'Size'), 'size', 1, 200)}<span class="mud-ie__grow"></span>${this._clearAnnotationsBtn()}`;
        break;
      case 'text':
        html = `${color}${size(L('opt.fontSize', 'Font size'), 'fontSize', 8, 400)}
          <label class="mud-ie__opt"><span>${esc(L('opt.font', 'Font'))}</span><span class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense"><select class="mud-input-slot" data-opt="font">
            ${[['system-ui, sans-serif', 'Sans'], ['Georgia, serif', 'Serif'], ['"Courier New", monospace', 'Mono'], ['Impact, "Arial Black", sans-serif', 'Impact']].map(([v, l]) => `<option value="${esc(v)}" ${v === o.font ? 'selected' : ''}>${l}</option>`).join('')}</select></span></label>
          <label class="mud-checkbox mud-ie__opt"><input type="checkbox" data-opt="bold" ${o.bold ? 'checked' : ''}> ${esc(L('opt.bold', 'Bold'))}</label>
          <span class="mud-ie__grow"></span>${this._clearAnnotationsBtn()}`;
        break;
      case 'rect': case 'ellipse': case 'arrow':
        html = `${color}${size(L('opt.stroke', 'Line width'), 'size', 1, 60)}${this.tool !== 'arrow' ? `<label class="mud-checkbox mud-ie__opt"><input type="checkbox" data-opt="fill" ${o.fill ? 'checked' : ''}> ${esc(L('opt.fill', 'Filled'))}</label>` : ''}<span class="mud-ie__grow"></span>${this._clearAnnotationsBtn()}`;
        break;
      case 'eyedropper':
        html = `${color}<span class="mud-ie__opt-text">${esc(L('hint.eyedropper', 'Click a colour in the image to use it.'))}</span>`;
        break;
      default:
        html = `<span class="mud-ie__opt-text">${esc(L('hint.move', 'Drag to pan, scroll to zoom. Space+drag pans with any tool.'))}</span>`;
    }
    this.$.options.innerHTML = html;
  }

  _clearAnnotationsBtn() {
    return this.state.annotations.length
      ? `<button type="button" class="mud-button-root mud-button-text mud-button-error mud-button-small" data-ie="clear-annotations">${esc(L('clearDrawing', 'Clear drawings'))}</button>` : '';
  }

  _syncSizeInputs() {
    const r = this.state.crop ?? (this.source ? { width: this._bounds().width, height: this._bounds().height } : null);
    const w = this.el.querySelector('[data-resize="width"]');
    const h = this.el.querySelector('[data-resize="height"]');
    if (!r) return;
    const out = this.state.resize ? fitSize(r.width, r.height, { ...this.state.resize, fit: this.state.resize.width && this.state.resize.height ? 'fill' : this.state.resize.width ? 'width' : 'height' }) : { width: r.width, height: r.height };
    if (document.activeElement !== w) w.value = Math.round(out.width);
    if (document.activeElement !== h) h.value = Math.round(out.height);
    this.el.querySelector('[data-info="size"]').textContent = L('sizeInfo', 'Cropped: {w} × {h} px. Output: {ow} × {oh} px.', {
      w: formatNumber(Math.round(r.width)), h: formatNumber(Math.round(r.height)), ow: formatNumber(Math.round(out.width)), oh: formatNumber(Math.round(out.height)),
    });
  }

  _linkResize(input) {
    if (this.el.querySelector('[data-ie="lock"]').getAttribute('aria-pressed') !== 'true' || !this.source) return;
    const r = this.state.crop ?? this._bounds();
    const ratio = r.width / r.height;
    const other = this.el.querySelector(`[data-resize="${input.dataset.resize === 'width' ? 'height' : 'width'}"]`);
    const v = Number(input.value);
    if (!v) return;
    other.value = Math.round(input.dataset.resize === 'width' ? v / ratio : v * ratio);
  }

  _applySize() {
    const width = Number(this.el.querySelector('[data-resize="width"]').value) || null;
    const height = Number(this.el.querySelector('[data-resize="height"]').value) || null;
    const locked = this.el.querySelector('[data-ie="lock"]').getAttribute('aria-pressed') === 'true';
    this.resize(locked ? { width } : { width, height });
  }

  _renderSizes() {
    const box = this.el.querySelector('.mud-ie__sizes');
    box.innerHTML = this.sizes.length ? this.sizes.map((s, i) => `
      <div class="mud-ie__size-row">
        <label class="mud-checkbox"><input type="checkbox" data-size-toggle="${i}" ${s.enabled !== false ? 'checked' : ''}> <strong>${esc(L(`size.${s.name}`, s.name))}</strong></label>
        <span class="mud-ie__size-dims">
          <input type="number" min="1" class="mud-ie__mini" data-size-field="${i}:width" value="${s.width ?? ''}" aria-label="${esc(L('width', 'Width'))}" placeholder="${esc(L('auto', 'auto'))}">
          ×
          <input type="number" min="1" class="mud-ie__mini" data-size-field="${i}:height" value="${s.height ?? ''}" aria-label="${esc(L('height', 'Height'))}" placeholder="${esc(L('auto', 'auto'))}">
          <select class="mud-ie__mini" data-size-field="${i}:fit" aria-label="${esc(L('fit', 'Fit'))}">${FITS.map((f) => `<option value="${f}" ${f === s.fit ? 'selected' : ''}>${esc(L(`fit.${f}`, f))}</option>`).join('')}</select>
        </span>
        <button type="button" class="mud-ie__btn mud-ie__btn--small" data-size-remove="${i}" aria-label="${esc(L('removeSize', 'Remove {name}', { name: s.name }))}">${getIconSvg('close', 14)}</button>
      </div>`).join('') : `<p class="mud-ie__hint">${esc(L('noSizes', 'No sizes: only the edited image is created.'))}</p>`;
  }

  _addSize(preset = null) {
    const read = (k) => this.el.querySelector(`[data-new="${k}"]`);
    const size = preset ? { ...preset } : {
      name: read('name').value.trim() || `size-${this.sizes.length + 1}`,
      width: Number(read('width').value) || null,
      height: Number(read('height').value) || null,
      fit: read('fit').value,
    };
    if (!size.width && !size.height) { this._announce(L('sizeNeeded', 'Give a width or a height.')); read('width').focus(); return; }
    size.name = size.name.replace(/[^\w-]+/g, '-').toLowerCase();
    const existing = this.sizes.findIndex((s) => s.name === size.name);
    if (existing >= 0) this.sizes[existing] = { ...size, enabled: true }; else this.sizes.push({ ...size, enabled: true });
    ['name', 'width', 'height'].forEach((k) => { read(k).value = ''; });
    this._renderSizes();
  }

  _renderExports() {
    const list = this.el.querySelector('.mud-ie__exports');
    list.innerHTML = this.exports.map((f) => `
      <li class="mud-ie__export">
        <img src="${f.url}" alt="" loading="lazy">
        <span class="mud-ie__export-info"><strong>${esc(L(`size.${f.name}`, f.name))}</strong>
          <small>${formatNumber(f.width)} × ${formatNumber(f.height)} · ${esc(formatBytes(f.size, (n) => formatNumber(n, { maximumFractionDigits: 1 })))} · ${esc(f.type.replace('image/', '').toUpperCase())}</small></span>
        <button type="button" class="mud-ie__btn mud-ie__btn--small" data-download="${esc(f.name)}" aria-label="${esc(L('downloadFile', 'Download {name}', { name: f.fileName }))}" title="${esc(f.fileName)}">${getIconSvg('download', 16)}</button>
      </li>`).join('');
    if (this.exports.length) this._selectTab('export');
  }

  /** Fills the recipe box (when it is open) with the current recipe. */
  _renderRecipe() {
    const box = this.el.querySelector('.mud-ie__recipe');
    if (!box?.open || !this.source) return;
    box.querySelector('textarea').value = JSON.stringify(this.getRecipe(), null, 2);
  }

  async _copyRecipe() {
    if (!this.source) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(this.getRecipe(), null, 2));
      showToast(L('recipeCopied', 'Recipe copied.'), 'success');
    } catch {
      const box = this.el.querySelector('.mud-ie__recipe');
      box.open = true;
      this._renderRecipe();
      box.querySelector('textarea').select();
    }
  }

  _downloadRecipe() {
    if (!this.source) return;
    const blob = new Blob([JSON.stringify(this.getRecipe(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this._baseName()}.recipe.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Puts the format and quality controls in line with this.format / this.quality (after applyRecipe). */
  _syncExportSettings() {
    const fmt = this.el.querySelector('[data-export="format"]');
    if (fmt) fmt.value = this.format;
    const q = this.el.querySelector('[data-export="quality"]');
    if (q) { q.querySelector('input').value = Math.round(this.quality * 100); q.querySelector('output').textContent = formatNumber(Math.round(this.quality * 100)); }
  }

  _clearExports() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
    this.exports = [];
    const list = this.el?.querySelector('.mud-ie__exports');
    if (list) list.innerHTML = '';
  }

  // ───────────────────────── pointer tools ─────────────────────────

  _stagePoint(e) {
    const r = this.$.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _pointerDown(e) {
    if (!this.source || (e.button !== 0 && e.button !== 1)) return;
    this.$.stage.focus({ preventScroll: true });
    const p = this._stagePoint(e);
    this._pointers ??= new Map();
    this._pointers.set(e.pointerId, p);
    this.$.stage.setPointerCapture(e.pointerId);
    if (this._pointers.size === 2) { // pinch
      const [a, b] = [...this._pointers.values()];
      this.drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this._zoom() };
      this.draft = null;
      return;
    }
    const img = this._toImage(p.x, p.y);
    const o = this.toolOptions;
    if (e.button === 1 || this._spacePan || this.tool === 'move') {
      this.drag = { kind: 'pan', start: p, pan: { x: this.view.fit ? 0 : this.view.panX, y: this.view.fit ? 0 : this.view.panY }, zoom: this._zoom() };
      this.view.zoom = this._zoom();
      this.view.fit = false;
      this.$.stage.style.cursor = 'grabbing';
      return;
    }
    if (this.tool === 'crop') {
      const c = this.pendingCrop;
      const a = this._toScreen(c.x, c.y);
      const b = this._toScreen(c.x + c.width, c.y + c.height);
      const hit = Object.entries(this._handlePoints(a, b)).find(([, h]) => Math.hypot(h.x - p.x, h.y - p.y) <= 12);
      if (hit) this.drag = { kind: 'crop-resize', handle: hit[0], start: img, rect: { ...c } };
      else if (p.x > a.x && p.x < b.x && p.y > a.y && p.y < b.y) this.drag = { kind: 'crop-move', start: img, rect: { ...c } };
      else this.drag = { kind: 'crop-new', start: img };
      return;
    }
    if (this.tool === 'eyedropper') { this._pick(img); return; }
    if (this.tool === 'text') { this._startText(p, img); return; }
    if (this.tool === 'brush' || this.tool === 'highlighter') {
      const size = this.tool === 'highlighter' ? Math.max(o.size, 18) : o.size;
      this.draft = { type: this.tool, color: o.color, size: size / this._zoom(), points: [img] };
    } else if (this.tool === 'rect' || this.tool === 'ellipse') {
      this.draft = { type: this.tool, color: o.color, size: o.size / this._zoom(), fill: o.fill, x: img.x, y: img.y, w: 0, h: 0 };
    } else if (this.tool === 'arrow') {
      this.draft = { type: 'arrow', color: o.color, size: o.size / this._zoom(), x1: img.x, y1: img.y, x2: img.x, y2: img.y };
    }
    this.drag = { kind: 'draw', start: img };
    this._render();
  }

  _pointerMove(e) {
    const p = this._stagePoint(e);
    if (this.source) {
      const img = this._toImage(p.x, p.y);
      const b = this._bounds();
      this.$.status.querySelector('[data-status="pos"]').textContent = img.x >= 0 && img.y >= 0 && img.x <= b.width && img.y <= b.height
        ? `x ${formatNumber(Math.round(img.x))}, y ${formatNumber(Math.round(img.y))}` : '';
    }
    if (this._pointers?.has(e.pointerId)) this._pointers.set(e.pointerId, p);
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pinch' && this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomTo(d.zoom * (dist / d.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    if (d.kind === 'pan') {
      this.view.panX = d.pan.x + (p.x - d.start.x);
      this.view.panY = d.pan.y + (p.y - d.start.y);
      this._render();
      return;
    }
    const img = this._toImage(p.x, p.y);
    const bounds = this._bounds();
    const ratio = resolveRatio(this.toolOptions.ratio, bounds);
    if (d.kind === 'crop-resize') {
      this.pendingCrop = resizeCrop(d.rect, d.handle, img.x - d.start.x, img.y - d.start.y, ratio, bounds);
    } else if (d.kind === 'crop-move') {
      this.pendingCrop = moveCrop(d.rect, img.x - d.start.x, img.y - d.start.y, bounds);
    } else if (d.kind === 'crop-new') {
      const x = clamp(Math.min(d.start.x, img.x), 0, bounds.width);
      const y = clamp(Math.min(d.start.y, img.y), 0, bounds.height);
      let w = Math.min(Math.abs(img.x - d.start.x), bounds.width - x);
      let h = Math.min(Math.abs(img.y - d.start.y), bounds.height - y);
      if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
      if (w > 4 && h > 4) this.pendingCrop = { x, y, width: w, height: h };
    } else if (d.kind === 'draw' && this.draft) {
      const a = this.draft;
      if (a.type === 'brush' || a.type === 'highlighter') {
        const last = a.points[a.points.length - 1];
        if (Math.hypot(img.x - last.x, img.y - last.y) * this._zoom() > 1.5) a.points.push(img);
      } else if (a.type === 'arrow') { a.x2 = img.x; a.y2 = img.y; }
      else {
        let w = img.x - d.start.x;
        let h = img.y - d.start.y;
        if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        a.x = w < 0 ? d.start.x + w : d.start.x; a.y = h < 0 ? d.start.y + h : d.start.y; a.w = Math.abs(w); a.h = Math.abs(h);
      }
    }
    this._render();
  }

  _pointerUp(e, cancelled = false) {
    this._pointers?.delete(e.pointerId);
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pinch' && this._pointers?.size) return;
    this.drag = null;
    this._syncCursor();
    if (d.kind === 'draw' && this.draft) {
      const a = this.draft;
      this.draft = null;
      const tiny = (a.type === 'rect' || a.type === 'ellipse') ? a.w < 2 || a.h < 2 : a.type === 'arrow' ? Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 3 : false;
      if (!cancelled && !tiny) this._commit(() => { this.state.annotations = [...this.state.annotations, a]; });
      else this._render();
      this._renderOptions();
    } else this._render();
  }

  _pick(img) {
    const p = this.preview;
    const x = Math.floor(img.x * p.scale);
    const y = Math.floor(img.y * p.scale);
    if (x < 0 || y < 0 || x >= p.canvas.width || y >= p.canvas.height) return;
    const [r, g, b] = p.canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    this.toolOptions.color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    this._renderOptions();
    this._announce(L('picked', 'Colour {color} picked.', { color: this.toolOptions.color }));
  }

  _startText(screen, img) {
    this._commitText();
    const t = this.$.text;
    const z = this._zoom();
    this._textAt = img;
    t.hidden = false;
    t.value = '';
    t.rows = 1;
    t.style.left = `${screen.x}px`;
    t.style.top = `${screen.y}px`;
    t.style.color = this.toolOptions.color;
    t.style.font = `${this.toolOptions.bold ? '700 ' : ''}${Math.max(10, this.toolOptions.fontSize * z)}px ${this.toolOptions.font}`;
    t.dir = getComputedStyle(this.el).direction;
    setTimeout(() => t.focus(), 0);
  }

  _commitText() {
    const t = this.$?.text;
    if (!t || t.hidden) return;
    const value = t.value.trim();
    const at = this._textAt;
    t.hidden = true;
    t.value = '';
    if (!value || !at) return;
    const dir = t.dir;
    const o = this.toolOptions;
    // In RTL the box grows to the left of the click: anchor the text at its start.
    const width = this.$.text.scrollWidth / this._zoom();
    this._commit(() => {
      this.state.annotations = [...this.state.annotations, { type: 'text', text: value, x: dir === 'rtl' ? at.x - width : at.x, y: at.y, color: o.color, size: o.fontSize, font: o.font, bold: o.bold }];
    });
    this.$.stage.focus({ preventScroll: true });
  }

  _cancelText() { this.$.text.hidden = true; this.$.text.value = ''; this.$.stage.focus({ preventScroll: true }); }

  _applyRatio() {
    if (!this.source) return;
    const bounds = this._bounds();
    const ratio = resolveRatio(this.toolOptions.ratio, bounds);
    if (!ratio) { this._render(); return; }
    // Keep the centre of the current frame, take the biggest box with the ratio that fits.
    const c = this.pendingCrop ?? centeredCrop(bounds, null);
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    let w = c.width;
    let h = w / ratio;
    if (h > c.height) { h = c.height; w = h * ratio; }
    const x = clamp(cx - w / 2, 0, bounds.width - w);
    const y = clamp(cy - h / 2, 0, bounds.height - h);
    this.pendingCrop = { x, y, width: w, height: h };
    this._render();
  }

  _swapRatio() {
    const r = ASPECT_RATIOS.find((a) => a.id === this.toolOptions.ratio);
    if (!r || typeof r.value !== 'number' || r.value === 1) return;
    const [a, b] = r.id.split(':');
    const swapped = `${b}:${a}`;
    this.toolOptions.ratio = ASPECT_RATIOS.some((x) => x.id === swapped) ? swapped : this.toolOptions.ratio;
    this._renderOptions();
    this._applyRatio();
  }

  _applyCrop() {
    if (!this.pendingCrop) return;
    const rect = clampRect(this.pendingCrop, this._bounds());
    this.tool = 'move';
    this.pendingCrop = null;
    this._commit(() => { this.state.crop = rect; });
    this.view.fit = true;
    this._syncTools();
    this._announce(L('cropped', 'Cropped to {w} × {h} pixels.', { w: formatNumber(rect.width), h: formatNumber(rect.height) }));
  }

  // ───────────────────────── export & upload ─────────────────────────

  _baseName() {
    return String(this.fileName ?? 'image').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  }

  /** The opened file, unchanged, as { blob, type, fileName }. Throws when its bytes were not readable (e.g. a URL without CORS). */
  _originalFile() {
    const blob = this.sourceBlob;
    if (!blob) throw new Error(L('noOriginal', 'The original file is not available to upload (it could not be read, e.g. a URL without CORS).'));
    const type = blob.type || this.source?.type || 'application/octet-stream';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' }[type];
    const named = typeof blob.name === 'string' && blob.name ? blob.name : null;
    const fileName = named ?? `${String(this.source?.name ?? 'original').replace(/[^\w.-]+/g, '-') || 'original'}${ext ? `.${ext}` : ''}`;
    return { blob, type, fileName };
  }

  async _sendAll(files, recipe, onProgress) {
    const u = { method: 'POST', mode: 'multipart', fieldName: 'files', includeOriginal: false, ...this.options.upload };
    const original = u.includeOriginal ? this._originalFile() : null;
    const total = files.reduce((n, f) => n + f.size, original?.blob.size ?? 0) || 1;
    if (u.mode === 'stream' || u.mode === 'binary') {
      // One request per file; the body is the image itself, streamed (Content-Type: image/webp …).
      let done = 0;
      const results = [];
      // The untouched original first (upload.includeOriginal), to its own address: upload.originalUrl.
      if (original) {
        if (!u.originalUrl) throw new Error(L('noOriginalUrl', 'Set upload.originalUrl to send the original in stream mode.'));
        const url = typeof u.originalUrl === 'function' ? u.originalUrl(original) : u.originalUrl;
        const res = await send(u.method, url, original.blob, {
          'Content-Type': original.type,
          'X-File-Name': encodeURIComponent(original.fileName),
          ...(u.headers ?? {}),
        }, u.withCredentials, (loaded) => onProgress(loaded / total));
        done += original.blob.size;
        results.push({ name: 'original', original: true, ...res });
      }
      for (const f of files) {
        const url = typeof u.url === 'function' ? u.url(f) : u.url.replace('{name}', encodeURIComponent(f.name));
        const res = await send(u.method, url, f.blob, {
          'Content-Type': f.type,
          'X-File-Name': encodeURIComponent(f.fileName),
          'X-Image-Size': f.name,
          'X-Image-Width': String(f.width),
          'X-Image-Height': String(f.height),
          ...(u.headers ?? {}),
        }, u.withCredentials, (loaded) => onProgress((done + loaded) / total));
        done += f.size;
        results.push({ name: f.name, ...res });
      }
      // The recipe goes to its own address (it is JSON, not an image): upload.recipeUrl.
      if (u.recipeUrl) {
        const res = await send(u.method, u.recipeUrl, JSON.stringify(recipe), { 'Content-Type': 'application/json', ...(u.headers ?? {}) }, u.withCredentials, () => {});
        results.push({ name: 'recipe', ...res });
      }
      return { ok: results.every((r) => r.ok), results };
    }
    // multipart/form-data: every size in one request, plus a JSON description of them.
    const form = new FormData();
    if (original) form.append('original', original.blob, original.fileName); // the untouched bytes that were opened
    files.forEach((f) => form.append(u.fieldName, f.blob, f.fileName));
    form.append('meta', JSON.stringify(files.map((f) => ({ name: f.name, fileName: f.fileName, width: f.width, height: f.height, type: f.type, size: f.size }))));
    form.append('recipe', JSON.stringify(recipe)); // store it: renderRecipe(original, recipe) regenerates these files
    Object.entries(u.data ?? {}).forEach(([k, v]) => form.append(k, typeof v === 'string' ? v : JSON.stringify(v)));
    const res = await send(u.method, typeof u.url === 'function' ? u.url(files) : u.url, form, u.headers ?? {}, u.withCredentials, (loaded) => onProgress(loaded / total));
    return { ok: res.ok, results: [res] };
  }

  // ───────────────────────── feedback ─────────────────────────

  _busy(on, text = '') {
    this.$.busy.hidden = !on;
    this.$.busyText.textContent = text;
    this.el.setAttribute('aria-busy', String(on));
  }

  _announce(text) {
    this.$.live.textContent = '';
    setTimeout(() => { this.$.live.textContent = text; }, 30);
  }

  _error(message, e) {
    console.error('[MudImageEditor]', e);
    this._announce(message);
    showToast(message, 'error');
    this.options.onError?.({ message, detail: e?.message ?? String(e) });
  }
}


/** XMLHttpRequest, because fetch cannot report upload progress. */
function send(method, url, body, headers, withCredentials, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = !!withCredentials;
    Object.entries(headers ?? {}).forEach(([k, v]) => { if (!(body instanceof FormData && k.toLowerCase() === 'content-type')) xhr.setRequestHeader(k, v); });
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
    xhr.onload = () => {
      let response = xhr.responseText;
      try { response = JSON.parse(xhr.responseText); } catch { /* text */ }
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) reject(Object.assign(new Error(response?.title ?? response?.detail ?? `${xhr.status} ${xhr.statusText}`), { status: xhr.status, response }));
      else resolve({ ok, status: xhr.status, response });
    };
    xhr.onerror = () => reject(new Error('The server could not be reached.'));
    xhr.send(body);
  });
}

