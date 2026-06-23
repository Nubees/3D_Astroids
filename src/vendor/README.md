# Vendor Directory

This directory contains a verbatim copy of `LightningStrike` and `SimplexNoise`
from the three.js r149 `examples/jsm/` tree, pulled on 2026-06-23 for the
Phase 6d crystal-lightning FX.

## Why vendor instead of depending on `three-stdlib`

three.js r150 removed these files from `examples/jsm/`. The community
maintains them in the `three-stdlib` npm package, but we only need two
files for one feature, and adding a new dep for that is heavier than
copying ~500 lines into the repo.

## License

MIT (Copyright © 2010–present three.js authors). Both files retain their
original MIT terms; the provenance block at the top of each file is the
only added content.

## What is edited

The algorithm is byte-identical to the r149 sources. The only edits are:

1. The `Vendor Provenance` block prepended to the top of each file.
2. The single `import { SimplexNoise } from '../math/SimplexNoise.js'`
   in `LightningStrike.js` has been rewritten to
   `'./three-r149-SimplexNoise.js'` so both files live flat in this
   directory.

A diff against upstream will show only those two edits.

## Files

- `three-r149-SimplexNoise.js` — 4D simplex noise (verbatim from
  `https://github.com/mrdoob/three.js/blob/r149/examples/jsm/math/SimplexNoise.js`)
- `three-r149-LightningStrike.js` — fractal subdivision lightning geometry
  (verbatim from
  `https://github.com/mrdoob/three.js/blob/r149/examples/jsm/geometries/LightningStrike.js`)

## Upgrading

If a future three.js release restores these in `examples/jsm/`, or if the
project decides to switch to `three-stdlib`, the consumers in
`src/crystal-fx.ts` import from `./vendor/three-r149-LightningStrike.js`
and would only need a one-line import path change.
