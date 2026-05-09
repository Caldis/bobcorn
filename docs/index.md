# Bobcorn

Bobcorn is a free, open-source desktop app for managing SVG icon libraries and generating icon fonts on Windows and macOS.

Import SVGs, organize icons into groups, search large libraries, edit colors, and export production-ready assets in SVG, TTF, WOFF, WOFF2, EOT, CSS, JavaScript, HTML demo, and `.icp` project formats.

## Download

- Latest release: https://github.com/Caldis/bobcorn/releases/latest
- All releases: https://github.com/Caldis/bobcorn/releases
- Source code: https://github.com/Caldis/bobcorn

## Developer And Agent Resources

- Developer portal: https://bobcorn.caldis.me/developers/
- API docs: https://bobcorn.caldis.me/api/
- OpenAPI spec: https://bobcorn.caldis.me/openapi.json
- Auth docs: https://bobcorn.caldis.me/api/auth.html
- Webhooks docs: https://bobcorn.caldis.me/api/webhooks.html
- MCP discovery: https://bobcorn.caldis.me/.well-known/mcp
- Agent discovery: https://bobcorn.caldis.me/.well-known/agent.json
- A2A agent card: https://bobcorn.caldis.me/.well-known/agent-card.json
- Full LLM context: https://bobcorn.caldis.me/llms-full.txt

## Current Public Metadata Endpoints

- `GET /release.json`: current version, release URLs, and download URLs.
- `GET /changelog.json`: release notes.
- `GET /llms.txt`: concise agent context.
- `GET /llms-full.txt`: full product context for agents.
- `GET /openapi.json`: OpenAPI description for public static metadata endpoints.

## Access Model

Bobcorn is local-first. Public website metadata does not require authentication. Bobcorn does not currently provide hosted projects, OAuth, user accounts, remote webhooks, or a hosted MCP server.
