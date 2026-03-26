declare module "@hyperdx/lucene" {
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

  export function parse(query: string): LuceneNode;
  export function toString(node: LuceneNode): string;
  export function term(term: string, field?: string): LuceneTermNode;
  export function phrase(term: string, field?: string): LuceneTermNode;

  const lucene: {
    parse: typeof parse;
    toString: typeof toString;
    term: typeof term;
    phrase: typeof phrase;
  };

  export = lucene;
}
