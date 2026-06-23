/* user-menu.js — shared header user menu for NeetTyper and NeetTracker */
(function (global) {
  "use strict";

  function isUserNotFoundError(err) {
    const msg = (err && err.message) || "";
    return msg.includes("not found") || msg.includes("404");
  }

  function init(config) {
    const $ = (id) => document.getElementById(id);

    const userMenuLabel         = $("user-menu-label");
    const userMenuUsername      = $("user-menu-username");
    const userMenuPasskey       = $("user-menu-passkey");
    const userMenuLoadSection   = $("user-menu-load-section");
    const userMenuActions       = $("user-menu-actions");
    const userMenuBtnLoad       = $("user-menu-btn-load");
    const userMenuBtnCreate     = $("user-menu-btn-create");
    const userMenuBtnLoadSaved  = $("user-menu-btn-load-saved");
    const userMenuBtnSignOut    = $("user-menu-btn-sign-out");
    const userMenuBtnChange     = $("user-menu-btn-change");
    const userMenuPasskeySection = $("user-menu-passkey-section");
    const userMenuCurrentPasskey = $("user-menu-current-passkey");
    const userMenuNewPasskey     = $("user-menu-new-passkey");
    const userMenuBtnChangePasskey = $("user-menu-btn-change-passkey");
    const userMenuDeleteSection = $("user-menu-delete-section");
    const userMenuDeletePasskey = $("user-menu-delete-passkey");
    const userMenuBtnDelete     = $("user-menu-btn-delete");
    const userMenuError         = $("user-menu-error");
    const userMenuTrigger       = $("user-menu-trigger");
    const userMenu              = $("user-menu");

    if (!userMenu || !userMenuTrigger) {
      return { updateUserMenu: () => {}, showUserMenuError: () => {} };
    }

    let userMenuCloseTimer = null;

    function setUserMenuOpen(open) {
      userMenu.classList.toggle("user-menu--open", open);
      userMenuTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function showUserMenuError(msg, isSuccess) {
      if (!userMenuError) return;
      userMenuError.textContent = msg || "";
      userMenuError.hidden = !msg;
      userMenuError.classList.toggle("user-menu-error--ok", !!isSuccess);
    }

    function updateUserMenu() {
      const remembered = global.NeetAuth ? NeetAuth.rememberedUsername() : "";
      const displayName = config.getProfileUsername() || remembered;
      const loaded = config.getProfileLoaded();

      userMenuTrigger.classList.toggle("user-menu-trigger--loaded", loaded && !!displayName);
      userMenuTrigger.classList.toggle("user-menu-trigger--pending", !!displayName && !loaded);

      if (userMenuLabel) {
        userMenuLabel.textContent = displayName
          ? (loaded ? displayName : displayName + " (not loaded)")
          : "Sign in";
      }

      if (config.updateNavLinks) {
        config.updateNavLinks(displayName, loaded);
      }

      if (userMenuUsername && document.activeElement !== userMenuUsername && displayName) {
        userMenuUsername.value = displayName;
      }

      const showLoadForm = !loaded;
      if (userMenuLoadSection) userMenuLoadSection.hidden = !showLoadForm;
      if (userMenuActions) userMenuActions.hidden = showLoadForm;
      if (userMenuBtnLoadSaved) {
        userMenuBtnLoadSaved.hidden = !(displayName && !loaded);
      }
      if (userMenuBtnSignOut) {
        userMenuBtnSignOut.hidden = !loaded;
      }
      if (userMenuPasskeySection) {
        userMenuPasskeySection.hidden = !(loaded && config.getProfileUsername());
      }
      if (userMenuDeleteSection) {
        userMenuDeleteSection.hidden = !(loaded && config.getProfileUsername());
      }
    }

    async function loginAndLoadUser(username, passkey) {
      if (!global.NeetAuth) throw new Error("Auth unavailable");
      const user = await NeetAuth.loginUser(username, passkey);
      NeetAuth.saveAuth(username, passkey);
      if (config.setProfileUsername) config.setProfileUsername(user.username || username);
      config.setProfileLoaded(true);
      if (config.onLoginSuccess) config.onLoginSuccess(user);
      updateUserMenu();
      return user;
    }

    async function handleLoadUser(useSavedUsername) {
      showUserMenuError("");
      const username = (useSavedUsername
        ? (config.getProfileUsername() || (NeetAuth && NeetAuth.rememberedUsername()))
        : (userMenuUsername && userMenuUsername.value.trim())) || "";
      const passkey = userMenuPasskey ? userMenuPasskey.value : "";

      if (!username) {
        showUserMenuError("Enter your username.");
        if (userMenuUsername) userMenuUsername.focus();
        return;
      }

      if (userMenuBtnLoad) userMenuBtnLoad.disabled = true;
      try {
        await loginAndLoadUser(username, passkey);
        if (config.redirectAfterLoad) config.redirectAfterLoad(username);
      } catch (err) {
        if (isUserNotFoundError(err) && config.goToProfileCreation) {
          config.goToProfileCreation(username);
          return;
        }
        showUserMenuError(err.message || "Could not load profile.");
      } finally {
        if (userMenuBtnLoad) userMenuBtnLoad.disabled = false;
      }
    }

    function handleChangeUser() {
      if (global.NeetAuth) NeetAuth.clearAuth();
      if (config.setProfileUsername) config.setProfileUsername("");
      config.setProfileLoaded(false);
      if (config.onChangeUserExtra) config.onChangeUserExtra();
      if (userMenuPasskey) userMenuPasskey.value = "";
      if (userMenuCurrentPasskey) userMenuCurrentPasskey.value = "";
      if (userMenuNewPasskey) userMenuNewPasskey.value = "";
      if (userMenuDeletePasskey) userMenuDeletePasskey.value = "";
      showUserMenuError("");
      updateUserMenu();
      if (config.onChangeUserRedirect) config.onChangeUserRedirect();
    }

    function handleSignOut() {
      if (global.NeetAuth) NeetAuth.signOut();
      config.setProfileLoaded(false);
      if (config.onSignOutExtra) config.onSignOutExtra();
      if (userMenuPasskey) userMenuPasskey.value = "";
      if (userMenuCurrentPasskey) userMenuCurrentPasskey.value = "";
      if (userMenuNewPasskey) userMenuNewPasskey.value = "";
      if (userMenuDeletePasskey) userMenuDeletePasskey.value = "";
      showUserMenuError("");
      setUserMenuOpen(false);
      updateUserMenu();
      if (config.onSignOutRedirect) config.onSignOutRedirect();
    }

    async function handleChangePasskey() {
      const username = config.getProfileUsername();
      if (!username || !global.NeetAuth) return;
      showUserMenuError("");
      const current = userMenuCurrentPasskey ? userMenuCurrentPasskey.value : "";
      const newPasskey = userMenuNewPasskey ? userMenuNewPasskey.value : "";

      if (newPasskey.length < 4) {
        showUserMenuError("New passkey must be at least 4 characters.");
        if (userMenuNewPasskey) userMenuNewPasskey.focus();
        return;
      }

      if (userMenuBtnChangePasskey) userMenuBtnChangePasskey.disabled = true;
      try {
        await NeetAuth.changePasskey(username, current, newPasskey);
        NeetAuth.saveAuth(username, newPasskey);
        if (userMenuCurrentPasskey) userMenuCurrentPasskey.value = "";
        if (userMenuNewPasskey) userMenuNewPasskey.value = "";
        showUserMenuError("Passkey updated.", true);
      } catch (err) {
        showUserMenuError(err.message || "Could not change passkey.");
      } finally {
        if (userMenuBtnChangePasskey) userMenuBtnChangePasskey.disabled = false;
      }
    }

    async function handleDeleteUser() {
      const username = config.getProfileUsername();
      if (!username || !global.NeetAuth) return;
      if (!confirm(`Permanently delete the profile for "${username}"? This cannot be undone.`)) return;
      showUserMenuError("");
      const passkey = userMenuDeletePasskey ? userMenuDeletePasskey.value : "";
      if (userMenuBtnDelete) userMenuBtnDelete.disabled = true;
      try {
        await NeetAuth.deleteUser(username, passkey);
        NeetAuth.clearAuth();
        if (config.setProfileUsername) config.setProfileUsername("");
        config.setProfileLoaded(false);
        if (config.onDeleteSuccess) config.onDeleteSuccess();
        else window.location.href = "/";
      } catch (err) {
        showUserMenuError(err.message || "Could not delete profile.");
      } finally {
        if (userMenuBtnDelete) userMenuBtnDelete.disabled = false;
      }
    }

    userMenu.addEventListener("mouseenter", () => {
      if (userMenuCloseTimer) {
        clearTimeout(userMenuCloseTimer);
        userMenuCloseTimer = null;
      }
      setUserMenuOpen(true);
    });

    userMenu.addEventListener("mouseleave", () => {
      userMenuCloseTimer = setTimeout(() => {
        if (userMenu.contains(document.activeElement)) return;
        setUserMenuOpen(false);
      }, 250);
    });

    userMenuTrigger.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setUserMenuOpen(!userMenu.classList.contains("user-menu--open"));
    });

    document.addEventListener("click", (ev) => {
      if (!userMenu.contains(ev.target)) setUserMenuOpen(false);
    });

    userMenu.addEventListener("focusin", () => setUserMenuOpen(true));

    if (userMenuBtnLoad) userMenuBtnLoad.addEventListener("click", () => handleLoadUser(false));
    if (userMenuBtnLoadSaved) userMenuBtnLoadSaved.addEventListener("click", () => handleLoadUser(true));
    if (userMenuBtnSignOut) userMenuBtnSignOut.addEventListener("click", handleSignOut);
    if (userMenuBtnChange) userMenuBtnChange.addEventListener("click", handleChangeUser);
    if (userMenuBtnChangePasskey) userMenuBtnChangePasskey.addEventListener("click", handleChangePasskey);
    if (userMenuBtnDelete) userMenuBtnDelete.addEventListener("click", handleDeleteUser);
    if (userMenuBtnCreate) {
      userMenuBtnCreate.addEventListener("click", () => {
        const username = userMenuUsername ? userMenuUsername.value.trim() : "";
        if (config.goToProfileCreation) {
          config.goToProfileCreation(username || "");
        } else if (username) {
          window.location.href = "/streak?username=" + encodeURIComponent(username);
        } else {
          window.location.href = "/streak";
        }
      });
    }
    if (userMenuPasskey) {
      userMenuPasskey.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") handleLoadUser(false);
      });
    }

    return {
      updateUserMenu,
      showUserMenuError,
      loginAndLoadUser,
    };
  }

  global.NeetUserMenu = { init, isUserNotFoundError };
})(window);
