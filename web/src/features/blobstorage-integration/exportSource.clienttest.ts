import { AnalyticsIntegrationExportSource } from "@langfuse/shared";

import {
  getExportSourceFormValue,
  getExportSourceOptions,
  isExportSourceSelectable,
} from "./exportSource";

const cloudPreCutoff = {
  eventsExportAvailable: true,
  forceEventsExport: false,
};
const cloudPostCutoff = {
  eventsExportAvailable: true,
  forceEventsExport: true,
};
const selfHostedWithPreview = {
  eventsExportAvailable: true,
  forceEventsExport: false,
};
const selfHostedRolledBack = {
  eventsExportAvailable: false,
  forceEventsExport: false,
};

describe("getExportSourceFormValue", () => {
  it("keeps a persisted enriched value when enriched export is unavailable (LFE-10296)", () => {
    // Regression: the form used to substitute TRACES_OBSERVATIONS here, so any
    // save silently overwrote the persisted enriched configuration.
    expect(
      getExportSourceFormValue(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(AnalyticsIntegrationExportSource.EVENTS);
    expect(
      getExportSourceFormValue(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS);
  });

  it("keeps any persisted value regardless of deployment state", () => {
    for (const persisted of Object.values(AnalyticsIntegrationExportSource)) {
      for (const availability of [
        cloudPreCutoff,
        cloudPostCutoff,
        selfHostedWithPreview,
        selfHostedRolledBack,
      ]) {
        expect(getExportSourceFormValue(persisted, availability)).toBe(
          persisted,
        );
      }
    }
  });

  it("defaults new configurations to EVENTS when enriched export is available", () => {
    expect(getExportSourceFormValue(undefined, cloudPreCutoff)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(undefined, cloudPostCutoff)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(null, selfHostedWithPreview)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
  });

  it("defaults new configurations to TRACES_OBSERVATIONS when enriched export is unavailable", () => {
    expect(getExportSourceFormValue(undefined, selfHostedRolledBack)).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
  });
});

describe("isExportSourceSelectable", () => {
  it("rejects enriched sources when enriched export is unavailable", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedRolledBack,
      ),
    ).toBe(true);
  });

  it("rejects legacy sources on post-cutoff Cloud projects", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        cloudPostCutoff,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        cloudPostCutoff,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        cloudPostCutoff,
      ),
    ).toBe(true);
  });

  it("accepts all sources when enriched export is available and legacy is allowed", () => {
    for (const source of Object.values(AnalyticsIntegrationExportSource)) {
      expect(isExportSourceSelectable(source, cloudPreCutoff)).toBe(true);
      expect(isExportSourceSelectable(source, selfHostedWithPreview)).toBe(
        true,
      );
    }
  });
});

describe("getExportSourceOptions", () => {
  it("offers all sources when everything is available", () => {
    const options = getExportSourceOptions(undefined, cloudPreCutoff);
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
    expect(options.every((o) => !o.unavailable)).toBe(true);
  });

  it("offers only the legacy source on a rolled-back self-hosted deployment", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      selfHostedRolledBack,
    );
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    ]);
    expect(options[0].unavailable).toBe(false);
  });

  it("offers only EVENTS for post-cutoff Cloud projects", () => {
    const options = getExportSourceOptions(undefined, cloudPostCutoff);
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
  });

  it("includes a stale persisted enriched source, marked unavailable (LFE-10296)", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.EVENTS,
      selfHostedRolledBack,
    );
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
    expect(
      options.find((o) => o.value === AnalyticsIntegrationExportSource.EVENTS)
        ?.unavailable,
    ).toBe(true);
    expect(
      options.find(
        (o) => o.value === AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      )?.unavailable,
    ).toBe(false);
  });
});
