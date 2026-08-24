import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { MediaFileCard } from "./MediaFileCard";

const meta = preview.meta({
  component: MediaFileCard,
});

export const Default = meta.story({
  args: {
    contentType: "application/pdf",
    fileName: "report.pdf",
    onClick: fn(),
  },
});

export const VerboseMimeType = meta.story({
  args: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: "report.docx",
    onClick: fn(),
  },
});
