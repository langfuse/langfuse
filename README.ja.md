![Langfuse GitHub Banner](https://langfuse.com/images/docs/github-readme/github-banner.png)

<div align="center">
   <div>
      <h3>
          <a href="https://langfuse.com/jp">
            <strong>🇯🇵 🤝 🪢</strong>
         </a> · 
         <a href="https://cloud.langfuse.com">
            <strong>Langfuse Cloud</strong>
         </a> · 
         <a href="https://langfuse.com/docs/deployment/self-host">
            <strong>セルフホスティング</strong>
         </a> · 
         <a href="https://langfuse.com/demo">
            <strong>デモ</strong>
         </a>
      </h3>
   </div>

   <div>
      <a href="https://langfuse.com/docs"><strong>ドキュメント</strong></a> ·
      <a href="https://langfuse.com/issues"><strong>バグ報告</strong></a> ·
      <a href="https://langfuse.com/ideas"><strong>機能リクエスト</strong></a> ·
      <a href="https://langfuse.com/changelog"><strong>変更履歴</strong></a> ·
      <a href="https://langfuse.com/roadmap"><strong>ロードマップ</strong></a> ·
   </div>
   <br/>
   <span>Langfuseは、サポートと機能リクエストのために <a href="https://github.com/orgs/langfuse/discussions"><strong>GitHub Discussions</strong></a> を利用しています。</span>
   <br/>
   <span><b>We're hiring.</b> <a href="https://langfuse.com/careers"><strong>チームに加わる</strong></a> （製品エンジニアリングおよびテクニカルGTMのポジション）への応募をお待ちしています。</span>
   <br/>
   <br/>
   <div>
   </div>
</div>

<p align="center">
   <a href="https://github.com/langfuse/langfuse/blob/main/LICENSE">
   <img src="https://img.shields.io/badge/License-MIT-E11311.svg" alt="MIT License">
   </a>
   <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange" alt="Y Combinator W23"></a>
   <a href="https://hub.docker.com/u/langfuse" target="_blank">
   <img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/langfuse/langfuse?labelColor=%20%23FDB062&logo=Docker&labelColor=%20%23528bff"></a>
   <a href="https://pypi.python.org/pypi/langfuse"><img src="https://img.shields.io/pypi/dm/langfuse?logo=python&logoColor=white&label=pypi%20langfuse&color=blue" alt="langfuse Python package on PyPi"></a>
   <a href="https://www.npmjs.com/package/langfuse"><img src="https://img.shields.io/npm/dm/langfuse?logo=npm&logoColor=white&label=npm%20langfuse&color=blue" alt="langfuse npm package"></a>
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

Langfuseは**オープンソースのLLMエンジニアリング**プラットフォームです。  
チームが共同でAIアプリケーションを**開発、監視、評価**、および**デバッグ**するのを支援します。  
Langfuseは**数分でセルフホスト可能**で、**多くの実績を持つ**システムです。

[![Langfuse Overview Video](https://github.com/user-attachments/assets/3926b288-ff61-4b95-8aa1-45d041c70866)](https://langfuse.com/watch-demo)

## ✨ コア機能

![Langfuse Overview](https://langfuse.com/images/docs/github-readme/github-feature-overview.png)

- **[LLMアプリケーションの可観測性](https://langfuse.com/docs/tracing):**  
  アプリケーションにインストゥルメンテーションを導入し、Langfuseへトレースを取り込むことで、LLM呼び出しやリトリーバル、埋め込み、エージェントアクションなどの関連ロジックを追跡できます。  
  複雑なログやユーザーセッションを解析・デバッグできます。  
  インタラクティブな[デモ](https://langfuse.com/docs/demo)で動作を確認してください。

- **[プロンプト管理](https://langfuse.com/docs/prompts/get-started):**  
  プロンプトを一元管理し、バージョン管理しながら共同で改善を行えます。  
  サーバーおよびクライアント側で強力なキャッシングを行うため、アプリケーションのレイテンシを増やすことなくプロンプトの改良が可能です。

- **[評価](https://langfuse.com/docs/scores/overview):**  
  評価はLLMアプリケーション開発ワークフローの要であり、Langfuseは多様なニーズに対応します。  
  LLMを判定者として用いる方法、ユーザーフィードバックの収集、手動によるラベリング、API/SDKを通じたカスタム評価パイプラインをサポートします。

- **[データセット](https://langfuse.com/docs/datasets/overview):**  
  LLMアプリケーション評価用のテストセットやベンチマークを構築できます。  
  継続的な改善、事前デプロイテスト、構造化された実験、柔軟な評価、さらにLangChainやLlamaIndexなどとのシームレスな統合をサポートします。

- **[LLMプレイグラウンド](https://langfuse.com/docs/playground):**  
  プロンプトやモデル設定のテスト・反復作業を支援するツールで、フィードバックループを短縮し開発を加速します。  
  トレースで不具合が見つかった場合、直接プレイグラウンドへ飛び、迅速に改善できます。

- **[包括的なAPI](https://langfuse.com/docs/api):**  
  LangfuseはAPIを通じて提供されるビルディングブロックを用い、カスタムLLMOpsワークフローの基盤として頻繁に利用されます。  
  OpenAPI仕様、Postmanコレクション、PythonやJS/TS向けの型付きSDKが利用可能です。

## 📦 Langfuseのデプロイ

![Langfuse Deployment Options](https://langfuse.com/images/docs/github-readme/github-deployment-options.png)

### Langfuse Cloud

Langfuseチームによるマネージドデプロイメント。充実した無料プラン（ホビープラン）で、クレジットカード不要です。

<div align="center">
    <a href="https://cloud.langfuse.com" target="_blank">
        <img alt="Static Badge" src="https://img.shields.io/badge/»%20Sign%20up%20for%20Langfuse%20Cloud-8A2BE2?&color=orange">
    </a>
</div>

### セルフホスティング Langfuse

自身のインフラ上でLangfuseを実行できます:

- **[Local (docker compose)](https://langfuse.com/self-hosting/local):**  
  Docker Composeを使用して、たった5分で自分のマシン上でLangfuseを実行できます.

  ```bash
  # 最新のLangfuseリポジトリのコピーを取得
  git clone https://github.com/langfuse/langfuse.git
  cd langfuse

  # Langfuseのdocker composeを起動
  docker compose up
  ```

- **[Kubernetes (Helm)](https://langfuse.com/self-hosting/kubernetes-helm):**  
  Helmを使用してKubernetesクラスター上でLangfuseを実行します。  
  こちらが推奨される本番環境でのデプロイ方法です。

- **[VM](https://langfuse.com/self-hosting/docker-compose):**  
  Docker Composeを使用して、単一の仮想マシン上でLangfuseを実行します。

- Terraform テンプレート: [AWS](https://langfuse.com/self-hosting/aws), [Azure](https://langfuse.com/self-hosting/azure), [GCP](https://langfuse.com/self-hosting/gcp)

[セルフホスティングのドキュメント](https://langfuse.com/self-hosting)を参照し、アーキテクチャや設定オプションの詳細をご確認ください。

## 🔌 インテグレーション

![Langfuse Integrations](https://langfuse.com/images/docs/github-readme/github-integrations.png)

### 主なインテグレーション:

| インテグレーション                                                                  | 対応言語・環境            | 説明                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [SDK](https://langfuse.com/docs/sdk)                                                  | Python, JS/TS             | SDKを利用して手動でインストゥルメンテーションを実装し、完全な柔軟性を提供します。                                                                  |
| [OpenAI](https://langfuse.com/docs/integrations/openai)                               | Python, JS/TS             | OpenAI SDKのドロップイン置換による自動インストゥルメンテーションを実現します。                                                                   |
| [Langchain](https://langfuse.com/docs/integrations/langchain)                         | Python, JS/TS             | Langchainアプリケーションにコールバックハンドラーを渡すことで自動的に計測します。                                                                 |
| [LlamaIndex](https://langfuse.com/docs/integrations/llama-index/get-started)           | Python                    | LlamaIndexのコールバックシステムを介して自動的にインストゥルメントします。                                                                         |
| [Haystack](https://langfuse.com/docs/integrations/haystack)                           | Python                    | Haystackのコンテンツトレースシステムを利用した自動インストゥルメンテーションを実現します。                                                          |
| [LiteLLM](https://langfuse.com/docs/integrations/litellm)                             | Python, JS/TS (proxy only)| GPTのドロップイン置換として任意のLLMを使用できます。Azure、OpenAI、Cohere、Anthropic、Ollama、VLLM、Sagemaker、HuggingFace、Replicate（100+ LLM）に対応。 |
| [Vercel AI SDK](https://langfuse.com/docs/integrations/vercel-ai-sdk)                   | JS/TS                     | React、Next.js、Vue、Svelte、Node.jsを使用してAI搭載アプリケーションの構築を支援するTypeScriptツールキットです。                                      |
| [API](https://langfuse.com/docs/api)                                                  |                           | 公開APIを直接呼び出すことが可能です。OpenAPI仕様も利用できます。                                                                                 |

### Langfuseと統合されているパッケージ:

| 名前                                                                      | タイプ             | 説明                                                                                                      |
| ------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| [Instructor](https://langfuse.com/docs/integrations/instructor)           | ライブラリ         | 構造化されたLLM出力（JSON、Pydantic）を取得するためのライブラリ                                            |
| [DSPy](https://langfuse.com/docs/integrations/dspy)                       | ライブラリ         | LLMプロンプトや重み付けを体系的に最適化するためのフレームワーク                                             |
| [Mirascope](https://langfuse.com/docs/integrations/mirascope)             | ライブラリ         | LLMアプリケーション構築用のPythonツールキット                                                               |
| [Ollama](https://langfuse.com/docs/integrations/ollama)                   | モデル（ローカル） | オープンソースLLMを手軽にローカルで実行するためのツール                                                     |
| [Amazon Bedrock](https://langfuse.com/docs/integrations/amazon-bedrock)     | モデル             | AWS上でファウンデーションモデルやファインチューニング済みモデルを実行                                         |
| [Google VertexAI and Gemini](https://langfuse.com/docs/integrations/google-vertex-ai)     | モデル             | Google上でファウンデーションモデルやファインチューニング済みモデルを実行                                         |
| [AutoGen](https://langfuse.com/docs/integrations/autogen)                 | エージェントフレームワーク | 分散型エージェント構築のためのオープンソースLLMプラットフォーム                                               |
| [Flowise](https://langfuse.com/docs/integrations/flowise)                 | チャット/エージェント UI | JS/TSのノーコードビルダーで、カスタマイズ可能なLLMフローを構築                                              |
| [Langflow](https://langfuse.com/docs/integrations/langflow)               | チャット/エージェント UI | PythonベースのUIで、react-flowを用いてLangChainの実験やプロトタイピングを容易に実現                           |
| [Dify](https://langfuse.com/docs/integrations/dify)                       | チャット/エージェント UI | ノーコードでLLMアプリ開発が可能なオープンソースプラットフォーム                                               |
| [OpenWebUI](https://langfuse.com/docs/integrations/openwebui)             | チャット/エージェント UI | 自前ホストおよびローカルモデルに対応するLLMチャットWeb UI                                                    |
| [Promptfoo](https://langfuse.com/docs/integrations/promptfoo)             | ツール             | オープンソースのLLMテストプラットフォーム                                                                   |
| [LobeChat](https://langfuse.com/docs/integrations/lobechat)               | チャット/エージェント UI | オープンソースのチャットボットプラットフォーム                                                               |
| [Vapi](https://langfuse.com/docs/integrations/vapi)                       | プラットフォーム   | オープンソースの音声AIプラットフォーム                                                                       |
| [Inferable](https://langfuse.com/docs/integrations/other/inferable)        | エージェント       | 分散型エージェント構築のためのオープンソースLLMプラットフォーム                                               |
| [Gradio](https://langfuse.com/docs/integrations/other/gradio)             | チャット/エージェント UI | チャットUIなどのWebインターフェース構築のためのオープンソースPythonライブラリ                                |
| [Goose](https://langfuse.com/docs/integrations/goose)                   | エージェント       | 分散型エージェント構築のためのオープンソースLLMプラットフォーム                                               |
| [smolagents](https://langfuse.com/docs/integrations/smolagents)           | エージェント       | オープンソースのAIエージェントフレームワーク                                                                 |
| [CrewAI](https://langfuse.com/docs/integrations/crewai)                   | エージェント       | エージェントの協調とツール利用を実現するマルチエージェントフレームワーク                                      |

## 🚀 クイックスタート

アプリケーションにインストゥルメンテーションを導入し、LLM呼び出しやリトリーバル、埋め込み、エージェントアクションなどの動作をLangfuseに記録しましょう。  
複雑なログやユーザーセッションの解析・デバッグが可能になります。

### 1️⃣ 新規プロジェクトの作成

1. [Langfuseアカウント作成](https://cloud.langfuse.com/auth/sign-up) または [セルフホスト](https://langfuse.com/self-hosting)
2. 新規プロジェクトを作成
3. プロジェクト設定で新しいAPIクレデンシャルを作成

### 2️⃣ 初めてのLLM呼び出しのログ記録

[`@observe()` デコレーター](https://langfuse.com/docs/sdk/python/decorators)を利用することで、任意のPython製LLMアプリケーションのトレースが簡単に行えます。  
このクイックスタートでは、Langfuseの[OpenAI統合](https://langfuse.com/docs/integrations/openai)を使用して、全てのモデルパラメータを自動で取得します。

> [!TIP]
> OpenAIを利用していない場合は、[こちらのドキュメント](https://langfuse.com/docs/get-started#log-your-first-llm-call-to-langfuse)で、他のモデルやフレームワークのログ記録方法をご確認ください。

```bash
pip install langfuse openai
```

```bash filename=".env"
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_HOST="https://cloud.langfuse.com" # 🇪🇺 EUリージョン
# LANGFUSE_HOST="https://us.cloud.langfuse.com" # 🇺🇸 USリージョン
```

```python:/@observe()/ /from langfuse.openai import openai/ filename="main.py"
from langfuse import observe
from langfuse.openai import openai  # OpenAI統合

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

### 3️⃣ Langfuseでトレースを確認する

Langfuse上で、LLM呼び出しおよびその他のアプリケーションロジックのトレースを確認できます。

![Example trace in Langfuse](https://langfuse.com/images/docs/github-readme/github-example-trace.png)

_[Langfuseの公開トレース例](https://cloud.langfuse.com/project/cloramnkj0002jz088vzn1ja4/traces/2cec01e3-3dc2-472f-afcf-3b968cf0c1f4?timestamp=2025-02-10T14%3A27%3A30.275Z&observation=cb5ff844-07ef-41e6-b8e2-6c64344bc13b)_

> [!TIP]
>
> Langfuseでのトレースの詳細については、[こちら](https://langfuse.com/docs/tracing)をご参照いただくか、[インタラクティブデモ](https://langfuse.com/docs/demo)でお試しください。

## ⭐️ Star Langfuse

![Star Langfuse](https://langfuse.com/images/docs/github-readme/github-star-howto.gif)

## 💭 サポート

質問の回答をお探しの場合は:

- 当社の[ドキュメント](https://langfuse.com/docs)は、回答を探すための最良の出発点です。内容が充実しており、継続的なメンテナンスに努めています。GitHubを通じてドキュメントへの修正提案も可能です。
- よくある質問は[Langfuse FAQ](https://langfuse.com/faq)にまとめられています。
- [Ask AI](https://langfuse.com/docs/ask-ai)を利用すれば、質問に対して即座に回答を得ることができます。
- 日本語のサポートや決済, 請求書払いなどをお求めの場合は、日本のリセラー (https://gao-ai.com) にご相談ください。

サポートチャネル:

- **GitHub Discussionsの[パブリックQ&A](https://github.com/orgs/langfuse/discussions/categories/support)で質問してください。**  
  質問には、コードスニペット、スクリーンショット、背景情報など、できるだけ詳細な情報を含めるとスムーズな対応が可能です。
- GitHub Discussionsで[機能リクエスト](https://github.com/orgs/langfuse/discussions/categories/ideas)を投稿してください。
- GitHub Issuesにて[バグ報告](https://github.com/langfuse/langfuse/issues)を行ってください。
- 緊急の問い合わせの場合は、アプリ内チャットウィジェットでご連絡ください。

## 🤝 貢献

皆様からの貢献を歓迎します!

- GitHub Discussionsの[アイデア](https://github.com/orgs/langfuse/discussions/categories/ideas)に投票してください。
- [Issues](https://github.com/langfuse/langfuse/issues)を作成・コメントしてください。
- プルリクエストを送信してください。開発環境のセットアップ方法については[CONTRIBUTING.md](CONTRIBUTING.md)をご参照ください。

## 🥇 ライセンス

このリポジトリは、`ee`フォルダを除き、MITライセンスの下で公開されています。  
詳細は[LICENSE](LICENSE)および[オープンソースに関するドキュメント](https://langfuse.com/docs/open-source)をご確認ください。

## ⭐️ スターの履歴

<a href="https://star-history.com/#langfuse/langfuse&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" style="border-radius: 15px;" />
 </picture>
</a>

## ❤️ Langfuseを利用しているオープンソースプロジェクト

Langfuseを利用している主要なオープンソースPythonプロジェクト（スター数順）: ([出典](https://github.com/langfuse/langfuse-docs/blob/main/components-mdx/dependents))

| リポジトリ                                                                                                                                                                                                                                                          | スター |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/127165244?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langgenius](https://github.com/langgenius) / [dify](https://github.com/langgenius/dify)                                            | 54865 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/158137808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [open-webui](https://github.com/open-webui) / [open-webui](https://github.com/open-webui/open-webui)                                | 51531 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/131470832?s=40&v=4" width="20" height="20" alt=""> &nbsp; [lobehub](https://github.com/lobehub) / [lobe-chat](https://github.com/lobehub/lobe-chat)                                           | 49003 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85702467?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langflow-ai](https://github.com/langflow-ai) / [langflow](https://github.com/langflow-ai/langflow)                                  | 39093 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/130722866?s=40&v=4" width="20" height="20" alt=""> &nbsp; [run-llama](https://github.com/run-llama) / [llama_index](https://github.com/run-llama/llama_index)                                 | 37368 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/139558948?s=40&v=4" width="20" height="20" alt=""> &nbsp; [chatchat-space](https://github.com/chatchat-space) / [Langchain-Chatchat](https://github.com/chatchat-space/Langchain-Chatchat)    | 32486 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/128289781?s=40&v=4" width="20" height="20" alt=""> &nbsp; [FlowiseAI](https://github.com/FlowiseAI) / [Flowise](https://github.com/FlowiseAI/Flowise)                                         | 32448 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/31035808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [mindsdb](https://github.com/mindsdb) / [mindsdb](https://github.com/mindsdb/mindsdb)                                                | 26931 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/119600397?s=40&v=4" width="20" height="20" alt=""> &nbsp; [twentyhq](https://github.com/twentyhq) / [twenty](https://github.com/twentyhq/twenty)                                              | 24195 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/60330232?s=40&v=4" width="20" height="20" alt=""> &nbsp; [PostHog](https://github.com/PostHog) / [posthog](https://github.com/PostHog/posthog)                                                | 22618 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/121462774?s=40&v=4" width="20" height="20" alt=""> &nbsp; [BerriAI](https://github.com/BerriAI) / [litellm](https://github.com/BerriAI/litellm)                                               | 15151 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/179202840?s=40&v=4" width="20" height="20" alt=""> &nbsp; [mediar-ai](https://github.com/mediar-ai) / [screenpipe](https://github.com/mediar-ai/screenpipe)                                   | 11037 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/105877416?s=40&v=4" width="20" height="20" alt=""> &nbsp; [formbricks](https://github.com/formbricks) / [formbricks](https://github.com/formbricks/formbricks)                                |  9386 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/76263028?s=40&v=4" width="20" height="20" alt=""> &nbsp; [anthropics](https://github.com/anthropics) / [courses](https://github.com/anthropics/courses)                                       |  8385 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/78410652?s=40&v=4" width="20" height="20" alt=""> &nbsp; [GreyDGL](https://github.com/GreyDGL) / [PentestGPT](https://github.com/GreyDGL/PentestGPT)                                          |  7374 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/152537519?s=40&v=4" width="20" height="20" alt=""> &nbsp; [superagent-ai](https://github.com/superagent-ai) / [superagent](https://github.com/superagent-ai/superagent)                       |  5391 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/137907881?s=40&v=4" width="20" height="20" alt=""> &nbsp; [promptfoo](https://github.com/promptfoo) / [promptfoo](https://github.com/promptfoo/promptfoo)                                     |  4976 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/157326433?s=40&v=4" width="20" height="20" alt=""> &nbsp; [onlook-dev](https://github.com/onlook-dev) / [onlook](https://github.com/onlook-dev/onlook)                                        |  4141 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/7250217?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Canner](https://github.com/Canner) / [WrenAI](https://github.com/Canner/WrenAI)                                                      |  2526 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/11855343?s=40&v=4" width="20" height="20" alt=""> &nbsp; [pingcap](https://github.com/pingcap) / [autoflow](https://github.com/pingcap/autoflow)                                              |  2061 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85268109?s=40&v=4" width="20" height="20" alt=""> &nbsp; [MLSysOps](https://github.com/MLSysOps) / [MLE-agent](https://github.com/MLSysOps/MLE-agent)                                         |  1161 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/158137808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [open-webui](https://github.com/open-webui) / [pipelines](https://github.com/open-webui/pipelines)                                  |  1100 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/18422723?s=40&v=4" width="20" height="20" alt=""> &nbsp; [alishobeiri](https://github.com/alishobeiri) / [thread](https://github.com/alishobeiri/thread)                                      |  1074 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/125468716?s=40&v=4" width="20" height="20" alt=""> &nbsp; [topoteretes](https://github.com/topoteretes) / [cognee](https://github.com/topoteretes/cognee)                                     |   971 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/188657705?s=40&v=4" width="20" height="20" alt=""> &nbsp; [bRAGAI](https://github.com/bRAGAI) / [bRAG-langchain](https://github.com/bRAGAI/bRAG-langchain)                                    |   823 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/169500408?s=40&v=4" width="20" height="20" alt=""> &nbsp; [opslane](https://github.com/opslane) / [opslane](https://github.com/opslane/opslane)                                               |   677 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/151867818?s=40&v=4" width="20" height="20" alt=""> &nbsp; [dynamiq-ai](https://github.com/dynamiq-ai) / [dynamiq](https://github.com/dynamiq-ai/dynamiq)                                      |   639 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/48585267?s=40&v=4" width="20" height="20" alt=""> &nbsp; [theopenconversationkit](https://github.com/theopenconversationkit) / [tock](https://github.com/theopenconversationkit/tock)         |   514 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/20493493?s=40&v=4" width="20" height="20" alt=""> &nbsp; [andysingal](https://github.com/andysingal) / [llm-course](https://github.com/andysingal/llm-course)                                 |   394 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/132396805?s=40&v=4" width="20" height="20" alt=""> &nbsp; [phospho-app](https://github.com/phospho-app) / [phospho](https://github.com/phospho-app/phospho)                                   |   384 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/178644984?s=40&v=4" width="20" height="20" alt=""> &nbsp; [sentient-engineering](https://github.com/sentient-engineering) / [agent-q](https://github.com/sentient-engineering/agent-q)        |   370 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/168552753?s=40&v=4" width="20" height="20" alt=""> &nbsp; [sql-agi](https://github.com/sql-agi) / [DB-GPT](https://github.com/sql-agi/DB-GPT)                                                 |   324 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/60330232?s=40&v=4" width="20" height="20" alt=""> &nbsp; [PostHog](https://github.com/PostHog) / [posthog-foss](https://github.com/PostHog/posthog-foss)                                      |   305 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/154247157?s=40&v=4" width="20" height="20" alt=""> &nbsp; [vespperhq](https://github.com/vespperhq) / [vespper](https://github.com/vespperhq/vespper)                                         |   304 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/185116535?s=40&v=4" width="20" height="20" alt=""> &nbsp; [block](https://github.com/block) / [goose](https://github.com/block/goose)                                                         |   295 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/609489?s=40&v=4" width="20" height="20" alt=""> &nbsp; [aorwall](https://github.com/aorwall) / [moatless-tools](https://github.com/aorwall/moatless-tools)                                    |   291 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/2357342?s=40&v=4" width="20" height="20" alt=""> &nbsp; [dmayboroda](https://github.com/dmayboroda) / [minima](https://github.com/dmayboroda/minima)                                          |   221 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/66303003?s=40&v=4" width="20" height="20" alt=""> &nbsp; [RobotecAI](https://github.com/RobotecAI) / [rai](https://github.com/RobotecAI/rai)                                                  |   172 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/148684274?s=40&v=4" width="20" height="20" alt=""> &nbsp; [i-am-alice](https://github.com/i-am-alice) / [3rd-devs](https://github.com/i-am-alice/3rd-devs)                                    |   148 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/171735272?s=40&v=4" width="20" height="20" alt=""> &nbsp; [8090-inc](https://github.com/8090-inc) / [xrx-sample-apps](https://github.com/8090-inc/xrx-sample-apps)                            |   138 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/104478511?s=40&v=4" width="20" height="20" alt=""> &nbsp; [babelcloud](https://github.com/babelcloud) / [LLM-RGB](https://github.com/babelcloud/LLM-RGB)                                      |   135 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/15125613?s=40&v=4" width="20" height="20" alt=""> &nbsp; [souzatharsis](https://github.com/souzatharsis) / [tamingLLMs](https://github.com/souzatharsis/tamingLLMs)                           |   129 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/169401942?s=40&v=4" width="20" height="20" alt=""> &nbsp; [LibreChat-AI](https://github.com/LibreChat-AI) / [librechat.ai](https://github.com/LibreChat-AI/librechat.ai)                      |   128 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/51827949?s=40&v=4" width="20" height="20" alt=""> &nbsp; [deepset-ai](https://github.com/deepset-ai) / [haystack-core-integrations](https://github.com/deepset-ai/haystack-core-integrations) |   126 |

## 🔒 セキュリティとプライバシー

データのセキュリティとプライバシーは非常に重要です。  
詳細につきましては、[セキュリティとプライバシー](https://langfuse.com/security)ページをご参照ください。

### テレメトリー

デフォルトでは、Langfuseは以下の目的でセルフホストされたインスタンスの基本的な使用統計情報を中央サーバ（PostHog）へ自動的に報告します。

1. Langfuseの利用状況を把握し、最も重要な機能の改善に役立てる
2. 内部および外部（例：資金調達）のレポートのために全体の利用状況を追跡する

収集されたデータは第三者と共有されず、機微な情報は一切含まれていません。  
当社はこの点について極力透明性を保っており、収集される具体的なデータの詳細は[こちら](/web/src/features/telemetry/index.ts)で確認できます。

`TELEMETRY_ENABLED=false` を設定することで、テレメトリーの報告をオプトアウトできます.
