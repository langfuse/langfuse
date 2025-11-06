#!/usr/bin/env node
/**
 * Script to seed demo data for Score Analytics Launch Week video
 *
 * Usage (from repo root):
 *   pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-demo.ts <projectId>
 *
 * Example:
 *   pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-demo.ts cmh0hfzr5000505bukzx6d0n8
 *
 * Creates:
 * - Boolean scores: has_tool_use, has_hallucination (strong negative correlation -0.75)
 * - Categorical scores: sentiment (EVAL/ANNOTATION/API), topic (API)
 * - Numeric scores: helpfulness_gpt4, helpfulness_gemini (~0.87 correlation), helpfulness_gpt2 (~0.05 correlation), quality (API/ANNOTATION)
 *
 * Data spans past 1 year with 40% concentration in last 7 days
 */

import {
  createTrace,
  createObservation,
  createTraceScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
} from "../src/server";
import { PrismaClient } from "../src/index";
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
function randomFloat(min: number, max: number, decimals: number = 1): number {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

// Helper to generate timestamp distributed across 1 year
// 40% in last 7 days, 60% distributed across previous 358 days
// With weekly patterns (higher Mon-Fri)
function generateRealisticTimestamp(): number {
  const now = Date.now();
  const rand = Math.random();

  let daysAgo: number;
  if (rand < 0.4) {
    // 40% in last 7 days
    daysAgo = Math.random() * 7;
  } else if (rand < 0.65) {
    // 25% in 8-30 days
    daysAgo = 7 + Math.random() * 23;
  } else if (rand < 0.85) {
    // 20% in 31-90 days
    daysAgo = 30 + Math.random() * 60;
  } else {
    // 15% in 91-365 days
    daysAgo = 90 + Math.random() * 275;
  }

  const timestamp = now - daysAgo * 24 * 60 * 60 * 1000;

  // Apply weekly pattern (lower on weekends)
  const date = new Date(timestamp);
  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday

  // Adjust probability to reduce weekend data
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // 30% chance to skip weekend data
    if (Math.random() < 0.3) {
      // Shift to Monday
      return timestamp + (8 - dayOfWeek) * 24 * 60 * 60 * 1000;
    }
  }

  // Add some random minutes/hours within the day
  const hourJitter = Math.random() * 24 * 60 * 60 * 1000;
  return Math.floor(timestamp + hourJitter);
}

async function seedBooleanScores(projectId: string) {
  console.log("\n📊 Seeding Boolean scores on traces...");

  const traceRecords: Array<{ id: string; timestamp: number }> = [];
  const scoreRecords: ReturnType<typeof createTraceScore>[] = [];

  // Create 1000 trace records
  console.log("  Creating trace records...");
  const traces: ReturnType<typeof createTrace>[] = [];

  for (let i = 0; i < 1000; i++) {
    const traceId = randomUUID();
    const timestamp = generateRealisticTimestamp();

    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      timestamp,
      name: `customer-support-${i}`,
      metadata: {
        demo_type: "score_analytics",
        conversation_id: `conv-${randomInt(1, 100)}`,
      },
      user_id: `user-${randomInt(1, 50)}`,
      tags: ["demo", "support", randomChoice(["tier-1", "tier-2", "tier-3"])],
    });

    traces.push(trace);
    traceRecords.push({ id: traceId, timestamp });

    if ((i + 1) % 200 === 0) {
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

  // Add Boolean scores with strong negative correlation (-0.75)
  console.log("\n📝 Adding Boolean scores with negative correlation...");

  let toolUseCount = 0;
  let hallucinationCount = 0;
  let bothScoresCount = 0;

  for (let i = 0; i < traceRecords.length; i++) {
    const trace = traceRecords[i];
    const shouldHaveBoth = i < 600; // First 600 have both scores (matched pairs)

    let toolUse: boolean | undefined;
    let hallucination: boolean | undefined;

    if (shouldHaveBoth) {
      // Generate correlated boolean values with -0.75 correlation
      const rand = Math.random();
      if (rand < 0.63) {
        // 63%: tool_use=True, hallucination=False (main anti-diagonal)
        toolUse = true;
        hallucination = false;
      } else if (rand < 0.95) {
        // 32%: tool_use=False, hallucination=True (main anti-diagonal)
        toolUse = false;
        hallucination = true;
      } else if (rand < 0.975) {
        // 2.5%: tool_use=True, hallucination=True (tool didn't prevent error)
        toolUse = true;
        hallucination = true;
      } else {
        // 2.5%: tool_use=False, hallucination=False (lucky escape)
        toolUse = false;
        hallucination = false;
      }
      bothScoresCount++;
    }

    // Add has_tool_use score
    if (shouldHaveBoth || i < 600 + 200) {
      // 600 with both + 200 with only tool_use = 800 total
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: trace.id,
        timestamp: trace.timestamp + randomInt(1000, 60000), // 1-60 seconds after trace
        name: "has_tool_use",
        value: null,
        string_value: (toolUse ?? randomBoolean()) ? "True" : "False",
        data_type: "BOOLEAN",
        source: "EVAL",
        comment: "Detected tool usage (search, database query, API call)",
      });
      scoreRecords.push(score);
      toolUseCount++;
    }

    // Add has_hallucination score
    if (shouldHaveBoth || (i >= 800 && i < 800 + 200)) {
      // 600 with both + 200 with only hallucination = 800 total
      const score = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: trace.id,
        timestamp: trace.timestamp + randomInt(1000, 60000),
        name: "has_hallucination",
        value: null,
        string_value: (hallucination ?? randomBoolean()) ? "True" : "False",
        data_type: "BOOLEAN",
        source: "EVAL",
        comment: "Detected factual inconsistencies or hallucinations",
      });
      scoreRecords.push(score);
      hallucinationCount++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`    Created score records for ${i + 1}/1000 traces`);
    }
  }

  // Insert scores into ClickHouse in batches
  console.log("  Inserting Boolean scores into ClickHouse...");
  for (let i = 0; i < scoreRecords.length; i += batchSize) {
    const batch = scoreRecords.slice(i, i + batchSize);
    await createScoresCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, scoreRecords.length)}/${scoreRecords.length} scores`,
    );
  }

  console.log(`✅ Boolean scores summary:`);
  console.log(`   - has_tool_use: ${toolUseCount} traces`);
  console.log(`   - has_hallucination: ${hallucinationCount} traces`);
  console.log(`   - Matched pairs: ${bothScoresCount} traces`);
  console.log(`   - Expected correlation: ~-0.75 (strong negative)`);
}

async function seedCategoricalScores(projectId: string) {
  console.log("\n📊 Seeding Categorical scores on observations...");

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

  // Create 700 observations for sentiment scores
  for (let i = 0; i < 700; i++) {
    const traceId = randomUUID();
    const timestamp = generateRealisticTimestamp();

    // Create trace
    const trace = createTrace({
      id: traceId,
      project_id: projectId,
      timestamp,
      name: `support-interaction-${i}`,
      metadata: {
        demo_type: "score_analytics",
        channel: randomChoice(["email", "chat", "phone"]),
      },
      user_id: `user-${randomInt(1, 50)}`,
      tags: ["demo", "categorical", randomChoice(["urgent", "normal", "low"])],
    });
    traces.push(trace);

    // Create observation (the actual response)
    const observationId = randomUUID();
    const startTime = timestamp + 1000;
    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: `support-response-${i}`,
      start_time: startTime,
      end_time: startTime + randomInt(2000, 10000),
      provided_model_name: randomChoice([
        "gpt-4-turbo",
        "gpt-4",
        "claude-3-opus",
      ]),
      metadata: { demo_type: "score_analytics" },
    });
    observations.push(observation);
    observationRecords.push({
      id: observationId,
      traceId,
      timestamp: startTime,
    });

    if ((i + 1) % 100 === 0) {
      console.log(`    Created ${i + 1}/700 trace and observation records`);
    }
  }

  // Insert traces and observations into ClickHouse
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
      `    Inserted ${Math.min(i + batchSize, observations.length)}/700 observations`,
    );
  }

  console.log(`✅ Created ${observations.length} observations`);

  // Add categorical scores
  console.log("\n📝 Adding Categorical scores...");

  const sentimentValues = ["positive", "neutral", "negative"];
  const sentimentWeights = [0.4, 0.35, 0.25]; // 40% positive, 35% neutral, 25% negative

  function weightedSentiment(): string {
    const rand = Math.random();
    if (rand < sentimentWeights[0]) return sentimentValues[0];
    if (rand < sentimentWeights[0] + sentimentWeights[1])
      return sentimentValues[1];
    return sentimentValues[2];
  }

  let sentimentEvalCount = 0;
  let sentimentAnnotationCount = 0;
  let sentimentApiCount = 0;
  let sentimentMatchedCount = 0;

  for (let i = 0; i < observationRecords.length; i++) {
    const obs = observationRecords[i];

    // All 700 get EVAL sentiment
    const evalSentiment = weightedSentiment();
    const evalScore = createTraceScore({
      id: randomUUID(),
      project_id: projectId,
      trace_id: obs.traceId,
      observation_id: obs.id,
      timestamp: obs.timestamp + randomInt(5000, 120000), // 5s-2min after
      name: "sentiment",
      value: null,
      string_value: evalSentiment,
      data_type: "CATEGORICAL",
      source: "EVAL",
      comment: "AI-evaluated customer sentiment",
    });
    scoreRecords.push(evalScore);
    sentimentEvalCount++;

    // First 250 also get ANNOTATION (with 75% agreement)
    if (i < 250) {
      let annotationSentiment: string;
      if (Math.random() < 0.75) {
        // 75% agree
        annotationSentiment = evalSentiment;
      } else {
        // 25% disagree (bias toward neutral confusion)
        if (evalSentiment === "positive") {
          annotationSentiment = "neutral";
        } else if (evalSentiment === "negative") {
          annotationSentiment = "neutral";
        } else {
          annotationSentiment = randomChoice(["positive", "negative"]);
        }
      }

      const annotationScore = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: obs.timestamp + randomInt(60000, 300000), // 1-5min after (human is slower)
        name: "sentiment",
        value: null,
        string_value: annotationSentiment,
        data_type: "CATEGORICAL",
        source: "ANNOTATION",
        comment: "Human-annotated customer sentiment",
      });
      scoreRecords.push(annotationScore);
      sentimentAnnotationCount++;
      sentimentMatchedCount++;
    }

    // Last 300 get API sentiment (separate set, no overlap with ANNOTATION)
    if (i >= 400) {
      const apiScore = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: obs.timestamp + randomInt(1000, 5000), // Very quick (API)
        name: "sentiment",
        value: null,
        string_value: weightedSentiment(),
        data_type: "CATEGORICAL",
        source: "API",
        comment: "Sentiment from external API",
      });
      scoreRecords.push(apiScore);
      sentimentApiCount++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`    Created sentiment scores for ${i + 1}/700 observations`);
    }
  }

  // Add topic scores (extra categorical for dropdown variety)
  console.log("  Adding topic scores (extra variety)...");
  const topicValues = ["billing", "technical", "general", "feedback"];
  let topicCount = 0;

  for (let i = 0; i < 400; i++) {
    const obs = observationRecords[i];
    const topicScore = createTraceScore({
      id: randomUUID(),
      project_id: projectId,
      trace_id: obs.traceId,
      observation_id: obs.id,
      timestamp: obs.timestamp + randomInt(1000, 3000),
      name: "topic",
      value: null,
      string_value: randomChoice(topicValues),
      data_type: "CATEGORICAL",
      source: "API",
      comment: "Conversation topic classification",
    });
    scoreRecords.push(topicScore);
    topicCount++;
  }

  // Insert scores into ClickHouse
  console.log("  Inserting Categorical scores into ClickHouse...");
  for (let i = 0; i < scoreRecords.length; i += batchSize) {
    const batch = scoreRecords.slice(i, i + batchSize);
    await createScoresCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, scoreRecords.length)}/${scoreRecords.length} scores`,
    );
  }

  console.log(`✅ Categorical scores summary:`);
  console.log(`   - sentiment-EVAL: ${sentimentEvalCount} observations`);
  console.log(
    `   - sentiment-ANNOTATION: ${sentimentAnnotationCount} observations`,
  );
  console.log(`   - sentiment-API: ${sentimentApiCount} observations`);
  console.log(
    `   - sentiment matched (EVAL↔ANNOTATION): ${sentimentMatchedCount} observations`,
  );
  console.log(`   - topic-API: ${topicCount} observations`);
  console.log(
    `   - Expected Cohen's Kappa: ~0.65-0.75 (substantial agreement)`,
  );

  return observationRecords;
}

async function seedNumericScores(
  projectId: string,
  existingObservations: Array<{
    id: string;
    traceId: string;
    timestamp: number;
  }>,
) {
  console.log("\n📊 Seeding Numeric scores on observations...");

  const scoreRecords: ReturnType<typeof createTraceScore>[] = [];

  // We'll use the first 700 existing observations from categorical
  const obsForNumeric = existingObservations.slice(0, 700);

  console.log("  Adding helpfulness scores from three LLM judges...");

  let gpt4Count = 0;
  let geminiCount = 0;
  let gpt2Count = 0;
  let gpt4GeminiMatched = 0;
  let gpt4Gpt2Matched = 0;

  for (let i = 0; i < obsForNumeric.length; i++) {
    const obs = obsForNumeric[i];

    // All 700 get GPT-4 scores
    const gpt4Score = randomFloat(1, 10, 1);
    const gpt4ScoreRecord = createTraceScore({
      id: randomUUID(),
      project_id: projectId,
      trace_id: obs.traceId,
      observation_id: obs.id,
      timestamp: obs.timestamp + randomInt(10000, 60000), // 10s-1min after
      name: "helpfulness_gpt4",
      value: gpt4Score,
      string_value: String(gpt4Score),
      data_type: "NUMERIC",
      source: "EVAL",
      comment: "Helpfulness rated by GPT-4 as judge",
    });
    scoreRecords.push(gpt4ScoreRecord);
    gpt4Count++;

    // First 350 also get Gemini scores (with high correlation ~0.87)
    if (i < 350) {
      const geminiBase = gpt4Score + randomFloat(-0.8, 0.8, 1);
      const geminiScore = Math.max(1, Math.min(10, geminiBase));
      const geminiScoreRecord = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: obs.timestamp + randomInt(10000, 60000),
        name: "helpfulness_gemini",
        value: geminiScore,
        string_value: String(geminiScore),
        data_type: "NUMERIC",
        source: "EVAL",
        comment: "Helpfulness rated by Gemini 2.0 Flash as judge",
      });
      scoreRecords.push(geminiScoreRecord);
      geminiCount++;
      gpt4GeminiMatched++;
    }

    // Next 350 (350-700) get GPT-2 scores (with NO correlation ~0.05)
    if (i >= 350 && i < 700) {
      const gpt2Score = randomFloat(1, 10, 1); // Completely random
      const gpt2ScoreRecord = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: obs.timestamp + randomInt(10000, 60000),
        name: "helpfulness_gpt2",
        value: gpt2Score,
        string_value: String(gpt2Score),
        data_type: "NUMERIC",
        source: "EVAL",
        comment: "Helpfulness rated by GPT-2 as judge (unreliable)",
      });
      scoreRecords.push(gpt2ScoreRecord);
      gpt2Count++;
      gpt4Gpt2Matched++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(
        `    Created helpfulness scores for ${i + 1}/700 observations`,
      );
    }
  }

  // Add quality scores (extra numeric for dropdown variety)
  console.log("  Adding quality scores (extra variety)...");
  let qualityApiCount = 0;
  let qualityAnnotationCount = 0;

  for (let i = 0; i < 300; i++) {
    const obs = obsForNumeric[i];

    // API quality score
    const apiQuality = randomFloat(0, 100, 1);
    const apiScore = createTraceScore({
      id: randomUUID(),
      project_id: projectId,
      trace_id: obs.traceId,
      observation_id: obs.id,
      timestamp: obs.timestamp + randomInt(1000, 5000),
      name: "quality",
      value: apiQuality,
      string_value: String(apiQuality),
      data_type: "NUMERIC",
      source: "API",
      comment: "Quality score from external API",
    });
    scoreRecords.push(apiScore);
    qualityApiCount++;

    // First 100 also get ANNOTATION quality
    if (i < 100) {
      const annotationQuality = randomFloat(0, 100, 1);
      const annotationScore = createTraceScore({
        id: randomUUID(),
        project_id: projectId,
        trace_id: obs.traceId,
        observation_id: obs.id,
        timestamp: obs.timestamp + randomInt(60000, 300000),
        name: "quality",
        value: annotationQuality,
        string_value: String(annotationQuality),
        data_type: "NUMERIC",
        source: "ANNOTATION",
        comment: "Human-annotated quality score",
      });
      scoreRecords.push(annotationScore);
      qualityAnnotationCount++;
    }
  }

  // Insert scores into ClickHouse
  console.log("  Inserting Numeric scores into ClickHouse...");
  const batchSize = 500;
  for (let i = 0; i < scoreRecords.length; i += batchSize) {
    const batch = scoreRecords.slice(i, i + batchSize);
    await createScoresCh(batch);
    console.log(
      `    Inserted ${Math.min(i + batchSize, scoreRecords.length)}/${scoreRecords.length} scores`,
    );
  }

  console.log(`✅ Numeric scores summary:`);
  console.log(`   - helpfulness_gpt4: ${gpt4Count} observations`);
  console.log(`   - helpfulness_gemini: ${geminiCount} observations`);
  console.log(`   - helpfulness_gpt2: ${gpt2Count} observations`);
  console.log(
    `   - gpt4↔gemini matched: ${gpt4GeminiMatched} (expected correlation ~0.87)`,
  );
  console.log(
    `   - gpt4↔gpt2 matched: ${gpt4Gpt2Matched} (expected correlation ~0.05)`,
  );
  console.log(`   - quality-API: ${qualityApiCount} observations`);
  console.log(
    `   - quality-ANNOTATION: ${qualityAnnotationCount} observations`,
  );
}

async function main() {
  const projectId = process.argv[2];

  if (!projectId) {
    console.error("❌ Error: Project ID is required");
    console.log(
      "\nUsage: pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-demo.ts <projectId>",
    );
    console.log(
      "\nExample: pnpm dotenv -e .env -- tsx packages/shared/scripts/seed-score-analytics-demo.ts cmh0hfzr5000505bukzx6d0n8",
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
    `\n🚀 Seeding Score Analytics demo data for project: ${project.name} (${projectId})`,
  );
  console.log("⏱️  This will take a few minutes...\n");
  console.log(
    "📅 Data will span past 1 year with 40% concentration in last 7 days\n",
  );

  const startTime = Date.now();

  // Seed all score types
  await seedBooleanScores(projectId);
  const observationRecords = await seedCategoricalScores(projectId);
  await seedNumericScores(projectId, observationRecords);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n✅ Successfully seeded all demo data!");
  console.log(`⏱️  Total time: ${duration}s`);
  console.log("\n📋 Summary:");
  console.log("   Boolean scores (on traces):");
  console.log("     - has_tool_use, has_hallucination (correlation: -0.75)");
  console.log("\n   Categorical scores (on observations):");
  console.log("     - sentiment (EVAL, ANNOTATION, API)");
  console.log("     - topic (API)");
  console.log("\n   Numeric scores (on observations):");
  console.log("     - helpfulness_gpt4 vs gemini (correlation: ~0.87)");
  console.log("     - helpfulness_gpt4 vs gpt2 (correlation: ~0.05)");
  console.log("     - quality (API, ANNOTATION)");
  console.log("\n🎬 Ready for Launch Week demo recording!");
  console.log(`\n🔗 Visit: /project/${projectId}/scores/analytics`);
  console.log("   Suggested time range: Past 7 days (has 40% of data)");
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
