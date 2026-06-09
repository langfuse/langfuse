export type LuceneLocationPoint = {
  offset: number;
  line: number;
  column: number;
};

export type LuceneLocation = {
  start: LuceneLocationPoint;
  end: LuceneLocationPoint;
};

export type LuceneTermNode = {
  field: string;
  fieldLocation: LuceneLocation | null;
  term: string;
  quoted: boolean;
  regex: boolean;
  termLocation: LuceneLocation | null;
  similarity: number | null;
  boost: number | null;
  proximity?: number | null;
  prefix: "+" | "-" | null;
  parenthesized?: boolean;
};

export type LuceneRangeNode = {
  term_min: string;
  term_max: string;
  inclusive: "both" | "left" | "right" | "none";
  field: string;
  fieldLocation: LuceneLocation | null;
  parenthesized?: boolean;
};

export type LuceneBinaryNode = {
  left: LuceneNode;
  operator?: "AND" | "OR" | "AND NOT" | "OR NOT" | "<implicit>";
  right?: LuceneNode;
  start?: "NOT";
  parenthesized?: boolean;
};

export type LuceneNode = LuceneTermNode | LuceneRangeNode | LuceneBinaryNode;

type LuceneModule = {
  parse(query: string): LuceneNode;
  toString(node: LuceneNode): string;
  term(term: string, field?: string): LuceneTermNode;
  phrase(term: string, field?: string): LuceneTermNode;
};

const luceneParser = require("@hyperdx/lucene") as LuceneModule;

export default luceneParser;
