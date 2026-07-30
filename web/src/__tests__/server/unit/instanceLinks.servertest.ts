import { describe, it, expect, vi, afterEach } from "vitest";

import {
  parseInstanceLinks,
  findCurrentInstance,
} from "@/src/ee/features/ui-customization/instanceLinks";

describe("parseInstanceLinks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a valid JSON array of {name, url} objects", () => {
    const raw = JSON.stringify([
      { name: "Staging", url: "https://langfuse-staging.example.com" },
      { name: "Prod", url: "https://langfuse.example.com" },
    ]);
    expect(parseInstanceLinks(raw)).toEqual([
      { name: "Staging", url: "https://langfuse-staging.example.com" },
      { name: "Prod", url: "https://langfuse.example.com" },
    ]);
  });

  it("returns null when unset or blank", () => {
    expect(parseInstanceLinks(undefined)).toBeNull();
    expect(parseInstanceLinks("")).toBeNull();
    expect(parseInstanceLinks("   ")).toBeNull();
  });

  it("returns null and warns on invalid JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseInstanceLinks("not json")).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("returns null and warns when the JSON is not an array of {name, url}", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseInstanceLinks('{"name":"A","url":"https://a.com"}')).toBeNull();
    expect(parseInstanceLinks('[{"name":"A"}]')).toBeNull();
    expect(
      parseInstanceLinks('[{"name":"","url":"https://a.com"}]'),
    ).toBeNull();
    expect(parseInstanceLinks('[{"name":"A","url":"not-a-url"}]')).toBeNull();
    expect(parseInstanceLinks("[]")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(5);
  });
});

describe("findCurrentInstance", () => {
  const links = [
    { name: "Staging", url: "https://langfuse-staging.example.com" },
    { name: "Dev", url: "https://langfuse.example.com:8443" },
  ];

  it("matches by host including the port", () => {
    expect(findCurrentInstance(links, "langfuse-staging.example.com")).toEqual(
      links[0],
    );
    expect(findCurrentInstance(links, "langfuse.example.com:8443")).toEqual(
      links[1],
    );
  });

  it("returns undefined when nothing matches or the host is unknown", () => {
    expect(findCurrentInstance(links, "other.example.com")).toBeUndefined();
    expect(findCurrentInstance(links, "langfuse.example.com")).toBeUndefined();
    expect(findCurrentInstance(links, undefined)).toBeUndefined();
  });
});
