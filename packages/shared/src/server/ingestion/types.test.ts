import { describe, it, expect } from "vitest";
import { UsageDetails } from "./types";

describe("OpenAIResponseUsageSchema with cache_write_tokens_details", () => {
  it("successfully parses OpenAI Responses usage with nested cache_write_tokens_details", () => {
    const rawPayload = {
      input_tokens: 1557,
      input_tokens_details: {
        cached_tokens: 0,
        cache_write_tokens: 1529,
        cache_write_tokens_details: {
          ttl_30m_tokens: 0,
          ttl_12h_tokens: 1529,
        },
      },
      output_tokens: 5,
      output_tokens_details: {
        reasoning_tokens: 0,
      },
      total_tokens: 1562,
    };

    const parsed = UsageDetails.parse(rawPayload);
    expect(parsed).toBeDefined();
    // Base input should subtract cached and cache_write tokens: 1557 - 1529 = 28
    expect(parsed?.input).toBe(28);
    expect(parsed?.input_cached_tokens).toBe(0);
    expect(parsed?.input_cache_write_tokens).toBe(1529);
    expect(parsed?.output).toBe(5);
    expect(parsed?.total).toBe(1562);
    // Preserves specific TTL breakdown
    expect(parsed?.input_cache_write_30m_tokens).toBe(0);
    expect(parsed?.input_cache_write_12h_tokens).toBe(1529);
  });

  it("handles cache_write_tokens_details when aggregate cache_write_tokens is absent", () => {
    const rawPayload = {
      input_tokens: 1000,
      input_tokens_details: {
        cached_tokens: 100,
        cache_write_tokens_details: {
          ttl_30m_tokens: 200,
          ttl_12h_tokens: 300,
        },
      },
      output_tokens: 50,
      total_tokens: 1050,
    };

    const parsed = UsageDetails.parse(rawPayload);
    expect(parsed).toBeDefined();
    // Attributed cache writes = 200 + 300 = 500
    // Base input = 1000 - 100 (cached) - 500 (write) = 400
    expect(parsed?.input).toBe(400);
    expect(parsed?.input_cached_tokens).toBe(100);
    expect(parsed?.input_cache_write_tokens).toBe(500);
    expect(parsed?.input_cache_write_30m_tokens).toBe(200);
    expect(parsed?.input_cache_write_12h_tokens).toBe(300);
    expect(parsed?.output).toBe(50);
    expect(parsed?.total).toBe(1050);
  });

  it("handles nullish or empty cache_write_tokens_details safely", () => {
    const rawPayload = {
      input_tokens: 500,
      input_tokens_details: {
        cache_write_tokens: 0,
        cache_write_tokens_details: null,
      },
      output_tokens: 20,
      total_tokens: 520,
    };

    const parsed = UsageDetails.parse(rawPayload);
    expect(parsed).toBeDefined();
    expect(parsed?.input).toBe(500);
    expect(parsed?.input_cache_write_tokens).toBe(0);
    expect(parsed?.input_cache_write_30m_tokens).toBeUndefined();
    expect(parsed?.input_cache_write_12h_tokens).toBeUndefined();
  });

  it("retains backward compatibility for standard flat input_tokens_details", () => {
    const standardPayload = {
      input_tokens: 100,
      input_tokens_details: {
        cached_tokens: 20,
      },
      output_tokens: 50,
      total_tokens: 150,
    };

    const parsed = UsageDetails.parse(standardPayload);
    expect(parsed).toBeDefined();
    expect(parsed?.input).toBe(80);
    expect(parsed?.input_cached_tokens).toBe(20);
    expect(parsed?.output).toBe(50);
    expect(parsed?.total).toBe(150);
  });
});
