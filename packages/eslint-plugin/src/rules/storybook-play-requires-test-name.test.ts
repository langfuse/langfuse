import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./storybook-play-requires-test-name.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
  },
});

ruleTester.run("storybook-play-requires-test-name", rule, {
  valid: [
    `export const Default = meta.story({ args: {} });`,
    `const helper = { play: async () => {} };`,
    `export const Default = meta.story({ nested: { play: async () => {} } });`,
    `export const Default = meta.story({ 1: "one" });`,
    `export const Interaction = other.factory({ play: async () => {} });`,
    `export const Interaction = meta.story({
      name: "(Test) Opens menu",
      play: async () => {},
    });`,
    `export const Interaction = meta.story({
      "name": "(Test) Opens menu",
      "play": async () => {},
    });`,
    `export const Interaction = meta.story({
      ["play"]: async () => {},
    });`,
    `export const Interaction = {
      name: "(Test) Opens menu",
      play: async () => {},
    };`,
  ],
  invalid: [
    {
      code: `export const OpensMenu = meta.story({ play: async () => {} });`,
      errors: [{ messageId: "testNameRequired" }],
    },
    {
      code: `export const OpensMenu = meta.story({
        name: "Opens menu",
        play: async () => {},
      });`,
      errors: [{ messageId: "testNameRequired" }],
    },
    {
      code: `export const OpensMenu = {
        name: "Test Opens menu",
        play: async () => {},
      };`,
      errors: [{ messageId: "testNameRequired" }],
    },
    {
      code: `export const OpensMenu = meta.story({
        name: \`(Test) Opens menu\`,
        play: async () => {},
      });`,
      errors: [{ messageId: "testNameRequired" }],
    },
    {
      code: `export const OpensMenu = meta.story({
        name: 42,
        play: async () => {},
      });`,
      errors: [{ messageId: "testNameRequired" }],
    },
  ],
});
