// Components ▸ Forms: one page per form control, plus input groups.
import { getIconSvg, createAutocomplete, evaluatePasswordStrength, validateEmail, validateNumericRange, formatCurrency, t } from 'mudtail';

const COUNTRIES = ['United States', 'United Kingdom', 'Germany', 'France', 'Japan', 'Canada', 'Australia', 'Egypt', 'United Arab Emirates', 'Netherlands', 'Sweden', 'Switzerland', 'Singapore', 'Brazil', 'India'];
import { componentPage } from './page.js';

const TRAIL = ['Components', 'Forms'];
const icon = (name, size = 16) => getIconSvg(name, size);

const FIELD_API = {
  title: 'Classes',
  rows: [
    ['.mud-input-control', 'Wraps label, field and helper text; stacks them with spacing.'],
    ['.mud-input-label', 'The label. Add <code>&lt;span class="mud-required"&gt;*&lt;/span&gt;</code> for required fields.'],
    ['.mud-input-wrapper', 'The bordered box. Modifiers: <code>mud-input-error</code>, <code>mud-input-success</code>, <code>mud-input-wrapper--dense</code>. A disabled input greys it out.'],
    ['.mud-input-slot', 'The input / textarea / select itself.'],
    ['.mud-input-adornment-start / -end', 'Icons or text inside the box, before / after the value (they swap sides in RTL).'],
    ['.mud-input-helper-text', 'Hint under the field; <code>.error</code> / <code>.success</code> colour it.'],
  ],
};

export const FORM_PAGES = [
  {
    id: 'text-field', label: 'Text field', icon: 'code',
    render: () => componentPage({
      title: 'Text field', trail: TRAIL, kinds: ['CSS'],
      lead: 'A labelled single-line input. Everything is markup and CSS, so a Razor component can render it directly and bind it with <code>@bind</code>.',
      examples: [
        {
          title: 'Basic', description: 'Label, field and an optional hint. Associate the label with <code>for</code> / <code>id</code>.',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control">
                <label class="mud-input-label" for="tf-name">Full name <span class="mud-required">*</span></label>
                <div class="mud-input-wrapper"><input id="tf-name" class="mud-input-slot" placeholder="e.g. Lina Haddad" required></div>
                <div class="mud-input-helper-text">As it should appear on your profile.</div>
              </div>
            </div>`,
        },
        {
          title: 'Adornments', description: 'Icons or units inside the field. Start and end follow the writing direction.',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control">
                <label class="mud-input-label" for="tf-mail">Email</label>
                <div class="mud-input-wrapper">
                  <span class="mud-input-adornment-start">${icon('mail')}</span>
                  <input id="tf-mail" type="email" class="mud-input-slot" placeholder="you@example.com">
                </div>
              </div>
              <div class="mud-input-control">
                <label class="mud-input-label" for="tf-weight">Weight</label>
                <div class="mud-input-wrapper">
                  <input id="tf-weight" type="number" class="mud-input-slot" value="72">
                  <span class="mud-input-adornment-end">kg</span>
                </div>
              </div>
            </div>`,
        },
        {
          title: 'Validation', description: 'Live email validation with the library\'s <code>validateEmail()</code>: the wrapper and helper text switch between error and success.',
          code: `
            import { validateEmail } from 'mudtail';

            input.addEventListener('input', () => {
              const result = validateEmail(input.value);
              wrapper.classList.toggle('mud-input-error', !result.isValid && input.value !== '');
              wrapper.classList.toggle('mud-input-success', result.isValid);
              helper.textContent = result.isValid ? 'Looks good.' : result.error;
            });`,
          mount(el) {
            el.innerHTML = `
              <div class="cp-stack"><div class="mud-input-control">
                <label class="mud-input-label" for="tf-val">Work email</label>
                <div class="mud-input-wrapper"><input id="tf-val" class="mud-input-slot" placeholder="Type an email" aria-describedby="tf-val-help"></div>
                <div class="mud-input-helper-text" id="tf-val-help" aria-live="polite">We never share it.</div>
              </div></div>`;
            const input = el.querySelector('input');
            const wrapper = el.querySelector('.mud-input-wrapper');
            const helper = el.querySelector('.mud-input-helper-text');
            input.addEventListener('input', () => {
              const result = validateEmail(input.value);
              const showError = !result.isValid && input.value !== '';
              wrapper.classList.toggle('mud-input-error', showError);
              wrapper.classList.toggle('mud-input-success', result.isValid);
              input.setAttribute('aria-invalid', String(showError));
              helper.className = `mud-input-helper-text ${showError ? 'error' : result.isValid ? 'success' : ''}`;
              helper.textContent = input.value === '' ? 'We never share it.' : result.isValid ? 'Looks good.' : result.error;
            });
          },
        },
        {
          title: 'States and density',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control">
                <label class="mud-input-label" for="tf-dis">Disabled</label>
                <div class="mud-input-wrapper"><input id="tf-dis" class="mud-input-slot" value="Read only for now" disabled></div>
              </div>
              <div class="mud-input-control">
                <label class="mud-input-label" for="tf-dense">Dense</label>
                <div class="mud-input-wrapper mud-input-wrapper--dense"><input id="tf-dense" class="mud-input-slot" placeholder="Compact field for toolbars and tables"></div>
              </div>
            </div>`,
        },
      ],
      api: [FIELD_API],
    }),
  },
  {
    id: 'password', label: 'Password', icon: 'lock',
    render: () => componentPage({
      title: 'Password', trail: TRAIL, kinds: ['CSS', 'Behaviour'],
      lead: 'A password field with a reveal button. Add <code>data-mud="password-toggle"</code> to the wrapper: the button works without any interop and the field is hidden again when the behaviour is disposed.',
      examples: [
        {
          title: 'With reveal button',
          html: `
            <div class="cp-stack"><div class="mud-input-control">
              <label class="mud-input-label" for="pw-1">Password</label>
              <div class="mud-input-wrapper" data-mud="password-toggle">
                <span class="mud-input-adornment-start">${icon('lock')}</span>
                <input id="pw-1" type="password" class="mud-input-slot" autocomplete="new-password" value="correct horse">
                <button type="button" class="mud-input-toggle" data-mud-password-toggle>
                  <span class="mud-icon-show">${icon('eye')}</span><span class="mud-icon-hide">${icon('eyeOff')}</span>
                </button>
              </div>
            </div></div>`,
        },
        {
          title: 'Strength meter', description: 'Uses the library\'s <code>evaluatePasswordStrength()</code>.',
          code: `
            import { evaluatePasswordStrength } from 'mudtail';

            input.addEventListener('input', () => {
              const s = evaluatePasswordStrength(input.value);   // { score 0–4, label, color, … }
              bar.style.inlineSize = \`\${(s.score / 4) * 100}%\`;
              bar.style.backgroundColor = s.color;
              label.textContent = s.label;
            });`,
          mount(el) {
            el.innerHTML = `
              <div class="cp-stack"><div class="mud-input-control">
                <label class="mud-input-label" for="pw-2">New password</label>
                <div class="mud-input-wrapper" data-mud="password-toggle">
                  <input id="pw-2" type="password" class="mud-input-slot" autocomplete="new-password" aria-describedby="pw-2-help">
                  <button type="button" class="mud-input-toggle" data-mud-password-toggle>
                    <span class="mud-icon-show">${icon('eye')}</span><span class="mud-icon-hide">${icon('eyeOff')}</span>
                  </button>
                </div>
                <span class="cp-meter" aria-hidden="true"><span></span></span>
                <div class="mud-input-helper-text" id="pw-2-help" aria-live="polite">At least 8 characters.</div>
              </div></div>`;
            const input = el.querySelector('input');
            const bar = el.querySelector('.cp-meter > span');
            const help = el.querySelector('.mud-input-helper-text');
            input.addEventListener('input', () => {
              const s = evaluatePasswordStrength(input.value);
              bar.style.inlineSize = `${Math.max(0, Math.min(4, s.score)) * 25}%`;
              bar.style.backgroundColor = s.color ?? 'var(--mud-palette-primary)';
              help.textContent = input.value ? `Strength: ${s.label}` : 'At least 8 characters.';
            });
          },
        },
      ],
      api: [
        { title: 'Behaviour', rows: [
          ['data-mud="password-toggle"', 'On the <code>.mud-input-wrapper</code>. Switches the input between password and text.'],
          ['[data-mud-password-toggle]', 'The button inside the wrapper (<code>.mud-input-toggle</code>). The script sets its <code>aria-pressed</code> and <code>aria-label</code>.'],
          ['.mud-icon-show / .mud-icon-hide', 'Optional icons; the right one shows for the current state.'],
          ['Blazor', '<code>mud.behavior("password-toggle", wrapperRef)</code> attaches it to one field; <code>autoInit</code> does it for all.'],
        ] },
      ],
    }),
  },
  {
    id: 'number', label: 'Number', icon: 'sliders',
    render: () => componentPage({
      title: 'Number', trail: TRAIL, kinds: ['CSS'],
      lead: 'Numeric input with tabular figures, units as adornments, and range checking with <code>validateNumericRange()</code>.',
      examples: [
        {
          title: 'Range and currency', description: 'Checks 1–100 and shows the value formatted with <code>formatCurrency()</code>.',
          code: `
            import { validateNumericRange, formatCurrency } from 'mudtail';

            const r = validateNumericRange(Number(input.value), 1, 100, 'Seats');
            wrapper.classList.toggle('mud-input-error', !r.isValid);
            helper.textContent = r.isValid ? formatCurrency(Number(input.value) * 12.5) : r.error;`,
          mount(el) {
            el.innerHTML = `
              <div class="cp-stack"><div class="mud-input-control">
                <label class="mud-input-label" for="num-1">Seats</label>
                <div class="mud-input-wrapper">
                  <input id="num-1" type="number" class="mud-input-slot" min="1" max="100" step="1" value="12" aria-describedby="num-1-help">
                  <span class="mud-input-adornment-end">× $12.50</span>
                </div>
                <div class="mud-input-helper-text" id="num-1-help" aria-live="polite"></div>
              </div></div>`;
            const input = el.querySelector('input');
            const wrapper = el.querySelector('.mud-input-wrapper');
            const help = el.querySelector('.mud-input-helper-text');
            const check = () => {
              const value = Number(input.value);
              const r = validateNumericRange(value, 1, 100, 'Seats');
              wrapper.classList.toggle('mud-input-error', !r.isValid);
              help.className = `mud-input-helper-text ${r.isValid ? '' : 'error'}`;
              help.textContent = r.isValid ? `Total: ${formatCurrency(value * 12.5)}` : r.error;
            };
            input.addEventListener('input', check);
            check();
          },
        },
      ],
      api: [FIELD_API],
    }),
  },
  {
    id: 'textarea', label: 'Text area', icon: 'docs',
    render: () => componentPage({
      title: 'Text area', trail: TRAIL, kinds: ['CSS'],
      lead: 'Multi-line input. Use a <code>textarea.mud-input-slot</code> inside the wrapper; it resizes vertically.',
      examples: [
        {
          title: 'With character count',
          code: `
            textarea.addEventListener('input', () => {
              count.textContent = \`\${textarea.value.length} / \${textarea.maxLength}\`;
            });`,
          mount(el) {
            el.innerHTML = `
              <div class="cp-stack"><div class="mud-input-control">
                <label class="mud-input-label" for="ta-1">Summary</label>
                <div class="mud-input-wrapper"><textarea id="ta-1" class="mud-input-slot" rows="4" maxlength="280" aria-describedby="ta-1-count" placeholder="What is the story about?"></textarea></div>
                <div class="mud-input-helper-text" id="ta-1-count" aria-live="polite">0 / 280</div>
              </div></div>`;
            const ta = el.querySelector('textarea');
            const count = el.querySelector('.mud-input-helper-text');
            ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / ${ta.maxLength}`; });
          },
        },
      ],
      api: [FIELD_API],
    }),
  },
  {
    id: 'select', label: 'Select', icon: 'chevronDown',
    render: () => componentPage({
      title: 'Select', trail: TRAIL, kinds: ['CSS'],
      lead: 'The native <code>&lt;select&gt;</code>, themed. Keyboard, screen readers and mobile pickers keep working, and Blazor binds it with <code>@bind</code>.',
      examples: [
        {
          title: 'Single and multiple',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control">
                <label class="mud-input-label" for="sel-1">Section</label>
                <div class="mud-input-wrapper mud-input-wrapper--select">
                  <select id="sel-1" class="mud-input-slot">
                    <option>News</option><option>Sport</option><option selected>Culture</option><option>Business</option>
                  </select>
                </div>
              </div>
              <div class="mud-input-control">
                <label class="mud-input-label" for="sel-2">Tags</label>
                <div class="mud-input-wrapper mud-input-wrapper--select">
                  <select id="sel-2" class="mud-input-slot" multiple size="4">
                    <option selected>Football</option><option>Tennis</option><option selected>Formula 1</option><option>Athletics</option>
                  </select>
                </div>
                <div class="mud-input-helper-text">Ctrl / ⌘-click to pick several.</div>
              </div>
              <div class="mud-input-control">
                <label class="mud-input-label" for="sel-3">Disabled</label>
                <div class="mud-input-wrapper mud-input-wrapper--select"><select id="sel-3" class="mud-input-slot" disabled><option>Locked</option></select></div>
              </div>
            </div>`,
        },
      ],
      api: [{ title: 'Classes', rows: [['.mud-input-wrapper--select', 'Adds the chevron and makes room for it. Works with <code>multiple</code> (no chevron).'], ...FIELD_API.rows.slice(1, 4)] }],
    }),
  },
  {
    id: 'date-time', label: 'Date & time', icon: 'dashboard',
    render: () => componentPage({
      title: 'Date, time and colour', trail: TRAIL, kinds: ['CSS'],
      lead: 'Native pickers in MudTail fields. They follow dark mode through <code>color-scheme</code>.',
      examples: [
        {
          title: 'Pickers',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control"><label class="mud-input-label" for="dt-1">Publish date</label>
                <div class="mud-input-wrapper"><input id="dt-1" type="date" class="mud-input-slot" value="2026-11-10"></div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="dt-2">Kick-off</label>
                <div class="mud-input-wrapper"><input id="dt-2" type="time" class="mud-input-slot" value="20:00"></div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="dt-3">Embargo until</label>
                <div class="mud-input-wrapper"><input id="dt-3" type="datetime-local" class="mud-input-slot" value="2026-11-10T09:30"></div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="dt-4">Section colour</label>
                <div class="mud-input-wrapper"><input id="dt-4" type="color" class="mud-input-slot" value="#594ae2"></div></div>
            </div>`,
        },
      ],
      api: [FIELD_API],
    }),
  },
  {
    id: 'file', label: 'File upload', icon: 'download',
    render: () => componentPage({
      title: 'File upload', trail: TRAIL, kinds: ['CSS'],
      lead: 'The native file input with its button styled as a MudTail button. In Blazor use <code>&lt;InputFile class="mud-input-slot"&gt;</code> inside the wrapper.',
      examples: [
        {
          title: 'Single and multiple',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control"><label class="mud-input-label" for="f-1">Cover image</label>
                <div class="mud-input-wrapper"><input id="f-1" type="file" class="mud-input-slot" accept="image/*"></div>
                <div class="mud-input-helper-text">JPG or PNG, up to 5 MB.</div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="f-2">Attachments</label>
                <div class="mud-input-wrapper"><input id="f-2" type="file" class="mud-input-slot" multiple></div></div>
            </div>`,
        },
      ],
      api: [FIELD_API],
    }),
  },
  {
    id: 'checkbox', label: 'Checkbox', icon: 'check',
    render: () => componentPage({
      title: 'Checkbox', trail: TRAIL, kinds: ['CSS'],
      lead: 'Native checkboxes in the theme colour. Group them in a <code>fieldset.mud-choice-group</code> with a legend.',
      examples: [
        {
          title: 'Group',
          html: `
            <fieldset class="mud-choice-group mud-choice-group--column">
              <legend class="mud-input-label">Newsletters</legend>
              <label class="mud-checkbox"><input type="checkbox" checked> Morning briefing</label>
              <label class="mud-checkbox"><input type="checkbox"> Sport</label>
              <label class="mud-checkbox"><input type="checkbox" checked> Culture weekly</label>
              <label class="mud-checkbox"><input type="checkbox" disabled> Members only (disabled)</label>
            </fieldset>`,
        },
        {
          title: 'Select all (indeterminate)', description: 'The parent box shows a dash when only some children are checked.',
          code: `
            const sync = () => {
              const n = items.filter((i) => i.checked).length;
              all.checked = n === items.length;
              all.indeterminate = n > 0 && n < items.length;
            };`,
          mount(el) {
            el.innerHTML = `
              <fieldset class="mud-choice-group mud-choice-group--column">
                <legend class="mud-input-label">Permissions</legend>
                <label class="mud-checkbox"><input type="checkbox" data-all> All</label>
                <div class="mud-choice-group mud-choice-group--column" style="padding-inline-start: 24px">
                  <label class="mud-checkbox"><input type="checkbox" data-item checked> Read</label>
                  <label class="mud-checkbox"><input type="checkbox" data-item> Write</label>
                  <label class="mud-checkbox"><input type="checkbox" data-item> Publish</label>
                </div>
              </fieldset>`;
            const all = el.querySelector('[data-all]');
            const items = [...el.querySelectorAll('[data-item]')];
            const sync = () => {
              const n = items.filter((i) => i.checked).length;
              all.checked = n === items.length;
              all.indeterminate = n > 0 && n < items.length;
            };
            all.addEventListener('change', () => { items.forEach((i) => { i.checked = all.checked; }); sync(); });
            items.forEach((i) => i.addEventListener('change', sync));
            sync();
          },
        },
      ],
      api: [{ title: 'Classes', rows: [
        ['.mud-checkbox', 'A <code>&lt;label&gt;</code> around the input and its text.'],
        ['.mud-choice-group', 'Lays choices out in a row; add <code>--column</code> for a column.'],
      ] }],
    }),
  },
  {
    id: 'radio', label: 'Radio', icon: 'check',
    render: () => componentPage({
      title: 'Radio', trail: TRAIL, kinds: ['CSS'],
      lead: 'One choice from a few. Give the radios the same <code>name</code> and put them in a <code>fieldset.mud-choice-group</code>.',
      examples: [
        {
          title: 'Row and column',
          html: `
            <fieldset class="mud-choice-group">
              <legend class="mud-input-label">Layout</legend>
              <label class="mud-radio"><input type="radio" name="layout" checked> Grid</label>
              <label class="mud-radio"><input type="radio" name="layout"> List</label>
              <label class="mud-radio"><input type="radio" name="layout"> Masonry</label>
            </fieldset>
            <fieldset class="mud-choice-group mud-choice-group--column" style="margin-block-start: 20px">
              <legend class="mud-input-label">Delivery</legend>
              <label class="mud-radio"><input type="radio" name="delivery" checked> Every morning</label>
              <label class="mud-radio"><input type="radio" name="delivery"> Weekly digest</label>
              <label class="mud-radio"><input type="radio" name="delivery" disabled> Breaking only (disabled)</label>
            </fieldset>`,
        },
      ],
      api: [{ title: 'Classes', rows: [
        ['.mud-radio', 'A <code>&lt;label&gt;</code> around the input and its text.'],
        ['.mud-choice-group', 'Lays choices out in a row; add <code>--column</code> for a column.'],
      ] }],
    }),
  },
  {
    id: 'switch', label: 'Switch', icon: 'sliders',
    render: () => componentPage({
      title: 'Switch', trail: TRAIL, kinds: ['CSS'],
      lead: 'An on / off setting that applies straight away. It is a checkbox underneath, so it is keyboard and screen-reader friendly; the thumb slides the other way in RTL.',
      examples: [
        {
          title: 'Settings',
          html: `
            <div class="mud-choice-group mud-choice-group--column">
              <label class="mud-switch"><input type="checkbox" role="switch" checked><span class="mud-switch-track"><span class="mud-switch-thumb"></span></span> Live score alerts</label>
              <label class="mud-switch"><input type="checkbox" role="switch"><span class="mud-switch-track"><span class="mud-switch-thumb"></span></span> Autoplay videos</label>
              <label class="mud-switch"><input type="checkbox" role="switch" disabled><span class="mud-switch-track"><span class="mud-switch-thumb"></span></span> Beta features (disabled)</label>
            </div>`,
        },
      ],
      api: [{ title: 'Classes', rows: [
        ['.mud-switch', 'A <code>&lt;label&gt;</code> holding the checkbox, the track and the text. Add <code>role="switch"</code> to the input.'],
        ['.mud-switch-track / .mud-switch-thumb', 'The visual switch.'],
      ] }],
    }),
  },
  {
    id: 'slider', label: 'Slider', icon: 'sliders',
    render: () => componentPage({
      title: 'Slider', trail: TRAIL, kinds: ['CSS'],
      lead: 'A range input in the theme colour. Wrap it in <code>.mud-slider-field</code> with an <code>&lt;output&gt;</code> to show the value.',
      examples: [
        {
          title: 'With value',
          code: `range.addEventListener('input', () => { output.value = range.value; });`,
          mount(el) {
            el.innerHTML = `
              <div class="cp-stack">
                <div class="mud-input-control"><label class="mud-input-label" for="sl-1">Volume</label>
                  <div class="mud-slider-field"><input id="sl-1" type="range" class="mud-slider" min="0" max="100" value="60"><output for="sl-1">60</output></div></div>
                <div class="mud-input-control"><label class="mud-input-label" for="sl-2">Stepped (0–10)</label>
                  <div class="mud-slider-field"><input id="sl-2" type="range" class="mud-slider" min="0" max="10" step="1" value="3"><output for="sl-2">3</output></div></div>
                <div class="mud-input-control"><label class="mud-input-label" for="sl-3">Disabled</label>
                  <div class="mud-slider-field"><input id="sl-3" type="range" class="mud-slider" value="30" disabled><output for="sl-3">30</output></div></div>
              </div>`;
            el.querySelectorAll('.mud-slider-field').forEach((f) => {
              const range = f.querySelector('input');
              const out = f.querySelector('output');
              range.addEventListener('input', () => { out.value = range.value; });
            });
          },
        },
      ],
      api: [{ title: 'Classes', rows: [['.mud-slider', 'The <code>input[type=range]</code>.'], ['.mud-slider-field', 'Puts the slider and its <code>&lt;output&gt;</code> side by side.']] }],
    }),
  },
  {
    id: 'autocomplete', label: 'Autocomplete', icon: 'search',
    render: () => componentPage({
      title: 'Autocomplete', trail: TRAIL, kinds: ['JS', 'Blazor'],
      lead: 'A text field that suggests matches as you type, with keyboard navigation. Created in JavaScript; from Blazor use <code>create("autocomplete", host, options, dotNetRef)</code>, which raises <code>select</code>.',
      examples: [
        {
          title: 'Countries',
          code: `
            import { createAutocomplete } from 'mudtail';

            const abort = new AbortController();
            host.appendChild(createAutocomplete({
              label: 'Country',
              items: ['Egypt', 'France', 'Japan', …],
              onSelect: (value) => console.log(value),
              signal: abort.signal,          // abort() removes its document listener
            }));`,
          mount(el) {
            const abort = new AbortController();
            const wrap = document.createElement('div');
            wrap.className = 'cp-stack';
            const out = document.createElement('div');
            out.className = 'mud-input-helper-text';
            out.setAttribute('aria-live', 'polite');
            wrap.append(createAutocomplete({ label: t('Country'), items: COUNTRIES.map((c) => t(c)), signal: abort.signal, onSelect: (v) => { out.textContent = `Selected: ${v}`; } }), out);
            el.appendChild(wrap);
            return () => abort.abort();
          },
        },
      ],
      api: [
        { title: 'Options', rows: [
          ['label', 'Field label.'], ['placeholder', 'Placeholder text.'], ['items', 'Strings to search.'],
          ['onSelect(value)', 'Called when a suggestion is picked.'], ['signal', 'An AbortSignal; aborting it removes the document listener.'],
        ] },
        { title: 'Blazor', rows: [['create("autocomplete", …)', 'Handle methods: <code>setValue</code>, <code>dispose</code>. Event: <code>select</code> (value).']] },
      ],
    }),
  },
  {
    id: 'input-group', label: 'Input group', icon: 'dock',
    render: () => componentPage({
      title: 'Input group', trail: TRAIL, kinds: ['CSS'],
      lead: 'Joins text, fields, selects and buttons into one control: <code>.mud-input-group</code> squares the inner corners and shares the borders. The rounded ends follow the writing direction.',
      examples: [
        {
          title: 'Text addons',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control"><label class="mud-input-label" for="ig-1">Website</label>
                <div class="mud-input-group">
                  <span class="mud-input-addon">https://</span>
                  <div class="mud-input-wrapper"><input id="ig-1" class="mud-input-slot" placeholder="example.com"></div>
                </div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="ig-2">Price</label>
                <div class="mud-input-group">
                  <span class="mud-input-addon">$</span>
                  <div class="mud-input-wrapper"><input id="ig-2" type="number" class="mud-input-slot" value="49"></div>
                  <span class="mud-input-addon">.00</span>
                </div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="ig-3">Username</label>
                <div class="mud-input-group">
                  <span class="mud-input-addon">${icon('user')}</span>
                  <div class="mud-input-wrapper"><input id="ig-3" class="mud-input-slot" placeholder="lina.h"></div>
                </div></div>
            </div>`,
        },
        {
          title: 'With buttons and a select',
          html: `
            <div class="cp-stack">
              <div class="mud-input-control"><label class="mud-input-label" for="ig-4">Search the archive</label>
                <div class="mud-input-group">
                  <div class="mud-input-wrapper"><input id="ig-4" type="search" class="mud-input-slot" placeholder="Keywords"></div>
                  <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium">Search</button>
                </div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="ig-5">Find in</label>
                <div class="mud-input-group">
                  <div class="mud-input-wrapper mud-input-wrapper--select" style="flex: 0 0 9rem">
                    <select class="mud-input-slot" aria-label="Section"><option>All sections</option><option>Sport</option><option>Culture</option></select>
                  </div>
                  <div class="mud-input-wrapper"><input id="ig-5" class="mud-input-slot" placeholder="Headline or author"></div>
                </div></div>
              <div class="mud-input-control"><label class="mud-input-label" for="ig-6">Invite</label>
                <div class="mud-input-group">
                  <div class="mud-input-wrapper"><input id="ig-6" type="email" class="mud-input-slot" placeholder="email@example.com"></div>
                  <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-medium">Copy link</button>
                  <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium">Send</button>
                </div></div>
            </div>`,
        },
      ],
      api: [{ title: 'Classes', rows: [
        ['.mud-input-group', 'Row container; its direct children are joined.'],
        ['.mud-input-addon', 'A text or icon segment.'],
        ['children', 'Any mix of <code>.mud-input-addon</code>, <code>.mud-input-wrapper</code> (input or select) and <code>.mud-button-root</code>.'],
      ] }],
    }),
  },
];
