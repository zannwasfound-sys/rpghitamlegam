// Partikel, cahaya sementara, screen shake, dan distorsi layar.
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class FX {
  constructor() {
    this.parts = [];
    this.lights = []; // cahaya sementara untuk layer gelap
    this.trauma = 0; // 0..1, kekuatan guncangan kamera
    this.kick = { x: 0, y: 0 }; // dorongan kamera searah pukulan
    this.distort = 0; // 0..1, distorsi/glitch layar
    this.hurt = 0; // 0..1, flash merah di tepi layar
    this.scratch = null;
    this.tintR = null;
    this.tintC = null;
  }

  // ---------- Kamera ----------
  addShake(amount, dx = 0, dy = 0) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
    this.kick.x += dx * amount * 22;
    this.kick.y += dy * amount * 22;
  }

  cameraOffset(now) {
    const t = this.trauma * this.trauma;
    const s = now * 0.06;
    return {
      x: (Math.sin(s * 1.7) + Math.sin(s * 3.1 + 1.3) * 0.6) * 11 * t + this.kick.x,
      y: (Math.cos(s * 2.1) + Math.sin(s * 2.7 + 0.4) * 0.6) * 11 * t + this.kick.y,
    };
  }

  // ---------- Partikel ----------
  add(p) {
    p.t = 0;
    p.max = p.life;
    p.z = p.z || 0;
    p.vz = p.vz || 0;
    p.drag = p.drag === undefined ? 0.92 : p.drag;
    this.parts.push(p);
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
  }

  light(x, y, r, life, strength = 0.9) {
    this.lights.push({ x, y, r, t: 0, life, strength });
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.kick.x *= Math.pow(0.0004, dt);
    this.kick.y *= Math.pow(0.0004, dt);
    this.distort = Math.max(0, this.distort - dt * 2.6);
    this.hurt = Math.max(0, this.hurt - dt * 1.9);
    const f60 = dt * 60;
    for (const p of this.parts) {
      p.t += dt;
      const d = Math.pow(p.drag, f60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) {
        p.vz -= p.grav * dt;
        p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz *= -0.35;
          p.vx *= 0.6;
          p.vy *= 0.6;
        }
      }
      if (p.rise) p.z += p.rise * dt;
      if (p.spin) p.rot = (p.rot || 0) + p.spin * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.max);
    for (const l of this.lights) l.t += dt;
    this.lights = this.lights.filter((l) => l.t < l.life);
  }

  // Digambar di ruang dunia. additive=true untuk partikel bercahaya.
  draw(ctx, additive) {
    for (const p of this.parts) {
      if (!!p.add !== additive) continue;
      const k = p.t / p.max;
      const a = clamp((1 - k) * (p.alpha === undefined ? 1 : p.alpha), 0, 1);
      if (a <= 0) continue;
      const y = p.y - p.z;
      ctx.globalAlpha = a;
      switch (p.type) {
        case "ring": {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * (1 - k) + 0.5;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r0 + (p.r1 - p.r0) * easeOut(k), (p.r0 + (p.r1 - p.r0) * easeOut(k)) * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "spark": {
          const len = p.len * (1 - k * 0.6);
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (1 - k * 0.5);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, y);
          ctx.lineTo(p.x - (p.vx / sp) * len, y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case "glow": {
          const r = p.size * (p.grow ? 1 + k * p.grow : 1 - k * 0.3);
          const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, r);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(p.x - r, y - r, r * 2, r * 2);
          break;
        }
        case "puff": {
          const r = p.size * (1 + k * (p.grow || 1));
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, y, r, r * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "chip": {
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rot || 0);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.restore();
          break;
        }
        case "drop": {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, y, p.size * (1 - k * 0.4), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.3, y - p.size * 0.3, p.size * 0.28, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "plus": {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.2;
          ctx.lineCap = "round";
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x - s, y);
          ctx.lineTo(p.x + s, y);
          ctx.moveTo(p.x, y - s);
          ctx.lineTo(p.x, y + s);
          ctx.stroke();
          break;
        }
        case "arrow": {
          // panah yang menancap di dinding
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rot);
          ctx.strokeStyle = "#8b5e34";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-18, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();
          ctx.fillStyle = "#e5e7eb";
          ctx.beginPath();
          ctx.moveTo(-18, 0);
          ctx.lineTo(-24, -3);
          ctx.lineTo(-22, 0);
          ctx.lineTo(-24, 3);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Distorsi layar (dipakai saat terkena damage / knockback) ----------
  // Memecah gambar jadi strip horizontal yang bergelombang + pemisahan kanal warna (chromatic aberration).
  applyDistortion(ctx, w, h, now) {
    const s = this.distort;
    if (s <= 0.02) return;
    const dpr = ctx.canvas.width / w;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      return c;
    };
    if (!this.scratch || this.scratch.width !== cw || this.scratch.height !== ch) {
      this.scratch = mk();
      this.tintR = mk();
      this.tintC = mk();
    }
    const sx = this.scratch.getContext("2d");
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalCompositeOperation = "source-over";
    sx.drawImage(ctx.canvas, 0, 0);

    const tint = (cv, color) => {
      const c = cv.getContext("2d");
      c.globalCompositeOperation = "source-over";
      c.drawImage(this.scratch, 0, 0);
      c.globalCompositeOperation = "multiply";
      c.fillStyle = color;
      c.fillRect(0, 0, cw, ch);
      c.globalCompositeOperation = "source-over";
    };
    tint(this.tintR, "#ff0000");
    tint(this.tintC, "#00ffff");

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = "lighter";
    const strip = Math.max(6, Math.round(14 * dpr));
    const amp = s * s * 18 * dpr; // gelombang
    const split = s * 9 * dpr; // jarak pemisahan warna
    const tt = now * 0.045;
    for (let y = 0; y < ch; y += strip) {
      const hh = Math.min(strip, ch - y);
      const wave = Math.sin(y * 0.045 + tt) * amp + (Math.random() - 0.5) * amp * 0.5;
      ctx.drawImage(this.tintR, 0, y, cw, hh, wave + split, y, cw, hh);
      ctx.drawImage(this.tintC, 0, y, cw, hh, wave - split, y, cw, hh);
    }
    ctx.restore();
  }

  // Vignette merah saat terluka (+ berdenyut kalau HP rendah)
  drawHurt(ctx, w, h, now, lowHp) {
    const a = Math.max(this.hurt * 0.75, lowHp ? 0.12 + 0.08 * Math.sin(now * 0.006) : 0);
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(220,20,40,0)");
    g.addColorStop(1, `rgba(220,20,40,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- Resep efek ----------
  sparks(x, y, dx, dy, n, color, speed = 260, spread = 0.9, z = 14) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-spread, spread);
      const sp = rnd(speed * 0.4, speed);
      this.add({ type: "spark", x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.15, 0.35), len: rnd(8, 18), size: rnd(1.5, 3), color, add: true, drag: 0.9 });
    }
  }

  puffs(x, y, n, color = "rgba(160,150,140,0.5)", size = 7, spread = 40, dx = 0, dy = 0) {
    for (let i = 0; i < n; i++) {
      this.add({ type: "puff", x: x + rnd(-6, 6), y: y + rnd(-3, 3), z: rnd(2, 8), vx: dx * rnd(0.2, 0.6) + rnd(-spread, spread), vy: dy * rnd(0.2, 0.6) + rnd(-spread, spread) * 0.5, life: rnd(0.3, 0.6), size: rnd(size * 0.6, size), grow: 1.4, color, alpha: 0.7, rise: 14 });
    }
  }

  ring(x, y, r1, color, life = 0.35, width = 4, add = true) {
    this.add({ type: "ring", x, y, z: 4, vx: 0, vy: 0, life, r0: 4, r1, width, color, add });
  }

  chips(x, y, dx, dy, n, color, size = 4) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-1.1, 1.1);
      const sp = rnd(60, 190);
      this.add({ type: "chip", x, y, z: rnd(10, 22), vz: rnd(80, 190), grav: 700, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.5, 0.9), size: rnd(size * 0.6, size * 1.3), color, rot: rnd(0, 6), spin: rnd(-14, 14), drag: 0.97 });
    }
  }

  drops(x, y, dx, dy, n, color, size = 4) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-1.3, 1.3);
      const sp = rnd(50, 200);
      this.add({ type: "drop", x, y, z: rnd(8, 18), vz: rnd(60, 200), grav: 640, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.45, 0.8), size: rnd(size * 0.6, size * 1.2), color, drag: 0.97 });
    }
  }

  explosion(x, y, r) {
    this.ring(x, y, r * 1.15, "rgba(255,200,90,0.95)", 0.45, 6);
    this.ring(x, y, r * 0.7, "rgba(255,120,30,0.9)", 0.3, 4);
    for (let i = 0; i < 14; i++) {
      const a = rnd(0, 6.28);
      const sp = rnd(30, r * 2.2);
      this.add({ type: "glow", x, y, z: rnd(6, 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.3, 0.6), size: rnd(18, 34), color: i % 3 ? "rgba(255,140,40,0.9)" : "rgba(255,230,140,0.95)", add: true, drag: 0.9, grow: 0.4 });
    }
    this.add({ type: "glow", x, y, z: 12, vx: 0, vy: 0, life: 0.28, size: r * 1.5, color: "rgba(255,240,200,1)", add: true, grow: 0.6 });
    this.sparks(x, y, 0, -1, 18, "#fbbf24", 360, Math.PI, 16);
    this.puffs(x, y, 9, "rgba(50,40,40,0.55)", 14, 70);
    this.light(x, y, r * 3.2, 0.5, 1);
  }

  healPulse(x, y, r) {
    this.ring(x, y, r, "rgba(110,255,170,0.9)", 0.55, 5);
    this.ring(x, y, r * 0.6, "rgba(220,255,230,0.9)", 0.4, 3);
    this.add({ type: "glow", x, y, z: 6, vx: 0, vy: 0, life: 0.5, size: r * 0.9, color: "rgba(80,255,150,0.45)", add: true, grow: 0.3 });
    for (let i = 0; i < 9; i++) {
      const a = rnd(0, 6.28);
      const d = rnd(10, r * 0.9);
      this.add({ type: "plus", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, z: rnd(0, 14), vx: 0, vy: 0, rise: rnd(30, 60), life: rnd(0.6, 1.0), size: rnd(3, 5), color: "#86efac", add: true });
    }
    this.light(x, y, r * 1.6, 0.6, 0.7);
  }

  levelUp(x, y) {
    this.ring(x, y + 16, 70, "rgba(250,220,90,0.95)", 0.8, 5);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.add({ type: "spark", x: x + Math.cos(a) * 26, y: y + 14 + Math.sin(a) * 16, z: 0, vx: 0, vy: 0.001, rise: rnd(60, 140), life: rnd(0.7, 1.2), len: rnd(10, 20), size: 2.4, color: i % 2 ? "#fde047" : "#34d399", add: true, drag: 1 });
    }
    this.light(x, y, 200, 0.9, 0.8);
  }
}

function easeOut(k) {
  return 1 - Math.pow(1 - k, 3);
}
