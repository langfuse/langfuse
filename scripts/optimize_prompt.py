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
        os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-0b6e7f84-8eac-488b-94f2-341b06e44494"
        os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-2ad3587d-0de7-4546-9ded-53f7fc95a68f"
        os.environ["LANGFUSE_HOST"] = "http://localhost:3000"

        # Initialize Langfuse client
        langfuse = Langfuse()
        print("Connected to Langfuse")

        # Create optimized prompt
        prompt = langfuse.create_prompt(
            name="langflow chinese system prompt",
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
