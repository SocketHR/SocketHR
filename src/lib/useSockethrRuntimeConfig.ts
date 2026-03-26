import { useState, useEffect } from "react";

/** Build-time override. If unset, default matches committed `public/runtime-config.json` until JSON is fetched. */
const VITE_API_RAW = import.meta.env.VITE_SOCKETHR_API_BASE;
export const hasViteApiOverride =
  typeof VITE_API_RAW === "string" && VITE_API_RAW.trim().length > 0;

export const DEFAULT_API_BASE = hasViteApiOverride
  ? VITE_API_RAW.trim().replace(/\/$/, "")
  : "https://api.sockethr.com";

export function useSockethrRuntimeConfig() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    const prefix = base.endsWith("/") ? base : `${base}/`;
    const fetchUrl = `${prefix}runtime-config.json?t=${Date.now()}`;

    fetch(fetchUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== "object" || data === null) return;

        if (!hasViteApiOverride && "apiBase" in data) {
          const v = (data as { apiBase?: unknown }).apiBase;
          if (typeof v === "string") {
            const trimmed = v.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
              setApiBase(trimmed.replace(/\/$/, ""));
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, []);

  return { apiBase, configLoaded };
}
