import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-direct-api-key-writes.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-direct-api-key-writes", rule, {
  valid: [
    `await createApiKey(prisma, { owner, role, createdBy: "system" });`,
    `await prisma.apiKey.findUnique({ where: { id } });`,
    `await prisma.apiKey.update({ where: { id }, data });`,
    `await prisma.apiKey.updateMany({ where, data });`,
    `await prisma.apiKey.delete({ where: { id } });`,
    `await prisma.apiKey.deleteMany({ where });`,
    `await prisma.project.create({ data });`,
    `await prisma.apiKeys.create({ data });`,
    `await apiKey.create({ data });`,
    `const create = prisma.apiKey.create;`,
    `await prisma.apiKey[method]({ data });`,
    `await prisma[model].create({ data });`,
    `await prisma.apiKey[0]({ data });`,
    `await createFn()({ data });`,
  ],
  invalid: [
    {
      code: `await prisma.apiKey.create({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
    {
      code: `await tx.apiKey.upsert({ where, create, update });`,
      errors: [{ messageId: "unexpected", data: { method: "upsert" } }],
    },
    {
      code: `await prisma.apiKey.createMany({ data: [] });`,
      errors: [{ messageId: "unexpected", data: { method: "createMany" } }],
    },
    {
      code: `await prisma.apiKey.createManyAndReturn({ data: [] });`,
      errors: [
        { messageId: "unexpected", data: { method: "createManyAndReturn" } },
      ],
    },
    {
      code: `await this.db.apiKey.create({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
    {
      code: `await prisma["apiKey"]["create"]({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
    {
      code: `await prisma?.apiKey?.create({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
    {
      code: `await prisma.apiKey!.create({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
    {
      code: `await (prisma?.apiKey).create({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
    {
      code: `await (prisma?.apiKey.create)!({ data });`,
      errors: [{ messageId: "unexpected", data: { method: "create" } }],
    },
  ],
});
