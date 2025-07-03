import { Divider } from "@tremor/react";

import { usePlaygroundContext } from "./PlaygroundColumnProvider";
import { MessagePlaceholderComponent } from "./MessagePlaceholderComponent";
import { type PlaceholderMessageFillIn } from "../types";

export const MessagePlaceholders = () => {
  const { messagePlaceholders } = usePlaygroundContext();

  return (
    <div className="flex h-full flex-col">
      <p className="font-semibold">Message Placeholders</p>
      {messagePlaceholders.length === 0 ? (
        <div className="mt-4 text-xs">
          <p className="mb-2">No message placeholders defined.</p>
          <p>
            Placeholders can be used to e.g. inject message histories into
            prompts.
          </p>
        </div>
      ) : (
        <div className="h-full overflow-auto">
          {messagePlaceholders
            .slice()
            .sort(
              (a: PlaceholderMessageFillIn, b: PlaceholderMessageFillIn) => {
                if (a.isUsed && !b.isUsed) return -1;
                if (!a.isUsed && b.isUsed) return 1;
                return a.name.localeCompare(b.name);
              },
            )
            .map((placeholder: PlaceholderMessageFillIn, index: number) => (
              <div key={placeholder.name}>
                <MessagePlaceholderComponent messagePlaceholder={placeholder} />
                {index !== messagePlaceholders.length - 1 && (
                  <Divider className="my-2 text-muted-foreground" />
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
