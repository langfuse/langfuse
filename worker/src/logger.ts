import pino from "pino";
import { env } from "./env";

const transport = env.LANGFUSE_WORKER_BETTERSTACK_TOKEN
  ? pino.transport({
      target: "@logtail/pino",
      options: { sourceToken: env.LANGFUSE_WORKER_BETTERSTACK_TOKEN },
    })
  : undefined;
console.log("transport", env.LANGFUSE_WORKER_BETTERSTACK_TOKEN);
export const getLogger = (
  env: "development" | "production" | "test",
  minLevel = "info"
) => {
  if (env === "production") {
    return pino({
      base: { serviceContext: { service: "langfuse-worker" } },
      formatters: {
        level(label) {
          const pinoLevel = label as pino.Level;
          // `@type` property tells Error Reporting to track even if there is no `stack_trace`
          const typeProp =
            label === "error" || label === "fatal"
              ? {
                  "@type":
                    "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
                }
  return pino(transport);
};
const logger = getLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
export default logger;
