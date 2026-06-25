import { describe, it, expect } from 'vitest';

describe('Bomb timing constants — Phase 7c', () => {
  it('SCREEN_FLASH_DURATION_SECONDS is 0.08', async () => {
    const { SCREEN_FLASH_DURATION_SECONDS } = await import('../src/bomb-timing');
    expect(SCREEN_FLASH_DURATION_SECONDS).toBe(0.08);
  });

  it('FREEZE_FRAME_TICKS is 2', async () => {
    const { FREEZE_FRAME_TICKS } = await import('../src/bomb-timing');
    expect(FREEZE_FRAME_TICKS).toBe(2);
  });

  it('PUNCH_ZOOM_DURATION_SECONDS is 0.1', async () => {
    const { PUNCH_ZOOM_DURATION_SECONDS } = await import('../src/bomb-timing');
    expect(PUNCH_ZOOM_DURATION_SECONDS).toBe(0.1);
  });

  it('PUNCH_ZOOM_SCALE is 1.02', async () => {
    const { PUNCH_ZOOM_SCALE } = await import('../src/bomb-timing');
    expect(PUNCH_ZOOM_SCALE).toBe(1.02);
  });

  it('SCREEN_FLASH_OPACITY is 0.8', async () => {
    const { SCREEN_FLASH_OPACITY } = await import('../src/bomb-timing');
    expect(SCREEN_FLASH_OPACITY).toBe(0.8);
  });
});
