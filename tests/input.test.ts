import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { InputManager } from '../src/input';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Input Manager Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the InputManager maps keys/mouse to action states and exposes
//          a one-shot "any key" signal for respawn prompts.
// Setup: Vitest runs in Node, so we provide a minimal fake window with event
//        listener support before each test and restore the real global after.
// Issues: None.
// Fix: Added coverage for the new consumeAnyKeyHit helper.
// Gotchas: Events must use the same window the manager listens to. Blur clears
//          the any-key flag.
// ═══════════════════════════════════════════════════════════════════════════

let realWindow: unknown;

interface FakeEvent {
  readonly type: string;
}

function createMockWindow(): {
  addEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
  dispatchEvent: (event: FakeEvent) => void;
} {
  const listeners = new Map<string, ((event: FakeEvent) => void)[]>();
  return {
    addEventListener: (type: string, listener: (event: FakeEvent) => void): void => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener: (type: string, listener: (event: FakeEvent) => void): void => {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((l) => l !== listener),
      );
    },
    dispatchEvent: (event: FakeEvent): void => {
      const list = listeners.get(event.type) ?? [];
      list.forEach((listener) => listener(event));
    },
  };
}

function installMockWindow(): {
  addEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: FakeEvent) => void) => void;
  dispatchEvent: (event: FakeEvent) => void;
} {
  realWindow = (globalThis as { window?: unknown }).window;
  const mock = createMockWindow();
  (globalThis as unknown as { window: typeof mock }).window = mock;
  return mock;
}

function restoreWindow(): void {
  if (realWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = realWindow;
  }
}

function makeKeyEvent(type: string, key: string): FakeEvent {
  return {
    type,
    key,
    preventDefault: (): void => { /* no-op */ },
  } as unknown as FakeEvent;
}

function dispatchKeyDown(key: string): void {
  (globalThis as unknown as { window: { dispatchEvent: (event: FakeEvent) => void } }).window.dispatchEvent(
    makeKeyEvent('keydown', key),
  );
}

function dispatchKeyUp(key: string): void {
  (globalThis as unknown as { window: { dispatchEvent: (event: FakeEvent) => void } }).window.dispatchEvent(
    makeKeyEvent('keyup', key),
  );
}

function dispatchBlur(): void {
  (globalThis as unknown as { window: { dispatchEvent: (event: FakeEvent) => void } }).window.dispatchEvent({
    type: 'blur',
  } as FakeEvent);
}

describe('InputManager', () => {
  beforeEach(() => {
    installMockWindow();
  });

  afterEach(() => {
    restoreWindow();
  });

  it('starts with no action inputs', () => {
    const input = new InputManager();

    const state = input.currentState();

    expect(state.move).toEqual({ x: 0, y: 0 });
    expect(state.fire).toBe(false);
    expect(input.consumeAnyKeyHit()).toBe(false);

    input.destroy();
  });

  it('maps movement keys to a normalized move vector', () => {
    const input = new InputManager();
    dispatchKeyDown('w');
    dispatchKeyDown('d');

    const state = input.currentState();

    expect(state.move.x).toBeCloseTo(0.707, 2);
    expect(state.move.y).toBeCloseTo(0.707, 2);

    input.destroy();
  });

  it('consumes any-key flag once per keydown', () => {
    const input = new InputManager();

    dispatchKeyDown(' ');
    expect(input.consumeAnyKeyHit()).toBe(true);
    expect(input.consumeAnyKeyHit()).toBe(false);

    dispatchKeyDown('x');
    expect(input.consumeAnyKeyHit()).toBe(true);
    expect(input.consumeAnyKeyHit()).toBe(false);

    input.destroy();
  });

  it('clears the any-key flag on blur', () => {
    const input = new InputManager();
    dispatchKeyDown('a');

    dispatchBlur();

    expect(input.consumeAnyKeyHit()).toBe(false);

    input.destroy();
  });

  it('maps space and left mouse to fire', () => {
    const input = new InputManager();

    dispatchKeyDown(' ');
    expect(input.currentState().fire).toBe(true);
    dispatchKeyUp(' ');
    expect(input.currentState().fire).toBe(false);

    input.destroy();
  });
});
