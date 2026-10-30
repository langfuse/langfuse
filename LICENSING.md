# Licensing

Langfuse is an open core project. Which license applies to a file depends on the directory it lives in.

## License scope

| Path                               | License                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `ee/**`                            | [Langfuse Enterprise License](ee/LICENSE)                                                 |
| `web/src/ee/**`                    | [Langfuse Enterprise License](ee/LICENSE)                                                 |
| `worker/src/ee/**`                 | [Langfuse Enterprise License](ee/LICENSE)                                                 |
| `packages/shared/src/server/ee/**` | [Langfuse Enterprise License](ee/LICENSE)                                                 |
| Everything else                    | [MIT License](LICENSE), unless a nearer license file or third party notice says otherwise |

The nearest license file controls. Each Enterprise directory contains its own `LICENSE` file, and [LICENSE.enterprise](LICENSE.enterprise) is the repository-level notice for all of them.

The source code in the Enterprise directories is publicly visible, but that does not place it under the MIT License.

## Third party components

All third party components incorporated into the Langfuse Software are licensed under the original license provided by the owner of the applicable component.

## Contributions

Before your first contribution is merged, you need to agree to the [Contributor License Agreement](https://cla-assistant.io/langfuse/langfuse). See [CONTRIBUTING.md](CONTRIBUTING.md#license).

See the [docs](https://langfuse.com/docs/open-source) for more on Langfuse's open source model.
