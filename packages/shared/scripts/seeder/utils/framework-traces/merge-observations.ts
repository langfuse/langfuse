import { readFileSync, writeFileSync } from "fs";

/**
 * Merges detailed observation data (input/output/metadata) into the base trace file.
 * how to use? SEE README.md
 *
 * Usage: ts-node merge-observations.ts <base-file> <detailed-obs-file> <output-file>
 *
 * Example:
 *   ts-node merge-observations.ts pydantic-base.json pydantic-details.json pydantic-ai.json
 *
 */

const [baseFile, detailedFile, outputFile] = process.argv.slice(2);

if (!baseFile || !detailedFile || !outputFile) {
  console.error(
    "Usage: ts-node merge-observations.ts <base-file> <detailed-obs-file> <output-file>",
  );
  process.exit(1);
}

const baseData = JSON.parse(readFileSync(baseFile, "utf-8"));
const detailedObs = JSON.parse(readFileSync(detailedFile, "utf-8"));

// Build ID to detailed observation map
const obsMap = new Map<string, any>();
for (const obs of Object.values(detailedObs)) {
  obsMap.set((obs as any).id, obs);
}

// Merge input/output/metadata into observations array
const mergedObservations = baseData.observations.map((obs: any) => {
  const detailed = obsMap.get(obs.id);
  if (detailed) {
    return {
      ...obs,
      input: detailed.input,
      output: detailed.output,
      metadata: detailed.metadata,
    };
  }
  return obs;
});

// demo project
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// Remove observations from trace, create final structure
const output = {
  trace: {
    ...baseData.trace,
    projectId: PROJECT_ID,
  },
  observations: mergedObservations.map((obs: any) => ({
    ...obs,
    projectId: PROJECT_ID,
  })),
};

// Remove observations array from trace if it exists
delete (output.trace as any).observations;

writeFileSync(outputFile, JSON.stringify(output, null, 2));

console.log(`Merged ${mergedObservations.length} observations`);
console.log(`Wrote to ${outputFile}`);
