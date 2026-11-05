import { describe, expect, it } from "vitest";
import { UsageDetails } from "./types";

describe("UsageDetails TTL Cache Creation Normalization", () => {
  it("normalizes LangChain Bedrock input_ephemeral_5m_input_tokens to input_cache_creation_5m", () => {
    const raw = {
      input: 19,
      output: 139,
      input_cache_read: 4539,
      input_cache_creation: 0,
      input_ephemeral_5m_input_tokens: 194,
      total: 4891,
    };

    const parsed = UsageDetails.parse(raw);

    expect(parsed).toEqual({
      input: 19,
      output: 139,
      input_cache_read: 4539,
      input_cache_creation_5m: 194,
      total: 4891,
    });
    expect(parsed?.input_ephemeral_5m_input_tokens).toBeUndefined();
    expect(parsed?.input_cache_creation).toBeUndefined();
  });

  it("normalizes ephemeral_5m_input_tokens and ephemeral_1h_input_tokens flat keys", () => {
    const raw = {
      input: 100,
      output: 50,
      ephemeral_5m_input_tokens: 500,
      ephemeral_1h_input_tokens: 250,
      total: 900,
    };

    const parsed = UsageDetails.parse(raw);

    expect(parsed).toEqual({
      input: 100,
      output: 50,
      input_cache_creation_5m: 500,
      input_cache_creation_1h: 250,
      total: 900,
    });
  });

  it("preserves native Anthropic nested cache_creation breakdown", () => {
    const raw = {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 1000,
      cache_creation: {
        ephemeral_5m_input_tokens: 800,
        ephemeral_1h_input_tokens: 200,
      },
    };

    const parsed = UsageDetails.parse(raw);

    expect(parsed).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      input_cache_creation_5m: 800,
      input_cache_creation_1h: 200,
    });
    // Aggregate is fully attributed, so cache_creation_input_tokens is deleted
    expect(parsed?.cache_creation_input_tokens).toBeUndefined();
  });

  it("retains remainder of aggregate cache creation tokens when partially attributed", () => {
    const raw = {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 1500,
      input_ephemeral_5m_input_tokens: 1000,
    };

    const parsed = UsageDetails.parse(raw);

    expect(parsed).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      input_cache_creation_5m: 1000,
      cache_creation_input_tokens: 500,
    });
  });

  it("normalizes ephemeral tokens in OpenAI prompt_tokens_details", () => {
    const raw = {
      prompt_tokens: 200,
      completion_tokens: 50,
      total_tokens: 250,
      prompt_tokens_details: {
        ephemeral_5m_input_tokens: 80,
      },
    };

    const parsed = UsageDetails.parse(raw);

    expect(parsed?.input_cache_creation_5m).toBe(80);
    expect(parsed?.input_ephemeral_5m_input_tokens).toBeUndefined();
    expect(parsed?.input).toBe(120); // 200 - 80
    expect(parsed?.output).toBe(50);
    expect(parsed?.total).toBe(250);
  });

  it("normalizes LangChain Anthropic cache_creation_ephemeral_*_input_tokens and dedupes aggregate tokens (#19452)", () => {
    const raw = {
      input: 4,
      output: 153,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 5544,
      cache_creation_ephemeral_5m_input_tokens: 5544,
      cache_creation_ephemeral_1h_input_tokens: 0,
    };

    const parsed = UsageDetails.parse(raw);

    expect(parsed).toEqual({
      input: 4,
      output: 153,
      cache_read_input_tokens: 0,
      input_cache_creation_5m: 5544,
      input_cache_creation_1h: 0,
    });
    // Aggregate is fully attributed to the 5m TTL key, so it is removed to prevent double-counting
    expect(parsed?.cache_creation_input_tokens).toBeUndefined();
    expect(parsed?.cache_creation_ephemeral_5m_input_tokens).toBeUndefined();
    expect(parsed?.cache_creation_ephemeral_1h_input_tokens).toBeUndefined();
  });
});
