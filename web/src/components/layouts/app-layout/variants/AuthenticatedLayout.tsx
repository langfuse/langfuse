/**
 * Authenticated layout variant
 * Full application layout with sidebar, navigation, support drawer, and payment banner
 * Used for all main application pages when user is authenticated
 */

import type { PropsWithChildren } from "react";
import Head from "next/head";
import { SidebarProvider, SidebarInset } from "@/src/components/ui/sidebar";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import { CommandMenu } from "@/src/features/command-k-menu/CommandMenu";
import { Toaster } from "@/src/components/ui/sonner";
import {
  PaymentBanner,
  PaymentBannerProvider,
} from "@/src/features/payment-banner";
import { ResizableContent } from "../components/ResizableContent";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import type { Session } from "next-auth";

type AuthenticatedLayoutProps = PropsWithChildren<{
  session: Session;
  navigation: {
    mainNavigation: any;
    secondaryNavigation: any;
    navigation: any[];
  };
  metadata: {
    title: string;
    faviconPath: string;
    appleTouchIconPath: string;
  };
  onSignOut: () => void;
}>;

/**
 * Full authenticated layout with all features:
 * - AppSidebar with navigation
 * - Payment banner (conditional)
 * - Support drawer
 * - Command menu (Cmd/Ctrl+K)
 * - Toast notifications
 * - Dynamic page metadata
 */
export function AuthenticatedLayout({
  children,
  session,
  navigation,
  metadata,
  onSignOut,
}: AuthenticatedLayoutProps) {
  const user = session.user!;

  // User navigation items for sidebar dropdown
  const userNavProps = {
    user: {
      name: user.name ?? "",
      email: user.email ?? "",
      avatar: user.image ?? "",
    },
    items: [
      { name: "Account Settings", href: "/account/settings" },
      { name: "Theme", onClick: () => {}, content: <ThemeToggle /> },
      { name: "Sign out", onClick: onSignOut },
    ],
  };

  return (
    <>
      <Head>
        <title>{metadata.title}</title>
        <link rel="icon" href={metadata.faviconPath} />
        <link rel="apple-touch-icon" href={metadata.appleTouchIconPath} />
      </Head>

      <PaymentBannerProvider>
        <SidebarProvider>
          <div className="flex h-dvh w-full flex-col">
            <PaymentBanner />
            <div className="flex min-h-0 flex-1 pt-banner-offset">
              <AppSidebar
                navItems={navigation.mainNavigation}
                secondaryNavItems={navigation.secondaryNavigation}
                userNavProps={userNavProps}
              />
              <SidebarInset>
                <ResizableContent>{children}</ResizableContent>
                <Toaster visibleToasts={1} />
                <CommandMenu mainNavigation={navigation.navigation} />
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </PaymentBannerProvider>
    </>
  );
}
