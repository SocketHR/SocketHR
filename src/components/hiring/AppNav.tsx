"use client";

import { useState } from "react";

export default function AppNav({
  onHome,
  loggedIn,
  onLogout,
  onNewJob,
  searchQuery,
  setSearchQuery,
}: any) {
  const [showSearch, setShowSearch] = useState(false);
  return (
    <nav className="flex items-center justify-between border-b border-paper-line/50 bg-paper/90 px-6 py-3 font-ui backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button type="button" className="flex items-center gap-2" onClick={onHome}>
          <span className="text-sm font-bold text-ink">SocketHR</span>
        </button>
        <div className="relative">
          {showSearch ? (
            <input
              autoFocus
              className="w-64 rounded-lg bg-paper-line/30 px-3 py-1.5 text-sm text-ink focus:outline-none"
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => {
                if (!searchQuery) setShowSearch(false);
              }}
              onKeyDown={(e) => e.key === "Escape" && setShowSearch(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="rounded-lg px-2 py-1.5 text-xs text-ink-faint transition hover:bg-paper-line/20 hover:text-ink"
            >
              Search
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onNewJob && (
          <button type="button" onClick={onNewJob} className="text-xs text-ink-faint transition hover:text-ink">
            + New Job
          </button>
        )}
        {loggedIn && (
          <button type="button" onClick={onLogout} className="text-xs text-ink-faint transition hover:text-red-600">
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
