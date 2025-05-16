# 🚀 Langfuse Onboarding Setup

Welcome! This project helps you run a full Langfuse stack locally using Docker Compose. There are two roles:

- 🧑‍💻 **Users** (teammates): run Langfuse locally with minimal setup.
- 🔐 **Maintainer** (you): manage and update the fork from upstream.

---

## 🧑‍💻 For Users (Daily Workflow)

### ✅ Prerequisites
- Docker + Docker Compose v2 ([Install Docker](https://docs.docker.com/get-docker/))
- Git and Make installed

Check everything with:
```bash
make check-prereqs
```

### 📦 Setup & Run
```bash
git clone https://github.com/macayaven/langfuse-fork.git
cd langfuse-fork
make env         # Generate .env from template
make up          # Start the stack
make health      # Check that everything is healthy
```

### 🧹 Stop the stack
```bash
make down
```

---

## 🔐 For Maintainers (One-Time Setup)

Run this **only once** to initialize your fork:
```bash
make bootstrap
```

This will:
- Clone upstream Langfuse
- Set up remotes (origin = your fork, upstream = readonly)
- Generate `.env.local.example`
- Copy the override file
- Push everything to your personal repo

### 🔁 Keeping the fork updated
```bash
make check      # Check if you're behind upstream
make update     # Merge upstream/main into your fork
```

📁 Maintainer scripts live in: `customization/internal/`

---

## 🧠 Available Make Targets

### 🧑‍💻 User commands
```bash
make check-prereqs   # Ensure Docker, Git, Make, etc. are installed
make env             # Create .env from template
make up              # Start Langfuse stack
make down            # Stop the stack
make health          # Check containers and endpoints
```

### 🔐 Maintainer commands
```bash
make bootstrap       # One-time setup of your fork
make check           # Check for updates from upstream
make update          # Merge latest changes from upstream
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
