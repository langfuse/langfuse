import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";

import { isPlainObject } from "./utils";

/**
 * Translation of provider-executed tools from persisted
 * `modelParams.providerOptions.tools` into AI SDK provider tools.
 *
 * Entries use the provider's wire shape (snake_case). The AI SDK drops
 * arguments it does not know, so an entry with an unsupported type or field
 * fails translation instead of reaching the provider incomplete.
 */
export type TranslatedProviderTools =
  | { ok: true; tools: ToolSet | undefined }
  | { ok: false; reason: string };

type FieldMap = Record<string, string | { key: string; fields: FieldMap }>;

const USER_LOCATION_FIELDS: FieldMap = {
  type: "type",
  city: "city",
  region: "region",
  country: "country",
  timezone: "timezone",
};

const OPENAI_WEB_SEARCH_FIELDS: FieldMap = {
  search_context_size: "searchContextSize",
  external_web_access: "externalWebAccess",
  user_location: { key: "userLocation", fields: USER_LOCATION_FIELDS },
  filters: {
    key: "filters",
    fields: {
      allowed_domains: "allowedDomains",
      blocked_domains: "blockedDomains",
    },
  },
};

const ANTHROPIC_WEB_SEARCH_FIELDS: FieldMap = {
  max_uses: "maxUses",
  allowed_domains: "allowedDomains",
  blocked_domains: "blockedDomains",
  user_location: { key: "userLocation", fields: USER_LOCATION_FIELDS },
};

const ANTHROPIC_WEB_SEARCH_FACTORIES = {
  web_search_20250305: anthropic.tools.webSearch_20250305,
  web_search_20260209: anthropic.tools.webSearch_20260209,
  web_search_20260318: anthropic.tools.webSearch_20260318,
} as const;

/** The name Anthropic assigns to its web search server tool. */
const ANTHROPIC_WEB_SEARCH_NAME = "web_search";

export function translateOpenAIProviderTools(
  value: unknown,
): TranslatedProviderTools {
  return translateProviderTools(value, (type, args) => {
    switch (type) {
      case "web_search": {
        const mapped = mapFields(args, OPENAI_WEB_SEARCH_FIELDS);
        return mapped.ok
          ? { ok: true, name: type, tool: openai.tools.webSearch(mapped.value) }
          : mapped;
      }
      default:
        return {
          ok: false,
          reason: `tool type "${type}" is not supported; supported types: web_search`,
        };
    }
  });
}

export function translateAnthropicProviderTools(
  value: unknown,
): TranslatedProviderTools {
  return translateProviderTools(value, (type, { name, ...args }) => {
    if (!(type in ANTHROPIC_WEB_SEARCH_FACTORIES)) {
      return {
        ok: false,
        reason: `tool type "${type}" is not supported; supported types: ${Object.keys(ANTHROPIC_WEB_SEARCH_FACTORIES).join(", ")}`,
      };
    }
    if (name !== undefined && name !== ANTHROPIC_WEB_SEARCH_NAME) {
      return {
        ok: false,
        reason: `tool type "${type}" must be named "${ANTHROPIC_WEB_SEARCH_NAME}"`,
      };
    }

    const mapped = mapFields(args, ANTHROPIC_WEB_SEARCH_FIELDS);
    if (!mapped.ok) return mapped;

    const factory =
      ANTHROPIC_WEB_SEARCH_FACTORIES[
        type as keyof typeof ANTHROPIC_WEB_SEARCH_FACTORIES
      ];
    return {
      ok: true,
      name: ANTHROPIC_WEB_SEARCH_NAME,
      tool: factory(mapped.value),
    };
  });
}

type TranslatedTool =
  | { ok: true; name: string; tool: ToolSet[string] }
  | { ok: false; reason: string };

function translateProviderTools(
  value: unknown,
  translate: (type: string, args: Record<string, unknown>) => TranslatedTool,
): TranslatedProviderTools {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "tools must be an array" };
  }

  const tools: ToolSet = {};
  for (const entry of value) {
    if (!isPlainObject(entry) || typeof entry.type !== "string") {
      return {
        ok: false,
        reason: "each tool must be an object with a string type",
      };
    }

    const { type, ...args } = entry;
    const translated = translate(type, args);
    if (!translated.ok) return translated;
    if (translated.name in tools) {
      return {
        ok: false,
        reason: `tool "${translated.name}" is defined more than once`,
      };
    }
    tools[translated.name] = translated.tool;
  }

  return {
    ok: true,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
  };
}

function mapFields(
  args: Record<string, unknown>,
  fields: FieldMap,
): { ok: true; value: Record<string, never> } | { ok: false; reason: string } {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const field = fields[key];
    if (field === undefined) {
      return { ok: false, reason: `tool field "${key}" is not supported` };
    }
    if (typeof field === "string") {
      mapped[field] = value;
      continue;
    }
    if (!isPlainObject(value)) {
      return { ok: false, reason: `tool field "${key}" must be an object` };
    }

    const nested = mapFields(value, field.fields);
    if (!nested.ok) return nested;
    mapped[field.key] = nested.value;
  }

  // Field values keep the caller's types; the provider validates them.
  return { ok: true, value: mapped as Record<string, never> };
}
