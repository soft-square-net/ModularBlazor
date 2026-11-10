// Vanilla JS Visual Studio 2026 Docking Engine with Drag & Drop Panel Transfers & 5-Way Docking Guides
import { getIconSvg } from 'mudtail';
import { showToast } from 'mudtail';
import gsap from 'gsap';

export class VSDockLayout {
  constructor(options = {}) {
    this.container = null;

    // Registry of all dockable panels in the IDE
    this.panels = {
      solution: { id: 'solution', title: 'Solution Explorer', icon: 'folder', dock: 'left' },
      git: { id: 'git', title: 'Git Changes', icon: 'git', dock: 'left' },
      db: { id: 'db', title: 'Database Schema', icon: 'database', dock: 'left' },

      scss: { id: 'scss', title: 'mud-material.scss', icon: 'palette', dock: 'center' },
      js: { id: 'js', title: 'VSDockLayout.js', icon: 'code', dock: 'center' },
      dashboard: { id: 'dashboard', title: 'Dashboard.js', icon: 'dashboard', dock: 'center' },
      preview: { id: 'preview', title: 'Live Preview', icon: 'sparkles', dock: 'center' },

      properties: { id: 'properties', title: 'Properties', icon: 'sliders', dock: 'right' },
      diagnostics: { id: 'diagnostics', title: 'Diagnostics', icon: 'sparkles', dock: 'right' },
      tokens: { id: 'tokens', title: 'Live Tokens', icon: 'palette', dock: 'right' },

      terminal: { id: 'terminal', title: 'Terminal', icon: 'terminal', dock: 'bottom' },
      output: { id: 'output', title: 'Build Output', icon: 'output', dock: 'bottom' },
      errors: { id: 'errors', title: 'Error List (0)', icon: 'error', dock: 'bottom' },
      tests: { id: 'tests', title: 'Test Explorer (9)', icon: 'test', dock: 'bottom' },
    };

    // Dock container state
    this.docks = {
      left: {
        tabs: ['solution', 'git', 'db'],
        activeTab: 'solution',
        pinned: true,
        width: 280,
        flyoutOpen: false,
      },
      center: {
        tabs: ['scss', 'js', 'dashboard', 'preview'],
        activeTab: 'scss',
        splits: [], // secondary split panels inside center if docked to top/bottom/left/right
      },
      right: {
        tabs: ['properties', 'diagnostics', 'tokens'],
        activeTab: 'properties',
        pinned: true,
        width: 300,
        flyoutOpen: false,
      },
      bottom: {
        tabs: ['terminal', 'output', 'errors', 'tests'],
        activeTab: 'terminal',
        pinned: true,
        height: 190,
      },
    };

    // Drag & Drop State
    this.draggingPanelId = null;
    this.dragSourceDock = null;
    this.dragGhost = null;
    this.compassEl = null;
    this.dropPreviewEl = null;
    this.currentDropTarget = null; // { dockId, action: 'inside'|'top'|'bottom'|'left'|'right' }

    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = 'mud-dock-workspace';

    this.render();
    this.attachEventListeners();
    this.setupGlobalDragListeners();
  }

  render() {
    const leftDock = this.docks.left;
    const rightDock = this.docks.right;
    const bottomDock = this.docks.bottom;
    const centerDock = this.docks.center;

    this.container.innerHTML = `
      <!-- Left Rail (Shown when unpinned) -->
      <div class="mud-dock-rail rail-left" style="${leftDock.pinned ? 'display:none;' : 'display:flex;'}">
        ${leftDock.tabs
          .map((tabId) => {
            const p = this.panels[tabId];
            if (!p) return '';
            return `
            <button type="button" class="mud-dock-rail-item ${leftDock.activeTab === tabId ? 'active' : ''}" data-rail="left" data-tab="${tabId}">
              ${getIconSvg(p.icon, 14)} ${p.title}
            </button>
          `;
          })
          .join('')}
      </div>

      <!-- Left Dockpanel -->
      <div class="mud-dock-panel panel-left ${!leftDock.pinned ? 'dock-flyout' : ''}" id="dock-panel-left" data-dock="left" style="${
      !leftDock.pinned && !leftDock.flyoutOpen ? 'display:none;' : 'display:flex;'
    } width:${leftDock.width}px; ${leftDock.tabs.length === 0 ? 'display:none;' : ''}">
        <!-- Top Toolbar -->
        <div class="mud-dock-panel-toolbar" data-draggable-panel="${leftDock.activeTab}">
          <div class="panel-title">
            ${getIconSvg(this.getPanelIcon(leftDock.activeTab), 14)}
            <span id="left-title">${this.getPanelTitle(leftDock.activeTab)}</span>
          </div>
          <div class="panel-actions">
            <button type="button" id="left-pin-btn" title="${leftDock.pinned ? 'Unpin (Auto-Hide to Rail)' : 'Pin'}">
              ${getIconSvg(leftDock.pinned ? 'pin' : 'pinOff', 14)}
            </button>
            <button type="button" id="left-close-btn" title="Close Active Tab">
              ${getIconSvg('close', 14)}
            </button>
          </div>
        </div>

        <!-- Panel Body -->
        <div class="mud-dock-panel-body" id="left-body">
          ${this.renderPanelContent(leftDock.activeTab)}
        </div>

        <!-- Bottom Tabs in Left Panel -->
        <div class="mud-dock-tabs-bottom">
          ${leftDock.tabs
            .map((tabId) => {
              const p = this.panels[tabId];
              if (!p) return '';
              return `
              <button type="button" class="dock-tab ${leftDock.activeTab === tabId ? 'active' : ''}" data-tab-id="${tabId}" data-dock="left">
                ${getIconSvg(p.icon, 12)} ${p.title}
              </button>
            `;
            })
            .join('')}
        </div>
      </div>

      <!-- Left Horizontal Splitter -->
      <div class="mud-dock-splitter-h" id="splitter-left" style="${!leftDock.pinned || leftDock.tabs.length === 0 ? 'display:none;' : ''}"></div>

      <!-- Center & Bottom Container -->
      <div class="mud-dock-container" style="flex-direction:column;">
        <!-- Center Editor Panel (Top Tabs) -->
        <div class="mud-dock-panel panel-center" id="dock-panel-center" data-dock="center" style="flex:1;">
          <!-- Top Tabs in Middle Panel -->
          <div class="mud-dock-tabs-top">
            ${centerDock.tabs
              .map((tabId) => {
                const p = this.panels[tabId];
                if (!p) return '';
                return `
                <button type="button" class="dock-tab ${centerDock.activeTab === tabId ? 'active' : ''}" data-tab-id="${tabId}" data-dock="center">
                  ${getIconSvg(p.icon, 14)} ${p.title}
                  <span class="tab-close-icon ml-1.5 opacity-60 hover:opacity-100" data-close-tab="${tabId}">×</span>
                </button>
              `;
              })
              .join('')}
          </div>

          <!-- Middle Panel Top Sub-Toolbar -->
          <div class="mud-dock-panel-toolbar" style="background:var(--mud-palette-surface);border-bottom:1px solid var(--mud-palette-lines-default);" data-draggable-panel="${centerDock.activeTab}">
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:0.75rem;color:var(--mud-palette-text-secondary);">Workspace: <strong>VS 2026 Drag &amp; Drop Dock</strong></span>
              <span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(89,74,226,0.1);color:var(--mud-palette-primary);font-weight:600;">Drag Tabs/Headers to Transfer</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" class="mud-button-root mud-button-outlined mud-button-surface mud-button-small" id="reset-layout-btn" title="Restore Default Visual Studio 2026 Dock Layout">
                Reset Docks
              </button>
              <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" id="run-build-btn">
                ${getIconSvg('terminal', 12)} Build SCSS
              </button>
            </div>
          </div>

          <!-- Center Content Area (Includes any nested splits if created) -->
          <div class="flex-1 flex overflow-hidden w-full h-full" id="center-split-wrapper">
            <div class="mud-dock-panel-body flex-1" style="background:#0b0f19;color:#e2e8f0;font-family:ui-monospace, monospace;line-height:1.6;" id="center-body">
              ${this.renderPanelContent(centerDock.activeTab)}
            </div>
            ${this.renderCenterSplitsHtml()}
          </div>
        </div>

        <!-- Vertical Splitter between Center & Bottom -->
        <div class="mud-dock-splitter-v" id="splitter-bottom" style="${!bottomDock.pinned || bottomDock.tabs.length === 0 ? 'display:none;' : ''}"></div>

        <!-- Bottom Dockpanel -->
        <div class="mud-dock-panel panel-bottom" id="dock-panel-bottom" data-dock="bottom" style="${
          !bottomDock.pinned ? 'display:none;' : 'display:flex;'
        } height:${bottomDock.height}px; ${bottomDock.tabs.length === 0 ? 'display:none;' : ''}">
          <!-- Top Toolbar in Bottom Panel -->
          <div class="mud-dock-panel-toolbar" data-draggable-panel="${bottomDock.activeTab}">
            <div class="panel-title">
              ${getIconSvg(this.getPanelIcon(bottomDock.activeTab), 14)}
              <span>${this.getPanelTitle(bottomDock.activeTab)}</span>
            </div>
            <div class="panel-actions">
              <button type="button" id="bottom-clear-btn" title="Clear Console">${getIconSvg('close', 14)}</button>
              <button type="button" id="bottom-close-btn" title="Collapse Bottom Dock">${getIconSvg('chevronDown', 14)}</button>
            </div>
          </div>

          <!-- Bottom Panel Content -->
          <div class="mud-dock-panel-body" style="background:#0f172a;color:#94a3b8;font-family:ui-monospace, monospace;" id="bottom-body">
            ${this.renderPanelContent(bottomDock.activeTab)}
          </div>

          <!-- Bottom Tabs in Bottom Panel -->
          <div class="mud-dock-tabs-bottom">
            ${bottomDock.tabs
              .map((tabId) => {
                const p = this.panels[tabId];
                if (!p) return '';
                return `
                <button type="button" class="dock-tab ${bottomDock.activeTab === tabId ? 'active' : ''}" data-tab-id="${tabId}" data-dock="bottom">
                  ${getIconSvg(p.icon, 12)} ${p.title}
                </button>
              `;
              })
              .join('')}
          </div>
        </div>
      </div>

      <!-- Right Horizontal Splitter -->
      <div class="mud-dock-splitter-h" id="splitter-right" style="${!rightDock.pinned || rightDock.tabs.length === 0 ? 'display:none;' : ''}"></div>

      <!-- Right Dockpanel -->
      <div class="mud-dock-panel panel-right ${!rightDock.pinned ? 'dock-flyout' : ''}" id="dock-panel-right" data-dock="right" style="${
      !rightDock.pinned && !rightDock.flyoutOpen ? 'display:none;' : 'display:flex;'
    } width:${rightDock.width}px; ${!rightDock.pinned ? 'right:38px;' : ''} ${rightDock.tabs.length === 0 ? 'display:none;' : ''}">
        <!-- Top Toolbar in Right Panel -->
        <div class="mud-dock-panel-toolbar" data-draggable-panel="${rightDock.activeTab}">
          <div class="panel-title">
            ${getIconSvg(this.getPanelIcon(rightDock.activeTab), 14)}
            <span id="right-title">${this.getPanelTitle(rightDock.activeTab)}</span>
          </div>
          <div class="panel-actions">
            <button type="button" id="right-pin-btn" title="${rightDock.pinned ? 'Unpin (Auto-Hide to Rail)' : 'Pin'}">
              ${getIconSvg(rightDock.pinned ? 'pin' : 'pinOff', 14)}
            </button>
            <button type="button" id="right-close-btn" title="Close Active Tab">
              ${getIconSvg('close', 14)}
            </button>
          </div>
        </div>

        <!-- Right Panel Content -->
        <div class="mud-dock-panel-body" id="right-body">
          ${this.renderPanelContent(rightDock.activeTab)}
        </div>

        <!-- Bottom Tabs in Right Panel -->
        <div class="mud-dock-tabs-bottom">
          ${rightDock.tabs
            .map((tabId) => {
              const p = this.panels[tabId];
              if (!p) return '';
              return `
              <button type="button" class="dock-tab ${rightDock.activeTab === tabId ? 'active' : ''}" data-tab-id="${tabId}" data-dock="right">
                ${getIconSvg(p.icon, 12)} ${p.title}
              </button>
            `;
            })
            .join('')}
        </div>
      </div>

      <!-- Right Rail (Shown when unpinned) -->
      <div class="mud-dock-rail rail-right" style="${rightDock.pinned ? 'display:none;' : 'display:flex;'}">
        ${rightDock.tabs
          .map((tabId) => {
            const p = this.panels[tabId];
            if (!p) return '';
            return `
            <button type="button" class="mud-dock-rail-item ${rightDock.activeTab === tabId ? 'active' : ''}" data-rail="right" data-tab="${tabId}">
              ${getIconSvg(p.icon, 14)} ${p.title}
            </button>
          `;
          })
          .join('')}
      </div>
    `;
  }

  attachEventListeners() {
    // Tab switching in docks
    this.container.querySelectorAll('[data-tab-id]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', (e) => {
        // If clicking close icon on tab
        if (e.target.dataset.closeTab) {
          e.stopPropagation();
          this.closeTab(e.target.dataset.closeTab);
          return;
        }

        const tabId = tabBtn.dataset.tabId;
        const dockId = tabBtn.dataset.dock;
        if (this.docks[dockId]) {
          this.docks[dockId].activeTab = tabId;
          this.render();
          this.attachEventListeners();
        }
      });

      // Tab drag start
      tabBtn.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.dataset.closeTab) return;
        this.initiateDrag(tabBtn.dataset.tabId, tabBtn.dataset.dock, e);
      });
    });

    // Panel Top Toolbar drag start
    this.container.querySelectorAll('[data-draggable-panel]').forEach((toolbar) => {
      toolbar.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const panelId = toolbar.dataset.draggablePanel;
        const dockId = toolbar.closest('[data-dock]')?.dataset.dock;
        if (panelId && dockId) {
          this.initiateDrag(panelId, dockId, e);
        }
      });
    });

    // Pin/Unpin Left Panel
    const leftPinBtn = this.container.querySelector('#left-pin-btn');
    if (leftPinBtn) {
      leftPinBtn.addEventListener('click', () => {
        this.docks.left.pinned = !this.docks.left.pinned;
        this.docks.left.flyoutOpen = false;
        showToast(this.docks.left.pinned ? 'Left dock pinned' : 'Left dock unpinned to vertical rail', 'info');
        this.render();
        this.attachEventListeners();
      });
    }

    // Pin/Unpin Right Panel
    const rightPinBtn = this.container.querySelector('#right-pin-btn');
    if (rightPinBtn) {
      rightPinBtn.addEventListener('click', () => {
        this.docks.right.pinned = !this.docks.right.pinned;
        this.docks.right.flyoutOpen = false;
        showToast(this.docks.right.pinned ? 'Right dock pinned' : 'Right dock unpinned to vertical rail', 'info');
        this.render();
        this.attachEventListeners();
      });
    }

    // Close buttons
    const leftCloseBtn = this.container.querySelector('#left-close-btn');
    if (leftCloseBtn) {
      leftCloseBtn.addEventListener('click', () => {
        this.closeTab(this.docks.left.activeTab);
      });
    }

    const rightCloseBtn = this.container.querySelector('#right-close-btn');
    if (rightCloseBtn) {
      rightCloseBtn.addEventListener('click', () => {
        this.closeTab(this.docks.right.activeTab);
      });
    }

    const bottomCloseBtn = this.container.querySelector('#bottom-close-btn');
    if (bottomCloseBtn) {
      bottomCloseBtn.addEventListener('click', () => {
        this.docks.bottom.pinned = !this.docks.bottom.pinned;
        this.render();
        this.attachEventListeners();
      });
    }

    // Reset layout button
    const resetBtn = this.container.querySelector('#reset-layout-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetDefaultLayout();
      });
    }

    // Build SCSS button
    const runBuildBtn = this.container.querySelector('#run-build-btn');
    if (runBuildBtn) {
      runBuildBtn.addEventListener('click', () => {
        showToast('Running SCSS compiler & GSAP linker: SUCCESS (0 errors)', 'success');
      });
    }

    // Left Rail Expand on Hover
    const leftRailItems = this.container.querySelectorAll('.rail-left .mud-dock-rail-item');
    const leftPanel = this.container.querySelector('#dock-panel-left');
    leftRailItems.forEach((item) => {
      item.addEventListener('mouseenter', () => {
        if (!this.docks.left.pinned) {
          this.docks.left.activeTab = item.dataset.tab;
          this.docks.left.flyoutOpen = true;
          leftPanel.style.display = 'flex';
          leftPanel.style.position = 'absolute';
          leftPanel.style.left = '38px';
          leftPanel.style.top = '0';
          leftPanel.style.bottom = '0';
          leftPanel.style.zIndex = '50';

          gsap.fromTo(leftPanel, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: 'power2.out' });
          const leftTitle = this.container.querySelector('#left-title');
          const leftBody = this.container.querySelector('#left-body');
          if (leftTitle) leftTitle.innerText = this.getPanelTitle(this.docks.left.activeTab);
          if (leftBody) leftBody.innerHTML = this.renderPanelContent(this.docks.left.activeTab);
        }
      });
    });

    // Right Rail Expand on Hover
    const rightRailItems = this.container.querySelectorAll('.rail-right .mud-dock-rail-item');
    const rightPanel = this.container.querySelector('#dock-panel-right');
    rightRailItems.forEach((item) => {
      item.addEventListener('mouseenter', () => {
        if (!this.docks.right.pinned) {
          this.docks.right.activeTab = item.dataset.tab;
          this.docks.right.flyoutOpen = true;
          rightPanel.style.display = 'flex';
          rightPanel.style.position = 'absolute';
          rightPanel.style.right = '38px';
          rightPanel.style.top = '0';
          rightPanel.style.bottom = '0';
          rightPanel.style.zIndex = '50';

          gsap.fromTo(rightPanel, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: 'power2.out' });
          const rightTitle = this.container.querySelector('#right-title');
          const rightBody = this.container.querySelector('#right-body');
          if (rightTitle) rightTitle.innerText = this.getPanelTitle(this.docks.right.activeTab);
          if (rightBody) rightBody.innerHTML = this.renderPanelContent(this.docks.right.activeTab);
        }
      });
    });

    // Auto-collapse unpinned flyout when mouse leaves
    if (leftPanel) {
      leftPanel.addEventListener('mouseleave', () => {
        if (!this.docks.left.pinned && this.docks.left.flyoutOpen) {
          gsap.to(leftPanel, {
            x: -20,
            opacity: 0,
            duration: 0.15,
            onComplete: () => {
              this.docks.left.flyoutOpen = false;
              leftPanel.style.display = 'none';
            },
          });
        }
      });
    }

    if (rightPanel) {
      rightPanel.addEventListener('mouseleave', () => {
        if (!this.docks.right.pinned && this.docks.right.flyoutOpen) {
          gsap.to(rightPanel, {
            x: 20,
            opacity: 0,
            duration: 0.15,
            onComplete: () => {
              this.docks.right.flyoutOpen = false;
              rightPanel.style.display = 'none';
            },
          });
        }
      });
    }

    // Attach Draggable Splitters for Resizing
    this.initSplitters();
  }

  // -------------------------------------------------------------
  // Visual Studio 2026 Drag & Drop Compass Engine
  // -------------------------------------------------------------
  setupGlobalDragListeners() {
    window.addEventListener('mousemove', (e) => {
      if (!this.draggingPanelId) return;

      // 1. Move ghost
      if (this.dragGhost) {
        this.dragGhost.style.left = `${e.clientX}px`;
        this.dragGhost.style.top = `${e.clientY}px`;
      }

      // 2. Determine target dock under mouse cursor
      this.updateCompassAndDropPreview(e);
    });

    window.addEventListener('mouseup', () => {
      if (this.draggingPanelId) {
        this.finalizeDrop();
      }
    });
  }

  initiateDrag(panelId, sourceDockId, event) {
    this.draggingPanelId = panelId;
    this.dragSourceDock = sourceDockId;

    // Create Ghost
    const p = this.panels[panelId];
    this.dragGhost = document.createElement('div');
    this.dragGhost.className = 'mud-dock-drag-ghost';
    this.dragGhost.innerHTML = `
      <span>${getIconSvg(p ? p.icon : 'dock', 16)}</span>
      <span>${p ? p.title : panelId}</span>
    `;
    this.dragGhost.style.left = `${event.clientX}px`;
    this.dragGhost.style.top = `${event.clientY}px`;
    document.body.appendChild(this.dragGhost);

    // Create Drop Preview Rect
    this.dropPreviewEl = document.createElement('div');
    this.dropPreviewEl.className = 'mud-dock-drop-preview';
    this.dropPreviewEl.style.display = 'none';
    this.container.appendChild(this.dropPreviewEl);

    // Create 5-Way Docking Compass (Top, Bottom, Left, Right, Center/Inside)
    this.compassEl = document.createElement('div');
    this.compassEl.className = 'mud-dock-compass';
    this.compassEl.innerHTML = `
      <div class="compass-inner">
        <button type="button" class="compass-btn guide-top" data-guide="top" title="Split Dock to Top">
          ${getIconSvg('chevronRight', 16, 'transform -rotate-90')}
        </button>
        <button type="button" class="compass-btn guide-bottom" data-guide="bottom" title="Split Dock to Bottom">
          ${getIconSvg('chevronDown', 16)}
        </button>
        <button type="button" class="compass-btn guide-left" data-guide="left" title="Split Dock to Left">
          ${getIconSvg('chevronRight', 16, 'transform rotate-180')}
        </button>
        <button type="button" class="compass-btn guide-right" data-guide="right" title="Split Dock to Right">
          ${getIconSvg('chevronRight', 16)}
        </button>
        <button type="button" class="compass-btn guide-center" data-guide="inside" title="Dock Inside (Add as Tab)">
          ${getIconSvg('dock', 16)}
        </button>
      </div>
    `;
    this.compassEl.style.display = 'none';
    this.container.appendChild(this.compassEl);
  }

  updateCompassAndDropPreview(e) {
    // Find target dock panel under cursor
    const dockPanels = [
      { id: 'left', el: this.container.querySelector('#dock-panel-left') },
      { id: 'center', el: this.container.querySelector('#dock-panel-center') },
      { id: 'right', el: this.container.querySelector('#dock-panel-right') },
      { id: 'bottom', el: this.container.querySelector('#dock-panel-bottom') },
    ];

    let targetDock = null;
    let targetRect = null;

    for (const d of dockPanels) {
      if (!d.el || d.el.style.display === 'none') continue;
      const r = d.el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        targetDock = d.id;
        targetRect = r;
        break;
      }
    }

    if (!targetDock || !targetRect) {
      if (this.compassEl) this.compassEl.style.display = 'none';
      if (this.dropPreviewEl) this.dropPreviewEl.style.display = 'none';
      this.currentDropTarget = null;
      return;
    }

    // Position Compass centered on target dock panel
    const wsRect = this.container.getBoundingClientRect();
    const centerX = targetRect.left - wsRect.left + targetRect.width / 2;
    const centerY = targetRect.top - wsRect.top + targetRect.height / 2;

    this.compassEl.style.display = 'flex';
    this.compassEl.style.left = `${centerX}px`;
    this.compassEl.style.top = `${centerY}px`;

    // Determine which guide action is closest or hovered
    const mouseRelX = e.clientX - targetRect.left;
    const mouseRelY = e.clientY - targetRect.top;
    const normX = mouseRelX / targetRect.width;
    const normY = mouseRelY / targetRect.height;

    let action = 'inside';
    // Center guide distance
    const distCenter = Math.hypot(mouseRelX - targetRect.width / 2, mouseRelY - targetRect.height / 2);

    if (distCenter < 55) {
      action = 'inside';
    } else if (normY < 0.28) {
      action = 'top';
    } else if (normY > 0.72) {
      action = 'bottom';
    } else if (normX < 0.28) {
      action = 'left';
    } else if (normX > 0.72) {
      action = 'right';
    } else {
      action = 'inside';
    }

    // Highlight compass buttons
    this.compassEl.querySelectorAll('.compass-btn').forEach((btn) => {
      btn.classList.toggle('highlighted', btn.dataset.guide === action);
    });

    this.currentDropTarget = { dockId: targetDock, action };

    // Calculate drop preview rectangle
    this.dropPreviewEl.style.display = 'block';
    const pad = 4;
    let prevLeft = targetRect.left - wsRect.left + pad;
    let prevTop = targetRect.top - wsRect.top + pad;
    let prevWidth = targetRect.width - pad * 2;
    let prevHeight = targetRect.height - pad * 2;

    if (action === 'top') {
      prevHeight = targetRect.height / 2 - pad * 2;
    } else if (action === 'bottom') {
      prevTop += targetRect.height / 2;
      prevHeight = targetRect.height / 2 - pad * 2;
    } else if (action === 'left') {
      prevWidth = targetRect.width / 2 - pad * 2;
    } else if (action === 'right') {
      prevLeft += targetRect.width / 2;
      prevWidth = targetRect.width / 2 - pad * 2;
    }

    this.dropPreviewEl.style.left = `${prevLeft}px`;
    this.dropPreviewEl.style.top = `${prevTop}px`;
    this.dropPreviewEl.style.width = `${prevWidth}px`;
    this.dropPreviewEl.style.height = `${prevHeight}px`;
  }

  finalizeDrop() {
    const panelId = this.draggingPanelId;
    const sourceDock = this.dragSourceDock;
    const target = this.currentDropTarget;

    // Clean up drag UI
    if (this.dragGhost) {
      this.dragGhost.remove();
      this.dragGhost = null;
    }
    if (this.compassEl) {
      this.compassEl.remove();
      this.compassEl = null;
    }
    if (this.dropPreviewEl) {
      this.dropPreviewEl.remove();
      this.dropPreviewEl = null;
    }
    this.draggingPanelId = null;
    this.dragSourceDock = null;

    if (!target) return;

    // Execute transfer
    const { dockId: targetDock, action } = target;
    const p = this.panels[panelId];
    const panelTitle = p ? p.title : panelId;

    // Remove from source dock
    if (this.docks[sourceDock]) {
      this.docks[sourceDock].tabs = this.docks[sourceDock].tabs.filter((t) => t !== panelId);
      if (this.docks[sourceDock].activeTab === panelId) {
        this.docks[sourceDock].activeTab = this.docks[sourceDock].tabs[0] || null;
      }
    }

    // Add to target dock
    if (action === 'inside') {
      if (this.docks[targetDock]) {
        if (!this.docks[targetDock].tabs.includes(panelId)) {
          this.docks[targetDock].tabs.push(panelId);
        }
        this.docks[targetDock].activeTab = panelId;
        this.panels[panelId].dock = targetDock;
      }
      showToast(`Docked "${panelTitle}" inside ${targetDock.toUpperCase()} dock`, 'success');
    } else {
      // Split dock behavior: add as split or transfer to adjacent dock
      if (targetDock === 'center') {
        if (action === 'left') {
          this.docks.left.tabs.push(panelId);
          this.docks.left.activeTab = panelId;
          this.docks.left.pinned = true;
          this.panels[panelId].dock = 'left';
          showToast(`Split Center: moved "${panelTitle}" to Left dock`, 'success');
        } else if (action === 'right') {
          this.docks.right.tabs.push(panelId);
          this.docks.right.activeTab = panelId;
          this.docks.right.pinned = true;
          this.panels[panelId].dock = 'right';
          showToast(`Split Center: moved "${panelTitle}" to Right dock`, 'success');
        } else if (action === 'bottom') {
          this.docks.bottom.tabs.push(panelId);
          this.docks.bottom.activeTab = panelId;
          this.docks.bottom.pinned = true;
          this.panels[panelId].dock = 'bottom';
          showToast(`Split Center: moved "${panelTitle}" to Bottom dock`, 'success');
        } else if (action === 'top') {
          // Add as top split inside center dock
          this.docks.center.splits.push({ panelId, position: 'top' });
          showToast(`Split Center Dock (Top) with "${panelTitle}"`, 'success');
        }
      } else {
        // Drop on side/bottom dock split
        if (!this.docks[targetDock].tabs.includes(panelId)) {
          this.docks[targetDock].tabs.push(panelId);
        }
        this.docks[targetDock].activeTab = panelId;
        this.docks[targetDock].pinned = true;
        this.panels[panelId].dock = targetDock;
        showToast(`Transferred "${panelTitle}" to ${targetDock.toUpperCase()} dock (${action.toUpperCase()})`, 'success');
      }
    }

    this.render();
    this.attachEventListeners();
  }

  closeTab(tabId) {
    let closedTitle = tabId;
    for (const dId of Object.keys(this.docks)) {
      if (this.docks[dId].tabs.includes(tabId)) {
        this.docks[dId].tabs = this.docks[dId].tabs.filter((t) => t !== tabId);
        if (this.docks[dId].activeTab === tabId) {
          this.docks[dId].activeTab = this.docks[dId].tabs[0] || null;
        }
        closedTitle = this.panels[tabId]?.title || tabId;
      }
    }
    showToast(`Closed panel tab "${closedTitle}"`, 'info');
    this.render();
    this.attachEventListeners();
  }

  resetDefaultLayout() {
    this.docks = {
      left: {
        tabs: ['solution', 'git', 'db'],
        activeTab: 'solution',
        pinned: true,
        width: 280,
        flyoutOpen: false,
      },
      center: {
        tabs: ['scss', 'js', 'dashboard', 'preview'],
        activeTab: 'scss',
        splits: [],
      },
      right: {
        tabs: ['properties', 'diagnostics', 'tokens'],
        activeTab: 'properties',
        pinned: true,
        width: 300,
        flyoutOpen: false,
      },
      bottom: {
        tabs: ['terminal', 'output', 'errors', 'tests'],
        activeTab: 'terminal',
        pinned: true,
        height: 190,
      },
    };

    showToast('Restored default Visual Studio 2026 dock layout', 'success');
    this.render();
    this.attachEventListeners();
  }

  // -------------------------------------------------------------
  // Draggable Splitters
  // -------------------------------------------------------------
  initSplitters() {
    const leftSplitter = this.container.querySelector('#splitter-left');
    const rightSplitter = this.container.querySelector('#splitter-right');
    const bottomSplitter = this.container.querySelector('#splitter-bottom');

    if (leftSplitter) {
      let isDragging = false;
      leftSplitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        leftSplitter.classList.add('dragging');

        const onMouseMove = (moveEvent) => {
          if (!isDragging) return;
          const newW = Math.max(160, Math.min(500, moveEvent.clientX));
          this.docks.left.width = newW;
          const leftPanel = this.container.querySelector('#dock-panel-left');
          if (leftPanel) leftPanel.style.width = `${newW}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          leftSplitter.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    if (rightSplitter) {
      let isDragging = false;
      rightSplitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        rightSplitter.classList.add('dragging');

        const onMouseMove = (moveEvent) => {
          if (!isDragging) return;
          const newW = Math.max(180, Math.min(520, window.innerWidth - moveEvent.clientX));
          this.docks.right.width = newW;
          const rightPanel = this.container.querySelector('#dock-panel-right');
          if (rightPanel) rightPanel.style.width = `${newW}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          rightSplitter.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    if (bottomSplitter) {
      let isDragging = false;
      bottomSplitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        bottomSplitter.classList.add('dragging');

        const onMouseMove = (moveEvent) => {
          if (!isDragging) return;
          const newH = Math.max(90, Math.min(450, window.innerHeight - moveEvent.clientY));
          this.docks.bottom.height = newH;
          const bottomPanel = this.container.querySelector('#dock-panel-bottom');
          if (bottomPanel) bottomPanel.style.height = `${newH}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          bottomSplitter.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
  }

  // -------------------------------------------------------------
  // Content Rendering Helpers
  // -------------------------------------------------------------
  getPanelTitle(panelId) {
    return this.panels[panelId]?.title || panelId;
  }

  getPanelIcon(panelId) {
    return this.panels[panelId]?.icon || 'dock';
  }

  renderCenterSplitsHtml() {
    if (!this.docks.center.splits || this.docks.center.splits.length === 0) return '';
    return this.docks.center.splits
      .map(
        (s) => `
      <div class="border-l border-[var(--mud-palette-lines-default)] flex flex-col flex-1 bg-[var(--mud-palette-surface)]">
        <div class="mud-dock-panel-toolbar" data-draggable-panel="${s.panelId}">
          <div class="panel-title">${getIconSvg(this.getPanelIcon(s.panelId), 14)} <span>${this.getPanelTitle(s.panelId)} (Split)</span></div>
          <button type="button" class="tab-close-icon" data-close-split="${s.panelId}">×</button>
        </div>
        <div class="mud-dock-panel-body flex-1">
          ${this.renderPanelContent(s.panelId)}
        </div>
      </div>
    `
      )
      .join('');
  }

  renderPanelContent(panelId) {
    if (!panelId) {
      return `<div style="padding:24px;text-align:center;color:var(--mud-palette-text-secondary);font-size:0.8125rem;">Empty Dock. Drag any panel tab or header here to transfer.</div>`;
    }

    if (panelId === 'solution') {
      return `
        <div style="font-family:ui-monospace, monospace;font-size:0.8rem;display:flex;flex-direction:column;gap:4px;">
          <div style="font-weight:600;color:var(--mud-palette-primary);">${getIconSvg('folder', 14)} MudTail.Material.sln</div>
          <div style="padding-left:14px;">
            <div>📁 <strong>src/</strong></div>
            <div style="padding-left:14px;display:flex;flex-direction:column;gap:2px;">
              <div>📁 <strong>scss/</strong></div>
              <div style="padding-left:12px;color:var(--mud-palette-text-secondary);">
                <div>📄 _variables.scss</div>
                <div>📄 _mixins.scss</div>
                <div>📄 _elevation.scss</div>
                <div>📄 _rounded.scss</div>
                <div>📄 _dockpanels.scss</div>
                <div>📄 mud-material.scss</div>
              </div>
              <div>📁 <strong>components/</strong></div>
              <div style="padding-left:12px;color:var(--mud-palette-text-secondary);">
                <div>📄 VSDockLayout.js (VS 2026 Engine)</div>
                <div>📄 MudDrawer.js</div>
                <div>📄 MudTabs.js</div>
                <div>📄 NavigationSidebar.js</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (panelId === 'git') {
      return `
        <div style="font-size:0.8125rem;">
          <div style="font-weight:600;margin-bottom:8px;color:var(--mud-palette-primary);">Changes (2 Staged)</div>
          <div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
            <span style="color:#10b981;font-weight:700;">M</span> src/components/VSDockLayout.js
          </div>
          <div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
            <span style="color:#10b981;font-weight:700;">M</span> src/scss/_dockpanels.scss
          </div>
          <div style="margin-top:16px;">
            <input type="text" class="mud-input-slot" placeholder="Commit message..." style="border:1px solid var(--mud-palette-lines-inputs);padding:6px;border-radius:4px;width:100%;font-size:0.75rem;margin-bottom:8px;" />
            <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" style="width:100%;">Commit to main</button>
          </div>
        </div>
      `;
    } else if (panelId === 'db') {
      return `
        <div style="font-size:0.8125rem;">
          <div style="font-weight:600;margin-bottom:8px;color:var(--mud-palette-primary);">Postgres Database Tables</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div>🗄️ <strong>users</strong> (id, email, role, created_at)</div>
            <div>🗄️ <strong>dock_layouts</strong> (id, user_id, config_json)</div>
            <div>🗄️ <strong>tokens</strong> (id, primary_hex, border_radius)</div>
          </div>
        </div>
      `;
    } else if (panelId === 'properties') {
      return `
        <div style="font-size:0.8125rem;display:flex;flex-direction:column;gap:10px;">
          <div>
            <div style="font-size:0.7rem;text-transform:uppercase;color:var(--mud-palette-text-secondary);font-weight:600;">Selected Dock Panel</div>
            <div style="font-weight:600;">Visual Studio 2026 Engine</div>
          </div>
          <div>
            <div style="font-size:0.7rem;text-transform:uppercase;color:var(--mud-palette-text-secondary);font-weight:600;">Docking Guide System</div>
            <div style="color:var(--mud-palette-primary);font-weight:600;">5-Way Cross Compass (Top/Right/Left/Bottom/Inside)</div>
          </div>
          <div>
            <div style="font-size:0.7rem;text-transform:uppercase;color:var(--mud-palette-text-secondary);font-weight:600;">Drop Preview</div>
            <div>Hardware-Accelerated Translucent Overlay</div>
          </div>
        </div>
      `;
    } else if (panelId === 'diagnostics') {
      return `
        <div style="font-size:0.8125rem;">
          <div style="font-weight:600;margin-bottom:8px;">Live Telemetry</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="background:rgba(0,0,0,0.03);padding:8px;border-radius:4px;">
              <div style="font-size:0.7rem;color:var(--mud-palette-text-secondary);">DOM Nodes</div>
              <div style="font-weight:700;color:var(--mud-palette-success);">156 (Optimal)</div>
            </div>
            <div style="background:rgba(0,0,0,0.03);padding:8px;border-radius:4px;">
              <div style="font-size:0.7rem;color:var(--mud-palette-text-secondary);">Frame Rate</div>
              <div style="font-weight:700;color:var(--mud-palette-primary);">60.0 FPS</div>
            </div>
          </div>
        </div>
      `;
    } else if (panelId === 'tokens') {
      return `
        <div style="font-size:0.75rem;font-family:ui-monospace, monospace;">
          <div style="color:#60a5fa;">--mud-palette-primary: #594ae2</div>
          <div style="color:#f472b6;">--mud-palette-secondary: #ff4081</div>
          <div style="color:#34d399;">--mud-default-borderradius: 4px</div>
        </div>
      `;
    } else if (panelId === 'terminal') {
      return `
        <div style="line-height:1.5;font-size:0.775rem;">
          <div style="color:#10b981;">node-js-vanilla-vite:~$ vite dev --port=3000</div>
          <div style="color:#94a3b8;">[vite] ready in 184ms. Local: http://localhost:3000/</div>
          <div style="color:#60a5fa;">[dock] Visual Studio 2026 drag & drop compass active.</div>
          <div style="color:#10b981;">node-js-vanilla-vite:~$ <span style="display:inline-block;width:8px;height:14px;background:#10b981;vertical-align:middle;animation:blink 1s step-end infinite;"></span></div>
        </div>
      `;
    } else if (panelId === 'output') {
      return `
        <div style="line-height:1.5;font-size:0.775rem;">
          <div>1&gt;------ Build started: Project: MudTail.SCSS, Configuration: Release Any CPU ------</div>
          <div>1&gt;Compiling /src/scss/mud-material.scss with sass compiler...</div>
          <div style="color:#10b981;">1&gt;========== Build: 1 succeeded, 0 failed, 0 up-to-date, 0 skipped ==========</div>
        </div>
      `;
    } else if (panelId === 'errors') {
      return `
        <div style="padding:12px;color:#10b981;display:flex;align-items:center;gap:8px;font-size:0.8125rem;">
          ${getIconSvg('check', 18)} 0 Errors, 0 Warnings in Visual Studio solution.
        </div>
      `;
    } else if (panelId === 'tests') {
      return `
        <div style="line-height:1.6;font-size:0.775rem;">
          <div style="color:#10b981;">✔ theme-tokens.test.js &gt; exportable SCSS generator generates valid tokens</div>
          <div style="color:#10b981;">✔ form-validators.test.js &gt; email and password validation</div>
          <div style="color:#10b981;font-weight:700;margin-top:6px;">All 11 tests passed successfully (0 failed).</div>
        </div>
      `;
    } else if (panelId === 'scss') {
      return `
<pre style="margin:0;"><span style="color:#94a3b8;">// mud-material.scss - Visual Studio 2026 Core Framework</span>
<span style="color:#f472b6;">@use</span> <span style="color:#60a5fa;">"variables"</span> <span style="color:#f472b6;">as</span> *;
<span style="color:#f472b6;">@use</span> <span style="color:#60a5fa;">"mixins"</span> <span style="color:#f472b6;">as</span> *;
<span style="color:#f472b6;">@use</span> <span style="color:#60a5fa;">"dockpanels"</span> <span style="color:#f472b6;">as</span> *;

<span style="color:#34d399;">:root</span> {
  <span style="color:#60a5fa;">--mud-palette-primary</span>: <span style="color:#fbbf24;">#594ae2</span>;
  <span style="color:#60a5fa;">--mud-default-borderradius</span>: <span style="color:#fbbf24;">4px</span>;
}

<span style="color:#34d399;">.mud-dock-compass</span> {
  <span style="color:#60a5fa;">position</span>: absolute;
  <span style="color:#60a5fa;">z-index</span>: <span style="color:#fbbf24;">200</span>;
}</pre>
      `;
    } else if (panelId === 'js') {
      return `
<pre style="margin:0;"><span style="color:#94a3b8;">// VSDockLayout.js - Drag &amp; Drop Compass System</span>
<span style="color:#f472b6;">export class</span> <span style="color:#34d399;">VSDockLayout</span> {
  <span style="color:#60a5fa;">transferPanel</span>(panelId, targetDock, action) {
    <span style="color:#94a3b8;">// Support for top, bottom, left, right, and inside transfer</span>
  }
}</pre>
      `;
    } else if (panelId === 'dashboard') {
      return `
<pre style="margin:0;"><span style="color:#94a3b8;">// Dashboard.js - Pure ES Module Integration</span>
<span style="color:#f472b6;">export function</span> <span style="color:#34d399;">createDashboardView</span>() {
  <span style="color:#f472b6;">return</span> container;
}</pre>
      `;
    } else {
      return `
        <div style="background:var(--mud-palette-surface);color:var(--mud-palette-text-primary);padding:24px;border-radius:4px;height:100%;">
          <h4 class="mud-typography mud-typography-h6" style="margin-bottom:12px;">Live Interactive Preview</h4>
          <p class="mud-typography mud-typography-body2" style="margin-bottom:16px;">This buffer is running vanilla ES modules directly inside the VS 2026 dock container.</p>
          <div style="display:flex;gap:12px;">
            <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-medium">Primary Action</button>
            <button type="button" class="mud-button-root mud-button-outlined mud-button-secondary mud-button-medium">Secondary Outline</button>
          </div>
        </div>
      `;
    }
  }

  getElement() {
    return this.container;
  }
}
