// Shared template for the component pages: header, live examples with their source, and an API table.
import { autoInit, getIconSvg, showToast } from 'mudtail';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Removes the common indentation of a template literal, so code samples read cleanly. */
export function dedent(text) {
  const lines = String(text).replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/**
 * @param {object} page
 * @param {string} page.title
 * @param {string} page.lead           one-paragraph description (HTML allowed: static content)
 * @param {string[]} [page.trail]      breadcrumb above the title
 * @param {string[]} [page.kinds]      what it is made of: 'CSS', 'JS', 'Behaviour', 'Blazor'
 * @param {Array<{title, description?, html?, code?, language?, mount?}>} page.examples
 *   html: markup rendered live and shown as the code; or mount(previewEl) → optional dispose, with `code` shown.
 *   code: false hides the code panel (guidance examples).
 * @param {Array<{title, rows: Array<[string, string]>}>} [page.api]
 */
export function componentPage({ title, lead, trail = ['Components'], kinds = [], examples = [], api = [] }) {
  const root = document.createElement('article');
  root.className = 'cp';
  root.innerHTML = `
    <header class="cp-head">
      <nav class="cp-trail" aria-label="Breadcrumb">${trail.map(esc).join(' <span aria-hidden="true">/</span> ')}</nav>
      <h1 class="cp-title">${esc(title)}</h1>
      <p class="cp-lead">${lead}</p>
      ${kinds.length ? `<div class="cp-kinds">${kinds.map((k) => `<span class="cp-kind">${esc(k)}</span>`).join('')}</div>` : ''}
    </header>`;

  const disposers = [];
  examples.forEach((ex, i) => {
    const section = document.createElement('section');
    section.className = 'cp-example';
    const id = `ex-${i}`;
    section.innerHTML = `
      <h2 class="cp-example__title" id="${id}">${esc(ex.title)}</h2>
      ${ex.description ? `<p class="cp-example__desc">${ex.description}</p>` : ''}
      <div class="cp-preview" aria-labelledby="${id}"></div>
      <div class="cp-code">
        <div class="cp-code__bar"><span>${esc(ex.language ?? (ex.html ? 'HTML / Razor' : 'JavaScript'))}</span>
          <button type="button" class="cp-copy">${getIconSvg('copy', 14)} Copy</button></div>
        <pre><code></code></pre>
      </div>`;
    const preview = section.querySelector('.cp-preview');
    if (ex.code === false) section.querySelector('.cp-code').remove();
    const code = ex.code === false ? '' : dedent(ex.code ?? ex.html ?? '');
    if (ex.code !== false) section.querySelector('.cp-code pre code').textContent = code; // not the first <code>: descriptions contain some
    if (ex.html) preview.innerHTML = dedent(ex.html);
    if (ex.mount) {
      const out = ex.mount(preview);
      if (typeof out === 'function') disposers.push(out);
      else if (out?.dispose) disposers.push(() => out.dispose());
    }
    section.querySelector('.cp-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); showToast('Copied to the clipboard', 'success'); } catch { showToast('Copy is blocked here', 'error'); }
    });
    root.appendChild(section);
  });

  if (api.length) {
    const section = document.createElement('section');
    section.className = 'cp-api';
    section.innerHTML = `<h2 class="cp-example__title">API</h2>${api.map((t) => `
      <h3 class="cp-api__title">${esc(t.title)}</h3>
      <div class="cp-api__scroll"><table class="cp-api__table"><tbody>
        ${t.rows.map(([name, desc]) => `<tr><th scope="row"><code>${esc(name)}</code></th><td>${desc}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}`;
    root.appendChild(section);
  }

  // data-mud behaviours in the examples (ticker, lightbox, password toggle, …) start here and stop with the page.
  const behaviours = autoInit(root);
  disposers.push(() => behaviours.dispose());

  return {
    element: root,
    dispose() { disposers.forEach((d) => { try { d(); } catch (e) { console.error(e); } }); },
  };
}
