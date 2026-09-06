import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Card } from "@/src/components/ui/card";
import { ConnectedNewOrganizationForm } from "@/src/features/organizations/components/ConnectedNewOrganizationForm";
import { NewProjectForm } from "@/src/features/projects/components/NewProjectForm";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";
import { cn } from "@/src/utils/tailwind";
import { Check } from "lucide-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

// Manual setup process
// 1. Create Organization: /setup
// 2. Create Project: /organization/:orgId/setup?orgstep=create-project
export function SetupPage() {
  const { organization } = useQueryProjectOrOrganization();
  const router = useRouter();
  const t = useTranslations("workspace.setup");

  // starts at 1 to align with breadcrumb
  const stepInt = organization ? 2 : 1;

  return (
    <ContainerPage
      headerProps={{
        title: t("title"),
        help: {
          description: t("help"),
        },
        ...(stepInt === 1 && {
          breadcrumb: [
            {
              name: t("organizationsBreadcrumb"),
              href: "/",
            },
          ],
        }),
      }}
    >
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 1
                  ? "text-muted-foreground"
                  : "text-foreground font-bold",
              )}
            >
              {t("createOrganizationStep")}
              {stepInt > 1 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 2
                  ? "text-muted-foreground"
                  : "text-foreground font-bold",
              )}
            >
              {t("createProjectStep")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card className="p-3">
        {
          // 1. Create Org
          stepInt === 1 && (
            <div>
              <Header title={t("newOrganization")} />
              <p className="text-muted-foreground mb-4 text-sm">
                {t("organizationDescription")}
              </p>
              <ConnectedNewOrganizationForm
                onSuccess={async (orgId, sessionRefreshed) => {
                  const projectRoute = createProjectRoute(orgId);
                  await router.push(projectRoute);

                  if (!sessionRefreshed) {
                    // The setup page resolves the new organization from the session.
                    router.reload();
                  }
                }}
              />
            </div>
          )
        }
        {
          // 2. Create Project
          stepInt === 2 && organization && (
            <div>
              <Header title={t("newProject")} />
              <p className="text-muted-foreground mb-4 text-sm">
                {t("projectDescription")}
              </p>
              <NewProjectForm
                orgId={organization.id}
                onSuccess={(projectId) =>
                  router.push(`/project/${projectId}/traces`)
                }
              />
            </div>
          )
        }
      </Card>
    </ContainerPage>
  );
}
