import Fastify from "fastify";
import consumer from "./redis-consumer";

import { getLogger } from "./logger";
import redis from "@fastify/redis";
import { db } from "./database";

const fastify = Fastify({
  logger: getLogger("development") ?? true, // defaults to true if no entry matches in the map
});

fastify.register(redis, {
  host: process.env.REDIS_URL,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_AUTH,
});
fastify.register(consumer);

const start = async () => {
  try {
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

start();

fastify.get("/", async (request, reply) => {
  return { hello: "world" };
});
