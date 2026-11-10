// Mega-nav: section panels that open on hover (desktop mouse) or with the expander button (keyboard,
// touch, small screens). Esc closes and returns focus; a click outside or a link click closes everything.
// On small screens the whole nav is hidden behind any [data-mud-nav-toggle] button whose aria-controls
// points at the nav's id.
//
// The script owns aria-expanded (expanders, toggles) and data-open (items, nav); Razor must not render them.
// Delegated listeners keep it working while Blazor re-renders the items (modules add nav entries at runtime).

const DESKTOP = '(min-width: 1024px)';
const OPEN_DELAY = 90;
const CLOSE_DELAY = 220;

export function megaNav(nav) {
  nav.setAttribute('data-enhanced', '');
  const desktop = matchMedia(DESKTOP);
  let openTimer = 0;
  let closeTimer = 0;

  const itemOf = (node) => node?.closest?.('.mud-mega-nav__item');
  const panelOf = (item) => item?.querySelector(':scope > .mud-mega-nav__panel');
  const expanderOf = (item) => item?.querySelector(':scope > .mud-mega-nav__expander');
  const toggles = () => (nav.id ? [...document.querySelectorAll(`[data-mud-nav-toggle][aria-controls="${CSS.escape(nav.id)}"]`)] : []);

  const syncExpanders = () => {
    nav.querySelectorAll('.mud-mega-nav__item').forEach((item) => {
      const expander = expanderOf(item);
      if (expander) expander.setAttribute('aria-expanded', String(item.hasAttribute('data-open')));
    });
    toggles().forEach((t) => t.setAttribute('aria-expanded', String(nav.hasAttribute('data-open'))));
  };

  const open = (item) => {
    if (!panelOf(item)) return;
    closeAll(item);
    item.setAttribute('data-open', '');
    expanderOf(item)?.setAttribute('aria-expanded', 'true');
  };

  const close = (item) => {
    item.removeAttribute('data-open');
    expanderOf(item)?.setAttribute('aria-expanded', 'false');
  };

  const closeAll = (except) => {
    nav.querySelectorAll('.mud-mega-nav__item[data-open]').forEach((item) => { if (item !== except) close(item); });
  };

  const setNavOpen = (isOpen) => {
    if (isOpen) nav.setAttribute('data-open', ''); else nav.removeAttribute('data-open');
    toggles().forEach((t) => t.setAttribute('aria-expanded', String(isOpen)));
    if (!isOpen) closeAll();
  };

  // Hover (desktop mouse only)
  const onPointerOver = (e) => {
    if (e.pointerType !== 'mouse' || !desktop.matches) return;
    const item = itemOf(e.target);
    clearTimeout(closeTimer);
    if (!item || item.hasAttribute('data-open')) return;
    clearTimeout(openTimer);
    openTimer = setTimeout(() => open(item), OPEN_DELAY);
  };
  const onPointerLeave = (e) => {
    if (e.pointerType !== 'mouse' || !desktop.matches) return;
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => closeAll(), CLOSE_DELAY);
  };

  const onClick = (e) => {
    const expander = e.target.closest('.mud-mega-nav__expander');
    if (expander && nav.contains(expander)) {
      const item = itemOf(expander);
      item.hasAttribute('data-open') ? close(item) : open(item);
      return;
    }
    if (e.target.closest('a')) { // navigating (Blazor routes without a page load): fold everything away
      closeAll();
      setNavOpen(false);
    }
  };

  const onDocumentClick = (e) => {
    const toggle = e.target.closest('[data-mud-nav-toggle]');
    if (toggle && toggle.getAttribute('aria-controls') === nav.id) {
      setNavOpen(!nav.hasAttribute('data-open'));
      return;
    }
    if (!nav.contains(e.target)) closeAll();
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    const openItem = nav.querySelector('.mud-mega-nav__item[data-open]');
    if (openItem) {
      close(openItem);
      expanderOf(openItem)?.focus();
      e.stopPropagation();
    } else if (nav.hasAttribute('data-open')) {
      setNavOpen(false);
      toggles()[0]?.focus();
    }
  };

  const onFocusOut = (e) => { // tabbing out of an open section closes it (desktop)
    if (!desktop.matches) return;
    const item = itemOf(e.target);
    if (item?.hasAttribute('data-open') && !item.contains(e.relatedTarget)) close(item);
  };

  const onBreakpoint = () => { closeAll(); setNavOpen(false); };

  nav.addEventListener('pointerover', onPointerOver);
  nav.addEventListener('pointerleave', onPointerLeave);
  nav.addEventListener('click', onClick);
  nav.addEventListener('focusout', onFocusOut);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
  desktop.addEventListener('change', onBreakpoint);

  // New items rendered later get their aria-expanded too.
  const observer = new MutationObserver(syncExpanders);
  observer.observe(nav, { childList: true, subtree: true });
  syncExpanders();

  return {
    open: (index) => open(nav.querySelectorAll('.mud-mega-nav__item')[index]),
    closeAll: () => closeAll(),
    dispose() {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      observer.disconnect();
      nav.removeEventListener('pointerover', onPointerOver);
      nav.removeEventListener('pointerleave', onPointerLeave);
      nav.removeEventListener('click', onClick);
      nav.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onBreakpoint);
      closeAll();
      nav.removeAttribute('data-open');
      nav.removeAttribute('data-enhanced');
    },
  };
}
