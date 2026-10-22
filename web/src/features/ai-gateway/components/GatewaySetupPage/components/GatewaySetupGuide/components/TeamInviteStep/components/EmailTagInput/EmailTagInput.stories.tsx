import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { EmailTagInput } from "./EmailTagInput";

const meta = preview.meta({ component: EmailTagInput });

export const Empty = meta.story({
  args: { id: "team-invite-emails", value: [], onChange: fn() },
});

export const WithEmails = meta.story({
  args: {
    ...Empty.input.args,
    value: ["ada@company.com", "grace@company.com", "not-an-email"],
  },
});
