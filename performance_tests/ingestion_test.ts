import axios from 'axios';
import { generateLangfuseEvents } from './data_generator';

interface CLIFlags {
  eventCount: number;
  langfuseHost: string;
  concurrency: number;
  batchSizeApi: number;
  traceCount: number; // Changed from eventCount to traceCount for clarity with generator
}

function parseArgs(): CLIFlags {
  const args = process.argv.slice(2);
  const flags: Partial<CLIFlags> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--traceCount':
      case '-t':
        flags.traceCount = parseInt(args[++i], 10);
        break;
      case '--host':
      case '-h':
        flags.langfuseHost = args[++i];
        break;
      case '--concurrency':
      case '-c':
        flags.concurrency = parseInt(args[++i], 10);
        break;
      case '--batchSize':
      case '-b':
        flags.batchSizeApi = parseInt(args[++i], 10);
        break;
    }
  }

  if (!flags.traceCount && process.env.TRACE_COUNT) flags.traceCount = parseInt(process.env.TRACE_COUNT, 10);
  if (!flags.langfuseHost && process.env.LANGFUSE_HOST) flags.langfuseHost = process.env.LANGFUSE_HOST;
  if (!flags.concurrency && process.env.CONCURRENCY) flags.concurrency = parseInt(process.env.CONCURRENCY, 10);
  if (!flags.batchSizeApi && process.env.BATCH_SIZE_API) flags.batchSizeApi = parseInt(process.env.BATCH_SIZE_API, 10);


  return {
    traceCount: flags.traceCount || 100, // Number of traces to generate
    langfuseHost: flags.langfuseHost || 'http://localhost:3000',
    concurrency: flags.concurrency || 10,
    batchSizeApi: flags.batchSizeApi || 50, // Corresponds to LANGFUSE_INGESTION_BATCH_SIZE
  };
}

async function sendBatch(langfuseHost: string, batch: any[]): Promise<void> {
  const endpoint = `${langfuseHost}/api/ingestion`;
  try {
    // The API expects an object with a "batch" key
    await axios.post(endpoint, { batch }, {
      headers: {
        'Content-Type': 'application/json',
        // Add Authorization header if your Langfuse instance requires it
        // 'Authorization': `Basic ${Buffer.from("user:pass").toString('base64')}`
      },
      timeout: 30000, // 30 seconds timeout
    });
  } catch (error: any) {
    console.error(`Error sending batch to ${endpoint}:`, error.isAxiosError ? error.message : error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    // Re-throw to be caught by the main runner if necessary, or handle retries
    throw error; 
  }
}

async function runIngestionTest(flags: CLIFlags): Promise<void> {
  console.log('Starting ingestion performance test with flags:', flags);

  console.log(`Generating ${flags.traceCount} traces (this might result in more individual events)...`);
  // generateLangfuseEvents generates a flat list of ingestion events (trace-create, obs-create, score-create)
  const allGeneratedEvents = generateLangfuseEvents(flags.traceCount);
  const totalEventsToSend = allGeneratedEvents.length;
  console.log(`Generated a total of ${totalEventsToSend} individual ingestion events.`);

  if (totalEventsToSend === 0) {
    console.log("No events generated, exiting.");
    return;
  }

  const eventBatches: any[][] = [];
  for (let i = 0; i < totalEventsToSend; i += flags.batchSizeApi) {
    eventBatches.push(allGeneratedEvents.slice(i, i + flags.batchSizeApi));
  }
  console.log(`Divided into ${eventBatches.length} API batches of (up to) ${flags.batchSizeApi} events each.`);

  const startTime = Date.now();
  let successfulSends = 0;
  let failedSends = 0;

  const activePromises = new Set<Promise<any>>();
  let batchIndex = 0;

  const processBatches = async () => {
    while (batchIndex < eventBatches.length || activePromises.size > 0) {
      while (activePromises.size < flags.concurrency && batchIndex < eventBatches.length) {
        const currentBatchData = eventBatches[batchIndex];
        batchIndex++;
        
        const promise = sendBatch(flags.langfuseHost, currentBatchData)
          .then(() => {
            successfulSends++;
          })
          .catch(() => {
            failedSends++;
          })
          .finally(() => {
            activePromises.delete(promise);
          });
        
        activePromises.add(promise);
      }
      // Wait for any promise to resolve if max concurrency is reached or all batches are dispatched
      if (activePromises.size > 0) {
        await Promise.race(activePromises);
      }
    }
  };

  await processBatches();

  const endTime = Date.now();
  const totalTimeSeconds = (endTime - startTime) / 1000;

  console.log('\n--- Ingestion Test Results ---');
  console.log(`Total ingestion events attempted: ${totalEventsToSend}`);
  console.log(`Successfully sent batches (implies events): ${successfulSends * flags.batchSizeApi} (approx, as last batch might be smaller)`);
  console.log(`Failed API batches: ${failedSends}`);
  console.log(`Total time taken: ${totalTimeSeconds.toFixed(2)} seconds`);

  if (totalTimeSeconds > 0 && successfulSends > 0) {
    // Calculate throughput based on successfully sent *events*, not batches
    // For simplicity, assuming all batches sent by successful promises contained batchSizeApi events.
    // A more precise count would sum actual batch lengths of successful sends.
    const estimatedSuccessfulEvents = successfulSends * flags.batchSizeApi; // This is an estimate
    const throughput = estimatedSuccessfulEvents / totalTimeSeconds;
    console.log(`Ingestion Throughput: ${throughput.toFixed(2)} events/second (approx)`);
  } else {
    console.log('Ingestion Throughput: Not applicable (no successful sends or time taken was zero).');
  }

  if (failedSends > 0) {
    console.warn(`${failedSends} batches failed to send. Check logs for details.`);
  }
}

if (require.main === module) {
  const flags = parseArgs();
  runIngestionTest(flags).catch(error => {
    console.error('Test run failed catastrophically:', error);
    process.exit(1);
  });
}
