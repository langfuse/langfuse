import type { LangfuseChatML } from "../types";

export interface ChatMLMapper {
  name: string;

  // Detection: Can this mapper handle the input/output given the metadata?
  canMap(
    input: unknown,
    output: unknown,
    dataSource?: string,
    dataSourceVersion?: string,
  ): boolean;

  // Mapping: Transform to LangfuseChatML
  map(input: unknown, output: unknown): LangfuseChatML;
}
