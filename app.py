"""Web server for the programming typing assistant."""

from __future__ import annotations

import os
import random
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file

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


@app.route("/sitemap.xml", methods=["GET"])
def sitemap() -> tuple:
    """Serve sitemap.xml for SEO."""
    sitemap_path = BASE_DIR / "seo" / "sitemap.xml"
    if sitemap_path.exists():
        return send_file(sitemap_path, mimetype="application/xml")
    # Return a basic sitemap if file doesn't exist
    return """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://neettyper.com/</loc>
    <lastmod>2026-04-27</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>""", 200, {"Content-Type": "application/xml"}


@app.route("/robots.txt", methods=["GET"])
def robots() -> tuple:
    """Serve robots.txt for search engine crawlers."""
    robots_path = BASE_DIR / "seo" / "robots.txt"
    if robots_path.exists():
        return send_file(robots_path, mimetype="text/plain")
    # Return a basic robots.txt if file doesn't exist
    return """User-agent: *
Allow: /
Sitemap: https://neettyper.com/sitemap.xml""", 200, {"Content-Type": "text/plain"}


@app.route("/llms.txt", methods=["GET"])
def llms() -> tuple:
    """Serve llms.txt for LLM crawlers."""
    llms_path = BASE_DIR / "seo" / "llms.txt"
    if llms_path.exists():
        return send_file(llms_path, mimetype="text/plain")
    # Return a basic llms.txt if file doesn't exist
    return """# NeetTyper - Programming Typing Practice
Allow: *""", 200, {"Content-Type": "text/plain"}


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


def _count_words(text: str) -> int:
    """Count words in code text. Splits on whitespace."""
    return len(text.split())


def _fetch_single_snippet(lang: str, links: list[str] | None, local_files: list[Path]) -> tuple[str, str, str]:
    """Fetch a single random snippet. Returns (code, title, source_type)."""
    # Try GitHub links first if available
    if links and requests:
        try:
            url = random.choice(links)
            # Apply language replacements if needed
            if lang != "python" and lang in REPLACER_MAP:
                url = _apply_replacements(url, lang)
            code, title = _fetch_code_from_github(url)
            if code:
                return code, title or url, "github"
        except Exception as e:
            print(f"Error fetching from GitHub: {e}")
    
    # Fallback to local files
    if local_files:
        try:
            path = random.choice(local_files)
            text = path.read_text(encoding="utf-8")
            rel = str(path.relative_to(RESOURCES))
            return text, rel.replace(os.sep, "/"), "local"
        except Exception as e:
            print(f"Error reading local file: {e}")
    
    return "", "", ""


@app.route("/api/random", methods=["GET"])
def random_snippet() -> tuple:
    lang = request.args.get("lang", "python")
    max_words = request.args.get("max_length", type=int)
    
    if not lang.replace("_", "").isalnum() or ".." in lang or "/" in lang:
        return jsonify(error="Invalid language"), 400

    # Prepare sources
    links = None
    if "python" in LINKS_BY_LANGUAGE and requests:
        try:
            python_links_file = LINKS_BY_LANGUAGE["python"]
            links = [
                line.strip()
                for line in python_links_file.read_text().split("\n")
                if line.strip()
            ]
        except Exception as e:
            print(f"Error loading links: {e}")
    
    local_files = _list_code_files(lang)
    
    if not links and not local_files:
        return jsonify(error="No code files for this language yet."), 404

    # Fetch in batches of 10 in parallel
    batch_size = 10
    max_batches = 5  # Try up to 5 batches (50 total attempts)
    
    for batch_num in range(max_batches):
        # Use ThreadPoolExecutor to fetch multiple snippets in parallel
        with ThreadPoolExecutor(max_workers=batch_size) as executor:
            futures = [
                executor.submit(_fetch_single_snippet, lang, links, local_files)
                for _ in range(batch_size)
            ]
            
            # Check results as they complete
            for future in futures:
                try:
                    code, title, source_type = future.result(timeout=5)
                    
                    # Check if code meets word count requirement
                    if code:
                        word_count = _count_words(code)
                        if max_words is None or word_count <= max_words:
                            return jsonify(
                                path=title,
                                text=code,
                                language=lang,
                            )
                except Exception as e:
                    print(f"Error in parallel fetch: {e}")
                    continue
    
    # If we exhausted all attempts without finding suitable code
    return jsonify(
        error=f"Could not find code under {max_words} words after {max_batches * batch_size} attempts. Try a higher limit."
    ), 404


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
    # app.run(host=host, port=5000, debug=debug)
    app.run()
