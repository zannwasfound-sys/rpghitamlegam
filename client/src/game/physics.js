// Collision tile. Harus identik dengan server/src/physics.js (dipakai untuk prediksi).

export function isWall(map, px, py) {
  const tx = Math.floor(px / map.tile);
  const ty = Math.floor(py / map.tile);
  if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) return true;
  return map.grid[ty][tx] === "#";
}

export function blocked(map, x, y, r) {
  return isWall(map, x - r, y - r) || isWall(map, x + r, y - r) || isWall(map, x - r, y + r) || isWall(map, x + r, y + r);
}

export function moveWithCollision(pos, dx, dy, map, r) {
  const nx = pos.x + dx;
  if (!blocked(map, nx, pos.y, r)) pos.x = nx;
  const ny = pos.y + dy;
  if (!blocked(map, pos.x, ny, r)) pos.y = ny;
}
