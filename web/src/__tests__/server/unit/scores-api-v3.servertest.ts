import { buildSelectColumns } from "@langfuse/shared/src/server";
import { GetScoresQueryV3 } from "@langfuse/shared";

describe("GetScoresQueryV3 enum case-insensitivity", () => {
  it("accepts lowercase source values and normalizes to uppercase", () => {
    const parsed = GetScoresQueryV3.parse({ source: "api,annotation" });
    expect(parsed.source).toEqual(["API", "ANNOTATION"]);
  });

  it("accepts lowercase dataType values and normalizes to uppercase", () => {
    const parsed = GetScoresQueryV3.parse({ dataType: "numeric,boolean" });
    expect(parsed.dataType).toEqual(["NUMERIC", "BOOLEAN"]);
  });

  it("accepts mixed-case input", () => {
    const parsed = GetScoresQueryV3.parse({
      source: "Api,EVAL",
      dataType: "Numeric,categorical",
    });
    expect(parsed.source).toEqual(["API", "EVAL"]);
    expect(parsed.dataType).toEqual(["NUMERIC", "CATEGORICAL"]);
  });

  it("still rejects values that are not a valid enum after upper-casing", () => {
    expect(() => GetScoresQueryV3.parse({ source: "nope" })).toThrow(
      /Invalid source value/,
    );
    expect(() => GetScoresQueryV3.parse({ dataType: "string" })).toThrow(
      /Invalid dataType value/,
    );
  });
});

describe("buildSelectColumns", () => {
  it("core always selects the polymorphic value columns", () => {
    const sql = buildSelectColumns(["core"]);
    expect(sql).toContain("s.value as value");
    expect(sql).toContain("s.string_value as string_value");
    expect(sql).toContain("s.long_string_value as long_string_value");
    expect(sql).toContain("s.data_type as data_type");
  });

  it("core does not select group columns", () => {
    const sql = buildSelectColumns(["core"]);
    expect(sql).not.toContain("s.comment");
    expect(sql).not.toContain("s.metadata");
    expect(sql).not.toContain("s.config_id");
    expect(sql).not.toContain("s.trace_id");
    expect(sql).not.toContain("s.observation_id");
    expect(sql).not.toContain("s.session_id");
    expect(sql).not.toContain("s.dataset_run_id");
    expect(sql).not.toContain("s.author_user_id");
    expect(sql).not.toContain("s.queue_id");
  });

  it("details adds comment/metadata/config_id only", () => {
    const sql = buildSelectColumns(["core", "details"]);
    expect(sql).toContain("s.comment as comment");
    expect(sql).toContain("s.metadata as metadata");
    expect(sql).toContain("s.config_id as config_id");
    expect(sql).not.toContain("s.trace_id");
    expect(sql).not.toContain("s.author_user_id");
  });

  it("subject adds the four entity-id columns only", () => {
    const sql = buildSelectColumns(["core", "subject"]);
    expect(sql).toContain("s.trace_id as trace_id");
    expect(sql).toContain("s.observation_id as observation_id");
    expect(sql).toContain("s.session_id as session_id");
    expect(sql).toContain("s.dataset_run_id as dataset_run_id");
    expect(sql).not.toContain("s.comment");
    expect(sql).not.toContain("s.author_user_id");
  });

  it("annotation adds author/queue only", () => {
    const sql = buildSelectColumns(["core", "annotation"]);
    expect(sql).toContain("s.author_user_id as author_user_id");
    expect(sql).toContain("s.queue_id as queue_id");
    expect(sql).not.toContain("s.comment");
    expect(sql).not.toContain("s.trace_id");
  });

  it("all groups select every column", () => {
    const sql = buildSelectColumns([
      "core",
      "details",
      "subject",
      "annotation",
    ]);
    for (const col of [
      "s.comment",
      "s.metadata",
      "s.config_id",
      "s.trace_id",
      "s.observation_id",
      "s.session_id",
      "s.dataset_run_id",
      "s.author_user_id",
      "s.queue_id",
    ]) {
      expect(sql).toContain(col);
    }
  });
});
