#!/usr/bin/env node
/**
 * Script to seed test data for score analytics feature
 *
 * Usage:
 *   npx tsx scripts/seed-score-analytics-test-data.ts <projectId>
 *
 * Example:
 *   npx tsx scripts/seed-score-analytics-test-data.ts clkv6g5jo0000jz088vzn1ja4
 */

import { prisma } from "../packages/shared/src/server";
import { randomUUID } from "crypto";

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

// Helper to add some time jitter (for realistic timestamps)
function addTimeJitter(baseDate: Date, maxMinutes: number): Date {
  const jitter = Math.floor(Math.random() * maxMinutes * 60 * 1000);
  return new Date(baseDate.getTime() + jitter);
}

async function seedBooleanScoresOnTraces(projectId: string) {
  console.log("\n📊 Seeding Boolean scores on traces...");

  const baseTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const traces: { id: string; timestamp: Date }[] = [];

  // Create 1000 traces
  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = addTimeJitter(baseTimestamp, 7 * 24 * 60); // Spread over 7 days

    await prisma.trace.create({
      data: {
        id: traceId,
        projectId,
        timestamp,
        name: `trace-boolean-${i}`,
        metadata: { test_type: "boolean_scores" },
        userId: `user-${randomInt(1, 20)}`,
        tags: [
          `test`,
          `boolean`,
          randomChoice(["batch-1", "batch-2", "batch-3"]),
        ],
      },
    });

    traces.push({ id: traceId, timestamp });

    if ((i + 1) % 100 === 0) {
      console.log(`  Created ${i + 1}/1000 traces`);
    }
  }

  console.log(`✅ Created ${traces.length} traces`);

  // Add scores
  console.log("\n📝 Adding Boolean scores...");

  let score1Count = 0;
  let score2Count = 0;
  let bothScoresCount = 0;
  let annotationCount = 0;

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const shouldHaveBoth = i < 300; // First 300 have both scores
    const shouldHaveAnnotation = Math.random() < 0.33; // ~1/3 also have ANNOTATION

    // Add score1: tool_use (EVAL)
    if (shouldHaveBoth || i < 300 + 350) {
      // 300 with both + 350 with only score1 = 650 total
      await prisma.score.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId: trace.id,
          timestamp: addTimeJitter(trace.timestamp, 60), // Within 1 hour of trace
          name: "tool_use",
          value: null,
          stringValue: randomBoolean() ? "True" : "False",
          dataType: "BOOLEAN",
          source: "EVAL",
          comment: `Evaluated tool usage`,
        },
      });
      score1Count++;

      // Add ANNOTATION version for ~1/3
      if (shouldHaveAnnotation) {
        await prisma.score.create({
          data: {
            id: randomUUID(),
            projectId,
            traceId: trace.id,
            timestamp: addTimeJitter(trace.timestamp, 120), // Within 2 hours
            name: "tool_use",
            value: null,
            stringValue: randomBoolean() ? "True" : "False",
            dataType: "BOOLEAN",
            source: "ANNOTATION",
            comment: `Human annotation for tool usage`,
            authorUserId: `annotator-${randomInt(1, 5)}`,
          },
        });
        annotationCount++;
      }
    }

    // Add score2: memory_use (EVAL)
    if (shouldHaveBoth || (i >= 650 && i < 650 + 350)) {
      // 300 with both + 350 with only score2 = 650 total
      await prisma.score.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId: trace.id,
          timestamp: addTimeJitter(trace.timestamp, 60),
          name: "memory_use",
          value: null,
          stringValue: randomBoolean() ? "True" : "False",
          dataType: "BOOLEAN",
          source: "EVAL",
          comment: `Evaluated memory usage`,
        },
      });
      score2Count++;

      // Add ANNOTATION version for ~1/3
      if (shouldHaveAnnotation) {
        await prisma.score.create({
          data: {
            id: randomUUID(),
            projectId,
            traceId: trace.id,
            timestamp: addTimeJitter(trace.timestamp, 120),
            name: "memory_use",
            value: null,
            stringValue: randomBoolean() ? "True" : "False",
            dataType: "BOOLEAN",
            source: "ANNOTATION",
            comment: `Human annotation for memory usage`,
            authorUserId: `annotator-${randomInt(1, 5)}`,
          },
        });
        annotationCount++;
      }
    }

    if (shouldHaveBoth) {
      bothScoresCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  Added scores to ${i + 1}/1000 traces`);
    }
  }

  console.log(`✅ Boolean scores summary:`);
  console.log(`   - tool_use (score1): ${score1Count} traces`);
  console.log(`   - memory_use (score2): ${score2Count} traces`);
  console.log(`   - Both scores: ${bothScoresCount} traces`);
  console.log(`   - With ANNOTATION: ${annotationCount} additional scores`);
}

async function seedCategoricalScoresOnObservations(projectId: string) {
  console.log("\n📊 Seeding Categorical scores on observations...");

  const baseTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const observations: { id: string; traceId: string; timestamp: Date }[] = [];

  // Create traces and observations
  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = addTimeJitter(baseTimestamp, 7 * 24 * 60);

    // Create trace
    await prisma.trace.create({
      data: {
        id: traceId,
        projectId,
        timestamp,
        name: `trace-categorical-${i}`,
        metadata: { test_type: "categorical_scores" },
      },
    });

    // Create observation
    const observationId = randomUUID();
    await prisma.observation.create({
      data: {
        id: observationId,
        traceId,
        projectId,
        type: "GENERATION",
        name: `observation-categorical-${i}`,
        startTime: timestamp,
        endTime: addTimeJitter(timestamp, 5),
        metadata: { test_type: "categorical" },
        model: randomChoice(["gpt-4", "gpt-3.5-turbo", "claude-3-opus"]),
      },
    });

    observations.push({ id: observationId, traceId, timestamp });

    if ((i + 1) % 100 === 0) {
      console.log(`  Created ${i + 1}/1000 observations`);
    }
  }

  console.log(`✅ Created ${observations.length} observations`);

  // Add scores
  console.log("\n📝 Adding Categorical scores...");

  const colors = ["red", "blue", "green", "yellow"];
  const genders = ["male", "female", "unspecified"];

  let score1Count = 0;
  let score2Count = 0;
  let bothScoresCount = 0;
  let annotationCount = 0;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const shouldHaveBoth = i < 300;
    const shouldHaveAnnotation = Math.random() < 0.33;

    // Add score1: color (API)
    if (shouldHaveBoth || i < 300 + 350) {
      await prisma.score.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId: obs.traceId,
          observationId: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 60),
          name: "color",
          value: null,
          stringValue: randomChoice(colors),
          dataType: "CATEGORICAL",
          source: "API",
          comment: `Color classification`,
        },
      });
      score1Count++;

      // Add ANNOTATION version
      if (shouldHaveAnnotation) {
        await prisma.score.create({
          data: {
            id: randomUUID(),
            projectId,
            traceId: obs.traceId,
            observationId: obs.id,
            timestamp: addTimeJitter(obs.timestamp, 120),
            name: "color",
            value: null,
            stringValue: randomChoice(colors),
            dataType: "CATEGORICAL",
            source: "ANNOTATION",
            comment: `Human annotation for color`,
            authorUserId: `annotator-${randomInt(1, 5)}`,
          },
        });
        annotationCount++;
      }
    }

    // Add score2: gender (API)
    if (shouldHaveBoth || (i >= 650 && i < 650 + 350)) {
      await prisma.score.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId: obs.traceId,
          observationId: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 60),
          name: "gender",
          value: null,
          stringValue: randomChoice(genders),
          dataType: "CATEGORICAL",
          source: "API",
          comment: `Gender classification`,
        },
      });
      score2Count++;

      // Add ANNOTATION version
      if (shouldHaveAnnotation) {
        await prisma.score.create({
          data: {
            id: randomUUID(),
            projectId,
            traceId: obs.traceId,
            observationId: obs.id,
            timestamp: addTimeJitter(obs.timestamp, 120),
            name: "gender",
            value: null,
            stringValue: randomChoice(genders),
            dataType: "CATEGORICAL",
            source: "ANNOTATION",
            comment: `Human annotation for gender`,
            authorUserId: `annotator-${randomInt(1, 5)}`,
          },
        });
        annotationCount++;
      }
    }

    if (shouldHaveBoth) {
      bothScoresCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  Added scores to ${i + 1}/1000 observations`);
    }
  }

  console.log(`✅ Categorical scores summary:`);
  console.log(`   - color (score1): ${score1Count} observations`);
  console.log(`   - gender (score2): ${score2Count} observations`);
  console.log(`   - Both scores: ${bothScoresCount} observations`);
  console.log(`   - With ANNOTATION: ${annotationCount} additional scores`);
}

async function seedNumericScoresOnObservations(projectId: string) {
  console.log("\n📊 Seeding Numeric scores on observations...");

  const baseTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const observations: { id: string; traceId: string; timestamp: Date }[] = [];

  // Create traces and observations
  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = addTimeJitter(baseTimestamp, 7 * 24 * 60);

    // Create trace
    await prisma.trace.create({
      data: {
        id: traceId,
        projectId,
        timestamp,
        name: `trace-numeric-${i}`,
        metadata: { test_type: "numeric_scores" },
      },
    });

    // Create observation
    const observationId = randomUUID();
    await prisma.observation.create({
      data: {
        id: observationId,
        traceId,
        projectId,
        type: "GENERATION",
        name: `observation-numeric-${i}`,
        startTime: timestamp,
        endTime: addTimeJitter(timestamp, 5),
        metadata: { test_type: "numeric" },
        model: randomChoice(["gpt-4", "gpt-3.5-turbo", "claude-3-opus"]),
      },
    });

    observations.push({ id: observationId, traceId, timestamp });

    if ((i + 1) % 100 === 0) {
      console.log(`  Created ${i + 1}/1000 observations`);
    }
  }

  console.log(`✅ Created ${observations.length} observations`);

  // Add scores
  console.log("\n📝 Adding Numeric scores...");

  let score1Count = 0;
  let score2Count = 0;
  let bothScoresCount = 0;
  let annotationCount = 0;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const shouldHaveBoth = i < 300;
    const shouldHaveAnnotation = Math.random() < 0.33;

    // Add score1: rizz (EVAL) - range 1-100
    if (shouldHaveBoth || i < 300 + 350) {
      const rizzScore = randomFloat(1, 100, 1);
      await prisma.score.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId: obs.traceId,
          observationId: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 60),
          name: "rizz",
          value: rizzScore,
          stringValue: String(rizzScore),
          dataType: "NUMERIC",
          source: "EVAL",
          comment: `Rizz score evaluation`,
        },
      });
      score1Count++;

      // Add ANNOTATION version (with some correlation but noise)
      if (shouldHaveAnnotation) {
        const annotationRizz = Math.max(
          1,
          Math.min(100, rizzScore + randomFloat(-15, 15, 1)),
        );
        await prisma.score.create({
          data: {
            id: randomUUID(),
            projectId,
            traceId: obs.traceId,
            observationId: obs.id,
            timestamp: addTimeJitter(obs.timestamp, 120),
            name: "rizz",
            value: annotationRizz,
            stringValue: String(annotationRizz),
            dataType: "NUMERIC",
            source: "ANNOTATION",
            comment: `Human annotation for rizz`,
            authorUserId: `annotator-${randomInt(1, 5)}`,
          },
        });
        annotationCount++;
      }
    }

    // Add score2: clarity (EVAL) - range 1-10
    if (shouldHaveBoth || (i >= 650 && i < 650 + 350)) {
      const clarityScore = randomFloat(1, 10, 1);
      await prisma.score.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId: obs.traceId,
          observationId: obs.id,
          timestamp: addTimeJitter(obs.timestamp, 60),
          name: "clarity",
          value: clarityScore,
          stringValue: String(clarityScore),
          dataType: "NUMERIC",
          source: "EVAL",
          comment: `Clarity score evaluation`,
        },
      });
      score2Count++;

      // Add ANNOTATION version (with some correlation but noise)
      if (shouldHaveAnnotation) {
        const annotationClarity = Math.max(
          1,
          Math.min(10, clarityScore + randomFloat(-2, 2, 1)),
        );
        await prisma.score.create({
          data: {
            id: randomUUID(),
            projectId,
            traceId: obs.traceId,
            observationId: obs.id,
            timestamp: addTimeJitter(obs.timestamp, 120),
            name: "clarity",
            value: annotationClarity,
            stringValue: String(annotationClarity),
            dataType: "NUMERIC",
            source: "ANNOTATION",
            comment: `Human annotation for clarity`,
            authorUserId: `annotator-${randomInt(1, 5)}`,
          },
        });
        annotationCount++;
      }
    }

    if (shouldHaveBoth) {
      bothScoresCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  Added scores to ${i + 1}/1000 observations`);
    }
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
      "\nUsage: npx tsx scripts/seed-score-analytics-test-data.ts <projectId>",
    );
    console.log(
      "\nExample: npx tsx scripts/seed-score-analytics-test-data.ts clkv6g5jo0000jz088vzn1ja4",
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

  try {
    // Seed all three types of data
    await seedBooleanScoresOnTraces(projectId);
    await seedCategoricalScoresOnObservations(projectId);
    await seedNumericScoresOnObservations(projectId);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n✅ Successfully seeded all test data!");
    console.log(`⏱️  Total time: ${duration}s`);
    console.log("\n📋 Summary:");
    console.log("   - 1000 traces with Boolean scores (tool_use, memory_use)");
    console.log(
      "   - 1000 observations with Categorical scores (color, gender)",
    );
    console.log("   - 1000 observations with Numeric scores (rizz, clarity)");
    console.log("   - Each includes ~1/3 with ANNOTATION source variants");
    console.log("\n🎉 Ready to test score analytics!");
    console.log(`\n🔗 Visit: /project/${projectId}/scores/analytics`);
  } catch (error) {
    console.error("\n❌ Error seeding data:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
