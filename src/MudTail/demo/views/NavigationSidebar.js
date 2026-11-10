// Vanilla JS Responsive Navigation Sidebar using Tailwind CSS Grid & GSAP
import { getIconSvg } from 'mudtail';
import { attachTooltip } from 'mudtail';
import { getTheme, updateTheme } from 'mudtail';
import { showToast } from 'mudtail';
import { componentNavItems } from './components/index.js';

const SIDEBAR_BASE = 'bg-[var(--mud-palette-surface)] flex-col transition-[width] duration-300 select-none overflow-hidden';
// Docked: hidden below lg, a sticky full-height column from lg up.
const SIDEBAR_DOCKED = 'hidden lg:flex h-[calc(100vh-56px)] sticky top-[56px] z-30 border-e border-[var(--mud-palette-lines-default)]';
// Drawer (below lg, opened from the app bar): over the page, on the inline-start side.
const SIDEBAR_DRAWER = 'flex fixed inset-y-0 start-0 z-50 h-dvh shadow-2xl';

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
    this.expandedGroups = new Set(); // ids of open sub-groups (e.g. Components ▸ Forms)

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
        title: 'Components',
        items: componentNavItems(),
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
    // Sidebar: a sticky column from lg (1024px) up. Below that it is hidden and opens as an overlay drawer
    // (setMobileOpen), so it never takes a row of the single-column grid above the content.
    this.container = document.createElement('aside');
    this.container.id = 'app-sidebar';
    this.container.className = `${SIDEBAR_BASE} ${SIDEBAR_DOCKED}`;
    this.container.style.width = '260px';

    // Mobile overlay backdrop
    this.mobileBackdrop = document.createElement('div');
    this.mobileBackdrop.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden hidden';
    this.mobileBackdrop.addEventListener('click', () => this.setMobileOpen(false));
    document.body.appendChild(this.mobileBackdrop);

    // The drawer closes with Esc, and on its own when the window grows to the docked (lg) layout.
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isMobileOpen) this.setMobileOpen(false); });
    matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches && this.isMobileOpen) this.setMobileOpen(false); });

    this.render();
  }

  render() {
    const isMini = this.isCollapsed;
    // The list is long now (Components, Forms…): keep its scroll position across re-renders.
    const scrollTop = this.container.querySelector('nav')?.scrollTop ?? 0;
    queueMicrotask(() => { const nav = this.container.querySelector('nav'); if (nav) nav.scrollTop = scrollTop; });

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
              ${sec.items.map((item) => (item.children ? this.renderGroup(item, isMini) : this.renderItem(item, isMini))).join('')}
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

  isItemActive(item) {
    return this.currentView === item.view && !item.action && (!item.formTab || item.id === 'dashboard');
  }

  renderItem(item, isMini, nested = false) {
    const isActive = this.isItemActive(item);
    return `
      <button type="button"
        class="nav-sidebar-item w-full flex items-center ${isMini ? 'justify-center px-2' : 'justify-between px-3'} ${nested ? 'py-1.5' : 'py-2'} rounded-[var(--mud-default-borderradius,4px)] text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-[var(--mud-palette-primary)] text-white shadow-sm'
            : 'text-[var(--mud-palette-text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800/60'
        }"
        data-item-id="${item.id}"
        data-view="${item.view || ''}"
        data-action="${item.action || ''}"
        data-form-tab="${item.formTab || ''}"
        title="${item.label}"
        ${isActive ? 'aria-current="page"' : ''}
      >
        <div class="flex items-center gap-3 overflow-hidden">
          <span class="${isActive ? 'text-white' : 'text-[var(--mud-palette-primary)]'} flex-shrink-0">
            ${getIconSvg(item.icon, nested ? 16 : 18)}
          </span>
          <span class="truncate ${isMini ? 'hidden' : 'block'}">${item.label}</span>
        </div>
        ${!isMini && item.badge ? `<span class="text-[0.65rem] px-2 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-[var(--mud-palette-primary)]'}">${item.badge}</span>` : ''}
        ${!isMini && item.shortcut ? `<kbd class="text-[0.65rem] px-1.5 py-0.5 rounded font-mono bg-slate-100 dark:bg-slate-800 text-[var(--mud-palette-text-secondary)] border border-[var(--mud-palette-lines-default)]">${item.shortcut}</kbd>` : ''}
      </button>`;
  }

  /** A collapsible sub-group (e.g. Components ▸ Forms). It opens by itself when one of its pages is shown. */
  renderGroup(group, isMini) {
    const hasActive = group.children.some((c) => this.isItemActive(c));
    if (hasActive) this.expandedGroups.add(group.id);
    const open = this.expandedGroups.has(group.id) && !isMini;
    const listId = `nav-group-${group.id}`;
    return `
      <div class="nav-sidebar-group-wrap">
        <button type="button"
          class="nav-sidebar-group w-full flex items-center ${isMini ? 'justify-center px-2' : 'justify-between px-3'} py-2 rounded-[var(--mud-default-borderradius,4px)] text-sm font-medium transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-slate-800/60 ${hasActive ? 'text-[var(--mud-palette-primary)]' : 'text-[var(--mud-palette-text-primary)]'}"
          data-group-id="${group.id}" aria-expanded="${open}" aria-controls="${listId}" title="${group.label}">
          <div class="flex items-center gap-3 overflow-hidden">
            <span class="text-[var(--mud-palette-primary)] flex-shrink-0">${getIconSvg(group.icon, 18)}</span>
            <span class="truncate ${isMini ? 'hidden' : 'block'}">${group.label}</span>
          </div>
          <span class="${isMini ? 'hidden' : 'flex'} items-center gap-2 text-[var(--mud-palette-text-secondary)]">
            <span class="text-[0.65rem] font-bold">${group.children.length}</span>
            <span class="transition-transform duration-200 ${open ? 'rotate-90' : 'rtl:rotate-180'}">${getIconSvg('chevronRight', 14)}</span>
          </span>
        </button>
        <div id="${listId}" class="${open ? 'block' : 'hidden'} mt-1 ms-4 ps-2 border-s border-[var(--mud-palette-lines-default)] space-y-0.5" role="group" aria-label="${group.label}">
          ${group.children.map((c) => this.renderItem(c, false, true)).join('')}
        </div>
      </div>`;
  }

  attachEvents() {
    // Sub-group headers open / close their list; in mini mode they expand the sidebar first.
    this.container.querySelectorAll('.nav-sidebar-group').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.groupId;
        if (this.isCollapsed) {
          this.expandedGroups.add(id);
          this.toggleCollapse();
          return;
        }
        if (!this.expandedGroups.delete(id)) this.expandedGroups.add(id);
        this.render();
        this.container.querySelector(`[data-group-id="${id}"]`)?.focus();
      });
    });

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
    // Swap whole class sets: classes for the same property (sticky / fixed, top-[56px] / top-0) must never be on
    // the element together, because Tailwind's CSS order, not the class order, would decide which one wins.
    this.mobileBackdrop.classList.toggle('hidden', !open);
    this.container.className = `${SIDEBAR_BASE} ${open ? SIDEBAR_DRAWER : SIDEBAR_DOCKED}`;
    this.container.style.width = open ? '280px' : (this.isCollapsed ? '72px' : '260px');
    if (open) this.container.querySelector('button, a')?.focus();
  }

  setActiveView(view) {
    this.currentView = view;
    this.render();
  }

  getElement() {
    return this.container;
  }
}
