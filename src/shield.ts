import { AsteroidSize, AsteroidState } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield System
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Provide passive shield armor that absorbs asteroid hits by draining
//          energy proportional to the asteroid's size.
// Setup: Game owns the shield state; updateShield handles recharge and absorbHit
//        handles impact resolution.
// Issues: The previous shield was a manual panic button that collapsed on a single
//         hit, giving the player no feedback about remaining protection.
// Fix: The shield is now passive. Hits drain energy based on asteroid size. The
//      HUD shows a percentage with color-coded urgency. Visual feedback is handled
//      by the separate shield-visuals module (glowing energy bubble + expanding
//      impact ripples). The HUD shakes briefly on absorption.
// Gotchas: The shield recharges ONLY inside the Breather Zone; outside the zone
//          energy does not regenerate. The C / RMB inputs are reserved for a
//          future EMP pulse.
// ═══════════════════════════════════════════════════════════════════════════

export const SHIELD_MAX_ENERGY = 1.0;
export const SHIELD_RECHARGE_PER_SECOND = 0.75;

export const SHIELD_DAMAGE_BY_SIZE: Record<AsteroidSize, number> = {
  [AsteroidSize.TINY]: 0.05,
  [AsteroidSize.SMALL]: 0.10,
  [AsteroidSize.MEDIUM]: 0.15,
  [AsteroidSize.LARGE]: 0.20,
};

export interface ShieldState {
  energy: number;
  hitAbsorbedThisFrame: boolean;
}

export function createShieldState(): ShieldState {
  return {
    energy: SHIELD_MAX_ENERGY,
    hitAbsorbedThisFrame: false,
  };
}

export function updateShield(
  shield: ShieldState,
  inBreatherZone: boolean,
  deltaTime: number,
): void {
  shield.hitAbsorbedThisFrame = false;
  // Shield energy only regenerates while inside the Breather Zone.
  if (inBreatherZone) {
    shield.energy = Math.min(
      SHIELD_MAX_ENERGY,
      shield.energy + SHIELD_RECHARGE_PER_SECOND * deltaTime,
    );
  }
}

/**
 * Absorb an asteroid impact. Returns true if the shield had enough energy to
 * survive the blow; false if the shield is depleted and the ship should die.
 *
 * Note: a hit that exactly empties the shield is still absorbed; the ship only
 * dies on the next impact once energy is gone.
 */
export function absorbHit(shield: ShieldState, asteroid: AsteroidState): boolean {
  if (shield.energy <= 0) {
    return false;
  }

  const damage = SHIELD_DAMAGE_BY_SIZE[asteroid.size];
  shield.energy = Math.max(0, shield.energy - damage);
  shield.hitAbsorbedThisFrame = true;
  return true;
}

export function shieldPercent(shield: ShieldState): number {
  return Math.round((shield.energy / SHIELD_MAX_ENERGY) * 100);
}

export function shieldColor(percent: number): string {
  if (percent <= 25) return '#ff3333';
  if (percent <= 50) return '#ffcc00';
  return '#33ff66';
}
