# Code Style — Game Code

## Formatting
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length 100

## Naming
- `PascalCase` for classes, interfaces, enums, and game systems
- `camelCase` for variables, functions, methods
- `UPPER_SNAKE_CASE` for `readonly` constants and config values

## Imports
- Group: external libs → internal absolute (`src/`) → relative (`./`)
- Avoid `import * as` unless library requires it
- Prefer named exports over default exports

## Game Patterns
- Keep game logic under `src/`. No logic in `public/`.
- Pure utility functions live in `src/utils/` and must be unit-testable
- State mutation only inside update loops or event handlers
- Avoid raw `setTimeout` / `setInterval` in game logic — use engine timers

## Types
- Explicit return types on public methods
- Use `readonly` for injected dependencies and config
- Export shared types from a central `src/types.ts` (or engine-appropriate location)
