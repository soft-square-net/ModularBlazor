// MudTail Animator: renders a scene's layers as DOM for one view. The Studio and the player both use it; the timeline
// (timeline.js) then animates the elements it returns.
//
//   <div class="mud-anim-stage" style="width:1280px;height:720px">       the design-size stage (scaled to fit outside)
//     <div class="mud-anim-layer" data-layer-id="…" data-kind="shape">  absolutely placed at x / y / width / height
//       <svg …><path class="mud-anim-shape" d="…"/></svg>                 kind-specific content
//     </div>
//   </div>

import { resolveLayerProps, getView, childrenOf } from './scene.js';
import { shapePath, isOpenShape } from './shapes.js';
import { sanitizeHtml, sanitizeSvg, isSafeUrl } from './sanitize.js';
import { createCanvasEffect } from './canvas-effects.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The asset a layer uses: { src, svg } from scene.assets by assetId, else the layer's own src / svg. */
export function layerSource(scene, props) {
  const asset = props.assetId ? scene.assets.find((a) => a.id === props.assetId) : null;
  return { src: asset?.src || props.src || '', svg: asset?.svg || props.svg || '', asset };
}

/**
 * Renders the scene into `stage` (emptied first) for a view.
 * deps: { gsap, getIconSvg, studio } — studio=true shows hidden-in-player helpers (audio badges) and never autoplays media.
 * Returns { view, nodes: Map<layerId, { el, layer, props, path?, svg?, media?, canvas? }>, dispose() }.
 */
export function renderScene(stage, scene, viewId, deps = {}) {
  const { gsap, studio = false } = deps;
  const view = getView(scene, viewId);
  stage.replaceChildren();
  stage.classList.add('mud-anim-stage');
  stage.dataset.view = view.id;
  stage.style.width = `${view.width}px`;
  stage.style.height = `${view.height}px`;
  stage.style.background = scene.settings.background || 'transparent';

  const nodes = new Map();
  const canvases = [];

  const build = (parentId, container) => {
    for (const layer of childrenOf(scene, parentId)) {
      const props = resolveLayerProps(scene, layer, view.id);
      const el = document.createElement('div');
      el.className = 'mud-anim-layer';
      el.dataset.layerId = layer.id;
      el.dataset.kind = layer.kind;
      if (layer.name) el.setAttribute('aria-label', layer.name);
      const node = { el, layer, props };
      applyBox(el, props);
      if (layer.hidden || props.hidden) el.style.display = 'none';
      renderContent(node, scene, deps);
      if (node.canvas) canvases.push(node.canvas);
      container.appendChild(el);
      nodes.set(layer.id, node);
      if (gsap) gsap.set(el, baseTransform(props));
      if (layer.kind === 'group') build(layer.id, el);
    }
  };
  build(null, stage);
  if (studio) for (const c of canvases) c.render(0);

  return {
    view,
    nodes,
    dispose() {
      for (const c of canvases) c.dispose();
      for (const n of nodes.values()) if (n.media) { try { n.media.pause(); } catch { /* ignore */ } }
      stage.replaceChildren();
    },
  };
}

/** The transform part of a layer's props, as GSAP vars (GSAP owns transforms so tweens compose with them). */
export function baseTransform(props) {
  return {
    rotation: props.rotation ?? 0,
    scaleX: props.scaleX ?? 1,
    scaleY: props.scaleY ?? 1,
    skewX: props.skewX ?? 0,
    opacity: props.opacity ?? 1,
    transformOrigin: `${props.originX ?? 50}% ${props.originY ?? 50}%`,
    x: 0,
    y: 0,
  };
}

/** Box and look styles (everything but transforms) for a layer element. */
export function applyBox(el, props) {
  const s = el.style;
  s.left = `${props.x}px`;
  s.top = `${props.y}px`;
  s.width = `${props.width}px`;
  s.height = `${props.height}px`;
  s.mixBlendMode = props.blendMode && props.blendMode !== 'normal' ? props.blendMode : '';
  s.boxShadow = props.shadow || '';
  s.filter = props.blur ? `blur(${props.blur}px)` : '';
  s.borderRadius = props.radius ? `${props.radius}px` : '';
  s.background = props.background || '';
  s.overflow = props.overflow && props.overflow !== 'visible' ? props.overflow : '';
  s.cursor = props.cursor || '';
  s.zIndex = props.zIndex ?? '';
}

function renderContent(node, scene, deps) {
  const { el, layer, props } = node;
  switch (layer.kind) {
    case 'shape': {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${props.width} ${props.height}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.overflow = 'visible';
      svg.style.display = 'block';
      const path = document.createElementNS(SVG_NS, 'path');
      path.classList.add('mud-anim-shape');
      path.setAttribute('d', shapePath(props.shape, props.width, props.height, props));
      let fill = props.fill || 'none';
      if (props.fill2 && props.fill) {
        const id = `g-${layer.id}`;
        const defs = document.createElementNS(SVG_NS, 'defs');
        const grad = document.createElementNS(SVG_NS, 'linearGradient');
        grad.id = id;
        const a = ((props.gradientAngle ?? 135) * Math.PI) / 180;
        grad.setAttribute('x1', `${50 - Math.cos(a) * 50}%`); grad.setAttribute('y1', `${50 - Math.sin(a) * 50}%`);
        grad.setAttribute('x2', `${50 + Math.cos(a) * 50}%`); grad.setAttribute('y2', `${50 + Math.sin(a) * 50}%`);
        for (const [offset, color] of [['0%', props.fill], ['100%', props.fill2]]) {
          const stop = document.createElementNS(SVG_NS, 'stop');
          stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color);
          grad.appendChild(stop);
        }
        defs.appendChild(grad);
        svg.appendChild(defs);
        fill = `url(#${id})`;
      }
      path.setAttribute('fill', isOpenShape(props.shape) ? 'none' : fill);
      const stroke = props.stroke || (isOpenShape(props.shape) ? props.fill || '#fff' : '');
      if (stroke) {
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', String(props.strokeWidth || (isOpenShape(props.shape) ? 4 : 0)));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
      }
      svg.appendChild(path);
      el.appendChild(svg);
      node.svg = svg;
      node.path = path;
      break;
    }
    case 'text': {
      const box = document.createElement('div');
      box.className = 'mud-anim-text';
      box.textContent = props.text ?? '';
      const s = box.style;
      s.fontFamily = props.fontFamily; s.fontSize = `${props.fontSize}px`; s.fontWeight = String(props.fontWeight);
      s.fontStyle = props.italic ? 'italic' : ''; s.color = props.color; s.textAlign = props.align;
      s.lineHeight = String(props.lineHeight); s.letterSpacing = props.letterSpacing ? `${props.letterSpacing}px` : '';
      s.textShadow = props.textShadow || '';
      s.textTransform = props.transform || '';
      if (props.gradient) {
        s.backgroundImage = props.gradient; s.backgroundClip = 'text'; s.webkitBackgroundClip = 'text'; s.color = 'transparent';
      }
      el.appendChild(box);
      node.text = box;
      break;
    }
    case 'image': {
      const { src } = layerSource(scene, props);
      const img = document.createElement('img');
      if (src && isSafeUrl(src)) img.src = src;
      img.alt = props.alt ?? '';
      img.draggable = false;
      img.style.objectFit = props.fit || 'cover';
      img.className = 'mud-anim-media';
      el.appendChild(img);
      node.img = img;
      break;
    }
    case 'svg': {
      const { svg: markup, src } = layerSource(scene, props);
      let svg = markup ? sanitizeSvg(markup) : null;
      if (svg) {
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 100 100');
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
        if (props.fill) for (const p of svg.querySelectorAll('path,circle,rect,ellipse,polygon')) p.setAttribute('fill', props.fill);
        if (props.stroke) for (const p of svg.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,line')) p.setAttribute('stroke', props.stroke);
        el.appendChild(svg);
        node.svg = svg;
      } else if (src && isSafeUrl(src)) {
        const img = document.createElement('img');
        img.src = src; img.alt = ''; img.draggable = false; img.className = 'mud-anim-media'; img.style.objectFit = 'contain';
        el.appendChild(img);
        svg = null;
      }
      break;
    }
    case 'icon': {
      const markup = deps.getIconSvg ? deps.getIconSvg(props.icon, Math.min(props.width, props.height)) : '';
      const svg = markup && sanitizeSvg(markup);
      if (svg) {
        svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
        svg.setAttribute('stroke-width', String(props.strokeWidth ?? 2));
        if (props.iconFill) svg.setAttribute('fill', props.iconFill);
        svg.style.display = 'block';
        el.appendChild(svg);
        node.svg = svg;
      }
      el.style.color = props.color;
      break;
    }
    case 'video': {
      const { src } = layerSource(scene, props);
      const video = document.createElement('video');
      if (src && isSafeUrl(src)) video.src = src;
      video.muted = props.muted !== false;
      video.loop = !!props.loop;
      video.playsInline = true;
      video.preload = 'auto';
      video.className = 'mud-anim-media';
      video.style.objectFit = props.fit || 'cover';
      if (props.poster && isSafeUrl(props.poster)) video.poster = props.poster;
      if (props.autoplay && !deps.studio) video.autoplay = true;
      el.appendChild(video);
      node.media = video;
      break;
    }
    case 'audio': {
      const { src } = layerSource(scene, props);
      const audio = document.createElement('audio');
      if (src && isSafeUrl(src)) audio.src = src;
      audio.loop = !!props.loop;
      audio.preload = 'auto';
      audio.volume = Math.max(0, Math.min(1, props.volume ?? 1));
      el.appendChild(audio);
      if (deps.studio) {
        el.classList.add('mud-anim-audio');
        el.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>');
      } else el.style.display = 'none';
      node.media = audio;
      break;
    }
    case 'html': {
      el.classList.add('mud-anim-html');
      el.appendChild(sanitizeHtml(props.html));
      break;
    }
    case 'canvas': {
      const canvas = document.createElement('canvas');
      canvas.className = 'mud-anim-canvas';
      el.appendChild(canvas);
      node.canvas = createCanvasEffect(canvas, props, deps.gsap);
      break;
    }
    default:
      break;
  }
}

/**
 * Fits a design-size stage into its frame: contain (letterbox), cover (crop) or width (fill the width, keep the ratio).
 * Returns the scale.
 */
export function fitStage(stage, frame, view, fit = 'contain') {
  const fw = frame.clientWidth || view.width;
  const fh = frame.clientHeight || view.height;
  const sx = fw / view.width;
  const sy = fh / view.height;
  const scale = fit === 'cover' ? Math.max(sx, sy) : fit === 'width' ? sx : Math.min(sx, sy);
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate(${(fw - view.width * scale) / 2}px, ${fit === 'width' ? 0 : (fh - view.height * scale) / 2}px) scale(${scale})`;
  return scale;
}
