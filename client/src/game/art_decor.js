// Seni dekorasi lingkungan (volcanic camp & dungeon) — digambar sepenuhnya dengan Canvas 2D.
// (x,y) = titik tengah dasar di tanah; objek memanjang ke atas. Decal datar dipusatkan di (x,y).
// Bagian statis dirender sekali ke canvas offscreen (cache modul, skala 2x); hanya bagian animasi
// (api, lava, kain, percikan, kilau) yang digambar tiap frame dengan gradien "lighter".
import { hex, mix, lighten, darken, rng, pat, rr, lin, rad, shape, ell, stroke, limb, ease, clamp, OUT } from "./art.js";

export const DECOR_TYPES = [
  "campfire", "tent", "crate", "barrel", "sacks", "anvil", "rack", "lamp", "banner", "bones",
  "statue", "pillar", "stalagmite", "chest", "signpost", "gate", "portal", "camp_portal",
  "rune", "crack", "scorch", "lavapool", "vent",
];

// ============================================================ util
const TAU = Math.PI * 2;
const PI = Math.PI;
const sin = Math.sin;
const cos = Math.cos;
const K = 0.6; // pemipihan lingkaran di tanah (sudut pandang 3/4)

const RGB = {
  lava: "223,62,35", org: "255,137,51", yel: "255,211,107", hot: "255,240,190",
  teal: "45,212,191", gold: "255,196,70",
};
const ROCK = ["#4a3640", "#3a2630", "#5a3f46"];

function hashXY(x, y) {
  let h = (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return h || 1;
}
function seedOf(d) {
  if (d.seed != null) {
    if (typeof d.seed === "number") return (Math.abs(Math.floor(d.seed)) >>> 0) || 1;
    let h = 2166136261;
    const s = String(d.seed);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) || 1;
  }
  return hashXY(d.x || 0, d.y || 0);
}
const fr = (n) => n - Math.floor(n);

// ---------- tekstur lokal (kayu, batu) ----------
const myTexCv = {};
const myPatCache = new WeakMap();
function buildMy(kind) {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const r = rng(kind === "wood" ? 777 : 4242);
  if (kind === "wood") {
    for (let i = 0; i < 46; i++) {
      const x = r() * S;
      g.fillStyle = r() < 0.55 ? `rgba(0,0,0,${0.08 + r() * 0.2})` : `rgba(255,220,180,${0.04 + r() * 0.1})`;
      g.fillRect(x, r() * S, 1 + (r() < 0.2 ? 1 : 0), 14 + r() * 40);
    }
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(r() * S, r() * S, 2 + r() * 2, 1.2 + r(), 0, 0, TAU);
      g.stroke();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(0,0,0,${0.15 * r()})`;
      g.fillRect(r() * S, r() * S, 1, 1);
    }
  } else {
    for (let i = 0; i < 520; i++) {
      g.fillStyle = r() < 0.55 ? `rgba(0,0,0,${0.35 * r()})` : `rgba(255,225,215,${0.2 * r()})`;
      const s = 1 + r() * 2.2;
      g.fillRect(r() * S, r() * S, s, s * (0.6 + r() * 0.6));
    }
    g.strokeStyle = "rgba(0,0,0,0.3)";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = r() * S, y = r() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 14; y += (r() - 0.3) * 12; g.lineTo(x, y); }
      g.stroke();
    }
  }
  return c;
}
function tpat(ctx, kind) {
  let m = myPatCache.get(ctx);
  if (!m) myPatCache.set(ctx, (m = {}));
  if (!m[kind]) {
    if (!myTexCv[kind]) myTexCv[kind] = buildMy(kind);
    m[kind] = ctx.createPattern(myTexCv[kind], "repeat");
  }
  return m[kind];
}
function sh(ctx, fn, fill, tex, ta, line, lw) {
  ctx.beginPath();
  fn(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  if (tex) {
    ctx.save();
    ctx.globalAlpha = ta === undefined ? 0.3 : ta;
    ctx.fillStyle = tex === "wood" || tex === "stone" ? tpat(ctx, tex) : pat(ctx, tex);
    ctx.fill();
    ctx.restore();
  }
  if (line !== false) {
    ctx.lineWidth = lw || 1.4;
    ctx.strokeStyle = line || OUT;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}
const el = (c, x, y, rx, ry, fill, tex, ta, line, lw, rot = 0) =>
  sh(c, (g) => g.ellipse(x, y, rx, ry, rot, 0, TAU), fill, tex, ta, line, lw);
function poly(g, p) {
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
}
const P = (c, p, fill, tex, ta, line, lw) => sh(c, (g) => poly(g, p), fill, tex, ta, line, lw);

// ---------- sprite glow & bayangan ----------
const glowCache = {};
function glowSprite(col) {
  if (glowCache[col]) return glowCache[col];
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${col},1)`);
  gr.addColorStop(0.25, `rgba(${col},0.55)`);
  gr.addColorStop(0.55, `rgba(${col},0.18)`);
  gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return (glowCache[col] = c);
}
function glow(c, x, y, rx, ry, col, a) {
  if (!(a > 0.004)) return;
  const po = c.globalCompositeOperation;
  const pa = c.globalAlpha;
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = Math.min(1, a);
  c.drawImage(glowSprite(col), x - rx, y - ry, rx * 2, ry * 2);
  c.globalCompositeOperation = po;
  c.globalAlpha = pa;
}
let shadowSp = null;
function shadow(c, x, y, rx, ry, a = 0.5) {
  if (!shadowSp) {
    shadowSp = document.createElement("canvas");
    shadowSp.width = shadowSp.height = 64;
    const g = shadowSp.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,0.85)");
    gr.addColorStop(0.55, "rgba(0,0,0,0.5)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const pa = c.globalAlpha;
  c.globalAlpha = pa * a;
  c.drawImage(shadowSp, x - rx, y - ry, rx * 2, ry * 2);
  c.globalAlpha = pa;
}

// ---------- api & percikan ----------
const FL = [["#b02a1c", 1], ["#df3e23", 0.9], ["#ff8933", 0.68], ["#ffc656", 0.44], ["#fff0b8", 0.24]];
function flame(c, x, y, w, h, now, ph) {
  const t = now * 0.001;
  for (let L = 0; L < FL.length; L++) {
    const s = FL[L][1];
    const n = L < 2 ? 5 : 3;
    c.fillStyle = FL[L][0];
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = ph + i * 1.9 + L * 0.5;
      const fl = 0.7 + 0.3 * sin(t * (8 + i * 1.7) + p) + 0.08 * sin(t * 17 + i * 2.3 + p);
      const th = h * s * (1 - Math.abs(u) * 0.42) * fl;
      const bx = x + u * w * 0.3 * s;
      const bw = w * 0.2 * s + w * 0.05;
      const sw = sin(t * 5.2 + p) * w * 0.1 * s + u * w * 0.05;
      c.moveTo(bx - bw, y);
      c.quadraticCurveTo(bx - bw * 1.05, y - th * 0.55, bx + sw, y - th);
      c.quadraticCurveTo(bx + bw * 1.05, y - th * 0.5, bx + bw, y);
      c.closePath();
    }
    c.fill();
  }
}
function sparks(c, x, y, now, seed, n, spread, rise, period, col, size = 1.8) {
  const po = c.globalCompositeOperation;
  const pa = c.globalAlpha;
  c.globalCompositeOperation = "lighter";
  const sp = (seed % 97) / 97;
  for (let i = 0; i < n; i++) {
    const k = fr(now / period + i / n + sp + i * 0.137);
    const px = x + sin(i * 12.9898 + seed) * spread * (0.25 + k) + sin(now * 0.004 + i) * 4 * k;
    const py = y - rise * k * (0.7 + ((i * 7) % 5) / 12);
    c.globalAlpha = (1 - k) * (1 - k) * 0.95;
    c.fillStyle = i % 3 ? `rgb(${col})` : "rgb(255,236,170)";
    const s = size * (1 - k * 0.6) + 0.4;
    c.fillRect(px - s / 2, py - s / 2, s, s);
  }
  c.globalCompositeOperation = po;
  c.globalAlpha = pa;
}

// ---------- batu, tulang, glyph ----------
function rock(c, x, y, rx, ry, r, tone = 0) {
  const n = 7;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.4;
    pts.push(x + cos(a) * rx * (0.8 + r() * 0.3), y + sin(a) * ry * (0.8 + r() * 0.3));
  }
  const col = ROCK[tone % 3];
  sh(c, (g) => poly(g, pts), lin(c, x, y - ry, x, y + ry, [lighten(col, 0.22), col, darken(col, 0.4)]), "stone", 0.4);
  c.strokeStyle = "rgba(255,190,160,0.14)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pts[10], pts[11]);
  c.lineTo(pts[12], pts[13]);
  c.lineTo(pts[0], pts[1]);
  c.stroke();
}
function bone(c, x1, y1, x2, y2, w, col = "#d9cfb4") {
  limb(c, x1, y1, x2, y2, w, col);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = -sin(a) * w * 0.55;
  const ny = cos(a) * w * 0.55;
  for (const [px, py] of [[x1, y1], [x2, y2]]) {
    for (const sgn of [-1, 1]) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(px + nx * sgn, py + ny * sgn, w * 0.55, 0, TAU);
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 1;
      c.stroke();
    }
  }
  stroke(c, x1, y1, x2, y2, w * 0.45, "rgba(255,255,255,0.35)");
}
function skull(c, x, y, s, col = "#e0d6bb", tilt = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(s, s);
  sh(c, (g) => rr(g, -5, 2, 10, 5.5, 2), darken(col, 0.12), "bone", 0.4, OUT, 1);
  el(c, 0, -1.5, 7.2, 6.8, lin(c, 0, -8, 0, 5, [lighten(col, 0.2), col, darken(col, 0.18)]), "bone", 0.4, OUT, 1);
  c.fillStyle = "#0e0810";
  c.beginPath(); c.ellipse(-2.8, -1, 1.9, 2.1, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(2.8, -1, 1.9, 2.1, 0, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(0, 1.4); c.lineTo(-1, 3.4); c.lineTo(1, 3.4); c.fill();
  c.strokeStyle = "rgba(40,28,20,0.7)";
  c.lineWidth = 0.7;
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 1.6, 4.2); c.lineTo(i * 1.6, 7); c.stroke(); }
  c.restore();
}
function glyphPath(x, y, s, r) {
  const p = new Path2D();
  const gp = [];
  for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) gp.push([x + gx * s, y + gy * s * 1.25]);
  let a = (r() * 9) | 0;
  p.moveTo(gp[a][0], gp[a][1]);
  const n = 2 + ((r() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const b = (r() * 9) | 0;
    if (b !== a) { p.lineTo(gp[b][0], gp[b][1]); a = b; }
  }
  if (r() < 0.45) { const q = (r() * 9) | 0; p.moveTo(gp[q][0] + 1.4, gp[q][1]); p.arc(gp[q][0], gp[q][1], 1.4, 0, TAU); }
  return p;
}
function pen(c, mode, lw) {
  c.lineCap = c.lineJoin = "round";
  if (mode === "groove") { c.strokeStyle = "rgba(8,4,8,0.85)"; c.lineWidth = lw + 1.4; }
  else { c.strokeStyle = "rgb(255,150,60)"; c.lineWidth = lw; }
}
function glowStroke(c, mode, paths, lw) {
  if (mode === "groove") { pen(c, mode, lw); paths.forEach((p) => c.stroke(p)); return; }
  c.lineCap = c.lineJoin = "round";
  c.strokeStyle = "rgba(223,62,35,0.45)"; c.lineWidth = lw + 3.4;
  paths.forEach((p) => c.stroke(p));
  c.strokeStyle = "rgb(255,137,51)"; c.lineWidth = lw + 0.4;
  paths.forEach((p) => c.stroke(p));
  c.strokeStyle = "rgb(255,222,150)"; c.lineWidth = Math.max(0.6, lw * 0.4);
  paths.forEach((p) => c.stroke(p));
}
function crackLine(r, x0, y0, len, ang, steps, jit) {
  const pts = [[x0, y0]];
  let x = x0, y = y0;
  for (let i = 0; i < steps; i++) {
    const a = ang + (r() - 0.5) * jit;
    x += cos(a) * (len / steps) * (0.7 + r() * 0.6);
    y += sin(a) * (len / steps) * (0.7 + r() * 0.6);
    pts.push([x, y]);
  }
  return pts;
}
function polyPath(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
}
const wobble = (now, seed, sp = 1) => 0.5 + 0.5 * sin(now * 0.003 * sp + (seed % 628) / 100);

// ---------- palet pusaran ----------
const PAL = {
  lava: { core: "255,244,200", mid: "255,137,51", edge: "223,62,35", dark: "66,36,44", glow: RGB.org, deep: RGB.lava },
  teal: { core: "225,255,250", mid: "45,212,191", edge: "14,130,120", dark: "10,38,46", glow: RGB.teal, deep: "20,150,150" },
};
const swirlCache = {};
function swirl(pk) {
  if (swirlCache[pk]) return swirlCache[pk];
  const pal = PAL[pk];
  const S = 256, h = 128;
  const base = document.createElement("canvas");
  base.width = base.height = S;
  let g = base.getContext("2d");
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, `rgb(${pal.core})`);
  gr.addColorStop(0.16, `rgb(${pal.mid})`);
  gr.addColorStop(0.5, `rgb(${pal.edge})`);
  gr.addColorStop(0.88, `rgb(${pal.dark})`);
  gr.addColorStop(1, `rgb(${pal.dark})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const arms = document.createElement("canvas");
  arms.width = arms.height = S;
  g = arms.getContext("2d");
  const r = rng(pk === "teal" ? 99 : 33);
  const N = 5;
  for (let a = 0; a < N; a++) {
    for (let rr_ = 5; rr_ < 124; rr_ += 1.6) {
      const ang = (a * TAU) / N + rr_ * 0.062 + sin(rr_ * 0.2 + a) * 0.05;
      const w = 1.3 + (rr_ / 124) * 5.5;
      const al = sin((rr_ / 124) * PI) * 0.5 + 0.08;
      const x = h + cos(ang) * rr_, y = h + sin(ang) * rr_;
      g.fillStyle = `rgba(${pal.mid},${al * 0.8})`;
      g.beginPath(); g.arc(x, y, w, 0, TAU); g.fill();
      g.fillStyle = `rgba(${pal.core},${al * 0.9})`;
      g.beginPath(); g.arc(x, y, w * 0.4, 0, TAU); g.fill();
    }
  }
  for (let i = 0; i < 30; i++) {
    const a = r() * TAU, d = 20 + r() * 95;
    g.fillStyle = `rgba(${pal.core},${0.25 + r() * 0.4})`;
    g.beginPath(); g.arc(h + cos(a) * d, h + sin(a) * d, 1 + r() * 2, 0, TAU); g.fill();
  }
  return (swirlCache[pk] = { base, arms });
}
let colSp = null;
function columnSprite() {
  if (colSp) return colSp;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const g = c.getContext("2d");
  const v = g.createLinearGradient(0, 128, 0, 0);
  v.addColorStop(0, "rgba(255,255,255,0.9)");
  v.addColorStop(0.5, "rgba(255,255,255,0.35)");
  v.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = "destination-in";
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, "rgba(0,0,0,0)"); h.addColorStop(0.5, "rgba(0,0,0,1)"); h.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = h; g.fillRect(0, 0, 64, 128);
  return (colSp = c);
}
const tintCache = {};
function tintedColumn(col) {
  if (tintCache[col]) return tintCache[col];
  const src = columnSprite();
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = `rgb(${col})`; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(src, 0, 0);
  return (tintCache[col] = c);
}

// ---------- komponen bersama ----------
function patch(c, x, y, w, h, ang, col, r) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  sh(c, (g) => rr(g, -w / 2, -h / 2, w, h, 1.5), col, "cloth", 0.5, "rgba(14,10,22,0.7)", 1);
  c.setLineDash([2, 2]);
  c.strokeStyle = "rgba(20,10,10,0.55)";
  c.lineWidth = 0.8;
  c.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
  c.restore();
}
function plank(c, x, y, w, h, base) {
  sh(c, (g) => rr(g, x, y, w, h, 2), lin(c, x, y, x, y + h, [lighten(base, 0.12), base, darken(base, 0.25)]), "wood", 0.55, OUT, 1.2);
}
function nail(c, x, y) {
  c.fillStyle = "#1a1016"; c.beginPath(); c.arc(x, y, 1.2, 0, TAU); c.fill();
  c.fillStyle = "rgba(255,255,255,0.4)"; c.fillRect(x - 0.6, y - 0.8, 0.8, 0.8);
}
function brazierBody(c, x, r) {
  shadow(c, x, 4, 30, 8, 0.55);
  P(c, [x - 15, 0, x + 15, 0, x + 10, -44, x - 10, -44], lin(c, x - 15, 0, x + 15, 0, ["#3a2630", "#2b1c24", "#1a1016"]), "stone", 0.5);
  sh(c, (g) => rr(g, x - 20, -7, 40, 9, 2), lin(c, 0, -7, 0, 2, ["#523540", "#2b1c24"]), "stone", 0.4);
  sh(c, (g) => { g.moveTo(x - 23, -56); g.quadraticCurveTo(x - 22, -42, x - 9, -40); g.lineTo(x + 9, -40); g.quadraticCurveTo(x + 22, -42, x + 23, -56); g.closePath(); },
    lin(c, x - 23, 0, x + 23, 0, ["#3b3541", "#5b5463", "#2a2530"]), "metal", 0.5);
  el(c, x, -56, 23, 7, "#1a1016", null, 0, OUT, 1.4);
  el(c, x, -55, 19, 5, "#2a0f0c", "rust", 0.5, false);
  for (let i = -1; i <= 1; i++) stroke(c, x + i * 14, -50, x + i * 12, -43, 2, "rgba(223,62,35,0.5)");
}

// ============================================================ DEFINISI
const DEF = {};

// ---------------------------------------------------------- campfire
const campStones = (sk) => {
  const r = rng(sk * 31 + 7);
  const a = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * TAU + 0.2;
    a.push({ x: cos(ang) * 38, y: -2 + sin(ang) * 18, rx: 8 + r() * 3.5, ry: 6 + r() * 2.5, t: (r() * 3) | 0, rs: (r() * 1e6) | 0 });
  }
  return a;
};
DEF.campfire = {
  box: () => [-72, -96, 72, 34],
  size: () => ({ w: 90, h: 70 }),
  under(c, d, now) {
    const f = 0.85 + 0.15 * sin(now * 0.013 + (d._s % 50)) + 0.05 * sin(now * 0.037);
    glow(c, 0, 0, 150, 90, RGB.org, 0.38 * f);
    glow(c, 0, -2, 70, 34, RGB.yel, 0.35 * f);
  },
  stat(c, r, d, sk) {
    el(c, 0, 2, 52, 24, "rgba(10,6,8,0.5)");
    shadow(c, 0, 4, 58, 20, 0.6);
    for (const s of campStones(sk)) if (s.y < 0) { rock(c, s.x, s.y, s.rx, s.ry, rng(s.rs), s.t); }
    el(c, 0, -2, 32, 14, "#1a0f10", "stone", 0.6, false);
    el(c, 0, -2, 26, 10, "#2a1512", "rust", 0.5, false);
    // kayu bakar bersilang
    const logs = [[-26, 2, 22, -9], [26, 3, -22, -8], [-14, -8, 18, 4]];
    logs.forEach(([x1, y1, x2, y2], i) => {
      const w = i === 2 ? 8 : 9;
      limb(c, x1, y1, x2, y2, w, "#4a2c24");
      stroke(c, x1, y1 - 2, x2, y2 - 2, w * 0.4, "rgba(150,90,70,0.35)");
      for (const [ex, ey] of [[x1, y1], [x2, y2]]) {
        el(c, ex, ey, w * 0.5, w * 0.5, "#2a1812", null, 0, OUT, 1);
        el(c, ex, ey, w * 0.28, w * 0.28, "#6a4032", null, 0, false);
      }
    });
    c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-20 + r() * 40, -6 + r() * 8); c.lineTo(-18 + r() * 40, -4 + r() * 8); c.stroke(); }
  },
  glow(c, r) {
    el(c, 0, -3, 22, 8, "rgba(255,110,40,0.55)", null, 0, false);
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(255,${150 + (r() * 90) | 0},60,${0.4 + r() * 0.5})`; c.fillRect(-24 + r() * 48, -9 + r() * 14, 1.6, 1.4); }
    c.strokeStyle = "rgba(255,150,60,0.9)"; c.lineWidth = 1.4; c.lineCap = "round";
    for (const [x1, y1, x2, y2] of [[-26, 2, -16, -1], [26, 3, 16, 0], [-14, -8, -6, -5]]) { c.beginPath(); c.moveTo(x1, y1 - 1); c.lineTo(x2, y2 - 1); c.stroke(); }
  },
  ga: (now, d) => 0.6 + 0.4 * wobble(now, d._s, 4),
  dyn(c, d, now) {
    const s = d._s;
    const f = 0.9 + 0.1 * sin(now * 0.017 + s);
    c.save();
    c.translate(0, -3);
    flame(c, 0, 0, 46, 62 * f, now, s);
    c.restore();
    glow(c, 0, -26, 54, 54, RGB.org, 0.5 * f);
    glow(c, 0, -16, 30, 30, RGB.yel, 0.35 * f);
    sparks(c, 0, -28, now, s, 14, 22, 78, 1700, RGB.org, 2);
    // asap tipis
    const pa = c.globalAlpha;
    for (let i = 0; i < 3; i++) {
      const k = fr(now / 3200 + i / 3 + (s % 13) / 13);
      c.globalAlpha = pa * 0.14 * sin(k * PI);
      c.fillStyle = "#1c1216";
      c.beginPath(); c.arc(sin(k * 6 + i) * 8, -60 - k * 46, 6 + k * 12, 0, TAU); c.fill();
    }
    c.globalAlpha = pa;
  },
  front(c, r, d, sk) {
    for (const s of campStones(sk)) if (s.y >= 0) rock(c, s.x, s.y + 1, s.rx + 0.5, s.ry + 1, rng(s.rs), s.t);
  },
  light: (d, now) => ({ r: 300 * (0.94 + 0.06 * sin(now * 0.013 + d._s) + 0.03 * sin(now * 0.037)), s: 0.9 }),
};

// ---------------------------------------------------------- tent
DEF.tent = {
  box: () => [-96, -128, 96, 34],
  size: () => ({ w: 136, h: 106 }),
  stat(c, r, d, sk) {
    const v = (d.variant | 0) % 3;
    shadow(c, 0, 4, 82, 16, 0.6);
    // tali & pasak
    const rope = (x1, y1, x2, y2) => {
      stroke(c, x1, y1, x2, y2, 1.4, "#2a1a14");
      stroke(c, x2, y2, x2 + (x2 > 0 ? 3 : -3), y2 + 5, 3, "#523540");
    };
    if (v === 0) {
      const L = -68, R = 68;
      rope(-52, -52, -84, 6); rope(52, -52, 84, 6);
      sh(c, (g) => { g.moveTo(L, -2); g.quadraticCurveTo(L + 16, -54, -3, -100); g.lineTo(3, -100); g.quadraticCurveTo(R - 16, -54, R, -2); g.quadraticCurveTo(0, 8, L, -2); g.closePath(); },
        lin(c, L, 0, R, 0, ["#96493a", "#7a3f38", "#5c2e32", "#42242c"]), "cloth", 0.5);
      c.save();
      c.beginPath(); c.moveTo(L, -2); c.quadraticCurveTo(L + 16, -54, -3, -100); c.lineTo(3, -100); c.quadraticCurveTo(R - 16, -54, R, -2); c.quadraticCurveTo(0, 8, L, -2); c.clip();
      c.strokeStyle = "rgba(20,8,10,0.4)"; c.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.7, -100); c.quadraticCurveTo(i * 12, -50, i * 17, 4); c.stroke(); }
      patch(c, -40, -26, 20, 16, -0.5, "#8b5a3a", r);
      patch(c, 38, -50, 16, 20, 0.3, "#5a3f46", r);
      patch(c, 30, -18, 22, 13, 0.15, "#9a4b32", r);
      patch(c, -18, -62, 15, 12, -0.2, "#6a3a30", r);
      // gelap di sisi kanan
      c.fillStyle = "rgba(10,4,8,0.22)"; c.beginPath(); c.moveTo(3, -100); c.lineTo(R, -2); c.lineTo(20, 0); c.closePath(); c.fill();
      c.restore();
      // pintu
      sh(c, (g) => { g.moveTo(-21, -1); g.lineTo(-2, -68); g.lineTo(2, -68); g.lineTo(21, -1); g.closePath(); }, lin(c, 0, -68, 0, 0, ["#0d070a", "#1a0f12", "#2a1512"]), null, 0, OUT, 1.6);
      el(c, 0, -5, 11, 3, "#4a2428", "cloth", 0.5, false);
      // kain pintu tersibak
      for (const sg of [-1, 1]) {
        sh(c, (g) => { g.moveTo(sg * 2, -70); g.quadraticCurveTo(sg * 22, -40, sg * 36, 0); g.lineTo(sg * 20, 0); g.quadraticCurveTo(sg * 12, -34, sg * 1, -62); g.closePath(); },
          lin(c, 0, -70, sg * 36, 0, ["#a04c3a", "#7a3f38"]), "cloth", 0.5, OUT, 1.3);
        stroke(c, sg * 28, -16, sg * 38, -8, 2, "#2a1a14");
      }
      stroke(c, 0, -100, 0, -116, 3, "#3a2218");
      sh(c, (g) => { g.moveTo(0, -116); g.quadraticCurveTo(12, -112, 20, -118); g.lineTo(14, -111); g.lineTo(21, -106); g.quadraticCurveTo(10, -110, 0, -106); g.closePath(); }, "#df3e23", "cloth", 0.4);
    } else if (v === 1) {
      rope(-50, -46, -82, 4); rope(50, -46, 82, 4);
      const body = (g) => { g.moveTo(-64, -2); g.quadraticCurveTo(-52, -66, -6, -94); g.lineTo(8, -94); g.quadraticCurveTo(54, -66, 64, -2); g.quadraticCurveTo(0, 10, -64, -2); g.closePath(); };
      sh(c, body, lin(c, -64, 0, 64, 0, ["#8a5a3e", "#744432", "#5a3329", "#3f2420"]), "leather", 0.7);
      c.save();
      c.beginPath(); body(c); c.clip();
      for (let i = 0; i <= 8; i++) {
        const bx = -64 + i * 16;
        c.strokeStyle = "rgba(20,8,8,0.5)"; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(1, -94); c.quadraticCurveTo(bx * 0.75, -50, bx, 3); c.stroke();
        if (i < 8 && i % 2) { c.fillStyle = "rgba(255,200,150,0.07)"; c.beginPath(); c.moveTo(1, -94); c.quadraticCurveTo(bx * 0.75, -50, bx, 3); c.lineTo(bx + 16, 3); c.quadraticCurveTo((bx + 16) * 0.75, -50, 1, -94); c.fill(); }
      }
      patch(c, 34, -30, 18, 16, 0.4, "#733e39", r);
      patch(c, -30, -40, 15, 14, -0.3, "#4a3640", r);
      c.restore();
      sh(c, (g) => { g.moveTo(0, -64); g.quadraticCurveTo(-20, -30, -15, -1); g.lineTo(15, -1); g.quadraticCurveTo(20, -30, 0, -64); g.closePath(); }, lin(c, 0, -64, 0, 0, ["#0d070a", "#1e1114"]), null, 0, OUT, 1.6);
      for (let i = 0; i < 4; i++) stroke(c, -16 + i * 1.2, -48 + i * 11, 16 - i * 1.2, -52 + i * 11, 1.8, "#2a1a14");
      limb(c, 1, -94, -14, -120, 3, "#4a2c24"); limb(c, 5, -94, 16, -122, 3, "#4a2c24"); limb(c, 3, -94, 3, -126, 3, "#4a2c24");
      el(c, -5, -112, 3, 6, "#1a1016", null, 0, OUT, 1, 0.4);
      el(c, 13, -113, 3, 5, "#df3e23", null, 0, OUT, 1, -0.4);
      skull(c, 3, -100, 0.9);
    } else {
      // lean-to besar
      stroke(c, -76, -48, -92, 6, 1.4, "#2a1a14"); stroke(c, 76, -48, 92, 6, 1.4, "#2a1a14");
      el(c, 0, -26, 66, 22, "#0d070a", null, 0, false);
      sh(c, (g) => rr(g, -64, -52, 128, 52, 3), lin(c, 0, -52, 0, 0, ["#0b0609", "#1a0f12", "#2a1512"]), null, 0, OUT, 1.4);
      // isi: gulungan tidur & peti kecil
      sh(c, (g) => rr(g, -50, -16, 44, 14, 6), "#733e39", "cloth", 0.5, OUT, 1.2);
      el(c, -50, -9, 4, 7, "#8a4a3e", "cloth", 0.5, OUT, 1);
      plank(c, 20, -22, 26, 20, "#4a2c26");
      // tiang
      for (const sx of [-68, 68]) { limb(c, sx, 2, sx + (sx > 0 ? 1 : -1) * 2, -60, 6, "#5a3329"); stroke(c, sx - 1, -4, sx - 1, -56, 1.4, "rgba(255,200,160,0.25)"); }
      // atap
      sh(c, (g) => { g.moveTo(-60, -96); g.lineTo(60, -96); g.lineTo(82, -50); g.lineTo(-82, -50); g.closePath(); }, lin(c, 0, -96, 0, -50, ["#8a4538", "#733e39"]), "cloth", 0.55);
      c.save();
      c.beginPath(); c.moveTo(-60, -96); c.lineTo(60, -96); c.lineTo(82, -50); c.lineTo(-82, -50); c.closePath(); c.clip();
      c.strokeStyle = "rgba(20,8,10,0.45)"; c.lineWidth = 1.2;
      for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 13, -96); c.lineTo(i * 18.5, -50); c.stroke(); }
      patch(c, -34, -76, 24, 16, 0.1, "#5a3f46", r);
      patch(c, 30, -68, 20, 18, -0.2, "#9a4b32", r);
      c.restore();
      // tepi atap bergerigi
      for (let i = -7; i <= 6; i++) { const x = i * 11.5 + 2; P(c, [x, -50, x + 11, -50, x + 5.5, -41 - ((i * 7) & 3)], "#6a3530", "cloth", 0.5, OUT, 1.1); }
      limb(c, -60, -96, -66, -106, 4, "#4a2c24"); limb(c, 60, -96, 66, -106, 4, "#4a2c24");
      skull(c, 0, -50, 0.8, "#cfc4a8");
      stroke(c, 0, -62, 0, -53, 1.2, "#2a1a14");
    }
  },
  glow(c, r, d) {
    const v = (d.variant | 0) % 3;
    if (v === 2) { c.fillStyle = "rgba(255,120,50,0.25)"; c.fillRect(-60, -48, 120, 46); }
  },
  ga: (now, d) => 0.6 + 0.4 * wobble(now, d._s, 3),
};

// ---------------------------------------------------------- crate / barrel / sacks
function crateBox(c, cx, base, w, h, ang = 0) {
  const x0 = cx - w / 2, x1 = cx + w / 2, t = Math.round(w * 0.28), yt = base - h;
  const wood = "#6a4030";
  c.save(); c.translate(cx, base); c.rotate(ang); c.translate(-cx, -base);
  sh(c, (g) => rr(g, x0, yt + t, w, h - t, 2), lin(c, 0, yt + t, 0, base, [lighten(wood, 0.1), wood, darken(wood, 0.28)]), "wood", 0.6, OUT, 1.5);
  for (let i = 1; i < 3; i++) { c.strokeStyle = "rgba(10,4,4,0.5)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + (w / 3) * i, yt + t); c.lineTo(x0 + (w / 3) * i, base); c.stroke(); }
  P(c, [x0 + 3, yt, x1 - 3, yt, x1, yt + t, x0, yt + t], lin(c, 0, yt, 0, yt + t, ["#8a5640", "#74472f"]), "wood", 0.6, OUT, 1.5);
  c.strokeStyle = "rgba(10,4,4,0.45)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x0 + 2, yt + t / 2); c.lineTo(x1 - 2, yt + t / 2); c.stroke();
  // pita besi X
  const ir = "#3b3541";
  stroke(c, x0 + 2, yt + t + 2, x1 - 2, base - 2, 3.4, OUT); stroke(c, x0 + 2, yt + t + 2, x1 - 2, base - 2, 2.2, ir);
  stroke(c, x1 - 2, yt + t + 2, x0 + 2, base - 2, 3.4, OUT); stroke(c, x1 - 2, yt + t + 2, x0 + 2, base - 2, 2.2, ir);
  for (const [px, py] of [[x0 + 3, yt + t + 3], [x1 - 3, yt + t + 3], [x0 + 3, base - 3], [x1 - 3, base - 3]]) { el(c, px, py, 2.4, 2.4, "#5b5463", null, 0, OUT, 1); }
  c.restore();
}
DEF.crate = {
  box: () => [-52, -90, 52, 18],
  size: (d) => ({ w: (d.variant | 0) % 3 === 2 ? 80 : 46, h: (d.variant | 0) % 3 === 1 ? 82 : 46 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    if (v === 0) { shadow(c, 0, 3, 34, 10, 0.55); crateBox(c, 0, 0, 44, 44); }
    else if (v === 1) { shadow(c, 0, 3, 36, 11, 0.55); crateBox(c, 0, 0, 46, 44); crateBox(c, 3, -39, 34, 34, 0.06); }
    else { shadow(c, 0, 3, 56, 11, 0.55); crateBox(c, -20, 0, 38, 38); crateBox(c, 22, 1, 40, 42, -0.03); }
  },
};
DEF.barrel = {
  box: () => [-40, -76, 44, 18],
  size: (d) => ((d.variant | 0) % 3 === 2 ? { w: 62, h: 36 } : { w: 38, h: 52 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    const wood = v === 1 ? "#3a2630" : "#6a4030";
    const hoop = v === 1 ? "#5b5463" : "#3b3541";
    if (v === 2) {
      shadow(c, 2, 3, 38, 9, 0.55);
      sh(c, (g) => { g.moveTo(-26, -6); g.quadraticCurveTo(-30, -20, -26, -32); g.lineTo(24, -32); g.quadraticCurveTo(29, -20, 24, -6); g.closePath(); }, lin(c, 0, -34, 0, -2, [lighten(wood, 0.12), wood, darken(wood, 0.3)]), "wood", 0.6);
      for (let i = 0; i < 5; i++) { c.strokeStyle = "rgba(10,4,4,0.4)"; c.lineWidth = 1; c.beginPath(); c.moveTo(-26, -6 - i * 6.5); c.lineTo(24, -6 - i * 6.5); c.stroke(); }
      for (const x of [-16, 14]) { sh(c, (g) => rr(g, x - 2.5, -33, 5, 28, 1.5), hoop, "metal", 0.5, OUT, 1.2); }
      el(c, 24, -19, 5, 13, "#4a2c24", "wood", 0.5, OUT, 1.4); el(c, 24, -19, 2.5, 7, "#2a1812", null, 0, false);
      el(c, -26, -19, 4, 13, "#522e24", "wood", 0.5, OUT, 1.2);
      el(c, 32, -3, 6, 2.5, "rgba(223,62,35,0.55)", null, 0, false);
      return;
    }
    shadow(c, 0, 3, 30, 9, 0.55);
    const body = (g) => { g.moveTo(-15, -3); g.quadraticCurveTo(-21, -24, -15, -46); g.lineTo(15, -46); g.quadraticCurveTo(21, -24, 15, -3); g.quadraticCurveTo(0, 3, -15, -3); g.closePath(); };
    sh(c, body, lin(c, -20, 0, 20, 0, [lighten(wood, 0.15), wood, darken(wood, 0.38)]), "wood", 0.65);
    c.save(); c.beginPath(); body(c); c.clip();
    c.strokeStyle = "rgba(10,4,4,0.45)"; c.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 5, -46); c.quadraticCurveTo(i * 7.5, -24, i * 5, -2); c.stroke(); }
    c.restore();
    for (const [y, rx] of [[-11, 17], [-34, 17.5]]) {
      sh(c, (g) => { g.ellipse(0, y, rx, 5, 0, 0, PI); g.lineTo(rx, y - 5); g.ellipse(0, y - 5, rx, 5, 0, PI, 0, true); g.closePath(); }, hoop, "metal", 0.55, OUT, 1.2);
    }
    el(c, 0, -46, 15, 5.5, v === 1 ? "#14090c" : "#5a3a2a", "wood", 0.5, OUT, 1.5);
    if (v === 0) { el(c, 0, -46, 11, 3.6, "#74472f", "wood", 0.5, false); c.strokeStyle = "rgba(10,4,4,0.4)"; c.beginPath(); c.moveTo(-10, -46); c.lineTo(10, -46); c.stroke(); }
    else { el(c, 0, -46, 12, 3.6, "#1a0805", null, 0, false); }
    if (v === 0) { sh(c, (g) => rr(g, 14, -4, 9, 6, 2), "#5a3a2a", "wood", 0.5); }
  },
  glow(c, r, d) { if ((d.variant | 0) % 3 === 1) { el(c, 0, -46, 11, 3.4, "rgba(255,120,40,0.9)", null, 0, false); } },
  ga: (now, d) => 0.55 + 0.45 * wobble(now, d._s, 5),
  dyn(c, d, now) { if ((d.variant | 0) % 3 === 1) { glow(c, 0, -50, 24, 18, RGB.org, 0.3 + 0.2 * wobble(now, d._s, 5)); sparks(c, 0, -48, now, d._s, 3, 6, 22, 2200, RGB.org, 1.4); } },
};
function sack(c, x, y, w, h, col, r, lean = 0) {
  c.save(); c.translate(x, y); c.rotate(lean);
  sh(c, (g) => {
    g.moveTo(-w / 2, 0);
    g.bezierCurveTo(-w * 0.62, -h * 0.35, -w * 0.4, -h * 0.75, -4, -h * 0.9);
    g.lineTo(4, -h * 0.9);
    g.bezierCurveTo(w * 0.4, -h * 0.75, w * 0.62, -h * 0.35, w / 2, 0);
    g.quadraticCurveTo(0, 5, -w / 2, 0); g.closePath();
  }, lin(c, -w / 2, 0, w / 2, 0, [lighten(col, 0.12), col, darken(col, 0.3)]), "cloth", 0.7);
  c.strokeStyle = "rgba(30,18,10,0.4)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-w * 0.2, -h * 0.85); c.quadraticCurveTo(-w * 0.3, -h * 0.4, -w * 0.15, -2); c.stroke();
  c.beginPath(); c.moveTo(w * 0.22, -h * 0.8); c.quadraticCurveTo(w * 0.34, -h * 0.4, w * 0.2, -3); c.stroke();
  // ikatan
  sh(c, (g) => rr(g, -6, -h * 0.92, 12, 4, 2), "#4a2c24", "leather", 0.6, OUT, 1);
  P(c, [-6, -h * 0.92, -10, -h * 1.08, -3, -h * 0.98], col, "cloth", 0.6, OUT, 1);
  P(c, [6, -h * 0.92, 11, -h * 1.05, 3, -h * 0.98], col, "cloth", 0.6, OUT, 1);
  if (r() < 0.6) { stroke(c, -4, -h * 0.45, 4, -h * 0.25, 1.6, "rgba(40,20,14,0.6)"); stroke(c, 4, -h * 0.45, -4, -h * 0.25, 1.6, "rgba(40,20,14,0.6)"); }
  c.restore();
}
DEF.sacks = {
  box: () => [-56, -66, 56, 16],
  size: () => ({ w: 64, h: 44 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    shadow(c, 0, 3, 52, 11, 0.55);
    if (v === 0) { sack(c, -20, 0, 32, 34, "#8a6a46", r, -0.05); sack(c, 14, 1, 34, 36, "#7a5c3c", r, 0.05); sack(c, -2, -22, 30, 32, "#9a7a52", r, 0.02); }
    else if (v === 1) {
      sack(c, -16, 0, 34, 38, "#8a6a46", r, -0.08);
      el(c, 24, -1, 20, 7, "#a8843e", "cloth", 0.4, OUT, 1);
      sh(c, (g) => { g.moveTo(5, -1); g.quadraticCurveTo(12, -17, 24, -17); g.quadraticCurveTo(36, -17, 42, -1); g.closePath(); }, lin(c, 0, -17, 0, 0, ["#d6b25a", "#a8843e"]), "cloth", 0.5, OUT, 1);
      for (let i = 0; i < 24; i++) { c.fillStyle = r() < 0.5 ? "#e8c76a" : "#8a6a2e"; c.fillRect(8 + r() * 32, -14 + r() * 12, 1.6, 1.6); }
    } else { sack(c, 0, 0, 40, 44, "#6e5238", r, -0.12); sack(c, 26, 2, 24, 22, "#9a7a52", r, 0.4); }
  },
};

// ---------------------------------------------------------- anvil
DEF.anvil = {
  box: () => [-56, -72, 56, 18],
  size: () => ({ w: 70, h: 56 }),
  stat(c, r) {
    shadow(c, 0, 3, 40, 10, 0.55);
    // tunggul
    sh(c, (g) => { g.moveTo(-22, 0); g.lineTo(-20, -24); g.lineTo(20, -24); g.lineTo(22, 0); g.quadraticCurveTo(0, 6, -22, 0); g.closePath(); }, lin(c, -22, 0, 22, 0, ["#7a4c36", "#5a3329", "#3f2420"]), "wood", 0.65);
    for (let i = 0; i < 3; i++) { c.strokeStyle = "rgba(10,4,4,0.35)"; c.beginPath(); c.moveTo(-15 + i * 15, -24); c.lineTo(-17 + i * 17, -1); c.stroke(); }
    el(c, 0, -24, 20, 6, "#8a5a3e", "wood", 0.6, OUT, 1.3);
    el(c, 0, -24, 12, 3.4, false, null, 0, "rgba(40,20,14,0.5)", 1);
    // landasan
    const fy = -26;
    sh(c, (g) => { g.moveTo(-16, fy); g.lineTo(-10, fy - 7); g.lineTo(10, fy - 7); g.lineTo(14, fy); g.closePath(); }, "#2a2530", "metal", 0.5);
    sh(c, (g) => { g.moveTo(-12, fy - 6); g.quadraticCurveTo(-12, fy - 14, -24, fy - 14); g.lineTo(-44, fy - 14); g.quadraticCurveTo(-30, fy - 18, -26, fy - 21); g.lineTo(26, fy - 21); g.lineTo(28, fy - 14); g.lineTo(14, fy - 14); g.lineTo(11, fy - 6); g.closePath(); },
      lin(c, 0, fy - 22, 0, fy - 6, ["#7a7385", "#4a4452", "#2a2530"]), "metal", 0.6);
    stroke(c, -26, fy - 20, 25, fy - 20, 1.6, "rgba(255,255,255,0.55)");
    el(c, 28, fy - 17.5, 2, 3.5, "#2a2530", null, 0, OUT, 1);
    // palu
    limb(c, 34, -4, 46, -26, 3.2, "#6a4030");
    sh(c, (g) => rr(g, 40, -34, 14, 8, 1.5), "#5b5463", "metal", 0.6, OUT, 1.2);
  },
  glow(c) {
    sh(c, (g) => rr(g, -10, -49, 20, 3.6, 1.5), "rgba(255,130,50,0.95)", null, 0, false);
    c.fillStyle = "rgba(255,220,140,0.9)"; c.fillRect(-7, -48.5, 14, 1.4);
  },
  ga: (now, d) => 0.65 + 0.35 * wobble(now, d._s, 2),
  dyn(c, d, now) {
    glow(c, 0, -48, 22, 14, RGB.org, 0.45 * (0.7 + 0.3 * wobble(now, d._s, 2)));
    const k = fr(now / 2600 + (d._s % 10) / 10);
    if (k < 0.3) sparks(c, 0, -50, now * 3, d._s, 5, 12, 20, 1500, RGB.yel, 1.5);
  },
};

// ---------------------------------------------------------- weapon rack
DEF.rack = {
  box: () => [-64, -116, 64, 18],
  size: () => ({ w: 100, h: 100 }),
  stat(c, r) {
    shadow(c, 0, 4, 56, 11, 0.55);
    const wood = "#5a3329";
    for (const sx of [-44, 44]) {
      plank(c, sx - 4, -82, 8, 80, wood);
      plank(c, sx - 10, -4, 20, 7, "#4a2c26");
    }
    // barisan belakang bar
    plank(c, -50, -76, 100, 6, "#6a4030");
    // senjata (digambar di belakang bar bawah)
    // pedang
    const blade = (x, y, ang, len) => {
      c.save(); c.translate(x, y); c.rotate(ang);
      sh(c, (g) => { g.moveTo(-3, 0); g.lineTo(-2.5, -len); g.lineTo(0, -len - 7); g.lineTo(2.5, -len); g.lineTo(3, 0); g.closePath(); }, lin(c, -3, 0, 3, 0, ["#e6e2ee", "#9a95a6", "#6a6475"]), "metal", 0.4);
      stroke(c, 0, -2, 0, -len, 0.9, "rgba(255,255,255,0.6)");
      sh(c, (g) => rr(g, -8, 0, 16, 4, 1.5), "#8a6a2e", "metal", 0.5, OUT, 1.1);
      limb(c, 0, 4, 0, 13, 3.4, "#3a2218");
      el(c, 0, 15, 3, 3, "#8a6a2e", null, 0, OUT, 1);
      c.restore();
    };
    blade(-30, -26, 0.03, 40); blade(-16, -26, -0.04, 36);
    // kapak
    limb(c, 2, -6, 3, -78, 3.4, "#6a4030");
    sh(c, (g) => { g.moveTo(3, -76); g.quadraticCurveTo(22, -86, 24, -64); g.quadraticCurveTo(14, -66, 3, -62); g.closePath(); }, lin(c, 3, 0, 24, 0, ["#7a7385", "#d0ccd8", "#6a6475"]), "metal", 0.5);
    sh(c, (g) => { g.moveTo(3, -76); g.quadraticCurveTo(-14, -84, -16, -66); g.quadraticCurveTo(-8, -66, 3, -62); g.closePath(); }, "#5b5463", "metal", 0.5);
    // tombak
    limb(c, 18, -6, 17, -104, 2.8, "#6a4030");
    P(c, [17, -112, 14, -102, 20, -102], lin(c, 14, 0, 20, 0, ["#e6e2ee", "#8a8496"]), null, 0, OUT, 1.2);
    stroke(c, 17, -103, 17, -92, 4.2, "#df3e23");
    // perisai
    ell(c, 36, -26, 12, 13, lin(c, 24, -38, 48, -14, ["#8a4538", "#733e39", "#42242c"]), "leather", 0.5, OUT, 1.5);
    el(c, 36, -26, 4.2, 4.2, "#7a7385", "metal", 0.5, OUT, 1.2);
    c.strokeStyle = "#3b3541"; c.lineWidth = 2; c.beginPath(); c.arc(36, -26, 10, 0, TAU); c.stroke();
    // bar bawah depan
    plank(c, -50, -38, 100, 6, "#6a4030");
    plank(c, -50, -18, 100, 5, "#5a3329");
    for (const nx of [-44, 44]) { nail(c, nx, -35); nail(c, nx, -73); }
  },
};

// ---------------------------------------------------------- lamp
DEF.lamp = {
  box: () => [-64, -176, 64, 28],
  size: () => ({ w: 36, h: 142 }),
  under(c, d, now) {
    const f = 0.85 + 0.15 * sin(now * 0.014 + d._s) + 0.04 * sin(now * 0.041);
    glow(c, 0, 4, 80, 32, RGB.org, 0.26 * f);
  },
  stat(c, r) {
    shadow(c, 0, 4, 24, 8, 0.55);
    sh(c, (g) => rr(g, -13, -9, 26, 12, 2), lin(c, 0, -9, 0, 3, ["#523540", "#2b1c24"]), "stone", 0.5);
    P(c, [-9, -9, 9, -9, 6, -14, -6, -14], "#3b3541", "metal", 0.5);
    limb(c, 0, -12, 0, -100, 5, "#2f2a36");
    stroke(c, -1.2, -14, -1.2, -98, 1.4, "rgba(255,255,255,0.18)");
    for (const y of [-30, -62, -90]) el(c, 0, y, 5.5, 2.4, "#4a4452", "metal", 0.5, OUT, 1.1);
    // braket melengkung
    c.strokeStyle = OUT; c.lineWidth = 4.4; c.lineCap = "round";
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, -26); c.bezierCurveTo(sg * 16, -26, sg * 16, -44, sg * 8, -48); c.stroke(); }
    c.strokeStyle = "#3b3541"; c.lineWidth = 2.4;
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, -26); c.bezierCurveTo(sg * 16, -26, sg * 16, -44, sg * 8, -48); c.stroke(); }
    // kepala lampu
    sh(c, (g) => { g.moveTo(-13, -104); g.lineTo(13, -104); g.lineTo(10, -97); g.lineTo(-10, -97); g.closePath(); }, "#3b3541", "metal", 0.6);
    el(c, 0, -104, 13, 4.4, "#14090c", null, 0, OUT, 1.2);
    el(c, 0, -104, 10, 3, "#2a0f0c", "rust", 0.4, false);
  },
  glow(c) { el(c, 0, -104, 9, 2.8, "rgba(255,130,50,0.8)", null, 0, false); },
  dyn(c, d, now) {
    const f = 0.9 + 0.1 * sin(now * 0.018 + d._s);
    flame(c, 0, -104, 18, 30 * f, now, d._s);
    glow(c, 0, -118, 44, 44, RGB.org, 0.5 * f);
    glow(c, 0, -112, 20, 20, RGB.yel, 0.35 * f);
    sparks(c, 0, -122, now, d._s, 5, 10, 40, 1800, RGB.org, 1.6);
  },
  front(c) {
    // sangkar
    c.lineCap = "round";
    for (const x of [-12, -4, 4, 12]) { const t = x * 0.6; c.strokeStyle = "rgba(14,10,22,0.8)"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x, -104); c.lineTo(t, -132); c.stroke(); c.strokeStyle = "#4a4452"; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, -104); c.lineTo(t, -132); c.stroke(); }
    el(c, 0, -132, 8, 2.6, "#3b3541", "metal", 0.5, OUT, 1.2);
    sh(c, (g) => { g.moveTo(-10, -133); g.lineTo(0, -144); g.lineTo(10, -133); g.closePath(); }, lin(c, -10, 0, 10, 0, ["#4a4452", "#2a2530"]), "metal", 0.5);
    el(c, 0, -145, 2.2, 2.2, "#5b5463", null, 0, OUT, 1);
  },
  light: (d, now) => ({ r: 200 * (0.94 + 0.06 * sin(now * 0.014 + d._s) + 0.03 * sin(now * 0.041)), s: 0.85 }),
};

// ---------------------------------------------------------- banner
DEF.banner = {
  box: () => [-56, -204, 56, 22],
  size: () => ({ w: 60, h: 190 }),
  stat(c, r) {
    shadow(c, 0, 4, 28, 9, 0.55);
    rock(c, -14, -1, 11, 7, r, 1); rock(c, 13, 0, 10, 6, r, 0); rock(c, 0, 3, 13, 7, r, 2);
    limb(c, 0, -2, 0, -176, 6.4, "#4a2c24");
    c.save(); c.globalAlpha = 0.5; stroke(c, -1.4, -6, -1.4, -172, 1.6, "rgba(255,200,160,0.5)"); c.restore();
    // palang
    limb(c, -30, -160, 30, -160, 4.2, "#5a3329");
    for (const sx of [-31, 31]) { el(c, sx, -160, 3.2, 3.2, "#3b3541", "metal", 0.5, OUT, 1.1); }
    // ujung tombak
    P(c, [0, -198, -4, -178, 4, -178], lin(c, -4, 0, 4, 0, ["#e6e2ee", "#7a7385"]), "metal", 0.4, OUT, 1.2);
    el(c, 0, -178, 5, 2.2, "#3b3541", null, 0, OUT, 1);
  },
  dyn(c, d, now) {
    const t = now * 0.0028 + (d._s % 100) * 0.1;
    const W = 25, topY = -158, len = 98, N = 9;
    const off = (u) => sin(t + u * 3.2) * 7 * u + sin(t * 1.9 + u * 6) * 2.2 * u;
    const L = [], R = [];
    for (let i = 0; i <= N; i++) { const u = i / N; const y = topY + u * len; const o = off(u); const sq = 1 - 0.1 * u * Math.abs(sin(t + u * 3.2)); L.push([-W * sq + o, y + (1 - sq) * 6]); R.push([W * sq + o, y + (1 - sq) * 6]); }
    // ujung compang-camping
    const tat = [];
    const hs = d._s;
    for (let i = 6; i >= 0; i--) { const u = i / 6; const x = -W + u * W * 2; const ub = 1; const lo = off(ub); const depth = i % 2 ? 16 + ((hs >> i) & 7) : 4 + ((hs >> (i + 3)) & 5); tat.push([x + lo + sin(t * 1.6 + i) * 2.5, topY + len + depth]); }
    const path = (g) => { g.moveTo(L[0][0], L[0][1]); for (let i = 1; i <= N; i++) g.lineTo(L[i][0], L[i][1]); for (const p of tat) g.lineTo(p[0], p[1]); for (let i = N; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath(); };
    sh(c, path, lin(c, -W, 0, W, 0, ["#a8312a", "#8a2626", "#6a1c22"]), "cloth", 0.6, OUT, 1.5);
    // lipatan
    const pa = c.globalAlpha;
    for (let k = 0; k < 4; k++) {
      c.globalAlpha = pa * 0.2;
      c.strokeStyle = k % 2 ? "#ff8070" : "#2a0a10"; c.lineWidth = 3;
      c.beginPath();
      for (let i = 0; i <= N; i++) { const x = -W + (k + 0.5) * (W * 2 / 4) * (0.82 + 0.18 * (i / N)) + off(i / N); i ? c.lineTo(x, L[i][1]) : c.moveTo(x, L[i][1]); }
      c.stroke();
    }
    c.globalAlpha = pa;
    // pita atas
    sh(c, (g) => { g.moveTo(L[0][0], L[0][1]); g.lineTo(R[0][0], R[0][1]); g.lineTo(R[1][0], R[1][1] + 1); g.lineTo(L[1][0], L[1][1] + 1); g.closePath(); }, "#a8672e", "cloth", 0.5, OUT, 1);
    // emblem tengkorak + api
    const u = 0.5, ox = off(u) , oy = topY + len * u;
    c.save();
    c.translate(ox, oy);
    c.rotate(sin(t + u * 3.2) * 0.06);
    c.save(); c.translate(0, -6); c.scale(0.55, 0.55); flame(c, 0, 4, 34, 34, now * 0.8, hs); c.restore();
    c.save(); c.translate(0, 8); skull(c, 0, 0, 1.25, "#e8dcc0"); c.restore();
    c.strokeStyle = "rgba(255,200,120,0.5)"; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 2, 20, PI * 0.1, PI * 0.9); c.stroke();
    c.restore();
    glow(c, ox, oy - 4, 22, 22, RGB.org, 0.22);
  },
};

// ---------------------------------------------------------- bones
DEF.bones = {
  box: () => [-56, -40, 56, 18],
  size: () => ({ w: 70, h: 26 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    shadow(c, 0, 2, 46, 9, 0.45);
    if (v === 0) {
      bone(c, -30, -3, 8, -9, 4.4); bone(c, -20, -12, 22, 0, 4.4);
      for (let i = 0; i < 3; i++) { c.strokeStyle = OUT; c.lineWidth = 4; c.beginPath(); c.arc(26 + i * 6, -6, 9, PI * 1.1, PI * 1.9); c.stroke(); c.strokeStyle = "#cfc4a8"; c.lineWidth = 2.4; c.stroke(); }
      skull(c, 2, -10, 1.35, "#e0d6bb", -0.2);
    } else if (v === 1) {
      stroke(c, -26, -4, 22, -4, 5, OUT); stroke(c, -26, -4, 22, -4, 3, "#cfc4a8");
      for (let i = 0; i < 6; i++) {
        const x = -20 + i * 7.5;
        c.strokeStyle = OUT; c.lineWidth = 4.2; c.beginPath(); c.moveTo(x, -4); c.quadraticCurveTo(x + 3, -22 + i * 1.2, x - 6, -22 + i * 3); c.stroke();
        c.strokeStyle = "#d9cfb4"; c.lineWidth = 2.4; c.stroke();
      }
      skull(c, 36, -5, 1.2, "#e0d6bb", 0.5); bone(c, -42, 3, -26, -2, 3.6);
    } else {
      skull(c, -22, -6, 1.1, "#d6ccb0", 0.4); bone(c, 0, -3, 22, 0, 3.8); bone(c, 8, -10, 16, 4, 3.4);
      bone(c, -8, 2, 0, 4, 3); bone(c, 30, -4, 44, -6, 3);
      for (let i = 0; i < 6; i++) el(c, -34 + r() * 78, -2 + r() * 6, 1.8, 1.2, "#cfc4a8", "bone", 0.4, OUT, 0.8);
    }
  },
};

// ---------------------------------------------------------- statue
function crackLines(c, r, x, y, w, h, n) {
  c.lineCap = c.lineJoin = "round";
  for (let i = 0; i < n; i++) {
    const pts = crackLine(r, x + r() * w, y + r() * h * 0.5, h * (0.3 + r() * 0.5), PI / 2 + (r() - 0.5) * 0.9, 4, 1.2);
    const p = polyPath(pts);
    c.strokeStyle = "rgba(8,4,8,0.75)"; c.lineWidth = 1.5; c.stroke(p);
    c.strokeStyle = "rgba(255,200,180,0.12)"; c.lineWidth = 0.7;
    c.save(); c.translate(1, 0); c.stroke(p); c.restore();
  }
}
DEF.statue = {
  box: () => [-52, -156, 52, 18],
  size: () => ({ w: 70, h: 124 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 2;
    const st = lin(c, -30, 0, 30, 0, ["#5a4450", "#4a3640", "#2b1c24"]);
    shadow(c, 0, 4, 46, 11, 0.6);
    // plinth
    sh(c, (g) => rr(g, -34, -12, 68, 14, 2), lin(c, 0, -12, 0, 2, ["#4a3640", "#2b1c24"]), "stone", 0.6);
    sh(c, (g) => { g.moveTo(-28, -12); g.lineTo(-24, -34); g.lineTo(24, -34); g.lineTo(28, -12); g.closePath(); }, st, "stone", 0.55);
    sh(c, (g) => rr(g, -30, -40, 60, 8, 2), lin(c, 0, -40, 0, -32, ["#6a4c58", "#3a2630"]), "stone", 0.55);
    c.strokeStyle = "rgba(223,62,35,0.2)"; c.lineWidth = 1; c.beginPath(); c.moveTo(-16, -20); c.lineTo(16, -20); c.stroke();
    if (v === 0) {
      // gargoyle: sayap
      for (const sg of [-1, 1]) {
        P(c, [sg * 8, -78, sg * 44, -112, sg * 38, -94, sg * 50, -86, sg * 36, -78, sg * 42, -66, sg * 20, -62], lin(c, 0, -112, 0, -62, ["#4a3640", "#2b1c24"]), "stone", 0.55);
        c.strokeStyle = "rgba(8,4,8,0.6)"; c.lineWidth = 1.2;
        for (const [ex, ey] of [[38, -94], [50, -86], [36, -78]]) { c.beginPath(); c.moveTo(sg * 10, -76); c.lineTo(sg * ex, ey); c.stroke(); }
      }
      // badan jongkok
      el(c, 0, -62, 19, 22, lin(c, -19, 0, 19, 0, ["#5a4450", "#4a3640", "#2b1c24"]), "stone", 0.55, OUT, 1.5);
      sh(c, (g) => { g.moveTo(-18, -44); g.quadraticCurveTo(-30, -44, -24, -34); g.lineTo(-10, -34); g.lineTo(-8, -46); g.closePath(); }, st, "stone", 0.5);
      sh(c, (g) => { g.moveTo(18, -44); g.quadraticCurveTo(30, -44, 24, -34); g.lineTo(10, -34); g.lineTo(8, -46); g.closePath(); }, st, "stone", 0.5);
      for (const sg of [-1, 1]) { P(c, [sg * 26, -34, sg * 30, -34, sg * 28, -39], "#2b1c24", null, 0, OUT, 1); }
      // lengan
      for (const sg of [-1, 1]) limb(c, sg * 15, -66, sg * 19, -46, 8, "#4a3640");
      // kepala
      el(c, 0, -88, 12, 11, lin(c, -12, 0, 12, 0, ["#5a4450", "#4a3640", "#2b1c24"]), "stone", 0.55, OUT, 1.5);
      for (const sg of [-1, 1]) { sh(c, (g) => { g.moveTo(sg * 7, -94); g.quadraticCurveTo(sg * 17, -100, sg * 16, -112); g.quadraticCurveTo(sg * 10, -102, sg * 4, -98); g.closePath(); }, "#3a2630", "stone", 0.5); }
      sh(c, (g) => rr(g, -7, -84, 14, 8, 3), "#3a2630", "stone", 0.5, OUT, 1);
      c.fillStyle = "#e8dcc0"; for (const x of [-4, -1.3, 1.3, 4]) { c.fillRect(x - 0.5, -78, 1, 2); }
      c.fillStyle = "#0e0810"; c.beginPath(); c.ellipse(-4.4, -90, 2.2, 1.6, 0.3, 0, TAU); c.ellipse(4.4, -90, 2.2, 1.6, -0.3, 0, TAU); c.fill();
      // ekor
      c.strokeStyle = OUT; c.lineWidth = 6; c.beginPath(); c.moveTo(14, -48); c.bezierCurveTo(34, -44, 36, -58, 30, -64); c.stroke();
      c.strokeStyle = "#3a2630"; c.lineWidth = 4; c.stroke();
      crackLines(c, r, -16, -80, 32, 40, 3);
    } else {
      // ksatria
      sh(c, (g) => rr(g, -14, -76, 12, 36, 2), st, "stone", 0.5); sh(c, (g) => rr(g, 2, -76, 12, 36, 2), st, "stone", 0.5);
      sh(c, (g) => rr(g, -17, -46, 15, 10, 3), "#3a2630", "stone", 0.5); sh(c, (g) => rr(g, 2, -46, 15, 10, 3), "#3a2630", "stone", 0.5);
      // jubah
      sh(c, (g) => { g.moveTo(-18, -112); g.lineTo(18, -112); g.quadraticCurveTo(28, -80, 24, -46); g.lineTo(-24, -46); g.quadraticCurveTo(-28, -80, -18, -112); g.closePath(); }, lin(c, -24, 0, 24, 0, ["#3a2630", "#2b1c24", "#1a1016"]), "stone", 0.5);
      // torso
      sh(c, (g) => { g.moveTo(-16, -112); g.lineTo(16, -112); g.lineTo(13, -76); g.lineTo(-13, -76); g.closePath(); }, st, "stone", 0.55);
      c.strokeStyle = "rgba(8,4,8,0.5)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -110); c.lineTo(0, -78); c.moveTo(-12, -96); c.lineTo(12, -96); c.stroke();
      el(c, -17, -110, 8, 6, st, "stone", 0.55, OUT, 1.3); el(c, 17, -110, 8, 6, st, "stone", 0.55, OUT, 1.3);
      // pedang
      sh(c, (g) => { g.moveTo(-3, -98); g.lineTo(3, -98); g.lineTo(3.4, -40); g.lineTo(0, -34); g.lineTo(-3.4, -40); g.closePath(); }, lin(c, -3, 0, 3, 0, ["#6a5a66", "#4a3640", "#2b1c24"]), "stone", 0.5);
      sh(c, (g) => rr(g, -12, -100, 24, 5, 2), "#3a2630", "stone", 0.5); el(c, 0, -104, 3, 3, "#4a3640", null, 0, OUT, 1);
      for (const sg of [-1, 1]) limb(c, sg * 15, -108, sg * 3, -96, 7, "#4a3640");
      // helm
      el(c, 0, -122, 11, 12, lin(c, -11, 0, 11, 0, ["#5a4450", "#4a3640", "#2b1c24"]), "stone", 0.55, OUT, 1.5);
      sh(c, (g) => rr(g, -7, -124, 14, 3.2, 1), "#0e0810", null, 0, false);
      sh(c, (g) => { g.moveTo(-3, -134); g.quadraticCurveTo(0, -150, 6, -142); g.lineTo(3, -133); g.closePath(); }, "#3a2630", "stone", 0.5);
      crackLines(c, r, -14, -118, 28, 70, 3);
    }
    // serpihan
    rock(c, 30, 2, 5, 3, r, 1); rock(c, -34, 3, 4, 2.5, r, 0);
  },
  glow(c, r, d) {
    const v = (d.variant | 0) % 2;
    if (v === 0) { c.fillStyle = "rgba(255,120,40,0.95)"; c.beginPath(); c.ellipse(-4.4, -90, 2, 1.4, 0.3, 0, TAU); c.ellipse(4.4, -90, 2, 1.4, -0.3, 0, TAU); c.fill(); }
    else { c.fillStyle = "rgba(255,120,40,0.95)"; c.fillRect(-6, -123.6, 12, 1.6); }
    c.strokeStyle = "rgba(223,62,35,0.5)"; c.lineWidth = 1; c.beginPath(); c.moveTo(-16, -20); c.lineTo(16, -20); c.stroke();
  },
  ga: (now, d) => 0.55 + 0.45 * wobble(now, d._s, 2),
  dyn(c, d, now) { const v = (d.variant | 0) % 2; glow(c, 0, v === 0 ? -90 : -123, 16, 10, RGB.org, 0.35 * (0.6 + 0.4 * wobble(now, d._s, 2))); },
};

// ---------------------------------------------------------- pillar
DEF.pillar = {
  box: () => [-52, -148, 80, 18],
  size: (d) => ({ w: (d.variant | 0) % 3 === 1 ? 90 : 48, h: (d.variant | 0) % 3 === 0 ? 124 : 88 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    shadow(c, 0, 4, 40, 10, 0.6);
    const shaft = lin(c, -16, 0, 16, 0, ["#5a4450", "#4a3640", "#33222b", "#251921"]);
    const base = (g) => rr(g, -24, -12, 48, 14, 3);
    sh(c, base, lin(c, 0, -12, 0, 2, ["#5a4450", "#2b1c24"]), "stone", 0.55);
    sh(c, (g) => rr(g, -19, -20, 38, 9, 2), lin(c, 0, -20, 0, -11, ["#6a4c58", "#3a2630"]), "stone", 0.55);
    const top = v === 0 ? -100 : v === 1 ? -62 : -78;
    sh(c, (g) => {
      g.moveTo(-15, -20); g.lineTo(-15, top);
      if (v !== 0) {
        const pts = v === 1 ? [[-9, top - 7], [-3, top + 4], [3, top - 12], [9, top - 3], [15, top - 9]] : [[-12, top - 12], [-4, top - 4], [4, top - 16], [10, top - 6], [15, top + 2]];
        for (const p of pts) g.lineTo(p[0], p[1]);
      }
      g.lineTo(15, v === 0 ? top : (v === 1 ? top - 9 : top + 2)); g.lineTo(15, -20); g.closePath();
    }, shaft, "stone", 0.6);
    c.strokeStyle = "rgba(8,4,8,0.45)"; c.lineWidth = 1.2;
    for (const x of [-9, -3, 3, 9]) { c.beginPath(); c.moveTo(x, -20); c.lineTo(x, top + (v === 0 ? 0 : 6)); c.stroke(); }
    c.strokeStyle = "rgba(255,190,160,0.1)";
    for (const x of [-8, 4]) { c.beginPath(); c.moveTo(x, -20); c.lineTo(x, top + (v === 0 ? 0 : 6)); c.stroke(); }
    if (v === 0) {
      sh(c, (g) => rr(g, -19, top - 8, 38, 9, 2), lin(c, 0, top - 8, 0, top, ["#6a4c58", "#3a2630"]), "stone", 0.55);
      sh(c, (g) => rr(g, -24, top - 20, 48, 13, 3), lin(c, 0, top - 20, 0, top - 7, ["#6a4c58", "#33222b"]), "stone", 0.55);
      c.strokeStyle = "rgba(8,4,8,0.5)"; c.beginPath(); c.moveTo(-6, top - 16); c.lineTo(-3, top - 10); c.lineTo(-7, top - 8); c.stroke();
    }
    // jelaga/retak
    crackLines(c, r, -12, top + 10, 24, 70, v === 0 ? 2 : 3);
    c.fillStyle = "rgba(10,4,8,0.2)"; c.fillRect(2, top, 13, -20 - top);
    if (v === 1) {
      // silinder jatuh
      sh(c, (g) => rr(g, 20, -16, 52, 26, 4), lin(c, 0, -16, 0, 10, ["#5a4450", "#3a2630", "#251921"]), "stone", 0.6);
      el(c, 72, -3, 5, 13, "#4a3640", "stone", 0.5, OUT, 1.3); el(c, 72, -3, 2.5, 7, "#2b1c24", null, 0, false);
      for (const x of [34, 46, 58]) { c.strokeStyle = "rgba(8,4,8,0.4)"; c.beginPath(); c.moveTo(x, -16); c.lineTo(x, 8); c.stroke(); }
    }
    rock(c, -28, 2, 7, 4, r, 1); rock(c, v === 1 ? -36 : 26, 3, 6, 3.5, r, 0); rock(c, 18, 5, 4, 2.5, r, 2);
  },
};

// ---------------------------------------------------------- stalagmite
DEF.stalagmite = {
  box: () => [-56, -148, 56, 16],
  size: (d) => ({ w: 64, h: [78, 118, 90][(d.variant | 0) % 3] }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    shadow(c, 0, 3, 40, 9, 0.55);
    const spike = (x, w, h, lean, tone) => {
      const col = ROCK[tone];
      sh(c, (g) => { g.moveTo(x - w, 2); g.lineTo(x - w * 0.62 + lean * 0.3, -h * 0.5); g.lineTo(x - w * 0.18 + lean, -h); g.lineTo(x + w * 0.25 + lean, -h * 0.55); g.lineTo(x + w * 0.75, -h * 0.25); g.lineTo(x + w, 2); g.closePath(); },
        lin(c, x - w, 0, x + w, 0, [lighten(col, 0.2), col, darken(col, 0.45)]), "stone", 0.6);
      // bidang terang
      c.fillStyle = "rgba(255,200,170,0.1)"; c.beginPath(); c.moveTo(x - w * 0.62 + lean * 0.3, -h * 0.5); c.lineTo(x - w * 0.18 + lean, -h); c.lineTo(x + lean * 0.4, -h * 0.5); c.lineTo(x - w * 0.3, 0); c.closePath(); c.fill();
      c.fillStyle = "rgba(8,4,8,0.2)"; c.beginPath(); c.moveTo(x + w * 0.25 + lean, -h * 0.55); c.lineTo(x + w, 2); c.lineTo(x + w * 0.2, 2); c.closePath(); c.fill();
    };
    if (v === 0) { spike(-18, 11, 44, -4, 1); spike(16, 12, 58, 5, 0); spike(0, 15, 80, 2, 2); }
    else if (v === 1) { spike(0, 13, 118, -6, 0); spike(-20, 8, 30, -2, 1); }
    else { spike(-14, 18, 72, -8, 2); spike(16, 17, 90, 7, 0); spike(2, 9, 34, 0, 1); }
    rock(c, -28, 3, 7, 4, r, 1); rock(c, 30, 4, 6, 3, r, 2); rock(c, 8, 6, 4, 2.5, r, 0);
  },
  glow(c, r, d) {
    const v = (d.variant | 0) % 3;
    const h = [60, 96, 70][v];
    const pts = crackLine(r, 0, -2, h * 0.9, -PI / 2, 5, 0.9);
    glowStroke(c, "glow", [polyPath(pts)], 1.6);
    if (v === 2) glowStroke(c, "glow", [polyPath(crackLine(r, 14, -2, 40, -PI / 2, 3, 1))], 1.2);
    // groove gelap tipis ada di glow layer juga agar terlihat
  },
  ga: (now, d) => 0.25 + 0.2 * wobble(now, d._s, 1.3),
  dyn(c, d, now) { const v = (d.variant | 0) % 3; glow(c, 0, -[26, 40, 30][v], 22, 26, RGB.lava, 0.12 + 0.08 * wobble(now, d._s, 1.3)); },
};

// ---------------------------------------------------------- chest
DEF.chest = {
  box: () => [-48, -92, 48, 16],
  size: (d) => ({ w: 58, h: d.open ? 62 : 46 }),
  stat(c, r, d) {
    const o = !!d.open;
    const W = 28;
    shadow(c, 0, 3, 40, 10, 0.55);
    const wood = lin(c, 0, -30, 0, 0, ["#7a4a36", "#5a3329", "#3f2420"]);
    const iron = "#3b3541";
    const strap = (x, y, w, h) => sh(c, (g) => rr(g, x, y, w, h, 1.5), lin(c, x, 0, x + w, 0, ["#5b5463", "#3b3541", "#2a2530"]), "metal", 0.5, OUT, 1.1);
    if (o) {
      sh(c, (g) => rr(g, -W, -64, W * 2, 38, 5), lin(c, 0, -64, 0, -26, ["#6a4030", "#3f2420"]), "wood", 0.6, OUT, 1.5);
      sh(c, (g) => rr(g, -W + 5, -59, W * 2 - 10, 28, 3), lin(c, 0, -59, 0, -31, ["#42242c", "#2a1218"]), "cloth", 0.5, false);
      strap(-W + 2, -64, 6, 38); strap(W - 8, -64, 6, 38);
      el(c, 0, -29, W - 2, 6, "#14090c", null, 0, OUT, 1.2);
      // tumpukan koin
      sh(c, (g) => { g.moveTo(-W + 4, -29); g.bezierCurveTo(-W + 8, -46, -8, -50, 0, -48); g.bezierCurveTo(10, -50, W - 8, -46, W - 4, -29); g.quadraticCurveTo(0, -23, -W + 4, -29); g.closePath(); },
        lin(c, 0, -50, 0, -26, ["#ffe08a", "#e6a82e", "#a8672e"]), null, 0, OUT, 1.2);
      for (let i = 0; i < 18; i++) { const x = -W + 8 + r() * (W * 2 - 16); const y = -46 + r() * 16 + Math.abs(x) * 0.15; el(c, x, y, 3.4, 2.2, r() < 0.5 ? "#ffd36b" : "#f0b83a", null, 0, "rgba(120,70,10,0.7)", 0.8); }
      for (const [gx, gc] of [[-9, "#df3e23"], [10, "#2dd4bf"], [0, "#c084fc"]]) { P(c, [gx, -45, gx + 3.4, -41, gx, -37, gx - 3.4, -41], gc, null, 0, OUT, 0.9); }
    }
    // badan depan
    sh(c, (g) => rr(g, -W, -28, W * 2, 28, 3), wood, "wood", 0.65, OUT, 1.6);
    for (const x of [-9, 9]) { c.strokeStyle = "rgba(10,4,4,0.4)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, -28); c.lineTo(x, 0); c.stroke(); }
    sh(c, (g) => rr(g, -W - 1, -6, W * 2 + 2, 6, 2), iron, "metal", 0.5, OUT, 1.2);
    sh(c, (g) => rr(g, -W - 1, -28, W * 2 + 2, 5, 2), iron, "metal", 0.5, OUT, 1.2);
    strap(-W + 3, -28, 7, 28); strap(W - 10, -28, 7, 28);
    for (const [x, y] of [[-W + 6.5, -24], [-W + 6.5, -4], [W - 6.5, -24], [W - 6.5, -4]]) nail(c, x, y);
    if (!o) {
      sh(c, (g) => { g.moveTo(-W, -28); g.quadraticCurveTo(-W - 1, -50, 0, -50); g.quadraticCurveTo(W + 1, -50, W, -28); g.closePath(); }, lin(c, 0, -50, 0, -28, ["#8a5640", "#6a4030", "#4a2c26"]), "wood", 0.65, OUT, 1.6);
      c.strokeStyle = "rgba(10,4,4,0.4)"; c.lineWidth = 1;
      for (const x of [-12, 0, 12]) { c.beginPath(); c.moveTo(x, -29); c.lineTo(x * 0.96, -48 + Math.abs(x) * 0.25); c.stroke(); }
      for (const x of [-W + 3, W - 10]) sh(c, (g) => { g.moveTo(x, -28); g.quadraticCurveTo(x - 0.5, -46 + Math.abs(x) * 0.1, x + 3.5, -49.5); g.lineTo(x + 7, -28); g.closePath(); }, "#3b3541", "metal", 0.5, OUT, 1.1);
      stroke(c, -W + 4, -42, -6, -49, 1.6, "rgba(255,255,255,0.25)");
      el(c, 0, -29, 6.5, 6, lin(c, 0, -35, 0, -23, ["#ffe08a", "#c28a2a"]), null, 0, OUT, 1.2);
    } else {
      el(c, 0, -22, 6, 6.4, lin(c, 0, -28, 0, -16, ["#ffe08a", "#c28a2a"]), null, 0, OUT, 1.2);
    }
    c.fillStyle = "#0e0810"; c.beginPath(); c.arc(0, d.open ? -22.5 : -29.5, 1.4, 0, TAU); c.fill();
    c.fillRect(-0.7, d.open ? -22.5 : -29.5, 1.4, 3.5);
  },
  dyn(c, d, now) {
    if (!d.open) return;
    const s = d._s;
    const p = 0.75 + 0.25 * sin(now * 0.004 + s);
    glow(c, 0, -42, 60, 44, RGB.gold, 0.5 * p);
    const pa = c.globalAlpha, po = c.globalCompositeOperation;
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = pa * 0.5 * p;
    c.drawImage(tintedColumn(RGB.gold), -26, -112, 52, 76);
    for (let i = 0; i < 5; i++) {
      const k = fr(now / 1100 + i * 0.37 + (s % 9) / 9);
      const x = -18 + ((i * 53 + s) % 36), y = -46 - k * 6;
      c.globalAlpha = pa * sin(k * PI) * 0.95;
      c.fillStyle = "rgb(255,240,190)";
      const z = 2.2 * sin(k * PI) + 0.4;
      c.fillRect(x - z, y - 0.4, z * 2, 0.8); c.fillRect(x - 0.4, y - z, 0.8, z * 2);
    }
    c.globalAlpha = pa; c.globalCompositeOperation = po;
    sparks(c, 0, -44, now, s, 6, 18, 38, 2200, RGB.yel, 1.5);
  },
  light: (d, now) => (d.open ? { r: 190 * (0.95 + 0.05 * sin(now * 0.004 + d._s)), s: 0.7 } : null),
};

// ---------------------------------------------------------- signpost
DEF.signpost = {
  box: () => [-60, -124, 60, 16],
  size: () => ({ w: 70, h: 104 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    shadow(c, 0, 3, 28, 8, 0.55);
    rock(c, -12, 2, 9, 5, r, 1); rock(c, 12, 2, 8, 4.5, r, 0); rock(c, 0, 4, 11, 5, r, 2);
    sh(c, (g) => { g.moveTo(-4.5, 0); g.lineTo(-3.8, -100); g.lineTo(3.8, -100); g.lineTo(4.5, 0); g.closePath(); }, lin(c, -5, 0, 5, 0, ["#7a4c36", "#5a3329", "#3f2420"]), "wood", 0.7);
    P(c, [-4, -100, 0, -106, 4, -100], "#5a3329", "wood", 0.6, OUT, 1.2);
    const board = (y, dir, w, tilt, col) => {
      c.save(); c.translate(0, y); c.rotate(tilt); c.scale(dir, 1);
      sh(c, (g) => { g.moveTo(-10, -8); g.lineTo(w - 10, -8); g.lineTo(w + 8, 0); g.lineTo(w - 10, 8); g.lineTo(-10, 8); g.closePath(); }, lin(c, 0, -8, 0, 8, [lighten(col, 0.12), col, darken(col, 0.3)]), "wood", 0.7);
      c.strokeStyle = "rgba(10,4,4,0.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, 1); c.lineTo(w - 6, 1); c.stroke();
      // ukiran (tanpa teks)
      c.strokeStyle = "rgba(20,8,6,0.65)"; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(6, -3); c.lineTo(12, 3); c.moveTo(12, -3); c.lineTo(6, 3); c.moveTo(18, 0); c.lineTo(w - 12, 0); c.stroke();
      nail(c, -5, -4); nail(c, -5, 4);
      c.restore();
    };
    if (v === 0) { board(-84, 1, 42, -0.03, "#7a4c36"); board(-60, -1, 38, 0.04, "#6a4030"); }
    else if (v === 1) { board(-88, 1, 44, -0.04, "#7a4c36"); board(-66, -1, 38, 0.03, "#6a4030"); board(-44, 1, 32, 0.02, "#5a3a2a"); }
    else {
      board(-84, 1, 44, -0.03, "#7a4c36");
      c.save(); c.translate(-2, -58); c.rotate(0.2);
      stroke(c, -8, -3, -8, 10, 1.2, "#2a2530"); stroke(c, 8, -3, 8, 10, 1.2, "#2a2530");
      plank(c, -14, 6, 28, 12, "#5a3a2a"); skull(c, 0, 20, 0.7, "#cfc4a8");
      c.restore();
      stroke(c, 0, -62, -8, -64, 1.4, "#2a2530");
    }
  },
};

// ============================================================ GATE
const gateOuter = (c) => { c.moveTo(-114, -12); c.lineTo(-114, -132); c.ellipse(0, -132, 114, 80, 0, PI, TAU); c.lineTo(114, -12); c.closePath(); };
const gateInner = (c) => { c.moveTo(-60, -6); c.lineTo(-60, -120); c.ellipse(0, -120, 60, 58, 0, PI, TAU); c.lineTo(60, -6); c.closePath(); };
function gateRunes(c, r, mode) {
  const paths = [];
  for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) paths.push(glyphPath(sg * 87, -36 - k * 25, 5.2, r));
  for (let i = 0; i < 7; i++) {
    const a = PI * (1.1 + (0.8 * i) / 6);
    paths.push(glyphPath(cos(a) * 87, -126 + sin(a) * 66, 5, r));
  }
  glowStroke(c, mode, paths, 1.8);
  // urat lava di pilar
  const veins = [];
  for (const sg of [-1, 1]) {
    veins.push(polyPath(crackLine(r, sg * (66 + r() * 8), -14, 40, -PI / 2 + sg * 0.1, 5, 1.1)));
    veins.push(polyPath(crackLine(r, sg * (100 + r() * 6), -20, 50, -PI / 2 - sg * 0.1, 6, 1.1)));
  }
  glowStroke(c, mode, veins, 1.3);
  // mata di keystone
  if (mode !== "groove") {
    c.fillStyle = "rgb(255,160,70)";
    c.beginPath(); c.ellipse(0, -194, 4.4, 3, 0, 0, TAU); c.fill();
    c.fillStyle = "rgb(255,230,160)"; c.beginPath(); c.ellipse(0, -194, 1.8, 1.4, 0, 0, TAU); c.fill();
  }
}
DEF.gate = {
  box: () => [-210, -262, 210, 44],
  size: () => ({ w: 340, h: 230 }),
  under(c, d, now) {
    const p = 0.5 + 0.5 * sin(now * 0.0016 + (d._s % 7));
    glow(c, 0, 8, 190, 48, RGB.org, 0.34 + 0.16 * p);
    glow(c, 0, 4, 110, 26, RGB.yel, 0.16 + 0.1 * p);
    for (const sg of [-1, 1]) glow(c, sg * 150, 6, 60, 20, RGB.org, 0.2);
  },
  stat(c, r, d, sk) {
    const rk = () => rng(sk * 977 + 5);
    shadow(c, 0, 8, 200, 30, 0.6);
    // platform
    sh(c, (g) => rr(g, -178, -6, 356, 22, 5), lin(c, 0, -6, 0, 16, ["#4a3640", "#2b1c24", "#1a1016"]), "stone", 0.6);
    sh(c, (g) => rr(g, -168, -12, 336, 12, 4), lin(c, 0, -12, 0, 0, ["#5a4450", "#33222b"]), "stone", 0.6);
    c.strokeStyle = "rgba(8,4,8,0.5)"; c.lineWidth = 1;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(i * 20 + 5, -6); c.lineTo(i * 20 + 5, 15); c.stroke(); }
    // mahkota duri
    const spikeFill = lin(c, 0, -240, 0, -130, ["#33222b", "#1a1016"]);
    for (let i = 0; i <= 8; i++) {
      const a = PI * (1.06 + (0.88 * i) / 8);
      const bx = cos(a) * 112, by = -132 + sin(a) * 78;
      let nx = cos(a), ny = sin(a) * 1.1; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      const h = i === 4 ? 30 : 15 + ((i * 7) % 3) * 4;
      const tx = bx + nx * h, ty = by + ny * h;
      P(c, [bx - ny * 8, by + nx * 8, tx, ty, bx + ny * 8, by - nx * 8], spikeFill, "stone", 0.5, OUT, 1.4);
    }
    // badan
    sh(c, gateOuter, lin(c, -114, 0, 114, 0, ["#4a3640", "#33222b", "#1a1016", "#33222b", "#4a3640"]), "stone", 0.65, OUT, 2.2);
    c.save();
    c.beginPath(); gateOuter(c); c.clip();
    // gelap bawah
    c.fillStyle = lin(c, 0, -230, 0, 0, ["rgba(0,0,0,0)", "rgba(0,0,0,0.0)", "rgba(10,4,8,0.45)"]); c.fillRect(-120, -230, 240, 230);
    // blok batu pilar
    c.strokeStyle = "rgba(8,4,8,0.55)"; c.lineWidth = 1.3;
    const rr_ = rk();
    for (const sg of [-1, 1]) {
      for (let j = 0; j < 6; j++) {
        const y = -12 - j * 22;
        c.beginPath(); c.moveTo(sg * 60, y); c.lineTo(sg * 114, y); c.stroke();
        const jx = sg * (62 + ((j % 2) ? 20 : 34) + rr_() * 4);
        c.beginPath(); c.moveTo(jx, y); c.lineTo(jx, y - 22); c.stroke();
      }
    }
    // voussoir
    for (let i = 1; i < 10; i++) {
      const a = PI + (i * PI) / 10;
      c.beginPath(); c.moveTo(cos(a) * 60, -120 + sin(a) * 58); c.lineTo(cos(a) * 114, -132 + sin(a) * 80); c.stroke();
    }
    // chip & noda
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(8,4,8,${0.15 + rr_() * 0.2})`; c.fillRect(-114 + rr_() * 228, -190 + rr_() * 180, 2 + rr_() * 5, 1 + rr_() * 3); }
    // sorot terang pinggir kiri
    c.strokeStyle = "rgba(255,200,170,0.14)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-111, -14); c.lineTo(-111, -132); c.ellipse(0, -132, 111, 77, 0, PI, PI * 1.5); c.stroke();
    c.restore();
    // kapital & dasar pilar
    for (const sg of [-1, 1]) {
      sh(c, (g) => rr(g, sg > 0 ? 54 : -124, -18, 70, 20, 3), lin(c, 0, -18, 0, 2, ["#5a4450", "#2b1c24"]), "stone", 0.6);
      sh(c, (g) => rr(g, sg > 0 ? 52 : -122, -146, 70, 14, 3), lin(c, 0, -146, 0, -132, ["#6a4c58", "#33222b"]), "stone", 0.6);
    }
    // lubang portal gelap
    sh(c, gateInner, "#0a0508", null, 0, false);
    // keystone + tengkorak bertanduk
    sh(c, (g) => { g.moveTo(-20, -214); g.lineTo(20, -214); g.lineTo(15, -170); g.lineTo(-15, -170); g.closePath(); }, lin(c, -20, 0, 20, 0, ["#5a4450", "#4a3640", "#2b1c24"]), "stone", 0.6, OUT, 1.8);
    for (const sg of [-1, 1]) {
      c.strokeStyle = OUT; c.lineWidth = 7; c.beginPath(); c.moveTo(sg * 12, -200); c.bezierCurveTo(sg * 30, -204, sg * 36, -218, sg * 30, -232); c.stroke();
      c.strokeStyle = "#6a4c58"; c.lineWidth = 4.6; c.stroke();
    }
    el(c, 0, -194, 9, 10, lin(c, -9, 0, 9, 0, ["#6a5560", "#4a3640"]), "stone", 0.5, OUT, 1.3);
    sh(c, (g) => rr(g, -6, -187, 12, 7, 2), "#33222b", "stone", 0.5, OUT, 1);
    c.fillStyle = "#0e0810"; c.beginPath(); c.ellipse(-4, -195, 2.6, 3, 0, 0, TAU); c.ellipse(4, -195, 2.6, 3, 0, 0, TAU); c.fill();
    // runes alur gelap
    gateRunes(c, rk(), "groove");
    // brazier
    brazierBody(c, -150, r); brazierBody(c, 150, r);
  },
  glow(c, r, d, sk) {
    gateRunes(c, rng(sk * 977 + 5), "glow");
    // tepi dalam lubang menyala
    c.save(); c.beginPath(); gateInner(c);
    c.strokeStyle = "rgba(255,150,60,0.55)"; c.lineWidth = 4; c.stroke();
    c.strokeStyle = "rgba(255,230,160,0.7)"; c.lineWidth = 1.2; c.stroke();
    c.restore();
    for (const sg of [-1, 1]) el(c, sg * 150, -55, 19, 5, "rgba(255,120,40,0.7)", null, 0, false);
  },
  ga: (now, d) => 0.62 + 0.38 * (0.5 + 0.5 * sin(now * 0.0021 + (d._s % 7))) + 0.06 * sin(now * 0.011),
  dyn(c, d, now) {
    const s = d._s;
    const t = now * 0.001;
    const pul = 0.5 + 0.5 * sin(t * 1.6 + (s % 7));
    const sw = swirl("lava");
    c.save();
    c.beginPath(); gateInner(c); c.clip();
    c.drawImage(sw.base, -62, -184, 124, 182);
    c.globalCompositeOperation = "lighter";
    c.save(); c.translate(0, -100); c.rotate(t * 0.9); c.globalAlpha = 0.9; c.drawImage(sw.arms, -108, -108, 216, 216); c.restore();
    c.save(); c.translate(0, -100); c.rotate(-t * 1.5); c.globalAlpha = 0.6; c.drawImage(sw.arms, -66, -66, 132, 132); c.restore();
    c.globalAlpha = 1;
    glow(c, 0, -100, 62, 62, RGB.hot, 0.5 + 0.25 * pul);
    glow(c, 0, -8, 80, 30, RGB.org, 0.7);
    // riak panas
    c.globalAlpha = 0.13; c.strokeStyle = "rgb(255,210,140)"; c.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      c.beginPath();
      const y0 = -24 - k * 31 - ((t * 20 + k * 9) % 14);
      for (let i = 0; i <= 12; i++) { const x = -62 + i * 10.3; const y = y0 + sin(t * 3 + i * 0.8 + k) * 3; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    c.restore();
    // vignette tepi
    glow(c, 0, -105, 160, 150, RGB.lava, 0.14 + 0.06 * pul);
    sparks(c, 0, -30, now, s, 26, 60, 190, 2600, RGB.org, 2.2);
    sparks(c, 0, -50, now * 1.3, s + 7, 10, 40, 150, 3200, RGB.yel, 1.6);
    // brazier
    for (const sg of [-1, 1]) {
      const x = sg * 150, f = 0.9 + 0.1 * sin(now * 0.018 + sg + s);
      flame(c, x, -56, 34, 54 * f, now, s + sg * 3);
      glow(c, x, -76, 70, 70, RGB.org, 0.45 * f);
      glow(c, x, -66, 28, 28, RGB.yel, 0.3 * f);
      sparks(c, x, -80, now, s + sg * 11, 8, 18, 70, 1900, RGB.org, 1.8);
    }
  },
  front(c, r, d, sk) {
    // bayangan dalam bukaan
    c.save(); c.beginPath(); gateInner(c); c.clip();
    c.strokeStyle = "rgba(8,3,6,0.7)"; c.lineWidth = 14; c.beginPath(); gateInner(c); c.stroke();
    c.strokeStyle = "rgba(8,3,6,0.5)"; c.lineWidth = 26; c.stroke();
    c.restore();
    c.beginPath(); gateInner(c); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    // ambang
    sh(c, (g) => rr(g, -66, -9, 132, 11, 2), lin(c, 0, -9, 0, 2, ["#5a4450", "#2b1c24"]), "stone", 0.6);
    c.strokeStyle = "rgba(255,150,60,0.4)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-60, -9); c.lineTo(60, -9); c.stroke();
  },
  light: (d, now) => ({ r: 360 * (0.96 + 0.04 * sin(now * 0.0016 + d._s % 7) + 0.015 * sin(now * 0.011)), s: 0.85 + 0.08 * sin(now * 0.0021 + (d._s % 7)) }),
};

// ============================================================ PORTAL LANTAI
function portalSlabs(c, rx, ry, depth, rkr, front) {
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU + 0.02, a1 = ((i + 1) / N) * TAU - 0.02;
    const mid = (a0 + a1) / 2;
    const isFront = sin(mid) > 0;
    if (isFront !== front) continue;
    const ro = 1.18, ri = 1.0;
    const pts = [
      cos(a0) * rx * ri, sin(a0) * ry * ri, cos(a0) * rx * ro, sin(a0) * ry * ro,
      cos(a1) * rx * ro, sin(a1) * ry * ro, cos(a1) * rx * ri, sin(a1) * ry * ri,
    ];
    const tone = ROCK[(i * 7 + (rkr() * 3) | 0) % 3];
    const side = [pts[2], pts[3], pts[4], pts[5], pts[4], pts[5] + depth, pts[2], pts[3] + depth];
    P(c, side, darken(tone, 0.55), "stone", 0.5, OUT, 1);
    P(c, pts, lin(c, 0, -ry, 0, ry, [lighten(tone, 0.18), tone, darken(tone, 0.2)]), "stone", 0.55, OUT, 1.2);
  }
}
function makePortal(pk, label) {
  const RX = 65, RY = 35;
  return {
    box: () => [-96, -124, 96, 62],
    size: () => ({ w: 150, h: 84 }),
    under(c, d, now) {
      const o = !!d.open;
      const p = 0.5 + 0.5 * sin(now * 0.003 + (d._s % 9));
      if (o) glow(c, 0, 0, 170, 90, PAL[pk].glow, 0.35 + 0.15 * p);
      else glow(c, 0, 0, 90, 46, PAL[pk].glow, 0.1 + 0.05 * p);
    },
    stat(c, r, d, sk) {
      const o = !!d.open;
      const rk = () => rng(sk * 131 + (pk === "teal" ? 9 : 3));
      shadow(c, 0, 6, 100, 48, 0.55);
      portalSlabs(c, RX, RY, 6, rk(), false);
      // lantai dalam
      c.save();
      c.beginPath(); c.ellipse(0, 0, RX * 1.02, RY * 1.02, 0, 0, TAU); c.clip();
      c.fillStyle = o ? "#14090c" : lin(c, 0, -RY, 0, RY, ["#0c0609", "#1a0f12"]); c.fillRect(-RX - 4, -RY - 4, RX * 2 + 8, RY * 2 + 8);
      c.fillStyle = pat(c, "hide"); c.globalAlpha = 0.25; c.fillRect(-RX - 4, -RY - 4, RX * 2 + 8, RY * 2 + 8);
      c.globalAlpha = 1;
      if (!o) {
        c.save(); c.scale(1, K * 0.92);
        pen(c, "groove", 2); c.beginPath(); c.arc(0, 0, 52, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 36, 0, TAU); c.stroke();
        c.restore();
      }
      c.restore();
      c.beginPath(); c.ellipse(0, 0, RX * 1.0, RY * 1.0, 0, 0, TAU); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
    },
    glow(c, r, d, sk) {
      const o = !!d.open;
      const rk = rng(sk * 131 + (pk === "teal" ? 9 : 3));
      c.save(); c.scale(1, K * 0.92);
      const gcol = pk === "teal" ? "rgb(70,235,215)" : "rgb(255,150,60)";
      const paths = [];
      // glyph melingkar
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; paths.push(glyphPath(cos(a) * 44, sin(a) * 44, 3.2, rk)); }
      const gl = (ps, lw) => {
        c.lineCap = c.lineJoin = "round";
        c.strokeStyle = pk === "teal" ? "rgba(20,150,150,0.5)" : "rgba(223,62,35,0.5)"; c.lineWidth = lw + 3; ps.forEach((p) => c.stroke(p));
        c.strokeStyle = gcol; c.lineWidth = lw; ps.forEach((p) => c.stroke(p));
      };
      if (!o) {
        const rings = new Path2D(); rings.arc(0, 0, 52, 0, TAU); rings.moveTo(36, 0); rings.arc(0, 0, 36, 0, TAU);
        gl([rings], 1.2); gl(paths, 1.4);
        const cr = [];
        for (let i = 0; i < 6; i++) cr.push(polyPath(crackLine(rk, 0, 0, 56, (i / 6) * TAU + 0.3, 5, 1.0)));
        gl(cr, 1.3);
      }
      c.restore();
      // tanda pada slab (sisi luar)
      c.fillStyle = gcol;
      for (let i = 0; i < 16; i++) { const a = ((i + 0.5) / 16) * TAU; c.fillRect(cos(a) * RX * 1.09 - 1, sin(a) * RY * 1.09 - 1, 2.4, 2.2); }
    },
    ga: (now, d) => (d.open ? 0.9 : 0.25 + 0.2 * wobble(now, d._s, 1.2)),
    dyn(c, d, now) {
      const o = !!d.open;
      const s = d._s;
      const t = now * 0.001;
      const pal = PAL[pk];
      if (!o) { glow(c, 0, -2, 54, 26, pal.glow, 0.12 + 0.06 * wobble(now, s, 1.2)); return; }
      const sw = swirl(pk);
      const p = 0.5 + 0.5 * sin(t * 2.4 + (s % 9));
      c.save();
      c.beginPath(); c.ellipse(0, 0, RX * 1.0, RY * 1.0, 0, 0, TAU); c.clip();
      c.drawImage(sw.base, -RX, -RY, RX * 2, RY * 2);
      c.globalCompositeOperation = "lighter";
      c.save(); c.scale(1, K * 0.92); c.rotate(t * 1.1); c.globalAlpha = 0.95; c.drawImage(sw.arms, -RX * 1.1, -RX * 1.1, RX * 2.2, RX * 2.2); c.restore();
      c.save(); c.scale(1, K * 0.92); c.rotate(-t * 1.7); c.globalAlpha = 0.6; c.drawImage(sw.arms, -42, -42, 84, 84); c.restore();
      c.globalAlpha = 1;
      glow(c, 0, 0, 38, 22, pal.core, 0.65 + 0.25 * p);
      c.restore();
      // cincin berdenyut
      const po = c.globalCompositeOperation, pa = c.globalAlpha;
      c.globalCompositeOperation = "lighter";
      c.lineWidth = 2.4;
      for (let i = 0; i < 2; i++) {
        const k = fr(t * 0.55 + i * 0.5);
        c.globalAlpha = pa * (1 - k) * 0.8;
        c.strokeStyle = `rgb(${pal.mid})`;
        c.beginPath(); c.ellipse(0, 0, RX * (0.55 + k * 0.7), RY * (0.55 + k * 0.7), 0, 0, TAU); c.stroke();
      }
      c.globalAlpha = pa * (0.55 + 0.3 * p);
      c.strokeStyle = `rgb(${pal.core})`; c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(0, 0, RX * 1.02, RY * 1.02, 0, 0, TAU); c.stroke();
      // kolom cahaya
      c.globalAlpha = pa * (0.5 + 0.2 * p);
      c.drawImage(tintedColumn(pal.glow), -RX * 0.85, -128, RX * 1.7, 128);
      c.globalAlpha = pa * 0.4;
      c.drawImage(tintedColumn(pal.core), -RX * 0.4, -98, RX * 0.8, 98);
      c.globalCompositeOperation = po; c.globalAlpha = pa;
      glow(c, 0, -10, 80, 40, pal.glow, 0.35 + 0.15 * p);
      sparks(c, 0, -2, now, s, 20, 46, 120, 2300, pal.glow, 2);
      sparks(c, 0, -4, now * 1.2, s + 5, 8, 30, 90, 2900, pal.core, 1.5);
    },
    front(c, r, d, sk) {
      const rk = rng(sk * 131 + (pk === "teal" ? 9 : 3));
      for (let i = 0; i < 40; i++) rk();
      portalSlabs(c, RX, RY, 6, rk, true);
    },
    light: (d, now) => (d.open ? { r: 280 * (0.95 + 0.05 * sin(now * 0.0024 + d._s % 9)), s: pk === "teal" ? 0.8 : 0.9 } : { r: 80, s: 0.22 }),
  };
}
DEF.portal = makePortal("lava");
DEF.camp_portal = makePortal("teal");

// ============================================================ DECAL
const RR = (d) => Math.max(12, d.r || 80);
function runeArt(c, R, r, mode) {
  c.save();
  c.scale(1, K);
  const lw = Math.max(1.4, R * 0.022);
  const paths = [];
  const ring = (rad_) => { const p = new Path2D(); p.arc(0, 0, rad_, 0, TAU); return p; };
  paths.push(ring(R), ring(R * 0.84), ring(R * 0.3));
  const ticks = new Path2D();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; const l = i % 4 === 0 ? 0.09 : 0.04; ticks.moveTo(cos(a) * R * 0.97, sin(a) * R * 0.97); ticks.lineTo(cos(a) * R * (0.97 - l), sin(a) * R * (0.97 - l)); }
  paths.push(ticks);
  const star = new Path2D();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU - PI / 2; const b = ((i + 2) / 6) * TAU - PI / 2; star.moveTo(cos(a) * R * 0.62, sin(a) * R * 0.62); star.lineTo(cos(b) * R * 0.62, sin(b) * R * 0.62); }
  paths.push(star, ring(R * 0.62));
  const gl = [];
  const n = 12;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; gl.push(glyphPath(cos(a) * R * 0.91 * 0.995, sin(a) * R * 0.91, Math.max(2.2, R * 0.03), r)); }
  glowStroke(c, mode, paths, lw);
  glowStroke(c, mode, gl, lw * 0.85);
  c.restore();
}
DEF.rune = {
  box: (d) => { const R = RR(d); return [-R - 12, -R * K - 12, R + 12, R * K + 12]; },
  size: (d) => ({ w: RR(d) * 2, h: RR(d) * 2 * K }),
  stat(c, r, d, sk) {
    const R = RR(d);
    c.save(); c.scale(1, K);
    c.fillStyle = rad(c, 0, 0, R * 0.2, R * 1.05, ["rgba(8,4,8,0.5)", "rgba(8,4,8,0.35)", "rgba(8,4,8,0)"]);
    c.beginPath(); c.arc(0, 0, R * 1.05, 0, TAU); c.fill();
    c.fillStyle = "rgba(8,4,8,0.18)"; c.beginPath(); c.arc(0, 0, R * 0.84, 0, TAU); c.fill();
    c.restore();
    runeArt(c, R, rng(sk * 17 + 3), "groove");
  },
  glow(c, r, d, sk) { runeArt(c, RR(d), rng(sk * 17 + 3), "glow"); },
  ga: (now, d) => 0.55 + 0.45 * wobble(now, d._s, 1.6),
  dyn(c, d, now) {
    const R = RR(d), s = d._s;
    const p = wobble(now, s, 1.6);
    glow(c, 0, 0, R * 1.15, R * 1.15 * K, RGB.org, 0.12 + 0.12 * p);
    glow(c, 0, 0, R * 0.4, R * 0.4 * K, RGB.yel, 0.1 + 0.1 * p);
    // titik mengorbit
    const po = c.globalCompositeOperation, pa = c.globalAlpha;
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const a = now * 0.0007 * (i % 2 ? -1 : 1) + (i * TAU) / 3 + s;
      const x = cos(a) * R * 0.84, y = sin(a) * R * 0.84 * K;
      c.globalAlpha = pa * 0.9; c.fillStyle = "rgb(255,220,150)"; c.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
      c.globalAlpha = pa * 0.5; glow(c, x, y, 9, 6, RGB.org, 0.5);
    }
    c.globalCompositeOperation = po; c.globalAlpha = pa;
  },
};

DEF.crack = {
  box: () => [-104, -70, 104, 70],
  size: () => ({ w: 180, h: 80 }),
  stat(c, r, d) {
    const v = (d.variant | 0) % 3;
    const paths = crackSet(v, r);
    c.lineCap = c.lineJoin = "round";
    c.strokeStyle = "rgba(8,4,8,0.25)"; c.lineWidth = 12; paths.forEach((p) => c.stroke(p));
    c.strokeStyle = "rgba(8,4,8,0.55)"; c.lineWidth = 6.5; paths.forEach((p) => c.stroke(p));
    c.strokeStyle = "#0e070a"; c.lineWidth = 4; paths.forEach((p) => c.stroke(p));
    c.strokeStyle = "rgba(255,190,160,0.12)"; c.lineWidth = 1; c.save(); c.translate(0, -2.5); paths.forEach((p) => c.stroke(p)); c.restore();
  },
  glow(c, r, d) { glowStroke(c, "glow", crackSet((d.variant | 0) % 3, r), 2.2); },
  ga: (now, d) => 0.6 + 0.4 * wobble(now, d._s, 1.8),
  dyn(c, d, now) { glow(c, 0, 0, 90, 34, RGB.lava, 0.16 + 0.08 * wobble(now, d._s, 1.8)); },
};
function crackSet(v, r) {
  const out = [];
  const flat = (pts) => pts.map(([x, y]) => [x, y * K]);
  if (v === 0) {
    const m = crackLine(r, -80, 0, 160, 0, 11, 1.2);
    out.push(polyPath(flat(m)));
    for (let i = 2; i < 10; i += 3) out.push(polyPath(flat(crackLine(r, m[i][0], m[i][1], 24 + r() * 18, (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.8), 3, 1))));
  } else if (v === 1) {
    const m = crackLine(r, -70, -16, 80, 0.3, 6, 1);
    out.push(polyPath(flat(m)));
    const e = m[m.length - 1];
    out.push(polyPath(flat(crackLine(r, e[0], e[1], 70, -0.55, 6, 1))));
    out.push(polyPath(flat(crackLine(r, e[0], e[1], 64, 0.65, 6, 1))));
    out.push(polyPath(flat(crackLine(r, m[2][0], m[2][1], 30, -1.2, 3, 1))));
  } else {
    for (let i = 0; i < 5; i++) out.push(polyPath(flat(crackLine(r, 0, 0, 50 + r() * 40, (i / 5) * TAU + r() * 0.6, 6, 1.2))));
    for (let i = 0; i < 3; i++) { const a = r() * TAU; out.push(polyPath(flat(crackLine(r, cos(a) * 30, sin(a) * 30, 30, a + 0.5, 3, 1)))); }
  }
  return out;
}

DEF.scorch = {
  box: (d) => { const R = Math.max(14, d.r || 50); return [-R * 1.3, -R * K * 1.3, R * 1.3, R * K * 1.3]; },
  size: (d) => { const R = Math.max(14, d.r || 50); return { w: R * 2, h: R * 2 * K }; },
  stat(c, r, d) {
    const R = Math.max(14, d.r || 50);
    c.save(); c.scale(1, K);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, dd = r() * R * 0.55, rad_ = R * (0.3 + r() * 0.4);
      const x = cos(a) * dd, y = sin(a) * dd;
      c.fillStyle = rad(c, x, y, 0, rad_, [`rgba(10,5,7,${0.5 + r() * 0.2})`, "rgba(10,5,7,0.28)", "rgba(10,5,7,0)"]);
      c.fillRect(x - rad_, y - rad_, rad_ * 2, rad_ * 2);
    }
    // goresan radial
    c.strokeStyle = "rgba(10,5,7,0.35)"; c.lineWidth = 2; c.lineCap = "round";
    for (let i = 0; i < 14; i++) { const a = r() * TAU; const d0 = R * (0.3 + r() * 0.2); c.beginPath(); c.moveTo(cos(a) * d0, sin(a) * d0); c.lineTo(cos(a) * d0 * (1.5 + r()), sin(a) * d0 * (1.5 + r())); c.stroke(); }
    for (let i = 0; i < 40; i++) { const a = r() * TAU, dd = R * (0.2 + r() * 0.8); c.fillStyle = `rgba(5,2,4,${0.3 + r() * 0.4})`; c.fillRect(cos(a) * dd, sin(a) * dd, 1 + r() * 2, 1 + r()); }
    c.restore();
  },
  glow(c, r, d) {
    const R = Math.max(14, d.r || 50);
    for (let i = 0; i < 16; i++) { const a = r() * TAU, dd = R * (0.1 + r() * 0.6); c.fillStyle = `rgba(255,${100 + (r() * 80) | 0},40,${0.4 + r() * 0.5})`; c.fillRect(cos(a) * dd, sin(a) * dd * K, 1.4, 1.2); }
  },
  ga: (now, d) => 0.2 + 0.25 * wobble(now, d._s, 3),
};

// ---------------------------------------------------------- lavapool
function blobPts(r, R, n = 14) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const k = 0.86 + r() * 0.28; p.push([cos(a) * R * k, sin(a) * R * k]); }
  return p;
}
function smoothBlob(g, p) {
  const n = p.length;
  g.moveTo((p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2);
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
  g.closePath();
}
DEF.lavapool = {
  box: (d) => { const R = Math.max(14, d.r || 40); return [-R * 1.5, -R * K * 1.5 - 10, R * 1.5, R * K * 1.5 + 10]; },
  size: (d) => { const R = Math.max(14, d.r || 40); return { w: R * 2.3, h: R * 2.3 * K }; },
  under(c, d, now) {
    const R = Math.max(14, d.r || 40);
    glow(c, 0, 0, R * 2.4, R * 2.4 * K + 6, RGB.org, 0.3 + 0.12 * wobble(now, d._s, 2));
  },
  stat(c, r, d) {
    const R = Math.max(14, d.r || 40);
    c.save(); c.scale(1, K);
    const p = blobPts(r, R);
    const pr = p.map(([x, y]) => [x * 1.2, y * 1.2]);
    sh(c, (g) => smoothBlob(g, pr), "#2b1c24", "stone", 0.6, OUT, 1.8);
    for (let i = 0; i < pr.length; i += 2) { rock(c, pr[i][0] * 1.0, pr[i][1] * 1.0, R * 0.22, R * 0.2, r, i % 3); }
    sh(c, (g) => smoothBlob(g, p), rad(c, 0, 0, 0, R, ["#ffcf6b", "#ff8933", "#df3e23", "#733e39"]), null, 0, "rgba(14,6,8,0.9)", 2);
    c.save(); c.beginPath(); smoothBlob(c, p); c.clip();
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, dd = R * (0.3 + r() * 0.5), w = R * (0.14 + r() * 0.2);
      c.fillStyle = "rgba(40,16,16,0.75)";
      c.beginPath(); c.ellipse(cos(a) * dd, sin(a) * dd, w, w * 0.7, r() * 3, 0, TAU); c.fill();
    }
    c.restore();
    c.restore();
  },
  dyn(c, d, now) {
    const R = Math.max(14, d.r || 40), s = d._s, t = now * 0.001;
    c.save(); c.scale(1, K);
    const po = c.globalCompositeOperation, pa = c.globalAlpha;
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const a = t * (0.25 + i * 0.07) * (i % 2 ? 1 : -1) + i * 1.3 + s;
      const x = cos(a) * R * 0.45, y = sin(a * 1.3) * R * 0.4;
      glow(c, x, y, R * 0.55, R * 0.4, i % 2 ? RGB.org : RGB.yel, 0.28 + 0.1 * sin(t * 2 + i));
    }
    // gelembung
    for (let i = 0; i < 4; i++) {
      const k = fr(t * 0.45 + i * 0.27 + (s % 17) / 17);
      const bx = sin(i * 7.3 + s) * R * 0.5, by = cos(i * 4.1 + s) * R * 0.4;
      if (k < 0.8) { const rb = (0.3 + k * 5) * (R / 40 + 0.4); c.globalAlpha = 0.8; c.strokeStyle = "rgb(255,200,110)"; c.lineWidth = 1.2; c.beginPath(); c.ellipse(bx, by, rb, rb * 0.8, 0, 0, TAU); c.stroke(); c.globalAlpha = 0.3; c.fillStyle = "rgb(255,150,60)"; c.fill(); }
      else { const q = (k - 0.8) / 0.2; c.globalAlpha = 1 - q; c.strokeStyle = "rgb(255,236,170)"; c.lineWidth = 1.4; c.beginPath(); c.ellipse(bx, by, 4 + q * 9, 3 + q * 7, 0, 0, TAU); c.stroke(); for (let j = 0; j < 4; j++) { const aa = j * 1.6 + i; c.fillStyle = "rgb(255,220,150)"; c.fillRect(bx + cos(aa) * q * 12, by - q * 8 * (1 - q) + sin(aa) * q * 6, 1.6, 1.6); } }
    }
    c.globalCompositeOperation = po; c.globalAlpha = pa;
    c.restore();
    sparks(c, 0, -2, now, s, Math.max(3, Math.min(8, (R / 8) | 0)), R * 0.6, 26, 2200, RGB.org, 1.6);
  },
  light: (d, now) => ({ r: Math.max(14, d.r || 40) * 2.4 * (0.96 + 0.04 * sin(now * 0.004 + d._s)), s: 0.85 }),
};

// ---------------------------------------------------------- vent
DEF.vent = {
  box: () => [-52, -110, 52, 34],
  size: () => ({ w: 80, h: 44 }),
  under(c, d, now) {
    const g = ventPhase(d, now);
    glow(c, 0, 2, 60, 28, RGB.org, 0.12 + 0.3 * g);
  },
  stat(c, r) {
    shadow(c, 0, 4, 54, 16, 0.55);
    el(c, 0, 2, 40, 17, "#1a1016", "stone", 0.5, false);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; if (sin(a) <= 0.1) rock(c, cos(a) * 30, sin(a) * 11 - 2, 9 + r() * 3, 7, r, i % 3); }
    el(c, 0, -2, 24, 9, "#0e0608", "stone", 0.4, OUT, 1.4);
    el(c, 0, -2, 18, 6, "#1a0809", null, 0, false);
  },
  glow(c, r) {
    el(c, 0, -1, 14, 4.6, "rgba(255,110,40,0.85)", null, 0, false);
    for (let i = 0; i < 4; i++) glowStroke(c, "glow", [polyPath(crackLine(r, (i - 1.5) * 6, -2, 24, (i < 2 ? PI : 0) + 0.3, 4, 1))].map((p) => p), 1.2);
  },
  ga: (now, d) => 0.25 + 0.7 * ventPhase(d, now),
  front(c, r) {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; if (sin(a) > 0.1) rock(c, cos(a) * 30, sin(a) * 11 + 2, 9 + r() * 3, 7, r, i % 3); }
  },
  dyn(c, d, now) {
    const s = d._s;
    const per = 4200 + (s % 1500);
    const ph = fr((now + s * 37) / per);
    const g = ventPhase(d, now);
    glow(c, 0, -6, 44, 30, RGB.org, 0.12 + 0.4 * g);
    if (ph > 0.6) {
      const q = (ph - 0.6) / 0.4;
      const pa = c.globalAlpha;
      for (let i = 0; i < 7; i++) {
        const k = clamp(q * 1.25 - i * 0.07, 0, 1);
        if (k <= 0 || k >= 1) continue;
        c.globalAlpha = pa * 0.5 * sin(k * PI);
        c.fillStyle = i % 2 ? "#2a1c22" : "#3a2630";
        const x = sin(i * 2.7 + s) * 10 * k + sin(now * 0.002 + i) * 3;
        c.beginPath(); c.arc(x, -8 - k * 70 - i * 2, 7 + k * 15, 0, TAU); c.fill();
        c.globalAlpha = pa * 0.18 * (1 - k); c.fillStyle = "#ff8933"; c.beginPath(); c.arc(x, -8 - k * 52, 5 + k * 8, 0, TAU); c.fill();
      }
      c.globalAlpha = pa;
      if (q < 0.7) sparks(c, 0, -8, now * 2.2, s, 12, 22, 70, 1400, RGB.org, 2);
    }
  },
  light: (d, now) => { const g = ventPhase(d, now); return g > 0.05 ? { r: 70 + 90 * g, s: 0.3 + 0.4 * g } : null; },
};
function ventPhase(d, now) {
  const s = d._s;
  const per = 4200 + (s % 1500);
  const ph = fr((now + s * 37) / per);
  if (ph < 0.55) return 0.12 * (ph / 0.55);
  if (ph < 0.65) return 0.12 + 0.88 * ((ph - 0.55) / 0.1);
  return Math.max(0, 1 - (ph - 0.65) / 0.35) * 0.95 + 0.0;
}

// ============================================================ cache & API
const CACHE = new Map();
let cachePx = 0;
const MAX_PX = 14e6;
const SC = 2;
function mkCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w * SC));
  cv.height = Math.max(1, Math.ceil(h * SC));
  return cv;
}
function typeSeed(t) { let h = 17; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) >>> 0; return h; }
function getEntry(d, def, key, sk) {
  let e = CACHE.get(key);
  if (e) return e;
  const box = def.box(d);
  const [x0, y0, x1, y1] = box;
  const W = x1 - x0, H = y1 - y0;
  const ts = typeSeed(d.type);
  const layer = (fn, salt) => {
    if (!fn) return null;
    const cv = mkCanvas(W, H);
    const g = cv.getContext("2d");
    g.scale(SC, SC);
    g.translate(-x0, -y0);
    fn(g, rng(((sk + 1) * 7919 + ts + salt) >>> 0 || 1), d, sk);
    return cv;
  };
  e = { box, stat: layer(def.stat, 0), glow: layer(def.glow, 0), front: layer(def.front, 0) };
  // 'stat' & 'front' & 'glow' memakai seed rng yang sama agar geometri konsisten bila perlu
  const px = (cv) => (cv ? cv.width * cv.height : 0);
  e.px = px(e.stat) + px(e.glow) + px(e.front);
  CACHE.set(key, e);
  cachePx += e.px;
  while (cachePx > MAX_PX && CACHE.size > 1) {
    const k = CACHE.keys().next().value;
    const o = CACHE.get(k);
    cachePx -= o.px;
    CACHE.delete(k);
  }
  return e;
}

export function drawDecor(ctx, d, now) {
  const def = d && DEF[d.type];
  if (!def) return;
  if (d._s === undefined) { try { Object.defineProperty(d, "_s", { value: 0, writable: true, enumerable: false, configurable: true }); } catch (_) { /* beku */ } }
  const seed = seedOf(d);
  d._s = seed;
  const sk = seed % 12;
  const key = d.type + "|" + ((d.variant | 0) || 0) + "|" + (d.open ? 1 : 0) + "|" + Math.round(d.r || 0) + "|" + sk;
  ctx.save();
  try {
    ctx.translate(d.x, d.y);
    if (d.flip) ctx.scale(-1, 1);
    const e = getEntry(d, def, key, sk);
    const [x0, y0, x1, y1] = e.box;
    const W = x1 - x0, H = y1 - y0;
    if (def.under) def.under(ctx, d, now);
    if (e.stat) ctx.drawImage(e.stat, x0, y0, W, H);
    if (e.glow) {
      const a = def.ga ? def.ga(now, d) : 0.7;
      if (a > 0.004) {
        const po = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = pa * clamp(a, 0, 1);
        ctx.drawImage(e.glow, x0, y0, W, H);
        ctx.globalCompositeOperation = po;
        ctx.globalAlpha = pa;
      }
    }
    if (def.dyn) def.dyn(ctx, d, now);
    if (e.front) ctx.drawImage(e.front, x0, y0, W, H);
  } finally {
    ctx.restore();
  }
}

export function decorLight(d, now) {
  const def = d && DEF[d.type];
  if (!def || !def.light) return null;
  d._s = seedOf(d);
  return def.light(d, now);
}

export function decorSize(d) {
  const def = d && DEF[d.type];
  if (!def) return { w: 48, h: 48 };
  if (d._s === undefined) { /* tidak perlu */ }
  return def.size(d);
}
