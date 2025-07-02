import { TracingSearchType } from "../../../interfaces/search";

export interface DorisSearchResult {
  query: string;
  params: Record<string, unknown>;
}

export interface DorisSearchContext {
  /** 查询上下文类型：traces 或 observations */
  type: "traces" | "observations";
  /** 是否有 traces 表连接 */
  hasTracesJoin?: boolean;
}

/**
 * Generate Doris-compatible search conditions
 * Equivalent to clickhouseSearchCondition but adapted for Doris syntax
 * @param query - Search query string
 * @param searchType - Types of search to perform
 * @param context - Context information for determining correct table prefixes
 */
export const dorisSearchCondition = (
  query?: string,
  searchType?: TracingSearchType[],
  context?: DorisSearchContext,
): DorisSearchResult => {
  if (!query) {
    return {
      query: "",
      params: {},
    };
  }

  // 使用参数化查询来避免双重转义问题
  const searchParam = `%${query}%`;

  const conditions = [];

  // ID 搜索：根据查询上下文决定字段前缀
  if (!searchType || searchType.includes("id")) {
    if (context?.type === "observations") {
      // observations 查询上下文：搜索 observations 和 traces 表的字段
      conditions.push(
        context.hasTracesJoin
          ? `o.id LIKE {searchQuery: String} OR o.name LIKE {searchQuery: String} OR t.user_id LIKE {searchQuery: String}`
          : `o.id LIKE {searchQuery: String} OR o.name LIKE {searchQuery: String}`,
      );
    } else {
      // traces 查询上下文（默认）：搜索 traces 表的字段
      conditions.push(
        `t.id LIKE {searchQuery: String} OR t.user_id LIKE {searchQuery: String} OR t.name LIKE {searchQuery: String}`,
      );
    }
  }

  // 内容搜索：主要针对 observations 表
  if (searchType && searchType.includes("content")) {
    if (context?.type === "observations") {
      conditions.push(
        `o.input LIKE {searchQuery: String} OR o.output LIKE {searchQuery: String}`,
      );
    } else {
      // traces 查询中通常不搜索 input/output，但如果需要可以连接 observations 表
      conditions.push(
        `input LIKE {searchQuery: String} OR output LIKE {searchQuery: String}`,
      );
    }
  }

  return {
    query: conditions.length > 0 ? `AND (${conditions.join(" OR ")})` : "",
    params: {
      searchQuery: searchParam,
    },
  };
};
