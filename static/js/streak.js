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

  // ── Checkbox change → debounced save ──────────────────────

  function onCheckboxChange() {
    if (!state) return;

    // Update local state immediately
    const checks = {};
    checklistEl.querySelectorAll(".checklist-cb").forEach((cb) => {
      checks[cb.dataset.id] = cb.checked;
    });
    state.today_checks = checks;
    renderChecklist(state);

    // Debounce server save
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveChecks(checks), 600);
  }

  async function saveChecks(checks) {
    if (!state) return;
    try {
      const updated = await apiPut(
        `/api/streak/user/${encodeURIComponent(state.username)}/checks`,
        { checks }
      );
      state = updated;
      renderChecklist(state);
      // Update streak display
      streakNum.textContent = state.streak || 0;
      streakFlame.textContent = (state.streak || 0) > 0 ? "🔥" : "💤";
    } catch (err) {
      showMainError("Could not save progress: " + err.message);
    }
  }

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
        { items }
      );
      state = updated;
      renderChecklist(state);
      // Streak may have changed (new unchecked item added, or checked item removed)
      streakNum.textContent = state.streak || 0;
      streakFlame.textContent = (state.streak || 0) > 0 ? "🔥" : "💤";
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
