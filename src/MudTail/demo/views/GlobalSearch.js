// Vanilla JS GlobalSearch Dialog (Ctrl+K)
import { getIconSvg } from 'mudtail';
import gsap from 'gsap';

export class GlobalSearch {
  constructor(options = {}) {
    this.onSelect = options.onSelect || null;
    this.isOpen = false;
    this.items = [
      { id: 'docs-paper', title: 'MudPaper & Elevation Levels', category: 'Documentation', icon: 'folder', view: 'docs' },
      { id: 'docs-accordion', title: 'MudAccordion Expansion Panels', category: 'Documentation', icon: 'chevronDown', view: 'docs' },
      { id: 'docs-autocomplete', title: 'MudAutocomplete Dropdown & Filtering', category: 'Documentation', icon: 'search', view: 'docs' },
      { id: 'docs-drawer', title: 'MudDrawer 6 Anchors & Variants', category: 'Documentation', icon: 'menu', view: 'docs' },
      { id: 'docs-tabs', title: 'MudTabs 6 Positions & GSAP Slider', category: 'Documentation', icon: 'sliders', view: 'docs' },
      { id: 'docs-appbar', title: 'MudAppBar & ToolBar Layouts', category: 'Documentation', icon: 'columns', view: 'docs' },
      { id: 'view-vsdock', title: 'Visual Studio 2026 IDE Dock Workspace', category: 'Workspace', icon: 'dock', view: 'vsdock' },
      { id: 'view-dashboard', title: 'Main Analytics Dashboard', category: 'Navigation', icon: 'dashboard', view: 'dashboard' },
      { id: 'action-theme', title: 'Open Theme & Border Radius Drawer', category: 'Action', icon: 'palette', action: 'theme' },
      { id: 'action-export', title: 'Export SCSS / CSS Framework Tokens', category: 'Action', icon: 'download', action: 'export' },
    ];

    this.backdrop = null;
    this.dialog = null;
    this.input = null;
    this.resultsList = null;
    this.selectedIndex = 0;
    this.filtered = [...this.items];

    this.init();
    this.attachShortcuts();
  }

  init() {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'mud-search-backdrop';

    this.dialog = document.createElement('div');
    this.dialog.className = 'mud-search-dialog';

    this.dialog.innerHTML = `
      <div class="mud-search-input-box">
        <span style="color:var(--mud-palette-primary);">${getIconSvg('search', 20)}</span>
        <input type="text" placeholder="Search documentation, components, or actions... (Esc to close)" />
        <span style="font-size:0.75rem;padding:2px 6px;border-radius:4px;background:rgba(0,0,0,0.06);font-weight:600;">ESC</span>
      </div>
      <div class="mud-search-results"></div>
      <div class="mud-search-footer">
        <span>Navigation: <kbd>↑</kbd> <kbd>↓</kbd> to select, <kbd>Enter</kbd> to open</span>
        <span>MudBlazor Material Vanilla JS</span>
      </div>
    `;

    this.input = this.dialog.querySelector('input');
    this.resultsList = this.dialog.querySelector('.mud-search-results');

    this.backdrop.appendChild(this.dialog);
    document.body.appendChild(this.backdrop);

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    this.input.addEventListener('input', (e) => {
      this.filter(e.target.value);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.filtered.length - 1, this.selectedIndex + 1);
        this.renderResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.renderResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.filtered[this.selectedIndex]) {
          this.choose(this.filtered[this.selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  attachShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  filter(query) {
    const q = query.trim().toLowerCase();
    this.filtered = this.items.filter(
      (item) => item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
    this.selectedIndex = 0;
    this.renderResults();
  }

  renderResults() {
    if (this.filtered.length === 0) {
      this.resultsList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--mud-palette-text-secondary);font-size:0.875rem;">No matching results</div>`;
      return;
    }

    this.resultsList.innerHTML = this.filtered
      .map((item, idx) => `
        <div class="mud-search-item ${idx === this.selectedIndex ? 'highlighted' : ''}" data-index="${idx}">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--mud-palette-primary);">${getIconSvg(item.icon, 18)}</span>
            <span style="font-weight:500;">${item.title}</span>
          </div>
          <span style="font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(0,0,0,0.06);color:var(--mud-palette-text-secondary);">${item.category}</span>
        </div>
      `)
      .join('');

    this.resultsList.querySelectorAll('.mud-search-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        this.choose(this.filtered[idx]);
      });
    });
  }

  choose(item) {
    this.close();
    if (this.onSelect) {
      this.onSelect(item);
    }
  }

  open() {
    this.isOpen = true;
    this.backdrop.classList.add('open');
    this.input.value = '';
    this.filtered = [...this.items];
    this.selectedIndex = 0;
    this.renderResults();

    gsap.fromTo(
      this.dialog,
      { y: -20, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: 'power2.out' }
    );

    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.isOpen = false;
    gsap.to(this.dialog, {
      y: -10,
      opacity: 0,
      duration: 0.15,
      onComplete: () => {
        this.backdrop.classList.remove('open');
      },
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}
