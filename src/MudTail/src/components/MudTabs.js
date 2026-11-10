// Vanilla JS MudTabs Component with 6 Positions and GSAP Slider Indicator
import { animateTabSlider, createRipple } from '../core/animations.js';

export class MudTabs {
  constructor(options = {}) {
    this.position = options.position || 'top'; // top | bottom | left | right | start | end
    this.tabs = options.tabs || []; // [{ id, label, icon, badge, content }]
    this.activeId = options.activeId || (this.tabs[0]?.id || '');
    this.onChange = options.onChange || null;
    this.className = options.className || '';

    this.container = null;
    this.tabBar = null;
    this.slider = null;
    this.panelsContainer = null;
    this.tabButtons = new Map();
    this.panels = new Map();

    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = `mud-tabs position-${this.position} ${this.className}`;

    // Tab bar
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'mud-tabs-tabbar';

    // Slider
    this.slider = document.createElement('div');
    this.slider.className = 'mud-tab-slider';
    this.tabBar.appendChild(this.slider);

    // Panels container
    this.panelsContainer = document.createElement('div');
    this.panelsContainer.className = 'mud-tabs-panels';

    // Build tabs
    this.tabs.forEach((tab) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mud-tab ${tab.id === this.activeId ? 'active' : ''}`;
      btn.dataset.tabId = tab.id;

      let html = '';
      if (tab.icon) {
        html += `<span class="mud-tab-icon">${tab.icon}</span>`;
      }
      html += `<span>${tab.label}</span>`;
      if (tab.badge) {
        html += `<span class="mud-tab-badge">${tab.badge}</span>`;
      }
      btn.innerHTML = html;

      btn.addEventListener('click', (e) => {
        createRipple(e, btn);
        this.setActive(tab.id);
      });

      this.tabButtons.set(tab.id, btn);
      this.tabBar.appendChild(btn);

      // Panel
      const panel = document.createElement('div');
      panel.className = `mud-tab-panel ${tab.id === this.activeId ? 'active' : ''}`;
      panel.dataset.panelId = tab.id;
      if (typeof tab.content === 'string') {
        panel.innerHTML = tab.content;
      } else if (tab.content instanceof HTMLElement) {
        panel.appendChild(tab.content);
      }
      this.panels.set(tab.id, panel);
      this.panelsContainer.appendChild(panel);
    });

    this.container.appendChild(this.tabBar);
    this.container.appendChild(this.panelsContainer);

    // Initial slider position after render
    requestAnimationFrame(() => {
      this.updateSlider();
    });
  }

  setPosition(newPosition) {
    this.container.classList.remove(`position-${this.position}`);
    this.position = newPosition;
    this.container.classList.add(`position-${this.position}`);
    this.updateSlider();
  }

  setActive(id) {
    if (this.activeId === id) return;
    this.activeId = id;

    this.tabButtons.forEach((btn, tabId) => {
      btn.classList.toggle('active', tabId === id);
    });

    this.panels.forEach((panel, panelId) => {
      panel.classList.toggle('active', panelId === id);
    });

    this.updateSlider();

    if (this.onChange) {
      this.onChange(id);
    }
  }

  updateSlider() {
    const activeBtn = this.tabButtons.get(this.activeId);
    if (activeBtn) {
      animateTabSlider(this.slider, activeBtn, this.position);
    }
  }

  getElement() {
    return this.container;
  }

  /** Removes the tabs from the page. */
  dispose() {
    this.container?.remove();
    this.tabButtons.clear();
    this.panels.clear();
  }
}
