import Redis, { RedisOptions, Cluster, ClusterOptions } from "ioredis";
import fs from "fs";
import { env } from "../../env";
import { logger } from "../logger";

const defaultRedisOptions: Partial<RedisOptions> = {
  maxRetriesPerRequest: null,
  enableAutoPipelining: env.REDIS_ENABLE_AUTO_PIPELINING === "true",
};

export const redisQueueRetryOptions: Partial<RedisOptions> = {
  retryStrategy: (times: number) => {
    if (times >= 5) {
      // A few retries are expected and no cause for action.
      logger.warn(`Connection to redis lost. Retry attempt: ${times}`);
    }
    // Retries forever. Waits at least 1s and at most 20s between retries.
    return Math.max(Math.min(Math.exp(times), 20000), 1000);
  },
  reconnectOnError: (err) => {
    // Reconnects on READONLY errors and auto-retries the command.
    logger.warn(`Redis connection error: ${err.message}`);
    return err.message.includes("READONLY") ? 2 : false;
  },
};

/**
 * Parse Redis cluster nodes from environment variable
 * Format: "host1:port1,host2:port2,host3:port3"
 */
const parseClusterNodes = (
  nodesString: string,
): Array<{ host: string; port: number }> => {
  return nodesString.split(",").map((node) => {
    const [host, port] = node.trim().split(":");
    if (!host || !port) {
      throw new Error(
        `Invalid cluster node format: ${node}. Expected format: host:port`,
      );
    }
    return { host, port: parseInt(port, 10) };
  });
};

const createRedisClusterInstance = (
  additionalOptions: Partial<RedisOptions> = {},
): Cluster | null => {
  if (!env.REDIS_CLUSTER_NODES) {
    logger.error(
      "REDIS_CLUSTER_NODES is required when REDIS_CLUSTER_ENABLED is true",
    );
    return null;
  }

  const nodes = parseClusterNodes(env.REDIS_CLUSTER_NODES);
  const tlsOptions =
    env.REDIS_TLS_ENABLED === "true"
      ? {
          tls: {
            ca: env.REDIS_TLS_CA_PATH
              ? fs.readFileSync(env.REDIS_TLS_CA_PATH)
              : undefined,
            cert: env.REDIS_TLS_CERT_PATH
              ? fs.readFileSync(env.REDIS_TLS_CERT_PATH)
              : undefined,
            key: env.REDIS_TLS_KEY_PATH
              ? fs.readFileSync(env.REDIS_TLS_KEY_PATH)
              : undefined,
          },
        }
      : {};

  const clusterOptions: ClusterOptions = {
    // Return incoming addresses as-is - required for AWS ElastiCache Certificate resolution
    dnsLookup: (address, callback) => {
      callback(null, address);
    },
    redisOptions: {
      password: env.REDIS_AUTH || undefined,
      ...defaultRedisOptions,
      ...additionalOptions,
      ...tlsOptions,
    },
    // Retry configuration for cluster
    retryDelayOnFailover: 100,
  };

  const cluster = new Cluster(nodes, clusterOptions);

  cluster.on("error", (error) => {
    logger.error("Redis cluster error", error);
  });

  return cluster;
};

export const createNewRedisInstance = (
  additionalOptions: Partial<RedisOptions> = {},
): Redis | Cluster | null => {
  if (env.REDIS_CLUSTER_ENABLED === "true") {
    return createRedisClusterInstance(additionalOptions);
  }

  const tlsOptions =
    env.REDIS_TLS_ENABLED === "true"
      ? {
          tls: {
            ca: env.REDIS_TLS_CA_PATH
              ? fs.readFileSync(env.REDIS_TLS_CA_PATH)
              : undefined,
            cert: env.REDIS_TLS_CERT_PATH
              ? fs.readFileSync(env.REDIS_TLS_CERT_PATH)
              : undefined,
            key: env.REDIS_TLS_KEY_PATH
              ? fs.readFileSync(env.REDIS_TLS_KEY_PATH)
              : undefined,
          },
        }
      : {};

  const instance = env.REDIS_CONNECTION_STRING
    ? new Redis(env.REDIS_CONNECTION_STRING, {
        ...defaultRedisOptions,
        ...additionalOptions,
        ...tlsOptions,
      })
    : env.REDIS_HOST
      ? new Redis({
          host: String(env.REDIS_HOST),
          port: Number(env.REDIS_PORT),
          password: String(env.REDIS_AUTH),
          ...defaultRedisOptions,
          ...additionalOptions,
          ...tlsOptions,
        })
      : null;

  instance?.on("error", (error) => {
    logger.error("Redis error", error);
  });

  return instance;
};

/**
 * Get the queue prefix for BullMQ cluster compatibility
 * In cluster mode, uses hash tags to ensure queue keys are on the same node
 * In single-node mode, returns undefined (no prefix needed)
 */
export const getQueuePrefix = (queueName: string): string | undefined => {
  if (env.REDIS_CLUSTER_ENABLED === "true") {
    // Use hash tags for Redis cluster compatibility
    // This ensures all keys for a queue are placed on the same hash slot
    return `{${queueName}}`;
  }
  return undefined;
};

/**
 * Execute multiple Redis DEL operations safely in cluster mode
 */
export const safeMultiDel = async (
  redis: Redis | Cluster | null,
  keys: string[],
): Promise<void> => {
  if (!redis || keys.length === 0) return;

  if (env.REDIS_CLUSTER_ENABLED === "true") {
    // In cluster mode, delete keys in separate commands to avoid CROSSSLOT errors
    await Promise.all(keys.map(async (key: string) => redis.del(key)));
  } else {
    // In single-node mode, can delete all keys at once
    await redis.del(keys);
  }
};

const createRedisClient = () => {
  try {
    return createNewRedisInstance();
  } catch (e) {
    logger.error("Failed to connect to redis", e);
    return null;
  }
};

declare global {
  // eslint-disable-next-line no-var
  var redis: undefined | ReturnType<typeof createRedisClient>; // eslint-disable-line no-unused-vars
}

export const redis = globalThis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") globalThis.redis = redis;
