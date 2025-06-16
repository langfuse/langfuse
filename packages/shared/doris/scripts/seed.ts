import { prisma } from "../../src/db";
import { redis } from "../../src/server";
import { createDatasets } from "../../prisma/seed";
import mysql from 'mysql2/promise';

// Random number generator with skew
function randn_bm(min: number, max: number, skew: number) {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0)
    num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
  else {
    num = Math.pow(num, skew); // Skew
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
  }
  return num;
}

// Parse DORIS_URL to extract connection details
function parseDorisUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const match = url.match(/^https?:\/\/([^:]+):([0-9]+)/);
    if (match) {
      return { host: match[1], port: parseInt(match[2]) };
    }
    const hostMatch = url.match(/^https?:\/\/([^:/]+)/);
    if (hostMatch) {
      return { host: hostMatch[1], port: 9030 };
    }
  } else if (url.includes(':')) {
    const [host, port] = url.split(':');
    return { host, port: parseInt(port) };
  }
  return { host: url, port: 9030 };
}

// Create Doris connection
async function createDorisConnection() {
  const dorisUrl = process.env.DORIS_URL;
  const dorisUser = process.env.DORIS_USER || 'root';
  const dorisPassword = process.env.DORIS_PASSWORD || '';
  const dorisDb = process.env.DORIS_DB || 'langfuse';

  if (!dorisUrl) {
    throw new Error('DORIS_URL environment variable is required');
  }

  const { host, port } = parseDorisUrl(dorisUrl);

  const connection = await mysql.createConnection({
    host,
    port,
    user: dorisUser,
    password: dorisPassword,
    database: dorisDb,
    multipleStatements: true
  });

  return connection;
}

// Generate random sample data
function generateSampleData(
  projectIds: string[],
  opts: { numberOfDays: number; totalObservations: number }
) {
  const projectData = projectIds.map((projectId) => {
    const observationsPerProject = Math.ceil(
      randn_bm(0, opts.totalObservations, 2)
    );
    const tracesPerProject = Math.floor(observationsPerProject / 6);
    const scoresPerProject = Math.floor(tracesPerProject * 2);
    
    return {
      projectId,
      observationsPerProject,
      tracesPerProject,
      scoresPerProject,
    };
  });

  return projectData;
}

// Generate traces data
function generateTraces(projectId: string, count: number, numberOfDays: number) {
  const traces = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now.getTime() - Math.random() * numberOfDays * 24 * 60 * 60 * 1000);
    const timestampDate = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
    
    traces.push({
      project_id: projectId,
      timestamp_date: timestampDate.toISOString().split('T')[0],
      timestamp: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      id: `trace_${i}_${projectId}`,
      name: `Trace ${i}`,
      user_id: `user_${Math.floor(Math.random() * 100)}`,
      metadata: `{"prototype": "test", "iteration": ${i}}`,
      release: `v${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
      version: `${Math.floor(Math.random() * 100)}`,
      public: Math.random() > 0.2 ? 1 : 0,
      bookmarked: Math.random() > 0.8 ? 1 : 0,
      tags: '["tag1", "tag2"]',
      input: JSON.stringify({ prompt: `Test input ${i}` }),
      output: JSON.stringify({ response: `Test output ${i}` }),
      session_id: Math.random() > 0.8 ? null : `session_${Math.floor(Math.random() * 1000)}`,
      created_at: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      updated_at: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      event_ts: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      is_deleted: 0
    });
  }
  
  return traces;
}

// Generate observations data
function generateObservations(projectId: string, count: number, tracesCount: number, numberOfDays: number) {
  const observations = [];
  const now = new Date();
  const types = ['GENERATION', 'SPAN', 'EVENT'];
  
  for (let i = 0; i < count; i++) {
    const startTime = new Date(now.getTime() - Math.random() * numberOfDays * 24 * 60 * 60 * 1000);
    const startTimeDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
    const endTime = new Date(startTime.getTime() + Math.random() * 3600 * 1000);
    const type = types[Math.floor(Math.random() * types.length)];
    
    observations.push({
      project_id: projectId,
      type,
      start_time_date: startTimeDate.toISOString().split('T')[0],
      id: `obs_${i}_${projectId}`,
      trace_id: `trace_${Math.floor(Math.random() * tracesCount)}_${projectId}`,
      parent_observation_id: Math.random() > 0.7 ? null : `obs_${Math.floor(Math.random() * i)}_${projectId}`,
      start_time: startTime.toISOString().replace('T', ' ').replace('Z', ''),
      end_time: endTime.toISOString().replace('T', ' ').replace('Z', ''),
      name: `Observation ${i}`,
      metadata: `{"type": "${type}", "index": ${i}}`,
      level: Math.random() > 0.9 ? 'ERROR' : 'DEFAULT',
      status_message: 'success',
      version: `v${Math.floor(Math.random() * 10)}`,
      input: JSON.stringify({ query: `Test query ${i}` }),
      output: JSON.stringify({ result: `Test result ${i}` }),
      provided_model_name: Math.random() > 0.5 ? 'gpt-4' : 'claude-3-haiku',
      internal_model_id: `model_${Math.floor(Math.random() * 10)}`,
      model_parameters: type === 'GENERATION' ? '{"temperature": 0.7, "max_tokens": 150}' : '{}',
      provided_usage_details: type === 'GENERATION' ? `{"input": ${Math.floor(Math.random() * 1000)}, "output": ${Math.floor(Math.random() * 1000)}}` : '{}',
      usage_details: type === 'GENERATION' ? `{"input": ${Math.floor(Math.random() * 1000)}, "output": ${Math.floor(Math.random() * 1000)}}` : '{}',
      provided_cost_details: type === 'GENERATION' ? `{"input": ${(Math.random() * 10).toFixed(6)}, "output": ${(Math.random() * 10).toFixed(6)}}` : '{}',
      cost_details: type === 'GENERATION' ? `{"input": ${(Math.random() * 10).toFixed(6)}, "output": ${(Math.random() * 10).toFixed(6)}}` : '{}',
      total_cost: type === 'GENERATION' ? (Math.random() * 20).toFixed(6) : null,
      completion_start_time: new Date(startTime.getTime() + Math.random() * 1000).toISOString().replace('T', ' ').replace('Z', ''),
      prompt_id: `prompt_${Math.floor(Math.random() * 10)}`,
      prompt_name: `Prompt ${Math.floor(Math.random() * 10)}`,
      prompt_version: Math.floor(Math.random() * 5) + 1,
      created_at: startTime.toISOString().replace('T', ' ').replace('Z', ''),
      updated_at: startTime.toISOString().replace('T', ' ').replace('Z', ''),
      event_ts: startTime.toISOString().replace('T', ' ').replace('Z', ''),
      is_deleted: 0
    });
  }
  
  return observations;
}

// Generate scores data
function generateScores(projectId: string, count: number, tracesCount: number, observationsCount: number, numberOfDays: number) {
  const scores = [];
  const now = new Date();
  const scoreNames = ['accuracy', 'relevance', 'fluency', 'coherence', 'completeness'];
  const dataTypes = ['NUMERIC', 'CATEGORICAL', 'BOOLEAN'];
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now.getTime() - Math.random() * numberOfDays * 24 * 60 * 60 * 1000);
    const dataType = dataTypes[Math.floor(Math.random() * dataTypes.length)];
    let value: number;
    let stringValue: string | null = null;
    
    if (dataType === 'NUMERIC') {
      value = Math.random() * 100;
    } else if (dataType === 'BOOLEAN') {
      value = Math.random() > 0.5 ? 1 : 0;
      stringValue = value === 1 ? 'true' : 'false';
    } else {
      value = Math.floor(Math.random() * 5) + 1;
      stringValue = ['poor', 'fair', 'good', 'very good', 'excellent'][value - 1];
    }
    
    scores.push({
      project_id: projectId,
      timestamp_date: timestamp.toISOString().split('T')[0],
      timestamp: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      id: `score_${i}_${projectId}`,
      trace_id: `trace_${Math.floor(Math.random() * tracesCount)}_${projectId}`,
      session_id: Math.random() > 0.8 ? `session_${Math.floor(Math.random() * 100)}` : null,
      observation_id: Math.random() > 0.7 ? `obs_${Math.floor(Math.random() * observationsCount)}_${projectId}` : null,
      name: scoreNames[Math.floor(Math.random() * scoreNames.length)],
      value,
      source: 'API',
      comment: `Generated score ${i}`,
      metadata: `{"generated": true, "index": ${i}}`,
      author_user_id: `user_${Math.floor(Math.random() * 100)}`,
      config_id: `config_${Math.floor(Math.random() * 10)}`,
      data_type: dataType,
      string_value: stringValue,
      created_at: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      updated_at: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      event_ts: timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      is_deleted: 0
    });
  }
  
  return scores;
}

// Insert data in batches
async function insertDataInBatches(connection: mysql.Connection, tableName: string, data: any[], batchSize = 100) {
  console.log(`Inserting ${data.length} records into ${tableName}...`);
  
  if (data.length === 0) return;
  
  const columns = Object.keys(data[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const values = batch.map(row => columns.map(col => row[col]));
    
    try {
      for (const value of values) {
        await connection.execute(query, value);
      }
      console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)}`);
    } catch (error) {
      console.error(`Error inserting batch into ${tableName}:`, error);
      throw error;
    }
  }
  
  console.log(`✓ Successfully inserted ${data.length} records into ${tableName}`);
}

async function main() {
  let connection: mysql.Connection | null = null;
  
  try {
    console.log("Starting Doris seed process...");
    
    // Example project IDs - you can modify these
    const projectIds = ["7a88fb47-b4e2-43b8-a06c-a5ce950dc53a"];
    
    // Check if additional project exists in Postgres
    const additionalProject = await prisma.project.findFirst({
      where: { id: "239ad00f-562f-411d-af14-831c75ddd875" },
    });
    
    if (additionalProject) {
      projectIds.push("239ad00f-562f-411d-af14-831c75ddd875");
    }

    // Generate sample data configuration
    const opts = {
      numberOfDays: 3,
      totalObservations: 1000, // Smaller than ClickHouse for testing
    };

    console.log(`Generating data for ${projectIds.length} projects over ${opts.numberOfDays} days...`);

    // Create Doris connection
    connection = await createDorisConnection();
    console.log("Connected to Doris successfully");

    // Generate data for each project
    const projectData = generateSampleData(projectIds, opts);

    for (const data of projectData) {
      const { projectId, tracesPerProject, observationsPerProject, scoresPerProject } = data;
      
      console.log(`\nGenerating data for project ${projectId}:`);
      console.log(`  - Traces: ${tracesPerProject}`);
      console.log(`  - Observations: ${observationsPerProject}`);
      console.log(`  - Scores: ${scoresPerProject}`);

      // Generate and insert traces
      const traces = generateTraces(projectId, tracesPerProject, opts.numberOfDays);
      await insertDataInBatches(connection, 'traces', traces);

      // Generate and insert observations
      const observations = generateObservations(projectId, observationsPerProject, tracesPerProject, opts.numberOfDays);
      await insertDataInBatches(connection, 'observations', observations);

      // Generate and insert scores
      const scores = generateScores(projectId, scoresPerProject, tracesPerProject, observationsPerProject, opts.numberOfDays);
      await insertDataInBatches(connection, 'scores', scores);
    }

    // Create datasets in PostgreSQL (same as ClickHouse seed)
    const project1 = await prisma.project.findFirst({
      where: { id: projectIds[0] },
    });

    const project2 = projectIds.length > 1
      ? await prisma.project.findFirst({
          where: { id: projectIds[1] },
        })
      : await prisma.project.findFirst();

    if (project1 && project2) {
      // Create some sample observations for dataset creation
      const sampleObservations = generateObservations(projectIds[0], 50, 10, opts.numberOfDays)
        .map((o) => ({
          id: o.id,
          traceId: o.trace_id,
          projectId: o.project_id,
          type: o.type as any,
          startTime: new Date(o.start_time),
          endTime: o.end_time ? new Date(o.end_time) : null,
          name: o.name,
          metadata: {},
          level: o.level as any,
          statusMessage: o.status_message,
          parentObservationId: o.parent_observation_id,
          version: o.version,
          createdAt: new Date(o.created_at),
          updatedAt: new Date(o.updated_at),
          input: {},
          output: {},
          modelParameters: {},
          internalModel: null,
          internalModelId: o.internal_model_id,
          providedModelName: o.provided_model_name,
          completionStartTime: o.completion_start_time ? new Date(o.completion_start_time) : null,
          promptId: o.prompt_id,
          promptName: o.prompt_name,
          promptVersion: o.prompt_version,
        }));

      await createDatasets(project1, project2, sampleObservations);
      console.log("✓ Created datasets in PostgreSQL");
    }

    console.log("\n🎉 Doris seed completed successfully!");
    
  } catch (error) {
    console.error("❌ Error during Doris seed:", error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log("Disconnected from Doris");
    }
    await prisma.$disconnect();
    redis?.disconnect();
    console.log("Disconnected from PostgreSQL and Redis");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 