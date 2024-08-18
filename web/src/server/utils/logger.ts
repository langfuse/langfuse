// ATTENTION: this is only tested for server side logging!

import { env } from "@/src/env.mjs";
import { log } from "@logtail/next";
import { prettyPrint } from "@logtail/next/dist/logger";
import pino from "pino";
import pretty from "pino-pretty";
import { logflarePinoVercel } from "pino-logflare";

const getBetterstackLogginTransport = (minLevel: string) => {
  console.log(
    "env.LANGFUSE_WEB_BETTERSTACK_TOKEN",
    env.LANGFUSE_WEB_BETTERSTACK_TOKEN,
  );
  return env.LANGFUSE_WEB_BETTERSTACK_TOKEN
    ? pino.transport({
        target: "@logtail/pino",
        options: { sourceToken: env.LANGFUSE_WEB_BETTERSTACK_TOKEN },
        level: minLevel,
      })
    : { level: minLevel };
};

export const getLogger = (
  env: "development" | "production" | "test",
  minLevel = "info",
) => {
  if (env === "production") {
    return pino({ level: "warn" });
  }
  const { stream, send } = logflarePinoVercel({
    apiKey: "aiaNknkeseWpJ32dnqEzFHAQ",
    sourceToken: "LUY69fbQXp2q3VKTSiHXZBgR",
  });
  console.log("stream", stream);
  return pino(
    {
      // browser: {
      //   transmit: {
      //     level: "info",
      //     send: send,
      //   },
      // },
      level: minLevel,
      base: {
        env,
        langfuse: "web",
      },
    },
    stream,
  );
  // return pino(
  //   {
  //     name: "MyLogger",
  //     level: process.env.NODE_ENV === "development" ? "debug" : "info",
  //   },
  //   pretty({
  //     levelFirst: true,
  //     colorize: true,
  //     ignore: "time,hostname,pid",
  //   }),
  // );
  // return pino({
  //   level: minLevel,
  //   transport: {
  //     target: "pino-pretty",
  //     options: {
  //       translateTime: "HH:MM:ss Z",
  //       ignore: "pid,hostname",
  //     },
  //   },
  // });
};
const logger = getLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
export default logger;
