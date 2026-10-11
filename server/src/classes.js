// Data class karakter. Dikirim ke client lewat config (client memakainya untuk cooldown & tampilan).
// kind: "melee" = serangan arc instan; "projectile" = server mensimulasikan proyektil.
const CLASSES = {
  fighter: {
    name: "Fighter",
    kind: "melee",
    hp: 140,
    hpLevel: 24,
    dmg: 12,
    dmgLevel: 5,
    cooldown: 450,
    range: 84, // jangkauan tebasan dari pusat pemain
    minDot: 0.0, // 0 = setengah lingkaran di depan
    kb: 520, // kekuatan dorongan (px/detik awal)
    crit: 0.12,
  },
  mage: {
    name: "Mage",
    kind: "projectile",
    proj: "fireball",
    hp: 90,
    hpLevel: 14,
    dmg: 20,
    dmgLevel: 5,
    cooldown: 750,
    speed: 430,
    range: 430,
    radius: 9,
    aoe: 72, // radius ledakan
    pierce: 0,
    kb: 460,
    crit: 0.1,
  },
  marksman: {
    name: "Marksman",
    kind: "projectile",
    proj: "arrow",
    hp: 105,
    hpLevel: 16,
    dmg: 15,
    dmgLevel: 4,
    cooldown: 480,
    speed: 780,
    range: 580,
    radius: 6,
    aoe: 0,
    pierce: 1, // menembus 1 musuh tambahan
    kb: 220,
    crit: 0.25,
  },
  support: {
    name: "Support",
    kind: "projectile",
    proj: "orb",
    hp: 115,
    hpLevel: 18,
    dmg: 8,
    dmgLevel: 2,
    cooldown: 650,
    speed: 360,
    range: 340,
    radius: 9,
    aoe: 0,
    pierce: 0,
    kb: 150,
    crit: 0.05,
    heal: { base: 9, level: 2, radius: 150, selfFactor: 0.5 },
  },
};

const DEFAULT_CLASS = "fighter";

module.exports = { CLASSES, DEFAULT_CLASS };
