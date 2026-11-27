import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./storybook-play-no-implementation-detail-assertions.js";

const ruleTester = new RuleTester({
  languageOptions: { parser: typescriptEslintParser },
});

ruleTester.run("storybook-play-no-implementation-detail-assertions", rule, {
  valid: [
    `const helper = { play: () => expect(element).toHaveClass("active") };`,
    `export const Default = meta.story({ args: { play: () => expect(element).toHaveClass("active") } });`,
    `export const Default = meta.story({ play: expect(element).toHaveClass("active") });`,
    `function helper() { expect(element).toHaveClass("active"); }`,
    `expect(element).toHaveClass("active");`,
    `export const Default = meta.story({ render: () => expect(element).toHaveClass("active") });`,
    `export const Default = meta.story({ play: () => expect(element).toBeVisible() });`,
    `export const Default = meta.story({ play: () => check(element) });`,
    `export const Default = meta.story({ play: () => expect(element)[matcher]("active") });`,
    `export const Default = meta.story({ [key]: () => expect(element).toHaveClass("active") });`,
    `export const Default = meta.story({ 1: () => expect(element).toHaveClass("active") });`,
    `Default.render = () => expect(element).toHaveClass("active");`,
    `Default[key] = () => expect(element).toHaveClass("active");`,
    `play = () => expect(element).toHaveClass("active");`,
  ],
  invalid: [
    `export const Default = meta["story"]({ play() { expect(element).toHaveClass("active"); } });`,
    `export const Default = meta.story({ play: async () => { await expect(element).toHaveClass("active"); } });`,
    `export const Default = { play: () => expect(element).not.toHaveClass("hidden") };`,
    `export const Default = meta.story({ "play": () => expect(element)["toHaveClass"]("active") });`,
    `export const Default = meta.story({ ["play"]: () => expect(element).toHaveClass("active") });`,
    `export const Default = meta.story({ play: async () => { await step("check", () => expect(element).toHaveClass("active")); } });`,
    `Default.play = () => expect(element).toHaveClass("active");`,
    `Default["play"] = () => expect(element).toHaveClass("active");`,
  ].map((code) => ({ code, errors: [{ messageId: "toHaveClass" }] })),
});
