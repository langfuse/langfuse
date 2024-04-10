import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { CodeView } from "@/src/components/ui/code";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
// import { CreatePromptDialog } from "@/src/features/prompts/components/new-prompt-button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { extractVariables } from "@/src/utils/string";
import { type Prompt } from "@langfuse/shared/src/db";
import { Pencil } from "lucide-react";
// import { PromptHistoryNode } from "./prompt-history";
// import { PromotePrompt } from "@/src/features/prompts/components/promote-prompt";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { useQueryParam, StringParam } from "use-query-params";
import router from "next/router";
import { JSONView } from "@/src/components/ui/code";
// import { DeletePromptVersion } from "@/src/features/prompts/components/delete-prompt-version";
import { jsonSchema } from "@/src/utils/zod";
import { Edit } from "lucide-react";
import clsx from "clsx";

export type TasksDetailProps = {
  projectId: string;
  taskName: string;
};

function SideButton(props: {
  active: boolean;
  name: string;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        className={clsx(
          props.active
            ? "bg-gray-50 text-indigo-600"
            : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
          "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
        )}
        onClick={props.onClick}
      >
        {props.name}
      </button>
    </div>
  );
}

export const TasksDetail = (props: TasksDetailProps) => {
  const [_currentSchema, setCurrentSchema] = useQueryParam(
    "schema",
    StringParam,
  );
  const currentSchema: "Bot" | "Input" | "Output" =
    _currentSchema === "Output"
      ? "Output"
      : _currentSchema === "Input"
        ? "Input"
        : "Bot";

  const task = api.tasks.byName.useQuery({
    name: props.taskName,
    projectId: props.projectId,
  })?.data;

  console.log(task, props.taskName);

  if (!task) {
    return <div>Loading...</div>;
  }

  const schemaMap = {
    Bot: task.botSchema,
    Input: task.inputSchema,
    Output: task.outputSchema,
  } as const;

  const schema = schemaMap[currentSchema];

  return (
    <div className="flex flex-col xl:container md:h-[calc(100vh-2rem)]">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3">
          <Header
            title={task.name}
            breadcrumb={[
              {
                name: "Tasks",
                href: `/project/${props.projectId}/tasks/`,
              },
              {
                name: task.name,
                href: `/project/${props.projectId}/tasks/${encodeURIComponent(props.taskName)}`,
              },
            ]}
          />
        </div>
        <div className="col-span-2 md:h-full">
          <p>
            See{" "}
            <a
              href="https://rjsf-team.github.io/react-jsonschema-form/"
              target="_blank"
              className="font-medium text-blue-600 hover:underline dark:text-blue-500"
            >
              JSON Schema Playground
            </a>{" "}
            for formatting options.
          </p>
          <br />
          {/* Is there a better way to display this? */}
          <CodeView
            content={JSON.stringify(schema.schema, null, 2)}
            title={`${currentSchema} Schema`}
          />

          <br />
          <CodeView
            content={JSON.stringify(schema.uiSchema, null, 2)}
            title={`${currentSchema} UI Schema`}
            tools={[
              <Button
                variant="secondary"
                size="xs"
                onClick={() => console.log("edit")}
              >
                <Edit className="h-3 w-3" />
              </Button>,
            ]}
          />
        </div>
        <div className="flex h-screen flex-col">
          <div className="text-m px-3 font-medium">
            <ScrollArea className="border-l pl-2">
              <SideButton
                name="Bot Schema"
                active={currentSchema === "Bot"}
                onClick={() => setCurrentSchema("Bot")}
              />
              <SideButton
                name="Input Schema"
                active={currentSchema === "Input"}
                onClick={() => setCurrentSchema("Input")}
              />
              <SideButton
                name="Output Schema"
                active={currentSchema === "Output"}
                onClick={() => setCurrentSchema("Output")}
              />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export function UpdatePrompt({
  projectId,
  prompt,
  isLoading,
}: {
  projectId: string;
  prompt: Prompt | undefined;
  isLoading: boolean;
}) {
  const hasAccess = useHasAccess({ projectId, scope: "tasks:CUD" });

  const handlePromptEdit = () => {
    void router.push(
      `/project/${projectId}/tasks/${prompt?.id}/edit`,
      undefined,
      {
        shallow: true,
      },
    );
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => handlePromptEdit()}
      disabled={!hasAccess}
      loading={isLoading}
    >
      <Pencil className="h-5 w-5" />
    </Button>
  );
}
