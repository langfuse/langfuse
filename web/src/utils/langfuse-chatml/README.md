# Langfuse ChatML Mappers

This utils package handles conversion of various SDK formats to a Langfuse ChatML format.
We display the Langfuse ChatML format in the frontend and ensure parsing.

The mapping is selected by three values:
* data source (i.e. SDK name)
* data source version (i.e. SDK version)
* language (i.e. SDK programming language)

## Adding a New Mapping

1. Create the mapper file: `mappers/[framework].ts`
  - Implement canMap() - identifies if this mapper can map the input data
  - Implement map() - transforms input to langfuse chatml format
  - Create convert[Framework]Message() - extract framework-specific stuff (tool calls, etc.)
2. Create tests: `mappers/[framework].clienttest.ts`
  - Use real examples with obfuscated data
  - Test canMap() detection (metadata + structural)
  - Test message conversion (tool calls, special fields)
3. Register in chain: `index.ts`
  - Add to imports
  - Add to mappers array (specific mappers before generic)


Langfuse ChatML Model
* messages array
* tool calls
* highlight row, ...
