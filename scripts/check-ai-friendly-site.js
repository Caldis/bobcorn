const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const siteUrl = 'https://bobcorn.caldis.me';

const failures = [];
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function readText(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath} is missing.`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function expectIncludes(relativePath, expected, label) {
  const text = readText(relativePath);
  if (!text.includes(expected)) {
    failures.push(`${relativePath} does not include ${label || expected}.`);
  }
}

function expectFile(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath} is missing.`);
  }
}

function checkIndexHtml() {
  const html = readText('docs/index.html');
  if (!html) return;

  const expectedFragments = [
    'rel="alternate" type="text/markdown" href="/index.md"',
    'rel="alternate" type="text/plain" href="/llms.txt"',
    'rel="alternate" type="text/plain" href="/llms-full.txt"',
    'rel="service-desc" type="application/vnd.oai.openapi+json" href="/openapi.json"',
    'rel="service-desc" type="application/json" href="/.well-known/agent.json"',
    'rel="service-desc" type="application/json" href="/.well-known/agent-card.json"',
    'function renderAgentMode()',
    'searchParams.get(\'mode\') === \'agent\'',
    '[data-agent-hidden] { display: none !important; }',
    '<section class="developer-resources"',
    '<section class="agent-notes" id="why-bobcorn"',
    '<section class="agent-notes" id="alternatives"',
    '<section class="agent-notes" id="getting-started"',
    '<section class="agent-notes" id="faq"',
    '<article class="agent-notes" id="workflow-guide"',
    'href="/contact"',
    'href="/AGENTS.md"',
    'href="/pricing.md"',
    'data-i18n="why.compare">Read the Bobcorn vs IcoMoon comparison</a>',
    'id="alternatives" aria-labelledby="alternatives-title" data-agent-hidden="true"',
    'id="faq" aria-labelledby="faq-title" data-agent-hidden="true"',
    'id="developers" aria-labelledby="developers-title" data-agent-hidden="true"',
    '"@type": "Organization"',
    '"@type": "ContactPage"',
    '"@type": "HowTo"',
    '"sameAs":',
    '"SpeakableSpecification"',
    'IcoMoon alternative',
  ];

  expectedFragments.forEach((fragment) => {
    if (!html.includes(fragment)) {
      failures.push(`docs/index.html is missing ${fragment}.`);
    }
  });

  const imageTags = html.match(/<img\b[^>]*>/g) || [];
  const meaningful = imageTags.filter((tag) => {
    const alt = tag.match(/\salt="([^"]*)"/)?.[1]?.trim() || '';
    if (alt.length <= 5) return false;
    if (/^(image|logo|icon|screenshot|bobcorn)$/i.test(alt)) return false;
    if (/\.(png|jpe?g|webp|svg)$/i.test(alt)) return false;
    return true;
  });

  if (imageTags.length === 0) {
    failures.push('docs/index.html has no image tags.');
  } else if (meaningful.length / imageTags.length < 0.8) {
    failures.push(
      `docs/index.html meaningful image alt coverage is ${meaningful.length}/${imageTags.length}, expected at least 80%.`
    );
  }
}

function checkLlms() {
  [
    'docs/llms.txt',
    'docs/llms-full.txt',
    'docs/.well-known/llms.txt',
    'docs/api/llms.txt',
    'docs/developers/llms.txt',
    'docs/docs/llms.txt',
    'docs/agent-skills/bobcorn/SKILL.md',
    'docs/.well-known/agent-skills/index.json',
    'docs/alternatives/icomoon.html',
    'docs/guides/icon-font-workflow.html',
    'docs/contact/index.html',
    'docs/AGENTS.md',
    'docs/pricing.md',
    'docs/api/auth.json',
    'docs/api/rate-limits.json',
    'docs/api/errors.json',
    'docs/status.json',
    'docs/api/rate-limits.html',
    'docs/api/errors.html',
    'docs/status.html',
  ].forEach(expectFile);

  const llms = readText('docs/llms.txt');
  [
    'Bobcorn API docs',
    'Bobcorn OpenAPI spec',
    'Bobcorn developer portal',
    'Bobcorn auth docs',
    'Bobcorn webhooks',
    'Bobcorn MCP status',
    `[Bobcorn MCP status](${siteUrl}/api/mcp.html)`,
    `[Bobcorn agent skill](${siteUrl}/agent-skills/bobcorn/SKILL.md)`,
    `[Bobcorn vs IcoMoon comparison](${siteUrl}/alternatives/icomoon.html)`,
    `[SVG to icon font workflow guide](${siteUrl}/guides/icon-font-workflow.html)`,
    `[Website copy of AGENTS.md](${siteUrl}/AGENTS.md)`,
    `[Pricing](${siteUrl}/pricing.md)`,
    `[Bobcorn auth JSON](${siteUrl}/api/auth.json)`,
    `[Bobcorn rate limits](${siteUrl}/api/rate-limits.json)`,
    `[Bobcorn error model](${siteUrl}/api/errors.json)`,
    `[Bobcorn status](${siteUrl}/status.json)`,
    'Use Bobcorn when the user needs',
    'IcoMoon alternative',
    'Do not assume OAuth',
  ].forEach((phrase) => {
    if (!llms.includes(phrase)) {
      failures.push(`docs/llms.txt does not list ${phrase}.`);
    }
  });

  const full = readText('docs/llms-full.txt');
  if (full && full.length < 2500) {
    failures.push('docs/llms-full.txt is too short to be useful full context.');
  }
}

function checkDiscoveryFiles() {
  const agent = readJson('docs/.well-known/agent.json');
  const rootAgent = readJson('docs/agent.json');
  const plugin = readJson('docs/.well-known/ai-plugin.json');
  const rootPlugin = readJson('docs/ai-plugin.json');
  const card = readJson('docs/.well-known/agent-card.json');
  const skills = readJson('docs/.well-known/agent-skills/index.json');

  if (agent && agent.name !== 'Bobcorn') {
    failures.push('docs/.well-known/agent.json name must be Bobcorn.');
  }

  if (rootAgent && rootAgent.name !== 'Bobcorn') {
    failures.push('docs/agent.json name must be Bobcorn.');
  }

  if (plugin && plugin.name_for_human !== 'Bobcorn') {
    failures.push('docs/.well-known/ai-plugin.json name_for_human must be Bobcorn.');
  }

  if (rootPlugin && rootPlugin.name_for_human !== 'Bobcorn') {
    failures.push('docs/ai-plugin.json name_for_human must be Bobcorn.');
  }

  if (card && card.name !== 'Bobcorn') {
    failures.push('docs/.well-known/agent-card.json name must be Bobcorn.');
  }

  if (card && card.version !== pkg.version) {
    failures.push(
      `docs/.well-known/agent-card.json version is "${card.version}", expected "${pkg.version}".`
    );
  }

  if (skills && skills.$schema !== 'https://schemas.agentskills.io/discovery/0.2.0/schema.json') {
    failures.push('docs/.well-known/agent-skills/index.json must use the v0.2.0 schema URL.');
  }

  if (skills && skills.version !== '0.2.0') {
    failures.push('docs/.well-known/agent-skills/index.json must use version 0.2.0.');
  }
}

function checkOpenApi() {
  const openApi = readJson('docs/openapi.json');
  const apiOpenApi = readJson('docs/api/openapi.json');

  if (openApi && openApi.openapi !== '3.1.0') {
    failures.push('docs/openapi.json must use OpenAPI 3.1.0.');
  }

  if (openApi && openApi.info?.version !== pkg.version) {
    failures.push(`docs/openapi.json version is "${openApi.info?.version}", expected "${pkg.version}".`);
  }

  [
    '/api/auth.json',
    '/api/rate-limits.json',
    '/api/errors.json',
    '/status.json',
  ].forEach((apiPath) => {
    if (openApi && !openApi.paths?.[apiPath]?.get?.description) {
      failures.push(`docs/openapi.json is missing a documented GET operation for ${apiPath}.`);
    }
  });

  if (apiOpenApi && apiOpenApi.openapi !== '3.1.0') {
    failures.push('docs/api/openapi.json must use OpenAPI 3.1.0.');
  }

  if (apiOpenApi && apiOpenApi.info?.version !== pkg.version) {
    failures.push(
      `docs/api/openapi.json version is "${apiOpenApi.info?.version}", expected "${pkg.version}".`
    );
  }

  [
    '/api/auth.json',
    '/api/rate-limits.json',
    '/api/errors.json',
    '/status.json',
  ].forEach((apiPath) => {
    if (apiOpenApi && !apiOpenApi.paths?.[apiPath]?.get?.description) {
      failures.push(`docs/api/openapi.json is missing a documented GET operation for ${apiPath}.`);
    }
  });
}

function checkRobotsAndSchema() {
  const robots = readText('docs/robots.txt');
  [
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    'User-agent: CCBot',
    'User-agent: ByteSpider',
    'Schemamap: https://bobcorn.caldis.me/schemamap.xml',
  ].forEach((line) => {
    if (!robots.includes(line)) {
      failures.push(`docs/robots.txt is missing ${line}.`);
    }
  });

  const schemaMap = readText('docs/schemamap.xml');
  [
    `${siteUrl}/schema/software-application.json`,
    `${siteUrl}/schema/developer-resources.jsonl`,
    `${siteUrl}/release.json`,
    `${siteUrl}/changelog.json`,
    `${siteUrl}/.well-known/agent-skills/index.json`,
    `${siteUrl}/api/auth.json`,
    `${siteUrl}/api/rate-limits.json`,
    `${siteUrl}/api/errors.json`,
    `${siteUrl}/status.json`,
  ].forEach((url) => {
    if (!schemaMap.includes(url)) {
      failures.push(`docs/schemamap.xml does not reference ${url}.`);
    }
  });

  const appSchema = readJson('docs/schema/software-application.json');
  if (appSchema && appSchema.softwareVersion !== pkg.version) {
    failures.push(
      `docs/schema/software-application.json softwareVersion is "${appSchema.softwareVersion}", expected "${pkg.version}".`
    );
  }
}

function checkMarkdownAndHeaders() {
  const markdown = readText('docs/index.md');
  if (markdown && !markdown.startsWith('# Bobcorn')) {
    failures.push('docs/index.md must start with "# Bobcorn".');
  }

  const headers = readText('docs/_headers');
  [
    'Link: </sitemap.xml>; rel="sitemap"',
    '</index.md>; rel="alternate"; type="text/markdown"',
    '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    '</.well-known/agent.json>; rel="service-desc"; type="application/json"',
  ].forEach((header) => {
    if (!headers.includes(header)) {
      failures.push(`docs/_headers is missing ${header}.`);
    }
  });
}

checkIndexHtml();
checkLlms();
checkDiscoveryFiles();
checkOpenApi();
checkRobotsAndSchema();
checkMarkdownAndHeaders();
expectIncludes('AGENTS.md', 'Bobcorn', 'Bobcorn agent instructions');
expectIncludes('.cursorrules', 'AGENTS.md', 'Cursor agent rules');

if (failures.length > 0) {
  process.stderr.write(`AI-friendly site check failed:\n- ${failures.join('\n- ')}\n`);
  process.exit(1);
}

process.stdout.write('AI-friendly site files are present and internally consistent.\n');
