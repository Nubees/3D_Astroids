import {
  AdditiveBlending,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import { Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Damage Effects
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Visual feedback for a damaged ship: explosion shards, tiny hull debris
//          chunks, and electric spark arcs. Used on death and when shields are
//          critically low or depleted.
// Setup: Game owns the Three.js objects; this module owns creation and update
//        math so it stays unit-testable and independent of the scene.
// Issues: Explosion particles were managed inside Game.ts and could leak if the
//         cleanup path was skipped.
// Fix: Centralize all short-lived ship damage particles here with explicit
//      dispose helpers and a uniform update pattern.
// Gotchas: All particles are world-space and must be updated each frame. Spark
//          line segments are rebuilt each frame with jittery endpoints so the arc
//          feels alive. All objects must be disposed to avoid GPU leaks.
// ═══════════════════════════════════════════════════════════════════════════

export interface ExplosionParticle {
  mesh: Mesh;
  velocity: Vector2;
  rotationSpeed: number;
  age: number;
  duration: number;
}

export interface DamageParticle {
  mesh: Mesh;
  velocity: Vector2;
  rotationSpeed: number;
  age: number;
  duration: number;
}

export interface SparkArcOrigin {
  x: number;
  y: number;
  z: number;
}

export interface SparkArc {
  mesh: LineSegments;
  age: number;
  duration: number;
  origin: Vector3;
  radius: number;
}

const DEBRIS_COLORS = [0xffaa00, 0xffddaa, 0xff4400, 0xaaaaaa];
const EXPLOSION_COLORS = [0xffaa00, 0xffddaa, 0xff4400, 0xffffff];

export function createExplosionParticle(position: Vector2): ExplosionParticle {
  const geometry = new ConeGeometry(0.08, 0.2, 4);
  const color = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
  const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(position.x, position.y, 0);

  const angle = Math.random() * Math.PI * 2;
  const speed = 2.0 + Math.random() * 5.0;
  const velocity: Vector2 = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  };

  return {
    mesh,
    velocity,
    rotationSpeed: (Math.random() - 0.5) * 8,
    age: 0,
    duration: 0.7 + Math.random() * 0.5,
  };
}

export function updateExplosionParticles(
  particles: ExplosionParticle[],
  deltaTime: number,
): ExplosionParticle[] {
  const alive: ExplosionParticle[] = [];
  for (const particle of particles) {
    particle.age += deltaTime;
    if (particle.age >= particle.duration) {
      particle.mesh.geometry.dispose();
      (particle.mesh.material as MeshBasicMaterial).dispose();
      if (particle.mesh.parent) {
        particle.mesh.parent.remove(particle.mesh);
      }
      continue;
    }

    particle.mesh.position.x += particle.velocity.x * deltaTime;
    particle.mesh.position.y += particle.velocity.y * deltaTime;
    particle.mesh.rotation.z += particle.rotationSpeed * deltaTime;

    const progress = particle.age / particle.duration;
    (particle.mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - progress);

    alive.push(particle);
  }
  return alive;
}

export function disposeAllExplosionParticles(particles: ExplosionParticle[]): void {
  for (const particle of particles) {
    particle.mesh.geometry.dispose();
    (particle.mesh.material as MeshBasicMaterial).dispose();
    if (particle.mesh.parent) {
      particle.mesh.parent.remove(particle.mesh);
    }
  }
}

export function createDamageParticle(position: Vector2): DamageParticle {
  const geometry = new TetrahedronGeometry(0.07 + Math.random() * 0.07, 0);
  const color = DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)];
  const material = new MeshBasicMaterial({ color });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(position.x, position.y, 0);

  const angle = Math.random() * Math.PI * 2;
  const speed = 0.6 + Math.random() * 1.4;
  const velocity: Vector2 = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  };

  return {
    mesh,
    velocity,
    rotationSpeed: (Math.random() - 0.5) * 12,
    age: 0,
    duration: 1.0 + Math.random() * 0.8,
  };
}

export function updateDamageParticles(
  particles: DamageParticle[],
  deltaTime: number,
): DamageParticle[] {
  const alive: DamageParticle[] = [];
  for (const particle of particles) {
    particle.age += deltaTime;
    if (particle.age >= particle.duration) {
      particle.mesh.geometry.dispose();
      (particle.mesh.material as MeshBasicMaterial).dispose();
      if (particle.mesh.parent) {
        particle.mesh.parent.remove(particle.mesh);
      }
      continue;
    }

    particle.mesh.position.x += particle.velocity.x * deltaTime;
    particle.mesh.position.y += particle.velocity.y * deltaTime;
    particle.mesh.rotation.x += particle.rotationSpeed * deltaTime;
    particle.mesh.rotation.y += particle.rotationSpeed * deltaTime * 0.7;

    const progress = particle.age / particle.duration;
    (particle.mesh.material as MeshBasicMaterial).opacity = 1.0 - progress;

    alive.push(particle);
  }
  return alive;
}

export function disposeAllDamageParticles(particles: DamageParticle[]): void {
  for (const particle of particles) {
    particle.mesh.geometry.dispose();
    (particle.mesh.material as MeshBasicMaterial).dispose();
    if (particle.mesh.parent) {
      particle.mesh.parent.remove(particle.mesh);
    }
  }
}

export function createSparkArc(origin: SparkArcOrigin, radius = 0.85): SparkArc {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(12 * 3);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const material = new LineBasicMaterial({
    color: 0x00ccff,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const mesh = new LineSegments(geometry, material);
  mesh.position.copy(origin as Vector3);

  return {
    mesh,
    age: 0,
    duration: 0.08 + Math.random() * 0.08,
    origin: new Vector3(origin.x, origin.y, origin.z),
    radius,
  };
}

function randomPointOnSphere(radius: number): Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  );
}

export function updateSparkArcs(arcs: SparkArc[], deltaTime: number): SparkArc[] {
  const alive: SparkArc[] = [];
  for (const arc of arcs) {
    arc.age += deltaTime;
    if (arc.age >= arc.duration) {
      arc.mesh.geometry.dispose();
      (arc.mesh.material as LineBasicMaterial).dispose();
      if (arc.mesh.parent) {
        arc.mesh.parent.remove(arc.mesh);
      }
      continue;
    }

    // Rebuild the arc each frame with jittery endpoints so it crackles.
    const positions = arc.mesh.geometry.attributes.position.array as Float32Array;
    const jitter = arc.radius * (0.4 + Math.random() * 0.4);

    let index = 0;
    for (let i = 0; i < 6; i += 1) {
      const start = randomPointOnSphere(arc.radius * 0.25);
      const end = randomPointOnSphere(arc.radius * (0.9 + Math.random() * 0.6));
      positions[index++] = start.x + (Math.random() - 0.5) * jitter;
      positions[index++] = start.y + (Math.random() - 0.5) * jitter;
      positions[index++] = start.z;
      positions[index++] = end.x + (Math.random() - 0.5) * jitter;
      positions[index++] = end.y + (Math.random() - 0.5) * jitter;
      positions[index++] = end.z;
    }
    arc.mesh.geometry.attributes.position.needsUpdate = true;

    const progress = arc.age / arc.duration;
    (arc.mesh.material as LineBasicMaterial).opacity = 0.9 * (1.0 - progress);

    alive.push(arc);
  }
  return alive;
}

export function disposeAllSparkArcs(arcs: SparkArc[]): void {
  for (const arc of arcs) {
    arc.mesh.geometry.dispose();
    (arc.mesh.material as LineBasicMaterial).dispose();
    if (arc.mesh.parent) {
      arc.mesh.parent.remove(arc.mesh);
    }
  }
}

/**
 * Pick a random point on the ship hull in local coordinates. The ship is roughly
 * a cone body (length ~1.5 along X, radius ~0.5) plus an engine cylinder at the
 * rear. We sample a random surface point so debris appears to break off the ship.
 */
export function randomHullPoint(): Vector2 {
  const side = Math.random() < 0.5 ? -1 : 1;
  const angle = Math.random() * Math.PI * 2;
  const radius = 0.15 + Math.random() * 0.35;
  const x = -0.6 + Math.random() * 1.4;
  const y = Math.sin(angle) * radius * 0.6;
  return { x: x + side * Math.cos(angle) * radius * 0.4, y };
}
