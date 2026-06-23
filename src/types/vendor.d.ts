// ═══════════════════════════════════════════════════════════════════════════
// Vendor Type Declarations — r149 LightningStrike + SimplexNoise
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Minimal ambient declarations for the vendored three.js r149
//           examples so tsc --noEmit passes. The full r149 type surface
//           is wide; we only declare what `src/crystal-fx.ts` touches.
// Setup:    Loaded by tsc automatically because it lives under src/types/.
//           No explicit `///<reference>` is needed.
// Gotchas:
//   - This file MUST be a SCRIPT (no top-level imports or `export {}`)
//     so the ambient `declare module 'X'` blocks attach to the global
//     module scope and are visible to any consumer that imports the
//     same specifier.
//   - The specifier in `declare module '...'` matches the import
//     string in the consumer file exactly.
// ═══════════════════════════════════════════════════════════════════════════

declare module '*three-r149-LightningStrike.js' {
  // The vendored LightningStrike extends BufferGeometry at runtime.
  // For type-checking, we declare the class as a plain class; the
  // consumer (`src/crystal-fx.ts`) is responsible for casting
  // instances to BufferGeometry where needed (e.g. `new Mesh(geometry, ...)`).
  interface Vector3 {
    x: number;
    y: number;
    z: number;
    copy(v: Vector3): Vector3;
  }

  interface LightningStrikeParams {
    sourceOffset?: Vector3;
    destOffset?: Vector3;
    radius0?: number;
    radius1?: number;
    isEternal?: boolean;
    birthTime?: number;
    deathTime?: number;
    ramification?: number;
    recursionProbability?: number;
    maxIterations?: number;
    roughness?: number;
    straightness?: number;
    propagationTimeFactor?: number;
    vanishingTimeFactor?: number;
  }

  export class LightningStrike {
    constructor(params?: LightningStrikeParams);
    rayParameters: {
      sourceOffset: Vector3;
      destOffset: Vector3;
      radius0: number;
      radius1: number;
      isEternal: boolean;
      birthTime: number;
      deathTime: number;
    };
    update(time: number): void;
    dispose(): void;
    static copyParameters(
      dest: LightningStrikeParams,
      source: LightningStrikeParams,
    ): LightningStrikeParams;
  }
}

declare module '*three-r149-SimplexNoise.js' {
  export class SimplexNoise {
    constructor(randomGenerator?: unknown);
    noise3d(xin: number, yin: number, zin: number): number;
    noise4d(x: number, y: number, z: number, w: number): number;
  }
}
