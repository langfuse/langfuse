// Resolve the v4 search-bar Ask AI system prompt.
//
// Mirrors the v3 `naturalLanguageFilters.createCompletion` dogfooding
// pattern (`../../natural-language-filters/server/router.ts`): prefer a
// MANAGED chat prompt fetched from the AI-features Langfuse project via the
// SAME client (`getLangfuseClient`), and fall back to the code-built
// skeleton (`buildFilterSystemPrompt`) whenever the managed prompt is
// unavailable — self-hosted (no AI-features keys configured) or the
// fetch/compile call throws. Unlike v3 (which hard-fails when the keys are
// missing), this endpoint must NEVER hard-fail just because the managed
// prompt couldn't be fetched — self-hosted is an expected, ordinary state,
// not an error, and even a fetch failure only degrades to the fallback (with
// a `logger.warn`, so a broken managed prompt stays visible instead of
// silently misbehaving).
//
// Gated on AI-features KEYS only — same as v3, and deliberately NOT on the
// org's `aiTelemetryEnabled` setting. Fetching and compiling our OWN managed
// prompt is a GET of our prompt; it sends no org data anywhere, so there is
// nothing for telemetry consent to gate here. `aiTelemetryEnabled` continues
// to gate exactly what it always has: the trace WRITE and the prompt-version
// link, both inside `router.ts`'s `traceSinkParams`. A telemetry-off org
// still gets the improved managed prompt; it just doesn't get traced.
//
// The MANAGED prompt is the source of truth for the INSTRUCTIONAL PROSE
// (Role, output format, Levels, Metadata, Scores, Null checks, Negation, Tag
// groups, Intent hints, Examples) — in cloud this is edited live in the
// Langfuse UI. Its `{{catalog}}` / `{{nullable_ids}}` compile variables are
// the SAME registry-derived strings the code fallback builds
// (`buildFieldCatalog` / `nullableFieldIds` in `./buildFilterPrompt`), so the
// model's column vocabulary can never drift from the bar grammar regardless
// of which path served the prompt. Drift in the PROSE between the managed
// prompt and the code fallback is intentional — that's the whole point of
// making it editable — and must not be tested for equality.
//
// The repo-versioned starting point for the managed prompt lives at
// `./prompts/search-bar-filter.prompt.json`; `scripts/ask-ai/sync-search-bar-filter-prompt.sh`
// pushes it to each region (run manually by a human with real keys, never by
// an agent).

import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  logger,
} from "@langfuse/shared/src/server";
import type { ChatPromptClient } from "langfuse";
import { getLangfuseClient } from "@/src/features/natural-language-filters/server/utils";
import {
  buildFieldCatalog,
  buildFilterSystemPrompt,
  nullableFieldIds,
} from "./buildFilterPrompt";

/** Name of the managed chat prompt in the AI-features Langfuse project. Kept
 *  in sync with the repo seed file (`./prompts/search-bar-filter.prompt.json`)
 *  and the sync script (`scripts/ask-ai/sync-search-bar-filter-prompt.sh`). */
export const SEARCH_BAR_FILTER_PROMPT_NAME = "search-bar-filter";

export type ResolvedFilterSystemPrompt = {
  /** The system message(s) to prepend to the request. Always non-empty. */
  messages: ChatMessage[];
  /** Set only when the managed prompt served the request, so the caller can
   *  link the generation's trace to the exact prompt version. Omitted
   *  (undefined) when the code fallback served the request instead. */
  usedPrompt?: ChatPromptClient;
};

function buildFallbackPrompt(
  currentDatetime: string,
): ResolvedFilterSystemPrompt {
  return {
    messages: [
      {
        role: ChatMessageRole.System,
        content: buildFilterSystemPrompt(currentDatetime),
        type: ChatMessageType.PublicAPICreated,
      },
    ],
  };
}

// The managed prompt is edited live in the Langfuse UI, so a bad edit can
// compile to a structurally-invalid chat message: an unsupported role or
// non-string (e.g. multimodal) content. Such a message must degrade to the
// code fallback rather than reach `generateLangfuseAIText` and 500 the request.
const VALID_CHAT_ROLES: ReadonlySet<string> = new Set(
  Object.values(ChatMessageRole),
);
function isUsableChatMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  const { role, content } = message as { role?: unknown; content?: unknown };
  return (
    typeof role === "string" &&
    VALID_CHAT_ROLES.has(role) &&
    typeof content === "string"
  );
}

/**
 * Build the system-prompt message(s) for `searchBar.generateFilter`: try the
 * managed `search-bar-filter` Langfuse prompt first, fall back to the
 * code-built skeleton on any reason it can't be used.
 */
export async function resolveFilterSystemPrompt(params: {
  currentDatetime: string;
  projectId: string;
  aiFeaturesPublicKey: string | undefined;
  aiFeaturesSecretKey: string | undefined;
  aiFeaturesHost: string | undefined;
}): Promise<ResolvedFilterSystemPrompt> {
  const fallback = buildFallbackPrompt(params.currentDatetime);

  // Self-hosted (no keys) is an expected, ordinary state — the AI-features
  // project is never contacted, so there is nothing to fetch and nothing to
  // warn about. This is a CAPABILITY check only; whether the org has AI
  // telemetry on is irrelevant to whether we can read our own prompt.
  const canUseManagedPrompt =
    Boolean(params.aiFeaturesPublicKey) && Boolean(params.aiFeaturesSecretKey);
  if (!canUseManagedPrompt) {
    return fallback;
  }

  try {
    const client = getLangfuseClient(
      params.aiFeaturesPublicKey!,
      params.aiFeaturesSecretKey!,
      params.aiFeaturesHost,
      false,
    );
    const promptResponse = await client.getPrompt(
      SEARCH_BAR_FILTER_PROMPT_NAME,
      undefined,
      // A slow or erroring AI-features project must never stall the user's
      // request — a fast local fallback exists, so there is no reason to
      // inherit the SDK's default retry/timeout budget (~15s worst case).
      { type: "chat", fetchTimeoutMs: 2000, maxRetries: 0 },
    );
    const compiled = promptResponse.compile({
      catalog: buildFieldCatalog(),
      nullable_ids: nullableFieldIds(),
      current_datetime: params.currentDatetime,
    });
    // `getPrompt` is typed to return chat messages for `{ type: "chat" }`, but
    // that only holds if the live prompt is actually a well-formed chat prompt.
    // A bad edit can compile to: a STRING (if stored as a text prompt), an
    // EMPTY array, or an array with a MALFORMED message (unsupported role /
    // non-string content). Any of these would otherwise reach
    // `generateLangfuseAIText` and 500 the request, so validate the structure
    // explicitly and degrade to the code fallback (staying visible via a warn).
    if (
      !Array.isArray(compiled) ||
      compiled.length === 0 ||
      !compiled.every(isUsableChatMessage)
    ) {
      logger.warn(
        "Search-bar AI filter: managed prompt compiled to an empty or malformed chat result, falling back to the code-built prompt",
        { projectId: params.projectId },
      );
      return fallback;
    }
    const messages: ChatMessage[] = compiled.map((message) => ({
      ...(message as ChatMessage),
      type: ChatMessageType.PublicAPICreated,
    }));
    return { messages, usedPrompt: promptResponse };
  } catch (error) {
    // A broken or unreachable managed prompt must degrade to the code
    // fallback, never 500 the endpoint — but stay visible via a warn log.
    logger.warn(
      "Search-bar AI filter: failed to fetch the managed prompt, falling back to the code-built prompt",
      { projectId: params.projectId, error },
    );
    return fallback;
  }
}
