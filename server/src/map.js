// Generator peta dungeon: ruangan + lorong, deterministik (sama setiap server start).
const TILE = 48;
const COLS = 64;
const ROWS = 44;

const MONSTER_TYPES = {
  // kb = dorongan ke pemain saat menyerang; kbResist = pengali dorongan yang diterima; stun = ms lumpuh saat kena pukul
  slime: { hp: 30, damage: 6, speed: 85, exp: 12, aggro: 230, radius: 14, cooldown: 1000, respawn: 8000, kb: 300, kbResist: 1.25, stun: 260 },
  skeleton: { hp: 55, damage: 10, speed: 105, exp: 25, aggro: 260, radius: 15, cooldown: 900, respawn: 10000, kb: 380, kbResist: 1.0, stun: 200 },
  orc: { hp: 120, damage: 18, speed: 95, exp: 70, aggro: 280, radius: 22, cooldown: 1100, respawn: 15000, kb: 640, kbResist: 0.45, stun: 140 },
};

const ROOMS = [
  { id: "spawn", x: 4, y: 16, w: 15, h: 11, safe: true, monsters: [] },
  { id: "hub", x: 26, y: 18, w: 11, h: 8, monsters: [{ kind: "slime", count: 4 }] },
  { id: "north", x: 26, y: 4, w: 14, h: 9, monsters: [{ kind: "skeleton", count: 3 }] },
  { id: "south", x: 26, y: 31, w: 14, h: 9, monsters: [{ kind: "skeleton", count: 3 }] },
  {
    id: "east",
    x: 46,
    y: 16,
    w: 14,
    h: 12,
    monsters: [
      { kind: "orc", count: 2 },
      { kind: "skeleton", count: 2 },
    ],
  },
];

// pasangan ruangan yang dihubungkan lorong
const LINKS = [
  ["spawn", "hub"],
  ["hub", "north"],
  ["hub", "south"],
  ["hub", "east"],
  ["north", "east"],
];

function generateMap() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill("#"));
  const carve = (x, y) => {
    if (x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1) g[y][x] = ".";
  };

  for (const r of ROOMS) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  }

  const center = (r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
  const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
  const WIDTH = 2; // lebar lorong (tile)

  for (const [a, b] of LINKS) {
    const c1 = center(byId[a]);
    const c2 = center(byId[b]);
    for (let x = Math.min(c1.x, c2.x); x <= Math.max(c1.x, c2.x); x++)
      for (let t = 0; t < WIDTH; t++) carve(x, c1.y + t);
    for (let y = Math.min(c1.y, c2.y); y <= Math.max(c1.y, c2.y); y++)
      for (let t = 0; t < WIDTH; t++) carve(c2.x + t, y);
  }

  const spawnRoom = byId.spawn;
  const sc = center(spawnRoom);
  return {
    tile: TILE,
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    grid: g.map((row) => row.join("")),
    rooms: ROOMS,
    spawn: { x: sc.x * TILE + TILE / 2, y: sc.y * TILE + TILE / 2 },
    safeRect: { x: spawnRoom.x * TILE, y: spawnRoom.y * TILE, w: spawnRoom.w * TILE, h: spawnRoom.h * TILE },
  };
}

module.exports = { generateMap, MONSTER_TYPES, TILE };
