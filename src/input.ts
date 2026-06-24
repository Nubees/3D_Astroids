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
}

export class InputManager {
  private readonly keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private leftMouseDown = false;
  private anyKeyHit = false;
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
        event.code === 'Digit3'
      ) {
        event.preventDefault();
      }
      this.keys.add(key);
      // Also track the raw code for digit-row keys (KeyboardEvent.key is
      // locale-dependent, event.code is layout-independent).
      if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
        this.keys.add(event.code);
      }
      this.anyKeyHit = true;
    };

    this.onKeyUp = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
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

    return {
      move,
      aim: { x: this.mouseX, y: this.mouseY },
      fire: this.keys.has(' ') || this.leftMouseDown,
      deployBreather: this.keys.has('x'),
      useActive1: this.keys.has('Digit1'),
      useActive2: this.keys.has('Digit2'),
      useActive3: this.keys.has('Digit3'),
    };
  }

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
