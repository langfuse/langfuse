import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { env } from "../../src/env";
import { prisma } from "../../src/db";
import {
  listAgents,
  getAgentDetail,
  getAgentRuns,
  getAgentTraces,
  getAgentSkills,
  getAgentInfo,
  getAgentEnvironments,
} from "../../src/server/repositories/agents";
import { buildAgentsMvpFixture } from "./scenarios/agents-mvp";
import {
  AGENTS_MVP_UNRESOLVED_SKILL,
  agentsMvpManagedSkillName,
} from "./scenarios/agents-mvp-skills";

async function main() {
  const { values } = parseArgs({
    options: {
      project: {
        type: "string",
        default: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      },
      prefix: { type: "string", default: "agents-mvp-proof-20261105" },
      date: { type: "string", default: "2026-11-05" },
      output: { type: "string" },
    },
  });
  const endpoint = new URL(env.CLICKHOUSE_URL);
  assert(["localhost", "127.0.0.1"].includes(endpoint.hostname));
  const postgresUrl = process.env.DATABASE_URL;
  assert(postgresUrl, "DATABASE_URL must point to the local fixture database");
  assert(["localhost", "127.0.0.1"].includes(new URL(postgresUrl).hostname));
  const projectId = values.project;
  const prefix = values.prefix;
  const fixture = buildAgentsMvpFixture(
    {
      projectId,
      environment: "production",
      idPrefix: prefix,
      seed: 42,
      dryRun: true,
      baseUrl: "http://localhost:3017",
      log() {},
    },
    { runs: 80, date: values.date },
  );
  const scope = {
    projectId,
    from: new Date(fixture.start),
    to: new Date(fixture.end),
    environment: null,
  };
  const measurements: Record<string, unknown>[] = [];
  let assertions = 0;
  async function timed<T>(name: string, run: () => Promise<T>) {
    const start = performance.now();
    const result = await run();
    measurements.push({
      name,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    });
    return result;
  }
  const list = await timed("gallery", () =>
    listAgents({
      ...scope,
      page: 0,
      pageSize: 24,
      sort: "runs",
      direction: "desc",
    }),
  );
  assert.equal(list.totalCount, 8);
  assertions++;
  const environments = await timed("environments", () =>
    getAgentEnvironments(scope),
  );
  assert.deepEqual(environments, ["production", "staging"]);
  assertions++;
  for (const i of [0, 2, 3]) {
    const at = fixture.events.find(
      (e) => e.span_id === `${prefix}-run-${i}`,
    )!.start_time;
    const from = new Date(at.replace(" ", "T") + "Z");
    const selected = {
      ...scope,
      from,
      to: new Date(from.getTime() + 6000),
      identity: { kind: "id" as const, value: `agentique:${i}` },
    };
    const result = await timed(`accounting-${i}`, () =>
      getAgentDetail(selected),
    );
    assert(result);
    assertions++;
    assert.equal(result.stats.runs, 1);
    assertions++;
    assert.equal(result.stats.modelCalls, 3);
    assertions++;
    assert.equal(result.stats.inputTokens, 17107);
    assertions++;
    assert.equal(result.stats.outputTokens, 491);
    assertions++;
    assert(Math.abs(result.stats.cost! - 0.031) < 1e-9);
    assertions++;
    const runs = await timed(`runs-${i}`, () =>
      getAgentRuns({ ...selected, page: 0, pageSize: 50 }),
    );
    assert.equal(runs.totalCount, 1);
    assertions++;
    assert.equal(runs.items[0]?.totalTokens, 17598);
    assertions++;
    const traces = await timed(`traces-${i}`, () =>
      getAgentTraces({ ...selected, page: 0, pageSize: 50 }),
    );
    assert.equal(traces.totalCount, 1);
    assertions++;
    assert.equal(traces.items[0]?.totalTokens, 17598);
    assertions++;
  }
  const owner = {
    ...scope,
    identity: { kind: "id" as const, value: "agentique:0" },
  };
  const skills = await timed("skills", () =>
    getAgentSkills({ ...owner, page: 0, pageSize: 100 }),
  );
  assert(skills.items.length > 0);
  assertions++;
  assert(
    skills.items.every(
      (s) =>
        s.name === agentsMvpManagedSkillName(prefix) &&
        s.skillId &&
        s.skillVersion &&
        s.sampleTraceIds.length,
    ),
  );
  assertions++;
  const observedManaged = [];
  let unresolved = 0;
  for (const agent of list.items) {
    const resources = await timed(`skills-${agent.identity.value}`, () =>
      getAgentSkills({
        ...scope,
        identity: agent.identity,
        page: 0,
        pageSize: 100,
      }),
    );
    const managed = resources.items.filter(
      (skill) => skill.name === agentsMvpManagedSkillName(prefix),
    );
    assert(managed.length > 0);
    assertions++;
    assert(
      managed.every(
        (skill) =>
          skill.skillId && skill.skillVersion && skill.sampleTraceIds.length,
      ),
    );
    assertions++;
    observedManaged.push(...managed);
    unresolved += resources.items.filter(
      (skill) =>
        skill.name === AGENTS_MVP_UNRESOLVED_SKILL &&
        !skill.skillId &&
        !skill.skillVersion,
    ).length;
  }
  assert.equal(unresolved, 1);
  assertions++;
  assert.deepEqual(
    new Set(observedManaged.map((skill) => skill.skillVersion)),
    new Set([1, 2]),
  );
  assertions++;
  const catalog = await prisma.skill.findMany({
    where: {
      projectId,
      OR: observedManaged.map((skill) => ({
        id: skill.skillId!,
        version: skill.skillVersion!,
      })),
    },
    select: { id: true, version: true, name: true },
  });
  assert.equal(catalog.length, 2);
  assertions++;
  assert(
    observedManaged.every((skill) =>
      catalog.some(
        (version) =>
          version.id === skill.skillId &&
          version.version === skill.skillVersion &&
          version.name === skill.name,
      ),
    ),
  );
  assertions++;
  const info = await timed("info", () => getAgentInfo(owner));
  assert(info?.model);
  assertions++;
  assert.equal(info.model.sourceTraceId, info.source.traceId);
  assertions++;
  const noId = await timed("name-fallback", () =>
    getAgentDetail({
      ...scope,
      identity: { kind: "name", value: "native-name-only" },
    }),
  );
  assert.equal(noId?.id, null);
  assertions++;
  const otherProject = await timed("project-isolation", () =>
    listAgents({
      ...scope,
      projectId: "absent-agents-project",
      page: 0,
      pageSize: 24,
      sort: "runs",
      direction: "desc",
    }),
  );
  assert.equal(otherProject.totalCount, 0);
  assertions++;
  const crossing = {
    ...scope,
    from: new Date(fixture.end - 60_000),
    identity: { kind: "id" as const, value: "agentique:0" },
  };
  const crossingDetail = await timed("crossing-period-detail", () =>
    getAgentDetail(crossing),
  );
  assert.equal(crossingDetail?.stats.runs, 0);
  assertions++;
  assert.equal(crossingDetail?.stats.traces, 1);
  assertions++;
  assert.equal(crossingDetail?.stats.totalTokens, 10);
  assertions++;
  const crossingTraces = await timed("crossing-period-traces", () =>
    getAgentTraces({ ...crossing, page: 0, pageSize: 50 }),
  );
  assert.equal(crossingTraces.items[0]?.runs, 0);
  assertions++;
  assert.equal(crossingTraces.items[0]?.totalTokens, 10);
  assertions++;
  const crossingGallery = await timed("crossing-period-gallery", () =>
    listAgents({
      ...crossing,
      page: 0,
      pageSize: 24,
      sort: "runs",
      direction: "desc",
    }),
  );
  assert.equal(crossingGallery.totalCount, 1);
  assertions++;
  assert.equal(await getAgentInfo(crossing), null);
  assertions++;
  const unknown = fixture.events.find(
    (row) => row.span_id === `${prefix}-run-13-model-0`,
  )!;
  const unknownAt = new Date(unknown.start_time.replace(" ", "T") + "Z");
  const unknownScope = {
    ...scope,
    from: unknownAt,
    to: new Date(unknownAt.getTime() + 100),
  };
  const explicitOnly = await timed("explicit-identity-without-owner", () =>
    listAgents({
      ...unknownScope,
      page: 0,
      pageSize: 24,
      sort: "runs",
      direction: "desc",
    }),
  );
  assert.equal(explicitOnly.totalCount, 1);
  assertions++;
  assert.equal(explicitOnly.items[0]?.stats.runs, 0);
  assertions++;
  assert.equal(explicitOnly.items[0]?.stats.unattributedModelCalls, 1);
  assertions++;
  const movedRoot = fixture.events.find(
    (row) => row.span_id === `${prefix}-run-4`,
  )!;
  const movedAt = new Date(movedRoot.start_time.replace(" ", "T") + "Z");
  const moved = {
    ...scope,
    from: movedAt,
    to: new Date(movedAt.getTime() + 6000),
    identity: { kind: "id" as const, value: "agentique:4" },
  };
  assert.equal(
    await getAgentDetail({ ...moved, environment: "production" }),
    null,
  );
  assertions++;
  assert.equal(
    (await getAgentDetail({ ...moved, environment: "staging" }))?.stats
      .modelCalls,
    3,
  );
  assertions++;
  const report = {
    status: "passed",
    assertions,
    measurements,
    list: {
      agents: list.totalCount,
      environments,
      stats: list.items.map((a) => ({ identity: a.identity, ...a.stats })),
    },
  };
  if (values.output)
    writeFileSync(values.output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: "passed",
      assertions,
      procedureCalls: measurements.length,
      measurements,
    }),
  );
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
