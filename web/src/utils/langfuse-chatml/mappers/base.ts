import type { LangfuseChatML } from "../types";

export interface ChatMLMapper {
  readonly mapperName: string;
  readonly dataSourceName: string;
  readonly dataSourceVersion?: string;
  readonly dataSourceLanguage?: string;

  // score based on metadata/structure indicators (no parsing)
  // 100 = definitive match
  // 1-99 = partial match based on indicators
  // 0 = no match
  canMapScore(
    input: unknown,
    output: unknown,
    dataSource?: string,
    dataSourceVersion?: string,
    dataSourceLanguage?: string,
  ): number;

  map(input: unknown, output: unknown): LangfuseChatML;
}
