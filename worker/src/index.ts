import app from "./app";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3030;
app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});

// import consumer from "./redis-consumer";

// import { getLogger } from "./logger";

// import { sum, subtract, multiply } from "shared";

// const fastify = Fastify({
//   logger: getLogger("development") ?? true, // defaults to true if no entry matches in the map
// });

// fastify.register(redis, {
//   host: process.env.REDIS_URL,
//   port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
//   password: process.env.REDIS_AUTH,
// });
// fastify.register(consumer);

// const start = async () => {
//   try {
//     // listen to 0.0.0.0 is required for docker
//     await fastify.listen({
//       port: process.env.PORT ? parseInt(process.env.PORT) : 3030,
//       host: "0.0.0.0",
//     });
//   } catch (err) {
//     fastify.log.error(err);
//     process.exit(1);
//   }
// };

// start();

// fastify.get("/", async (request, reply) => {
//   console.log("GET /", request, reply);

//   return { hello: sum(1, 2) + subtract(3, 1) + multiply(2, 2) };
// });
