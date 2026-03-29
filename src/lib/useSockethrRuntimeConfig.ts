import { useState, useEffect } from "react";

const NEXT_API_RAW = process.env.NEXT_PUBLIC_SOCKETHR_API_BASE || "";
export const hasApiOverride =
  typeof NEXT_API_RAW === "string" && NEXT_API_RAW.trim().length > 0;

export const DEFAULT_API_BASE = hasApiOverride
  ? NEXT_API_RAW.trim().replace(/\/$/, "")
  : "https://api.sockethr.com";

export function useSockethrRuntimeConfig() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const fetchUrl = `/runtime-config.json?t=${Date.now()}`;

    fetch(fetchUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== "object") return;
        if (!hasApiOverride && "apiBase" in data) {
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
