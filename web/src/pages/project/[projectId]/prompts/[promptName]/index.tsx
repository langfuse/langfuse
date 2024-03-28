import { PromptDetail } from "@/src/features/prompts/components/prompt-detail";
import { useRouter } from "next/router";

export default function PromptDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const promptName = decodeURIComponent(router.query.promptName as string);

  return <PromptDetail projectId={projectId} promptName={promptName} />;
}
