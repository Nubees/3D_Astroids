import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Weapon Lab Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the LAB-NO2 weapon testbed scaffold exists and is
//          wired into the ship-select toolbar. This is a STRUCTURAL test
//          suite — it asserts the files exist, the TypeScript module
//          exports the expected entry point, and the ship-select screen
//          references the new icon. It does NOT exercise Three.js
//          rendering, fire actions, or per-frame VFX state (those belong
//          in Playwright).
// Setup:   Pure Node + Vitest. The tests read source files from disk
//          and check for the expected string patterns. No Three.js /
//          WebGL / DOM imports — the test runs fast and the lab code
//          stays free of test-only branches.
// Issues:  None.
// Fix:     Initial creation. The 5 tests cover: HTML exists, TS module
//          exists, TS module exports startWeaponLab, ship-select.ts
//          references the new icon label, ship-select.ts links to the
//          new page URL. If any of these regress (e.g. someone deletes
//          the file during refactor), CI fails immediately.
// Gotchas: The tests use `path.resolve` against the project root via
//          import.meta.url so they work regardless of CWD. The new test
//          joins the existing tests/ folder convention; vitest.config.ts
//          already includes `tests/**/*.test.ts` so no other config
//          change is needed.
// ═══════════════════════════════════════════════════════════════════════════

const projectRoot = path.resolve(__dirname, '..');
const htmlPath = path.resolve(projectRoot, 'public/test-lab/weapon-lab.html');
const tsPath = path.resolve(projectRoot, 'src/test-lab/weapon-lab.ts');
const cssPath = path.resolve(projectRoot, 'src/test-lab/weapon-lab.css');
const shipSelectPath = path.resolve(projectRoot, 'src/ship-select.ts');

describe('Weapon Lab (LAB-NO2) — file scaffold', () => {
  it('public/test-lab/weapon-lab.html exists', () => {
    expect(fs.existsSync(htmlPath)).toBe(true);
  });

  it('src/test-lab/weapon-lab.ts exists', () => {
    expect(fs.existsSync(tsPath)).toBe(true);
  });

  it('src/test-lab/weapon-lab.css exists', () => {
    expect(fs.existsSync(cssPath)).toBe(true);
  });
});

describe('Weapon Lab (LAB-NO2) — module surface', () => {
  it('src/test-lab/weapon-lab.ts exports startWeaponLab', () => {
    const tsSource = fs.readFileSync(tsPath, 'utf-8');
    expect(tsSource).toMatch(/export\s+function\s+startWeaponLab\s*\(/);
  });

  it('src/test-lab/weapon-lab.ts exports disposeWeaponLab for cleanup', () => {
    const tsSource = fs.readFileSync(tsPath, 'utf-8');
    expect(tsSource).toMatch(/export\s+function\s+disposeWeaponLab\s*\(/);
  });

  it('weapon-lab.html links the bundled CSS', () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toMatch(/href="\/src\/test-lab\/weapon-lab\.css"/);
  });

  it('weapon-lab.html bootstraps the lab via /src/test-lab/weapon-lab.ts', () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toMatch(/src="\/src\/test-lab\/weapon-lab\.ts"/);
  });
});

describe('Weapon Lab (LAB-NO2) — ship-select integration', () => {
  it('ship-select.ts references the LAB-NO2 icon label', () => {
    const src = fs.readFileSync(shipSelectPath, 'utf-8');
    // The user explicitly named the icon "LAB-NO2" — the button's
    // aria-label and title both carry it. Either match is sufficient.
    const hasLabel = src.includes('LAB-NO2');
    expect(hasLabel).toBe(true);
  });

  it('ship-select.ts links to the weapon-lab.html page', () => {
    const src = fs.readFileSync(shipSelectPath, 'utf-8');
    expect(src).toMatch(/\/test-lab\/weapon-lab\.html/);
  });

  it('ship-select.ts uses the dedicated weapon-lab-icon CSS class', () => {
    const src = fs.readFileSync(shipSelectPath, 'utf-8');
    expect(src).toMatch(/ship-select-weapon-lab-icon/);
  });
});
