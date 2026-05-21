import { env } from "@/src/env.mjs";
import {
  FTS_EVENTS_TABLES,
  FTS_TEXT_FIELDS,
  FTS_TEXT_OPERATORS,
  StringFilter,
  StringObjectFilter,
  queryClickhouse,
} from "@langfuse/shared/src/server";

const maybeEventsTable =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
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
    ('metadata-exact-alpha', 'unrelated input', 'unrelated output', ['topic'], ['alpha']),
    ('metadata-prefix-alpha', 'unrelated input', 'unrelated output', ['topic'], ['alpha token']),
    ('metadata-middle-alpha', 'unrelated input', 'unrelated output', ['topic'], ['contains alpha token']),
    ('metadata-suffix-alpha', 'unrelated input', 'unrelated output', ['topic'], ['token alpha']),
    ('metadata-substring-alpha', 'unrelated input', 'unrelated output', ['topic'], ['alphabet token']),
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
});
