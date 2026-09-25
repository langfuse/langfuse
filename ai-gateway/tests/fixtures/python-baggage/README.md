# Regenerate the Python baggage fixture

This standalone pnpm workspace pins Python and the SDK dependencies used by
`../python-baggage.py`. Root workspace installs do not enable Python support.

Run from the repository root:

```sh
pnpm --dir "ai-gateway/tests/fixtures/python-baggage" install --frozen-lockfile
pnpm --dir "ai-gateway/tests/fixtures/python-baggage" exec python "../python-baggage.py"
```

pnpm downloads Python 3.14.3 if needed and creates the ignored `.venv` link.
The generated `pylock.toml` contains exact wheel versions and SHA-256 hashes for
Linux x64/arm64 (glibc), macOS x64/arm64, and Windows x64. Regeneration was verified
on macOS arm64 to reproduce `../python-baggage.json` byte-for-byte.

To update the environment, edit `pyproject.toml`, run an unfrozen install in this
directory, and review the lockfile and regenerated fixture together. Python
support in pnpm is experimental. In pnpm 12.6, npm's `minimumReleaseAge` and
`trustPolicy` settings do not filter PyPI releases: review PyPI upload dates when
updating this lock. The 28 locked releases were checked on 2026-09-23 and were all
older than five days. Frozen installs preserve those versions and verify wheel
hashes; they do not establish npm-style publishing trust for Python packages.

Sources: [pnpm Python support](https://pnpm.io/python),
[PyPI candidate selection](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/python-resolver/src/candidates.rs).
