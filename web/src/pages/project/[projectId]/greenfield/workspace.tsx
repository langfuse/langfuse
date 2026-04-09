import type { GetServerSideProps } from "next";
import {
  getFolderPreviewHref,
  getWorkspacePreviewNodes,
} from "@/src/product/shell/product-manifest";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const projectId = context.params?.projectId;

  if (typeof projectId !== "string") {
    return { notFound: true };
  }

  const defaultFolder = getWorkspacePreviewNodes().find(
    (node) => node.kind === "folder",
  )?.pathSegments ?? ["support"];

  return {
    redirect: {
      destination: getFolderPreviewHref(projectId, defaultFolder),
      permanent: false,
    },
  };
};

export default function WorkspacePreviewRedirectPage() {
  return null;
}
