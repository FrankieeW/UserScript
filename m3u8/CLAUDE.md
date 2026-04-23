# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Tampermonkey/Greasyfork Userscript** (`m3u8.js`) that:
- Auto-detects m3u8 video URLs on any webpage
- Displays a floating UI panel (top-right) with detected videos
- Provides download, copy, and play buttons for each detected video
- Also handles magnet URLs (btih) with copy/play button injection

## Architecture

Single-file Userscript (~1200 lines) with these key components:

| Component | Lines | Purpose |
|-----------|-------|---------|
| `mgmapi` object | 74-421 | Abstraction layer for GM_* APIs with cross-browser compatibility |
| Download strategies | 134-213 | 3-tier fallback: anchor tag → CORS+FileSystem API → GM_xmlhttpRequest |
| M3U8 detection | 505-538 | Intercepts Response.text() and XMLHttpRequest to detect m3u8 content |
| Video detection | 744-760 | Polls `<video>` elements every 1s for direct video sources |
| Magnet URL handling | 969-1182 | Regex detection + DOM injection of copy/play buttons |
| UI rendering | 540-913 | Shadow DOM-based floating panel with drag-to-move |

## Key Implementation Details

### Download Strategy Pattern
```
Strategy 1: Same-origin → <a> download
Strategy 2: CORS + FileSystem API → streaming download with progress
Strategy 3: GM_xmlhttpRequest → blob download
```

### GM API Compatibility Layer
The script handles both `GM_getValue` and `GM.getValue` patterns for cross-browser Tampermonkey/Violentmonkey compatibility.

### M3U8 Parsing
Uses external `m3u8-parser` library (CDN: jsdelivr) to parse m3u8 manifest and calculate total duration.

### Localization
Built-in i18n with `T_langs` object supporting `en` and `zh-CN`.

## Development Notes

- **No build step** — userscript runs directly in browser
- **External dependency**: m3u8-parser@4.7.1 loaded via `@require`
- **Special hosts**: `tools.thatwind.com` and `localhost:3000` have proxy fetch logic
- **QQ Mail fix**: `mail.qq.com` is explicitly excluded to prevent infinite reload
