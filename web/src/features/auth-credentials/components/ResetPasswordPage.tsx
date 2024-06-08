import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { ShieldCheck } from "lucide-react";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { RequestResetPasswordEmailButton } from "@/src/features/auth-credentials/components/ResetPasswordButton";
import { TRPCClientError } from "@trpc/client";
import { isEmailVerified } from "@/src/features/auth-credentials/lib/credentialsUtils";

const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8, {
      message: "Password must be at least 8 characters long",
    }),
    confirmPassword: z.string().min(8, {
      message: "Password must be at least 8 characters long",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function ResetPasswordPage() {
  const session = useSession();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showResetPasswordEmailButton, setShowResetPasswordEmailButton] =
    useState(false);

  const mutResetPassword = api.credentials.resetPassword.useMutation();
  console.log(session.data?.user);
  const emailVerified = isEmailVerified(session.data?.user?.emailVerified);

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
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
    await mutResetPassword
      .mutateAsync(values)
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

  return (
    <>
      <Head>
        <title>Reset Password | Langfuse</title>
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-primary">
            Reset your password
          </h2>
        </div>

        <div className="mt-14 bg-background px-6 py-10 shadow sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-12">
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
                            disabled
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
                      email={form.getValues("email")}
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
      </div>
    </>
  );
}
