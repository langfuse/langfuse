import { RuleTester } from "@typescript-eslint/rule-tester";
import * as parser from "@typescript-eslint/parser";
import rule from "./no-raw-img.js";

const tester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
});

tester.run("no-raw-img", rule, {
  valid: [
    '<Image src="https://example.com/a.png" alt="" />',
    'import { Image } from "./Image";',
    'import type { StaticImageData } from "next/image";',
    'import { type StaticImageData } from "next/image";',
  ],
  invalid: [
    {
      code: 'import Image, { type StaticImageData } from "next/image";',
      errors: [{ messageId: "unsafeImage" }],
    },
    {
      code: '<img src="https://attacker.example/a.png" alt="" />',
      errors: [{ messageId: "unsafeImage" }],
    },
    {
      code: 'import Image from "next/image";',
      errors: [{ messageId: "unsafeImage" }],
    },
    {
      code: 'import { default as OtherImage } from "next/image";',
      errors: [{ messageId: "unsafeImage" }],
    },
    {
      filename: "/repo/components/Image.tsx",
      code: '<img src="/icon.svg" alt="" />',
      errors: [{ messageId: "unsafeImage" }],
    },
  ],
});
