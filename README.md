![Langfuse GitHub Banner](https://langfuse.com/images/docs/github-readme/github-banner.png)

<div align="center">
   <div>
      <h3>
        <a href="https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product">
            <strong>Langfuse Is Doubling Down On Open Source</strong>
         </a> <br> <br>
         <a href="https://cloud.langfuse.com">
            <strong>Langfuse Cloud</strong>
         </a> · 
         <a href="https://langfuse.com/docs/deployment/self-host">
            <strong>Self Host</strong>
         </a> · 
         <a href="https://langfuse.com/demo">
            <strong>Demo</strong>
         </a>
      </h3>
   </div>

   <div>
      <a href="https://langfuse.com/docs"><strong>Docs</strong></a> ·
      <a href="https://langfuse.com/issues"><strong>Report Bug</strong></a> ·
      <a href="https://langfuse.com/ideas"><strong>Feature Request</strong></a> ·
      <a href="https://langfuse.com/changelog"><strong>Changelog</strong></a> ·
      <a href="https://langfuse.com/roadmap"><strong>Roadmap</strong></a> ·
   </div>
   <br/>
   <span>Langfuse uses <a href="https://github.com/orgs/langfuse/discussions"><strong>GitHub Discussions</strong></a>  for Support and Feature Requests.</span>
   <br/>
   <span><b>We're hiring.</b> <a href="https://langfuse.com/careers"><strong>Join us</strong></a> in product engineering and technical go-to-market roles.</span>
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

Langfuse is an **open source LLM engineering** platform. It helps teams collaboratively
**develop, monitor, evaluate,** and **debug** AI applications. Langfuse can be **self-hosted in minutes** and is **battle-tested**.

[![Langfuse Overview Video](https://github.com/user-attachments/assets/3926b288-ff61-4b95-8aa1-45d041c70866)](https://langfuse.com/watch-demo)

## ✨ Core Features

![Langfuse Overview](https://langfuse.com/images/docs/github-readme/github-feature-overview.png)

- [LLM Application Observability](https://langfuse.com/docs/tracing): Instrument your app and start ingesting traces to Langfuse, thereby tracking LLM calls and other relevant logic in your app such as retrieval, embedding, or agent actions. Inspect and debug complex logs and user sessions. Try the interactive [demo](https://langfuse.com/docs/demo) to see this in action.

- [Prompt Management](https://langfuse.com/docs/prompts/get-started) helps you centrally manage, version control, and collaboratively iterate on your prompts. Thanks to strong caching on server and client side, you can iterate on prompts without adding latency to your application.

- [Evaluations](https://langfuse.com/docs/scores/overview) are key to the LLM application development workflow, and Langfuse adapts to your needs. It supports LLM-as-a-judge, user feedback collection, manual labeling, and custom evaluation pipelines via APIs/SDKs.

- [Datasets](https://langfuse.com/docs/datasets/overview) enable test sets and benchmarks for evaluating your LLM application. They support continuous improvement, pre-deployment testing, structured experiments, flexible evaluation, and seamless integration with frameworks like LangChain and LlamaIndex.

- [LLM Playground](https://langfuse.com/docs/playground) is a tool for testing and iterating on your prompts and model configurations, shortening the feedback loop and accelerating development. When you see a bad result in tracing, you can directly jump to the playground to iterate on it.

- [Comprehensive API](https://langfuse.com/docs/api): Langfuse is frequently used to power bespoke LLMOps workflows while using the building blocks provided by Langfuse via the API. OpenAPI spec, Postman collection, and typed SDKs for Python, JS/TS are available.

## 📦 Deploy Langfuse

![Langfuse Deployment Options](https://langfuse.com/images/docs/github-readme/github-deployment-options.png)

### Langfuse Cloud

Managed deployment by the Langfuse team, generous free-tier, no credit card required.

<div align="center">
    <a href="https://cloud.langfuse.com" target="_blank">
        <img alt="Static Badge" src="https://img.shields.io/badge/»%20Sign%20up%20for%20Langfuse%20Cloud-8A2BE2?&color=orange">
    </a>
</div>

### Self-Host Langfuse

Run Langfuse on your own infrastructure:

- [Local (docker compose)](https://langfuse.com/self-hosting/local): Run Langfuse on your own machine in 5 minutes using Docker Compose.

  ```bash
  # Get a copy of the latest Langfuse repository
  git clone https://github.com/langfuse/langfuse.git
  cd langfuse

  # Run the langfuse docker compose
  docker compose up
  ```
- [VM](https://langfuse.com/self-hosting/docker-compose): Run Langfuse on a single Virtual Machine using Docker Compose.
- [Kubernetes (Helm)](https://langfuse.com/self-hosting/kubernetes-helm): Run Langfuse on a Kubernetes cluster using Helm. This is the preferred production deployment.
- Terraform Templates: [AWS](https://langfuse.com/self-hosting/aws), [Azure](https://langfuse.com/self-hosting/azure), [GCP](https://langfuse.com/self-hosting/gcp)

See [self-hosting documentation](https://langfuse.com/self-hosting) to learn more about architecture and configuration options.

## 🔌 Integrations

![Langfuse Integrations](https://langfuse.com/images/docs/github-readme/github-integrations.png)

### Main Integrations:

| Integration                                                                  | Supports                   | Description                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [SDK](https://langfuse.com/docs/sdk)                                         | Python, JS/TS              | Manual instrumentation using the SDKs for full flexibility.                                                                                      |
| [OpenAI](https://langfuse.com/docs/integrations/openai)                      | Python, JS/TS              | Automated instrumentation using drop-in replacement of OpenAI SDK.                                                                               |
| [Langchain](https://langfuse.com/docs/integrations/langchain)                | Python, JS/TS              | Automated instrumentation by passing callback handler to Langchain application.                                                                  |
| [LlamaIndex](https://langfuse.com/docs/integrations/llama-index/get-started) | Python                     | Automated instrumentation via LlamaIndex callback system.                                                                                        |
| [Haystack](https://langfuse.com/docs/integrations/haystack)                  | Python                     | Automated instrumentation via Haystack content tracing system.                                                                                   |
| [LiteLLM](https://langfuse.com/docs/integrations/litellm)                    | Python, JS/TS (proxy only) | Use any LLM as a drop in replacement for GPT. Use Azure, OpenAI, Cohere, Anthropic, Ollama, VLLM, Sagemaker, HuggingFace, Replicate (100+ LLMs). |
| [Vercel AI SDK](https://langfuse.com/docs/integrations/vercel-ai-sdk)        | JS/TS                      | TypeScript toolkit designed to help developers build AI-powered applications with React, Next.js, Vue, Svelte, Node.js.                          |
| [API](https://langfuse.com/docs/api)                                         |                            | Directly call the public API. OpenAPI spec available.                                                                                            |

### Packages integrated with Langfuse:

| Name                                                                    | Type               | Description                                                                                                             |
| ----------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [Instructor](https://langfuse.com/docs/integrations/instructor)         | Library            | Library to get structured LLM outputs (JSON, Pydantic)                                                                  |
| [DSPy](https://langfuse.com/docs/integrations/dspy)                     | Library            | Framework that systematically optimizes language model prompts and weights                                              |
| [Mirascope](https://langfuse.com/docs/integrations/mirascope)           | Library            | Python toolkit for building LLM applications.                                                                           |
| [Ollama](https://langfuse.com/docs/integrations/ollama)                 | Model (local)      | Easily run open source LLMs on your own machine.                                                                        |
| [Amazon Bedrock](https://langfuse.com/docs/integrations/amazon-bedrock) | Model              | Run foundation and fine-tuned models on AWS.                                                                            |
| [AutoGen](https://langfuse.com/docs/integrations/autogen)               | Agent Framework    | Open source LLM platform for building distributed agents.                                                               |
| [Flowise](https://langfuse.com/docs/integrations/flowise)               | Chat/Agent&nbsp;UI | JS/TS no-code builder for customized LLM flows.                                                                         |
| [Langflow](https://langfuse.com/docs/integrations/langflow)             | Chat/Agent&nbsp;UI | Python-based UI for LangChain, designed with react-flow to provide an effortless way to experiment and prototype flows. |
| [Dify](https://langfuse.com/docs/integrations/dify)                     | Chat/Agent&nbsp;UI | Open source LLM app development platform with no-code builder.                                                          |
| [OpenWebUI](https://langfuse.com/docs/integrations/openwebui)           | Chat/Agent&nbsp;UI | Self-hosted LLM Chat web ui supporting various LLM runners including self-hosted and local models.                      |
| [Promptfoo](https://langfuse.com/docs/integrations/promptfoo)           | Tool               | Open source LLM testing platform.                                                                                       |
| [LobeChat](https://langfuse.com/docs/integrations/lobechat)             | Chat/Agent&nbsp;UI | Open source chatbot platform.                                                                                           |
| [Vapi](https://langfuse.com/docs/integrations/vapi)                     | Platform           | Open source voice AI platform.                                                                                          |
| [Inferable](https://langfuse.com/docs/integrations/other/inferable)     | Agents             | Open source LLM platform for building distributed agents.                                                               |
| [Gradio](https://langfuse.com/docs/integrations/other/gradio)           | Chat/Agent&nbsp;UI | Open source Python library to build web interfaces like Chat UI.                                                        |
| [Goose](https://langfuse.com/docs/integrations/goose)                   | Agents             | Open source LLM platform for building distributed agents.                                                               |
| [smolagents](https://langfuse.com/docs/integrations/smolagents)         | Agents             | Open source AI agents framework.                                                                                        |
| [CrewAI](https://langfuse.com/docs/integrations/crewai)                 | Agents             | Multi agent framework for agent collaboration and tool use.                                                             |

## 🚀 Quickstart

Instrument your app and start ingesting traces to Langfuse, thereby tracking LLM calls and other relevant logic in your app such as retrieval, embedding, or agent actions. Inspect and debug complex logs and user sessions.

### 1️⃣ Create new project

1.  [Create Langfuse account](https://cloud.langfuse.com/auth/sign-up) or [self-host](https://langfuse.com/self-hosting)
2.  Create a new project
3.  Create new API credentials in the project settings

### 2️⃣ Log your first LLM call

The [`@observe()` decorator](https://langfuse.com/docs/sdk/python/decorators) makes it easy to trace any Python LLM application. In this quickstart we also use the Langfuse [OpenAI integration](https://langfuse.com/docs/integrations/openai) to automatically capture all model parameters.

> [!TIP]
> Not using OpenAI? Visit [our documentation](https://langfuse.com/docs/get-started#log-your-first-llm-call-to-langfuse) to learn how to log other models and frameworks.

```bash
pip install langfuse openai
```

```bash filename=".env"
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_HOST="https://cloud.langfuse.com" # 🇪🇺 EU region
# LANGFUSE_HOST="https://us.cloud.langfuse.com" # 🇺🇸 US region
```

```python /@observe()/ /from langfuse.openai import openai/ filename="main.py"
from langfuse import observe
from langfuse.openai import openai # OpenAI integration

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

### 3️⃣ See traces in Langfuse

See your language model calls and other application logic in Langfuse.

![Example trace in Langfuse](https://langfuse.com/images/docs/github-readme/github-example-trace.png)

_[Public example trace in Langfuse](https://cloud.langfuse.com/project/cloramnkj0002jz088vzn1ja4/traces/2cec01e3-3dc2-472f-afcf-3b968cf0c1f4?timestamp=2025-02-10T14%3A27%3A30.275Z&observation=cb5ff844-07ef-41e6-b8e2-6c64344bc13b)_

> [!TIP]
>
> [Learn more](https://langfuse.com/docs/tracing) about tracing in Langfuse or play with the [interactive demo](https://langfuse.com/docs/demo).

## ⭐️ Star Us

![star-langfuse-on-github](https://github.com/user-attachments/assets/79a1d816-d229-4526-aecc-097d4a19f1ad)

## 💭 Support

Finding an answer to your question:

- Our [documentation](https://langfuse.com/docs) is the best place to start looking for answers. It is comprehensive, and we invest significant time into maintaining it. You can also suggest edits to the docs via GitHub.
- [Langfuse FAQs](https://langfuse.com/faq) where the most common questions are answered.
- Use "[Ask AI](https://langfuse.com/docs/ask-ai)" to get instant answers to your questions.

Support Channels:

- **Ask any question in our [public Q&A](https://github.com/orgs/langfuse/discussions/categories/support) on GitHub Discussions.** Please include as much detail as possible (e.g. code snippets, screenshots, background information) to help us understand your question.
- [Request a feature](https://github.com/orgs/langfuse/discussions/categories/ideas) on GitHub Discussions.
- [Report a Bug](https://github.com/langfuse/langfuse/issues) on GitHub Issues.
- For time-sensitive queries, ping us via the in-app chat widget.

## 🤝 Contributing

Your contributions are welcome!

- Vote on [Ideas](https://github.com/orgs/langfuse/discussions/categories/ideas) in GitHub Discussions.
- Raise and comment on [Issues](https://github.com/langfuse/langfuse/issues).
- Open a PR - see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to setup a development environment.

## 🥇 License

This repository is MIT licensed, except for the `ee` folders. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.

## ⭐️ Star History

<a href="https://star-history.com/#langfuse/langfuse&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" style="border-radius: 15px;" />
 </picture>
</a>

## ❤️ Open Source Projects Using Langfuse

Top open-source Python projects that use Langfuse, ranked by stars ([Source](https://github.com/langfuse/langfuse-docs/blob/main/components-mdx/dependents)):

| Repository                                                                                                                                                                                                                                                          | Stars |
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

## 🔒 Security & Privacy

We take data security and privacy seriously. Please refer to our [Security and Privacy](https://langfuse.com/security) page for more information.

### Telemetry

By default, Langfuse automatically reports basic usage statistics of self-hosted instances to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

None of the data is shared with third parties and does not include any sensitive information. We want to be super transparent about this and you can find the exact data we collect [here](/web/src/features/telemetry/index.ts).

You can opt-out by setting `TELEMETRY_ENABLED=false`.
