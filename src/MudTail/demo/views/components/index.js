// Registry of the component pages: the sidebar's "Components" group and the router both read it.
import { CORE_PAGES } from './core.js';
import { EDITORIAL_PAGES } from './editorial.js';
import { FORM_PAGES } from './forms.js';
import { DATATABLE_PAGE } from './datatable.js';
import { LOADING_PAGE, PROGRESS_PAGE } from './feedback.js';
import { TREE_PAGE } from './tree.js';
import { IMAGE_EDITOR_PAGE } from './imageEditor.js';
import { PLUGINS_PAGE } from './plugins.js';
import { COUNTDOWN_PAGE } from './countdown.js';
import { ANIMATOR_PAGE } from './animator.js';

export const COMPONENT_PAGES = [...CORE_PAGES.slice(0, 5), DATATABLE_PAGE, LOADING_PAGE, PROGRESS_PAGE, TREE_PAGE, IMAGE_EDITOR_PAGE, ...CORE_PAGES.slice(5), ...EDITORIAL_PAGES];
// Plugins ▸ the plugin system, then one page per sample plugin.
export const PLUGIN_PAGES = [{ ...PLUGINS_PAGE, navLabel: 'Overview' }, COUNTDOWN_PAGE, ANIMATOR_PAGE];
export { FORM_PAGES };

const ALL = new Map([...COMPONENT_PAGES, ...FORM_PAGES, ...PLUGIN_PAGES].map((p) => [p.id, p]));

/** The page for an id, or null. */
export function findComponentPage(id) {
  return ALL.get(id) ?? null;
}

/** Sidebar entries: the components, then the Forms and Plugins sub-groups. */
export function componentNavItems() {
  const item = (p) => ({ id: `cmp-${p.id}`, label: p.navLabel ?? p.label, icon: p.icon, view: `component:${p.id}` });
  return [
    ...COMPONENT_PAGES.map(item),
    { id: 'cmp-forms', label: 'Forms', icon: 'sliders', children: FORM_PAGES.map(item) },
    { id: 'cmp-plugins', label: 'Plugins', icon: 'plugin', children: PLUGIN_PAGES.map(item) },
  ];
}
