#!/usr/bin/env python3
"""
validate.py - Validate Bobcorn Wiki consistency across all 16 language versions.

Checks:
  1. File existence  - Every page in manifest exists in all language directories
  2. Structure       - Required SEO elements (canonical, hreflang, og:title, JSON-LD)
  3. Cross-references - Internal links point to files that actually exist
  4. Manifest sync   - manifest.json matches files on disk (no orphans, no missing)
  5. Nav.json sync   - nav.json sections match manifest sections

Usage:
    python docs/wiki/validate.py          # validate only
    python docs/wiki/validate.py --fix    # auto-update manifest for new files
"""

import argparse
import io
import json
import os
import re
import sys
from pathlib import Path
from datetime import date

# Ensure stdout handles Unicode (needed on Windows with GBK locale)
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

WIKI_DIR = Path(__file__).resolve().parent
SHARED_DIR = WIKI_DIR / "shared"
MANIFEST_PATH = WIKI_DIR / "manifest.json"
NAV_JSON_PATH = SHARED_DIR / "nav.json"


def load_manifest():
    """Load and parse manifest.json."""
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_nav():
    """Load and parse nav.json."""
    with open(NAV_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_manifest(manifest):
    """Write manifest.json back to disk."""
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---------------------------------------------------------------------------
# Check 1: File Existence
# ---------------------------------------------------------------------------

def check_file_existence(manifest):
    """Verify every page in manifest exists in all language directories."""
    languages = manifest["languages"]
    pages = manifest["pages"]
    errors = []

    for page in pages:
        filename = page["file"]
        for lang in languages:
            filepath = WIKI_DIR / lang / filename
            if not filepath.is_file():
                errors.append(f"Missing: {lang}/{filename}")

    return errors


# ---------------------------------------------------------------------------
# Check 2: Structure (SEO elements)
# ---------------------------------------------------------------------------

def check_structure(manifest):
    """Verify each HTML file has required SEO elements."""
    languages = manifest["languages"]
    pages = manifest["pages"]
    errors = []

    required_patterns = [
        ("canonical", r'<link\s+rel="canonical"'),
        ("hreflang", r'<link\s+rel="alternate"\s+hreflang='),
        ("og:title", r'<meta\s+property="og:title"'),
        ("JSON-LD", r'<script\s+type="application/ld\+json"'),
    ]

    for page in pages:
        filename = page["file"]
        for lang in languages:
            filepath = WIKI_DIR / lang / filename
            if not filepath.is_file():
                continue  # Already caught by check 1

            try:
                html = filepath.read_text(encoding="utf-8")
            except Exception as e:
                errors.append(f"Read error {lang}/{filename}: {e}")
                continue

            for label, pattern in required_patterns:
                if not re.search(pattern, html, re.IGNORECASE):
                    errors.append(f"Missing {label}: {lang}/{filename}")

    return errors


# ---------------------------------------------------------------------------
# Check 3: Cross-references (internal links)
# ---------------------------------------------------------------------------

def check_cross_references(manifest):
    """Verify all internal href links in <a> tags point to files that actually exist."""
    languages = manifest["languages"]
    pages = manifest["pages"]
    errors = []

    # Only match href inside <a ...> tags (not <link>, not inside <code>/<pre> examples)
    # This regex finds <a ... href="..." ...> patterns
    a_href_pattern = re.compile(r'<a\s[^>]*?href="([^"#]*)"', re.IGNORECASE)

    for page in pages:
        filename = page["file"]
        for lang in languages:
            filepath = WIKI_DIR / lang / filename
            if not filepath.is_file():
                continue

            try:
                html = filepath.read_text(encoding="utf-8")
            except Exception:
                continue

            # Strip content inside <pre> and <code> blocks to avoid false positives
            # from instructional code examples
            stripped = re.sub(r'<(pre|code)\b[^>]*>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)

            for match in a_href_pattern.finditer(stripped):
                href = match.group(1).strip()

                # Skip external links, empty, mailto, javascript, data URIs
                if not href or href.startswith(("http://", "https://", "mailto:", "javascript:", "data:")):
                    continue

                # Resolve the href relative to the current file's directory
                resolved = (filepath.parent / href).resolve()

                # Check if it exists (file or directory with index.html)
                if not resolved.exists():
                    # Check if it's a directory reference that should have index.html
                    if not (resolved / "index.html").exists():
                        errors.append(
                            f"Broken link in {lang}/{filename}: href=\"{href}\" -> {resolved}"
                        )

    return errors


# ---------------------------------------------------------------------------
# Check 4: Manifest Sync
# ---------------------------------------------------------------------------

def check_manifest_sync(manifest, fix=False):
    """Verify manifest.json matches actual files on disk."""
    languages = manifest["languages"]
    manifest_files = {p["file"] for p in manifest["pages"]}
    errors = []
    new_pages = []

    for lang in languages:
        lang_dir = WIKI_DIR / lang
        if not lang_dir.is_dir():
            errors.append(f"Missing language directory: {lang}/")
            continue

        disk_files = {f.name for f in lang_dir.iterdir() if f.is_file() and f.suffix == ".html"}

        # Orphans: files on disk not in manifest
        orphans = disk_files - manifest_files
        for orphan in sorted(orphans):
            errors.append(f"Orphan file (not in manifest): {lang}/{orphan}")
            if fix and lang == manifest["defaultLanguage"]:
                new_pages.append(orphan)

        # Missing: files in manifest not on disk
        missing = manifest_files - disk_files
        for m in sorted(missing):
            errors.append(f"Missing file (in manifest, not on disk): {lang}/{m}")

    # Auto-fix: add newly discovered pages to manifest
    if fix and new_pages:
        today = date.today().isoformat()
        for filename in sorted(set(new_pages)):
            page_id = filename.replace(".html", "")
            status = {lang: "pending" for lang in languages}
            status[manifest["defaultLanguage"]] = "complete"

            new_entry = {
                "id": page_id,
                "file": filename,
                "titleKey": f"nav.{page_id}",
                "section": "overview",
                "contentVersion": "1.0.0",
                "lastUpdated": today,
                "translationStatus": status,
            }
            manifest["pages"].append(new_entry)
            print(f"  [FIX] Added to manifest: {filename} (section: overview -- update manually)")

        save_manifest(manifest)

    return errors


# ---------------------------------------------------------------------------
# Check 5: Nav.json Sync
# ---------------------------------------------------------------------------

def check_nav_sync(manifest):
    """Verify nav.json sections/pages match manifest sections/pages."""
    errors = []

    try:
        nav = load_nav()
    except Exception as e:
        errors.append(f"Cannot load nav.json: {e}")
        return errors

    # Collect all pages referenced in nav.json
    nav_pages = set()
    nav_section_labels = set()
    for section in nav.get("sections", []):
        nav_section_labels.add(section.get("labelKey", ""))
        for item in section.get("items", []):
            nav_pages.add(item.get("page", ""))

    # Collect all pages and section IDs from manifest
    manifest_pages = {p["file"] for p in manifest["pages"]}
    manifest_section_ids = {s["id"] for s in manifest["sections"]}

    # Map manifest section IDs to expected nav labelKeys
    expected_nav_labels = {f"nav.{sid}" for sid in manifest_section_ids}

    # Check: every manifest page should appear in nav.json
    for mp in sorted(manifest_pages):
        if mp not in nav_pages:
            errors.append(f"Page in manifest but not in nav.json: {mp}")

    # Check: every nav.json page should appear in manifest
    for np in sorted(nav_pages):
        if np not in manifest_pages:
            errors.append(f"Page in nav.json but not in manifest: {np}")

    # Check: nav section labels should correspond to manifest sections
    for label in sorted(expected_nav_labels):
        if label not in nav_section_labels:
            errors.append(f"Manifest section missing from nav.json: {label}")

    # Check: nav.json has strings for all languages in manifest
    nav_strings = nav.get("strings", {})
    for lang in manifest["languages"]:
        if lang not in nav_strings:
            errors.append(f"nav.json missing strings for language: {lang}")

    return errors


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_check(name, errors):
    """Print a single check result."""
    if not errors:
        print(f"  \u2713 {name}")
    else:
        print(f"  \u2717 {name} ({len(errors)} issue{'s' if len(errors) != 1 else ''})")
        for err in errors:
            print(f"    - {err}")
    return len(errors)


def main():
    parser = argparse.ArgumentParser(description="Validate Bobcorn Wiki consistency")
    parser.add_argument("--fix", action="store_true", help="Auto-update manifest for new files")
    args = parser.parse_args()

    print("Bobcorn Wiki Validator")
    print("=" * 50)

    if not MANIFEST_PATH.is_file():
        print(f"ERROR: manifest.json not found at {MANIFEST_PATH}")
        sys.exit(1)

    manifest = load_manifest()
    lang_count = len(manifest["languages"])
    page_count = len(manifest["pages"])

    print(f"Languages: {lang_count}")
    print(f"Pages: {page_count}")
    print(f"Expected files: {lang_count * page_count}")
    print()

    total_errors = 0

    # 1. File existence
    total_errors += print_check("File existence", check_file_existence(manifest))

    # 2. Structure (SEO)
    total_errors += print_check("SEO structure", check_structure(manifest))

    # 3. Cross-references
    total_errors += print_check("Cross-references", check_cross_references(manifest))

    # 4. Manifest sync
    total_errors += print_check("Manifest sync", check_manifest_sync(manifest, fix=args.fix))

    # 5. Nav.json sync
    total_errors += print_check("Nav.json sync", check_nav_sync(manifest))

    print()
    if total_errors == 0:
        print(f"All checks passed. ({lang_count} languages x {page_count} pages = {lang_count * page_count} files)")
        sys.exit(0)
    else:
        print(f"FAILED: {total_errors} issue{'s' if total_errors != 1 else ''} found.")
        sys.exit(1)


if __name__ == "__main__":
    main()
