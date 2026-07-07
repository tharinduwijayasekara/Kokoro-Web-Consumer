# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Orator** is a static web app for reading EPUBs/text files as audiobooks. Users upload books, see a library, open books, and read with full playback controls and TTS customization (voice, speed, pitch, pitch, colors, fonts).

**Tech:** Vanilla JS + jQuery, Bootstrap 5, epubjs, howler.js, Dexie.js (IndexedDB), Pickr color picker.

## Project Structure

Self-contained within `/orator` folder:
- `index.html`: Entry point with view templates
- `js/app.js`: Main orchestration, view routing
- `js/utils/`: Services (storage, reader, settings, import, auth)
- `css/styles.css`: Styles (dark theme)
- `js/default/defaults.js`: Voice lists, default config
- `images/`, `fonts/`, `audio/`: Static assets

## Core Services

- **StorageService**: IndexedDB wrapper (books, data, audios tables) for progress, settings, cached TTS audio
- **ReaderService**: Playback logic, paragraph buffering, progress tracking (chapterIdx::paragraphIdx::%)
- **SettingsService**: Real-time config binding (TTS endpoint/voice, speed, pitch, font, colors)
- **ImportEpub/ImportText**: Parse files into chapter arrays
- **LoginService**: Auth checks, offline mode support

## Running Locally

Static site—serve with any HTTP server (can't use file:// due to IndexedDB CORS):
```bash
python -m http.server 8000
# Then: http://localhost:8000/orator/
```

Dev mode: set `window.ORATOR.isProd = false` in index.html to bust cache.

## Key Patterns

- Dynamic script loading in app.js before initialization
- Templates: `<script type="text/html" id="template-*">` rendered via `App.fromTemplate()`
- Audio cached paragraph-level in IndexedDB; offline playback from cache
- Progress: `orator.reading[bookId] = "chapterIdx::paragraphIdx::percent"`
- TTS endpoints: Kokoro (default) or EdgeTTS, user-selectable in settings
