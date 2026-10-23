/* eslint-disable no-nested-ternary */
import { Code, Key } from "@langfuse/icons";
import {
  SiOkta,
  SiAuthentik,
  SiAuth0,
  SiClickhouse,
  SiAmazoncognito,
  SiKeycloak,
  SiGoogle,
  SiGitlab,
  SiGithub,
  SiWordpress,
} from "@langfuse/icons/si";
import { TbBrandAzure, TbBrandOauth } from "@langfuse/icons/tb";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { type PageProps } from "@/src/features/auth/SignInPage";
import { AuthProviderButton } from "@/src/features/auth/components/AuthProviderButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { captureUnknownError } from "@/src/utils/captureUnknownError";

type NextAuthProvider = NonNullable<Parameters<typeof signIn>[0]>;

export function SSOButtons({
  authProviders,
  action = "sign in",
  callbackUrl,
  lastUsedMethod,
  onProviderSelect,
}: {
  authProviders: PageProps["authProviders"];
  action?: string;
  callbackUrl?: string;
  lastUsedMethod?: NextAuthProvider | null;
  onProviderSelect?: (provider: NextAuthProvider) => void;
}) {
  const capture = usePostHogClientCapture();
  const [providerSigningIn, setProviderSigningIn] =
    useState<NextAuthProvider | null>(null);

  // Count available auth methods (including credentials if available)
  const availableProviders = Object.entries(authProviders).filter(
    ([name, enabled]) => enabled && name !== "sso", // sso is just a flag, not an actual provider
  );
  const hasMultipleAuthMethods = availableProviders.length > 1;
  const signInOptions = callbackUrl ? { callbackUrl } : undefined;

  const handleSignIn = (provider: NextAuthProvider) => {
    setProviderSigningIn(provider);
    capture("sign_in:button_click", { provider });

    // Notify parent component about provider selection
    onProviderSelect?.(provider);

    (signInOptions ? signIn(provider, signInOptions) : signIn(provider))
      .then(() => {
        // do not reset loadingProvider here, as the page will reload
      })
      .catch((error) => {
        captureUnknownError("auth.signIn.provider", error, { provider });
        setProviderSigningIn(null);
      });
  };

  // Only show separator if credentials are enabled (for sign-in) or if action is sign-up (which always has the form)
  const showSeparator = authProviders.credentials || action !== "sign in";

  return (
    <>
      {/* any authprovider from props is enabled */}
      {Object.entries(authProviders).some(
        ([name, enabled]) => enabled && name !== "credentials",
      ) ? (
        <div>
          {showSeparator ? (
            action === "sign in" ? (
              <div className="border-border my-6 border-t"></div>
            ) : (
              <div className="text-muted-foreground my-6 text-center text-xs">
                or {action} with
              </div>
            )
          ) : null}
          <div className="flex flex-row flex-wrap items-center justify-center gap-2">
            {authProviders.google && (
              <AuthProviderButton
                icon={<SiGoogle size="base" __rawClassName="mr-3" />}
                label="Google"
                onClick={() => handleSignIn("google")}
                loading={providerSigningIn === "google"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "google"
                }
              />
            )}
            {authProviders.github && (
              <AuthProviderButton
                icon={<SiGithub size="base" __rawClassName="mr-3" />}
                label="GitHub"
                onClick={() => handleSignIn("github")}
                loading={providerSigningIn === "github"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "github"
                }
              />
            )}
            {authProviders.githubEnterprise && (
              <AuthProviderButton
                icon={<SiGithub size="base" __rawClassName="mr-3" />}
                label="GitHub Enterprise"
                onClick={() => handleSignIn("github-enterprise")}
                loading={providerSigningIn === "github-enterprise"}
                showLastUsedBadge={
                  hasMultipleAuthMethods &&
                  lastUsedMethod === "github-enterprise"
                }
              />
            )}
            {authProviders.gitlab && (
              <AuthProviderButton
                icon={<SiGitlab size="base" __rawClassName="mr-3" />}
                label="Gitlab"
                onClick={() => handleSignIn("gitlab")}
                loading={providerSigningIn === "gitlab"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "gitlab"
                }
              />
            )}
            {authProviders.azureAd && (
              <AuthProviderButton
                icon={<TbBrandAzure size="base" __rawClassName="mr-3" />}
                label="Azure AD"
                onClick={() => handleSignIn("azure-ad")}
                loading={providerSigningIn === "azure-ad"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "azure-ad"
                }
              />
            )}
            {authProviders.okta && (
              <AuthProviderButton
                icon={<SiOkta size="base" __rawClassName="mr-3" />}
                label="Okta"
                onClick={() => handleSignIn("okta")}
                loading={providerSigningIn === "okta"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "okta"
                }
              />
            )}
            {authProviders.authentik && (
              <AuthProviderButton
                icon={<SiAuthentik size="base" __rawClassName="mr-3" />}
                label="Authentik"
                onClick={() => handleSignIn("authentik")}
                loading={providerSigningIn === "authentik"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "authentik"
                }
              />
            )}
            {authProviders.onelogin && (
              <AuthProviderButton
                icon={<Key size="base" __rawClassName="mr-3" />}
                label="OneLogin"
                onClick={() => handleSignIn("onelogin")}
                loading={providerSigningIn === "onelogin"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "onelogin"
                }
              />
            )}
            {authProviders.auth0 && (
              <AuthProviderButton
                icon={<SiAuth0 size="base" __rawClassName="mr-3" />}
                label="Auth0"
                onClick={() => handleSignIn("auth0")}
                loading={providerSigningIn === "auth0"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "auth0"
                }
              />
            )}
            {authProviders.clickhouseCloud && (
              <AuthProviderButton
                icon={<SiClickhouse size="base" __rawClassName="mr-3" />}
                label="ClickHouse Cloud"
                onClick={() => handleSignIn("clickhouse-cloud")}
                loading={providerSigningIn === "clickhouse-cloud"}
                showLastUsedBadge={
                  hasMultipleAuthMethods &&
                  lastUsedMethod === "clickhouse-cloud"
                }
              />
            )}
            {authProviders.cognito && (
              <AuthProviderButton
                icon={<SiAmazoncognito size="base" __rawClassName="mr-3" />}
                label="Cognito"
                onClick={() => handleSignIn("cognito")}
                loading={providerSigningIn === "cognito"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "cognito"
                }
              />
            )}
            {authProviders.jumpcloud && (
              <AuthProviderButton
                icon={<TbBrandOauth size="base" __rawClassName="mr-3" />}
                label="JumpCloud"
                onClick={() => handleSignIn("jumpcloud")}
                loading={providerSigningIn === "jumpcloud"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "jumpcloud"
                }
              />
            )}
            {authProviders.keycloak && (
              <AuthProviderButton
                icon={<SiKeycloak size="base" __rawClassName="mr-3" />}
                label={
                  typeof authProviders.keycloak === "object"
                    ? authProviders.keycloak.name
                    : "Keycloak"
                }
                onClick={() => {
                  capture("sign_in:button_click", { provider: "keycloak" });
                  onProviderSelect?.("keycloak");
                  signIn("keycloak", signInOptions);
                }}
                loading={providerSigningIn === "keycloak"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "keycloak"
                }
              />
            )}
            {typeof authProviders.workos === "object" &&
              "connectionId" in authProviders.workos && (
                <AuthProviderButton
                  icon={<Code size="base" __rawClassName="mr-3" />}
                  label="WorkOS"
                  onClick={() => {
                    capture("sign_in:button_click", { provider: "workos" });
                    onProviderSelect?.("workos");
                    signIn("workos", signInOptions, {
                      connection: (
                        authProviders.workos as { connectionId: string }
                      ).connectionId,
                    });
                  }}
                  loading={providerSigningIn === "workos"}
                  showLastUsedBadge={
                    hasMultipleAuthMethods && lastUsedMethod === "workos"
                  }
                />
              )}
            {typeof authProviders.workos === "object" &&
              "organizationId" in authProviders.workos && (
                <AuthProviderButton
                  icon={<Code size="base" __rawClassName="mr-3" />}
                  label="WorkOS"
                  onClick={() => {
                    capture("sign_in:button_click", { provider: "workos" });
                    onProviderSelect?.("workos");
                    signIn("workos", signInOptions, {
                      organization: (
                        authProviders.workos as { organizationId: string }
                      ).organizationId,
                    });
                  }}
                  loading={providerSigningIn === "workos"}
                  showLastUsedBadge={
                    hasMultipleAuthMethods && lastUsedMethod === "workos"
                  }
                />
              )}
            {authProviders.workos === true && (
              <>
                <AuthProviderButton
                  icon={<Code size="base" __rawClassName="mr-3" />}
                  label="WorkOS (organization)"
                  onClick={() => {
                    const organization = window.prompt(
                      "Please enter your organization ID",
                    );
                    if (organization) {
                      capture("sign_in:button_click", { provider: "workos" });
                      onProviderSelect?.("workos");
                      signIn("workos", signInOptions, { organization });
                    }
                  }}
                  loading={providerSigningIn === "workos"}
                  showLastUsedBadge={
                    hasMultipleAuthMethods && lastUsedMethod === "workos"
                  }
                />
                <AuthProviderButton
                  icon={<Code size="base" __rawClassName="mr-3" />}
                  label="WorkOS (connection)"
                  onClick={() => {
                    const connection = window.prompt(
                      "Please enter your connection ID",
                    );
                    if (connection) {
                      capture("sign_in:button_click", { provider: "workos" });
                      onProviderSelect?.("workos");
                      signIn("workos", signInOptions, { connection });
                    }
                  }}
                  loading={providerSigningIn === "workos"}
                  showLastUsedBadge={
                    hasMultipleAuthMethods && lastUsedMethod === "workos"
                  }
                />
              </>
            )}
            {authProviders.wordpress && (
              <AuthProviderButton
                icon={<SiWordpress size="base" __rawClassName="mr-3" />}
                label="WordPress"
                onClick={() => handleSignIn("wordpress")}
                loading={providerSigningIn === "wordpress"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "wordpress"
                }
              />
            )}
            {authProviders.custom && (
              <AuthProviderButton
                icon={<TbBrandOauth size="base" __rawClassName="mr-3" />}
                label={authProviders.custom.name}
                onClick={() => handleSignIn("custom")}
                loading={providerSigningIn === "custom"}
                showLastUsedBadge={
                  hasMultipleAuthMethods && lastUsedMethod === "custom"
                }
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
