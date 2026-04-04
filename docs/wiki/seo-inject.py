#!/usr/bin/env python3
"""
seo-inject.py - Batch inject SEO metadata into Bobcorn Wiki HTML files,
then generate sitemap.xml and robots.txt.

Usage:
    python seo-inject.py
"""

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


def generate_sitemap():
    """Generate sitemap.xml with all wiki pages and hreflang alternates."""
    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    lines.append('        xmlns:xhtml="http://www.w3.org/1999/xhtml">')

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

    lines.append("</urlset>")

    sitemap_path = DOCS_DIR / "sitemap.xml"
    sitemap_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nGenerated: {sitemap_path}")


def generate_robots():
    """Generate robots.txt."""
    content = f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}sitemap.xml
"""
    robots_path = DOCS_DIR / "robots.txt"
    robots_path.write_text(content, encoding="utf-8")
    print(f"Generated: {robots_path}")


def main():
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

    # Generate sitemap and robots.txt
    generate_sitemap()
    generate_robots()

    print(f"\nDone!")


if __name__ == "__main__":
    main()
