import { describe, it, expect } from 'vitest';
import { Mesh, ShaderMaterial, SphereGeometry } from 'three';
import {
  setShieldBoostColor,
  setShieldBoostPulse,
  triggerShieldFlare,
  tickShieldFlare,
} from '../src/shield-visuals';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Boost Lerp Tests (Phase 7b Task 6)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lock the lerp math for setShieldBoostColor / setShieldBoostPulse
//          and the one-shot flare ramp/decay without a WebGL context. The
//          mesh we build is a minimal stub (the shield shader is irrelevant
//          for these tests — we just need a ShaderMaterial with the right
//          uniform names).
// Setup:   Imports shield-visuals.ts; uses a minimal ShaderMaterial stub.
// Issues:  None.
// Fix:     Phase 7b Task 6.
// Gotchas: The shield's real ShaderMaterial uses ~12 uniforms; for these
//          tests we only need uBaseColor / uPulseSpeed / uFresnelStrength /
//          uGridStrength. We initialize them to the createShieldMesh
//          defaults so the lerps are tested against the same starting state.
// ═══════════════════════════════════════════════════════════════════════════

function makeStubShield(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      uBaseColor: { value: [0.45, 0.82, 1.0] as [number, number, number] },
      uPulseSpeed: { value: 0.45 },
      uGridStrength: { value: 0.12 },
      uFresnelStrength: { value: 0.42 },
    },
    vertexShader: '',
    fragmentShader: '',
  });
  return new Mesh(new SphereGeometry(1, 8, 8), material);
}

describe('shield boost lerp helpers (Phase 7b)', () => {
  it('setShieldBoostColor(intensity=0) keeps baseline cyan', () => {
    const mesh = makeStubShield();
    setShieldBoostColor(mesh, 0);
    const color = (mesh.material as ShaderMaterial).uniforms.uBaseColor.value as number[];
    expect(color[0]).toBeCloseTo(0.45, 5);
    expect(color[1]).toBeCloseTo(0.82, 5);
    expect(color[2]).toBeCloseTo(1.0, 5);
  });

  it('setShieldBoostColor(intensity=1) reaches the green target', () => {
    const mesh = makeStubShield();
    setShieldBoostColor(mesh, 1);
    const color = (mesh.material as ShaderMaterial).uniforms.uBaseColor.value as number[];
    expect(color[0]).toBeCloseTo(0.20, 5);
    expect(color[1]).toBeCloseTo(1.00, 5);
    expect(color[2]).toBeCloseTo(0.50, 5);
  });

  it('setShieldBoostColor(intensity=0.5) is the midpoint between baseline and green', () => {
    const mesh = makeStubShield();
    setShieldBoostColor(mesh, 0.5);
    const color = (mesh.material as ShaderMaterial).uniforms.uBaseColor.value as number[];
    expect(color[0]).toBeCloseTo((0.45 + 0.20) / 2, 5);
    expect(color[1]).toBeCloseTo((0.82 + 1.00) / 2, 5);
    expect(color[2]).toBeCloseTo((1.0 + 0.50) / 2, 5);
  });

  it('setShieldBoostPulse(intensity=1) reaches peak uPulseSpeed and uGridStrength', () => {
    const mesh = makeStubShield();
    setShieldBoostPulse(mesh, 1);
    const u = (mesh.material as ShaderMaterial).uniforms;
    expect(u.uPulseSpeed.value).toBeCloseTo(1.5, 5);
    expect(u.uGridStrength.value).toBeCloseTo(0.25, 5);
  });

  it('triggerShieldFlare then tickShieldFlare ramps uFresnelStrength then decays', () => {
    const mesh = makeStubShield();
    triggerShieldFlare(mesh, 0.6);
    // After 0.15s (25% of 0.6s), the ramp should be at its peak.
    tickShieldFlare(mesh, 0.15);
    const u = (mesh.material as ShaderMaterial).uniforms;
    expect(u.uFresnelStrength.value).toBeGreaterThan(0.9);
    // After another 0.5s (well past 0.6s), the flare is expired.
    tickShieldFlare(mesh, 0.5);
    expect(u.uFresnelStrength.value).toBeCloseTo(0.4, 1);
  });
});