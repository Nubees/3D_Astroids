import { Mesh } from 'three';
import { Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Input Manager
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Map raw keyboard and mouse events to stable game action states.
// Setup: Created once by Game; reads window events and exposes currentState().
// Issues: Without blur handling, held keys can stick when the tab loses focus.
// Fix: Track pressed keys in a Set; clear all keys on window blur.
// Gotchas: preventDefault on movement/fire/deploy keys stops page scrolling.
//          Mouse aim is stored as a screen-space point; Game converts it to world
//          space. Shield is now passive; C / RMB are reserved for a future EMP
//          pulse ability and are intentionally not mapped yet.
//
// Phase 7f: Added useMagnetBooster: boolean bound to Digit4 for the Magnet
// Booster pickup active ability. Uses event.code === 'Digit4' so it works on
// AZERTY / QWERTZ / Dvorak. Lives on the 4th active slot (counting from 1).
//
// Phase 7i-2 (Task 8) — InputState gains 5 charge-up fields for the Digit2
// hold-to-charge path. Edge detection for Digit2 lives on InputManager as
// digit2JustPressed() / digit2JustReleased() — currentState() only returns
// the live boolean, so the per-frame "press this frame" / "release this
// frame" signal is computed by sampling on consecutive currentState() calls.
// On blur the prevUseActive2 latch resets so a held Digit2 doesn't fire a
// phantom release on the next frame after the tab regains focus.
//
// Phase 7i-2 (Task 11) — DELTA CRITICAL: the previous single-latch
// `prevDigit2` design was racy. game.ts:989 calls JustPressed BEFORE
// JustReleased (line 1027) in the same update tick, so on the keyup-
// edge tick JustPressed clobbered the latch to false and JustReleased
// then saw isDown=false, prev=false → returned FALSE → useActiveItem
// never fired. ALL THREE Digit2 active pickups (BOMB_STRIKE +
// ORBIT_DRONES + HOMING_MISSILES) silently no-op'd in production. Fix:
// split into `prevDigit2Pressed` + `prevDigit2Released` so each method
// reads + writes its own edge. The press edge can no longer clobber
// the release edge's latch. Verified: keyup frame now returns
// isDown=false, wasDown=true → !false && true=true → useActiveItem
// fires. No new require('three') inline — fix is a 2-field rename.
// ═══════════════════════════════════════════════════════════════════════════

const MOVEMENT_KEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

export interface InputState {
  readonly move: Vector2;
  readonly aim: Vector2;
  readonly fire: boolean;
  readonly deployBreather: boolean;
  readonly useActive1: boolean;   // bound to '1' (Digit1)
  readonly useActive2: boolean;   // bound to '2' (Digit2)
  readonly useActive3: boolean;   // bound to '3' (Digit3)
  readonly useMagnetBooster: boolean;  // bound to '4' (Digit4, Phase 7f)
  // Phase 7i-2 (Task 8) — Digit2 charge-up hold. The press/release/hold
  // states are owned by InputState (not a per-deployment resource) so a
  // single charge-up ring can render while held and a single flag flips
  // to true once the press has been held for the threshold. Fields are
  // mutable because Game mutates them per frame.
  useActive2PressTime: number | null;        // wall-clock seconds when Digit2 was pressed; null when not pressed
  useActive2ChargeUpRing: Mesh | null;       // ring rendered while charging; disposed on release
  useActive2ChargeUpTier: 1 | 2 | 3 | null;  // pre-decrement tier captured at press time
  useActive2ChargeUpStart: number | null;    // wall-clock seconds when the press started (mirror of pressTime)
  useActive2IsChargeUp: boolean;             // set true if held past ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS
}

export class InputManager {
  private readonly keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private leftMouseDown = false;
  private anyKeyHit = false;
  // Phase 7i-2 (Task 8) — Digit2 edge latches. currentState() only
  // returns the live boolean; the press/release transitions are computed
  // by sampling on consecutive currentState() calls. digit2JustPressed()
  // and digit2JustReleased() each advance their OWN latch so the same
  // edge is never reported twice.
  //
  // Phase 7i-2 (Task 11) — DELTA CRITICAL: the original implementation
  // shared a single `prevDigit2` field between JustPressed and
  // JustReleased. src/game.ts:989 calls JustPressed BEFORE JustReleased
  // (line 1027) in the same update tick, so on the keyup-edge tick
  // JustPressed saw isDown=false, prevDigit2=true, returned false and
  // CLOBBERED the latch to false — then JustReleased saw
  // isDown=false, prev=false (just clobbered), returned FALSE →
  // useActiveItem never fired. All three Digit2 active pickups
  // (BOMB_STRIKE + ORBIT_DRONES + HOMING_MISSILES) silently no-op'd in
  // production. Splitting into two fields means the press edge cannot
  // clobber the release edge's latch. Reset on blur so a held Digit2
  // doesn't fire a phantom release on the next frame after the tab
  // regains focus.
  private prevDigit2Pressed = false;
  private prevDigit2Released = false;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onMouseMove: (event: MouseEvent) => void;
  private readonly onMouseDown: (event: MouseEvent) => void;
  private readonly onMouseUp: (event: MouseEvent) => void;
  private readonly onBlur: () => void;
  private readonly onContextMenu: (event: MouseEvent) => void;

  constructor() {
    this.onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (
        MOVEMENT_KEYS.has(key) ||
        key === ' ' ||
        key === 'x' ||
        event.code === 'Digit1' ||
        event.code === 'Digit2' ||
        event.code === 'Digit3' ||
        event.code === 'Digit4'
      ) {
        event.preventDefault();
      }
      this.keys.add(key);
      // Also track the raw code for digit-row keys (KeyboardEvent.key is
      // locale-dependent, event.code is layout-independent).
      if (
        event.code === 'Digit1' ||
        event.code === 'Digit2' ||
        event.code === 'Digit3' ||
        event.code === 'Digit4'
      ) {
        this.keys.add(event.code);
      }
      this.anyKeyHit = true;
    };

    this.onKeyUp = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (
        event.code === 'Digit1' ||
        event.code === 'Digit2' ||
        event.code === 'Digit3' ||
        event.code === 'Digit4'
      ) {
        this.keys.delete(event.code);
      }
    };

    this.onMouseMove = (event: MouseEvent): void => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    };

    this.onMouseDown = (event: MouseEvent): void => {
      if (event.button === 0) {
        this.leftMouseDown = true;
      } else if (event.button === 2) {
        event.preventDefault();
      }
    };

    this.onMouseUp = (event: MouseEvent): void => {
      if (event.button === 0) {
        this.leftMouseDown = false;
      }
    };

    this.onBlur = (): void => {
      this.keys.clear();
      this.leftMouseDown = false;
      this.anyKeyHit = false;
      // Phase 7i-2 (Task 8) — reset Digit2 charge-up state on blur so
      // a held Digit2 doesn't fire a phantom release on the next frame
      // after the tab regains focus. The ring is also nulled (but NOT
      // removed from the scene — Game.stop() handles dispose) because
      // the InputManager has no scene reference.
      // Phase 7i-2 (Task 11) — reset BOTH press + release latches.
      this.prevDigit2Pressed = false;
      this.prevDigit2Released = false;
      this.digit2ChargeUp.pressTime = null;
      this.digit2ChargeUp.tier = null;
      this.digit2ChargeUp.start = null;
      this.digit2ChargeUp.isChargeUp = false;
    };

    this.onContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  currentState(): InputState {
    let x = 0;
    let y = 0;
    // Arena world-space movement: +Y is up, -Y is down.
    if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;

    const length = Math.hypot(x, y);
    const move = length > 0
      ? { x: x / length, y: y / length }
      : { x: 0, y: 0 };

    // Phase 7i-2 (Task 8) — Digit2 charge-up fields. The Game mutates
    // this.digit2ChargeUp in place each frame (set press time on press,
    // dispose ring on release, etc.) and we read the current values into
    // the InputState snapshot here. Edge detection is exposed separately
    // via digit2JustPressed() / digit2JustReleased() so a single frame's
    // transition is reported exactly once.
    const cu = this.digit2ChargeUp;

    return {
      move,
      aim: { x: this.mouseX, y: this.mouseY },
      fire: this.keys.has(' ') || this.leftMouseDown,
      deployBreather: this.keys.has('x'),
      useActive1: this.keys.has('Digit1'),
      useActive2: this.keys.has('Digit2'),
      useActive3: this.keys.has('Digit3'),
      useMagnetBooster: this.keys.has('Digit4'),
      useActive2PressTime: cu.pressTime,
      useActive2ChargeUpRing: cu.ring,
      useActive2ChargeUpTier: cu.tier,
      useActive2ChargeUpStart: cu.start,
      useActive2IsChargeUp: cu.isChargeUp,
    };
  }

  /**
   * Returns true once per Digit2 keydown event, then advances the
   * press latch so a held key is only reported as "just pressed" on
   * the first frame of the press. The Game uses this to spawn the
   * charge-up ring on press. Reset to false on blur.
   *
   * Phase 7i-2 (Task 11) — reads + writes prevDigit2Pressed ONLY
   * (split from the release latch). See the My Rules DELTA CRITICAL
   * above for the race this fixes.
   */
  digit2JustPressed(): boolean {
    const isDown = this.keys.has('Digit2');
    const wasDown = this.prevDigit2Pressed;
    this.prevDigit2Pressed = isDown;
    return isDown && !wasDown;
  }

  /**
   * Returns true once per Digit2 keyup event, then advances the
   * release latch so a released key is only reported as "just
   * released" on the first frame after the release. The Game uses
   * this to dispose the charge-up ring and fire useActiveItem.
   *
   * Phase 7i-2 (Task 11) — reads + writes prevDigit2Released ONLY
   * (split from the press latch). See the My Rules DELTA CRITICAL
   * above for the race this fixes.
   */
  digit2JustReleased(): boolean {
    const isDown = this.keys.has('Digit2');
    const wasDown = this.prevDigit2Released;
    this.prevDigit2Released = isDown;
    return !isDown && wasDown;
  }

  /**
   * Phase 7i-2 (Task 8) — Digit2 charge-up state. Mutated by Game.update()
   * on the press/release/hold transitions and read into InputState by
   * currentState(). Public so the Game can write through it without a
   * separate setter for each field.
   */
  readonly digit2ChargeUp: {
    pressTime: number | null;
    ring: Mesh | null;
    tier: 1 | 2 | 3 | null;
    start: number | null;
    isChargeUp: boolean;
  } = {
    pressTime: null,
    ring: null,
    tier: null,
    start: null,
    isChargeUp: false,
  };

  /**
   * Returns true once per keydown event, then clears the flag. Useful for
   * "press any key to continue" prompts.
   */
  consumeAnyKeyHit(): boolean {
    const hit = this.anyKeyHit;
    this.anyKeyHit = false;
    return hit;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.onContextMenu);
  }
}
