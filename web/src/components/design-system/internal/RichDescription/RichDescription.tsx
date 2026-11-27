import { SquareArrowOutUpRight } from "@langfuse/icons";

import { assertUnreachable } from "@/src/utils/types";

export type RichDescription =
  | string
  | readonly (
      | { type: "text"; text: string }
      | { type: "code"; text: string }
      | { type: "link"; text: string; href: string }
      | { type: "strong"; text: string }
    )[];

export function RichDescription({
  description,
}: {
  description: RichDescription;
}) {
  if (typeof description === "string") return description;

  return description.map((element, index) => {
    if (element.type === "text") return element.text;
    if (element.type === "code") {
      return (
        <code
          key={index}
          className="bg-muted rounded-md px-1 py-px font-mono text-xs"
        >
          {element.text}
        </code>
      );
    }
    if (element.type === "link") {
      return (
        <a
          key={index}
          className="text-link hover:text-link-hover underline underline-offset-2"
          href={element.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {element.text}
          <SquareArrowOutUpRight
            aria-hidden
            size="sm"
            color="muted"
            __rawClassName="ml-0.75 inline-block align-[-1px]"
          />
        </a>
      );
    }
    if (element.type === "strong") {
      return (
        <strong key={index} className="text-foreground font-bold">
          {element.text}
        </strong>
      );
    }
    return assertUnreachable(element);
  });
}
