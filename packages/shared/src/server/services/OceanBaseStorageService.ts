import { Readable } from "stream";
import { logger } from "../logger";
import { env } from "../../env";
import { backOff } from "exponential-backoff";
import { StorageService } from "./StorageService";
import mysql, { Pool } from "mysql2/promise";

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
  partSize?: number;
  queueSize?: number;
};

type UploadWithSignedUrl = UploadFile & {
  expiresInSeconds: number;
};

// Dynamic import type for opendal to avoid bundling issues
type Operator = any;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`{}\` (
  \`key\` VARCHAR(255) PRIMARY KEY,
  \`value\` LONGBLOB,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
`;

export class OceanBaseStorageService implements StorageService {
  private operator: Operator | null = null;
  private bucketName: string;
  private externalEndpoint: string | undefined;
  private tableName: string = "opendal_storage";
  private initPromise: Promise<void>;
  private connectionPool: Pool | null = null;

  constructor(params: {
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
  }) {
    this.bucketName = params.bucketName;
    this.externalEndpoint = params.externalEndpoint;

    // Get connection string from OCEANBASE_URL
    if (!env.OCEANBASE_URL) {
      throw new Error(
        "OCEANBASE_URL is required for OceanBase storage service",
      );
    }

    const connectionString = env.OCEANBASE_URL;

    // Initialize database configuration and operator
    this.initPromise = this.initialize(connectionString);
  }

  private async initialize(connectionString: string): Promise<void> {
    try {
      // Initialize database configuration and table
      await this.initDatabaseConfig();

      // Dynamically import opendal to avoid bundling issues with native modules
      const { Operator } = await import("opendal");

      // Initialize OpenDAL Operator with MySQL schema (same as Python code)
      const config: Record<string, string> = {
        scheme: "mysql",
        connection_string: connectionString,
        table: this.tableName,
      };

      this.operator = new Operator("mysql", config);
      logger.info("OpenDALStorage initialized successfully with MySQL schema");
    } catch (err) {
      logger.error("Failed to initialize OceanBase storage service", err);
      throw new Error("Failed to initialize OceanBase storage service");
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
    if (!this.operator) {
      throw new Error("OceanBase storage service not initialized");
    }
  }

  /**
   * Get or create a connection pool from OCEANBASE_URL
   * @returns A MySQL connection pool instance
   */
  private getConnectionPool(): Pool {
    if (!this.connectionPool) {
      if (!env.OCEANBASE_URL) {
        throw new Error("OCEANBASE_URL is required");
      }

      const url = new URL(env.OCEANBASE_URL);
      const host = url.hostname;
      const port = parseInt(url.port || "2881", 10);
      const user = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      const database = url.pathname.slice(1); // Remove leading '/'

      this.connectionPool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
    }

    return this.connectionPool;
  }

  private async initDatabaseConfig(): Promise<void> {
    try {
      const pool = this.getConnectionPool();
      const connection = await pool.getConnection();

      try {
        // Create storage table
        await connection.execute(
          CREATE_TABLE_SQL.replace("{}", this.tableName),
        );
        logger.info(`Table \`${this.tableName}\` initialized.`);
      } finally {
        connection.release(); // Release connection back to pool
      }
    } catch (err) {
      logger.error("Failed to initialize database configuration", err);
      throw err;
    }
  }

  public async uploadFile({ fileName, data }: UploadFile): Promise<void> {
    await this.ensureInitialized();
    try {
      const buffer =
        typeof data === "string"
          ? Buffer.from(data)
          : await this.streamToBuffer(data);

      // Use bucketName as path prefix (same as Python: f"{bucket}/{fnm}")
      const path = `${this.bucketName}/${fileName}`;
      await this.operator!.write(path, buffer);
    } catch (err) {
      logger.error(`Failed to upload file to OceanBase ${fileName}`, err);
      throw new Error("Failed to upload file to OceanBase");
    }
  }

  public async uploadWithSignedUrl({
    fileName,
    data,
    expiresInSeconds,
  }: UploadWithSignedUrl): Promise<{ signedUrl: string }> {
    await this.ensureInitialized();
    try {
      const buffer =
        typeof data === "string"
          ? Buffer.from(data)
          : await this.streamToBuffer(data);

      // Use bucketName as path prefix (same as Python: f"{bucket}/{fnm}")
      const path = `${this.bucketName}/${fileName}`;
      await this.operator!.write(path, buffer);

      const signedUrl = await this.getSignedUrl(
        fileName,
        expiresInSeconds,
        false,
      );
      return { signedUrl };
    } catch (err) {
      logger.error(`Failed to upload file to OceanBase ${fileName}`, err);
      throw new Error("Failed to upload file to OceanBase");
    }
  }

  public async uploadJson(
    path: string,
    body: Record<string, unknown>[],
  ): Promise<void> {
    await this.ensureInitialized();
    try {
      const content = JSON.stringify(body);
      // Use bucketName as path prefix
      const fullPath = `${this.bucketName}/${path}`;
      await this.operator!.write(fullPath, Buffer.from(content));
    } catch (err) {
      logger.error(`Failed to upload JSON to OceanBase ${path}`, err);
      throw Error("Failed to upload JSON to OceanBase");
    }
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      stream.on("data", (chunk) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(new Uint8Array(chunk));
        } else {
          chunks.push(new Uint8Array(Buffer.from(chunk)));
        }
      });
      stream.on("end", () => {
        // Combine all Uint8Array chunks into a single Buffer
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        const result = Buffer.allocUnsafe(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      });
      stream.on("error", reject);
    });
  }

  public async download(path: string): Promise<string> {
    await this.ensureInitialized();
    try {
      // Use bucketName as path prefix
      const fullPath = `${this.bucketName}/${path}`;
      const data = await this.operator!.read(fullPath);
      return data.toString();
    } catch (err: any) {
      // Check if it's a NotFound error from OpenDAL
      // OpenDAL returns NotFound error when file doesn't exist
      const errorMessage = err?.message || String(err);
      const isNotFound =
        errorMessage.includes("NotFound") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("kv not found");

      if (isNotFound) {
        // Log at debug level for not found errors (expected behavior)
        logger.debug(`File not found in OceanBase: ${path}`);
      } else {
        // Log at error level for unexpected errors
        logger.error(`Failed to download file from OceanBase ${path}`, err);
      }
      throw Error("Failed to download file from OceanBase");
    }
  }

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    await this.ensureInitialized();
    try {
      // OpenDAL MySQL backend doesn't support list operation
      // Query directly from database table using connection pool
      const pool = this.getConnectionPool();
      const connection = await pool.getConnection();

      try {
        // Build the search prefix with bucket name
        const fullPrefix = `${this.bucketName}/${prefix}`;

        // Query files matching the prefix
        // Use LIKE for prefix matching
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT \`key\`, \`created_at\` FROM \`${this.tableName}\` WHERE \`key\` LIKE ? ORDER BY \`created_at\` DESC`,
          [`${fullPrefix}%`],
        );

        return rows.map((row) => {
          const fullPath = row.key as string;
          // Remove bucketName prefix from returned path
          const relativePath = fullPath.startsWith(`${this.bucketName}/`)
            ? fullPath.slice(this.bucketName.length + 1)
            : fullPath;

          return {
            file: relativePath,
            createdAt: row.created_at ? new Date(row.created_at) : new Date(),
          };
        });
      } finally {
        connection.release(); // Release connection back to pool
      }
    } catch (err) {
      logger.error(`Failed to list files from OceanBase ${prefix}`, err);
      throw Error("Failed to list files from OceanBase");
    }
  }

  public async getSignedUrl(
    fileName: string,

    _ttlSeconds: number,

    _asAttachment: boolean = false,
  ): Promise<string> {
    try {
      // For MySQL storage, we can't generate presigned URLs
      // Return a simple URL based on external endpoint if configured
      const baseUrl = this.externalEndpoint;

      if (baseUrl) {
        return `${baseUrl}/api/storage/${this.bucketName}/${fileName}`;
      }

      // If no external endpoint, return a relative path with /api prefix
      return `/api/storage/${this.bucketName}/${fileName}`;
    } catch (err) {
      logger.error(
        `Failed to generate signed URL for OceanBase ${fileName}`,
        err,
      );
      throw Error("Failed to generate signed URL for OceanBase");
    }
  }

  public async getSignedUploadUrl(params: {
    path: string;
    ttlSeconds: number;
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }): Promise<string> {
    // Similar to getSignedUrl, but for uploads
    return this.getSignedUrl(params.path, params.ttlSeconds, false);
  }

  public async deleteFiles(paths: string[]): Promise<void> {
    await backOff(() => this.deleteFilesNonRetrying(paths), {
      numOfAttempts: 3,
    });
  }

  async deleteFilesNonRetrying(paths: string[]): Promise<void> {
    await this.ensureInitialized();
    try {
      await Promise.all(
        paths.map(async (path) => {
          // Use bucketName as path prefix
          const fullPath = `${this.bucketName}/${path}`;
          await this.operator!.delete(fullPath);
        }),
      );
    } catch (err) {
      logger.error(`Failed to delete files from OceanBase ${paths}`, err);
      throw Error("Failed to delete files from OceanBase");
    }
  }
}
