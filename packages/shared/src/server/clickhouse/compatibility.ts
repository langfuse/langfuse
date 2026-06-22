import { createClient, type ClickHouseSettings } from "@clickhouse/client";
import type { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";

import { VERSION } from "../../constants/VERSION";
import { env } from "../../env";
import { logger } from "../logger";
import {
  compareParsedVersions,
  parseVersionString,
  type ParsedVersion,
} from "../utils/compareVersions";
import { ClickHouseLogger, mapLogLevel } from "./clickhouse-logger";

export type ClickHouseVersion = ParsedVersion;

export type ClickHouseVersionBand = {
  minInclusive: string;
  maxExclusive?: string;
};

type ClickHouseCompatibilityEnvKey = "CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION";

type ClickHouseCompatibilityEnvValue = "auto" | "true" | "false";

type ClickHouseCompatibilityRule = {
  id: string;
  setting: string;
  value: ClickHouseSettings[string];
  reason: string;
  versionBands: ClickHouseVersionBand[];
  overrideEnvKey: ClickHouseCompatibilityEnvKey;
};

type ComputedClickHouseCompatibilityFlag = {
  id: string;
  setting: string;
  value: ClickHouseSettings[string];
  reason: string;
  override: ClickHouseCompatibilityEnvValue;
  versionBands: ClickHouseVersionBand[];
  matchesVersionBand: boolean;
  applied: boolean;
};

type ResolveClickHouseCompatibilityParams = {
  version?: string | null;
  overrides?: Partial<
    Record<ClickHouseCompatibilityEnvKey, ClickHouseCompatibilityEnvValue>
  >;
};

type ResolvedClickHouseCompatibility = {
  settings: ClickHouseSettings;
  appliedRules: ClickHouseCompatibilityRule[];
  parsedVersion: ClickHouseVersion | null;
  flags: ComputedClickHouseCompatibilityFlag[];
};

const CLICKHOUSE_COMPATIBILITY_RULES: ClickHouseCompatibilityRule[] = [
  {
    id: "disable-lazy-materialization",
    setting: "query_plan_optimize_lazy_materialization",
    value: 0,
    reason:
      "Work around ClickHouse analyzer failures that can surface as `Not found column and(...)` on compound predicates.",
    versionBands: [{ minInclusive: "25.4.0" }],
    overrideEnvKey: "CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION",
  },
];

let detectedClickHouseVersion: string | null = null;
let initializationPromise: Promise<void> | null = null;

export const parseClickHouseVersion = (
  rawVersion: string,
): ClickHouseVersion | null => parseVersionString(rawVersion);

const parseVersionBound = (version: string): ClickHouseVersion => {
  const parsed = parseClickHouseVersion(version);
  if (!parsed) {
    throw new Error(
      `Invalid ClickHouse compatibility version bound: ${version}`,
    );
  }
  return parsed;
};

export const isClickHouseVersionInBand = (
  version: string | ClickHouseVersion,
  band: ClickHouseVersionBand,
): boolean => {
  const parsedVersion =
    typeof version === "string" ? parseClickHouseVersion(version) : version;
  if (!parsedVersion) return false;

  const min = parseVersionBound(band.minInclusive);
  if (compareParsedVersions(parsedVersion, min) < 0) {
    return false;
  }

  if (band.maxExclusive) {
    const max = parseVersionBound(band.maxExclusive);
    return compareParsedVersions(parsedVersion, max) < 0;
  }

  return true;
};

export const resolveClickHouseCompatibility = ({
  version,
  overrides,
}: ResolveClickHouseCompatibilityParams = {}): ResolvedClickHouseCompatibility => {
  const parsedVersion = version ? parseClickHouseVersion(version) : null;
  const settings: ClickHouseSettings = {};
  const appliedRules: ClickHouseCompatibilityRule[] = [];
  const flags: ComputedClickHouseCompatibilityFlag[] = [];

  for (const rule of CLICKHOUSE_COMPATIBILITY_RULES) {
    const override =
      overrides?.[rule.overrideEnvKey] ?? env[rule.overrideEnvKey] ?? "auto";
    const matchesVersionBand =
      parsedVersion !== null &&
      rule.versionBands.some((band) =>
        isClickHouseVersionInBand(parsedVersion, band),
      );

    const applied =
      override === "true" || (override === "auto" && matchesVersionBand);

    flags.push({
      id: rule.id,
      setting: rule.setting,
      value: rule.value,
      reason: rule.reason,
      override,
      versionBands: rule.versionBands,
      matchesVersionBand,
      applied,
    });

    if (applied) {
      settings[rule.setting] = rule.value;
      appliedRules.push(rule);
    }
  }

  return { settings, appliedRules, parsedVersion, flags };
};

export const getClickHouseCompatibilitySettings = (): ClickHouseSettings =>
  resolveClickHouseCompatibility({ version: detectedClickHouseVersion })
    .settings;

export const initializeClickhouseCompatibility = async (): Promise<void> => {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const clickHouseVersion = await fetchClickHouseVersion();
      const resolved = resolveClickHouseCompatibility({
        version: clickHouseVersion,
      });

      logger.info("Resolved ClickHouse compatibility from version", {
        clickhouseVersion: clickHouseVersion,
        parsedClickHouseVersion: resolved.parsedVersion,
        computedCompatibilityFlags: resolved.flags,
        settings: resolved.settings,
      });

      if (!resolved.parsedVersion) {
        throw new Error(
          `ClickHouse returned an unsupported version: ${clickHouseVersion}`,
        );
      }

      detectedClickHouseVersion = clickHouseVersion;

      if (resolved.appliedRules.length > 0) {
        logger.info("Applying ClickHouse compatibility settings", {
          clickhouseVersion: clickHouseVersion,
          settings: resolved.settings,
          rules: resolved.appliedRules.map((rule) => ({
            id: rule.id,
            setting: rule.setting,
            reason: rule.reason,
          })),
        });
      } else {
        logger.info("No ClickHouse compatibility settings required", {
          clickhouseVersion: clickHouseVersion,
        });
      }
    } catch (error) {
      logger.warn(
        "Failed to detect ClickHouse version; continuing without automatic compatibility settings",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  })();

  return initializationPromise;
};

const fetchClickHouseVersion = async (): Promise<string> => {
  const client = createClient(getClickHouseVersionClientConfig());

  try {
    const result = await client.query({
      query: "SELECT version() AS version",
      format: "JSONEachRow",
    });
    const rows = await result.json<{ version: string }>();
    const version = rows[0]?.version;

    if (!version) {
      throw new Error("ClickHouse version query returned no version");
    }

    return version;
  } finally {
    await client.close();
  }
};

const getClickHouseVersionClientConfig =
  (): NodeClickHouseClientConfigOptions => {
    return {
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: env.CLICKHOUSE_DB,
      application: `langfuse/${VERSION.replace("v", "")}`,
      request_timeout: 10_000,
      log: {
        LoggerClass: ClickHouseLogger,
        level: mapLogLevel(env.LANGFUSE_LOG_LEVEL ?? "info"),
      },
    };
  };

export const setClickHouseCompatibilityVersionForTests = (
  version: string | null,
): void => {
  detectedClickHouseVersion = version;
  initializationPromise = null;
};
