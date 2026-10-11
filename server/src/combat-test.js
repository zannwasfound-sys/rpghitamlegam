// Tes combat & collision. Server dijalankan sendiri (port 2570, mode debug) — tidak perlu server lain.
const { spawn } = require("child_process");
const { Client } = require("colyseus.js");
const path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 2570;
const srv = spawn("node", [path.join(__dirname, "index.js")], {
  env: { ...process.env, PORT: String(PORT), ENABLE_DEBUG: "1" },
  stdio: "ignore",
});
const done = (code, msg) => {
  console.log(msg);
  srv.kill();
  process.exit(code);
};

(async () => {
  await sleep(2500);
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate("world", { name: "Tester" });
  const config = await new Promise((res) => {
    room.onMessage("config", res);
    room.send("getConfig");
  });
  await sleep(400);
  const me = () => room.state.players.get(room.sessionId);
  const fxs = [];
  room.onMessage("fx", (f) => fxs.push(f.text));

  console.log(`Peta ${config.cols}x${config.rows} tile, monster di state: ${room.state.monsters.size}`);
  if (room.state.monsters.size < 10) return done(1, "FAIL: monster tidak ter-spawn");

  // --- Collision dinding: dari spawn jalan ke kiri terus, harus berhenti di dinding ---
  const x0 = me().x;
  for (let i = 1; i <= 400; i++) {
    room.send("input", { seq: i, x: -1, y: 0 });
    if (i % 3 === 0) await sleep(16);
  }
  await sleep(600);
  const minX = config.tile * 4 + config.playerRadius; // tepi kiri ruangan spawn (kolom 4)
  console.log(`Jalan ke kiri: x ${x0.toFixed(0)} -> ${me().x.toFixed(0)} (batas dinding ~${minX})`);
  if (me().x < minX - 1) return done(1, "FAIL: pemain menembus dinding");
  if (me().x > minX + 6) return done(1, "FAIL: pemain tidak sampai dinding (cek tes)");

  // --- Combat ---
  let target = null;
  room.state.monsters.forEach((m, id) => {
    if (!target && m.kind === "skeleton") target = { id, m };
  });
  const m = target.m;
  const hp0 = m.hp;
  room.send("debugTeleport", { x: m.x - 35, y: m.y }); // di kiri monster, hadap kanan (facing awal 0)
  await sleep(200);
  room.send("input", { seq: 9000, x: 1, y: 0 }); // hadap kanan (ke arah monster)
  await sleep(100);

  let attacks = 0;
  let sawHurt = false;
  const start = Date.now();
  while (!m.dead && Date.now() - start < 12000) {
    room.send("attack");
    attacks++;
    await sleep(120); // sengaja lebih cepat dari cooldown 450ms: server harus menolak sisanya
    if (me().hp < me().maxHp) sawHurt = true;
  }
  await sleep(300);
  console.log(`Skeleton hp ${hp0} -> ${m.hp}, dead=${m.dead}; kirim ${attacks} request attack`);
  console.log(`Pemain: level ${me().level}, exp ${me().exp}/${me().expNext}, hp ${me().hp}/${me().maxHp}, terkena serang=${sawHurt}`);
  console.log("fx diterima:", fxs.slice(0, 8).join(" | "));

  if (!m.dead) return done(1, "FAIL: monster tidak mati");
  if (!sawHurt) return done(1, "FAIL: monster tidak menyerang balik (agro)");
  if (me().exp < 25 && me().level === 1) return done(1, "FAIL: EXP tidak bertambah");
  // cooldown: 12 detik max / 450ms ~ 27 serangan sah; request jauh lebih banyak dari itu
  if (!fxs.some((t) => t.includes("EXP"))) return done(1, "FAIL: tidak ada fx EXP");

  // --- Respawn monster ---
  console.log("Menunggu respawn skeleton (10 dtk)...");
  await sleep(10500);
  console.log(`Setelah respawn: dead=${m.dead}, hp=${m.hp}`);
  if (m.dead || m.hp !== m.maxHp) return done(1, "FAIL: monster tidak respawn");

  await room.leave();
  done(0, "COMBAT PASS");
})().catch((e) => done(1, "ERROR: " + (e.message || e)));
