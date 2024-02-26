import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

async function routes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  fastify.redis.subscribe("ingestion", (err, count) => {
    if (err) {
      fastify.log.error("Redis error:", err);
    } else {
      fastify.log.info(
        `Subscribed to ${count} channel. Listening for updates on the channel...`,
      );
    }
  });

  fastify.redis.on("message", (channel, message) => {
    fastify.log.info(`Received "${message}" from ${channel}`);
  });
}

export default fp(routes);
