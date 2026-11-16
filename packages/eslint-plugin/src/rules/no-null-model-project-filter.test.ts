import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-null-model-project-filter.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-null-model-project-filter", rule, {
  valid: [
    `await prisma.model.findMany({ where: { OR: [{ projectId }, { scope: "LANGFUSE" }] } });`,
    `await prisma.price.create({ data: { modelId, projectId: null } });`,
    `await prisma.dashboard.findMany({ where: { projectId: null } });`,
    `await prisma[model].findMany({ where: { projectId: null } });`,
    `await findMany({ where: { projectId: null } });`,
    `await prisma.model.findMany({ where: { [projectId]: null } });`,
    `await prisma.model.findMany({ where: { owner: null, ...rest }, take: 1 }, [, filter]);`,
    `await prisma.model.findMany({ where: { [key()]: null } });`,
    `await prisma.model.findFirst(where);`,
    "const sql = Prisma.sql`SELECT * FROM models WHERE scope = 'LANGFUSE'`;",
    "const sql = Prisma.sql`SELECT * FROM dashboards WHERE project_id IS NULL`;",
    `await tx.model.create({ data: { scope: "LANGFUSE", projectId: null, id } });`,
    `await tx.model.upsert({ where: { scope: "LANGFUSE", id }, create: { scope: "LANGFUSE", projectId: null } });`,
    "const sql = Prisma.sql`SELECT m.id FROM models m JOIN prices p ON p.model_id = m.id WHERE p.project_id IS NULL`;",
    'const sql = Prisma.sql`SELECT m.id FROM "models" AS "m" JOIN prices ON prices.model_id = m.id WHERE "prices"."project_id" IS NULL`;',
  ],
  invalid: [
    {
      code: `await prisma.model.findMany({ where: { OR: [{ projectId }, { projectId: null }] } });`,
      errors: [{ messageId: "prisma" }],
    },
    {
      code: `await tx.model.upsert({ where: { "projectId": null, id }, create, update });`,
      errors: [{ messageId: "prisma" }],
    },
    {
      code: `await ctx.prisma.model.findFirst({ where: { AND: [{ id }, { OR: [{ projectId: null }] }] } });`,
      errors: [{ messageId: "prisma" }],
    },
    {
      code: "const rows = await prisma.$queryRaw`SELECT id FROM models WHERE project_id IS NULL OR project_id = ${projectId}`;",
      errors: [{ messageId: "sql" }],
    },
    {
      code: "const rows = Prisma.sql`SELECT id FROM models m WHERE (m.project_id is null OR m.project_id = ${projectId})`;",
      errors: [{ messageId: "sql" }],
    },
    {
      code: 'const rows = Prisma.sql`SELECT * FROM prices p JOIN "models" AS "m" ON p.model_id = m.id WHERE p.project_id = ${projectId} AND "models".project_id IS NULL`;',
      errors: [{ messageId: "sql" }],
    },
  ],
});
