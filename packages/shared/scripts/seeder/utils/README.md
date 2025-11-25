# Langfuse Seeder System

System for generating test data in ClickHouse and PostgreSQL for Langfuse development and testing.

## Architecture Overview

```
seeder/
├── types.ts                 # Core interfaces and types
├── data-generators.ts       # Data generation logic
├── clickhouse-builder.ts    # ClickHouse query building
├── seeder-orchestrator.ts   # Main orchestration logic
├── postgres-seed-constants.ts  # PostgreSQL data constants
├── clickhouse-seed-constants.ts  # ClickHouse data constants
└── seed-helpers.ts          # Utility functions
```

## Quick Start

```typescript
import { SeederOrchestrator } from "./seeder/seeder-orchestrator";

const orchestrator = new SeederOrchestrator();

// Full seed (datasets + evaluation + synthetic data)
await orchestrator.executeFullSeed(projectIds, {
  numberOfDays: 30,
  totalObservations: 10000,
  numberOfRuns: 3,
});

// Individual data types
await orchestrator.createDatasetExperimentData(projectIds, config);
await orchestrator.createEvaluationData(projectIds);
await orchestrator.createSyntheticData(projectIds, config);
```

## Generated Data

### 1. Dataset Experiment Data

- **Purpose**: Realistic experiment traces based on actual datasets
- **Environment**: `langfuse-prompt-experiments`
- **Structure**: Each dataset item links to a trace with a single generation observation
- **ID Pattern**: `trace-dataset-{datasetName}-{itemIndex}-{projectId}-{runNumber}`

### 2. Evaluation Data

- **Purpose**: Evaluation metrics and scoring data - to be linked to evaluation logs
- **Environment**: `langfuse-evaluation`
- **Structure**: Traces with multiple observations and comprehensive scoring
- **ID Pattern**: `trace-eval-{index}-{projectId}`

### 3. Synthetic Data

- **Purpose**: Large-scale realistic tracing data
- **Environment**: `default`
- **Structure**: Hierarchical traces with multiple observations and scores
- **ID Pattern**: `trace-synthetic-{index}-{projectId}`

## Abstraction Architecture

### DataGenerator

Generates realistic data for all three types. If you need to change any clickhouse data, you should modify this class. Key methods:

- `generateDatasetTrace()` - Creates traces from dataset items
- `generateSyntheticTraces()` - Creates realistic synthetic traces
- `generateEvaluationTraces()` - Creates evaluation-focused traces

### ClickHouseQueryBuilder

Builds optimized ClickHouse insert queries. No need to edit this file. Handles proper escaping and type handling.

### SeederOrchestrator

Main coordination class that:

- Loads file content for realistic inputs/outputs
- Coordinates data generation and insertion
- Handles batching and error recovery
- Provides logging and statistics

## Making Changes

### Configuration Options

```typescript
interface SeederConfig {
  numberOfDays: number; // How far back to generate timestamps
  numberOfRuns?: number; // How many experiment runs per dataset
  totalObservations?: number; // Total observations for synthetic data
}
```

### Extending the System

#### Adding New Data Types

1. Add interface to `types.ts`
2. Add generator method to `DataGenerator`
3. Add query builder method to `ClickHouseQueryBuilder`
4. Add orchestration method to `SeederOrchestrator`
5. Update interdependency documentation

#### Adding New File Sources

1. Add file path to `SeederOrchestrator.loadFileContent()`
2. Add processing logic to `DataGenerator`
3. Update `FileContent` interface if needed

#### Changing Data Distribution

1. Modify generator methods in `DataGenerator`
2. Update constants in `clickhouse-seed-constants.ts`
3. Test with small datasets first

#### Changing ID Generation

1. **Check**: All places that query ClickHouse by ID
2. **Check**: PostgreSQL foreign key references
3. **Check**: Dataset run item and evaluation trace creation logic
4. **Action**: Update `seed-helpers.ts` functions consistently

#### Changing Environment Names

1. **Check**: All ClickHouse queries that filter by environment
2. **Check**: PostgreSQL dataset and prompt environment fields
3. **Check**: UI environment filtering logic
4. **Action**: Update constants in both systems

#### Changing Data Structure

1. **Check**: ClickHouse table schema compatibility
2. **Check**: PostgreSQL table relationships
3. **Check**: API response serialization
4. **Action**: Update both schemas before changing data generation

#### Adding New Data Types

1. **Check**: Whether PostgreSQL needs corresponding tables
2. **Check**: Whether new foreign key relationships are needed
3. **Check**: Whether UI needs to handle new data types
4. **Action**: Plan database migrations carefully

## File Dependencies

### Required Files

```
packages/shared/clickhouse/
├── nested_json.json      # Large JSON for realistic inputs
├── markdown.txt          # Markdown content for document analysis
└── chat_ml_json.json     # Chat ML format examples
```

### Constants Files

- `postgres-seed-constants.ts` - Datasets, prompts, and PostgreSQL data
- `clickhouse-seed-constants.ts` - ClickHouse-specific constants (models, names)
