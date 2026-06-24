/* profile-auth.js — shared passkey session helpers */
(function () {
  "use strict";

  const AUTH_KEY = "neettyper_auth";
  const USER_KEY = "neettyper_username";

  function saveAuth(username, passkey) {
    try {
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({ username, passkey }));
      localStorage.setItem(USER_KEY, username);
    } catch (_) {}
  }

  function loadAuth() {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.username) return null;
      return { username: parsed.username, passkey: parsed.passkey || "" };
    } catch (_) {
      return null;
    }
  }

  function clearAuth() {
    try {
      sessionStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }

  function signOut() {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch (_) {}
  }

  function rememberedUsername() {
    try {
      return localStorage.getItem(USER_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function rememberUsername(username) {
    try {
      localStorage.setItem(USER_KEY, username);
    } catch (_) {}
  }

  async function loginUser(username, passkey) {
    const r = await fetch(`/api/streak/user/${encodeURIComponent(username)}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  async function deleteUser(username, passkey) {
    const r = await fetch(`/api/streak/user/${encodeURIComponent(username)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  async function changePasskey(username, currentPasskey, newPasskey) {
    const r = await fetch(`/api/streak/user/${encodeURIComponent(username)}/passkey`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_passkey: currentPasskey,
        new_passkey: newPasskey,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  }

  window.NeetAuth = {
    saveAuth,
    loadAuth,
    clearAuth,
    signOut,
    rememberedUsername,
    rememberUsername,
    loginUser,
    deleteUser,
    changePasskey,
  };
})();
