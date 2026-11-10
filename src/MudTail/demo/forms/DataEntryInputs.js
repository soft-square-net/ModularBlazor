// Vanilla JS Data Entry Inputs (Profile, Settings, Sliders, Switches, Radios)
import { getIconSvg } from 'mudtail';
import { createMudButton } from 'mudtail';
import { showToast } from 'mudtail';

export function createDataEntryInputs() {
  const container = document.createElement('div');
  container.className = 'mud-paper mud-elevation-2';
  container.style.padding = '24px';
  container.style.width = '100%';

  container.innerHTML = `
    <div style="margin-bottom:20px;border-bottom:1px solid var(--mud-palette-lines-default);padding-bottom:12px;">
      <h3 class="mud-typography mud-typography-h6">Data Entry & Form Controls</h3>
      <p class="mud-typography mud-typography-body2">Interactive inputs, numeric sliders, boolean switches, and selection components</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:24px;">
      <!-- Column 1: Text Fields & Selects -->
      <div>
        <div class="mud-input-control">
          <label class="mud-input-label">${getIconSvg('user', 14)} Full Name</label>
          <div class="mud-input-wrapper">
            <input type="text" class="mud-input-slot" value="Alex Rivera" placeholder="Full Name" />
          </div>
        </div>

        <div class="mud-input-control">
          <label class="mud-input-label">${getIconSvg('folder', 14)} Department / Team</label>
          <div class="mud-input-wrapper">
            <select class="mud-input-slot" style="cursor:pointer;">
              <option value="eng">Engineering (Frontend & Node)</option>
              <option value="design">UI/UX Material Architecture</option>
              <option value="devops">DevOps & Cloud Run</option>
              <option value="qa">Quality & Test Automation</option>
            </select>
          </div>
        </div>

        <div class="mud-input-control">
          <label class="mud-input-label">${getIconSvg('terminal', 14)} Monthly Resource Quota ($)</label>
          <div class="mud-input-wrapper">
            <span class="mud-input-adornment-start">$</span>
            <input type="number" class="mud-input-slot" value="2500" min="100" max="10000" step="100" />
            <span class="mud-input-adornment-end">USD</span>
          </div>
        </div>
      </div>

      <!-- Column 2: Sliders & Controls -->
      <div>
        <div style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.8125rem;font-weight:500;">
            <span>${getIconSvg('sliders', 14)} Cache Retention</span>
            <span id="slider-val" style="color:var(--mud-palette-primary);font-weight:600;">64 GB</span>
          </div>
          <input type="range" class="mud-slider" id="cache-slider" min="8" max="256" value="64" />
        </div>

        <div style="display:flex;flex-direction:column;gap:14px;margin-top:20px;">
          <label class="mud-switch">
            <input type="checkbox" id="switch-logs" checked />
            <div class="mud-switch-track"><div class="mud-switch-thumb"></div></div>
            <span>Enable real-time WebSocket tracing</span>
          </label>

          <label class="mud-switch">
            <input type="checkbox" id="switch-hpa" checked />
            <div class="mud-switch-track"><div class="mud-switch-thumb"></div></div>
            <span>Auto-scale Node.js instances (HPA)</span>
          </label>

          <div style="margin-top:6px;">
            <div style="font-size:0.8125rem;font-weight:600;margin-bottom:8px;">Deployment Tier</div>
            <div style="display:flex;gap:16px;">
              <label class="mud-radio">
                <input type="radio" name="tier" value="standard" checked />
                <span>Standard</span>
              </label>
              <label class="mud-radio">
                <input type="radio" name="tier" value="pro" />
                <span>Enterprise</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:24px;border-top:1px solid var(--mud-palette-lines-default);padding-top:16px;" id="data-actions-slot">
    </div>
  `;

  // Slider change listener
  const slider = container.querySelector('#cache-slider');
  const sliderVal = container.querySelector('#slider-val');
  slider.addEventListener('input', (e) => {
    sliderVal.innerText = `${e.target.value} GB`;
  });

  const saveBtn = createMudButton({
    text: 'Save Configuration',
    variant: 'filled',
    color: 'primary',
    size: 'medium',
    icon: getIconSvg('check', 16),
    onClick: () => {
      showToast('Configuration parameters updated successfully', 'success');
    },
  });

  const resetBtn = createMudButton({
    text: 'Reset Defaults',
    variant: 'outlined',
    color: 'surface',
    size: 'medium',
    onClick: () => {
      slider.value = '64';
      sliderVal.innerText = '64 GB';
      showToast('Form reset to default parameters', 'info');
    },
  });

  const actionsSlot = container.querySelector('#data-actions-slot');
  actionsSlot.appendChild(resetBtn);
  actionsSlot.appendChild(saveBtn);

  return container;
}
