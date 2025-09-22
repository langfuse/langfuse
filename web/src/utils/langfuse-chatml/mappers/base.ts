import type { LangfuseChatML } from "../types";

export interface ChatMLMapper {
  name: string;
  version: string;
  priority: number; // Lower numbers = higher priority

  // Detection: Can this mapper handle the input/output?
  canMap(input: unknown, output: unknown): boolean;

  // Mapping: Transform to LangfuseChatML
  map(input: unknown, output: unknown): LangfuseChatML;
}
