// MudTail Animator: canvas layers. Each effect draws a frame as a pure function of time, so the Studio can scrub it
// on the timeline and the player can run it live; its parameters (count, speed, size, colours) are tweenable by
// 'canvas' clips like any other property.

export const CANVAS_EFFECTS = Object.freeze([
  ['particles', 'Particle network'], ['confetti', 'Confetti'], ['snow', 'Snow'], ['stars', 'Starfield'], ['bubbles', 'Bubbles'],
  ['rain', 'Rain'], ['waves', 'Waves'], ['fireworks', 'Fireworks'], ['aurora', 'Aurora'], ['grid', 'Perspective grid'],
]);

/** Parameters a canvas clip may tween. */
export const CANVAS_PARAMS = Object.freeze(['count', 'speed', 'size', 'color', 'color2', 'opacity', 'spread']);

// deterministic pseudo-random in [0, 1) for particle i, channel c
const rnd = (i, c = 0) => { const x = Math.sin(i * 127.1 + c * 311.7) * 43758.5453; return x - Math.floor(x); };
const PALETTE = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#facc15'];

const effects = {
  particles(g, w, h, t, p) {
    const n = Math.round(p.count); const pts = [];
    for (let i = 0; i < n; i++) {
      const x = ((rnd(i) * w + Math.sin(t * 0.3 * p.speed + i) * 40 + t * 12 * p.speed * (rnd(i, 3) - 0.5)) % w + w) % w;
      const y = ((rnd(i, 1) * h + Math.cos(t * 0.25 * p.speed + i * 1.3) * 40 + t * 10 * p.speed * (rnd(i, 4) - 0.5)) % h + h) % h;
      pts.push([x, y]);
    }
    const link = Math.min(w, h) * 0.16 * (p.spread ?? 1);
    g.strokeStyle = p.color2; g.lineWidth = 1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < link) { g.globalAlpha = (1 - d / link) * 0.6 * p.opacity; g.beginPath(); g.moveTo(...pts[i]); g.lineTo(...pts[j]); g.stroke(); }
    }
    g.globalAlpha = p.opacity; g.fillStyle = p.color;
    for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, p.size, 0, Math.PI * 2); g.fill(); }
  },
  confetti(g, w, h, t, p) {
    const n = Math.round(p.count);
    for (let i = 0; i < n; i++) {
      const fall = (rnd(i, 1) * 0.6 + 0.4) * 140 * p.speed;
      const y = ((rnd(i, 2) * (h + 40) + t * fall) % (h + 40)) - 20;
      const x = rnd(i) * w + Math.sin(t * 2 * (rnd(i, 3) + 0.5) + i) * 30 * (p.spread ?? 1);
      const a = t * 4 * (rnd(i, 4) - 0.5) + i;
      g.save(); g.translate(x, y); g.rotate(a); g.scale(1, Math.cos(t * 5 + i));
      g.globalAlpha = p.opacity; g.fillStyle = PALETTE[i % PALETTE.length];
      g.fillRect(-p.size * 1.5, -p.size, p.size * 3, p.size * 2); g.restore();
    }
  },
  snow(g, w, h, t, p) {
    const n = Math.round(p.count); g.fillStyle = p.color;
    for (let i = 0; i < n; i++) {
      const depth = rnd(i, 1) * 0.8 + 0.2;
      const y = ((rnd(i, 2) * h + t * 40 * depth * p.speed) % (h + 10)) - 5;
      const x = rnd(i) * w + Math.sin(t * depth + i) * 25 * (p.spread ?? 1);
      g.globalAlpha = depth * p.opacity; g.beginPath(); g.arc(x, y, p.size * depth, 0, Math.PI * 2); g.fill();
    }
  },
  stars(g, w, h, t, p) {
    const n = Math.round(p.count); const cx = w / 2; const cy = h / 2;
    for (let i = 0; i < n; i++) {
      const z = ((rnd(i, 2) - t * 0.08 * p.speed) % 1 + 1) % 1 || 1;
      const x = cx + ((rnd(i) - 0.5) * w) / z * 0.5; const y = cy + ((rnd(i, 1) - 0.5) * h) / z * 0.5;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      g.globalAlpha = Math.min(1, (1 - z) * 1.4) * p.opacity * (0.6 + 0.4 * Math.sin(t * 3 + i));
      g.fillStyle = i % 7 ? p.color : p.color2; g.beginPath(); g.arc(x, y, p.size * (1 - z) * 1.2 + 0.3, 0, Math.PI * 2); g.fill();
    }
  },
  bubbles(g, w, h, t, p) {
    const n = Math.round(p.count); g.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const r = p.size * (1 + rnd(i, 1) * 4);
      const y = h + r - ((rnd(i, 2) * (h + 2 * r) + t * 50 * p.speed * (0.4 + rnd(i, 3))) % (h + 2 * r));
      const x = rnd(i) * w + Math.sin(t * 1.5 + i) * 18 * (p.spread ?? 1);
      g.globalAlpha = 0.7 * p.opacity; g.strokeStyle = i % 2 ? p.color : p.color2;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
  },
  rain(g, w, h, t, p) {
    const n = Math.round(p.count); g.strokeStyle = p.color; g.lineWidth = Math.max(1, p.size / 2);
    for (let i = 0; i < n; i++) {
      const len = 10 + rnd(i, 1) * 20; const v = 500 * p.speed * (0.6 + rnd(i, 3) * 0.4);
      const y = ((rnd(i, 2) * (h + len) + t * v) % (h + len)) - len; const x = rnd(i) * w + y * 0.15;
      g.globalAlpha = 0.5 * p.opacity; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.15, y + len); g.stroke();
    }
  },
  waves(g, w, h, t, p) {
    const layers = Math.max(1, Math.round(p.count / 20)) || 3;
    for (let l = 0; l < layers; l++) {
      const base = h * (0.5 + (l / layers) * 0.35); const amp = (h * 0.06 + l * 6) * (p.spread ?? 1);
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, base + Math.sin(x * 0.01 * (1 + l * 0.3) + t * p.speed * (1 + l * 0.4)) * amp);
      g.lineTo(w, h); g.closePath(); g.globalAlpha = (0.25 + 0.15 * l) * p.opacity; g.fillStyle = l % 2 ? p.color2 : p.color; g.fill();
    }
  },
  fireworks(g, w, h, t, p) {
    const bursts = Math.max(1, Math.round(p.count / 20)); const period = 2.2 / Math.max(0.1, p.speed);
    for (let b = 0; b < bursts; b++) {
      const cycle = Math.floor((t + b * period / bursts) / period); const local = ((t + b * period / bursts) % period) / period;
      const cx = w * (0.15 + rnd(cycle * 7 + b, 1) * 0.7); const cy = h * (0.15 + rnd(cycle * 7 + b, 2) * 0.4);
      const sparks = 36; const color = PALETTE[(cycle + b) % PALETTE.length];
      for (let s = 0; s < sparks; s++) {
        const a = (s / sparks) * Math.PI * 2; const dist = Math.sqrt(local) * Math.min(w, h) * 0.22 * (p.spread ?? 1);
        g.globalAlpha = (1 - local) * p.opacity; g.fillStyle = color;
        g.beginPath(); g.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist + local * local * 40, p.size * (1 - local * 0.6), 0, Math.PI * 2); g.fill();
      }
    }
  },
  aurora(g, w, h, t, p) {
    const bands = 4;
    for (let b = 0; b < bands; b++) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'transparent'); grad.addColorStop(0.5, b % 2 ? p.color : p.color2); grad.addColorStop(1, 'transparent');
      g.globalAlpha = 0.22 * p.opacity; g.fillStyle = grad; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 10) g.lineTo(x, h * 0.35 + Math.sin(x * 0.004 * (b + 1) + t * 0.4 * p.speed + b) * h * 0.18 * (p.spread ?? 1) + b * 18);
      g.lineTo(w, h); g.closePath(); g.fill();
    }
  },
  grid(g, w, h, t, p) {
    const horizon = h * 0.45; const lines = Math.max(6, Math.round(p.count / 4)); g.strokeStyle = p.color; g.lineWidth = 1;
    g.globalAlpha = 0.7 * p.opacity;
    for (let i = -lines; i <= lines; i++) { g.beginPath(); g.moveTo(w / 2 + i * 6, horizon); g.lineTo(w / 2 + i * (w / lines), h); g.stroke(); }
    for (let i = 0; i < lines; i++) {
      const z = ((i / lines + t * 0.15 * p.speed) % 1); const y = horizon + (h - horizon) * z * z;
      g.globalAlpha = z * p.opacity; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  },
};

/**
 * A canvas effect bound to a <canvas>: render(t) draws the frame at time t (seconds); params are live and tweenable;
 * live() runs it on GSAP's ticker (the player), stop() ends that.
 */
export function createCanvasEffect(canvas, props, gsap) {
  const params = {
    effect: props.effect ?? 'particles', count: props.count ?? 80, speed: props.speed ?? 1, size: props.size ?? 3,
    color: props.color ?? '#ffffff', color2: props.color2 ?? '#6366f1', opacity: props.opacity2 ?? 1, spread: props.spread ?? 1,
  };
  const g = canvas.getContext('2d');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const width = Math.max(1, Math.round(props.width)); const height = Math.max(1, Math.round(props.height));
  canvas.width = width * dpr; canvas.height = height * dpr;
  let time = 0; let ticker = null;
  const render = (t = time) => {
    time = t;
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, width, height); g.globalAlpha = 1;
    (effects[params.effect] ?? effects.particles)(g, width, height, t, params);
  };
  return {
    params,
    render,
    get time() { return time; },
    live() {
      if (ticker || !gsap) return;
      const start = gsap.ticker.time - time;
      ticker = () => render(gsap.ticker.time - start);
      gsap.ticker.add(ticker);
    },
    stop() { if (ticker) { gsap.ticker.remove(ticker); ticker = null; } },
    dispose() { this.stop(); },
  };
}
