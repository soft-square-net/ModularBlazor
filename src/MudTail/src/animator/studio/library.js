// MudTail Animator Studio: the library (left panel). Add layers (text, shapes, icons, media, HTML, canvas effects),
// manage uploaded assets (images, SVG, video, audio: from files, drops or URLs), and the layer tree (drag to reorder
// or into groups).

import { createLayer, addLayer, createAsset, createClip, findLayer, reparentLayer, descendantIds } from '../scene.js';
import { SHAPES, shapePath } from '../shapes.js';
import { CANVAS_EFFECTS } from '../canvas-effects.js';
import { h, esc, iconButton, button, readAsDataUrl, readAsText, modal, row } from './dom.js';
import { ANIMATOR_ICONS } from './icons.js';

/** Icon names an icon layer can use (MudTail's set plus the Animator's own). */
export const ICON_NAMES = [
  'star', 'trophy', 'news', 'globe', 'image', 'tag', 'sparkles', 'bell', 'mail', 'user', 'shield', 'lock', 'eye', 'sun', 'moon', 'check', 'close', 'plus',
  'arrowUp', 'arrowDown', 'arrowUpRight', 'chevronRight', 'chevronDown', 'search', 'send', 'download', 'upload', 'copy', 'edit', 'delete', 'code', 'terminal',
  'database', 'folder', 'file', 'palette', 'brush', 'pipette', 'gauge', 'timer', 'loader', 'refresh', 'layers', 'plugin', 'help', 'menu', 'pin', 'hand',
  'type', 'square', 'circle', 'crop', 'zoomIn', 'zoomOut', 'dashboard', 'docs', 'git', 'test', 'archive', 'more', 'grip',
  ...Object.keys(ANIMATOR_ICONS),
];

const MAX_INLINE = 4 * 1024 * 1024; // larger files stay as session-only object URLs unless an upload hook stores them

export function createLibrary(S, mount) {
  const { T, icon } = S;
  let tab = 'add';
  const tabs = h('div.mud-anim-tabs', { role: 'tablist' });
  const body = h('div.mud-anim-library');
  mount.append(tabs, body);

  const place = (kind, props = {}, name) => {
    const layer = createLayer(kind, props, { name, view: S.view });
    if (!S.isBaseView) {
      // the layer's base position comes from the view it is dropped into
      const sx = S.scene.views[0].width / S.view.width; const sy = S.scene.views[0].height / S.view.height;
      layer.props.x = Math.round(layer.props.x * sx); layer.props.y = Math.round(layer.props.y * sy);
    }
    const parent = S.selectedLayer?.kind === 'group' ? S.selectedLayer.id : null;
    if (parent) { layer.props.x = 20; layer.props.y = 20; }
    S.commit(T('history.addLayer', 'Add {name}', { name: layer.name }), (s) => addLayer(s, layer, { parentId: parent }));
    S.select([layer.id]);
    return layer;
  };

  function renderTabs() {
    tabs.replaceChildren(...[['add', T('lib.add', 'Add'), 'plus'], ['assets', T('lib.assets', 'Assets'), 'image'], ['layers', T('lib.layers', 'Layers'), 'layers']].map(([id, label, ic]) =>
      h('button.mud-anim-tab', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(); }, html: `${icon(ic, 15)}<span>${esc(label)}</span>` })));
  }

  function render() {
    renderTabs();
    const scroll = body.scrollTop;
    body.replaceChildren(tab === 'add' ? addTab() : tab === 'assets' ? assetsTab() : layersTab());
    body.scrollTop = scroll;
  }

  // ───── Add ─────
  function tile(label, html, onclick, title = label) {
    return h('button.mud-anim-tile', { type: 'button', title, onclick }, [h('span.mud-anim-tile__art', { html }), h('span.mud-anim-tile__label', {}, label)]);
  }

  function addTab() {
    const out = h('div');
    out.append(h('div.mud-anim-section-title', {}, T('lib.basics', 'Text & blocks')), h('div.mud-anim-tiles', {}, [
      tile(T('lib.heading', 'Heading'), '<b style="font-size:20px">Aa</b>', () => place('text', { text: 'Big bold headline', fontSize: 64, fontWeight: 800, width: 760, height: 80 }, 'Heading')),
      tile(T('lib.paragraph', 'Paragraph'), '<span style="font-size:12px;line-height:1.1">Lorem ipsum dolor sit</span>', () => place('text', { text: 'A short paragraph of supporting text that wraps over a few lines.', fontSize: 24, fontWeight: 400, lineHeight: 1.4, width: 560, height: 110 }, 'Paragraph')),
      tile(T('lib.counter', 'Number'), '<b style="font-size:18px">1,250</b>', () => {
        const l = place('text', { text: '0', fontSize: 96, fontWeight: 800, width: 360, height: 110 }, 'Number');
        S.commit(T('history.addClip', 'Add animation'), () => l.clips.push(createClip('counter', { name: 'Count up', start: Math.round(S.time * 20) / 20, duration: 2, params: { from: 0, to: 1250, decimals: 0, separator: true, prefix: '', suffix: '' } })));
      }),
      tile(T('lib.button', 'Button'), '<span style="padding:3px 8px;border-radius:999px;background:currentColor"><span style="color:var(--mud-palette-surface,#fff);font-size:11px">Go</span></span>', () => place('html', { html: '<a href="#" style="display:flex;align-items:center;justify-content:center;height:100%;border-radius:999px;background:#6366f1;color:#fff;font:600 18px/1 Inter,system-ui,sans-serif;text-decoration:none">Call to action</a>', width: 240, height: 56 }, 'Button')),
      tile(T('lib.html', 'HTML'), icon('anim-html', 22), () => place('html', {}, 'HTML block')),
      tile(T('lib.group', 'Group'), icon('folder', 22), () => place('group', {}, 'Group')),
    ]));

    out.append(h('div.mud-anim-section-title', {}, T('lib.shapes', 'Shapes (morphable)')), h('div.mud-anim-tiles.is-small', {}, SHAPES.filter(([k]) => k !== 'custom').map(([k, label]) => {
      const open = k === 'line' || k === 'wave';
      const d = shapePath(k, 36, 36, { corner: 6, points: k === 'polygon' ? 6 : k === 'burst' ? 14 : 5, innerRadius: k === 'burst' ? 0.7 : 0.45 });
      return tile(T(`shape.${k}`, label), `<svg viewBox="-2 -2 40 40" width="30" height="30"><path d="${d}" fill="${open ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="${open ? 3 : 0}" stroke-linecap="round"/></svg>`,
        () => place('shape', { shape: k, ...(open ? { stroke: '#ffffff', strokeWidth: 6, fill: '', height: 80, width: 320 } : {}), ...(k === 'polygon' ? { points: 6 } : {}), ...(k === 'burst' ? { points: 16, innerRadius: 0.72 } : {}) }, label));
    })));

    // icons
    const iconGrid = h('div.mud-anim-tiles.is-icons', {}, ICON_NAMES.filter((n) => S.deps.hasIcon?.(n) ?? true).map((n) => h('button.mud-anim-iconbtn', { type: 'button', title: n, 'aria-label': n, onclick: () => place('icon', { icon: n }, `Icon ${n}`), html: icon(n, 20) })));
    out.append(h('details.mud-anim-section', {}, [h('summary.mud-anim-section__title', {}, h('span', {}, T('lib.icons', 'Icons (drawable strokes)'))), iconGrid]));

    out.append(h('div.mud-anim-section-title', {}, T('lib.media', 'Media')), h('div.mud-anim-tiles', {}, [
      tile(T('lib.image', 'Image'), icon('image', 22), () => pickFiles('image/*')),
      tile(T('lib.svg', 'SVG'), icon('anim-draw', 22), () => pickFiles('.svg,image/svg+xml')),
      tile(T('lib.video', 'Video'), icon('anim-video', 22), () => pickFiles('video/*')),
      tile(T('lib.audio', 'Audio'), icon('anim-audio', 22), () => pickFiles('audio/*')),
      tile(T('lib.url', 'From URL'), icon('globe', 22), () => fromUrl()),
      tile(T('lib.pasteSvg', 'Paste SVG'), icon('code', 22), () => pasteSvg()),
    ]));

    out.append(h('div.mud-anim-section-title', {}, T('lib.canvas', 'Canvas effects')), h('div.mud-anim-tiles', {}, CANVAS_EFFECTS.map(([k, label]) =>
      tile(T(`canvas.${k}`, label), icon('anim-canvas', 20), () => place('canvas', { effect: k, x: 0, y: 0, width: S.scene.views[0].width, height: S.scene.views[0].height, ...(k === 'confetti' ? { count: 120, size: 5 } : k === 'stars' ? { count: 160, size: 1.6 } : k === 'waves' ? { count: 60, color: '#38bdf8', color2: '#6366f1' } : {}) }, label)))));
    return out;
  }

  // ───── files & assets ─────
  function pickFiles(accept) {
    const input = h('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
    input.addEventListener('change', () => { addFiles([...input.files]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  }

  async function uploadOrInline(file) {
    if (S.opts.uploadAsset) {
      try { const url = await S.opts.uploadAsset(file); if (url) return { src: String(url) }; } catch (e) { S.toast(T('toast.upload', 'Upload failed: {msg}', { msg: e.message }), 'error'); }
    }
    if (S.opts.uploadUrl) {
      try {
        const form = new FormData(); form.append('file', file);
        const res = await fetch(S.opts.uploadUrl, { method: 'POST', body: form, credentials: 'same-origin' });
        if (res.ok) { const json = await res.json(); const url = json.url ?? json.data?.url ?? json.location; if (url) return { src: url }; }
        S.toast(T('toast.uploadStatus', 'Upload failed ({status}); the file stays in the scene.', { status: res.status }), 'warning');
      } catch (e) { S.toast(T('toast.upload', 'Upload failed: {msg}', { msg: e.message }), 'error'); }
    }
    if (file.size > MAX_INLINE) {
      S.toast(T('toast.big', '"{name}" is large: it plays in this session only. Configure an upload URL to keep it in saved scenes.', { name: file.name }), 'warning');
      return { src: URL.createObjectURL(file), sessionOnly: true };
    }
    return { src: await readAsDataUrl(file) };
  }

  async function addFiles(files, at = null) {
    const added = [];
    for (const file of files) {
      const kind = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name) ? 'svg' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null;
      if (!kind) { S.toast(T('toast.type', '"{name}" is not an image, SVG, video or audio file', { name: file.name }), 'warning'); continue; }
      const asset = createAsset(kind, { name: file.name, size: file.size, mime: file.type });
      if (kind === 'svg') asset.svg = await readAsText(file);
      else Object.assign(asset, await uploadOrInline(file));
      const size = kind === 'image' ? await imageSize(asset.src) : kind === 'video' ? { width: 480, height: 270 } : kind === 'svg' ? svgSize(asset.svg) : { width: 64, height: 64 };
      const fit = fitInto(size, S.view.width * 0.6, S.view.height * 0.6);
      added.push({ asset, kind, fit });
    }
    if (!added.length) return;
    const ids = [];
    S.commit(T('history.addMedia', 'Add media'), (s) => {
      for (const [i, { asset, kind, fit }] of added.entries()) {
        s.assets.push(asset);
        const props = { assetId: asset.id, width: fit.width, height: fit.height };
        if (at) { props.x = Math.round(at.x - fit.width / 2 + i * 20); props.y = Math.round(at.y - fit.height / 2 + i * 20); }
        const layer = createLayer(kind, props, { name: asset.name.replace(/\.[^.]+$/, ''), view: S.view });
        addLayer(s, layer);
        ids.push(layer.id);
      }
    });
    S.select(ids);
  }
  S.addFiles = addFiles;

  function fromUrl() {
    const url = h('input.mud-anim-input', { type: 'url', placeholder: 'https://…/image.jpg' });
    const kind = h('select.mud-anim-input', {}, [['image', 'Image'], ['video', 'Video'], ['audio', 'Audio'], ['svg', 'SVG file']].map(([v, l]) => h('option', { value: v }, l)));
    const dlg = modal(T('lib.url', 'From URL'), [row(T('lib.urlField', 'Address'), url, { wide: true }), row(T('lib.kind', 'Kind'), kind)], {
      actions: [button(T('lib.addIt', 'Add'), async () => {
        const src = url.value.trim();
        if (!src) return;
        dlg.close();
        const k = kind.value;
        const asset = createAsset(k === 'svg' ? 'image' : k, { name: src.split('/').pop() || src, src });
        const size = k === 'image' || k === 'svg' ? await imageSize(src) : { width: 480, height: 270 };
        const fit = fitInto(size, S.view.width * 0.6, S.view.height * 0.6);
        let id;
        S.commit(T('history.addMedia', 'Add media'), (s) => { s.assets.push(asset); const l = createLayer(asset.kind, { assetId: asset.id, ...fit }, { name: asset.name, view: S.view }); addLayer(s, l); id = l.id; });
        S.select([id]);
      }, { variant: 'primary' })],
    });
  }

  function pasteSvg() {
    const ta = h('textarea.mud-anim-input.mud-anim-textarea', { rows: 10, placeholder: '<svg viewBox="0 0 100 100">…</svg>', spellcheck: false });
    const dlg = modal(T('lib.pasteSvg', 'Paste SVG'), [ta, h('p.mud-anim-note', {}, T('lib.svgHint', 'Inline SVG keeps its parts: draw them on, stagger them, morph its paths. Scripts and event attributes are removed.'))], {
      actions: [button(T('lib.addIt', 'Add'), () => {
        const markup = ta.value.trim();
        if (!/<svg[\s>]/i.test(markup)) { S.toast(T('toast.notSvg', 'That is not SVG markup'), 'warning'); return; }
        dlg.close();
        const asset = createAsset('svg', { name: 'Pasted SVG', svg: markup });
        const fit = fitInto(svgSize(markup), S.view.width * 0.5, S.view.height * 0.5);
        let id;
        S.commit(T('history.addMedia', 'Add media'), (s) => { s.assets.push(asset); const l = createLayer('svg', { assetId: asset.id, ...fit }, { name: 'SVG', view: S.view }); addLayer(s, l); id = l.id; });
        S.select([id]);
      }, { variant: 'primary' })],
    });
  }

  function assetsTab() {
    const assets = S.scene.assets;
    const out = h('div');
    const drop = h('div.mud-anim-dropzone', { tabIndex: 0, role: 'button', onclick: () => pickFiles('image/*,video/*,audio/*,.svg') }, [h('span', { html: icon('upload', 22) }), h('span', {}, T('lib.drop', 'Drop images, SVG, video or audio here, or click to choose'))]);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('is-over'); addFiles([...e.dataTransfer.files]); });
    out.append(drop);
    if (!assets.length) { out.append(h('p.mud-anim-note', {}, T('lib.noAssets', 'No assets yet.'))); return out; }
    const used = (id) => S.scene.layers.filter((l) => l.props.assetId === id).length;
    out.append(h('div.mud-anim-assets', {}, assets.map((a) => {
      const thumb = a.kind === 'image' ? `<img src="${esc(a.src)}" alt="">` : a.kind === 'svg' ? icon('anim-draw', 24) : a.kind === 'video' ? icon('anim-video', 24) : icon('anim-audio', 24);
      return h('div.mud-anim-asset', {}, [
        h('button.mud-anim-asset__thumb', { type: 'button', title: T('lib.useAsset', 'Add to the stage'), html: thumb, onclick: () => {
          const fit = { width: 320, height: a.kind === 'audio' ? 64 : 200 };
          place(a.kind, { assetId: a.id, ...fit }, a.name.replace(/\.[^.]+$/, ''));
        } }),
        h('div.mud-anim-asset__meta', {}, [h('span.mud-anim-asset__name', { title: a.name }, a.name), h('span.mud-anim-asset__info', {}, `${a.kind}${a.size ? ` · ${(a.size / 1024).toFixed(0)} KB` : ''} · ${T('lib.usedBy', 'used {n}×', { n: used(a.id) })}`)]),
        iconButton(icon('anim-trash', 14), T('lib.deleteAsset', 'Delete asset'), () => {
          if (used(a.id) && !confirm(T('lib.deleteUsed', '{n} layer(s) use this asset. Delete it anyway?', { n: used(a.id) }))) return;
          S.commit(T('history.deleteAsset', 'Delete asset'), (s) => { s.assets = s.assets.filter((x) => x.id !== a.id); });
          render();
        }),
      ]);
    })));
    return out;
  }

  // ───── Layers (tree, drag to reorder / into groups) ─────
  function layersTab() {
    const tree = h('div.mud-anim-tree', { role: 'tree', 'aria-label': T('lib.layers', 'Layers') });
    const walk = (parentId, depth) => {
      for (const l of S.scene.layers.filter((x) => (x.parentId ?? null) === parentId).reverse()) {
        const selected = S.selection.layers.includes(l.id);
        const item = h(`div.mud-anim-tree__item${selected ? '.is-selected' : ''}${l.hidden ? '.is-hidden' : ''}`, {
          role: 'treeitem', 'aria-selected': String(selected), draggable: true, tabIndex: 0, dataset: { id: l.id },
          style: { paddingInlineStart: `${6 + depth * 16}px` },
        }, [
          h('span.mud-anim-tree__icon', { html: icon({ group: 'folder', shape: 'anim-shapes', text: 'type', image: 'image', svg: 'anim-draw', icon: 'star', video: 'anim-video', audio: 'anim-audio', html: 'anim-html', canvas: 'anim-canvas' }[l.kind] ?? 'square', 14) }),
          h('span.mud-anim-tree__name', {}, l.name),
          l.clips.length ? h('span.mud-anim-tree__count', { title: T('lib.clipsCount', '{n} animation(s)', { n: l.clips.length }) }, String(l.clips.length)) : null,
          iconButton(icon(l.hidden ? 'eyeOff' : 'eye', 13), l.hidden ? T('tl.show', 'Show') : T('tl.hide', 'Hide'), (e) => { e.stopPropagation(); S.commit(T('history.visibility', 'Visibility'), () => { l.hidden = !l.hidden; }); }),
          iconButton(icon(l.locked ? 'anim-lock' : 'anim-unlock', 13), l.locked ? T('tl.unlock', 'Unlock') : T('tl.lock', 'Lock'), (e) => { e.stopPropagation(); S.commit(T('history.lock', 'Lock'), () => { l.locked = !l.locked; }); }, { cls: l.locked ? '' : 'is-faint' }),
        ]);
        item.addEventListener('click', (e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) { const set = new Set(S.selection.layers); if (set.has(l.id)) set.delete(l.id); else set.add(l.id); S.select([...set]); }
          else S.select([l.id]);
        });
        item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.select([l.id]); } });
        item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-mud-layer', l.id); e.dataTransfer.effectAllowed = 'move'; });
        item.addEventListener('dragover', (e) => {
          if (![...e.dataTransfer.types].includes('text/x-mud-layer')) return;
          e.preventDefault();
          const r = item.getBoundingClientRect();
          const into = l.kind === 'group' && e.clientY > r.top + r.height * 0.3 && e.clientY < r.bottom - r.height * 0.3;
          item.dataset.drop = into ? 'into' : e.clientY < r.top + r.height / 2 ? 'above' : 'below';
        });
        item.addEventListener('dragleave', () => { delete item.dataset.drop; });
        item.addEventListener('drop', (e) => {
          const id = e.dataTransfer.getData('text/x-mud-layer');
          const where = item.dataset.drop; delete item.dataset.drop;
          if (!id || id === l.id || descendantIds(S.scene, id).includes(l.id)) return;
          e.preventDefault();
          S.commit(T('history.reorder', 'Reorder'), (s) => {
            const moving = findLayer(s, id);
            const oldParent = moving.parentId;
            if (where === 'into') reparentLayer(s, id, l.id, { into: true });
            else if (where === 'above') reparentLayer(s, id, l.id); // above in the list = later in the array
            else {
              // below in the list: just under the target = right before it in the array
              const ids = [id, ...descendantIds(s, id)];
              const block = s.layers.filter((x) => ids.includes(x.id));
              s.layers = s.layers.filter((x) => !ids.includes(x.id));
              block[0].parentId = l.parentId;
              s.layers.splice(s.layers.findIndex((x) => x.id === l.id), 0, ...block);
            }
            // keep it in place on the stage when it changes group
            if (moving.parentId !== oldParent) {
              const off = (pid) => { let x = 0; let y = 0; let p = pid ? findLayer(s, pid) : null; while (p) { x += p.props.x; y += p.props.y; p = p.parentId ? findLayer(s, p.parentId) : null; } return { x, y }; };
              const a = off(oldParent); const b = off(moving.parentId);
              moving.props.x += a.x - b.x; moving.props.y += a.y - b.y;
            }
          });
        });
        tree.append(item);
        if (l.kind === 'group') walk(l.id, depth + 1);
      }
    };
    walk(null, 0);
    if (!S.scene.layers.length) tree.append(h('p.mud-anim-note', {}, T('lib.noLayers', 'No layers yet: add some from the Add tab.')));
    return h('div', {}, [tree, h('p.mud-anim-note', {}, T('lib.treeHint', 'Drag to reorder. Drop onto the middle of a group to put a layer inside it. Shift-click to select several.'))]);
  }

  const offs = [S.on('change', () => { if (tab !== 'add') render(); }), S.on('select', () => { if (tab === 'layers') render(); }), S.on('scene', render)];
  render();
  return { render, dispose() { offs.forEach((o) => o()); delete S.addFiles; } };
}

function imageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = src;
  });
}

function svgSize(markup) {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(markup);
  if (vb) return { width: +vb[1], height: +vb[2] };
  const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(markup); const hh = /\sheight\s*=\s*["']([\d.]+)/i.exec(markup);
  return { width: w ? +w[1] : 200, height: hh ? +hh[1] : 200 };
}

function fitInto({ width, height }, maxW, maxH) {
  const k = Math.min(1, maxW / width, maxH / height);
  return { width: Math.round(width * k), height: Math.round(height * k) };
}
