import { NewSkillPage } from "@/src/features/skills/components/SkillEditorPage";
import { SkillsFeatureGate } from "@/src/features/skills/components/SkillsFeatureGate";

export default function NewSkill() {
  return (
    <SkillsFeatureGate>
      <NewSkillPage />
    </SkillsFeatureGate>
  );
}
