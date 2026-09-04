import preview from "../../../../../../../../.storybook/preview";
import { VariableMappingBinding } from "./VariableMappingBinding";

const meta = preview.meta({ component: VariableMappingBinding });

export const Default = meta.story({
  args: {
    columnLabel: "Metadata",
    jsonSelector: "$.source",
  },
});

export const LongPath = meta.story({
  args: {
    columnLabel: "Input",
    jsonSelector: "$.customer.support.tickets[*].messages[*].content",
  },
});
