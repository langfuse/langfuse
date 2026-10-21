import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-unescaped-like-pattern.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-unescaped-like-pattern", rule, {
  valid: [
    `where({ name: { contains: escapeSqlLikePattern(query) } });`,
    `where({ name: { startsWith: \`\${escapeSqlLikePattern(path)}/\` } });`,
    `where({ name: { startsWith: escapeSqlLikePattern(name) + " (copy" } });`,
    `const escaped = escapeSqlLikePattern(query);
     where({ name: { contains: escaped, mode: "insensitive" } });`,
    `const op = { contains: "ILIKE", "starts with": "ILIKE" };`,
    `where({ name: { equals: name } });`,
    `where({ name: { equals: escapeSqlLikePattern(name), mode: "insensitive" } });`,
    `where({ name: { contains: q ? escapeSqlLikePattern(q) : "" } });`,
    `const prefix = p ? escapeSqlLikePattern(p) : undefined;
     where({ name: { startsWith: \`\${prefix}/\` } });`,
    `where({ name: { contains: escapeSqlLikePattern(q) as string } });`,
    `where({ name: { contains: escapeSqlLikePattern(q)! } });`,
    `const { contains } = filter;`,
    `const byIndex = { 1: query };`,
    `makeTag()\`name ILIKE \${q}\`;`,
    `gql\`query { items(filter: "name ILIKE \${q}") }\`;`,
    `Prisma.sql\`AND d.name ILIKE \${\`%\${escapeSqlLikePattern(q)}%\`}\`;`,
    `Prisma.sql\`AND d.name = \${name}\`;`,
    `Prisma.sql\`AND d.name LIKE '%/%' AND d.id = \${id}\`;`,
    `const pattern = \`%\${escapeSqlLikePattern(q)}%\`;
     prisma.$queryRaw\`SELECT 1 WHERE name ILIKE \${pattern}\`;`,
  ],
  invalid: [
    {
      code: `where({ name: { contains: query } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { startsWith: dataset.name + " (copy" } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { endsWith: \`\${suffix}\` } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { not: { contains: input.search } } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { equals: name, mode: "insensitive" } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `let q = escapeSqlLikePattern(raw);
             where({ name: { contains: q } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { contains: q ? escapeSqlLikePattern(q) : q } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { contains: helpers["escapeSqlLikePattern"](q) } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `Prisma.sql\`AND d.name ILIKE \${\`%\${q}%\`}\`;`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `sql\`AND tag NOT ILIKE '%' || \${q} || '%'\`;`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `prisma.$queryRaw\`SELECT 1 WHERE name like \${pattern}\`;`,
      errors: [{ messageId: "unescaped" }],
    },
  ],
});
