import { describe, it, expect } from "vitest";
import { IngestionService } from "../services/IngestionService";
import { eventTypes } from "@langfuse/shared/src/server";

describe("IngestionService mapObservationEventsToRecords usage calculations", () => {
  // Create an IngestionService instance with mocked dependencies
  const ingestionService = new IngestionService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it("preserves explicit usage.total: 0 without overwriting via input + output", () => {
    const events: any[] = [
      {
        id: "evt-1",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-1",
          traceId: "trace-1",
          type: "GENERATION",
          name: "cached-gen",
          usage: {
            input: 100,
            output: 50,
            total: 0,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-1",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 100,
      output: 50,
      total: 0,
    });
  });

  it("calculates total correctly when input is 0 and output is 50", () => {
    const events: any[] = [
      {
        id: "evt-2",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-2",
          traceId: "trace-1",
          type: "GENERATION",
          name: "zero-input-gen",
          usage: {
            input: 0,
            output: 50,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-2",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 0,
      output: 50,
      total: 50,
    });
  });

  it("calculates total correctly when input is 50 and output is 0", () => {
    const events: any[] = [
      {
        id: "evt-3",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-3",
          traceId: "trace-1",
          type: "GENERATION",
          name: "zero-output-gen",
          usage: {
            input: 50,
            output: 0,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-3",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 50,
      output: 0,
      total: 50,
    });
  });

  it("calculates total correctly when both input and output are 0", () => {
    const events: any[] = [
      {
        id: "evt-4",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-4",
          traceId: "trace-1",
          type: "GENERATION",
          name: "all-zero-gen",
          usage: {
            input: 0,
            output: 0,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-4",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 0,
      output: 0,
      total: 0,
    });
  });

  it("preserves explicit non-zero total count", () => {
    const events: any[] = [
      {
        id: "evt-5",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-5",
          traceId: "trace-1",
          type: "GENERATION",
          name: "explicit-total-gen",
          usage: {
            input: 100,
            output: 50,
            total: 200,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-5",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 100,
      output: 50,
      total: 200,
    });
  });

  it("does not compute fallback total when usageDetails is present", () => {
    const events: any[] = [
      {
        id: "evt-6",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-6",
          traceId: "trace-1",
          type: "GENERATION",
          name: "usage-details-gen",
          usageDetails: {
            input: 100,
            custom_tokens: 30,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-6",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 100,
      custom_tokens: 30,
    });
  });

  it("calculates total correctly when only input is provided", () => {
    const events: any[] = [
      {
        id: "evt-7",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-7",
          traceId: "trace-1",
          type: "GENERATION",
          name: "input-only-gen",
          usage: {
            input: 100,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-7",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      input: 100,
      total: 100,
    });
  });

  it("calculates total correctly when only output is provided", () => {
    const events: any[] = [
      {
        id: "evt-8",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-8",
          traceId: "trace-1",
          type: "GENERATION",
          name: "output-only-gen",
          usage: {
            output: 50,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-8",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({
      output: 50,
      total: 50,
    });
  });

  it("leaves provided_usage_details empty when usage is empty object", () => {
    const events: any[] = [
      {
        id: "evt-9",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-9",
          traceId: "trace-1",
          type: "GENERATION",
          name: "empty-usage-gen",
          usage: {},
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-9",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_usage_details).toEqual({});
  });

  it("preserves zero costs in provided_cost_details", () => {
    const events: any[] = [
      {
        id: "evt-10",
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: "obs-10",
          traceId: "trace-1",
          type: "GENERATION",
          name: "zero-cost-gen",
          usage: {
            input: 100,
            output: 50,
            total: 0,
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
          },
        },
      },
    ];

    const records = (ingestionService as any).mapObservationEventsToRecords({
      projectId: "proj-1",
      entityId: "obs-10",
      observationEventList: events,
      prompt: null,
    });

    expect(records).toHaveLength(1);
    expect(records[0].provided_cost_details).toEqual({
      input: 0,
      output: 0,
      total: 0,
    });
  });
});
