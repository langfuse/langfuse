import { PromptDetail } from "@/src/features/prompts/components/prompt-detail";
import { useRouter } from "next/router";

export default function PromptDetailPage() {
  const router = useRouter();
  const prompt_id = router.query.prompt_id as string;
  const projectId = router.query.projectId as string;

  return <PromptDetail projectId={projectId} promptId={prompt_id} />;
}
