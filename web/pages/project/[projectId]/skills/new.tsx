import { NewSkillPage } from "@/src/ai/skills/components/SkillEditorPage";
import { SkillsFeatureGate } from "@/src/ai/skills/components/SkillsFeatureGate";

export default function NewSkill() {
  return (
    <SkillsFeatureGate>
      <NewSkillPage />
    </SkillsFeatureGate>
  );
}
