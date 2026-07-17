# Bobcorn Agent Instructions

This file publishes the repository agent rules at a predictable website URL for crawlers that cannot inspect GitHub repository files directly.

Canonical repository instructions:

- GitHub AGENTS.md: https://github.com/Caldis/bobcorn/blob/master/AGENTS.md
- Raw AGENTS.md: https://raw.githubusercontent.com/Caldis/bobcorn/master/AGENTS.md
- Cursor rules: https://github.com/Caldis/bobcorn/blob/master/.cursorrules

Core rules:

- Bobcorn is an Electron and React desktop app for managing SVG icon libraries and generating icon font files.
- Read `AGENTS.md`, `docs/CLI.md`, and `docs/MIGRATION.md` before making repository changes.
- Keep user-visible app strings in i18n files.
- Put new user operations in `src/core/operations/` first; store actions should be thin wrappers.
- Do not import `database/` directly from components.
- SVG content must be sanitized with `sanitizeSVG()` before rendering.
- Do not manually edit generated `out/` files.
- Website pages (this docs/ site) follow the design spec at [/DESIGN.md](https://bobcorn.caldis.me/DESIGN.md); shared tokens and component classes live in `/assets/site.css`.

For agent-readable product context, use:

- https://bobcorn.caldis.me/llms.txt
- https://bobcorn.caldis.me/llms-full.txt
- https://bobcorn.caldis.me/openapi.json
- https://bobcorn.caldis.me/.well-known/agent.json
