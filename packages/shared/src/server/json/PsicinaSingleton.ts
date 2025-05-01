import Piscina from "piscina";
import path from "path";
import { JsonNested } from "../../utils/zod";
import { parseJsonPrioritised } from "../../json/json-parse";
import { instrumentAsync, logger } from "..";

export class PsicinaSingleton {
  private instance: Piscina | undefined;

  public getInstance(): Piscina {
    if (!this.instance) {
      this.instance = new Piscina({
        filename: path.resolve(__dirname, "worker.js"),
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

    if (json.length < 0) {
      //2e6
      span.setAttribute("parsing-strategy", "sync");
      return Promise.resolve(parseJsonPrioritised(json));
    }

    logger.info(
      "Parsing large JSON of size " + json.length + " on a worker thread",
    );
    span.setAttribute("parsing-strategy", "async");
    const piscina = new PsicinaSingleton().getInstance();
    return await piscina.run(json);
  });
}
