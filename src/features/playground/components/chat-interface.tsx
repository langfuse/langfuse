import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { TextareaAutosize } from "@/src/components/ui/textarea-autosize";
import { nanoid, type Message } from "ai";
import { LockIcon, MinusCircleIcon, PlusIcon } from "lucide-react";
import { type Dispatch, type SetStateAction } from "react";

const toggleMessageRole = (role?: string) => {
  switch (role) {
    case "system":
    case "assistant":
      return "user";

    case "user":
      return "assistant";

    default:
      return "system";
  }
};

export function ChatInterface({
  hasCUDAccess,
  messages,
  setMessages,
}: {
  hasCUDAccess: boolean;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
}) {
  return (
    <div className="flex w-full grow flex-col space-y-2 divide-y overflow-y-auto">
      {messages.map((message, i) => (
        <div className="group flex items-center gap-3 p-3" key={message.id}>
          <Button
            className="min-w-28"
            variant="ghost"
            onClick={() =>
              setMessages((prev) => {
                const foundMessage = prev.find(({ id }) => id === message.id);
                if (foundMessage) {
                  switch (foundMessage.role) {
                    case "system":
                      foundMessage.role = "user";
                      break;

                    case "user":
                      foundMessage.role = "assistant";
                      break;

                    case "assistant":
                      foundMessage.role = i === 0 ? "system" : "user";
                      break;
                  }
                }
                return [...prev];
              })
            }
          >
            <Badge variant="outline">{message.role}</Badge>
          </Button>
          <TextareaAutosize
            className="min-h-8 flex-1 font-mono text-xs"
            value={message.content}
            placeholder={`Enter a ${message.role} input here.`}
            onChange={(e) =>
              setMessages((prev) => {
                const foundMessage = prev.find(({ id }) => id === message.id);
                if (foundMessage) {
                  foundMessage.content = e.target.value;
                }
                return [...prev];
              })
            }
          />
          <Button
            className="invisible group-hover:visible"
            variant="ghost"
            onClick={() =>
              setMessages((prev) => prev.filter(({ id }) => id !== message.id))
            }
          >
            <MinusCircleIcon aria-hidden="true" />
          </Button>
        </div>
      ))}

      <Button
        className="mt-4 self-start"
        variant="secondary"
        disabled={!hasCUDAccess}
        onClick={() =>
          setMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: toggleMessageRole(prev.at(-1)?.role),
              content: "",
            },
          ])
        }
      >
        {hasCUDAccess ? (
          <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
        ) : (
          <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
        )}
        New input
      </Button>
    </div>
  );
}
