# Contributing to Langfuse

First off, thanks for taking the time to contribute! ❤️

Langfuse is an open-source observability and analytics solution for LLM-based applications. We welcome contributions through GitHub pull requests. This document outlines our conventions regarding development workflow, commit message formatting, contact points, and other resources. Our goal is to simplify the process and ensure that your contributions are easily accepted.

We gratefully welcome improvements to documentation as well as to code.

The maintainers are available on [Discord](https://langfuse.com/discord) in case you have any questions.

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
>
> - Star the project;
> - Tweet about it;
> - Refer to this project in your project's readme;
> - Mention the project at local meetups and tell your friends/colleagues.

# How to contribute to Langfuse

## Making a change

_Before making any significant changes, please [open an issue](https://github.com/langfuse/langfuse/issues)._ Discussing your proposed changes ahead of time will make the contribution process smooth for everyone.

Once we've discussed your changes and you've got your code ready, make sure that tests are passing and open your pull request.

## Getting started

A good first step is to search for open [issues](https://github.com/langfuse/langfuse/issues). Issues are labeled, and some good issues to start with are labeled: [good first issue](https://github.com/langfuse/langfuse/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Development Setup

Requirements

- Node.js 20 as specified in the [.nvmrc](.nvmrc)
- Docker to run the database locally

**Steps**

1. Fork the the repository and clone it locally
2. Install dependencies

   ```bash
   npm install
   ```

3. Run the development database

   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. Create an env file

   ```bash
    cp .env.dev.example .env
   ```

5. Run the migrations

   ```bash
   npm run db:migrate

   # Optional: seed the database
   # npm run db:seed
   # npm run db:seed:examples
   ```

6. Start the development server

   ```bash
    npm run dev
   ```

## Commit messages

On the main branch, we adhere to the best practices of [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/). All pull requests and branches are squash-merged to maintain a clean and readable history. This approach ensures the addition of a conventional commit message when merging contributions.

## CI/CD

We use GitHub Actions for CI/CD, the configuration is in [`.github/workflows/pipeline.yml`](.github/workflows/pipeline.yml)

CI on `main` and `pull_request`

- Check Linting
- E2E test of API using Jest
- E2E tests of UI using Playwright

CD on `main`

- Publish Docker image to GitHub Packages if CI passes

## Staging environment

We have a staging environment at [https://staging.langfuse.com](https://staging.langfuse.com) that is used for preview deployments of pull requests.

Limitations of preview deployments:

- SSO is not available as dynamic domains are not supported by most SSO providers
- When making changes to the database, migrations to the staging database need to be applied manually by a maintainer. If you want to interactively test database changes in the staging environment, please reach out.

## License

Langfuse is MIT licensed, except for `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.
