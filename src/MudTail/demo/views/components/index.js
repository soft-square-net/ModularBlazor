// Registry of the component pages: the sidebar's "Components" group and the router both read it.
import { CORE_PAGES } from './core.js';
import { EDITORIAL_PAGES } from './editorial.js';
import { FORM_PAGES } from './forms.js';
import { DATATABLE_PAGE } from './datatable.js';

export const COMPONENT_PAGES = [...CORE_PAGES.slice(0, 5), DATATABLE_PAGE, ...CORE_PAGES.slice(5), ...EDITORIAL_PAGES];
export { FORM_PAGES };

const ALL = new Map([...COMPONENT_PAGES, ...FORM_PAGES].map((p) => [p.id, p]));

/** The page for an id, or null. */
export function findComponentPage(id) {
  return ALL.get(id) ?? null;
}

/** Sidebar entries: the components, then the Forms sub-group with every form control. */
export function componentNavItems() {
  const item = (p) => ({ id: `cmp-${p.id}`, label: p.label, icon: p.icon, view: `component:${p.id}` });
  return [
    ...COMPONENT_PAGES.map(item),
    { id: 'cmp-forms', label: 'Forms', icon: 'sliders', children: FORM_PAGES.map(item) },
  ];
}
