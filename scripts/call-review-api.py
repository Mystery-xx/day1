#!/usr/bin/env python3
"""Call backend code review API with chunked diff support and save merged result."""
import json
import urllib.request
import urllib.error
import sys

CHUNK_SIZE = 9000  # Chunk size in chars (below 10K limit to leave margin)


def chunk_diff(diff_text, chunk_size=CHUNK_SIZE):
    """Split diff text into chunks of at most chunk_size characters.

    Splits on the last newline before the chunk boundary to preserve
    diff line integrity. If no newline is found, splits at chunk_size.
    """
    chunks = []
    start = 0
    while start < len(diff_text):
        end = start + chunk_size
        if end >= len(diff_text):
            # Last chunk
            chunks.append(diff_text[start:])
            break
        # Try to find a newline before the boundary to keep lines intact
        newline_pos = diff_text.rfind('\n', start, end)
        if newline_pos > start:
            end = newline_pos + 1  # Include the newline
        chunks.append(diff_text[start:end])
        start = end
    return chunks


def send_chunk(base_request, diff_chunk, chunk_index, total_chunks):
    """Send a single chunk to the backend API and return (status_code, response_data)."""
    request = dict(base_request)
    request["unifiedDiff"] = diff_chunk
    request["chunkIndex"] = chunk_index
    request["totalChunks"] = total_chunks
    request["isLastChunk"] = (chunk_index == total_chunks - 1)

    req = urllib.request.Request(
        'http://localhost:8082/api/code-review/analyze',
        data=json.dumps(request).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            body = response.read().decode('utf-8')
            return response.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        return e.code, json.loads(body) if body else {"error": str(e)}


def main():
    try:
        # Read diff from file (handle binary/non-UTF8 with errors='replace')
        with open('/tmp/ai-review/diff.patch', 'rb') as f:
            diff_bytes = f.read()
        diff = diff_bytes.decode('utf-8', errors='replace')

        # Read changed files
        with open('/tmp/ai-review/changed-files.json', 'r') as f:
            changed_files_list = json.load(f)
        changed_files = [
            {"filename": name, "additions": 0, "deletions": 0, "isBinary": False}
            for name in changed_files_list
        ]

        # Base request (fields that don't change per chunk)
        base_request = {
            "unifiedDiff": "",
            "changedFiles": changed_files,
            "prNumber": 2,
            "repo": "Mystery-xx/day1",
            "commitSha": "",
            "chunkIndex": 0,
            "totalChunks": 1,
            "isLastChunk": True
        }

        # Split diff into chunks
        chunks = chunk_diff(diff)
        total_chunks = len(chunks)

        if total_chunks == 1:
            # Single chunk — simple request
            print(f"Diff size: {len(diff)} chars, sending as single request")
            status, data = send_chunk(base_request, chunks[0], 0, 1)
            if status != 200:
                print(f"Error: API returned status {status}: {data.get('error', str(data))}", file=sys.stderr)
                return 1
            result = data
        else:
            # Multiple chunks — send sequentially
            print(f"Diff size: {len(diff)} chars, splitting into {total_chunks} chunks of ~{CHUNK_SIZE} chars each")
            accumulated = []
            for i, chunk in enumerate(chunks):
                print(f"  Sending chunk {i + 1}/{total_chunks} ({len(chunk)} chars)...")
                status, data = send_chunk(base_request, chunk, i, total_chunks)
                if status == 200:
                    # Last chunk returned final merged result
                    accumulated.append(data)
                    result = data
                    print(f"  Chunk {i + 1}/{total_chunks} returned final result")
                elif status == 202:
                    # Intermediate chunk accepted
                    chunk_result = data.get("chunkResult")
                    if chunk_result:
                        accumulated.append(chunk_result)
                    print(f"  Chunk {i + 1}/{total_chunks} accepted (received {data.get('receivedChunks', 0)}/{total_chunks})")
                else:
                    print(f"Error: API returned status {status} for chunk {i + 1}: {data.get('error', str(data))}", file=sys.stderr)
                    return 1
            # Use the last response as the merged result
            result = data if status == 200 else accumulated[-1] if accumulated else None
            if result is None:
                print("Error: No results received from any chunk", file=sys.stderr)
                return 1

        # Save result
        with open('/tmp/ai-review/review-result.json', 'w') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        # Print summary
        findings = result.get("findings", [])
        severity_counts = result.get("severityCounts", {})
        print(f"\nReview complete: {len(findings)} findings")
        for severity, count in sorted(severity_counts.items()):
            print(f"  {severity}: {count}")
        print(f"Token usage: {result.get('tokenUsage', 0)}")
        print(f"Review time: {result.get('reviewTimeMs', 0)}ms")
        failed = result.get("failedAgents", [])
        if failed:
            print(f"Failed agents: {', '.join(failed)}")
        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
