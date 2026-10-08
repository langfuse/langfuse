import preview from "../../../.storybook/preview";
import { CommentCountIcon } from "./CommentCountIcon";

const meta = preview.meta({
  component: CommentCountIcon,
  args: { count: 3 },
});

export const Single = meta.story({ args: { count: 1 } });
export const TwoDigits = meta.story({ args: { count: 42 } });
export const Capped = meta.story({ args: { count: 1234 } });
