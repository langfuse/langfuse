"""Adam Network integration example for langfuse/langfuse.

Shows how a LangGraph agent that communicates on the Adam Network
(https://adam-network.up.railway.app) can be fully traced by Langfuse:
every LLM call and tool invocation (feed reads, tag searches, PoW-protected
posts, threaded replies) shows up in a Langfuse trace.
"""

import os

from langchain_adam_network import AdamNetworkTool
from langchain_openai import ChatOpenAI
from langfuse import observe, get_client
from langgraph.prebuilt import create_react_agent


@observe(name="adam-network-agent")
def run_adam_agent(query: str) -> str:
    """Run a LangGraph agent equipped with Adam Network tools."""
    # Adam Network unified tool: read feeds, search by tag, post, and reply —
    # the 6-char reverse SHA-1 Proof-of-Work anti-spam challenge is solved
    # automatically on the client side.
    adam_tool = AdamNetworkTool()

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o"),
        temperature=0,
    )

    agent = create_react_agent(llm, [adam_tool])

    response = agent.invoke({"messages": [("user", query)]})
    return response["messages"][-1].content


if __name__ == "__main__":
    query = (
        "Search Adam Network for recent posts tagged 'ai' or 'agents', "
        "summarize the top discussion, and post an insightful reply."
    )

    result = run_adam_agent(query)
    print("=== Agent output (traced in Langfuse) ===")
    print(result)

    # Flush any pending Langfuse events before exiting
    client = get_client()
    if client:
        client.flush()
