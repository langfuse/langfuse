import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type User,
  type NextAuthOptions,
  type Session,
  type Theme,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/src/server/db";
import { verifyPassword } from "@/src/features/auth/lib/emailPassword";
import { parseFlags } from "@/src/features/feature-flags/utils";
import { env } from "@/src/env.mjs";
import { createTransport } from "nodemailer";

// Providers
import { type Provider } from "next-auth/providers";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";

// Use secure cookies on https hostnames, exception for Vercel which sets NEXTAUTH_URL without the protocol
const useSecureCookies =
  env.NEXTAUTH_URL.startsWith("https://") || process.env.VERCEL === "1";

const cookieOptions = {
  domain: env.NEXTAUTH_COOKIE_DOMAIN ?? undefined,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: useSecureCookies,
};

const cookieName = (name: string) =>
  [
    useSecureCookies ? "__Secure-" : "",
    name,
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? `.${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
      : "",
  ].join("");

const providers: Provider[] = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: {
        label: "Email",
        type: "email",
        placeholder: "jsmith@example.com",
      },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, _req) {
      if (!credentials) throw new Error("No credentials");

      const dbUser = await prisma.user.findUnique({
        where: {
          email: credentials.email.toLowerCase(),
        },
      });

      if (!dbUser) throw new Error("Invalid credentials");
      if (dbUser.password === null) throw new Error("Invalid credentials");

      const isValidPassword = await verifyPassword(
        credentials.password,
        dbUser.password,
      );
      if (!isValidPassword) throw new Error("Invalid credentials");

      const userObj: User = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.image,
        emailVerified: dbUser.emailVerified,
        featureFlags: parseFlags(dbUser.featureFlags),
        projects: [],
      };

      return userObj;
    },
  }),
];

if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET)
  providers.push(
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );

if (env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET)
  providers.push(
    GitHubProvider({
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );

if (env.AUTH_EMAIL_FROM && env.SMTP_CONNECTION_URL)
  providers.push(
    EmailProvider({
      from: env.AUTH_EMAIL_FROM,
      server: env.SMTP_CONNECTION_URL,
      async sendVerificationRequest(params) {
        const { identifier, url, provider, theme } = params;
        const { host } = new URL(url);
        const transport = createTransport(provider.server as string);
        const result = await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Sign in to Langfuse`,
          text: text({ url, host }),
          html: html({ url, host, theme }),
        });
        const failed = result.rejected.concat(result.pending).filter(Boolean);
        if (failed.length) {
          throw new Error(`Email (${failed.join(", ")}) could not be sent`);
        }
      },
    }),
  );

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }): Promise<Session> {
      const dbUser = await prisma.user.findUnique({
        where: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          email: token.email!.toLowerCase(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          featureFlags: true,
          admin: true,
          memberships: {
            include: {
              project: true,
            },
          },
        },
      });

      return {
        ...session,
        user:
          dbUser !== null
            ? {
                ...session.user,
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                image: dbUser.image,
                admin: dbUser.admin,
                projects: dbUser.memberships.map((membership) => ({
                  id: membership.project.id,
                  name: membership.project.name,
                  role: membership.role,
                })),
                featureFlags: parseFlags(dbUser.featureFlags),
              }
            : null,
      };
    },
  },
  adapter: PrismaAdapter(prisma),
  providers,
  pages: {
    signIn: "/auth/sign-in",
  },
  cookies: {
    sessionToken: {
      name: cookieName("next-auth.session-token"),
      options: cookieOptions,
    },
    csrfToken: {
      name: cookieName("next-auth.csrf-token"),
      options: cookieOptions,
    },
    callbackUrl: {
      name: cookieName("next-auth.callback-url"),
      options: cookieOptions,
    },
    state: {
      name: cookieName("next-auth.state"),
      options: cookieOptions,
    },
    nonce: {
      name: cookieName("next-auth.nonce"),
      options: cookieOptions,
    },
    pkceCodeVerifier: {
      name: cookieName("next-auth.pkce.code_verifier"),
      options: cookieOptions,
    },
  },
  events: {
    createUser: async (message) => {
      const { user } = message;
      console.log("Sending new user signup webhook");
      console.log(user);
      if (
        env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK &&
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ) {
        await fetch(env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK, {
          method: "POST",
          body: JSON.stringify({
            name: user.name,
            email: user.email,
            cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
            userId: user.id,
            // referralSource: ...
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    },
  },
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};

/**
 * Email HTML body
 * Insert invisible space into domains from being turned into a hyperlink by email
 * clients like Outlook and Apple mail, as this is confusing because it seems
 * like they are supposed to click on it to sign in.
 *
 * @note We don't add the email address to avoid needing to escape it, if you do, remember to sanitize it!
 */
function html(params: { url: string; host: string; theme: Theme }) {
  const { url, host, theme } = params;

  const escapedHost = host.replace(/\./g, "&#8203;.");

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const brandColor = theme.brandColor || "#346df1";
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const buttonText = theme.buttonText || "#fff";

  const color = {
    background: "#f9f9f9",
    text: "#444",
    mainBackground: "#fff",
    buttonBackground: brandColor,
    buttonBorder: brandColor,
    buttonText,
  };

  return `
<body style="background: ${color.background};">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: ${color.mainBackground}; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td align="center"
        style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        Sign in to <strong>${escapedHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="${color.buttonBackground}"><a href="${url}"
                target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${color.buttonText}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${color.buttonBorder}; display: inline-block; font-weight: bold;">Sign
                in</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${color.text};">
        If you did not request this email you can safely ignore it.
      </td>
    </tr>
  </table>
</body>
`;
}

/** Email Text body (fallback for email clients that don't render HTML, e.g. feature phones) */
function text({ url, host }: { url: string; host: string }) {
  return `Sign in to ${host}\n${url}\n\n`;
}
