import type { ReactElement } from "react";
import { Slot } from "@radix-ui/react-slot";
import { HOST_ATTRIBUTE } from "../internal/Illustrations/engine/usePlayback";

type IllustrationHostProps = {
  /** One element, such as a card or a link, that forwards its props to the DOM. */
  children: ReactElement;
};

/**
 * Makes its child the hover area for the illustrations inside it: hovering anywhere on the card lifts their hero
 * and plays a `motion="hover"` illustration. Adds no element of its own.
 */
export function IllustrationHost({ children }: IllustrationHostProps) {
  return <Slot {...{ [HOST_ATTRIBUTE]: "" }}>{children}</Slot>;
}
