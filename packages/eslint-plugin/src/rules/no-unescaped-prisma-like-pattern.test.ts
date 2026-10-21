import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-unescaped-prisma-like-pattern.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-unescaped-prisma-like-pattern", rule, {
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
    `const e = escapeSqlLikePattern(q);
     where({ name: { contains: exact ? e : \`%\${e}%\` } });`,
    `const e = escapeSqlLikePattern(q);
     where({ name: { startsWith: e + "/" + e } });`,
    `const insensitive = { mode: "insensitive" as const };
     where({ name: { equals: escapeSqlLikePattern(q), ...insensitive } });`,
    `const caseSensitive = { mode: "default" };
     where({ name: { equals: q, ...caseSensitive } });`,
    `const mode = "default";
     where({ name: { equals: q, mode } });`,
    `where({ name: { not: { contains: escapeSqlLikePattern(q) }, mode: "insensitive" } });`,
    `where({ name: { not: q } });`,
    `const { contains } = filter;`,
    `const byIndex = { 1: query };`,
    `makeTag()\`name ILIKE \${q}\`;`,
    `gql\`query { items(filter: "name ILIKE \${q}") }\`;`,
    `Prisma.sql\`AND d.name ILIKE \${\`%\${escapeSqlLikePattern(q)}%\`}\`;`,
    `Prisma.sql\`AND d.name = \${name}\`;`,
    `sql\`AND name ILIKE \${escapeSqlLikePattern(q)} AND id = \${id}\`;`,
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
      code: `where({ name: { equals: name, mode: "insensitive" as const } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { equals: name, mode: Prisma.QueryMode.insensitive } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `const insensitive = { mode: "insensitive" as const };
             where({ name: { equals: name, ...insensitive } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { equals: name, ...modeFor(input) } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { equals: name, mode: modeFor(input) } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `const opts = makeOpts();
             where({ name: { equals: name, ...opts } });`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `function f(mode: string) { where({ name: { equals: q, mode } }); }`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `where({ name: { not: name, mode: "insensitive" } });`,
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
      code: `sql\`AND name ILIKE \${escapeSqlLikePattern(prefix)} || \${q}\`;`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `sql\`AND name ILIKE ('%' || \${q})\`;`,
      errors: [{ messageId: "unescaped" }],
    },
    {
      code: `prisma.$queryRaw\`SELECT 1 WHERE name like \${pattern}\`;`,
      errors: [{ messageId: "unescaped" }],
    },
  ],
});
