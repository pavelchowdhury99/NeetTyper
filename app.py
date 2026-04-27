"""Web server for the programming typing assistant."""

from __future__ import annotations

import os
import random
from pathlib import Path

from flask import Flask, jsonify, render_template, request

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

BASE_DIR = Path(__file__).resolve().parent
RESOURCES = BASE_DIR / "resources"

# Add entries when you create e.g. resources/javascript/
EXTENSIONS_BY_LANGUAGE: dict[str, frozenset[str]] = {
    "python": frozenset({".py"}),
    "java": frozenset({".java"}),
    "cpp": frozenset({".cpp"}),
    "javascript": frozenset({".js"}),
}

LINKS_BY_LANGUAGE: dict[str, Path] = {
    "python": RESOURCES / "python_links.txt",
}


# Import replacer map for language-based URL transformation
def _load_replacer():
    """Load replacer map from replacer.py"""
    try:
        import sys

        sys.path.insert(0, str(RESOURCES))
        from replacer import replacer

        return replacer
    except Exception as e:
        print(f"Warning: Could not load replacer: {e}")
        return {}


REPLACER_MAP = _load_replacer()

app = Flask(__name__)


def _list_code_files(lang: str) -> list[Path]:
    folder = RESOURCES / lang
    exts = EXTENSIONS_BY_LANGUAGE.get(lang, frozenset({".py"}))
    if not folder.is_dir():
        return []
    return sorted(
        p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in exts
    )


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/languages", methods=["GET"])
def list_languages() -> tuple:
    """Return available languages from replacer map, links, and local folders."""
    langs = set()

    # Add all languages defined in replacer (they can all be generated from Python links)
    langs.update(REPLACER_MAP.keys())

    # Add languages that have link files
    langs.update(LINKS_BY_LANGUAGE.keys())

    # Add languages that have local folders (exclude Python-specific dirs)
    if RESOURCES.is_dir():
        for d in sorted(RESOURCES.iterdir()):
            if (
                d.is_dir()
                and not d.name.startswith(".")
                and d.name not in ("__pycache__", ".git")
            ):
                langs.add(d.name)

    return jsonify(languages=sorted(list(langs)))


@app.route("/api/random", methods=["GET"])
def random_snippet() -> tuple:
    lang = request.args.get("lang", "python")
    if not lang.replace("_", "").isalnum() or ".." in lang or "/" in lang:
        return jsonify(error="Invalid language"), 400

    # Try to fetch from Python links file (with URL replacement for other languages)
    if "python" in LINKS_BY_LANGUAGE and requests:
        try:
            python_links_file = LINKS_BY_LANGUAGE["python"]
            links = [
                line.strip()
                for line in python_links_file.read_text().split("\n")
                if line.strip()
            ]
            if links:
                url = random.choice(links)
                # Apply language replacements if needed
                if lang != "python" and lang in REPLACER_MAP:
                    url = _apply_replacements(url, lang)
                code, title = _fetch_code_from_github(url)
                if code:
                    return jsonify(
                        path=title or url,
                        text=code,
                        language=lang,
                    )
        except Exception as e:
            print(f"Error fetching from links: {e}")

    # Fallback to local files
    files = _list_code_files(lang)
    if not files:
        return jsonify(error="No code files for this language yet."), 404
    path = random.choice(files)
    text = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(RESOURCES))
    return jsonify(
        path=rel.replace(os.sep, "/"),
        text=text,
        language=lang,
    )


def _apply_replacements(url: str, lang: str) -> str:
    """Apply language-based replacements to the URL."""
    replacements = REPLACER_MAP.get(lang, {})
    for old, new in replacements.items():
        url = url.replace(old, new)
    return url


def _fetch_code_from_github(url: str) -> tuple[str, str]:
    """Fetch code from GitHub and convert 4-space indents to tabs."""
    if not requests or not BeautifulSoup:
        return "", ""

    try:
        # GitHub raw URLs
        if "github.com" in url and "/blob/" in url:
            # Convert to raw content URL
            raw_url = url.replace("github.com", "raw.githubusercontent.com").replace(
                "/blob/", "/"
            )
            resp = requests.get(raw_url, timeout=10)
            resp.raise_for_status()
            code = resp.text
            # Convert 4-space indents to tabs
            code = _spaces_to_tabs(code)
            # Extract filename from URL
            title = url.split("/")[-1]
            return code, title

        return "", ""
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return "", ""


def _spaces_to_tabs(code: str, spaces_per_indent: int = 4) -> str:
    """Convert leading spaces to tabs."""
    lines = code.split("\n")
    result = []
    for line in lines:
        # Count leading spaces
        stripped = line.lstrip(" ")
        num_spaces = len(line) - len(stripped)

        # Convert groups of spaces_per_indent to tabs
        num_tabs = num_spaces // spaces_per_indent
        remainder = num_spaces % spaces_per_indent

        # Build the new line
        new_line = "\t" * num_tabs + " " * remainder + stripped
        result.append(new_line)

    return "\n".join(result)


if __name__ == "__main__":
    import os
    # Detect if running in Docker or locally
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    debug = os.getenv("FLASK_ENV") != "production"
    app.run(host=host, port=5000, debug=debug)
