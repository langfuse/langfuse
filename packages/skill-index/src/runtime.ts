const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const SNIPPET_LENGTH = 360;
const MAX_SKILL_CONTENT_LENGTH = 24_000;
const DEFAULT_TOKEN_PATTERN = /[a-z0-9]+/g;
const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

export type SkillIndexSkill = {
  id: string;
  title: string;
  content: string;
};

export type SkillIndexChunk = {
  id: string;
  skillIndex: string;
  title: string;
  heading: string;
  index: number;
  startLine: number;
  endLine: number;
  content: string;
  terms: Record<string, number>;
  length: number;
};

export type SkillSearchIndexData = {
  chunks: SkillIndexChunk[];
  search: Bm25IndexStats;
};

export type SkillSearchInput = {
  query: string;
  limit?: number;
};

export type SkillSearchResult = {
  id: string;
  title: string;
  heading: string;
  score: number;
  snippet: string;
};

export type SkillReadInput = {
  id: string;
};

export type SkillReadResult = {
  id: string;
  title: string;
  content: string;
  truncated: boolean;
};

export type Bm25Document = {
  terms: Record<string, number>;
  length: number;
};

export type Bm25IndexStats = {
  averageDocumentLength: number;
  idf: Record<string, number>;
};

export function searchSkillInIndex({
  query,
  limit = DEFAULT_SEARCH_LIMIT,
  index,
}: SkillSearchInput & { index: SkillSearchIndexData }): SkillSearchResult[] {
  const queryTerms = [...new Set(tokenizeBm25Text(query))];
  if (queryTerms.length === 0) {
    return [];
  }

  return index.chunks
    .map((chunk) => ({
      chunk,
      score: scoreBm25Document({
        document: chunk,
        queryTerms,
        index: index.search,
      }),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT))
    .map(({ chunk, score }) => ({
      id: chunk.skillIndex,
      title: chunk.title,
      heading: chunk.heading,
      score: Number(score.toFixed(4)),
      snippet: getSnippet(chunk.content, queryTerms),
    }));
}

export function readSkillInIndex({
  skill,
}: {
  skill: SkillIndexSkill;
}): SkillReadResult {
  return {
    id: skill.id,
    title: skill.title,
    content: skill.content.slice(0, MAX_SKILL_CONTENT_LENGTH),
    truncated: skill.content.length > MAX_SKILL_CONTENT_LENGTH,
  };
}

function getSnippet(content: string, queryTerms: string[]) {
  const lowerContent = content.toLowerCase();
  const matchIndex = queryTerms.reduce((bestIndex, term) => {
    const index = lowerContent.indexOf(term);
    if (index === -1) {
      return bestIndex;
    }
    return bestIndex === -1 ? index : Math.min(bestIndex, index);
  }, -1);
  const start = matchIndex === -1 ? 0 : Math.max(0, matchIndex - 120);
  const snippet = content.slice(start, start + SNIPPET_LENGTH).trim();

  return `${start > 0 ? "..." : ""}${snippet}${
    start + SNIPPET_LENGTH < content.length ? "..." : ""
  }`;
}

function tokenizeBm25Text(text: string, pattern = DEFAULT_TOKEN_PATTERN) {
  return text.toLowerCase().match(pattern) ?? [];
}

function getNumericRecordValue(record: Record<string, number>, key: string) {
  if (!Object.hasOwn(record, key)) {
    return 0;
  }

  const value = record[key];
  return typeof value === "number" ? value : 0;
}

function scoreBm25Document({
  document,
  queryTerms,
  index,
  k1 = DEFAULT_K1,
  b = DEFAULT_B,
}: {
  document: Bm25Document;
  queryTerms: string[];
  index: Bm25IndexStats;
  k1?: number;
  b?: number;
}) {
  const averageDocumentLength = index.averageDocumentLength || 1;

  return queryTerms.reduce((score, term) => {
    const termFrequency = getNumericRecordValue(document.terms, term);
    if (termFrequency === 0) {
      return score;
    }

    const idf = getNumericRecordValue(index.idf, term);
    const denominator =
      termFrequency +
      k1 * (1 - b + b * (document.length / averageDocumentLength));

    return score + idf * ((termFrequency * (k1 + 1)) / denominator);
  }, 0);
}
