import type { LangfuseChatML } from "../types";

// Scoring constants for mapper selection
export const MAPPER_SCORE_DEFINITIVE = 10; // Definitive match (e.g., metadata match)
export const MAPPER_SCORE_NONE = 0; // No match

export interface ChatMLMapper {
  readonly mapperName: string;
  readonly dataSourceName: string;
  readonly dataSourceVersion?: string;
  readonly dataSourceLanguage?: string;

  // score based on metadata/structure indicators (no parsing)
  // MAPPER_SCORE_DEFINITIVE (10) = definitive match
  // 1-9 = partial match based on indicators
  // MAPPER_SCORE_NONE (0) = no match
  // metadata can be a string or object
  canMapScore(input: unknown, output: unknown, metadata?: unknown): number;

  map(input: unknown, output: unknown, metadata?: unknown): LangfuseChatML;
}
