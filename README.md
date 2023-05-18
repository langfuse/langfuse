# Brent

## About

```shell
.github
  └─ workflows
        └─ CI with pnpm cache setup
.vscode
  └─ Recommended extensions and settings for VSCode users
apps
  ├─ next.js
      ├─ Next.js 13
      ├─ React 18
      └─ E2E Typesafe API Server & Client
packages
 ├─ api
 |   └─ tRPC v10 router definition
 ├─ auth
     └─ authentication using next-auth. **NOTE: Only for Next.js app, not Expo**
 └─ db
     └─ typesafe db-calls using Prisma
```

## Quick Start

To get it running, follow the steps below:

### Setup env variables

```shell

# install vercel cli
brew install vercel-cli

# login to vercel
vercel login

# link vercel to your project
vercel link

# downalod the env file from vercel
vercel env pull
```

### Setup dependencies

```shell
# Install dependencies
pnpm i

# install supabase cli
brew install supabase/tap/supabase

# supabase login
supabase login

# supabase init
supabase init

# supabase login
supabase start

pnpm dev
```

## Development

GitHub notifies the application about events via webhooks. We use ngrok to expose our local development machine to the internet. These are the detailed steps that you need to take.

Cloudflared

1. Install cloudflared: `brew install cloudflared`
2. Login and authorize finto.app: `cloudflared tunnel login`
3. [Only for new tunnels] Create tunnel `cloudflared tunnel create brent-web-local`
4. Get tunnel credentials to access existing tunnel `cloudflared tunnel token  --cred-file ~/.cloudflared/9aeaee39-b445-4659-8f05-2e033d5a0bc9.json  brent-web-local`
5. Configure subdomain `cloudflared tunnel route dns brent-web-local brent-web-local`
6. Run `cloudflared tunnel --config ./.cloudflared/config.yml run brent-web-local`

Ngrok

1. Install negrok `brew install ngrok`
2. Run development `pnpm dev`
3. Run ngrok `ngrok http 3000`
4. Udate [GitHub development app](https://github.com/organizations/finto-technologies/settings/apps/brent-codegen-dev#:~:text=hook%20is%20triggered.-,Webhook%20URL,-Events%20will%20POST) to point to current ngrok public url + `/api/github/webhooks`
5. Update DOMAIN in .env to the current ngrok domain, e.g. 35da-2601-645-8700-6b90-b9ca-87d4-daff-8b84.ngrok.io
6. Experiment with [finto-technologies/demo-local](https://github.com/finto-technologies/demo-local)
7. View logs and replay webhooks by visiting: http://127.0.0.1:4040
8. View local database: http://localhost:54323

## Deployment

### database

#### Deploying the database

Production deployments are different from local deployments and migrations. Whenever you deploy to any database, you need to run the `db:deploy` command. This will run all migrations that have not been run yet.
To deploy to the database, you need to respective environment variables. Use `vercel env pull --environment production|preview|development` to download the env variables from vercel.

#### Rolling back when a migration failed

To roll back a migration, you can use the `db:rollback` command. This will mark the specified migration as rolled back. Afterwards, you need to run `db:deploy` again to run the failed and fixed migration again.

```shell
# Roll back a specific migration
# pnpm exec --filter will run the command in the specified workspace
# pnpm with-env will set the env variables from the .env file
# prisma migrate resolve --rolled-back will roll back the migration
pnpm --filter db exec pnpm with-env prisma migrate resolve --rolled-back "20230224153911_rename_to_experts"
```

#### Local migrations

Local migrations must be created on the local db on your machine. Ensure to load the local environment variables from vercel. Run `supabase start` to start the local database. In the terminal, you will get the connection string to connect to the postgres db. You can use `pnpm --filter db exec pnpm with-env prisma migrate reset` to reset your local db. This kills all data and applies all Prisma migrations to your local db. Commit these changes to the repo and deploy them to production via `pnpm db:deploy`. If you just want to add a migration, based on a healthy db, execute `pnpm --filter db exec pnpm with-env prisma migrate dev`.
