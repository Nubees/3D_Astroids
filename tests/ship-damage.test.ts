import { describe, expect, it } from 'vitest';
import {
  createDamageParticle,
  createExplosionParticle,
  createSparkArc,
  disposeAllDamageParticles,
  disposeAllExplosionParticles,
  disposeAllSparkArcs,
  randomHullPoint,
  updateDamageParticles,
  updateExplosionParticles,
  updateSparkArcs,
} from '../src/ship-damage';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Damage Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify explosion, debris particle, and spark arc lifecycle math.
// Setup: Create particles, advance time, assert cleanup.
// ═══════════════════════════════════════════════════════════════════════════

describe('ship-damage', () => {
  it('creates an explosion particle at the given position', () => {
    const particle = createExplosionParticle({ x: 1, y: 2 });
    expect(particle.mesh.position.x).toBeCloseTo(1);
    expect(particle.mesh.position.y).toBeCloseTo(2);
    expect(particle.duration).toBeGreaterThan(0);
    expect(particle.age).toBe(0);
  });

  it('updates explosion particles until they expire', () => {
    const particle = createExplosionParticle({ x: 0, y: 0 });
    particle.duration = 0.2;
    const aliveAfterStart = updateExplosionParticles([particle], 0.05);
    expect(aliveAfterStart.length).toBe(1);

    const aliveAfterExpiry = updateExplosionParticles([particle], 0.25);
    expect(aliveAfterExpiry.length).toBe(0);
  });

  it('disposes all explosion particles', () => {
    const a = createExplosionParticle({ x: 0, y: 0 });
    const b = createExplosionParticle({ x: 1, y: 1 });
    expect(() => disposeAllExplosionParticles([a, b])).not.toThrow();
  });

  it('creates a damage particle with finite duration', () => {
    const particle = createDamageParticle({ x: 1, y: 2 });
    expect(particle.mesh.position.x).toBeCloseTo(1);
    expect(particle.mesh.position.y).toBeCloseTo(2);
    expect(particle.duration).toBeGreaterThan(0);
    expect(particle.age).toBe(0);
  });

  it('updates damage particles until they expire', () => {
    const particle = createDamageParticle({ x: 0, y: 0 });
    particle.duration = 0.2;
    const aliveAfterStart = updateDamageParticles([particle], 0.05);
    expect(aliveAfterStart.length).toBe(1);

    const aliveAfterExpiry = updateDamageParticles([particle], 0.25);
    expect(aliveAfterExpiry.length).toBe(0);
  });

  it('disposes all damage particles', () => {
    const a = createDamageParticle({ x: 0, y: 0 });
    const b = createDamageParticle({ x: 1, y: 1 });
    expect(() => disposeAllDamageParticles([a, b])).not.toThrow();
  });

  it('creates a spark arc with a line geometry', () => {
    const arc = createSparkArc({ x: 0, y: 0, z: 0 }, 0.5);
    // 6 line segments * 2 vertices = 12 vertices.
    expect(arc.mesh.geometry.attributes.position.count).toBe(12);
    expect(arc.duration).toBeGreaterThan(0);
  });

  it('updates spark arcs until they expire', () => {
    const arc = createSparkArc({ x: 0, y: 0, z: 0 }, 0.5);
    arc.duration = 0.1;
    const aliveAfterStart = updateSparkArcs([arc], 0.05);
    expect(aliveAfterStart.length).toBe(1);

    const aliveAfterExpiry = updateSparkArcs([arc], 0.1);
    expect(aliveAfterExpiry.length).toBe(0);
  });

  it('disposes all spark arcs', () => {
    const a = createSparkArc({ x: 0, y: 0, z: 0 }, 0.5);
    const b = createSparkArc({ x: 1, y: 1, z: 0 }, 0.5);
    expect(() => disposeAllSparkArcs([a, b])).not.toThrow();
  });

  it('produces hull points near the ship body', () => {
    for (let i = 0; i < 20; i += 1) {
      const p = randomHullPoint();
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.6);
    }
  });
});
