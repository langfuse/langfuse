/**
 * DEV ONLY
 *
 * Auth-free index for design previews. Keep experimental pages linked here
 * so work stays under /dev and away from production routes.
 */

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";

const devPages = [
  {
    href: "/dev/dashboard",
    title: "Dashboard",
    description:
      "Auth-free home dashboard prototype with the mocked project shell.",
  },
  {
    href: "/dev/greenfield",
    title: "Greenfield",
    description:
      "Auth-free greenfield onboarding preview in the mocked project shell.",
  },
  {
    href: "/dev/organization-overview",
    title: "Organization Overview",
    description: "Design preview for the organization landing experience.",
  },
] as const;

export default function DevIndexPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dev Previews</CardTitle>
          <CardDescription>
            Experimental pages live under <code>/dev</code> so design work stays
            isolated from product routes.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {devPages.map((page) => (
          <Card key={page.href}>
            <CardHeader>
              <CardTitle>{page.title}</CardTitle>
              <CardDescription>{page.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={page.href}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
