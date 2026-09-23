import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { NoulCriteriaEditor } from "./NoulCriteriaEditor";

const meta = preview.meta({ component: NoulCriteriaEditor });

export const Collapsed = meta.story({
  args: { criteria: { true: "", false: "" }, onChange: fn() },
  render: (args) => {
    const [criteria, setCriteria] = useState(args.criteria);
    return (
      <NoulCriteriaEditor
        {...args}
        criteria={criteria}
        onChange={(next) => {
          setCriteria(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const Refined = meta.story({
  args: {
    criteria: {
      true: "The user clearly asks for money back, a refund, or a chargeback.",
      false: "A complaint or question without asking for money back.",
    },
    onChange: fn(),
  },
});
