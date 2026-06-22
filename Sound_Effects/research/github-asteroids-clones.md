# Asteroids Clone Games on GitHub — Sound Effects Analysis

## Overview

This document catalogs open-source Asteroids-style games on GitHub with their sound effect sources, licensing, and potential use for our project.

---

## Top Asteroids Clones by Star Count / Relevance

### 1. Harrison1/asteroids (Godot Engine)
- **Repo:** https://github.com/Harrison1/asteroids
- **Engine:** Godot Engine
- **Star Count:** Popular (check current stars on repo page)
- **Sound Sources:**
  - OpenGameArt (CC BY 4.0) — ekmaudio, rubberduck, LilMati
  - FreeSound (CC0 available) — unfa, Krokulator
- **SFX Available:**
  - Laser shots
  - Asteroid explosions (large/medium/small)
  - Ship explosion
  - Game over / UI sounds
- **Credits in Repo:** Lists specific artists who contributed each sound
- **License:** CC BY 4.0 (requires attribution) + CC0 pieces
- **Safe to Download:** YES — with proper credit in our project

### 2. AntumLuanti/game-asteroids (Luanti / Minecrafter Engine)
- **Repo:** https://github.com/AntumLuanti/game-asteroids
- **Engine:** Luanti (formerly Minetest)
- **Sound Sources:** CC0 public domain + one CC BY 3.0 piece
- **SFX Available:**
  - Menu theme & asteroids_hit (CC0, ColinSc)
  - Ship engine/thrust loop (CC0, theMinesAreShakin)
  - Ship explosion (CC0, Rick Hoppmann)
  - Ship shoot laser (CC BY 3.0, dklon)
- **License:** Mostly CC0 — excellent for our needs
- **Safe to Download:** YES — CC0 is public domain

### 3. oyvind-stromsvik/asteroids (Unity Clone)
- **Repo:** https://github.com/oyvind-stromsvik/asteroids
- **Engine:** Unity / C#
- **Sound Sources:** classicgaming.cc + custom shield SFX
- **SFX Available:**
  - Classic arcade-style sounds from classicgaming.cc
  - Custom shield hit SFX (author-made)
- **License:** UNCLEAR — classicgaming.cc has no stated license for the arcade SFX
- **Safe to Download:** PARTIAL — use only custom shield SFX, avoid the imported arcade audio

### 4. leithdm/shooty-rocks (JavaScript / HTML5)
- **Repo:** https://github.com/leithdm/shooty-rocks
- **Engine:** JavaScript / HTML5 Canvas
- **Sound Sources:** Classic Gaming archive + royalty-free background music
- **SFX Available:**
  - Arcade-era explosions, laser shots, thrust sounds
  - Background music: Royalty-free from DL Sounds
- **License:** Mixed — arcade SFX (unknown), BGM (royalty-free)
- **Safe to Download:** PARTIAL — verify the royalty-free BGM license; avoid arcade SFX for commercial use

### 5. Lusito/typed-asteroids (TypeScript / PixiJS)
- **Repo:** https://github.com/Lusito/typed-asteroids
- **Engine:** TypeScript + PixiJS (browser-based, very relevant since our project is browser-based too!)
- **Sound Sources:** OpenGameArt, FreeSound, Jamendo
- **Contributors:** Bart Kelsey, Bliss, broumbroum, inferno, RunnerPack, Simon_Lacelle, THE_bizniss
- **Music by:** Joost Egelie, Pogotron, lucasgonze
- **License:** CC BY 4.0 / CC0 mix
- **Safe to Download:** YES — with proper credit

---

## Dedicated Free Asteroids SFX Libraries

### OpenGameArt Collections (Best for Our Needs)

| Asset Pack | Author | License | What's Included | Link |
|------------|--------|---------|-----------------|------|
| 8-bit Sci-Fi Sounds | ekmaudio | CC BY 4.0 | Laser, explosions, retro SFX | https://opengameart.org/content/8-bit-sci-fi-sounds |
| 50 CC0 Sci-Fi SFX | rubberduck | CC0 / Public Domain | 50 free space/retro sounds | https://opengameart.org/content/50-cc0-sci-fi-sfx |
| Vintage Collection VGM SFX Vol II | Various | Mix of licenses | Retro game music & SFX | https://opengameart.org/content/vintage-collection-vgm-sfx-tracks-stuff-vol-ii |

### Freesound.org (Filter by CC0)
- **URL:** https://freesound.org
- **Search terms to use:** "asteroids laser", "retro game explosion", "arcade thrust", "pixel blaster"
- **License filter:** Set Creative Commons → CC0 in the UI for public domain only
- **Safety:** Always verify individual sound's license — Freesound has mixed licensing

---

## Kenney.nl Free Audio Packs (CC0 Public Domain) — TOP PICK FOR US

These are **our best option** — all CC0, no attribution needed, professional quality:

| Pack | URL | Content Count | Best For |
|------|-----|---------------|----------|
| Digital Audio | https://www.kenney.nl/assets/digital-audio | 60 sounds | Space/laser effects |
| Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | Multiple | Space/retro SFX |
| Impact Sounds | https://kenney.nl/assets/impact-sounds | 130 sounds | Explosions, impacts |
| Space Shooter Remastered | https://www.kenney.nl/assets/space-shooter-remastered | Full pack | Complete space game audio suite |

**All Kenney packs are CC0** — free for any use including commercial, no attribution required.

---

## Recommendations

### For Our Project (Browser-based, TypeScript, Three.js)
1. **Kenney.nl Space Shooter Remastered** — Best overall choice. Professional quality, complete space audio suite, CC0 license, directly applicable to a 3D asteroids game.
2. **OpenGameArt's 50 CC0 Sci-Fi SFX** by rubberduck — Good backup for additional specific effects. Also CC0 public domain.
3. **AntumLuanti/game-asteroids repo** — Clone and extract the CC0 ship engine/exhaust loop as a reference or reuse the thrust sound directly.
4. **Typed-Asteroids (Lusito)** — Study how they integrate Web Audio API for browser-based SFX (our exact tech stack).

### For Downloading
1. Download Kenney packs directly from https://kenney.nl — no signup required, instant ZIP download
2. Extract to `Sound_Effects/kenney-digital-audio/`, `Sound_Effects/kenney-scifi-sounds/`, etc.
3. Verify each CC0 license file is included in the downloaded pack (usually in `LICENSE.txt`)

### For Commercial Use
All above options are safe for commercial release as long as you:
- Credit Kenney.nl if they update their license terms (currently CC0)
- Check OpenGameArt individual asset licenses per-pack (CC BY 4.0 requires credit in credits screen)
- Never use unlicensed arcade recordings directly
