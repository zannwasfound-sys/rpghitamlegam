# Dungeon RPG — Phase 1 + prototype Dungeon & Combat

## Update: Class, visual, SFX, efek hit
- **4 class** dipilih di layar login (preview animasi): Fighter (pedang+perisai, tebasan arc & knockback kuat), Mage (tongkat api, bola api meledak area), Marksman (busur, panah cepat menembus musuh), Support (tongkat suci, orb + heal sekutu di sekitar). Data class di `server/src/classes.js`.
- **Bidik pakai mouse**, klik/Spasi (boleh ditahan) untuk menyerang. Proyektil disimulasikan server (authoritative).
- **Karakter & monster bertekstur** (humanoid, animasi jalan/serang/mati) digambar prosedural di `client/src/game/art.js` — tanpa file gambar.
- **SFX** disintesis WebAudio (`audio.js`): ayunan, hit, api, ledakan, busur, heal, suara sakit tiap monster, level up, KO, ambient gua. Tombol 🔊/slider di HUD, tombol **M** untuk bisu.
- **Efek kena damage/knockback** (`fx.js`): screen shake terarah, distorsi layar (gelombang + pemisahan warna RGB + vignette merah), tubuh bergetar/gepeng/flash, debu terseret, partikel. Knockback dihitung server untuk pemain & monster.


Prototype berdasarkan PRD Web-Based Multiplayer RPG.

## Fitur saat ini
- Peta dungeon (kota aman + 4 ruangan monster + lorong), dinding dengan collision di server dan client
- Pencahayaan gelap dengan obor, minimap, angka damage melayang
- Monster (slime, skeleton, orc) dengan agro: mengejar dan menyerang pemain, respawn setelah mati
- Serangan (Spasi / klik) divalidasi server: cooldown, jarak, arah hadap
- EXP, naik level (HP bertambah), KO lalu respawn di kota; kota memulihkan HP
- Belum: Skill tree, inventory/loot, chat, party, instanced dungeon + boss, Supabase

## Isi Phase 1
- Server Colyseus (Node.js), simulasi 60 tick/detik, patch state 20x/detik (delta compression bawaan Colyseus)
- Server authority: client hanya mengirim arah input, server yang menghitung posisi (dibatasi kecepatan & batas peta)
- Client-Side Prediction + Server Reconciliation untuk pemain lokal
- Interpolasi untuk pemain lain, sehingga pemain saling terlihat bergerak mulus
- React + Tailwind untuk login screen & HUD, game utama di HTML5 Canvas
- Belum dipasang: Supabase (auth + DAO), ditunda sesuai pilihan

## Cara menjalankan
Butuh Node.js 18+.

Terminal 1 (server):
```bash
cd server
npm install
npm start
```

Terminal 2 (client):
```bash
cd client
npm install
npm run dev
```

Buka http://localhost:5173 di dua tab/browser, masukkan nama berbeda, gerak dengan WASD / panah.

Tes otomatis server: `cd server && npm test` (server harus sudah jalan) dan `npm run test:combat` (menjalankan server sendiri)

Bila server di alamat lain: salin `client/.env.example` ke `client/.env` lalu ubah `VITE_SERVER_URL`.

## Struktur
```
server/src/
  index.js       entry point (Express + Colyseus)
  WorldRoom.js   room: input queue, tick, validasi gerak
  schema.js      state sinkron (Player, WorldState)
  map.js         generator peta + data monster
  physics.js     collision tile (identik dengan versi client)
  smoke-test.js  tes 2 klien + anti-cheat sederhana
  combat-test.js tes collision, agro, serangan, EXP, respawn
client/src/
  App.jsx, components/{LoginScreen,GameCanvas,Hud}.jsx
  game/engine.js   prediction, reconciliation, render canvas
  game/network.js  koneksi ke room
```

## Langkah berikutnya (sesuai roadmap)
1. Phase 1 sisa: integrasi Supabase (auth + DAO data karakter)
2. Phase 2: combat, monster + AI agro, EXP/level
3. Phase 3: inventory, loot, chat, party
4. Fitur 3.6: instanced dungeon (room baru per party), scaling, boss phase, personal loot
