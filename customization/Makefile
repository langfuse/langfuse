SHELL := /bin/bash
MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

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
	@echo "  make bootstrap 			- Setup fork and push to personal GitHub repo"
	@echo "  make check     			- Check if your fork is in sync with upstream"
	@echo "  make update    			- Merge latest changes from upstream into your fork"
	@echo "  make install-linters - Install shellcheck and shfmt"
	@echo "  make lint      			- Run linters on customization/"

bootstrap:
	bash customization/internal/bootstrap.sh

check:
	bash customization/internal/check-upstream.sh

update:
	bash customization/internal/update-from-upstream.sh


install-linters:
	@echo "📦 Installing shellcheck and shfmt..."

	@if command -v apt-get &>/dev/null; then \
		echo "🔧 Installing shellcheck via apt..."; \
		sudo apt-get update && sudo apt-get install -y shellcheck; \
	else \
		echo "⚠️  Skipping shellcheck (apt not found)"; \
	fi

	@if ! command -v shfmt &>/dev/null; then \
		URL=https://github.com/mvdan/sh/releases/download/v3.11.0/shfmt_v3.11.0_linux_386; \
		echo "🔽 Downloading shfmt from $$URL..."; \
		curl -sSL -o /tmp/shfmt $$URL; \
		if file /tmp/shfmt | grep -q 'ELF'; then \
			chmod +x /tmp/shfmt && sudo mv /tmp/shfmt /usr/local/bin/shfmt && \
			echo "✅ shfmt installed successfully."; \
		else \
			echo "❌ shfmt download failed or was not a valid binary."; \
			rm -f /tmp/shfmt; \
		fi \
	else \
		echo "✅ shfmt is already installed."; \
	fi

	@echo "✅ Linters installed."




MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
CUSTOM_PATH := $(abspath $(MAKEFILE_DIR)/../customization)

lint:
	@echo "🔍 Running linters on $(CUSTOM_PATH)..."

	@echo "🔹 shellcheck:"
	find $(CUSTOM_PATH) -name "*.sh" -exec shellcheck {} + || echo "⚠️  shellcheck reported issues."

	@echo "🔹 shfmt:"
	find $(CUSTOM_PATH) -name "*.sh" -exec shfmt -i 2 -w {} + || echo "⚠️  shfmt reported formatting issues."

	@echo "🔹 docker compose config:"
	docker compose config || echo "⚠️  docker compose config failed"

	@echo "✅ Linting complete."
