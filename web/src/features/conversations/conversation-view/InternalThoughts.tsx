import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { api } from "@/src/utils/api";
import { Eye, EyeOff } from "lucide-react";
import { StringOrMarkdownSchema } from "@/src/components/schemas/MarkdownSchema";

interface InternalThoughtsProps {
  projectId: string;
  output: any;
  messageId?: string;
  threadId?: string;
}

export const InternalThoughts = ({
  projectId,
  output,
  messageId,
  threadId,
}: InternalThoughtsProps) => {
  const [showInternalThoughts, setShowInternalThoughts] = useState(false);

  const stringOrValidatedMarkdownOutput =
    StringOrMarkdownSchema.safeParse(output);

  // Fetch internal thoughts data
  const internalThoughts = api.conversation.getInternalThoughts.useQuery(
    {
      projectId,
      ...(threadId && messageId
        ? { threadId, messageId }
        : { messageText: stringOrValidatedMarkdownOutput.data as string }),
    },
    {
      enabled:
        showInternalThoughts &&
        (Boolean(threadId && messageId) ||
          Boolean(stringOrValidatedMarkdownOutput.data)),
    },
  );

  return (
    <>
      {/* Show Internal Thoughts Button */}
      <div className="mt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInternalThoughts(!showInternalThoughts)}
          className="flex items-center gap-2"
        >
          {showInternalThoughts ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {showInternalThoughts
            ? "Hide Internal Thoughts"
            : "Show Internal Thoughts"}
        </Button>
      </div>

      {/* Internal Thoughts Display */}
      {showInternalThoughts && (
        <div className="mt-3 rounded-lg border bg-muted p-3">
          {internalThoughts.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border border-gray-300 border-t-blue-600"></div>
              Loading internal thoughts...
            </div>
          )}

          {internalThoughts.error && (
            <div className="text-sm text-red-600">
              Error loading internal thoughts: {internalThoughts.error.message}
            </div>
          )}

          {internalThoughts.data && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                Internal Thoughts:
              </div>
              {internalThoughts.data.thoughts.length === 0 ? (
                <div className="text-sm italic text-muted-foreground">
                  No internal thoughts found for this message.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* one thought is one json */}
                  {/* relevant keys in the json: new_parsed_information, next_step_in_session, knowledge_for_next_step */}
                  {internalThoughts.data.thoughts.map((thought, index) => {
                    let parsedThought;
                    try {
                      parsedThought = thought;
                    } catch (error) {
                      // If parsing fails, show the original text
                      return (
                        <div
                          key={index}
                          className="rounded border bg-background p-2 text-sm"
                        >
                          <pre className="whitespace-pre-wrap font-mono text-xs">
                            {String(thought)}
                          </pre>
                        </div>
                      );
                    }

                    // Ensure parsedThought is a valid object
                    if (!parsedThought || typeof parsedThought !== "object") {
                      return (
                        <div
                          key={index}
                          className="rounded border bg-background p-2 text-sm"
                        >
                          <pre className="whitespace-pre-wrap font-mono text-xs">
                            {String(thought)}
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <div key={index} className="space-y-3">
                        {/* New Parsed Information */}
                        {parsedThought?.new_parsed_information && (
                          <div className="rounded border bg-background">
                            <JSONView
                              json={parsedThought.new_parsed_information}
                              title="New Parsed Information"
                              className="text-sm"
                              codeClassName="p-3"
                              collapseStringsAfterLength={500}
                              externalJsonCollapsed={true}
                            />
                          </div>
                        )}

                        {/* Next Step in Session */}
                        {parsedThought?.next_step_in_session && (
                          <div className="rounded border bg-background">
                            <JSONView
                              json={parsedThought.next_step_in_session}
                              title="Next Step in Session"
                              className="text-sm"
                              codeClassName="p-3"
                              collapseStringsAfterLength={500}
                              externalJsonCollapsed={true}
                            />
                          </div>
                        )}

                        {/* Knowledge for Next Step */}
                        {parsedThought?.knowledge_for_next_step && (
                          <div className="rounded border bg-background">
                            <JSONView
                              json={{
                                knowledge_for_next_step:
                                  parsedThought.knowledge_for_next_step,
                              }}
                              title="Knowledge for Next Step"
                              className="text-sm"
                              codeClassName="p-3"
                              collapseStringsAfterLength={500}
                              externalJsonCollapsed={true}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
