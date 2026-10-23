/* App context: session (auth), locale, toasts, error translation. */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { api } from "../services/api";
import { LOCALES, localeDir, makeT } from "../i18n";

const AppCtx = createContext(null);

/* Safe storage: falls back to memory when localStorage is unavailable
   (sandboxed preview iframes, some private-browsing modes). */
const mem = {};
export const storage = {
  get(key) { try { return localStorage.getItem(key) ?? mem[key] ?? null; } catch { return mem[key] ?? null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { mem[key] = value; } },
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [locale, setLocale] = useState(() => {
    const saved = storage.get("wassilha_locale");
    return saved && LOCALES[saved] ? saved : "ar";
  });
  const [toasts, setToasts] = useState([]);

  const t = useMemo(() => makeT(locale), [locale]);

  // restore session on load
  useEffect(() => {
    api.get("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // apply locale to <html>
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
    storage.set("wassilha_locale", locale);
  }, [locale]);

  const toast = useCallback((message, kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, message, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);

  // translate API errors: {code: "detail_code"} -> human message
  const tError = useCallback(
    (err) => {
      if (!err) return t("err_unknown");
      if (err.code === "network") return t("err_network");
      if (typeof err.code === "string" && err.code.startsWith("err_")) return t(err.code);
      const key = "err_" + String(err.code);
      const translated = t(key);
      if (translated !== key) return translated;
      if (err.status === 422) return t("err_invalid_datetime");
      if (err.status === 429) return t("err_rate_limited");
      if (err.status === 401) return t("err_not_authenticated");
      return t("err_unknown");
    },
    [t],
  );

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    setUser(data.user);
    if (data.user?.locale && LOCALES[data.user.locale]) setLocale(data.user.locale);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post("/auth/register", payload);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
    } catch { /* ignore */ }
    setUser(null);
  }, []);

  const value = {
    user, authChecked, locale, setLocale, t, tError, toast, toasts,
    login, register, logout, setUser,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
