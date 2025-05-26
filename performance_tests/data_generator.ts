import { randomUUID } from 'crypto';

interface ScoreEvent {
  id: string;
  traceId: string;
  name: string;
  value: number;
  comment?: string;
  observationId?: string;
  timestamp?: string; // ISO string
  projectId?: string; // Added for completeness, though not strictly in prompt for score
}

interface ObservationEvent {
  id: string;
  traceId: string;
  type: 'SPAN' | 'GENERATION' | 'EVENT'; // Added 'EVENT' as another common type
  name: string;
  startTime: string; // ISO string
  endTime?: string; // ISO string
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number; // Often included
  };
  metadata?: Record<string, any>;
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'; // Common levels
  statusMessage?: string;
  input?: any;
  output?: any;
  projectId?: string; // Added for completeness
  completionStartTime?: string; // ISO string, for GENERATION
}

interface TraceEvent {
  id: string;
  timestamp: string; // ISO string
  name?: string;
  userId?: string;
  projectId: string;
  metadata?: Record<string, any>;
  release?: string;
  version?: string;
  tags?: string[];
  public?: boolean; // Common field
}

// Langfuse API expects a batch of events.
// Each item in the batch can be a trace, score, or observation (event).
// For this generator, we'll create a structure where observations and scores are tied to traces.
interface LangfuseIngestionEvent {
    id: string; // each event in batch needs an id
    type: "trace-create" | "observation-create" | "score-create" | "observation-update"; // Simplified
    timestamp: string; // ISO string, when this specific ingestion API event object was created
    body: TraceEvent | ObservationEvent | ScoreEvent;
}


export function generateLangfuseEvents(
  traceCount: number,
  observationsPerTraceMin: number = 1,
  observationsPerTraceMax: number = 5,
  includeScores: boolean = true
): LangfuseIngestionEvent[] {
  const events: LangfuseIngestionEvent[] = [];
  const baseTime = new Date();

  for (let i = 0; i < traceCount; i++) {
    const traceId = randomUUID();
    const projectId = `proj-${randomUUID().substring(0, 8)}`;
    const traceTimestamp = new Date(baseTime.getTime() - i * 1000 * 60); // Traces go back in time

    const traceBody: TraceEvent = {
      id: traceId,
      timestamp: traceTimestamp.toISOString(),
      name: `Trace ${i + 1}`,
      userId: `user-${randomUUID().substring(0, 8)}`,
      projectId: projectId,
      metadata: { environment: 'performance-test', runNumber: i },
      release: `v1.${Math.floor(Math.random() * 5)}.${Math.floor(Math.random() * 10)}`,
      version: `${Math.floor(Math.random() * 3) + 1}`,
      tags: [`tag-${i % 5}`, `critical-${i % 2 === 0}`],
      public: Math.random() > 0.5,
    };
    events.push({
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: traceBody
    });

    const observationCount = Math.floor(Math.random() * (observationsPerTraceMax - observationsPerTraceMin + 1)) + observationsPerTraceMin;
    let lastObservationEndTime = new Date(traceTimestamp.getTime() + 100); // Start observations shortly after trace

    for (let j = 0; j < observationCount; j++) {
      const observationId = randomUUID();
      const obsStartTime = new Date(lastObservationEndTime.getTime() + Math.random() * 1000); // Start after previous or trace
      const obsEndTime = new Date(obsStartTime.getTime() + Math.random() * 5000 + 500); // Duration 0.5s to 5.5s
      lastObservationEndTime = obsEndTime;

      const obsType = Math.random() > 0.3 ? 'SPAN' : 'GENERATION';
      const observationBody: ObservationEvent = {
        id: observationId,
        traceId: traceId,
        type: obsType,
        name: `${obsType === 'GENERATION' ? 'LLM Call' : 'DB Query'} ${j + 1}`,
        startTime: obsStartTime.toISOString(),
        endTime: obsEndTime.toISOString(),
        projectId: projectId,
        metadata: { detail: `Observation ${j} for trace ${i}` },
        level: Math.random() > 0.9 ? 'ERROR' : 'DEFAULT',
      };

      if (obsType === 'GENERATION') {
        observationBody.model = `gpt-3.5-turbo-0${Math.floor(Math.random() * 6) + 16}${Math.random() > 0.5 ? 'k' : ''}`;
        observationBody.usage = {
          promptTokens: Math.floor(Math.random() * 1000) + 50,
          completionTokens: Math.floor(Math.random() * 500) + 20,
        };
        observationBody.usage.totalTokens = observationBody.usage.promptTokens + observationBody.usage.completionTokens;
        observationBody.completionStartTime = new Date(obsStartTime.getTime() + Math.random() * 500 + 50).toISOString(); // TTFT
        observationBody.input = { prompt: "Translate this for me..." };
        observationBody.output = { translation: "Sure, here is the translation..." };
      } else {
         observationBody.input = { query: "SELECT * FROM users..." };
         observationBody.output = { rowCount: 10 };
      }
      events.push({
        id: randomUUID(),
        type: "observation-create",
        timestamp: new Date().toISOString(),
        body: observationBody
      });

      if (includeScores && Math.random() > 0.5) {
        const scoreBody: ScoreEvent = {
          id: randomUUID(),
          traceId: traceId,
          observationId: observationId, // Link score to this observation
          name: 'quality',
          value: Math.random() * 5,
          comment: 'Automated score for testing.',
          projectId: projectId,
          timestamp: obsEndTime.toISOString(), // Score timestamped at observation end
        };
        events.push({
            id: randomUUID(),
            type: "score-create",
            timestamp: new Date().toISOString(),
            body: scoreBody
        });
      }
    }
  }
  return events;
}

// Simple CLI to output generated JSON
if (require.main === module) {
  const eventCount = process.argv[2] ? parseInt(process.argv[2], 10) : 10; // Number of traces
  if (isNaN(eventCount) || eventCount <= 0) {
    console.error("Usage: ts-node data_generator.ts <traceCount>");
    process.exit(1);
  }

  const obsPerTraceMin = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
  const obsPerTraceMax = process.argv[4] ? parseInt(process.argv[4], 10) : 5;
  const includeScores = process.argv[5] ? process.argv[5].toLowerCase() === 'true' : true;


  const generatedEvents = generateLangfuseEvents(eventCount, obsPerTraceMin, obsPerTraceMax, includeScores);
  // Langfuse API expects a batch, which is an object with a "batch" key containing an array of events
  const apiPayload = {
    batch: generatedEvents,
  };
  console.log(JSON.stringify(apiPayload, null, 2));
}
