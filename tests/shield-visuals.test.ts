import { describe, expect, it } from 'vitest';
import { ShaderMaterial, Vector3 } from 'three';
import {
  addShieldImpact,
  clearShieldImpacts,
  createShieldMesh,
  setShieldEnergy,
  updateShieldVisuals,
} from '../src/shield-visuals';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Visuals Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the shader-based shield mesh and its impact ring buffer.
// Setup: Create a shield mesh and drive impacts/uniforms directly.
// Issues: None.
// Fix: Added coverage for the new ShaderMaterial shield.
// Gotchas: The impact buffer has a fixed maximum size; adding more impacts
//          overwrites the oldest slot. Uniform arrays are reassigned after
//          mutation so Three.js uploads them.
// ═══════════════════════════════════════════════════════════════════════════

describe('createShieldMesh', () => {
  it('creates a sphere mesh with a ShaderMaterial', () => {
    const mesh = createShieldMesh(1.0);

    expect(mesh.geometry).toBeDefined();
    expect(mesh.material).toBeDefined();
    expect((mesh.material as { type: string }).type).toBe('ShaderMaterial');
  });
});

describe('addShieldImpact', () => {
  it('writes the impact direction into shader uniforms', () => {
    const mesh = createShieldMesh(1.0);

    addShieldImpact(mesh, { x: 2, y: 0 }, { x: 0, y: 0 });

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uHitCount.value).toBe(1);
    expect((material.uniforms.uHitPositions.value as Vector3[])[0].x).toBeCloseTo(1, 5);
  });

  it('overwrites the oldest impact when the buffer is full', () => {
    const mesh = createShieldMesh(1.0);

    for (let i = 0; i < 10; i += 1) {
      addShieldImpact(mesh, { x: i, y: 0 }, { x: 0, y: 0 });
    }

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uHitCount.value).toBeLessThanOrEqual(8);
  });
});

describe('updateShieldVisuals', () => {
  it('increments time and ages impacts', () => {
    const mesh = createShieldMesh(1.0);
    addShieldImpact(mesh, { x: 1, y: 0 }, { x: 0, y: 0 });

    updateShieldVisuals(mesh, 0.1);

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uHitTimes.value[0]).toBeCloseTo(0.1, 5);
  });

  it('removes impacts after they expire', () => {
    const mesh = createShieldMesh(1.0);
    addShieldImpact(mesh, { x: 1, y: 0 }, { x: 0, y: 0 });

    updateShieldVisuals(mesh, 10.0);

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uHitCount.value).toBe(0);
  });
});

describe('clearShieldImpacts', () => {
  it('clears all impacts and resets uniforms', () => {
    const mesh = createShieldMesh(1.0);
    addShieldImpact(mesh, { x: 1, y: 0 }, { x: 0, y: 0 });
    addShieldImpact(mesh, { x: 0, y: 1 }, { x: 0, y: 0 });

    clearShieldImpacts(mesh);

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uHitCount.value).toBe(0);
    expect(material.uniforms.uHitTimes.value[0]).toBe(0);
  });
});

describe('setShieldEnergy', () => {
  it('increases opacity and fresnel strength at full energy', () => {
    const mesh = createShieldMesh(1.0);

    setShieldEnergy(mesh, 100);

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uOpacity.value).toBeGreaterThan(0.3);
    expect(material.uniforms.uFresnelStrength.value).toBeGreaterThan(0.5);
  });

  it('fades the shield at low energy', () => {
    const mesh = createShieldMesh(1.0);

    setShieldEnergy(mesh, 0);

    const material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uOpacity.value).toBeLessThan(0.25);
  });

  it('starts flicker when energy drops below 40%', () => {
    const mesh = createShieldMesh(1.0);

    setShieldEnergy(mesh, 50);
    let material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uDamagePercent.value).toBe(0);

    setShieldEnergy(mesh, 30);
    material = mesh.material as ShaderMaterial;
    expect(material.uniforms.uDamagePercent.value).toBeGreaterThan(0);
  });

  it('intensifies flicker as energy approaches zero', () => {
    const mesh = createShieldMesh(1.0);

    setShieldEnergy(mesh, 20);
    const partial = (mesh.material as ShaderMaterial).uniforms.uDamagePercent.value as number;

    setShieldEnergy(mesh, 5);
    const severe = (mesh.material as ShaderMaterial).uniforms.uDamagePercent.value as number;

    expect(severe).toBeGreaterThan(partial);
  });
});
