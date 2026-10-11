// Tes cepat: dua klien join, A bergerak, B harus melihat A bergerak.
// Jalankan server dulu (npm start), lalu: npm test
const { Client } = require("colyseus.js");

const url = process.env.SERVER_URL || "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const a = await new Client(url).joinOrCreate("world", { name: "Alice" });
  const b = await new Client(url).joinOrCreate("world", { name: "Bob" });
  await sleep(300);

  const seenByB = () => [...b.state.players.entries()].find(([id]) => id === a.sessionId)?.[1];
  const before = seenByB();
  if (!before) throw new Error("FAIL: Bob tidak melihat Alice");
  const x0 = before.x;
  console.log(`Bob melihat ${b.state.players.size} pemain; Alice x awal = ${x0.toFixed(1)}`);

  // Alice jalan ke kanan selama 30 tick
  for (let i = 1; i <= 30; i++) {
    a.send("input", { seq: i, x: 1, y: 0 });
    await sleep(16);
  }
  await sleep(400);

  const after = seenByB();
  const moved = after.x - x0;
  console.log(`Alice x akhir (dilihat Bob) = ${after.x.toFixed(1)}, lastSeq = ${after.lastSeq}, geser = ${moved.toFixed(1)}px`);
  // 30 tick * 220 px/s / 60 = 110 px
  if (Math.abs(moved - 110) > 2) throw new Error("FAIL: jarak gerak tidak sesuai server authority");

  // Anti-cheat: input dengan nilai besar harus di-clamp (kecepatan tetap)
  const x1 = after.x;
  for (let i = 31; i <= 40; i++) a.send("input", { seq: i, x: 999, y: 0 });
  await sleep(400);
  const cheatMoved = seenByB().x - x1;
  console.log(`Input curang (x=999) x10 tick -> geser ${cheatMoved.toFixed(1)}px (maks sah ~36.7px)`);
  if (cheatMoved > 40) throw new Error("FAIL: server menerima input di luar batas");

  await a.leave();
  await sleep(300);
  console.log(`Setelah Alice keluar, Bob melihat ${b.state.players.size} pemain`);
  if (b.state.players.size !== 1) throw new Error("FAIL: pemain tidak dihapus");
  await b.leave();
  console.log("PASS");
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
