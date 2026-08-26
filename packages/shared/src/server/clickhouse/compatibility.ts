import { createClient, type ClickHouseSettings } from "@clickhouse/client";
import type { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";

import { VERSION } from "../../constants/VERSION";
import { env } from "../../env";
import { logger } from "../logger";
import { compareParsedVersions } from "../utils/compareVersions";
import { ClickHouseLogger, mapLogLevel } from "./clickhouse-logger";

type ClickHouseVersionTuple = readonly [number, number, number, number];

export type ClickHouseVersion = {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  build: number;
  tuple: ClickHouseVersionTuple;
};

export type ClickHouseVersionBand = {
  minInclusive: string;
  maxExclusive?: string;
};

type ClickHouseCompatibilityEnvKey =
  | "CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION"
  | "CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN";

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
    id: "disable-lazy-materialization-for-patch-parts",
    setting: "query_plan_optimize_lazy_materialization",
    value: 0,
    reason:
      "Work around ClickHouse #102904, where lazy materialization can lose `_block_number` while reading lightweight-update patch parts.",
    versionBands: [{ minInclusive: "25.4.0.0", maxExclusive: "26.4.1.1005" }],
    overrideEnvKey: "CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION",
  },
  {
    id: "disable-top-k-through-join",
    setting: "query_plan_top_k_through_join",
    value: 0,
    reason:
      "Work around ClickHouse #109210, where top-K-through-join can leave lazy materialization with a dangling filter input.",
    versionBands: [
      { minInclusive: "26.5.1.651", maxExclusive: "26.5.6.70" },
      { minInclusive: "26.6.0.0", maxExclusive: "26.6.2.108" },
      { minInclusive: "26.7.0.0", maxExclusive: "26.7.1.1334" },
      { minInclusive: "26.7.2.0", maxExclusive: "26.7.2.11" },
    ],
    overrideEnvKey: "CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN",
  },
];

let detectedClickHouseVersion: string | null = null;
let initializationPromise: Promise<void> | null = null;

export const parseClickHouseVersion = (
  rawVersion: string,
): ClickHouseVersion | null => {
  const match = rawVersion
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:[.+-].+)?$/);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const build = Number(match[4] ?? 0);

  if (![major, minor, patch, build].every(Number.isSafeInteger)) return null;

  return {
    raw: rawVersion,
    major,
    minor,
    patch,
    build,
    tuple: [major, minor, patch, build],
  };
};

const parsedVersionBoundCache = new Map<string, ClickHouseVersion>();
const parseVersionBound = (version: string): ClickHouseVersion => {
  const cached = parsedVersionBoundCache.get(version);
  if (cached) return cached;

  const parsed = parseClickHouseVersion(version);
  if (!parsed) {
    throw new Error(
      `Invalid ClickHouse compatibility version bound: ${version}`,
    );
  }

  parsedVersionBoundCache.set(version, parsed);
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

// The setting was introduced in ClickHouse 24.4.
const CLICKHOUSE_JSON_BAD_UNICODE_ESCAPE_MIN_VERSION = "24.4.0.0";

type ClickHouseJsonBadUnicodeEscapeMode = NonNullable<
  typeof env.LANGFUSE_JSON_BAD_UNICODE_ESCAPE
>;

type ResolvedClickHouseJsonBadUnicodeEscapeMode = Exclude<
  ClickHouseJsonBadUnicodeEscapeMode,
  "auto"
>;

export const resolveClickHouseJsonBadUnicodeEscapeMode = ({
  version,
  configuredMode,
  applicationVersion = VERSION,
}: {
  version?: string | null;
  configuredMode?: ClickHouseJsonBadUnicodeEscapeMode;
  applicationVersion?: string;
} = {}): ResolvedClickHouseJsonBadUnicodeEscapeMode => {
  const mode =
    configuredMode ??
    (applicationVersion.startsWith("v4.") ? "no_throw" : "auto");

  if (mode !== "auto") return mode;

  return version &&
    isClickHouseVersionInBand(version, {
      minInclusive: CLICKHOUSE_JSON_BAD_UNICODE_ESCAPE_MIN_VERSION,
    })
    ? "no_throw"
    : "sanitize";
};

export const getClickHouseJsonBadUnicodeEscapeMode = () =>
  resolveClickHouseJsonBadUnicodeEscapeMode({
    version: detectedClickHouseVersion,
    configuredMode: env.LANGFUSE_JSON_BAD_UNICODE_ESCAPE,
  });

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
