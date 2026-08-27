import { claimed, unmatched } from "../..";
import {
  asRecord,
  compact,
  optionalString,
  parseArray,
  toJsonValue,
} from "../../../core/utils/json";
import {
  filePartFromMediaReference,
  filePartFromUrl,
  parseMediaReference,
} from "../../../core/normalize/message-parts/media";
import { reasoningPart } from "../../../core/normalize/message-parts/reasoning";
import { toolCallPart } from "../../../core/normalize/message-parts/tool-calls";
import { toolResultPart } from "../../../core/normalize/message-parts/tool-results";
import type {
  FilePart,
  FinishReason,
  NormalizedMessagePart,
  ToolResultPart,
} from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  PartHandlerContext,
  MessageSource,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/**
 * Gemini / Vertex convention. Gemini parts are keyed unions without a `type`
 * discriminator (functionCall, inlineData, fileData, executableCode,
 * codeExecutionResult, bare thought text) — recognized only when `type` is
 * absent. This module also owns the `contents`/`system_instruction`/
 * `candidates` container discovery and `config.tools` definitions.
 */

// Gemini `finishReason` vocabulary (reported uppercase; lookups are
// lowercased) -> the canonical FinishReason set.
const GEMINI_FINISH_REASON_TYPE_BY_RAW: Record<string, FinishReason["type"]> = {
  stop: "stop",
  max_tokens: "length",
  safety: "content-filter",
  recitation: "content-filter",
  blocklist: "content-filter",
  prohibited_content: "content-filter",
  spii: "content-filter",
  malformed_function_call: "error",
  other: "other",
};

/**
 * Keyed-union parts without a `type` discriminator: Gemini's keyed parts in
 * both SDK casings, plus the legacy function_call/function_response wrappers.
 */
function normalizeGeminiPart(
  value: Record<string, unknown>,
  _context: PartHandlerContext,
): ConventionResult<NormalizedMessagePart> {
  if (typeof value.type === "string") return unmatched;

  const functionCall =
    asRecord(value.function_call) ?? asRecord(value.functionCall);
  if (functionCall) {
    // Gemini functionCall: { name, args } (id sometimes on the wrapper).
    const part = toolCallPart({
      toolCallId: functionCall.id ?? value.id,
      toolName: functionCall.name,
      input: functionCall.args ?? functionCall.arguments,
      toolType: "functionCall",
    });
    return part ? claimed(part) : unmatched;
  }

  const functionResponse =
    asRecord(value.function_response) ?? asRecord(value.functionResponse);
  if (functionResponse) {
    // Gemini functionResponse: { name, response } — the name doubles as the
    // call id fallback, not the tool name (parity with the original join).
    return claimed(
      toolResultPart({
        toolCallId: functionResponse.id ?? functionResponse.name ?? value.id,
        output: functionResponse.response,
      }),
    );
  }

  const inlineData = asRecord(value.inline_data) ?? asRecord(value.inlineData);
  if (inlineData) {
    const data = optionalString(inlineData.data);
    if (data) {
      const reference = parseMediaReference(data);
      if (reference) return claimed(filePartFromMediaReference(reference));
      return claimed(
        compact<FilePart>({
          type: "file",
          mediaType: optionalString(
            inlineData.mime_type ?? inlineData.mimeType,
          ),
          content: { kind: "base64", data },
        }),
      );
    }
  }

  // Record shape only: OpenAI's `file_data` is a base64 string and belongs
  // to the typed file/input_file cases.
  const geminiFileData = asRecord(value.file_data) ?? asRecord(value.fileData);
  if (geminiFileData) {
    const fileUri = optionalString(
      geminiFileData.file_uri ?? geminiFileData.fileUri,
    );
    if (fileUri) {
      return claimed(
        filePartFromUrl(fileUri, {
          mediaType: optionalString(
            geminiFileData.mime_type ?? geminiFileData.mimeType,
          ),
        }),
      );
    }
  }

  const executableCode =
    asRecord(value.executable_code) ?? asRecord(value.executableCode);
  if (executableCode) {
    return claimed({
      type: "tool-call",
      toolCallId: null,
      toolName: "code_execution",
      input: toJsonValue(executableCode),
      toolType: "executable_code",
      providerExecuted: true,
    });
  }

  const codeExecutionResult =
    asRecord(value.code_execution_result) ??
    asRecord(value.codeExecutionResult);
  if (codeExecutionResult) {
    const outcome = optionalString(codeExecutionResult.outcome);
    return claimed(
      compact<ToolResultPart>({
        type: "tool-result",
        toolCallId: null,
        toolName: "code_execution",
        output: toJsonValue(codeExecutionResult),
        isError: outcome && outcome !== "OUTCOME_OK" ? true : undefined,
      }),
    );
  }

  // Gemini text/thought parts: a bare `text` field, optionally flagged as
  // thought with a signature sibling.
  if (typeof value.text === "string") {
    const signature = optionalString(
      value.thoughtSignature ?? value.thought_signature,
    );
    return claimed(
      value.thought === true || signature
        ? reasoningPart(value.text, signature)
        : { type: "text", text: value.text },
    );
  }

  return unmatched;
}

/**
 * Gemini requests declare tools under `config.tools`: named functions in
 * `function_declarations` groups (either casing), everything else being
 * provider built-ins (googleSearch, codeExecution, ...) that declare no
 * name. Discovery only — the core normalizes and merges the sources.
 */
function geminiToolDefinitionSources(
  carrier: ToolDefinitionCarrier,
): ToolDefinitionSource[] {
  const tools = parseArray(asRecord(carrier.root?.config)?.tools);
  if (!tools) return [];

  return tools.map((tool, index) => {
    const toolGroup = asRecord(tool);
    const declarations =
      parseArray(toolGroup?.function_declarations) ??
      parseArray(toolGroup?.functionDeclarations);
    if (declarations) {
      return {
        sourceKey: `config.tools[${index}].function_declarations`,
        value: declarations,
        options: { allowToolMap: true },
      };
    }
    return {
      sourceKey: `config.tools[${index}]`,
      value: tool,
      options: { allowProviderToolWithoutName: true, allowToolMap: true },
    };
  });
}

/**
 * Gemini's request container: `contents` (+ `config.system_instruction`)
 * on input, `candidates` (each with its own finish reason) on output.
 */
function geminiSystemMessage(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource | undefined {
  if (kind !== "input") return undefined;

  const config = asRecord(root.config);
  const systemInstruction =
    config?.system_instruction ?? config?.systemInstruction;
  if (!systemInstruction) return undefined;

  return {
    kind: "single",
    value: systemInstruction,
    fallbackRole: "user",
    roleOverride: "system",
  };
}

function geminiMessages(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource[] {
  const sources: MessageSource[] = [];

  if (kind === "input") {
    if ("new_message" in root) {
      sources.push({
        kind: "single",
        value: root.new_message,
        fallbackRole: "user",
      });
      return sources;
    }

    if ("contents" in root) {
      const contents = Array.isArray(root.contents)
        ? root.contents
        : [root.contents];
      sources.push({
        kind: "sequence",
        values: contents,
        fallbackRole: "user",
      });
    }
  }

  if (kind === "output") {
    const candidates = parseArray(root.candidates);
    if (candidates) {
      for (const candidate of candidates) {
        const candidateRecord = asRecord(candidate);
        sources.push({
          kind: "single",
          value: candidateRecord?.content,
          fallbackRole: "assistant",
          // Gemini reports the finish reason on the candidate, not the content.
          finishReasonCarrier: candidateRecord,
        });
      }
    }
  }

  return sources;
}

export const geminiProvider = {
  name: "gemini",
  finishReasonTypeByRaw: GEMINI_FINISH_REASON_TYPE_BY_RAW,
  roleByRawRole: { model: "assistant" },
  // Gemini contents carry their blocks in a `parts` array.
  messageLikeKeys: new Set(["parts"]),
  tryNormalizeUntypedPart: normalizeGeminiPart,
  claimMessages: geminiMessages,
  getSystemMessage: geminiSystemMessage,
  collectToolDefinitionSources: geminiToolDefinitionSources,
} satisfies IOConvention;
