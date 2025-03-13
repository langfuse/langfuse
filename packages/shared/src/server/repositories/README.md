## Repository docs

### Guarantees for relating data within Langfuse

- Finding a Trace based on an observation [Linear](https://linear.app/langfuse/issue/LFE-2745/improve-generations-table-query-performance)
  - Traces can occur earlier than an observation.
  - 96% of observations.start_time occur 2 mins later than the trace.timestamp
  - There is a very large long-tail. Hence we will use a 2-day (2880 min) look back for now.
- Finding an Observation based on a Trace [Linear](https://linear.app/langfuse/issue/LFE-2409/table-queries)
  - Observations have a very high likelihood of happening after the trace.
  - 97% of traces.timestamp occur 2 mins earlier than the observation.start_time
  - We will maintain a 1 hour cutoff for now.
- Finding traces/observations based on a Score timestamp
  - For scores we have a very high likelihood of happening after the trace / observation.
  - We maintain a 1 hour cutoff for now.
