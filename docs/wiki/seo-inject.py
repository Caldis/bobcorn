#!/usr/bin/env python3
"""
seo-inject.py - Batch inject SEO metadata into Bobcorn Wiki HTML files
(canonical, hreflang, Open Graph, Twitter Card, JSON-LD).

IMPORTANT - docs/sitemap.xml and docs/robots.txt are HAND-MAINTAINED:
    These two files describe the *entire* bobcorn.caldis.me site, not just
    the wiki. They contain a lot of content this script knows nothing about:
    the landing page, /about.html, /contact, /pricing.md, /alternatives/*,
    /guides/*, /developers/, /api/* (+ openapi.json), /status.*, agent
    discovery files (llms.txt, agent.json, ai-plugin.json, SKILL.md,
    schemamap.xml), per-crawler robots rules (GPTBot/ClaudeBot/PerplexityBot/
    CCBot/ByteSpider/...) and the Content-Signal directive.

    This script only knows how to build the *wiki* subset (11 pages x 16
    languages) of sitemap.xml, and a bare-bones robots.txt. It must NOT
    blindly overwrite these files, or it will destroy the hand-maintained
    content above (see docs/HANDOFF.md known issue #4).

    Default behavior: if sitemap.xml / robots.txt already exist, this script
    leaves them untouched and only prints what the wiki portion of the
    sitemap should look like, so a human/agent can merge new wiki pages in
    by hand. Pass --force-seo-files to actually overwrite them (only do this
    if you understand you will lose the hand-maintained content, or are
    re-adding it afterwards).

Usage:
    python seo-inject.py                  # inject SEO into HTML, report sitemap/robots status
    python seo-inject.py --force-seo-files  # ALSO overwrite sitemap.xml/robots.txt (destructive)
"""

import argparse
import os
import re
import json
from datetime import date
from pathlib import Path

# --- Configuration ---

BASE_URL = "https://bobcorn.caldis.me/wiki/"
SITE_URL = "https://bobcorn.caldis.me/"
ICON_URL = "https://bobcorn.caldis.me/icon.png"
TODAY = "2026-04-04"

LANGUAGES = [
    "en", "zh-CN", "ja", "ko", "fr", "de", "es", "pt-BR",
    "it", "nl", "ru", "tr", "ar", "th", "vi", "id",
]

PAGES = [
    "index.html",
    "svg-font.html",
    "ttf.html",
    "woff.html",
    "woff2.html",
    "eot.html",
    "css-font-face.html",
    "svg-symbol.html",
    "export-guide.html",
    "cli.html",
    "cli-setup.html",
]

WIKI_DIR = Path(__file__).parent  # D:\Code\bobcorn-wiki\docs\wiki
DOCS_DIR = WIKI_DIR.parent        # D:\Code\bobcorn-wiki\docs


def extract_title(html: str) -> str:
    """Extract content of <title> tag."""
    m = re.search(r"<title>(.*?)</title>", html, re.DOTALL)
    return m.group(1).strip() if m else "Bobcorn Wiki"


def extract_description(html: str) -> str:
    """Extract content attribute of <meta name="description">."""
    m = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def escape_json_string(s: str) -> str:
    """Escape a string for safe embedding in JSON inside HTML."""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def escape_html_attr(s: str) -> str:
    """Escape for HTML attribute values."""
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def build_seo_block(lang: str, page: str, title: str, description: str) -> str:
    """Build the SEO HTML block to inject before </head>."""
    canonical = f"{BASE_URL}{lang}/{page}"
    lines = []

    lines.append("")
    lines.append("    <!-- SEO metadata (auto-injected by seo-inject.py) -->")

    # 1. Canonical URL
    lines.append(f'    <link rel="canonical" href="{canonical}">')

    # 2. Hreflang tags
    lines.append(f'    <link rel="alternate" hreflang="x-default" href="{BASE_URL}en/{page}">')
    for l in LANGUAGES:
        lines.append(f'    <link rel="alternate" hreflang="{l}" href="{BASE_URL}{l}/{page}">')

    # 3. Open Graph
    escaped_title = escape_html_attr(title)
    escaped_desc = escape_html_attr(description)
    lines.append(f'    <meta property="og:type" content="article">')
    lines.append(f'    <meta property="og:url" content="{canonical}">')
    lines.append(f'    <meta property="og:title" content="{escaped_title}">')
    lines.append(f'    <meta property="og:description" content="{escaped_desc}">')
    lines.append(f'    <meta property="og:site_name" content="Bobcorn Wiki">')
    lines.append(f'    <meta property="og:image" content="{ICON_URL}">')

    # 4. Twitter Card
    lines.append(f'    <meta name="twitter:card" content="summary">')
    lines.append(f'    <meta name="twitter:title" content="{escaped_title}">')
    lines.append(f'    <meta name="twitter:description" content="{escaped_desc}">')

    # 5. JSON-LD Structured Data
    json_title = escape_json_string(title)
    json_desc = escape_json_string(description)

    if page == "index.html":
        breadcrumb_items = [
            {"@type": "ListItem", "position": 1, "name": "Bobcorn", "item": SITE_URL},
            {"@type": "ListItem", "position": 2, "name": "Wiki", "item": canonical},
        ]
    else:
        breadcrumb_items = [
            {"@type": "ListItem", "position": 1, "name": "Bobcorn", "item": SITE_URL},
            {"@type": "ListItem", "position": 2, "name": "Wiki", "item": f"{BASE_URL}{lang}/index.html"},
            {"@type": "ListItem", "position": 3, "name": title, "item": canonical},
        ]

    jsonld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                "headline": title,
                "description": description,
                "url": canonical,
                "inLanguage": lang,
                "isPartOf": {
                    "@type": "WebSite",
                    "name": "Bobcorn",
                    "url": SITE_URL,
                },
                "publisher": {
                    "@type": "Person",
                    "name": "Caldis",
                    "url": "https://github.com/Caldis",
                },
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": breadcrumb_items,
            },
        ],
    }

    jsonld_str = json.dumps(jsonld, ensure_ascii=False, indent=4)
    # Indent each line of JSON-LD by 4 spaces for nice formatting in <head>
    jsonld_indented = "\n".join("    " + line for line in jsonld_str.split("\n"))

    lines.append(f"    <script type=\"application/ld+json\">")
    lines.append(jsonld_indented)
    lines.append(f"    </script>")

    return "\n".join(lines) + "\n"


def inject_seo_into_file(filepath: Path, lang: str, page: str) -> bool:
    """
    Inject SEO metadata into an HTML file before </head>.
    Returns True if the file was modified, False if skipped.
    """
    html = filepath.read_text(encoding="utf-8")

    # Skip if already injected
    if 'rel="canonical"' in html:
        return False

    title = extract_title(html)
    description = extract_description(html)

    seo_block = build_seo_block(lang, page, title, description)

    # Insert before </head>
    new_html = html.replace("</head>", seo_block + "</head>", 1)

    if new_html == html:
        print(f"  WARNING: Could not find </head> in {filepath}")
        return False

    filepath.write_text(new_html, encoding="utf-8")
    return True


def build_wiki_sitemap_urls():
    """Build the <url> blocks for just the wiki pages this script knows about
    (landing page + PAGES x LANGUAGES). This is NOT the full site sitemap —
    see the module docstring for everything else sitemap.xml also needs to
    contain."""
    lines = []

    # Landing page
    lines.append("    <url>")
    lines.append(f"        <loc>{SITE_URL}</loc>")
    lines.append(f"        <lastmod>{TODAY}</lastmod>")
    lines.append("    </url>")

    # Wiki pages
    for page in PAGES:
        for lang in LANGUAGES:
            url = f"{BASE_URL}{lang}/{page}"
            lines.append("    <url>")
            lines.append(f"        <loc>{url}</loc>")
            lines.append(f"        <lastmod>{TODAY}</lastmod>")

            # x-default
            lines.append(f'        <xhtml:link rel="alternate" hreflang="x-default" href="{BASE_URL}en/{page}"/>')
            # All language alternates
            for alt_lang in LANGUAGES:
                alt_url = f"{BASE_URL}{alt_lang}/{page}"
                lines.append(f'        <xhtml:link rel="alternate" hreflang="{alt_lang}" href="{alt_url}"/>')

            lines.append("    </url>")

    return lines


def generate_sitemap(force=False):
    """(Re)generate sitemap.xml — but only for the wiki-only subset this
    script understands. docs/sitemap.xml is hand-maintained and covers the
    whole site (see module docstring), so by default we do NOT overwrite an
    existing file; we just report whether the wiki pages we know about are
    already present (a full URL-by-URL diff is left to `git diff` / manual
    review since we can't reliably tell the human/agent apart from the
    hand-maintained non-wiki entries).
    """
    sitemap_path = DOCS_DIR / "sitemap.xml"

    body_lines = build_wiki_sitemap_urls()
    wiki_urls = {
        line.split("<loc>", 1)[1].split("</loc>", 1)[0]
        for line in body_lines
        if "<loc>" in line
    }

    if sitemap_path.is_file() and not force:
        existing = sitemap_path.read_text(encoding="utf-8")
        missing = [u for u in wiki_urls if u not in existing]
        print(f"\n{sitemap_path} already exists - leaving it untouched (hand-maintained).")
        if missing:
            print(f"  NOTE: {len(missing)} wiki URL(s) from the current PAGES/LANGUAGES")
            print(f"  config are not present in it yet. Add them by hand, e.g.:")
            for u in sorted(missing)[:20]:
                print(f"    - {u}")
            if len(missing) > 20:
                print(f"    ... and {len(missing) - 20} more")
        else:
            print(f"  All {len(wiki_urls)} known wiki URLs are already present.")
        print(f"  Pass --force-seo-files to overwrite (destroys hand-maintained content).")
        return

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    lines.append('        xmlns:xhtml="http://www.w3.org/1999/xhtml">')
    lines.extend(body_lines)
    lines.append("</urlset>")

    if sitemap_path.is_file() and force:
        print(f"\nWARNING: --force-seo-files given, overwriting {sitemap_path}.")
        print(f"  This DISCARDS any hand-maintained non-wiki entries (see module docstring).")

    sitemap_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Generated: {sitemap_path}")


def generate_robots(force=False):
    """(Re)generate robots.txt. docs/robots.txt is hand-maintained (per-crawler
    rules, Content-Signal, Schemamap) so by default we do NOT touch an
    existing file."""
    robots_path = DOCS_DIR / "robots.txt"

    if robots_path.is_file() and not force:
        print(f"{robots_path} already exists - leaving it untouched (hand-maintained).")
        print(f"  Pass --force-seo-files to overwrite (destroys hand-maintained content).")
        return

    content = f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}sitemap.xml
"""
    if robots_path.is_file() and force:
        print(f"WARNING: --force-seo-files given, overwriting {robots_path}.")
        print(f"  This DISCARDS any hand-maintained crawler rules (see module docstring).")

    robots_path.write_text(content, encoding="utf-8")
    print(f"Generated: {robots_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Inject SEO metadata into Bobcorn Wiki HTML files."
    )
    parser.add_argument(
        "--force-seo-files",
        action="store_true",
        help=(
            "Also overwrite docs/sitemap.xml and docs/robots.txt. "
            "DESTRUCTIVE: these files are hand-maintained and contain content "
            "(non-wiki pages, AI-crawler rules, Content-Signal, Schemamap) "
            "this script does not know about. Off by default."
        ),
    )
    args = parser.parse_args()

    print(f"SEO Inject for Bobcorn Wiki")
    print(f"Wiki dir: {WIKI_DIR}")
    print(f"Base URL: {BASE_URL}")
    print(f"Languages: {len(LANGUAGES)}")
    print(f"Pages per language: {len(PAGES)}")
    print(f"Total expected files: {len(LANGUAGES) * len(PAGES)}")
    print()

    modified = 0
    skipped = 0
    errors = 0

    for lang in LANGUAGES:
        lang_dir = WIKI_DIR / lang
        if not lang_dir.is_dir():
            print(f"  WARNING: Language directory not found: {lang_dir}")
            errors += 1
            continue

        for page in PAGES:
            filepath = lang_dir / page
            if not filepath.is_file():
                print(f"  WARNING: File not found: {filepath}")
                errors += 1
                continue

            result = inject_seo_into_file(filepath, lang, page)
            if result:
                modified += 1
                print(f"  Injected: {lang}/{page}")
            else:
                skipped += 1
                print(f"  Skipped (already has SEO): {lang}/{page}")

    print(f"\n--- Summary ---")
    print(f"Modified: {modified}")
    print(f"Skipped:  {skipped}")
    print(f"Errors:   {errors}")
    print(f"Total:    {modified + skipped + errors}")

    # Generate sitemap and robots.txt (hand-maintained; see module docstring)
    generate_sitemap(force=args.force_seo_files)
    generate_robots(force=args.force_seo_files)

    print(f"\nDone!")


if __name__ == "__main__":
    main()
