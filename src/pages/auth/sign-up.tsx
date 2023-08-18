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

export default function SignIn() {
  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof signupSchema>) {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { message: string };
        throw new Error(payload.message);
      }

      await signIn<"credentials">("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl: "/?getStarted=1",
      });
    } catch (err) {
      form.setError("root", {
        message: (err as { message: string }).message,
      });
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
          <span className="block text-center font-mono text-4xl font-bold">
            🪢
          </span>
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Create new account
          </h2>
        </div>
        {env.NEXT_PUBLIC_HOSTNAME === "cloud.langfuse.com" ? (
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
                <Button
                  type="submit"
                  className="w-full"
                  loading={form.formState.isSubmitting}
                >
                  Sign up
                </Button>
              </form>
            </Form>
            {env.NEXT_PUBLIC_HOSTNAME === "cloud.langfuse.com" ? (
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
