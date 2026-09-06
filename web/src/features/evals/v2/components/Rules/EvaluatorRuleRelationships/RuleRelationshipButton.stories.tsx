import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { RuleRelationshipButton } from "./RuleRelationshipButton";

const meta = preview.meta({ component: RuleRelationshipButton });

export const Default = meta.story({
  args: {
    count: 2,
    onClick: fn(),
  },
});

export const NoAttachedRules = meta.story({
  args: {
    count: 0,
    shouldCallAttention: true,
    onClick: fn(),
  },
});
