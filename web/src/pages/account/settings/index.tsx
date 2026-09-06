/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import Header from "@/src/components/layouts/header";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api, reportNonTrpcError } from "@/src/utils/api";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useSession } from "next-auth/react";
import { signOutCleanly } from "@/src/features/auth/lib/signOut";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import ContainerPage from "@/src/components/layouts/container-page";
import { useRouter } from "next/router";
import { StringNoHTML } from "@langfuse/shared";
import Link from "next/link";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useTranslations } from "next-intl";

const createDisplayNameSchema = (
  required: string,
  maxLength: string,
  noHtml: string,
) =>
  z.object({
    name: z
      .string()
      .min(1, required)
      .refine((value) => StringNoHTML.safeParse(value).success, {
        message: noHtml,
      })
      .max(100, maxLength),
  });

function UpdateDisplayName() {
  const t = useTranslations("accountSettings.displayName");
  const { data: session, update: updateSession } = useSession();
  const utils = api.useUtils();
  const displayNameSchema = createDisplayNameSchema(
    t("validation.required"),
    t("validation.maxLength"),
    t("validation.noHtml"),
  );

  const form = useForm({
    resolver: zodResolver(displayNameSchema),
    defaultValues: {
      name: "",
    },
  });

  const updateDisplayName = api.userAccount.updateDisplayName.useMutation({
    onSuccess: async () => {
      await updateSession();
      await utils.invalidate();
      form.reset();
      showSuccessToast({
        title: t("updatedTitle"),
        description: t("updatedDescription"),
      });
    },
    onError: () => form.setError("name", { message: t("updateFailed") }),
  });

  function onSubmit(values: z.infer<typeof displayNameSchema>) {
    updateDisplayName.mutate({ name: values.name });
  }

  return (
    <div>
      <Header title={t("title")} />
      <Card className="p-3">
        {form.getValues().name !== "" ? (
          <p className="text-primary mb-4 text-sm">
            {t.rich("pendingChange", {
              currentName: session?.user?.name ?? "",
              newName: form.watch().name,
              b: (chunks) => <b>{chunks}</b>,
            })}
          </p>
        ) : (
          <p className="text-primary mb-4 text-sm">
            {t.rich("current", {
              name: session?.user?.name ?? "",
              b: (chunks) => <b>{chunks}</b>,
            })}
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder={session?.user?.name ?? ""}
                      {...field}
                      className="flex-1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              variant="secondary"
              type="submit"
              loading={updateDisplayName.isPending}
              disabled={form.getValues().name === ""}
              className="mt-4"
            >
              {t("save")}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}

function DeleteAccountButton() {
  const t = useTranslations("accountSettings.dangerZone");
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "";

  const { data: canDeleteData } = api.userAccount.checkCanDelete.useQuery();
  const deleteAccount = api.userAccount.delete.useMutation();

  const formSchema = z.object({
    email: z.string().refine((val) => val === userEmail, {
      message: t("emailMismatch", { email: userEmail }),
    }),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const canDelete = canDeleteData?.canDelete ?? false;
  const blockingOrganizations = canDeleteData?.blockingOrganizations ?? [];

  const onSubmit = async () => {
    if (!canDelete) return;
    try {
      await deleteAccount.mutateAsync();
      showSuccessToast({
        title: t("successTitle"),
        description: t("successDescription"),
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await signOutCleanly();
    } catch (error) {
      reportNonTrpcError(error, "account");
      showErrorToast(t("errorTitle"), t("unexpectedError"));
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive-secondary">{t("action")}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{t("action")}</DialogTitle>
          <DialogDescription>
            {!canDelete && blockingOrganizations.length > 0 ? (
              <div>
                <p className="mb-2">{t("blockedIntro")}</p>
                <ul className="list-inside list-disc space-y-1">
                  {blockingOrganizations.map((org) => (
                    <li key={org.id}>
                      <Link
                        href={`/organization/${org.id}/settings`}
                        className="text-primary hover:text-primary/80 font-bold underline"
                      >
                        {org.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2">{t("blockedResolution")}</p>
              </div>
            ) : (
              t("confirm", { email: userEmail })
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {canDelete && (
              <DialogBody>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder={userEmail} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogBody>
            )}
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                loading={deleteAccount.isPending}
                disabled={!canDelete}
                className="w-full"
              >
                {t("action")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type AccountSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useAccountSettingsPages(): AccountSettingsPage[] {
  const t = useTranslations("accountSettings");
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "";
  const showV4Migration = useV4UpgradeUiFlag();

  return [
    {
      title: t("pages.general"),
      slug: "index",
      cmdKKeywords: [
        "account",
        "user",
        "profile",
        "email",
        "password",
        "name",
        "display",
        "delete",
        "remove",
      ],
      content: (
        <div className="flex flex-col gap-6">
          <div>
            <Header title={t("email.title")} />
            <Card className="p-3">
              <p className="text-primary text-sm">
                {t.rich("email.current", {
                  email: userEmail,
                  b: (chunks) => <b>{chunks}</b>,
                })}
              </p>
            </Card>
          </div>
          <UpdateDisplayName />
          <div>
            <Header title={t("password.title")} />
            <Card className="p-3">
              <p className="text-primary mb-4 text-sm">
                {t("password.description")}
              </p>
              <Button asChild variant="secondary">
                <Link href="/auth/reset-password">{t("password.change")}</Link>
              </Button>
            </Card>
          </div>
          <SettingsDangerZone
            title={t("dangerZone.title")}
            items={[
              {
                title: t("dangerZone.deleteTitle"),
                description: t("dangerZone.deleteDescription"),
                button: <DeleteAccountButton />,
              },
            ]}
          />
        </div>
      ),
    },
    {
      title: t("pages.v4Migration"),
      slug: "v4-migration",
      href: "/v4-migration",
      show: showV4Migration,
    },
  ];
}

export default function AccountSettingsPage() {
  const t = useTranslations("accountSettings");
  const router = useRouter();
  const pages = useAccountSettingsPages();

  return (
    <ContainerPage
      headerProps={{
        title: t("title"),
      }}
    >
      <PagedSettingsContainer
        activeSlug={router.query.page as string | undefined}
        pages={pages}
        selectPlaceholder={t("selectPage")}
      />
    </ContainerPage>
  );
}
