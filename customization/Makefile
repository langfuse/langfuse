SHELL := /bin/bash

.PHONY: help env up down health \
        bootstrap check update \
        admin-help check-prereqs \
				install-linters lint

.DEFAULT_GOAL := help

# -------------------------------------------------
# 🧑‍💻 Regular User Commands
# -------------------------------------------------

help:
	@echo "🧑‍💻 Common developer commands:"
	@echo "  make help      		- Show this help message"
	@echo "  make check-prereqs - Check if your system meets the prerequisites"
	@echo "  make env       		- Generate .env file with secure secrets"
	@echo "  make up       			- Start Docker Compose stack and show logs"
	@echo "  make down     			- Stop Docker Compose stack"
	@echo "  make health   			- Check Docker status and Langfuse health endpoints"
	@echo ""
	@echo "🔐 Admin-only commands: make admin-help"

env:
	bash customization/generate-env.sh

up:
	bash customization/up.sh

down:
	bash customization/down.sh

health:
	bash customization/healthcheck.sh

check-prereqs:
	bash customization/check-prereqs.sh

# -------------------------------------------------
# 🛠️ Maintainer/Admin-Only Commands
# -------------------------------------------------

admin-help:
	@echo "🔐 Admin-only commands:"
	@echo "  make bootstrap - Setup fork and push to personal GitHub repo"
	@echo "  make check     - Check if your fork is in sync with upstream"
	@echo "  make update    - Merge latest changes from upstream into your fork"

bootstrap:
	bash customization/internal/bootstrap.sh

check:
	bash customization/internal/check-upstream.sh

update:
	bash customization/internal/update-from-upstream.sh

install-linters:
	@echo "📦 Installing shellcheck and shfmt..."
	@if command -v apt-get &>/dev/null; then \
		sudo apt-get update && sudo apt-get install -y shellcheck; \
	fi
	@if ! command -v shfmt &>/dev/null; then \
		curl -sSLo shfmt https://github.com/mvdan/sh/releases/latest/download/shfmt_$(uname -s)_$(uname -m) && \
		chmod +x shfmt && \
		sudo mv shfmt /usr/local/bin/; \
	fi
	@echo "✅ Linters installed."

lint:
	@echo "🔍 Running linters on customization/..."
	@echo "🔹 shellcheck:"
	shellcheck customization/**/*.sh || true
	@echo "🔹 shfmt:"
	shfmt -i 2 -d customization/**/*.sh || true
	@echo "🔹 docker compose config:"
	docker compose config
	@echo "✅ Linting complete."