import { env } from "../../env";
import { recordDistribution } from "../instrumentation";
import { logger } from "../logger";

/**
 * Wrapper to run ClickHouse control vs. experimental queries and optionally compare them.
 *
 * Modes (env CLICKHOUSE_EXPERIMENT_MODE):
 *   off        – run control only (default)
 *   control    – run control only (explicit)
 *   experiment – run experiment only
 *   compare    – run both, emit latency metrics + diff log, return control result
 */
export async function runCHExperiment<T>(
  label: string,
  control: () => Promise<T>,
  experiment: () => Promise<T>,
): Promise<T> {
  const mode = env.LANGFUSE_CLICKHOUSE_TABLE_EXPERIMENT_MODE;
  const run = async (fn: () => Promise<T>) => {
    const start = Date.now();
    try {
      const res = await fn();
      return { res, ms: Date.now() - start, err: undefined as unknown };
    } catch (err) {
      return { res: undefined as unknown as T, ms: Date.now() - start, err };
    }
  };

  switch (mode) {
    case "control": {
      return control();
    }
    case "experiment": {
      return experiment();
    }
    case "compare": {
      const [c, e] = await Promise.all([run(control), run(experiment)]);

      // latency metrics
      recordDistribution(`langfuse.ch_exp.${label}_ms`, c.ms, {
        type: "control",
      });
      recordDistribution(`langfuse.ch_exp.${label}_ms`, e.ms, {
        type: "experiment",
      });

      // diff check
      const equal = JSON.stringify(c.res) === JSON.stringify(e.res);

      if (!equal || c.err || e.err) {
        logger.warn("ClickHouse experiment mismatch", {
          label,
          equal,
          controlErr: c.err,
          experimentErr: e.err,
        });
      }

      // raise control error if any
      if (c.err) {
        throw c.err;
      }
      // prefer returning control result to keep behaviour unchanged
      return c.res;
    }
    case "off":
    default: {
      return control();
    }
  }
}
