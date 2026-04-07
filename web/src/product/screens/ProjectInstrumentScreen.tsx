import { useRouter } from "next/router";
import { InstrumentFrame } from "../frames/InstrumentFrame";
import { PlaceholderPage } from "../shell/PlaceholderPage";
import {
  PLACEHOLDER_COPY,
  getInstrumentBreadcrumbs,
  getInstrumentPreviewHref,
} from "../shell/product-manifest";

export default function ProjectInstrumentScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;

  if (!router.isReady || !projectId) {
    return null;
  }

  return (
    <InstrumentFrame
      projectId={projectId}
      title="Project Instrument"
      breadcrumbs={getInstrumentBreadcrumbs(projectId)}
    >
      <PlaceholderPage
        label="Instrument"
        description={PLACEHOLDER_COPY.instrument}
        route={getInstrumentPreviewHref(projectId)}
      />
    </InstrumentFrame>
  );
}
