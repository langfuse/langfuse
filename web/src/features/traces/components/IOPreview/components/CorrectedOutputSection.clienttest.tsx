import { type ScoreDomain } from "@langfuse/shared";

import {
  getCorrectedOutputVisibility,
  shouldShowCorrectedOutputSection,
} from "./CorrectedOutputSection";

const baseCorrection = {
  id: "c1",
  projectId: "p",
  name: "output",
  dataType: "CORRECTION",
  source: "ANNOTATION",
  value: null,
  stringValue: null,
  longStringValue: '{"a":"fixed"}',
  traceId: "t1",
  observationId: null,
  timestamp: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as ScoreDomain;

describe("getCorrectedOutputVisibility", () => {
  it("nests when both scopes have corrections", () => {
    expect(
      getCorrectedOutputVisibility({
        observationId: "obs-1",
        outputCorrection: {
          ...baseCorrection,
          id: "obs",
          observationId: "obs-1",
        },
        traceOutputCorrection: baseCorrection,
        trigger: "header",
      }),
    ).toEqual({ showTrace: true, showObs: true });
  });

  it("shows trace only for a single trace-scoped correction", () => {
    expect(
      getCorrectedOutputVisibility({
        traceOutputCorrection: baseCorrection,
        trigger: "header",
      }),
    ).toEqual({ showTrace: true, showObs: false });
  });

  it("treats outputCorrection without observationId as trace scope (session rows)", () => {
    expect(
      getCorrectedOutputVisibility({
        outputCorrection: baseCorrection,
        trigger: "header",
      }),
    ).toEqual({ showTrace: true, showObs: false });
  });

  it("mounts an empty trace editor when the TraceDetailView pen opens", () => {
    expect(
      getCorrectedOutputVisibility({
        traceEditorOpen: true,
        startEditing: true,
        trigger: "header",
      }),
    ).toEqual({ showTrace: true, showObs: false });
  });

  it("mounts an empty obs editor when the observation pen opens", () => {
    expect(
      getCorrectedOutputVisibility({
        observationId: "obs-1",
        obsEditorOpen: true,
        startEditing: true,
        trigger: "header",
      }),
    ).toEqual({ showTrace: false, showObs: true });
  });

  it("keeps a cache-backed obs correction visible beside a trace correction after remount", () => {
    // Parent gates with effectiveCorrection; section uses the same shape.
    expect(
      shouldShowCorrectedOutputSection({
        observationId: "obs-1",
        outputCorrection: {
          ...baseCorrection,
          id: "cached-obs",
          observationId: "obs-1",
        },
        traceOutputCorrection: baseCorrection,
        trigger: "header",
      }),
    ).toBe(true);
  });

  it("does not mount on a pure Trace header view with nothing open or saved", () => {
    expect(
      shouldShowCorrectedOutputSection({
        trigger: "header",
      }),
    ).toBe(false);
  });

  it("mounts an inline create field on Trace detail JSON (no observationId)", () => {
    expect(
      shouldShowCorrectedOutputSection({
        trigger: "inline",
      }),
    ).toBe(true);
  });
});
