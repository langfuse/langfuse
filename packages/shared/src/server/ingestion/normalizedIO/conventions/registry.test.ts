import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { registeredProviders } from "./index";

describe("provider convention registry", () => {
  it("registers every provider directory in conventions/", () => {
    // Registration is one export line in providers.ts — this catches the
    // forgotten line when a new provider directory is added.
    const providerDirectories = readdirSync(__dirname, {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory());

    expect(registeredProviders).toHaveLength(providerDirectories.length);
  });

  it("uses unique provider names", () => {
    const names = registeredProviders.map((provider) => provider.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps typed part vocabularies disjoint", () => {
    const owners = new Map<string, string>();

    for (const provider of registeredProviders) {
      for (const type of Object.keys(provider.typedParts ?? {})) {
        const previousOwner = owners.get(type);
        expect(
          previousOwner,
          `typed part "${type}" is declared by both ${previousOwner} and ${provider.name}`,
        ).toBeUndefined();
        owners.set(type, provider.name);
      }
    }
  });

  it("maps overlapping finish-reason vocabulary identically across providers", () => {
    // Any raw value claimed by several providers has to map to the same
    // canonical type, so registry order cannot change the result.
    const seen = new Map<string, { provider: string; type: string }>();

    for (const provider of registeredProviders) {
      for (const [raw, type] of Object.entries(
        provider.finishReasonTypeByRaw ?? {},
      )) {
        const previous = seen.get(raw);
        if (previous) {
          expect(
            { raw, type, agreesWith: previous },
            `"${raw}" maps to "${type}" in ${provider.name} but "${previous.type}" in ${previous.provider}`,
          ).toMatchObject({ type: previous.type });
        }
        seen.set(raw, { provider: provider.name, type });
      }
    }
  });
});
