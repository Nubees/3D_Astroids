import { Vector2, InputState } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Input Manager
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Map raw keyboard and mouse events to stable game action states.
// Setup: Created once by Game; reads window events and exposes currentState().
// Issues: Without blur handling, held keys can stick when the tab loses focus.
// Fix: Track pressed keys in a Set; clear all keys on window blur.
// Gotchas: preventDefault on movement/fire keys stops page scrolling. Mouse aim
//          is stored as a screen-space point; Game converts it to world space.
//          Tab toggles movement mode and must be edge-detected, not held.
// ═══════════════════════════════════════════════════════════════════════════

const MOVEMENT_KEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

export class InputManager {
  private readonly keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private firing = false;
  private modeTogglePending = false;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onMouseMove: (event: MouseEvent) => void;
  private readonly onMouseDown: () => void;
  private readonly onMouseUp: () => void;
  private readonly onBlur: () => void;

  constructor() {
    this.onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (MOVEMENT_KEYS.has(key)) {
        event.preventDefault();
      }
      if (key === ' ') {
        event.preventDefault();
        this.firing = true;
      }
      if (key === 'tab') {
        event.preventDefault();
        this.modeTogglePending = true;
      }
      this.keys.add(key);
    };

    this.onKeyUp = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === ' ') {
        this.firing = false;
      }
      this.keys.delete(key);
    };

    this.onMouseMove = (event: MouseEvent): void => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    };

    this.onMouseDown = (): void => {
      this.firing = true;
    };

    this.onMouseUp = (): void => {
      this.firing = false;
    };

    this.onBlur = (): void => {
      this.keys.clear();
      this.firing = false;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
  }

  currentState(): InputState {
    let x = 0;
    let y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;

    const length = Math.hypot(x, y);
    const move = length > 0
      ? { x: x / length, y: y / length }
      : { x: 0, y: 0 };

    const state: InputState = {
      move,
      aim: { x: this.mouseX, y: this.mouseY },
      fire: this.firing,
      toggleMode: this.modeTogglePending,
    };
    this.modeTogglePending = false;
    return state;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
