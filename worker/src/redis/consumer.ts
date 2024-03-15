import Redis from "ioredis";
import { Worker } from "bullmq";

export class RedisConsumer {
  private redis: Redis;
  private worker: Worker;

  constructor(redis: Redis) {
    this.redis = redis;
    this.worker = new Worker("queue", async (job) => {
      console.log(job.data);
    });
  }

  async consume() {
    await this.worker.waitUntilReady();
  }
}
