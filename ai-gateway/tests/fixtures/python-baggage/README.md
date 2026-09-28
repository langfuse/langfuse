# Regenerate the Python baggage fixture

Uses an isolated, pinned Python environment. Run from the repository root:

```sh
pnpm --dir "ai-gateway/tests/fixtures/python-baggage" install --frozen-lockfile
pnpm --dir "ai-gateway/tests/fixtures/python-baggage" exec python "../python-baggage.py"
```

To update, edit `pyproject.toml`, install without `--frozen-lockfile`, and review
`pylock.toml` plus the regenerated JSON. Python support is experimental: pnpm's
npm age/trust checks don't cover PyPI, so check the five-day release age manually.
