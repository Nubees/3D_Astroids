---
name: asteroids-modern-descendants
description: Modern Asteroids clones, spiritual successors, roguelites, and loot-driven space shooters with patterns worth borrowing.
---

# Modern Asteroids Descendants & Spiritual Successors

This page collects modern clones, browser remakes, roguelites, and loot-driven space shooters that share DNA with *Asteroids*. It focuses on what they added, what worked, and what ideas are portable to our “Next Edition” concept. See also [[asteroids-official-lineage]] for the official series and [[asteroids-next-edition-design-ideas]] for how these map to our project.

---

## 1. Browser / Open-Source / HTML5 Clones

These are closest to a web-first project like ours and show minimal viable implementations.

| Project | Tech | Premise | Core Loop | Notable Features |
|---|---|---|---|---|
| [jhamon/asteroids.js](http://www.hamon.io/asteroids.js/) | Vanilla JS, Canvas | OO JS experiment recreating classic *Asteroids* | Rotate/thrust/shoot; endless survival, wrap, score | Local high score; no upgrades |
| [pmarreck/vibesteroids](https://pmarreck.github.io/vibesteroids/) | Vanilla JS, single HTML, Web Audio | “Vibe-coded” functional/immutable clone | Arrow keys thrust/rotate; Space shoot; shake for mobile Death Blossom | Death Blossom special; Kid Mode; seeded tests |
| [Haseeb-Qureshi/Asteroids](http://haseeb-qureshi.github.io/Asteroids/) | Vanilla JS, Canvas | Modern remake with dynamic difficulty | Move → shoot → split rocks → chase score | Triple laser, total destruction, 1-up power-ups, dynamic difficulty |
| [kindohm/space-janitor](https://github.com/kindohm/space-janitor) | JS + Coquette | “Clone of Asteroids, written for web browsers” | Clear space debris | Sound assets, leaderboards, npm build/test |
| [krupitskas/whats-going-on-here-asteroids](https://github.com/krupitskas/whats-going-on-here-asteroids) | Rust + Macroquad | Small arcade space shooter with breakable asteroids | Endless survival; thrust/brake/strafe/boost/shoot | **Breakable asteroids split into smaller pieces**; `AlanEnemy` (raycast shooter) and `BonBonEnemy` (kamikaze); screen-shake |
| [martyn-rees/asteroid-blaster](https://github.com/martyn-rees/asteroids) | TypeScript / Vite | Browser-based TS clone | Destroy rocks that split | Score, lives |
| [Margaux-dev CodePen Asteroids](https://codepen.io/Margaux-dev/pen/XWXqRYX) | HTML5 Canvas | Complete vanilla JS clone | Classic *Asteroids* | SFX/music toggles, local high score |
| [Kevin Roast — Asteroids Reloaded](https://langangen.com/astroids/) | HTML5 Canvas | Canvas demo inspired by *Asteroids* | Retro/modern toggle, bombs, shields | Bombs, shields, pause |

### itch.io / HTML5 remakes

| Game | Engine / Year | Premise | Core Loop | Fresh Ideas |
|---|---|---|---|---|
| [Asteroids (Remake) by makis2404](https://makis2404.itch.io/asteroids-remake) | Construct | Modern twist on arcade classic | Fast destruction, infinite survival | Power-ups spawn during play |
| [Asteroids: Space Storm](https://ipix13.itch.io/asteroids-space-storm) | Godot | Classic clone with leaderboard | Destroy endless asteroids, collect power-ups | Global leaderboard |
| [Asteroids++](https://almostalwaysadam.itch.io/asteroids) | HTML5/Win/Linux | Survivors-like homage | Dodge/destroy rocks, collect XP, upgrade ship | XP → ship + “game itself” upgrades |
| [Asteroids++ (Steam)](https://store.steampowered.com/app/2407300/Asteroids/) | Steam / 2024 F2P | “Save your solar system” | Travel planet-to-planet clearing randomly generated sectors | >1 M loadout combos via weapons/abilities/utilities; Steam inventory/trading |
| [Asterogue](https://goombasinastack.itch.io/asterogue) | HTML5/Win / 2025 | Roguelike arcade shooter | WASD move, arrows turn, double-tap spin/dash, collect gems, pick upgrades | 7 weapons + 15 upgrades; gems drop from rocks |
| [Asteroids:EX](https://zac-smith.itch.io/asteroidsextra) | Unity, in-dev | “Asteroids with a twist!” | Mine materials in Sector X4; 2D/3D switch on the fly | Paycheck/economy loop; **mine asteroids for materials** |
| [Asteroids Deluxe by Purple Knightmare](https://purple-knightmare.itch.io/asteroids-deluxe) | raylib/C++ | Faithful 1981 Deluxe remake | Vector-style survival | Laser, shields, thrust, hyperspace |

---

## 2. Arcade / Retro Spiritual Successors

| Game | Platform / Year | Premise | Core Loop | Weapons / Upgrades | Enemy Mechanics | Fresh Idea |
|---|---|---|---|---|---|---|
| [Stardust (1993)](https://en.wikipedia.org/wiki/Stardust_(1993_video_game)) | Amiga/ST/DOS | *Asteroids* wrapped around 5 worlds with ray-traced tunnel levels | Clear 30 levels; guardian after 6th level of each world | 6 weapons (3-way, Bouncer, Plasma, Flamer, Burster, Missiles); smart bombs, shields | Grey/yellow asteroids with durability levels; supply ships drop weapons | **Power up one weapon while using another** |
| [Super Stardust HD](https://en.wikipedia.org/wiki/Super_Stardust_HD) | PS3/PSP/PS4 / 2007 | Spherical *Asteroids* meets *Robotron* around a planet | Fly over a planet shield, switch weapons vs. rock/ice/gold waves, beat bosses | 3 color-coded weapons (Rock Crusher, Gold Melter, Ice Splitter); upgrades 0%→100%→200% | Green rocks drop weapon upgrades, shield, extra life, points, bombs | **Color-coded weapon↔asteroid weakness loop**; spherical arena |
| [Rock Boshers DX](https://tikipod.com/rockboshersdx/) | PS4/Vita/Steam/Switch / 2014–2018 | Queen Victoria escapes Martian mines in steampunk 1880s | Top-down + side-on 8-directional puzzley shooting | Basic gun, Coal Rockets, Steam Lasers; tank | Soldiers, drillers, tanks, worms, turrets, giant brains | **Unlockable “game-within-a-game” minigames** as meta reward |
| [Astro Duel](https://rusty.itch.io/astro-duel) | Steam/itch/iOS / ~2014 | Local multiplayer party shooter using *Asteroids*-style ships | Quick sudden-death rounds; move → shoot → power-up → eliminate → run over pilot | Missiles, lasers, jousters, shields; dash/ram | 13 arenas with turrets, death beams, black holes, breakable blocks, asteroids | Pilot-ejection scoring; **arena hazards as enemies** |
| [Asteroids: Recharged](https://store.steampowered.com/app/1700890/Asteroids_Recharged/) | Steam/Epic/Consoles / 2021 | Official Atari revival | Destroy drifting asteroids + UFOs, chase high scores, 30 challenges | Rapid fire, spread, rail gun, black-hole shot, reflector shield | Explosive asteroids, fractured rocks, embedded ships, mines; co-op | **Temporary power-ups from pink UFOs** create risk/reward spikes |

---

## 3. Roguelite / Build-Craft Heavy

These are the strongest reference points for a loot-driven *Asteroids* “Next Edition.”

| Game | Platform / Year | Premise | Core Loop | Build-Craft / Weapons | Progression | Fresh Idea |
|---|---|---|---|---|---|---|
| [Nova Drift](https://store.steampowered.com/app/858210/Nova_Drift/) | Steam/itch / 2024 | Distills ARPG depth into classic arcade space combat | Endless wave survival; build a ship from gear + 200+ mods | Weapons (Blaster, Lance, Swords, Grenade…), shield/body/construct gear, Super Mods | Account rank unlocks gear/mods; Daily/Challenge modes | **ARPG build-crafting inside a 5-minute arcade loop** |
| [Star Survivor](https://store.steampames.com/app/2060750/Star_Survivor/) | Steam/itch/Mobile / 2024 | “Rogue-lite + survivors + asteroids mashup” | Newtonian swarm survival; collect modules, craft builds | Deckbuilding upgrades; **4 weapon quadrants**; combos create stronger variants; 8 ships | Unlock combos, collect modules, choose ships | **Quadrant-based weapon loadout** — positional synergy matters |
| [Asteroids... But Roguelite](https://store.steampowered.com/app/1392790/Asteroids_But_Roguelite/) | Steam / 2020 | Start weak, earn money, buy upgrades, fight bosses | Survive waves → earn currency → shop upgrades → randomized bosses | 40+ unique power-ups; shop ship upgrades | Money-based in-run upgrades; quests for bonus cash | **Shop-economy loop in an Asteroids shell** |
| [Super Smash Asteroids](https://store.steampowered.com/app/2310260/Super_Smash_Asteroids/) | Steam/itch EA / 2023 | High-speed twin-stick rogue-like shooter | Pick ship → survive waves → defeat bosses → choose upgrades | 6 ships, 70+ item upgrades; Everlast permanent upgrade system | Everlast Gold unlocks persistent bonuses across runs | **Persistent Everlast bonuses plus per-run item stacking** |
| [Asteroid Blasters](https://store.steampowered.com/app/1596990/Asteroid_Blasters/) | Steam / 2021 | Defend Earth from an asteroid storm | Blast rocks, avoid debris, unlock ships | 6 unlockable ships; weapon power-ups | Unlock ships, leaderboards, 36 achievements, local co-op | Local co-op + ship specialization |
| [Aliens & Asteroids](https://store.steampowered.com/app/661030/AliensAsteroids/) | Steam / 2018 | Arcade shoot ’em up inspired by *Asteroids* | Survive endless aliens and bosses; collect pickups | Unlockable power-ups, use-items, screen-clear abilities | 5 enemy types + elites, 4 bosses | Elite enemy variants and unlockable screen-clear abilities |
| [Asteroids Neon](https://store.steampowered.com/app/2656400/Asteroids_Neon/) | Steam / 2024 | Neon-soaked reimagining | Destroy rocks/UFOs, collect power-ups | Magnet, singularity, destructive beam | 21 achievements | Singularity power-up + full color customization |

---

## 4. Loot / RPG / Fleet Expansion

These are heavier than our starting concept but show where a loot economy can scale.

| Game | Platform / Year | Premise | Core Loop | Economy / Crafting | Fresh Idea |
|---|---|---|---|---|---|
| [Space Pirates and Zombies (SPAZ)](https://store.steampowered.com/app/107200/Space_Pirates_and_Zombies/) | Steam / 2011 | Top-down fleet combat in persistent randomly generated galaxy | Explore, complete missions, fight factions and zombies | 15 research categories, 70+ components; Data (“research points”) unlocks tech tree | **Research-point economy + zombie ecosystem** |
| [Void Bastards](https://store.steampowered.com/app/857980/Void_Bastards/) | Steam / 2019 | Lead prisoners through derelict ships | Tactics map → FPS boarding → scavenging → crafting | Workbench skill-tree crafting; upgrades persist across prisoner deaths | **Persistent crafting skill tree where death only resets consumables** |
| [Everspace](https://everspace.fandom.com/wiki/Perks) | Steam / 2017 | Roguelite space looter with narrative | Procedurally generated sectors; mine, fight, craft, jump | 183 blueprints; perks + blueprint unlocks persist; resources lost on death | **Persistent perks + blueprint unlocks** |
| [Ring Runner](https://store.steampowered.com/app/258010/) | Steam / 2013 | Top-down action-RPG space shooter | Missions + procedural challenges; build the right ship | 60 hulls, 400+ equipment nodes across 6 archetypes | **Deep modular ship-building** (hull + equipment nodes) |
| [Stardust Origins](https://store.steampowered.com/app/816850/Stardust_Origins/) | Steam / 2022 | Story-driven 2D top-down space adventure + mining management | Trade, explore, quest, mine, fight | Buy ships/upgrades, manage mines, trade stocks | **Mining-management layer** on top of Asteroids-style travel |
| [Space Pioneer](https://apps.apple.com/za/app/space-pioneer/id1204790625) | iOS/Android / 2018 | Fast top-down alien shooter | Survive alien hordes, loot, upgrade gear | Machine gun, shotgun, flamethrower, turrets, rifles, mines | Horde-shooter loot loop wrapped in space theme |

---

## 5. Design Pattern Synthesis

| Category | Common Patterns | Best Examples |
|---|---|---|
| **Core Loop** | Endless survival + score; arena duel; run-based roguelite; sector exploration + mining/trading | *Asteroids Recharged*, *Nova Drift*, *Star Survivor*, *SPAZ*, *Stardust Origins* |
| **Weapons** | Single laser → color/element weapons → modular gear + mods → deckbuilding/quadrants → persistent blueprint unlocks | *Super Stardust HD*, *Nova Drift*, *Star Survivor*, *Everspace* |
| **Ship Upgrades** | Temporary pickups → per-run XP/shop upgrades → persistent meta-perks → modular hull/equipment nodes | *Nova Drift*, *Super Smash Asteroids*, *Ring Runner* |
| **Asteroid Drops** | Score only → weapon upgrades / shields / lives → XP/resources/currency → mining materials/loot | *Super Stardust HD*, *Asteroids++*, *Star Survivor*, *Stardust Origins* |
| **Enemy Variety** | Rocks + UFOs → colored asteroid types → factions/elites/bosses → zombie ecosystems/swarm formations | *SPAZ*, *Nova Drift*, *Aliens & Asteroids* |
| **Progression / Meta** | Local high score → achievements/leaderboards → unlock points/blueprints → crafting skill trees → research trees/fleet customization | *Asteroids++*, *Nova Drift*, *Void Bastards*, *SPAZ*, *Everspace* |

---

## 6. Fresh Ideas Worth Borrowing

1. **Color/Element Weapon↔Asteroid Matching** — *Super Stardust HD* proves tactical switching without bloating controls.
2. **ARPG Build Crafting in Short Runs** — *Nova Drift* shows 200+ modular upgrades can make each run unique while staying true to thrust/rotate shooting.
3. **Asteroids That Drop More Than Points** — *Super Stardust HD* and *Recharged* use drops for weapon XP, shields, bombs, temporary power-ups.
4. **Quadrant/Positional Loadouts** — *Star Survivor* proves where a weapon fires can be as interesting as what it fires.
5. **Mining + Crafting Layer on Top of Combat** — *Stardust Origins* and *Asteroids:EX* add asteroid mining and ship-loadout logistics.
6. **Persistent Meta That Survives Death** — *Void Bastards* and *Everspace* give players a reason to keep playing after a bad run.
7. **Unlockable Minigames as Meta Rewards** — *Rock Boshers DX* rewards collectible hunts with retro mini-games.
8. **Arena Hazards as Enemies** — *Astro Duel* replaces endless rocks with turrets, black holes, breakable blocks.
9. **Temporary Power-Ups from UFOs** — *Asteroids: Recharged* creates risk/reward spikes.
10. **Research / Tech Trees** — *SPAZ* gives long-term goals and fleet variety.
11. **Spherical/Arena Wrapping Playfields** — *Super Stardust HD* and the original’s screen wrap are underused in browser clones.
12. **Single-Ship vs. Fleet Customization** — *Ring Runner* shows deep pre-mission loadouts without real-time leveling.

---

## Sources

- jhamon/asteroids.js: http://www.hamon.io/asteroids.js/ — GitHub: https://github.com/jhamon/asteroids.js
- pmarreck/vibesteroids: https://pmarreck.github.io/vibesteroids/ — GitHub: https://github.com/pmarreck/vibesteroids
- Haseeb-Qureshi/Asteroids: http://haseeb-qureshi.github.io/Asteroids/ — GitHub: https://github.com/Haseeb-Qureshi/Asteroids
- kindohm/space-janitor: https://github.com/kindohm/space-janitor
- krupitskas/whats-going-on-here-asteroids: https://github.com/krupitskas/whats-going-on-here-asteroids
- martyn-rees/asteroid-blaster: https://github.com/martyn-rees/asteroids
- Margaux-dev CodePen: https://codepen.io/Margaux-dev/pen/XWXqRYX
- Kevin Roast — Asteroids Reloaded: https://langangen.com/astroids/
- itch.io remakes: makis2404, ipix13, almostalwaysadam, goombasinastack, zac-smith, purple-knightmare
- Stardust: https://en.wikipedia.org/wiki/Stardust_(1993_video_game)
- Super Stardust HD: https://en.wikipedia.org/wiki/Super_Stardust_HD
- Rock Boshers DX: https://tikipod.com/rockboshersdx/
- Astro Duel: https://rusty.itch.io/astro-duel
- Nova Drift: https://store.steampowered.com/app/858210/Nova_Drift/
- Star Survivor: https://store.steampowered.com/app/2060750/Star_Survivor/
- Asteroids... But Roguelite: https://store.steampowered.com/app/1392790/Asteroids_But_Roguelite/
- Super Smash Asteroids: https://store.steampowered.com/app/2310260/Super_Smash_Asteroids/
- Asteroid Blasters: https://store.steampowered.com/app/1596990/Asteroid_Blasters/
- Aliens & Asteroids: https://store.steampowered.com/app/661030/AliensAsteroids/
- Asteroids Neon: https://store.steampowered.com/app/2656400/Asteroids_Neon/
- Space Pirates and Zombies: https://store.steampowered.com/app/107200/Space_Pirates_and_Zombies/
- Void Bastards: https://store.steampowered.com/app/857980/Void_Bastards/
- Everspace Wiki: https://everspace.fandom.com/wiki/Perks
- Ring Runner: https://store.steampowered.com/app/258010/
- Stardust Origins: https://store.steampowered.com/app/816850/Stardust_Origins/
