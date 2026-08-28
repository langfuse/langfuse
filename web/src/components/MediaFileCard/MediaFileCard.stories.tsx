import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
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

export const TruncatedMimeType = meta.story({
  args: {
    contentType:
      "application/vnd.example.intentionally-verbose-archive-format-for-truncation",
    fileName: "archive.bin",
    onClick: fn(),
  },
});

export const OfficeFormats = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-3">
      <MediaFileCard
        contentType="application/msword"
        fileName="report.doc"
        onClick={fn()}
      />
      <MediaFileCard
        contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fileName="report.docx"
        onClick={fn()}
      />
      <MediaFileCard
        contentType="application/vnd.ms-excel"
        fileName="report.xls"
        onClick={fn()}
      />
      <MediaFileCard
        contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        fileName="report.xlsx"
        onClick={fn()}
      />
    </div>
  ),
});
