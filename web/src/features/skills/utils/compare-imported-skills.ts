import { Sha256 } from "@aws-crypto/sha256-browser";
import type {
  DiscoveredSkill,
  ComparedSkill,
} from "../components/skillImportTypes";

export async function compareImportedSkills(
  skills: DiscoveredSkill[],
  existingSkills: {
    name: string;
    files: { path: string; sha256Hash: string }[];
  }[],
): Promise<ComparedSkill[]> {
  const existingByName = new Map(
    existingSkills.map((skill) => [skill.name, skill]),
  );
  return Promise.all(
    skills.map(async (skill) => {
      const existing = existingByName.get(skill.name);
      let hasChanges = false;
      if (existing && !skill.error) {
        const hashesByPath = new Map(
          existing.files.map((file) => [file.path, file.sha256Hash]),
        );
        const hashes = await Promise.all(
          skill.files.map(async (file) => {
            const sha256 = new Sha256();
            sha256.update(new TextEncoder().encode(file.content));
            const digest = await sha256.digest();
            return {
              path: file.path,
              hash: btoa(String.fromCharCode(...digest)),
            };
          }),
        );
        hasChanges =
          existing.files.length !== skill.files.length ||
          hashes.some(({ path, hash }) => hashesByPath.get(path) !== hash);
      }
      return { ...skill, exists: Boolean(existing), hasChanges };
    }),
  );
}
