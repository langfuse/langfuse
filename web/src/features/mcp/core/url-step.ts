/**
 * Sending the user to a Langfuse page through a URL-mode elicitation in MCP
 * multi round-trip requests (protocol revision 2026-07-28).
 *
 * For steps the agent must not do itself, such as entering an API key, the
 * tool answers with an `input_required` result asking the client to open a
 * Langfuse page. The user completes the step there and the client retries the
 * same call with the answer in `inputResponses`. The retry runs the tool
 * again, which then either succeeds or fails as before: an accepted URL
 * elicitation only says the user is done, not that the step succeeded.
 */

import { createHash } from "node:crypto";
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
  type ClientCapabilities,
  type InputRequiredResult,
  type ServerContext as McpRequestContext,
} from "@modelcontextprotocol/server";

/**
 * Binds an answer to the exact call it belongs to: a retry with different
 * arguments is asked again. The value carries no authority, so it needs no
 * signature; a forged value only causes another request.
 */
function fingerprint(toolName: string, input: unknown): string {
  return createHash("sha256")
    .update(`${toolName}\0${JSON.stringify(input)}`)
    .digest("hex");
}

/**
 * Only 2026-07-28 requests carry the client's capabilities in their `_meta`
 * envelope; 2025-era requests have none and are never asked.
 */
function canElicitUrl(mcpRequest: McpRequestContext): boolean {
  // The SDK validates the envelope before dispatch; its bundled type does
  // not name the keys.
  const envelope = mcpRequest.mcpReq.envelope as
    | { [CLIENT_CAPABILITIES_META_KEY]?: ClientCapabilities }
    | undefined;
  return (
    envelope?.[CLIENT_CAPABILITIES_META_KEY]?.elicitation?.url !== undefined
  );
}

/**
 * Returns the URL request to send for this call, or `undefined` when the
 * client cannot open it or already answered it for this exact call. In both
 * cases the tool reports its failure as usual.
 */
export function requestUrlStep(params: {
  toolName: string;
  /** Key of the input request. */
  key: string;
  message: string;
  url: string;
  input: unknown;
  mcpRequest: McpRequestContext | undefined;
}): InputRequiredResult | undefined {
  const { toolName, key, message, url, input, mcpRequest } = params;

  if (!mcpRequest || !canElicitUrl(mcpRequest)) return undefined;

  const state = fingerprint(toolName, input);
  if (
    mcpRequest.mcpReq.requestState() === state &&
    inputResponse(mcpRequest.mcpReq.inputResponses, key).kind === "elicit"
  ) {
    return undefined;
  }

  return inputRequired({
    inputRequests: { [key]: inputRequired.elicitUrl({ message, url }) },
    requestState: state,
  });
}
