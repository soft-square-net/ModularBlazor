// Vanilla JS Responsive Material Dashboard using Tailwind CSS Flexible Grid
import { getIconSvg } from 'mudtail';
import { createAuthInputs } from '../forms/AuthInputs.js';
import { createDataEntryInputs } from '../forms/DataEntryInputs.js';
import { MudTabs } from 'mudtail';
import { createAutocomplete } from 'mudtail';
import { showToast } from 'mudtail';

export function createDashboardView(options = {}) {
  const container = document.createElement('div');
  container.className = 'mud-dashboard-view w-full p-4 lg:p-6 space-y-6';

  // State for flexible grid layout mode
  let gridMode = '12col'; // '12col' | '3col' | 'focus'

  function renderDashboardContent() {
    container.innerHTML = `
      <!-- Top Welcome Banner & Grid System Controls -->
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[var(--mud-palette-lines-default)]">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--mud-palette-primary)]/10 text-[var(--mud-palette-primary)] flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[var(--mud-palette-primary)] animate-pulse"></span>
              Tailwind Grid Layout
            </span>
            <span class="text-xs text-[var(--mud-palette-text-secondary)]">• Node.js v22.14 Runtime</span>
          </div>
          <h1 class="text-2xl font-bold text-[var(--mud-palette-text-primary)] tracking-tight">Operations &amp; Analytics Dashboard</h1>
          <p class="text-sm text-[var(--mud-palette-text-secondary)]">Responsive Material UI system with dynamic multi-column CSS grid</p>
        </div>

        <!-- Grid Layout Switcher & Action Controls -->
        <div class="flex items-center flex-wrap gap-2.5">
          <!-- Grid Mode Selector -->
          <div class="inline-flex p-1 rounded-[var(--mud-default-borderradius,4px)] bg-slate-100 dark:bg-slate-800/80 border border-[var(--mud-palette-lines-default)] text-xs font-medium" id="grid-mode-selector">
            <button type="button" class="grid-mode-btn px-2.5 py-1 rounded transition-colors ${gridMode === '12col' ? 'bg-[var(--mud-palette-surface)] text-[var(--mud-palette-primary)] shadow-sm font-semibold' : 'text-[var(--mud-palette-text-secondary)] hover:text-[var(--mud-palette-text-primary)]'}" data-mode="12col" title="12-Column Responsive Layout (8+4 Split)">
              ${getIconSvg('dock', 14)} 12-Col Split
            </button>
            <button type="button" class="grid-mode-btn px-2.5 py-1 rounded transition-colors ${gridMode === '3col' ? 'bg-[var(--mud-palette-surface)] text-[var(--mud-palette-primary)] shadow-sm font-semibold' : 'text-[var(--mud-palette-text-secondary)] hover:text-[var(--mud-palette-text-primary)]'}" data-mode="3col" title="3-Column Balanced Card Matrix">
              ${getIconSvg('dashboard', 14)} 3-Col Balanced
            </button>
            <button type="button" class="grid-mode-btn px-2.5 py-1 rounded transition-colors ${gridMode === 'focus' ? 'bg-[var(--mud-palette-surface)] text-[var(--mud-palette-primary)] shadow-sm font-semibold' : 'text-[var(--mud-palette-text-secondary)] hover:text-[var(--mud-palette-text-primary)]'}" data-mode="focus" title="Full-Width Focus Stage">
              ${getIconSvg('maximize', 14)} Focus Mode
            </button>
          </div>

          <!-- Quick Refresh Button -->
          <button type="button" id="btn-refresh-metrics" class="mud-button-root mud-button-outlined mud-button-surface mud-button-small flex items-center gap-1.5">
            ${getIconSvg('sparkles', 14)} Refresh Data
          </button>
        </div>
      </div>

      <!-- ROW 1: 4-Column Responsive KPI Metrics Grid (Tailwind CSS Grid) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <!-- KPI 1 -->
        <div class="mud-card mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)] transition-all duration-200 hover:shadow-md">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold uppercase tracking-wider text-[var(--mud-palette-text-secondary)]">Monthly API Volume</span>
            <span class="p-2 rounded-lg bg-[var(--mud-palette-primary)]/10 text-[var(--mud-palette-primary)]">${getIconSvg('terminal', 18)}</span>
          </div>
          <div class="text-2xl font-extrabold text-[var(--mud-palette-text-primary)] mb-1">1,428,900</div>
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-[var(--mud-palette-success)]">↑ +18.4%</span>
            <span class="text-[var(--mud-palette-text-secondary)]">vs previous 30 days</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div class="bg-[var(--mud-palette-primary)] h-full rounded-full" style="width: 78%;"></div>
          </div>
        </div>

        <!-- KPI 2 -->
        <div class="mud-card mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)] transition-all duration-200 hover:shadow-md">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold uppercase tracking-wider text-[var(--mud-palette-text-secondary)]">Active Node Sessions</span>
            <span class="p-2 rounded-lg bg-[var(--mud-palette-secondary)]/10 text-[var(--mud-palette-secondary)]">${getIconSvg('user', 18)}</span>
          </div>
          <div class="text-2xl font-extrabold text-[var(--mud-palette-text-primary)] mb-1">8,642</div>
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-[var(--mud-palette-success)]">↑ +6.1%</span>
            <span class="text-[var(--mud-palette-text-secondary)]">active WebSocket connections</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div class="bg-[var(--mud-palette-secondary)] h-full rounded-full" style="width: 64%;"></div>
          </div>
        </div>

        <!-- KPI 3 -->
        <div class="mud-card mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)] transition-all duration-200 hover:shadow-md">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold uppercase tracking-wider text-[var(--mud-palette-text-secondary)]">Cluster P99 Latency</span>
            <span class="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">${getIconSvg('sparkles', 18)}</span>
          </div>
          <div class="text-2xl font-extrabold text-[var(--mud-palette-text-primary)] mb-1">24.8 ms</div>
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-emerald-500">⚡ Sub-30ms target</span>
            <span class="text-[var(--mud-palette-text-secondary)]">optimal cluster state</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full" style="width: 92%;"></div>
          </div>
        </div>

        <!-- KPI 4 -->
        <div class="mud-card mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)] transition-all duration-200 hover:shadow-md">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-bold uppercase tracking-wider text-[var(--mud-palette-text-secondary)]">Vite SCSS Cache Ratio</span>
            <span class="p-2 rounded-lg bg-amber-500/10 text-amber-500">${getIconSvg('database', 18)}</span>
          </div>
          <div class="text-2xl font-extrabold text-[var(--mud-palette-text-primary)] mb-1">99.4%</div>
          <div class="flex items-center gap-2 text-xs">
            <span class="font-bold text-amber-500">184 ms</span>
            <span class="text-[var(--mud-palette-text-secondary)]">instant HMR compile buffer</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div class="bg-amber-500 h-full rounded-full" style="width: 99%;"></div>
          </div>
        </div>
      </div>

      <!-- ROW 2: Multi-Column Flexible Grid Structure -->
      <div id="dynamic-grid-container" class="${getGridClass(gridMode)}">
        <!-- Main Column (Analytical Stage & Forms) -->
        <div class="${getMainColClass(gridMode)} space-y-6">
          <!-- Analytical Throughput Chart Panel -->
          <div class="mud-paper mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)]">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h3 class="text-base font-bold text-[var(--mud-palette-text-primary)]">Throughput Trends &amp; API Ingestion</h3>
                <p class="text-xs text-[var(--mud-palette-text-secondary)]">Real-time Node.js pipeline performance metrics across 24h timeline</p>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="inline-flex items-center gap-1 font-semibold text-[var(--mud-palette-primary)]">
                  <span class="w-2.5 h-2.5 rounded-full bg-[var(--mud-palette-primary)]"></span> Requests/sec
                </span>
                <span class="inline-flex items-center gap-1 font-semibold text-[var(--mud-palette-secondary)]">
                  <span class="w-2.5 h-2.5 rounded-full bg-[var(--mud-palette-secondary)]"></span> Cache Hits
                </span>
              </div>
            </div>

            <!-- SVG Line & Gradient Curve Area -->
            <div class="w-full h-52 relative">
              <svg viewBox="0 0 700 200" class="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--mud-palette-primary)" stop-opacity="0.32" />
                    <stop offset="100%" stop-color="var(--mud-palette-primary)" stop-opacity="0.0" />
                  </linearGradient>
                  <linearGradient id="chartGradSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--mud-palette-secondary)" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="var(--mud-palette-secondary)" stop-opacity="0.0" />
                  </linearGradient>
                </defs>
                <!-- Grid Lines -->
                <line x1="0" y1="50" x2="700" y2="50" stroke="var(--mud-palette-lines-default)" stroke-dasharray="4 4" stroke-width="1" />
                <line x1="0" y1="100" x2="700" y2="100" stroke="var(--mud-palette-lines-default)" stroke-dasharray="4 4" stroke-width="1" />
                <line x1="0" y1="150" x2="700" y2="150" stroke="var(--mud-palette-lines-default)" stroke-dasharray="4 4" stroke-width="1" />

                <!-- Secondary Area -->
                <path d="M 0,160 Q 120,110 240,140 T 480,90 T 700,60 L 700,200 L 0,200 Z" fill="url(#chartGradSecondary)"></path>
                <path d="M 0,160 Q 120,110 240,140 T 480,90 T 700,60" fill="none" stroke="var(--mud-palette-secondary)" stroke-width="2.5"></path>

                <!-- Primary Area -->
                <path d="M 0,130 Q 100,50 220,95 T 450,40 T 700,25 L 700,200 L 0,200 Z" fill="url(#chartGradPrimary)"></path>
                <path d="M 0,130 Q 100,50 220,95 T 450,40 T 700,25" fill="none" stroke="var(--mud-palette-primary)" stroke-width="3"></path>

                <!-- Points -->
                <circle cx="220" cy="95" r="4.5" fill="var(--mud-palette-primary)" stroke="#fff" stroke-width="2"></circle>
                <circle cx="450" cy="40" r="5" fill="var(--mud-palette-primary)" stroke="#fff" stroke-width="2"></circle>
                <circle cx="700" cy="25" r="5" fill="var(--mud-palette-secondary)" stroke="#fff" stroke-width="2"></circle>
              </svg>
            </div>
            <div class="flex justify-between items-center text-[0.7rem] text-[var(--mud-palette-text-secondary)] pt-2 border-t border-[var(--mud-palette-lines-default)]">
              <span>00:00 UTC</span>
              <span>04:00</span>
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>Current</span>
            </div>
          </div>

          <!-- Forms & Controls Section Mounted in MudTabs -->
          <div class="mud-paper mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)]">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-base font-bold text-[var(--mud-palette-text-primary)]">Forms &amp; Input Stations</h3>
                <p class="text-xs text-[var(--mud-palette-text-secondary)]">User authentication &amp; data entry configured in responsive tabbed views</p>
              </div>
            </div>
            <div id="dashboard-forms-slot"></div>
          </div>

          <!-- Recent Audit Pipeline Table -->
          <div class="mud-paper mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)] overflow-x-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-[var(--mud-palette-text-primary)]">Recent Pipeline Deployments</h3>
              <span class="text-xs text-[var(--mud-palette-text-secondary)]">Live Node.js Cluster Stream</span>
            </div>
            <table class="w-full text-left text-xs text-[var(--mud-palette-text-primary)]">
              <thead class="bg-slate-100/70 dark:bg-slate-800/50 uppercase text-[0.65rem] tracking-wider text-[var(--mud-palette-text-secondary)] border-b border-[var(--mud-palette-lines-default)]">
                <tr>
                  <th class="py-2.5 px-3">Pipeline Task</th>
                  <th class="py-2.5 px-3">Commit</th>
                  <th class="py-2.5 px-3">Author</th>
                  <th class="py-2.5 px-3">Duration</th>
                  <th class="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--mud-palette-lines-default)]">
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="py-2.5 px-3 font-semibold flex items-center gap-2">
                    <span class="text-[var(--mud-palette-primary)]">${getIconSvg('terminal', 14)}</span>
                    Build SCSS Framework tokens
                  </td>
                  <td class="py-2.5 px-3 font-mono text-[var(--mud-palette-text-secondary)]">#a9f1c42</td>
                  <td class="py-2.5 px-3">Alex Rivera</td>
                  <td class="py-2.5 px-3">184 ms</td>
                  <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-emerald-500/10 text-emerald-500">SUCCESS</span>
                  </td>
                </tr>
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="py-2.5 px-3 font-semibold flex items-center gap-2">
                    <span class="text-indigo-500">${getIconSvg('dock', 14)}</span>
                    VSDockLayout splitters initialized
                  </td>
                  <td class="py-2.5 px-3 font-mono text-[var(--mud-palette-text-secondary)]">#e3b88d1</td>
                  <td class="py-2.5 px-3">Alex Rivera</td>
                  <td class="py-2.5 px-3">42 ms</td>
                  <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-indigo-500/10 text-indigo-500">OPTIMAL</span>
                  </td>
                </tr>
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td class="py-2.5 px-3 font-semibold flex items-center gap-2">
                    <span class="text-pink-500">${getIconSvg('palette', 14)}</span>
                    Theme Studio palette sync
                  </td>
                  <td class="py-2.5 px-3 font-mono text-[var(--mud-palette-text-secondary)]">#7c229ea</td>
                  <td class="py-2.5 px-3">System Agent</td>
                  <td class="py-2.5 px-3">12 ms</td>
                  <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-emerald-500/10 text-emerald-500">SUCCESS</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Aside Intelligence & Operations Column (Shown in 12-col & 3-col modes) -->
        ${
          gridMode !== 'focus'
            ? `
          <div class="${getAsideColClass(gridMode)} space-y-6">
            <!-- Node.js System Diagnostics -->
            <div class="mud-paper mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)]">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-[var(--mud-palette-text-primary)] flex items-center gap-2">
                  ${getIconSvg('sparkles', 16, 'text-amber-500')} Cluster Quota &amp; Health
                </h3>
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div class="space-y-4 text-xs">
                <div>
                  <div class="flex justify-between mb-1.5 font-medium">
                    <span class="text-[var(--mud-palette-text-secondary)]">Memory Allocated (V8)</span>
                    <span class="font-bold text-[var(--mud-palette-text-primary)]">14.2 MB / 512 MB</span>
                  </div>
                  <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div class="bg-[var(--mud-palette-primary)] h-full rounded-full" style="width: 18%;"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between mb-1.5 font-medium">
                    <span class="text-[var(--mud-palette-text-secondary)]">CPU Core Load</span>
                    <span class="font-bold text-[var(--mud-palette-text-primary)]">6.4%</span>
                  </div>
                  <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div class="bg-emerald-500 h-full rounded-full" style="width: 12%;"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between mb-1.5 font-medium">
                    <span class="text-[var(--mud-palette-text-secondary)]">Vite Modern SCSS Precompiler</span>
                    <span class="font-bold text-[var(--mud-palette-text-primary)]">Synchronized</span>
                  </div>
                  <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div class="bg-indigo-500 h-full rounded-full" style="width: 95%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Autocomplete Component Dropdown Sandbox -->
            <div class="mud-paper mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)]">
              <h3 class="text-sm font-bold text-[var(--mud-palette-text-primary)] mb-2 flex items-center gap-2">
                ${getIconSvg('search', 16, 'text-[var(--mud-palette-primary)]')} Region Filter Tool
              </h3>
              <p class="text-xs text-[var(--mud-palette-text-secondary)] mb-3">Live MudAutocomplete integration inside dashboard grid</p>
              <div id="aside-autocomplete-slot"></div>
            </div>

            <!-- Quick Action Command Station -->
            <div class="mud-paper mud-elevation-1 p-5 rounded-[var(--mud-default-borderradius,4px)]">
              <h3 class="text-sm font-bold text-[var(--mud-palette-text-primary)] mb-3">Quick Operation Station</h3>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" class="quick-act-btn p-2.5 rounded-[var(--mud-default-borderradius,4px)] bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-left border border-[var(--mud-palette-lines-default)] text-xs transition-colors" data-action="token-export">
                  <div class="text-[var(--mud-palette-primary)] mb-1">${getIconSvg('download', 16)}</div>
                  <div class="font-bold text-[var(--mud-palette-text-primary)]">Export Tokens</div>
                  <div class="text-[0.65rem] text-[var(--mud-palette-text-secondary)]">SCSS &amp; CSS</div>
                </button>
                <button type="button" class="quick-act-btn p-2.5 rounded-[var(--mud-default-borderradius,4px)] bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-left border border-[var(--mud-palette-lines-default)] text-xs transition-colors" data-action="flush-cache">
                  <div class="text-amber-500 mb-1">${getIconSvg('sparkles', 16)}</div>
                  <div class="font-bold text-[var(--mud-palette-text-primary)]">Flush Cache</div>
                  <div class="text-[0.65rem] text-[var(--mud-palette-text-secondary)]">Instant reload</div>
                </button>
                <button type="button" class="quick-act-btn p-2.5 rounded-[var(--mud-default-borderradius,4px)] bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-left border border-[var(--mud-palette-lines-default)] text-xs transition-colors" data-action="run-lint">
                  <div class="text-emerald-500 mb-1">${getIconSvg('check', 16)}</div>
                  <div class="font-bold text-[var(--mud-palette-text-primary)]">Run Linter</div>
                  <div class="text-[0.65rem] text-[var(--mud-palette-text-secondary)]">0 Errors found</div>
                </button>
                <button type="button" class="quick-act-btn p-2.5 rounded-[var(--mud-default-borderradius,4px)] bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-left border border-[var(--mud-palette-lines-default)] text-xs transition-colors" data-action="toggle-dark">
                  <div class="text-indigo-500 mb-1">${getIconSvg('moon', 16)}</div>
                  <div class="font-bold text-[var(--mud-palette-text-primary)]">Theme Mode</div>
                  <div class="text-[0.65rem] text-[var(--mud-palette-text-secondary)]">Dark / Light</div>
                </button>
              </div>
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;

    // Mount Forms in MudTabs
    const authEl = createAuthInputs();
    const dataEl = createDataEntryInputs();

    const formsTabs = new MudTabs({
      position: 'top',
      activeId: options.initialFormTab || 'auth',
      tabs: [
        { id: 'auth', label: 'User Authentication Portal', icon: getIconSvg('lock', 16), content: authEl },
        { id: 'data', label: 'Application Data Entry & Sliders', icon: getIconSvg('sliders', 16), content: dataEl },
      ],
    });

    const formsSlot = container.querySelector('#dashboard-forms-slot');
    if (formsSlot) formsSlot.appendChild(formsTabs.getElement());

    // Mount Autocomplete in Aside if present
    const acSlot = container.querySelector('#aside-autocomplete-slot');
    if (acSlot) {
      const ac = createAutocomplete({
        label: 'Select Active Region',
        placeholder: 'Search region...',
        onSelect: (item) => showToast(`Selected region: ${item}`, 'info'),
      });
      acSlot.appendChild(ac);
    }

    // Attach Grid Mode Switcher events
    container.querySelectorAll('.grid-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        gridMode = btn.dataset.mode;
        renderDashboardContent();
        showToast(`Dashboard switched to ${gridMode === '12col' ? '12-Column Split' : gridMode === '3col' ? '3-Column Balanced' : 'Focus'} grid`, 'info');
      });
    });

    // Refresh metrics button
    const refreshBtn = container.querySelector('#btn-refresh-metrics');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        showToast('Refreshing real-time cluster telemetry...', 'success');
      });
    }

    // Quick Action buttons
    container.querySelectorAll('.quick-act-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'token-export') {
          showToast('Live SCSS and CSS design tokens exported', 'success');
        } else if (action === 'flush-cache') {
          showToast('Vite compilation cache purged and rebuilt', 'info');
        } else if (action === 'run-lint') {
          showToast('TypeScript check passed: 0 syntax or lint issues', 'success');
        } else if (action === 'toggle-dark') {
          document.querySelector('#sidebar-dark-btn')?.click();
        }
      });
    });
  }

  function getGridClass(mode) {
    if (mode === '3col') {
      return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    } else if (mode === 'focus') {
      return 'grid grid-cols-1 gap-6';
    }
    // Default 12-col split
    return 'grid grid-cols-1 lg:grid-cols-12 gap-6';
  }

  function getMainColClass(mode) {
    if (mode === '3col') {
      return 'col-span-1 md:col-span-2 space-y-6';
    } else if (mode === 'focus') {
      return 'col-span-1 space-y-6';
    }
    return 'col-span-1 lg:col-span-8 space-y-6';
  }

  function getAsideColClass(mode) {
    if (mode === '3col') {
      return 'col-span-1 space-y-6';
    }
    return 'col-span-1 lg:col-span-4 space-y-6';
  }

  renderDashboardContent();
  return container;
}
