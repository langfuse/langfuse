import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { setupTracingRoute } from "@/src/features/setup/setupRoutes";
import { BarChart4, GitMerge, Search, Zap } from "lucide-react";

interface TracesOnboardingProps {
  projectId: string;
}

export function TracesOnboarding({ projectId }: TracesOnboardingProps) {
  const valuePropositions: ValueProposition[] = [
    {
      title: "全コンテキストキャプチャ",
      description:
        "API呼び出し、コンテキスト、プロンプト、並列処理などを含む完全な実行フローを追跡します",
      icon: <GitMerge className="h-4 w-4" />,
    },
    {
      title: "コスト監視",
      description: "アプリケーション全体でのモデル使用量とコストを追跡します",
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: "評価の基礎",
      description:
        "評価スコアを追加して問題を特定し、時間経過とともに指標を追跡します",
      icon: <Search className="h-4 w-4" />,
    },
    {
      title: "オープン・マルチモーダル",
      description:
        "ai-evalトレースは画像、音声、その他のモダリティを含むことができます。ニーズに合わせて完全にカスタマイズできます",
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="LLMトレーシングを始める"
      description="トレースは、アプリ/エージェント内のすべてのLLM呼び出しとその他の関連ロジックを追跡できます。ai-evalのネストされたトレースは、何が起こっているかを理解し、問題の根本原因を特定するのに役立ちます。"
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "トレーシングを設定",
        href: setupTracingRoute(projectId),
      }}
      secondaryAction={{
        label: "ドキュメントを表示",
        href: "https://langfuse.com/docs/tracing",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/tracing-overview-v1.mp4"
    />
  );
}
