// Vanilla JS MudAccordion Component with GSAP height animation
import { animateAccordion } from '../core/animations.js';
import { getIconSvg } from '../core/icons.js';

export class MudAccordion {
  constructor(options = {}) {
    this.panels = options.panels || []; // [{ id, title, icon, content, expanded }]
    this.multiExpand = !!options.multiExpand;
    this.container = null;

    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = 'mud-accordion';

    this.panels.forEach((p) => {
      const panelEl = document.createElement('div');
      panelEl.className = 'mud-expansion-panel';
      panelEl.dataset.panelId = p.id;

      const header = document.createElement('div');
      header.className = `mud-expansion-panel-header ${p.expanded ? 'expanded' : ''}`;
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          ${p.icon ? `<span>${p.icon}</span>` : ''}
          <span>${p.title}</span>
        </div>
        <span class="mud-panel-icon">${getIconSvg('chevronDown', 18)}</span>
      `;

      const content = document.createElement('div');
      content.className = `mud-expansion-panel-content ${p.expanded ? 'expanded' : ''}`;
      if (p.expanded) {
        content.style.height = 'auto';
        content.style.opacity = '1';
      }

      const body = document.createElement('div');
      body.className = 'mud-panel-body';
      if (typeof p.content === 'string') {
        body.innerHTML = p.content;
      } else if (p.content instanceof HTMLElement) {
        body.appendChild(p.content);
      }
      content.appendChild(body);

      header.addEventListener('click', () => {
        const isCurrentlyExpanded = header.classList.contains('expanded');

        if (!this.multiExpand && !isCurrentlyExpanded) {
          // Collapse other open panels
          this.container.querySelectorAll('.mud-expansion-panel-header.expanded').forEach((otherH) => {
            otherH.classList.remove('expanded');
            const otherContent = otherH.nextElementSibling;
            if (otherContent) animateAccordion(otherContent, false);
          });
        }

        if (isCurrentlyExpanded) {
          header.classList.remove('expanded');
          animateAccordion(content, false);
        } else {
          header.classList.add('expanded');
          animateAccordion(content, true);
        }
      });

      panelEl.appendChild(header);
      panelEl.appendChild(content);
      this.container.appendChild(panelEl);
    });
  }

  getElement() {
    return this.container;
  }

  /** Removes the accordion from the page. */
  dispose() {
    this.container?.remove();
  }
}
