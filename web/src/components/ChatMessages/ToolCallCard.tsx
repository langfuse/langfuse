import { type LLMToolCall } from "@langfuse/shared";

export const ToolCallCard: React.FC<{ toolCall: LLMToolCall }> = ({
  toolCall,
}) => {
  return (
    <div className="my-1 rounded border border-gray-200 p-2 text-sm dark:border-gray-700">
      <div className="flex flex-row gap-4">
        <div className="flex w-[15%] flex-col overflow-hidden">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Tool called
          </div>
          <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
            {toolCall.name}
          </div>
        </div>
        <div className="w-[50%] flex-1 overflow-hidden">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Arguments
          </div>
          <pre className="mt-1 max-h-24 overflow-x-auto overflow-y-auto rounded bg-gray-50 p-2 font-mono text-xs leading-tight dark:bg-gray-800">
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>
        </div>
        <div className="flex w-[25%] flex-col overflow-hidden">
          <div className="text-xs text-gray-500 dark:text-gray-400">ID</div>
          <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {toolCall.id}
          </div>
        </div>
      </div>
    </div>
  );
};
