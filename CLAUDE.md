# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
uv sync

# Run locally (http://127.0.0.1:5000)
uv run python app.py

# Run with Docker
docker-compose up
docker-compose up --build   # after code changes
```

There is no test suite.

## Architecture

**NeetTyper** is a single-page Flask app for practicing typing with real LeetCode solutions from the [NeetCode GitHub repo](https://github.com/neetcode-gh/leetcode).

### Backend (`app.py`)

- Flask serves the SPA at `/`, plus `/api/languages` and `/api/random`.
- `/api/random?lang=<lang>&max_length=<n>` fetches a random code snippet. It reads Python links from `resources/python_links.txt`, transforms the URL via the replacer map for non-Python languages, then fetches from GitHub raw content. Falls back to local files in `resources/<lang>/`.
- Fetching is parallelized: `ThreadPoolExecutor` fires 10 concurrent requests per batch, up to 5 batches (50 total attempts) to find a snippet matching the optional `max_length` word count.
- All fetched code is normalized: 4-space indents are converted to tabs (`_spaces_to_tabs`), because the frontend tracks tab keypresses as part of the exercise.

### Language support (`resources/replacer.py`)

All 792 Python problem links live in `resources/python_links.txt`. Non-Python languages are served by transforming those URLs with string replacements defined in `resources/replacer.py` (e.g., `"python" → "java"`, `".py" → ".java"`). To add a new language:
1. Add an entry to `replacer` in `resources/replacer.py`.
2. Add the language + file extension to `EXTENSIONS_BY_LANGUAGE` in `app.py`.

### Frontend (`static/js/typing.js`)

Vanilla JS IIFE — no framework. Flow:
1. `loadLanguages()` populates the language dropdown via `/api/languages`.
2. `startRound()` fetches a snippet, sets the module-level `target` string, and renders the reference panel.
3. The `<textarea>` (`fill-typing-input`) captures keystrokes; `onFillKeyDown` intercepts Tab to insert `\t` directly.
4. `renderFillReference()` re-renders the reference panel on every input event, marking each character as `done`, `wrong`, or `cursor`.
5. `evaluateFill()` (triggered by Evaluate button) does a final character-by-character diff and calls `showFillResults()`.

**WPM formula**: `(correctChars / 5) / minutes`. Correct chars = total compared chars minus errors.

**Finger tracking**: `fingerMap` maps every key to a finger label (L-pinky, R-index, Thumbs, etc.). Results show both per-key and per-finger mistake counts. The "Count backspaces" toggle controls whether backspace keystrokes and missing/extra characters are counted as errors.

### Templates & static

- `templates/index.html` — the only HTML template; contains all three panels (setup, fill-blanks, results) toggled via `hidden` attribute.
- `static/css/style.css` — light/dark theme via `prefers-color-scheme`; no build step needed.
