import { Separator } from "@/src/components/ui/separator";
import { usePlaygroundContext } from "../context";
import { MessagePlaceholderComponent } from "./MessagePlaceholderComponent";

export const MessagePlaceholders = () => {
  const { messagePlaceholders } = usePlaygroundContext();

  return (
    <div className="flex h-full flex-col">
      {messagePlaceholders.length === 0 ? (
        <div className="text-xs">
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
            .sort((a, b) => {
              if (a.isUsed && !b.isUsed) return -1;
              if (!a.isUsed && b.isUsed) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((placeholder, index) => (
              <div key={placeholder.name}>
                <MessagePlaceholderComponent messagePlaceholder={placeholder} />
                {index !== messagePlaceholders.length - 1 && (
                  <Separator className="my-2" />
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
