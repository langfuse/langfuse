# Contributing to Langfuse

First off, thanks for taking the time to contribute! ❤️

Langfuse is an open-source observability and analytics solution for LLM-based applications. We welcome contributions through GitHub pull requests. This document outlines our conventions regarding development workflow, commit message formatting, contact points, and other resources. Our goal is to simplify the process and ensure that your contributions are easily accepted.

We gratefully welcome improvements to documentation as well as to code.
<!-- The community looks forward to your contributions. 🎉 -->

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
> - Star the project;
> - Tweet about it;
> - Refer to this project in your project's readme;
> - Mention the project at local meetups and tell your friends/colleagues.

The maintainers are available on [Discord](https://langfuse.com/discord) in case you have any questions.

# How to contribute to Langfuse

## Making a change

_Before making any significant changes, please [open an issue](https://github.com/langfuse/langfuse/issues)._ Discussing your proposed changes ahead of time will make the contribution process smooth for everyone.

Once we've discussed your changes and you've got your code ready, make sure that tests are passing and open your pull request.

## Getting started

A good first step is to search for open [issues](https://github.com/langfuse/langfuse/issues). Issues are labeled, and some good issues to start with are labeled: [good first issue](https://github.com/langfuse/langfuse/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Setup

First, the preferred version for development is Node.js >=18. Additionally, you should have npm and Docker installed

Then, to begin development fork repository and go to root folder by run `cd ./langfuse` .

```bash
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

## Commit messages

On the ﻿main branch, we adhere to the best practices of [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/). All pull requests and branches are squash-merged  to maintain a clean and readable history. This approach ensures the addition of a conventional commit message when merging contributions.

## License

Langfuse is MIT licensed, except for `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.








