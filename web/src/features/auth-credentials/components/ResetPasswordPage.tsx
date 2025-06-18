import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import Head from "next/head";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { PasswordInput } from "@/src/components/ui/password-input";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { useSession } from "next-auth/react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { RequestResetPasswordEmailButton } from "@/src/features/auth-credentials/components/ResetPasswordButton";
import { TRPCClientError } from "@trpc/client";
import { isEmailVerifiedWithinCutoff } from "@/src/features/auth-credentials/lib/credentialsUtils";
import Link from "next/link";
import { ErrorPage } from "@/src/components/error-page";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { passwordSchema } from "@/src/features/auth/lib/signupSchema";

const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function ResetPasswordPage({
  passwordResetAvailable,
}: {
  passwordResetAvailable: boolean;
}) {
  const session = useSession();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showResetPasswordEmailButton, setShowResetPasswordEmailButton] =
    useState(false);

  const capture = usePostHogClientCapture();

  const mutResetPassword = api.credentials.resetPassword.useMutation();
  const emailVerified = isEmailVerifiedWithinCutoff(
    session.data?.user?.emailVerified,
  );

  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: session.data?.user?.email ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof resetPasswordSchema>) {
    setFormError(null);
    setShowResetPasswordEmailButton(false);
    setIsSuccess(false);
    capture("auth:update_password_form_submit");
    await mutResetPassword
      .mutateAsync({ password: values.password })
      .then(() => {
        setIsSuccess(true);
        setTimeout(() => {
          router.push("/");
          setIsSuccess(false);
        }, 2000);
      })
      .catch((error) => {
        console.log(error.message);
        if (error instanceof TRPCClientError) {
          if (error.data?.code === "UNAUTHORIZED") {
            setShowResetPasswordEmailButton(true);
          }
          setFormError(error.message);
        } else {
          console.error(error);
          setFormError("An unknown error occurred");
        }
      });
  }

  if (!passwordResetAvailable)
    return (
      <ErrorPage
        title="Not available"
        message="Password reset is not configured on this instance"
        additionalButton={{
          label: "Setup instructions",
          href: "https://langfuse.com/docs/deployment/self-host#emailpassword",
        }}
      />
    );

  return (
    <>
      <Head>
        <title>Reset Password | Langfuse</title>
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Link href="/">
            <LangfuseIcon className="mx-auto" />
          </Link>
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
            Reset your password
          </h2>
          {session.status !== "authenticated" && (
            <div className="mt-2 flex justify-center">
              <Button asChild variant="ghost">
                <Link href="/auth/sign-in">
                  <ArrowLeft className="mr-2 h-3 w-3" />
                  Back to sign in
                </Link>
              </Button>
            </div>
          )}
        </div>

        <div className="mt-10 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
          <div className="space-y-6">
            <Form {...form}>
              <form
                className="space-y-6"
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="jsdoe@example.com"
                            disabled={session.status === "authenticated"}
                            {...field}
                          />
                          {emailVerified.verified && (
                            <span title="Email verified">
                              <ShieldCheck className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-muted-green" />
                            </span>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {emailVerified.verified && (
                  <>
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <PasswordInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <PasswordInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <div className="pt-4">
                  {emailVerified.verified ? (
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={mutResetPassword.isLoading}
                      loading={mutResetPassword.isLoading}
                      variant={
                        showResetPasswordEmailButton ? "secondary" : "default"
                      }
                    >
                      Update Password
                    </Button>
                  ) : (
                    <RequestResetPasswordEmailButton
                      email={form.watch("email")}
                      className="w-full"
                    />
                  )}
                </div>
              </form>
            </Form>
            {formError ? (
              <div className="text-center text-sm font-medium text-destructive">
                {formError}
              </div>
            ) : null}
            {isSuccess && (
              <div className="text-center text-sm font-medium">
                Password successfully updated. Redirecting ...
              </div>
            )}
            {showResetPasswordEmailButton && (
              <RequestResetPasswordEmailButton
                email={form.getValues("email")}
                className="w-full"
              />
            )}
          </div>
        </div>
        {session.status !== "authenticated" && (
          <div className="mx-auto mt-10 max-w-lg text-center text-xs text-muted-foreground">
            You will only receive an email if an account with this email exists
            and you have signed up with email and password. If you used an
            authentication provider like Google, Gitlab, Okta, or GitHub, please{" "}
            <Link href="/auth/sign-in" className="underline">
              sign in
            </Link>
            .
          </div>
        )}
      </div>
    </>
  );
}
