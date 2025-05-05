import Piscina from "piscina";

import path from "path";

// import workerpool from "workerpool";
// import Pool from "workerpool/types/Pool";
// export class WorkerPoolSingleton {
//   private instance: Pool | undefined;

//   public getInstance(): Pool {
//     if (!this.instance) {
//       this.instance = workerpool.pool();
//     }
//     return this.instance;
//   }
// }
import { createRequire } from "node:module";
import { parseJsonPrioritised, type JsonNested } from "@langfuse/shared";
import { instrumentAsync, logger } from "@langfuse/shared/src/server";
export class PiscinaSingleton {
  private instance: Piscina | undefined;

  public getInstance(): Piscina {
    if (!this.instance) {
      logger.info(`Initializing Piscina in dirname ${__dirname}`);
      // Resolve worker path *at runtime* using Node's module resolution.
      // Using `createRequire` avoids Webpack / Next.js compile-time rewriting and returns
      // an absolute file-system path that actually exists in production.
      // const nodeRequire = createRequire(__filename);
      // const workerPath = nodeRequire.resolve("@langfuse/shared/worker");

      const workerPath =
        "Users/maximiliandeichmann/development/github.com/langfuse/langfuse/web/node_modules/@langfuse/shared/worker.js";

      // Try to open and print the worker file content to debug path resolution
      try {
        const fs = require("fs");
        if (fs.existsSync(workerPath)) {
          const workerContent = fs.readFileSync(workerPath, "utf8");
          logger.info(
            `Successfully read worker file. First 200 chars: ${workerContent.substring(0, 200)}...`,
          );
        } else {
          logger.error(`Worker file does not exist at path: ${workerPath}`);
        }
      } catch (error) {
        logger.error(
          `Error reading worker file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      logger.info(`Resolved worker path via require.resolve: ${workerPath}`);
      this.instance = new Piscina({
        // Use Webpack 5 worker syntax - Reverted due to CJS issue
        filename: new URL("./worker.js").href,
        // filename: workerPath,
        // minThreads: 1, // Start with at least 1 thread
        // maxThreads: Math.max(1, require("os").cpus().length - 1), // Leave one core for the main thread + OS
        // idleTimeout: 60000, // Shut down idle threads after 60 seconds
      });

      this.instance.on("error", (error) => {
        console.error("Piscina pool error:", error);
      });
      this.instance.on("drain", () => {
        console.log("Piscina queue drained.");
      });
    }
    return this.instance;
  }
}

export async function parseLargeJson(
  json: string,
): Promise<JsonNested | string | undefined> {
  return instrumentAsync({ name: "parse-large-json" }, async (span) => {
    span.setAttribute("json-length", json.length.toString());

    // sync parsing for small json
    if (json.length < 0) {
      //2e6
      span.setAttribute("parsing-strategy", "sync");
      return Promise.resolve(parseJsonPrioritised(json));
    }

    // async parsing for large json
    logger.info(
      "Parsing large JSON of size " + json.length + " on a worker thread",
    );
    span.setAttribute("parsing-strategy", "async");
    const workerPool = new PiscinaSingleton().getInstance();
    // return await workerPool.exec(parseJsonPrioritised, [json]);
    return await workerPool.run(json);
  });
}
