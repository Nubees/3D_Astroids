# Plan — Respawn Screen Clear + "Press a Key to Resume" Countdown

## Goal
When the ship dies and respawns, give the player a clean slate and a moment to
recover: clear all threats from the screen, show "Press a Key to resume", then
count down `3`, `2`, `1` before gameplay resumes.

## Rules
1. On shield-depleting death, the existing explosion still plays.
2. When the ship actually respawns, **clear** all asteroids, projectiles, and scrap.
3. After the 1.0s explosion delay, show `"Press a Key to resume"` and wait for any
   keyboard press.
4. On key press, hide the prompt and start a **3-second countdown** (`3`, `2`, `1`).
5. After the countdown reaches `0`, restore the ship with full shield and resume
   normal gameplay (asteroids begin spawning again).
6. During the press-key and countdown phases, the ship is hidden, the player cannot
   move or fire, and no new asteroids/projectiles spawn.

## Approach

### 1. Input manager (`src/input.ts`)
- Track a transient `anyKeyHit` flag that is set on every `keydown` event.
- Add `consumeAnyKeyHit(): boolean` that returns the flag and clears it.
- This gives the game a one-shot "any key was pressed" signal without binding a
  specific action key.

### 2. Game state (`src/game.ts`)
- Add a `respawnPhase` field with values `'none' | 'exploding' | 'pressKey' | 'countdown'`.
- Add `countdownTimer` and a DOM `resumeElement` for the prompt/countdown text.
- Replace the simple `shipRespawnDelay > 0` early-return with a
  `respawnPhase !== 'none'` guard that runs a new `updateRespawn(deltaTime, input)`
  path.

### 3. Threat clear
- In `respawnShip()`, after disposing projectiles, iterate `this.asteroids` and
  `this.scrap` and dispose their meshes, then clear both arrays.
- This guarantees the respawn starts with an empty arena.

### 4. Phase flow in `updateRespawn()`
- **exploding**: run the existing 1.0s delay; update particles/HUD. When the timer
  expires, switch to `pressKey` and show `"Press a Key to resume"`.
- **pressKey**: update particles/HUD; if `input.consumeAnyKeyHit()` is true, hide
  the prompt, switch to `countdown`, and set `countdownTimer = 3.0`.
- **countdown**: update particles/HUD; decrement `countdownTimer`; display
  `Math.ceil(countdownTimer)` as large centered text. When the timer reaches `0`,
  hide the text, call `finishRespawn()`, and set `respawnPhase = 'none'`.

### 5. HUD styling
- `resumeElement` is absolutely centered, large white monospace text with a black
  text shadow, rendered above everything else.
- It doubles as the countdown display to avoid two overlapping elements.

### 6. Cleanup
- `stop()` must remove `resumeElement` if present.

### 7. Tests
- Add `tests/input.test.ts` to verify `consumeAnyKeyHit()` returns true once after
  a keydown and then false until another keydown.
- Update `tests/ship.test.ts` if respawn helpers change (they shouldn't).

## Risks
- If `consumeAnyKeyHit` is not cleared properly, a stray keydown could skip the
  prompt. We clear it on read.
- The player might press a key *during* the explosion; we ignore until the
  `pressKey` phase begins.
- Countdown text should be readable and not conflict with the score HUD; center it
  and make it larger.

---

## Status: Completed (2026-06-22)

Closed by user sign-off. Verified against current source:

- `src/input.ts` — `anyKeyHit` flag set on every `keydown`; `consumeAnyKeyHit(): boolean` returns the flag and clears it on read.
- `src/game.ts` — `respawnPhase: 'none' | 'exploding' | 'pressKey' | 'countdown'` state machine drives `updateRespawn()`; `countdownTimer` decremented each frame; `respawnShip()` clears asteroids, projectiles, and scrap before the press-key phase begins.
- HUD — `resumeElement` centered large white monospace text doubles as both the "Press a Key to resume" prompt and the 3-2-1 countdown display; removed by `stop()`.
- `tests/input.test.ts` — verifies `consumeAnyKeyHit()` is one-shot.

Verification: `npm run typecheck` ✅, `npm test` ✅, `npm run build` ✅.
