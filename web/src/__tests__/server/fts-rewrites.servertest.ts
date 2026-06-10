import { env } from "@/src/env.mjs";
import {
  FTS_EVENTS_TABLES,
  FTS_MATCH_OPERATOR,
  FTS_TEXT_FIELDS,
  FTS_TEXT_OPERATORS,
  StringFilter,
  StringObjectFilter,
  queryClickhouse,
} from "@langfuse/shared/src/server";

const maybeEventsTable =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

type FilterResult = {
  query: string;
  params: Record<string, unknown>;
};

const filterFixture = `
  SELECT *
  FROM values(
    'id String, input String, output String, metadata_names Array(String), metadata_values Array(String)',
    ('input-exact-alpha', 'alpha', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-exact-uppercase', 'ALPHA', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-exact-cyrillic', 'привет', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-exact-cjk', '東京', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-exact-email', 'user@host.com', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-exact-punctuation', '!!!', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-prefix-alpha', 'alpha token', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-middle-alpha', 'contains alpha token', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-suffix-alpha', 'token alpha', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-substring-alpha', 'alphabet token', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-ending-substring-alpha', 'token betalpha', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-phrase-alpha-beta', 'alpha beta token', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-phrase-alpha-beta-uppercase', 'ALPHA BETA token', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-phrase-beta-alpha', 'beta alpha token', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('input-phrase-alpha-gap-beta', 'alpha gap beta', 'unrelated output', ['topic'], ['unrelated metadata']),
    ('output-exact-alpha', 'unrelated input', 'alpha', ['topic'], ['unrelated metadata']),
    ('output-exact-uppercase', 'unrelated input', 'ALPHA', ['topic'], ['unrelated metadata']),
    ('output-exact-cyrillic', 'unrelated input', 'привет', ['topic'], ['unrelated metadata']),
    ('output-exact-cjk', 'unrelated input', '東京', ['topic'], ['unrelated metadata']),
    ('output-exact-email', 'unrelated input', 'user@host.com', ['topic'], ['unrelated metadata']),
    ('output-exact-punctuation', 'unrelated input', '!!!', ['topic'], ['unrelated metadata']),
    ('output-prefix-alpha', 'unrelated input', 'alpha token', ['topic'], ['unrelated metadata']),
    ('output-middle-alpha', 'unrelated input', 'contains alpha token', ['topic'], ['unrelated metadata']),
    ('output-suffix-alpha', 'unrelated input', 'token alpha', ['topic'], ['unrelated metadata']),
    ('output-substring-alpha', 'unrelated input', 'alphabet token', ['topic'], ['unrelated metadata']),
    ('output-ending-substring-alpha', 'unrelated input', 'token betalpha', ['topic'], ['unrelated metadata']),
    ('output-phrase-alpha-beta', 'unrelated input', 'alpha beta token', ['topic'], ['unrelated metadata']),
    ('output-phrase-alpha-beta-uppercase', 'unrelated input', 'ALPHA BETA token', ['topic'], ['unrelated metadata']),
    ('output-phrase-beta-alpha', 'unrelated input', 'beta alpha token', ['topic'], ['unrelated metadata']),
    ('output-phrase-alpha-gap-beta', 'unrelated input', 'alpha gap beta', ['topic'], ['unrelated metadata']),
    ('metadata-exact-alpha', 'unrelated input', 'unrelated output', ['topic'], ['alpha']),
    ('metadata-prefix-alpha', 'unrelated input', 'unrelated output', ['topic'], ['alpha token']),
    ('metadata-middle-alpha', 'unrelated input', 'unrelated output', ['topic'], ['contains alpha token']),
    ('metadata-suffix-alpha', 'unrelated input', 'unrelated output', ['topic'], ['token alpha']),
    ('metadata-substring-alpha', 'unrelated input', 'unrelated output', ['topic'], ['alphabet token']),
    ('metadata-phrase-alpha-beta', 'unrelated input', 'unrelated output', ['topic'], ['alpha beta token']),
    ('metadata-phrase-alpha-beta-uppercase', 'unrelated input', 'unrelated output', ['topic'], ['ALPHA BETA token']),
    ('metadata-phrase-beta-alpha', 'unrelated input', 'unrelated output', ['topic'], ['beta alpha token']),
    ('metadata-phrase-alpha-gap-beta', 'unrelated input', 'unrelated output', ['topic'], ['alpha gap beta']),
    ('metadata-split-alpha-beta', 'unrelated input', 'unrelated output', ['topic', 'other'], ['alpha', 'beta']),
    ('metadata-other-key-alpha', 'unrelated input', 'unrelated output', ['other'], ['alpha']),
    ('miss', 'unrelated input', 'unrelated output', ['topic'], ['unrelated metadata'])
  ) AS e
`;

const matchingIds = async (filter: FilterResult) => {
  const rows = await queryClickhouse<{ id: string }>({
    query: `
      SELECT e.id AS id
      FROM (${filterFixture}) AS e
      WHERE ${filter.query}
      ORDER BY e.id ASC
    `,
    params: filter.params,
    preferredClickhouseService: "EventsReadOnly",
    tags: {
      feature: "fts-rewrites-test",
      type: "events",
      kind: "test",
    },
  });

  return rows.map((row) => row.id);
};

const metadataBaselineFilter = (opts: {
  operator: ConstructorParameters<typeof StringObjectFilter>[0]["operator"];
  key: string;
  value: string;
}): FilterResult => {
  const namesColumn = "e.metadata_names";
  const valuesColumn = "e.metadata_values";
  const valueAccessor = `${valuesColumn}[indexOf(${namesColumn}, {metadataKey: String})]`;
  const hasKey = `has(${namesColumn}, {metadataKey: String})`;
  const valueParam = "{metadataValue: String}";

  let query: string;
  switch (opts.operator) {
    case "=":
      query = `${hasKey} AND (${valueAccessor} = ${valueParam})`;
      break;
    case "contains":
      query = `${hasKey} AND (position(${valueAccessor}, ${valueParam}) > 0)`;
      break;
    case "does not contain":
      query = `${hasKey} AND (position(${valueAccessor}, ${valueParam}) = 0)`;
      break;
    case "starts with":
      query = `${hasKey} AND (startsWith(${valueAccessor}, ${valueParam}))`;
      break;
    case "ends with":
      query = `${hasKey} AND (endsWith(${valueAccessor}, ${valueParam}))`;
      break;
    default:
      throw new Error(`Unsupported operator: ${opts.operator}`);
  }

  return {
    query,
    params: {
      metadataKey: opts.key,
      metadataValue: opts.value,
    },
  };
};

maybeEventsTable("FTS filter rewrites", () => {
  it.each(
    Array.from(FTS_EVENTS_TABLES).flatMap((table) =>
      Array.from(FTS_TEXT_FIELDS).flatMap((field) =>
        [
          { operator: "=", value: "alpha" },
          { operator: "=", value: "ALPHA" },
          { operator: "=", value: "привет" },
          { operator: "=", value: "東京" },
          { operator: "=", value: "user@host.com" },
          { operator: "=", value: "!!!" },
          { operator: "contains", value: "alpha" },
          { operator: "starts with", value: "alpha" },
          { operator: "ends with", value: "alpha" },
        ].map((testCase) => ({
          table,
          field,
          ...testCase,
        })),
      ),
    ),
  )(
    "keeps $table $field `$operator` equivalent to the baseline for `$value`",
    async ({ table, field, operator, value }) => {
      const fieldExpr = `e.${field}`;
      const baseline = new StringFilter({
        clickhouseTable: "traces",
        field: fieldExpr,
        operator,
        value,
      }).apply();
      const rewritten = new StringFilter({
        clickhouseTable: table,
        field: fieldExpr,
        operator,
        value,
      }).apply();

      expect(rewritten.query.includes("hasAllTokens")).toBe(
        FTS_TEXT_OPERATORS.has(operator),
      );
      await expect(matchingIds(rewritten)).resolves.toEqual(
        await matchingIds(baseline),
      );
    },
  );

  it.each(
    Array.from(FTS_EVENTS_TABLES).flatMap((table) =>
      [
        { operator: "=", value: "alpha" },
        { operator: "contains", value: "alpha" },
        { operator: "starts with", value: "alpha" },
        { operator: "ends with", value: "alpha" },
        { operator: "does not contain", value: "alpha" },
      ].map((testCase) => ({
        table,
        ...testCase,
      })),
    ),
  )(
    "keeps $table.metadata `$operator` equivalent to the baseline for `$value`",
    async ({ table, operator, value }) => {
      const baseline = metadataBaselineFilter({
        operator,
        key: "topic",
        value,
      });
      const rewritten = new StringObjectFilter({
        clickhouseTable: table,
        field: "metadata",
        operator,
        key: "topic",
        value,
        tablePrefix: "e",
      }).apply();

      if (operator === "=") {
        expect(rewritten.query).toContain("has(e.metadata_values,");
      } else {
        expect(rewritten.query).not.toContain("hasAllTokens");
      }
      await expect(matchingIds(rewritten)).resolves.toEqual(
        await matchingIds(baseline),
      );
    },
  );

  it.each(
    Array.from(FTS_EVENTS_TABLES).flatMap((table) =>
      Array.from(FTS_TEXT_FIELDS).map((field) => ({ table, field })),
    ),
  )(
    "uses indexed literal search for $table $field matches",
    async ({ table, field }) => {
      const fieldExpr = `e.${field}`;
      const rewritten = new StringFilter({
        clickhouseTable: table,
        field: fieldExpr,
        operator: FTS_MATCH_OPERATOR,
        value: "alpha beta",
      }).apply();

      expect(rewritten.query).toContain(`position(lower(${fieldExpr}), lower(`);
      expect(rewritten.query).toContain(`hasAllTokens(lower(${fieldExpr}),`);
      await expect(matchingIds(rewritten)).resolves.toEqual([
        `${field}-phrase-alpha-beta`,
        `${field}-phrase-alpha-beta-uppercase`,
      ]);
    },
  );

  it.each(Array.from(FTS_EVENTS_TABLES))(
    "uses case-sensitive key-scoped literal search for $table metadata matches",
    async (table) => {
      const rewritten = new StringObjectFilter({
        clickhouseTable: table,
        field: "metadata",
        operator: FTS_MATCH_OPERATOR,
        key: "topic",
        value: "alpha beta",
        tablePrefix: "e",
      }).apply();

      expect(rewritten.query).toContain("has(e.metadata_names,");
      expect(rewritten.query).toContain("hasAllTokens(e.metadata_values,");
      expect(rewritten.query).toContain(
        "position(e.metadata_values[indexOf(e.metadata_names,",
      );
      expect(rewritten.query).not.toContain(
        "hasAllTokens(e.metadata_values[indexOf",
      );
      expect(rewritten.query).not.toContain("lower(");
      await expect(matchingIds(rewritten)).resolves.toEqual([
        "metadata-phrase-alpha-beta",
      ]);
    },
  );
});
