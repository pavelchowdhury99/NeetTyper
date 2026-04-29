(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const modeSelect = $("mode-select");
  const setupPanel = $("setup-panel");
  const sessionPanel = $("session-panel");
  const fillBlanksPanel = $("fill-blanks-panel");
  const resultsPanel = $("results-panel");
  const homeLink = $("home-link");
  const langSelect = $("lang-select");
  const maxLengthSelect = $("max-length-select");
  const langHint = $("lang-hint");
  const loadError = $("load-error");
  const btnStart = $("btn-start");
  const btnStartTyping = $("btn-start-typing");
  const btnToggleSymbols = $("btn-toggle-symbols");
  const symbolToggleText = $("symbol-toggle-text");
  const filePath = $("file-path");
  const problemLinks = $("problem-links");
  const codeDisplay = $("code-display");
  const typingShell = $("typing-shell");
  const liveWpm = $("live-wpm");
  const progressPct = $("progress-pct");
  const progressBar = $("progress-bar");
  const liveTime = $("live-time");
  const focusHint = $("focus-hint");
  const btnRestart = $("btn-restart");
  const resWpm = $("res-wpm");
  const resAccuracy = $("res-accuracy");
  const resTime = $("res-time");
  const wrongKeysList = $("wrong-keys");
  const fingerStats = $("finger-stats");
  const btnAgain = $("btn-again");

  // Fill-in-the-blanks elements
  const fillFilePathEl = $("fill-file-path");
  const fillProblemLinks = $("fill-problem-links");
  const fillCodeReference = $("fill-code-reference");
  const fillTypingInput = $("fill-typing-input");
  const fillLiveWpm = $("fill-live-wpm");
  const fillProgressPct = $("fill-progress-pct");
  const fillProgressBar = $("fill-progress-bar");
  const fillLiveTime = $("fill-live-time");
  const fillBtnEvaluate = $("fill-btn-evaluate");
  const fillBtnRestart = $("fill-btn-restart");
  const fillBtnToggleSymbols = $("fill-btn-toggle-symbols");
  const fillSymbolToggleText = $("fill-symbol-toggle-text");
  const codeComparisonSection = $("code-comparison-section");
  const codeComparison = $("code-comparison");

  let currentMode = "standard";
  let target = "";
  let symbolsVisible = true;
  let pos = 0;
  let startedAt = null;
  let typingStarted = false;
  let wrongByExpected = new Map();
  const wrongAt = [];
  let totalErrors = 0;
  let completed = false;

  // Fill-in-the-blanks specific state
  let fillStartedAt = null;
  let fillCompleted = false;
  let fillWrongByExpected = new Map();
  let fillTotalErrors = 0;

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
    /**
     * Extract problem name from file path
     * e.g., "0383-ransom-note.py" -> "ransom-note"
     */
    // Remove extension (.py, .java, .cpp, .js)
    const withoutExt = filePath.replace(/\.[a-z]+$/, "");
    
    // Split by '-' and remove leading number
    const parts = withoutExt.split("-");
    const problemName = parts.slice(1).join("-");
    
    if (!problemName) return;
    
    // Create links
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
    
    // Clear and populate
    problemLinks.textContent = "";
    problemLinks.appendChild(neetcodeLink);
    problemLinks.appendChild(leetcodeLink);
  }

  function generateProblemLinksFill(filePath) {
    /**
     * Extract problem name from file path for fill-in-the-blanks
     */
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
      
      // Determine the character to display and its class
      if (inputChar === undefined && targetChar !== undefined) {
        // Missing character - show what should have been typed
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
        // Extra character - show what was wrongly typed
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
        // Correct character
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
        // Wrong character - show what was typed
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
      
      // Add line break after newlines
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

  function setWrongFlag(index, isWrong) {
    while (wrongAt.length <= index) wrongAt.push(false);
    wrongAt[index] = isWrong;
  }

  function renderFull() {
    codeDisplay.textContent = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < target.length; i++) {
      const s = target[i];
      const span = document.createElement("span");
      span.className = "ch";
      
      if (s === "\t") {
        span.textContent = "⇥";
        span.classList.add("tab-visual");
      } else if (s === " ") {
        span.textContent = "\u00a0";
        span.classList.add("space-visual");
      } else if (s === "\n") {
        span.textContent = "↵";
        span.classList.add("newline-visual");
      } else {
        span.textContent = s;
      }
      
      if (i < pos) {
        span.classList.add("done");
        if (wrongAt[i]) span.classList.add("wrong");
      } else if (i === pos && !completed) {
        span.classList.add("cursor");
      }
      frag.appendChild(span);
      
      // After each newline, break the line in display
      if (s === "\n") {
        frag.appendChild(document.createElement("br"));
      }
    }
    codeDisplay.appendChild(frag);
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
      
      // Highlight based on what user has typed
      if (i < inputText.length) {
        const inputChar = inputText[i];
        if (inputChar === s) {
          // Correct character typed
          span.classList.add("done");
        } else {
          // Wrong character typed
          span.classList.add("wrong");
        }
      } else if (i === inputText.length) {
        // Current cursor position
        span.classList.add("cursor");
      }
      
      frag.appendChild(span);
      
      if (s === "\n") {
        frag.appendChild(document.createElement("br"));
      }
    }
    fillCodeReference.appendChild(frag);
  }

  function updateLive() {
    const correct = pos - totalErrors;
    if (startedAt == null) {
      liveWpm.textContent = "0";
      liveTime.textContent = "0:00";
    } else {
      const elapsed = Date.now() - startedAt;
      liveWpm.textContent = String(netWpm(correct, elapsed));
      liveTime.textContent = formatDuration(elapsed);
    }
    const p = target.length ? Math.floor((100 * pos) / target.length) : 0;
    progressPct.textContent = String(p);
    progressBar.style.width = String(p) + "%";
  }

  function updateFillLive() {
    const inputText = fillTypingInput.value;
    // Don't calculate errors during typing - only on final evaluation
    // Just show raw WPM based on characters typed
    if (fillStartedAt == null) {
      fillLiveWpm.textContent = "0";
      fillLiveTime.textContent = "0:00";
    } else {
      const elapsed = Date.now() - fillStartedAt;
      // Use raw character count for live WPM (no error penalty)
      fillLiveWpm.textContent = String(netWpm(inputText.length, elapsed));
      fillLiveTime.textContent = formatDuration(elapsed);
    }
    const p = target.length ? Math.floor((100 * inputText.length) / target.length) : 0;
    fillProgressPct.textContent = String(p);
    fillProgressBar.style.width = String(p) + "%";
  }

  function topWrongKeys(n) {
    const arr = Array.from(wrongByExpected.entries());
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n);
  }

  function topWrongKeysFill(n) {
    const arr = Array.from(fillWrongByExpected.entries());
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n);
  }

  function showResults() {
    completed = true;
    sessionPanel.hidden = true;
    resultsPanel.hidden = false;
    // Hide code comparison for standard mode
    codeComparisonSection.hidden = true;
    const end = Date.now();
    const dur = startedAt != null ? end - startedAt : 0;
    const correct = pos - totalErrors;
    const attempts = pos;
    const acc = attempts > 0 ? Math.round((100 * correct) / attempts) : 100;
    resWpm.textContent = String(netWpm(correct, dur));
    resAccuracy.textContent = acc + "%";
    resTime.textContent = formatDuration(dur);
    wrongKeysList.textContent = "";
    const top = topWrongKeys(10);
    
    // Update heading with total unique keys count
    const wrongKeysHeading = document.getElementById("wrong-keys-heading");
    const totalUniqueKeys = wrongByExpected.size;
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
        kbd.textContent = charLabel(ch);
        li.appendChild(kbd);
        const finger = fingerForKey(ch);
        li.appendChild(document.createTextNode(" \u2014 " + count + "× (" + finger + ")"));
        wrongKeysList.appendChild(li);
      });
    }
    
    // Calculate and display finger stats
    const fingerCount = new Map();
    wrongByExpected.forEach((count, ch) => {
      const f = fingerForKey(ch);
      fingerCount.set(f, (fingerCount.get(f) || 0) + count);
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
  }

  function showFillResults() {
    fillCompleted = true;
    fillBlanksPanel.hidden = true;
    resultsPanel.hidden = false;
    const end = Date.now();
    const dur = fillStartedAt != null ? end - fillStartedAt : 0;
    const inputText = fillTypingInput.value;
    
    // Calculate accuracy based on total characters compared (max of input or target)
    // This includes missing characters, extra characters, and mismatches
    const totalCharsToCompare = Math.max(inputText.length, target.length);
    const correct = totalCharsToCompare - fillTotalErrors;
    const acc = totalCharsToCompare > 0 ? Math.round((100 * correct) / totalCharsToCompare) : 100;
    
    resWpm.textContent = String(netWpm(correct, dur));
    resAccuracy.textContent = acc + "%";
    resTime.textContent = formatDuration(dur);
    
    // Show code comparison for fill-in-the-blanks mode
    if (codeComparisonSection && codeComparison) {
      codeComparisonSection.hidden = false;
      renderCodeComparison(inputText, target);
      console.log("Code comparison rendered");
    } else {
      console.error("Code comparison elements not found");
    }
    wrongKeysList.textContent = "";
    const top = topWrongKeysFill(10);
    
    const wrongKeysHeading = document.getElementById("wrong-keys-heading");
    const totalUniqueKeys = fillWrongByExpected.size;
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
        // Filter out "extra-char" marker and show actual characters
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
    
    // Calculate and display finger stats
    const fingerCount = new Map();
    fillWrongByExpected.forEach((count, ch) => {
      // Skip "extra-char" marker in finger stats
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
  }

  function resetSessionState() {
    target = "";
    pos = 0;
    startedAt = null;
    wrongByExpected = new Map();
    wrongAt.length = 0;
    totalErrors = 0;
    completed = false;
    progressBar.style.width = "0%";
  }

  function resetFillSessionState() {
    target = "";
    fillStartedAt = null;
    fillWrongByExpected = new Map();
    fillTotalErrors = 0;
    fillCompleted = false;
    fillProgressBar.style.width = "0%";
    fillTypingInput.value = "";
    fillLiveWpm.textContent = "0";
    fillProgressPct.textContent = "0";
    fillLiveTime.textContent = "0:00";
  }

  function recordWrong(expected) {
    totalErrors += 1;
    wrongByExpected.set(expected, (wrongByExpected.get(expected) || 0) + 1);
  }

  function recordWrongFill(expected) {
    fillTotalErrors += 1;
    fillWrongByExpected.set(expected, (fillWrongByExpected.get(expected) || 0) + 1);
  }

  function undoWrongAtIndex(index) {
    const exp = target[index];
    if (!wrongAt[index]) return;
    setWrongFlag(index, false);
    totalErrors -= 1;
  }

  function onKeyDown(ev) {
    // If we're in preview mode and typing hasn't started yet, any keypress starts it
    if (!typingStarted && target && !completed) {
      // Ignore modifier keys
      if (["Shift", "Control", "Alt", "Meta", "OS"].includes(ev.key)) return;
      // Ignore Escape
      if (ev.key === "Escape") return;
      
      startTyping();
      return;
    }

    if (completed || !target || !typingStarted) return;
    if (["Shift", "Control", "Alt", "Meta", "OS"].includes(ev.key)) return;
    if (pos >= target.length) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      return;
    }

    if (ev.key === "Backspace") {
      ev.preventDefault();
      if (pos > 0) {
        pos -= 1;
        undoWrongAtIndex(pos);
        renderFull();
        updateLive();
      }
      return;
    }

    let ch = null;
    if (ev.key === "Enter") {
      ch = "\n";
    } else if (ev.key === "Tab") {
      ch = "\t";
    } else if (ev.key.length === 1) {
      ch = ev.key;
    } else {
      return;
    }

    ev.preventDefault();
    if (ev.key === "Tab") ev.stopPropagation();

    if (startedAt == null) startedAt = Date.now();

    const expected = target[pos];
    if (ch === expected) {
      setWrongFlag(pos, false);
    } else {
      setWrongFlag(pos, true);
      recordWrong(expected);
    }
    pos += 1;
    renderFull();
    updateLive();
    if (pos >= target.length) showResults();
  }

  function onFillTypingInput() {
    if (!fillStartedAt && fillTypingInput.value.length > 0) {
      fillStartedAt = Date.now();
    }

    // Update the reference code highlighting to show progress
    renderFillReference();
    
    // Update progress and time stats
    updateFillLive();
  }

  function onFillKeyDown(ev) {
    // Handle Tab key - insert actual tab character instead of moving focus
    if (ev.key === "Tab") {
      ev.preventDefault();
      const textarea = fillTypingInput;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      // Insert tab character at cursor position
      textarea.value = textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);
      
      // Move cursor after the inserted tab
      textarea.selectionStart = textarea.selectionEnd = start + 1;
      
      // Trigger input event to update stats
      fillTypingInput.dispatchEvent(new Event("input"));
    }
  }

  function evaluateFill() {
    // Calculate errors only at evaluation time
    const inputText = fillTypingInput.value;
    fillWrongByExpected.clear();
    fillTotalErrors = 0;
    
    // Compare character by character
    for (let i = 0; i < Math.max(inputText.length, target.length); i++) {
      const inputChar = inputText[i];
      const targetChar = target[i];
      
      if (inputChar === undefined && targetChar !== undefined) {
        // User didn't type enough - missing character
        recordWrongFill(targetChar);
      } else if (targetChar === undefined && inputChar !== undefined) {
        // User typed beyond the target length - extra character
        recordWrongFill("extra-char");
      } else if (inputChar !== targetChar) {
        // Actual mismatch - character typed doesn't match expected
        recordWrongFill(targetChar);
      }
    }
    
    showFillResults();
  }

  function startTyping() {
    typingStarted = true;
    btnStartTyping.hidden = true;
    focusHint.textContent = "Typing started. Press Backspace to correct mistakes.";
    typingShell.focus();
  }

  function toggleSymbols() {
    symbolsVisible = !symbolsVisible;
    if (symbolsVisible) {
      codeDisplay.classList.remove("symbols-hidden");
      btnToggleSymbols.classList.remove("active");
      symbolToggleText.textContent = "Hide symbols";
    } else {
      codeDisplay.classList.add("symbols-hidden");
      btnToggleSymbols.classList.add("active");
      symbolToggleText.textContent = "Show symbols";
    }
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
    currentMode = modeSelect.value;
    loadError.hidden = true;
    loadError.textContent = "";
    const lang = langSelect.value;
    const maxLength = maxLengthSelect.value;
    if (!lang) {
      loadError.textContent = "No language available.";
      loadError.hidden = false;
      return;
    }
    btnStart.disabled = true;
    
    // Retry logic for when language has no code files
    const maxRetries = 5;
    let retries = 0;
    let success = false;
    
    while (retries < maxRetries && !success) {
      try {
        const url = "/api/random?lang=" + encodeURIComponent(lang) + "&max_length=" + encodeURIComponent(maxLength);
        const r = await fetch(url);
        const data = await r.json();
        
        // Check if we got the "no files" error
        if (!r.ok) {
          const errorMsg = data.error || "Load failed";
          
          // If it's the "no code files" error, retry with a different language
          if (errorMsg.includes("No code files for this language")) {
            retries++;
            if (retries < maxRetries) {
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
          
          throw new Error(errorMsg);
        }
        
        // Success! Load the snippet
        if (currentMode === "standard") {
          resetSessionState();
          target = data.text || "";
          filePath.textContent = data.path || "";
          generateProblemLinks(data.path || "");
          setupPanel.hidden = true;
          resultsPanel.hidden = true;
          fillBlanksPanel.hidden = true;
          sessionPanel.hidden = false;
          typingStarted = false;
          btnStartTyping.hidden = false;
          focusHint.textContent = "Study the code, then click 'Start Typing' to begin.";
          renderFull();
          updateLive();
          typingShell.focus();
        } else {
          // Fill-in-the-blanks mode
          resetFillSessionState();
          target = data.text || "";
          fillFilePathEl.textContent = data.path || "";
          generateProblemLinksFill(data.path || "");
          setupPanel.hidden = true;
          resultsPanel.hidden = true;
          sessionPanel.hidden = true;
          fillBlanksPanel.hidden = false;
          renderFillReference();
          fillTypingInput.focus();
        }
        
        success = true;
      } catch (e) {
        // If we've exhausted retries, show the error
        if (retries >= maxRetries - 1) {
          loadError.textContent = e.message || "Could not load snippet after retries.";
          loadError.hidden = false;
          success = true; // Exit the loop
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
    sessionPanel.hidden = true;
    fillBlanksPanel.hidden = true;
    resultsPanel.hidden = true;
  }

  function goHome() {
    setupPanel.hidden = false;
    sessionPanel.hidden = true;
    fillBlanksPanel.hidden = true;
    resultsPanel.hidden = true;
  }

  typingShell.addEventListener("keydown", onKeyDown);
  fillTypingInput.addEventListener("input", onFillTypingInput);
  fillTypingInput.addEventListener("keydown", onFillKeyDown);
  homeLink.addEventListener("click", goHome);
  btnStart.addEventListener("click", startRound);
  btnStartTyping.addEventListener("click", startTyping);
  btnToggleSymbols.addEventListener("click", toggleSymbols);
  fillBtnToggleSymbols.addEventListener("click", toggleFillSymbols);
  btnRestart.addEventListener("click", startRound);
  fillBtnRestart.addEventListener("click", startRound);
  fillBtnEvaluate.addEventListener("click", evaluateFill);
  btnAgain.addEventListener("click", anotherRound);

  loadLanguages();
})();
