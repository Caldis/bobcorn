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
- MCP status: https://bobcorn.caldis.me/api/mcp.html
- Agent discovery: https://bobcorn.caldis.me/.well-known/agent.json
- A2A agent card: https://bobcorn.caldis.me/.well-known/agent-card.json
- Full LLM context: https://bobcorn.caldis.me/llms-full.txt
- Agent skill: https://bobcorn.caldis.me/agent-skills/bobcorn/SKILL.md
- Contact: https://bobcorn.caldis.me/contact/
- Bobcorn vs IcoMoon: https://bobcorn.caldis.me/alternatives/icomoon.html
- Icon font workflow guide: https://bobcorn.caldis.me/guides/icon-font-workflow.html

## Why Bobcorn

Bobcorn is different from browser-only icon font tools because the project stays local, works as a desktop app, and saves a reusable `.icp` project file. Bobcorn can be used as an IcoMoon alternative or Fontello alternative when the workflow needs local library management, repeated export, and no hosted workspace. Compared with icon organizers that only catalogue assets, Bobcorn also generates web font outputs.

## Getting Started

1. Download Bobcorn from GitHub Releases.
2. Import SVG icons by dragging files or folders into the app.
3. Organize icons into groups and edit colors when needed.
4. Export fonts and web assets in SVG, TTF, WOFF, WOFF2, EOT, CSS, JavaScript, and HTML demo formats.
5. Save the project as a `.icp` file for later editing.

## Current Public Metadata Endpoints

- `GET /release.json`: current version, release URLs, and download URLs.
- `GET /changelog.json`: release notes.
- `GET /llms.txt`: concise agent context.
- `GET /llms-full.txt`: full product context for agents.
- `GET /openapi.json`: OpenAPI description for public static metadata endpoints.

## Access Model

Bobcorn is local-first. Public website metadata does not require authentication. Bobcorn does not currently provide hosted projects, OAuth, user accounts, remote webhooks, or a hosted MCP server.

## FAQ

### What is Bobcorn used for?

Bobcorn manages local SVG icon libraries and exports icon font packages for web projects, including SVG, TTF, WOFF, WOFF2, EOT, CSS, JavaScript, HTML demos, and reusable `.icp` project files.

### Is Bobcorn an IcoMoon alternative?

Yes. Bobcorn can be used as an IcoMoon alternative or Fontello alternative when the workflow needs a local desktop app, saved project files, repeatable export, and no hosted workspace.

### Does Bobcorn have OAuth or a hosted API?

No. Bobcorn is a local-first desktop app. The public website exposes static metadata such as release JSON, changelog JSON, OpenAPI documentation, and discovery files, but it does not host user projects or accounts.

### Does Bobcorn provide a hosted MCP server?

No hosted MCP server is available today. Agents should use `llms.txt`, `llms-full.txt`, OpenAPI metadata, the GitHub repository, and the local CLI workflow where applicable.
