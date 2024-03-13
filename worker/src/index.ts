import Fastify from "fastify";
import redis from "@fastify/redis";
import { sum, subtract } from "@repo/logger";
import consumer from "./redis-consumer";
import { getLogger } from "./logger";

const fastify = Fastify({
  logger: getLogger("development"), // defaults to true if no entry matches in the map
});

const setUp = async (): Promise<void> => {
  await fastify.register(redis, {
    host: process.env.REDIS_URL,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_AUTH,
  });
  await fastify.register(consumer);
};

const start = async (): Promise<void> => {
  try {
    await setUp();
    // listen to 0.0.0.0 is required for docker
    await fastify.listen({
      port: process.env.PORT ? parseInt(process.env.PORT) : 3030,
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});

fastify.get("/", (): { hello: { a: number; b: number } } => {
  return { hello: { a: sum(1, 2), b: subtract(10, 4) } };
});
