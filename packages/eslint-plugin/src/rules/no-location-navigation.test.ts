import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-location-navigation.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-location-navigation", rule, {
  valid: [
    { code: `const path = window.location.pathname;` },
    { code: `window.location.reload();` },
    { code: `window.location.hostname = region.hostname;` },
    { code: `vertexAIConfig.location = values.vertexAILocation.trim();` },
    { code: `const location = window.location;` },
    {
      code: `let location: { search: string } = { search: "" }; location = { search: "?x=1" };`,
    },
    {
      code: `function setHref(location: { href: string }) { location.href = "/x"; }`,
    },
    {
      code: `import { location } from "adapter"; location.href = "/x"; location.assign("/x");`,
    },
    {
      code: `function update(document: { location: string }) { document.location = "/x"; }`,
    },
    {
      code: `function update(window: { location: { href: string; assign: (url: string) => void } }) { window.location.href = "/x"; window.location.assign("/x"); }`,
    },
    {
      code: `import { document } from "adapter"; document.location.replace("/x");`,
    },
    {
      code: `function outer() { const globalThis = { location: "" }; function inner() { globalThis.location = "/x"; } }`,
    },
    { code: `({ location } = window);` },
    { code: `window["location"].href = "/x";` },
    { code: `window.location["href"] = "/x";` },
    { code: `foo.location.href = "/x";` },
    { code: `foo.window.location = "/x";` },
    { code: `assign("/x");` },
    { code: `foo.assign("/x");` },
    { code: `location["assign"]("/x");` },
    { code: `window.location.pathname = "/x";` },
    {
      code: `class Box { #replace() {} run() { location.#replace(); } }`,
    },
  ],
  invalid: [
    {
      code: `window.location.href = "/x";`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `location = url;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `document.location = url;`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `globalThis.location.href = "/x";`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `window.location.assign("/x");`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `location.replace("/x");`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `document.location.replace("/x");`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `globalThis.location.assign("/x");`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `function inner() { document.location.href = "/x"; }`,
      languageOptions: {
        globals: { document: "readonly" },
      },
      errors: [{ messageId: "unexpected" }],
    },
  ],
});
