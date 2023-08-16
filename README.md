<div align="center">
   <a href="https://langfuse.com">
      <h1>🪢 Langfuse</h1>
   </a>
   <h3>
      Open-source analytics for LLM-based applications
   </h3>
   <span>
      Iterate faster on your application with a granular view on exact execution traces, quality, cost and latency
   </span>
   </br></br>
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
         <strong>Integration docs</strong>
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
      <a href="https://status.langfuse.com"><img src="https://api.checklyhq.com/v1/badges/checks/62f11f82-33c0-40c1-a704-7b57518da517?style=flat-square&theme=default&responseTime=true" alt="Checkly Status"></a>
      <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square" alt="Y Combinator W23"></a>
   </div>
</div>
</br>
</div>
</br>

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

## Update

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

# For testing of SDKs

The following runs the server and db in docker-compose, applies migrations and a seeder which initializes a project, user and creates default API keys.

```bash
docker compose up -d
npm i # necessary for seeder
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres DIRECT_URL=postgresql://postgres:postgres@localhost:5432/postgres npx --yes prisma migrate reset --force --skip-generate
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
npx prisma migrate dev

# Optional: seed the database
# npx prisma db seed
# npx prisma db seed:examples

# Start the server
npm run dev
```

# Contributing to Langfuse

Join the community [on Discord](https://discord.gg/7NXusRtqYU).

To contribute, send us a PR, raise a github issue, or email at contributing@langfuse.com

# License

Langfuse is MIT licensed, except for `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.
