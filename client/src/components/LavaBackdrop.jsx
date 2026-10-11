// Latar gua vulkanik beranimasi (canvas 2D) untuk layar judul VOXA RPG.
// Bukan komponen React: pabrik `createBackdrop()` yang digambar oleh TitleScreen dalam satu loop RAF.
// Palet: rock #1a1016, earth #42242c, rust #733e39, lava #df3e23, ember #ff8933.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);
export const easeInOut = (u) => {
  u = clamp(u);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialSprite(size, stops) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export function createBackdrop() {
  let W = 0;
  let H = 0;
  const hot = radialSprite(64, [
    [0, "rgba(255,240,200,1)"],
    [0.18, "rgba(255,170,80,0.95)"],
    [0.5, "rgba(223,62,35,0.35)"],
    [1, "rgba(223,62,35,0)"],
  ]);
  const red = radialSprite(64, [
    [0, "rgba(255,137,51,0.9)"],
    [0.3, "rgba(223,62,35,0.6)"],
    [1, "rgba(115,30,20,0)"],
  ]);
  const fogSp = radialSprite(256, [
    [0, "rgba(223,62,35,0.5)"],
    [0.5, "rgba(160,40,25,0.18)"],
    [1, "rgba(115,62,57,0)"],
  ]);
  const blobSp = radialSprite(128, [
    [0, "rgba(255,200,110,0.95)"],
    [0.35, "rgba(255,137,51,0.55)"],
    [1, "rgba(223,62,35,0)"],
  ]);

  // partikel ember (ring buffer)
  const NP = 170;
  const P = Array.from({ length: NP }, () => ({ a: 0, x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 1, s: 4, k: 0, ph: 0 }));
  let pi = 0;
  let acc = 0;
  function spawn(x, y, vx, vy, life, size, kind) {
    const p = P[pi];
    pi = (pi + 1) % NP;
    p.a = 1; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.l = 0; p.m = life; p.s = size; p.k = kind; p.ph = Math.random() * 6.28;
  }

  let bg, walls, cracks, ceiling, spires, plates, streaks, vig, rimGrad;

  function resize(w, h) {
    W = w; H = h;
    const r = rng(1337);
    const camMax = H * 1.4;

    // latar dinding belakang (cache)
    bg = document.createElement("canvas");
    bg.width = Math.ceil(W / 2); bg.height = Math.ceil(H / 2);
    const bx = bg.getContext("2d");
    bx.scale(0.5, 0.5);
    const g = bx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#050306");
    g.addColorStop(0.5, "#130a10");
    g.addColorStop(1, "#2a1114");
    bx.fillStyle = g;
    bx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const rr = 40 + r() * 160;
      const gx = r() * W, gy = r() * H;
      const rg = bx.createRadialGradient(gx, gy, 0, gx, gy, rr);
      const c = r() < 0.5 ? "66,36,44" : "10,5,8";
      rg.addColorStop(0, `rgba(${c},${0.12 + r() * 0.14})`);
      rg.addColorStop(1, `rgba(${c},0)`);
      bx.fillStyle = rg;
      bx.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
    }
    bx.strokeStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 26; i++) {
      bx.lineWidth = 1 + r() * 2;
      bx.beginPath();
      let x = r() * W, y = r() * H;
      bx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += 20 + r() * 40; bx.lineTo(x, y); }
      bx.stroke();
    }

    // dinding samping (2 lapisan, parallax)
    const mkWall = (base, vari, par, spike) => {
      const stripH = camMax * par + H + 160;
      const pts = [];
      let y = -60;
      while (y < stripH) {
        let ins = base + r() * vari;
        if (r() < spike) ins += W * 0.07 + r() * W * 0.04;
        pts.push([y, ins]);
        y += 26 + r() * 64;
      }
      return { pts, par };
    };
    walls = [
      { ...mkWall(W * 0.05, W * 0.11, 0.55, 0.12), color: "#0e080c", rim: 0.35 },
      { ...mkWall(0, W * 0.05, 1.0, 0.28), color: "#050304", rim: 0.6 },
    ];
    walls[0].pts2 = mkWall(W * 0.05, W * 0.11, 0.55, 0.12).pts;
    walls[1].pts2 = mkWall(0, W * 0.05, 1.0, 0.28).pts;

    // stalaktit langit-langit
    ceiling = [];
    for (let x = -30; x < W + 40; ) {
      const wdt = 36 + r() * 90;
      const edge = Math.abs(x + wdt / 2 - W / 2) / (W / 2);
      const len = H * (0.05 + r() * 0.2) * (0.3 + 0.7 * clamp(edge));
      ceiling.push({ x, w: wdt, len, off: (r() - 0.5) * wdt * 0.4 });
      x += wdt * (0.55 + r() * 0.5);
    }

    // retakan lava (pohon cabang) – tumbuh dari bawah
    cracks = [];
    const roots = Math.max(6, Math.round(W / 130));
    const walk = (x, y, ang, depth, maxLen) => {
      let len = 0;
      while (len < maxLen && y > H * 0.12) {
        const step = 14 + r() * 24;
        ang += (r() - 0.5) * 0.9;
        ang = clamp(ang, -Math.PI / 2 - 1.15, -Math.PI / 2 + 1.15);
        const nx = x + Math.cos(ang) * step;
        const ny = Math.min(y - 4, y + Math.sin(ang) * step);
        cracks.push({ x1: x, y1: y, x2: nx, y2: ny, d: depth, s: (H - ny) / (H * 0.85) + r() * 0.06 });
        if (depth < 2 && r() < 0.13) walk(nx, ny, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), depth + 1, maxLen * 0.45);
        x = nx; y = ny; len += step;
      }
    };
    for (let k = 0; k < roots; k++) {
      walk(((k + 0.2 + r() * 0.6) / roots) * W, H * 0.97, -Math.PI / 2 + (r() - 0.5) * 0.5, 0, H * (0.35 + r() * 0.5));
    }

    // menara batu di kejauhan
    spires = [];
    for (let k = 0; k < 7; k++) {
      const hh = H * (0.1 + r() * 0.22);
      spires.push({ x: ((k + 0.3 + r() * 0.4) / 7) * W, h: hh, w: hh * (0.35 + r() * 0.3), lean: (r() - 0.5) * hh * 0.2 });
    }

    // kerak batu di permukaan lava
    plates = Array.from({ length: 10 }, () => ({
      x: r() * W, y: r(), w: 60 + r() * 160, h: 8 + r() * 14, sp: 5 + r() * 12, j: Array.from({ length: 5 }, () => r()),
    }));

    // goresan debu (kesan turun)
    streaks = Array.from({ length: 46 }, () => ({ x: r() * W, y: r() * H, par: 0.5 + r() * 0.8, a: 0.08 + r() * 0.12 }));

    // vinyet
    vig = document.createElement("canvas");
    vig.width = 128; vig.height = 72;
    const vx = vig.getContext("2d");
    const vg = vx.createRadialGradient(64, 36, 18, 64, 36, 80);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.6, "rgba(0,0,0,0.35)");
    vg.addColorStop(1, "rgba(0,0,0,0.85)");
    vx.fillStyle = vg;
    vx.fillRect(0, 0, 128, 72);

    rimGrad = bx.createLinearGradient(0, H * 0.3, 0, H);
    rimGrad.addColorStop(0, "rgba(223,62,35,0)");
    rimGrad.addColorStop(1, "rgba(255,120,50,0.8)");
  }

  const waveY = (x, y0, ph) =>
    y0 + Math.sin(x * 0.012 + ph) * 5 + Math.sin(x * 0.031 - ph * 1.4) * 2.6 + Math.sin(x * 0.0045 + ph * 0.5) * 7;

  function poolPath(ctx, y0, ph) {
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 10) ctx.lineTo(x, waveY(x, y0, ph));
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
  }

  function poolLevel(T) {
    return H * (1.04 - 0.19 * easeOut((T - 1.0) / 2.4));
  }

  function burst(x, y, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = (80 + Math.random() * 380) * power;
      spawn(x + (Math.random() - 0.5) * 60, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.8 + Math.random() * 1.8, 2.5 + Math.random() * 4.5, Math.random() < 0.5 ? 0 : 1);
    }
  }

  function emit(x, y, n) {
    for (let i = 0; i < n; i++) spawn(x, y, (Math.random() - 0.5) * 50, -(40 + Math.random() * 90), 0.8 + Math.random() * 1.2, 2 + Math.random() * 3, Math.random() < 0.6 ? 0 : 1);
  }

  // st: {T, time, dt, flare}
  function draw(ctx, st) {
    const { T, time, dt } = st;
    const glowI = 0.25 + 0.75 * clamp(T / 3.5);
    const flare = st.flare || 0;
    const camMax = H * 1.4;
    const u = clamp(T / 4.2);
    const cam = camMax * (1 - Math.pow(1 - u, 3));
    const camSpeed = u < 1 ? (camMax * 3 * Math.pow(1 - u, 2)) / 4.2 : 0;
    const poolY = poolLevel(T);
    const pulse = 0.78 + 0.22 * Math.sin(time * 2.1) + flare * 0.6;

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, W, H);

    // cahaya dari bawah
    ctx.globalCompositeOperation = "lighter";
    const ug = ctx.createRadialGradient(W / 2, H * 1.02, 0, W / 2, H * 1.02, Math.max(W, H) * 0.75);
    ug.addColorStop(0, `rgba(223,62,35,${0.5 * glowI * (0.9 + flare * 0.3)})`);
    ug.addColorStop(0.5, `rgba(115,40,30,${0.18 * glowI})`);
    ug.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ug;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // menara kejauhan
    ctx.fillStyle = "#0a0508";
    for (const s of spires) {
      const by = H * 0.93;
      ctx.beginPath();
      ctx.moveTo(s.x - s.w / 2, by);
      ctx.lineTo(s.x + s.lean - s.w * 0.08, by - s.h);
      ctx.lineTo(s.x + s.lean + s.w * 0.1, by - s.h * 0.92);
      ctx.lineTo(s.x + s.w / 2, by);
      ctx.closePath();
      ctx.fill();
    }

    // dinding jauh
    const wallDraw = (w, sideSign, pts) => {
      const off = cam * w.par;
      const sx = sideSign < 0 ? -40 : W + 40;
      ctx.beginPath();
      ctx.moveTo(sideSign < 0 ? pts[0][1] : W - pts[0][1], pts[0][0] - off);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(sideSign < 0 ? pts[i][1] : W - pts[i][1], pts[i][0] - off);
      ctx.save();
      ctx.globalAlpha = w.rim * glowI * (0.8 + flare * 0.4);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
      ctx.lineTo(sx, pts[pts.length - 1][0] - off);
      ctx.lineTo(sx, pts[0][0] - off);
      ctx.closePath();
      ctx.fillStyle = w.color;
      ctx.fill();
    };
    wallDraw(walls[0], -1, walls[0].pts);
    wallDraw(walls[0], 1, walls[0].pts2);

    // retakan lava
    const grow = clamp((T - 0.4) / 3.2) * 1.18;
    if (grow > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const wScale = Math.max(0.7, Math.min(1.3, W / 1000));
      for (let d = 0; d < 3; d++) {
        const pa = new Path2D();
        const ph = new Path2D();
        let any = false;
        for (let i = 0; i < cracks.length; i++) {
          const c = cracks[i];
          if (c.d !== d || c.s > grow) continue;
          const tgt = c.s > grow - 0.07 ? ph : pa;
          tgt.moveTo(c.x1, c.y1);
          tgt.lineTo(c.x2, c.y2);
          any = true;
        }
        if (!any) continue;
        const bw = [4.2, 2.6, 1.6][d] * wScale;
        const a = Math.min(1, pulse * glowI);
        ctx.strokeStyle = `rgba(223,62,35,${0.22 * a})`; ctx.lineWidth = bw * 3.2; ctx.stroke(pa);
        ctx.strokeStyle = `rgba(223,62,35,${0.7 * a})`; ctx.lineWidth = bw; ctx.stroke(pa);
        ctx.strokeStyle = `rgba(255,170,90,${0.85 * a})`; ctx.lineWidth = bw * 0.38; ctx.stroke(pa);
        ctx.strokeStyle = `rgba(255,220,160,0.9)`; ctx.lineWidth = bw * 0.6; ctx.stroke(ph);
        ctx.strokeStyle = `rgba(255,137,51,0.35)`; ctx.lineWidth = bw * 3; ctx.stroke(ph);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // dinding dekat
    wallDraw(walls[1], -1, walls[1].pts);
    wallDraw(walls[1], 1, walls[1].pts2);

    // stalaktit
    ctx.fillStyle = "#040203";
    for (const s of ceiling) {
      ctx.beginPath();
      ctx.moveTo(s.x, -6);
      ctx.quadraticCurveTo(s.x + s.w * 0.25, s.len * 0.55, s.x + s.w / 2 + s.off, s.len);
      ctx.quadraticCurveTo(s.x + s.w * 0.75, s.len * 0.5, s.x + s.w, -6);
      ctx.closePath();
      ctx.fill();
    }
    const cg = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    cg.addColorStop(0, "rgba(3,1,3,0.95)");
    cg.addColorStop(1, "rgba(3,1,3,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H * 0.3);

    // goresan debu saat turun
    if (camSpeed > 20) {
      ctx.strokeStyle = "rgba(255,200,160,0.5)";
      ctx.lineWidth = 1;
      const len = Math.min(70, camSpeed * 0.05);
      for (const s of streaks) {
        s.y -= camSpeed * s.par * dt;
        if (s.y < -80) { s.y += H + 120; s.x = Math.random() * W; }
        ctx.globalAlpha = s.a * clamp(camSpeed / 400);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y + len * s.par);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // kabut api
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const fx = ((i * 0.23 + 0.1) * W + Math.sin(time * 0.15 + i * 2) * W * 0.12) % (W + 300);
      const fy = H * (0.62 + 0.18 * Math.sin(time * 0.1 + i)) ;
      const sz = Math.max(W, H) * (0.5 + 0.12 * Math.sin(time * 0.2 + i * 1.7));
      ctx.globalAlpha = (0.16 + 0.05 * Math.sin(time * 0.6 + i)) * glowI * (1 + flare * 0.5);
      ctx.drawImage(fogSp, fx - sz / 2, fy - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // kolam lava
    if (poolY < H + 12) {
      // lapisan belakang
      poolPath(ctx, poolY - 16, time * 0.55 + 2);
      const bgG = ctx.createLinearGradient(0, poolY - 30, 0, H);
      bgG.addColorStop(0, "#c8381f");
      bgG.addColorStop(1, "#5a1a14");
      ctx.fillStyle = bgG;
      ctx.fill();
      // lapisan depan
      poolPath(ctx, poolY, time * 0.9);
      const pg = ctx.createLinearGradient(0, poolY - 12, 0, H);
      pg.addColorStop(0, "#ff8933");
      pg.addColorStop(0.18, "#ee5528");
      pg.addColorStop(0.55, "#df3e23");
      pg.addColorStop(1, "#7d2418");
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // kerak batu hanyut
      for (const pl of plates) {
        const px = ((pl.x + time * pl.sp) % (W + pl.w * 2)) - pl.w;
        const py = poolY + 14 + pl.y * (H - poolY - 20);
        const depth = 0.5 + (py - poolY) / (H - poolY + 1);
        const w = pl.w * depth, h = pl.h * depth;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + w * 0.25, py - h * (0.6 + pl.j[0] * 0.5));
        ctx.lineTo(px + w * 0.6, py - h * (0.5 + pl.j[1] * 0.6));
        ctx.lineTo(px + w, py - h * 0.1);
        ctx.lineTo(px + w * 0.8, py + h * (0.5 + pl.j[2] * 0.4));
        ctx.lineTo(px + w * 0.3, py + h * (0.6 + pl.j[3] * 0.3));
        ctx.closePath();
        ctx.fillStyle = "#1a1016";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,137,51,0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // bintik terang bergerak
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 18; i++) {
        const bx2 = ((i * 97 + time * (14 + (i % 5) * 7)) % (W + 240)) - 120;
        const by2 = poolY + 6 + (((i * 53) % 100) / 100) * (H - poolY);
        const sz = 50 + ((i * 37) % 70);
        ctx.globalAlpha = (0.35 + 0.3 * Math.sin(time * 1.3 + i * 1.9)) * (1 + flare * 0.5);
        ctx.drawImage(blobSp, bx2 - sz, by2 - sz * 0.45, sz * 2, sz * 0.9);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
      // garis permukaan menyala
      ctx.beginPath();
      for (let x = -10; x <= W + 10; x += 10) { const y = waveY(x, poolY, time * 0.9); x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.strokeStyle = "rgba(255,190,110,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,137,51,0.25)";
      ctx.lineWidth = 9;
      ctx.stroke();
      // pendar di atas kolam
      const hg = ctx.createLinearGradient(0, poolY - H * 0.32, 0, poolY);
      hg.addColorStop(0, "rgba(223,62,35,0)");
      hg.addColorStop(1, `rgba(223,62,35,${0.32 * (0.9 + 0.1 * Math.sin(time * 1.7)) * (1 + flare * 0.5)})`);
      ctx.fillStyle = hg;
      ctx.fillRect(0, poolY - H * 0.32, W, H * 0.32);
      ctx.globalCompositeOperation = "source-over";
    }

    // ember
    if (T > 0.6) {
      acc += (8 + 40 * clamp(T / 4)) * dt;
      while (acc >= 1) {
        acc -= 1;
        spawn(Math.random() * W, Math.min(H, poolY + Math.random() * 10), (Math.random() - 0.5) * 30, -(40 + Math.random() * 110), 2.2 + Math.random() * 2.8, 2.2 + Math.random() * 4.5, Math.random() < 0.55 ? 0 : 1);
      }
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < NP; i++) {
      const p = P[i];
      if (!p.a) continue;
      p.l += dt;
      if (p.l >= p.m) { p.a = 0; continue; }
      p.x += (p.vx + Math.sin(time * 2 + p.ph) * 14) * dt;
      p.y += p.vy * dt;
      p.vy *= 1 - 0.25 * dt;
      p.vx *= 1 - 0.6 * dt;
      const k = 1 - p.l / p.m;
      const s = p.s * (0.45 + 0.55 * k) * 2.2;
      ctx.globalAlpha = Math.min(1, k * 1.6) * (0.75 + 0.25 * Math.sin(time * 22 + p.ph));
      ctx.drawImage(p.k ? red : hot, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function overlay(ctx) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(vig, -10, -10, W + 20, H + 20);
  }

  return { resize, draw, overlay, burst, emit, poolLevel, sprites: { hot, red, blob: blobSp } };
}
