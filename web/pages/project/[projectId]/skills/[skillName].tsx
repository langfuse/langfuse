import { ExistingSkillPage } from "@/src/ai/skills/components/SkillEditorPage";
import { SkillsFeatureGate } from "@/src/ai/skills/components/SkillsFeatureGate";

export default function ExistingSkill() {
  return (
    <SkillsFeatureGate>
      <ExistingSkillPage />
    </SkillsFeatureGate>
  );
}
