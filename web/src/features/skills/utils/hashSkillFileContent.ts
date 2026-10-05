import { Sha256 } from "@aws-crypto/sha256-browser";

export async function hashSkillFileContent(content: string): Promise<string> {
  const hash = new Sha256();
  hash.update(new TextEncoder().encode(content));
  return btoa(String.fromCharCode(...(await hash.digest())));
}
