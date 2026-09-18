import Link from "next/link";
import { FileCode2, Plus } from "lucide-react";
import Page from "@/src/components/layouts/page";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";

export function SkillsPage() {
  const projectId = useProjectIdFromURL();
  const canCreate = useHasProjectAccess({
    projectId: projectId ?? "",
    scope: "skills:CUD",
  });
  const capture = usePostHogClientCapture();
  const skills = api.skills.all.useQuery(
    { projectId: projectId ?? "", page: 1, limit: 100 },
    { enabled: Boolean(projectId) },
  );
  const newSkillHref = `/project/${projectId}/skills/new`;

  let content = (
    <EmptySkills
      canCreate={canCreate}
      href={newSkillHref}
      onOpen={() => capture("skills:new_form_open")}
    />
  );
  if (skills.isPending) {
    content = (
      <div className="grid gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (skills.data?.data.length) {
    content = (
      <SkillsTable projectId={projectId ?? ""} skills={skills.data.data} />
    );
  }

  return (
    <Page
      headerProps={{
        title: "Skills",
        help: {
          description:
            "Create, version, and distribute reusable agent skills from one place.",
          href: "https://langfuse.com/docs",
        },
        actionButtonsRight: (
          <NewSkillButton
            canCreate={canCreate}
            href={newSkillHref}
            onOpen={() => capture("skills:new_form_open")}
          />
        ),
      }}
      withPadding
      scrollable
    >
      {content}
    </Page>
  );
}

function NewSkillButton({
  canCreate,
  href,
  onOpen,
}: {
  canCreate: boolean;
  href: string;
  onOpen: () => void;
}) {
  if (!canCreate) {
    return (
      <Button disabled title="You do not have write access">
        <Plus className="mr-1.5 h-4 w-4" /> New skill
      </Button>
    );
  }
  return (
    <Button asChild>
      <Link href={href} onClick={onOpen}>
        <Plus className="mr-1.5 h-4 w-4" /> New skill
      </Link>
    </Button>
  );
}

function SkillsTable({
  projectId,
  skills,
}: {
  projectId: string;
  skills: Array<{
    name: string;
    description: string;
    latestVersion: number;
    labels: string[];
    lastUpdatedAt: Date;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Skill</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Labels</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((skill) => (
            <TableRow key={skill.name}>
              <TableCell className="py-1">
                <Link
                  href={`/project/${projectId}/skills/${encodeURIComponent(skill.name)}`}
                  className="flex items-center gap-2 font-bold hover:underline"
                >
                  <FileCode2 className="h-4 w-4" />
                  <span className="ph-no-capture">{skill.name}</span>
                </Link>
              </TableCell>
              <TableCell
                className="ph-no-capture text-muted-foreground max-w-md truncate py-1"
                title={skill.description}
              >
                {skill.description}
              </TableCell>
              <TableCell className="py-1">v{skill.latestVersion}</TableCell>
              <TableCell className="py-1">
                <div className="ph-no-capture flex max-w-64 flex-wrap gap-1">
                  {skill.labels.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground py-1 text-right text-xs">
                {skill.lastUpdatedAt.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptySkills({
  canCreate,
  href,
  onOpen,
}: {
  canCreate: boolean;
  href: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <FileCode2 className="text-muted-foreground h-9 w-9" />
      <div>
        <h2 className="font-bold">Create your first skill</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Skills bundle instructions and supporting files into immutable
          versions.
        </p>
      </div>
      {canCreate ? (
        <Button asChild>
          <Link href={href} onClick={onOpen}>
            <Plus className="mr-1.5 h-4 w-4" /> New skill
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
