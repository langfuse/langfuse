import workerpool from "workerpool";
import { JsonNested } from "../../utils/zod";
import { parseJsonPrioritised } from "../../json/json-parse";
import { instrumentAsync, logger } from "..";
import Pool from "workerpool/types/Pool";

export class PsicinaSingleton {
  private instance: Pool | undefined;

  public getInstance(): Pool {
    if (!this.instance) {
      this.instance = workerpool.pool();
    }
    return this.instance;
  }
}

export async function parseLargeJson(
  json: string,
): Promise<JsonNested | string | undefined> {
  return instrumentAsync({ name: "parse-large-json" }, async (span) => {
    span.setAttribute("json-length", json.length.toString());

    if (json.length < 0) {
      //2e6
      span.setAttribute("parsing-strategy", "sync");
      return Promise.resolve(parseJsonPrioritised(json));
    }

    logger.info(
      "Parsing large JSON of size " + json.length + " on a worker thread",
    );
    span.setAttribute("parsing-strategy", "async");
    const workerPool = new PsicinaSingleton().getInstance();
    return await workerPool.exec(parseJsonPrioritised, [json]);
  });
}
