type Query = { query: string; params: Record<string, unknown> };

const READ_KEYS = [
  "input_cached_tokens",
  "input_cache_read",
  "cache_read_input_tokens",
];
const INPUT_KEYS = ["input", "input_tokens", "prompt_tokens"];
const OUTPUT_KEYS = ["output", "output_tokens", "completion_tokens"];
const TOTAL_KEYS = ["total", "total_tokens"];
const INPUT_PARTITIONS = [
  "input_cache_creation",
  "input_cache_creation_5m",
  "input_cache_creation_1h",
  "input_cache_write",
  "cache_creation_input_tokens",
  "cache_write_input_tokens",
  "cache_write_tokens",
  "input_audio_tokens",
  "input_audio",
  "input_image_tokens",
  "input_image",
  "input_text_tokens",
  "input_text",
];
const OUTPUT_PARTITIONS = [
  "output_reasoning_tokens",
  "output_reasoning",
  "output_audio_tokens",
  "output_audio",
  "output_image_tokens",
  "output_image",
  "output_text_tokens",
  "output_text",
  "output_accepted_prediction_tokens",
  "output_rejected_prediction_tokens",
];
const values = (keys: string[]) =>
  `arrayMap(value -> toFloat64(value), mapValues(mapFilter((key, value) -> key IN [${keys.map((key) => `'${key}'`).join(", ")}], usage_details)))`;

/** Resolve only consistent token partitions; cache aliases describe the same quantity. */
export function buildAgentCacheEventsQuery(base: Query): Query {
  const valid = `length(_cache_read_values) > 0 AND length(arrayDistinct(_cache_read_values)) = 1
    AND length(_cache_input_values) > 0 AND length(arrayDistinct(_cache_input_values)) = 1
    AND length(_cache_output_values) > 0 AND length(arrayDistinct(_cache_output_values)) = 1
    AND length(_cache_total_values) > 0 AND length(arrayDistinct(_cache_total_values)) = 1
    AND _cache_valid_numbers AND length(_cache_input_candidates) = 1`;
  return {
    ...base,
    query: `SELECT *, (${valid}) AS _agent_cache_known,
      if(_agent_cache_known, _cache_read_values[1], 0) AS _agent_cache_read,
      if(_agent_cache_known, _cache_input_candidates[1], 0) AS _agent_cache_input
    FROM (SELECT *, arrayDistinct(arrayFilter(candidate -> candidate >= _cache_read_values[1]
      AND candidate >= 0 AND candidate <= 9007199254740991
      AND (candidate = _cache_input_values[1] OR candidate = _cache_input_values[1] + _cache_read_values[1] + _cache_other_input),
      [_cache_total_values[1] - _cache_output_values[1], _cache_total_values[1] - _cache_output_values[1] - _cache_other_output])) AS _cache_input_candidates
    FROM (SELECT *, ${values(READ_KEYS)} AS _cache_read_values, ${values(INPUT_KEYS)} AS _cache_input_values,
      ${values(OUTPUT_KEYS)} AS _cache_output_values, ${values(TOTAL_KEYS)} AS _cache_total_values,
      arraySum(${values(INPUT_PARTITIONS)}) AS _cache_other_input,
      arraySum(${values(OUTPUT_PARTITIONS)}) AS _cache_other_output,
      arrayAll(value -> isFinite(toFloat64(value)) AND value >= 0 AND value <= 9007199254740991 AND floor(value) = value, mapValues(usage_details)) AS _cache_valid_numbers
      FROM (${base.query}) cache_source) cache_parts) cache_candidates`,
  };
}
