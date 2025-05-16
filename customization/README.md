# 🚀 Langfuse Onboarding Setup (User Guide)

Welcome! This guide helps you run a full Langfuse stack locally with minimal setup.

---

## 🧑‍💻 For Users

### ✅ Prerequisites
- Docker + Docker Compose v2 ([Install Docker](https://docs.docker.com/get-docker/))
- Git and Make installed

Check your environment with:
```bash
make check-prereqs
```

---

### 📦 Setup & Run
```bash
git clone https://github.com/macayaven/langfuse-fork.git
cd langfuse-fork
make env         # Generate .env from template
make up          # Start the stack
make health      # Check that everything is healthy
```

---

### 🧹 Stop the stack
```bash
make down
```

---

## 🧠 Common Make Targets

```bash
make check-prereqs   # Ensure Docker, Git, Make, etc. are installed
make env             # Create .env from template
make up              # Start Langfuse stack
make down            # Stop the stack
make health          # Check containers and endpoints
```

---

## 📍 Access Langfuse UI

Once running, open:
👉 [http://localhost:3000](http://localhost:3000)

---

## 📋 Optional Add-ons

- `make lint`: Lint Docker Compose and shell scripts
- `make install-linters`: Install shellcheck, shfmt for local checks

Enjoy tracing! ✨

---

## 📄 License and Attribution

This project is a customization layer on top of [Langfuse](https://github.com/langfuse/langfuse), which is licensed under the [Apache 2.0 License](LICENSE).

All original code and configuration files belong to the Langfuse project. This repo adds onboarding utilities, override configuration, and scripting to simplify local setup and internal collaboration.

Please retain this notice and the original license when redistributing.
