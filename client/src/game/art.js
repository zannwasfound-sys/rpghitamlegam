// Seni prosedural: tekstur, karakter humanoid per class, senjata, dan monster.
// Semua digambar dengan Canvas 2D (gradien + tekstur noise + outline), tanpa file gambar.
// Fungsi draw* menggambar relatif ke titik (0,0) = pusat entitas; panggil ctx.translate(x, y) dulu.

export const CLASS_INFO = {
  fighter: {
    id: "fighter",
    name: "Fighter",
    role: "Garis depan",
    weapon: "Pedang & Perisai",
    desc: "Tebasan jarak dekat menyapu semua musuh di depan. Paling tebal, dorongan (knockback) paling kuat.",
    stats: { HP: 5, Damage: 4, Jangkauan: 1, Mobilitas: 3 },
    accent: "#f59e0b",
  },
  mage: {
    id: "mage",
    name: "Mage",
    role: "Damage area",
    weapon: "Tongkat Kristal Api",
    desc: "Melempar bola api yang meledak di area. Damage tinggi, tapi tubuhnya rapuh.",
    stats: { HP: 2, Damage: 5, Jangkauan: 4, Mobilitas: 3 },
    accent: "#a855f7",
  },
  marksman: {
    id: "marksman",
    name: "Marksman",
    role: "Penembak jarak jauh",
    weapon: "Busur Panjang",
    desc: "Panah super cepat yang menembus musuh. Jangkauan terjauh dan peluang critical tinggi.",
    stats: { HP: 3, Damage: 4, Jangkauan: 5, Mobilitas: 4 },
    accent: "#22c55e",
  },
  support: {
    id: "support",
    name: "Support",
    role: "Penyembuh tim",
    weapon: "Tongkat Suci",
    desc: "Orb suci melukai musuh sekaligus menyembuhkan sekutu di sekitarnya setiap serangan.",
    stats: { HP: 3, Damage: 2, Jangkauan: 3, Mobilitas: 3 },
    accent: "#38bdf8",
  },
};

const SKINS = ["#f2c9a0", "#e0a97a", "#c68a5b", "#8d5a3a"];
const HAIRS = ["#2b1b12", "#5a3620", "#c9a24a", "#d9d9e3", "#7a2b2b", "#1f2a44"];

export function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const skinFor = (name) => SKINS[strHash(name || "") % SKINS.length];
export const hairFor = (name) => HAIRS[strHash("h" + (name || "")) % HAIRS.length];

// ---------- Warna ----------
function hex(c) {
  if (c[0] === "#") {
    const n = parseInt(c.length === 4 ? c.replace(/./g, (m, i) => (i ? m + m : m)).slice(1) : c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [128, 128, 128];
}
function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
const lighten = (c, t) => mix(c, "#ffffff", t);
const darken = (c, t) => mix(c, "#000000", t);
const OUT = "rgba(14,10,22,0.9)";

// ---------- Tekstur noise (digambar sekali, dipakai sebagai pattern) ----------
const texCanvases = {};
const patCache = new WeakMap();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function buildTex(kind) {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const r = rng(strHash(kind));
  const speck = (n, a1, a2, sz = 1.4) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a1 * r()})` : `rgba(255,255,255,${a2 * r()})`;
      g.fillRect(r() * S, r() * S, sz * (0.5 + r()), sz * (0.5 + r()));
    }
  };
  switch (kind) {
    case "cloth":
      for (let i = 0; i < S; i += 3) {
        g.fillStyle = "rgba(0,0,0,0.16)";
        g.fillRect(i, 0, 1, S);
        g.fillStyle = "rgba(255,255,255,0.07)";
        g.fillRect(0, i, S, 1);
      }
      speck(260, 0.25, 0.2);
      break;
    case "leather":
      speck(520, 0.4, 0.22, 1.8);
      g.strokeStyle = "rgba(0,0,0,0.22)";
      for (let i = 0; i < 16; i++) {
        g.beginPath();
        const x = r() * S, y = r() * S;
        g.moveTo(x, y);
        g.quadraticCurveTo(x + r() * 10 - 5, y + r() * 10 - 5, x + r() * 12 - 6, y + r() * 12 - 6);
        g.stroke();
      }
      break;
    case "metal":
      for (let i = 0; i < 90; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.12})` : `rgba(0,0,0,${0.05 + r() * 0.12})`;
        g.fillRect(r() * S, r() * S, 8 + r() * 30, 1);
      }
      speck(60, 0.3, 0.3);
      break;
    case "skin":
      speck(380, 0.16, 0.16, 1.3);
      break;
    case "hide":
      speck(600, 0.34, 0.2, 2);
      g.strokeStyle = "rgba(0,0,0,0.2)";
      for (let i = 0; i < 20; i++) {
        g.beginPath();
        const x = r() * S, y = r() * S;
        g.moveTo(x, y);
        g.lineTo(x + r() * 8 - 4, y + r() * 8 - 4);
        g.stroke();
      }
      break;
    case "bone":
      for (let i = 0; i < 12; i++) {
        const x = r() * S, y = r() * S, rad = 6 + r() * 12;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, r() < 0.5 ? "rgba(120,90,50,0.25)" : "rgba(255,255,255,0.25)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      speck(160, 0.25, 0.2);
      g.strokeStyle = "rgba(40,30,20,0.35)";
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        const x = r() * S, y = r() * S;
        g.moveTo(x, y);
        g.lineTo(x + r() * 10 - 5, y + r() * 12);
        g.stroke();
      }
      break;
    case "slime":
      for (let i = 0; i < 16; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`;
        g.beginPath();
        g.arc(r() * S, r() * S, 1.5 + r() * 4, 0, 6.3);
        g.stroke();
      }
      speck(120, 0.2, 0.3);
      break;
    case "rust":
      for (let i = 0; i < 16; i++) {
        const x = r() * S, y = r() * S, rad = 4 + r() * 9;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, "rgba(150,70,20,0.45)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      speck(200, 0.3, 0.1);
      break;
    default:
      speck(200, 0.2, 0.2);
  }
  return c;
}

function pat(ctx, kind) {
  let m = patCache.get(ctx);
  if (!m) patCache.set(ctx, (m = {}));
  if (!m[kind]) {
    if (!texCanvases[kind]) texCanvases[kind] = buildTex(kind);
    m[kind] = ctx.createPattern(texCanvases[kind], "repeat");
  }
  return m[kind];
}

// ---------- Primitif gambar ----------
function rr(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function lin(ctx, x0, y0, x1, y1, colors) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  return g;
}
function rad(ctx, x, y, r0, r1, colors, ox = 0, oy = 0) {
  const g = ctx.createRadialGradient(x + ox, y + oy, r0, x, y, r1);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  return g;
}

// Bentuk berisi: fill (warna/gradien) + tekstur + outline
function shape(ctx, fn, fill, tex, ta, line, lw) {
  ctx.beginPath();
  fn(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  if (tex) {
    ctx.save();
    ctx.globalAlpha = ta === undefined ? 0.25 : ta;
    ctx.fillStyle = pat(ctx, tex);
    ctx.fill();
    ctx.restore();
  }
  if (line !== false) {
    ctx.lineWidth = lw || 1.3;
    ctx.strokeStyle = line || OUT;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function ell(ctx, x, y, rx, ry, fill, tex, ta, line, lw, rot = 0) {
  shape(ctx, (c) => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), fill, tex, ta, line, lw);
}

function stroke(ctx, x1, y1, x2, y2, w, color, cap = "round") {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// Anggota badan dengan outline
function limb(ctx, x1, y1, x2, y2, w, color, outline = OUT) {
  stroke(ctx, x1, y1, x2, y2, w + 2.2, outline);
  stroke(ctx, x1, y1, x2, y2, w, color);
}

// Lengan 2 segmen (bahu → siku → tangan)
function arm(ctx, sx, sy, hx, hy, w, sleeve, hand, bend = 3, handR = 2.7, cuff) {
  const mx = (sx + hx) / 2;
  const my = (sy + hy) / 2;
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy) || 1;
  const ex = mx + (-dy / len) * bend;
  const ey = my + (dx / len) * bend + 1;
  limb(ctx, sx, sy, ex, ey, w, sleeve);
  limb(ctx, ex, ey, hx, hy, w, sleeve);
  if (cuff) {
    const cx = hx - (dx / len) * 2.6;
    const cy = hy - (dy / len) * 2.6;
    stroke(ctx, cx - (dy / len) * (w / 2 + 0.5), cy + (dx / len) * (w / 2 + 0.5), cx + (dy / len) * (w / 2 + 0.5), cy - (dx / len) * (w / 2 + 0.5), 2.4, cuff);
  }
  ell(ctx, hx, hy, handR, handR, hand, "skin", 0.2, OUT, 1);
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Kaki (dipakai karakter) ----------
function legs(S, pants, boots, o = {}) {
  const { ctx, ph, moving } = S;
  const s = Math.sin(ph) * moving;
  const defs = [
    { x: -3.6, dx: -s * 4, lift: Math.max(0, -s) * 3.2 },
    { x: 3.6, dx: s * 4, lift: Math.max(0, s) * 3.2 },
  ];
  for (const l of defs) {
    const x = l.x + l.dx * 0.5;
    const top = 1;
    const bot = 13.2 - l.lift;
    if (!o.hide) shape(ctx, (c) => rr(c, x - 3, top, 6, bot - top, 2.4), lin(ctx, x - 3, 0, x + 3, 0, [lighten(pants, 0.12), pants, darken(pants, 0.28)]), "cloth", 0.28);
    shape(ctx, (c) => rr(c, x - 3.3 + 0.8, bot - 4.6, 7.4, 5.4, 2), lin(ctx, 0, bot - 4, 0, bot + 1, [lighten(boots, 0.15), boots, darken(boots, 0.3)]), "leather", 0.35);
    if (o.cuff) stroke(ctx, x - 3.2, bot - 4.4, x + 3.2, bot - 4.4, 1.8, o.cuff);
  }
}

// ---------- Kepala ----------
function head(S, o = {}) {
  const { ctx } = S;
  const cy = -24 - S.bob;
  const r = 9.4;
  const skin = S.o.skin || "#e0a97a";
  const hair = S.o.hair || "#5a3620";
  if (o.hairBack) o.hairBack(cy);
  shape(ctx, (c) => c.arc(-1, cy, r, 0, Math.PI * 2), skin, null, 0, OUT, 1.4); // dasar
  // telinga
  ell(ctx, -8.4, cy + 1.5, 2, 2.6, darken(skin, 0.1), null, 0, OUT, 1);
  // pipi/wajah dengan gradien
  ctx.beginPath();
  ctx.arc(-1, cy, r - 0.5, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, -1, cy, 1, r, ["rgba(255,255,255,0.22)", "rgba(255,255,255,0)", "rgba(80,30,10,0.28)"], 3, -3);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = pat(ctx, "skin");
  ctx.fill();
  ctx.restore();

  if (S.up) {
    // tampak dari belakang: rambut menutup kepala
    shape(ctx, (c) => c.arc(-1, cy, r + 0.3, 0, Math.PI * 2), lin(ctx, 0, cy - r, 0, cy + r, [lighten(hair, 0.12), hair, darken(hair, 0.3)]), "hide", 0.2);
    return cy;
  }
  const look = clamp(Math.abs(Math.cos(S.o.aim)) * 1.6, 0, 1);
  const fx = look * 3.2 - 1;
  const ey = cy + 0.8;
  const px = Math.cos(S.o.aim) * S.dir * 0.9;
  const py = Math.sin(S.o.aim) * 0.9;
  for (const side of [-1, 1]) {
    const ex = fx + side * 3.3 * (side * look > 0 ? 0.9 : 1);
    ell(ctx, ex, ey, 2.2, 2.7, "#fdfdfd", null, 0, "rgba(0,0,0,0.5)", 0.8);
    ell(ctx, ex + px, ey + py, 1.3, 1.7, "#1f2937", null, 0, false);
    ell(ctx, ex + px - 0.5, ey + py - 0.7, 0.5, 0.5, "#fff", null, 0, false);
  }
  // alis + hidung + mulut
  stroke(ctx, fx - 5.2, ey - 3.8, fx - 1.4, ey - 3.6, 1.2, darken(hair, 0.1));
  stroke(ctx, fx + 1.4, ey - 3.6, fx + 5.2, ey - 3.8, 1.2, darken(hair, 0.1));
  stroke(ctx, fx + look * 0.7, ey + 1.6, fx + look * 0.7 + 0.6, ey + 3, 1, darken(skin, 0.25));
  if (S.shout) ell(ctx, fx + look * 0.8, cy + 6, 1.8, 1.5, "#4a1010", null, 0, OUT, 0.8);
  else {
    ctx.strokeStyle = darken(skin, 0.45);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(fx + look * 0.8, cy + 4.4, 2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ell(ctx, fx - 4.8, cy + 3.5, 1.7, 1.1, "rgba(240,90,90,0.28)", null, 0, false);
  ell(ctx, fx + 5, cy + 3.5, 1.7, 1.1, "rgba(240,90,90,0.28)", null, 0, false);
  return cy;
}

// ---------- Badan per class (digambar dalam ruang yang di-flip: +x = arah hadap) ----------
function bodyFighter(S) {
  const { ctx, bob, o } = S;
  const acc = o.color;
  const sway = S.moving ? Math.sin(S.ph) * 2.5 : Math.sin(S.now / 700) * 1;
  legs(S, "#4b3626", "#2c1f15", { cuff: "#8a6a3a" });
  // jubah di punggung
  shape(ctx, (c) => {
    c.moveTo(-5, -14 - bob);
    c.lineTo(-9.5, -14 - bob);
    c.quadraticCurveTo(-17 + sway, -2, -15 + sway * 1.6, 11);
    c.lineTo(-3, 9);
    c.closePath();
  }, lin(ctx, -15, -14, -3, 10, [lighten(acc, 0.12), acc, darken(acc, 0.4)]), "cloth", 0.3);
  // tunik kulit
  shape(ctx, (c) => rr(c, -8, -15 - bob, 16, 19, 3), lin(ctx, -8, -15, 8, 4, ["#86603f", "#5f4129", "#46301f"]), "leather", 0.38);
  // pelat dada
  shape(ctx, (c) => {
    c.moveTo(-7.2, -14.5 - bob);
    c.lineTo(7.2, -14.5 - bob);
    c.quadraticCurveTo(8.4, -6 - bob, 5.2, -1.2 - bob);
    c.lineTo(-5.2, -1.2 - bob);
    c.quadraticCurveTo(-8.4, -6 - bob, -7.2, -14.5 - bob);
  }, lin(ctx, -7, -14, 7, 0, ["#f1f5f9", "#aab4c3", "#6b7686"]), "metal", 0.3);
  stroke(ctx, 0, -14 - bob, 0, -2 - bob, 1, "rgba(255,255,255,0.55)");
  stroke(ctx, -5.5, -8 - bob, 5.5, -8 - bob, 0.8, "rgba(40,50,70,0.5)");
  for (const [rx, ry] of [[-4.6, -12.2], [4.6, -12.2], [-3.6, -3.4], [3.6, -3.4]]) ell(ctx, rx, ry + -bob, 0.8, 0.8, "#e2e8f0", null, 0, false);
  // sabuk
  shape(ctx, (c) => rr(c, -8.6, -0.2 - bob, 17.2, 3.8, 1), "#2b1c10", "leather", 0.4);
  shape(ctx, (c) => rr(c, -2.1, -0.6 - bob, 4.2, 4.6, 1), lin(ctx, 0, 0, 4, 4, ["#fde68a", "#d4a017", "#8a6508"]), null, 0, OUT, 0.9);
  // bahu baja
  for (const sx of [-9.6, 9.6]) {
    shape(ctx, (c) => c.arc(sx, -12 - bob, 4.8, Math.PI, 0), lin(ctx, sx - 5, -17, sx + 5, -9, ["#f1f5f9", "#9aa5b4", "#5e6878"]), "metal", 0.3);
    ell(ctx, sx, -12 - bob, 4.8, 1.6, darken("#9aa5b4", 0.3), null, 0, OUT, 0.8);
    stroke(ctx, sx - 3, -14 - bob, sx + 3, -14 - bob, 0.8, "rgba(255,255,255,0.5)");
  }
  const cy = head(S, {
    hairBack: (cy) => {
      shape(ctx, (c) => c.ellipse(-3, cy + 3, 9, 9.5, 0, 0, Math.PI * 2), darken(o.hair, 0.05), "hide", 0.2, OUT, 1);
    },
  });
  // helm
  const hy = cy - 1.5;
  shape(ctx, (c) => {
    c.arc(-1, hy, 10.6, Math.PI * 1.02, Math.PI * 1.98);
    c.lineTo(9.6, hy + 0.5);
    c.quadraticCurveTo(-1, hy - 3.2, -11.6, hy + 0.5);
    c.closePath();
  }, lin(ctx, -10, hy - 11, 10, hy, ["#f1f5f9", "#9aa5b4", "#5e6878"]), "metal", 0.3, OUT, 1.4);
  stroke(ctx, -1, hy - 10.4, -1, hy - 0.5, 1.4, "rgba(255,255,255,0.45)"); // jambul
  shape(ctx, (c) => rr(c, -11.8, hy - 0.8, 22.8, 2.6, 1), "#7b8696", "metal", 0.3, OUT, 0.9); // pinggir
  if (!S.up) {
    const look = clamp(Math.abs(Math.cos(o.aim)) * 1.6, 0, 1);
    shape(ctx, (c) => rr(c, look * 3.2 - 1.9, hy + 1, 2.3, 7, 1), "#aab4c3", "metal", 0.25, OUT, 0.8); // pelindung hidung
  }
  // plume (bulu helm warna pemain)
  const pl = S.moving ? Math.sin(S.ph + 1) * 2 : Math.sin(S.now / 500) * 1.2;
  shape(ctx, (c) => {
    c.moveTo(-1, hy - 10);
    c.bezierCurveTo(-5, hy - 18, -14 + pl, hy - 17, -16 + pl, hy - 8);
    c.bezierCurveTo(-11 + pl, hy - 11, -6, hy - 9, -2, hy - 5);
    c.closePath();
  }, lin(ctx, -16, hy - 18, -1, hy - 6, [lighten(acc, 0.3), acc, darken(acc, 0.35)]), "cloth", 0.25);
}

function bodyMage(S) {
  const { ctx, bob, o } = S;
  const sw = S.moving ? Math.sin(S.ph) * 1.6 : Math.sin(S.now / 600) * 0.5;
  // rambut panjang
  const cyH = -24 - bob;
  shape(ctx, (c) => {
    c.moveTo(-10, cyH - 2);
    c.quadraticCurveTo(-14, cyH + 10, -9 + sw, -6 - bob);
    c.lineTo(-2, -12 - bob);
    c.lineTo(-1, cyH);
    c.closePath();
  }, lin(ctx, -12, cyH, -2, -6, [lighten(o.hair, 0.1), o.hair, darken(o.hair, 0.35)]), "hide", 0.2);
  // jubah
  shape(ctx, (c) => {
    c.moveTo(-7, -14.5 - bob);
    c.lineTo(7, -14.5 - bob);
    c.quadraticCurveTo(10.5, -2, 14 + sw, 13);
    c.quadraticCurveTo(7, 16, 0, 13.4);
    c.quadraticCurveTo(-7, 16, -14 + sw, 13);
    c.quadraticCurveTo(-10.5, -2, -7, -14.5 - bob);
  }, lin(ctx, -12, -14, 12, 14, ["#9b72f5", "#6d36d6", "#3a1a82"]), "cloth", 0.32);
  // lipatan
  ctx.strokeStyle = "rgba(20,5,60,0.3)";
  ctx.lineWidth = 1.2;
  for (const fx of [-6, -1.5, 3.5, 8]) {
    ctx.beginPath();
    ctx.moveTo(fx * 0.5, 2);
    ctx.quadraticCurveTo(fx * 0.9, 8, fx * 1.4 + sw * 0.5, 13);
    ctx.stroke();
  }
  // trim emas di ujung bawah
  ctx.strokeStyle = "#e8b923";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13.4 + sw, 12.1);
  ctx.quadraticCurveTo(-7, 14.7, 0, 12.5);
  ctx.quadraticCurveTo(7, 14.7, 13.4 + sw, 12.1);
  ctx.stroke();
  // bintang kecil
  for (const [sx, sy] of [[-5, 4], [4, 7], [6, -2], [-2, 9]]) {
    ctx.fillStyle = "rgba(253,230,138,0.85)";
    ctx.beginPath();
    ctx.arc(sx, sy, 0.9, 0, 7);
    ctx.fill();
  }
  // selempang
  shape(ctx, (c) => rr(c, -8.2, -1.6 - bob, 16.4, 4.4, 1.5), lin(ctx, 0, -2, 0, 3, [lighten(o.color, 0.25), o.color, darken(o.color, 0.4)]), "cloth", 0.3);
  shape(ctx, (c) => rr(c, 5.5, 2.5 - bob, 2.8, 9, 1), darken(o.color, 0.15), "cloth", 0.3);
  // sepatu mengintip
  for (const [x, l] of [[-4, Math.max(0, -Math.sin(S.ph)) * S.moving], [4, Math.max(0, Math.sin(S.ph)) * S.moving]]) {
    shape(ctx, (c) => rr(c, x - 3.2 + 1, 12 - l * 3, 7, 4.5, 2), "#2b1a45", "leather", 0.3);
  }
  const cy = head(S);
  // topi penyihir
  const lean = S.moving ? Math.sin(S.ph) * 1.5 : Math.sin(S.now / 700) * 1;
  const by = cy - 4.8;
  shape(ctx, (c) => {
    c.moveTo(-9.5, by);
    c.quadraticCurveTo(-7, by - 14, 4 + lean, by - 22);
    c.quadraticCurveTo(10 + lean, by - 25, 13 + lean, by - 19);
    c.quadraticCurveTo(7, by - 19, 8.5, by - 11);
    c.quadraticCurveTo(9.5, by - 5, 9.5, by);
    c.closePath();
  }, lin(ctx, -9, by - 20, 10, by, ["#a78bfa", "#6d36d6", "#3a1a82"]), "cloth", 0.32);
  shape(ctx, (c) => c.ellipse(-0.5, by, 14.5, 4.2, 0, 0, Math.PI * 2), lin(ctx, 0, by - 4, 0, by + 4, ["#8b5cf6", "#4c2a9a", "#2b1666"]), "cloth", 0.3);
  shape(ctx, (c) => {
    c.moveTo(-8.6, by - 3);
    c.quadraticCurveTo(0, by - 7, 8.7, by - 3.2);
    c.lineTo(9.3, by - 0.5);
    c.quadraticCurveTo(0, by - 4, -9.2, by - 0.6);
    c.closePath();
  }, lin(ctx, -9, 0, 9, 0, [lighten(o.color, 0.2), o.color, darken(o.color, 0.3)]), "cloth", 0.3, OUT, 0.9);
  // bintang emas di topi
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr2 = i % 2 ? 1.2 : 2.7;
    ctx.lineTo(1 + Math.cos(a) * rr2, by - 8 + Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.fill();
}

function bodyMarksman(S) {
  const { ctx, bob, o } = S;
  const sway = S.moving ? Math.sin(S.ph) * 1.6 : Math.sin(S.now / 650) * 0.6;
  const cx = -1;
  // tabung panah di punggung
  ctx.save();
  ctx.translate(-9, -9 - bob);
  ctx.rotate(-0.35);
  for (const [ax, c] of [[-2.2, o.color], [0.2, "#f1f5f9"], [2.6, o.color]]) {
    stroke(ctx, ax, -6, ax * 0.9, -12, 1.3, "#8b5e34");
    shape(ctx, (g) => { g.moveTo(ax, -12); g.lineTo(ax - 2, -16); g.lineTo(ax + 2, -15); g.closePath(); }, c, null, 0, "rgba(0,0,0,0.5)", 0.7);
  }
  shape(ctx, (c) => rr(c, -4.6, -7, 9.2, 17, 2.4), lin(ctx, -4, 0, 5, 0, ["#9a6b3f", "#6b4526", "#47291a"]), "leather", 0.45);
  stroke(ctx, -4.6, 0, 4.6, 0, 1.2, "#2c1a10");
  ctx.restore();
  legs(S, "#4d4a2c", "#5a3a22", { cuff: "#7a5230" });
  // jubah pendek
  shape(ctx, (c) => {
    c.moveTo(-9.5, -15 - bob);
    c.lineTo(5, -15 - bob);
    c.quadraticCurveTo(-8, -4, -13 + sway, 6);
    c.lineTo(-9, 4);
    c.lineTo(-10, 8);
    c.closePath();
  }, lin(ctx, -13, -14, -3, 8, ["#3f6b3a", "#2c4e2a", "#1b3319"]), "cloth", 0.34);
  // tunik hijau
  shape(ctx, (c) => rr(c, -8, -15 - bob, 16, 19, 3), lin(ctx, -8, -15, 8, 4, ["#5c9a54", "#3f6b3a", "#2b4a28"]), "cloth", 0.32);
  // rompi kulit V
  shape(ctx, (c) => {
    c.moveTo(-7.8, -14.5 - bob);
    c.lineTo(-2.2, -14.5 - bob);
    c.lineTo(0, -8 - bob);
    c.lineTo(2.2, -14.5 - bob);
    c.lineTo(7.8, -14.5 - bob);
    c.lineTo(7.8, 2 - bob);
    c.lineTo(-7.8, 2 - bob);
    c.closePath();
  }, lin(ctx, -8, -14, 8, 2, ["#9a6b3f", "#6b4526", "#46291a"]), "leather", 0.42);
  for (let i = 0; i < 3; i++) stroke(ctx, -1.2, -12 - bob + i * 2.4, 1.2, -12 - bob + i * 2.4, 0.9, "#d6c3a0");
  // tali dada diagonal + sabuk + kantong
  stroke(ctx, -7, -14 - bob, 6.5, 1.5 - bob, 2.6, "#3a2414");
  shape(ctx, (c) => rr(c, -8.4, -0.2 - bob, 16.8, 3.4, 1), "#2f1d10", "leather", 0.4);
  shape(ctx, (c) => rr(c, 4.8, 0.6 - bob, 5.2, 5.6, 1.4), "#6b4526", "leather", 0.4);
  ell(ctx, 7.4, 2.4 - bob, 0.8, 0.8, "#d4a017", null, 0, false);
  // syal
  shape(ctx, (c) => rr(c, -6.8, -17.4 - bob, 13.6, 4.6, 2.2), lin(ctx, 0, -17, 0, -12, ["#e9d8b0", "#b99a62"]), "cloth", 0.35);
  const cy = head(S);
  // tudung (evenodd supaya wajah terlihat)
  const look = clamp(Math.abs(Math.cos(o.aim)) * 1.6, 0, 1);
  const fcx = S.up ? 0 : look * 2.4 + cx;
  ctx.beginPath();
  ctx.ellipse(-1.5, cy - 0.5, 12, 12.2, 0, 0, Math.PI * 2);
  if (!S.up) ctx.ellipse(fcx + 0.4, cy + 1.4, 6.9, 7.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, -12, cy - 12, 10, cy + 10, ["#5c9a54", "#335c31", "#1d3a1b"]);
  ctx.fill("evenodd");
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = pat(ctx, "cloth");
  ctx.fill("evenodd");
  ctx.restore();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  if (!S.up) {
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; // bayangan di tepi dalam tudung
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(fcx + 0.4, cy + 1.4, 6.9, 7.6, 0, 0.7 * Math.PI, 1.9 * Math.PI);
    ctx.stroke();
  }
  // ujung tudung runcing + bulu
  shape(ctx, (c) => {
    c.moveTo(-11, cy - 6);
    c.quadraticCurveTo(-14, cy - 12, -17 + sway, cy - 9);
    c.quadraticCurveTo(-12, cy - 3, -10, cy + 2);
    c.closePath();
  }, "#335c31", "cloth", 0.3);
  shape(ctx, (c) => {
    c.moveTo(-2, cy - 11.5);
    c.bezierCurveTo(-4, cy - 18, -10 + sway, cy - 21, -14 + sway, cy - 17);
    c.bezierCurveTo(-9, cy - 16, -6, cy - 13, -2, cy - 10);
    c.closePath();
  }, lin(ctx, -14, cy - 21, -2, cy - 10, [lighten(o.color, 0.35), o.color, darken(o.color, 0.3)]), "cloth", 0.2);
}

function bodySupport(S) {
  const { ctx, bob, o } = S;
  const sw = S.moving ? Math.sin(S.ph) * 1.4 : Math.sin(S.now / 600) * 0.5;
  const cyH = -24 - bob;
  // rambut panjang lembut
  shape(ctx, (c) => {
    c.moveTo(-9.5, cyH - 3);
    c.quadraticCurveTo(-15, cyH + 8, -10 + sw, -4 - bob);
    c.lineTo(-2, -11 - bob);
    c.lineTo(-1, cyH);
    c.closePath();
  }, lin(ctx, -12, cyH, -2, -4, [lighten(o.hair, 0.12), o.hair, darken(o.hair, 0.3)]), "hide", 0.2);
  legs(S, "#d6cfb8", "#6b4a2a", { cuff: "#d4a017" });
  // jubah putih
  shape(ctx, (c) => {
    c.moveTo(-7.5, -14.5 - bob);
    c.lineTo(7.5, -14.5 - bob);
    c.quadraticCurveTo(10.5, -2, 12.5 + sw, 10.5);
    c.quadraticCurveTo(6, 13, 0, 11);
    c.quadraticCurveTo(-6, 13, -12.5 + sw, 10.5);
    c.quadraticCurveTo(-10.5, -2, -7.5, -14.5 - bob);
  }, lin(ctx, -12, -14, 12, 12, ["#ffffff", "#f1ead4", "#cdbf9a"]), "cloth", 0.26);
  ctx.strokeStyle = "rgba(120,100,60,0.22)";
  ctx.lineWidth = 1.1;
  for (const fx of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(fx * 0.6, 0);
    ctx.quadraticCurveTo(fx, 6, fx * 1.3 + sw * 0.4, 10.5);
    ctx.stroke();
  }
  // trim emas
  ctx.strokeStyle = "#e8b923";
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(-12.2 + sw, 9.8);
  ctx.quadraticCurveTo(-6, 12.3, 0, 10.3);
  ctx.quadraticCurveTo(6, 12.3, 12.2 + sw, 9.8);
  ctx.stroke();
  // tabard tengah warna pemain + salib emas
  shape(ctx, (c) => {
    c.moveTo(-4.2, -14.5 - bob);
    c.lineTo(4.2, -14.5 - bob);
    c.lineTo(5, 10.6);
    c.quadraticCurveTo(0, 12.4, -5, 10.6);
    c.closePath();
  }, lin(ctx, -5, 0, 5, 0, [lighten(o.color, 0.22), o.color, darken(o.color, 0.35)]), "cloth", 0.3);
  ctx.strokeStyle = "#fde68a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -11 - bob);
  ctx.lineTo(0, -2.5 - bob);
  ctx.moveTo(-3.2, -8 - bob);
  ctx.lineTo(3.2, -8 - bob);
  ctx.stroke();
  // ikat pinggang + buku
  shape(ctx, (c) => rr(c, -8, -1.2 - bob, 16, 3.2, 1), "#b88a2c", "leather", 0.35);
  const bk = S.moving ? Math.sin(S.ph) * 0.8 : 0;
  shape(ctx, (c) => rr(c, 5.2 + bk, 1.6 - bob, 6.4, 8, 1), lin(ctx, 5, 0, 12, 0, ["#8a5a2c", "#5e3a1a"]), "leather", 0.4);
  stroke(ctx, 6.4 + bk, 2.6 - bob, 6.4 + bk, 8.4 - bob, 0.9, "#e8b923");
  ell(ctx, 8.8 + bk, 5.6 - bob, 1.1, 1.1, "#e8b923", null, 0, false);
  // kerah bahu emas
  shape(ctx, (c) => {
    c.moveTo(-8.6, -14 - bob);
    c.quadraticCurveTo(0, -18.5 - bob, 8.6, -14 - bob);
    c.lineTo(7.6, -11 - bob);
    c.quadraticCurveTo(0, -14.5 - bob, -7.6, -11 - bob);
    c.closePath();
  }, lin(ctx, 0, -18, 0, -11, ["#fff7d6", "#e8b923"]), "cloth", 0.25);
  const cy = head(S);
  // poni
  if (!S.up) {
    shape(ctx, (c) => {
      c.moveTo(-10, cy - 1);
      c.quadraticCurveTo(-8, cy - 11.5, 1, cy - 10.6);
      c.quadraticCurveTo(10, cy - 10, 9.6, cy - 3.2);
      c.quadraticCurveTo(5, cy - 7.5, -1, cy - 5.4);
      c.quadraticCurveTo(-6, cy - 4.4, -10, cy - 1);
      c.closePath();
    }, lin(ctx, -10, cy - 12, 8, cy - 3, [lighten(o.hair, 0.15), o.hair, darken(o.hair, 0.3)]), "hide", 0.2);
    // mahkota tipis + permata
    ctx.strokeStyle = "#f2c94c";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-1, cy - 0.5, 9.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    const look = clamp(Math.abs(Math.cos(o.aim)) * 1.6, 0, 1);
    ell(ctx, look * 3 - 1, cy - 9.8, 1.8, 2.2, "#4ade80", null, 0, "#92400e", 0.8);
    ell(ctx, look * 3 - 1.5, cy - 10.5, 0.6, 0.6, "#fff", null, 0, false);
  }
  // halo bercahaya
  const gl = 0.75 + 0.25 * Math.sin(S.now / 260);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(255,236,140,${0.8 * gl})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(-1, cy - 14.5, 8.4, 2.7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * gl})`;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

const BODIES = { fighter: bodyFighter, mage: bodyMage, marksman: bodyMarksman, support: bodySupport };
const SLEEVES = { fighter: "#6a4a30", mage: "#6d36d6", marksman: "#3f6b3a", support: "#f1ead4" };
const CUFFS = { fighter: "#aab4c3", mage: "#e8b923", marksman: "#6b4526", support: "#e8b923" };
const SWING_MS = { fighter: 240, mage: 440, marksman: 340, support: 480 };
export const ATTACK_ANIM_MS = SWING_MS;

// ---------- Senjata ----------
function drawSword(ctx, S, pose) {
  shape(ctx, (c) => {
    c.moveTo(6, -2.8);
    c.lineTo(31, -2.1);
    c.lineTo(38.5, 0);
    c.lineTo(31, 2.1);
    c.lineTo(6, 2.8);
    c.closePath();
  }, lin(ctx, 0, -3, 0, 3, ["#fafcff", "#cbd5e1", "#6b7a90"]), "metal", 0.25, "rgba(20,25,40,0.9)", 1.1);
  stroke(ctx, 8, 0, 33, 0, 1.1, "rgba(71,85,105,0.7)");
  stroke(ctx, 7, -2.1, 31, -1.5, 0.9, "rgba(255,255,255,0.85)");
  shape(ctx, (c) => rr(c, 3.8, -7, 3.6, 14, 1.6), lin(ctx, 0, -7, 0, 7, ["#fde68a", "#d4a017", "#8a6508"]), null, 0, OUT, 1);
  shape(ctx, (c) => rr(c, -4.5, -2, 9, 4, 1.6), "#4a2f1a", "leather", 0.4);
  stroke(ctx, -2, -2, -2, 2, 0.8, "#1c0f06");
  stroke(ctx, 1, -2, 1, 2, 0.8, "#1c0f06");
  ell(ctx, -5.6, 0, 2.5, 2.5, lin(ctx, -8, -2, -3, 2, ["#fde68a", "#a97c0c"]), null, 0, OUT, 0.9);
  if (pose.a >= 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * Math.sin(Math.PI * pose.a);
    stroke(ctx, 8, 0, 37, 0, 4, "rgba(255,240,200,0.8)");
    ctx.restore();
  }
}

function drawShield(ctx, S, x, y) {
  const acc = S.o.color;
  ctx.save();
  ctx.translate(x, y);
  shape(ctx, (c) => c.ellipse(0, 0, 6.6, 8.6, 0, 0, Math.PI * 2), lin(ctx, -6, -8, 6, 8, ["#e5e7eb", "#8c97a8", "#566174"]), "metal", 0.3, OUT, 1.5);
  shape(ctx, (c) => c.ellipse(0, 0, 4.9, 6.8, 0, 0, Math.PI * 2), lin(ctx, -5, -7, 5, 7, [lighten(acc, 0.2), acc, darken(acc, 0.45)]), "cloth", 0.3, "rgba(0,0,0,0.5)", 0.8);
  stroke(ctx, -4, 0, 4, 0, 1.2, "rgba(255,255,255,0.4)");
  stroke(ctx, 0, -6, 0, 6, 1.2, "rgba(255,255,255,0.4)");
  ell(ctx, 0, 0, 2, 2.4, lin(ctx, -2, -2, 2, 2, ["#fff3b0", "#d4a017", "#7a5606"]), null, 0, OUT, 0.8);
  ctx.restore();
}

function drawBow(ctx, S, pose) {
  const a = pose.a;
  let pull = 5;
  let nocked = true;
  if (a >= 0) {
    nocked = a > 0.5;
    pull = a < 0.5 ? Math.sin(a * 60) * 2.6 * (1 - a * 2) : 5 * ((a - 0.5) / 0.5);
  }
  // batang busur
  const limb2 = (c) => {
    c.moveTo(-1, -22);
    c.quadraticCurveTo(13, -12, 6, 0);
    c.quadraticCurveTo(13, 12, -1, 22);
  };
  ctx.lineCap = "round";
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 5.4;
  ctx.beginPath();
  limb2(ctx);
  ctx.stroke();
  ctx.strokeStyle = lin(ctx, 0, -22, 10, 22, ["#c28a52", "#8b5a2b", "#5a3518"]);
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  limb2(ctx);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,230,180,0.5)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.quadraticCurveTo(12, -11, 7.2, -1);
  ctx.stroke();
  shape(ctx, (c) => rr(c, 3.4, -4, 5.4, 8, 1.6), "#3a2414", "leather", 0.45, OUT, 0.9);
  ell(ctx, -1, -22, 1.4, 1.4, "#e5e7eb", null, 0, OUT, 0.7);
  ell(ctx, -1, 22, 1.4, 1.4, "#e5e7eb", null, 0, OUT, 0.7);
  // tali
  const nx = 3 - pull;
  ctx.strokeStyle = "rgba(240,235,215,0.95)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1, -22);
  ctx.lineTo(nx, 0);
  ctx.lineTo(-1, 22);
  ctx.stroke();
  if (nocked) {
    stroke(ctx, nx, 0, 27, 0, 1.9, "#a97a45");
    shape(ctx, (c) => {
      c.moveTo(27, -3);
      c.lineTo(34, 0);
      c.lineTo(27, 3);
      c.lineTo(29, 0);
      c.closePath();
    }, lin(ctx, 27, -3, 34, 3, ["#f8fafc", "#94a3b8"]), "metal", 0.2, OUT, 0.8);
    for (const sgn of [-1, 1]) {
      shape(ctx, (c) => {
        c.moveTo(nx + 1, 0);
        c.lineTo(nx + 7, sgn * 3.3);
        c.lineTo(nx + 9, sgn * 3);
        c.lineTo(nx + 6, 0);
        c.closePath();
      }, sgn < 0 ? S.o.color : "#f1f5f9", null, 0, "rgba(0,0,0,0.5)", 0.6);
    }
  }
}

function drawStaffMage(ctx, S, pose) {
  const { now } = S;
  const flare = pose.a >= 0 ? Math.sin(Math.PI * pose.a) : 0;
  shape(ctx, (c) => rr(c, -14, -1.9, 54, 3.8, 1.8), lin(ctx, 0, -2, 0, 2, ["#b07a45", "#7a4e28", "#4a2c14"]), "leather", 0.35, OUT, 1);
  for (const kx of [-3, 12, 22]) ell(ctx, kx, 0, 1.3, 2.4, "#4a2c14", null, 0, false);
  for (const rx of [30, 33]) stroke(ctx, rx, -2.6, rx, 2.6, 1.7, "#e8b923");
  // cakar
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(37, 0);
    ctx.quadraticCurveTo(40, sgn * 8.4, 47, sgn * 6);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c9972a";
  ctx.lineWidth = 1.8;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(37, 0);
    ctx.quadraticCurveTo(40, sgn * 8.4, 47, sgn * 6);
    ctx.stroke();
  }
  // kristal api
  const pr = 5.6 * (1 + flare * 0.5) * (0.95 + 0.05 * Math.sin(now / 120));
  ell(ctx, 43.5, 0, pr, pr, rad(ctx, 43.5, 0, 0.5, pr, ["#fff7ed", "#fdba74", "#ea580c", "#7f1d1d"], -1.4, -1.4), null, 0, "rgba(90,20,10,0.9)", 1);
  ell(ctx, 42, -1.8, 1.5, 1.1, "rgba(255,255,255,0.85)", null, 0, false);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const gr = 15 + flare * 18 + Math.sin(now / 150) * 1.5;
  const g = ctx.createRadialGradient(43.5, 0, 0, 43.5, 0, gr);
  g.addColorStop(0, `rgba(255,170,60,${0.6 + flare * 0.4})`);
  g.addColorStop(1, "rgba(255,80,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(43.5 - gr, -gr, gr * 2, gr * 2);
  ctx.restore();
}

function drawStaffSupport(ctx, S, pose) {
  const { now } = S;
  const flare = pose.a >= 0 ? Math.sin(Math.PI * pose.a) : 0;
  shape(ctx, (c) => rr(c, -14, -1.7, 54, 3.4, 1.7), lin(ctx, 0, -2, 0, 2, ["#fff2b8", "#d4a017", "#8a6508"]), "metal", 0.2, OUT, 1);
  for (const rx of [8, 20]) stroke(ctx, rx, -2.4, rx, 2.4, 1.6, "#fff7d6");
  // sayap kecil di atas
  for (const sgn of [-1, 1]) {
    shape(ctx, (c) => {
      c.moveTo(39, 0);
      c.bezierCurveTo(40, sgn * 6, 44, sgn * 12, 51, sgn * 11);
      c.bezierCurveTo(48, sgn * 8, 47, sgn * 4, 44, sgn * 2);
      c.closePath();
    }, lin(ctx, 40, 0, 51, sgn * 11, ["#ffffff", "#e2e8f0", "#bcc6d6"]), "cloth", 0.2, "rgba(60,70,90,0.8)", 0.9);
  }
  // cincin emas
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(45, 0, 6.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = lin(ctx, 38, -7, 52, 7, ["#fff7d6", "#e8b923", "#8a6508"]);
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.arc(45, 0, 6.8, 0, Math.PI * 2);
  ctx.stroke();
  const pr = 4.2 * (1 + flare * 0.5);
  ell(ctx, 45, 0, pr, pr, rad(ctx, 45, 0, 0.3, pr, ["#ffffff", "#bbf7d0", "#22c55e"], -1, -1), null, 0, false);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const gr = 16 + flare * 20 + Math.sin(now / 170) * 1.5;
  const g = ctx.createRadialGradient(45, 0, 0, 45, 0, gr);
  g.addColorStop(0, `rgba(120,255,170,${0.55 + flare * 0.4})`);
  g.addColorStop(1, "rgba(40,200,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(45 - gr, -gr, gr * 2, gr * 2);
  ctx.restore();
}

// Pose senjata: sudut, posisi tangan, dan progres animasi (a: 0..1, -1 = tidak menyerang)
function weaponPose(S) {
  const { o, dir, bob } = S;
  const dur = SWING_MS[o.cls] || 300;
  const a = o.atk !== undefined && o.atk >= 0 && o.atk < dur ? o.atk / dur : -1;
  const aim = o.aim;
  let ang = aim;
  let hx = Math.cos(aim) * 9;
  let hy = -8 - bob + Math.sin(aim) * 6.5;
  if (o.cls === "fighter") {
    const rest = aim - 0.75 * dir;
    if (a >= 0) {
      const t = ease(clamp(a * 1.25, 0, 1));
      ang = aim + dir * (-1.55 + 2.8 * t);
      hx += Math.cos(aim) * 6 * Math.sin(Math.PI * a);
      hy += Math.sin(aim) * 4 * Math.sin(Math.PI * a);
    } else ang = rest + (S.moving ? Math.sin(S.ph * 2) * 0.05 : 0);
  } else if (o.cls === "mage" || o.cls === "support") {
    const up = dir > 0 ? -1.2 : -Math.PI + 1.2;
    const restV = [Math.cos(up), Math.sin(up)];
    let t = 0;
    if (a >= 0) t = a < 0.25 ? a / 0.25 : 1 - Math.max(0, (a - 0.55) / 0.45);
    t = clamp(t, 0, 1);
    const vx = restV[0] * (1 - t) + Math.cos(aim) * t;
    const vy = restV[1] * (1 - t) + Math.sin(aim) * t;
    ang = Math.atan2(vy, vx);
    hx = dir * 8;
    hy = -6 - bob;
    hx += Math.cos(aim) * 5 * t;
    hy += Math.sin(aim) * 3 * t;
  }
  return { ang, hx, hy, a };
}

function drawHeld(S, pose) {
  const { ctx, o, dir } = S;
  ctx.save();
  ctx.translate(pose.hx, pose.hy);
  ctx.rotate(pose.ang);
  if (Math.cos(pose.ang) < 0) ctx.scale(1, -1);
  if (o.cls === "fighter") drawSword(ctx, S, pose);
  else if (o.cls === "marksman") drawBow(ctx, S, pose);
  else if (o.cls === "mage") drawStaffMage(ctx, S, pose);
  else drawStaffSupport(ctx, S, pose);
  ctx.restore();

  // jejak tebasan pedang
  if (o.cls === "fighter" && pose.a >= 0) {
    const t = ease(clamp(pose.a * 1.25, 0, 1));
    const a0 = o.aim + dir * -1.55;
    const a1 = o.aim + dir * (-1.55 + 2.8 * t);
    ctx.save();
    ctx.translate(Math.cos(o.aim) * 4, -8 - S.bob + Math.sin(o.aim) * 3);
    ctx.scale(1, 0.82);
    const fade = 1 - pose.a;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "lighter";
    for (const [r, w, al] of [[34, 11, 0.18], [33, 6, 0.4], [32, 2.6, 0.9]]) {
      ctx.strokeStyle = `rgba(255,245,215,${al * fade})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- Karakter pemain ----------
// o: { cls, aim, color, skin, hair, walk, moving(0..1), atk(ms sejak serang / -1), dead }
export function drawCharacter(ctx, o, now) {
  const dir = Math.cos(o.aim) >= 0 ? 1 : -1;
  const up = Math.sin(o.aim) < -0.4;
  const moving = o.moving || 0;
  const ph = o.walk || 0;
  const bob = moving ? Math.abs(Math.sin(ph)) * 2.2 * moving : Math.sin(now / 520) * 0.6;
  const S = { ctx, o, now, dir, up, ph, moving, bob, shout: o.atk !== undefined && o.atk >= 0 && o.atk < 220 };
  const cls = o.cls in BODIES ? o.cls : "fighter";
  o.cls = cls;

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 15, 14, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (o.dead) {
    ctx.globalAlpha = 0.55;
    ctx.translate(0, 12);
    ctx.rotate(dir * Math.PI * 0.46);
    ctx.translate(0, -6);
  }
  const pose = weaponPose(S);
  const sleeve = SLEEVES[cls];
  const shoulderY = -11.5 - bob;
  const drawArms = () => {
    // lengan belakang (+ perisai untuk Fighter)
    const bx = -dir * 8.8 + (moving ? -Math.sin(ph) * 2.6 * dir : 0);
    const by = -3 - bob;
    arm(ctx, -dir * 6.6, shoulderY, bx, by, 3.4, sleeve, o.skin, 2, 2.4, CUFFS[cls]);
    if (cls === "fighter") drawShield(ctx, S, -dir * 11.5, -6 - bob);
    // lengan senjata
    arm(ctx, dir * 6.6, shoulderY, pose.hx, pose.hy, 3.6, sleeve, o.skin, 2.6, 2.7, CUFFS[cls]);
  };
  if (up) {
    drawArms();
    drawHeld(S, pose);
  }
  ctx.save();
  ctx.scale(dir, 1);
  BODIES[cls](S);
  ctx.restore();
  if (!up) {
    drawArms();
    drawHeld(S, pose);
  }
  ctx.restore();
}

// =====================================================================
// MONSTER
// o: { kind, r, face, walk, moving, atk(ms sejak serang / -1), aggro, id, dead }
// =====================================================================
export const MONSTER_ATTACK_MS = { slime: 280, skeleton: 340, orc: 520 };

function drawSlime(ctx, o, now) {
  const k = o.r / 14;
  ctx.scale(k, k);
  const t = now * 0.0065 + (o.id % 97);
  const dur = MONSTER_ATTACK_MS.slime;
  const a = o.atk !== undefined && o.atk >= 0 && o.atk < dur ? o.atk / dur : -1;
  const lunge = a >= 0 ? Math.sin(Math.PI * a) : 0;
  const hop = o.moving ? Math.abs(Math.sin(o.walk * 0.9)) : 0;
  let sx = 1 + 0.08 * Math.sin(t) + lunge * 0.28 - hop * 0.1;
  let sy = 1 / sx + hop * 0.22;
  const ox = Math.cos(o.face) * 9 * lunge;
  const oy = Math.sin(o.face) * 5 * lunge - hop * 7;

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0 + ox * 0.4, 12, 14 * sx * (1 - hop * 0.15), 5 * (1 - hop * 0.2), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ox, oy);
  const body = (c) => {
    c.moveTo(-14 * sx, 10);
    c.bezierCurveTo(-17 * sx, -6, -9 * sx, -15 * sy, 0, -15 * sy);
    c.bezierCurveTo(9 * sx, -15 * sy, 17 * sx, -6, 14 * sx, 10);
    c.quadraticCurveTo(8 * sx, 13.5, 0, 12);
    c.quadraticCurveTo(-8 * sx, 13.5, -14 * sx, 10);
    c.closePath();
  };
  shape(ctx, body, rad(ctx, 0, 0, 1, 24, ["rgba(210,255,225,0.97)", "rgba(80,225,135,0.94)", "rgba(24,140,70,0.95)", "rgba(10,80,40,0.97)"], -5, -8), "slime", 0.4, "#0d4a26", 1.8);
  // inti & gelembung di dalam badan
  ell(ctx, 1, 6, 9 * sx, 4, "rgba(10,90,45,0.32)", null, 0, false);
  for (const [bx, by, br, ph] of [[-8, 5, 2.2, 0], [8.5, 6, 1.7, 2], [-1.5, 8.5, 1.3, 4], [11, -1, 1.1, 1]]) {
    const yy = by + Math.sin(t * 1.3 + ph) * 1.6;
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(bx, yy, br, 0, 7);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(bx - br * 0.3, yy - br * 0.3, br * 0.35, 0, 7);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(-3, 8.2 + Math.sin(t) * 0.8);
  ctx.rotate(0.1 + Math.sin(t * 0.7) * 0.12);
  stroke(ctx, -3.2, 0, 3.2, 0, 1.6, "rgba(245,245,235,0.75)");
  ell(ctx, -3.4, 0, 1.2, 1.2, "rgba(245,245,235,0.75)", null, 0, false);
  ell(ctx, 3.4, 0, 1.2, 1.2, "rgba(245,245,235,0.75)", null, 0, false);
  ctx.restore();
  // kilap
  ell(ctx, -7.5, -9, 4.8 * sx, 2.5, "rgba(255,255,255,0.78)", null, 0, false, 0, -0.6);
  ell(ctx, -2, -12, 1.5, 1.2, "rgba(255,255,255,0.9)", null, 0, false);
  // wajah
  const lx = Math.cos(o.face) * 1.5;
  const ly = Math.sin(o.face) * 1.2;
  for (const ex of [-5.2, 5.2]) {
    ell(ctx, ex, -2.5, 3.5, 4.4, "#ffffff", null, 0, "rgba(10,70,35,0.7)", 0.9);
    ell(ctx, ex + lx, -2.2 + ly, 1.9, 2.5, "#10261a", null, 0, false);
    ell(ctx, ex + lx - 0.6, -3.1 + ly, 0.7, 0.7, "#fff", null, 0, false);
  }
  const angry = o.aggro || a >= 0;
  stroke(ctx, -9, angry ? -9.2 : -8, -2.2, angry ? -5.6 : -7.4, 1.7, "#0d4a26");
  stroke(ctx, 9, angry ? -9.2 : -8, 2.2, angry ? -5.6 : -7.4, 1.7, "#0d4a26");
  if (a >= 0) {
    ell(ctx, 0, 5.6, 3.8, 2.6 + lunge * 1.2, "#2a0a12", null, 0, "#0d4a26", 1);
    ell(ctx, 0, 6.6, 2, 1.1, "#f87171", null, 0, false);
  } else {
    ctx.strokeStyle = "#0d4a26";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, angry ? 7 : 4.5, 3.2, angry ? 1.2 * Math.PI : 0.15 * Math.PI, angry ? 1.8 * Math.PI : 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
  // tetesan di tanah
  for (const [dx, dy, w] of [[-17, 11.5, 3.4], [16.5, 12, 2.6], [-9, 14, 2.2]]) ell(ctx, dx * sx, dy, w, w * 0.5, "rgba(60,200,110,0.85)", null, 0, "#0d4a26", 0.8);
}

function boneColors() {
  return ["#fbfaf5", "#dcd7c9", "#a9a291"];
}

function drawSkeleton(ctx, o, now) {
  const k = o.r / 15;
  ctx.scale(k, k);
  const dir = Math.cos(o.face) >= 0 ? 1 : -1;
  const up = Math.sin(o.face) < -0.4;
  const moving = o.moving || 0;
  const ph = o.walk || 0;
  const bob = moving ? Math.abs(Math.sin(ph)) * 1.8 * moving : Math.sin(now / 480 + o.id) * 0.6;
  const dur = MONSTER_ATTACK_MS.skeleton;
  const a = o.atk !== undefined && o.atk >= 0 && o.atk < dur ? o.atk / dur : -1;
  const [b0, b1, b2] = boneColors();
  const boneG = (x0, y0, x1, y1) => lin(ctx, x0, y0, x1, y1, [b0, b1, b2]);
  const id = o.id;

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 15, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (o.dead) ctx.globalAlpha = 0.5;
  const aim = o.face;
  const pose = (() => {
    let ang = aim - 0.8 * dir;
    let hx = Math.cos(aim) * 8;
    let hy = -8 - bob + Math.sin(aim) * 6;
    if (a >= 0) {
      const t = ease(clamp(a * 1.2, 0, 1));
      ang = aim + dir * (-1.7 + 3.0 * t);
      hx += Math.cos(aim) * 5 * Math.sin(Math.PI * a);
      hy += Math.sin(aim) * 3 * Math.sin(Math.PI * a);
    }
    return { ang, hx, hy };
  })();

  const drawSword = () => {
    ctx.save();
    ctx.translate(pose.hx, pose.hy);
    ctx.rotate(pose.ang);
    if (Math.cos(pose.ang) < 0) ctx.scale(1, -1);
    shape(ctx, (c) => {
      c.moveTo(5, -2.4);
      c.lineTo(15, -2.6);
      c.lineTo(18, -1.4);
      c.lineTo(24, -2.2);
      c.lineTo(31, -0.6);
      c.lineTo(33, 1);
      c.lineTo(24, 2.4);
      c.lineTo(17, 2.1);
      c.lineTo(5, 2.4);
      c.closePath();
    }, lin(ctx, 0, -3, 0, 3, ["#b9b9b2", "#8a7a63", "#5f4a37"]), "rust", 0.7, "rgba(30,20,10,0.9)", 1);
    shape(ctx, (c) => rr(c, 3.4, -5.4, 3, 10.8, 1.2), "#5f4a37", "rust", 0.6, OUT, 0.9);
    shape(ctx, (c) => rr(c, -3.4, -1.8, 7, 3.6, 1.4), "#3a2414", "leather", 0.4);
    ctx.restore();
    if (a >= 0) {
      const t = ease(clamp(a * 1.2, 0, 1));
      ctx.save();
      ctx.translate(Math.cos(aim) * 3, -8 - bob + Math.sin(aim) * 2);
      ctx.scale(1, 0.82);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(255,220,200,${0.7 * (1 - a)})`;
      ctx.lineWidth = 3;
      const a0 = aim + dir * -1.7;
      const a1 = aim + dir * (-1.7 + 3.0 * t);
      ctx.beginPath();
      ctx.arc(0, 0, 27, Math.min(a0, a1), Math.max(a0, a1));
      ctx.stroke();
      ctx.restore();
    }
  };
  const drawArms = () => {
    const bx = -dir * 8 + (moving ? -Math.sin(ph) * 2.4 * dir : 0);
    arm(ctx, -dir * 6, -11.5 - bob, bx, -2 - bob, 2.3, b1, b1, 2, 2.1);
    arm(ctx, dir * 6, -11.5 - bob, pose.hx, pose.hy, 2.5, b1, b1, 2.4, 2.2);
  };

  if (up) {
    drawArms();
    drawSword();
  }
  ctx.save();
  ctx.scale(dir, 1);
  // kaki tulang
  const sw = Math.sin(ph) * moving;
  for (const [hx, s] of [[-2.8, -sw], [2.8, sw]]) {
    const kx = hx + s * 2.2;
    const fx = hx + s * 4;
    const lift = Math.max(0, s) * 2.4;
    limb(ctx, hx, 3, kx, 8.5 - lift * 0.5, 2.6, b1);
    limb(ctx, kx, 8.5 - lift * 0.5, fx, 13.2 - lift, 2.2, b1);
    ell(ctx, kx, 8.5 - lift * 0.5, 2, 2, boneG(kx - 2, 6, kx + 2, 10), "bone", 0.4, OUT, 1);
    shape(ctx, (c) => rr(c, fx - 2.4, 12 - lift, 6.6, 2.8, 1.2), boneG(fx, 12, fx, 15), "bone", 0.4, OUT, 1);
  }
  // pinggul
  shape(ctx, (c) => {
    c.moveTo(-5.5, 0 - bob);
    c.quadraticCurveTo(0, -1.8 - bob, 5.5, 0 - bob);
    c.lineTo(3.8, 4.4 - bob);
    c.quadraticCurveTo(0, 2.6 - bob, -3.8, 4.4 - bob);
    c.closePath();
  }, boneG(-5, 0, 5, 4), "bone", 0.4, OUT, 1.1);
  // tulang punggung + sangkar rusuk
  ell(ctx, 0, -8 - bob, 7.4, 7.8, "#14100c", null, 0, false);
  stroke(ctx, 0, -14.5 - bob, 0, 0 - bob, 2.1, b1);
  for (let i = 0; i < 5; i++) ell(ctx, 0, -13 - bob + i * 2.8, 1.5, 1.1, b0, null, 0, "rgba(0,0,0,0.5)", 0.6);
  for (let i = 0; i < 4; i++) {
    const y = -12.4 - bob + i * 2.9;
    const w = 6.6 - i * 0.6;
    for (const sgn of [-1, 1]) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sgn * 0.8, y);
      ctx.quadraticCurveTo(sgn * w * 1.05, y - 0.8, sgn * w, y + 2.6);
      ctx.stroke();
      ctx.strokeStyle = i % 2 ? b1 : b0;
      ctx.lineWidth = 1.9;
      ctx.stroke();
    }
  }
  stroke(ctx, -8.4, -13.6 - bob, 8.4, -13.6 - bob, 2.6, b1);
  for (const sx of [-8.4, 8.4]) ell(ctx, sx, -13.4 - bob, 2.3, 2.3, boneG(sx - 2, -15, sx + 2, -11), "bone", 0.4, OUT, 1);
  // kain compang-camping + tali pinggang
  shape(ctx, (c) => {
    c.moveTo(-5.4, 1 - bob);
    c.lineTo(5.4, 1 - bob);
    c.lineTo(6.6, 10);
    c.lineTo(3.4, 8);
    c.lineTo(1, 12.4);
    c.lineTo(-2, 8.6);
    c.lineTo(-6.8, 11);
    c.closePath();
  }, lin(ctx, 0, 0, 0, 12, ["#7a3a3a", "#4a1c1c"]), "cloth", 0.4, "rgba(10,0,0,0.8)", 1);
  stroke(ctx, -5.6, 1 - bob, 5.6, 1 - bob, 1.8, "#6b4a2a");
  // tengkorak
  const cy = -24 - bob;
  const jaw = a >= 0 ? 3.2 * Math.sin(Math.PI * Math.min(1, a * 1.6)) : 0;
  if (!up) {
    const look = clamp(Math.abs(Math.cos(aim)) * 1.6, 0, 1);
    const fx = look * 2.6 - 1;
    // rahang
    shape(ctx, (c) => {
      c.moveTo(fx - 5.8, cy + 3.8 + jaw * 0.2);
      c.lineTo(fx + 5.8, cy + 3.8 + jaw * 0.2);
      c.lineTo(fx + 4.6, cy + 8.6 + jaw);
      c.lineTo(fx - 4.6, cy + 8.6 + jaw);
      c.closePath();
    }, boneG(fx - 5, cy + 4, fx + 5, cy + 9), "bone", 0.4, OUT, 1.1);
    for (let i = -2; i <= 2; i++) stroke(ctx, fx + i * 2, cy + 4.6 + jaw * 0.3, fx + i * 2, cy + 7.6 + jaw * 0.9, 0.9, "#2a2218");
  }
  shape(ctx, (c) => c.ellipse(-1, cy, 8.8, 8.4, 0, 0, Math.PI * 2), rad(ctx, -1, cy, 1, 10, [b0, b1, b2], -3, -3), "bone", 0.5, OUT, 1.4);
  if (!up) {
    const look = clamp(Math.abs(Math.cos(aim)) * 1.6, 0, 1);
    const fx = look * 2.6 - 1;
    for (const side of [-1, 1]) {
      const ex = fx + side * 3.3;
      ell(ctx, ex, cy + 0.6, 2.7, 3.2, "#0a0707", null, 0, false);
    }
    shape(ctx, (c) => { c.moveTo(fx, cy + 3.4); c.lineTo(fx - 1.2, cy + 5.6); c.lineTo(fx + 1.2, cy + 5.6); c.closePath(); }, "#0a0707", null, 0, false);
    stroke(ctx, fx + 4.6, cy - 6, fx + 2.6, cy - 2, 0.9, "rgba(40,30,20,0.6)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gl = 0.7 + 0.3 * Math.sin(now / 200 + id) + (o.aggro ? 0.25 : 0);
    for (const side of [-1, 1]) {
      const ex = fx + side * 3.3;
      const g = ctx.createRadialGradient(ex, cy + 0.8, 0, ex, cy + 0.8, 5);
      g.addColorStop(0, `rgba(255,60,40,${0.95 * gl})`);
      g.addColorStop(1, "rgba(255,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(ex - 5, cy - 4, 10, 10);
    }
    ctx.restore();
  }
  // helm berkarat (sebagian skeleton)
  if (id % 2 === 0) {
    shape(ctx, (c) => {
      c.arc(-1, cy - 2.2, 9.6, Math.PI * 1.02, Math.PI * 1.98);
      c.lineTo(8.6, cy - 1.4);
      c.lineTo(-10.6, cy - 1.4);
      c.closePath();
    }, lin(ctx, -10, cy - 11, 10, cy, ["#9a9a92", "#6b6a64", "#4a463e"]), "rust", 0.75, OUT, 1.3);
    shape(ctx, (c) => rr(c, -12, cy - 2.6, 22, 2.4, 1), "#6b6a64", "rust", 0.7, OUT, 0.9);
    stroke(ctx, -5, cy - 9.5, -2, cy - 6.5, 1, "rgba(20,15,10,0.7)");
  }
  ctx.restore();
  if (!up) {
    drawArms();
    drawSword();
  }
  ctx.restore();
}

function drawOrc(ctx, o, now) {
  const k = o.r / 19;
  ctx.scale(k, k);
  const dir = Math.cos(o.face) >= 0 ? 1 : -1;
  const up = Math.sin(o.face) < -0.4;
  const moving = o.moving || 0;
  const ph = o.walk || 0;
  const bob = moving ? Math.abs(Math.sin(ph)) * 2 * moving : Math.sin(now / 560 + o.id) * 0.8;
  const dur = MONSTER_ATTACK_MS.orc;
  const a = o.atk !== undefined && o.atk >= 0 && o.atk < dur ? o.atk / dur : -1;
  const skin = "#6f9c3a";
  const sk = (x0, y0, x1, y1) => lin(ctx, x0, y0, x1, y1, ["#a6cf63", skin, "#3f6322"]);
  const aim = o.face;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 17, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (o.dead) ctx.globalAlpha = 0.5;

  // pose kapak: angkat dulu (wind-up) lalu hantam
  let ang = aim - 0.9 * dir;
  let hx = Math.cos(aim) * 11;
  let hy = -8 - bob + Math.sin(aim) * 7;
  if (a >= 0) {
    const wind = a < 0.45 ? ease(a / 0.45) : 1;
    const smash = a < 0.45 ? 0 : ease((a - 0.45) / 0.55);
    ang = aim + dir * (-0.9 - 1.1 * wind + 3.4 * smash);
    hx -= Math.cos(aim) * 5 * wind;
    hx += Math.cos(aim) * 11 * smash;
    hy += Math.sin(aim) * 6 * smash - 4 * wind;
  }
  const sleeveSkin = skin;
  const drawCleaver = () => {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
    shape(ctx, (c) => rr(c, -6, -2.2, 17, 4.4, 2), "#4a2f1a", "leather", 0.45);
    stroke(ctx, 2, -2.2, 2, 2.2, 1, "#1c0f06");
    stroke(ctx, 6, -2.2, 6, 2.2, 1, "#1c0f06");
    shape(ctx, (c) => {
      c.moveTo(10, -3.4);
      c.lineTo(28, -9.5);
      c.lineTo(34, -8);
      c.lineTo(36, -3);
      c.lineTo(34, 2);
      c.lineTo(38, 6.5);
      c.lineTo(30, 10.5);
      c.lineTo(10, 3.6);
      c.closePath();
    }, lin(ctx, 10, -10, 36, 10, ["#cfd5dc", "#7d8794", "#434a56"]), "metal", 0.4, "rgba(15,15,25,0.95)", 1.4);
    stroke(ctx, 12, 0, 33, 0, 1.2, "rgba(30,36,48,0.6)");
    ctx.fillStyle = "rgba(110,25,25,0.55)";
    ctx.beginPath();
    ctx.ellipse(30, 4, 5, 2.6, 0.2, 0, 7);
    ctx.fill();
    ell(ctx, 18, -2, 1.1, 1.1, "#e5e7eb", null, 0, false);
    ctx.restore();
    if (a >= 0 && a > 0.45) {
      const smash = ease((a - 0.45) / 0.55);
      const a0 = aim + dir * (-0.9 - 1.1);
      const a1 = aim + dir * (-0.9 - 1.1 + 3.4 * smash);
      ctx.save();
      ctx.translate(Math.cos(aim) * 2, -8 - bob + Math.sin(aim) * 2);
      ctx.scale(1, 0.82);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const [r, w, al] of [[36, 12, 0.18], [35, 5, 0.5]]) {
        ctx.strokeStyle = `rgba(255,190,140,${al * (1 - a)})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
      ctx.restore();
    }
  };
  const drawArms = () => {
    const bx = -dir * 12 + (moving ? -Math.sin(ph) * 3 * dir : 0);
    arm(ctx, -dir * 10, -12 - bob, bx, -1 - bob, 6.2, sleeveSkin, sleeveSkin, 2, 3.4, "#3a3f4a");
    arm(ctx, dir * 10, -12 - bob, hx, hy, 6.6, sleeveSkin, sleeveSkin, 3, 3.6, "#3a3f4a");
  };

  if (up) {
    drawArms();
    drawCleaver();
  }
  ctx.save();
  ctx.scale(dir, 1);
  // kaki besar
  const sw = Math.sin(ph) * moving;
  for (const [x, s] of [[-4.6, -sw], [4.6, sw]]) {
    const lx = x + s * 2.4;
    const lift = Math.max(0, s) * 3;
    shape(ctx, (c) => rr(c, lx - 4.4, 3, 8.8, 12 - lift, 3), lin(ctx, lx - 4, 0, lx + 4, 0, ["#8a6540", "#5a3b22", "#3a2414"]), "leather", 0.45);
    stroke(ctx, lx - 4.4, 8, lx + 4.4, 8, 1.8, "#2a1a0e");
    shape(ctx, (c) => rr(c, lx - 5, 12 - lift, 10.6, 5.4, 2.2), lin(ctx, 0, 12, 0, 17, ["#4b3826", "#26180e"]), "leather", 0.4);
    ell(ctx, lx + 1, 14 - lift, 1, 1, "#9ca3af", null, 0, false);
  }
  // perut/torso
  shape(ctx, (c) => {
    c.moveTo(-10.5, -15 - bob);
    c.quadraticCurveTo(-15, -4 - bob, -11.5, 5);
    c.quadraticCurveTo(0, 8, 11.5, 5);
    c.quadraticCurveTo(15, -4 - bob, 10.5, -15 - bob);
    c.quadraticCurveTo(0, -18 - bob, -10.5, -15 - bob);
  }, rad(ctx, 0, -4, 2, 20, ["#b0d86a", skin, "#3a5a1f"], -3, -6), "hide", 0.5, "rgba(18,28,8,0.95)", 1.6);
  // otot dada & perut
  ctx.strokeStyle = "rgba(20,40,8,0.5)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, -14 - bob); ctx.lineTo(0, 3);
  ctx.moveTo(-8, -9 - bob); ctx.quadraticCurveTo(-4, -6 - bob, 0, -8 - bob);
  ctx.moveTo(8, -9 - bob); ctx.quadraticCurveTo(4, -6 - bob, 0, -8 - bob);
  ctx.moveTo(-4, -1); ctx.lineTo(4, -1);
  ctx.moveTo(-4, 2); ctx.lineTo(4, 2);
  ctx.stroke();
  // luka goresan
  stroke(ctx, 3, -12 - bob, 7, -6 - bob, 1.1, "rgba(120,40,40,0.75)");
  stroke(ctx, 4.4, -12 - bob, 8.2, -7 - bob, 1.1, "rgba(120,40,40,0.75)");
  // tali harness silang + plat
  stroke(ctx, -10, -14 - bob, 9, 3, 3.6, "#3a2414");
  stroke(ctx, 10, -14 - bob, -9, 3, 3.6, "#2e1c10");
  ell(ctx, 0, -5.5, 3.2, 3.2, lin(ctx, -3, -8, 3, -3, ["#b8c0cc", "#5b6472"]), "metal", 0.4, OUT, 1);
  for (const [px, py] of [[-6, -10.5], [6, -10.5], [-6, -0.5], [6, -0.5]]) ell(ctx, px, py - (py < -5 ? bob : 0), 0.9, 0.9, "#c9d0da", null, 0, false);
  // ikat pinggang & cawat
  shape(ctx, (c) => rr(c, -12, 2.4, 24, 4.6, 1.4), "#2e1c10", "leather", 0.45);
  shape(ctx, (c) => rr(c, -3, 1.8, 6, 5.8, 1.2), lin(ctx, 0, 2, 0, 8, ["#d1d7e0", "#5b6472"]), "metal", 0.4, OUT, 0.9);
  shape(ctx, (c) => {
    c.moveTo(-8, 6.6);
    c.lineTo(8, 6.6);
    c.lineTo(9, 14.4);
    c.lineTo(4.6, 12.6);
    c.lineTo(0, 15);
    c.lineTo(-4.6, 12.6);
    c.lineTo(-9, 14.4);
    c.closePath();
  }, lin(ctx, 0, 6, 0, 15, ["#8a6540", "#4a2f1a"]), "leather", 0.5);
  // tengkorak troféi di pinggang
  ell(ctx, -8.4, 5.2, 2.4, 2.6, "#e7e1cf", "bone", 0.4, OUT, 0.8);
  // kepala
  const cy = -27 - bob;
  const look = clamp(Math.abs(Math.cos(aim)) * 1.6, 0, 1);
  const fx = look * 2.6 - 0.5;
  // telinga runcing
  shape(ctx, (c) => { c.moveTo(-8, cy - 2); c.lineTo(-15, cy - 7); c.lineTo(-9, cy + 4); c.closePath(); }, skin, "hide", 0.4, "rgba(18,28,8,0.95)", 1.2);
  ctx.strokeStyle = "#f2c94c";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-9.4, cy + 2.8, 1.8, 0, 7);
  ctx.stroke();
  shape(ctx, (c) => c.ellipse(-0.5, cy, 10.2, 8.8, 0, 0, Math.PI * 2), rad(ctx, -0.5, cy, 1, 11, ["#b7de74", skin, "#3a5a1f"], -3, -3), "hide", 0.5, "rgba(18,28,8,0.95)", 1.5);
  if (up) {
    // mohawk dari belakang
    shape(ctx, (c) => c.ellipse(-0.5, cy - 1, 4, 8, 0, 0, Math.PI * 2), "#1c1210", "hide", 0.3, OUT, 1);
  } else {
    // alis tebal + mata kuning menyala
    for (const side of [-1, 1]) {
      const ex = fx + side * 4;
      ell(ctx, ex, cy - 0.6, 2.4, 2, "#fde047", null, 0, "rgba(20,10,0,0.8)", 0.8);
      ell(ctx, ex + Math.cos(aim) * dir * 0.5, cy - 0.5, 1, 1.5, "#b91c1c", null, 0, false);
    }
    shape(ctx, (c) => { c.moveTo(fx - 8, cy - 3.6); c.lineTo(fx - 0.6, cy - 0.6); c.lineTo(fx - 0.6, cy - 2.8); c.lineTo(fx - 7.6, cy - 6); c.closePath(); }, "#26361a", null, 0, false);
    shape(ctx, (c) => { c.moveTo(fx + 8, cy - 3.6); c.lineTo(fx + 0.6, cy - 0.6); c.lineTo(fx + 0.6, cy - 2.8); c.lineTo(fx + 7.6, cy - 6); c.closePath(); }, "#26361a", null, 0, false);
    // cat perang
    stroke(ctx, fx - 7.2, cy + 1.6, fx - 3.6, cy + 2.8, 1.4, "#b91c1c");
    stroke(ctx, fx + 3.6, cy + 2.8, fx + 7.2, cy + 1.6, 1.4, "#b91c1c");
    // hidung + rahang bawah menonjol
    ell(ctx, fx + look * 0.5, cy + 2.2, 1.6, 1.1, darken(skin, 0.3), null, 0, false);
    const open = a >= 0 ? 2.6 * Math.sin(Math.PI * Math.min(1, a * 1.8)) : o.aggro ? 0.8 : 0;
    shape(ctx, (c) => rr(c, fx - 6.8, cy + 3.8 + open, 13.6, 5.2, 2.4), lin(ctx, 0, cy + 4, 0, cy + 9, [darken(skin, 0.1), "#365419"]), "hide", 0.5, "rgba(18,28,8,0.95)", 1.2);
    if (open > 1) ell(ctx, fx, cy + 4.6, 4.4, open * 0.5 + 0.6, "#2a0a12", null, 0, false);
    // taring
    for (const side of [-1, 1]) {
      shape(ctx, (c) => {
        c.moveTo(fx + side * 5.8, cy + 5.4 + open);
        c.quadraticCurveTo(fx + side * 7.4, cy + 0, fx + side * 5.4, cy - 2.2);
        c.lineTo(fx + side * 3.8, cy + 5.4 + open);
        c.closePath();
      }, lin(ctx, 0, cy - 2, 0, cy + 6, ["#fffdf2", "#e4dcc2"]), null, 0, "rgba(40,30,10,0.8)", 0.9);
    }
    // mohawk
    for (let i = 0; i < 5; i++) {
      const mx = -7 + i * 3.4;
      shape(ctx, (c) => { c.moveTo(mx - 1.8, cy - 7.6 + Math.abs(i - 2) * 0.8); c.lineTo(mx + 0.4, cy - 14.4 + Math.abs(i - 2) * 1.6); c.lineTo(mx + 2.2, cy - 7.4 + Math.abs(i - 2) * 0.8); c.closePath(); }, i % 2 ? "#5b1d17" : "#1c1210", "hide", 0.3, OUT, 0.8);
    }
  }
  ctx.restore();
  // bahu berduri (digambar di ruang dunia agar tidak terbalik)
  for (const side of [-1, 1]) {
    const px = side * 12.5 * dir;
    ctx.save();
    ctx.translate(px, -14 - bob);
    shape(ctx, (c) => c.arc(0, 0, 6.2, Math.PI, 0), lin(ctx, -6, -6, 6, 2, ["#9aa3b0", "#4d5562", "#2a2f38"]), "metal", 0.45, OUT, 1.3);
    ell(ctx, 0, 0, 6.2, 2, "#2a2f38", null, 0, OUT, 1);
    for (const [sx, sy, sa] of [[-3.6, -4, -0.5], [0, -6, 0], [3.6, -4, 0.5]]) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sa);
      shape(ctx, (c) => { c.moveTo(-1.4, 0); c.lineTo(0, -5.6); c.lineTo(1.4, 0); c.closePath(); }, lin(ctx, 0, -6, 0, 0, ["#e5e7eb", "#6b7280"]), null, 0, OUT, 0.8);
      ctx.restore();
    }
    ctx.restore();
  }
  if (!up) {
    drawArms();
    drawCleaver();
  }
  ctx.restore(); // menutup save() di awal drawOrc (sebelumnya ada restore ganda yang merusak state canvas)
}

// o: { kind, r, face, walk, moving, atk, aggro, id, dead }
export function drawMonster(ctx, o, now) {
  ctx.save();
  if (o.kind === "skeleton") drawSkeleton(ctx, o, now);
  else if (o.kind === "orc") drawOrc(ctx, o, now);
  else drawSlime(ctx, o, now);
  ctx.restore();
}

// ---------- Flash (siluet berwarna saat kena pukul) ----------
let flashCanvas = null;
export function drawFlashed(ctx, x, y, size, color, alpha, drawFn) {
  if (!flashCanvas) flashCanvas = document.createElement("canvas");
  const dim = size * 2;
  if (flashCanvas.width !== dim) flashCanvas.width = flashCanvas.height = dim;
  const f = flashCanvas.getContext("2d");
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = "source-over";
  f.globalAlpha = 1;
  f.clearRect(0, 0, dim, dim);
  f.translate(size, size);
  drawFn(f);
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = "source-atop";
  f.globalAlpha = alpha;
  f.fillStyle = color;
  f.fillRect(0, 0, dim, dim);
  f.globalAlpha = 1;
  f.globalCompositeOperation = "source-over";
  ctx.drawImage(flashCanvas, x - size, y - size);
}

// Untuk kartu pilih class di layar login
export function drawPreview(ctx, w, h, cls, t, color) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.7, 4, w / 2, h * 0.7, w * 0.7);
  g.addColorStop(0, "rgba(120,100,200,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const cyc = t % 2600;
  ctx.save();
  ctx.translate(w / 2 - 26, h * 0.64);
  ctx.scale(1.85, 1.85);
  drawCharacter(ctx, {
    cls,
    aim: 0.15 + Math.sin(t / 1500) * 0.15,
    color: color || CLASS_INFO[cls].accent,
    skin: SKINS[1],
    hair: HAIRS[cls.length % HAIRS.length],
    walk: 0,
    moving: 0,
    atk: cyc < 600 ? cyc : -1,
  }, t);
  ctx.restore();
}

// ---------- Helper gambar yang dipakai modul seni lain (art_boss.js, art_decor.js) ----------
export { hex, mix, lighten, darken, rng, buildTex, pat, rr, lin, rad, shape, ell, stroke, limb, arm, ease, clamp, OUT };
