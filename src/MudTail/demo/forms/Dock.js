// Vanilla JS Dock Bar Component (Quick Action Tools)
import { getIconSvg } from 'mudtail';
import { attachTooltip } from 'mudtail';

export function createDockBar(options = {}) {
  const {
    items = [
      { id: 'search', icon: 'search', label: 'Global Search (Ctrl+K)' },
      { id: 'palette', icon: 'palette', label: 'Theme & Tokens Drawer' },
      { id: 'dock', icon: 'dock', label: 'Visual Studio 2026 Dock' },
      { id: 'docs', icon: 'docs', label: 'Storyboard Documentation' },
    ],
    onItemClick = null,
  } = options;

  const dock = document.createElement('div');
  dock.className = 'mud-paper mud-elevation-4';
  dock.style.position = 'fixed';
  dock.style.bottom = '20px';
  dock.style.left = '50%';
  dock.style.transform = 'translateX(-50%)';
  dock.style.zIndex = '1000';
  dock.style.display = 'flex';
  dock.style.alignItems = 'center';
  dock.style.gap = '6px';
  dock.style.padding = '6px 10px';
  dock.style.borderRadius = '30px';
  dock.style.backdropFilter = 'blur(8px)';
  dock.style.border = '1px solid var(--mud-palette-lines-default)';

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mud-button-root mud-button-text mud-button-surface mud-button-icon';
    btn.innerHTML = getIconSvg(item.icon, 18);
    btn.dataset.dockId = item.id;
    attachTooltip(btn, item.label, 'top');

    btn.addEventListener('click', (e) => {
      if (onItemClick) onItemClick(item.id, e);
    });

    dock.appendChild(btn);
  });

  return dock;
}
