import { describe, expect, it } from 'vitest';
import {
  BREATHER_METER_COST,
  BREATHER_ZONE_DURATION,
  addToBreatherMeter,
  canDeployBreather,
  createBreatherZoneState,
  isInsideBreatherZone,
  tryDeployBreather,
  updateBreather,
} from '../src/breather';
import { createShieldState } from '../src/shield';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Breather Zone Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify meter filling, deployment conditions, duration, shield recharge
//          inside the zone, and position-based membership.
// Setup: Create breather state and synthetic ship/shield states.
// Issues: None.
// Fix: Added coverage for the Phase 4 Breather Zone system.
// Gotchas: The zone is fixed in world space at deployment. Shield recharge only
//          applies while the ship is inside the radius.
// ═══════════════════════════════════════════════════════════════════════════

describe('BreatherZone', () => {
  it('starts inactive with an empty meter', () => {
    const zone = createBreatherZoneState();
    expect(zone.active).toBe(false);
    expect(zone.meter).toBe(0);
    expect(canDeployBreather(zone)).toBe(false);
  });

  it('fills the meter up to the deployment cost', () => {
    const zone = createBreatherZoneState();
    addToBreatherMeter(zone, 5);
    expect(zone.meter).toBe(5);
    addToBreatherMeter(zone, 10);
    expect(zone.meter).toBe(BREATHER_METER_COST);
  });

  it('can deploy when meter is full', () => {
    const zone = createBreatherZoneState();
    addToBreatherMeter(zone, BREATHER_METER_COST);
    const deployed = tryDeployBreather(zone, { x: 3, y: 4 });
    expect(deployed).toBe(true);
    expect(zone.active).toBe(true);
    expect(zone.position).toEqual({ x: 3, y: 4 });
    expect(zone.durationRemaining).toBe(BREATHER_ZONE_DURATION);
    expect(zone.meter).toBe(0);
  });

  it('cannot deploy when meter is too low', () => {
    const zone = createBreatherZoneState();
    addToBreatherMeter(zone, 3);
    const deployed = tryDeployBreather(zone, { x: 0, y: 0 });
    expect(deployed).toBe(false);
    expect(zone.active).toBe(false);
  });

  it('reports whether the ship is inside the zone', () => {
    const zone = createBreatherZoneState();
    addToBreatherMeter(zone, BREATHER_METER_COST);
    tryDeployBreather(zone, { x: 0, y: 0 });
    expect(isInsideBreatherZone(zone, { x: 0, y: 0 })).toBe(true);
    expect(isInsideBreatherZone(zone, { x: 10, y: 0 })).toBe(false);
  });

  it('recharges shield energy while the ship is inside', () => {
    const zone = createBreatherZoneState();
    const shield = createShieldState();
    shield.energy = 0;
    addToBreatherMeter(zone, BREATHER_METER_COST);
    tryDeployBreather(zone, { x: 0, y: 0 });

    updateBreather(zone, shield, { x: 0, y: 0 }, false, 2.0);

    expect(shield.energy).toBeGreaterThan(0);
    expect(zone.durationRemaining).toBeLessThan(BREATHER_ZONE_DURATION);
  });

  it('expires after the zone duration', () => {
    const zone = createBreatherZoneState();
    const shield = createShieldState();
    addToBreatherMeter(zone, BREATHER_METER_COST);
    tryDeployBreather(zone, { x: 0, y: 0 });

    updateBreather(zone, shield, { x: 0, y: 0 }, false, BREATHER_ZONE_DURATION + 1);

    expect(zone.active).toBe(false);
  });
});
