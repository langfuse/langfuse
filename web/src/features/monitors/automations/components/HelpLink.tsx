import { SquareArrowOutUpRight } from "@langfuse/icons";

/** HelpLink renders an underlined external link that sits inside field help text and opens in a new tab. */
export function HelpLink({ href, text }: { href: string; text: string }) {
  return (
    <a
      className="text-link hover:text-link-hover underline underline-offset-2"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {text}
      <SquareArrowOutUpRight
        aria-hidden
        size="sm"
        color="muted"
        __rawClassName="ml-0.75 inline-block align-[-1px]"
      />
    </a>
  );
}
