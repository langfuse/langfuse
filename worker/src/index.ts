import Fastify from "fastify";
import consumer from "./redis-consumer";

import { getLogger } from "./logger";
import redis from "@fastify/redis";

const fastify = Fastify({
  logger: getLogger("development") ?? true, // defaults to true if no entry matches in the map
});
fastify.register(redis, { host: process.env.REDIS_URL });
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
  console.log("Hello world!");
  // const { redis } = fastify;
  // redis.set("mykey", "value");
  // console.log(await redis.get("mykey"));
  return { hello: "world" };
});
