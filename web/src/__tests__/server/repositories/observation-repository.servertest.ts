import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  FilterList,
  generateObservationsForPublicApi,
  getObservationById,
  getObservationsCountForPublicApi,
  getObservationsForTrace,
  StringFilter,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("Clickhouse Observations Repository Test", () => {
  it("should page and count only matching latest observation versions", async () => {
    const projectId = v4();
    const otherProjectId = v4();
    const observationId = v4();
    const traceId = v4();
    const userId = v4();
    const oldUserId = v4();
    const timestamp = Date.now();
    const observation = {
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      start_time: timestamp,
    };
    const deletedObservation = {
      ...observation,
      id: v4(),
      start_time: timestamp + 1,
    };

    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: projectId,
        user_id: oldUserId,
        timestamp,
        event_ts: timestamp - 1,
      }),
      createTrace({
        id: traceId,
        project_id: projectId,
        user_id: userId,
        timestamp,
        event_ts: timestamp,
      }),
      createTrace({
        id: traceId,
        project_id: projectId,
        user_id: userId,
        timestamp,
        event_ts: timestamp + 2,
      }),
      createTrace({
        id: traceId,
        project_id: otherProjectId,
        user_id: userId,
        timestamp,
        event_ts: timestamp + 3,
      }),
    ]);
    await createObservationsCh([
      createObservation({ ...observation, name: "old", event_ts: timestamp }),
      createObservation({
        ...observation,
        name: "current",
        output: '"latest"',
        event_ts: timestamp + 2,
      }),
      createObservation({
        ...observation,
        name: "old",
        event_ts: timestamp + 1,
      }),
      createObservation({
        ...deletedObservation,
        name: "current",
        event_ts: timestamp,
      }),
      createObservation({
        ...deletedObservation,
        name: "current",
        is_deleted: 1,
        event_ts: timestamp + 2,
      }),
      createObservation({
        ...observation,
        project_id: otherProjectId,
        name: "current",
        event_ts: timestamp + 3,
      }),
    ]);

    for (const { name, userId: filterUserId, matches } of [
      { name: "old", userId, matches: false },
      { name: "current", userId, matches: true },
      { name: "current", userId: oldUserId, matches: false },
    ]) {
      const filter = new FilterList([
        new StringFilter({
          clickhouseTable: "observations",
          tablePrefix: "o",
          field: "name",
          operator: "=",
          value: name,
        }),
        new StringFilter({
          clickhouseTable: "traces",
          tablePrefix: "t",
          field: "user_id",
          operator: "=",
          value: filterUserId,
        }),
      ]);
      const [page, count] = await Promise.all([
        generateObservationsForPublicApi({
          projectId,
          filter,
          pagination: { limit: 1, page: 1 },
        }),
        getObservationsCountForPublicApi({ projectId, filter }),
      ]);

      expect
        .soft(
          page.map(({ id, projectId, traceId, name, output }) => ({
            id,
            projectId,
            traceId,
            name,
            output,
          })),
        )
        .toEqual(
          matches
            ? [
                {
                  id: observationId,
                  projectId,
                  traceId,
                  name: "current",
                  output: "latest",
                },
              ]
            : [],
        );
      expect.soft(count).toBe(matches ? 1 : 0);
    }
  });

  it("should throw if no observations are found", async () => {
    await expect(
      getObservationById({
        id: v4(),
        projectId: v4(),
      }),
    ).rejects.toThrow();
  });

  it("should return an observation if exists", async () => {
    const observationId = v4();
    const traceId = v4();

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "sample_type",
      metadata: {},
      provided_usage_details: { input: 1234, output: 5678, total: 6912 },
      provided_cost_details: { input: 100, output: 200, total: 300 },
      usage_details: { input: 1234, output: 5678, total: 6912 },
      cost_details: { input: 100, output: 200, total: 300 },
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      start_time: Date.now(),
      event_ts: Date.now(),
      name: "sample_name",
      level: "sample_level",
      status_message: "sample_status",
      version: "1.0",
      input: "sample_input",
      output: "sample_output",
      provided_model_name: "sample_model",
      internal_model_id: "sample_internal_model_id",
      model_parameters: '{"something":"sample_param"}',
      total_cost: 300,
      prompt_id: "sample_prompt_id",
      prompt_name: "sample_prompt_name",
      prompt_version: 1,
      end_time: Date.now(),
      completion_start_time: Date.now(),
    });

    await createObservationsCh([observation]);

    const result = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: true,
    });

    if (!result) {
      throw new Error("Observation not found");
    }

    expect(result.id).toEqual(observation.id);
    expect(result.traceId).toEqual(observation.trace_id);
    expect(result.projectId).toEqual(observation.project_id);
    expect(result.type).toEqual(observation.type);

    expect(result.metadata).toEqual(observation.metadata);
    expect(result.createdAt).toEqual(new Date(observation.created_at));
    expect(result.updatedAt).toEqual(new Date(observation.updated_at));
    expect(result.startTime).toEqual(new Date(observation.start_time));
    expect(result.name).toEqual(observation.name);
    expect(result.level).toEqual(observation.level);
    expect(result.statusMessage).toEqual(observation.status_message);
    expect(result.version).toEqual(observation.version);
    expect(result.input).toEqual(observation.input);
    expect(result.output).toEqual(observation.output);
    expect(result.internalModelId).toEqual(observation.internal_model_id);
    expect(result.modelParameters).toEqual({ something: "sample_param" });
    expect(result.promptId).toEqual(observation.prompt_id);
    expect(result.endTime).toEqual(new Date(observation.end_time!));
    expect(result.completionStartTime).toEqual(
      new Date(observation.completion_start_time!),
    );
    expect(result.totalCost).toEqual(observation.total_cost!);
    expect(result.inputUsage).toEqual(1234);
    expect(result.outputUsage).toEqual(5678);
    expect(result.totalUsage).toEqual(6912);
  });

  it("should return an observation if exists by traceId", async () => {
    const observationId = v4();
    const traceId = v4();

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "sample_type",
      metadata: {},
      provided_usage_details: { input: 1234, output: 5678, total: 6912 },
      provided_cost_details: { input: 100, output: 200, total: 300 },
      usage_details: { input: 1234, output: 5678, total: 6912 },
      cost_details: { input: 100, output: 200, total: 300 },
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      start_time: Date.now(),
      event_ts: Date.now(),
      name: "sample_name",
      level: "sample_level",
      status_message: "sample_status",
      version: "1.0",
      input: "sample_input",
      output: "sample_output",
      provided_model_name: "sample_model",
      internal_model_id: "sample_internal_model_id",
      model_parameters: '{"something":"sample_param"}',
      total_cost: 300,
      prompt_id: "sample_prompt_id",
      prompt_name: "sample_prompt_name",
      prompt_version: 1,
      end_time: Date.now(),
      completion_start_time: Date.now(),
    });

    await createObservationsCh([observation]);

    const result = await getObservationById({
      id: observationId,
      projectId,
      traceId,
      fetchWithInputOutput: true,
    });
    if (!result) {
      throw new Error("Observation not found");
    }
    expect(result.id).toEqual(observation.id);
    expect(result.traceId).toEqual(observation.trace_id);
    expect(result.projectId).toEqual(observation.project_id);
    expect(result.type).toEqual(observation.type);
  });
  it("should return an observation view", async () => {
    const observationId = v4();
    const traceId = v4();

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "sample_type",
      metadata: {},
      provided_usage_details: { input: 1234, output: 5678, total: 6912 },
      provided_cost_details: { input: 100, output: 200, total: 300 },
      usage_details: { input: 1234, output: 5678, total: 6912 },
      cost_details: { input: 100, output: 200, total: 300 },
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      start_time: Date.now(),
      event_ts: Date.now(),
      name: "sample_name",
      level: "sample_level",
      status_message: "sample_status",
      version: "1.0",
      input: "sample_input",
      output: "sample_output",
      provided_model_name: "sample_model",
      internal_model_id: "sample_internal_model_id",
      model_parameters: '{"something":"sample_param"}',
      total_cost: 300,
      prompt_id: "sample_prompt_id",
      prompt_name: "sample_prompt_name",
      prompt_version: 1,
      end_time: Date.now(),
      completion_start_time: Date.now() + 1000,
    });

    await createObservationsCh([observation]);

    const result = await getObservationsForTrace({
      traceId,
      projectId,
      includeIO: true,
    });
    if (!result || result.length === 0) {
      throw new Error("Observation not found");
    }
    const firstObservation = result[0];
    expect(firstObservation.id).toEqual(observation.id);
    expect(firstObservation.traceId).toEqual(observation.trace_id);
    expect(firstObservation.projectId).toEqual(observation.project_id);
    expect(firstObservation.type).toEqual(observation.type);
    expect(firstObservation.metadata).toEqual(observation.metadata);
    expect(firstObservation.createdAt).toEqual(
      new Date(observation.created_at),
    );
    expect(firstObservation.updatedAt).toEqual(
      new Date(observation.updated_at),
    );
    expect(firstObservation.startTime).toEqual(
      new Date(observation.start_time),
    );
    expect(firstObservation.name).toEqual(observation.name);
    expect(firstObservation.level).toEqual(observation.level);
    expect(firstObservation.statusMessage).toEqual(observation.status_message);
    expect(firstObservation.version).toEqual(observation.version);

    expect(firstObservation.modelParameters).toEqual({
      something: "sample_param",
    });
    expect(firstObservation.promptId).toEqual(observation.prompt_id);
    expect(firstObservation.endTime).toEqual(new Date(observation.end_time!));
    expect(firstObservation.timeToFirstToken).toEqual(
      (new Date(observation.completion_start_time!).getTime() -
        new Date(observation.start_time).getTime()) /
        1000,
    );
    expect(firstObservation.timeToFirstToken).toBeGreaterThan(0);
    expect(firstObservation.inputCost).toEqual(
      observation.cost_details!.input!,
    );
    expect(firstObservation.outputCost).toEqual(
      observation.cost_details!.output!,
    );
    expect(firstObservation.totalCost).toEqual(observation.total_cost!);
    expect(firstObservation.inputUsage).toEqual(1234);
    expect(firstObservation.outputUsage).toEqual(5678);
    expect(firstObservation.totalUsage).toEqual(6912);
  });
});
