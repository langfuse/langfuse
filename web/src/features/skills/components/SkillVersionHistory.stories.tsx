import preview from "../../../../.storybook/preview";
import { SkillVersionHistory } from "./SkillVersionHistory";

const meta = preview.meta({ component: SkillVersionHistory });

export const NewSkill = meta.story({
  args: { kind: "new" },
});
