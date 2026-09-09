import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { WILDCARD } from "@/src/features/evals/v2/fns/variableMapping/segmentsToJsonPath";
import { SampleDataTreeSelector } from "./SampleDataTreeSelector";

const roots = [
  {
    id: "input",
    label: "Input",
    value: {
      messages: [
        { role: "user", content: "Where is my order?" },
        { role: "assistant", content: "Your order arrives tomorrow." },
      ],
    },
  },
  {
    id: "output",
    label: "Output",
    value: { answer: "Your order arrives tomorrow." },
  },
  { id: "metadata", label: "Metadata", value: { locale: "en-US" } },
];

const meta = preview.meta({ component: SampleDataTreeSelector });

export const Default = meta.story({
  args: {
    variable: "input",
    roots,
    currentColumnId: null,
    currentSegments: null,
    onSelect: fn(),
  },
});

export const CurrentMapping = meta.story({
  args: {
    variable: "input",
    roots,
    currentColumnId: "input",
    currentSegments: ["messages", WILDCARD, "content"],
    onSelect: fn(),
  },
});

export const MediaReference = meta.story({
  args: {
    variable: "input",
    roots: [
      {
        id: "input",
        label: "Input",
        value: {
          attachments: [
            {
              filename: "cache-hit-ratio.png",
              content_type: "image/png",
              media:
                "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
            },
          ],
        },
      },
    ],
    currentColumnId: "input",
    currentSegments: ["attachments", 0, "media"],
    onSelect: fn(),
  },
});
