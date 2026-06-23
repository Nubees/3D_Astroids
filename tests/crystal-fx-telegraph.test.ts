import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createFracturedMaterial,
  updateFracturedMaterialTelegraph,
} from '../src/crystal-fx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Crystal FX Telegraph (Phase 6e — Body Shader)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the onBeforeCompile scaffolding on createFracturedMaterial
//          and the updateFracturedMaterialTelegraph per-frame helper. These
//          are pure-JS tests: no WebGL, no canvas, no jsdom. The actual
//          shader compile happens lazily on first render, so we only test
//          the userData surface (uniform refs, cache key) and the helper
//          math (uTime, uCharge, rim-color lerp).
// Setup:   Imports createFracturedMaterial from src/crystal-fx.ts.
// Issues:  None.
// Fix:     Phase 6e.
// Gotchas:
//  - MeshStandardMaterial is constructible in node (no WebGL context needed
//    for `new`, only for rendering). All assertions run against the JS-side
//    userData and the .customProgramCacheKey callback result.
//  - onBeforeCompile is invoked with a synthetic shader object so we can
//    verify the injection does not throw and produces the expected
//    shader.uniforms additions + shader.vertexShader / fragmentShader
//    replacements without a real WebGL compile.
//  - updateFracturedMaterialTelegraph is a no-op on materials that lack
//    userData.uniforms; we assert that to lock in the safety property.
// ═══════════════════════════════════════════════════════════════════════════

describe('createFracturedMaterial — Phase 6e shader scaffolding', () => {
  it('installs the expected uniform refs in userData.uniforms', () => {
    const mat = createFracturedMaterial();
    const u = (mat.userData as { uniforms?: Record<string, { value: unknown }> }).uniforms;
    expect(u).toBeDefined();
    expect(u).toHaveProperty('uTime');
    expect(u).toHaveProperty('uCharge');
    expect(u).toHaveProperty('uRimColor');
    expect(u).toHaveProperty('uRimPower');
    expect(u).toHaveProperty('uRimStrength');
    // Defaults: uTime=0, uCharge=0, uRimColor=white, uRimPower=2.5, uRimStrength=0.9
    expect((u!.uTime as { value: number }).value).toBe(0);
    expect((u!.uCharge as { value: number }).value).toBe(0);
    expect((u!.uRimPower as { value: number }).value).toBeCloseTo(2.5, 5);
    expect((u!.uRimStrength as { value: number }).value).toBeCloseTo(0.9, 5);
    const rim = (u!.uRimColor as { value: THREE.Color }).value;
    expect(rim.r).toBeCloseTo(1.0, 5);
    expect(rim.g).toBeCloseTo(1.0, 5);
    expect(rim.b).toBeCloseTo(1.0, 5);
    mat.dispose();
  });

  it('sets customProgramCacheKey to a stable string (program reuse)', () => {
    const mat = createFracturedMaterial();
    const cacheKey = (mat.customProgramCacheKey as (() => string) | undefined)?.();
    expect(cacheKey).toBe('crystal-fractured-telegraph-v1');
    // Two different materials should yield the same key (one shared program).
    const mat2 = createFracturedMaterial();
    const key2 = (mat2.customProgramCacheKey as (() => string) | undefined)?.();
    expect(key2).toBe(cacheKey);
    mat.dispose();
    mat2.dispose();
  });

  it('installs an onBeforeCompile hook that injects the uniforms and shader chunks', () => {
    const mat = createFracturedMaterial();
    const hook = mat.onBeforeCompile as
      | ((shader: {
          uniforms: Record<string, { value: unknown }>;
          vertexShader: string;
          fragmentShader: string;
        }) => void)
      | undefined;
    expect(hook).toBeDefined();

    // Build a minimal fake shader object and run the hook.
    const fakeShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <fog_vertex>\n',
      fragmentShader: '#include <common>\n#include <emissivemap_fragment>\n',
    };
    expect(() => hook!(fakeShader)).not.toThrow();

    // Uniforms were Object.assign'd into the shader uniforms.
    const u = (mat.userData as { uniforms: Record<string, { value: unknown }> }).uniforms;
    for (const key of ['uTime', 'uCharge', 'uRimColor', 'uRimPower', 'uRimStrength']) {
      expect(fakeShader.uniforms[key]).toBe(u[key]);
    }

    // Vertex injection adds the varyings.
    expect(fakeShader.vertexShader).toContain('vViewNormalCS');
    expect(fakeShader.vertexShader).toContain('vViewPosCS');

    // Fragment injection adds the uniform declarations and the body.
    expect(fakeShader.fragmentShader).toContain('uniform float uCharge');
    expect(fakeShader.fragmentShader).toContain('uniform vec3 uRimColor');
    // The 3-stage color shift is present (look for the danger red constant).
    expect(fakeShader.fragmentShader).toContain('cDanger');
    // The fresnel rim is present.
    expect(fakeShader.fragmentShader).toContain('uRimPower');
    expect(fakeShader.fragmentShader).toContain('pulseRate');

    mat.dispose();
  });
});

describe('updateFracturedMaterialTelegraph — per-frame helper', () => {
  it('writes uTime and uCharge to the userData.uniforms refs', () => {
    const mat = createFracturedMaterial();
    updateFracturedMaterialTelegraph(mat, 12.5, 0.4);
    const u = (mat.userData as {
      uniforms: { uTime: { value: number }; uCharge: { value: number } };
    }).uniforms;
    expect(u.uTime.value).toBe(12.5);
    expect(u.uCharge.value).toBe(0.4);
    mat.dispose();
  });

  it('clamps rim color to white when charge is 0', () => {
    const mat = createFracturedMaterial();
    updateFracturedMaterialTelegraph(mat, 0, 0);
    const rim = (mat.userData as { uniforms: { uRimColor: { value: THREE.Color } } }).uniforms
      .uRimColor.value;
    expect(rim.r).toBeCloseTo(1.0, 5);
    expect(rim.g).toBeCloseTo(1.0, 5);
    expect(rim.b).toBeCloseTo(1.0, 5);
    mat.dispose();
  });

  it('lerps rim color from white toward red as charge ramps', () => {
    const mat = createFracturedMaterial();
    // At charge = 0.5: G = 1 - 0.5*0.82 = 0.59; B = 1 - 0.5*0.9 = 0.55.
    updateFracturedMaterialTelegraph(mat, 0, 0.5);
    const rimMid = (mat.userData as { uniforms: { uRimColor: { value: THREE.Color } } })
      .uniforms.uRimColor.value;
    expect(rimMid.r).toBeCloseTo(1.0, 5);
    expect(rimMid.g).toBeCloseTo(1.0 - 0.5 * 0.82, 5);
    expect(rimMid.b).toBeCloseTo(1.0 - 0.5 * 0.9, 5);

    // At charge = 1.0: G = 0.18; B = 0.10. R stays at 1.0.
    updateFracturedMaterialTelegraph(mat, 0, 1.0);
    const rimHot = (mat.userData as { uniforms: { uRimColor: { value: THREE.Color } } })
      .uniforms.uRimColor.value;
    expect(rimHot.r).toBeCloseTo(1.0, 5);
    expect(rimHot.g).toBeCloseTo(0.18, 5);
    expect(rimHot.b).toBeCloseTo(0.10, 5);
    mat.dispose();
  });

  it('is a no-op on a material that lacks userData.uniforms (safety)', () => {
    // A plain MeshStandardMaterial without our scaffolding should not throw
    // and should not have any uniforms mutated.
    const plain = new THREE.MeshStandardMaterial({ color: 0xffffff });
    expect(() => updateFracturedMaterialTelegraph(plain, 1, 0.5)).not.toThrow();
    // userData has no `uniforms` key — confirm we did not accidentally add one.
    expect(
      (plain.userData as { uniforms?: unknown }).uniforms,
    ).toBeUndefined();
    plain.dispose();
  });
});
