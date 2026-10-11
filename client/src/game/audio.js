// Audio VOXA RPG — SFX + musik dungeon generatif, semuanya disintesis lewat WebAudio.
// Pemakaian: audio.unlock() pada gesture pertama, audio.play("nama", {x,y}) untuk suara berposisi,
// audio.playMusic("title"|"camp"|"cave"|"ruins"|"lava"|"boss"|"victory"|"defeat").
// Pemain bisa mengganti suara/musik dengan file sendiri (IndexedDB "voxa-audio" atau /audio/manifest.json).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MAX_FILE = 8 * 1024 * 1024;
const SFX_CAP = 6; // detik, batas SFX kustom
const DB_NAME = "voxa-audio";
const STORE = "files";

// ---------- daftar kunci ----------
const SFX_GROUPS = {
  Antarmuka: {
    click: "Klik", hover: "Sorot tombol", uiOpen: "Buka menu", uiClose: "Tutup menu", deny: "Ditolak",
    cardFlip: "Balik kartu", cardPick: "Pilih kartu", buy: "Beli", coin: "Koin", potion: "Minum ramuan",
    chatPing: "Pesan obrolan", emote: "Emote", levelUp: "Naik level", interact: "Interaksi",
  },
  "Serangan Pemain": {
    swordSwing: "Ayun pedang", swordHit: "Pedang kena", fireCast: "Rapal api", fireBoom: "Ledakan api",
    bowShot: "Tembak panah", arrowHit: "Panah kena", arrowWall: "Panah kena dinding", holyCast: "Rapal suci",
    heal: "Penyembuhan", orbHit: "Orb kena", dash: "Dash", parry: "Parry (tangkis)", playerHurt: "Pemain terluka", ko: "Pemain KO",
  },
  Monster: {
    slimeAtk: "Slime menyerang", slimeHurt: "Slime terluka", slimeDie: "Slime mati",
    skeletonAtk: "Skeleton menyerang", skeletonHurt: "Skeleton terluka", skeletonDie: "Skeleton mati",
    orcAtk: "Orc menyerang", orcHurt: "Orc terluka", orcDie: "Orc mati",
    batAtk: "Kelelawar menyerang", batHurt: "Kelelawar terluka", batDie: "Kelelawar mati",
    impAtk: "Imp menyerang", impHurt: "Imp terluka", impDie: "Imp mati",
  },
  Boss: {
    cyclopsRoar: "Raungan Cyclops", dragonRoar: "Raungan Naga", golemRoar: "Raungan Golem", bossAppear: "Boss muncul",
    bossHurt: "Boss terluka", bossSlam: "Boss menghantam", bossStep: "Langkah boss", telegraph: "Peringatan serangan",
    fireballFall: "Bola api jatuh", fireballLand: "Bola api meledak", breath: "Napas api", rockThrow: "Lempar batu",
    rockLand: "Batu mendarat", lavaBurst: "Semburan lahar", shockwave: "Gelombang kejut", bossDie: "Boss tewas",
  },
  Dunia: {
    step: "Langkah", stepHeavy: "Langkah berat", drip: "Tetesan air", lavaBubble: "Gelembung lahar",
    fireCrackle: "Api berderak", portalOpen: "Portal terbuka", portal: "Masuk portal", floorClear: "Lantai selesai",
    gateOpen: "Gerbang terbuka", titleHit: "Hantaman judul", descend: "Turun lantai",
  },
};
const MUSIC_LABELS = {
  title: "Layar Judul", camp: "Perkemahan", cave: "Gua", ruins: "Reruntuhan", lava: "Lahar",
  boss: "Pertarungan Boss", victory: "Kemenangan", defeat: "Kekalahan",
};
const ONCE = { victory: true, defeat: true };
// ekor suara (detik) sebelum node dilepas; default 3.5
const TAIL = { titleHit: 11, bossDie: 8, bossAppear: 8, breath: 4.5, portalOpen: 5, shockwave: 5, fireballLand: 5, bossSlam: 5, dragonRoar: 5, cyclopsRoar: 5, golemRoar: 5, gateOpen: 5, descend: 5, lavaBurst: 4.5, parry: 4.5 };

// ---------- IndexedDB ----------
let dbP = null;
function idb() {
  if (dbP) return dbP;
  dbP = new Promise((res) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE, { keyPath: "id" }); } catch {} };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbP;
}
function idbReq(mode, fn) {
  return idb().then((db) => (!db ? null : new Promise((res) => {
    try {
      const tx = db.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => res(r && r.result !== undefined ? r.result : true);
      tx.onerror = tx.onabort = () => res(null);
    } catch { res(null); }
  })));
}

// ---------- instrumen musik (waktu absolut t, tujuan out) ----------
function doom(A, out, t, v = 0.8, f = 62) {
  A.noiseAt(t, 0.1, v * 0.5, out, { type: "lowpass", f0: 700, f1: 200, attack: 0.002 });
  A.oscAt("sine", f * 2.2, f, t, 0.35, v, out, { attack: 0.002 });
  A.oscAt("sine", f, f * 0.62, t, 1.4, v * 0.8, out, { attack: 0.004 });
  A.oscAt("triangle", f * 3.1, f * 1.6, t, 0.14, v * 0.22, out, { attack: 0.002 });
}
function taiko(A, out, t, v = 0.6, f = 90) {
  A.noiseAt(t, 0.07, v * 0.45, out, { f0: 900, q: 0.8, attack: 0.002 });
  A.oscAt("sine", f * 1.7, f, t, 0.26, v, out, { attack: 0.002 });
  A.oscAt("sine", f, f * 0.7, t, 0.55, v * 0.5, out, { attack: 0.004 });
}
function tom(A, out, t, v = 0.3, f = 130) {
  A.oscAt("sine", f * 1.5, f, t, 0.18, v, out, { attack: 0.002 });
  A.noiseAt(t, 0.04, v * 0.5, out, { f0: 1500, q: 1, attack: 0.001 });
}
function snap(A, out, t, v = 0.3) {
  A.noiseAt(t, 0.1, v, out, { f0: 2200, q: 1.1, attack: 0.001 });
  A.oscAt("triangle", 230, 140, t, 0.09, v * 0.6, out, { attack: 0.001 });
}
function subPulse(A, out, t, v = 0.3, f = 41.2) {
  A.oscAt("sine", f * 1.06, f, t, 0.22, v, out, { attack: 0.004 });
  A.oscAt("triangle", f * 2, f * 2, t, 0.16, v * 0.35, out, { attack: 0.004 });
}
function thump(A, out, t, v = 0.25) {
  A.oscAt("sine", 85, 48, t, 0.28, v, out, { attack: 0.006 });
}
function bell(A, out, t, f, v = 0.12, dur = 6) {
  const P = [[0.5, 0.5, 1], [1, 1, 0.9], [1.183, 0.6, 0.7], [1.506, 0.35, 0.55], [2, 0.3, 0.4], [2.514, 0.15, 0.3]];
  P.forEach(([r, a, d]) => A.oscAt("sine", f * r, f * r * 0.999, t, dur * d, v * a, out, { attack: 0.003 }));
  A.noiseAt(t, 0.05, v * 0.6, out, { type: "highpass", f0: 3500, attack: 0.001 });
}
function clang(A, out, t, v = 0.15, f = 340) {
  [[1, 1, 0.9], [2.76, 0.7, 0.6], [5.4, 0.5, 0.4], [8.93, 0.3, 0.25]].forEach(([r, a, d]) => A.oscAt("sine", f * r, f * r, t, d, v * a, out, { attack: 0.001 }));
  A.noiseAt(t, 0.06, v * 0.8, out, { type: "highpass", f0: 3000, attack: 0.001 });
}
function chains(A, out, t, v = 0.1) {
  const n = 4 + ((Math.random() * 6) | 0);
  let tt = t;
  for (let i = 0; i < n; i++) {
    tt += R(0.03, 0.11);
    A.noiseAt(tt, 0.045, v * R(0.5, 1), out, { type: "highpass", f0: R(3000, 6000), attack: 0.001 });
    const f = R(2400, 5200);
    A.oscAt("sine", f, f * 0.92, tt, 0.07, v * 0.35, out, { attack: 0.001 });
  }
}
function scrape(A, out, t, dur = 2.5, v = 0.05) {
  A.noiseAt(t, dur, v, out, { f0: R(600, 900), f1: R(1500, 2600), q: 9, attack: dur * 0.45 });
  A.oscAt("sawtooth", 150, 190, t, dur, v * 0.25, out, { attack: dur * 0.5, filter: ["bandpass", 900, 4] });
}
function growl(A, out, t, dur = 2, v = 0.1, f = 70) {
  const o = { attack: dur * 0.3, rel: dur * 0.45, vib: [R(13, 22), f * 0.1], filter: ["lowpass", 420, 3] };
  A.oscAt("sawtooth", f, f * 0.7, t, dur, v, out, o);
  A.oscAt("sawtooth", f * 1.51, f * 1.05, t, dur, v * 0.55, out, o);
  A.noiseAt(t, dur, v * 0.8, out, { buf: "brown", type: "lowpass", f0: 360, attack: dur * 0.35 });
}
function crackle(A, out, t, v = 0.07) {
  A.noiseAt(t, R(0.008, 0.03), v, out, { type: "highpass", f0: R(2200, 6000), attack: 0.001 });
  if (chance(0.25)) A.oscAt("sine", R(700, 1400), 300, t, 0.03, v * 0.6, out, { attack: 0.001 });
}
function bubble(A, out, t, v = 0.08) {
  const f = R(80, 200);
  A.oscAt("sine", f, f * R(1.8, 2.6), t, R(0.07, 0.15), v, out, { attack: 0.008, filter: ["lowpass", 900, 0.7] });
}
function drip(A, out, t, v = 0.08) {
  const f = R(1200, 2400);
  [[0, 1, 1], [0.31, 0.45, 0.97], [0.62, 0.2, 0.94]].forEach(([dt, a, k]) => A.oscAt("sine", f * k, f * k * 0.55, t + dt, 0.1, v * a, out, { attack: 0.002 }));
}
function whisper(A, out, t, dur = 2.5, v = 0.04) {
  const f = R(1800, 3200);
  A.noiseAt(t, dur, v, out, { f0: f, f1: f * R(0.7, 1.3), q: 9, attack: dur * 0.5 });
  A.noiseAt(t, dur, v * 0.7, out, { f0: f * 1.7, f1: f * 1.4, q: 9, attack: dur * 0.45 });
}
function cello(A, out, t, f, dur, v = 0.22) {
  const o = { attack: 0.03, rel: dur * 0.6, fenv: [f * 2.5, f * 6, 0.1, f * 1.8], filter: ["lowpass", f * 3, 1.2] };
  A.oscAt("sawtooth", f, f, t, dur, v, out, { ...o, det: -7 });
  A.oscAt("sawtooth", f, f, t, dur, v, out, { ...o, det: 7, vib: [5.2, f * 0.006] });
  A.noiseAt(t, dur * 0.5, v * 0.12, out, { f0: f * 4, q: 2, attack: 0.05 });
}
function lute(A, out, t, f, v = 0.09) {
  A.oscAt("triangle", f, f, t, 1.4, v, out, { attack: 0.003 });
  A.oscAt("sine", f * 2, f * 2, t, 0.8, v * 0.35, out, { attack: 0.003 });
  A.oscAt("square", f, f, t, 0.3, v * 0.2, out, { attack: 0.002, filter: ["lowpass", 2200, 0.8], fsweep: 500 });
  A.noiseAt(t, 0.015, v * 0.3, out, { type: "highpass", f0: 2500, attack: 0.001 });
}
function brass(A, out, t, f, dur, v = 0.2, o = {}) {
  const br = o.bright || 1;
  const oo = { attack: 0.05, rel: dur * 0.4, fenv: [f * 2, f * (3.5 + 3 * br), 0.08, f * 1.8], filter: ["lowpass", f * 2, 1.4] };
  A.oscAt("sawtooth", f, f, t, dur, v, out, { ...oo, det: -8 });
  A.oscAt("sawtooth", f, f, t, dur, v, out, { ...oo, det: 8 });
}
function envGain(A, t, dur, vol, atk, rel) {
  const g = A.ctx.createGain();
  A._env(g.gain, t, dur, vol, atk, rel);
  return g;
}
const FORMANTS = {
  ah: [[800, 1, 6], [1150, 0.5, 8], [2900, 0.15, 10]],
  oh: [[450, 1, 6], [800, 0.5, 8], [2830, 0.1, 10]],
  oo: [[325, 1, 6], [700, 0.4, 8], [2700, 0.08, 10]],
  ee: [[270, 1, 6], [2300, 0.4, 8], [3000, 0.2, 10]],
};
function choir(A, out, t, midis, dur, v = 0.07, o = {}) {
  const c = A.ctx;
  const atk = Math.min(o.atk ?? 2, dur * 0.6);
  const rel = o.rel ?? Math.min(3, dur * 0.4);
  const env = envGain(A, t, dur, v, atk, rel);
  const inp = c.createGain();
  inp.gain.value = 2.5;
  const bank = [inp, env];
  FORMANTS[o.vowel || "ah"].forEach(([fr, gn, q]) => {
    const b = c.createBiquadFilter();
    b.type = "bandpass"; b.frequency.value = fr; b.Q.value = q;
    const g = c.createGain();
    g.gain.value = gn;
    inp.connect(b); b.connect(g); g.connect(env);
    bank.push(b, g);
  });
  env.connect(out);
  let first = true;
  midis.forEach((m) => {
    [[-9, "sawtooth"], [8, "sawtooth"], [0, "triangle"]].forEach(([det, type]) => {
      const os = c.createOscillator();
      os.type = type; os.frequency.value = hz(m); os.detune.value = det + R(-3, 3);
      os.connect(inp);
      os.start(t); os.stop(t + dur + 0.05);
      A._reg(os, first ? bank : []);
      first = false;
    });
  });
}
function organ(A, out, t, midis, dur, v = 0.06, o = {}) {
  const c = A.ctx;
  const env = envGain(A, t, dur, v, Math.min(o.atk ?? 1.8, dur * 0.5), Math.min(2.5, dur * 0.4));
  const lp = c.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 2200;
  env.connect(lp); lp.connect(out);
  let first = true;
  midis.forEach((m) => {
    [[1, 1, 0], [2, 0.45, 4], [3, 0.25, -3]].forEach(([k, a, det]) => {
      const os = c.createOscillator();
      const g = c.createGain();
      g.gain.value = a;
      os.type = "sine"; os.frequency.value = hz(m) * k; os.detune.value = det;
      os.connect(g); g.connect(env);
      os.start(t); os.stop(t + dur + 0.05);
      A._reg(os, first ? [g, env, lp] : [g]);
      first = false;
    });
  });
}
function riser(A, out, t, dur, v = 0.12) {
  A.noiseAt(t, dur, v, out, { f0: 250, f1: 7000, q: 2, attack: dur * 0.9, rel: dur * 0.1 });
  A.oscAt("sawtooth", 60, 240, t, dur, v * 0.4, out, { attack: dur * 0.9, rel: dur * 0.1, filter: ["lowpass", 300, 1], fsweep: 4000 });
  A.oscAt("sine", 200, 1600, t, dur, v * 0.25, out, { attack: dur * 0.9, rel: dur * 0.1 });
}
function impact(A, out, t, v = 0.5) {
  A.oscAt("sine", 90, 25, t, 1.6, v, out, { attack: 0.004 });
  A.noiseAt(t, 1.3, v * 0.7, out, { type: "lowpass", f0: 3000, f1: 100, attack: 0.003 });
  A.noiseAt(t, 0.9, v * 0.22, out, { type: "highpass", f0: 3000, attack: 0.003 });
  clang(A, out, t, v * 0.2, 110);
}

// bed noise persisten (angin, desis api, rumble)
function bed(A, T, o) {
  const c = A.ctx;
  const src = c.createBufferSource();
  src.buffer = o.buf === "brown" ? A.brownBuf : A.noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type || "bandpass"; f.frequency.value = o.f || 800; f.Q.value = o.q || 1;
  const g = c.createGain();
  g.gain.value = o.v || 0.05;
  src.connect(f); f.connect(g); g.connect(o.out || T.dry);
  src.start(0, Math.random() * 3);
  A._reg(src, [f, g]);
  if (o.lfoF) A.lfo(o.lfoF[0], (o.f || 800) * o.lfoF[1], f.frequency);
  if (o.lfoG) A.lfo(o.lfoG[0], (o.v || 0.05) * o.lfoG[1], g.gain);
  return g;
}
function drone(A, T, o) {
  const c = A.ctx;
  const g = c.createGain();
  g.gain.value = o.v ?? 0.1;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = o.cut || 200; lp.Q.value = 2.5;
  lp.connect(g); g.connect(o.out || T.dry);
  const mk = (fr, det) => {
    const os = c.createOscillator();
    os.type = "sawtooth"; os.frequency.value = fr; os.detune.value = det;
    os.connect(lp); os.start();
    A._reg(os);
  };
  [-11, 0, 9].forEach((d) => mk(o.f, d));
  mk(o.f * 0.5, 4);
  if (o.fifth) mk(o.f * 1.5, -6);
  if (o.sub) {
    const so = c.createOscillator();
    const sg = c.createGain();
    so.type = "sine"; so.frequency.value = o.f * 0.5;
    sg.gain.value = o.sub / (o.v || 0.1);
    so.connect(sg); sg.connect(g); so.start();
    A._reg(so, [sg]);
  }
  const l = o.lfo || [0.06, 70];
  A.lfo(l[0], l[1], lp.frequency);
  return { g, lp };
}

// ---------- definisi lagu ----------
const TITLE_CHORDS = [[50, 53, 57], [46, 50, 53], [43, 50, 58], [50, 51, 57]];
const TITLE_MOTIF = [
  [[0, 0, 3], [4, 1, 2], [6, 0, 2], [8, -2, 4]],
  [[0, 0, 2], [3, 0, 1], [4, 3, 3], [8, 1, 3], [12, 0, 4]],
  [[0, 0, 4], [6, 1, 2], [8, 0, 2], [10, -4, 6]],
];
const LUTE_PH = [
  [[0, 12], [2, 11], [4, 8], [8, 7], [12, 4]],
  [[0, 7], [3, 8], [6, 11], [8, 12], [12, 11], [14, 8]],
  [[0, 0], [4, 4], [6, 7], [8, 8], [10, 7], [12, 4]],
];
const CAMP_CHORDS = [[57, 60, 64], [53, 57, 60], [52, 56, 59], [57, 60, 64]];
const RUIN_CHORDS = [[47, 48, 54], [47, 53, 54, 59], [45, 46, 52, 53]];
const LAVA_K = [1, 0, 0, 0.7, 0, 0, 0.8, 0, 1, 0, 0, 0, 0, 0.7, 0, 0.6];
const LAVA_T = [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0];
const LAVA_RIFF = [
  { s: [0, 6, 10], n: [40, 40, 41] },
  { s: [0, 3, 6, 10, 12], n: [40, 43, 41, 40, 38] },
];
const BOSS_K = { 0: 1, 3: 0.7, 6: 0.8, 8: 1, 11: 0.7, 14: 0.8 };
const BOSS_RIFF = [
  { s: [0, 3, 6, 8, 10, 12, 14], n: [0, 0, 1, 0, 3, 1, 0] },
  { s: [0, 2, 3, 6, 8, 11, 12], n: [0, 0, 0, 1, 0, 6, 5] },
  { s: [0, 4, 6, 8, 12, 14], n: [0, 3, 1, 0, -2, 0] },
];

const TRACKS = {
  title: {
    bpm: 70,
    init(A, T) {
      T.st.d = drone(A, T, { f: hz(38), v: 0.12, cut: 190, lfo: [0.06, 80], sub: 0.2, fifth: true });
      bed(A, T, { buf: "brown", f: 420, q: 1, v: 0.05, lfoF: [0.05, 0.5], lfoG: [0.07, 0.6] });
      T.st.chord = 0;
    },
    step(A, T, s, t) {
      const bar = s >> 4, sb = s & 15, bd = T.sd * 16;
      if (sb === 0 && bar % 8 === 0) { const g = T.st.d.g.gain; g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.2, t + bd * 4); }
      if (sb === 0 && bar % 8 === 4) { const g = T.st.d.g.gain; g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.08, t + bd * 4); }
      if (sb === 0) doom(A, T.dry, t, bar % 4 === 0 ? 0.85 : 0.7, 60);
      if (sb === 8 && bar % 2 === 1) doom(A, T.dry, t, 0.4, 55);
      if (bar % 8 === 7 && sb >= 10 && [10, 12, 13, 14, 15].includes(sb)) tom(A, T.dry, t, 0.12 + (sb - 10) * 0.05, 100);
      if (bar % 8 === 7 && sb === 0) riser(A, T.wet, t, bd, 0.1);
      if (bar % 8 === 0 && sb === 0 && bar > 0) impact(A, T.wet, t, 0.4);
      if (sb === 0 && bar % 4 === 0) {
        const ch = TITLE_CHORDS[T.st.chord++ % TITLE_CHORDS.length];
        const vw = pick(["ah", "oh"]);
        choir(A, T.wet, t, ch, bd * 4.2, 0.075, { vowel: vw, atk: 2.4, rel: 3.5 });
        if (chance(0.6)) choir(A, T.wet, t + 0.3, ch.map((m) => m + 12), bd * 3.6, 0.035, { vowel: "oo", atk: 2.8 });
        cello(A, T.dry, t, hz(ch[0] - 12), bd * 2, 0.2);
      }
      if (sb === 2 && bar % 4 === 1) {
        const m = pick(TITLE_MOTIF);
        m.forEach(([st, semi, len]) => cello(A, T.dry, t + st * T.sd, hz(38 + semi), len * T.sd * 1.1, 0.24));
      }
      if (sb === 0 && bar % 8 === 4) bell(A, T.wet, t, hz(62), 0.1, 7);
      if (sb === 0 && chance(0.35)) growl(A, T.wet, t + R(0, 1), R(2, 3.5), 0.07, R(50, 70));
      if (sb === 4 && chance(0.3)) scrape(A, T.wet, t, 2.5, 0.04);
      if (sb === 8 && chance(0.3)) whisper(A, T.wet, t, 3, 0.035);
      if (sb === 12 && chance(0.25)) A.noiseAt(t, 3.5, 0.22, T.dry, { buf: "brown", type: "lowpass", f0: 90, attack: 1.2 });
    },
  },
  camp: {
    bpm: 60,
    init(A, T) {
      drone(A, T, { f: hz(33), v: 0.06, cut: 120, lfo: [0.05, 40], sub: 0.1 });
      bed(A, T, { buf: "brown", f: 350, q: 1, v: 0.03, lfoF: [0.06, 0.5], lfoG: [0.09, 0.6] });
      bed(A, T, { type: "highpass", f: 1100, q: 0.5, v: 0.012, lfoG: [0.3, 0.7] });
      T.st.chord = 0;
    },
    step(A, T, s, t) {
      const bar = s >> 4, sb = s & 15, bd = T.sd * 16;
      if (chance(0.4)) crackle(A, T.dry, t + R(0, T.sd), R(0.03, 0.09));
      if (chance(0.03)) { crackle(A, T.dry, t, 0.14); crackle(A, T.dry, t + 0.03, 0.1); }
      if (sb === 0 || sb === 8) thump(A, T.dry, t, 0.3);
      if (sb === 1 || sb === 9) thump(A, T.dry, t, 0.2);
      if (sb === 0 && bar % 4 === 0) choir(A, T.wet, t, CAMP_CHORDS[T.st.chord++ % 4], bd * 4.2, 0.04, { vowel: "oo", atk: 2.2 });
      if (sb === 0 && chance(0.6)) cello(A, T.wet, t, hz(45), bd * 0.4, 0.1);
      if (sb === 0 && bar % 2 === 1 && chance(0.75)) pick(LUTE_PH).forEach(([st, semi]) => lute(A, T.wet, t + st * T.sd + R(0, 0.02), hz(57 + semi), 0.1));
      if (sb === 8 && chance(0.05)) growl(A, T.wet, t, 3, 0.04, 60);
    },
  },
  cave: {
    bpm: 56,
    init(A, T) {
      drone(A, T, { f: hz(28), v: 0.13, cut: 150, lfo: [0.04, 60], sub: 0.25 });
      bed(A, T, { buf: "brown", type: "lowpass", f: 100, q: 0.7, v: 0.12, lfoG: [0.05, 0.5] });
      bed(A, T, { buf: "brown", f: 500, q: 1, v: 0.02, lfoG: [0.08, 0.7] });
      const c = A.ctx;
      [659.3, 698.5].forEach((fr) => {
        const os = c.createOscillator(), g = c.createGain();
        os.type = "sine"; os.frequency.value = fr; g.gain.value = 0.008;
        os.connect(g); g.connect(T.wet); os.start();
        A._reg(os, [g]);
        A.lfo(R(0.08, 0.14), 0.006, g.gain);
      });
    },
    step(A, T, s, t) {
      const bar = s >> 4, sb = s & 15, bd = T.sd * 16;
      if (chance(0.08)) drip(A, T.wet, t + R(0, T.sd), R(0.05, 0.1));
      if (sb === 0 && bar % 3 === 0) choir(A, T.wet, t, [52, 53, 58, 59], bd * 3, 0.05, { vowel: "oo", atk: 2.5, rel: 4 });
      if (sb === 0 && bar % 2 === 0 && chance(0.65)) cello(A, T.dry, t, hz(pick([40, 41, 40, 38])), 5 * T.sd, 0.22);
      if (chance(0.025)) growl(A, T.wet, t, R(1.5, 3), 0.06, R(60, 90));
      if (chance(0.02)) A.noiseAt(t, 2.5, 0.2, T.dry, { buf: "brown", type: "lowpass", f0: 120, attack: 0.8 });
      if (sb === 8 && bar % 4 === 2) whisper(A, T.wet, t, 3, 0.03);
      if (chance(0.01)) clang(A, T.wet, t, 0.04, R(280, 420));
    },
  },
  ruins: {
    bpm: 66,
    init(A, T) {
      drone(A, T, { f: hz(35), v: 0.09, cut: 160, lfo: [0.05, 50], sub: 0.14 });
      bed(A, T, { buf: "brown", f: 600, q: 1, v: 0.04, lfoF: [0.07, 0.5], lfoG: [0.1, 0.6] });
    },
    step(A, T, s, t) {
      const bar = s >> 4, sb = s & 15, bd = T.sd * 16;
      if (sb === 0 && bar % 3 === 0) organ(A, T.wet, t, pick(RUIN_CHORDS), bd * 3.2, 0.07, { atk: 1.8 });
      if (sb === 0 && bar % 4 === 2) bell(A, T.wet, t, hz(55), 0.16, 9);
      if (sb === 0 && bar % 8 === 6) { bell(A, T.wet, t + T.sd * 8, hz(55), 0.12, 8); bell(A, T.wet, t + T.sd * 16, hz(55), 0.1, 8); }
      if (chance(0.06)) chains(A, T.wet, t, R(0.06, 0.12));
      if (chance(0.02)) clang(A, T.wet, t, 0.1, R(250, 400));
      if (sb === 0 && bar % 4 === 1) cello(A, T.dry, t, hz(35), 6 * T.sd, 0.22);
      if (sb === 8 && bar % 4 === 1) cello(A, T.dry, t, hz(34), 6 * T.sd, 0.2);
      if (sb === 0 && bar % 2 === 0) doom(A, T.wet, t, 0.25, 50);
      if (chance(0.04)) whisper(A, T.wet, t, 2.5, 0.035);
      if (chance(0.02)) scrape(A, T.wet, t, 2.5, 0.04);
    },
  },
  lava: {
    bpm: 98,
    init(A, T) {
      drone(A, T, { f: hz(40), v: 0.1, cut: 240, lfo: [0.09, 100], sub: 0.25 });
      bed(A, T, { buf: "brown", type: "lowpass", f: 150, q: 0.7, v: 0.2, lfoG: [0.11, 0.4] });
      bed(A, T, { type: "highpass", f: 1200, q: 0.5, v: 0.015, lfoG: [0.2, 0.7] });
      T.st.riff = LAVA_RIFF[0];
    },
    step(A, T, s, t) {
      const bar = s >> 4, sb = s & 15;
      if (LAVA_K[sb]) taiko(A, T.dry, t, 0.65 * LAVA_K[sb], 55);
      if (LAVA_T[sb]) tom(A, T.dry, t, 0.32, [95, 120, 150][(sb >> 2) % 3]);
      if (bar % 4 === 3 && sb >= 12) tom(A, T.dry, t, 0.3, 110 + (sb - 12) * 12);
      if (sb % 2 === 0) A.noiseAt(t, 0.03, 0.04, T.dry, { type: "highpass", f0: 6000, attack: 0.001 });
      if (sb === 0 && bar % 2 === 0) T.st.riff = pick(LAVA_RIFF);
      const ri = T.st.riff.s.indexOf(sb);
      if (ri >= 0 && bar % 2 === 0) {
        const f = hz(T.st.riff.n[ri]);
        brass(A, T.dry, t, f, 0.24, 0.2, { bright: 1.2 });
        brass(A, T.dry, t, f * 1.498, 0.2, 0.1);
      }
      if (chance(0.25)) bubble(A, T.dry, t + R(0, T.sd), R(0.05, 0.12));
      if (chance(0.25)) crackle(A, T.dry, t + R(0, T.sd), 0.06);
      if (sb === 0 && bar % 8 === 5 && chance(0.5)) {
        A.noiseAt(t, 1, 0.3, T.wet, { type: "lowpass", f0: 1800, f1: 200, attack: 0.02 });
        A.oscAt("sine", 90, 35, t, 0.9, 0.35, T.wet, { attack: 0.01 });
      }
      if (sb === 0 && bar % 4 === 0 && chance(0.2)) growl(A, T.wet, t, 2.5, 0.08, 50);
    },
  },
  boss: {
    bpm: 140,
    init(A, T) {
      drone(A, T, { f: hz(40), v: 0.1, cut: 300, lfo: [0.15, 150], sub: 0.3 });
      bed(A, T, { buf: "brown", type: "lowpass", f: 140, q: 0.7, v: 0.07, lfoG: [0.1, 0.4] });
      T.st.riff = BOSS_RIFF[0];
    },
    step(A, T, s, t) {
      const bar = s >> 4, sb = s & 15, sd = T.sd;
      const fillBar = bar % 8 === 7;
      if (!(fillBar && sb >= 8)) {
        if (BOSS_K[sb]) taiko(A, T.dry, t, 0.7 * BOSS_K[sb], 68);
        else if ([2, 10, 12, 15].includes(sb)) tom(A, T.dry, t, 0.3, 120 + (sb % 3) * 15);
        else if (sb % 4 === 1) tom(A, T.dry, t, 0.09, 150);
        if (sb === 4 || sb === 12) snap(A, T.dry, t, 0.28);
      } else {
        tom(A, T.dry, t, 0.18 + (sb - 8) * 0.05, 110 + (sb - 8) * 8);
        if (sb % 2 === 0) taiko(A, T.dry, t, 0.4 + (sb - 8) * 0.06, 68);
      }
      if (sb % 2 === 0) subPulse(A, T.dry, t, [0, 6, 8, 14].includes(sb) ? 0.42 : 0.28);
      if (sb === 0 && bar % 4 === 0) T.st.riff = pick(BOSS_RIFF);
      const ri = T.st.riff.s.indexOf(sb);
      if (ri >= 0 && !fillBar) {
        const f = hz(40 + T.st.riff.n[ri]);
        brass(A, T.dry, t, f, sd * 1.4, 0.22, { bright: 1.3 });
        cello(A, T.dry, t, f * 2, sd * 1.2, 0.11);
      }
      if (sb === 0 && bar % 2 === 0 && !fillBar) choir(A, T.wet, t, bar % 4 === 2 ? [52, 53, 58] : [52, 55, 59], sd * 7, 0.09, { vowel: "ah", atk: 0.04, rel: 0.6 });
      if (sb === 8 && bar % 4 === 3) choir(A, T.wet, t, [53, 57, 60], sd * 6, 0.08, { vowel: "oh", atk: 0.04, rel: 0.5 });
      if (fillBar && sb === 0) riser(A, T.wet, t, sd * 16, 0.14);
      if (sb === 0 && bar % 8 === 0 && bar > 0) {
        impact(A, T.wet, t, 0.5);
        choir(A, T.wet, t, [40, 52, 55, 59], sd * 12, 0.1, { vowel: "ah", atk: 0.05, rel: 1.2 });
      }
    },
  },
  victory: {
    once: 8.8,
    init(A, T) {
      const t0 = A.ctx.currentTime + 0.08, b = 0.6, at = (x) => t0 + x * b;
      impact(A, T.wet, at(0), 0.4);
      brass(A, T.dry, at(0), hz(38), b * 2, 0.16);
      [[0, 62, 1], [1, 65, 1], [2, 69, 1], [3, 74, 2], [5, 72, 0.5], [5.5, 70, 0.5], [6, 69, 1], [7, 74, 4]].forEach(([bt, m, d]) => {
        brass(A, T.dry, at(bt), hz(m), d * b, 0.17, { bright: 1.3 });
        brass(A, T.dry, at(bt), hz(m - 12), d * b, 0.1);
      });
      [0, 2, 3, 5, 5.5, 6, 6.5, 7].forEach((bt, i) => taiko(A, T.dry, at(bt), 0.55, i % 2 ? 73 : 98));
      [38, 38, 38, 38, 45, 43].forEach((m, i) => cello(A, T.dry, at([0, 1, 2, 3, 5, 6][i]), hz(m), b * 0.8, 0.16));
      choir(A, T.wet, at(7), [50, 57, 62, 65], b * 6, 0.1, { vowel: "ah", atk: 0.15, rel: 2.5 });
      impact(A, T.wet, at(7), 0.45);
      bell(A, T.wet, at(7), hz(74), 0.06, 4);
    },
  },
  defeat: {
    once: 9.5,
    init(A, T) {
      const t0 = A.ctx.currentTime + 0.08;
      const o = { attack: 0.5, rel: 3, filter: ["lowpass", 500, 1], fsweep: 110 };
      A.oscAt("sawtooth", hz(50), hz(26), t0, 9, 0.12, T.dry, { ...o, det: -8 });
      A.oscAt("sawtooth", hz(50), hz(26), t0, 9, 0.12, T.dry, { ...o, det: 8 });
      A.oscAt("sine", 220, 40, t0, 9, 0.16, T.dry, { attack: 0.4, rel: 3 });
      [[0, [50, 53, 57]], [3.2, [48, 51, 55]], [6.4, [46, 49, 53]]].forEach(([dt, ch]) => choir(A, T.wet, t0 + dt, ch, 4, 0.075, { vowel: "oh", atk: 1, rel: 2.5 }));
      [0.3, 3.5, 6.7].forEach((dt, i) => {
        bell(A, T.wet, t0 + dt, hz(43), 0.22 - i * 0.03, 8);
        doom(A, T.dry, t0 + dt, 0.55 - i * 0.1, 55 - i * 5);
      });
      growl(A, T.wet, t0 + 5, 3.5, 0.07, 45);
    },
  },
};

// lapisan drum tambahan saat musicIntensity > 0
function extraLayer(A, T, s, t, I) {
  const sb = s & 15;
  if (T.name === "boss") {
    if (I > 0.3 && sb % 2 === 1) tom(A, T.dry, t, 0.12 * I, 130 + (sb % 4) * 10);
    return;
  }
  if (sb === 0 || sb === 6 || sb === 10) taiko(A, T.dry, t, 0.5 * I + 0.1, 70);
  else if (sb % 4 === 2 && I > 0.4) tom(A, T.dry, t, 0.22 * I, 120);
}

// ---------- SFX ----------
const SFX = {
  // Antarmuka
  click: (A, o) => { A.osc("square", 720, 640, 0, 0.05, 0.1, o); A.osc("triangle", 1300, 900, 0, 0.03, 0.05, o); },
  hover: (A, o) => A.osc("sine", 1400, 1650, 0, 0.035, 0.05, o, { attack: 0.003 }),
  uiOpen: (A, o) => {
    A.osc("sine", 500, 820, 0, 0.13, 0.13, o, { attack: 0.01 });
    A.noise(0, 0.12, 0.08, o, { f0: 800, f1: 3000, q: 1, attack: 0.04 });
  },
  uiClose: (A, o) => {
    A.osc("sine", 820, 440, 0, 0.13, 0.12, o, { attack: 0.01 });
    A.noise(0, 0.12, 0.07, o, { f0: 3000, f1: 700, q: 1, attack: 0.02 });
  },
  deny: (A, o) => {
    A.osc("square", 190, 150, 0, 0.11, 0.16, o, { filter: ["lowpass", 700, 1] });
    A.osc("square", 170, 130, 0.12, 0.14, 0.16, o, { filter: ["lowpass", 700, 1] });
  },
  cardFlip: (A, o) => {
    A.noise(0, 0.09, 0.25, o, { f0: 1200, f1: 4200, q: 1.2, attack: 0.02 });
    A.osc("triangle", 600, 300, 0.07, 0.05, 0.12, o);
  },
  cardPick: (A, o) => {
    A.osc("sine", 880, 880, 0, 0.4, 0.15, o);
    A.osc("sine", 1318, 1318, 0.05, 0.35, 0.1, o);
    A.osc("triangle", 200, 90, 0, 0.1, 0.3, o);
    A.noise(0, 0.04, 0.2, o, { type: "highpass", f0: 4000 });
  },
  buy: (A, o) => {
    A.osc("square", 300, 200, 0, 0.04, 0.12, o);
    A.noise(0, 0.03, 0.12, o, { type: "highpass", f0: 3500 });
    [[1760, 0.04], [2349, 0.11]].forEach(([f, dt]) => {
      A.osc("sine", f, f, dt, 0.5, 0.14, o);
      A.osc("sine", f * 2.76, f * 2.76, dt, 0.18, 0.04, o);
    });
  },
  coin: (A, o) => { A.osc("sine", 1976, 1976, 0, 0.22, 0.13, o); A.osc("sine", 2637, 2637, 0.06, 0.3, 0.12, o); },
  potion: (A, o) => {
    [0, 0.09, 0.18].forEach((t, i) => A.osc("sine", 300 + i * 40, 700 + i * 60, t, 0.09, 0.2, o, { vib: [30, 60], attack: 0.01 }));
    A.osc("sine", 1800, 2400, 0.3, 0.3, 0.07, o, { attack: 0.03 });
  },
  chatPing: (A, o) => { A.osc("sine", 988, 988, 0, 0.14, 0.12, o); A.osc("sine", 1319, 1319, 0.09, 0.22, 0.12, o); },
  emote: (A, o) => { A.osc("triangle", 600, 1000, 0, 0.1, 0.16, o); A.osc("triangle", 800, 1200, 0.08, 0.12, 0.16, o); },
  levelUp: (A, o) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => A.osc("triangle", f, f, i * 0.09, 0.5, 0.2, o));
    [1047, 1319, 1568].forEach((f) => A.osc("sine", f, f, 0.45, 0.7, 0.1, o, { attack: 0.02 }));
    A.noise(0.4, 0.5, 0.06, o, { type: "highpass", f0: 6000, attack: 0.05 });
  },
  interact: (A, o) => {
    A.osc("sine", 440, 660, 0, 0.1, 0.15, o, { attack: 0.01 });
    A.osc("triangle", 880, 880, 0.04, 0.08, 0.08, o);
  },

  // Serangan pemain
  swordSwing: (A, o) => A.noise(0, 0.2, 0.32, o, { f0: 500, f1: 2800, q: 1.1, attack: 0.03 }),
  swordHit: (A, o) => {
    A.noise(0, 0.09, 0.55, o, { type: "highpass", f0: 2400 });
    A.osc("triangle", 200, 60, 0, 0.16, 0.6, o);
    A.osc("square", 1600, 900, 0, 0.05, 0.12, o);
    A.osc("sine", 2300, 2100, 0, 0.3, 0.07, o);
  },
  fireCast: (A, o) => {
    A.noise(0, 0.4, 0.25, o, { type: "lowpass", f0: 400, f1: 2600, attack: 0.1 });
    A.osc("sawtooth", 170, 540, 0, 0.32, 0.13, o, { vib: [22, 26], filter: ["lowpass", 1800, 1] });
  },
  fireBoom: (A, o) => {
    A.noise(0, 0.8, 0.8, o, { type: "lowpass", f0: 1500, f1: 110 });
    A.osc("sine", 120, 28, 0, 0.7, 1.0, o);
    for (let i = 0; i < 7; i++) A.noise(0.08 + Math.random() * 0.5, 0.04, 0.22, o, { type: "highpass", f0: 3500 + Math.random() * 2500 });
  },
  bowShot: (A, o) => {
    A.osc("triangle", 360, 110, 0, 0.12, 0.42, o);
    A.osc("sine", 196, 188, 0, 0.32, 0.16, o);
    A.noise(0, 0.06, 0.25, o, { type: "highpass", f0: 3200 });
    A.noise(0.02, 0.28, 0.2, o, { f0: 1800, f1: 600, q: 0.8, attack: 0.05 });
  },
  arrowHit: (A, o) => {
    A.noise(0, 0.07, 0.4, o, { type: "lowpass", f0: 900 });
    A.osc("sine", 170, 55, 0, 0.14, 0.55, o);
    A.osc("square", 1100, 700, 0, 0.03, 0.1, o);
  },
  arrowWall: (A, o) => {
    A.osc("sine", 900, 400, 0, 0.12, 0.2, o);
    A.noise(0, 0.05, 0.3, o, { type: "highpass", f0: 3000 });
  },
  holyCast: (A, o) => [784, 1175, 1568].forEach((f, i) => A.osc("sine", f, f * 0.998, i * 0.05, 0.55, 0.12, o, { attack: 0.02 })),
  heal: (A, o) => {
    A.osc("sine", 500, 1500, 0, 0.55, 0.12, o, { attack: 0.08 });
    A.osc("triangle", 1200, 2400, 0.05, 0.45, 0.05, o, { attack: 0.08 });
    [1046, 1318, 1568, 2093].forEach((f, i) => A.osc("sine", f, f, 0.12 + i * 0.07, 0.4, 0.07, o));
  },
  orbHit: (A, o) => {
    A.osc("sine", 1000, 280, 0, 0.18, 0.3, o);
    A.noise(0, 0.08, 0.2, o, { type: "highpass", f0: 3500 });
  },
  dash: (A, o) => {
    A.noise(0, 0.24, 0.32, o, { f0: 300, f1: 3000, q: 0.9, attack: 0.07 });
    A.noise(0.04, 0.2, 0.1, o, { type: "highpass", f0: 4500, attack: 0.05 });
    A.osc("sine", 300, 120, 0, 0.16, 0.1, o);
  },
  parry: (A, o) => {
    A.noise(0, 0.06, 0.5, o, { type: "highpass", f0: 3000 });
    A.osc("square", 1250, 1100, 0, 0.05, 0.2, o);
    A.osc("triangle", 600, 300, 0, 0.1, 0.3, o);
    [[1850, 0.2, 0.5], [2790, 0.15, 0.4], [4100, 0.1, 0.3], [5500, 0.08, 0.25]].forEach(([f, v, d]) => A.osc("sine", f, f * 0.995, 0, d, v, o, { attack: 0.001 }));
    A.osc("sine", 3520, 3560, 0.02, 0.8, 0.07, o, { vib: [9, 30], attack: 0.01 });
    A.osc("sine", 2093, 3136, 0.05, 0.25, 0.08, o, { attack: 0.02 });
    A.verb(o, 0.25, 1.6);
  },
  playerHurt: (A, o) => {
    A.osc("sawtooth", 270, 85, 0, 0.3, 0.32, o, { filter: ["bandpass", 720, 2.2] });
    A.osc("sine", 130, 42, 0, 0.22, 0.7, o);
    A.noise(0, 0.12, 0.35, o, { type: "lowpass", f0: 1200, f1: 200 });
  },
  ko: (A, o) => {
    A.osc("sawtooth", 340, 52, 0, 1.0, 0.35, o, { filter: ["lowpass", 900, 1] });
    A.noise(0, 0.6, 0.3, o, { type: "lowpass", f0: 800, f1: 90 });
  },

  // Monster
  slimeAtk: (A, o) => A.osc("sine", 190, 460, 0, 0.14, 0.3, o, { vib: [26, 40] }),
  slimeHurt: (A, o) => A.osc("sine", 440, 120, 0, 0.24, 0.42, o, { vib: [30, 80] }),
  slimeDie: (A, o) => {
    A.osc("sine", 650, 70, 0, 0.28, 0.5, o);
    A.noise(0.02, 0.35, 0.4, o, { type: "lowpass", f0: 1300, f1: 180 });
    [0.1, 0.18, 0.26].forEach((t, i) => A.osc("sine", 300 + i * 120, 700 + i * 150, t, 0.1, 0.15, o));
  },
  skeletonAtk: (A, o) => A.noise(0, 0.16, 0.22, o, { f0: 700, f1: 2200, q: 1.1, attack: 0.03 }),
  skeletonHurt: (A, o) => {
    [0, 0.045, 0.09].forEach((t) => A.noise(t, 0.035, 0.4, o, { type: "highpass", f0: 3500 + Math.random() * 1500 }));
    A.osc("square", 1300, 800, 0, 0.04, 0.1, o);
  },
  skeletonDie: (A, o) => {
    for (let i = 0; i < 9; i++) A.noise(i * 0.045 + Math.random() * 0.03, 0.04, 0.35, o, { type: "highpass", f0: 2500 + Math.random() * 2500 });
    A.osc("sine", 150, 50, 0.3, 0.3, 0.5, o);
  },
  orcAtk: (A, o) => {
    A.osc("sawtooth", 125, 90, 0, 0.18, 0.28, o, { filter: ["bandpass", 450, 1.2] });
    A.noise(0.04, 0.24, 0.28, o, { f0: 300, f1: 1200, q: 0.9, attack: 0.05 });
  },
  orcHurt: (A, o) => {
    A.osc("sawtooth", 150, 70, 0, 0.34, 0.34, o, { filter: ["bandpass", 520, 1.5] });
    A.noise(0, 0.15, 0.25, o, { type: "lowpass", f0: 700 });
  },
  orcDie: (A, o) => {
    A.osc("sawtooth", 190, 38, 0, 0.9, 0.42, o, { filter: ["bandpass", 420, 1.2] });
    A.noise(0, 0.5, 0.3, o, { type: "lowpass", f0: 900, f1: 120 });
    A.osc("sine", 90, 30, 0.35, 0.4, 0.7, o);
  },
  batAtk: (A, o) => {
    A.osc("sawtooth", 2600, 3800, 0, 0.1, 0.14, o, { filter: ["bandpass", 3000, 3], vib: [40, 300], attack: 0.01 });
    A.osc("sawtooth", 3200, 2200, 0.1, 0.1, 0.12, o, { filter: ["bandpass", 3000, 3], vib: [40, 300], attack: 0.01 });
    [0, 0.04, 0.08, 0.12].forEach((t) => A.noise(t, 0.03, 0.1, o, { type: "highpass", f0: 1500 }));
  },
  batHurt: (A, o) => A.osc("sawtooth", 3600, 1800, 0, 0.16, 0.2, o, { filter: ["bandpass", 2800, 4], vib: [55, 400], attack: 0.005 }),
  batDie: (A, o) => {
    A.osc("sawtooth", 3500, 400, 0, 0.5, 0.2, o, { filter: ["bandpass", 2500, 2.5], vib: [30, 300], attack: 0.01 });
    [0, 0.07, 0.14, 0.21, 0.3].forEach((t, i) => A.noise(t, 0.03, 0.1 - i * 0.015, o, { type: "highpass", f0: 1500 }));
    A.osc("sine", 120, 60, 0.45, 0.12, 0.3, o);
  },
  impAtk: (A, o) => {
    A.noise(0, 0.35, 0.35, o, { type: "lowpass", f0: 300, f1: 1800, attack: 0.05 });
    A.osc("sine", 140, 60, 0, 0.3, 0.5, o);
    A.osc("sawtooth", 220, 110, 0, 0.3, 0.1, o, { vib: [25, 30], filter: ["lowpass", 900, 1] });
    A.noise(0, 0.2, 0.1, o, { type: "highpass", f0: 4000 });
  },
  impHurt: (A, o) => {
    [0, 0.08].forEach((t, i) => {
      A.osc("sawtooth", 420 - i * 60, 260 - i * 40, t, 0.12, 0.22, o, { filter: ["bandpass", 1400, 3], vib: [45, 60] });
      A.noise(t, 0.08, 0.1, o, { type: "highpass", f0: 3500 });
    });
  },
  impDie: (A, o) => {
    [0, 0.1, 0.2].forEach((t, i) => A.osc("sawtooth", 500 - i * 80, 330 - i * 60, t, 0.1, 0.2 - i * 0.04, o, { filter: ["bandpass", 1400, 3], vib: [45, 60] }));
    A.noise(0.25, 0.5, 0.2, o, { type: "lowpass", f0: 1500, f1: 200 });
    A.osc("sine", 200, 50, 0.35, 0.15, 0.4, o);
  },

  // Boss
  cyclopsRoar: (A, o) => {
    A.osc("sawtooth", 95, 60, 0, 1.2, 0.4, o, { attack: 0.15, rel: 0.5, filter: ["bandpass", 400, 2], fsweep: 250, vib: [14, 6] });
    A.osc("sawtooth", 142, 90, 0, 1.2, 0.2, o, { attack: 0.15, rel: 0.5, filter: ["lowpass", 500, 1], det: 15 });
    A.noise(0, 1.1, 0.3, o, { type: "lowpass", f0: 600, f1: 300, attack: 0.15 });
    A.verb(o, 0.3);
  },
  dragonRoar: (A, o) => {
    A.osc("sawtooth", 160, 340, 0, 0.35, 0.3, o, { filter: ["bandpass", 900, 1.5], vib: [28, 18], attack: 0.05 });
    A.osc("sawtooth", 340, 80, 0.35, 0.9, 0.3, o, { filter: ["bandpass", 700, 1.5], vib: [28, 18], attack: 0.02 });
    A.osc("sawtooth", 165, 345, 0, 0.35, 0.2, o, { filter: ["lowpass", 1200, 1], det: 20 });
    A.noise(0, 1.4, 0.35, o, { f0: 1200, f1: 700, q: 0.8, attack: 0.2 });
    A.verb(o, 0.35);
  },
  golemRoar: (A, o) => {
    A.osc("sawtooth", 55, 40, 0, 1.3, 0.4, o, { attack: 0.2, rel: 0.5, filter: ["lowpass", 300, 1.5] });
    A.osc("square", 40, 32, 0, 1.2, 0.25, o, { attack: 0.2, rel: 0.5, filter: ["lowpass", 200, 1] });
    A.noise(0, 1.3, 0.35, o, { buf: "brown", type: "lowpass", f0: 400, f1: 150, attack: 0.2 });
    for (let i = 0; i < 7; i++) A.noise(R(0.05, 1.1), R(0.06, 0.15), 0.15, o, { f0: R(500, 900), q: 4 });
    A.verb(o, 0.3);
  },
  bossAppear: (A, o) => {
    A.osc("sine", 80, 28, 0.9, 1.8, 0.9, o, { attack: 0.01 });
    [[55, 0.25, 3], [152, 0.1, 2.5], [208, 0.08, 2], [297, 0.05, 1.5]].forEach(([f, v, d]) => A.osc("sine", f, f, 0.9, d, v, o, { attack: 0.01 }));
    A.noise(0, 1.0, 0.25, o, { f0: 200, f1: 1500, q: 1.2, attack: 0.9 });
    A.osc("sawtooth", 55, 110, 0, 3, 0.1, o, { attack: 0.6, filter: ["lowpass", 400, 1] });
    A.osc("sawtooth", 78, 155, 0, 3, 0.08, o, { attack: 0.6, filter: ["lowpass", 400, 1] });
    A.noise(0.9, 1.4, 0.4, o, { type: "lowpass", f0: 1200, f1: 100 });
    A.verb(o, 0.6, 4);
  },
  bossHurt: (A, o) => {
    A.osc("sine", 110, 45, 0, 0.18, 0.8, o);
    A.osc("sawtooth", 180, 90, 0, 0.2, 0.25, o, { filter: ["bandpass", 500, 1.5] });
    A.noise(0, 0.1, 0.3, o, { type: "lowpass", f0: 700 });
  },
  bossSlam: (A, o) => {
    A.osc("sine", 70, 25, 0, 0.9, 1.0, o);
    A.noise(0, 0.7, 0.7, o, { type: "lowpass", f0: 1200, f1: 80 });
    for (let i = 0; i < 8; i++) A.noise(R(0.1, 0.7), 0.05, 0.2, o, { type: "highpass", f0: 1200 + R(0, 1500) });
    for (let i = 0; i < 3; i++) A.osc("sine", R(120, 200), 50, R(0.15, 0.6), 0.08, 0.2, o);
    A.verb(o, 0.3);
  },
  bossStep: (A, o) => {
    A.osc("sine", 60, 30, 0, 0.35, 0.9, o);
    A.noise(0, 0.15, 0.5, o, { type: "lowpass", f0: 300 });
    A.noise(0.05, 0.05, 0.08, o, { type: "highpass", f0: 3000 });
  },
  telegraph: (A, o) => {
    A.osc("sawtooth", 440, 660, 0, 0.12, 0.14, o, { filter: ["lowpass", 1500, 1], attack: 0.01 });
    A.osc("sawtooth", 660, 990, 0.13, 0.14, 0.14, o, { filter: ["lowpass", 1800, 1], attack: 0.01 });
  },
  fireballFall: (A, o) => {
    A.osc("sine", 2400, 500, 0, 1.2, 0.18, o, { attack: 1.0, rel: 0.15 });
    A.osc("sine", 2415, 505, 0, 1.2, 0.1, o, { attack: 1.0, rel: 0.15 });
    A.noise(0, 1.2, 0.3, o, { f0: 1800, f1: 400, q: 0.8, attack: 0.9, rel: 0.2 });
    A.noise(0, 1.2, 0.15, o, { type: "lowpass", f0: 500, f1: 900, attack: 1.0, rel: 0.2 });
  },
  fireballLand: (A, o) => {
    A.noise(0, 1.0, 0.85, o, { type: "lowpass", f0: 2000, f1: 90 });
    A.osc("sine", 110, 26, 0, 0.9, 1.0, o);
    for (let i = 0; i < 8; i++) A.noise(0.05 + Math.random() * 0.6, 0.05, 0.22, o, { type: "highpass", f0: 3000 + Math.random() * 3000 });
    A.verb(o, 0.3);
  },
  breath: (A, o) => {
    A.noise(0, 1.6, 0.5, o, { type: "lowpass", f0: 900, f1: 1600, attack: 0.25, rel: 0.5 });
    A.noise(0, 1.6, 0.15, o, { type: "highpass", f0: 2500, attack: 0.3, rel: 0.5 });
    A.osc("sawtooth", 70, 90, 0, 1.6, 0.2, o, { attack: 0.3, rel: 0.5, filter: ["lowpass", 300, 1] });
    for (let i = 0; i < 12; i++) A.noise(R(0.1, 1.5), R(0.01, 0.03), 0.12, o, { type: "highpass", f0: R(2500, 6000) });
  },
  rockThrow: (A, o) => {
    A.noise(0, 0.35, 0.3, o, { f0: 300, f1: 1200, q: 0.9, attack: 0.1 });
    A.osc("sine", 150, 70, 0, 0.2, 0.35, o);
    A.osc("sawtooth", 120, 80, 0, 0.18, 0.2, o, { filter: ["lowpass", 400, 1] });
  },
  rockLand: (A, o) => {
    A.osc("sine", 90, 35, 0, 0.4, 0.8, o);
    A.noise(0, 0.3, 0.6, o, { type: "lowpass", f0: 1500, f1: 200 });
    for (let i = 0; i < 5; i++) A.noise(R(0.05, 0.4), 0.04, 0.2, o, { type: "highpass", f0: 1500 + R(0, 1500) });
  },
  lavaBurst: (A, o) => {
    A.noise(0, 0.5, 0.5, o, { type: "lowpass", f0: 1800, f1: 300 });
    A.osc("sine", 200, 500, 0, 0.1, 0.3, o);
    A.osc("sine", 90, 40, 0, 0.4, 0.6, o);
    A.noise(0, 0.4, 0.12, o, { type: "highpass", f0: 3000 });
    for (let i = 0; i < 5; i++) A.osc("sine", R(100, 200), R(250, 450), R(0.05, 0.4), 0.1, 0.15, o);
  },
  shockwave: (A, o) => {
    A.osc("sine", 200, 30, 0, 1.2, 0.8, o, { attack: 0.01 });
    A.osc("sine", 90, 20, 0, 1.2, 0.5, o);
    A.noise(0, 1.0, 0.4, o, { type: "lowpass", f0: 150, f1: 2000, attack: 0.4 });
    A.verb(o, 0.4, 3);
  },
  bossDie: (A, o) => {
    A.osc("sawtooth", 220, 35, 0, 3.2, 0.35, o, { attack: 0.1, rel: 1.2, filter: ["lowpass", 600, 1], fsweep: 120, vib: [8, 8] });
    [0, 0.9, 1.7, 2.6].forEach((t, i) => {
      A.osc("sine", 80, 25, t, 0.7, 0.8 - i * 0.05, o);
      A.noise(t, 0.6, 0.45, o, { type: "lowpass", f0: 1200, f1: 100 });
    });
    for (let i = 0; i < 14; i++) A.noise(R(0, 3), R(0.03, 0.08), 0.18, o, { type: "highpass", f0: 1000 + R(0, 2500) });
    A.osc("sine", 55, 20, 3.0, 1.4, 1.0, o);
    [[110, 0.12, 2], [304, 0.07, 1.6], [594, 0.05, 1.2]].forEach(([f, v, d]) => A.osc("sine", f, f, 3.0, d, v, o));
    A.noise(3.0, 1.0, 0.4, o, { type: "lowpass", f0: 800, f1: 80 });
    A.verb(o, 0.6, 4);
  },

  // Dunia
  step: (A, o) => {
    const f = R(450, 1300);
    A.noise(0, R(0.035, 0.06), R(0.09, 0.14), o, { type: "lowpass", f0: f, f1: f * 0.5, q: R(0.5, 1.2), attack: 0.002 });
    A.osc("sine", R(100, 170), R(50, 75), 0, 0.05, R(0.07, 0.12), o, { attack: 0.002 });
    if (chance(0.3)) A.noise(R(0.005, 0.02), 0.012, 0.025, o, { type: "highpass", f0: R(3000, 5000) });
  },
  stepHeavy: (A, o) => {
    A.osc("sine", 90, 40, 0, 0.12, 0.5, o);
    A.noise(0, 0.1, 0.3, o, { type: "lowpass", f0: 700 });
    A.noise(0.02, 0.04, 0.06, o, { type: "highpass", f0: 3500 });
  },
  drip: (A, o) => {
    const f = 1500 + Math.random() * 1200;
    A.osc("sine", f, f * 0.55, 0, 0.1, 0.07, o);
    A.osc("sine", f * 0.9, f * 0.5, 0.22, 0.1, 0.025, o);
    A.verb(o, 0.3, 1.6);
  },
  lavaBubble: (A, o) => {
    const f = R(90, 160);
    A.osc("sine", f, f * 2.4, 0, 0.12, 0.25, o, { filter: ["lowpass", 800, 0.7], attack: 0.01 });
    A.noise(0, 0.08, 0.1, o, { type: "lowpass", f0: 400 });
  },
  fireCrackle: (A, o) => {
    for (let i = 0; i < 5; i++) A.noise(R(0, 0.35), R(0.01, 0.03), R(0.15, 0.3), o, { type: "highpass", f0: R(2500, 6000), attack: 0.001 });
    A.osc("sine", 900, 300, R(0.05, 0.3), 0.03, 0.12, o);
    A.noise(0, 0.3, 0.04, o, { f0: 1500, q: 0.7, attack: 0.05 });
  },
  portalOpen: (A, o) => {
    A.osc("sine", 220, 880, 0, 1.6, 0.2, o, { attack: 1.0, rel: 0.4 });
    A.osc("sawtooth", 110, 330, 0, 1.8, 0.1, o, { attack: 1.0, rel: 0.4, filter: ["lowpass", 300, 1], fsweep: 2500 });
    A.noise(0, 1.6, 0.15, o, { f0: 500, f1: 3000, q: 1, attack: 0.9, rel: 0.4 });
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => A.osc("sine", f, f, 0.3 + i * 0.16, 0.5, 0.07, o));
    A.verb(o, 0.4, 3);
  },
  portal: (A, o) => {
    A.noise(0, 0.6, 0.4, o, { f0: 3000, f1: 200, q: 1.2, attack: 0.05 });
    A.osc("sine", 1200, 200, 0, 0.5, 0.15, o);
    A.osc("sawtooth", 80, 300, 0, 0.12, 0.1, o, { filter: ["lowpass", 800, 1] });
    [2093, 2637, 3136].forEach((f, i) => A.osc("sine", f, f, 0.3 + i * 0.06, 0.2, 0.05, o));
  },
  floorClear: (A, o) => {
    A.osc("sine", 110, 60, 0, 0.4, 0.5, o);
    [392, 523, 659, 784].forEach((f, i) => {
      A.osc("sawtooth", f, f, i * 0.08, 0.3, 0.1, o, { filter: ["lowpass", 2200, 1], attack: 0.01 });
      A.osc("triangle", f, f, i * 0.08, 0.3, 0.12, o);
    });
    [523, 659, 784].forEach((f) => A.osc("sawtooth", f, f, 0.34, 0.6, 0.08, o, { filter: ["lowpass", 2200, 1], attack: 0.02 }));
    A.noise(0.3, 0.5, 0.1, o, { type: "highpass", f0: 5000, attack: 0.01 });
  },
  gateOpen: (A, o) => {
    A.noise(0, 1.8, 0.45, o, { type: "lowpass", f0: 500, f1: 350, attack: 0.2, rel: 0.4 });
    for (let i = 0; i < 7; i++) A.noise(R(0, 1.6), R(0.15, 0.35), 0.12, o, { f0: R(400, 900), q: 4 });
    A.osc("sine", 55, 60, 0, 2.0, 0.3, o, { attack: 0.3, rel: 0.5 });
    A.osc("sine", 110, 118, 0, 2.0, 0.15, o, { attack: 0.3, rel: 0.5 });
    A.osc("sawtooth", 80, 80, 0, 2.0, 0.1, o, { attack: 0.3, rel: 0.5, filter: ["lowpass", 200, 1] });
    A.osc("sine", 70, 30, 1.8, 0.3, 0.6, o);
  },
  titleHit: (A, o) => {
    A.osc("sine", 120, 24, 0, 3, 1.0, o, { attack: 0.01 });
    A.osc("sine", 60, 20, 0, 4.5, 0.7, o, { attack: 0.01 });
    A.noise(0, 2.5, 0.5, o, { type: "highpass", f0: 2500, attack: 0.005 });
    [1, 1.58, 2.37, 3.11, 4.2, 5.4].forEach((r, i) => A.osc("sine", 180 * r, 180 * r * 0.99, 0, 4 - i * 0.4, 0.14 - i * 0.015, o, { attack: 0.003 }));
    A.osc("sawtooth", 55, 40, 0, 1.2, 0.25, o, { filter: ["lowpass", 300, 1], attack: 0.02 });
    A.noise(0.1, 3, 0.35, o, { f0: 800, f1: 300, q: 0.8, attack: 0.01 });
    A.noise(0, 5, 0.5, o, { buf: "brown", type: "lowpass", f0: 400, f1: 60, attack: 0.02 });
    A.verb(o, 0.8, 5);
  },
  descend: (A, o) => {
    A.osc("sine", 400, 35, 0, 1.5, 0.4, o, { attack: 0.1 });
    A.noise(0, 1.6, 0.5, o, { type: "lowpass", f0: 2500, f1: 80, attack: 0.1 });
    A.osc("sawtooth", 220, 40, 0, 1.4, 0.12, o, { filter: ["lowpass", 500, 1], attack: 0.1 });
  },
};

// ---------- engine ----------
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.9;
    this.listener = { x: 0, y: 0 };
    this.lastPlayed = {};
    this.ambient = null;
    this.currentMusic = null;
    this.intensity = 0;
    this.custom = { sfx: {}, music: {} };
    this._manifest = { sfx: {}, music: {} };
    this._cbs = new Set();
    this._tracks = new Set();
    this._track = null;
    this._pending = null;
    this._preview = null;
    this._live = 0;
    this._trk = null;
    this._force = false;
    this._manual = false;
    this._loadP = null;
    try {
      const v = localStorage.getItem("dungeon.volume");
      const m = localStorage.getItem("dungeon.muted");
      const mv = localStorage.getItem("dungeon.musicVolume");
      const sv = localStorage.getItem("dungeon.sfxVolume");
      if (v !== null && isFinite(parseFloat(v))) this.volume = clamp(parseFloat(v), 0, 1);
      if (mv !== null && isFinite(parseFloat(mv))) this.musicVolume = clamp(parseFloat(mv), 0, 1);
      if (sv !== null && isFinite(parseFloat(sv))) this.sfxVolume = clamp(parseFloat(sv), 0, 1);
      if (m === "1") this.enabled = false;
    } catch {}
  }

  // ---------- inisialisasi ----------
  // Harus dipanggil dari gesture user (klik tombol masuk)
  unlock() {
    try {
      if (!this.ctx) {
        const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return false;
        this.ctx = new AC({ latencyHint: "interactive" });
        this._build();
      }
      if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume().catch(() => {});
      if (!this._unlocked) {
        this._unlocked = true;
        this._decodeAll();
      }
      if (this._pending) {
        const p = this._pending;
        this._pending = null;
        this._begin(p.name, p.fade);
      }
      return true;
    } catch {
      return false;
    }
  }

  // hook pengujian: pakai (Offline)AudioContext buatan sendiri
  _initWith(ctx) {
    this.ctx = ctx;
    this._force = true;
    this._manual = true;
    this._unlocked = true;
    this.lastPlayed = {};
    this._tracks = new Set();
    this._track = null;
    this._build();
  }

  _build() {
    const c = this.ctx, sr = c.sampleRate;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 8;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    // soft clip terakhir: puncak tidak pernah melewati ~0.98
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
    }
    const clip = c.createWaveShaper();
    clip.curve = curve;
    this.master.connect(comp); comp.connect(clip); clip.connect(c.destination);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    // buffer noise
    const len = Math.floor(sr * 1.5);
    this.noiseBuf = c.createBuffer(1, len, sr);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const bl = Math.floor(sr * 6);
    this.brownBuf = c.createBuffer(1, bl, sr);
    const b = this.brownBuf.getChannelData(0);
    let last = 0, pk = 0;
    for (let i = 0; i < bl; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last; pk = Math.max(pk, Math.abs(last)); }
    for (let i = 0; i < bl; i++) b[i] /= pk || 1;

    // reverb hasil generate (IR noise meluruh eksponensial)
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._ir(2.8);
    const rOut = c.createGain();
    rOut.gain.value = 0.8;
    this.reverb.connect(rOut); rOut.connect(this.musicBus);
    this.sfxVerb = c.createConvolver();
    this.sfxVerb.buffer = this._ir(1.8);
    this.sfxVerb.connect(this.sfxBus);
  }

  _ir(sec) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * sec);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        lp += (0.55 * (1 - x) + 0.08) * ((Math.random() * 2 - 1) - lp); // makin gelap seiring waktu
        d[i] = lp * Math.exp(-6.9 * x) * Math.min(1, i / (sr * 0.015));
      }
    }
    return buf;
  }

  // ---------- volume ----------
  setVolume(v) {
    this.volume = clamp(+v || 0, 0, 1);
    this.apply();
    try { localStorage.setItem("dungeon.volume", String(this.volume)); } catch {}
    this._emit();
  }
  setMusicVolume(v) {
    this.musicVolume = clamp(+v || 0, 0, 1);
    this.apply();
    try { localStorage.setItem("dungeon.musicVolume", String(this.musicVolume)); } catch {}
    this._emit();
  }
  setSfxVolume(v) {
    this.sfxVolume = clamp(+v || 0, 0, 1);
    this.apply();
    try { localStorage.setItem("dungeon.sfxVolume", String(this.sfxVolume)); } catch {}
    this._emit();
  }
  setMuted(m) {
    this.enabled = !m;
    this.apply();
    try { localStorage.setItem("dungeon.muted", m ? "1" : "0"); } catch {}
    this._emit();
  }
  apply() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, t, 0.03);
      this.musicBus.gain.setTargetAtTime(this.musicVolume, t, 0.03);
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, t, 0.03);
    } catch {}
  }

  // ---------- blok pembangun ----------
  _reg(src, extra = []) {
    this._live++;
    const T = this._trk;
    if (T) T.srcs.add(src);
    src.onended = () => {
      this._live--;
      if (T) T.srcs.delete(src);
      try { src.disconnect(); } catch {}
      for (const n of extra) { try { n.disconnect(); } catch {} }
    };
  }

  _env(param, t, dur, vol, atk, rel) {
    atk = Math.min(atk, dur * 0.9);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(vol, t + atk);
    if (rel) param.setValueAtTime(vol, t + Math.max(atk, dur - rel));
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // waktu absolut
  oscAt(type, f0, f1, t, dur, vol, out, o = {}) {
    const c = this.ctx;
    const os = c.createOscillator();
    const g = c.createGain();
    os.type = type;
    os.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (o.det) os.detune.value = o.det;
    this._env(g.gain, t, dur, vol, o.attack ?? o.atk ?? 0.004, o.rel);
    const extra = [g];
    let node = os;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter[0];
      f.Q.value = o.filter[2] || 1;
      if (o.fenv) {
        f.frequency.setValueAtTime(o.fenv[0], t);
        f.frequency.linearRampToValueAtTime(o.fenv[1], t + o.fenv[2]);
        f.frequency.exponentialRampToValueAtTime(Math.max(20, o.fenv[3] || o.fenv[0]), t + dur);
      } else {
        f.frequency.setValueAtTime(o.filter[1], t);
        if (o.fsweep) f.frequency.exponentialRampToValueAtTime(o.fsweep, t + dur);
      }
      node.connect(f);
      node = f;
      extra.push(f);
    }
    if (o.vib) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      lfo.connect(lg);
      lg.connect(os.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
      this._reg(lfo, [lg]);
    }
    node.connect(g);
    g.connect(out);
    os.start(t);
    os.stop(t + dur + 0.05);
    this._reg(os, extra);
  }

  noiseAt(t, dur, vol, out, o = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = o.buf === "brown" ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = c.createGain();
    this._env(g.gain, t, dur, vol, o.attack ?? 0.004, o.rel);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * (src.buffer.duration - 0.2));
    src.stop(t + dur + 0.05);
    this._reg(src, [f, g]);
  }

  // waktu relatif terhadap sekarang (dipakai SFX)
  osc(type, f0, f1, t0, dur, vol, out, o = {}) { this.oscAt(type, f0, f1, this.ctx.currentTime + t0, dur, vol, out, o); }
  noise(t0, dur, vol, out, o = {}) { this.noiseAt(this.ctx.currentTime + t0, dur, vol, out, o); }

  lfo(rate, depth, param) {
    const c = this.ctx;
    const os = c.createOscillator(), g = c.createGain();
    os.frequency.value = rate; g.gain.value = depth;
    os.connect(g); g.connect(param); os.start();
    this._reg(os, [g]);
  }

  // kirim sebagian suara ke reverb SFX
  verb(out, amt, dur = 3) {
    const s = this.ctx.createGain();
    s.gain.value = amt;
    out.connect(s); s.connect(this.sfxVerb);
    setTimeout(() => { try { s.disconnect(); } catch {} }, (dur + 1.5) * 1000);
  }

  // ---------- SFX ----------
  // pos {x,y} opsional → suara berposisi (volume turun + pan kiri/kanan)
  play(name, pos, _opt) {
    try {
      if (typeof name !== "string" || !this.ctx || !this.enabled || !this.sfxBus) return;
      if (!this._force && this.ctx.state !== "running") return;
      const fn = SFX[name];
      if (!fn) return;
      const now = performance.now();
      if (name !== "step" && !(_opt && _opt.noDedupe)) {
        if (now - (this.lastPlayed[name] || 0) < 35) return; // cegah tumpukan suara identik
        this.lastPlayed[name] = now;
      }
      let gain = 1, pan = 0;
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y;
        const d = Math.hypot(dx, dy);
        gain = Math.pow(clamp(1 - d / 720, 0, 1), 1.4);
        pan = clamp(dx / 520, -1, 1);
        if (gain < 0.02) return;
      }
      const out = this.ctx.createGain();
      out.gain.value = gain;
      let tail = out;
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        out.connect(p);
        tail = p;
      }
      tail.connect(this.sfxBus);
      this._trk = null;
      let wait = TAIL[name] || 3.5;
      const ce = this.custom.sfx[name];
      if (ce && ce.buffer) {
        this._playBuf(ce.buffer, out);
        wait = Math.min(ce.buffer.duration, SFX_CAP) + 0.6;
      } else {
        if (ce && !ce.failed) this._decode(ce);
        fn(this, out);
      }
      setTimeout(() => { try { tail.disconnect(); out.disconnect(); } catch {} }, wait * 1000);
    } catch {}
  }

  _playBuf(buf, out, loop = false) {
    const c = this.ctx;
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    const dur = Math.min(buf.duration, SFX_CAP);
    if (buf.duration > SFX_CAP) {
      g.gain.setValueAtTime(1, c.currentTime + dur - 0.08);
      g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
    }
    src.connect(g); g.connect(out);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
    this._reg(src, [g]);
  }

  // ---------- musik ----------
  playMusic(name, { fade = 1.2 } = {}) {
    try {
      if (typeof name !== "string" || !TRACKS[name]) return;
      const cur = this._track;
      if (this.currentMusic === name && ((cur && cur.name === name && !cur.finished) || (!this.ctx && this._pending) || this._waiting === name)) return;
      this.currentMusic = name;
      if (!this.ctx) { this._pending = { name, fade }; return; }
      this._begin(name, fade);
    } catch {}
  }

  stopMusic(fade = 1) {
    this.currentMusic = null;
    this._pending = null;
    this._waiting = null;
    if (this._track) this._retire(this._track, fade);
    this._track = null;
  }

  musicIntensity(v) { this.intensity = clamp(+v || 0, 0, 1); }

  startAmbient() {}
  stopAmbient() {}

  _begin(name, fade) {
    const ce = this.custom.music[name];
    if (ce && !ce.buffer && !ce.failed) {
      if (this._track) this._retire(this._track, fade);
      this._track = null;
      this._waiting = name;
      this._decode(ce).then(() => {
        if (this._waiting !== name) return;
        this._waiting = null;
        if (this.currentMusic === name && !this._track && this.ctx) this._begin(name, fade);
      });
      return;
    }
    this._waiting = null;
    const old = this._track;
    const T = this._makeTrack(name, ce && ce.buffer ? ce.buffer : null);
    if (!T) return;
    if (old) this._retire(old, fade);
    this._track = T;
    this._fadeIn(T, fade);
  }

  _fadeTo(param, v, dur) {
    const t = this.ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      if (dur > 0.01) param.linearRampToValueAtTime(v, t + dur); else param.setValueAtTime(v, t);
    } catch {}
  }

  _fadeIn(T, fade) {
    const t = this.ctx.currentTime;
    if (fade > 0.01) {
      [T.bus.gain, T.rin.gain].forEach((p) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(1, t + fade); });
    }
  }

  _makeTrack(name, buffer) {
    const c = this.ctx;
    const def = TRACKS[name];
    const T = { name, def, srcs: new Set(), dead: false, stopping: false, finished: false, s: 0, sd: 0.2, st: {}, timer: null, kill: null, fin: null };
    T.next = c.currentTime + 0.06;
    T.bus = c.createGain(); T.rin = c.createGain(); T.dry = c.createGain(); T.wet = c.createGain();
    const ds = c.createGain(), wd = c.createGain(), ws = c.createGain();
    ds.gain.value = 0.28; wd.gain.value = 0.4; ws.gain.value = 1;
    T.dry.connect(T.bus); T.dry.connect(ds); ds.connect(T.rin);
    T.wet.connect(wd); wd.connect(T.bus); T.wet.connect(ws); ws.connect(T.rin);
    T.bus.connect(this.musicBus); T.rin.connect(this.reverb);
    T.nodes = [T.bus, T.rin, T.dry, T.wet, ds, wd, ws];
    this._tracks.add(T);
    const prev = this._trk;
    this._trk = T;
    try {
      if (buffer) {
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.loop = !ONCE[name];
        src.connect(T.dry);
        src.start();
        this._reg(src);
        if (ONCE[name]) src.addEventListener("ended", () => { T.finished = true; });
      } else {
        def.init(this, T);
      }
    } catch {}
    this._trk = prev;
    const once = def.once || (buffer && ONCE[name] ? buffer.duration : 0);
    if (once) {
      T.once = true;
      if (!this._manual) T.fin = setTimeout(() => { T.finished = true; this._retire(T, 1.5); }, (once + 0.2) * 1000);
    } else if (!buffer && !this._manual) {
      T.timer = setInterval(() => this._tick(T), 100);
    }
    if (!buffer) T.live = true;
    return T;
  }

  _tick(T) {
    if (!this.ctx || T.dead || T.stopping || !T.live || T.once) return;
    const now = this.ctx.currentTime;
    if (T.next < now - 0.05) T.next = now + 0.02; // tab sempat tertahan: lanjut tanpa mengejar
    const prev = this._trk;
    this._trk = T;
    const I = this.intensity;
    let guard = 0;
    while (T.next < now + 0.4 && guard++ < 64) {
      T.sd = 60 / (T.def.bpm * (1 + 0.18 * I)) / 4;
      try {
        T.def.step(this, T, T.s, T.next);
        if (I > 0.05) extraLayer(this, T, T.s, T.next, I);
      } catch {}
      T.next += T.sd;
      T.s++;
    }
    this._trk = prev;
  }

  // untuk pengujian offline: jalankan scheduler secara manual
  _musicTick() {
    this._tracks.forEach((T) => this._tick(T));
  }

  _retire(T, fade) {
    if (!T || T.dead || T.stopping) return;
    T.stopping = true;
    if (T.timer) { clearInterval(T.timer); T.timer = null; }
    if (T.fin) { clearTimeout(T.fin); T.fin = null; }
    try { this._fadeTo(T.bus.gain, 0, fade); this._fadeTo(T.rin.gain, 0, fade); } catch {}
    if (this._manual) return;
    T.kill = setTimeout(() => this._kill(T), Math.max(0, fade) * 1000 + 300);
  }

  _kill(T) {
    if (T.dead) return;
    T.dead = true;
    T.stopping = true;
    if (T.timer) { clearInterval(T.timer); T.timer = null; }
    if (T.fin) { clearTimeout(T.fin); T.fin = null; }
    if (T.kill) { clearTimeout(T.kill); T.kill = null; }
    T.srcs.forEach((s) => { try { s.stop(); } catch {} });
    T.srcs.clear();
    T.nodes.forEach((n) => { try { n.disconnect(); } catch {} });
    this._tracks.delete(T);
  }

  // untuk pengujian
  _stats() {
    let timers = 0;
    this._tracks.forEach((T) => { if (T.timer) timers++; });
    return { live: this._live, tracks: this._tracks.size, timers, current: this.currentMusic };
  }

  // ---------- audio kustom ----------
  listKeys() {
    const sfx = [];
    Object.keys(SFX_GROUPS).forEach((group) => Object.keys(SFX_GROUPS[group]).forEach((key) => sfx.push({ key, label: SFX_GROUPS[group][key], group })));
    const music = Object.keys(TRACKS).map((key) => ({ key, label: MUSIC_LABELS[key] || key }));
    return { sfx, music };
  }

  _known(type, key) {
    if (type === "sfx") return !!SFX[key];
    if (type === "music") return !!TRACKS[key];
    return false;
  }

  hasCustom(type, key) { return !!(this.custom[type] && this.custom[type][key]); }
  customSource(type, key) {
    const e = this.custom[type] && this.custom[type][key];
    return e ? e.src : null;
  }

  onChange(cb) {
    this._cbs.add(cb);
    return () => this._cbs.delete(cb);
  }
  _emit() { this._cbs.forEach((cb) => { try { cb(); } catch {} }); }

  _decode(e) {
    if (e.buffer) return Promise.resolve(e.buffer);
    if (e.p) return e.p;
    if (!this.ctx) return Promise.resolve(null);
    e.p = (async () => {
      try {
        let ab;
        if (e.blob) ab = await e.blob.arrayBuffer();
        else {
          const r = await fetch(e.url);
          if (!r.ok) throw new Error("http");
          ab = await r.arrayBuffer();
        }
        e.buffer = await this.ctx.decodeAudioData(ab);
      } catch { e.failed = true; }
      e.p = null;
      this._emit();
      return e.buffer || null;
    })();
    return e.p;
  }

  _decodeAll() {
    ["sfx", "music"].forEach((type) => Object.keys(this.custom[type]).forEach((k) => this._decode(this.custom[type][k])));
  }

  async loadCustom() {
    if (this._loadP) return this._loadP;
    this._loadP = (async () => {
      const base = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";
      try {
        const r = await fetch(base + "audio/manifest.json", { cache: "no-cache" });
        if (r.ok) {
          const m = await r.json();
          ["sfx", "music"].forEach((type) => {
            const src = m && m[type];
            if (!src || typeof src !== "object") return;
            Object.keys(src).forEach((key) => {
              const f = src[key];
              if (!this._known(type, key) || typeof f !== "string") return;
              if (f.includes("..") || !/^[\w\-. ()/]+\.(mp3|ogg|wav)$/i.test(f)) return;
              this._manifest[type][key] = base + "audio/" + f.split("/").map(encodeURIComponent).join("/");
            });
          });
        }
      } catch {}
      Object.keys(this._manifest).forEach((type) => Object.keys(this._manifest[type]).forEach((key) => {
        this.custom[type][key] = { src: "manifest", url: this._manifest[type][key] };
      }));
      try {
        const rows = await idbReq("readonly", (s) => s.getAll());
        if (Array.isArray(rows)) {
          rows.forEach((row) => {
            if (!row || !row.blob || !this._known(row.type, row.key)) return;
            this.custom[row.type][row.key] = { src: "upload", blob: row.blob };
          });
        }
      } catch {}
      if (this.ctx) this._decodeAll();
      this._emit();
    })();
    return this._loadP;
  }

  async setCustom(type, key, file) {
    try {
      if (!this._known(type, key)) return { ok: false, error: "Kunci suara tidak dikenal." };
      if (!file || typeof file.size !== "number") return { ok: false, error: "Berkas tidak valid." };
      if (file.size <= 0) return { ok: false, error: "Berkas kosong." };
      if (file.size > MAX_FILE) return { ok: false, error: "Berkas terlalu besar (maks 8 MB)." };
      const okExt = /\.(mp3|ogg|wav)$/i.test(file.name || "");
      const okMime = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|vnd\.wave)(;|$)/i.test(file.type || "");
      if (!okExt && !okMime) return { ok: false, error: "Format tidak didukung. Gunakan mp3, ogg, atau wav." };
      if (!this.ctx) this.unlock();
      if (!this.ctx) return { ok: false, error: "Browser tidak mendukung WebAudio." };
      const entry = { src: "upload", blob: file };
      try {
        entry.buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
      } catch {
        return { ok: false, error: "Berkas audio rusak atau tidak bisa dibaca browser." };
      }
      const saved = await idbReq("readwrite", (s) => s.put({ id: type + ":" + key, type, key, blob: file, size: file.size, at: Date.now() }));
      this.custom[type][key] = entry;
      this._emit();
      return saved ? { ok: true } : { ok: true, warn: "Disimpan sementara saja (penyimpanan browser tidak tersedia)." };
    } catch {
      return { ok: false, error: "Gagal memproses berkas." };
    }
  }

  async clearCustom(type, key) {
    try {
      await idbReq("readwrite", (s) => s.delete(type + ":" + key));
      const man = this._manifest[type] && this._manifest[type][key];
      if (man) this.custom[type][key] = { src: "manifest", url: man };
      else if (this.custom[type]) delete this.custom[type][key];
      if (man && this.ctx) this._decode(this.custom[type][key]);
      this._emit();
    } catch {}
  }

  preview(type, key) {
    try {
      if (!this._known(type, key)) return;
      if (!this.ctx) this.unlock();
      if (!this.ctx) return;
      if (type === "sfx") { this.play(key, undefined, { noDedupe: true }); return; }
      this._endPreview(true);
      const tok = {};
      this._preview = tok;
      const ce = this.custom.music[key];
      const go = () => {
        if (this._preview !== tok) return;
        const T = this._makeTrack(key, ce && ce.buffer ? ce.buffer : null);
        if (!T) return;
        tok.T = T;
        this._fadeIn(T, 0.3);
        if (this._track) { this._fadeTo(this._track.bus.gain, 0.12, 0.4); this._fadeTo(this._track.rin.gain, 0.12, 0.4); }
        tok.timer = setTimeout(() => this._endPreview(), 4000);
      };
      if (ce && !ce.buffer && !ce.failed) this._decode(ce).then(go); else go();
    } catch {}
  }

  stopPreview() { this._endPreview(); }

  _endPreview(fast) {
    const tok = this._preview;
    if (!tok) return;
    this._preview = null;
    if (tok.timer) clearTimeout(tok.timer);
    if (tok.T) this._retire(tok.T, fast ? 0.1 : 0.8);
    const cur = this._track;
    if (cur && !cur.stopping && !cur.dead) { this._fadeTo(cur.bus.gain, 1, 0.8); this._fadeTo(cur.rin.gain, 1, 0.8); }
  }
}

export const audio = new AudioEngine();
