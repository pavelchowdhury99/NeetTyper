"""Web server for the programming typing assistant."""

from __future__ import annotations

import json
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.security import check_password_hash, generate_password_hash

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

BLOB_TOKEN    = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
BLOB_STORE_ID = os.environ.get("BLOB_STORE_ID", "")
BLOB_PREFIX   = os.environ.get("BLOB_PREFIX", "").strip("/")   # e.g. "pastie-bestie"
BLOB_API      = "https://blob.vercel-storage.com"

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


_BLOB_HEADERS = {
    "Authorization": f"Bearer {BLOB_TOKEN}",
    "x-api-version": "7",
}


def _full_path(pathname: str) -> str:
    """Prepend BLOB_PREFIX (e.g. 'pastie-bestie') when set."""
    return f"{BLOB_PREFIX}/{pathname}" if BLOB_PREFIX else pathname


def _blob_subdomain() -> str:
    """Derive the public URL subdomain from BLOB_STORE_ID.

    Vercel stores the ID as 'store_<hash>' but the subdomain is just '<hash>'.
    """
    return BLOB_STORE_ID.removeprefix("store_")


def _blob_direct_url(full_pathname: str) -> str | None:
    """Return the public blob URL built from BLOB_STORE_ID (no list call needed)."""
    sub = _blob_subdomain()
    if sub:
        return f"https://{sub}.public.blob.vercel-storage.com/{full_pathname}"
    return None


def _blob_find_url(full_pathname: str) -> str | None:
    """Locate a blob's URL via the list API (fallback when BLOB_STORE_ID absent)."""
    list_resp = requests.get(
        BLOB_API,
        headers=_BLOB_HEADERS,
        params={"prefix": full_pathname, "limit": 1},
        timeout=15,
    )
    list_resp.raise_for_status()
    blobs = list_resp.json().get("blobs", [])
    if not blobs:
        return None
    return blobs[0].get("downloadUrl") or blobs[0]["url"]


def _blob_put(pathname: str, data: dict) -> None:
    """Upload JSON data to Vercel Blob (or file-based local fallback)."""
    data["last_saved"] = datetime.now(timezone.utc).isoformat()
    if _use_local():
        _local_put(pathname, data)
        return
    full = _full_path(pathname)
    resp = requests.put(
        f"{BLOB_API}/{full}",
        headers={
            **_BLOB_HEADERS,
            "Content-Type": "application/json",
            "x-add-random-suffix": "0",
            "x-allow-overwrite": "1",
            "x-cache-control": "no-store",
        },
        data=json.dumps(data),
        timeout=15,
    )
    resp.raise_for_status()


def _blob_get(pathname: str) -> dict | None:
    """Fetch JSON data from Vercel Blob (or file-based local fallback)."""
    if _use_local():
        return _local_get(pathname)
    full = _full_path(pathname)
    try:
        # Direct URL if BLOB_STORE_ID is set (1 HTTP call); else list API
        url = _blob_direct_url(full) or _blob_find_url(full)
        if not url:
            return None
        data_resp = requests.get(url, timeout=15, headers={"Cache-Control": "no-cache, no-store"})
        if data_resp.status_code == 404:
            return None
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
    full = _full_path(pathname)
    url = _blob_direct_url(full) or _blob_find_url(full)
    if not url:
        return
    del_resp = requests.delete(
        BLOB_API,
        headers={**_BLOB_HEADERS, "Content-Type": "application/json"},
        json={"urls": [url]},
        timeout=15,
    )
    print(f"Blob delete {full}: HTTP {del_resp.status_code}")
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


def _default_typing_profile() -> dict:
    return {
        "totalXp": 0,
        "bestWpm": 0,
        "totalRounds": 0,
        "streakDays": 0,
        "lastPlayedDate": None,
        "achievements": [],
    }


def _sanitize_typing_profile(profile: dict | None) -> dict:
    """Keep only known typing-profile fields with safe types."""
    defaults = _default_typing_profile()
    if not isinstance(profile, dict):
        return defaults.copy()

    achievements = profile.get("achievements", [])
    if not isinstance(achievements, list):
        achievements = []

    return {
        "totalXp": int(profile.get("totalXp", defaults["totalXp"]) or 0),
        "bestWpm": int(profile.get("bestWpm", defaults["bestWpm"]) or 0),
        "totalRounds": int(profile.get("totalRounds", defaults["totalRounds"]) or 0),
        "streakDays": int(profile.get("streakDays", defaults["streakDays"]) or 0),
        "lastPlayedDate": profile.get("lastPlayedDate"),
        "achievements": [str(a) for a in achievements if a],
    }


def _public_user(user: dict) -> dict:
    """Return a copy safe to send to the client (no passkey hash)."""
    out = dict(user)
    out.pop("passkey_hash", None)
    return out


def _set_passkey(user: dict, passkey: str) -> None:
    user["passkey_hash"] = generate_password_hash(passkey)


def _passkey_required(user: dict) -> bool:
    return bool(user.get("passkey_hash"))


def _check_passkey(user: dict, passkey: str) -> bool:
    stored = user.get("passkey_hash")
    if not stored:
        return True
    return bool(passkey) and check_password_hash(stored, passkey)


def _save_is_stale(user: dict, known_last_saved: str | None) -> bool:
    """Return True if the stored data is newer than what the client knows about.

    This prevents a stale client from overwriting a more-recent save (e.g. from
    another device or tab).
    """
    stored = user.get("last_saved")
    if not stored or not known_last_saved:
        return False
    try:
        return stored > known_last_saved
    except Exception:
        return False


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
        user["day_start_streak"] = user.get("streak", 0)  # floor for today

    return user


def _apply_checks(user: dict, checks: dict) -> dict:
    """Save check states, increment streak when all done, revert to day-start on un-complete.

    Streak rules:
    - Increments by 1 the first time all items are checked today.
    - If un-completed (a box unchecked / item added), streak reverts to the
      value stored in 'day_start_streak' — never an unbounded -1.
    - Streak only reaches 0 via the missed-day reset in _evaluate_streak_on_load.
    """
    today = _today_str()

    user["today_date"] = today
    user["today_checks"] = checks

    items = user.get("checklist_items", [])
    if not items:
        return user

    all_done = all(checks.get(item["id"], False) for item in items)
    last_complete = user.get("last_complete_date")

    if all_done and last_complete != today:
        # First completion today — save day-start streak before incrementing
        user.setdefault("day_start_streak", user.get("streak", 0))
        user["streak"] = user.get("streak", 0) + 1
        user["last_complete_date"] = today
        # Append to history (keep last 365 days)
        hist = user.get("completed_dates", [])
        if today not in hist:
            hist = sorted(set(hist) | {today})[-365:]
        user["completed_dates"] = hist
    elif not all_done and last_complete == today:
        # Un-completing today — floor at day_start_streak, remove today from history
        user["streak"] = user.get("day_start_streak", max(0, user.get("streak", 1) - 1))
        user["last_complete_date"] = None
        user["completed_dates"] = [d for d in user.get("completed_dates", []) if d != today]

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
    return render_template("index.html", username="")


@app.route("/user/<path:username>")
def typing_user_page(username: str) -> str:
    return render_template("index.html", username=username)


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
    passkey = str(data.get("passkey", "")).strip()
    if len(passkey) < 4:
        return jsonify(error="Passkey must be at least 4 characters"), 400

    user = {
        "username": username,
        "normalized": normalized,
        "streak": initial_streak,
        "initial_streak": initial_streak,
        "checklist_items": checklist_items,
        "today_date": None,
        "today_checks": {},
        "last_complete_date": None,
        "typing_profile": _default_typing_profile(),
        "notes": "",
    }
    _set_passkey(user, passkey)

    try:
        _blob_put(pathname, user)
    except Exception as exc:
        return jsonify(error=f"Storage error: {exc}"), 500

    return jsonify(_public_user(user)), 201


@app.route("/api/streak/user/<username>", methods=["GET"])
def get_streak_user(username: str) -> tuple:
    """Get a user's streak data, evaluating the streak for the current day."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    user = _evaluate_streak_on_load(user)
    user.setdefault("typing_profile", _default_typing_profile())
    try:
        _blob_put(pathname, user)
    except Exception as exc:
        print(f"Warning: could not save evaluated streak: {exc}")

    return jsonify(_public_user(user))


@app.route("/api/streak/user/<username>/login", methods=["POST"])
def login_streak_user(username: str) -> tuple:
    """Verify passkey and return the user's public profile."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    passkey = str(data.get("passkey", ""))

    if _passkey_required(user) and not _check_passkey(user, passkey):
        return jsonify(error="Incorrect passkey"), 401

    user = _evaluate_streak_on_load(user)
    user.setdefault("typing_profile", _default_typing_profile())
    try:
        _blob_put(pathname, user)
    except Exception as exc:
        print(f"Warning: could not save evaluated streak on login: {exc}")

    return jsonify(_public_user(user))


@app.route("/api/streak/user/<username>/passkey", methods=["PUT"])
def change_passkey(username: str) -> tuple:
    """Change the profile passkey (current passkey required when one is set)."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    current = str(data.get("current_passkey", ""))
    new_passkey = str(data.get("new_passkey", "")).strip()

    if len(new_passkey) < 4:
        return jsonify(error="New passkey must be at least 4 characters"), 400

    if _passkey_required(user) and not _check_passkey(user, current):
        return jsonify(error="Incorrect passkey"), 401

    if _passkey_required(user) and check_password_hash(user["passkey_hash"], new_passkey):
        return jsonify(error="New passkey must be different"), 400

    _set_passkey(user, new_passkey)
    try:
        _blob_put(pathname, user)
    except Exception:
        return jsonify(error="Storage error"), 500

    return jsonify(ok=True)


@app.route("/api/streak/user/<username>/typing", methods=["PUT"])
def update_typing_profile(username: str) -> tuple:
    """Update the typing gamification profile stored on the user blob."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    known_last_saved = data.get("known_last_saved")

    if _save_is_stale(user, known_last_saved):
        return jsonify(_public_user(user))

    user["typing_profile"] = _sanitize_typing_profile(data.get("typing_profile"))

    try:
        _blob_put(pathname, user)
    except Exception:
        return jsonify(error="Storage error"), 500

    return jsonify(_public_user(user))


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
    known_last_saved = data.get("known_last_saved")

    if _save_is_stale(user, known_last_saved):
        return jsonify(_public_user(user))

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

    return jsonify(_public_user(user))


@app.route("/api/streak/user/<username>/checks", methods=["PUT"])
def update_checks(username: str) -> tuple:
    """Update today's check states and recalculate streak."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    checks           = data.get("checks", {})
    known_last_saved = data.get("known_last_saved")
    client_streak    = data.get("streak")           # client sends its current value
    client_lcd       = data.get("last_complete_date")  # client sends its current value

    if _save_is_stale(user, known_last_saved):
        return jsonify(_public_user(user))

    user = _evaluate_streak_on_load(user)

    # If client supplied authoritative streak/last_complete_date, use them
    if client_streak is not None:
        user["streak"] = int(client_streak)
    if client_lcd is not None:
        user["last_complete_date"] = client_lcd

    user = _apply_checks(user, checks)

    try:
        _blob_put(pathname, user)
    except Exception as exc:
        return jsonify(error=f"Storage error: {exc}"), 500

    return jsonify(_public_user(user))


@app.route("/api/streak/user/<username>/sync", methods=["PUT"])
def sync_streak_user(username: str) -> tuple:
    """Force-write the complete client state to blob storage as-is."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)

    # Make sure the user actually exists first
    existing = _blob_get(pathname)
    if existing is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    # Reject obviously bad payloads
    if "username" not in data:
        return jsonify(error="Invalid state payload"), 400

    # Preserve fields streak sync may omit
    if "typing_profile" not in data and existing.get("typing_profile"):
        data["typing_profile"] = existing["typing_profile"]
    if "notes" not in data and existing.get("notes") is not None:
        data["notes"] = existing["notes"]
    if "passkey_hash" not in data and existing.get("passkey_hash"):
        data["passkey_hash"] = existing["passkey_hash"]

    try:
        _blob_put(pathname, data)
    except Exception as exc:
        return jsonify(error=f"Storage error: {exc}"), 500

    return jsonify(_public_user(data))


@app.route("/api/streak/user/<username>", methods=["DELETE"])
def delete_streak_user(username: str) -> tuple:
    """Delete a streak user profile (passkey required when set)."""
    normalized = _normalize_username(username)
    pathname = _user_pathname(normalized)
    user = _blob_get(pathname)
    if user is None:
        return jsonify(error="User not found"), 404

    data = request.get_json(silent=True) or {}
    passkey = str(data.get("passkey", ""))
    if _passkey_required(user) and not _check_passkey(user, passkey):
        return jsonify(error="Incorrect passkey"), 401

    try:
        _blob_delete(pathname)
    except Exception as exc:
        print(f"Delete user error for {username!r}: {exc}")
        return jsonify(error=f"Could not delete profile: {exc}"), 500
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
