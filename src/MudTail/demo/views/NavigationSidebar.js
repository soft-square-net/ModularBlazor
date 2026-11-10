// Vanilla JS Responsive Navigation Sidebar using Tailwind CSS Grid & GSAP
import { getIconSvg } from 'mudtail';
import { attachTooltip } from 'mudtail';
import { getTheme, updateTheme } from 'mudtail';
import { showToast } from 'mudtail';

export class NavigationSidebar {
  constructor(options = {}) {
    this.currentView = options.initialView || 'dashboard';
    this.isCollapsed = false; // desktop collapsed mini mode (72px vs 260px)
    this.isMobileOpen = false; // mobile drawer overlay mode
    this.onNavigate = options.onNavigate || null;
    this.onToggleCollapse = options.onToggleCollapse || null;
    this.onOpenTheme = options.onOpenTheme || null;
    this.onOpenSearch = options.onOpenSearch || null;

    this.container = null;
    this.mobileBackdrop = null;

    this.navSections = [
      {
        title: 'Workspaces',
        items: [
          { id: 'dashboard', label: 'Dashboard Overview', icon: 'dashboard', badge: 'Live', view: 'dashboard' },
          { id: 'vsdock', label: 'VS 2026 Dock Layout', icon: 'dock', badge: 'IDE', view: 'vsdock' },
          { id: 'docs', label: 'Storyboard & Docs', icon: 'docs', badge: 'v2.4', view: 'docs' },
        ],
      },
      {
        title: 'Forms & Controls',
        items: [
          { id: 'forms-auth', label: 'User Authentication', icon: 'lock', view: 'dashboard', formTab: 'auth' },
          { id: 'forms-data', label: 'Data Entry & Sliders', icon: 'sliders', view: 'dashboard', formTab: 'data' },
        ],
      },
      {
        title: 'System & Framework',
        items: [
          { id: 'action-search', label: 'Global Search', icon: 'search', shortcut: 'Ctrl+K', action: 'search' },
          { id: 'action-theme', label: 'Theme & Radius Studio', icon: 'palette', action: 'theme' },
        ],
      },
    ];

    this.init();
  }

  init() {
    // Desktop & Tablet sidebar container
    this.container = document.createElement('aside');
    this.container.id = 'app-sidebar';
    this.container.className = 'bg-[var(--mud-palette-surface)] border-r border-[var(--mud-palette-lines-default)] flex flex-col h-[calc(100vh-56px)] sticky top-[56px] z-30 transition-all duration-300 select-none overflow-hidden';
    this.container.style.width = '260px';

    // Mobile overlay backdrop
    this.mobileBackdrop = document.createElement('div');
    this.mobileBackdrop.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden hidden';
    this.mobileBackdrop.addEventListener('click', () => this.setMobileOpen(false));
    document.body.appendChild(this.mobileBackdrop);

    this.render();
  }

  render() {
    const isMini = this.isCollapsed;

    this.container.innerHTML = `
      <!-- Sidebar Header / Collapse Toggle -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--mud-palette-lines-default)]">
        <div class="flex items-center gap-3 overflow-hidden ${isMini ? 'justify-center w-full' : ''}">
          <div class="w-8 h-8 rounded-[var(--mud-default-borderradius,4px)] bg-[var(--mud-palette-primary)] text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
            M
          </div>
          <div class="overflow-hidden ${isMini ? 'hidden' : 'block'}">
            <div class="font-bold text-sm leading-tight text-[var(--mud-palette-text-primary)]">MudTail OS</div>
            <div class="text-[0.65rem] text-[var(--mud-palette-text-secondary)]">Tailwind CSS Grid</div>
          </div>
        </div>
        <button type="button" id="sidebar-collapse-btn" class="text-[var(--mud-palette-text-secondary)] hover:text-[var(--mud-palette-primary)] p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${isMini ? 'hidden' : 'block'}" title="Collapse Sidebar">
          ${getIconSvg('chevronRight', 16, 'transform rotate-180')}
        </button>
      </div>

      <!-- Navigation Items List -->
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        ${this.navSections
          .map(
            (sec) => `
          <div>
            ${
              !isMini
                ? `<div class="text-[0.68rem] font-bold uppercase tracking-wider text-[var(--mud-palette-text-secondary)] px-3 mb-2 flex items-center gap-2">
                     <span>${sec.title}</span>
                   </div>`
                : `<div class="h-px bg-[var(--mud-palette-lines-default)] my-2"></div>`
            }
            <div class="space-y-1">
              ${sec.items
                .map((item) => {
                  const isActive = this.currentView === item.view && !item.action && (!item.formTab || item.id === 'dashboard');
                  return `
                    <button type="button"
                      class="nav-sidebar-item w-full flex items-center ${isMini ? 'justify-center px-2' : 'justify-between px-3'} py-2 rounded-[var(--mud-default-borderradius,4px)] text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-[var(--mud-palette-primary)] text-white shadow-sm'
                          : 'text-[var(--mud-palette-text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }"
                      data-item-id="${item.id}"
                      data-view="${item.view || ''}"
                      data-action="${item.action || ''}"
                      data-form-tab="${item.formTab || ''}"
                      title="${item.label}"
                    >
                      <div class="flex items-center gap-3 overflow-hidden">
                        <span class="${isActive ? 'text-white' : 'text-[var(--mud-palette-primary)]'} flex-shrink-0">
                          ${getIconSvg(item.icon, 18)}
                        </span>
                        <span class="truncate ${isMini ? 'hidden' : 'block'}">${item.label}</span>
                      </div>
                      ${
                        !isMini && item.badge
                          ? `<span class="text-[0.65rem] px-2 py-0.5 rounded-full font-bold ${
                              isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-[var(--mud-palette-primary)]'
                            }">${item.badge}</span>`
                          : ''
                      }
                      ${
                        !isMini && item.shortcut
                          ? `<kbd class="text-[0.65rem] px-1.5 py-0.5 rounded font-mono bg-slate-100 dark:bg-slate-800 text-[var(--mud-palette-text-secondary)] border border-[var(--mud-palette-lines-default)]">${item.shortcut}</kbd>`
                          : ''
                      }
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>
        `
          )
          .join('')}
      </nav>

      <!-- Sidebar Mini Expand Button (Only shown in Mini mode) -->
      ${
        isMini
          ? `
        <div class="p-2 border-t border-[var(--mud-palette-lines-default)] flex justify-center">
          <button type="button" id="sidebar-expand-btn" class="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--mud-palette-primary)]" title="Expand Sidebar">
            ${getIconSvg('chevronRight', 18)}
          </button>
        </div>
      `
          : ''
      }

      <!-- Sidebar Footer (User Status & Quick Controls) -->
      <div class="p-3 border-t border-[var(--mud-palette-lines-default)] bg-slate-50/50 dark:bg-slate-900/40">
        <div class="flex items-center ${isMini ? 'justify-center' : 'justify-between'} gap-3">
          <div class="flex items-center gap-2.5 overflow-hidden">
            <div class="relative flex-shrink-0">
              <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                AR
              </div>
              <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
            </div>
            <div class="overflow-hidden ${isMini ? 'hidden' : 'block'}">
              <div class="text-xs font-semibold text-[var(--mud-palette-text-primary)] truncate">Alex Rivera</div>
              <div class="text-[0.68rem] text-[var(--mud-palette-text-secondary)] truncate">Lead Architect</div>
            </div>
          </div>
          <div class="flex items-center gap-1 ${isMini ? 'hidden' : 'flex'}">
            <button type="button" id="sidebar-dark-btn" class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[var(--mud-palette-text-secondary)]" title="Toggle Theme">
              ${getIconSvg('moon', 16)}
            </button>
            <button type="button" id="sidebar-theme-btn" class="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-[var(--mud-palette-primary)]" title="Theme Studio">
              ${getIconSvg('palette', 16)}
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Collapse button (Desktop)
    const collapseBtn = this.container.querySelector('#sidebar-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.toggleCollapse();
      });
    }

    // Expand button (Mini mode)
    const expandBtn = this.container.querySelector('#sidebar-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        this.toggleCollapse();
      });
    }

    // Nav Item Clicks
    this.container.querySelectorAll('.nav-sidebar-item').forEach((btn) => {
      // In mini mode, attach tooltips
      if (this.isCollapsed) {
        attachTooltip(btn, btn.getAttribute('title') || '', 'right');
      }

      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        const action = btn.dataset.action;
        const formTab = btn.dataset.formTab;

        if (this.isMobileOpen) {
          this.setMobileOpen(false);
        }

        if (action === 'search' && this.onOpenSearch) {
          this.onOpenSearch();
        } else if (action === 'theme' && this.onOpenTheme) {
          this.onOpenTheme();
        } else if (view && this.onNavigate) {
          this.currentView = view;
          this.render();
          this.onNavigate(view, formTab);
        }
      });
    });

    // Dark mode toggle in sidebar footer
    const darkBtn = this.container.querySelector('#sidebar-dark-btn');
    if (darkBtn) {
      darkBtn.addEventListener('click', () => {
        const theme = getTheme();
        const newDark = !theme.isDark;
        updateTheme({ isDark: newDark });
        darkBtn.innerHTML = getIconSvg(newDark ? 'sun' : 'moon', 16);
        showToast(newDark ? 'Dark Mode Enabled' : 'Light Mode Enabled', 'info');
      });
    }

    // Theme Drawer trigger in sidebar footer
    const themeBtn = this.container.querySelector('#sidebar-theme-btn');
    if (themeBtn && this.onOpenTheme) {
      themeBtn.addEventListener('click', () => {
        this.onOpenTheme();
      });
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.container.style.width = this.isCollapsed ? '72px' : '260px';
    this.render();

    if (this.onToggleCollapse) {
      this.onToggleCollapse(this.isCollapsed);
    }
  }

  setMobileOpen(open) {
    this.isMobileOpen = open;
    if (open) {
      this.mobileBackdrop.classList.remove('hidden');
      this.container.classList.remove('hidden');
      this.container.classList.add('fixed', 'top-0', 'bottom-0', 'left-0', 'z-50', 'w-[280px]', 'shadow-2xl');
      this.container.style.height = '100vh';
    } else {
      this.mobileBackdrop.classList.add('hidden');
      this.container.classList.remove('fixed', 'top-0', 'bottom-0', 'left-0', 'z-50', 'w-[280px]', 'shadow-2xl');
      this.container.style.height = 'calc(100vh - 56px)';
      this.container.style.width = this.isCollapsed ? '72px' : '260px';
    }
  }

  setActiveView(view) {
    this.currentView = view;
    this.render();
  }

  getElement() {
    return this.container;
  }
}
