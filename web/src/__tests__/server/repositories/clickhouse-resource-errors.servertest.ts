import {
  queryClickhouse,
  queryClickhouseStream,
  ClickHouseResourceError,
} from "@langfuse/shared/src/server";
import { fail } from "assert";

describe("ClickHouse Resource Error Handling", () => {
  describe("queryClickhouse", () => {
    describe("Error transformation with throwIf", () => {
      // It is enough to test different block sizes on one error type only
      [1, 10_000].forEach((blockSize) => {
        it(`should transform OOM errors to ClickHouseResourceError; block size: ${blockSize}`, async () => {
          let res = Array<any>();
          try {
            res = await queryClickhouse<any>({
              query: `SELECT throwIf(number >= 2, 'memory limit exceeded: would use 10.23 GiB') AS v FROM system.numbers LIMIT 2000`,
              clickhouseSettings: { max_block_size: `${blockSize}` },
            });
            fail(
              "Should have thrown an error, observed instead " +
                JSON.stringify(res),
            );
          } catch (error: any) {
            expect(error).toBeInstanceOf(ClickHouseResourceError);
            expect(error.errorType).toBe("MEMORY_LIMIT");
          }
        });
      });

      it("should transform OvercommitTracker errors", async () => {
        try {
          await queryClickhouse({
            query: `SELECT throwIf(true, 'OvercommitTracker decision: Query was selected to stop by OvercommitTracker')`,
          });
          fail("Should have thrown an error");
        } catch (error: any) {
          expect(error).toBeInstanceOf(ClickHouseResourceError);
          expect(error.errorType).toBe("OVERCOMMIT");
        }
      });

      it("should transform timeout errors", async () => {
        try {
          await queryClickhouse({
            query: `SELECT throwIf(true, 'Timeout exceeded while reading from socket')`,
          });
          fail("Should have thrown an error");
        } catch (error: any) {
          expect(error).toBeInstanceOf(ClickHouseResourceError);
          expect(error.errorType).toBe("TIMEOUT");
        }
      });

      it("should NOT transform regular SQL errors", async () => {
        await expect(
          queryClickhouse({
            query: `SELECT * FROM non_existent_table_xyz123`,
          }),
        ).rejects.toThrow();

        try {
          await queryClickhouse({
            query: `SELECT * FROM non_existent_table_xyz123`,
          });
        } catch (error: any) {
          expect(error).not.toBeInstanceOf(ClickHouseResourceError);
        }
      });

      it("should pass through successful queries", async () => {
        const result = await queryClickhouse<{ test_value: Number }>({
          query: "SELECT 1 as test_value",
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("test_value");
        expect(result[0].test_value).toBe(1);
      });
    });
  });

  describe("queryClickhouseStream", () => {
    // We don't need to test all error types here, just one is enough
    // to verify streaming works with throwIf and different block sizes.
    [1, 10_000].forEach((blockSize) => {
      it(`should transform errors during streaming; block size ${blockSize}`, async () => {
        const generator = queryClickhouseStream({
          query: `SELECT throwIf(number = 2, 'memory limit exceeded: would use 10.23 GiB') as V FROM numbers(10)`,
          clickhouseSettings: { max_block_size: `${blockSize}` },
        });

        let fullResponse = [];
        await expect(
          (async () => {
            for await (const item of generator) {
              fullResponse.push(item);
            }
            fail(
              "Should have thrown an error, observed instead " +
                JSON.stringify(fullResponse),
            );
          })(),
        ).rejects.toThrow(ClickHouseResourceError);
      });

      it("should stream successful queries", async () => {
        const generator = queryClickhouseStream({
          query: "SELECT number FROM system.numbers LIMIT 3",
        });

        const results = [];
        for await (const item of generator) {
          results.push(item);
        }

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(3);
        expect(results[0]).toHaveProperty("number");
      });
    });
  });

  describe("Error patterns documentation", () => {
    // Document the actual error patterns we handle
    const errorPatterns = [
      {
        name: "Memory limit exceeded with details",
        errorMessage:
          "(total) memory limit exceeded: would use 10.08 GiB (attempt to allocate chunk of 4.49 MiB bytes), current RSS: 1.83 GiB, maximum: 8.40 GiB",
        shouldBeResourceError: true,
        errorType: "MEMORY_LIMIT",
      },
      {
        name: "OvercommitTracker error",
        errorMessage:
          "OvercommitTracker decision: Query was selected to stop by OvercommitTracker: While executing WaitForAsyncInsert",
        shouldBeResourceError: true,
        errorType: "OVERCOMMIT",
      },
      {
        name: "Simple memory error",
        errorMessage: "memory limit exceeded",
        shouldBeResourceError: true,
        errorType: "MEMORY_LIMIT",
      },
      {
        name: "Timeout error",
        errorMessage: "Timeout exceeded while reading from socket",
        shouldBeResourceError: true,
        errorType: "TIMEOUT",
      },
      {
        name: "SQL error (not a resource error)",
        errorMessage: "Table 'test.non_existent' doesn't exist",
        shouldBeResourceError: false,
        errorType: null,
      },
      {
        name: "Network error (retryable but not a resource error)",
        errorMessage: "socket hang up",
        shouldBeResourceError: false,
        errorType: null,
      },
    ];

    errorPatterns.forEach(
      ({ name, errorMessage, shouldBeResourceError, errorType }) => {
        it(`should correctly classify "${name}"`, () => {
          const error = new Error(errorMessage);
          const wrappedError =
            ClickHouseResourceError.wrapIfResourceError(error);
          const isResourceError = ((err: Error) => {
            if (err instanceof ClickHouseResourceError) {
              return true;
            } else {
              return false;
            }
          })(wrappedError);

          expect(isResourceError).toBe(shouldBeResourceError);

          const resourceError = wrappedError as ClickHouseResourceError;
          if (shouldBeResourceError && errorType) {
            expect(resourceError.errorType).toBe(errorType);
          }
        });
      },
    );
  });
});
