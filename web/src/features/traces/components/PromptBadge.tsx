/* eslint-disable @repo/no-null-render */
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { api } from "@/src/utils/api";
import { useTranslations } from "next-intl";

export const PromptBadge = (props: { promptId: string; projectId: string }) => {
  const t = useTranslations("coreDetails.traces.detailControls");
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  if (prompt.isLoading || !prompt.data) return null;

  const text = t("prompt", {
    name: prompt.data.name,
    version: prompt.data.version,
  });

  return (
    <Link
      href={`/project/${props.projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`}
      className="inline-flex"
    >
      <Badge text={text} trailingIcon={ExternalLinkIcon} />
    </Link>
  );
};
