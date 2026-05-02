---
fileMatch: ["**/*.ts", "**/*.tsx"]
---

# Code Standards

## TypeScript Rules

- Strict mode always on — no `any`, no `@ts-ignore`
- Prefer `type` over `interface` for object shapes
- All function parameters and return values must be typed
- Use `unknown` instead of `any` when type is genuinely unknown, then narrow with guards

## Component Rules

- Functional components only
- One responsibility per component — if it does more than one thing, split it
- Props must be typed with a named `type Props = { ... }` above the component
- No inline arrow functions inside JSX — extract to a named `const`

## Import Order

1. Framework imports (React, Next.js, etc.)
2. Third-party libraries
3. Internal lib / types / schemas (absolute paths)
4. Relative imports
5. Styles

## Forbidden Patterns

- No `console.log` in committed code — use structured logging
- No hardcoded strings for UI copy — use a named `COPY` const
- No magic numbers — use named constants
- No TODO comments without a linked issue: `// TODO(#42): ...`

## Async Patterns

- Always `try/catch` in API routes
- Prefer `async/await` over `.then()` chains
- Use `.safeParse()` (or equivalent) before processing any external input

## Comments

- Comments explain WHY, not WHAT
- Remove all debug/temporary comments before merging
