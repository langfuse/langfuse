import { describe, expect, it } from "vitest";
import { redisSocketTimeoutMsSchema } from "./env";

describe("redisSocketTimeoutMsSchema", () => {
  it("defaults to 30s when unset", () => {
    expect(redisSocketTimeoutMsSchema.parse(undefined)).toBe(30_000);
  });

  it("accepts 0 to disable the watchdog", () => {
    expect(redisSocketTimeoutMsSchema.parse("0")).toBe(0);
  });

  it("accepts values of at least 10s", () => {
    expect(redisSocketTimeoutMsSchema.parse("10000")).toBe(10_000);
    expect(redisSocketTimeoutMsSchema.parse("120000")).toBe(120_000);
  });

  it("rejects positive values below the BullMQ blocking-command window", () => {
    // Values below ~5s BZPOPMIN idle time make healthy workers cycle through
    // socket-timeout reconnects (#12944); enforce a 10s floor.
    expect(() => redisSocketTimeoutMsSchema.parse("5000")).toThrow();
    expect(() => redisSocketTimeoutMsSchema.parse("9999")).toThrow();
    expect(() => redisSocketTimeoutMsSchema.parse("-1")).toThrow();
  });
});
