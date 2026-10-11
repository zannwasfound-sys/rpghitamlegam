VOXA RPG - Audio kustom
=======================

Secara bawaan semua suara dan musik disintesis lewat WebAudio (tanpa file).
Kamu bisa mengganti suara/musik tertentu dengan file sendiri.

CARA 1: lewat menu Pengaturan Suara di dalam game
  Tombol "Ganti..." di tiap baris -> pilih file audio (mp3/ogg/wav, maks 8 MB).
  Disimpan di browser (IndexedDB) dan menang atas manifest.

CARA 2: lewat folder ini
  1. Taruh file audio di folder ini (client/public/audio/).
  2. Daftarkan di manifest.json, contoh:

     {
       "sfx":   { "swordHit": "pedang.mp3", "coin": "koin.wav" },
       "music": { "title": "title.ogg", "boss": "boss.mp3" }
     }

  3. Muat ulang halaman. Kunci yang tidak dikenal diabaikan.

KUNCI SFX
  UI      : click, uiOpen, uiClose, cardFlip, cardPick, buy, coin, potion, chatPing, emote, levelUp
  Serangan: swordSwing, swordHit, fireCast, fireBoom, bowShot, arrowHit, arrowWall,
            holyCast, heal, orbHit, dash, parry, playerHurt, ko
  Monster : slime / skeleton / orc / bat / imp  +  Atk / Hurt / Die
            (contoh: slimeAtk, slimeHurt, slimeDie, batHurt, impAtk, orcDie)
  Boss    : cyclopsRoar, dragonRoar, golemRoar, bossSlam, bossStep, telegraph,
            fireballFall, fireballLand, breath, rockThrow, rockLand, lavaBubble (lihat Dunia),
            lavaBurst, bossDie
  Dunia   : step, stepHeavy, drip, lavaBubble, portalOpen, portal, floorClear,
            gateOpen, titleHit, descend

KUNCI MUSIK
  title, camp, cave, ruins, lava, boss, victory, defeat
  (musik kustom diputar berulang/loop, kecuali victory dan defeat yang sekali putar)

CATATAN
  - Suara pendek yang sering terdengar (step, coin, click) sebaiknya sangat singkat.
  - Upload lewat menu menang atas manifest.json.
