import { asRecord, parseArray, parseIfString } from "./core/utils/json";
import type { NormalizedIO, SpanIO } from "./types";
import {
  collectMetadata,
  collectIO,
  createAccumulator,
  type ParsedIOValue,
} from "./core/accumulator";
import { createParserContext } from "./core/parser-context";

type ParsedSpanIO = {
  input: ParsedIOValue;
  output: ParsedIOValue;
  metadata: ParsedIOValue;
};

function parseIOValue(value: unknown): ParsedIOValue {
  const parsed = parseIfString(value);
  const record = asRecord(parsed);

  return {
    value: parsed,
    record,
    messages: Array.isArray(parsed)
      ? parsed
      : record
        ? parseArray(record.messages)
        : undefined,
  };
}

function parseSpanIO(span: SpanIO): ParsedSpanIO {
  return {
    input: parseIOValue(span.input),
    output: parseIOValue(span.output),
    metadata: parseIOValue(span.metadata),
  };
}

/**
 * Normalize an already-adapted span I/O value.
 *
 * This is the client-safe parser entry point. Source-specific adapters such as
 * ClickHouse event rows and OTel spans stay in the server-only wrapper.
 */
export function normalizeSpanIO(span: SpanIO): NormalizedIO {
  const { input, output, metadata } = parseSpanIO(span);
  const accumulator = createAccumulator();

  collectIO(input, createParserContext("input"), accumulator);
  collectIO(output, createParserContext("output"), accumulator);
  collectMetadata(metadata, accumulator);

  return {
    messages: accumulator.messages,
    toolDefinitions: accumulator.toolDefinitions,
    span,
  };
}
