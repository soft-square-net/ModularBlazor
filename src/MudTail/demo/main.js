// MudTail Material UI Framework - Vanilla JS Entry Point with Tailwind CSS Flexible Grid Layout
import '../src/styles/mudtail.scss';
import './styles/demo.css';
import './styles/demo.scss';
import { initTheme, getTheme, updateTheme } from 'mudtail';
import { getIconSvg } from 'mudtail';
import { MudDrawer } from 'mudtail';
import { createThemeEditorContent } from './views/ThemeEditor.js';
import { GlobalSearch } from './views/GlobalSearch.js';
import { NavigationSidebar } from './views/NavigationSidebar.js';
import { createDashboardView } from './views/Dashboard.js';
import { VSDockLayout } from './views/VSDockLayout.js';
import { createDocumentationView } from './views/Documentation.js';
import { createDockBar } from './forms/Dock.js';
import { showToast } from 'mudtail';

class MudApp {
  constructor() {
    this.currentView = 'dashboard'; // dashboard | vsdock | docs
    this.currentFormTab = 'auth';
    this.sidebar = null;
    this.layoutGrid = null;
    this.themeDrawer = null;
    this.searchDialog = null;
    this.mainContainer = null;
    this.vsDockInstance = null;
  }

  start() {
    initTheme();

    const appRoot = document.getElementById('root');
    if (!appRoot) return;
    appRoot.innerHTML = '';
    appRoot.className = 'min-h-screen flex flex-col bg-[var(--mud-palette-background)] text-[var(--mud-palette-text-primary)]';

    // 1. Top App Bar
    const appbar = this.createAppBar();
    appRoot.appendChild(appbar);

    // 2. Responsive Tailwind CSS Grid Layout System
    this.layoutGrid = document.createElement('div');
    this.layoutGrid.id = 'app-layout-grid';
    this.layoutGrid.className = 'grid grid-cols-1 lg:grid-cols-[260px_1fr] flex-1 min-h-[calc(100vh-56px)] transition-[grid-template-columns] duration-300';

    // 3. Responsive Navigation Sidebar
    this.sidebar = new NavigationSidebar({
      initialView: this.currentView,
      onNavigate: (view, formTab) => {
        if (formTab) this.currentFormTab = formTab;
        this.switchView(view);
      },
      onToggleCollapse: (isCollapsed) => {
        if (isCollapsed) {
          this.layoutGrid.classList.remove('lg:grid-cols-[260px_1fr]');
          this.layoutGrid.classList.add('lg:grid-cols-[72px_1fr]');
        } else {
          this.layoutGrid.classList.remove('lg:grid-cols-[72px_1fr]');
          this.layoutGrid.classList.add('lg:grid-cols-[260px_1fr]');
        }
      },
      onOpenTheme: () => this.themeDrawer.open(),
      onOpenSearch: () => this.searchDialog.open(),
    });

    this.layoutGrid.appendChild(this.sidebar.getElement());

    // 4. Main Dashboard Content Area Container
    this.mainContainer = document.createElement('main');
    this.mainContainer.id = 'app-main';
    this.mainContainer.className = 'flex-1 overflow-y-auto relative w-full';
    this.layoutGrid.appendChild(this.mainContainer);

    appRoot.appendChild(this.layoutGrid);

    // 5. Theme Drawer (Right Anchor)
    this.themeDrawer = new MudDrawer({
      anchor: 'right',
      variant: 'temporary',
      title: 'Theme & Radius Studio',
      width: '380px',
    });
    this.themeDrawer.setContent(createThemeEditorContent());

    // 6. Global Search Modal (Ctrl+K)
    this.searchDialog = new GlobalSearch({
      onSelect: (item) => {
        if (item.view) {
          this.switchView(item.view);
        } else if (item.action === 'theme') {
          this.themeDrawer.open();
        } else if (item.action === 'export') {
          this.themeDrawer.open();
          showToast('Theme exporter open in right drawer', 'info');
        }
      },
    });

    // 7. Floating Bottom Dock Bar
    const dock = createDockBar({
      onItemClick: (id) => {
        if (id === 'search') this.searchDialog.open();
        else if (id === 'palette') this.themeDrawer.open();
        else if (id === 'dock') this.switchView('vsdock');
        else if (id === 'docs') this.switchView('docs');
      },
    });
    document.body.appendChild(dock);

    // 8. Render Initial View
    this.renderView();
  }

  createAppBar() {
    const bar = document.createElement('header');
    bar.className = 'mud-appbar sticky top-0 z-40 bg-[var(--mud-palette-surface)] border-b border-[var(--mud-palette-lines-default)]';

    bar.innerHTML = `
      <div class="mud-toolbar px-3 sm:px-4 flex items-center justify-between min-h-[56px] gap-2">
        <div class="flex items-center gap-2 sm:gap-3">
          <!-- Mobile Sidebar Drawer Trigger Button -->
          <button type="button" id="btn-mobile-sidebar" class="lg:hidden p-2 text-[var(--mud-palette-text-secondary)] hover:text-[var(--mud-palette-primary)] rounded-[var(--mud-default-borderradius,4px)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Toggle Sidebar">
            ${getIconSvg('menu', 20)}
          </button>

          <!-- Logo & Brand -->
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" id="nav-brand">
            <div style="width:34px;height:34px;border-radius:var(--mud-default-borderradius, 4px);background:var(--mud-palette-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;box-shadow:0 2px 4px rgba(89,74,226,0.3);">
              M
            </div>
            <div>
              <div style="font-weight:700;font-size:1rem;line-height:1.2;">MudTail</div>
              <div style="font-size:0.68rem;color:var(--mud-palette-text-secondary);line-height:1;">Tailwind Grid • SCSS • GSAP</div>
            </div>
          </div>

          <!-- Top Quick Nav Tabs (Desktop) -->
          <nav class="hidden md:flex items-center gap-1 ml-4" id="app-nav">
            <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small nav-link active" data-view="dashboard">
              ${getIconSvg('dashboard', 16)} Dashboard
            </button>
            <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-small nav-link" data-view="vsdock">
              ${getIconSvg('dock', 16)} VS 2026 Dock
            </button>
            <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-small nav-link" data-view="docs">
              ${getIconSvg('docs', 16)} Documentation
            </button>
          </nav>
        </div>

        <!-- Right Action Controls -->
        <div class="flex items-center gap-2">
          <!-- Quick Search Button -->
          <button type="button" class="mud-button-root mud-button-outlined mud-button-surface mud-button-small" id="btn-search-trigger" style="gap:8px;padding:4px 10px;">
            <span style="color:var(--mud-palette-text-secondary);display:flex;align-items:center;">${getIconSvg('search', 16)}</span>
            <span class="hidden sm:inline" style="font-size:0.75rem;color:var(--mud-palette-text-secondary);">Search (Ctrl+K)</span>
          </button>

          <!-- Theme Drawer Toggle -->
          <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" id="btn-theme-drawer" title="Theme & Radius Studio" style="gap:6px;">
            ${getIconSvg('palette', 16)}
            <span class="hidden sm:inline">Theme</span>
          </button>

          <!-- Dark / Light Toggle -->
          <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-icon" id="btn-dark-toggle" title="Toggle Dark/Light Mode">
            ${getIconSvg('moon', 18)}
          </button>
        </div>
      </div>
    `;

    // Mobile sidebar toggle
    bar.querySelector('#btn-mobile-sidebar').addEventListener('click', () => {
      this.sidebar.setMobileOpen(!this.sidebar.isMobileOpen);
    });

    // Brand click
    bar.querySelector('#nav-brand').addEventListener('click', () => {
      this.switchView('dashboard');
    });

    // Nav Links
    bar.querySelectorAll('.nav-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });

    // Search button
    bar.querySelector('#btn-search-trigger').addEventListener('click', () => {
      this.searchDialog.open();
    });

    // Theme Drawer button
    bar.querySelector('#btn-theme-drawer').addEventListener('click', () => {
      this.themeDrawer.open();
    });

    // Dark Mode toggle button
    const darkBtn = bar.querySelector('#btn-dark-toggle');
    darkBtn.addEventListener('click', () => {
      const theme = getTheme();
      const newDark = !theme.isDark;
      updateTheme({ isDark: newDark });
      darkBtn.innerHTML = getIconSvg(newDark ? 'sun' : 'moon', 18);
      showToast(newDark ? 'Switched to Dark Theme' : 'Switched to Light Theme', 'info');
    });

    return bar;
  }

  switchView(viewName) {
    if (this.currentView === viewName && this.mainContainer.children.length > 0) return;
    this.currentView = viewName;

    // Update active nav links in Appbar
    document.querySelectorAll('.nav-link').forEach((link) => {
      const isMatch = link.dataset.view === viewName;
      link.classList.toggle('active', isMatch);
      link.classList.toggle('mud-button-primary', isMatch);
      link.classList.toggle('mud-button-surface', !isMatch);
    });

    // Synchronize active item in Sidebar
    if (this.sidebar) {
      this.sidebar.setActiveView(viewName);
    }

    this.renderView();
  }

  renderView() {
    this.mainContainer.innerHTML = '';

    if (this.currentView === 'dashboard') {
      this.mainContainer.appendChild(createDashboardView({ initialFormTab: this.currentFormTab }));
    } else if (this.currentView === 'vsdock') {
      this.vsDockInstance = new VSDockLayout();
      this.mainContainer.appendChild(this.vsDockInstance.getElement());
    } else if (this.currentView === 'docs') {
      this.mainContainer.appendChild(createDocumentationView());
    }
  }
}

// Boot application
const app = new MudApp();
document.addEventListener('DOMContentLoaded', () => {
  app.start();
});

// If DOM is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  app.start();
}
