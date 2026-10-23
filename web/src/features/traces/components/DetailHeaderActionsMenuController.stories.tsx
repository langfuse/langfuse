import { EllipsisVertical } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { DetailHeaderActionsMenuController } from "./DetailHeaderActionsMenuController";
import preview from "../../../../.storybook/preview";

function DetailHeaderActionsMenuStory() {
  return (
    <DetailHeaderActionsMenuController
      idItems={[{ id: "storybook-trace", name: "Trace ID" }]}
      isAdmin={false}
      projectId="storybook-project"
    >
      {({ getTriggerProps }) => (
        <Button
          aria-label="Options"
          size="icon-xs"
          title="Options"
          variant="ghost"
          {...getTriggerProps()}
        >
          <EllipsisVertical size="sm" color="default" />
        </Button>
      )}
    </DetailHeaderActionsMenuController>
  );
}

const meta = preview.meta({
  component: DetailHeaderActionsMenuStory,
  parameters: {
    layout: "centered",
    nextjs: {
      router: {
        asPath: "/project/storybook-project/traces/storybook-trace",
      },
    },
  },
});

export const Default = meta.story({});
