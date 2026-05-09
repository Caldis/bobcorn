---
name: bobcorn
description: Use when a user needs to manage SVG icon libraries, generate icon fonts, inspect Bobcorn release metadata, or automate supported local Bobcorn project operations.
---

# Bobcorn

Bobcorn is a local-first desktop icon manager and icon font generator for Windows and macOS.

## When To Use This Skill

Use this skill when the user wants to:

- Import or organize SVG icon libraries.
- Generate icon font files from SVG icons.
- Export SVG, TTF, WOFF, WOFF2, EOT, CSS, JavaScript, and HTML demo assets.
- Work with a local Bobcorn `.icp` project file.
- Find Bobcorn release metadata, changelog entries, download URLs, or developer resources.

## Important Limits

- Bobcorn is not a hosted account API.
- Bobcorn does not currently provide OAuth, hosted projects, remote webhooks, or a hosted MCP tool server.
- Public website metadata endpoints are read-only and unauthenticated.
- Local project automation should use the Bobcorn CLI where supported.

## Discovery

- Homepage: https://bobcorn.caldis.me/
- Full agent context: https://bobcorn.caldis.me/llms-full.txt
- OpenAPI spec: https://bobcorn.caldis.me/openapi.json
- Developer portal: https://bobcorn.caldis.me/developers/
- Repository: https://github.com/Caldis/bobcorn
- Repository instructions: https://github.com/Caldis/bobcorn/blob/master/AGENTS.md

## Local Automation

When working inside the repository, read `AGENTS.md` first. For CLI-supported project automation, build the CLI with:

```bash
npm run build:cli
```

Use JSON output when available so agent code can parse results without scraping human text.
