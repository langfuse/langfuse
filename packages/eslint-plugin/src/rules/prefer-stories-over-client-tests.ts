import { existsSync } from "node:fs";

import { createRule } from "../util.js";

const rule = createRule({
  name: "prefer-stories-over-client-tests",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer Storybook stories over client tests for the same file.",
    },
    messages: {
      preferStories:
        '"{{ story }}" already exists for this file. Move this client test\'s scenarios into Storybook stories (use play functions for interactions and assertions), then remove the duplicate .clienttest file.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        const filename = context.filename;
        const match = filename.match(/\.clienttest\.(?:ts|tsx)$/);
        if (!match) return;

        const base = filename.slice(0, -match[0].length);
        for (const extension of ["ts", "tsx"]) {
          const story = `${base}.stories.${extension}`;
          if (!existsSync(story)) continue;

          context.report({
            node,
            messageId: "preferStories",
            data: { story },
          });
          return;
        }
      },
    };
  },
});

export default rule;
