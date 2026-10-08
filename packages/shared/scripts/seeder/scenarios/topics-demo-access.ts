import { prisma } from "../../../src/db";
import { env } from "../../../src/env";
import { env as runtimeEnv } from "node:process";
import { SeedError, type ScenarioContext } from "./types";

const isLoopback = (url: string | undefined) => {
  try {
    return (
      url !== undefined &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
    );
  } catch {
    return false;
  }
};

/** Explicit access setup is confined to the default synthetic local identity. */
export async function enableTopicsDemoAdmin(ctx: ScenarioContext) {
  if (
    ctx.projectId !== "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" ||
    ![ctx.baseUrl, runtimeEnv.DATABASE_URL, env.CLICKHOUSE_URL].every(
      isLoopback,
    )
  )
    throw new SeedError(
      "--demo-admin is only available for the default demo project with loopback web, Postgres, and ClickHouse URLs.",
    );
  const user = await prisma.user.findFirst({
    where: {
      id: "user-1",
      email: "demo@langfuse.com",
      organizationMemberships: {
        some: {
          organization: { projects: { some: { id: ctx.projectId } } },
        },
      },
    },
    select: { id: true },
  });
  if (!user)
    throw new SeedError(
      "The synthetic demo account is not a member of the default demo project's organization.",
    );
  const saved = await prisma.user.update({
    where: { id: user.id, email: "demo@langfuse.com" },
    data: { admin: true },
    select: { admin: true },
  });
  if (!saved.admin)
    throw new SeedError("The demo account's admin access did not read back.");
  ctx.log(
    "enabled admin feature previews for the existing synthetic demo account; opt into Langfuse Topics in Feature previews",
  );
}
