const { Room } = require("colyseus");
const { Player, Monster, WorldState } = require("./schema");
const { generateMap, MONSTER_TYPES, TILE } = require("./map");
const { moveWithCollision, isWall } = require("./physics");
const { CLASSES, DEFAULT_CLASS } = require("./classes");

const TICK_RATE = 60;
const STEP = 1 / TICK_RATE;
const MAX_QUEUE = 12; // batas antrean input per pemain (anti-flood)
const MAX_INPUTS_PER_TICK = 3; // batas input diproses per tick (anti speed-hack)

const PLAYER_SPEED = 220; // px/detik
const PLAYER_RADIUS = 16;
const ATTACK_COOLDOWN = 450; // ms (default untuk config lama)
const RESPAWN_DELAY = 3000; // ms
const KB_DECAY = 0.9; // pengali kecepatan knockback per tick
const COLORS = ["#f59e0b", "#ef4444", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

const classOf = (cls) => CLASSES[cls] || CLASSES[DEFAULT_CLASS];
const maxHpFor = (level, cls) => {
  const c = classOf(cls);
  return c.hp + (level - 1) * c.hpLevel;
};
const expNextFor = (level) => 50 * level;
const round2 = (v) => Math.round(v * 100) / 100;

class WorldRoom extends Room {
  onCreate() {
    this.maxClients = 50;
    this.map = generateMap();
    this.config = {
      tickRate: TICK_RATE,
      patchRate: 20,
      speed: PLAYER_SPEED,
      playerRadius: PLAYER_RADIUS,
      attackCooldown: ATTACK_COOLDOWN,
      tile: this.map.tile,
      cols: this.map.cols,
      rows: this.map.rows,
      width: this.map.width,
      height: this.map.height,
      grid: this.map.grid,
      monsterTypes: MONSTER_TYPES,
      classes: CLASSES,
    };

    this.inputQueues = new Map(); // sessionId -> [input]
    this.lastAttack = new Map(); // sessionId -> timestamp
    this.playerKb = new Map(); // sessionId -> kecepatan knockback {x,y}
    this.monsterAI = new Map(); // monsterId -> state internal (tidak disinkron)
    this.projectiles = []; // proyektil aktif (disimulasikan server)
    this.projSeq = 0;
    this.colorIndex = 0;
    this.regenAt = 0;

    this.setState(new WorldState());
    this.setPatchRate(1000 / this.config.patchRate);
    this.spawnMonsters();

    this.onMessage("input", (client, msg) => {
      const q = this.inputQueues.get(client.sessionId);
      if (!q || !msg || typeof msg.seq !== "number") return;
      if (q.length >= MAX_QUEUE) return;
      q.push({ seq: msg.seq, x: clampAxis(msg.x), y: clampAxis(msg.y), aim: Number.isFinite(msg.aim) ? msg.aim : undefined });
    });

    this.onMessage("attack", (client, msg) => this.handleAttack(client.sessionId, msg));

    // Client meminta config setelah handler-nya terpasang (hindari race saat join)
    this.onMessage("getConfig", (client) => client.send("config", this.config));

    this.onMessage("ping", (client, t) => client.send("pong", t));

    // Hanya untuk tes otomatis; tidak aktif secara default.
    if (process.env.ENABLE_DEBUG === "1") {
      this.onMessage("debugTeleport", (client, m) => {
        const p = this.state.players.get(client.sessionId);
        if (p && m) {
          p.x = Number(m.x);
          p.y = Number(m.y);
        }
      });
    }

    this.setSimulationInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  // ---------- Setup ----------
  spawnMonsters() {
    let n = 0;
    for (const room of this.map.rooms) {
      for (const spec of room.monsters) {
        const t = MONSTER_TYPES[spec.kind];
        for (let i = 0; i < spec.count; i++) {
          const m = new Monster();
          m.kind = spec.kind;
          m.maxHp = m.hp = t.hp;
          m.x = Math.round((room.x + 2 + Math.random() * (room.w - 4)) * TILE);
          m.y = Math.round((room.y + 2 + Math.random() * (room.h - 4)) * TILE);
          const id = "m" + ++n;
          this.state.monsters.set(id, m);
          this.monsterAI.set(id, {
            home: { x: m.x, y: m.y },
            cd: 0,
            aggroed: false,
            wanderUntil: 0,
            dir: { x: 0, y: 0 },
            kb: { x: 0, y: 0 },
            stunUntil: 0,
          });
        }
      }
    }
  }

  inSafe(x, y) {
    const s = this.map.safeRect;
    return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  }

  spawnPoint() {
    return {
      x: this.map.spawn.x + (Math.random() - 0.5) * 120,
      y: this.map.spawn.y + (Math.random() - 0.5) * 120,
    };
  }

  // ---------- Loop ----------
  tick() {
    const now = Date.now();

    this.state.players.forEach((player, id) => {
      const q = this.inputQueues.get(id);
      if (!q || q.length === 0) return;
      let n = 0;
      while (q.length > 0 && n < MAX_INPUTS_PER_TICK) {
        const input = q.shift();
        this.applyInput(player, input);
        player.lastSeq = input.seq;
        n++;
      }
    });

    this.updatePlayerKnockback();
    this.updateMonsters(now);
    this.updateProjectiles();

    // Regenerasi HP di safe zone
    if (now >= this.regenAt) {
      this.regenAt = now + 500;
      this.state.players.forEach((p) => {
        if (!p.dead && p.hp < p.maxHp && this.inSafe(p.x, p.y)) p.hp = Math.min(p.maxHp, p.hp + 6);
      });
    }
  }

  applyInput(player, input) {
    if (player.dead) return;
    let dx = input.x;
    let dy = input.y;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    if (len > 0) player.facing = round2(Math.atan2(dy, dx));
    // Arah bidik: dari mouse bila dikirim client, kalau tidak ikut arah gerak
    if (input.aim !== undefined) player.aim = round2(input.aim);
    else if (len > 0) player.aim = player.facing;
    moveWithCollision(player, dx * PLAYER_SPEED * STEP, dy * PLAYER_SPEED * STEP, this.map, PLAYER_RADIUS);
  }

  // ---------- Knockback ----------
  knockPlayer(id, dx, dy, power) {
    const kb = this.playerKb.get(id);
    if (!kb) return;
    kb.x = dx * power;
    kb.y = dy * power;
  }

  updatePlayerKnockback() {
    this.playerKb.forEach((kb, id) => {
      if (Math.abs(kb.x) + Math.abs(kb.y) < 8) {
        kb.x = kb.y = 0;
        return;
      }
      const p = this.state.players.get(id);
      if (!p || p.dead) {
        kb.x = kb.y = 0;
        return;
      }
      moveWithCollision(p, kb.x * STEP, kb.y * STEP, this.map, PLAYER_RADIUS);
      kb.x *= KB_DECAY;
      kb.y *= KB_DECAY;
    });
  }

  // ---------- Monster AI (Agro system) ----------
  updateMonsters(now) {
    this.state.monsters.forEach((m, id) => {
      if (m.dead) return;
      const t = MONSTER_TYPES[m.kind];
      const ai = this.monsterAI.get(id);

      // Terpental akibat serangan: bergerak mengikuti knockback, tidak bisa beraksi selama stun
      if (Math.abs(ai.kb.x) + Math.abs(ai.kb.y) >= 8) {
        this.moveMonster(m, ai.kb.x * STEP, ai.kb.y * STEP, 1, t.radius, true);
        ai.kb.x *= KB_DECAY;
        ai.kb.y *= KB_DECAY;
      } else {
        ai.kb.x = ai.kb.y = 0;
      }
      if (now < ai.stunUntil) return;

      let target = null;
      let targetId = null;
      let best = Infinity;
      this.state.players.forEach((p, pid) => {
        if (p.dead || this.inSafe(p.x, p.y)) return;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < best) {
          best = d;
          target = p;
          targetId = pid;
        }
      });

      const range = ai.aggroed ? t.aggro * 1.8 : t.aggro; // lepas agro bila terlalu jauh
      if (target && best <= range) {
        ai.aggroed = true;
        const ux = (target.x - m.x) / (best || 1);
        const uy = (target.y - m.y) / (best || 1);
        m.face = Math.round(Math.atan2(uy, ux) * 10) / 10;
        const reach = t.radius + PLAYER_RADIUS + 4;
        if (best > reach) {
          this.moveMonster(m, ux, uy, t.speed, t.radius);
        } else if (now >= ai.cd) {
          ai.cd = now + t.cooldown;
          m.attackSeq++;
          this.hurtPlayer(target, targetId, t.damage, ux, uy, t.kb, m.kind);
        }
        return;
      }

      // Tidak ada target: kembali ke home / berkeliaran pelan
      ai.aggroed = false;
      const hx = ai.home.x - m.x;
      const hy = ai.home.y - m.y;
      const hd = Math.hypot(hx, hy);
      if (hd > 140) {
        m.face = Math.round(Math.atan2(hy, hx) * 10) / 10;
        this.moveMonster(m, hx / hd, hy / hd, t.speed * 0.8, t.radius);
      } else {
        if (now >= ai.wanderUntil) {
          ai.wanderUntil = now + 1500 + Math.random() * 2000;
          if (Math.random() < 0.5) ai.dir = { x: 0, y: 0 };
          else {
            const a = Math.random() * Math.PI * 2;
            ai.dir = { x: Math.cos(a), y: Math.sin(a) };
          }
        }
        if (ai.dir.x !== 0 || ai.dir.y !== 0) {
          m.face = Math.round(Math.atan2(ai.dir.y, ai.dir.x) * 10) / 10;
          this.moveMonster(m, ai.dir.x, ai.dir.y, t.speed * 0.35, t.radius);
        }
      }
    });
  }

  // raw=true: dirX/dirY sudah berupa jarak (px), bukan arah
  moveMonster(m, dirX, dirY, speed, radius, raw = false) {
    const tmp = { x: m.x, y: m.y };
    const dx = raw ? dirX : dirX * speed * STEP;
    const dy = raw ? dirY : dirY * speed * STEP;
    moveWithCollision(tmp, dx, dy, this.map, radius);
    if (this.inSafe(tmp.x, tmp.y)) return; // monster tidak boleh masuk safe zone
    m.x = Math.round(tmp.x * 10) / 10;
    m.y = Math.round(tmp.y * 10) / 10;
  }

  // Monster memukul pemain: damage + knockback + efek di semua client
  hurtPlayer(p, id, damage, dx, dy, kb, src) {
    p.hp = Math.max(0, p.hp - damage);
    this.knockPlayer(id, dx, dy, kb);
    const kill = p.hp <= 0;
    this.broadcast("hit", { k: "p", id, x: p.x, y: p.y, dx, dy, dmg: damage, kb, kill, src });
    this.broadcast("fx", { x: p.x, y: p.y - 24, text: "-" + damage, color: "#f87171", size: 19 });
    if (kill) this.killPlayer(p, id);
  }

  // ---------- Combat (Server Authority) ----------
  handleAttack(sessionId, msg) {
    const p = this.state.players.get(sessionId);
    if (!p || p.dead) return;
    const c = classOf(p.cls);
    const now = Date.now();
    if (now - (this.lastAttack.get(sessionId) || 0) < c.cooldown * 0.92) return; // validasi cooldown (toleransi jitter)
    this.lastAttack.set(sessionId, now);
    p.attackSeq++;
    if (msg && Number.isFinite(msg.aim)) p.aim = round2(msg.aim);

    const crit = Math.random() < c.crit;
    const damage = Math.round((c.dmg + p.level * c.dmgLevel + Math.floor(Math.random() * 5)) * (crit ? 1.7 : 1));

    if (c.kind === "melee") this.meleeAttack(sessionId, p, c, damage, crit);
    else this.fireProjectile(sessionId, p, c, damage, crit);
    if (c.heal) this.healAround(p, c);
  }

  meleeAttack(sessionId, p, c, damage, crit) {
    const fx = Math.cos(p.aim);
    const fy = Math.sin(p.aim);
    this.state.monsters.forEach((m, id) => {
      if (m.dead) return;
      const t = MONSTER_TYPES[m.kind];
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > c.range + t.radius) return;
      if (d > 1 && (dx * fx + dy * fy) / d < c.minDot) return; // harus di depan pemain
      const ux = d > 1 ? dx / d : fx;
      const uy = d > 1 ? dy / d : fy;
      this.damageMonster(id, m, damage, p, sessionId, ux, uy, c.kb, crit, "fighter");
    });
  }

  fireProjectile(sessionId, p, c, damage, crit) {
    const vx = Math.cos(p.aim);
    const vy = Math.sin(p.aim);
    const pr = {
      id: ++this.projSeq,
      owner: sessionId,
      type: c.proj,
      cls: p.cls,
      x: p.x + vx * 18,
      y: p.y + vy * 18,
      vx: vx * c.speed,
      vy: vy * c.speed,
      dx: vx,
      dy: vy,
      speed: c.speed,
      dist: 0,
      range: c.range,
      radius: c.radius,
      aoe: c.aoe,
      pierce: c.pierce,
      kb: c.kb,
      damage,
      crit,
      hit: new Set(),
    };
    this.projectiles.push(pr);
    this.broadcast("proj", {
      id: pr.id,
      type: pr.type,
      x: pr.x,
      y: pr.y,
      vx: pr.vx,
      vy: pr.vy,
      life: Math.round((c.range / c.speed) * 1000),
      owner: sessionId,
    });
  }

  updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.x += pr.vx * STEP;
      pr.y += pr.vy * STEP;
      pr.dist += pr.speed * STEP;

      let end = null;
      if (isWall(this.map, pr.x, pr.y)) {
        pr.x -= pr.vx * STEP * 2; // mundur sedikit supaya tidak di dalam dinding
        pr.y -= pr.vy * STEP * 2;
        end = "wall";
      } else {
        for (const [id, m] of this.state.monsters.entries()) {
          if (m.dead || pr.hit.has(id)) continue;
          const t = MONSTER_TYPES[m.kind];
          if (Math.hypot(m.x - pr.x, m.y - pr.y) > t.radius + pr.radius) continue;
          if (pr.aoe) {
            end = "hit";
            break;
          }
          pr.hit.add(id);
          const owner = this.state.players.get(pr.owner);
          this.damageMonster(id, m, pr.damage, owner, pr.owner, pr.dx, pr.dy, pr.kb, pr.crit, pr.cls);
          if (pr.pierce-- <= 0) {
            end = "hit";
            break;
          }
        }
      }
      if (!end && pr.dist >= pr.range) end = "expire";
      if (!end) continue;

      if (pr.aoe) this.explode(pr);
      this.broadcast("projEnd", { id: pr.id, type: pr.type, x: Math.round(pr.x), y: Math.round(pr.y), end, r: pr.aoe, dx: pr.dx, dy: pr.dy });
      this.projectiles.splice(i, 1);
    }
  }

  // Ledakan area (Mage): damage berkurang menjauhi pusat, dorongan radial
  explode(pr) {
    const owner = this.state.players.get(pr.owner);
    this.state.monsters.forEach((m, id) => {
      if (m.dead) return;
      const t = MONSTER_TYPES[m.kind];
      const dx = m.x - pr.x;
      const dy = m.y - pr.y;
      const d = Math.hypot(dx, dy);
      if (d > pr.aoe + t.radius) return;
      const fall = 1 - 0.4 * Math.min(1, d / pr.aoe);
      const ux = d > 1 ? dx / d : pr.dx;
      const uy = d > 1 ? dy / d : pr.dy;
      this.damageMonster(id, m, Math.max(1, Math.round(pr.damage * fall)), owner, pr.owner, ux, uy, pr.kb, pr.crit, pr.cls, true);
    });
  }

  damageMonster(id, m, dmg, attacker, attackerId, dx, dy, kbPower, crit, src, aoe = false) {
    if (m.dead) return;
    const t = MONSTER_TYPES[m.kind];
    const ai = this.monsterAI.get(id);
    m.hp = Math.max(0, m.hp - dmg);
    if (ai) {
      ai.aggroed = true;
      ai.stunUntil = Date.now() + t.stun;
      ai.kb.x = dx * kbPower * t.kbResist;
      ai.kb.y = dy * kbPower * t.kbResist;
    }
    const kill = m.hp <= 0;
    this.broadcast("hit", {
      k: "m", id, x: m.x, y: m.y, dx, dy, dmg, kb: kbPower * t.kbResist, crit, kill, src, by: attackerId, aoe, kind: m.kind,
    });
    this.broadcast("fx", {
      x: m.x, y: m.y - t.radius - 10, text: String(dmg) + (crit ? "!" : ""), color: crit ? "#fb923c" : "#fde047", size: crit ? 25 : 17,
    });
    if (kill) this.killMonster(id, m, t, attacker);
  }

  // Support: menyembuhkan sekutu (dan sedikit diri sendiri) di sekitar
  healAround(p, c) {
    const amount = c.heal.base + p.level * c.heal.level;
    this.state.players.forEach((q, qid) => {
      if (q.dead || Math.hypot(q.x - p.x, q.y - p.y) > c.heal.radius) return;
      const self = q === p;
      const before = q.hp;
      q.hp = Math.min(q.maxHp, q.hp + Math.round(amount * (self ? c.heal.selfFactor : 1)));
      const got = Math.round(q.hp - before);
      if (got > 0) this.broadcast("fx", { x: q.x, y: q.y - 40, text: "+" + got, color: "#4ade80", size: 18 });
    });
    this.broadcast("heal", { x: p.x, y: p.y, r: c.heal.radius });
  }

  killMonster(id, m, t, killer) {
    m.dead = true;
    m.hp = 0;
    if (killer) {
      this.addExp(killer, t.exp);
      this.broadcast("fx", { x: m.x, y: m.y - 30, text: "+" + t.exp + " EXP", color: "#a78bfa" });
    }
    const ai = this.monsterAI.get(id);
    this.clock.setTimeout(() => {
      m.x = ai.home.x;
      m.y = ai.home.y;
      m.hp = m.maxHp;
      m.dead = false;
      ai.aggroed = false;
      ai.kb.x = ai.kb.y = 0;
      ai.stunUntil = 0;
    }, t.respawn);
  }

  addExp(p, amount) {
    p.exp += amount;
    while (p.exp >= p.expNext) {
      p.exp -= p.expNext;
      p.level++;
      p.expNext = expNextFor(p.level);
      p.maxHp = maxHpFor(p.level, p.cls);
      p.hp = p.maxHp;
      this.broadcast("fx", { x: p.x, y: p.y - 40, text: "LEVEL UP!", color: "#34d399", k: "levelup" });
    }
  }

  killPlayer(p, id) {
    p.dead = true;
    p.hp = 0;
    const kb = this.playerKb.get(id);
    if (kb) kb.x = kb.y = 0;
    this.broadcast("fx", { x: p.x, y: p.y - 30, text: "KO!", color: "#ef4444", k: "ko" });
    this.clock.setTimeout(() => {
      const s = this.spawnPoint();
      p.x = s.x;
      p.y = s.y;
      p.hp = p.maxHp;
      p.dead = false;
    }, RESPAWN_DELAY);
  }

  // ---------- Join / Leave ----------
  onJoin(client, options) {
    const player = new Player();
    player.name = sanitizeName(options && options.name);
    player.cls = CLASSES[options && options.cls] ? options.cls : DEFAULT_CLASS;
    player.color = COLORS[this.colorIndex++ % COLORS.length];
    player.maxHp = player.hp = maxHpFor(1, player.cls);
    player.expNext = expNextFor(1);
    const s = this.spawnPoint();
    player.x = s.x;
    player.y = s.y;
    this.state.players.set(client.sessionId, player);
    this.inputQueues.set(client.sessionId, []);
    this.playerKb.set(client.sessionId, { x: 0, y: 0 });
    console.log(`[join] ${player.name} [${player.cls}] (${client.sessionId}) — ${this.clients.length} online`);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.inputQueues.delete(client.sessionId);
    this.lastAttack.delete(client.sessionId);
    this.playerKb.delete(client.sessionId);
    console.log(`[leave] ${p ? p.name : client.sessionId} — ${this.clients.length} online`);
  }
}

function clampAxis(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function sanitizeName(name) {
  const n = String(name || "").replace(/[^\w \-]/g, "").trim().slice(0, 16);
  return n || "Hero";
}

module.exports = { WorldRoom };
