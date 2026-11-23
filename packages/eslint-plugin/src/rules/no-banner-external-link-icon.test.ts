import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-banner-external-link-icon.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-banner-external-link-icon", rule, {
  valid: [
    // Banner adds the icon to links that open a new tab.
    `<Banner actions={[{ text: "Docs", href: "https://langfuse.com/docs" }]} />`,
    `<Banner actions={[{ text: "Open settings", href: "/settings", newTab: true }]} />`,
    `<Banner actions={[{ text: "Open settings", href: "/settings" }]} />`,
    `<Banner actions={[{ "text": "Open settings", href: "/settings" }]} />`,
    // Other icons are fine.
    `<Banner actions={[{ text: "Reactivate", icon: RefreshCcw, onClick }]} />`,
    `<Banner actions={[{ text: "Settings", icon: icons.Settings, onClick }]} />`,
    // Only Banner's actions are checked.
    `<Menu actions={[{ text: "Open", icon: ExternalLink, onClick }]} />`,
    `<Kit.Banner actions={[{ text: "Open", icon: ExternalLink, onClick }]} />`,
    `<Banner meta={{ icon: ExternalLink }} />`,
    `<Banner data:meta={{ icon: ExternalLink }} />`,
    `<Banner icon={ExternalLink} />`,
    `const action = { text: "Open", icon: ExternalLink };`,
  ],
  invalid: [
    {
      code: `<Banner actions={[{ text: "Open", href: "/settings", icon: ExternalLinkIcon }]} />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<Banner actions={[{ text: "Open", icon: ExternalLink, onClick }]} />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<Banner actions={[{ text: "Docs", href: "https://langfuse.com", icon: SquareArrowOutUpRight }]} />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      // Conditional and spread entries are still Banner actions.
      code: `<Banner actions={[...(canOpen ? [{ text: "Open", icon: ExternalLinkIcon, onClick }] : [])]} />`,
      errors: [{ messageId: "unexpected" }],
    },
  ],
});
