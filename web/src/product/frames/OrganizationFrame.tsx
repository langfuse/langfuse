import type { ReactNode } from "react";
import { type ShellBreadcrumbItem } from "../shell/Breadcrumbs";
import { ProductAppShell } from "../shell/AppShell";

export function OrganizationFrame({
  organizationId,
  title,
  breadcrumbs,
  children,
}: {
  organizationId: string;
  title: string;
  breadcrumbs: ShellBreadcrumbItem[];
  children: ReactNode;
}) {
  return (
    <ProductAppShell
      scope="organization"
      organizationId={organizationId}
      activeSection="organization"
      title={title}
      breadcrumbs={breadcrumbs}
    >
      {children}
    </ProductAppShell>
  );
}
