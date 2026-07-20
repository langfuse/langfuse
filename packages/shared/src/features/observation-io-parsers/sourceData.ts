import type { ObservationIoParserInstructions } from "../../domain/observation-io-parser-configs";
import { deepParseJsonIterative } from "../../utils/json";
import {
  cleanLegacyOutput,
  normalizeInput,
  normalizeOutput,
} from "../../utils/chatml";
import type { ObservationIoParserSourceData } from "./jsonPath";

const IO_PARSE_OPTIONS = { maxSize: 300_000, maxDepth: 25 };
const METADATA_PARSE_OPTIONS = { maxSize: 100_000, maxDepth: 25 };

type ParserChatMessage = Record<string, unknown> & {
  role?: string;
  content?: unknown;
  json?: unknown;
};

export type ObservationIoParserChatSection = {
  messages: ParserChatMessage[];
  lastMessage: ParserChatMessage | null;
  lastContent: unknown;
  lastText: string | null;
};

const parseInputOutputSource = (value: unknown): unknown =>
  deepParseJsonIterative(value, IO_PARSE_OPTIONS);

const parseMetadataSource = (value: unknown): unknown =>
  deepParseJsonIterative(value, METADATA_PARSE_OPTIONS);

const isTextContentType = (type: unknown): boolean =>
  type === "text" || type === "input_text" || type === "output_text";

const extractTextFromContentPart = (part: unknown): string | null => {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return null;

  const partRecord = part as Record<string, unknown>;
  const type = partRecord.type;

  if (
    (type === undefined || isTextContentType(type)) &&
    typeof partRecord.text === "string"
  ) {
    return partRecord.text;
  }

  if (
    (type === undefined || isTextContentType(type)) &&
    typeof partRecord.content === "string"
  ) {
    return partRecord.content;
  }

  return null;
};

const extractLastText = (content: unknown): string | null => {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const text = content
      .map(extractTextFromContentPart)
      .filter((part): part is string => part !== null)
      .join("");

    return text || null;
  }

  return extractTextFromContentPart(content);
};

const buildChatSection = (
  messages: ParserChatMessage[],
): ObservationIoParserChatSection => {
  const lastMessage = messages.at(-1) ?? null;
  const lastContent = lastMessage?.content ?? null;

  return {
    messages,
    lastMessage,
    lastContent,
    lastText: extractLastText(lastContent),
  };
};

const getNormalizedOutputMessages = (
  output: unknown,
  metadata: unknown,
  observationName?: string | null,
): ParserChatMessage[] => {
  const outResult = normalizeOutput(output, {
    metadata,
    observationName: observationName ?? undefined,
  });

  if (outResult.success) {
    return outResult.data.map((message) => ({
      ...message,
      role: message.role ?? "assistant",
    }));
  }

  const outputClean = cleanLegacyOutput(output, output);

  if (typeof outputClean === "string") {
    return [{ role: "assistant", content: outputClean }];
  }

  if (outputClean === null || outputClean === undefined) {
    return [];
  }

  return [{ role: "assistant", json: outputClean }];
};

export function buildObservationIoParserSourceData(args: {
  instructions: ObservationIoParserInstructions;
  sourceData: ObservationIoParserSourceData;
  observationName?: string | null;
}): ObservationIoParserSourceData {
  const input = parseInputOutputSource(args.sourceData.input);
  const output = parseInputOutputSource(args.sourceData.output);
  const metadata = parseMetadataSource(args.sourceData.metadata);

  if (args.instructions.sourceRepresentation === "raw_json") {
    return {
      input,
      output,
      metadata,
    };
  }

  const inputResult = normalizeInput(input, {
    metadata,
    observationName: args.observationName ?? undefined,
  });
  const inputMessages = inputResult.success
    ? (inputResult.data as ParserChatMessage[])
    : [];
  const outputMessages = getNormalizedOutputMessages(
    output,
    metadata,
    args.observationName,
  );

  return {
    input: buildChatSection(inputMessages),
    output: buildChatSection(outputMessages),
    conversation: buildChatSection(inputMessages.concat(outputMessages)),
    metadata,
  };
}
