// MudTail Animator: scenes come from files and servers, so markup in them (HTML layers, inline SVG assets) is cleaned
// before it reaches the page: no scripts, no event-handler attributes, no javascript: URLs, no frames or objects.

const BLOCKED = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'meta', 'link', 'noscript', 'template']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'data', 'background']);

/** Whether a URL is safe in a scene: http(s), relative, blob:, and data: images / media / fonts only. */
export function isSafeUrl(value) {
  const v = String(value ?? '').trim().replace(/[\u0000-\u001f\s]+/g, '').toLowerCase();
  if (!v) return true;
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return false;
  if (v.startsWith('data:')) return /^data:(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|video\/|audio\/|font\/)/.test(v);
  return true;
}

/** Removes active content from an element tree in place. */
export function cleanTree(root) {
  const walker = [root];
  while (walker.length) {
    const node = walker.pop();
    for (const child of [...node.children]) {
      const tag = child.localName?.toLowerCase();
      if (BLOCKED.has(tag) || tag === 'foreignobject' && child.querySelector('script')) { child.remove(); continue; }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) child.removeAttribute(attr.name);
        else if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) child.removeAttribute(attr.name);
        else if (name === 'style' && /expression\(|javascript:|url\(\s*['"]?\s*javascript:/i.test(attr.value)) child.removeAttribute(attr.name);
      }
      walker.push(child);
    }
  }
  return root;
}

/** Clean HTML for an HTML layer, as a fragment. */
export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  cleanTree(template.content);
  return template.content;
}

/** A clean <svg> element from markup, or null when it is not SVG. */
export function sanitizeSvg(markup) {
  const doc = new DOMParser().parseFromString(String(markup ?? ''), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.localName !== 'svg' || doc.querySelector('parsererror')) return null;
  cleanTree(svg);
  for (const attr of [...svg.attributes]) if (attr.name.toLowerCase().startsWith('on')) svg.removeAttribute(attr.name);
  return document.importNode(svg, true);
}
