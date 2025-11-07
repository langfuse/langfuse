#!/usr/bin/env python3
"""
Prompt Optimization Script

This script runs prompt optimization and pushes results back to Langfuse
using the Langfuse Python SDK.
"""

import os
import sys
from langfuse import Langfuse

def main():
    """Main optimization function"""
    try:
        print("Starting prompt optimization...")

        # Set Langfuse credentials
        os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-13f43b23-f5b0-4a0e-b8cc-7f982ad00dd2"
        os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-89ba7eb1-6a11-4c7f-9a9a-bbc60903bde2"
        os.environ["LANGFUSE_HOST"] = "http://localhost:3000"

        # Initialize Langfuse client
        langfuse = Langfuse()
        print("Connected to Langfuse")

        # Create optimized prompt
        prompt = langfuse.create_prompt(
            name="test-prompt",
            prompt="You are a helpful assistant. Always reply in chinese.",
            labels=["latest"],  # Labels help organize and retrieve prompts
            tags=["langflow", "system"],  # Tags for categorization
            type="text",  # "text" or "chat"
            config={"temperature": 0.7, "max_tokens": 150},  # Optional config
            commit_message="Initial customer greeting prompt"  # Version control message
        )

        print(f"Successfully created prompt: {prompt.name}")
        print(f"Prompt version: {prompt.version}")
        print("Optimization completed successfully!")

        # Flush to ensure all data is sent
        langfuse.flush()

        return 0

    except Exception as e:
        print(f"Error during optimization: {str(e)}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
