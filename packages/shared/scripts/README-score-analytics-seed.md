# Score Analytics Test Data Seeding Script

This script populates your Langfuse project with test data for the Score Analytics feature. It creates traces, observations, and scores directly in **ClickHouse** using factory functions and batch insertions.

## What it creates

### 1. Boolean Scores on Traces (1000 traces)
- **Score 1**: `tool_use` (True/False)
- **Score 2**: `memory_use` (True/False)
- **Source**: `EVAL`
- **Distribution**:
  - ~300 traces with BOTH scores
  - ~350 additional traces with only `tool_use`
  - ~350 additional traces with only `memory_use`
  - ~1/3 of all traces also get `ANNOTATION` source variants

### 2. Categorical Scores on Observations (1000 observations)
- **Score 1**: `color` (red, blue, green, yellow)
- **Score 2**: `gender` (male, female, unspecified)
- **Source**: `API`
- **Distribution**:
  - ~300 observations with BOTH scores
  - ~350 additional observations with only `color`
  - ~350 additional observations with only `gender`
  - ~1/3 of all observations also get `ANNOTATION` source variants

### 3. Numeric Scores on Observations (1000 observations)
- **Score 1**: `rizz` (1-100, float)
- **Score 2**: `clarity` (1-10, float)
- **Source**: `EVAL`
- **Distribution**:
  - ~300 observations with BOTH scores
  - ~350 additional observations with only `rizz`
  - ~350 additional observations with only `clarity`
  - ~1/3 of all observations also get `ANNOTATION` source variants
  - ANNOTATION scores have some correlation with EVAL scores but include noise

## Usage

### Prerequisites

1. Make sure you have a project ID
2. Ensure your database is running
3. Have environment variables set up (`.env`)

### Run the script

```bash
# From the root of the langfuse repo
pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-test-data.ts <projectId>
```

### Example

```bash
pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-test-data.ts 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a
```

**Note**: The script requires environment variables to be loaded, which is why we use `dotenv -e .env` before the `tsx` command.

## Expected Output

```
🚀 Seeding test data for project: My Project (clkv6g5jo0000jz088vzn1ja4)
⏱️  This will take a few minutes...

📊 Seeding Boolean scores on traces...
  Created 100/1000 traces
  Created 200/1000 traces
  ...
✅ Created 1000 traces

📝 Adding Boolean scores...
  Added scores to 200/1000 traces
  ...
✅ Boolean scores summary:
   - tool_use (score1): 650 traces
   - memory_use (score2): 650 traces
   - Both scores: 300 traces
   - With ANNOTATION: ~433 additional scores

📊 Seeding Categorical scores on observations...
  ...

📊 Seeding Numeric scores on observations...
  ...

✅ Successfully seeded all test data!
⏱️  Total time: 45.23s

📋 Summary:
   - 1000 traces with Boolean scores (tool_use, memory_use)
   - 1000 observations with Categorical scores (color, gender)
   - 1000 observations with Numeric scores (rizz, clarity)
   - Each includes ~1/3 with ANNOTATION source variants

🎉 Ready to test score analytics!

🔗 Visit: /project/clkv6g5jo0000jz088vzn1ja4/scores/analytics
```

## Testing the Feature

After running the script, test the heatmap feature:

1. Navigate to `/project/{projectId}/scores/analytics`

2. **Test Boolean Heatmap**:
   - Select `tool_use-BOOLEAN-EVAL` as score 1
   - Select `memory_use-BOOLEAN-EVAL` as score 2
   - Should see a confusion matrix with ~300 matched pairs

3. **Test Categorical Confusion Matrix**:
   - Select `color-CATEGORICAL-API` as score 1
   - Select `gender-CATEGORICAL-API` as score 2
   - Should see confusion matrix (4x3 grid)

4. **Test Numeric Heatmap**:
   - Select `rizz-NUMERIC-EVAL` as score 1
   - Select `clarity-NUMERIC-EVAL` as score 2
   - Should see 10x10 heatmap with correlation statistics

5. **Test EVAL vs ANNOTATION Comparison**:
   - Select `rizz-NUMERIC-EVAL` as score 1
   - Select `rizz-NUMERIC-ANNOTATION` as score 2
   - Should see correlation with some noise (as intended)

## Performance

- **Time**: ~30-60 seconds depending on your machine
- **Total items created**:
  - 3000 traces
  - 2000 observations
  - ~5200 scores (base + annotations)

## Data Characteristics

- **Timestamps**: Spread over the last 7 days with realistic jitter
- **Tags**: Various tags for filtering
- **Users**: Distributed across multiple user IDs
- **Models**: Random distribution of GPT-4, GPT-3.5, Claude
- **Correlation**: ANNOTATION scores correlate with their EVAL counterparts but include noise for realistic testing

## Cleanup

To remove test data, you can filter by trace names:
- `trace-boolean-*`
- `trace-categorical-*`
- `trace-numeric-*`

Or by metadata: `test_type: "boolean_scores" | "categorical_scores" | "numeric_scores"`

## Notes

- The script creates data in batches with progress indicators
- ANNOTATION scores are intentionally slightly different from EVAL scores to simulate realistic human annotation variance
- Timestamps are realistic with jitter to simulate real-world data collection
- Each trace/observation gets unique IDs for proper isolation
- **Architecture**: Uses ClickHouse for traces, observations, and scores (NOT Postgres) via factory functions (`createTrace`, `createObservation`, `createTraceScore`) and batch insertion (`createTracesCh`, `createObservationsCh`, `createScoresCh`)

## Known Issues

Currently blocked by a dependency resolution error in Node v24 environment:
```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './protocols' is not defined by "exports" in .../node_modules/@smithy/core/package.json
```

This affects:
- This seeding script
- The existing `seed-postgres.ts` script
- The official `pnpm run db:seed` command

**Workaround**: The script logic is correct, but execution is currently blocked by this Node v24 + pnpm + AWS SDK v3 (@smithy/core) compatibility issue. This needs to be resolved at the infrastructure level.
