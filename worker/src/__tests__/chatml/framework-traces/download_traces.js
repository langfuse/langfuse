#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

/**
 * @typedef {Object} TraceToDownload
 * @property {string} fileNamePrefix
 * @property {string} traceId
 * @property {string} projectId
 * @property {string} baseUrl
 */

/** @type {TraceToDownload[]} */
const TRACES_TO_DOWNLOAD = [
  {
    fileNamePrefix: "agno",
    traceId: "080130871f53145aecf7c29d5dfb6e4c",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "autogen",
    traceId: "1b72c51fabed12ae7df83bfd4a09f545",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "beeai",
    traceId: "096fc09a30ab90d2431778f9ee2b3936",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "claude-agent",
    traceId: "097f1d8982fa909b8cffb14a166ec272",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "crewai",
    traceId: "a287bb31e317433610d8827617471140",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "google-adk",
    traceId: "b82a0bdc1994fc5d1c8576ca032543f7",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    traceId: "9f2f0fe0228fd81a9fe75882934b384a",
    fileNamePrefix: "google-gemini",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "koog",
    traceId: "dff173a675b759ce1b70e522b27d6846",
    projectId: "cmcmdwcag00c2ad077xp1qnyc",
  },
  /* 
  {
    fileNamePrefix: "langchain-deepagent",
    traceId: "22e55d4fa6359f400a800dfaed5ce666",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  */
  {
    fileNamePrefix: "langgraph-js",
    traceId: "2c1581dd9cecdafb6ca091b83d7ea99a",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "langgraph-python",
    traceId: "e1fde3efec57ce8a69bafd3fb928a7eb",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "llamaindex",
    traceId: "12ea412956f99347b0503c1144acd0ec",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "microsoft-agent",
    traceId: "8e419d3288419b5d944270505640e183",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "openai-agents",
    traceId: "fee618f96dc31e0ca38b2f7b26eb8b29",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "pydantic-ai-tools",
    traceId: "25f4bdeebaab60e6e1bee7e8469554bc",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "vercel-aisdk",
    traceId: "df41e597d0a85e0d7a6ae8ebfaa70aa0",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    fileNamePrefix: "vertex-ai",
    traceId: "0298935e31d66d7de9487cac935d7d99",
    projectId: "cloramnkj0002jz088vzn1ja4",
  },
  {
    //from https://github.com/langfuse/langfuse/issues/11307
    fileNamePrefix: "pydantic-ai-with-gemini",
    traceId: "f68601af42c4a35e1d5e4699de569c1f",
    projectId: "cmjjlsmpf01q5ad083m5ud2p5",
    baseUrl: "https://us.cloud.langfuse.com",
  },
  {
    //from https://github.com/langfuse/langfuse/issues/12550
    fileNamePrefix: "csharp-agent-with-gemini",
    traceId: "933dba1e9783f89d5d8bb032f041a2de",
    projectId: "cml84ntcb01hgad07c302ud72",
  },
];

async function fetchTrpJsonObject(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error for url ${url}: ${res.status}`);
  }

  const trpcJson = await res.json();
  if (trpcJson?.error) {
    const error = trpcJson.error?.json?.message
      ? trpcJson.error?.json?.message
      : trpcJson.error;
    throw new Error(`tRPC error for url}: ${error}`);
  }

  if (!trpcJson?.result?.data?.json) {
    throw new Error(`tRPC error for ${url}: no data.json`);
  }

  if (typeof trpcJson.result.data.json !== "object") {
    throw new Error(`tRPC error for ${url}: data not an object`);
  }

  return trpcJson.result.data.json;
}

function buildTraceUrl({ traceId, projectId, baseUrl }) {
  const input = encodeURIComponent(
    JSON.stringify({
      json: {
        traceId,
        projectId,
      },
    }),
  );
  return `${baseUrl}/api/trpc/traces.byIdWithObservationsAndScores?input=${input}`;
}

function buildObservationUrl({ observationId, traceId, projectId, baseUrl }) {
  const input = encodeURIComponent(
    JSON.stringify({
      json: {
        observationId,
        traceId,
        projectId,
      },
    }),
  );
  return `${baseUrl}/api/trpc/observations.byId?input=${input}`;
}

//Main
async function main() {
  console.log(`Downloading ${TRACES_TO_DOWNLOAD.length} traces...`);

  for (const traceToDownload of TRACES_TO_DOWNLOAD) {
    process.stdout.write(`${traceToDownload.fileNamePrefix}: loading trace `);

    //if trace file already exists, skip downloading to avoid hitting rate limit and also avoid unnecessary downloading
    const existingFile = fs
      .readdirSync(__dirname)
      .find(
        (f) =>
          f.startsWith(traceToDownload.fileNamePrefix) &&
          f.endsWith(".trace.json"),
      );
    if (existingFile) {
      process.stdout.write(
        `\r${traceToDownload.fileNamePrefix}: trace file ${existingFile} already exists, skipping download\n`,
      );
      continue;
    }

    //collect trace and observations
    const traceUrl = buildTraceUrl({
      traceId: traceToDownload.traceId,
      projectId: traceToDownload.projectId,
      baseUrl: traceToDownload.baseUrl ?? "https://cloud.langfuse.com",
    });
    const trace = await fetchTrpJsonObject(traceUrl);

    //collect trace's observations
    process.stdout.write(
      `\r${traceToDownload.fileNamePrefix}: loading ${trace.observations?.length ?? 0} observations`,
    );
    //stable sort observations: by startTime, then id as tie-breaker
    trace.observations.sort((a, b) => {
      if (a.startTime !== b.startTime) {
        return a.startTime - b.startTime;
      }
      return a.id - b.id; // tie-breaker
    });
    const observations = await Promise.all(
      trace.observations.map(async (observation) => {
        const observationUrl = buildObservationUrl({
          observationId: observation.id,
          traceId: traceToDownload.traceId,
          projectId: traceToDownload.projectId,
          baseUrl: traceToDownload.baseUrl ?? "https://cloud.langfuse.com",
        });
        return await fetchTrpJsonObject(observationUrl);
      }),
    );

    //write trace+observations in file
    const yyyyMMdd = new Date(trace.timestamp).toISOString().slice(0, 10);
    const fileName = `${traceToDownload.fileNamePrefix}-${yyyyMMdd}.trace.json`;
    const content = JSON.stringify({ trace, observations }, null, 2) + "\n";
    fs.writeFileSync(path.join(__dirname, fileName), content, "utf8");

    process.stdout.write(
      `\r${traceToDownload.fileNamePrefix}: trace + ${observations.length} observations written to ${fileName}\n`,
    );
  }

  console.log("Done");
}

main();
