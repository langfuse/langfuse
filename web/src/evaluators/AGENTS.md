# Evaluations

- LLM as a judge needs mapping of data to prompt variables - done by the user
- the code evaluators write a hardcoded mapping to the database - handled by the server. The actual data is mapped by the user in code
- Observation filters
  - During the evaluator setup users can set all kind of observation filters to select a sample
  - Filters used in rules are limited to what the `InMemoryFilterService` can process
- JobConfigurationID (legacy) and Rule ID (new) are the same (see eval migration)
