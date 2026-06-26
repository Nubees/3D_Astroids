import { beforeEach, describe, expect, it } from 'vitest';
import {
  createScrap,
  magnetPull,
} from '../src/scrap';
import { ScrapState } from '../src/types';

const BASELINE = 2.5; // matches src/scrap.ts export

describe('magnetPull with effectiveRadius (Phase 7f)', () => {
  let scrap: ScrapState;

  beforeEach(() => {
    // Scrap at (3, 0), ship at origin → distance 3
    scrap = createScrap({ x: 3, y: 0 });
    scrap.velocity = { x: 0, y: 0 }; // reset the default downward drift
  });

  it('does not pull scrap outside effectiveRadius', () => {
    // Ship at origin, effectiveRadius = 2.5 → distance 3 > 2.5 → no pull
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, BASELINE);
    expect(scrap.velocity.x).toBe(0);
    expect(scrap.velocity.y).toBe(0);
  });

  it('pulls scrap inside effectiveRadius when boosted to 2x', () => {
    // Ship at origin, effectiveRadius = 5.0 → distance 3 < 5.0 → pull
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    expect(scrap.velocity.x).toBeLessThan(0); // pulled toward ship (negative x)
    expect(scrap.velocity.y).toBe(0);
  });

  it('pulls scrap inside effectiveRadius when boosted to 3x', () => {
    // Scrap at (7, 0) — outside baseline but inside 3x
    scrap.position = { x: 7, y: 0 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 7.5);
    expect(scrap.velocity.x).toBeLessThan(0);
  });

  it('does not pull scrap outside boosted radius (3x edge case)', () => {
    // Scrap at (8, 0) — outside 3x radius of 7.5
    scrap.position = { x: 8, y: 0 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 7.5);
    expect(scrap.velocity.x).toBe(0);
  });

  it('pull strength falls off: scrap near outer edge moves slower than scrap near center', () => {
    // Scrap at (1, 0) — distance 1, inside boosted radius 5.0
    // pullStrength = (5.0 - 1) / 5.0 = 0.8
    // speed = 12.0 * 0.8 = 9.6
    const innerScrap = createScrap({ x: 1, y: 0 });
    magnetPull(innerScrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    const innerSpeed = Math.hypot(innerScrap.velocity.x, innerScrap.velocity.y);

    // Scrap at (4, 0) — distance 4, inside boosted radius 5.0
    // pullStrength = (5.0 - 4) / 5.0 = 0.2
    // speed = 12.0 * 0.2 = 2.4
    const outerScrap = createScrap({ x: 4, y: 0 });
    magnetPull(outerScrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    const outerSpeed = Math.hypot(outerScrap.velocity.x, outerScrap.velocity.y);

    expect(innerSpeed).toBeGreaterThan(outerSpeed);
    expect(innerSpeed).toBeCloseTo(9.6, 1);
    expect(outerSpeed).toBeCloseTo(2.4, 1);
  });

  it('does not modify scrap velocity when distance <= 0.01', () => {
    // Scrap at origin, ship at origin → distance 0 (effectively)
    scrap.position = { x: 0, y: 0 };
    scrap.velocity = { x: 1, y: 1 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    expect(scrap.velocity.x).toBe(1);
    expect(scrap.velocity.y).toBe(1);
  });

  it('preserves scrap velocity when effectiveRadius == baseline (no boost)', () => {
    // Scrap at (1.5, 0) — inside baseline 2.5
    scrap.position = { x: 1.5, y: 0 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, BASELINE);
    expect(scrap.velocity.x).toBeLessThan(0); // pulled normally
  });
});