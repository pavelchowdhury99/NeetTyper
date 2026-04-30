(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const setupPanel = $("setup-panel");
  const fillBlanksPanel = $("fill-blanks-panel");
  const resultsPanel = $("results-panel");
  const homeLink = $("home-link");
  const langSelect = $("lang-select");
  const maxLengthSelect = $("max-length-select");
  const langHint = $("lang-hint");
  const loadError = $("load-error");
  const searchingIndicator = $("searching-indicator");
  const fillSearchingIndicator = $("fill-searching-indicator");
  const btnStart = $("btn-start");
  const fillBtnEvaluate = $("fill-btn-evaluate");
  const fillBtnRestart = $("fill-btn-restart");
  const fillBtnToggleSymbols = $("fill-btn-toggle-symbols");
  const fillSymbolToggleText = $("fill-symbol-toggle-text");
  const fillFilePathEl = $("fill-file-path");
  const fillProblemLinks = $("fill-problem-links");
  const fillCodeReference = $("fill-code-reference");
  const fillTypingInput = $("fill-typing-input");
  const fillLiveWpm = $("fill-live-wpm");
  const fillProgressPct = $("fill-progress-pct");
  const fillProgressBar = $("fill-progress-bar");
  const fillLiveTime = $("fill-live-time");
  const resWpm = $("res-wpm");
  const resAccuracy = $("res-accuracy");
  const resTime = $("res-time");
  const wrongKeysList = $("wrong-keys");
  const fingerStats = $("finger-stats");
  const btnAgain = $("btn-again");
  const codeComparisonSection = $("code-comparison-section");
  const codeComparison = $("code-comparison");

  // Toggle element
  const countBackspacesToggle = $("count-backspaces-toggle");

  let target = "";
  let symbolsVisible = true;
  let countBackspaces = true;
  
  // Fill-in-the-blanks session state
  let fillStartedAt = null;
  let fillCompleted = false;
  let fillWrongByExpected = new Map();
  let fillTotalErrors = 0;
  let fillWrongKeysPressedTracker = new Map();
  
  // Track if user has started typing for unsaved changes warning
  let hasStartedTyping = false;

  // ── Gamification ─────────────────────────────────────────────────────────────
  const LEVEL_THRESHOLDS = [0, 200, 600, 1400, 2800, 5000, 8000, 12000, 18000, 27000];
  const ACHIEVEMENT_LABELS = {
    first_round:  "First Round",
    wpm_50:       "50 WPM Club",
    wpm_80:       "80 WPM Club",
    wpm_100:      "100 WPM Club",
    accuracy_100: "Perfect Score",
    streak_3:     "3-Day Streak",
    streak_7:     "Week Warrior",
    rounds_10:    "10 Rounds",
    rounds_50:    "50 Rounds",
  };

  let gam = {
    totalXp: 0, bestWpm: 0, totalRounds: 0,
    streakDays: 0, lastPlayedDate: null, achievements: [],
  };

  function loadGam() {
    try {
      const raw = localStorage.getItem("neettyper_gam");
      if (raw) Object.assign(gam, JSON.parse(raw));
    } catch (_) {}
  }

  function saveGam() {
    try { localStorage.setItem("neettyper_gam", JSON.stringify(gam)); } catch (_) {}
  }

  function getLevelInfo(xp) {
    let level = 1;
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1; else break;
    }
    const lo = LEVEL_THRESHOLDS[level - 1] || 0;
    const hi = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : lo + 50000;
    const progress = hi > lo ? Math.min(1, (xp - lo) / (hi - lo)) : 1;
    return { level, progress, lo, hi };
  }

  function updateHeaderGam() {
    const bar = $("gamification-bar");
    if (!bar) return;
    const info = getLevelInfo(gam.totalXp);
    const parts = ["Level " + info.level];
    if (gam.streakDays > 1) parts.push(gam.streakDays + "-day streak");
    if (gam.bestWpm > 0) parts.push("Best: " + gam.bestWpm + " WPM");
    bar.textContent = parts.join("  ·  ");
  }

  function advanceStreak() {
    const today = new Date().toDateString();
    if (!gam.lastPlayedDate) {
      gam.streakDays = 1;
    } else if (gam.lastPlayedDate !== today) {
      const days = Math.round((new Date(today) - new Date(gam.lastPlayedDate)) / 86400000);
      gam.streakDays = days === 1 ? gam.streakDays + 1 : 1;
    }
    gam.lastPlayedDate = today;
  }

  function unlockAchievements(wpm, acc) {
    const gained = [];
    const check = (id) => {
      if (!gam.achievements.includes(id)) { gam.achievements.push(id); gained.push(id); }
    };
    if (gam.totalRounds >= 1)  check("first_round");
    if (wpm >= 50)             check("wpm_50");
    if (wpm >= 80)             check("wpm_80");
    if (wpm >= 100)            check("wpm_100");
    if (acc >= 100)            check("accuracy_100");
    if (gam.streakDays >= 3)  check("streak_3");
    if (gam.streakDays >= 7)  check("streak_7");
    if (gam.totalRounds >= 10) check("rounds_10");
    if (gam.totalRounds >= 50) check("rounds_50");
    return gained;
  }

  function processGamification(wpm, acc) {
    const xpEarned = Math.max(5, Math.round(wpm * (acc / 100)));
    const isNewBest = wpm > 0 && wpm > gam.bestWpm;
    if (isNewBest) gam.bestWpm = wpm;
    gam.totalRounds += 1;
    gam.totalXp += xpEarned;
    advanceStreak();
    const gained = unlockAchievements(wpm, acc);
    saveGam();
    updateHeaderGam();
    renderGamResults(xpEarned, gained, isNewBest, wpm);
  }

  function renderGamResults(xpEarned, gained, isNewBest, wpm) {
    const xpEl       = $("gam-xp-earned");
    const levelLabel = $("gam-level-label");
    const xpRange    = $("gam-xp-label");
    const levelBar   = $("gam-level-bar");
    const newBestEl  = $("gam-new-best");
    const achEl      = $("gam-achievements");
    if (!xpEl) return;

    const info = getLevelInfo(gam.totalXp);
    xpEl.textContent       = "+" + xpEarned + " XP";
    levelLabel.textContent = "Level " + info.level;
    xpRange.textContent    = (gam.totalXp - info.lo) + " / " + (info.hi - info.lo) + " XP";

    levelBar.style.transition = "none";
    levelBar.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      levelBar.style.transition = "width 0.9s ease-out";
      levelBar.style.width = Math.round(info.progress * 100) + "%";
    }));

    if (isNewBest) {
      newBestEl.hidden = false;
      newBestEl.textContent = "New personal best: " + wpm + " WPM";
    } else {
      newBestEl.hidden = true;
    }

    if (gained.length > 0) {
      achEl.hidden = false;
      achEl.textContent = "";
      const hd = document.createElement("p");
      hd.className = "gam-ach-heading";
      hd.textContent = gained.length === 1 ? "Achievement unlocked:" : "Achievements unlocked:";
      achEl.appendChild(hd);
      const wrap = document.createElement("div");
      wrap.className = "gam-ach-badges";
      gained.forEach(id => {
        const b = document.createElement("span");
        b.className = "gam-ach-badge";
        b.textContent = ACHIEVEMENT_LABELS[id] || id;
        wrap.appendChild(b);
      });
      achEl.appendChild(wrap);
    } else {
      achEl.hidden = true;
    }
  }
  // ── End Gamification ─────────────────────────────────────────────────────────

  const fingerMap = {
    // Left hand
    q: "L-pinky", w: "L-ring", e: "L-middle", r: "L-index", t: "L-index",
    a: "L-pinky", s: "L-ring", d: "L-middle", f: "L-index", g: "L-index",
    z: "L-pinky", x: "L-ring", c: "L-middle", v: "L-index", b: "L-index",
    // Right hand
    y: "R-index", u: "R-index", i: "R-middle", o: "R-ring", p: "R-pinky",
    h: "R-index", j: "R-index", k: "R-middle", l: "R-ring", ";": "R-pinky",
    n: "R-index", m: "R-middle", ",": "R-ring", ".": "R-pinky", "/": "R-pinky",
    // Numbers (right index/middle usually)
    "1": "L-pinky", "2": "L-ring", "3": "L-middle", "4": "L-index", "5": "L-index",
    "6": "R-index", "7": "R-index", "8": "R-middle", "9": "R-ring", "0": "R-pinky",
    // Symbols (Shift + key)
    "!": "L-pinky", "@": "L-ring", "#": "L-middle", "$": "L-index", "%": "L-index",
    "^": "R-index", "&": "R-index", "*": "R-middle", "(": "R-ring", ")": "R-pinky",
    "-": "R-pinky", "_": "R-pinky", "=": "R-pinky", "+": "R-pinky",
    "[": "R-pinky", "{": "R-pinky", "]": "R-pinky", "}": "R-pinky",
    "|": "R-pinky", "\\": "R-pinky", ":": "R-pinky", "\"": "R-pinky",
    "'": "R-pinky", "<": "R-ring", ">": "R-pinky", "?": "R-pinky",
    " ": "Thumbs", "\t": "L-pinky", "\n": "R-pinky",
  };

  function fingerForKey(ch) {
    const lower = ch.toLowerCase();
    return fingerMap[lower] || fingerMap[ch] || "Unknown";
  }

  function generateProblemLinks(filePath) {
    const withoutExt = filePath.replace(/\.[a-z]+$/, "");
    const parts = withoutExt.split("-");
    const problemName = parts.slice(1).join("-");
    
    if (!problemName) return;
    
    const neetcodeLink = document.createElement("a");
    neetcodeLink.href = `https://neetcode.io/problems/${problemName}`;
    neetcodeLink.className = "problem-link";
    neetcodeLink.textContent = "NeetCode";
    neetcodeLink.target = "_blank";
    neetcodeLink.rel = "noopener noreferrer";
    
    const leetcodeLink = document.createElement("a");
    leetcodeLink.href = `https://leetcode.com/problems/${problemName}`;
    leetcodeLink.className = "problem-link";
    leetcodeLink.textContent = "LeetCode";
    leetcodeLink.target = "_blank";
    leetcodeLink.rel = "noopener noreferrer";
    
    fillProblemLinks.textContent = "";
    fillProblemLinks.appendChild(neetcodeLink);
    fillProblemLinks.appendChild(leetcodeLink);
  }

  function charLabel(c) {
    if (c === " ") return "Space";
    if (c === "\n") return "Enter";
    if (c === "\t") return "Tab";
    if (c === "\r") return "↵";
    if (c.length === 0) return "—";
    return c;
  }

  function renderCodeComparison(inputText, targetText) {
    codeComparison.textContent = "";
    const frag = document.createDocumentFragment();
    const maxLen = Math.max(inputText.length, targetText.length);
    
    for (let i = 0; i < maxLen; i++) {
      const inputChar = inputText[i];
      const targetChar = targetText[i];
      const span = document.createElement("span");
      
      if (inputChar === undefined && targetChar !== undefined) {
        if (targetChar === "\t") {
          span.textContent = "⇥";
        } else if (targetChar === " ") {
          span.textContent = "·";
        } else if (targetChar === "\n") {
          span.textContent = "↵";
        } else {
          span.textContent = targetChar;
        }
        span.className = "ch-missing";
      } else if (targetChar === undefined && inputChar !== undefined) {
        if (inputChar === "\t") {
          span.textContent = "⇥";
        } else if (inputChar === " ") {
          span.textContent = "·";
        } else if (inputChar === "\n") {
          span.textContent = "↵";
        } else {
          span.textContent = inputChar;
        }
        span.className = "ch-extra";
      } else if (inputChar === targetChar) {
        if (inputChar === "\t") {
          span.textContent = "⇥";
        } else if (inputChar === " ") {
          span.textContent = "·";
        } else if (inputChar === "\n") {
          span.textContent = "↵";
        } else {
          span.textContent = inputChar;
        }
        span.className = "ch-correct";
      } else {
        if (inputChar === "\t") {
          span.textContent = "⇥";
        } else if (inputChar === " ") {
          span.textContent = "·";
        } else if (inputChar === "\n") {
          span.textContent = "↵";
        } else {
          span.textContent = inputChar;
        }
        span.className = "ch-wrong";
      }
      
      frag.appendChild(span);
      
      if (targetChar === "\n" || (inputChar === "\n" && targetChar === undefined)) {
        frag.appendChild(document.createElement("br"));
      }
    }
    
    codeComparison.appendChild(frag);
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function netWpm(correctChars, durationMs) {
    if (durationMs <= 0) return 0;
    const words = correctChars / 5;
    const min = durationMs / 60000;
    return min > 0 ? Math.round((words / min) * 10) / 10 : 0;
  }

  function renderFillReference() {
    fillCodeReference.textContent = "";
    const frag = document.createDocumentFragment();
    const inputText = fillTypingInput.value;
    
    for (let i = 0; i < target.length; i++) {
      const s = target[i];
      const span = document.createElement("span");
      span.className = "ch";
      
      if (s === "\t") {
        span.textContent = symbolsVisible ? "⇥" : "\t";
        if (symbolsVisible) span.classList.add("tab-visual");
      } else if (s === " ") {
        span.textContent = symbolsVisible ? "\u00a0" : " ";
        if (symbolsVisible) span.classList.add("space-visual");
      } else if (s === "\n") {
        span.textContent = symbolsVisible ? "↵" : "\n";
        if (symbolsVisible) span.classList.add("newline-visual");
      } else {
        span.textContent = s;
      }
      
      if (i < inputText.length) {
        const inputChar = inputText[i];
        if (inputChar === s) {
          span.classList.add("done");
        } else {
          span.classList.add("wrong");
        }
      } else if (i === inputText.length) {
        span.classList.add("cursor");
      }
      
      frag.appendChild(span);
      
      if (s === "\n") {
        frag.appendChild(document.createElement("br"));
      }
    }
    fillCodeReference.appendChild(frag);
  }

  function updateFillLive() {
    const inputText = fillTypingInput.value;
    if (fillStartedAt == null) {
      fillLiveWpm.textContent = "0";
      fillLiveTime.textContent = "0:00";
    } else {
      const elapsed = Date.now() - fillStartedAt;
      fillLiveWpm.textContent = String(netWpm(inputText.length, elapsed));
      fillLiveTime.textContent = formatDuration(elapsed);
    }
    const p = target.length ? Math.floor((100 * inputText.length) / target.length) : 0;
    fillProgressPct.textContent = String(p);
    fillProgressBar.style.width = String(p) + "%";
  }

  function topWrongKeysFill(n) {
    const arr = Array.from(fillWrongByExpected.entries());
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n);
  }

  function showFillResults() {
    fillCompleted = true;
    fillBlanksPanel.hidden = true;
    resultsPanel.hidden = false;
    const end = Date.now();
    const dur = fillStartedAt != null ? end - fillStartedAt : 0;
    const inputText = fillTypingInput.value;
    
    const totalCharsToCompare = Math.max(inputText.length, target.length);
    const correct = totalCharsToCompare - fillTotalErrors;
    const acc = totalCharsToCompare > 0 ? Math.round((100 * correct) / totalCharsToCompare) : 100;
    
    const wpm = netWpm(correct, dur);
    resWpm.textContent = String(wpm);
    resAccuracy.textContent = acc + "%";
    resTime.textContent = formatDuration(dur);
    
    if (codeComparisonSection && codeComparison) {
      codeComparisonSection.hidden = false;
      renderCodeComparison(inputText, target);
    }
    
    wrongKeysList.textContent = "";
    
    let topKeys = [];
    if (countBackspaces && fillWrongKeysPressedTracker.size > 0) {
      topKeys = Array.from(fillWrongKeysPressedTracker.entries());
    } else {
      topKeys = Array.from(fillWrongByExpected.entries());
    }
    topKeys.sort((a, b) => b[1] - a[1]);
    const top = topKeys.slice(0, 10);
    
    const wrongKeysHeading = document.getElementById("wrong-keys-heading");
    const totalUniqueKeys = countBackspaces ? fillWrongKeysPressedTracker.size : fillWrongByExpected.size;
    if (wrongKeysHeading) {
      if (totalUniqueKeys === 0) {
        wrongKeysHeading.textContent = "No struggling keys";
      } else {
        wrongKeysHeading.textContent = `Top ${Math.min(totalUniqueKeys, 10)} keys you struggled with`;
      }
    }
    
    if (top.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No key-specific mistakes recorded. Nice.";
      wrongKeysList.appendChild(li);
    } else {
      top.forEach(([ch, count]) => {
        const li = document.createElement("li");
        const kbd = document.createElement("span");
        kbd.className = "kbd";
        if (ch === "extra-char") {
          kbd.textContent = "Extra";
        } else {
          kbd.textContent = charLabel(ch);
        }
        li.appendChild(kbd);
        const finger = ch === "extra-char" ? "N/A" : fingerForKey(ch);
        li.appendChild(document.createTextNode(" \u2014 " + count + "× (" + finger + ")"));
        wrongKeysList.appendChild(li);
      });
    }
    
    const fingerCount = new Map();
    const wrongKeysMap = countBackspaces ? fillWrongKeysPressedTracker : fillWrongByExpected;
    wrongKeysMap.forEach((count, ch) => {
      if (ch !== "extra-char") {
        const f = fingerForKey(ch);
        fingerCount.set(f, (fingerCount.get(f) || 0) + count);
      }
    });
    
    fingerStats.textContent = "";
    if (fingerCount.size === 0) {
      const p = document.createElement("p");
      p.style.color = "var(--muted)";
      p.style.fontSize = "0.9rem";
      p.textContent = "No finger-specific data available.";
      fingerStats.appendChild(p);
    } else {
      const sorted = Array.from(fingerCount.entries());
      sorted.sort((a, b) => b[1] - a[1]);
      const list = document.createElement("ul");
      list.style.margin = "0.5rem 0 0";
      list.style.paddingLeft = "1.25rem";
      sorted.forEach(([finger, count]) => {
        const li = document.createElement("li");
        li.style.marginBottom = "0.25rem";
        li.textContent = finger + " \u2014 " + count + " mistakes";
        list.appendChild(li);
      });
      fingerStats.appendChild(list);
    }

    processGamification(wpm, acc);
  }

  function resetFillSessionState() {
    target = "";
    fillStartedAt = null;
    fillWrongByExpected = new Map();
    fillWrongKeysPressedTracker = new Map();
    fillTotalErrors = 0;
    fillCompleted = false;
    fillProgressBar.style.width = "0%";
    fillTypingInput.value = "";
    fillLiveWpm.textContent = "0";
    fillProgressPct.textContent = "0";
    fillLiveTime.textContent = "0:00";
    hasStartedTyping = false;
  }

  function recordWrongFill(expected) {
    fillTotalErrors += 1;
    fillWrongByExpected.set(expected, (fillWrongByExpected.get(expected) || 0) + 1);
  }

  function recordWrongKeyPressed(keyPressed) {
    if (countBackspaces) {
      fillWrongKeysPressedTracker.set(keyPressed, (fillWrongKeysPressedTracker.get(keyPressed) || 0) + 1);
    }
  }

  function onFillTypingInput() {
    if (!fillStartedAt && fillTypingInput.value.length > 0) {
      fillStartedAt = Date.now();
      hasStartedTyping = true;
    }

    renderFillReference();
    updateFillLive();
  }

  function onFillKeyDown(ev) {
    if (ev.key === "Tab") {
      ev.preventDefault();
      const textarea = fillTypingInput;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      textarea.value = textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 1;
      
      fillTypingInput.dispatchEvent(new Event("input"));
    }
    
    // Evaluate: Cmd+Enter, Ctrl+Enter, or Alt+Enter
    if ((ev.metaKey || ev.ctrlKey || ev.altKey) && ev.key === "Enter") {
      ev.preventDefault();
      ev.stopPropagation();
      evaluateFill();
    }

    // New snippet: Cmd+', Ctrl+', or Alt+'
    if ((ev.metaKey || ev.ctrlKey || ev.altKey) && ev.key === "'") {
      ev.preventDefault();
      ev.stopPropagation();
      startRound();
    }
  }

  function onFillKeyUp(ev) {
    if (!fillStartedAt) return;
    
    const inputText = fillTypingInput.value;
    if (inputText.length === 0) return;
    
    const currentPos = inputText.length - 1;
    const lastChar = inputText[currentPos];
    const expectedChar = target[currentPos];
    
    if (expectedChar !== undefined && lastChar !== expectedChar) {
      recordWrongKeyPressed(lastChar);
    }
  }

  function evaluateFill() {
    console.log("=== evaluateFill called ===");
    const inputText = fillTypingInput.value;
    fillWrongByExpected.clear();
    fillTotalErrors = 0;
    
    console.log("Evaluating Fill-in-the-blanks:");
    console.log("Target length:", target.length);
    console.log("Input length:", inputText.length);
    console.log("Count backspaces:", countBackspaces);
    
    const maxLen = Math.max(inputText.length, target.length);
    console.log("Max length to compare:", maxLen);
    
    // Compare character by character
    for (let i = 0; i < maxLen; i++) {
      const inputChar = inputText[i];
      const targetChar = target[i];
      
      // Skip comparison if both are undefined
      if (inputChar === undefined && targetChar === undefined) {
        continue;
      }
      
      // User didn't type enough - missing character
      if (inputChar === undefined && targetChar !== undefined) {
        // Only count missing chars as errors if countBackspaces is true
        if (countBackspaces) {
          console.log(`[${i}] Missing char: expected "${charLabel(targetChar)}"`);
          recordWrongFill(targetChar);
        }
      } 
      // User typed beyond target - extra character
      else if (targetChar === undefined && inputChar !== undefined) {
        // Only count extra chars as errors if countBackspaces is true
        if (countBackspaces) {
          console.log(`[${i}] Extra char: "${charLabel(inputChar)}"`);
          recordWrongFill("extra-char");
        }
      } 
      // Character mismatch - wrong key pressed (always count this)
      else if (inputChar !== targetChar) {
        console.log(`[${i}] Mismatch: expected "${charLabel(targetChar)}", got "${charLabel(inputChar)}"`);
        recordWrongFill(targetChar);
      }
      // else: inputChar === targetChar - correct, don't record
    }
    
    console.log("Final wrong keys map:", fillWrongByExpected);
    console.log("Total errors:", fillTotalErrors);
    showFillResults();
  }

  function toggleFillSymbols() {
    symbolsVisible = !symbolsVisible;
    if (symbolsVisible) {
      fillCodeReference.classList.remove("symbols-hidden");
      fillBtnToggleSymbols.classList.remove("active");
      fillSymbolToggleText.textContent = "Hide symbols";
    } else {
      fillCodeReference.classList.add("symbols-hidden");
      fillBtnToggleSymbols.classList.add("active");
      fillSymbolToggleText.textContent = "Show symbols";
    }
    renderFillReference();
  }

  async function loadLanguages() {
    const r = await fetch("/api/languages");
    const data = await r.json();
    const langs = data.languages || [];
    langSelect.textContent = "";
    langs.forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = l;
      langSelect.appendChild(o);
    });
    if (langs.length === 0) {
      langHint.textContent = "Add folders under resources/ to get started.";
    } else {
      const py = langs.indexOf("python");
      if (py >= 0) langSelect.selectedIndex = py;
      langHint.textContent =
        "A random " + (langSelect.value || "code") + " file will load.";
    }
  }

  async function startRound() {
    loadError.hidden = true;
    loadError.textContent = "";
    searchingIndicator.hidden = true;
    fillSearchingIndicator.hidden = true;
    
    // Update settings from toggles
    countBackspaces = countBackspacesToggle.checked;
    
    const lang = langSelect.value;
    const maxLength = maxLengthSelect.value;
    if (!lang) {
      loadError.textContent = "No language available.";
      loadError.hidden = false;
      return;
    }
    btnStart.disabled = true;
    
    // Show appropriate searching indicator based on current panel
    if (!fillBlanksPanel.hidden) {
      fillSearchingIndicator.hidden = false;
    } else {
      searchingIndicator.hidden = false;
    }
    
    const maxRetries = 5;
    let retries = 0;
    let success = false;
    
    while (retries < maxRetries && !success) {
      try {
        const url = "/api/random?lang=" + encodeURIComponent(lang) + "&max_length=" + encodeURIComponent(maxLength);
        const r = await fetch(url);
        const data = await r.json();
        
        if (!r.ok) {
          const errorMsg = data.error || "Load failed";
          
          if (errorMsg.includes("No code files for this language")) {
            retries++;
            if (retries < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
          
          throw new Error(errorMsg);
        }
        
        resetFillSessionState();
        target = data.text || "";
        fillFilePathEl.textContent = data.path || "";
        generateProblemLinks(data.path || "");
        setupPanel.hidden = true;
        resultsPanel.hidden = true;
        fillBlanksPanel.hidden = false;
        renderFillReference();
        fillTypingInput.focus();
        
        // Hide searching indicators on success
        searchingIndicator.hidden = true;
        fillSearchingIndicator.hidden = true;
        
        success = true;
      } catch (e) {
        if (retries >= maxRetries - 1) {
          loadError.textContent = e.message || "Could not load snippet after retries.";
          loadError.hidden = false;
          searchingIndicator.hidden = true;
          fillSearchingIndicator.hidden = true;
          success = true;
        } else {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    btnStart.disabled = false;
  }

  function anotherRound() {
    setupPanel.hidden = false;
    fillBlanksPanel.hidden = true;
    resultsPanel.hidden = true;
  }

  function goHome() {
    setupPanel.hidden = false;
    fillBlanksPanel.hidden = true;
    resultsPanel.hidden = true;
  }

  // Handle unsaved changes warning when leaving the page
  window.addEventListener("beforeunload", (ev) => {
    if (hasStartedTyping && !fillCompleted) {
      ev.preventDefault();
      ev.returnValue = "";
      return "";
    }
  });

  // Start: Cmd+Enter or Alt+Enter when setup panel is visible
  document.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.altKey || ev.ctrlKey) && ev.key === "Enter") {
      if (!setupPanel.hidden || !resultsPanel.hidden) {
        ev.preventDefault();
        startRound();
      }
    }
  });

  fillTypingInput.addEventListener("input", onFillTypingInput);
  fillTypingInput.addEventListener("keydown", onFillKeyDown);
  fillTypingInput.addEventListener("keyup", onFillKeyUp);
  homeLink.addEventListener("click", goHome);
  btnStart.addEventListener("click", startRound);
  fillBtnToggleSymbols.addEventListener("click", toggleFillSymbols);
  fillBtnRestart.addEventListener("click", startRound);
  fillBtnEvaluate.addEventListener("click", () => {
    console.log("Evaluate button clicked");
    evaluateFill();
  });
  btnAgain.addEventListener("click", anotherRound);

  loadGam();
  updateHeaderGam();
  loadLanguages();
})();
