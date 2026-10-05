# Code intelligence

GitNexus is no longer a required project dependency. Do not block implementation, review, or commits on GitNexus availability.

Code intelligence tools are optional aids. Use repository search, tests, type checking, code review, and available tooling to assess impact.

## CodeGraph (optional)

When a local environment provides `codegraph`, it can be used for focused navigation:

- `codegraph context "task description"` for relevant code context.
- `codegraph callers <symbol>` / `codegraph callees <symbol>` for relationships.
- `codegraph affected` to identify likely affected tests.
- `codegraph sync` to refresh its local index.

Lack of CodeGraph must not block changes. CI and repository tests are the authoritative gates.

## Source file size

- Keep hand-written source files at or below **300 lines** whenever practical.
- Split large UI/controllers by responsibility instead of extending god files.
- CI rejects changed source files above 300 lines.
- A larger file requires an explicit `opdf-file-size-allow: <reason>` marker near the top and a concrete technical reason; do not use the marker to avoid normal refactoring.

