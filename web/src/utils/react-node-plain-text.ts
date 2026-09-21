import {
  Children,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";

export function getPlainTextFromReactNode(node: ReactNode): string | undefined {
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "bigint"
  ) {
    return String(node);
  }

  if (Array.isArray(node)) {
    const text = node
      .map((child) => getPlainTextFromReactNode(child))
      .filter((child): child is string => child !== undefined)
      .join("");

    return text || undefined;
  }

  if (isValidElement(node)) {
    return getPlainTextFromReactNode(
      (node as ReactElement<{ children?: ReactNode }>).props.children,
    );
  }

  if (node && typeof node === "object" && Symbol.iterator in node) {
    return getPlainTextFromReactNode(
      Children.toArray(node as Iterable<ReactNode>),
    );
  }

  return undefined;
}
