# Wiki Maintenance Guide for AI Agents

This document describes how to maintain the Bobcorn Wiki across all 16 language versions. The wiki uses static HTML files with shared CSS/JS, and a centralized `manifest.json` as the single source of truth for page state and translation status.

## Adding a New Page

1. **Create the English version** in `en/`. Use an existing page as a template — copy the full HTML structure including topbar, sidebar placeholder, article wrapper, prev/next nav, footer, and all script tags.

2. **Update `manifest.json`** — add a new entry to the `pages` array:
   ```json
   {
     "id": "new-page-id",
     "file": "new-page-id.html",
     "titleKey": "nav.newPageId",
     "section": "formats",
     "contentVersion": "1.0.0",
     "lastUpdated": "2026-04-04",
     "translationStatus": {
       "en": "complete",
       "zh-CN": "pending",
       "ja": "pending",
       "ko": "pending",
       "fr": "pending",
       "de": "pending",
       "es": "pending",
       "pt-BR": "pending",
       "it": "pending",
       "nl": "pending",
       "ru": "pending",
       "tr": "pending",
       "ar": "pending",
       "th": "pending",
       "vi": "pending",
       "id": "pending"
     }
   }
   ```

3. **Update `shared/nav.json`**:
   - Add the page to the correct section's `items` array: `{ "page": "new-page-id.html", "titleKey": "nav.newPageId" }`
   - Add the `nav.newPageId` string for **all 16 languages** in the `strings` object.

4. **Generate translations** for all 15 other languages. Place each translated HTML in its respective `{lang}/` directory. Ensure:
   - The `<html lang="...">` attribute matches the language code.
   - The `<title>` and `<meta name="description">` are translated.
   - All body content is translated.
   - Navigation chrome (topbar, sidebar) remains structurally identical.

5. **Run SEO injection**: `python docs/wiki/seo-inject.py` to add canonical, hreflang, Open Graph, and JSON-LD metadata to the new files.

6. **Run validation**: `python docs/wiki/validate.py` to verify everything is consistent.

7. **Update `manifest.json`** — set `translationStatus` to `"complete"` for all languages that have been translated.

## Updating Existing Content

1. **Edit the English version** in `en/`.

2. **Bump `contentVersion`** in `manifest.json` for that page (e.g., `"1.0.0"` -> `"1.1.0"`). Update `lastUpdated` to today's date.

3. **Reset translation status** — set all non-English `translationStatus` entries to `"outdated"`:
   ```json
   "translationStatus": {
     "en": "complete",
     "zh-CN": "outdated",
     "ja": "outdated",
     ...
   }
   ```

4. **Re-translate** affected languages with the updated content.

5. **Update `translationStatus`** back to `"complete"` for each language as it is re-translated.

6. **Run validation**: `python docs/wiki/validate.py`

## Translation Status Values

| Status | Meaning |
|--------|---------|
| `complete` | Translation matches current `contentVersion` |
| `outdated` | English content was updated; translation needs refresh |
| `pending` | Page exists in English but has not been translated yet |

## Cross-references

- **Landing page** (`docs/index.html`) links to wiki via the navigation bar.
- **Wiki pages** link back to the landing page via the topbar Bobcorn logo/name.
- **Export dialog** in the Bobcorn app links to wiki pages (see `ExportDialog.tsx`). When adding a new format page, also update the ExportDialog wiki links map.
- **Sitemap** (`docs/sitemap.xml`) must include all wiki pages. Re-run `python docs/wiki/seo-inject.py` to regenerate it after adding pages.
- **Internal links** between wiki pages use relative paths (e.g., `href="svg-font.html"` for same-language links).

## Validation

Always run before committing:

```bash
python docs/wiki/validate.py
```

The validator performs 5 checks:

1. **File existence** — every manifest page exists in all 16 language directories.
2. **SEO structure** — every HTML file has canonical, hreflang, og:title, and JSON-LD.
3. **Cross-references** — all internal `href` links resolve to existing files.
4. **Manifest sync** — no orphan files on disk, no missing files from manifest.
5. **Nav.json sync** — nav.json sections and pages match manifest entries.

All checks must pass (exit code 0). If any fail, fix the issues before committing.

Use `--fix` to auto-add orphan files to the manifest:

```bash
python docs/wiki/validate.py --fix
```

This adds new pages found in the default language directory (`en/`) to the manifest with `"pending"` translation status. You still need to manually set the correct `section` and add nav.json entries.

## File Structure Reference

```
docs/wiki/
├── index.html           <- Language redirect entry point
├── manifest.json        <- Page registry (single source of truth)
├── validate.py          <- Consistency checker
├── MAINTENANCE.md       <- This file
├── seo-inject.py        <- SEO metadata injector + sitemap generator
├── shared/
│   ├── wiki.css         <- Shared styles
│   ├── wiki.js          <- Sidebar, lang switch, animations
│   └── nav.json         <- Navigation data (16 languages)
└── {lang}/              <- 16 language directories
    ├── index.html
    ├── svg-font.html
    ├── ttf.html
    ├── woff.html
    ├── woff2.html
    ├── eot.html
    ├── css-font-face.html
    ├── svg-symbol.html
    └── export-guide.html
```

**Languages**: en, zh-CN, ja, ko, fr, de, es, pt-BR, it, nl, ru, tr, ar, th, vi, id

## Manifest Schema

Each page entry in `manifest.json`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique page identifier (matches filename without `.html`) |
| `file` | string | HTML filename |
| `titleKey` | string | Key into `nav.json` strings for the page title |
| `section` | string | Section ID (`overview`, `formats`, `usage`, `bobcorn`) |
| `contentVersion` | semver | Tracks content revisions for translation freshness |
| `lastUpdated` | date | ISO date of last English content change |
| `translationStatus` | object | Per-language status: `complete`, `outdated`, or `pending` |
