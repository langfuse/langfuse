import { useMemo } from "react";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { UserIcon, SparkleIcon } from "lucide-react";
import { deepParseJson } from "@langfuse/shared";
import { StringOrMarkdownSchema } from "@/src/components/schemas/MarkdownSchema";
import { DjbView } from "@/src/components/ui/DjbView";
import { InternalThoughts } from "./InternalThoughts";
import { MessageScores } from "./MessageScores";
import type { ConversationMessage as ConversationMessageType } from "./types";

interface ConversationMessageProps {
  message: ConversationMessageType;
  projectId: string;
  sessionNumber: string;
  turnNumber: number;
  sessionId: string;
}

export const ConversationMessage = ({
  message,
  projectId,
  sessionNumber,
  turnNumber,
  sessionId,
}: ConversationMessageProps) => {
  const input = deepParseJson(message.input);
  const output = deepParseJson(message.output);

  const stringOrValidatedMarkdownOutput = useMemo(
    () => StringOrMarkdownSchema.safeParse(output),
    [output],
  );

  const stringOrValidatedMarkdownInput = useMemo(
    () => StringOrMarkdownSchema.safeParse(input),
    [input],
  );

  return (
    <>
      {input && (
        <div className="grid max-w-screen-sm gap-2">
          <div className="flex flex-row items-center gap-2">
            <Avatar>
              <AvatarFallback>
                <UserIcon className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="font-mono text-sm font-bold">{message.userId}</div>
            <div className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleString()}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-secondary p-2 pb-4 text-sm">
            <DjbView
              title="Input"
              markdown={stringOrValidatedMarkdownInput.data as string}
              customCodeHeaderClassName="bg-secondary"
              media={[]}
            />
          </div>
        </div>
      )}
      {output && (
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="grid max-w-screen-sm gap-2">
              <div className="flex flex-row items-center gap-2">
                <Avatar>
                  <AvatarFallback className="bg-pink-600 text-white">
                    <SparkleIcon className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="font-mono text-sm font-bold">DJB</div>
                <div className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleString()}
                </div>
              </div>
              <div className="relative overflow-hidden rounded-lg bg-secondary p-2 pb-4 text-sm">
                <DjbView
                  markdown={stringOrValidatedMarkdownOutput.data as string}
                  title="Output"
                  customCodeHeaderClassName=""
                />
              </div>

              <InternalThoughts projectId={projectId} output={output} />
            </div>
          </div>
          <div id="scores-container" className="flex-1 py-4">
            <div className="text-sm font-bold">Scores - Turn {turnNumber}</div>
            <div id="inner-container" className="pt-2">
              <MessageScores
                id={message.id}
                projectId={projectId}
                sessionNumber={sessionNumber}
                turnNumber={turnNumber}
                sessionId={sessionId}
                conversationUserName={message.userId || ""}
              />
            </div>
          </div>
        </div>
      )}
      {!input && !output && (
        <div className="border border-dashed border-white text-sm text-muted-foreground">
          This trace has no input or output messages.
        </div>
      )}
    </>
  );
};
