import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-restricted-prisma-access.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

const writeOnly = {
  model: "apiKey",
  methods: ["create", "createMany", "upsert"],
  relations: ["apiKeys"],
  relationKeys: ["create", "connectOrCreate"],
  allow: ["packages/shared/src/server/auth/apiKeys.ts"],
  message: "Use createApiKey.",
};

const fullAccess = {
  model: "roleAssignment",
  relations: ["roleAssignments"],
  allow: ["rbac/roleAssignmentService.ts", "*.servertest.ts"],
  message: "Use roleAssignmentService.",
};

const unscoped = {
  model: "user",
  methods: ["delete"],
  message: "Use deleteUser.",
};

const options = [
  { restrictions: [writeOnly, fullAccess, unscoped] },
] satisfies [object];

/** writeOnlyError builds the expected report for a restricted api key access */
function writeOnlyError(access: string) {
  return {
    messageId: "restricted" as const,
    data: { access, message: writeOnly.message },
  };
}

/** fullAccessError builds the expected report for a restricted role assignment access */
function fullAccessError(access: string) {
  return {
    messageId: "restricted" as const,
    data: { access, message: fullAccess.message },
  };
}

ruleTester.run("no-restricted-prisma-access", rule, {
  valid: [
    `await prisma.apiKey.create({ data });`,
    { code: `await prisma.apiKey.findUnique({ where: { id } });`, options },
    { code: `await prisma.apiKey.update({ where: { id }, data });`, options },
    { code: `await prisma.project.create({ data });`, options },
    { code: `await apiKey.create({ data });`, options },
    { code: `const create = prisma.apiKey.create;`, options },
    { code: `await prisma.apiKey[method]({ data });`, options },
    { code: `await prisma[model].create({ data });`, options },
    { code: `await prisma.apiKey[0]({ data });`, options },
    { code: `await createFn()({ data });`, options },
    {
      code: `await prisma.apiKey.create({ data });`,
      filename: "/repo/packages/shared/src/server/auth/apiKeys.ts",
      options,
    },
    {
      code: `await tx.roleAssignment.findMany({ where });`,
      filename:
        "/repo/packages/shared/src/features/rbac/roleAssignmentService.ts",
      options,
    },
    {
      code: `await prisma.roleAssignment.deleteMany({ where });`,
      filename:
        "/repo/.claude/worktrees/x/web/src/__tests__/server/roles.servertest.ts",
      options: [{ restrictions: [fullAccess] }],
    },
    { code: `const data = { apiKeys: { update: {} } };`, options },
    { code: `const data = { apiKeys: [] };`, options },
    { code: `const data = { apiKeys: { ...rest, [key]: {} } };`, options },
    { code: `const data = { roleAssignments: assignments };`, options },
    { code: `const data = { roleAssignments: false };`, options },
    { code: `const data = { [relation]: { create: {} } };`, options },
    { code: `const data = { 0: { create: {} } };`, options },
    { code: `const { roleAssignments, ...rest } = apiKey;`, options },
  ],
  invalid: [
    {
      code: `await prisma.apiKey.create({ data });`,
      options,
      errors: [writeOnlyError("apiKey.create")],
    },
    {
      code: `await tx.apiKey.upsert({ where, create, update });`,
      options,
      errors: [writeOnlyError("apiKey.upsert")],
    },
    {
      code: `await this.db.apiKey.createMany({ data: [] });`,
      options,
      errors: [writeOnlyError("apiKey.createMany")],
    },
    {
      code: `await prisma["apiKey"]["create"]({ data });`,
      options,
      errors: [writeOnlyError("apiKey.create")],
    },
    {
      code: `await prisma?.apiKey?.create({ data });`,
      options,
      errors: [writeOnlyError("apiKey.create")],
    },
    {
      code: `await (prisma?.apiKey.create)!({ data });`,
      options,
      errors: [writeOnlyError("apiKey.create")],
    },
    {
      code: `await prisma.apiKey!.create({ data });`,
      filename: "/repo/web/src/server/auth/apiKeys.ts",
      options,
      errors: [writeOnlyError("apiKey.create")],
    },
    {
      code: `await prisma.project.create({ data: { apiKeys: { create: { id } } } });`,
      options,
      errors: [writeOnlyError("apiKeys.create")],
    },
    {
      code: `const data = { "apiKeys": { "connectOrCreate": {} } };`,
      options,
      errors: [writeOnlyError("apiKeys.connectOrCreate")],
    },
    {
      code: `await prisma.roleAssignment.findMany({ where });`,
      options,
      errors: [fullAccessError("roleAssignment.findMany")],
    },
    {
      code: `await tx.roleAssignment.update({ where, data });`,
      filename: "/repo/packages/shared/src/server/auth/apiKeys.ts",
      options,
      errors: [fullAccessError("roleAssignment.update")],
    },
    {
      code: `const select = { roleAssignments: { select: { systemRole: true } } };`,
      options,
      errors: [fullAccessError("roleAssignments")],
    },
    {
      code: `await prisma.user.delete({ where });`,
      options,
      errors: [
        {
          messageId: "restricted",
          data: { access: "user.delete", message: unscoped.message },
        },
      ],
    },
    {
      code: `const include = { roleAssignments: true };`,
      options,
      errors: [fullAccessError("roleAssignments")],
    },
  ],
});
