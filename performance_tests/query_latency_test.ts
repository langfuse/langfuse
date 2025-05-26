import axios from 'axios';
import { randomUUID } from 'crypto'; // For generating unique values for params if needed

interface CLIFlags {
  apiHost: string;
  projectId: string;
  fromTimestamp: string;
  toTimestamp: string;
  repetitions: number;
  targetDb: 'greptimedb' | 'clickhouse';
}

interface QueryDefinition {
  id: string; // e.g., "query1_complex_trace"
  description: string;
  // Parameters required by this query, to be sent in the POST body
  // The actual SQL is executed by the API endpoint
  getParameters: (projectId: string, fromTime: string, toTime: string) => Record<string, any>;
}

function parseArgs(): CLIFlags {
  const args = process.argv.slice(2);
  const flags: Partial<CLIFlags> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--host':
      case '-h':
        flags.apiHost = args[++i];
        break;
      case '--projectId':
      case '-p':
        flags.projectId = args[++i];
        break;
      case '--from':
      case '-f':
        flags.fromTimestamp = args[++i];
        break;
      case '--to':
      case '-t':
        flags.toTimestamp = args[++i];
        break;
      case '--repetitions':
      case '-r':
        flags.repetitions = parseInt(args[++i], 10);
        break;
      case '--db':
      case '-d':
        const dbType = args[++i];
        if (dbType === 'greptimedb' || dbType === 'clickhouse') {
          flags.targetDb = dbType;
        } else {
          console.warn(`Invalid --db value: ${dbType}. Defaulting to 'greptimedb'.`);
        }
        break;
    }
  }
  
  // Environment variable fallbacks
  if (!flags.apiHost && process.env.LANGFUSE_HOST) flags.apiHost = process.env.LANGFUSE_HOST; // Reuse LANGFUSE_HOST for API host
  if (!flags.projectId && process.env.PROJECT_ID) flags.projectId = process.env.PROJECT_ID;
  if (!flags.fromTimestamp && process.env.FROM_TIMESTAMP) flags.fromTimestamp = process.env.FROM_TIMESTAMP;
  if (!flags.toTimestamp && process.env.TO_TIMESTAMP) flags.toTimestamp = process.env.TO_TIMESTAMP;
  if (!flags.repetitions && process.env.REPETITIONS) flags.repetitions = parseInt(process.env.REPETITIONS, 10);
  if (!flags.targetDb && process.env.TARGET_DB) {
      const dbEnv = process.env.TARGET_DB.toLowerCase();
      if (dbEnv === 'greptimedb' || dbEnv === 'clickhouse') flags.targetDb = dbEnv as 'greptimedb' | 'clickhouse';
  }


  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    apiHost: flags.apiHost || 'http://localhost:3000',
    projectId: flags.projectId || `proj-${randomUUID().substring(0,8)}`, // Default to a random project if not set
    fromTimestamp: flags.fromTimestamp || oneDayAgo.toISOString(),
    toTimestamp: flags.toTimestamp || now.toISOString(),
    repetitions: flags.repetitions || 10,
    targetDb: flags.targetDb || 'greptimedb',
  };
}

// Define the conceptual queries. The actual SQL is on the server-side debug endpoint.
// This script only needs to know the 'queryId' and what parameters to send.
const QUERIES_TO_TEST: QueryDefinition[] = [
  {
    id: 'query1_complex_trace', // Matches queryId in the API
    description: 'Complex Trace Query (daily trace count, observation sum, cost sum)',
    getParameters: (projectId, fromTime, toTime) => ({
      projectId,
      fromTimestamp: fromTime,
      toTimestamp: toTime,
      tagsFilterValue: 'tag-a', // Example default parameter
      metadataJsonPath: '$.customer', // Example default parameter
      metadataValue: 'important', // Example default parameter
    }),
  },
  {
    id: 'query2_observation_performance',
    description: 'Observation Performance Analysis (p95 latency, p95 TTFT, avg tokens)',
    getParameters: (projectId, fromTime, toTime) => ({
      projectId,
      fromTimestamp: fromTime,
      toTimestamp: toTime,
      // No extra specific params for this query in the API definition
    }),
  },
  {
    id: 'query3_score_analysis', // This ID will be combined with joinTraces in the API call logic
    description: 'Score Analysis (avg score value, score count)',
    getParameters: (projectId, fromTime, toTime) => ({
      projectId,
      fromTimestamp: fromTime,
      toTimestamp: toTime,
      scoreSource: 'human', // Example default parameter
      joinTraces: Math.random() > 0.5, // Randomly test both versions of query 3
    }),
  },
];

function calculateLatencyStats(latencies: number[]): { min: number; max: number; avg: number; p50: number; p90: number; p95: number } {
  if (latencies.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0 };
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const avg = sum / latencies.length;
  const p = (percentile: number) => {
    const index = Math.floor((percentile / 100) * (latencies.length -1)); // -1 for 0-based index
    return latencies[index];
  };
  return {
    min: latencies[0],
    max: latencies[latencies.length - 1],
    avg: parseFloat(avg.toFixed(2)),
    p50: parseFloat(p(50).toFixed(2)),
    p90: parseFloat(p(90).toFixed(2)),
    p95: parseFloat(p(95).toFixed(2)),
  };
}

async function runQueryRepetition(
  apiHost: string,
  queryId: string,
  params: Record<string, any>,
  targetDb: string
): Promise<number> {
  const endpoint = `${apiHost}/api/debug/greptimedb-query`; // Script always calls this endpoint
  const startTime = Date.now();
  try {
    // If the debug endpoint is enhanced to select DB, pass targetDb
    // For now, this script assumes the endpoint is already configured for the targetDb
    // or the targetDb param is implicitly handled by the endpoint if it supports it.
    const payload = { queryId, ...params, targetDatabase: targetDb }; // Example of passing targetDb
    
    await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000, // 60 seconds timeout for potentially long queries
    });
    const endTime = Date.now();
    return endTime - startTime;
  } catch (error: any) {
    const endTime = Date.now();
    console.error(
      `Error during query ${queryId} (target: ${targetDb}): ${error.isAxiosError ? error.message : error}`,
      error.response ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}` : ''
    );
    // Return a high latency or throw to mark as failed
    return endTime - startTime; // Still return latency to see error response time
    // Or throw new Error(`Failed query repetition: ${queryId}`);
  }
}

async function main() {
  const flags = parseArgs();
  console.log('Starting query latency test with flags:', flags);
  console.log(`Targeting database: ${flags.targetDb} (via endpoint ${flags.apiHost}/api/debug/greptimedb-query)`);

  for (const queryDef of QUERIES_TO_TEST) {
    console.log(`\n--- Testing Query: ${queryDef.description} (ID: ${queryDef.id}) ---`);
    const latencies: number[] = [];
    let failedRuns = 0;

    for (let i = 0; i < flags.repetitions; i++) {
      process.stdout.write(`Repetition ${i + 1}/${flags.repetitions}... `);
      try {
        const params = queryDef.getParameters(flags.projectId, flags.fromTimestamp, flags.toTimestamp);
        // Special handling for query3_score_analysis to use its specific queryId from API
        const currentQueryId = queryDef.id === 'query3_score_analysis' 
            ? 'query3_score_analysis' // The API handler uses joinTraces from params
            : queryDef.id;

        const latency = await runQueryRepetition(flags.apiHost, currentQueryId, params, flags.targetDb);
        latencies.push(latency);
        process.stdout.write(`Latency: ${latency}ms\n`);
      } catch (e) {
        failedRuns++;
        process.stdout.write(`Failed!\n`);
        // Error already logged in runQueryRepetition
      }
      // Small delay between requests if needed, e.g. await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (latencies.length > 0) {
      const stats = calculateLatencyStats(latencies);
      console.log(`\nStatistics for Query "${queryDef.description}" over ${latencies.length} successful runs (out of ${flags.repetitions}):`);
      console.log(`  Min Latency: ${stats.min} ms`);
      console.log(`  Max Latency: ${stats.max} ms`);
      console.log(`  Avg Latency: ${stats.avg} ms`);
      console.log(`  p50 Latency: ${stats.p50} ms`);
      console.log(`  p90 Latency: ${stats.p90} ms`);
      console.log(`  p95 Latency: ${stats.p95} ms`);
    } else {
      console.log(`\nNo successful runs for Query "${queryDef.description}".`);
    }
    if (failedRuns > 0) {
      console.log(`  ${failedRuns} repetitions failed.`);
    }
  }
  console.log('\n--- Query latency test finished ---');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Query latency test suite failed catastrophically:', error);
    process.exit(1);
  });
}
