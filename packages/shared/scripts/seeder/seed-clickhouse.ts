import { prisma } from "../../src/db";
import { env } from "../../src/env";
import { redis } from "../../src/server";
import { prepareClickhouse } from "./prepare-clickhouse";
import { gatewayBudgetsScenario } from "./scenarios/gateway-budgets";

const SEED_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

/** Gateway spend for the AI Gateway Budgets page, when the seed organization has a gateway set up. */
async function seedGatewaySpend() {
  const project = await prisma.project.findUnique({
    where: { id: SEED_PROJECT_ID },
    select: { organization: { select: { gatewayConfig: true } } },
  });
  if (!project?.organization.gatewayConfig) {
    console.log("No AI Gateway config in the seed organization, skipping.");
    return;
  }
  const scenarioParams = Object.fromEntries(
    gatewayBudgetsScenario.flags.map(({ flag, default: value }) => [
      flag,
      value,
    ]),
  );
  const summary = await gatewayBudgetsScenario.run(
    {
      projectId: SEED_PROJECT_ID,
      environment: "default",
      seed: 42,
      idPrefix: "gateway-budgets-s42",
      dryRun: false,
      baseUrl: (env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, ""),
      log: (message) => console.log(`[seed:gateway-budgets] ${message}`),
    },
    scenarioParams,
  );
  console.log(
    `Seeded AI Gateway spend: ${summary.links.join(", ")} (${JSON.stringify(summary.verified)})`,
  );
}

async function main() {
  try {
    const projectIds = [SEED_PROJECT_ID]; // Example project IDs
    if (
      await prisma.project.findFirst({
        where: { id: "239ad00f-562f-411d-af14-831c75ddd875" },
      })
    ) {
      projectIds.push("239ad00f-562f-411d-af14-831c75ddd875");
    }
    await prepareClickhouse(projectIds, {
      numberOfDays: 3,
      numberOfRuns: 3,
    });

    console.log("Clickhouse preparation completed successfully.");
  } catch (error) {
    console.error("Error during Clickhouse preparation:", error);
  }
  try {
    await seedGatewaySpend();
  } catch (error) {
    console.error("Error during AI Gateway spend seeding:", error);
  } finally {
    await prisma.$disconnect();
    redis?.disconnect();
    console.log("Disconnected from Clickhouse.");
  }
}

main();
