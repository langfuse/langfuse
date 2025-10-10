# Langfuse ChatML Mappers

This utils package handles conversion of various SDK formats to a Langfuse ChatML format.
We display the Langfuse ChatML format in the frontend and ensure parsing.

The mapping is selected by three values:
* data source (i.e. SDK name)
* data source version (i.e. SDK version)
* language (i.e. SDK programming language)

## How It Works

Whenever we want to map a source to `LangfuseChatML`, we call the function `mapToLangfuseChatML(input?, output?, metadata?)`.
The function then selects the appropriate mapper and calls its `map()` function.
For each `framework`+`version`+`language` (with the latter 2 optional), we have mapper class and a test file.
Each class has 2 main functions: `canMapScore` and `map`.
The `canMapScore` discovers if this mapper is applicable (i.e. by checking the metadata) and assigns a score.
If a mapper has the score `10`, it's a definite match.
Then, the mappers are run in the order of the scores until one succeeds.


## Adding a New Mapping

1. Create the mapper file: `mappers/[framework].ts`
  - Implement canMapScore(): uses metadata to determine if mapper is applicable
  - Implement map(): transforms input to `LangfuseChatML` format
  - Create convert[Framework]Message(): extract framework-specific stuff (tool calls, etc.)
2. Create tests: `mappers/[framework].clienttest.ts`
  - Use real examples with obfuscated data
  - Test canMapScore() detection (metadata + structural)
  - Test message conversion (tool calls, special fields)
3. Register mapper in `index.ts`

Langfuse ChatML Model
* messages array
* tool calls
* highlight row, ...
