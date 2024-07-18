import { Readable } from "stream";

/**
 * DatabaseReadStream fetches and streams database records in paginated batches,
 * simulating a streaming behavior. This class is designed for efficient, memory-optimized chunking of
 * database queries, ideal for processing large datasets with minimal memory overhead. It operates in
 * object mode, directly streaming database entity objects.
 *
 * Note: Due to Prisma's lack of direct streaming support, this class implements a chunk-based approach
 * rather than true database streaming. It fetches data in paginated batches determined by the pageSize.
 * GitHub issue: https://github.com/prisma/prisma/issues/5055
 *
 * @param prisma - The PrismaClient instance for database queries.
 * @param rawSqlQuery - A Prisma.Sql object representing the base SQL query, excluding OFFSET and LIMIT.
 * @param pageSize - Number of records per batch, defining the chunk size.
 *
 * The class extends Node.js's Readable stream, using async iteration and Prisma's pagination for scalable
 * data processing. It's suitable for applications requiring large dataset processing with a low memory footprint.
 */
export class DatabaseReadStream<EntityType> extends Readable {
  private hasNextPage: boolean;
  private offset: number;
  private isReading: boolean;

  constructor(
    // the delegate function takes care of querying the database in a paginated manner
    private queryDelegate: (
      pageSize: number,
      offset: number
    ) => Promise<Array<EntityType>>,
    private pageSize: number,
    private maxRecords?: number
  ) {
    super({ objectMode: true }); // Set object mode to true to allow pushing objects to the stream rather than strings or buffers

    this.isReading = false; // Prevent concurrent read executions
    this.hasNextPage = true;
    this.offset = 0;
  }

  async _read() {
    if (!this.hasNextPage || this.isReading) return; // Avoid calling the database if there's no more data or if a read operation is already in progress

    this.isReading = true;

    try {
      // Stop reading if the maximum number of records has been reached
      if (this.maxRecords && this.offset >= this.maxRecords) {
        this.hasNextPage = false;
        this.push(null); // Signal end of stream

        return;
      }

      const rows = await this.queryDelegate(this.pageSize, this.offset);

      if (rows.length > 0) {
        rows.forEach((row) => this.push(row));
        this.offset += this.pageSize;
      } else {
        this.hasNextPage = false;
        this.push(null); // Signal end of stream
      }
    } catch (error) {
      this.emit("error", error);
    } finally {
      this.isReading = false;
    }
  }
}
