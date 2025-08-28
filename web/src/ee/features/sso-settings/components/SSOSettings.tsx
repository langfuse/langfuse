import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import Header from "@/src/components/layouts/header";

export const SSOSettings = () => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");

  const commonContent = (
    <>
      <Header title="SSO設定" />
      <p className="mb-4 text-sm text-muted-foreground">
        組織のシングルサインオン（SSO）を設定します。SSOを使用すると、チームが既存のアイデンティティプロバイダー（Okta、AzureAD/EntraIDなど）を認証に使用できます。または、Google、GitHub、Microsoftなどの公開プロバイダーの使用を強制することもできます。
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div>
        {commonContent}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>利用できません</AlertTitle>
          <AlertDescription>
            エンタープライズSSOとSSO強制機能は、現在のプランではご利用いただけません。
            この機能にアクセスするには、プランをアップグレードしてください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      {commonContent}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>
          生成AI評価クラウドサポートにお問い合わせください
        </AlertTitle>
        <AlertDescription>
          SSO設定のセットアップや変更については、{" "}
          <a
            href="mailto:support@langfuse.com"
            className="font-medium underline underline-offset-4"
          >
            support@langfuse.com
          </a>
          までお問い合わせください。
        </AlertDescription>
      </Alert>
    </div>
  );
};
