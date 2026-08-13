import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { SessionMetadataJsonPathControlView } from "@/src/components/session/SessionMetadataJsonPathControlView";

const handlers = {
  onEditorOpenChange: fn(),
  onSave: fn(),
  onRemove: fn(),
};

const meta = preview.meta({
  component: SessionMetadataJsonPathControlView,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Configured = meta.story({
  args: {
    paths: ["$.langfuse_user_email", "$.cloud_region"],
    source: {
      state: "ready",
      metadata: {
        langfuse_user_email: "danielm@nexite.io",
        cloud_region: "EU",
      },
      metadataTruncated: false,
    },
    isEditorOpen: false,
    ...handlers,
  },
});

export const EditorOpen = meta.story({
  args: {
    paths: ["$.langfuse_user_email"],
    source: {
      state: "ready",
      metadata: { langfuse_user_email: "danielm@nexite.io" },
      metadataTruncated: false,
    },
    isEditorOpen: true,
    ...handlers,
  },
});
