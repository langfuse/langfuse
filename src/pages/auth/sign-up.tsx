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
import { signupSchema } from "@/src/features/auth/lib/signupSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { env } from "@/src/env.mjs";
import { useState } from "react";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { usePostHog } from "posthog-js/react";

export default function SignIn() {
  const posthog = usePostHog();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      referralSource: "",
    },
  });

  async function onSubmit(values: z.infer<typeof signupSchema>) {
    try {
      setFormError(null);
      if (values.referralSource !== "") {
        posthog.capture("survey sent", {
          $survey_id: "018ade05-4d8c-0000-36b7-fc390b221590",
          $survey_name: "Referral source",
          $survey_response: values.referralSource,
        });
      }
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { message: string };
        setFormError(payload.message);
        return;
      }

      await signIn<"credentials">("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl: "/?getStarted=1",
      });
    } catch (err) {
      setFormError("An error occurred. Please try again.");
    }
  }

  return (
    <>
      <Head>
        <title>Sign up | Langfuse</title>
        <meta
          name="description"
          content="Create an account, no credit card required."
          key="desc"
        />
      </Head>
      <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-center sm:px-6 sm:py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Create new account
          </h2>
        </div>
        {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
          <div className="text-center sm:mx-auto sm:w-full sm:max-w-[480px]">
            No credit card required. All users have access to a demo project.
          </div>
        ) : null}

        <div className="mt-14 sm:mx-auto sm:w-full sm:max-w-[480px]">
          <div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
            <Form {...form}>
              <form
                className="space-y-6"
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="jsdoe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
                  <FormField
                    control={form.control}
                    name="referralSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Where did you hear about us?{" "}
                          <span className="font-normal">(optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input type="referralSource" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  loading={form.formState.isSubmitting}
                >
                  Sign up
                </Button>
                {formError ? (
                  <div className="text-center text-sm font-medium text-destructive">
                    {formError}
                  </div>
                ) : null}
              </form>
            </Form>
            {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
              <div className="-mb-4 mt-8 text-center text-xs text-gray-500">
                By creating an account you are agreeing to our{" "}
                <a
                  href="https://app.termly.io/document/terms-of-service/baf80a2e-dc67-46de-9ca8-2f7457179c32"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="italic"
                >
                  Terms of Service
                </a>
                ,{" "}
                <a
                  href="https://app.termly.io/document/privacy-policy/47905712-56e1-4ad0-9bb7-8958f3263f90"
                  rel="noopener noreferrer"
                  className="italic"
                >
                  Privacy Policy
                </a>
                , and{" "}
                <a
                  href="https://app.termly.io/document/cookie-policy/f97945a3-cb02-4db7-9370-c57023d92838"
                  rel="noopener noreferrer"
                  className="italic"
                >
                  Cookie Policy
                </a>
              </div>
            ) : null}
          </div>

          <p className="mt-10 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href="/auth/sign-in"
              className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
