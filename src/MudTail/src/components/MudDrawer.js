// Vanilla JS MudDrawer Component with 6 Anchors & 3 Variants powered by GSAP
import { animateDrawer } from '../core/animations.js';
import { getIconSvg } from '../core/icons.js';

export class MudDrawer {
  constructor(options = {}) {
    this.anchor = options.anchor || 'left'; // left | right | top | bottom | start | end
    this.variant = options.variant || 'temporary'; // temporary | persistent | mini
    this.title = options.title || 'Drawer';
    this.width = options.width || (this.anchor === 'top' || this.anchor === 'bottom' ? 'auto' : '340px');
    this.isOpen = !!options.open;
    this.onClose = options.onClose || null;
    this.onOpen = options.onOpen || null;

    this.container = null;
    this.overlay = null;
    this.contentEl = null;

    this.init();
  }

  init() {
    // Drawer element
    this.container = document.createElement('div');
    this.container.className = `mud-drawer anchor-${this.anchor} variant-${this.variant}`;
    if (this.width !== 'auto') {
      this.container.style.width = this.width;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'mud-drawer-header';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:600;">${this.title}</span>
      </div>
      <button type="button" class="mud-drawer-close-btn" style="background:transparent;border:none;cursor:pointer;color:var(--mud-palette-text-secondary);display:flex;align-items:center;padding:4px;border-radius:4px;">
        ${getIconSvg('close', 18)}
      </button>
    `;

    header.querySelector('.mud-drawer-close-btn').addEventListener('click', () => {
      this.close();
    });

    // Content container
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'mud-drawer-content';

    this.container.appendChild(header);
    this.container.appendChild(this.contentEl);

    // Overlay for temporary drawers
    if (this.variant === 'temporary') {
      this.overlay = document.createElement('div');
      this.overlay.className = 'mud-drawer-overlay';
      this.overlay.style.display = 'none';
      this.overlay.addEventListener('click', () => this.close());
      document.body.appendChild(this.overlay);
    }

    this.container.style.display = this.isOpen ? 'flex' : 'none';
    if (this.isOpen) this.container.classList.add('open');
    document.body.appendChild(this.container);
  }

  setContent(elementOrHtml) {
    if (typeof elementOrHtml === 'string') {
      this.contentEl.innerHTML = elementOrHtml;
    } else if (elementOrHtml instanceof HTMLElement) {
      this.contentEl.innerHTML = '';
      this.contentEl.appendChild(elementOrHtml);
    }
  }

  setTitle(title) {
    this.title = title;
    const titleSpan = this.container.querySelector('.mud-drawer-header span');
    if (titleSpan) titleSpan.innerText = title;
  }

  setAnchor(newAnchor) {
    this.container.classList.remove(`anchor-${this.anchor}`);
    this.anchor = newAnchor;
    this.container.classList.add(`anchor-${this.anchor}`);
  }

  open() {
    this.isOpen = true;
    animateDrawer(this.container, this.overlay, this.anchor, true, () => {
      if (this.onOpen) this.onOpen();
    });
  }

  close() {
    this.isOpen = false;
    animateDrawer(this.container, this.overlay, this.anchor, false, () => {
      if (this.onClose) this.onClose();
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy() {
    if (this.overlay) this.overlay.remove();
    if (this.container) this.container.remove();
  }

  /** Removes the drawer and its overlay from the page. */
  dispose() {
    this.destroy();
  }
}
