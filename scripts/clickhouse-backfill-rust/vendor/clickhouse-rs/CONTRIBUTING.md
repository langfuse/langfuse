# Contribution guide

## How to contribute

Please create an issue for discussion before submitting a pull request. This helps to ensure that your contribution
aligns with the project's goals and standards, and allows maintainers to provide guidance on the implementation details.

When submitting a pull request, please ensure that it includes:

- A clear description of the changes made and the motivation behind them, as well as the link to the related issue.
- Unit and integration tests for the new functionality or bug fixes, if applicable.
- Documentation and examples updates, if the changes affect the public API or usage of the crate.
- If the pull request is a work in progress, please mark it as such and indicate what is still needed to complete it.

## Upgrading dependencies

For security reasons, pull requests from external contributors that upgrade dependencies will not be accepted, unless a
particular change is discussed in advance with the project maintainers.

## Development workflow

All commands assumed to be run from the root of the repository.

### Environment

- A fairly recent version of Rust, see `rust-version` in [Cargo.toml](./Cargo.toml).
- Docker compose or a running ClickHouse server, accessible at `http://localhost:8123` with the `default` user and no
  password.

### Start ClickHouse

```sh
docker compose up -d
```

### Running tests

To run all tests, you could use one of the following commands:

```sh
cargo test
cargo test --no-default-features
cargo test --all-features
```

See also: [CI test commands](.github/workflows/ci.yml)

### Documentation

If you add a public API, please document it, as at a certain point the crate documentation will be enforced by the
`missing_docs` lint rule. Additionally, consider adding runnable examples to the [examples directory](./examples)
and to the [examples overview](./examples/README.md).

Checking documentation can be done with:

```sh
cargo doc --all-features
```

### Lint

It is recommended to run Clippy before submitting a pull request. For example:

```sh
cargo clippy --all-targets --no-default-features
cargo clippy --all-targets --all-features
```

See also: [Clippy usage on CI](.github/workflows/ci.yml)

### Benchmarks

It is always a good idea to run benchmarks before submitting a pull request, especially if there are changes in the
(de)serialization logic or in the transport layer. Check for more details in
the [benchmarks overview](./benches/README.md)
