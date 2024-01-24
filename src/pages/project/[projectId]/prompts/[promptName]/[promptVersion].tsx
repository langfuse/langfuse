import { PromptDetail } from "@/src/features/prompts/components/prompt-detail";
import { useRouter } from "next/router";

export default function PromptDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const promptName = router.query.promptName as string;
  const promptVersion = Number(router.query.promptVersion);
  console.log(projectId, promptName, promptVersion);

  return (
    <PromptDetail
      projectId={projectId}
      promptName={promptName}
      promptVersion={promptVersion}
    />
  );
}
