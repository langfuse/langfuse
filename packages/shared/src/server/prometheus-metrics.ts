import { logger } from "./logger";
import type { Gauge, Registry } from "prom-client";

// Cache prom-client module
let promClient: typeof import("prom-client") | null = null;
try {
  promClient = require("prom-client");
} catch (error) {
  promClient = null;
}

/**
 * Shared Prometheus metrics service for Langfuse
 * Can be used by both web and worker packages
 */
class SharedPrometheusMetrics {
  private static instance: SharedPrometheusMetrics;
  private isInitialized = false;
  private metricsEnabled = false;
  private registry?: Registry;

  // System metrics only

  // Gauge metrics for current state
  private activeProjects?: Gauge<string>;
  private activeUsers?: Gauge<string>;
  private ingestionQueueSize?: Gauge<string>;

  private constructor() {
    // Constructor is private for singleton pattern
  }

  public static getInstance(): SharedPrometheusMetrics {
    if (!SharedPrometheusMetrics.instance) {
      SharedPrometheusMetrics.instance = new SharedPrometheusMetrics();
    }
    return SharedPrometheusMetrics.instance;
  }

  public async initialize(enabled: boolean = false): Promise<void> {
    if (this.isInitialized || !promClient) {
      return;
    }

    this.metricsEnabled = enabled;

    if (!enabled) {
      logger.info("Prometheus metrics disabled");
      return;
    }

    try {
      // Create a new registry
      this.registry = new promClient.Registry();

      // System gauge metrics only

      // Gauge metrics
      this.activeProjects = new promClient.Gauge({
        name: "langfuse_active_projects",
        help: "Number of active projects",
        registers: [this.registry],
      });

      this.activeUsers = new promClient.Gauge({
        name: "langfuse_active_users",
        help: "Number of active users",
        registers: [this.registry],
      });

      this.ingestionQueueSize = new promClient.Gauge({
        name: "langfuse_ingestion_queue_size",
        help: "Current size of ingestion queue",
        registers: [this.registry],
      });

      // Enable default system metrics
      promClient.collectDefaultMetrics({
        prefix: "langfuse_",
        register: this.registry,
      });

      this.isInitialized = true;
      logger.info("Shared Prometheus metrics initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize shared Prometheus metrics:", error);
      throw error;
    }
  }

  // Public methods to set system gauge metrics
  public setActiveProjects(count: number): void {
    if (!this.metricsEnabled || !this.activeProjects) return;

    try {
      this.activeProjects.set(count);
    } catch (error) {
      logger.error("Error setting active projects metric:", error);
    }
  }

  public setActiveUsers(count: number): void {
    if (!this.metricsEnabled || !this.activeUsers) return;

    try {
      this.activeUsers.set(count);
    } catch (error) {
      logger.error("Error setting active users metric:", error);
    }
  }

  public setIngestionQueueSize(size: number): void {
    if (!this.metricsEnabled || !this.ingestionQueueSize) return;

    try {
      this.ingestionQueueSize.set(size);
    } catch (error) {
      logger.error("Error setting ingestion queue size metric:", error);
    }
  }

  public async getMetrics(): Promise<string> {
    if (!this.isInitialized || !this.metricsEnabled || !this.registry) {
      return "";
    }

    try {
      return this.registry.metrics();
    } catch (error) {
      logger.error("Error getting metrics:", error);
      return "";
    }
  }

  public getRegister(): Registry | null {
    return this.registry || null;
  }
}

export const sharedPrometheusMetrics = SharedPrometheusMetrics.getInstance();
