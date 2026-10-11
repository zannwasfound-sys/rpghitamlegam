// Engine game: input, Client-Side Prediction, Server Reconciliation, interpolasi,
// animasi karakter/monster, proyektil, SFX, efek hit (shake + distorsi), dan rendering di Canvas.
import { moveWithCollision } from "./physics.js";
import { drawCharacter, drawMonster, drawFlashed, skinFor, hairFor, strHash, ATTACK_ANIM_MS, MONSTER_ATTACK_MS } from "./art.js";
import { FX } from "./fx.js";
import { audio } from "./audio.js";

const KEYS = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

const FLOOR_COLORS = ["#2b2f44", "#2e3248", "#292d41"];

// Suara & warna efek per sumber serangan
const HIT_SOUND = { fighter: "swordHit", mage: "swordHit", marksman: "arrowHit", support: "orbHit" };
const SPARK_COLOR = { fighter: "#fde68a", mage: "#fb923c", marksman: "#e5e7eb", support: "#86efac", slime: "#f87171", skeleton: "#f87171", orc: "#fb923c" };
const BODY_FX = {
  slime: { drops: "rgba(74,222,128,0.95)" },
  skeleton: { chips: "#e7e1cf" },
  orc: { chips: "#4d6b27", dust: true },
};

function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = ((n ^ (n >>> 13)) * 1274126177) | 0;
  return (n ^ (n >>> 16)) >>> 0;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class GameEngine {
  constructor(canvas, room, config, onStats) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.room = room;
    this.config = config;
    this.map = config; // config berisi tile, cols, rows, grid
    this.onStats = onStats;

    this.step = 1 / config.tickRate;
    this.keys = { up: false, down: false, left: false, right: false };

    this.seq = 0;
    this.pending = []; // input yang belum dikonfirmasi server
    this.local = null; // posisi prediksi pemain lokal
    this.facing = 0;
    this.aim = 0;
    this.mouse = null; // posisi mouse di layar (null = belum dipakai → bidik ikut arah gerak)
    this.mouseDown = false;
    this.spaceDown = false;
    this.lastAttack = -9999;
    this.kbBoostUntil = 0;
    this.camX = 0;
    this.camY = 0;
    this.self = this.newEntity({ name: "", color: "#fff", cls: "fighter" });
    this.stats = { online: 1, hp: 100, maxHp: 100, level: 1, exp: 0, expNext: 50, dead: false, cls: "fighter" };

    this.remotes = new Map(); // sessionId -> pemain lain
    this.monsters = new Map(); // monsterId -> monster
    this.ghosts = []; // monster yang sedang animasi mati
    this.projs = new Map(); // proyektil visual
    this.floaters = []; // teks damage / exp melayang
    this.fx = new FX();

    this.ping = 0;
    this.running = false;
    this.acc = 0;
    this.last = 0;
    this.cleanups = [];

    this.dark = document.createElement("canvas"); // layer kegelapan
    this.dctx = this.dark.getContext("2d");
    this.buildMap();
  }

  newEntity(extra) {
    return { swingT: -9999, hitT: -9999, hx: 0, hy: 0, hitPow: 0, walk: 0, moving: 0, px: null, py: null, dustT: 0, ...extra };
  }

  get cooldown() {
    const c = this.config.classes && this.config.classes[this.self.cls];
    return c ? c.cooldown : this.config.attackCooldown;
  }

  // ---------- Persiapan peta ----------
  buildMap() {
    const { cols, rows, grid, tile } = this.map;
    const floor = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && grid[y][x] === ".";

    // 0 = void, 1 = dinding, 2 = lantai, 3 = dinding sisi depan (south-nya lantai)
    this.kinds = [];
    this.torches = [];
    for (let y = 0; y < rows; y++) {
      const row = new Uint8Array(cols);
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === ".") row[x] = 2;
        else {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (floor(x + dx, y + dy)) near = true;
          row[x] = near ? (floor(x, y + 1) ? 3 : 1) : 0;
          if (row[x] === 3 && hash(x, y) % 7 === 0) this.torches.push({ x: x * tile + tile / 2, y: y * tile + tile * 0.5, ph: (hash(y, x) % 628) / 100 });
        }
      }
      this.kinds.push(row);
    }

    // Minimap (digambar sekali)
    const mw = 200;
    this.miniScale = mw / this.map.width;
    this.mini = document.createElement("canvas");
    this.mini.width = mw;
    this.mini.height = Math.ceil(this.map.height * this.miniScale);
    const mc = this.mini.getContext("2d");
    mc.fillStyle = "#4b5178";
    const s = tile * this.miniScale;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (this.kinds[y][x] === 2) mc.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
  }

  start() {
    this.bindState();
    this.bindInput();
    this.bindMessages();
    this.resize();
    this.on(window, "resize", () => this.resize());

    audio.unlock();
    audio.startAmbient();

    this.pingTimer = setInterval(() => this.room.send("ping", Date.now()), 2000);
    this.room.send("ping", Date.now());

    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.pingTimer);
    audio.stopAmbient();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }

  on(target, evt, fn) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(evt, fn);
    this.cleanups.push(() => target.removeEventListener(evt, fn));
  }

  updateStats(patch) {
    const next = { ...this.stats, ...patch };
    if (Object.keys(next).some((k) => next[k] !== this.stats[k])) {
      this.stats = next;
      this.onStats(next);
    }
  }

  // ---------- Pesan dari server ----------
  bindMessages() {
    const r = this.room;
    r.onMessage("pong", (t) => (this.ping = Math.round(Date.now() - t)));
    r.onMessage("fx", (f) => this.onFloater(f));
    r.onMessage("hit", (h) => this.onHit(h));
    r.onMessage("proj", (p) => this.projs.set(p.id, { ...p, t: 0, trailT: 0 }));
    r.onMessage("projEnd", (p) => this.onProjEnd(p));
    r.onMessage("heal", (h) => {
      this.fx.healPulse(h.x, h.y + 6, h.r);
      audio.play("heal", h);
    });
  }

  onFloater(f) {
    this.floaters.push({ ...f, t: 0 });
    if (f.k === "levelup") {
      audio.play("levelUp", f);
      this.fx.levelUp(f.x, f.y + 34);
    } else if (f.k === "ko") {
      audio.play("ko", f);
    }
  }

  entityOf(h) {
    if (h.k === "m") return this.monsters.get(h.id);
    if (h.id === this.room.sessionId) return this.self;
    return this.remotes.get(h.id);
  }

  // Kena pukul: animasi tubuh, partikel, suara, dan (bila kita yang kena) guncangan + distorsi layar
  onHit(h) {
    const now = performance.now();
    const ent = this.entityOf(h);
    const toMe = h.k === "p" && h.id === this.room.sessionId;
    const byMe = h.by === this.room.sessionId;
    const pow = clamp(h.kb / 450, 0.35, 1.3);
    if (ent) {
      ent.hitT = now;
      ent.hx = h.dx;
      ent.hy = h.dy;
      ent.hitPow = pow;
    }
    const pos = toMe && this.local ? { x: this.local.x, y: this.local.y } : { x: h.x, y: h.y };
    const col = SPARK_COLOR[h.src] || "#fff";
    const fx = this.fx;

    if (h.k === "m") {
      if (!h.aoe) audio.play(HIT_SOUND[h.src] || "swordHit", pos);
      const mt = this.config.monsterTypes[h.kind] || { radius: 14 };
      audio.play(h.kill ? h.kind + "Die" : h.kind + "Hurt", pos);
      fx.sparks(pos.x, pos.y, h.dx, h.dy, h.crit ? 16 : 9, h.crit ? "#fff7d6" : col, 280);
      fx.ring(pos.x, pos.y, 26 + pow * 16, h.crit ? "rgba(255,230,150,0.95)" : "rgba(255,255,255,0.8)", 0.28, 3);
      const bf = BODY_FX[h.kind] || {};
      if (bf.drops) fx.drops(pos.x, pos.y, h.dx, h.dy, h.kill ? 16 : 6, bf.drops, 4);
      if (bf.chips) fx.chips(pos.x, pos.y, h.dx, h.dy, h.kill ? 14 : 4, bf.chips, 4);
      fx.puffs(pos.x, pos.y + 12, 3, "rgba(150,140,130,0.45)", 6, 36, h.dx * 80, h.dy * 50);
      if (h.kill) {
        if (ent) ent.dead = true;
        this.ghosts.push({ kind: h.kind, r: mt.radius, x: pos.x, y: pos.y, face: ent ? ent.face : 0, id: ent ? ent.id : 1, vx: h.dx * h.kb * 0.6, vy: h.dy * h.kb * 0.6, dx: h.dx, t: 0 });
        fx.ring(pos.x, pos.y, 50, "rgba(255,255,255,0.7)", 0.4, 4);
      }
      if (byMe) fx.addShake(h.kill ? 0.3 : 0.14, h.dx * 0.5, h.dy * 0.5);
    } else {
      audio.play("playerHurt", pos);
      fx.sparks(pos.x, pos.y, h.dx, h.dy, 12, col, 300);
      fx.ring(pos.x, pos.y, 34 + pow * 18, "rgba(255,90,90,0.9)", 0.32, 4);
      fx.puffs(pos.x, pos.y + 12, 5, "rgba(160,150,140,0.5)", 7, 50, h.dx * 130, h.dy * 80); // debu terseret
      if (toMe) {
        fx.addShake(0.45 + pow * 0.4, h.dx, h.dy);
        fx.distort = Math.min(1, 0.65 + pow * 0.4);
        fx.hurt = 1;
        this.kbBoostUntil = now + 450;
      } else {
        const d = this.local ? Math.hypot(pos.x - this.local.x, pos.y - this.local.y) : 999;
        if (d < 350) fx.addShake(0.12 * (1 - d / 350));
      }
    }
  }

  onProjEnd(p) {
    this.projs.delete(p.id);
    const fx = this.fx;
    if (p.type === "fireball") {
      fx.explosion(p.x, p.y, p.r || 72);
      audio.play("fireBoom", p);
      if (this.local) {
        const d = Math.hypot(p.x - this.local.x, p.y - this.local.y);
        if (d < 420) fx.addShake(0.32 * (1 - d / 420));
        if (d < 110) fx.distort = Math.max(fx.distort, 0.45);
      }
    } else if (p.type === "arrow") {
      if (p.end === "wall") {
        fx.add({ type: "arrow", x: p.x + p.dx * 4, y: p.y, z: 10, vx: 0, vy: 0, life: 1.8, rot: Math.atan2(p.dy, p.dx) });
        fx.sparks(p.x, p.y, -p.dx, -p.dy, 6, "#e5e7eb", 200, 0.8);
        audio.play("arrowWall", p);
      } else if (p.end === "hit") fx.puffs(p.x, p.y, 2, "rgba(180,170,160,0.5)", 5, 30);
    } else if (p.type === "orb") {
      fx.ring(p.x, p.y, 30, "rgba(130,255,180,0.9)", 0.3, 3);
      fx.sparks(p.x, p.y, -p.dx, -p.dy, 8, "#bbf7d0", 220, Math.PI);
    }
  }

  // Suara + partikel saat menyerang (dipakai pemain lokal & remote)
  castFx(cls, x, y, aim, isMe) {
    const pos = isMe ? null : { x, y };
    const tx = x + Math.cos(aim) * 32;
    const ty = y - 8 + Math.sin(aim) * 20;
    if (cls === "fighter") audio.play("swordSwing", pos);
    else if (cls === "mage") {
      audio.play("fireCast", pos);
      this.fx.add({ type: "glow", x: tx, y: ty + 8, z: 14, vx: 0, vy: 0, life: 0.3, size: 30, color: "rgba(255,150,50,0.9)", add: true, grow: 0.5 });
      this.fx.sparks(tx, ty + 8, Math.cos(aim), Math.sin(aim), 7, "#fdba74", 200, 1);
    } else if (cls === "marksman") {
      audio.play("bowShot", pos);
      this.fx.puffs(tx, ty + 10, 1, "rgba(230,230,220,0.4)", 4, 20);
    } else if (cls === "support") {
      audio.play("holyCast", pos);
      this.fx.add({ type: "glow", x: tx, y: ty + 8, z: 14, vx: 0, vy: 0, life: 0.35, size: 30, color: "rgba(120,255,180,0.9)", add: true, grow: 0.5 });
    }
  }

  // ---------- State dari server ----------
  bindState() {
    const state = this.room.state;
    const myId = this.room.sessionId;
    const now = () => performance.now();

    // Schema v2: onAdd(cb) juga dipanggil untuk entitas yang sudah ada
    state.players.onAdd((player, id) => {
      if (id === myId) {
        this.local = { x: player.x, y: player.y };
        this.facing = player.facing;
        this.aim = player.aim || player.facing;
        Object.assign(this.self, { name: player.name, color: player.color, cls: player.cls || "fighter", skin: skinFor(player.name), hair: hairFor(player.name) });
        const sync = () => {
          this.reconcile(player);
          this.updateStats({
            hp: Math.round(player.hp), maxHp: player.maxHp, level: player.level,
            exp: player.exp, expNext: player.expNext, dead: player.dead, cls: player.cls || "fighter",
          });
        };
        player.onChange(sync);
        sync();
      } else {
        const r = this.newEntity({
          x: player.x, y: player.y, tx: player.x, ty: player.y,
          name: player.name, color: player.color, cls: player.cls || "fighter", hp: player.hp, maxHp: player.maxHp,
          aim: player.aim, taim: player.aim, dead: player.dead, attackSeq: player.attackSeq, level: player.level,
          skin: skinFor(player.name), hair: hairFor(player.name),
        });
        this.remotes.set(id, r);
        player.onChange(() => {
          r.tx = player.x;
          r.ty = player.y;
          if (Math.hypot(r.tx - r.x, r.ty - r.y) > 150) { r.x = r.tx; r.y = r.ty; } // respawn: langsung pindah
          r.hp = player.hp;
          r.maxHp = player.maxHp;
          r.taim = player.aim;
          r.dead = player.dead;
          r.level = player.level;
          r.cls = player.cls || r.cls;
          if (player.attackSeq !== r.attackSeq) {
            r.attackSeq = player.attackSeq;
            r.swingT = now();
            this.castFx(r.cls, r.x, r.y, r.taim, false);
          }
        });
      }
      this.updateStats({ online: state.players.size });
    });

    state.players.onRemove((_p, id) => {
      this.remotes.delete(id);
      this.updateStats({ online: state.players.size });
    });

    state.monsters.onAdd((m, id) => {
      const e = this.newEntity({
        x: m.x, y: m.y, tx: m.x, ty: m.y, kind: m.kind, hp: m.hp, maxHp: m.maxHp, dead: m.dead,
        face: m.face, tface: m.face, attackSeq: m.attackSeq, atkT: -9999, id: strHash(id), aggro: false,
      });
      this.monsters.set(id, e);
      m.onChange(() => {
        e.hp = m.hp;
        e.maxHp = m.maxHp;
        e.dead = m.dead;
        e.tx = m.x;
        e.ty = m.y;
        e.tface = m.face;
        if (Math.hypot(e.tx - e.x, e.ty - e.y) > 150) { e.x = e.tx; e.y = e.ty; } // respawn
        if (m.attackSeq !== e.attackSeq) {
          e.attackSeq = m.attackSeq;
          e.atkT = now();
          audio.play(e.kind + "Atk", { x: e.x, y: e.y });
        }
      });
    });
    state.monsters.onRemove((_m, id) => this.monsters.delete(id));
  }

  // Server Reconciliation: reset ke posisi server lalu replay input yang belum di-ack.
  reconcile(player) {
    this.pending = this.pending.filter((i) => i.seq > player.lastSeq);
    const pos = { x: player.x, y: player.y };
    for (const input of this.pending) this.applyInput(pos, input);
    const dx = pos.x - this.local.x;
    const dy = pos.y - this.local.y;
    if (Math.hypot(dx, dy) > 90) {
      this.local.x = pos.x;
      this.local.y = pos.y;
    } else {
      // saat terpental, ikuti posisi server lebih cepat supaya knockback terasa
      const f = performance.now() < this.kbBoostUntil ? 0.85 : 0.5;
      this.local.x += dx * f;
      this.local.y += dy * f;
    }
  }

  // Fungsi gerak identik dengan server (termasuk collision dinding).
  applyInput(pos, input) {
    if (this.stats.dead) return;
    let dx = input.x;
    let dy = input.y;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const sp = this.config.speed * this.step;
    moveWithCollision(pos, dx * sp, dy * sp, this.map, this.config.playerRadius);
  }

  // ---------- Input ----------
  bindInput() {
    this.on(window, "keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.spaceDown = true;
        this.attack();
        return;
      }
      if (e.code === "KeyM" && !e.repeat) {
        audio.setMuted(audio.enabled);
        this.onStats({ ...this.stats, muted: !audio.enabled });
        return;
      }
      const k = KEYS[e.code];
      if (k) {
        this.keys[k] = true;
        e.preventDefault();
      }
    });
    this.on(window, "keyup", (e) => {
      if (e.code === "Space") this.spaceDown = false;
      const k = KEYS[e.code];
      if (k) this.keys[k] = false;
    });
    this.on(window, "blur", () => {
      Object.keys(this.keys).forEach((k) => (this.keys[k] = false));
      this.mouseDown = this.spaceDown = false;
    });
    this.on(this.canvas, "mousemove", (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    this.on(this.canvas, "mousedown", (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.mouseDown = true;
      this.attack();
    });
    this.on(window, "mouseup", () => (this.mouseDown = false));
  }

  computeAim() {
    if (this.mouse && this.local) return Math.atan2(this.mouse.y + this.camY - (this.local.y - 6), this.mouse.x + this.camX - this.local.x);
    return this.facing;
  }

  attack() {
    const now = performance.now();
    if (this.stats.dead || !this.local || now - this.lastAttack < this.cooldown) return;
    this.lastAttack = now;
    this.self.swingT = now;
    this.aim = this.computeAim();
    this.room.send("attack", { aim: Math.round(this.aim * 100) / 100 });
    this.castFx(this.self.cls, this.local.x, this.local.y, this.aim, true);
  }

  // ---------- Loop ----------
  frame(now) {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;

    while (this.acc >= this.step) {
      this.acc -= this.step;
      this.tick();
    }

    const k = 1 - Math.pow(0.001, dt); // smoothing independen framerate
    this.remotes.forEach((r) => {
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
      r.aim = lerpAngle(r.aim, r.taim, 1 - Math.pow(0.0005, dt));
      this.animate(r, dt, now);
    });
    this.monsters.forEach((m) => {
      m.x += (m.tx - m.x) * k;
      m.y += (m.ty - m.y) * k;
      m.face = lerpAngle(m.face, m.tface, 1 - Math.pow(0.0005, dt));
      m.aggro = !!this.local && !this.stats.dead && Math.hypot(m.x - this.local.x, m.y - this.local.y) < 300;
      this.animate(m, dt, now);
    });
    if (this.local) {
      this.self.x = this.local.x;
      this.self.y = this.local.y;
      this.aim = lerpAngle(this.aim, this.computeAim(), 1 - Math.pow(0.00005, dt));
      this.animate(this.self, dt, now);
      audio.listener = { x: this.local.x, y: this.local.y };
    }
    this.projs.forEach((p) => this.updateProj(p, dt));
    for (const g of this.ghosts) {
      g.t += dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= Math.pow(0.02, dt);
      g.vy *= Math.pow(0.02, dt);
    }
    this.ghosts = this.ghosts.filter((g) => g.t < 0.7);
    this.floaters.forEach((f) => (f.t += dt));
    this.floaters = this.floaters.filter((f) => f.t < 1.1);
    this.fx.update(dt);

    this.render(now);
  }

  // Fase jalan + debu langkah
  animate(e, dt, now) {
    if (e.px === null) { e.px = e.x; e.py = e.y; }
    const sp = Math.hypot(e.x - e.px, e.y - e.py) / Math.max(dt, 0.001);
    e.px = e.x;
    e.py = e.y;
    const sliding = now - e.hitT < 280; // sedang terpental: kaki tidak melangkah
    const target = sliding || e.dead ? 0 : clamp(sp / 90, 0, 1);
    e.moving += (target - e.moving) * Math.min(1, dt * 14);
    e.walk += sp * dt * 0.07 * (sliding ? 0 : 1);
    if (sliding && sp > 60 && now - e.dustT > 55) {
      e.dustT = now;
      this.fx.puffs(e.x, e.y + 13, 1, "rgba(160,150,140,0.5)", 6, 14);
    } else if (e.moving > 0.8 && now - e.dustT > 190) {
      e.dustT = now;
      this.fx.puffs(e.x, e.y + 13, 1, "rgba(150,140,130,0.28)", 4, 10);
    }
  }

  updateProj(p, dt) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.trailT += dt;
    if (p.t * 1000 > p.life + 400) return this.projs.delete(p.id);
    const fx = this.fx;
    if (p.trailT > 0.02) {
      p.trailT = 0;
      if (p.type === "fireball") {
        fx.add({ type: "glow", x: p.x, y: p.y, z: 10, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.35, size: 14, color: "rgba(255,120,30,0.8)", add: true, drag: 0.9 });
        if (Math.random() < 0.4) fx.puffs(p.x, p.y, 1, "rgba(60,50,50,0.4)", 6, 16);
        if (Math.random() < 0.5) fx.sparks(p.x, p.y, -p.vx, -p.vy, 1, "#fbbf24", 160, 0.6);
      } else if (p.type === "orb") {
        fx.add({ type: "glow", x: p.x, y: p.y, z: 10, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.4, size: 11, color: "rgba(120,255,180,0.7)", add: true });
        if (Math.random() < 0.3) fx.add({ type: "plus", x: p.x + (Math.random() - 0.5) * 8, y: p.y, z: 10, vx: 0, vy: 0, rise: 25, life: 0.5, size: 2.6, color: "#bbf7d0", add: true });
      } else if (p.type === "arrow") {
        fx.add({ type: "spark", x: p.x, y: p.y, z: 10, vx: -p.vx * 0.05, vy: -p.vy * 0.05, life: 0.15, len: 22, size: 1.4, color: "rgba(255,255,255,0.7)", add: true });
      }
    }
  }

  tick() {
    if (!this.local) return;
    const input = {
      seq: ++this.seq,
      x: (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0),
      y: (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0),
    };
    if (!this.stats.dead && (input.x !== 0 || input.y !== 0)) this.facing = Math.atan2(input.y, input.x);
    if (this.mouse) input.aim = Math.round(this.computeAim() * 100) / 100;
    this.room.send("input", input);
    this.applyInput(this.local, input); // prediksi langsung
    this.pending.push(input);
    if (this.pending.length > 120) this.pending.shift();
    if (this.mouseDown || this.spaceDown) this.attack(); // tahan untuk menyerang terus
  }

  // ---------- Render ----------
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dark.width = this.w;
    this.dark.height = this.h;
  }

  render(now) {
    const { ctx, w, h, map } = this;
    ctx.fillStyle = "#05060b";
    ctx.fillRect(0, 0, w, h);
    if (!this.local) return;

    const off = this.fx.cameraOffset(now);
    const camX = clamp(this.local.x - w / 2, Math.min(0, map.width - w), Math.max(0, map.width - w)) + off.x;
    const camY = clamp(this.local.y - h / 2, Math.min(0, map.height - h), Math.max(0, map.height - h)) + off.y;
    this.camX = camX;
    this.camY = camY;

    ctx.save();
    ctx.translate(-camX, -camY);
    this.drawTiles(camX, camY);
    this.drawTorches(camX, camY, now);

    // Entitas diurutkan berdasarkan y agar tumpang-tindihnya benar
    const list = [];
    this.monsters.forEach((m) => !m.dead && list.push({ y: m.y, draw: () => this.drawMonsterEntity(m, now) }));
    this.ghosts.forEach((g) => list.push({ y: g.y, draw: () => this.drawGhost(g, now) }));
    this.remotes.forEach((r) => list.push({ y: r.y, draw: () => this.drawPlayer(r, false, now) }));
    list.push({ y: this.local.y, draw: () => this.drawPlayer(this.self, true, now) });
    list.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

    this.projs.forEach((p) => this.drawProj(p, now));
    this.fx.draw(ctx, false);
    ctx.globalCompositeOperation = "lighter";
    this.fx.draw(ctx, true);
    ctx.globalCompositeOperation = "source-over";
    this.drawFloaters();
    ctx.restore();

    this.drawLighting(camX, camY, now);
    this.fx.applyDistortion(ctx, w, h, now);
    this.fx.drawHurt(ctx, w, h, now, !this.stats.dead && this.stats.hp / this.stats.maxHp < 0.28);
    this.drawMinimap();
  }

  // Reaksi tubuh saat kena pukul: terdorong, bergetar, gepeng, flash
  reaction(e, now) {
    const age = now - e.hitT;
    if (age < 0 || age > 450) return null;
    const k = Math.exp(-age / 95);
    const p = e.hitPow;
    const osc = Math.sin(age * 0.085) * k;
    return {
      ox: e.hx * p * 13 * k - e.hy * osc * 2.8 * p,
      oy: e.hy * p * 8 * k + e.hx * osc * 2.8 * p,
      sx: 1 - 0.2 * k * p * Math.abs(e.hx) + 0.12 * k * p * Math.abs(e.hy),
      sy: 1 - 0.2 * k * p * Math.abs(e.hy) + 0.12 * k * p * Math.abs(e.hx),
      flash: age < 140 ? 1 - age / 140 : 0,
    };
  }

  drawEntity(e, now, size, flashColor, drawFn) {
    const { ctx } = this;
    const r = this.reaction(e, now);
    ctx.save();
    ctx.translate(e.x + (r ? r.ox : 0), e.y + (r ? r.oy : 0));
    if (r) {
      ctx.translate(0, 14);
      ctx.scale(r.sx, r.sy);
      ctx.translate(0, -14);
    }
    ctx.scale(1.2, 1.2); // sedikit diperbesar agar detail terbaca
    if (r && r.flash > 0.02) drawFlashed(ctx, 0, 0, size, flashColor, r.flash * 0.85, drawFn);
    else drawFn(ctx);
    ctx.restore();
  }

  drawPlayer(p, isMe, now) {
    const { ctx } = this;
    const age = now - p.swingT;
    const o = {
      cls: p.cls,
      aim: isMe ? this.aim : p.aim,
      color: p.color,
      skin: p.skin,
      hair: p.hair,
      walk: p.walk,
      moving: p.moving,
      atk: age >= 0 && age < (ATTACK_ANIM_MS[p.cls] || 300) ? age : -1,
      dead: isMe ? this.stats.dead : p.dead,
    };
    this.drawEntity(p, now, 90, isMe ? "#ff2030" : "#ffffff", (c) => drawCharacter(c, o, now));
    if (isMe && !o.dead) {
      // bar cooldown tipis di bawah kaki
      const cd = clamp((now - this.lastAttack) / this.cooldown, 0, 1);
      if (cd < 1) this.drawBar(p.x, p.y + 25, 28, 3, cd, "#fbbf24");
    }

    // Nama (+ bar HP untuk pemain lain)
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    const cname = p.cls ? p.cls[0].toUpperCase() + p.cls.slice(1) : "";
    const label = isMe ? p.name : `${p.name}${p.level ? " · Lv" + p.level : ""} · ${cname}`;
    const ly = p.y - 62 - (isMe ? 0 : 8);
    ctx.strokeText(label, p.x, ly);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, p.x, ly);
    if (!isMe && p.maxHp) this.drawBar(p.x, ly + 5, 40, 5, p.hp / p.maxHp, "#22c55e");
  }

  drawMonsterEntity(m, now) {
    const type = this.config.monsterTypes[m.kind];
    const age = now - m.atkT;
    const o = {
      kind: m.kind, r: type.radius, face: m.face, walk: m.walk, moving: m.moving,
      atk: age >= 0 && age < (MONSTER_ATTACK_MS[m.kind] || 300) ? age : -1,
      aggro: m.aggro || m.hp < m.maxHp, id: m.id,
    };
    this.drawEntity(m, now, 90, "#ffffff", (c) => drawMonster(c, o, now));
    if (m.hp < m.maxHp) this.drawBar(m.x, m.y - type.radius - 42, Math.max(30, type.radius * 2), 5, m.hp / m.maxHp, "#ef4444");
  }

  // Monster mati: slime meleleh, skeleton ambruk, orc tumbang lalu memudar
  drawGhost(g, now) {
    const { ctx } = this;
    const k = clamp(g.t / 0.65, 0, 1);
    const o = { kind: g.kind, r: g.r, face: g.face, walk: 0, moving: 0, atk: -1, aggro: true, id: g.id };
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.globalAlpha = 1 - clamp((k - 0.35) / 0.65, 0, 1);
    ctx.translate(0, 14);
    if (g.kind === "slime") ctx.scale(1 + k * 0.7, 1 - k * 0.85);
    else {
      const dir = g.dx >= 0 ? 1 : -1;
      ctx.rotate(dir * Math.PI * 0.5 * Math.pow(k, 0.6) * (g.kind === "orc" ? 1 : 0.9));
      ctx.scale(1, 1 - k * 0.2);
    }
    ctx.translate(0, -14);
    const flash = clamp(1 - g.t / 0.15, 0, 1);
    if (flash > 0.02) drawFlashed(ctx, 0, 0, 90, "#ffffff", flash * 0.9, (c) => drawMonster(c, o, now));
    else drawMonster(ctx, o, now);
    ctx.restore();
  }

  drawProj(p, now) {
    const { ctx } = this;
    const y = p.y - 10;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 6, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, y);
    if (p.type === "fireball") {
      const f = 1 + 0.1 * Math.sin(now * 0.04 + p.id);
      ctx.globalCompositeOperation = "lighter";
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 * f);
      g.addColorStop(0, "rgba(255,160,50,0.65)");
      g.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-32, -32, 64, 64);
      ctx.globalCompositeOperation = "source-over";
      g = ctx.createRadialGradient(-1.5, -1.5, 0, 0, 0, 10 * f);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, "#fde68a");
      g.addColorStop(0.7, "#f97316");
      g.addColorStop(1, "#b91c1c");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 10 * f, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === "arrow") {
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.strokeStyle = "#8b5e34";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.fillStyle = "#f1f5f9";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.lineTo(15, 0);
      ctx.lineTo(8, 3);
      ctx.lineTo(10, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e5e7eb";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-19, 0);
        ctx.lineTo(-25, s * 3.2);
        ctx.lineTo(-22, s * 3);
        ctx.lineTo(-15, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const f = 1 + 0.15 * Math.sin(now * 0.03 + p.id);
      ctx.globalCompositeOperation = "lighter";
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 24 * f);
      g.addColorStop(0, "rgba(130,255,180,0.7)");
      g.addColorStop(1, "rgba(40,200,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-26, -26, 52, 52);
      ctx.globalCompositeOperation = "source-over";
      g = ctx.createRadialGradient(-1, -1, 0, 0, 0, 7 * f);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#bbf7d0");
      g.addColorStop(1, "#22c55e");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 7 * f, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBar(cx, y, width, height, frac, color) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(cx - width / 2 - 1, y - 1, width + 2, height + 2);
    ctx.fillStyle = color;
    ctx.fillRect(cx - width / 2, y, width * clamp(frac, 0, 1), height);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(cx - width / 2, y, width * clamp(frac, 0, 1), Math.max(1, height * 0.35));
  }

  drawFloaters() {
    const { ctx } = this;
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      const size = f.size || 17;
      const pop = f.t < 0.12 ? 1 + ((0.12 - f.t) / 0.12) * 0.6 : 1;
      ctx.globalAlpha = clamp(1.1 - f.t, 0, 1);
      const y = f.y - f.t * 42;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(pop, pop);
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color || "#fff";
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Layer gelap dengan "lubang" cahaya di sekitar pemain, obor, proyektil, dan ledakan
  drawLighting(camX, camY, now) {
    const { ctx, dctx, w, h } = this;
    dctx.globalCompositeOperation = "source-over";
    dctx.clearRect(0, 0, w, h);
    dctx.fillStyle = "rgba(3,4,9,0.95)";
    dctx.fillRect(0, 0, w, h);
    dctx.globalCompositeOperation = "destination-out";

    const light = (sx, sy, radius, strength) => {
      const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.7})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = g;
      dctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    };

    light(this.local.x - camX, this.local.y - camY, 320, 1);
    for (const tc of this.torches) {
      const sx = tc.x - camX;
      const sy = tc.y - camY;
      if (sx < -200 || sx > w + 200 || sy < -200 || sy > h + 200) continue;
      light(sx, sy, 190 * (0.9 + 0.1 * Math.sin(now * 0.012 + tc.ph)), 0.9);
    }
    this.projs.forEach((p) => light(p.x - camX, p.y - 10 - camY, p.type === "fireball" ? 210 : p.type === "orb" ? 160 : 70, 0.9));
    for (const l of this.fx.lights) light(l.x - camX, l.y - camY, l.r, l.strength * (1 - l.t / l.life));
    dctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.dark, 0, 0, w, h);
  }

  drawTiles(camX, camY) {
    const { ctx, w, h, map } = this;
    const t = map.tile;
    const x0 = Math.max(0, Math.floor(camX / t));
    const y0 = Math.max(0, Math.floor(camY / t));
    const x1 = Math.min(map.cols - 1, Math.floor((camX + w) / t));
    const y1 = Math.min(map.rows - 1, Math.floor((camY + h) / t));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const kind = this.kinds[ty][tx];
        if (kind === 0) continue;
        const px = tx * t;
        const py = ty * t;
        const hv = hash(tx, ty);

        if (kind === 2) {
          ctx.fillStyle = FLOOR_COLORS[hv % 3];
          ctx.fillRect(px, py, t, t);
          ctx.strokeStyle = "rgba(0,0,0,0.28)";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
          if (hv % 9 === 0) {
            ctx.fillStyle = "rgba(0,0,0,0.18)";
            ctx.fillRect(px + (hv % 30) + 4, py + ((hv >> 5) % 30) + 4, 6, 3);
          }
        } else if (kind === 3) {
          ctx.fillStyle = "#4a4f70";
          ctx.fillRect(px, py, t, t);
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let r = 1; r < 3; r++) {
            ctx.moveTo(px, py + (t / 3) * r);
            ctx.lineTo(px + t, py + (t / 3) * r);
          }
          for (let r = 0; r < 3; r++) {
            const off = r % 2 ? t / 4 : (t * 3) / 4;
            ctx.moveTo(px + off, py + (t / 3) * r);
            ctx.lineTo(px + off, py + (t / 3) * (r + 1));
          }
          ctx.stroke();
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(px, py + t - 4, t, 4);
        } else {
          ctx.fillStyle = "#2f3350";
          ctx.fillRect(px, py, t, t);
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(px, py, t, 3);
        }
      }
    }
  }

  drawTorches(camX, camY, now) {
    const { ctx, w, h } = this;
    for (const tc of this.torches) {
      if (tc.x < camX - 60 || tc.x > camX + w + 60 || tc.y < camY - 60 || tc.y > camY + h + 60) continue;
      const f = 0.85 + 0.15 * Math.sin(now * 0.012 + tc.ph);
      ctx.fillStyle = "#3b2a1a";
      ctx.fillRect(tc.x - 3, tc.y - 2, 6, 14);
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.ellipse(tc.x, tc.y - 6, 6 * f, 10 * f, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.ellipse(tc.x, tc.y - 4, 3 * f, 6 * f, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawMinimap() {
    const { ctx, w, h } = this;
    const mw = this.mini.width;
    const mh = this.mini.height;
    const ox = w - mw - 16;
    const oy = h - mh - 16;
    const s = this.miniScale;

    ctx.fillStyle = "rgba(8,10,20,0.8)";
    ctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
    ctx.drawImage(this.mini, ox, oy);

    ctx.fillStyle = "#ef4444";
    this.monsters.forEach((m) => {
      if (!m.dead) ctx.fillRect(ox + m.x * s - 1.5, oy + m.y * s - 1.5, 3, 3);
    });
    ctx.fillStyle = "#60a5fa";
    this.remotes.forEach((r) => {
      ctx.beginPath();
      ctx.arc(ox + r.x * s, oy + r.y * s, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox + this.local.x * s, oy + this.local.y * s, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
