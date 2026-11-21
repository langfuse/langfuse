<img width="2400" height="600" alt="Langfuse by ClickHouse" src=".github/readme-banner.png" />

<div align="center">
   <div>
      <h3>
         <a href="https://langfuse.com/japan">
            <strong>🇯🇵 🤝 🪢</strong>
         </a> · 
         <a href="https://cloud.langfuse.com">
            <strong>Langfuse Cloud</strong>
         </a> · 
         <a href="https://langfuse.com/self-hosting">
            <strong>セルフホスティング</strong>
         </a> · 
         <a href="https://langfuse.com/docs/demo">
            <strong>デモ</strong>
         </a>
      </h3>
   </div>

   <div>
      <a href="https://langfuse.com/docs"><strong>ドキュメント</strong></a> ·
      <a href="https://github.com/langfuse/langfuse/issues"><strong>バグ報告</strong></a> ·
      <a href="https://github.com/orgs/langfuse/discussions/categories/ideas"><strong>機能リクエスト</strong></a> ·
      <a href="https://langfuse.com/changelog"><strong>変更履歴</strong></a> ·
      <a href="https://langfuse.com/docs/roadmap"><strong>ロードマップ</strong></a>
   </div>
   <br/>
</div>

<p align="center">
   <a href="https://github.com/langfuse/langfuse/blob/main/LICENSE">
   <img src="https://img.shields.io/badge/License-MIT-E11311.svg" alt="MIT License">
   </a>
   <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange" alt="Y Combinator W23"></a>
   <a href="https://hub.docker.com/u/langfuse" target="_blank">
   <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/langfuse/langfuse?labelColor=%20%23FDB062&logo=Docker&labelColor=%20%23528bff"></a>
   <a href="https://pypi.python.org/pypi/langfuse"><img src="https://img.shields.io/pypi/dm/langfuse?logo=python&logoColor=white&label=pypi%20langfuse&color=blue" alt="langfuse Python package on PyPi"></a>
   <a href="https://www.npmjs.com/package/@langfuse/core"><img src="https://img.shields.io/npm/dm/@langfuse/core?logo=npm&logoColor=white&label=npm%20%40langfuse%2Fcore&color=blue" alt="@langfuse/core npm package"></a>
   <br/>
   <a href="https://discord.com/invite/7NXusRtqYU" target="_blank">
   <img src="https://img.shields.io/discord/1111061815649124414?logo=discord&labelColor=%20%235462eb&logoColor=%20%23f5f5f5&color=%20%235462eb"
      alt="chat on Discord"></a>
   <a href="https://twitter.com/intent/follow?screen_name=langfuse" target="_blank">
   <img src="https://img.shields.io/twitter/follow/langfuse?logo=X&color=%20%23f5f5f5"
      alt="follow on X(Twitter)"></a>
   <a href="https://www.linkedin.com/company/langfuse/" target="_blank">
   <img src="https://custom-icon-badges.demolab.com/badge/LinkedIn-0A66C2?logo=linkedin-white&logoColor=fff"
      alt="follow on LinkedIn"></a>
   <a href="https://github.com/langfuse/langfuse/graphs/commit-activity" target="_blank">
   <img alt="Commits last month" src="https://img.shields.io/github/commit-activity/m/langfuse/langfuse?labelColor=%20%2332b583&color=%20%2312b76a"></a>
   <a href="https://github.com/langfuse/langfuse/" target="_blank">
   <img alt="Issues closed" src="https://img.shields.io/github/issues-search?query=repo%3Alangfuse%2Flangfuse%20is%3Aclosed&label=issues%20closed&labelColor=%20%237d89b0&color=%20%235d6b98"></a>
   <a href="https://github.com/langfuse/langfuse/discussions/" target="_blank">
   <img alt="Discussion posts" src="https://img.shields.io/github/discussions/langfuse/langfuse?labelColor=%20%239b8afb&color=%20%237a5af8"></a>
</p>

<p align="center">
  <a href="./README.md"><img alt="README in English" src="https://img.shields.io/badge/English-d9d9d9"></a>
  <a href="./README.cn.md"><img alt="简体中文版自述文件" src="https://img.shields.io/badge/简体中文-d9d9d9"></a>
  <a href="./README.ja.md"><img alt="日本語のREADME" src="https://img.shields.io/badge/日本語-d9d9d9"></a>
  <a href="./README.kr.md"><img alt="README in Korean" src="https://img.shields.io/badge/한국어-d9d9d9"></a>
</p>

Langfuseは、**エージェントの評価とオブザーバビリティ**のための**オープンソースのAIエンジニアリングプラットフォーム**です。会社が行うすべてのAI呼び出しと、チームが構築するすべてのエージェントを1つのオープンなプラットフォームで扱えます。利用量とコストを追跡し、エージェントを**トレースして評価**し、本番データを活用してより良いAIを届けられます。Langfuse Cloudを利用することも、**数分でセルフホスト**することもでき、大規模な環境で**多くの実績**があります。

プロジェクトの簡単なデモはこちらからご覧いただけます:

<a href="https://langfuse.com/watch-demo"><img width="37.5%" alt="Langfuse Overview Video" src=".github/watch-demo.png"></a>

## ✨ コア機能

<img width="2400" alt="features" src="https://github.com/user-attachments/assets/0fad3dee-f3ad-423c-9f0d-7ccd0f26cc2d" />

- [AIオブザーバビリティ](https://langfuse.com/docs/observability/overview): アプリケーションにインストゥルメンテーションを導入してLangfuseへトレースを取り込み、LLM呼び出しやリトリーバル、埋め込み、エージェントアクションなどの関連ロジックを追跡できます。複雑なログやユーザーセッションを調査・デバッグできます。OpenTelemetryをベースに構築されています。インタラクティブな[デモ](https://langfuse.com/docs/demo)で動作を確認してください。

- [プロンプト管理](https://langfuse.com/docs/prompt-management/overview): プロンプトを一元管理し、バージョン管理しながら共同で改善できます。サーバー側とクライアント側の強力なキャッシングにより、アプリケーションのレイテンシを増やすことなくプロンプトを改良できます。[LLMプレイグラウンド](https://langfuse.com/docs/prompt-management/features/playground)ではプロンプトやモデル設定をテストでき、トレースで望ましくない結果を見つけたら、そのままプレイグラウンドに移動して改善できます。

- [スキル管理](https://langfuse.com/docs/skill-management/overview)（ベータ）: エージェントスキルにバージョン管理とラベルを提供します。スキルはタスク指示を記述した`SKILL.md`と任意の補助ファイルで構成されます。アプリケーションのコードを変更せずにバージョンの昇格やロールバックができ、スキルのバージョンをそれが生成したトレースと紐付けられます。

- [評価](https://langfuse.com/docs/evaluation/overview): 評価はAIエージェント開発ワークフローの要であり、Langfuseは多様なニーズに対応します。LLM-as-a-judge、コード評価器、ユーザーフィードバックの収集、手動ラベリング、API/SDKを通じたカスタム評価パイプラインをサポートします。[データセットと実験](https://langfuse.com/docs/evaluation/experiments/datasets)を使って、デプロイ前のテストや継続的な改善のためのテストセットやベンチマークを構築できます。

- [AIゲートウェイ](https://langfuse.com/docs/gateway/overview)（ベータ）: 組織全体でモデルプロバイダーへの呼び出しを1つのエンドポイントに集約します。プロバイダーの認証情報を一か所で管理し、ユーザーごとやサービスアカウントごとにゲートウェイキーを発行し、モデルを一元的に承認し、ユーザー・キー・モデルごとのAI支出を追跡し、すべての呼び出しをLangfuseのトレースとして記録します。

- [メトリクスとダッシュボード](https://langfuse.com/docs/metrics/overview): [カスタムダッシュボード](https://langfuse.com/docs/metrics/features/custom-dashboards)、メトリクスAPI、アラートを使って、レイテンシ、コスト、品質をあらゆる軸で追跡できます。

- [包括的なAPI](https://langfuse.com/docs/api-and-data-platform/overview): LangfuseはAPIを通じて提供されるビルディングブロックを用い、カスタムAIエンジニアリングワークフローの基盤として頻繁に利用されています。OpenAPI仕様、PythonおよびJS/TS向けの型付きSDK、[Langfuse CLI](https://langfuse.com/docs/api-and-data-platform/features/cli)、コーディングエージェント向けの[Langfuse Agent Skill](https://langfuse.com/docs/api-and-data-platform/features/agent-skill)が利用可能です。

## 📦 Langfuseのデプロイ

<img width="2400" alt="deploy" src="https://github.com/user-attachments/assets/cf72e7f8-db7f-4e11-a2a1-ecfbe46f262c" />

### Langfuse Cloud

Langfuseチームによるマネージドデプロイメント。充実した無料枠があり、クレジットカードは不要です。

**[Langfuse Cloudに登録する →](https://langfuse.com/cloud)**

### Langfuseのセルフホスティング

自身のインフラ上でLangfuseを実行できます:

- [Docker Compose](https://langfuse.com/self-hosting/deployment/docker-compose): 自分のマシンまたは単一の仮想マシン上で、5分でLangfuseを実行できます。ガイドでは、コンテナログでディスクが埋まらないようにDockerのログローテーションを設定する方法も説明しています。

  ```bash
  # 最新のLangfuseリポジトリのコピーを取得
  git clone --depth=1 https://github.com/langfuse/langfuse.git
  cd langfuse

  # Langfuseのdocker composeを起動
  docker compose up
  ```

- [Kubernetes (Helm)](https://langfuse.com/self-hosting/deployment/kubernetes-helm): Helmを使用してKubernetesクラスター上でLangfuseを実行します。本番環境で推奨されるデプロイ方法です。
- Terraformテンプレート: [AWS](https://langfuse.com/self-hosting/deployment/aws)、[Azure](https://langfuse.com/self-hosting/deployment/azure)、[GCP](https://langfuse.com/self-hosting/deployment/gcp)
- コミュニティによるメンテナンス: [Render](https://langfuse.com/self-hosting/deployment/render)、[Railway](https://langfuse.com/self-hosting/deployment/railway)

アーキテクチャや設定オプションの詳細は[セルフホスティングのドキュメント](https://langfuse.com/self-hosting)をご確認ください。

> [!TIP]
> **Langfuseをセルフホストしていますか？** [セルフホスティング更新リスト](https://langfuse.com/self-hosting#subscribe)に登録すると、オープンソース版Langfuseの重要な機能や新しいリリースについてメールでお知らせします。セルフホスティングの更新情報のみで、マーケティングメールは送りません。

## 🔌 インテグレーション

<img width="2400" alt="integrations" src="https://github.com/user-attachments/assets/b85c9a45-68f0-4f76-b545-0e8632abef9f" />

Langfuseは[OpenTelemetry](https://langfuse.com/integrations/native/opentelemetry)をベースに構築されているため、OpenTelemetryで計装されたあらゆるアプリケーション、フレームワーク、コレクターからLangfuseにトレースを送信できます。

### 主なインテグレーション

| インテグレーション                                                              | 対応言語・環境                       | 説明                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OpenTelemetry](https://langfuse.com/integrations/native/opentelemetry)         | 任意の言語                           | アプリケーションまたはOpenTelemetry CollectorからLangfuseのOpenTelemetryエンドポイントにOTLPトレースを送信します。                                               |
| [Langfuse AIゲートウェイ](https://langfuse.com/docs/gateway/overview)（ベータ） | 任意のOpenAI / Anthropicクライアント | モデル呼び出しを1つのエンドポイント経由でルーティングし、SDKやコードを変更せずにすべての呼び出しをトレースし、プロバイダーキーを一元管理し、コストを追跡します。 |
| [SDK](https://langfuse.com/docs/observability/sdk/overview)                     | Python, JS/TS                        | SDKを利用して手動でインストゥルメンテーションを実装し、完全な柔軟性を提供します。                                                                                |
| [OpenAI](https://langfuse.com/integrations/model-providers/openai-py)           | Python, JS/TS                        | OpenAI SDKのドロップイン置換による自動インストゥルメンテーションを実現します。                                                                                   |
| [LangChain & LangGraph](https://langfuse.com/integrations/frameworks/langchain) | Python, JS/TS                        | LangChainまたはLangGraphアプリケーションにコールバックハンドラーを渡すことで自動的に計装します。                                                                 |
| [LlamaIndex](https://langfuse.com/integrations/frameworks/llamaindex)           | Python                               | LlamaIndexのコールバックシステムを介して自動的に計装します。                                                                                                     |
| [Haystack](https://langfuse.com/integrations/frameworks/haystack)               | Python                               | Haystackのコンテンツトレースシステムを利用した自動インストゥルメンテーションを実現します。                                                                       |
| [LiteLLM](https://langfuse.com/integrations/gateways/litellm)                   | Python, JS/TS (proxy only)           | GPTのドロップイン置換として任意のLLMを使用できます。Azure、OpenAI、Cohere、Anthropic、Ollama、VLLM、Sagemaker、HuggingFace、Replicate（100+ LLM）に対応。        |
| [Vercel AI SDK](https://langfuse.com/integrations/frameworks/vercel-ai-sdk)     | JS/TS                                | React、Next.js、Vue、Svelte、Node.jsを使用してAI搭載アプリケーションの構築を支援するTypeScriptツールキットです。                                                 |
| [Mastra](https://langfuse.com/integrations/frameworks/mastra)                   | JS/TS                                | AIエージェントやマルチエージェントシステムを構築するためのオープンソースフレームワークです。                                                                     |
| [API](https://langfuse.com/docs/api-and-data-platform/features/public-api)      |                                      | 公開APIを直接呼び出すことが可能です。OpenAPI仕様も利用できます。                                                                                                 |

### Langfuseと統合されているパッケージ

| 名前                                                                               | タイプ                     | 説明                                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [OpenAI Agents SDK](https://langfuse.com/integrations/frameworks/openai-agents)    | エージェントフレームワーク | マルチエージェントワークフローを構築するためのOpenAIの軽量フレームワーク                                   |
| [Claude Agent SDK](https://langfuse.com/integrations/frameworks/claude-agent-sdk)  | エージェントフレームワーク | ツールを使うエージェントを構築するためのAnthropicのオープンソースフレームワーク（MCPをネイティブサポート） |
| [Pydantic AI](https://langfuse.com/integrations/frameworks/pydantic-ai)            | エージェントフレームワーク | 型安全な本番向けアプリケーションを構築するためのPythonエージェントフレームワーク                           |
| [Google ADK](https://langfuse.com/integrations/frameworks/google-adk)              | エージェントフレームワーク | エージェント構築のためのGoogleのオープンソースAgent Development Kit                                        |
| [Strands Agents](https://langfuse.com/integrations/frameworks/strands-agents)      | エージェントフレームワーク | AIエージェントを構築・実行するためのAWS製オープンソースSDK                                                 |
| [Spring AI](https://langfuse.com/integrations/frameworks/spring-ai)                | エージェントフレームワーク | SpringエコシステムでAIアプリケーションを構築するためのJavaフレームワーク                                   |
| [CrewAI](https://langfuse.com/integrations/frameworks/crewai)                      | エージェントフレームワーク | エージェントの協調とツール利用を実現するマルチエージェントフレームワーク                                   |
| [AutoGen](https://langfuse.com/integrations/frameworks/autogen)                    | エージェントフレームワーク | 分散型エージェント構築のためのオープンソースLLMプラットフォーム                                            |
| [smolagents](https://langfuse.com/integrations/frameworks/smolagents)              | エージェントフレームワーク | オープンソースのAIエージェントフレームワーク                                                               |
| [Instructor](https://langfuse.com/integrations/frameworks/instructor)              | ライブラリ                 | 構造化されたLLM出力（JSON、Pydantic）を取得するためのライブラリ                                            |
| [DSPy](https://langfuse.com/integrations/frameworks/dspy)                          | ライブラリ                 | 言語モデルのプロンプトや重みを体系的に最適化するためのフレームワーク                                       |
| [Mirascope](https://langfuse.com/integrations/frameworks/mirascope)                | ライブラリ                 | LLMアプリケーション構築用のPythonツールキット                                                              |
| [Ollama](https://langfuse.com/integrations/model-providers/ollama)                 | モデル（ローカル）         | オープンソースLLMを手軽にローカルで実行するためのツール                                                    |
| [Amazon Bedrock](https://langfuse.com/integrations/model-providers/amazon-bedrock) | モデル                     | AWS上でファウンデーションモデルやファインチューニング済みモデルを実行                                      |
| [Flowise](https://langfuse.com/integrations/no-code/flowise)                       | チャット/エージェント UI   | JS/TSのノーコードビルダーで、カスタマイズ可能なLLMフローを構築                                             |
| [Langflow](https://langfuse.com/integrations/no-code/langflow)                     | チャット/エージェント UI   | PythonベースのUIで、react-flowを用いてLangChainの実験やプロトタイピングを容易に実現                        |
| [Dify](https://langfuse.com/integrations/no-code/dify)                             | チャット/エージェント UI   | ノーコードでLLMアプリ開発が可能なオープンソースプラットフォーム                                            |
| [OpenWebUI](https://langfuse.com/integrations/no-code/openwebui)                   | チャット/エージェント UI   | セルフホストおよびローカルモデルに対応するLLMチャットWeb UI                                                |
| [LobeChat](https://langfuse.com/integrations/no-code/lobechat)                     | チャット/エージェント UI   | オープンソースのチャットボットプラットフォーム                                                             |
| [Gradio](https://langfuse.com/integrations/other/gradio)                           | チャット/エージェント UI   | チャットUIなどのWebインターフェース構築のためのオープンソースPythonライブラリ                              |
| [Promptfoo](https://langfuse.com/integrations/other/promptfoo)                     | ツール                     | オープンソースのLLMテストプラットフォーム                                                                  |
| [Vapi](https://langfuse.com/integrations/no-code/vapi)                             | プラットフォーム           | オープンソースの音声AIプラットフォーム                                                                     |
| [Inferable](https://langfuse.com/integrations/frameworks/inferable)                | エージェントフレームワーク | 分散型エージェント構築のためのオープンソースLLMプラットフォーム                                            |
| [Goose](https://langfuse.com/integrations/no-code/goose)                           | エージェント               | Blockが開発した、エンジニアリングタスクを自動化するオープンソースAIエージェント                            |

100以上のインテグレーションの一覧は[インテグレーション概要](https://langfuse.com/integrations)をご覧ください。

## 🚀 クイックスタート

アプリケーションにインストゥルメンテーションを導入してLangfuseへトレースを取り込み、LLM呼び出しやリトリーバル、埋め込み、エージェントアクションなどの関連ロジックを追跡しましょう。複雑なログやユーザーセッションを調査・デバッグできます。

### 🤖 エージェントによるインストール（推奨）

[Langfuse Agent Skill](https://github.com/langfuse/skills)をインストールすると、コーディングエージェントがLangfuseのすべての機能を利用できるようになります。その後、アプリケーションにトレースを追加するようエージェントに依頼してください:

```txt
Install the Langfuse Agent Skill from github.com/langfuse/skills
and use it to add tracing to this application with Langfuse
following best practices.
```

スキルは[skills CLI](https://www.npmjs.com/package/skills)（`npx skills add langfuse/skills --skill "langfuse"`）や[Langfuse Cursorプラグイン](https://cursor.com/marketplace/langfuse)からもインストールできます。エージェントがMCPに対応している場合は、[Langfuse Docs MCPサーバー](https://langfuse.com/docs/docs-mcp)（`https://langfuse.com/api/mcp`、認証不要）を追加すると、作業中に最新のドキュメントを参照できます。詳しくは[スタートガイド](https://langfuse.com/docs/observability/get-started)をご覧ください。

### 🛠️ 手動インストール

#### 1️⃣ 新規プロジェクトの作成

1.  [Langfuseアカウントを作成](https://langfuse.com/cloud)するか、[セルフホスト](https://langfuse.com/self-hosting)します
2.  新規プロジェクトを作成します
3.  プロジェクト設定で新しいAPIクレデンシャルを作成します

#### 2️⃣ 初めてのLLM呼び出しを記録する

[`@observe()` デコレーター](https://langfuse.com/docs/observability/sdk/instrumentation#observe-wrapper)を使うと、任意のPython製LLMアプリケーションを簡単にトレースできます。このクイックスタートでは、Langfuseの[OpenAIインテグレーション](https://langfuse.com/integrations/model-providers/openai-py)も使用して、すべてのモデルパラメータを自動で取得します。

> [!TIP]
> OpenAIを利用していない場合は、[こちらのドキュメント](https://langfuse.com/docs/observability/get-started)で他のモデルやフレームワークのログ記録方法をご確認ください。

```bash
pip install langfuse openai
```

```bash filename=".env"
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com" # 🇪🇺 EUリージョン
# LANGFUSE_BASE_URL="https://us.cloud.langfuse.com" # 🇺🇸 USリージョン
# LANGFUSE_BASE_URL="https://jp.cloud.langfuse.com" # 🇯🇵 日本リージョン
# LANGFUSE_BASE_URL="https://hipaa.cloud.langfuse.com" # ⚕️ HIPAAリージョン
```

```python /@observe()/ /from langfuse.openai import openai/ filename="main.py"
from langfuse import observe
from langfuse.openai import openai # OpenAIインテグレーション

@observe()
def story():
    return openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "What is Langfuse?"}],
    ).choices[0].message.content

@observe()
def main():
    return story()

main()
```

#### 3️⃣ Langfuseでトレースを確認する

LLM呼び出しやその他のアプリケーションロジックをLangfuse上で確認できます。

<img width="1600" alt="example-trace-for-github" src="https://github.com/user-attachments/assets/8f6995b7-285f-441a-b52f-1331d13ceb45" />

_[Langfuseの公開トレース例](https://cloud.langfuse.com/project/cloramnkj0002jz088vzn1ja4/traces/db22d0a442216b485abd83cc9df6d9ee)_

## 💭 サポート

質問への回答を探すには:

- [ドキュメント](https://langfuse.com/docs)が最初に見るべき場所です。内容は網羅的で、メンテナンスに多くの時間をかけています。GitHub経由でドキュメントの修正を提案することもできます。
- [Langfuse FAQ](https://langfuse.com/faq)では、よくある質問に回答しています。
- 「[Ask AI](https://langfuse.com/docs/ask-ai)」を使うと、質問に即座に回答が得られます。

サポートチャネル:

- **GitHub Discussionsの[公開Q&A](https://github.com/orgs/langfuse/discussions/categories/support)で質問してください。** 問題を理解しやすくするため、できるだけ詳しい情報（コードスニペット、スクリーンショット、背景情報など）を含めてください。
- GitHub Discussionsで[機能をリクエスト](https://github.com/orgs/langfuse/discussions/categories/ideas)できます。
- GitHub Issuesで[バグを報告](https://github.com/langfuse/langfuse/issues)できます。
- 急ぎの問い合わせは、アプリ内のチャットウィジェットからご連絡ください。

## 🤝 コントリビュート

コントリビューションを歓迎します！

- GitHub Discussionsの[アイデア](https://github.com/orgs/langfuse/discussions/categories/ideas)に投票してください。
- [Issues](https://github.com/langfuse/langfuse/issues)を作成したり、コメントしたりしてください。
- PRを送ってください。開発環境のセットアップ方法は[CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください。

## 🥇 ライセンス

このリポジトリは、`ee`フォルダーを除きMITライセンスです。詳細は[LICENSE](LICENSE)および[ドキュメント](https://langfuse.com/handbook/chapters/open-source)をご覧ください。

## 依存関係

このコードベースはDockerコンテナでデプロイしています。使用しているベースイメージを含むイメージのビルド方法は、[web/Dockerfile](web/Dockerfile)と[worker/Dockerfile](worker/Dockerfile)を参照してください。

## ⭐️ スター履歴

<a href="https://star-history.com/#langfuse/langfuse&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" style="border-radius: 15px;" />
 </picture>
</a>

## ❤️ Langfuseを利用しているオープンソースプロジェクト

LangfuseのPythonまたはJS/TS SDKを利用している主要なオープンソースプロジェクト（スター数順、[ソース](https://github.com/langfuse/langfuse-docs/blob/main/components-mdx/dependents)）:

| リポジトリ                                                                                                                                                                                                                                                                                                     | スター |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/130738209?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Significant-Gravitas](https://github.com/Significant-Gravitas) / [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)                                                   | 187903 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/127165244?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langgenius](https://github.com/langgenius) / [dify](https://github.com/langgenius/dify)                                                                                       | 160407 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85702467?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langflow-ai](https://github.com/langflow-ai) / [langflow](https://github.com/langflow-ai/langflow)                                                                             | 156333 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/4158466?s=40&v=4" width="20" height="20" alt=""> &nbsp; [bytedance](https://github.com/bytedance) / [deer-flow](https://github.com/bytedance/deer-flow)                                                                                  |  84985 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/320819803?s=40&v=4" width="20" height="20" alt=""> &nbsp; [cheaper-inference](https://github.com/cheaper-inference) / [OmniRoute](https://github.com/cheaper-inference/OmniRoute)                                                        |  84532 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/131470832?s=40&v=4" width="20" height="20" alt=""> &nbsp; [lobehub](https://github.com/lobehub) / [lobehub](https://github.com/lobehub/lobehub)                                                                                          |  83873 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/23818?s=40&v=4" width="20" height="20" alt=""> &nbsp; [abi](https://github.com/abi) / [screenshot-to-code](https://github.com/abi/screenshot-to-code)                                                                                    |  81022 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/6154722?s=40&v=4" width="20" height="20" alt=""> &nbsp; [microsoft](https://github.com/microsoft) / [ai-agents-for-beginners](https://github.com/microsoft/ai-agents-for-beginners)                                                      |  78925 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/14957082?s=40&v=4" width="20" height="20" alt=""> &nbsp; [openai](https://github.com/openai) / [openai-cookbook](https://github.com/openai/openai-cookbook)                                                                              |  76955 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/184127137?s=40&v=4" width="20" height="20" alt=""> &nbsp; [cline](https://github.com/cline) / [cline](https://github.com/cline/cline)                                                                                                    |  71312 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/121462774?s=40&v=4" width="20" height="20" alt=""> &nbsp; [BerriAI](https://github.com/BerriAI) / [litellm](https://github.com/BerriAI/litellm)                                                                                          |  62709 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/130722866?s=40&v=4" width="20" height="20" alt=""> &nbsp; [run-llama](https://github.com/run-llama) / [llama_index](https://github.com/run-llama/llama_index)                                                                            |  52806 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/169401942?s=40&v=4" width="20" height="20" alt=""> &nbsp; [LibreChat-AI](https://github.com/LibreChat-AI) / [LibreChat](https://github.com/LibreChat-AI/LibreChat)                                                                       |  46745 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/67365215?s=40&v=4" width="20" height="20" alt=""> &nbsp; [volcengine](https://github.com/volcengine) / [OpenViking](https://github.com/volcengine/OpenViking)                                                                            |  41535 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/118165258?s=40&v=4" width="20" height="20" alt=""> &nbsp; [HKUDS](https://github.com/HKUDS) / [LightRAG](https://github.com/HKUDS/LightRAG)                                                                                              |  40529 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/15967950?s=40&v=4" width="20" height="20" alt=""> &nbsp; [directus](https://github.com/directus) / [directus](https://github.com/directus/directus)                                                                                      |  38820 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/34411969?s=40&v=4" width="20" height="20" alt=""> &nbsp; [DayuanJiang](https://github.com/DayuanJiang) / [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)                                                               |  36683 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/131946000?s=40&v=4" width="20" height="20" alt=""> &nbsp; [onyx-dot-app](https://github.com/onyx-dot-app) / [onyx](https://github.com/onyx-dot-app/onyx)                                                                                 |  33212 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/102226726?s=40&v=4" width="20" height="20" alt=""> &nbsp; [labring](https://github.com/labring) / [FastGPT](https://github.com/labring/FastGPT)                                                                                          |  29994 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/149120496?s=40&v=4" width="20" height="20" alt=""> &nbsp; [mastra-ai](https://github.com/mastra-ai) / [mastra](https://github.com/mastra-ai/mastra)                                                                                      |  29335 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/14985020?s=40&v=4" width="20" height="20" alt=""> &nbsp; [vercel](https://github.com/vercel) / [ai](https://github.com/vercel/ai)                                                                                                        |  27740 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/157326433?s=40&v=4" width="20" height="20" alt=""> &nbsp; [onlook-dev](https://github.com/onlook-dev) / [onlook](https://github.com/onlook-dev/onlook)                                                                                   |  27117 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/137907881?s=40&v=4" width="20" height="20" alt=""> &nbsp; [promptfoo](https://github.com/promptfoo) / [promptfoo](https://github.com/promptfoo/promptfoo)                                                                                |  26836 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/170767358?s=40&v=4" width="20" height="20" alt=""> &nbsp; [kortix-ai](https://github.com/kortix-ai) / [CompanyOS](https://github.com/kortix-ai/CompanyOS)                                                                                |  20378 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/255961667?s=40&v=4" width="20" height="20" alt=""> &nbsp; [gastownhall](https://github.com/gastownhall) / [gastown](https://github.com/gastownhall/gastown)                                                                              |  18691 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/134388954?s=40&v=4" width="20" height="20" alt=""> &nbsp; [camel-ai](https://github.com/camel-ai) / [camel](https://github.com/camel-ai/camel)                                                                                           |  18010 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/185937207?s=40&v=4" width="20" height="20" alt=""> &nbsp; [suitenumerique](https://github.com/suitenumerique) / [docs](https://github.com/suitenumerique/docs)                                                                           |  16967 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/109217591?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Arindam200](https://github.com/Arindam200) / [awesome-ai-apps](https://github.com/Arindam200/awesome-ai-apps)                                                                 |  16712 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/24586296?s=40&v=4" width="20" height="20" alt=""> &nbsp; [apify](https://github.com/apify) / [apify-mcp-server](https://github.com/apify/apify-mcp-server)                                                                               |  14774 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/264152072?s=40&v=4" width="20" height="20" alt=""> &nbsp; [The-PR-Agent](https://github.com/The-PR-Agent) / [pr-agent](https://github.com/The-PR-Agent/pr-agent)                                                                         |  14686 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/6154722?s=40&v=4" width="20" height="20" alt=""> &nbsp; [microsoft](https://github.com/microsoft) / [agent-framework](https://github.com/microsoft/agent-framework)                                                                      |  14532 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/193350244?s=40&v=4" width="20" height="20" alt=""> &nbsp; [The-Pocket](https://github.com/The-Pocket) / [PocketFlow](https://github.com/The-Pocket/PocketFlow)                                                                           |  11303 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/14957082?s=40&v=4" width="20" height="20" alt=""> &nbsp; [openai](https://github.com/openai) / [codex-security](https://github.com/openai/codex-security)                                                                                |  11301 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/187570293?s=40&v=4" width="20" height="20" alt=""> &nbsp; [tambo-ai](https://github.com/tambo-ai) / [tambo](https://github.com/tambo-ai/tambo)                                                                                           |  11222 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/201282378?s=40&v=4" width="20" height="20" alt=""> &nbsp; [VoltAgent](https://github.com/VoltAgent) / [voltagent](https://github.com/VoltAgent/voltagent)                                                                                |  10920 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/207005519?s=40&v=4" width="20" height="20" alt=""> &nbsp; [mcp-use](https://github.com/mcp-use) / [mcp-use](https://github.com/mcp-use/mcp-use)                                                                                          |  10846 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/17074854?s=40&v=4" width="20" height="20" alt=""> &nbsp; [yugabyte](https://github.com/yugabyte) / [yugabyte-db](https://github.com/yugabyte/yugabyte-db)                                                                                |  10649 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/207381488?s=40&v=4" width="20" height="20" alt=""> &nbsp; [droidrun](https://github.com/droidrun) / [mobilerun](https://github.com/droidrun/mobilerun)                                                                                   |   9947 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/454862?s=40&v=4" width="20" height="20" alt=""> &nbsp; [MervinPraison](https://github.com/MervinPraison) / [PraisonAI](https://github.com/MervinPraison/PraisonAI)                                                                       |   9321 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/3412179?s=40&v=4" width="20" height="20" alt=""> &nbsp; [miurla](https://github.com/miurla) / [morphic](https://github.com/miurla/morphic)                                                                                               |   9275 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/123981229?s=40&v=4" width="20" height="20" alt=""> &nbsp; [plastic-labs](https://github.com/plastic-labs) / [honcho](https://github.com/plastic-labs/honcho)                                                                             |   7944 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/58117316?s=40&v=4" width="20" height="20" alt=""> &nbsp; [raycast](https://github.com/raycast) / [extensions](https://github.com/raycast/extensions)                                                                                     |   7832 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/215317808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [2FastLabs](https://github.com/2FastLabs) / [agent-squad](https://github.com/2FastLabs/agent-squad)                                                                            |   7799 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/35524243?s=40&v=4" width="20" height="20" alt=""> &nbsp; [xerrors](https://github.com/xerrors) / [Yuxi](https://github.com/xerrors/Yuxi)                                                                                                 |   7601 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/132635806?s=40&v=4" width="20" height="20" alt=""> &nbsp; [refly-ai](https://github.com/refly-ai) / [refly](https://github.com/refly-ai/refly)                                                                                           |   7547 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/156485526?s=40&v=4" width="20" height="20" alt=""> &nbsp; [crestalnetwork](https://github.com/crestalnetwork) / [intentkit](https://github.com/crestalnetwork/intentkit)                                                                 |   6524 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/47287758?s=40&v=4" width="20" height="20" alt=""> &nbsp; [coleam00](https://github.com/coleam00) / [ottomator-agents](https://github.com/coleam00/ottomator-agents)                                                                      |   5791 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/88676955?s=40&v=4" width="20" height="20" alt=""> &nbsp; [zenml-io](https://github.com/zenml-io) / [zenml](https://github.com/zenml-io/zenml)                                                                                            |   5635 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/185852128?s=40&v=4" width="20" height="20" alt=""> &nbsp; [colanode](https://github.com/colanode) / [colanode](https://github.com/colanode/colanode)                                                                                     |   5186 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/132832125?s=40&v=4" width="20" height="20" alt=""> &nbsp; [getzep](https://github.com/getzep) / [zep](https://github.com/getzep/zep)                                                                                                     |   4989 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85702467?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langflow-ai](https://github.com/langflow-ai) / [openrag](https://github.com/langflow-ai/openrag)                                                                               |   4671 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/8251002?s=40&v=4" width="20" height="20" alt=""> &nbsp; [JoshuaC215](https://github.com/JoshuaC215) / [agent-service-toolkit](https://github.com/JoshuaC215/agent-service-toolkit)                                                       |   4564 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/308338691?s=40&v=4" width="20" height="20" alt=""> &nbsp; [FlowElement-xinliuyuansu](https://github.com/FlowElement-xinliuyuansu) / [m_flow](https://github.com/FlowElement-xinliuyuansu/m_flow)                                         |   4509 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/98460328?s=40&v=4" width="20" height="20" alt=""> &nbsp; [panaversity](https://github.com/panaversity) / [learn-agentic-ai](https://github.com/panaversity/learn-agentic-ai)                                                             |   4395 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/188657705?s=40&v=4" width="20" height="20" alt=""> &nbsp; [bragai](https://github.com/bragai) / [bRAG-langchain](https://github.com/bragai/bRAG-langchain)                                                                               |   4196 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/248286111?s=40&v=4" width="20" height="20" alt=""> &nbsp; [strukto-ai](https://github.com/strukto-ai) / [mirage](https://github.com/strukto-ai/mirage)                                                                                   |   3763 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/3299148?s=40&v=4" width="20" height="20" alt=""> &nbsp; [awslabs](https://github.com/awslabs) / [agentcore-samples](https://github.com/awslabs/agentcore-samples)                                                                        |   3512 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/44717411?s=40&v=4" width="20" height="20" alt=""> &nbsp; [ding113](https://github.com/ding113) / [claude-code-hub](https://github.com/ding113/claude-code-hub)                                                                           |   3399 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/153429891?s=40&v=4" width="20" height="20" alt=""> &nbsp; [rpamis](https://github.com/rpamis) / [comet](https://github.com/rpamis/comet)                                                                                                 |   3270 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/153761188?s=40&v=4" width="20" height="20" alt=""> &nbsp; [remix-project-org](https://github.com/remix-project-org) / [remix-project](https://github.com/remix-project-org/remix-project)                                                |   3096 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/34125411?s=40&v=4" width="20" height="20" alt=""> &nbsp; [tsedio](https://github.com/tsedio) / [tsed](https://github.com/tsedio/tsed)                                                                                                    |   3091 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/11744586?s=40&v=4" width="20" height="20" alt=""> &nbsp; [MetaMask](https://github.com/MetaMask) / [metamask-mobile](https://github.com/MetaMask/metamask-mobile)                                                                        |   3080 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/11855343?s=40&v=4" width="20" height="20" alt=""> &nbsp; [pingcap](https://github.com/pingcap) / [autoflow](https://github.com/pingcap/autoflow)                                                                                         |   2979 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/62564480?s=40&v=4" width="20" height="20" alt=""> &nbsp; [wassim249](https://github.com/wassim249) / [fastapi-langgraph-agent-production-ready-template](https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template) |   2726 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/204899035?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Agent-Field](https://github.com/Agent-Field) / [agentfield](https://github.com/Agent-Field/agentfield)                                                                        |   2644 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/185937207?s=40&v=4" width="20" height="20" alt=""> &nbsp; [suitenumerique](https://github.com/suitenumerique) / [meet](https://github.com/suitenumerique/meet)                                                                           |   2468 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/179994263?s=40&v=4" width="20" height="20" alt=""> &nbsp; [YFGaia](https://github.com/YFGaia) / [dify-plus](https://github.com/YFGaia/dify-plus)                                                                                         |   2263 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/148051844?s=40&v=4" width="20" height="20" alt=""> &nbsp; [PrimeIntellect-ai](https://github.com/PrimeIntellect-ai) / [prime-rl](https://github.com/PrimeIntellect-ai/prime-rl)                                                          |   2215 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/46323662?s=40&v=4" width="20" height="20" alt=""> &nbsp; [TheSpaghettiDetective](https://github.com/TheSpaghettiDetective) / [obico-server](https://github.com/TheSpaghettiDetective/obico-server)                                       |   1924 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/186889946?s=40&v=4" width="20" height="20" alt=""> &nbsp; [ai-hero-dev](https://github.com/ai-hero-dev) / [ai-hero](https://github.com/ai-hero-dev/ai-hero)                                                                              |   1915 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/1548229?s=40&v=4" width="20" height="20" alt=""> &nbsp; [arabold](https://github.com/arabold) / [docs-mcp-server](https://github.com/arabold/docs-mcp-server)                                                                            |   1856 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/2314423?s=40&v=4" width="20" height="20" alt=""> &nbsp; [trailofbits](https://github.com/trailofbits) / [buttercup](https://github.com/trailofbits/buttercup)                                                                            |   1741 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85268109?s=40&v=4" width="20" height="20" alt=""> &nbsp; [MLSysOps](https://github.com/MLSysOps) / [MLE-agent](https://github.com/MLSysOps/MLE-agent)                                                                                    |   1580 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/30079057?s=40&v=4" width="20" height="20" alt=""> &nbsp; [kodustech](https://github.com/kodustech) / [kodus-ai](https://github.com/kodustech/kodus-ai)                                                                                   |   1565 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/95047587?s=40&v=4" width="20" height="20" alt=""> &nbsp; [bugbasesecurity](https://github.com/bugbasesecurity) / [pentest-copilot](https://github.com/bugbasesecurity/pentest-copilot)                                                   |   1546 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/297117619?s=40&v=4" width="20" height="20" alt=""> &nbsp; [agentconnect-md](https://github.com/agentconnect-md) / [agentconnect](https://github.com/agentconnect-md/agentconnect)                                                        |   1514 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/144196744?s=40&v=4" width="20" height="20" alt=""> &nbsp; [TIGER-AI-Lab](https://github.com/TIGER-AI-Lab) / [TheoremExplainAgent](https://github.com/TIGER-AI-Lab/TheoremExplainAgent)                                                   |   1513 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/160371962?s=40&v=4" width="20" height="20" alt=""> &nbsp; [hashgraph-online](https://github.com/hashgraph-online) / [awesome-codex-plugins](https://github.com/hashgraph-online/awesome-codex-plugins)                                   |   1508 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/22758471?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Gsync](https://github.com/Gsync) / [jobsync](https://github.com/Gsync/jobsync)                                                                                                 |   1493 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/123133689?s=40&v=4" width="20" height="20" alt=""> &nbsp; [inkeep](https://github.com/inkeep) / [agents](https://github.com/inkeep/agents)                                                                                               |   1490 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/65890619?s=40&v=4" width="20" height="20" alt=""> &nbsp; [zstar1003](https://github.com/zstar1003) / [ragflow-plus](https://github.com/zstar1003/ragflow-plus)                                                                           |   1465 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/2045570?s=40&v=4" width="20" height="20" alt=""> &nbsp; [hotovo](https://github.com/hotovo) / [aider-desk](https://github.com/hotovo/aider-desk)                                                                                         |   1463 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/184127137?s=40&v=4" width="20" height="20" alt=""> &nbsp; [cline](https://github.com/cline) / [kanban](https://github.com/cline/kanban)                                                                                                  |   1376 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/248630197?s=40&v=4" width="20" height="20" alt=""> &nbsp; [wanxingai](https://github.com/wanxingai) / [LightAgent](https://github.com/wanxingai/LightAgent)                                                                              |   1245 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/16997807?s=40&v=4" width="20" height="20" alt=""> &nbsp; [FranciscoMoretti](https://github.com/FranciscoMoretti) / [chat-js](https://github.com/FranciscoMoretti/chat-js)                                                                |   1203 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/45643866?s=40&v=4" width="20" height="20" alt=""> &nbsp; [cognizant-ai-lab](https://github.com/cognizant-ai-lab) / [neuro-san-studio](https://github.com/cognizant-ai-lab/neuro-san-studio)                                              |   1194 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/242540347?s=40&v=4" width="20" height="20" alt=""> &nbsp; [okou-ai](https://github.com/okou-ai) / [okou](https://github.com/okou-ai/okou)                                                                                                |   1162 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/18422723?s=40&v=4" width="20" height="20" alt=""> &nbsp; [alishobeiri](https://github.com/alishobeiri) / [thread-notebook](https://github.com/alishobeiri/thread-notebook)                                                               |   1106 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/121352441?s=40&v=4" width="20" height="20" alt=""> &nbsp; [openops-cloud](https://github.com/openops-cloud) / [openops](https://github.com/openops-cloud/openops)                                                                        |   1081 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/151867818?s=40&v=4" width="20" height="20" alt=""> &nbsp; [dynamiq-ai](https://github.com/dynamiq-ai) / [dynamiq](https://github.com/dynamiq-ai/dynamiq)                                                                                 |   1073 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/176438967?s=40&v=4" width="20" height="20" alt=""> &nbsp; [trendy-design](https://github.com/trendy-design) / [llmchat](https://github.com/trendy-design/llmchat)                                                                        |   1072 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/230847519?s=40&v=4" width="20" height="20" alt=""> &nbsp; [cuga-project](https://github.com/cuga-project) / [cuga-agent](https://github.com/cuga-project/cuga-agent)                                                                     |   1070 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/315596236?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Minima-AI-Inc](https://github.com/Minima-AI-Inc) / [minima](https://github.com/Minima-AI-Inc/minima)                                                                          |   1056 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/209605279?s=40&v=4" width="20" height="20" alt=""> &nbsp; [ZTE-AICloud](https://github.com/ZTE-AICloud) / [Co-Sight](https://github.com/ZTE-AICloud/Co-Sight)                                                                            |   1015 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/174703732?s=40&v=4" width="20" height="20" alt=""> &nbsp; [china-qijizhifeng](https://github.com/china-qijizhifeng) / [agentic-harness-engineering](https://github.com/china-qijizhifeng/agentic-harness-engineering)                    |    959 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/17177659?s=40&v=4" width="20" height="20" alt=""> &nbsp; [sanity-io](https://github.com/sanity-io) / [next-sanity](https://github.com/sanity-io/next-sanity)                                                                             |    956 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/123981229?s=40&v=4" width="20" height="20" alt=""> &nbsp; [plastic-labs](https://github.com/plastic-labs) / [tutor-gpt](https://github.com/plastic-labs/tutor-gpt)                                                                       |    933 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/209155962?s=40&v=4" width="20" height="20" alt=""> &nbsp; [strands-agents](https://github.com/strands-agents) / [samples](https://github.com/strands-agents/samples)                                                                     |    924 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/20493493?s=40&v=4" width="20" height="20" alt=""> &nbsp; [andysingal](https://github.com/andysingal) / [llm-course](https://github.com/andysingal/llm-course)                                                                            |    891 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/7464134?s=40&v=4" width="20" height="20" alt=""> &nbsp; [groq](https://github.com/groq) / [openbench](https://github.com/groq/openbench)                                                                                                 |    832 |

## 🔒 セキュリティとプライバシー

データのセキュリティとプライバシーを重視しています。詳細は[セキュリティとプライバシー](https://langfuse.com/security)のページをご覧ください。

### テレメトリー

デフォルトでは、Langfuseはセルフホストされたインスタンスの基本的な利用統計を中央サーバー（PostHog）に自動的に送信します。

これにより、以下のことが可能になります:

1. Langfuseの利用状況を把握し、最も重要な機能を改善する。
2. 社内外（資金調達など）への報告のために、全体的な利用状況を追跡する。

テレメトリーには、生の traces、prompts、observations、scores、またはデータセットの内容は含まれません。収集される正確なフィールド、送信先、実装の参照先は[テレメトリーのドキュメント](https://langfuse.com/self-hosting/security/telemetry)に記載しています。

Langfuse OSS では、`TELEMETRY_ENABLED=false` を設定することでテレメトリーをオプトアウトできます。

<!-- Scarf pixel — cookie-free, privacy-friendly analytics for README views (no cookies, no IP/PII stored). https://docs.scarf.sh/web-traffic/ -->
<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=5f9b700f-ee94-4940-b005-e72def008ffa&page=README.ja.md" />
