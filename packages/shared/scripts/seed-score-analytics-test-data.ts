#!/usr/bin/env node
/**
 * Script to seed test data for score analytics feature
 *
 * Usage (from repo root):
 *   pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-test-data.ts <projectId>
 *
 * Example:
 *   pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-test-data.ts 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a
 */

import {
  createTrace,
  createObservation,
  createTraceScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  PrismaClient,
} from "../src/server";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// Helper to generate random boolean
function randomBoolean(): boolean {
  return Math.random() < 0.5;
}

// Helper to generate random choice from array
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to generate random number in range
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper to generate random float in range
function randomFloat(min: number, max: number, decimals: number = 2): number {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

// Helper to add some time jitter (for realistic timestamps in milliseconds)
function addTimeJitter(baseTimestamp: number, maxMinutes: number): number {
  const jitter = Math.floor(Math.random() * maxMinutes * 60 * 1000);
  return baseTimestamp + jitter;
}

async function seedBooleanScoresOnTraces(projectId: string) {
  console.log("\n📊 Seeding Boolean scores on traces...");

  const baseTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago in ms
  const traceRecords: Array<{ id: string; timestamp: number }> = [];
  const scoreRecords: ReturnType<typeof createTraceScore>[] = [];

  // Create 1000 trace records
  console.log("  Creating trace records...");
  const traces: ReturnType<typeof createTrace>[] = [];

  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = addTimeJitter(baseTimestamp, 7 * 24 * 60); // Spread over 7 days

    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      timestamp,
      name: `trace-boolean-${i}`,
      metadata: { test_type: "boolean_scores" },
      user_id: `user-${randomInt(1, 20)}`,
      tags: [
        "test",
        "boolean",
        randomChoice(["batch-1", "batch-2", "batch-3"]),
      ],
    });

    traces.push(trace);
    traceRecords.push({ id: traceId, timestamp });

    if ((i + 1) % 100 === 0) {
      console.log(`    Created ${i + 1}/1000 trace records`);
    }
  }

  // Insert traces into ClickHouse in batches
  console.log("  Inserting traces into ClickHouse...");
  const batchSize = 500;
  for (let i = 0; i < traces.length; i += batchSize) {
    const batch = traces.slice(i, i + batchSize);
    await createTracesCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, traces.length)}/1000 traces`,
    );
  }

  console.log(`✅ Created ${traces.length} traces`);

  // Add scores
  console.log("\n📝 Adding Boolean scores...");

  let score1Count = 0;
  let score2Count = 0;
  let bothScoresCount = 0;
  let annotationCount = 0;

  for (let i = 0; i < traceRecords.length; i++) {
    const trace = traceRecords[i];
    const shouldHaveBoth = i < 300; // First 300 have both scores
    const shouldHaveAnnotation = Math.random() < 0.33; // ~1/3 also have ANNOTATION

    // Add score1: tool_use (EVAL)
    if (shouldHaveBoth || i < 300 + 350) {
      // 300 with both + 350 with only score1 = 650 total
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: trace.id,
        timestamp: addTimeJitter(trace.timestamp, 60), // Within 1 hour of trace
        name: "tool_use",
        value: null,
        string_value: randomBoolean() ? "True" : "False",
        data_type: "BOOLEAN",
        source: "EVAL",
        comment: "Evaluated tool usage",
      });
      scoreRecords.push(score);
      score1Count++;

      // Add ANNOTATION version for ~1/3
      if (shouldHaveAnnotation) {
        const annotationScore = createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          trace_id: trace.id,
          timestamp: addTimeJitter(trace.timestamp, 120), // Within 2 hours
          name: "tool_use",
          value: null,
          string_value: randomBoolean() ? "True" : "False",
          data_type: "BOOLEAN",
          source: "ANNOTATION",
          comment: "Human annotation for tool usage",
        });
        scoreRecords.push(annotationScore);
        annotationCount++;
      }
    }

    // Add score2: memory_use (EVAL)
    if (shouldHaveBoth || (i >= 650 && i < 650 + 350)) {
      // 300 with both + 350 with only score2 = 650 total
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: trace.id,
        timestamp: addTimeJitter(trace.timestamp, 60),
        name: "memory_use",
        value: null,
        string_value: randomBoolean() ? "True" : "False",
        data_type: "BOOLEAN",
        source: "EVAL",
        comment: "Evaluated memory usage",
      });
      scoreRecords.push(score);
      score2Count++;

      // Add ANNOTATION version for ~1/3
      if (shouldHaveAnnotation) {
        const annotationScore = createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          trace_id: trace.id,
          timestamp: addTimeJitter(trace.timestamp, 120),
          name: "memory_use",
          value: null,
          string_value: randomBoolean() ? "True" : "False",
          data_type: "BOOLEAN",
          source: "ANNOTATION",
          comment: "Human annotation for memory usage",
        });
        scoreRecords.push(annotationScore);
        annotationCount++;
      }
    }

    if (shouldHaveBoth) {
      bothScoresCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`    Created score records for ${i + 1}/1000 traces`);
    }
  }

  // Insert scores into ClickHouse in batches
  console.log("  Inserting scores into ClickHouse...");
  for (let i = 0; i < scoreRecords.length; i += batchSize) {
    const batch = scoreRecords.slice(i, i + batchSize);
    await createScoresCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, scoreRecords.length)}/${scoreRecords.length} scores`,
    );
  }

  console.log(`✅ Boolean scores summary:`);
  console.log(`   - tool_use (score1): ${score1Count} traces`);
  console.log(`   - memory_use (score2): ${score2Count} traces`);
  console.log(`   - Both scores: ${bothScoresCount} traces`);
  console.log(`   - With ANNOTATION: ${annotationCount} additional scores`);
}

async function seedCategoricalScoresOnObservations(projectId: string) {
  console.log("\n📊 Seeding Categorical scores on observations...");

  const baseTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const observationRecords: Array<{
    id: string;
    traceId: string;
    timestamp: number;
  }> = [];
  const scoreRecords: ReturnType<typeof createTraceScore>[] = [];

  // Create traces and observations
  console.log("  Creating trace and observation records...");
  const traces: ReturnType<typeof createTrace>[] = [];
  const observations: ReturnType<typeof createObservation>[] = [];

  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = addTimeJitter(baseTimestamp, 7 * 24 * 60);

    // Create trace
    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      timestamp,
      name: `trace-categorical-${i}`,
      metadata: { test_type: "categorical_scores" },
      user_id: `user-${randomInt(1, 20)}`,
      tags: [
        "test",
        "categorical",
        randomChoice(["batch-1", "batch-2", "batch-3"]),
      ],
    });
    traces.push(trace);

    // Create observation
    const observationId = randomUUID();
    const startTime = timestamp + 1000; // 1 second after trace
    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: `generation-categorical-${i}`,
      start_time: startTime,
      end_time: startTime + randomInt(1000, 5000), // 1-5 seconds duration
      provided_model_name: randomChoice([
        "gpt-4",
        "gpt-3.5-turbo",
        "claude-3-opus",
      ]),
      metadata: { test_type: "categorical_scores" },
    });
    observations.push(observation);
    observationRecords.push({
      id: observationId,
      traceId,
      timestamp: startTime,
    });

    if ((i + 1) % 100 === 0) {
      console.log(`    Created ${i + 1}/1000 trace and observation records`);
    }
  }

  // Insert traces and observations into ClickHouse in batches
  console.log("  Inserting traces into ClickHouse...");
  const batchSize = 500;
  for (let i = 0; i < traces.length; i += batchSize) {
    const batch = traces.slice(i, i + batchSize);
    await createTracesCh(batch);
  }

  console.log("  Inserting observations into ClickHouse...");
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await createObservationsCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, observations.length)}/1000 observations`,
    );
  }

  console.log(`✅ Created ${observations.length} observations`);

  // Add categorical scores
  console.log("\n📝 Adding Categorical scores...");

  let score1Count = 0;
  let score2Count = 0;
  let bothScoresCount = 0;
  let annotationCount = 0;

  const colorValues = ["red", "blue", "green", "yellow"];
  const genderValues = ["male", "female", "unspecified"];

  for (let i = 0; i < observationRecords.length; i++) {
    const obs = observationRecords[i];
    const shouldHaveBoth = i < 300;
    const shouldHaveAnnotation = Math.random() < 0.33;

    // Add score1: color (API)
    if (shouldHaveBoth || i < 300 + 350) {
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: addTimeJitter(obs.timestamp, 60),
        name: "color",
        value: null,
        string_value: randomChoice(colorValues),
        data_type: "CATEGORICAL",
        source: "API",
        comment: "Color categorization",
      });
      scoreRecords.push(score);
      score1Count++;

      // Add ANNOTATION version
      if (shouldHaveAnnotation) {
        const annotationScore = createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          trace_id: obs.traceId,
          observation_id: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 120),
          name: "color",
          value: null,
          string_value: randomChoice(colorValues),
          data_type: "CATEGORICAL",
          source: "ANNOTATION",
          comment: "Human annotation for color",
        });
        scoreRecords.push(annotationScore);
        annotationCount++;
      }
    }

    // Add score2: gender (API)
    if (shouldHaveBoth || (i >= 650 && i < 650 + 350)) {
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: addTimeJitter(obs.timestamp, 60),
        name: "gender",
        value: null,
        string_value: randomChoice(genderValues),
        data_type: "CATEGORICAL",
        source: "API",
        comment: "Gender categorization",
      });
      scoreRecords.push(score);
      score2Count++;

      // Add ANNOTATION version
      if (shouldHaveAnnotation) {
        const annotationScore = createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          trace_id: obs.traceId,
          observation_id: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 120),
          name: "gender",
          value: null,
          string_value: randomChoice(genderValues),
          data_type: "CATEGORICAL",
          source: "ANNOTATION",
          comment: "Human annotation for gender",
        });
        scoreRecords.push(annotationScore);
        annotationCount++;
      }
    }

    if (shouldHaveBoth) {
      bothScoresCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`    Created score records for ${i + 1}/1000 observations`);
    }
  }

  // Insert scores into ClickHouse in batches
  console.log("  Inserting scores into ClickHouse...");
  for (let i = 0; i < scoreRecords.length; i += batchSize) {
    const batch = scoreRecords.slice(i, i + batchSize);
    await createScoresCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, scoreRecords.length)}/${scoreRecords.length} scores`,
    );
  }

  console.log(`✅ Categorical scores summary:`);
  console.log(`   - color (score1): ${score1Count} observations`);
  console.log(`   - gender (score2): ${score2Count} observations`);
  console.log(`   - Both scores: ${bothScoresCount} observations`);
  console.log(`   - With ANNOTATION: ${annotationCount} additional scores`);
}

async function seedNumericScoresOnObservations(projectId: string) {
  console.log("\n📊 Seeding Numeric scores on observations...");

  const baseTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const observationRecords: Array<{
    id: string;
    traceId: string;
    timestamp: number;
  }> = [];
  const scoreRecords: ReturnType<typeof createTraceScore>[] = [];

  // Create traces and observations
  console.log("  Creating trace and observation records...");
  const traces: ReturnType<typeof createTrace>[] = [];
  const observations: ReturnType<typeof createObservation>[] = [];

  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = addTimeJitter(baseTimestamp, 7 * 24 * 60);

    // Create trace
    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      timestamp,
      name: `trace-numeric-${i}`,
      metadata: { test_type: "numeric_scores" },
      user_id: `user-${randomInt(1, 20)}`,
      tags: [
        "test",
        "numeric",
        randomChoice(["batch-1", "batch-2", "batch-3"]),
      ],
    });
    traces.push(trace);

    // Create observation
    const observationId = randomUUID();
    const startTime = timestamp + 1000;
    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: `generation-numeric-${i}`,
      start_time: startTime,
      end_time: startTime + randomInt(1000, 5000),
      provided_model_name: randomChoice([
        "gpt-4",
        "gpt-3.5-turbo",
        "claude-3-opus",
      ]),
      metadata: { test_type: "numeric_scores" },
    });
    observations.push(observation);
    observationRecords.push({
      id: observationId,
      traceId,
      timestamp: startTime,
    });

    if ((i + 1) % 100 === 0) {
      console.log(`    Created ${i + 1}/1000 trace and observation records`);
    }
  }

  // Insert traces and observations into ClickHouse in batches
  console.log("  Inserting traces into ClickHouse...");
  const batchSize = 500;
  for (let i = 0; i < traces.length; i += batchSize) {
    const batch = traces.slice(i, i + batchSize);
    await createTracesCh(batch);
  }

  console.log("  Inserting observations into ClickHouse...");
  for (let i = 0; i < observations.length; i += batchSize) {
    const batch = observations.slice(i, i + batchSize);
    await createObservationsCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, observations.length)}/1000 observations`,
    );
  }

  console.log(`✅ Created ${observations.length} observations`);

  // Add numeric scores
  console.log("\n📝 Adding Numeric scores...");

  let score1Count = 0;
  let score2Count = 0;
  let bothScoresCount = 0;
  let annotationCount = 0;

  for (let i = 0; i < observationRecords.length; i++) {
    const obs = observationRecords[i];
    const shouldHaveBoth = i < 300;
    const shouldHaveAnnotation = Math.random() < 0.33;

    // Add score1: rizz (EVAL) - range 1-100
    if (shouldHaveBoth || i < 300 + 350) {
      const rizzScore = randomFloat(1, 100, 1);
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: addTimeJitter(obs.timestamp, 60),
        name: "rizz",
        value: rizzScore,
        string_value: String(rizzScore),
        data_type: "NUMERIC",
        source: "EVAL",
        comment: "Rizz score evaluation",
      });
      scoreRecords.push(score);
      score1Count++;

      // Add ANNOTATION version (with some correlation but noise)
      if (shouldHaveAnnotation) {
        const annotationRizz = Math.max(
          1,
          Math.min(100, rizzScore + randomFloat(-15, 15, 1)),
        );
        const annotationScore = createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          trace_id: obs.traceId,
          observation_id: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 120),
          name: "rizz",
          value: annotationRizz,
          string_value: String(annotationRizz),
          data_type: "NUMERIC",
          source: "ANNOTATION",
          comment: "Human annotation for rizz",
        });
        scoreRecords.push(annotationScore);
        annotationCount++;
      }
    }

    // Add score2: clarity (EVAL) - range 1-10
    if (shouldHaveBoth || (i >= 650 && i < 650 + 350)) {
      const clarityScore = randomFloat(1, 10, 1);
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: addTimeJitter(obs.timestamp, 60),
        name: "clarity",
        value: clarityScore,
        string_value: String(clarityScore),
        data_type: "NUMERIC",
        source: "EVAL",
        comment: "Clarity score evaluation",
      });
      scoreRecords.push(score);
      score2Count++;

      // Add ANNOTATION version (with some correlation but noise)
      if (shouldHaveAnnotation) {
        const annotationClarity = Math.max(
          1,
          Math.min(10, clarityScore + randomFloat(-2, 2, 1)),
        );
        const annotationScore = createTraceScore({
          id: randomUUID(),
          project_id: projectId,
          trace_id: obs.traceId,
          observation_id: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 120),
          name: "clarity",
          value: annotationClarity,
          string_value: String(annotationClarity),
          data_type: "NUMERIC",
          source: "ANNOTATION",
          comment: "Human annotation for clarity",
        });
        scoreRecords.push(annotationScore);
        annotationCount++;
      }
    }

    if (shouldHaveBoth) {
      bothScoresCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`    Created score records for ${i + 1}/1000 observations`);
    }
  }

  // Insert scores into ClickHouse in batches
  console.log("  Inserting scores into ClickHouse...");
  for (let i = 0; i < scoreRecords.length; i += batchSize) {
    const batch = scoreRecords.slice(i, i + batchSize);
    await createScoresCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, scoreRecords.length)}/${scoreRecords.length} scores`,
    );
  }

  console.log(`✅ Numeric scores summary:`);
  console.log(`   - rizz (score1): ${score1Count} observations`);
  console.log(`   - clarity (score2): ${score2Count} observations`);
  console.log(`   - Both scores: ${bothScoresCount} observations`);
  console.log(`   - With ANNOTATION: ${annotationCount} additional scores`);
}

async function main() {
  const projectId = process.argv[2];

  if (!projectId) {
    console.error("❌ Error: Project ID is required");
    console.log(
      "\nUsage: pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-test-data.ts <projectId>",
    );
    console.log(
      "\nExample: pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-test-data.ts 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    );
    process.exit(1);
  }

  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    console.error(`❌ Error: Project with ID "${projectId}" not found`);
    process.exit(1);
  }

  console.log(
    `\n🚀 Seeding test data for project: ${project.name} (${projectId})`,
  );
  console.log("⏱️  This will take a few minutes...\n");

  const startTime = Date.now();

  // Seed all three types of data
  await seedBooleanScoresOnTraces(projectId);
  await seedCategoricalScoresOnObservations(projectId);
  await seedNumericScoresOnObservations(projectId);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n✅ Successfully seeded all test data!");
  console.log(`⏱️  Total time: ${duration}s`);
  console.log("\n📋 Summary:");
  console.log("   - 1000 traces with Boolean scores (tool_use, memory_use)");
  console.log("   - 1000 observations with Categorical scores (color, gender)");
  console.log("   - 1000 observations with Numeric scores (rizz, clarity)");
  console.log("   - Each includes ~1/3 with ANNOTATION source variants");
  console.log("\n🎉 Ready to test score analytics!");
  console.log(`\n🔗 Visit: /project/${projectId}/scores/analytics`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\n👋 Disconnected from database");
  })
  .catch(async (error) => {
    console.error("\n❌ Error seeding data:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
