import React, { useEffect, useRef, useState } from "react";
import { audio } from "../game/audio.js";
import { createBackdrop, clamp, easeOut, easeInOut, rng } from "./LavaBackdrop.jsx";

// Linimasa intro (detik sejak masuk fase 1)
const RISE0 = 2.2; // huruf pertama mulai terbit
const RISE_STEP = 0.17;
const RISE_DUR = 0.6;
const SLAM = 4.0; // hantaman logo
const TAG = 4.7; // sub-tagline
const MOVE = 5.6; // logo bergeser ke atas -> menu

const safe = (fn, ...a) => {
  try {
    const f = audio && audio[fn];
    if (typeof f === "function") f.apply(audio, a);
  } catch {
    /* audio opsional */
  }
};

const FAM = "Cinzel, Georgia, serif";

function makeNoise() {
  const c = document.createElement("canvas");
  c.width = c.height = 192;
  const x = c.getContext("2d");
  const id = x.createImageData(192, 192);
  for (let i = 0; i < id.data.length; i += 4) {
    const r = Math.random();
    if (r < 0.5) { id.data[i] = 0; id.data[i + 1] = 0; id.data[i + 2] = 0; id.data[i + 3] = 90 * Math.random(); }
    else if (r < 0.62) { id.data[i] = 170; id.data[i + 1] = 100; id.data[i + 2] = 90; id.data[i + 3] = 55 * Math.random(); }
  }
  x.putImageData(id, 0, 0);
  for (let i = 0; i < 40; i++) {
    const rr = 6 + Math.random() * 20;
    const gx = Math.random() * 192, gy = Math.random() * 192;
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, rr);
    g.addColorStop(0, "rgba(0,0,0,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
  }
  x.strokeStyle = "rgba(0,0,0,0.4)";
  for (let i = 0; i < 14; i++) {
    x.lineWidth = 0.6 + Math.random();
    x.beginPath();
    let px = Math.random() * 192, py = Math.random() * 192;
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  return c;
}

function buildLetter(ch, adv, fs, capH, dpr, noise, seed) {
  const r = rng(seed);
  const pad = Math.ceil(fs * 0.3);
  const w = Math.ceil(adv + pad * 2);
  const h = Math.ceil(capH + pad * 2);
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const x = c.getContext("2d");
    x.scale(dpr, dpr);
    x.font = `900 ${fs}px ${FAM}`;
    x.textAlign = "center";
    x.textBaseline = "alphabetic";
    x.lineJoin = "round";
    return { c, x };
  };
  const cx = w / 2;
  const by = pad + capH;

  // glow merah
  const G = mk();
  G.x.fillStyle = "#df3e23";
  G.x.shadowColor = "#df3e23";
  G.x.shadowBlur = fs * 0.3 * dpr;
  G.x.fillText(ch, cx, by);
  G.x.fillText(ch, cx, by);

  // wajah batu
  const F = mk();
  const gr = F.x.createLinearGradient(0, pad, 0, pad + capH);
  gr.addColorStop(0, "#6a3840");
  gr.addColorStop(0.42, "#42242c");
  gr.addColorStop(1, "#1a1016");
  F.x.fillStyle = gr;
  F.x.fillText(ch, cx, by);
  F.x.globalCompositeOperation = "source-atop";
  F.x.globalAlpha = 0.6;
  F.x.fillStyle = F.x.createPattern(noise, "repeat");
  F.x.fillRect(0, 0, w, h);
  F.x.globalAlpha = 1;
  F.x.strokeStyle = "rgba(8,3,6,0.75)";
  F.x.lineWidth = fs * 0.05;
  F.x.strokeText(ch, cx, by);
  F.x.strokeStyle = "rgba(200,120,100,0.28)";
  F.x.lineWidth = Math.max(1, fs * 0.012);
  F.x.strokeText(ch, cx, by - fs * 0.02);

  // batu + bingkai ember
  const S = mk();
  S.x.strokeStyle = "#df3e23";
  S.x.lineWidth = fs * 0.075;
  S.x.strokeText(ch, cx, by);
  S.x.strokeStyle = "#ff8933";
  S.x.lineWidth = fs * 0.032;
  S.x.strokeText(ch, cx, by);
  S.x.drawImage(F.c, 0, 0, w, h);

  // retakan magma
  const C = mk();
  const ug = C.x.createLinearGradient(0, by, 0, by - capH * 0.7);
  ug.addColorStop(0, "rgba(255,137,51,0.6)");
  ug.addColorStop(1, "rgba(223,62,35,0)");
  C.x.fillStyle = ug;
  C.x.fillRect(0, 0, w, h);
  const lines = [];
  const nC = 3 + Math.floor(r() * 2);
  for (let k = 0; k < nC; k++) {
    let x = pad + r() * adv;
    let y = pad + r() * capH * 0.15;
    const pts = [[x, y]];
    const steps = 6 + Math.floor(r() * 4);
    for (let s = 0; s < steps; s++) {
      x += (r() - 0.5) * adv * 0.3;
      y += (capH / steps) * (0.8 + r() * 0.5);
      pts.push([x, y]);
      if (r() < 0.35) {
        const bp = [[x, y]];
        let bx = x, byy = y;
        for (let q = 0; q < 3; q++) { bx += (r() - 0.5) * adv * 0.35; byy += (r() - 0.2) * capH * 0.12; bp.push([bx, byy]); }
        lines.push(bp);
      }
    }
    lines.push(pts);
  }
  C.x.lineCap = "round";
  const passes = [[fs * 0.06, "rgba(223,62,35,0.5)"], [fs * 0.03, "#df3e23"], [fs * 0.012, "#ffcf8a"]];
  for (const [lw, col] of passes) {
    C.x.strokeStyle = col;
    C.x.lineWidth = lw;
    for (const pts of lines) {
      C.x.beginPath();
      pts.forEach(([px, py], i) => (i ? C.x.lineTo(px, py) : C.x.moveTo(px, py)));
      C.x.stroke();
    }
  }
  C.x.globalCompositeOperation = "destination-in";
  C.x.fillStyle = "#000";
  C.x.fillText(ch, cx, by);

  return { G: G.c, S: S.c, C: C.c, w, h };
}

function buildLogo(W, H, dpr, noise) {
  const narrow = W < 640;
  const lines = narrow ? ["VOXA", "RPG"] : ["VOXA RPG"];
  let fs = narrow ? Math.min(W * 0.27, 130) : Math.min(W * 0.14, 150);
  const m = document.createElement("canvas").getContext("2d");
  let info;
  for (let it = 0; it < 3; it++) {
    m.font = `900 ${fs}px ${FAM}`;
    const capH = m.measureText("H").actualBoundingBoxAscent || fs * 0.7;
    const gap = fs * 0.05;
    const li = lines.map((txt) => {
      const chars = [...txt];
      const adv = chars.map((c) => (c === " " ? fs * 0.38 : m.measureText(c).width));
      return { chars, adv, w: adv.reduce((a, b) => a + b, 0) + gap * (chars.length - 1) };
    });
    const maxW = Math.max(...li.map((l) => l.w));
    info = { fs, capH, gap, li, maxW };
    if (maxW > W * 0.9 && it < 2) { fs *= (W * 0.9) / maxW; continue; }
    break;
  }
  const { capH, gap, li } = info;
  fs = info.fs;
  const lineH = capH * 1.32;
  const letters = [];
  let idx = 0;
  li.forEach((l, lineIdx) => {
    let cur = -l.w / 2;
    const y = (lineIdx - (lines.length - 1) / 2) * lineH;
    l.chars.forEach((ch, i) => {
      if (ch !== " ") {
        const spr = buildLetter(ch, l.adv[i], fs, capH, dpr, noise, 9000 + idx * 31);
        letters.push({ ch, x: cur + l.adv[i] / 2, y, ...spr, drip: [Math.random(), Math.random()], dipx: [Math.random() - 0.5, Math.random() - 0.5] });
        idx++;
      }
      cur += l.adv[i] + gap;
    });
  });
  return { fs, capH, lineH, totalH: capH + (lines.length - 1) * lineH, width: info.maxW, letters, narrow };
}

export default function TitleScreen({ onNew, onLoad, savedCount = 0 }) {
  const [phase, setPhase] = useState(0);
  const [menuTop, setMenuTop] = useState(320);
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const phaseRef = useRef(0);
  const cbRef = useRef({});
  cbRef.current = { onNew, onLoad };

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const bd = createBackdrop();
    const rm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = {
      W: 0, H: 0, dpr: 1, t0: 0, time: 0, last: performance.now(), logo: null, noFx: false, slam: false,
      flare: 0, noise: null, fontOk: false, raf: 0, yMenu: 0, yIntro: 0, sc: 1, dead: false,
      darkBlob: null,
    };

    const go = (p) => { phaseRef.current = p; setPhase(p); };

    const relayout = () => {
      const W = root.clientWidth || window.innerWidth;
      const H = root.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      S.W = W; S.H = H; S.dpr = dpr;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      bd.resize(W, H);
      if (S.fontOk) {
        if (!S.noise) S.noise = makeNoise();
        const L = buildLogo(W, H, dpr, S.noise);
        S.logo = L;
        S.sc = L.narrow ? 0.8 : 0.82;
        S.yIntro = H * 0.45;
        S.yMenu = Math.max((L.totalH * S.sc) / 2 + 30, H * 0.23);
        setMenuTop(Math.round(S.yMenu + (L.totalH * S.sc) / 2 + 82));
      }
    };

    if (!S.darkBlob) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d");
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(6,3,5,0.75)");
      g.addColorStop(1, "rgba(6,3,5,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      S.darkBlob = c;
    }

    // font Cinzel (timeout 1,5 dtk lalu pakai fallback)
    const fontLoad = document.fonts && document.fonts.load ? document.fonts.load("900 100px Cinzel").catch(() => {}) : Promise.resolve();
    Promise.race([fontLoad, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      if (S.dead) return;
      S.fontOk = true;
      relayout();
    });
    relayout();

    const onResize = () => relayout();
    window.addEventListener("resize", onResize);

    const start = () => {
      safe("unlock");
      safe("playMusic", "title");
      S.t0 = performance.now();
      S.time = 0;
      go(1);
    };
    const skip = () => {
      const now = performance.now();
      if (now - S.t0 < 350) return;
      const T = (now - S.t0) / 1000;
      if (T < MOVE) {
        if (!S.slam) { safe("play", "titleHit"); S.slam = true; }
        S.noFx = true;
        S.t0 = now - MOVE * 1000;
        go(2);
      }
    };
    const onInput = (e) => {
      if (e.type === "keydown" && (e.key === "Tab" || e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta")) return;
      const p = phaseRef.current;
      if (p === 0) start();
      else if (p === 1) skip();
    };
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);

    const drawLogo = (T, time) => {
      const L = S.logo;
      if (!L) return;
      const m = easeInOut((T - MOVE) / 0.9);
      const sc = 1 + (S.sc - 1) * m;
      const cx = S.W / 2;
      const cy = S.yIntro + (S.yMenu - S.yIntro) * m;
      const d = T - SLAM;
      const fx = !S.noFx;

      // bayangan gelap di belakang logo agar terbaca
      ctx.globalAlpha = 0.9;
      const bw = L.width * sc * 1.5, bh = L.totalH * sc * 2.2;
      ctx.drawImage(S.darkBlob, cx - bw / 2, cy - bh / 2, bw, bh);
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      const baseLine = L.totalH / 2 + 4;

      // hamparan lava tempat huruf terbit
      const bedA = clamp((T - (RISE0 - 0.3)) / 0.6) * (d > 0 ? 0.55 + 0.45 * Math.exp(-d * 1.5) : 1);
      if (bedA > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, bedA) * (0.75 + 0.25 * Math.sin(time * 3));
        const bwid = L.width * 1.18;
        ctx.drawImage(bd.sprites.blob, -bwid / 2, baseLine - 24, bwid, 56);
        ctx.globalAlpha = Math.min(1, bedA) * 0.9;
        const gl = ctx.createLinearGradient(-bwid / 2, 0, bwid / 2, 0);
        gl.addColorStop(0, "rgba(255,137,51,0)");
        gl.addColorStop(0.5, "rgba(255,190,110,0.95)");
        gl.addColorStop(1, "rgba(255,137,51,0)");
        ctx.fillStyle = gl;
        ctx.fillRect(-bwid / 2, baseLine + 2, bwid, 3);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      const slamP = fx ? Math.pow(clamp(d / 0.12), 2) : 1;
      for (let i = 0; i < L.letters.length; i++) {
        const l = L.letters[i];
        const st = T - (RISE0 + i * RISE_STEP);
        const p = clamp(st / RISE_DUR);
        if (p <= 0) continue;
        const e = easeOut(p);
        const hover = fx && T < SLAM + 0.12 ? -16 * (1 - slamP) : 0;
        const yOff = (1 - e) * (l.h * 0.95) + hover;
        const heat = (1 - p) * 0.8 + (fx && d > 0 ? Math.exp(-d * 2.2) * 0.9 : 0);
        const pul = 0.62 + 0.38 * Math.sin(time * 2.3 + i * 0.9);
        const squash = fx && d > 0.12 ? Math.exp(-(d - 0.12) * 12) * Math.sin((d - 0.12) * 30) * 0.035 : 0;

        // ember dari huruf yang sedang terbit
        if (p < 1 && Math.random() < 0.5) bd.emit(cx + l.x * sc, cy + (l.y - L.capH * 0.2) * sc, 1);

        ctx.save();
        if (p < 1) {
          ctx.beginPath();
          ctx.rect(-5000, -5000, 10000, 5000 + l.y + L.capH / 2 + 4);
          ctx.clip();
        }
        ctx.translate(l.x, l.y + yOff + L.capH / 2);
        if (squash) ctx.scale(1 + squash, 1 - squash);
        ctx.translate(0, -L.capH / 2);
        const dw = l.w, dh = l.h;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = clamp((0.42 + 0.38 * pul) * (0.7 + heat));
        ctx.drawImage(l.G, -dw / 2, -dh / 2, dw, dh);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.drawImage(l.S, -dw / 2, -dh / 2, dw, dh);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = clamp(0.55 + 0.45 * pul + heat);
        ctx.drawImage(l.C, -dw / 2, -dh / 2, dw, dh);
        if (heat > 0.15) {
          ctx.globalAlpha = clamp(heat * 0.6);
          ctx.drawImage(l.C, -dw / 2, -dh / 2, dw, dh);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // lava menetes dari huruf
      if (T > SLAM + 0.5 || S.noFx) {
        const fade = S.noFx ? 1 : clamp((T - SLAM - 0.5) / 0.8);
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let i = 0; i < L.letters.length; i++) {
          const l = L.letters[i];
          for (let k = 0; k < 2; k++) {
            const u = (time * (0.16 + l.drip[k] * 0.12) + l.drip[1 - k] * 7 + i * 0.37) % 1;
            const dx = l.x + l.dipx[k] * l.w * 0.45;
            const y0 = l.y + L.capH / 2 - 2;
            const len = L.fs * (0.3 + 0.25 * l.drip[k]);
            const head = y0 + u * len * 1.4;
            const tail = y0 + Math.max(0, u - 0.45) * len * 1.4;
            const a = (1 - u) * fade;
            ctx.globalAlpha = a * 0.9;
            ctx.strokeStyle = "#df3e23";
            ctx.lineWidth = Math.max(2, L.fs * 0.028);
            ctx.beginPath(); ctx.moveTo(dx, tail); ctx.lineTo(dx, head); ctx.stroke();
            ctx.strokeStyle = "#ffb061";
            ctx.lineWidth = Math.max(1, L.fs * 0.012);
            ctx.beginPath(); ctx.moveTo(dx, tail); ctx.lineTo(dx, head); ctx.stroke();
            const hs = Math.max(8, L.fs * 0.11);
            ctx.globalAlpha = a;
            ctx.drawImage(bd.sprites.hot, dx - hs / 2, head - hs / 2, hs, hs);
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // sub-tagline
      const ta = clamp((T - TAG) / 0.9);
      if (ta > 0) {
        const tfs = clamp(L.fs * 0.14, 13, 21);
        const txt = "TURUN KE DALAM BARA";
        ctx.font = `600 ${tfs}px ${FAM}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const sp = tfs * 0.42;
        let tw = 0;
        const adv = [...txt].map((c) => { const w = ctx.measureText(c).width; tw += w + sp; return w; });
        tw -= sp;
        let x = -tw / 2;
        const y = L.totalH / 2 + 30 + tfs * 0.5 + (1 - easeOut(ta)) * -6;
        ctx.globalAlpha = ta;
        ctx.shadowColor = "#ff8933";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#ffc58a";
        [...txt].forEach((c, i) => { ctx.fillText(c, x, y); x += adv[i] + sp; });
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const frame = (now) => {
      if (S.dead) return;
      S.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - S.last) / 1000);
      S.last = now;
      S.time += dt;
      const { W, H, dpr } = S;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (phaseRef.current === 0) return;

      const T = (now - S.t0) / 1000;
      if (phaseRef.current === 1 && T >= MOVE) go(2);

      // momen hantaman
      const d = T - SLAM;
      if (!S.slam && T >= SLAM && !S.noFx) {
        S.slam = true;
        safe("play", "titleHit");
        S.flare = 1;
        bd.burst(W / 2, S.yIntro, 60, 1);
      }
      S.flare = Math.max(0, S.flare - dt * 1.6);

      // getaran layar
      let amp = T < SLAM ? 0.4 + 6 * Math.pow(clamp(T / SLAM), 2.2) : 0.3;
      if (!S.noFx && d > 0 && d < 1.5) amp += 18 * Math.exp(-d * 5);
      if (S.noFx) amp = 0.3;
      amp *= rm ? 0.2 : 1;
      const tm = S.time;
      const sx = amp * (Math.sin(tm * 41) + Math.sin(tm * 67.3 + 1.7)) * 0.5;
      const sy = amp * (Math.sin(tm * 47.7 + 0.6) + Math.sin(tm * 71 + 2.9)) * 0.5;

      ctx.save();
      ctx.translate(W / 2 + sx, H / 2 + sy);
      ctx.scale(1.025, 1.025);
      ctx.translate(-W / 2, -H / 2);
      bd.draw(ctx, { T, time: tm, dt, flare: S.flare });
      drawLogo(T, tm);

      // gelombang kejut + kilatan saat hantaman
      if (!S.noFx && d > 0 && d < 1.2) {
        const cyL = S.yIntro;
        ctx.globalCompositeOperation = "lighter";
        const r = d * 1100;
        ctx.globalAlpha = Math.max(0, 1 - d / 1.2) * 0.8;
        ctx.strokeStyle = "#ff8933";
        ctx.lineWidth = 6 * (1 - d / 1.2) + 1;
        ctx.beginPath();
        ctx.ellipse(W / 2, cyL, r, r * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
      bd.overlay(ctx);

      if (!S.noFx && d > 0 && d < 0.7) {
        const a = Math.exp(-d * 8) * (rm ? 0.35 : 0.85);
        const fg = ctx.createRadialGradient(W / 2, S.yIntro, 0, W / 2, S.yIntro, Math.max(W, H) * 0.7);
        fg.addColorStop(0, `rgba(255,236,205,${a})`);
        fg.addColorStop(0.5, `rgba(255,150,70,${a * 0.65})`);
        fg.addColorStop(1, `rgba(223,62,35,${a * 0.25})`);
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, W, H);
      }
      // fade dari hitam di awal
      if (T < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - T})`;
        ctx.fillRect(0, 0, W, H);
      }
    };
    S.raf = requestAnimationFrame(frame);

    return () => {
      S.dead = true;
      cancelAnimationFrame(S.raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
    };
  }, []);

  const hover = () => safe("play", "click");

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden bg-black select-none">
      <style>{`
        @keyframes vx-in { from { opacity:0; transform: translateY(30px); } to { opacity:1; transform:none; } }
        @keyframes vx-fade { from { opacity:0; } to { opacity:1; } }
        @keyframes vx-gate { 0%,100% { opacity:.28; } 50% { opacity:.95; } }
        .vx-rise { animation: vx-in .75s cubic-bezier(.2,.8,.2,1) both; }
        .vx-btn { position:relative; display:flex; align-items:center; justify-content:center; gap:.7rem;
          width:min(420px,84vw); height:68px; font-size:1.3rem; letter-spacing:.2em; cursor:pointer;
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease, border-color .18s ease; }
        .vx-btn::before, .vx-btn::after { content:""; position:absolute; top:50%; width:9px; height:9px; background:#ff8933;
          box-shadow:0 0 10px #ff8933, 0 0 18px #df3e23; transform:translateY(-50%) rotate(45deg); transition: transform .18s; }
        .vx-btn::before { left:-17px; } .vx-btn::after { right:-17px; }
        .vx-btn:hover, .vx-btn:focus-visible { transform: translateX(10px); outline:none; }
        .vx-btn:hover::before, .vx-btn:focus-visible::before { transform:translateY(-50%) rotate(45deg) scale(1.5); }
        .vx-btn:hover::after, .vx-btn:focus-visible::after { transform:translateY(-50%) rotate(45deg) scale(1.5); }
        .vx-new { border:2px solid #ffb061 !important; text-shadow:0 1px 0 rgba(255,210,150,.5);
          box-shadow:0 0 0 3px #1a1016, 0 0 0 5px #733e39, 0 0 30px rgba(223,62,35,.55); }
        .vx-new:hover, .vx-new:focus-visible { filter:brightness(1.18);
          box-shadow:0 0 0 3px #1a1016, 0 0 0 5px #ff8933, 0 0 46px rgba(255,137,51,.85), 0 0 90px rgba(223,62,35,.5); }
        .vx-load { border:2px solid #733e39 !important; color:#f3e3d6; text-shadow:0 2px 3px rgba(0,0,0,.8);
          background: linear-gradient(180deg,#5b2f33,#42242c 55%,#2c171d) !important;
          box-shadow:0 0 0 3px #1a1016, 0 0 0 5px #42242c, inset 0 0 22px rgba(0,0,0,.55), 0 0 16px rgba(223,62,35,.2); }
        .vx-load:hover, .vx-load:focus-visible { border-color:#ff8933 !important; color:#ffd9b0;
          box-shadow:0 0 0 3px #1a1016, 0 0 0 5px #733e39, inset 0 0 22px rgba(0,0,0,.4), 0 0 34px rgba(255,137,51,.6); }
        @media (prefers-reduced-motion: reduce) { .vx-rise { animation-duration:.01s; } }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {phase === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black px-8 text-center">
          <p className="font-display text-xs tracking-[0.18em] sm:text-sm" style={{ color: "#c99a86", animation: "vx-gate 2.4s ease-in-out infinite" }}>
            Klik atau tekan tombol apa saja untuk memasuki dungeon
          </p>
        </div>
      )}

      {phase === 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 text-center font-display text-[11px] tracking-[0.25em]" style={{ color: "rgba(243,227,214,.42)", animation: "vx-fade 1s 1.4s both" }}>
          KLIK UNTUK MELEWATI
        </div>
      )}

      {phase === 2 && (
        <>
          <div className="absolute inset-x-0 z-10 flex flex-col items-center gap-5 px-4" style={{ top: menuTop }}>
            <div className="vx-rise" style={{ animationDelay: ".45s" }}>
              <button type="button" className="vx-btn vx-new btn-lava font-display" onMouseEnter={hover} onFocus={hover} onClick={() => { safe("play", "click"); onNew && onNew(); }}>
                KARAKTER BARU
              </button>
            </div>
            <div className="vx-rise flex flex-col items-center" style={{ animationDelay: ".7s" }}>
              <button type="button" className="vx-btn vx-load btn-stone font-display" onMouseEnter={hover} onFocus={hover} onClick={() => { safe("play", "click"); onLoad && onLoad(); }}>
                MUAT KARAKTER
                {savedCount > 0 && (
                  <span className="font-sans text-sm font-bold" style={{ background: "#ff8933", color: "#1a1016", borderRadius: 999, minWidth: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 7px", letterSpacing: 0, boxShadow: "0 0 12px rgba(255,137,51,.8)" }}>
                    {savedCount}
                  </span>
                )}
              </button>
              {savedCount === 0 && (
                <span className="mt-3 text-xs" style={{ color: "rgba(243,227,214,.6)", textShadow: "0 1px 4px #000" }}>belum ada karakter</span>
              )}
            </div>
          </div>
          <div className="vx-rise pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center font-display text-[11px] tracking-[0.3em]" style={{ animationDelay: "1.1s", color: "rgba(243,227,214,.55)", textShadow: "0 1px 4px #000" }}>
            VOXA RPG · Prototype
          </div>
        </>
      )}
    </div>
  );
}
