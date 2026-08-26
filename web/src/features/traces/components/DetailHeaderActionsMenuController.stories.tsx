import { EllipsisVertical } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DetailHeaderActionsMenuController } from "./DetailHeaderActionsMenuController";
import preview from "../../../../.storybook/preview";

function DetailHeaderActionsMenuStory() {
  return (
    <DetailHeaderActionsMenuController
      idItems={[{ id: "storybook-trace", name: "Trace ID" }]}
      projectId="storybook-project"
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <Button
            aria-label="Options"
            size="icon-xs"
            title="Options"
            variant="ghost"
          >
            <EllipsisVertical className="h-4 w-4" />
          </Button>
        </Trigger>
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
