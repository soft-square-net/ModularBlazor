// Vanilla JS MudDialog Component with GSAP Animations
import { animateDialog } from '../core/animations.js';
import { getIconSvg } from '../core/icons.js';

export class MudDialog {
  constructor(options = {}) {
    this.title = options.title || 'Dialog';
    this.maxWidth = options.maxWidth || '520px';
    this.content = options.content || '';
    this.actions = options.actions || []; // [{ label, color, variant, onClick }]
    this.onClose = options.onClose || null;

    this.container = null;
    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = 'mud-dialog-container';

    const overlay = document.createElement('div');
    overlay.className = 'mud-dialog-overlay';
    overlay.addEventListener('click', () => this.close());

    const dialog = document.createElement('div');
    dialog.className = 'mud-dialog';
    dialog.style.maxWidth = this.maxWidth;

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'mud-dialog-title';
    titleEl.innerHTML = `
      <span>${this.title}</span>
      <button type="button" class="dialog-close-btn" style="background:transparent;border:none;cursor:pointer;color:var(--mud-palette-text-secondary);display:flex;align-items:center;">
        ${getIconSvg('close', 18)}
      </button>
    `;
    titleEl.querySelector('.dialog-close-btn').addEventListener('click', () => this.close());

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'mud-dialog-content';
    if (typeof this.content === 'string') {
      contentEl.innerHTML = this.content;
    } else if (this.content instanceof HTMLElement) {
      contentEl.appendChild(this.content);
    }

    // Actions
    const actionsEl = document.createElement('div');
    actionsEl.className = 'mud-dialog-actions';

    if (this.actions.length === 0) {
      const okBtn = document.createElement('button');
      okBtn.className = 'mud-button-root mud-button-filled mud-button-primary mud-button-medium';
      okBtn.innerText = 'OK';
      okBtn.addEventListener('click', () => this.close());
      actionsEl.appendChild(okBtn);
    } else {
      this.actions.forEach((act) => {
        const btn = document.createElement('button');
        btn.className = `mud-button-root mud-button-${act.variant || 'filled'} mud-button-${act.color || 'primary'} mud-button-medium`;
        btn.innerText = act.label;
        btn.addEventListener('click', (e) => {
          if (act.onClick) act.onClick(e, this);
          else this.close();
        });
        actionsEl.appendChild(btn);
      });
    }

    dialog.appendChild(titleEl);
    dialog.appendChild(contentEl);
    dialog.appendChild(actionsEl);

    this.container.appendChild(overlay);
    this.container.appendChild(dialog);

    document.body.appendChild(this.container);
  }

  open() {
    animateDialog(this.container, true);
  }

  close() {
    animateDialog(this.container, false, () => {
      if (this.onClose) this.onClose();
    });
  }

  destroy() {
    this.container.remove();
  }

  /** Removes the dialog from the page. */
  dispose() {
    this.destroy();
  }
}
