import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";

export type ShellBreadcrumbItem = {
  name: string;
  href?: string;
};

export function ShellBreadcrumbs({
  items,
  leadingContent,
  tailContent,
}: {
  items: ShellBreadcrumbItem[];
  leadingContent?: ReactNode;
  tailContent?: ReactNode;
}) {
  if (items.length === 0 && !leadingContent && !tailContent) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {leadingContent ? (
          <>
            <BreadcrumbItem>{leadingContent}</BreadcrumbItem>
            {items.length > 0 || tailContent ? (
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
            ) : null}
          </>
        ) : null}
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${item.name}-${index}`}>
              <BreadcrumbItem>
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <BreadcrumbPage>{item.name}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator>/</BreadcrumbSeparator> : null}
            </Fragment>
          );
        })}
        {tailContent ? (
          <>
            {items.length > 0 ? (
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
            ) : null}
            <BreadcrumbItem>{tailContent}</BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
