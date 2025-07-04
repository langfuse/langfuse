import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import mysql from "mysql2/promise";
import { env } from "../../env";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";
import { logger } from "../logger";
import { DorisParameterProcessor } from "./parameterProcessor";

export interface DorisStreamLoadOptions {
  format?: "json" | "csv";
  columns?: string;
  jsonpaths?: string;
  strip_outer_array?: boolean;
  read_json_by_line?: boolean;
  max_filter_ratio?: number;
  timeout?: number;
  load_mem_limit?: number;
}

export interface DorisQueryOptions {
  format?: "JSONEachRow" | "JSON";
  query_params?: Record<string, any>;
  timeout?: number;
}

export interface DorisClientConfig {
  feHttpUrl?: string;
  feQueryPort?: number;
  database?: string;
  username?: string;
  password?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export type DorisClientType = DorisClient;

/**
 * DorisClient provides HTTP-based data loading and JDBC-based querying capabilities for Apache Doris
 * Focuses on Stream Load functionality for high-performance data ingestion and MySQL protocol for queries
 */
export class DorisClient {
  private httpClient: AxiosInstance;
  private config: Required<DorisClientConfig>;
  private connectionPool: mysql.Pool | null = null;

  constructor(config: DorisClientConfig = {}) {
    this.config = {
      feHttpUrl: config.feHttpUrl || env.DORIS_FE_HTTP_URL || "http://localhost:8030",
      feQueryPort: config.feQueryPort || env.DORIS_FE_QUERY_PORT || 9030,
      database: config.database !== undefined ? config.database : (env.DORIS_DB || "langfuse"),
      username: config.username || env.DORIS_USER || "root",
      password: config.password || env.DORIS_PASSWORD || "",
      timeout: config.timeout || env.DORIS_REQUEST_TIMEOUT_MS || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      headers: config.headers || {},
    };

    this.httpClient = axios.create({
      baseURL: this.config.feHttpUrl,
      timeout: this.config.timeout,
      auth: {
        username: this.config.username,
        password: this.config.password,
      },
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      // Enable automatic redirect following for Stream Load
      maxRedirects: 5,
      // Preserve auth headers on redirect
      beforeRedirect: (options, { headers }) => {
        if (options.auth) {
          const authString = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString('base64');
          headers.authorization = `Basic ${authString}`;
        }
      },
    });

    // Add request interceptor for OpenTelemetry tracing
    this.httpClient.interceptors.request.use((config) => {
      const activeSpan = getCurrentSpan();
      if (activeSpan && config.headers) {
        propagation.inject(context.active(), config.headers);
      }
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error("Doris HTTP request failed", {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );

    // Initialize MySQL connection pool for queries
    this.initializeConnectionPool();
  }

  private initializeConnectionPool(): void {
    try {
      // Extract hostname from HTTP URL for MySQL connection
      const url = new URL(this.config.feHttpUrl);
      const host = url.hostname;

      const poolConfig: any = {
        host: host,
        port: this.config.feQueryPort,
        user: this.config.username,
        password: this.config.password,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        acquireTimeout: this.config.timeout,
        timeout: this.config.timeout,
        connectTimeout: this.config.timeout,
      };

      // Only add database to config if it's not empty
      if (this.config.database && this.config.database.trim() !== '') {
        poolConfig.database = this.config.database;
      }

      this.connectionPool = mysql.createPool(poolConfig);

      logger.debug("Doris MySQL connection pool initialized", {
        host,
        port: this.config.feQueryPort,
        database: this.config.database || 'none',
      });
    } catch (error) {
      logger.error("Failed to initialize Doris MySQL connection pool", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute a query against Doris using MySQL protocol
   * @param queryString SQL query string
   * @param params Query parameters
   * @param options Query options
   * @returns Promise<any[]>
   */
  async query(queryString: string, params: any[] = [], options: DorisQueryOptions = {}): Promise<any[]> {
    if (!this.connectionPool) {
      throw new Error("MySQL connection pool not initialized");
    }

    const queryOptions = {
      timeout: this.config.timeout,
      ...options,
    };

    try {
      logger.debug("Executing Doris query", {
        query: queryString.substring(0, 200) + (queryString.length > 200 ? "..." : ""),
        paramsCount: params.length,
      });

      // Use query instead of execute to avoid MySQL protocol compatibility issues with Doris
      // This fixes the "offset out of range" error when using prepared statements
      let finalQuery = queryString;
      if (params.length > 0) {
        // Manually replace ? placeholders with escaped values for basic compatibility
        params.forEach((param, index) => {
          const placeholder = '?';
          const escapedValue = this.escapeValue(param);
          const placeholderIndex = finalQuery.indexOf(placeholder);
          if (placeholderIndex !== -1) {
            finalQuery = finalQuery.substring(0, placeholderIndex) + 
                        escapedValue + 
                        finalQuery.substring(placeholderIndex + 1);
          }
        });
      }

      const [rows] = await this.connectionPool.query(finalQuery);
      
      logger.debug("Doris query completed", {
        rowCount: Array.isArray(rows) ? rows.length : 0,
      });

      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error("Doris query failed", {
        query: queryString,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Simple value escaping for SQL queries (basic protection)
   * @param value The value to escape
   * @returns Escaped value as string
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    // Handle arrays (for IN clauses)
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'NULL'; // Empty array becomes NULL
      }
      // Recursively escape each array element and join with commas
      return value.map(item => this.escapeValue(item)).join(', ');
    }
    
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    
    if (typeof value === 'boolean') {
      return String(value);
    }
    
    if (typeof value === 'number') {
      // Check if this looks like a millisecond timestamp (> year 2001)
      if (value > 978307200000) { // 2001-01-01 in milliseconds
        // Convert timestamp to Doris DateTime format
        const date = new Date(value);
        return `'${date.toISOString().replace('T', ' ').replace('Z', '')}'`;
      }
      // Regular number
      return String(value);
    }
    
    if (value instanceof Date) {
      return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
    }
    
    // For other types, convert to string and escape
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Execute a parameterized query with named parameters (similar to ClickHouse client interface)
   * @param options Query options with query string and parameters
   * @returns Promise with json() method for compatibility
   */
  async queryWithParams(options: {
    query: string;
    query_params?: Record<string, any>;
    format?: string;
  }): Promise<{ json(): Promise<any[]> }> {
    const { query, query_params = {} } = options;
    
    // Use unified parameter processor for consistency
    const processedQuery = DorisParameterProcessor.processQuery(query, query_params);
    
    // Execute the processed query
    const result = await this.query(processedQuery, []);
    
    // Return object with json() method for compatibility with ClickHouse client
    return {
      json: async () => result,
    };
  }

  /**
   * Stream Load data into Doris table using HTTP API
   * @param table Target table name
   * @param data Array of records to insert
   * @param options Stream load options
   * @returns Promise<void>
   */
  async streamLoad<T = any>(
    table: string,
    data: T[],
    options: DorisStreamLoadOptions = {}
  ): Promise<void> {
    if (!data || data.length === 0) {
      logger.warn("No data provided for stream load", { table });
      return;
    }

    const loadOptions = {
      format: "json",
      strip_outer_array: true,
      read_json_by_line: true,
      timeout: 600, // 10 minutes
      ...options,
    };

    // Generate unique load label for idempotency
    const loadLabel = `langfuse_${table}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Expect': '100-continue',
      'label': loadLabel,
      'format': loadOptions.format,
      'strip_outer_array': loadOptions.strip_outer_array.toString(),
      'read_json_by_line': loadOptions.read_json_by_line.toString(),
      'timeout': loadOptions.timeout.toString(),
    };

    // Convert data to JSON string
    const jsonData = JSON.stringify(data);
    
    const url = `/api/${this.config.database}/${table}/_stream_load`;
    
    try {
      // Manual redirect handling to preserve authentication
      const authString = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      const authHeaders = {
        ...headers,
        'Authorization': `Basic ${authString}`,
      };

      // First attempt: try the FE endpoint
      let response = await this.httpClient.put(url, jsonData, {
        headers: authHeaders,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        maxRedirects: 0, // Disable automatic redirects
        validateStatus: (status) => status >= 200 && status < 400, // Accept redirect status codes
      });

      // Handle redirect manually if we get a 307 (this is normal behavior for Doris FE)
      if (response.status === 307 && response.headers?.location) {
        logger.debug("Handling manual redirect for Stream Load", {
          originalUrl: url,
          redirectUrl: response.headers.location,
        });

        // Clean the redirect URL (remove embedded credentials)
        const redirectUrl = response.headers.location.replace(/^http:\/\/[^@]+@/, 'http://');
        
        // Make the request to the redirect URL with proper auth
        response = await axios.put(redirectUrl, jsonData, {
          headers: authHeaders,
          timeout: this.config.timeout,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
      }

      // Check load result
      const result = response.data;
      if (result.Status !== "Success") {
        // Extract error message from different response formats
        let errorMessage = 'Unknown error';
        
        if (result.Message) {
          // Standard Stream Load error format
          errorMessage = result.Message;
        } else if (result.msg && result.data) {
          // Authentication or API error format
          errorMessage = `${result.msg}: ${result.data}`;
        } else if (result.msg) {
          // Simple message format
          errorMessage = result.msg;
        } else if (result.data) {
          // Data field contains error details
          errorMessage = result.data;
        } else if (typeof result === 'string') {
          // Plain text response
          errorMessage = result;
        }
        
        throw new Error(`Stream load failed: ${errorMessage}`);
      }

      logger.debug("Stream load completed successfully", {
        table,
        recordCount: data.length,
        loadLabel,
        loadedRows: result.NumberLoadedRows,
        filteredRows: result.NumberFilteredRows,
      });

    } catch (error) {
      // Enhanced error handling for different error types
      let errorMessage = 'Unknown error';
      
      if (error && typeof error === 'object' && 'response' in error) {
        // Axios HTTP error with response
        const axiosError = error as any;
        if (axiosError.response?.data) {
          const responseData = axiosError.response.data;
          if (responseData.msg && responseData.data) {
            errorMessage = `${responseData.msg}: ${responseData.data}`;
          } else if (responseData.msg) {
            errorMessage = responseData.msg;
          } else if (responseData.Message) {
            errorMessage = responseData.Message;
          } else if (typeof responseData === 'string') {
            errorMessage = responseData;
          } else {
            errorMessage = `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;
          }
        } else {
          errorMessage = axiosError.message || 'Network error';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      
      logger.error("Stream load failed", {
        table,
        recordCount: data.length,
        loadLabel,
        error: errorMessage,
      });
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Batch insert with automatic retry mechanism
   * @param table Target table name
   * @param data Array of records to insert
   * @param options Stream load options
   * @returns Promise<void>
   */
  async insert<T = any>(
    table: string,
    data: T[],
    options: DorisStreamLoadOptions = {}
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.streamLoad(table, data, options);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`Stream load attempt ${attempt} failed, retrying in ${delay}ms`, {
            table,
            error: lastError.message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw new Error(`Stream load failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Health check for Doris FE connection
   * @returns Promise<boolean>
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/health');
      return response.status === 200;
    } catch (error) {
      logger.error("Doris health check failed", { error });
      return false;
    }
  }

  /**
   * Get database information
   * @returns Promise<any>
   */
  async getDatabaseInfo(): Promise<any> {
    try {
      const response = await this.httpClient.get(`/api/${this.config.database}`);
      return response.data;
    } catch (error) {
      logger.error("Failed to get database info", { error });
      throw error;
    }
  }

  /**
   * Close the client connection and MySQL connection pool
   */
  async close(): Promise<void> {
    if (this.connectionPool) {
      await this.connectionPool.end();
      this.connectionPool = null;
      logger.debug("Doris MySQL connection pool closed");
    }
    // Axios doesn't require explicit connection closing
    logger.debug("Doris client closed");
  }
}

/**
 * DorisClientManager provides a singleton pattern for managing Doris clients.
 * It creates and reuses clients based on their configuration to avoid creating
 * a new connection for each operation.
 */
export class DorisClientManager {
  private static instance: DorisClientManager;
  private clientMap: Map<string, DorisClientType> = new Map();

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of the DorisClientManager
   */
  public static getInstance(): DorisClientManager {
    if (!DorisClientManager.instance) {
      DorisClientManager.instance = new DorisClientManager();
    }
    return DorisClientManager.instance;
  }

  /**
   * Generate a consistent hash key for client configurations
   * @param config Client configuration
   * @returns String hash key
   */
  private generateClientKey(config: DorisClientConfig): string {
    const keyParams = {
      feHttpUrl: config.feHttpUrl || env.DORIS_FE_HTTP_URL,
      database: config.database || env.DORIS_DB,
      username: config.username || env.DORIS_USER,
      timeout: config.timeout || env.DORIS_REQUEST_TIMEOUT_MS,
      headers: config.headers,
    };
    return JSON.stringify(keyParams);
  }

  /**
   * Get or create a client based on the provided configuration
   * @param config Client configuration
   * @returns Doris client instance
   */
  public getClient(config: DorisClientConfig = {}): DorisClientType {
    const key = this.generateClientKey(config);
    
    if (!this.clientMap.has(key)) {
      const client = new DorisClient(config);
      this.clientMap.set(key, client);
    }

    return this.clientMap.get(key)!;
  }

  /**
   * Close all client connections - useful for application shutdown
   */
  public async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.clientMap.values()).map((client) =>
      client.close()
    );
    this.clientMap.clear();
    await Promise.all(closePromises);
  }
}

/**
 * Factory function to get a Doris client instance
 * @param config Optional client configuration
 * @returns Doris client instance
 */
export const dorisClient = (config?: DorisClientConfig): DorisClientType => {
  return DorisClientManager.getInstance().getClient(config || {});
};

/**
 * Utility function to format data for Doris insertion
 * Ensures proper data types and null handling
 */
export const formatDataForDoris = <T extends Record<string, any>>(
  data: T[],
  tableName?: string
): T[] => {
  return data.map(record => {
    const formatted = { ...record } as T;

    // Handle null values and data type conversions
    Object.keys(formatted).forEach(key => {
      const value = (formatted as any)[key];

      // Convert undefined to null
      if (value === undefined) {
        (formatted as any)[key] = null;
      }

      // Ensure arrays are properly formatted
      if (Array.isArray(value)) {
        (formatted as any)[key] = value.length > 0 ? value : null;
      }

      // Handle Date objects - keep ISO format for Doris to handle timezone correctly
      if (value instanceof Date) {
        (formatted as any)[key] = value.toISOString();
      }

      // Convert timestamp fields to Doris DateTime(3) format
      if (
        (key === "timestamp" ||
          key === "created_at" ||
          key === "updated_at" ||
          key === "event_ts" ||
          key === "start_time" ||
          key === "end_time" ||
          key === "completion_start_time") &&
        value != null
      ) {
        try {
          let timestamp: number;
          if (typeof value === "string") {
            timestamp = parseInt(value);
          } else if (typeof value === "number") {
            timestamp = value;
          } else if (value instanceof Date) {
            timestamp = value.getTime();
          } else {
            // Skip conversion for invalid values
            return;
          }

          if (timestamp > 0) {
            // Convert millisecond timestamp to ISO format for Doris to handle timezone correctly
            const date = new Date(timestamp);
            (formatted as any)[key] = date.toISOString();
          }
        } catch (error) {
          logger.warn(`Failed to convert ${key} to DateTime(3) format`, {
            key,
            value,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });

    // Generate date fields based on table type
    if (tableName === "traces" || tableName === "scores") {
      // For traces and scores tables: generate timestamp_date from timestamp
      if ("timestamp" in formatted && formatted.timestamp && !formatted.timestamp_date) {
        try {
          let timestamp: number;
          if (typeof formatted.timestamp === "string") {
            // If it's already a DateTime string (ISO format or space-separated), parse it
            if (formatted.timestamp.includes("T") || formatted.timestamp.includes(" ")) {
              timestamp = new Date(formatted.timestamp).getTime();
            } else {
              timestamp = parseInt(formatted.timestamp);
            }
          } else if (typeof formatted.timestamp === "number") {
            timestamp = formatted.timestamp;
          } else {
            timestamp = new Date(formatted.timestamp).getTime();
          }

          const date = new Date(timestamp);
          (formatted as any).timestamp_date = date.toISOString().split("T")[0];
        } catch (error) {
          logger.warn("Failed to generate timestamp_date from timestamp", {
            table: tableName,
            timestamp: formatted.timestamp,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } else if (tableName === "observations") {
      // For observations table: generate start_time_date from start_time
      if ("start_time" in formatted && formatted.start_time && !formatted.start_time_date) {
        try {
          let startTime: number;
          if (typeof formatted.start_time === "string") {
            // If it's already a DateTime string (ISO format or space-separated), parse it
            if (formatted.start_time.includes("T") || formatted.start_time.includes(" ")) {
              startTime = new Date(formatted.start_time).getTime();
            } else {
              startTime = parseInt(formatted.start_time);
            }
          } else if (typeof formatted.start_time === "number") {
            startTime = formatted.start_time;
          } else {
            startTime = new Date(formatted.start_time).getTime();
          }

          const date = new Date(startTime);
          (formatted as any).start_time_date = date.toISOString().split("T")[0];
        } catch (error) {
          logger.warn("Failed to generate start_time_date from start_time", {
            table: tableName,
            start_time: formatted.start_time,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } else {
      // Fallback: try to detect and generate date fields automatically if no table name provided
      // Generate timestamp_date from timestamp if it doesn't exist
      if ("timestamp" in formatted && formatted.timestamp && !formatted.timestamp_date) {
        try {
          let timestamp: number;
          if (typeof formatted.timestamp === "string") {
            if (formatted.timestamp.includes("T") || formatted.timestamp.includes(" ")) {
              timestamp = new Date(formatted.timestamp).getTime();
            } else {
              timestamp = parseInt(formatted.timestamp);
            }
          } else if (typeof formatted.timestamp === "number") {
            timestamp = formatted.timestamp;
          } else {
            timestamp = new Date(formatted.timestamp).getTime();
          }

          const date = new Date(timestamp);
          (formatted as any).timestamp_date = date.toISOString().split("T")[0];
        } catch (error) {
          logger.warn("Failed to generate timestamp_date from timestamp", {
            timestamp: formatted.timestamp,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Generate start_time_date from start_time for observations if it doesn't exist
      if ("start_time" in formatted && formatted.start_time && !formatted.start_time_date) {
        try {
          let startTime: number;
          if (typeof formatted.start_time === "string") {
            if (formatted.start_time.includes("T") || formatted.start_time.includes(" ")) {
              startTime = new Date(formatted.start_time).getTime();
            } else {
              startTime = parseInt(formatted.start_time);
            }
          } else if (typeof formatted.start_time === "number") {
            startTime = formatted.start_time;
          } else {
            startTime = new Date(formatted.start_time).getTime();
          }

          const date = new Date(startTime);
          (formatted as any).start_time_date = date.toISOString().split("T")[0];
        } catch (error) {
          logger.warn("Failed to generate start_time_date from start_time", {
            start_time: formatted.start_time,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    return formatted;
  });
};
