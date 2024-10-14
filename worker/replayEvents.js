const fs = require("fs");
const csv = require("csv-parser");
const bullmq = require("bullmq");
const redis = require("ioredis");

function getEventsFromLogs(filePath) {
  return new Promise((resolve) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const message = row.Message;
        const regex = /S3 ([^/]+)\/observation\/([^/]+)\/([^/]+)\.json/;
        const match = message.match(regex);
        if (match) {
          results.push({
            useS3EventStore: true,
            authCheck: {
              validKey: true,
              scope: {
                projectId: match[1],
              },
            },
            data: {
              eventBodyId: match[2],
              eventId: match[3],
              type: "span-create",
            },
          });
          results.push({
            useS3EventStore: true,
            authCheck: {
              validKey: true,
              scope: {
                projectId: match[1],
              },
            },
            data: {
              eventBodyId: match[2],
              eventId: match[3],
              type: "generation-create",
            },
          });
          results.push({
            useS3EventStore: true,
            authCheck: {
              validKey: true,
              scope: {
                projectId: match[1],
              },
            },
            data: {
              eventBodyId: match[2],
              eventId: match[3],
              type: "event-create",
            },
          });
        }
      })
      .on("end", () => {
        resolve(results);
      });
  });
}

async function main() {
  const events = await getEventsFromLogs("/Users/steffen/Downloads/eu.csv");

  const queue = new bullmq.Queue("legacy-ingestion-queue", {
    connection: new Redis(), // TODO: add redis connection string
  });

  // Emit single event into queue on redis
  for (const event of events) {
    await queue.add("legacy-ingestion-job", event);
    console.log(`Added ${JSON.stringify(event)} to queue`);
  }
}

main();
