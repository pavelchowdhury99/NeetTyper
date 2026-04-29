# [NeetTyper](https://neet-typer.vercel.app/)

A **programming typing assistant** designed to improve your coding speed and accuracy by practicing with real LeetCode problems. Type Python, Java, C++, or JavaScript solutions while the app tracks your **words per minute (WPM)**, **accuracy**, and identifies which **keys and fingers** are causing the most mistakes.

## Features

### 🎯 Core Typing Practice
- **Real code snippets** from LeetCode (via [NeetCode GitHub repository](https://github.com/neetcode-gh/leetcode))
- **Preview mode** — study the code before the timer starts
- **Live statistics** — WPM, progress %, and time displayed in real-time
- **Visual progress bar** — animated bar showing typing completion percentage
- **Tab-aware indentation** — Practice proper indentation with visible tab markers (`⇥`)
- **Whitespace visualization** — See tabs (`⇥`), spaces (·), and newlines (`↵`) clearly marked
- **Automatic retry logic** — seamlessly retries up to 50 concurrent requests across 5 batches if code is unavailable
- **Code length filtering** — select max snippet length (25, 50, 100, 200, or 500 words)

### 📊 Detailed Results & Analytics
- **Net WPM** — calculated as (correct characters ÷ 5) ÷ minutes
- **Accuracy %** — ratio of correct to total keystrokes
- **Top 10 struggling keys** — sorted by frequency of mistakes
- **Finger analysis** — identifies which fingers/hands are weakest
  - Left/Right hand breakdown
  - Pinky, Ring, Middle, Index finger tracking
  - Helps identify typing technique issues
- **Configurable error counting** — toggle whether to count initial keypresses for finger analysis (useful for comparing pure accuracy vs. finger technique)

### 🎨 Visual Feedback
- **Character-by-character tracking**:
  - Green (`✓`) for correctly typed characters
  - Red (`✗`) with strikethrough for mistakes
  - Cursor animation shows your current position in real-time
- **Backspace support** — correct mistakes and update stats instantly
- **System theme detection** — automatically adapts to your OS theme preference (dark/light)
  - Dark mode: GitHub-inspired dark colors
  - Light mode: Clean, bright colors for daytime use
- **Whitespace symbol toggle** — hide/show visual markers (`⇥`, `↵`) while maintaining indentation
- **Direct problem links** — clickable links to NeetCode and LeetCode for each problem
- **Side-by-side code comparison in Fill-in-the-Blanks** — see expected code vs. your input simultaneously

### 🌐 Content Sources
- **LeetCode problems** from NeetCode's curated Python solutions (792 problems)
- **Multi-language support** — Java, C++, JavaScript, Python (auto-generated from Python links using replacer map)
- **Extensible architecture** — add new languages via simple configuration
- **Direct problem navigation** — auto-generated links to NeetCode and LeetCode

### ⌨️ Proper Key Handling
- **Tab key** — typed as actual tab character (not 4 spaces)
- **Enter key** — newlines are part of the exercise
- **Backspace** — fully functional for corrections
- **All special characters** — symbols, brackets, operators

## Setup & Installation

### Prerequisites
- **Python 3.10+**
- **uv** (fast Python package manager) — [install here](https://docs.astral.sh/uv/getting-started/installation/)
- **Git** (optional, for cloning)

### Local Setup

1. **Clone or navigate to the project**:
   ```bash
   cd /path/to/neet-typer
   ```

2. **Sync dependencies with uv**:
   ```bash
   uv sync
   ```

3. **Run the app**:
   ```bash
   uv run python app.py
   ```

4. **Open in browser**:
   ```
   http://127.0.0.1:5000
   ```

### Docker Setup

**Prerequisites:**
- Docker and Docker Compose installed

**Quick Start:**
```bash
# Navigate to project
cd /path/to/neet-typer

# Start container
docker-compose up

# App will be available at http://localhost:5000
```

**Building manually:**
```bash
# Build image
docker build -t neettyper:latest .

# Run container
docker run -p 5000:5000 neettyper:latest
```

**Available Commands:**
```bash
# Build and start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down

# Rebuild image after changes
docker-compose up --build
```

**Volume Mounts:**
- `./resources/` is mounted, so you can add/modify code snippets without rebuilding

### Project Structure

```
neet-typer/
├── pyproject.toml              # uv project config & dependencies
├── uv.lock                     # uv lock file (commit to git)
├── Dockerfile                  # Container image definition
├── docker-compose.yaml         # Docker Compose configuration
├── .dockerignore               # Files to exclude from Docker build
├── app.py                      # Flask backend
├── README.md                   # This file
├── sitemap.xml                 # SEO sitemap for search engines
├── robots.txt                  # Search engine crawler directives
├── llms.txt                    # LLM training data policy
│
├── templates/
│   └── index.html             # Main UI (single-page app)
│
├── static/
│   ├── css/
│   │   └── style.css          # Responsive theme styling (dark/light) + progress bar
│   └── js/
│       └── typing.js          # Typing logic, finger mapping, problem links, retry logic
│
└── resources/
    ├── replacer.py            # Language URL transformation map
    ├── python_links.txt       # 792 LeetCode Python problem links
    └── python/
        ├── async_task.py      # Local fallback snippets (with tabs)
        ├── data_model.py
        └── utils_helpers.py
```

## How to Use

### Getting Started

1. **Open NeetTyper** at `http://127.0.0.1:5000` (or your deployment URL)
2. **Language Selection** — Choose from available languages (Python, Java, C++, JavaScript)
3. **Code Length** — Select max snippet length (25, 50, 100, 200, or 500 words)
4. **Error Tracking** — Toggle "Track initial key presses" to include/exclude first attempts in finger analysis
5. **Click "Start"** to begin your practice session

### Practice Workflow

1. **Select a language** (Python, Java, C++, or JavaScript)
   - The app randomly picks a problem from `resources/python_links.txt` and transforms the URL for your language
   - Falls back to local files if fetch fails
   - Retries up to 50 times across 5 parallel batches to find code

2. **Click "Start"**
   - Code loads in **preview mode** (no timer yet)
   - Study the code structure, logic, and syntax
   - Take as much time as you need to understand it
   - Once ready, click "Start Typing"

3. **Click "Start Typing"**
   - Timer begins counting upward
   - Live WPM, progress %, and time update in real-time
   - Visual progress bar animates from left to right as you complete the code
   - Type each character exactly as shown (including tabs and newlines)
   - Use Tab for indentation, Enter for newlines, Backspace for corrections

4. **Complete the snippet**
   - When you reach the last character, results appear automatically

5. **Review results**
   - **WPM & Accuracy** at top
   - **Top keys you struggled with** — see which keys tripped you up most
   - **Finger analysis** — which fingers had the most mistakes
   - Click "Another round" to practice again with a fresh snippet

### Tips for Best Results

- **Study before typing** — use preview mode to understand the code
- **Focus on accuracy over speed** — speed comes naturally
- **Watch the progress bar** — visual feedback helps maintain momentum
- **Pay attention to whitespace** — tabs (`⇥`) and newlines (`↵`) are crucial for code structure
- **Review finger analysis** — weak fingers reveal technique issues; focus on form over speed
- **Practice regularly** — consistency builds muscle memory
- **Adjust code length** — start shorter (25-50 words) and gradually increase difficulty
- **Use the symbol toggle** — practice both with and without visual markers to build confidence
- **Click problem links** — review the full problem on NeetCode/LeetCode for context and understanding
- **Track improvements** — use finger analysis to see where you're making progress
- **Beginner tip** — if you're new to touch typing, visit [Typing.com](https://www.typing.com/) for foundational lessons first

## Configuration

### Add More Languages

The app uses a **replacer map** (`resources/replacer.py`) to dynamically generate URLs for multiple languages from the same Python links. No need for separate link files!

**How it works:**
1. All Python problems are in `resources/python_links.txt`
2. When you select Java/C++/JavaScript, it transforms the Python URL:
   - `python` → `java`, `.py` → `.java` (for Java)
   - `python` → `cpp`, `.py` → `.cpp` (for C++)
   - `python` → `javascript`, `.py` → `.js` (for JavaScript)

**To add a new language:**

1. Edit `resources/replacer.py` and add your language:
   ```python
   replacer = {
       "python": {
           "python": "python",
           ".py": ".py",
       },
       "java": {
           "python": "java",
           ".py": ".java",
       },
       "rust": {  # Add this
           "python": "rust",
           ".py": ".rs",
       }
   }
   ```

2. Update `EXTENSIONS_BY_LANGUAGE` in `app.py`:
   ```python
   EXTENSIONS_BY_LANGUAGE: dict[str, frozenset[str]] = {
       "python": frozenset({".py"}),
       "java": frozenset({".java"}),
       "rust": frozenset({".rs"}),  # Add this
   }
   ```

That's it! The app will now generate Rust URLs from Python links and fetch the code.

### Local Code Files

Add `.py` files to `resources/python/` for fallback snippets. The app will use these if:
- `python_links.txt` doesn't exist
- All remote fetches fail
- You want offline-only practice

**Important**: Use **tabs** for indentation (not spaces) so students practice proper technique.

## Technology Stack

- **Backend**: Flask (Python web framework)
- **Frontend**: Vanilla JavaScript (no framework overhead)
- **Styling**: Custom CSS with responsive theme support
  - Light theme: Clean, bright colors
  - Dark theme: GitHub-inspired dark colors
  - Auto-detection: Respects system `prefers-color-scheme`
- **Package Manager**: uv (fast, reliable Python package management)
- **HTTP Client**: `requests` (fetching code from GitHub)
- **Parser**: `beautifulsoup4` (optional, for future HTML parsing)

## SEO Optimization

NeetTyper includes proper SEO configuration for search engines and AI/LLM crawlers:

### Sitemap (`sitemap.xml`)
- Helps search engines discover and index your site
- Includes primary URL with update frequency and priority
- Located at `/sitemap.xml`

### Robots.txt (`robots.txt`)
- Controls search engine crawler behavior
- Allows major search engines (Google, Bing) full access
- Blocks low-quality crawlers (MJ12bot, AhrefsBot, SemrushBot)
- Specifies sitemap location
- Located at `/robots.txt`

### LLM Declaration (`llms.txt`)
- Declares content policy for AI/LLM training crawlers
- Clarifies educational purpose and data privacy
- Requests attribution if content is used
- Located at `/llms.txt`

All files are automatically served by the Flask backend and ready for search engine and crawler indexing.

## API Reference

### GET `/`
Returns the main HTML page.

### GET `/api/languages`
Returns available languages.

**Response**:
```json
{
  "languages": ["python"]
}
```

### GET `/api/random?lang=python`
Returns a random code snippet.

**Response**:
```json
{
  "path": "0001-two-sum.py",
  "text": "class Solution:\n\tdef twoSum(self, ...",
  "language": "python"
}
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Flask | ≥3.0.0 | Web framework |
| requests | ≥2.31.0 | HTTP client for fetching code |
| beautifulsoup4 | ≥4.12.0 | HTML parsing (for future enhancements) |

Install with:
```bash
uv sync
```

Or add packages individually:
```bash
uv add flask requests beautifulsoup4
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Tab** | Insert tab character (part of exercise) |
| **Enter** | Insert newline (part of exercise) |
| **Backspace** | Correct previous character |
| **Escape** | (Reserved for future features) |

## Finger Mapping

The app tracks typing accuracy by finger position on a standard QWERTY keyboard:

```
Left Hand:               Right Hand:
Pinky  Ring   Middle Index | Index Middle Ring  Pinky
Q  W  E  R  T   Y  U  I  O  P
A  S  D  F  G   H  J  K  L  ;
Z  X  C  V  B   N  M  ,  .  /
```

Results show mistakes grouped by finger to highlight weak areas:
- **L-pinky**: Left pinky mistakes
- **R-index**: Right index mistakes
- **Thumbs**: Space bar

## Retry Logic & Language Fallback

The backend implements a robust parallel fetching system to find code snippets:

- **Batch processing**: Fetches 10 snippets in parallel per batch using `ThreadPoolExecutor`
- **Multiple attempts**: Tries up to 5 batches (50 total attempts) to find code matching your length criteria
- **Smart fallback**: Automatically uses local files if GitHub fetch fails
- **Word count filtering**: Respects your max length selection to prevent overwhelmingly long problems
- **Timeout handling**: Each fetch has a 5-second timeout to prevent hanging

Both "Start" and "New snippet" buttons benefit from this automatic retry logic, ensuring you get code even if some links are temporarily unreachable.

## Known Limitations

- LeetCode content sourced from GitHub (requires internet connection)
- No user accounts or progress tracking (sessions are temporary)
- No difficulty filtering (randomly selects from all problems)
- Language support limited to those with NeetCode solutions (Python, Java, C++, JavaScript)
- Preview phase doesn't show the timer (intentional to reduce pressure during study)

## Future Enhancements

- [ ] User authentication & session persistence
- [ ] Progress tracking & statistics dashboard
- [ ] Difficulty levels (Easy, Medium, Hard)
- [ ] Timed challenges and leaderboards
- [ ] Speed/accuracy targets and achievements
- [ ] Custom code snippets
- [ ] Export results (PDF, CSV)
- [ ] Mobile app version with touch support

## Troubleshooting

### "Could not load snippet after retries"
- The selected language may not have code files available yet
- Try a different language (Python, Java, C++, JavaScript are fully supported)
- Or contribute code snippets for the new language

### "No code files for this language yet"
- Ensure `resources/python_links.txt` exists or add `.py` files to `resources/python/`
- The app retries automatically (up to 5 times) before showing this error

### "Could not load snippet"
- Check internet connection (if using GitHub links)
- Try running again (random selection may hit unreachable links)
- If persists, verify `python_links.txt` has valid GitHub URLs

### Timer not starting
- Click "Start Typing" button (it appears after code loads)
- Ensure focus is on the code display area

### WPM shows 0
- You need to type at least one character
- WPM calculates after 1+ second has elapsed

## License

Open source — use freely for learning and education.

## Contributing

To improve NeetTyper:

1. Add more links to `resources/python_links.txt`
2. Extend to new languages (JavaScript, Java, C++)
3. Improve UI/UX
4. Add progress tracking

---

**Happy typing! 🚀 Master programming speed and accuracy with NeetTyper.**
