import { truncateClickhouseTables } from "@/src/__tests__/test-utils";
import { prepareUsageDataForTimeseriesChart } from "@/src/features/dashboard/components/ModelUsageChart";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  getObservationsCostGroupedByName,
  getObservationUsageByTime,
  orderByTimeSeries,
} from "@langfuse/shared/src/server";

describe("orderByTimeSeries", () => {
  test("should return correct bucket size and query for 1 hour time range", () => {
    const filter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: new Date("2024-01-01T00:00:00Z"),
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: new Date("2024-01-01T01:00:00Z"),
      },
    ];

    const [query, params, bucketSize] = orderByTimeSeries(filter, "timestamp");

    // For 1 hour difference, should pick 60 second buckets to get ~60 data points
    expect(bucketSize).toBe(60);
    expect(query).toBe(
      "ORDER BY timestamp ASC \n    WITH FILL\n    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL 60 SECOND)\n    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL 60 SECOND\n    STEP toIntervalSecond(60)",
    );
    expect(params.fromTime).toBe(new Date("2024-01-01T00:00:00Z").getTime());
    expect(params.toTime).toBe(new Date("2024-01-01T01:00:00Z").getTime());
  });

  test("should return correct bucket size and query for 1 day time range", () => {
    const filter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: new Date("2024-01-01T00:00:00Z"),
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: new Date("2024-01-02T00:00:00Z"),
      },
    ];

    const [query, params, bucketSize] = orderByTimeSeries(filter, "timestamp");

    // For 24 hour difference, should pick 1800 second (30 min) buckets
    expect(bucketSize).toBe(1800);
    expect(query).toBe(
      "ORDER BY timestamp ASC \n    WITH FILL\n    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL 1800 SECOND)\n    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL 1800 SECOND\n    STEP toIntervalSecond(1800)",
    );
    expect(params.fromTime).toBe(new Date("2024-01-01T00:00:00Z").getTime());
    expect(params.toTime).toBe(new Date("2024-01-02T00:00:00Z").getTime());
  });

  test("should handle empty filter by using default time range", () => {
    expect(() => orderByTimeSeries([], "timestamp")).toThrow(
      "Time Filter is required for time series queries",
    );
  });

  beforeEach(async () => {
    await truncateClickhouseTables();
  });

  it("should create Model costs correctly, non timeseries", async () => {
    // const { projectId } = await createOrgProjectAndApiKey();

    const fromDate = new Date("2024-01-01T00:00:00Z");
    const toDate = new Date("2024-01-01T01:00:00Z");
    // duration of 1 hour

    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const traces = [
      createTrace({
        project_id: projectId,
        timestamp: fromDate.getTime(),
      }),
      createTrace({
        project_id: projectId,
        timestamp: toDate.getTime() + 60000, // Adding one minute (60000 milliseconds).
      }),
    ];
    await createTracesCh(traces);

    const observations = [
      createObservation({
        id: "075205fd-cf89-4a62-87d1-dad58230b3bf",
        trace_id: "887c22ea-1c73-4453-b811-610a50cd6cf4",
        project_id: projectId,
        type: "GENERATION",
        parent_observation_id: "55920765-7e79-49b2-9a3b-41853a4d14c3",
        start_time: new Date("2025-02-10T13:40:07.704Z").getTime(),
        end_time: new Date("2025-02-10T13:40:08.383Z").getTime(),
        name: "prompt-embedding",
        metadata: {},
        level: "DEBUG",
        status_message: null,
        version: null,
        input: "hi",
        output: null,
        provided_model_name: "text-embedding-ada-002",
        internal_model_id: "clrntjt89000908jwhvkz5crm",
        model_parameters: null,
        provided_usage_details: {},
        usage_details: { input: 1, total: 1 },
        provided_cost_details: {},
        cost_details: { total: 0.0000001 },
        total_cost: 0.0000001,
        completion_start_time: null,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: new Date("2025-02-10T13:40:12.000Z").getTime(),
        updated_at: new Date("2025-02-10T13:40:16.118Z").getTime(),
        event_ts: new Date("2025-02-10T13:40:16.118Z").getTime(),
        is_deleted: 0,
      }),
      createObservation({
        id: "24cf66c5-04bf-4fd7-b89a-9f16597ed679",
        trace_id: "aaf3615f-028c-4efd-b0cc-6d57d43fda3c",
        project_id: projectId,
        type: "GENERATION",
        parent_observation_id: "378a635e-6f2e-4561-87a6-7270b995c1e8",
        start_time: new Date("2025-02-10T13:40:10.809Z").getTime(),
        end_time: new Date("2025-02-10T13:40:11.452Z").getTime(),
        name: "prompt-embedding",
        metadata: {},
        level: "DEBUG",
        status_message: null,
        version: null,
        input: "how ar eyou",
        output: null,
        provided_model_name: "text-embedding-ada-002",
        internal_model_id: "clrntjt89000908jwhvkz5crm",
        model_parameters: null,
        provided_usage_details: {},
        usage_details: { input: 4, total: 4 },
        provided_cost_details: {},
        cost_details: { total: 0.0000004 },
        total_cost: 0.0000004,
        completion_start_time: null,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: new Date("2025-02-10T13:40:12.000Z").getTime(),
        updated_at: new Date("2025-02-10T13:40:17.122Z").getTime(),
        event_ts: new Date("2025-02-10T13:40:17.123Z").getTime(),
        is_deleted: 0,
      }),
      createObservation({
        id: "d268abac-61dc-44dd-8679-26f06980d823",
        trace_id: "887c22ea-1c73-4453-b811-610a50cd6cf4",
        project_id: projectId,
        type: "GENERATION",
        parent_observation_id: null,
        start_time: new Date("2025-02-10T13:40:09.936Z").getTime(),
        end_time: new Date("2025-02-10T13:40:10.874Z").getTime(),
        name: "generation",
        metadata: {},
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: JSON.stringify([
          {
            role: "system",
            content:
              'You are a very enthusiastic Langfuse representative who loves to help people! Langfuse is an open-source observability tool for developers of applications that use Large Language Models (LLMs).\n\nAnswer with "Sorry, I don\'t know how to help with that." if the question is not related to Langfuse or if you are unable to answer it based on the context.\n\nbe nice!',
          },
          { role: "user", content: "hi" },
        ]),
        output:
          "Hello! 😊 How can I assist you today? If you have any questions about Langfuse or need help with observability for your LLM applications, feel free to ask!",
        provided_model_name: "gpt-4o-mini",
        internal_model_id: "clyrjp56f0000t0mzapoocd7u",
        model_parameters: null,
        provided_usage_details: {},
        usage_details: { input: 90, output: 36, total: 126 },
        provided_cost_details: {},
        cost_details: { input: 0.0000135, output: 0.0000216, total: 0.0000351 },
        total_cost: 0.0000351,
        completion_start_time: new Date("2025-02-10T13:40:10.513Z").getTime(),
        prompt_id: "cm3rzir8c0006geywi6puuunk",
        prompt_name: "qa-answer-no-context-chat",
        prompt_version: 3,
        created_at: new Date("2025-02-10T13:40:12.000Z").getTime(),
        updated_at: new Date("2025-02-10T13:40:16.721Z").getTime(),
        event_ts: new Date("2025-02-10T13:40:16.721Z").getTime(),
        is_deleted: 0,
      }),
      createObservation({
        id: "a8b7f786-419f-4f8e-ab55-fa3b12a1057a",
        trace_id: "479f5031-f75c-410d-8a99-afb5e5e0339d",
        project_id: projectId,
        type: "GENERATION",
        parent_observation_id: "bfec8b63-9845-437b-9996-0ef28b89bc1b",
        start_time: new Date("2025-02-10T13:34:41.173Z").getTime(),
        end_time: new Date("2025-02-10T13:34:42.830Z").getTime(),
        name: "prompt-embedding",
        metadata: {},
        level: "DEBUG",
        status_message: null,
        version: null,
        input: "hello",
        output: null,
        provided_model_name: "text-embedding-ada-002",
        internal_model_id: "clrntjt89000908jwhvkz5crm",
        model_parameters: null,
        provided_usage_details: {},
        usage_details: { input: 1, total: 1 },
        provided_cost_details: {},
        cost_details: { total: 0.0000001 },
        total_cost: 0.0000001,
        completion_start_time: null,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: new Date("2025-02-10T13:34:45.000Z").getTime(),
        updated_at: new Date("2025-02-10T13:34:49.187Z").getTime(),
        event_ts: new Date("2025-02-10T13:34:49.187Z").getTime(),
        is_deleted: 0,
      }),
      createObservation({
        id: "c21e7974-6f5c-44ab-9036-392ea49accb9",
        trace_id: "479f5031-f75c-410d-8a99-afb5e5e0339d",
        project_id: projectId,
        type: "GENERATION",
        parent_observation_id: null,
        start_time: new Date("2025-02-10T13:34:43.138Z").getTime(),
        end_time: new Date("2025-02-10T13:34:43.985Z").getTime(),
        name: "generation",
        metadata: {},
        level: "DEFAULT",
        status_message: null,
        version: null,
        input: JSON.stringify([
          {
            role: "system",
            content:
              'You are a very enthusiastic Langfuse representative who loves to help people! Langfuse is an open-source observability tool for developers of applications that use Large Language Models (LLMs). Given the following sections from the Langfuse documentation, answer the question using only that information, outputted in markdown format.\n\nPlease follow these guidelines:\n- Refer to the respective links of the documentation\n- Be kind.\n- Include emojis where it makes sense.\n- If the users have problems using Langfuse, tell them to reach out to the founders directly via the chat widget or GitHub at the end of your answer.\n- Answer as markdown, use highlights and paragraphs to structure the text.\n- Do not mention that you are "enthusiastic", the user does not need to know, will feel it from the style of your answers.\n- Only use information that is available in the context, do not make up any code that is not in the context.\n- If you are unsure and the answer is not explicitly written in the documentation, say "Sorry, I don\'t know how to help with that." and ask a follow up question to help the user to specify their question.\n- Assume that the user does not know anything about Langfuse.',
          },
          {
            role: "assistant",
            content:
              "All right, what is the documentation that I am meant to exclusively use to answer the question?",
          },
          {
            role: "user",
            content:
              "Documentation START\n```\ntitle: Ask AI\ndescription: Ask AI\n-------------------\n---\n\n```\nDocumentation END\n\n",
          },
          {
            role: "assistant",
            content:
              "Answering in next message based on your instructions only. What is the question?",
          },
          { role: "user", content: "hello" },
        ]),
        output:
          "Hello! 😊 How can I assist you today? If you have any questions about Langfuse, feel free to ask!",
        provided_model_name: "gpt-4o-mini",
        internal_model_id: "clyrjp56f0000t0mzapoocd7u",
        model_parameters: null,
        provided_usage_details: {},
        usage_details: { input: 332, output: 25, total: 357 },
        provided_cost_details: {},
        cost_details: { input: 0.0000498, output: 0.000015, xotal: 0.0000648 },
        total_cost: 0.0000648,
        completion_start_time: new Date("2025-02-10T13:34:43.672Z").getTime(),
        prompt_id: "cm5vcf9wp00tesg3lreax6tkx",
        prompt_name: "qa-answer-with-context-chat",
        prompt_version: 42,
        created_at: new Date("2025-02-10T13:34:45.000Z").getTime(),
        updated_at: new Date("2025-02-10T13:34:49.202Z").getTime(),
        event_ts: new Date("2025-02-10T13:34:49.202Z").getTime(),
        is_deleted: 0,
      }),
    ];

    await createObservationsCh(observations);

    const filter = [
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: ">=" as const,
        value: fromDate,
      },
      {
        type: "datetime" as const,
        column: "timestamp",
        operator: "<=" as const,
        value: toDate,
      },
    ];

    const cost = await getObservationsCostGroupedByName(projectId, filter);

    console.log(cost);

    const timeSeriesCost = await getObservationUsageByTime(projectId, filter);

    console.log(timeSeriesCost.filter((t) => t.provided_model_name));

    // expect(cost).toEqual([
    //   {
    //     model: "gpt-3.5-turbo",
    //     sumCalculatedTotalCost: 100,
    //     sumTotalTokens: 100,
    //   },
    // ]);
  });
});

describe("aggregate time series for model cost and usage", () => {
  it.only("should aggregate time series for model cost and usage", async () => {
    const a = prepareUsageDataForTimeseriesChart(
      ["gpt-4o-mini", "text-embedding-ada-002"],
      [
        {
          startTime: "2025-02-10T13:30:00.000Z",
          units: {
            input: 422,
            output: 61,
            total: 483,
          },
          cost: {
            input: 0.0000633,
            output: 0.0000366,
            total: 0.0000999,
          },
          model: "gpt-4o-mini",
        },
      ],
    );

    console.log(a);

    console.log("total", a.get("total"));
  });
});
