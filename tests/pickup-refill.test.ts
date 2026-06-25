import { describe, it, expect } from 'vitest';
import {
  PickupKind,
  createEmptyActiveAmmo,
  applyActivePickupEffect,
  canFireActive,
  BOMB_STRIKE_CHARGE_CAP,
  HOMING_MISSILES_CHARGE_CAP,
} from '../src/pickups';

describe('Pickup-gated ammo refills — Phase 7c', () => {
  it('BOMB_STRIKE pickup bumps bombStrike.charges by 1', () => {
    const ammo = createEmptyActiveAmmo();
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(0);
    applyActivePickupEffect(PickupKind.BOMB_STRIKE, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
  });

  it('SHIELD pickup bumps bombStrike.charges by 1 (conversion bonus)', () => {
    const ammo = createEmptyActiveAmmo();
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(0);
    applyActivePickupEffect(PickupKind.SHIELD, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
  });

  it('HOMING_MISSILES pickup bumps homingMissiles.charges by 1', () => {
    const ammo = createEmptyActiveAmmo();
    expect(ammo[PickupKind.HOMING_MISSILES].charges).toBe(0);
    applyActivePickupEffect(PickupKind.HOMING_MISSILES, ammo);
    expect(ammo[PickupKind.HOMING_MISSILES].charges).toBe(1);
  });

  it('charge gain is capped at BOMB_STRIKE_CHARGE_CAP (no overflow)', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = BOMB_STRIKE_CHARGE_CAP;
    applyActivePickupEffect(PickupKind.BOMB_STRIKE, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(BOMB_STRIKE_CHARGE_CAP);
  });
});