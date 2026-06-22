import {
  AdditiveBlending,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Visuals
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Render the ship shield as a glowing energy bubble with dynamic impact
//          ripples at any contact point (asteroids, future lasers/rockets).
// Setup: Custom ShaderMaterial on a sphere mesh; impacts are stored in a small
//        ring buffer of world-space directions + ages, passed to the shader as
//        uniforms.
// Issues: The old shield was a plain transparent sphere with a flat RingGeometry
//         arc that did not wrap around the ship and could not show multiple hits.
// Fix: Replace the sphere + arc combo with a shader that combines Fresnel rim
//      glow, a subtle procedural energy grid, and expanding geodesic impact rings.
// Gotchas: The shield mesh is a child of shipMesh, so world-space impact
//          directions are computed from the ship center and stay valid as the
//          ship rotates. Array uniforms must have their .value reassigned after
//          mutation so Three.js uploads the new data.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_IMPACTS = 8;

interface ShieldUniforms {
  [key: string]: { value: unknown };
  uTime: { value: number };
  uBaseColor: { value: [number, number, number] };
  uFresnelPower: { value: number };
  uFresnelStrength: { value: number };
  uOpacity: { value: number };
  uGridScale: { value: number };
  uGridStrength: { value: number };
  uPulseSpeed: { value: number };
  uPulseMin: { value: number };
  uFlickerSpeed: { value: number };
  uDamagePercent: { value: number };
  uHitCount: { value: number };
  uHitPositions: { value: Vector3[] };
  uHitTimes: { value: number[] };
  uRingSpeed: { value: number };
  uRingWidth: { value: number };
  uRingMaxRadius: { value: number };
}

interface ShieldUserData {
  impactAges: Float32Array;
  impactSlots: Vector3[];
}

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    vObjPos = position;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform float uFresnelPower;
  uniform float uFresnelStrength;
  uniform float uOpacity;
  uniform float uGridScale;
  uniform float uGridStrength;
  uniform float uPulseSpeed;
  uniform float uPulseMin;
  uniform float uFlickerSpeed;
  uniform float uDamagePercent;
  uniform int uHitCount;
  uniform vec3 uHitPositions[8];
  uniform float uHitTimes[8];
  uniform float uRingSpeed;
  uniform float uRingWidth;
  uniform float uRingMaxRadius;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  // Hex-like energy grid projected in object space so it sticks to the shield
  // surface and rotates with the ship instead of sliding against the background.
  float gridLines(vec3 p, float scale) {
    // Cube projection: pick the dominant normal axis and map to a face plane.
    vec3 absP = abs(p);
    vec2 uv;
    if (absP.x > absP.y && absP.x > absP.z) {
      uv = p.yz / absP.x;
    } else if (absP.y > absP.z) {
      uv = p.xz / absP.y;
    } else {
      uv = p.xy / absP.z;
    }

    // Hexagon tiling from screen-space-like uv.
    vec2 r = vec2(1.0, 1.732);
    vec2 h = r * 0.5;
    vec2 a = mod(uv * scale, r) - h;
    vec2 b = mod(uv * scale + h, r) - h;
    float d = min(dot(a, a), dot(b, b));
    float line = 1.0 - smoothstep(0.0, 0.08, sqrt(d));
    return line;
  }

  // Slow power pulse: the whole shield dims to almost invisible and then rises
  // back to full brightness on a steady cycle. Large spatial sine waves give a
  // sweeping "energy wash" feel across the bubble.
  float pulseEnvelope(vec3 p, float time, float speed, float pulseMin) {
    float slow = 0.5 + 0.5 * sin(time * speed + p.x * 2.0 + p.y * 2.0 + p.z * 2.0);
    float fast = 0.5 + 0.5 * sin(time * speed * 2.4 + p.y * 4.0 - p.x * 4.0);
    float envelope = slow * 0.80 + fast * 0.20;
    // Remap 0..1 to pulseMin..1 so the shield nearly vanishes at the bottom.
    return envelope * (1.0 - pulseMin) + pulseMin;
  }

  // Damage flicker: when shields are below 40% the surface jitters with high
  // frequency noise so the failing field looks unstable.
  float flicker(vec3 p, float time, float speed, float damage) {
    if (damage <= 0.0) return 0.0;
    float a = sin(time * speed + p.x * 12.0) * 0.5 + 0.5;
    float b = sin(time * speed * 1.7 + p.y * 17.0) * 0.5 + 0.5;
    float c = sin(time * speed * 2.3 + p.z * 9.0) * 0.5 + 0.5;
    float noise = a * b * c;
    return noise * damage * 0.55;
  }

  float geodesicDistance(vec3 a, vec3 b) {
    return acos(clamp(dot(normalize(a), normalize(b)), -1.0, 1.0));
  }

  float impactRing(int i, vec3 normal) {
    float age = uHitTimes[i];
    float radius = age * uRingSpeed;
    float dist = geodesicDistance(normal, uHitPositions[i]);
    float ring = smoothstep(uRingWidth, 0.0, abs(dist - radius));
    float life = uRingMaxRadius / uRingSpeed;
    float fade = 1.0 - smoothstep(0.0, life, age);
    float core = 1.0 - smoothstep(0.0, 0.12, dist);
    return (ring * fade * 1.6 + core * fade * 0.7);
  }

  void main() {
    // Fresnel rim: very faint edge so the bubble feels like a volume of energy
    // rather than a hard glass shell. Softer power gives a broader, dimmer glow.
    float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), uFresnelPower);

    // Slow power pulse: the shield dims to almost invisible and sweeps back up.
    float pulseMask = pulseEnvelope(vObjPos, uTime, uPulseSpeed, uPulseMin);

    // Living grid pulse in object space.
    float gridPulse = 0.82 + 0.18 * sin(uTime * uPulseSpeed * 1.3 + vObjPos.x * 4.0 + vObjPos.y * 4.0);
    float grid = gridLines(vObjPos, uGridScale) * uGridStrength * gridPulse * pulseMask;

    // Damage flicker: high-frequency instability added only when shields are low.
    float flickerMask = flicker(vObjPos, uTime, uFlickerSpeed, uDamagePercent);

    // Base shield color modulated by rim, grid, pulse, and flicker.
    vec3 color = uBaseColor * (fresnel * uFresnelStrength + grid + pulseMask * 0.25 + flickerMask);
    float alpha = fresnel * uOpacity * pulseMask + grid * uOpacity + flickerMask * uOpacity;

    // Add expanding impact rings.
    float hitGlow = 0.0;
    for (int i = 0; i < 8; i += 1) {
      if (i >= uHitCount) break;
      hitGlow += impactRing(i, vNormal);
    }

    color += vec3(0.75, 0.92, 1.0) * hitGlow * 1.5;
    alpha += hitGlow * 0.9;

    gl_FragColor = vec4(color, alpha);
  }
`;

export function createShieldMesh(radius: number): Mesh {
  const geometry = new SphereGeometry(radius, 32, 32);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: 2,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: [0.45, 0.82, 1.0] },
      uFresnelPower: { value: 2.9 },
      uFresnelStrength: { value: 0.42 },
      uOpacity: { value: 0.40 },
      uGridScale: { value: 2.6 },
      uGridStrength: { value: 0.12 },
      uPulseSpeed: { value: 0.45 },
      uPulseMin: { value: 0.08 },
      uFlickerSpeed: { value: 18.0 },
      uDamagePercent: { value: 0.0 },
      uHitCount: { value: 0 },
      uHitPositions: { value: Array.from({ length: MAX_IMPACTS }, () => new Vector3()) },
      uHitTimes: { value: new Float32Array(MAX_IMPACTS) as unknown as number[] },
      uRingSpeed: { value: 3.2 },
      uRingWidth: { value: 0.22 },
      uRingMaxRadius: { value: 2.0 },
    } as ShieldUniforms,
  });

  const mesh = new Mesh(geometry, material);
  mesh.userData = {
    impactAges: new Float32Array(MAX_IMPACTS),
    impactSlots: Array.from({ length: MAX_IMPACTS }, () => new Vector3()),
  } as ShieldUserData;
  return mesh;
}

function getUniforms(mesh: Mesh): ShieldUniforms {
  const material = mesh.material as ShaderMaterial;
  return material.uniforms as ShieldUniforms;
}

export function updateShieldVisuals(mesh: Mesh, deltaTime: number): void {
  const uniforms = getUniforms(mesh);
  uniforms.uTime.value += deltaTime;

  const userData = mesh.userData as ShieldUserData;
  const life = uniforms.uRingMaxRadius.value / uniforms.uRingSpeed.value;

  // Age all impacts and compact active ones to the front of the arrays.
  let activeCount = 0;
  for (let i = 0; i < MAX_IMPACTS; i += 1) {
    const age = userData.impactAges[i] + deltaTime;
    if (age < life) {
      userData.impactAges[activeCount] = age;
      userData.impactSlots[activeCount].copy(userData.impactSlots[i]);
      activeCount += 1;
    }
  }

  for (let i = activeCount; i < MAX_IMPACTS; i += 1) {
    userData.impactAges[i] = 0;
    userData.impactSlots[i].set(0, 0, 0);
  }

  for (let i = 0; i < MAX_IMPACTS; i += 1) {
    uniforms.uHitTimes.value[i] = userData.impactAges[i];
    uniforms.uHitPositions.value[i].copy(userData.impactSlots[i]);
  }
  uniforms.uHitCount.value = activeCount;

  // Reassign values so Three.js notices the array updates.
  uniforms.uHitTimes.value = [...uniforms.uHitTimes.value];
  uniforms.uHitPositions.value = [...uniforms.uHitPositions.value];
}

export function addShieldImpact(mesh: Mesh, worldPoint: Vector2, shipPosition: Vector2): void {
  const userData = mesh.userData as ShieldUserData;
  const uniforms = getUniforms(mesh);
  const life = uniforms.uRingMaxRadius.value / uniforms.uRingSpeed.value;

  // Overwrite the oldest impact slot (or the first expired one).
  let oldestIndex = 0;
  let oldestAge = userData.impactAges[0];
  for (let i = 1; i < MAX_IMPACTS; i += 1) {
    if (userData.impactAges[i] >= life) {
      oldestIndex = i;
      break;
    }
    if (userData.impactAges[i] > oldestAge) {
      oldestIndex = i;
      oldestAge = userData.impactAges[i];
    }
  }

  const direction = new Vector3(
    worldPoint.x - shipPosition.x,
    worldPoint.y - shipPosition.y,
    0,
  ).normalize();

  userData.impactAges[oldestIndex] = 0;
  userData.impactSlots[oldestIndex].copy(direction);

  uniforms.uHitPositions.value[oldestIndex].copy(direction);
  uniforms.uHitTimes.value[oldestIndex] = 0;
  uniforms.uHitCount.value = Math.min(MAX_IMPACTS, uniforms.uHitCount.value + 1);
}

export function clearShieldImpacts(mesh: Mesh): void {
  const userData = mesh.userData as ShieldUserData;
  userData.impactAges.fill(0);
  for (const slot of userData.impactSlots) {
    slot.set(0, 0, 0);
  }

  const uniforms = getUniforms(mesh);
  uniforms.uHitCount.value = 0;
  for (let i = 0; i < MAX_IMPACTS; i += 1) {
    uniforms.uHitTimes.value[i] = 0;
    uniforms.uHitPositions.value[i].set(0, 0, 0);
  }
  uniforms.uHitTimes.value = [...uniforms.uHitTimes.value];
  uniforms.uHitPositions.value = [...uniforms.uHitPositions.value];
}

export function setShieldEnergy(mesh: Mesh, percent: number): void {
  const uniforms = getUniforms(mesh);
  const clamped = Math.max(0, Math.min(100, percent));
  const normalized = clamped / 100;
  uniforms.uOpacity.value = 0.2 + normalized * 0.55;
  uniforms.uFresnelStrength.value = 0.4 + normalized * 0.75;
  // Flicker kicks in once the shield drops below 40% and intensifies toward 0.
  uniforms.uDamagePercent.value = clamped < 40 ? (1.0 - clamped / 40) : 0.0;
}
