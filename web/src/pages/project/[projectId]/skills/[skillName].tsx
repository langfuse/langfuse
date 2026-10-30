import { ExistingSkillPage } from "@/src/features/skills/components/SkillEditorPage";
import { SkillsFeatureGate } from "@/src/features/skills/components/SkillsFeatureGate";

export default function ExistingSkill() {
  return (
    <SkillsFeatureGate>
      <ExistingSkillPage />
    </SkillsFeatureGate>
  );
}
