import preview from "@/.storybook/preview";
import { GatewayDefaultBudgetTag } from "./GatewayDefaultBudgetTag";

const meta = preview.meta({ component: GatewayDefaultBudgetTag });

export const Key = meta.story({ args: { subject: "key" } });

export const User = meta.story({ args: { subject: "user" } });
