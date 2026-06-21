"""Web server for the programming typing assistant."""

from __future__ import annotations

import json
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
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

# ──────────────────────────────────────────────────────────────
# Vercel Blob Storage helpers
# ──────────────────────────────────────────────────────────────

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
BLOB_API = "https://blob.vercel-storage.com"

# File-based fallback for local dev (survives server restarts)
LOCAL_DATA_FILE = BASE_DIR / ".streak_local_data.json"


def _local_read_all() -> dict:
    try:
        if LOCAL_DATA_FILE.exists():
            return json.loads(LOCAL_DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _local_put(pathname: str, data: dict) -> None:
    store = _local_read_all()
    store[pathname] = data
    LOCAL_DATA_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")


def _local_get(pathname: str) -> dict | None:
    return _local_read_all().get(pathname)


def _local_delete(pathname: str) -> None:
    store = _local_read_all()
    store.pop(pathname, None)
    LOCAL_DATA_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")


def _use_local() -> bool:
    return not BLOB_TOKEN or requests is None


def _blob_put(pathname: str, data: dict) -> None:
    """Upload JSON data to Vercel Blob (or file-based local fallback)."""
    if _use_local():
        _local_put(pathname, data)
        return
    resp = requests.put(
        f"{BLOB_API}/{pathname}",
        headers={
            "Authorization": f"Bearer {BLOB_TOKEN}",
            "Content-Type": "application/json",
            "x-api-version": "7",
            "x-add-random-suffix": "0",
            "x-allow-overwrite": "1",          # required to update existing blobs
            "x-cache-control": "no-store",     # prevent CDN from caching stale JSON
        },
        data=json.dumps(data),
        timeout=15,
    )
    resp.raise_for_status()


def _blob_get(pathname: str) -> dict | None:
    """Fetch JSON data from Vercel Blob (or file-based local fallback)."""
    if _use_local():
        return _local_get(pathname)
    try:
        list_resp = requests.get(
            BLOB_API,
            headers={
                "Authorization": f"Bearer {BLOB_TOKEN}",
                "x-api-version": "7",
            },
            params={"prefix": pathname, "limit": 1},
            timeout=15,
        )
        list_resp.raise_for_status()
        blobs = list_resp.json().get("blobs", [])
        if not blobs:
            return None
        # downloadUrl is the direct origin URL — bypasses CDN cache entirely
        url = blobs[0].get("downloadUrl") or blobs[0]["url"]
        data_resp = requests.get(
            url, timeout=15,
            headers={"Cache-Control": "no-cache, no-store"},
        )
        data_resp.raise_for_status()
        return data_resp.json()
    except Exception as exc:
        print(f"Blob get error for {pathname}: {exc}")
        return None


def _blob_delete(pathname: str) -> None:
    """Delete a blob by pathname. Raises on failure."""
    if _use_local():
        _local_delete(pathname)
        return
    list_resp = requests.get(
        BLOB_API,
        headers={"Authorization": f"Bearer {BLOB_TOKEN}"},
        params={"prefix": pathname, "limit": 1},
        timeout=15,
    )
    list_resp.raise_for_status()
    blobs = list_resp.json().get("blobs", [])
    if not blobs:
        return
    url = blobs[0]["url"]
    del_resp = requests.delete(
        BLOB_API,
        headers={
            "Authorization": f"Bearer {BLOB_TOKEN}",
            "Content-Type": "application/json",
            "x-api-version": "7",
        },
        json={"urls": [url]},
        timeout=15,
    )
    del_resp.raise_for_status()


# ──────────────────────────────────────────────────────────────
# Streak tracker helpers
# ──────────────────────────────────────────────────────────────

def _normalize_username(username: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_]", "_", username.lower().strip())
    return cleaned[:64]


def _today_str() -> str:
    return date.today().isoformat()


def _yesterday_str() -> str:
    return (date.today() - timedelta(days=1)).isoformat()


def _user_pathname(username_normalized: str) -> str:
    return f"streak/users/{username_normalized}.json"


def _evaluate_streak_on_load(user: dict) -> dict:
    """Reset streak if yesterday wasn't completed; reset today's checks for a new day."""
    today = _today_str()
    yesterday = _yesterday_str()
    stored_today = user.get("today_date")
    last_complete = user.get("last_complete_date")

    if stored_today != today:
        # New calendar day
        if (
            last_complete is not None
            and last_complete != yesterday
            and last_complete != today
        ):
            user["streak"] = 0
        user["today_date"] = today
        user["today_checks"] = {}

    return user


def _apply_checks(user: dict, checks: dict) -> dict:
    """Save check states, increment streak when all done, reverse when not all done."""
    today = _today_str()

    user["today_date"] = today
    user["today_checks"] = checks

    items = user.get("checklist_items", [])
    if not items:
        return user

    all_done = all(checks.get(item["id"], False) for item in items)
    last_complete = user.get("last_complete_date")

    if all_done and last_complete != today:
        # All items just became complete for the first time today
        user["streak"] = user.get("streak", 0) + 1
        user["last_complete_date"] = today
    elif not all_done and last_complete == today:
        # A box was unchecked (or a new item added) after today was already marked complete
        user["streak"] = max(0, user.get("streak", 0) - 1)
        user["last_complete_date"] = None

    return user


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


@app.route("/streak")
def streak_page() -> str:
    return render_template("streak.html", username="")


@app.route("/streak/<path:username>")
def streak_user_page(username: str) -> str:
    return render_template("streak.html", username=username)


# ──────────────────────────────────────────────────────────────
# Streak API routes
# ──────────────────────────────────────────────────────────────

@app.route("/api/streak/users", methods=["POST"])
def create_streak_user() -> tuple:
    """Create a new streak user."""
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    if not username:
        return jsonify(error="Username is required"), 400

    normalized = _normalize_username(username)
    if not normalized:
        return jsonify(error="Invalid username"), 400

    pathname = _user_pathname(normalized)
    existing = _blob_get(pathname)
    if existing:
        return jsonify(error="A user with that name already exists"), 409

    initial_streak = int(data.get("initial_streak", 0) or 0)
    checklist_items = data.get("checklist_items", [])

    user = {
        "username": username,
        "normalized": normalized,
        "streak": initial_streak,
        "initial_streak": initial_streak,
        "checklist_items": checklist_items,
        "today_date": None,
        "today_checks": {},
        "last_complete_date": None,
    }

    try:
        _blob_put(pathname, user)
    except Exception:
        app.logger.exception("Storage error while creating streak user")
        return jsonify(error="Storage error"), 500

    return jsonify(user), 201


@app.route("/api/streak/user/<username>", methods=["GET"])
def get_streak_user(username: str) -> tuple:
    """Get a user's streak data, evaluating the streak for the current day."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    user = _evaluate_streak_on_load(user)
    try:
        _blob_put(pathname, user)
    except Exception as exc:
        print(f"Warning: could not save evaluated streak: {exc}")

    return jsonify(user)


@app.route("/api/streak/user/<username>/checklist", methods=["PUT"])
def update_checklist(username: str) -> tuple:
    """Replace the list of checklist items (titles only, not check state)."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    items = data.get("items", [])

    # Preserve existing check state for items that still exist
    existing_checks = user.get("today_checks", {})
    new_ids = {item["id"] for item in items}
    user["checklist_items"] = items
    surviving_checks = {k: v for k, v in existing_checks.items() if k in new_ids}

    # Re-evaluate streak — adding an unchecked item or removing a checked item
    # may change whether today is fully complete
    user = _apply_checks(user, surviving_checks)

    try:
        _blob_put(pathname, user)
    except Exception as exc:
        return jsonify(error=f"Storage error: {exc}"), 500

    return jsonify(user)


@app.route("/api/streak/user/<username>/checks", methods=["PUT"])
def update_checks(username: str) -> tuple:
    """Update today's check states and recalculate streak."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    checks = data.get("checks", {})

    user = _evaluate_streak_on_load(user)
    user = _apply_checks(user, checks)

    try:
        _blob_put(pathname, user)
    except Exception as exc:
        return jsonify(error=f"Storage error: {exc}"), 500

    return jsonify(user)


@app.route("/api/streak/user/<username>", methods=["DELETE"])
def delete_streak_user(username: str) -> tuple:
    """Delete a streak user profile."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    try:
        _blob_delete(pathname)
    except Exception as exc:
        print(f"Delete user error for {username!r}: {exc}")
        return jsonify(error="Could not delete profile"), 500
    return jsonify(ok=True)


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
