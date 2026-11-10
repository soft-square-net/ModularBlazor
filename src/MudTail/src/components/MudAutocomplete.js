// Vanilla JS MudAutocomplete Component
import { getIconSvg } from '../core/icons.js';

export function createAutocomplete(options = {}) {
  const {
    label = 'Select Country / Region',
    placeholder = 'Type to search...',
    items = [
      'United States',
      'United Kingdom',
      'Germany',
      'France',
      'Japan',
      'Canada',
      'Australia',
      'Egypt',
      'United Arab Emirates',
      'Netherlands',
      'Sweden',
      'Switzerland',
      'Singapore',
      'Brazil',
      'India',
    ],
    onSelect = null,
    signal = undefined, // AbortSignal: aborting it removes the document-level listener
  } = options;

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const wrapper = document.createElement('div');
  wrapper.className = 'mud-input-control mud-autocomplete-wrapper';

  wrapper.innerHTML = `
    <label class="mud-input-label">${getIconSvg('search', 14)} ${label}</label>
    <div class="mud-input-wrapper">
      <input type="text" class="mud-input-slot" placeholder="${placeholder}" />
      <span class="mud-input-adornment-end" style="cursor:pointer;" data-mud-clear>${getIconSvg('close', 16)}</span>
    </div>
    <div class="mud-autocomplete-popover" data-mud-popover></div>
  `;

  const input = wrapper.querySelector('input');
  const popover = wrapper.querySelector('[data-mud-popover]');
  const clearBtn = wrapper.querySelector('[data-mud-clear]');
  let highlightedIndex = -1;
  let filteredItems = [...items];

  function renderList(query = '') {
    filteredItems = items.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredItems.length === 0) {
      popover.innerHTML = '<div style="padding:10px 14px;color:var(--mud-palette-text-secondary);font-size:0.8125rem;">No matches found</div>';
      popover.classList.add('open');
      return;
    }

    popover.innerHTML = filteredItems
      .map((item, idx) => {
        let text = item;
        if (query) {
          const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
          text = item.replace(regex, '<span class="matched">$1</span>');
        }
        return `<div class="mud-autocomplete-item ${idx === highlightedIndex ? 'highlighted' : ''}" data-index="${idx}">${text}</div>`;
      })
      .join('');

    popover.classList.add('open');

    // Attach click events to items
    popover.querySelectorAll('.mud-autocomplete-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        selectItem(filteredItems[idx]);
      });
    });
  }

  function selectItem(item) {
    input.value = item;
    popover.classList.remove('open');
    highlightedIndex = -1;
    if (onSelect) onSelect(item);
  }

  input.addEventListener('input', (e) => {
    highlightedIndex = -1;
    renderList(e.target.value);
  });

  input.addEventListener('focus', () => {
    renderList(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (!popover.classList.contains('open')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(filteredItems.length - 1, highlightedIndex + 1);
      renderList(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(0, highlightedIndex - 1);
      renderList(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        selectItem(filteredItems[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      popover.classList.remove('open');
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    renderList('');
    input.focus();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      popover.classList.remove('open');
    }
  }, { signal });

  return wrapper;
}
