const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");

class Player extends Schema {
  constructor() {
    super();
    this.name = "Hero";
    this.color = "#f59e0b";
    this.x = 0;
    this.y = 0;
    this.lastSeq = 0; // seq input terakhir yang diproses (untuk reconciliation)
    this.facing = 0; // arah hadap (radian)
    this.hp = 100;
    this.maxHp = 100;
    this.level = 1;
    this.exp = 0;
    this.expNext = 50;
    this.attackSeq = 0; // bertambah tiap serangan (untuk animasi di client lain)
    this.dead = false;
    this.cls = "fighter"; // fighter | mage | marksman | support
    this.aim = 0; // arah bidik senjata (radian) — dari mouse bila dipakai
  }
}
defineTypes(Player, {
  name: "string",
  color: "string",
  x: "number",
  y: "number",
  lastSeq: "number",
  facing: "number",
  hp: "number",
  maxHp: "number",
  level: "number",
  exp: "number",
  expNext: "number",
  attackSeq: "number",
  dead: "boolean",
  cls: "string",
  aim: "number",
});

class Monster extends Schema {
  constructor() {
    super();
    this.kind = "slime";
    this.x = 0;
    this.y = 0;
    this.hp = 1;
    this.maxHp = 1;
    this.dead = false;
    this.attackSeq = 0; // bertambah tiap monster menyerang (animasi serangan di client)
    this.face = 0; // arah hadap (radian)
  }
}
defineTypes(Monster, {
  kind: "string",
  x: "number",
  y: "number",
  hp: "number",
  maxHp: "number",
  dead: "boolean",
  attackSeq: "number",
  face: "number",
});

class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.monsters = new MapSchema();
  }
}
defineTypes(WorldState, {
  players: { map: Player },
  monsters: { map: Monster },
});

module.exports = { Player, Monster, WorldState };
