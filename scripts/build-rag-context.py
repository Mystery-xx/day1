#!/usr/bin/env python3
"""
build-rag-context.py
Fetches RAG context from the backend API for code review.
Queries: "code style guide", "architecture patterns", "security best practices"

Usage:
    python build-rag-context.py <BACKEND_URL> <OUTPUT_DIR>

Outputs:
    <OUTPUT_DIR>/rag-context.md - Formatted RAG context with sections
"""

import json
import os
import sys
import urllib.request
import urllib.error

RAG_QUERIES = [
    "code style guide",
    "architecture patterns project structure",
    "security best practices",
]

BACKEND_TIMEOUT = 10  # seconds


def fetch_rag_context(backend_url: str, query: str, top_k: int = 3) -> dict:
    """Fetch RAG context from backend API."""
    url = f"{backend_url.rstrip('/')}/api/rag/search?query={urllib.parse.quote(query)}&topK={top_k}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=BACKEND_TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"WARNING: RAG API HTTP error {e.code} for query '{query}': {e.reason}", file=sys.stderr)
        return {"results": []}
    except urllib.error.URLError as e:
        print(f"WARNING: RAG API unreachable for query '{query}': {e.reason}", file=sys.stderr)
        return {"results": []}
    except Exception as e:
        print(f"WARNING: RAG API error for query '{query}': {e}", file=sys.stderr)
        return {"results": []}


def format_context(results: dict, query: str) -> str:
    """Format RAG results into a markdown section."""
    entries = results.get("results", [])
    if not entries:
        return ""
    
    section = f"\n## {query}\n\n"
    for entry in entries:
        content = entry.get("content", "")
        similarity = entry.get("similarity", 0)
        source = entry.get("metadata", {}).get("source", "unknown")
        section += f"> Source: `{source}` (similarity: {similarity:.2f})\n>\n"
        # Truncate very long content
        if len(content) > 500:
            content = content[:500] + "...\n[truncated]"
        section += f"> {content}\n>\n"
    section += "\n"
    return section


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <BACKEND_URL> [OUTPUT_DIR]", file=sys.stderr)
        sys.exit(1)
    
    backend_url = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    
    os.makedirs(output_dir, exist_ok=True)
    
    import urllib.parse
    
    sections = []
    success_count = 0
    
    for query in RAG_QUERIES:
        print(f"Fetching RAG context for: '{query}'...", file=sys.stderr)
        results = fetch_rag_context(backend_url, query)
        formatted = format_context(results, query)
        if formatted:
            sections.append(formatted)
            success_count += 1
    
    # Build final context markdown
    context = "# RAG Context for Code Review\n\n"
    context += "This context was fetched from the project knowledge base to guide code review.\n"
    context += f"Queries successful: {success_count}/{len(RAG_QUERIES)}\n"
    
    if sections:
        context += "---".join(sections)
    else:
        context += "\n*No RAG context available. Using generic review prompts.*\n"
    
    output_path = os.path.join(output_dir, "rag-context.md")
    with open(output_path, "w") as f:
        f.write(context)
    
    print(f"RAG context written to {output_path} ({len(context)} chars)", file=sys.stderr)


if __name__ == "__main__":
    main()
