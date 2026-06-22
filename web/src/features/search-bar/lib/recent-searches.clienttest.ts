import { describe, expect, it, beforeEach } from "vitest";

import { getRecentSearches, recordRecentSearch } from "./recent-searches";

describe("recent searches", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
  });

  it("scopes recents by project and registry", () => {
    recordRecentSearch("project-a", "level:ERROR", "events");
    recordRecentSearch("project-a", "severity:CRITICAL", "monitors");
    recordRecentSearch("project-b", "status:ACTIVE", "monitors");

    expect(getRecentSearches("project-a", "events")).toEqual(["level:ERROR"]);
    expect(getRecentSearches("project-a", "monitors")).toEqual([
      "severity:CRITICAL",
    ]);
    expect(getRecentSearches("project-b", "monitors")).toEqual([
      "status:ACTIVE",
    ]);
  });
});
