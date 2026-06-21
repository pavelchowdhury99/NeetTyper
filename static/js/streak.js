/* streak.js — NeetTyper streak tracker */
(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let state = null; // current user object from API
  let saveTimer = null;

  // ── DOM refs ───────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const loadingEl      = $("streak-loading");
  const mainErrorEl    = $("streak-main-error");
  const createPanel    = $("create-panel");
  const dashPanel      = $("dashboard-panel");

  // create panel
  const usernameInput      = $("username-input");
  const initialStreakInput = $("initial-streak-input");
  const seedItemsEl        = $("seed-items");
  const btnAddSeed         = $("btn-add-seed");
  const btnCreateProfile   = $("btn-create-profile");
  const createErrorEl      = $("create-error");

  // dashboard
  const dashName        = $("dash-name");
  const streakFlame     = $("streak-flame");
  const streakNum       = $("streak-num");
  const todayLabel      = $("today-label");
  const todayProgress   = $("today-progress");
  const checklistEl     = $("checklist");
  const checklistEmpty  = $("checklist-empty");
  const allDoneBanner   = $("all-done-banner");
  const btnSwitchUser   = $("btn-switch-user");
  const btnDeleteUser   = $("btn-delete-user");
  const btnSave         = $("btn-save");
  const btnFetch        = $("btn-fetch");
  const syncStatus      = $("sync-status");
  const lastSavedEl     = $("last-saved");

  // add-item
  const btnShowAddItem    = $("btn-show-add-item");
  const addItemForm       = $("add-item-form");
  const newItemInput      = $("new-item-input");
  const btnConfirmAddItem = $("btn-confirm-add-item");
  const btnCancelAddItem  = $("btn-cancel-add-item");

  // ── Utility ────────────────────────────────────────────────

  function showLoading(on) {
    loadingEl.hidden = !on;
  }

  function showMainError(msg) {
    mainErrorEl.textContent = msg;
    mainErrorEl.hidden = !msg;
  }

  function showCreateError(msg) {
    createErrorEl.textContent = msg;
    createErrorEl.hidden = !msg;
  }

  function showPanel(name) {
    createPanel.hidden = name !== "create";
    dashPanel.hidden   = name !== "dash";
  }

  function uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function todayDisplayStr() {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  // ── Navigation helpers ─────────────────────────────────────

  function goToUser(username) {
    window.location.href = "/streak/" + encodeURIComponent(username);
  }

  function goToCreate() {
    window.location.href = "/streak";
  }

  // ── API helpers ────────────────────────────────────────────

  async function apiGet(path) {
    const r = await fetch(path);
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  async function apiPost(path, data) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  async function apiPut(path, data) {
    const r = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  // ── Render dashboard ───────────────────────────────────────

  function renderDashboard(user) {
    state = user;
    showPanel("dash");

    dashName.textContent = user.username;

    const streak = user.streak || 0;
    streakNum.textContent = streak;
    streakFlame.textContent = streak > 0 ? "🔥" : "💤";

    todayLabel.textContent = todayDisplayStr();
    showLastSaved(user.last_saved);

    // Record the streak at the start of today so unchecking can't go below it
    dayStartStreak = user.streak || 0;

    renderChecklist(user);
  }

  function renderChecklist(user) {
    const items   = user.checklist_items || [];
    const checks  = user.today_checks || {};

    checklistEmpty.hidden = items.length > 0;

    const doneCount = items.filter((it) => checks[it.id]).length;
    todayProgress.textContent = `${doneCount} / ${items.length} done`;

    const allDone = items.length > 0 && doneCount === items.length;
    allDoneBanner.hidden = !allDone;

    checklistEl.innerHTML = "";
    items.forEach((item) => {
      const checked = !!checks[item.id];
      const row = document.createElement("div");
      row.className = "checklist-row" + (checked ? " checklist-row--done" : "");
      row.innerHTML = `
        <label class="checklist-label">
          <input type="checkbox" class="checklist-cb" data-id="${item.id}" ${checked ? "checked" : ""} />
          <span class="checklist-text">${escapeHtml(item.text)}</span>
        </label>
        <button type="button" class="btn-delete-item" data-id="${item.id}" title="Remove item">✕</button>
      `;
      checklistEl.appendChild(row);
    });

    // checkbox toggles
    checklistEl.querySelectorAll(".checklist-cb").forEach((cb) => {
      cb.addEventListener("change", onCheckboxChange);
    });

    // delete buttons
    checklistEl.querySelectorAll(".btn-delete-item").forEach((btn) => {
      btn.addEventListener("click", onDeleteItem);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Last-saved display ─────────────────────────────────────

  function showLastSaved(isoStr) {
    if (!lastSavedEl) return;
    if (!isoStr) { lastSavedEl.textContent = ""; return; }
    const d = new Date(isoStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timePart = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const label = isToday
      ? timePart
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + timePart;
    lastSavedEl.textContent = `Last saved ${label}`;
  }

  // ── Sync status display ────────────────────────────────────

  let syncTimer = null;

  function setSyncStatus(msg, isError) {
    syncStatus.textContent = msg;
    syncStatus.className = "sync-status" + (isError ? " sync-status--error" : " sync-status--ok");
    if (syncTimer) clearTimeout(syncTimer);
    if (msg) syncTimer = setTimeout(() => { syncStatus.textContent = ""; syncStatus.className = "sync-status"; }, 3500);
  }

  function currentChecks() {
    const checks = {};
    checklistEl.querySelectorAll(".checklist-cb").forEach((cb) => {
      checks[cb.dataset.id] = cb.checked;
    });
    return checks;
  }

  // ── Local streak calculation ────────────────────────────────
  // Rules:
  //   • streak increments by 1 when all items are done for the first time today
  //   • unchecking / adding a new item can un-complete today, but streak never
  //     drops below the value it had at the START of today (day_start_streak)
  //   • streak resets to 0 only when a whole day was missed (handled on load)

  let dayStartStreak = 0; // streak value when today's session began

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function applyChecksLocally(checks) {
    if (!state) return;
    const items = state.checklist_items || [];
    if (!items.length) return;

    const today      = todayISO();
    const allDone    = items.every(item => checks[item.id]);
    const lastComplete = state.last_complete_date;

    if (allDone && lastComplete !== today) {
      // First completion today — increment
      state.streak = (state.streak || 0) + 1;
      state.last_complete_date = today;
      // Optimistically add today to completed_dates for instant calendar update
      const hist = state.completed_dates || [];
      if (!hist.includes(today)) {
        state.completed_dates = [...hist, today].sort();
      }
    } else if (!allDone && lastComplete === today) {
      // Un-completing today — revert to day's starting streak, never lower
      state.streak = dayStartStreak;
      state.last_complete_date = null;
      // Remove today from optimistic completed_dates
      state.completed_dates = (state.completed_dates || []).filter(d => d !== today);
    }
    // Any other case (partial, already done today, etc.) → no change
  }

  // ── Checkbox change → debounced save ──────────────────────

  function onCheckboxChange() {
    if (!state) return;

    const checks = currentChecks();
    state.today_checks = checks;
    applyChecksLocally(checks);     // update streak immediately in local state
    renderChecklist(state);
    streakNum.textContent = state.streak || 0;
    streakFlame.textContent = (state.streak || 0) > 0 ? "🔥" : "💤";

    // Debounce server save (silent — errors shown via syncStatus)
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveChecks(checks, true), 600);
  }

  // ── Auto-save (debounced, silent) — sends checks for server-side evaluation ──

  async function saveChecks(checks, silent) {
    if (!state) return;
    try {
      const updated = await apiPut(
        `/api/streak/user/${encodeURIComponent(state.username)}/checks`,
        {
          checks,
          streak:             state.streak ?? 0,
          last_complete_date: state.last_complete_date || null,
          known_last_saved:   state.last_saved || null,
        }
      );
      state.streak             = updated.streak;
      state.last_saved         = updated.last_saved;
      state.last_complete_date = updated.last_complete_date;
      if (updated.completed_dates) state.completed_dates = updated.completed_dates;
      renderChecklist(state);
      streakNum.textContent = state.streak || 0;
      streakFlame.textContent = (state.streak || 0) > 0 ? "🔥" : "💤";
      showLastSaved(state.last_saved);
    } catch (err) {
      setSyncStatus("Auto-save failed — press Save to retry", true);
    }
  }

  // ── Manual Save button — force-pushes full local state to blob ─────────────

  async function forceSave() {
    if (!state) return;
    btnSave.disabled = true;
    btnSave.textContent = "Saving…";
    // Snapshot current checkbox state into local state before pushing
    state.today_checks = currentChecks();
    try {
      const updated = await apiPut(
        `/api/streak/user/${encodeURIComponent(state.username)}/sync`,
        state
      );
      state.last_saved = updated.last_saved;
      showLastSaved(state.last_saved);
      setSyncStatus("Saved ✓", false);
    } catch (err) {
      setSyncStatus("Save failed: " + err.message, true);
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = "Save";
    }
  }

  btnSave.addEventListener("click", () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    forceSave();
  });

  // ── Fetch button — full reload from blob ───────────────────

  btnFetch.addEventListener("click", async () => {
    if (!state) return;
    btnFetch.disabled = true;
    btnFetch.textContent = "Fetching…";
    try {
      const fresh = await apiGet(`/api/streak/user/${encodeURIComponent(state.username)}`);
      state = fresh;
      dayStartStreak = fresh.streak || 0;
      renderChecklist(state);
      streakNum.textContent = state.streak || 0;
      streakFlame.textContent = (state.streak || 0) > 0 ? "🔥" : "💤";
      showLastSaved(state.last_saved);
      setSyncStatus("Synced from cloud ✓", false);
    } catch (err) {
      setSyncStatus("Fetch failed: " + err.message, true);
    } finally {
      btnFetch.disabled = false;
      btnFetch.textContent = "↓ Fetch";
    }
  });

  // ── Delete item ────────────────────────────────────────────

  async function onDeleteItem(e) {
    const id = e.currentTarget.dataset.id;
    if (!state || !id) return;

    const items = (state.checklist_items || []).filter((it) => it.id !== id);
    await persistChecklist(items);
  }

  async function persistChecklist(items) {
    if (!state) return;
    try {
      const updated = await apiPut(
        `/api/streak/user/${encodeURIComponent(state.username)}/checklist`,
        { items, known_last_saved: state.last_saved || null }
      );
      // 1. Sync server-computed fields
      state.checklist_items    = items;
      state.today_checks       = updated.today_checks;
      state.streak             = updated.streak;
      state.last_saved         = updated.last_saved;
      state.last_complete_date = updated.last_complete_date;
      const calToday = todayISO();
      if (updated.last_complete_date !== calToday) {
        state.completed_dates = (state.completed_dates || []).filter(d => d !== calToday);
      }
      if (updated.completed_dates) state.completed_dates = updated.completed_dates;

      // 2. Render checklist first so the new item's checkbox exists in the DOM
      renderChecklist(state);

      // 3. NOW re-evaluate with the live DOM state — the user may have ticked
      //    new items while this request was in flight
      const liveChecks = currentChecks();
      applyChecksLocally(liveChecks);
      state.today_checks = liveChecks;

      // 4. Re-render to reflect any applyChecksLocally state change
      renderChecklist(state);
      streakNum.textContent = state.streak || 0;
      streakFlame.textContent = (state.streak || 0) > 0 ? "🔥" : "💤";
      showLastSaved(state.last_saved);
    } catch (err) {
      showMainError("Could not update checklist: " + err.message);
    }
  }

  // ── Add item ───────────────────────────────────────────────

  btnShowAddItem.addEventListener("click", () => {
    addItemForm.hidden = false;
    btnShowAddItem.hidden = true;
    newItemInput.focus();
  });

  btnCancelAddItem.addEventListener("click", closeAddItemForm);

  btnConfirmAddItem.addEventListener("click", confirmAddItem);

  newItemInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmAddItem();
    if (e.key === "Escape") closeAddItemForm();
  });

  function closeAddItemForm() {
    addItemForm.hidden = true;
    btnShowAddItem.hidden = false;
    newItemInput.value = "";
  }

  async function confirmAddItem() {
    const text = newItemInput.value.trim();
    if (!text || !state) return;

    const items = [
      ...(state.checklist_items || []),
      { id: uuid(), text },
    ];
    newItemInput.value = "";
    closeAddItemForm();
    await persistChecklist(items);
  }

  // ── Switch user ────────────────────────────────────────────

  btnSwitchUser.addEventListener("click", () => {
    if (!confirm("Switch to a different user? Your data is saved in the cloud.")) return;
    goToCreate();
  });

  // ── Delete user ────────────────────────────────────────────

  btnDeleteUser.addEventListener("click", async () => {
    if (!state) return;
    const name = state.username;
    if (!confirm(`Permanently delete the profile for "${name}"? This cannot be undone.`)) return;

    btnDeleteUser.disabled = true;
    btnDeleteUser.textContent = "Deleting…";

    try {
      const r = await fetch(`/api/streak/user/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${r.status}`);
      }
      goToCreate();
    } catch (err) {
      showMainError("Could not delete profile: " + err.message);
      btnDeleteUser.disabled = false;
      btnDeleteUser.textContent = "Delete profile";
    }
  });

  // ── Create profile ─────────────────────────────────────────

  // Seed items for the create form
  let seedRows = [];

  btnAddSeed.addEventListener("click", addSeedRow);

  function addSeedRow(prefill) {
    const row = document.createElement("div");
    row.className = "seed-row";
    const rowId = uuid();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "streak-input";
    input.placeholder = "e.g. Do one LeetCode problem";
    input.maxLength = 120;
    input.dataset.rowId = rowId;
    if (typeof prefill === "string") input.value = prefill;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost btn-sm btn-delete-seed";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      row.remove();
      seedRows = seedRows.filter((r) => r !== rowId);
    });

    row.appendChild(input);
    row.appendChild(del);
    seedItemsEl.appendChild(row);
    seedRows.push(rowId);
    input.focus();
  }

  btnCreateProfile.addEventListener("click", async () => {
    showCreateError("");
    const username = usernameInput.value.trim();
    if (!username) {
      showCreateError("Please enter your name.");
      usernameInput.focus();
      return;
    }

    const initial = parseInt(initialStreakInput.value, 10) || 0;

    // Collect seed items
    const seedInputs = seedItemsEl.querySelectorAll("input[type=text]");
    const checklist_items = [];
    seedInputs.forEach((inp) => {
      const text = inp.value.trim();
      if (text) checklist_items.push({ id: uuid(), text });
    });

    btnCreateProfile.disabled = true;
    btnCreateProfile.textContent = "Loading…";

    try {
      const user = await apiPost("/api/streak/users", {
        username,
        initial_streak: initial,
        checklist_items,
      });
      goToUser(user.username);
    } catch (err) {
      // Profile already exists — just navigate to it
      if (err.message.toLowerCase().includes("already exists")) {
        goToUser(username);
      } else {
        showCreateError(err.message);
        btnCreateProfile.disabled = false;
        btnCreateProfile.textContent = "Continue";
      }
    }
  });

  // Allow Enter on username input to submit
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnCreateProfile.click();
  });


  // ── Boot ───────────────────────────────────────────────────

  async function boot() {
    const username = window.STREAK_USERNAME || "";

    if (!username) {
      showLoading(false);
      showPanel("create");
      usernameInput.focus();
      return;
    }

    showLoading(true);
    showMainError("");

    try {
      const user = await apiGet(`/api/streak/user/${encodeURIComponent(username)}`);
      showLoading(false);
      renderDashboard(user);
    } catch (err) {
      showLoading(false);
      if (err.message.includes("not found") || err.message.includes("404")) {
        // Username in URL doesn't exist — send back to create
        goToCreate();
      } else {
        showMainError("Could not load your data: " + err.message);
        showPanel("create");
      }
    }
  }

  boot();
})();
