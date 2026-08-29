export type MigrationSdkName = "python" | "javascript";

export type ApiMigrationGuidance = {
  currentMethod?: string;
  replacementMethod?: string;
  replacement: string;
  minimumVersion?: string;
  requiresUpgrade?: boolean;
};

type SdkMethods = Record<
  MigrationSdkName,
  { current: string; replacement: string; minimumVersion?: string }
>;

const observationsMethods = (current: SdkMethods): SdkMethods => current;

const guidanceByEndpoint: Record<
  string,
  { replacement: string; methods?: SdkMethods }
> = {
  "GET /api/public/traces": {
    replacement: "GET /api/public/v2/observations",
    methods: observationsMethods({
      python: {
        current: "client.api.trace.list",
        replacement: "client.api.observations.get_many",
        minimumVersion: "4.0.0",
      },
      javascript: {
        current: "client.api.trace.list",
        replacement: "client.api.observations.getMany",
        minimumVersion: "4.0.0",
      },
    }),
  },
  "GET /api/public/traces/{id}": {
    replacement: "GET /api/public/v2/observations",
    methods: observationsMethods({
      python: {
        current: "client.api.trace.get",
        replacement: "client.api.observations.get_many",
        minimumVersion: "4.0.0",
      },
      javascript: {
        current: "client.api.trace.get",
        replacement: "client.api.observations.getMany",
        minimumVersion: "4.0.0",
      },
    }),
  },
  "GET /api/public/observations": {
    replacement: "GET /api/public/v2/observations",
    methods: {
      python: {
        current: "client.api.legacy.observations_v1.get_many",
        replacement: "client.api.observations.get_many",
        minimumVersion: "4.0.0",
      },
      javascript: {
        current: "client.api.legacy.observationsV1.getMany",
        replacement: "client.api.observations.getMany",
        minimumVersion: "4.0.0",
      },
    },
  },
  "GET /api/public/observations/{id}": {
    replacement: "GET /api/public/v2/observations",
    methods: {
      python: {
        current: "client.api.legacy.observations_v1.get",
        replacement: "client.api.observations.get_many",
        minimumVersion: "4.0.0",
      },
      javascript: {
        current: "client.api.legacy.observationsV1.get",
        replacement: "client.api.observations.getMany",
        minimumVersion: "4.0.0",
      },
    },
  },
  "GET /api/public/v2/scores": {
    replacement: "GET /api/public/v3/scores",
    methods: {
      python: {
        current: "client.api.scores.get_many",
        replacement: "client.api.scores_v3.get_many_v3",
        minimumVersion: "4.8.1",
      },
      javascript: {
        current: "client.api.scores.getMany",
        replacement: "client.api.scoresV3.getManyV3",
        minimumVersion: "5.5.0",
      },
    },
  },
  "GET /api/public/v2/scores/{id}": {
    replacement: "GET /api/public/v3/scores",
    methods: {
      python: {
        current: "client.api.scores.get_by_id",
        replacement: "client.api.scores_v3.get_many_v3",
        minimumVersion: "4.8.1",
      },
      javascript: {
        current: "client.api.scores.getById",
        replacement: "client.api.scoresV3.getManyV3",
        minimumVersion: "5.5.0",
      },
    },
  },
  "GET /api/public/scores/{id}": {
    replacement: "GET /api/public/v3/scores",
    methods: {
      python: {
        current: "client.api.scores.get_by_id",
        replacement: "client.api.scores_v3.get_many_v3",
        minimumVersion: "4.8.1",
      },
      javascript: {
        current: "client.api.scores.getById",
        replacement: "client.api.scoresV3.getManyV3",
        minimumVersion: "5.5.0",
      },
    },
  },
  "GET /api/public/sessions": {
    replacement: "GET /api/public/v2/observations",
    methods: observationsMethods({
      python: {
        current: "client.api.sessions.list",
        replacement: "client.api.observations.get_many",
        minimumVersion: "4.0.0",
      },
      javascript: {
        current: "client.api.sessions.list",
        replacement: "client.api.observations.getMany",
        minimumVersion: "4.0.0",
      },
    }),
  },
  "GET /api/public/sessions/{id}": {
    replacement: "GET /api/public/v2/observations",
    methods: {
      python: {
        current: "client.api.sessions.get",
        replacement: "client.api.observations.get_many",
        minimumVersion: "4.0.0",
      },
      javascript: {
        current: "client.api.sessions.get",
        replacement: "client.api.observations.getMany",
        minimumVersion: "4.0.0",
      },
    },
  },
  "GET /api/public/metrics": {
    replacement: "GET /api/public/v2/metrics",
    methods: {
      python: {
        current: "client.api.legacy.metrics_v1.metrics",
        replacement: "client.api.metrics.metrics",
      },
      javascript: {
        current: "client.api.legacy.metricsV1.metrics",
        replacement: "client.api.metrics.metrics",
      },
    },
  },
  "GET /api/public/dataset-run-items": {
    replacement: "GET /api/public/experiment-items",
    methods: {
      python: {
        current: "client.api.dataset_run_items.list",
        replacement: "client.api.experiments.list_items",
      },
      javascript: {
        current: "client.api.datasetRunItems.list",
        replacement: "client.api.experiments.listItems",
      },
    },
  },
  "GET /api/public/datasets/{datasetName}/runs": {
    replacement: "GET /api/public/experiments",
    methods: {
      python: {
        current: "client.api.datasets.get_runs",
        replacement: "client.api.experiments.list",
      },
      javascript: {
        current: "client.api.datasets.getRuns",
        replacement: "client.api.experiments.list",
      },
    },
  },
  "GET /api/public/datasets/{datasetName}/runs/{runName}": {
    replacement: "GET /api/public/experiment-items",
    methods: {
      python: {
        current: "client.api.datasets.get_run",
        replacement: "client.api.experiments.list_items",
      },
      javascript: {
        current: "client.api.datasets.getRun",
        replacement: "client.api.experiments.listItems",
      },
    },
  },
};

const genericReplacements: Record<string, string> = {
  "GET /api/public/spans": "GET /api/public/v2/observations?type=SPAN",
  "GET /api/public/generations":
    "GET /api/public/v2/observations?type=GENERATION",
  "GET /api/public/scores": "GET /api/public/v3/scores",
  "GET /api/public/metrics/daily": "GET /api/public/v2/metrics",
};

const isVersionBefore = (version: string, minimum: string): boolean => {
  const parts = version
    .match(/^v?\d+(?:\.\d+){0,2}/i)?.[0]
    .replace(/^v/i, "")
    .split(".")
    .map(Number);
  if (!parts) return false;
  const minimumParts = minimum.split(".").map(Number);
  for (const [index, minimumPart] of minimumParts.entries()) {
    const part = parts[index] ?? 0;
    if (part !== minimumPart) return part < minimumPart;
  }
  return false;
};

export const getApiMigrationGuidance = (
  endpoint: string,
  sdkName?: MigrationSdkName,
  sdkVersion?: string,
): ApiMigrationGuidance => {
  const endpointGuidance = guidanceByEndpoint[endpoint];
  const replacement =
    endpointGuidance?.replacement ??
    genericReplacements[endpoint] ??
    "the replacement API in the migration guide";
  const methods = sdkName ? endpointGuidance?.methods?.[sdkName] : undefined;
  if (!methods) return { replacement };

  return {
    currentMethod: methods.current,
    replacementMethod: methods.replacement,
    replacement,
    minimumVersion: methods.minimumVersion,
    requiresUpgrade: methods.minimumVersion
      ? !sdkVersion || isVersionBefore(sdkVersion, methods.minimumVersion)
      : false,
  };
};

export const getCodingAgentName = (userAgent?: string): string | undefined => {
  if (!userAgent) return undefined;
  if (/codex/i.test(userAgent)) return "Codex";
  if (/claude[- /]?code/i.test(userAgent)) return "Claude Code";
  if (/cursor/i.test(userAgent)) return "Cursor";
  return undefined;
};
