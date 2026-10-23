import { cn } from "@/src/utils/tailwind";
import { integrationOf } from "../../../../integrations/catalog";
import { codingAgentOf } from "../../codingAgents";
import motion from "../../motion.module.css";
import type {
  CopyChecks,
  NewProject,
  PanelView,
  ProjectKeys,
  Way,
} from "../../types";
import { IntegrationBrowser } from "../IntegrationBrowser/IntegrationBrowser";
import { IntegrationSetup } from "../IntegrationSetup/IntegrationSetup";

type IntegrationsPanelProps = {
  view: PanelView;
  onViewChange: (view: PanelView) => void;
  onClose: () => void;
  /** An integration or coding agent picked for this project: the panel closes and the setup card shows it. */
  onPick: (way: Way) => void;
  /** This project's keys. */
  keys: ProjectKeys;
  baseUrl: string;
  manageKeysPath: string;
  onCreateKeys: () => void;
  /** The project a setup creates when the panel sets up the other way in. */
  newProject: NewProject;
  canCreateProject: boolean;
  onCreateProject: (name: string) => void;
  onCopy: (part: keyof CopyChecks) => void;
};

/**
 * Every way to send traces, in place of the setup card (or the top row, before a way is picked): browse and search
 * them, and pick one. A pick for this project hands it to the setup card; for the other way in, its setup opens here,
 * in a new project. It sits in the page, not over it, so it fits every screen; each view slides in the way you went.
 */
export function IntegrationsPanel({
  view,
  onViewChange,
  onClose,
  onPick,
  newProject,
  canCreateProject,
  onCreateProject,
  ...steps
}: IntegrationsPanelProps) {
  const integration =
    view.kind === "setup" ? integrationOf(view.slug) : undefined;
  const project = view.kind === "browse" ? view.project : "new";
  return (
    <section
      aria-label={integration ? integration.name : "Integrations"}
      className="bg-muted/60 h-full w-full max-w-3xl rounded-2xl p-5"
    >
      <div
        key={view.kind === "setup" ? view.slug : "browse"}
        className={cn(
          "flex flex-col",
          view.kind === "browse" && view.isReturn
            ? motion.viewBack
            : motion.viewForward,
        )}
      >
        {integration ? (
          <IntegrationSetup
            integration={integration}
            target={{
              project: "new",
              newProject,
              canCreateProject,
              onCreateProject,
            }}
            onBack={() =>
              onViewChange({
                kind: "browse",
                category: null,
                isReturn: true,
                project: "new",
              })
            }
            {...steps}
          />
        ) : (
          <IntegrationBrowser
            project={project}
            category={view.kind === "browse" ? view.category : null}
            onCategoryChange={(category) =>
              onViewChange({
                kind: "browse",
                category,
                isReturn: false,
                project,
              })
            }
            onOpenSetup={(slug) => {
              if (project === "new") onViewChange({ kind: "setup", slug });
              else if (codingAgentOf(slug)) onPick({ kind: "agent", slug });
              else onPick({ kind: "app", integration: slug });
            }}
            onClose={onClose}
          />
        )}
      </div>
    </section>
  );
}
