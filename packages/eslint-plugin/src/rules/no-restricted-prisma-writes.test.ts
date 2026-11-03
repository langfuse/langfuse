import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-restricted-prisma-writes.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

const options = [
  {
    models: {
      apiKey: ["packages/shared/src/server/auth/apiKeys.ts"],
      roleAssignment: ["rbac/roleAssignmentService.ts", "*.servertest.ts"],
      membership: ["*.test.ts"],
    },
  },
] satisfies [object];

/** restricted builds the expected report for a create on a restricted model */
function restricted(model: string, method: string, writers: string) {
  return {
    messageId: "restricted" as const,
    data: { model, method, writers },
  };
}

ruleTester.run("no-restricted-prisma-writes", rule, {
  valid: [
    `await prisma.apiKey.create({ data });`,
    { code: `await prisma.apiKey.findUnique({ where: { id } });`, options },
    { code: `await prisma.apiKey.update({ where: { id }, data });`, options },
    { code: `await prisma.apiKey.deleteMany({ where });`, options },
    { code: `await prisma.project.create({ data });`, options },
    { code: `await apiKey.create({ data });`, options },
    { code: `const create = prisma.apiKey.create;`, options },
    { code: `await prisma.apiKey[method]({ data });`, options },
    { code: `await prisma[model].create({ data });`, options },
    { code: `await prisma.apiKey[0]({ data });`, options },
    { code: `await createFn()({ data });`, options },
    {
      code: `await prisma.apiKey.create({ data });`,
      filename:
        "/repo/.claude/worktrees/x/packages/shared/src/server/auth/apiKeys.ts",
      options,
    },
    {
      code: `await tx.roleAssignment.create({ data });`,
      filename:
        "C:\\repo\\packages\\shared\\src\\features\\rbac\\roleAssignmentService.ts",
      options,
    },
    {
      code: `await prisma.roleAssignment.create({ data });`,
      filename: "/repo/web/src/__tests__/server/roles.servertest.ts",
      options: [{ models: { roleAssignment: ["*.servertest.ts"] } }],
    },
  ],
  invalid: [
    {
      code: `await prisma.apiKey.create({ data });`,
      options,
      errors: [
        restricted(
          "apiKey",
          "create",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await tx.apiKey.upsert({ where, create, update });`,
      options,
      errors: [
        restricted(
          "apiKey",
          "upsert",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await this.db.apiKey.createMany({ data: [] });`,
      options,
      errors: [
        restricted(
          "apiKey",
          "createMany",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await prisma["apiKey"]["createManyAndReturn"]({ data });`,
      options,
      errors: [
        restricted(
          "apiKey",
          "createManyAndReturn",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await prisma?.apiKey?.create({ data });`,
      options,
      errors: [
        restricted(
          "apiKey",
          "create",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await (prisma?.apiKey.create)!({ data });`,
      options,
      errors: [
        restricted(
          "apiKey",
          "create",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await prisma.apiKey!.create({ data });`,
      filename: "/repo/web/src/server/auth/apiKeys.ts",
      options,
      errors: [
        restricted(
          "apiKey",
          "create",
          "packages/shared/src/server/auth/apiKeys.ts",
        ),
      ],
    },
    {
      code: `await tx.roleAssignment.create({ data });`,
      filename: "/repo/packages/shared/src/server/auth/apiKeys.ts",
      options,
      errors: [
        restricted("roleAssignment", "create", "rbac/roleAssignmentService.ts"),
      ],
    },
    {
      code: `await prisma.roleAssignment.create({ data });`,
      options: [
        {
          models: {
            roleAssignment: ["a/roleAssignmentService.ts", "b/seed.ts"],
          },
        },
      ],
      errors: [
        restricted(
          "roleAssignment",
          "create",
          "a/roleAssignmentService.ts or b/seed.ts",
        ),
      ],
    },
    {
      code: `await prisma.membership.create({ data });`,
      options,
      errors: [restricted("membership", "create", "an allowed file")],
    },
  ],
});
