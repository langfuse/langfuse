import { FolderInput, Lock } from "@langfuse/icons";

import preview from "../../../../.storybook/preview";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

const meta = preview.meta({
  component: EmptyState,
  args: {
    icon: Lock,
    title: "The AI Gateway isn't set up yet",
    description: "Ask your organization admin to set up the AI Gateway.",
  },
});

export const Default = meta.story({});

export const WithActions = meta.story({
  args: {
    icon: FolderInput,
    title: "Set up an ingestion project first",
    description:
      "Gateway traffic needs a project to be recorded in. Credentials, models and API keys become available once it is set.",
    children: (
      <>
        <Button text="Create ingestion project" />
        <Button text="Use existing project" variant="secondary" />
      </>
    ),
  },
});
