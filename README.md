<div align="center">
   <a href="https://langfuse.com">
      <h1>🪢 Langfuse</h1>
   </a>
   <h3>
      Open source observability & analytics for LLM-based applications
   </h3>
   <div>
      <strong>Observability:</strong> Explore and debug complex logs & traces in a visual UI
   </div>
   <div>
      <strong>Analytics:</strong> Measure & improve costs, latency and response quality
   </div>
   </br>
   <div>
      <a href="https://discord.gg/7NXusRtqYU">
         <strong>Join the Langfuse Discord »</strong>
      </a>
      </br>
      <a href="#roadmap">
         <strong>Roadmap</strong>
      </a> ·
      <a href="https://langfuse.com">
         <strong>langfuse.com</strong>
      </a> ·
      <a href="https://langfuse.com/docs">
         <strong>Docs</strong>
      </a> ·
      <a href="https://github.com/langfuse/langfuse/issues/new?labels=%F0%9F%90%9E%E2%9D%94+unconfirmed+bug&projects=&template=bug_report.yml&title=bug%3A+">
         <strong>Report Bug</strong>
      </a> ·
      <a href="https://github.com/langfuse/langfuse/issues/new?assignees=&labels=%E2%9C%A8+enhancement&projects=&template=feature_request.yml&title=feat%3A+">
         <strong>Feature Request</strong>
      </a>
   </div>
   </br>
   <div>
      <img src="https://img.shields.io/badge/License-MIT-red.svg?style=flat-square" alt="MIT License">
      <a href="https://discord.gg/7NXusRtqYU"><img src="https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4" alt="Discord"></a>
      <a href="https://github.com/langfuse/langfuse"><img src="https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse" alt="Github Repo Stars"></a>
      <a href="https://github.com/langfuse/langfuse/actions/workflows/pipeline.yml?query=branch:main"><img src="https://img.shields.io/github/actions/workflow/status/langfuse/langfuse/pipeline.yml?style=flat-square&label=All%20tests" alt="CI test status"></a>
      <a href="https://status.langfuse.com"><img src="https://api.checklyhq.com/v1/badges/checks/62f11f82-33c0-40c1-a704-7b57518da517?style=flat-square&theme=default&responseTime=true" alt="Checkly Status"></a>
      <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square" alt="Y Combinator W23"></a>
      <a href="https://github.com/langfuse/langfuse/pkgs/container/langfuse"><img alt="Docker Image" src="https://img.shields.io/badge/docker-langfuse-blue?logo=Docker&logoColor=white&style=flat-square"></a>
      <a href="https://www.npmjs.com/package/langfuse"><img src="https://img.shields.io/npm/v/langfuse?style=flat-square&label=npm+langfuse" alt="langfuse npm package"></a>
      <a href="https://pypi.python.org/pypi/langfuse"><img src="https://img.shields.io/pypi/v/langfuse.svg?style=flat-square&label=pypi+langfuse" alt="langfuse Python package on PyPi"></a>
   </div>
</div>
</br>
</div>
</br>

# What is Langfuse?

Langfuse is an open source observability & analytics solution for LLM-based applications.

**Demo (2 min)**

https://github.com/langfuse/langfuse/assets/2834609/6041347a-b517-4a11-8737-93ef8f8af49f

_Muted by default, enable sound for voice-over_

Explore demo project in Langfuse here (free account required): https://langfuse.com/demo

# Data ingestion

| Source                         | Description                                                                                                                                                   | Links                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Langchain Integration (Python) | Callback handler that instruments Langchain applications; port for JS/TS is in progress, add +1 to [issue](https://github.com/langfuse/langfuse-js/issues/11) | [docs](https://langfuse.com/docs/integrations/langchain), [repo](https://github.com/langfuse/langfuse-python)      |
| Python SDK                     | Async SDK to manually instrument Python applications                                                                                                          | [docs](https://langfuse.com/docs/integrations/sdk/python), [repo](https://github.com/langfuse/langfuse-python)     |
| JS/TS SDK (Node, Edge, Deno)   | Async SDK to manually instrument Typescript applications                                                                                                      | [docs](https://langfuse.com/docs/integrations/sdk/typescript), [repo](https://github.com/langfuse/langfuse-js)     |
| JS/TS SDK (Web)                | Report scores from the browser, e.g. user feedback                                                                                                            | [docs](https://langfuse.com/docs/integrations/sdk/typescript-web), [repo](https://github.com/langfuse/langfuse-js) |
| API                            | HTTP API ingest traces & scores                                                                                                                               | [api reference](https://langfuse.com/docs/integrations/api)                                                        |

# ℹ️ Analytics is in alpha

Langfuse analytics is currently in a closed alpha as the core team works with a group of users to build the most useful analytics platform for LLM apps.

Reach out if you are interested to join the alpha: alpha@langfuse.com

# Integrations

Monitor backend executions of LLM app to create nested traces

- Python SDK
- Typescript SDK (node, edge)
- API

Collect user feedback and attach it to backend traces

- Typescript/JS SDK
- API

More details: [langfuse.com/integrations](https://langfuse.com/integrations)

# Data exploration

Langfuse offers an admin UI to explore the ingested data.

- Nested view of LLM app executions
- Segment execution traces by user feedback

# Get started

Follow the [quickstart](https://langfuse.com/docs/get-started) with instructions to setup Langfuse locally, self-hosted or using Langfuse cloud

# Roadmap

- [x] Integrations: [langfuse.com/integrations](https://langfuse.com/integrations)
- [x] Data exploration
- [ ] Langfuse analytics (in alpha)
  - Analytics engine
  - Detailed reports on latency, cost, quality
  - Evals

# Run locally

Requirements:

- Docker: run postgres and [dockerized Langfuse](https://ghcr.io/langfuse/langfuse) to start langfuse quickly
- Node.js & NPM: apply db migration using ORM (Prisma)

**Start**

```bash
# Clone repository
git clone git@github.com:langfuse/langfuse.git
cd langfuse

# Run server and db
docker compose up -d

# Apply db migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres DIRECT_URL=postgresql://postgres:postgres@localhost:5432/postgres npx prisma migrate deploy
```

-> Visit http://localhost:3000

**Upgrade**

```bash
# Stop server and db
docker compose down

# Pull latest changes
git pull
docker-compose pull

# Run server and db
docker compose up -d

# Apply db migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres DIRECT_URL=postgresql://postgres:postgres@localhost:5432/postgres npx prisma migrate deploy
```

# Local development

```
# Install dependencies
npm install

# Run the db
docker-compose -f docker-compose.dev.yml up -d

# create an env file
cp .env.dev.example .env

# Migration
npm run db:migrate

# Optional: seed the database
# npm run db:seed
# npm run db:seed:examples

# Start the server
npm run dev
```

# Self hosted (Docker)

[→ Self-hosting instructions](https://langfuse.com/docs/deployment/self-host)

# Run Langfuse in CI

For integration testing of SDKs we run Langfuse in CI, see workflows in [Python SDK](https://github.com/langfuse/langfuse-python/blob/main/.github/workflows/ci.yml) and [JS/TS SDK](https://github.com/langfuse/langfuse-js/blob/main/.github/workflows/ci.yml) for reference.

# Contributing to Langfuse

Join the community [on Discord](https://discord.gg/7NXusRtqYU).

To contribute, send us a PR, raise a github issue, or email at contributing@langfuse.com

# License

Langfuse is MIT licensed, except for `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.
