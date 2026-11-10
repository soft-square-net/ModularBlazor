// MudEditForm: a form built from field definitions, bound to a model, with validation (like Blazor's EditForm with
// DataAnnotations: required, ranges, lengths, patterns, email / url, plus your own rules) and an async submit that
// can return server-side errors per field. openEditDialog() shows one in a dialog and resolves with the saved model.
//
//   const form = new MudEditForm({
//     fields: [
//       { key: 'title', label: 'Title', required: true, maxLength: 120, span: 2 },
//       { key: 'section', label: 'Section', type: 'select', options: ['News', 'Sport'], required: true },
//       { key: 'views', label: 'Views', type: 'number', min: 0 },
//       { key: 'featured', label: 'Featured', type: 'switch' },
//     ],
//     model: { title: '', section: 'News', views: 0, featured: false },
//     onSubmit: async (model) => api.save(model),   // throw, or return { errors: { title: 'Taken' } }, to stay open
//   });

import { t, formatNumber } from '../core/i18n.js';
import { MudDialog } from './MudDialog.js';
import { setButtonLoading } from './MudLoading.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let uid = 0;

const INPUT_TYPES = new Set(['text', 'number', 'email', 'url', 'tel', 'password', 'date', 'datetime-local', 'time', 'color', 'search']);

function normalizeField(f) {
  const options = (f.options ?? []).map((o) => (o && typeof o === 'object' ? { value: o.value, label: o.label ?? String(o.value) } : { value: o, label: String(o) }));
  return { type: 'text', span: 1, ...f, label: f.label ?? f.key, options };
}

/** True when a value counts as empty for "required". */
function isEmpty(field, value) {
  if (field.type === 'checkbox' || field.type === 'switch') return value !== true;
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && !value.length);
}

/** Validates one value against a field's rules. Returns an error message, or null. */
export function validateField(field, value, model = {}) {
  const f = normalizeField(field);
  const label = f.label;
  if (f.required && isEmpty(f, value)) return f.requiredMessage ?? t('form.required', { label }, '{label} is required.');
  if (!isEmpty(f, value)) {
    if (f.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) return t('form.number', { label }, '{label} must be a number.');
      if (f.min != null && value < f.min) return t('form.min', { label, min: formatNumber(f.min) }, '{label} must be at least {min}.');
      if (f.max != null && value > f.max) return t('form.max', { label, max: formatNumber(f.max) }, '{label} must be at most {max}.');
    }
    if (typeof value === 'string') {
      if (f.minLength != null && value.length < f.minLength) return t('form.minLength', { label, min: f.minLength }, '{label} needs at least {min} characters.');
      if (f.maxLength != null && value.length > f.maxLength) return t('form.maxLength', { label, max: f.maxLength }, '{label} can have at most {max} characters.');
      if (f.type === 'email' && !EMAIL.test(value.trim())) return t('form.email', {}, 'Enter a valid email address.');
      if (f.type === 'url') { try { new URL(value); } catch { return t('form.url', {}, 'Enter a valid web address.'); } }
      if (f.pattern && !new RegExp(f.pattern instanceof RegExp ? f.pattern.source : `^(?:${f.pattern})$`).test(value)) {
        return f.patternMessage ?? t('form.pattern', { label }, '{label} is not in the expected format.');
      }
    }
  }
  if (typeof f.validate === 'function') {
    const out = f.validate(value, model);
    if (out) return String(out);
  }
  return null;
}

export class MudEditForm {
  /**
   * @param {object} o
   * @param {Array} o.fields   [{ key, label, type?: 'text'|'textarea'|'number'|'email'|'url'|'tel'|'password'|'date'|'datetime-local'|'time'|
   *                           'color'|'select'|'radio'|'checkbox'|'switch'|'hidden', required?, min?, max?, step?, minLength?, maxLength?,
   *                           pattern?, patternMessage?, requiredMessage?, options?, placeholder?, helper?, readonly?, disabled?,
   *                           span?: 1 | 2, rows?, autocomplete?, validate?: (value, model) => message | null }]
   * @param {object} [o.model]              the values; the form edits a copy
   * @param {(model, form) => any} [o.onSubmit]   may be async; throw (with .errors = { key: message }) or return { errors } to keep the form open
   * @param {() => void} [o.onCancel]
   * @param {(model, key) => void} [o.onChange]
   * @param {string} [o.submitText] [o.cancelText]
   * @param {boolean} [o.showActions=true]  false when a dialog provides the buttons
   * @param {1|2} [o.columns=2]             grid columns on wide screens (fields span: 2 for full width)
   */
  constructor(o = {}) {
    this.fields = (o.fields ?? []).map(normalizeField);
    this.options = { showActions: true, columns: 2, ...o };
    this.id = `mud-form-${++uid}`;
    this.errors = new Map();
    this.touched = new Set();
    this.submitted = false;
    this.busy = false;
    this._build();
    this.setModel(o.model ?? {});
  }

  getElement() { return this.el; }

  /** The current values (a copy, with the original model's other properties kept). */
  getModel() {
    const model = { ...this.original };
    for (const f of this.fields) model[f.key] = this._read(f);
    return model;
  }

  /** Loads a model into the form and clears errors. */
  setModel(model) {
    this.original = { ...(model ?? {}) };
    for (const f of this.fields) this._write(f, this.original[f.key] ?? f.defaultValue ?? (f.type === 'checkbox' || f.type === 'switch' ? false : ''));
    this.submitted = false;
    this.touched.clear();
    this.clearErrors();
  }

  /** Has anything changed since setModel? */
  isDirty() {
    return this.fields.some((f) => JSON.stringify(this._read(f) ?? null) !== JSON.stringify(this._coerce(f, this.original[f.key]) ?? null));
  }

  reset() { this.setModel(this.original); }

  /** Validates every field, shows the errors and returns true when the form is valid. */
  validate() {
    const model = this.getModel();
    this.errors.clear();
    for (const f of this.fields) {
      const message = validateField(f, model[f.key], model);
      if (message) this.errors.set(f.key, message);
    }
    this.fields.forEach((f) => this._showError(f));
    return this.errors.size === 0;
  }

  /** Shows errors from the server: { key: message }, plus an optional message for the whole form. */
  setErrors(errors = {}, message = '') {
    for (const [key, value] of Object.entries(errors ?? {})) {
      const field = this.fields.find((f) => f.key.toLowerCase() === key.toLowerCase());
      if (field) this.errors.set(field.key, Array.isArray(value) ? value.join(' ') : String(value));
    }
    this.fields.forEach((f) => this._showError(f));
    this._summary(message || (this.errors.size ? t('form.invalid', {}, 'Check the highlighted fields.') : ''));
    this._focusFirstError();
  }

  clearErrors() {
    this.errors.clear();
    this.fields.forEach((f) => this._showError(f));
    this._summary('');
  }

  focus() {
    this.el.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
  }

  /** Validates, then calls onSubmit. Resolves to true when it was saved. */
  async submit() {
    if (this.busy) return false;
    this.submitted = true;
    this._summary('');
    if (!this.validate()) {
      this._summary(t('form.invalid', {}, 'Check the highlighted fields.'));
      this._focusFirstError();
      return false;
    }
    if (!this.options.onSubmit) return true;
    this._setBusy(true);
    try {
      const result = await this.options.onSubmit(this.getModel(), this);
      if (result && typeof result === 'object' && result.errors) {
        this.setErrors(result.errors, result.message);
        return false;
      }
      this.original = this.getModel();
      return true;
    } catch (e) {
      this.setErrors(e?.errors ?? {}, e?.message || t('form.saveError', {}, 'The changes could not be saved.'));
      return false;
    } finally {
      this._setBusy(false);
    }
  }

  dispose() {
    this.el.remove();
  }

  // ───────── building ─────────

  _build() {
    const el = document.createElement('form');
    el.className = `mud-edit-form${this.options.columns === 1 ? ' mud-edit-form--single' : ''}`;
    el.noValidate = true; // our messages, translated and styled, instead of the browser's
    el.id = this.id;
    el.innerHTML = `
      <div class="mud-edit-form__summary" role="alert" hidden></div>
      <div class="mud-edit-form__grid">${this.fields.map((f) => this._fieldHtml(f)).join('')}</div>
      ${this.options.showActions ? `<div class="mud-edit-form__actions">
        ${this.options.onCancel ? `<button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-medium" data-form="cancel">${esc(this.options.cancelText ?? t('form.cancel', {}, 'Cancel'))}</button>` : ''}
        <button type="submit" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium" data-form="submit">${esc(this.options.submitText ?? t('form.save', {}, 'Save'))}</button>
      </div>` : '<button type="submit" hidden tabindex="-1" aria-hidden="true"></button>'}`;
    this.el = el;

    el.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-form="cancel"]')) this.options.onCancel?.(); });
    const onEdit = (e) => {
      const field = this._fieldOf(e.target);
      if (!field) return;
      if (e.type === 'focusout') this.touched.add(field.key);
      if (this.submitted || this.touched.has(field.key) || this.errors.has(field.key)) this._validateOne(field);
      if (e.type !== 'focusout') this.options.onChange?.(this.getModel(), field.key);
    };
    el.addEventListener('input', onEdit);
    el.addEventListener('change', onEdit);
    el.addEventListener('focusout', onEdit);
  }

  _fieldHtml(f) {
    const id = `${this.id}-${f.key}`;
    const help = `${id}-help`;
    const required = f.required ? ' <span class="mud-required" aria-hidden="true">*</span>' : '';
    const common = `id="${id}" name="${esc(f.key)}" data-key="${esc(f.key)}" aria-describedby="${help}"${f.required ? ' aria-required="true"' : ''}${f.disabled ? ' disabled' : ''}${f.readonly ? ' readonly' : ''}`;
    const helper = `<div class="mud-input-helper-text" id="${help}">${esc(f.helper ?? '')}</div>`;
    const span = f.span === 2 || f.span === 'full' || f.type === 'textarea' && f.span !== 1 ? ' mud-edit-form__field--wide' : '';
    if (f.type === 'hidden') return `<input type="hidden" ${common}>`;

    if (f.type === 'checkbox' || f.type === 'switch') {
      const control = f.type === 'switch'
        ? `<label class="mud-switch"><input type="checkbox" role="switch" ${common}><span class="mud-switch-track"><span class="mud-switch-thumb"></span></span> ${esc(f.label)}${required}</label>`
        : `<label class="mud-checkbox"><input type="checkbox" ${common}> ${esc(f.label)}${required}</label>`;
      return `<div class="mud-input-control mud-edit-form__field mud-edit-form__field--choice${span}" data-field="${esc(f.key)}">${control}${helper}</div>`;
    }

    if (f.type === 'radio') {
      return `<fieldset class="mud-input-control mud-edit-form__field${span}" data-field="${esc(f.key)}" aria-describedby="${help}">
        <legend class="mud-input-label">${esc(f.label)}${required}</legend>
        <div class="mud-choice-group">${f.options.map((o, i) => `<label class="mud-radio"><input type="radio" name="${id}" value="${esc(o.value)}" data-key="${esc(f.key)}" data-index="${i}"${f.disabled ? ' disabled' : ''}> ${esc(o.label)}</label>`).join('')}</div>
        ${helper}</fieldset>`;
    }

    let input;
    if (f.type === 'select') {
      // Options are written by index, so any value type (numbers, ids) round-trips unchanged.
      const blank = `<option value="">${esc(f.placeholder ?? t('form.choose', {}, 'Choose…'))}</option>`;
      input = `<div class="mud-input-wrapper mud-input-wrapper--select"><select class="mud-input-slot" ${common}>${blank}${f.options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('')}</select></div>`;
    } else if (f.type === 'textarea') {
      input = `<div class="mud-input-wrapper"><textarea class="mud-input-slot" rows="${f.rows ?? 3}" ${common}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.maxLength ? ` maxlength="${f.maxLength}"` : ''}></textarea></div>`;
    } else {
      const type = INPUT_TYPES.has(f.type) ? f.type : 'text';
      const attrs = [
        f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
        f.min != null ? `min="${esc(f.min)}"` : '', f.max != null ? `max="${esc(f.max)}"` : '',
        f.step != null ? `step="${esc(f.step)}"` : type === 'number' ? 'step="any"' : '',
        f.maxLength ? `maxlength="${f.maxLength}"` : '',
        f.autocomplete ? `autocomplete="${esc(f.autocomplete)}"` : '',
        type === 'number' ? 'inputmode="decimal"' : '',
      ].filter(Boolean).join(' ');
      input = `<div class="mud-input-wrapper"><input type="${type}" class="mud-input-slot" ${common} ${attrs}></div>`;
    }
    return `<div class="mud-input-control mud-edit-form__field${span}" data-field="${esc(f.key)}">
      <label class="mud-input-label" for="${id}">${esc(f.label)}${required}</label>${input}${helper}</div>`;
  }

  // ───────── values ─────────

  _fieldOf(target) {
    const key = target?.dataset?.key;
    return key ? this.fields.find((f) => f.key === key) : null;
  }

  _controls(f) { return [...this.el.querySelectorAll(`[data-key="${CSS.escape(f.key)}"]`)]; }

  /** A model value in the field's own form (dates cut to what the input shows, numbers as numbers). */
  _coerce(f, value) {
    if (value === undefined || value === null || value === '') return f.type === 'checkbox' || f.type === 'switch' ? false : null;
    if (f.type === 'number') return Number(value);
    if (f.type === 'checkbox' || f.type === 'switch') return value === true || value === 'true';
    if (f.type === 'date') return toIso(value).slice(0, 10);
    if (f.type === 'datetime-local') return toIso(value).slice(0, 16);
    if (f.type === 'select' || f.type === 'radio') return f.options.find((o) => String(o.value) === String(value))?.value ?? value;
    return String(value);
  }

  _read(f) {
    const [el] = this._controls(f);
    if (!el) return this.original[f.key];
    if (f.type === 'checkbox' || f.type === 'switch') return el.checked;
    if (f.type === 'radio') {
      const on = this._controls(f).find((r) => r.checked);
      return on ? f.options[Number(on.dataset.index)].value : null;
    }
    if (f.type === 'select') return el.value === '' ? null : f.options[Number(el.value)]?.value ?? null;
    if (f.type === 'number') return el.value === '' ? null : Number(el.value);
    if (f.type === 'date' || f.type === 'datetime-local' || f.type === 'time') return el.value || null;
    return el.value;
  }

  _write(f, value) {
    const controls = this._controls(f);
    const v = this._coerce(f, value);
    if (f.type === 'checkbox' || f.type === 'switch') { controls[0].checked = !!v; return; }
    if (f.type === 'radio') { controls.forEach((r) => { r.checked = String(f.options[Number(r.dataset.index)].value) === String(v); }); return; }
    if (f.type === 'select') { const i = f.options.findIndex((o) => String(o.value) === String(v)); controls[0].value = i < 0 ? '' : String(i); return; }
    if (controls[0]) controls[0].value = v ?? '';
  }

  // ───────── errors ─────────

  _validateOne(f) {
    const model = this.getModel();
    const message = validateField(f, model[f.key], model);
    if (message) this.errors.set(f.key, message); else this.errors.delete(f.key);
    this._showError(f);
    if (!this.errors.size) this._summary('');
  }

  _showError(f) {
    const box = this.el.querySelector(`[data-field="${CSS.escape(f.key)}"]`);
    if (!box) return;
    const message = this.errors.get(f.key);
    const helper = box.querySelector('.mud-input-helper-text');
    helper.textContent = message ?? f.helper ?? '';
    helper.classList.toggle('error', !!message);
    box.querySelector('.mud-input-wrapper')?.classList.toggle('mud-input-error', !!message);
    box.classList.toggle('is-invalid', !!message);
    this._controls(f).forEach((c) => { if (message) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid'); });
  }

  _summary(message) {
    const box = this.el.querySelector('.mud-edit-form__summary');
    box.textContent = message;
    box.hidden = !message;
  }

  _focusFirstError() {
    const first = this.fields.find((f) => this.errors.has(f.key));
    if (first) this._controls(first)[0]?.focus();
  }

  _setBusy(on) {
    this.busy = on;
    this.el.setAttribute('aria-busy', String(on));
    const submit = this.el.querySelector('[data-form="submit"]') ?? this.submitButton;
    if (submit) setButtonLoading(submit, on);
  }
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Opens a MudEditForm in a dialog. Resolves with the saved model (or what onSubmit returned), or null when cancelled.
 * @param {object} o   MudEditForm options plus title, submitText, cancelText, maxWidth
 */
export function openEditDialog(o = {}) {
  return new Promise((resolve) => {
    let result = null;
    let done = false;
    let dialog = null;
    const finish = () => { if (done) return; done = true; dialog.close(); };
    const form = new MudEditForm({
      ...o,
      showActions: false,
      onSubmit: async (model, f) => {
        const out = o.onSubmit ? await o.onSubmit(model, f) : model;
        if (out && typeof out === 'object' && out.errors) return out;
        result = out ?? model;
        finish();
        return out;
      },
    });
    dialog = new MudDialog({
      title: esc(o.title ?? ''),
      maxWidth: o.maxWidth ?? '640px',
      content: form.getElement(),
      actions: [
        { label: o.cancelText ?? t('form.cancel', {}, 'Cancel'), variant: 'text', color: 'surface', onClick: () => finish() },
        { label: o.submitText ?? t('form.save', {}, 'Save'), variant: 'filled', color: 'primary', onClick: () => form.submit() },
      ],
      onClose: () => { done = true; document.removeEventListener('keydown', onKey, true); dialog.destroy(); resolve(result); },
    });
    const actions = dialog.container.querySelectorAll('.mud-dialog-actions button');
    form.submitButton = actions[actions.length - 1];
    dialog.container.querySelector('.mud-dialog')?.setAttribute('role', 'dialog');
    dialog.container.querySelector('.mud-dialog')?.setAttribute('aria-modal', 'true');
    const onKey = (e) => { if (e.key === 'Escape' && !form.busy) { e.stopPropagation(); finish(); } };
    document.addEventListener('keydown', onKey, true);
    dialog.open();
    setTimeout(() => form.focus(), 60);
  });
}

/**
 * A confirmation dialog. Resolves true when confirmed.
 * @param {object} o  { title, message (text), confirmText, cancelText, color: 'error' | 'primary' | … }
 */
export function confirmDialog(o = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const body = document.createElement('p');
    body.style.margin = '0';
    body.textContent = o.message ?? '';
    const dialog = new MudDialog({
      title: esc(o.title ?? t('confirm.title', {}, 'Are you sure?')),
      maxWidth: o.maxWidth ?? '440px',
      content: body,
      actions: [
        { label: o.cancelText ?? t('form.cancel', {}, 'Cancel'), variant: 'text', color: 'surface', onClick: (_, d) => d.close() },
        { label: o.confirmText ?? t('common.ok', {}, 'OK'), variant: 'filled', color: o.color ?? 'primary', onClick: (_, d) => { answer = true; d.close(); } },
      ],
      onClose: () => { document.removeEventListener('keydown', onKey, true); dialog.destroy(); resolve(answer); },
    });
    dialog.container.querySelector('.mud-dialog')?.setAttribute('role', 'alertdialog');
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); dialog.close(); } };
    document.addEventListener('keydown', onKey, true);
    dialog.open();
    setTimeout(() => dialog.container.querySelector('.mud-dialog-actions button:last-child')?.focus(), 60);
  });
}
