// Vanilla JS Theme & Radius Editor Drawer Component
import { getTheme, updateTheme, generateScssExport, generateCssExport, getNumerals } from 'mudtail';
import { getIconSvg } from 'mudtail';
import { showToast } from 'mudtail';

export function createThemeEditorContent() {
  const container = document.createElement('div');
  container.className = 'mud-theme-editor';

  const current = getTheme();

  const PRIMARY_PALETTES = [
    { name: 'Purple (Default)', hex: '#594ae2' },
    { name: 'Indigo', hex: '#3f51b5' },
    { name: 'Blue', hex: '#2196f3' },
    { name: 'Teal', hex: '#009688' },
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Deep Orange', hex: '#ff5722' },
  ];

  const SECONDARY_PALETTES = [
    { name: 'Pink (Default)', hex: '#ff4081' },
    { name: 'Rose', hex: '#f43f5e' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Cyan', hex: '#06b6d4' },
    { name: 'Crimson', hex: '#dc2626' },
  ];

  const NUMERAL_PRESETS = [
    { value: 'auto', label: 'Auto' },
    { value: 'latn', label: 'Western 1 2 3' },
    { value: 'arab', label: 'Arabic-Indic ١ ٢ ٣' },
  ];

  const RADIUS_PRESETS = [
    { label: '0px Sharp', value: 0 },
    { label: '2px Subtle', value: 2 },
    { label: '4px Standard', value: 4 },
    { label: '6px Medium', value: 6 },
    { label: '8px Elevated', value: 8 },
    { label: '12px Soft', value: 12 },
    { label: '16px Rounded', value: 16 },
    { label: '24px Pill', value: 24 },
  ];

  container.innerHTML = `
    <!-- Dark Mode Toggle -->
    <div class="theme-section">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="theme-section-title" style="margin:0;">
          ${getIconSvg('moon', 16)} Dark / Light Theme
        </span>
        <label class="mud-switch">
          <input type="checkbox" id="dark-toggle" ${current.isDark ? 'checked' : ''} />
          <div class="mud-switch-track"><div class="mud-switch-thumb"></div></div>
        </label>
      </div>
    </div>

    <!-- Primary Palette -->
    <div class="theme-section">
      <div class="theme-section-title">
        ${getIconSvg('palette', 16)} Primary Brand Palette
      </div>
      <div class="color-swatches" id="primary-swatches">
        ${PRIMARY_PALETTES.map(
          (p) => `<div class="color-swatch ${p.hex.toLowerCase() === current.primary.toLowerCase() ? 'active' : ''}" style="background-color:${p.hex};" data-hex="${p.hex}" title="${p.name}"></div>`
        ).join('')}
      </div>
    </div>

    <!-- Secondary Palette -->
    <div class="theme-section">
      <div class="theme-section-title">
        ${getIconSvg('sparkles', 16)} Secondary Accent Palette
      </div>
      <div class="color-swatches" id="secondary-swatches">
        ${SECONDARY_PALETTES.map(
          (p) => `<div class="color-swatch ${p.hex.toLowerCase() === current.secondary.toLowerCase() ? 'active' : ''}" style="background-color:${p.hex};" data-hex="${p.hex}" title="${p.name}"></div>`
        ).join('')}
      </div>
    </div>

    <!-- Global Border Radius -->
    <div class="theme-section">
      <div class="theme-section-title">
        ${getIconSvg('sliders', 16)} Global Border Radius (.mud-rounded)
      </div>
      <div class="radius-presets" id="radius-presets">
        ${RADIUS_PRESETS.map(
          (r) => `<button type="button" class="radius-btn ${r.value === current.borderRadius ? 'active' : ''}" data-val="${r.value}">${r.label}</button>`
        ).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 4px 0;font-size:0.75rem;">
        <span>Slider Control</span>
        <span id="radius-slider-label" style="font-weight:700;color:var(--mud-palette-primary);">${current.borderRadius}px</span>
      </div>
      <input type="range" class="mud-slider" id="radius-slider" min="0" max="24" value="${current.borderRadius}" />
    </div>

    <!-- Digits (numbers and dates) -->
    <div class="theme-section">
      <div class="theme-section-title">
        ${getIconSvg('sliders', 16)} Digits
      </div>
      <div class="radius-presets" id="numeral-presets">
        ${NUMERAL_PRESETS.map(
          (n) => `<button type="button" class="radius-btn ${n.value === (current.numerals ?? getNumerals()) ? 'active' : ''}" data-val="${n.value}">${n.label}</button>`
        ).join('')}
      </div>
      <p style="margin:8px 0 0 0;font-size:0.75rem;color:var(--mud-palette-text-secondary);">Auto uses the browser's default for the language (Western digits for Arabic).</p>
    </div>

    <!-- Live SCSS Export -->
    <div class="theme-section">
      <div class="theme-section-title">
        ${getIconSvg('code', 16)} Live Exportable Tokens
      </div>
      <pre class="code-export-box" id="scss-code-box">${generateScssExport(current)}</pre>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
        <button type="button" class="mud-button-root mud-button-outlined mud-button-primary mud-button-small" id="copy-scss-btn">
          ${getIconSvg('copy', 14)} Copy SCSS
        </button>
        <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" id="download-css-btn">
          ${getIconSvg('download', 14)} Download .css
        </button>
      </div>
    </div>
  `;

  // Attach event handlers
  const scssBox = container.querySelector('#scss-code-box');

  function refreshExport() {
    scssBox.innerText = generateScssExport(getTheme());
  }

  // Dark toggle
  const darkToggle = container.querySelector('#dark-toggle');
  darkToggle.addEventListener('change', (e) => {
    updateTheme({ isDark: e.target.checked });
    refreshExport();
    showToast(`Switched to ${e.target.checked ? 'Dark' : 'Light'} theme`, 'info');
  });

  // Primary swatches
  container.querySelectorAll('#primary-swatches .color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      container.querySelectorAll('#primary-swatches .color-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      const hex = swatch.dataset.hex;
      updateTheme({ primary: hex });
      refreshExport();
      showToast(`Primary theme color set to ${hex}`, 'success');
    });
  });

  // Secondary swatches
  container.querySelectorAll('#secondary-swatches .color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      container.querySelectorAll('#secondary-swatches .color-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      const hex = swatch.dataset.hex;
      updateTheme({ secondary: hex });
      refreshExport();
      showToast(`Secondary theme color set to ${hex}`, 'success');
    });
  });

  // Radius buttons
  const radiusBtns = container.querySelectorAll('#radius-presets .radius-btn');
  const radiusSlider = container.querySelector('#radius-slider');
  const radiusLabel = container.querySelector('#radius-slider-label');

  radiusBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.val, 10);
      radiusBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      radiusSlider.value = val;
      radiusLabel.innerText = `${val}px`;
      updateTheme({ borderRadius: val });
      refreshExport();
      showToast(`Global border radius set to ${val}px`, 'info');
    });
  });

  // Digits: saved with the theme; i18n raises mud-locale-changed and the demo re-renders its view.
  const numeralBtns = container.querySelectorAll('#numeral-presets .radius-btn');
  numeralBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      numeralBtns.forEach((b) => b.classList.toggle('active', b === btn));
      updateTheme({ numerals: btn.dataset.val });
    });
  });

  radiusSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    radiusLabel.innerText = `${val}px`;
    radiusBtns.forEach((b) => b.classList.toggle('active', parseInt(b.dataset.val, 10) === val));
    updateTheme({ borderRadius: val });
    refreshExport();
  });

  // Copy SCSS
  const copyBtn = container.querySelector('#copy-scss-btn');
  copyBtn.addEventListener('click', () => {
    const code = generateScssExport(getTheme());
    navigator.clipboard.writeText(code).then(() => {
      showToast('SCSS tokens copied to clipboard!', 'success');
    });
  });

  // Download CSS
  const downloadBtn = container.querySelector('#download-css-btn');
  downloadBtn.addEventListener('click', () => {
    const cssCode = generateCssExport(getTheme());
    const blob = new Blob([cssCode], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mud-material-theme.css';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded mud-material-theme.css', 'success');
  });

  return container;
}
