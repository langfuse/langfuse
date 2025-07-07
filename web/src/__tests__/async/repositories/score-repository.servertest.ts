import { createScoresCh, getScoreById } from "@langfuse/shared/src/server";
import { v4 } from "uuid";
const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("Clickhouse Scores Repository Test", () => {
  it("should return null if no scores are found", async () => {
    const result = await getScoreById({
      projectId,
      scoreId: v4(),
    });
    expect(result).toBeUndefined();
  });

  it("should return a score if it exists", async () => {
    const scoreId = v4();

    // Assuming createTraceScore is a helper function to insert a score into the database
    const score = {
      id: scoreId,
      project_id: projectId,
      trace_id: v4(),
      name: "Test Score",
      timestamp: Date.now(),
      value: 100,
      source: "API",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
      environment: "default",
    };

    await createScoresCh([score]);

    const result = await getScoreById({
      projectId,
      scoreId,
    });
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.id).toEqual(score.id);
    expect(result.projectId).toEqual(score.project_id);
    expect(result.name).toEqual(score.name);
    expect(result.value).toEqual(score.value);
    expect(result.source).toEqual(score.source);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });
});
