// Collision tile. File ini identik dengan client/src/game/physics.js
// (client memakainya untuk prediksi, jadi harus sama persis dengan server).

function isWall(map, px, py) {
  const tx = Math.floor(px / map.tile);
  const ty = Math.floor(py / map.tile);
  if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) return true;
  return map.grid[ty][tx] === "#";
}

function blocked(map, x, y, r) {
  return isWall(map, x - r, y - r) || isWall(map, x + r, y - r) || isWall(map, x - r, y + r) || isWall(map, x + r, y + r);
}

// Gerak per sumbu supaya bisa "menyusur" dinding.
function moveWithCollision(pos, dx, dy, map, r) {
  const nx = pos.x + dx;
  if (!blocked(map, nx, pos.y, r)) pos.x = nx;
  const ny = pos.y + dy;
  if (!blocked(map, pos.x, ny, r)) pos.y = ny;
}

module.exports = { moveWithCollision, isWall, blocked };
