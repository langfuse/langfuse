import type { GetServerSideProps } from "next";
import {
  getPromptStageHref,
  getWorkspacePreviewNodes,
} from "@/src/product/shell/product-manifest";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const projectId = context.params?.projectId;

  if (typeof projectId !== "string") {
    return { notFound: true };
  }

  const previewPrompt = getWorkspacePreviewNodes()
    .flatMap((node) => node.children ?? [])
    .find((node) => node.kind === "prompt")?.pathSegments;
  const defaultPrompt = previewPrompt ?? ["support", "triage-agent"];

  return {
    redirect: {
      destination: getPromptStageHref(projectId, defaultPrompt, "iterate"),
      permanent: false,
    },
  };
};

export default function WorkspacePreviewRedirectPage() {
  return null;
}
