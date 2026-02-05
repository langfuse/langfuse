import { JsonNested } from "../../utils/zod";
import {
  parseJsonPrioritised,
  parseJsonPrioritisedAsync,
} from "../../utils/json";
import { env } from "../../env";

/**
 * Rendering properties used to control how data is processed and returned
 * in tRPC routes and repository functions.
 */
export interface RenderingProps {
  /**
   * Whether to truncate input/output fields to a specific character limit
   */
  truncated: boolean;

  /**
   * Whether to skip JSON parsing of input/output fields and return them as raw strings.
   * This is useful when the client will handle JSON parsing to avoid double parsing.
   */
  shouldJsonParse: boolean;
}

/**
 * Default rendering properties
 */
export const DEFAULT_RENDERING_PROPS: RenderingProps = {
  truncated: false,
  shouldJsonParse: true,
};

/**
 * Helper to apply truncation logic to input/output strings.
 */
const applyTruncation = (
  io: string,
  renderingProps: RenderingProps,
): string => {
  if (
    renderingProps.truncated &&
    io.length > env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT
  ) {
    return (
      io.slice(0, env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT) + "...[truncated]"
    );
  }

  if (
    renderingProps.truncated &&
    io.length === env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT
  ) {
    return io + "...[truncated]";
  }

  return io;
};

/**
 * Transform input/output fields based on rendering properties (sync version).
 */
export const applyInputOutputRendering = (
  io: string | null | undefined,
  renderingProps: RenderingProps,
): JsonNested | string | null => {
  if (!io) return null;
  const result = applyTruncation(io, renderingProps);

  return renderingProps.shouldJsonParse
    ? (parseJsonPrioritised(result) ?? null)
    : result;
};

/**
 * Transform input/output fields based on rendering properties (async version).
 * Uses non-blocking JSON parsing for better performance with large payloads.
 */
export const applyInputOutputRenderingAsync = async (
  io: string | null | undefined,
  renderingProps: RenderingProps,
): Promise<JsonNested | string | null> => {
  if (!io) return null;
  const result = applyTruncation(io, renderingProps);

  return renderingProps.shouldJsonParse
    ? ((await parseJsonPrioritisedAsync(result)) ?? null)
    : result;
};
