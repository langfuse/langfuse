import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import DocPopup from "@/src/components/layouts/doc-popup";
import { type Status, StatusBadge } from "./status-badge";
import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";

export default function Header({
  level = "h2",
  ...props
}: {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  status?: Status;
  help?: { description: string; href?: string };
  featureBetaURL?: string;
  actionButtons?: React.ReactNode;
  level?: "h2" | "h3";
  className?: string;
}) {
  const router = useRouter();
  const session = useSession();

  const currentPath = router.pathname;
  const projectId = router.query.projectId;

  const project = session.data?.user?.projects.find((p) => p.id === projectId);
  const breadcrumb = [
    ...(project && projectId && currentPath !== "/project/[projectId]"
      ? [
          {
            name: project.name,
            href: `/project/${projectId as string}`,
          },
        ]
      : []),
    ...(props.breadcrumb ?? []),
  ];
  const backHref =
    props.breadcrumb &&
    [...props.breadcrumb.map((i) => i.href).filter(Boolean)].pop();

  return (
    <div className={cn(level === "h2" ? "mb-4" : "mb-2", props.className)}>
      <div>
        {backHref ? (
          <nav className="sm:hidden" aria-label="Back">
            <Link
              href={backHref}
              className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary"
            >
              <ChevronLeftIcon
                className="-ml-1 mr-1 h-5 w-5 flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              Back
            </Link>
          </nav>
        ) : null}
        {(level === "h2" || props.breadcrumb) && breadcrumb.length ? (
          <nav className="hidden sm:flex" aria-label="Breadcrumb">
            <ol role="list" className="flex items-center space-x-4">
              {breadcrumb.map(({ name, href }, index) => (
                <li key={index}>
                  <div className="flex items-center">
                    {index !== 0 && (
                      <ChevronRightIcon
                        className="mr-4 h-5 w-5 flex-shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    {href ? (
                      <Link
                        href={href}
                        className="text-sm font-medium text-muted-foreground hover:text-primary"
                      >
                        {name}
                      </Link>
                    ) : (
                      <div className="text-sm font-medium text-muted-foreground">
                        {name}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex min-w-0 flex-row justify-center align-middle">
            {level === "h2" ? (
              <h2 className="text-2xl font-bold leading-7 sm:truncate sm:text-3xl sm:tracking-tight">
                {props.title}
              </h2>
            ) : (
              <h3 className="text-lg font-bold leading-7 sm:truncate sm:text-xl sm:tracking-tight">
                {props.title}
              </h3>
            )}
            {props.help ? (
              <DocPopup
                description={props.help.description}
                href={props.help.href}
                size="sm"
              />
            ) : null}
            {props.featureBetaURL ? (
              <Link
                href={props.featureBetaURL}
                rel="noopener noreferrer"
                target="_blank"
                className="flex items-center"
              >
                <Badge
                  title="Feature is currently in beta. Click to learn more."
                  className="ml-2"
                >
                  Beta
                </Badge>
              </Link>
            ) : null}
          </div>
          {props.status && <StatusBadge type={props.status} />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {props.actionButtons ?? null}
        </div>
      </div>
    </div>
  );
}
