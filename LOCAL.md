## How to run locally for development

1. Create `.env` file at the root
2. Copy content from `.env.dev.example` to the newly created file
3. Run `pnpm dx` - this will setup all infra on docker, run migrations etc, it will also run frontend

- **IMPORTANT**: It will wipe all data in the database!

4. Subsequent runs for frontend can be just `pnpm dev:web` because all the infra is already setup
5. If re-running migrations or something infra related, `pnpm dx` should reset all, run migrations, setup clean seed
