#!/usr/bin/env python3
"""Call backend code review API and save result."""
import json
import urllib.request
import sys

def main():
    try:
        # Read diff from file (handle binary/non-UTF8 with errors='replace')
        with open('/tmp/ai-review/diff.patch', 'rb') as f:
            diff_bytes = f.read()
        # Decode with replacement for invalid UTF-8 sequences
        diff = diff_bytes.decode('utf-8', errors='replace')
        
        # Read changed files and convert to FileChange objects
        with open('/tmp/ai-review/changed-files.json', 'r') as f:
            changed_files_list = json.load(f)
        # Convert to FileChange format: [{filename, additions, deletions, isBinary}]
        changed_files = [
            {"filename": name, "additions": 0, "deletions": 0, "isBinary": False} 
            for name in changed_files_list
        ]
        
        # Build request
        request = {
            "unifiedDiff": diff,
            "changedFiles": changed_files,
            "prNumber": 2,
            "repo": "Mystery-xx/day1",
            "commitSha": ""
        }
        
        # Send request
        req = urllib.request.Request(
            'http://localhost:8082/api/code-review/analyze',
            data=json.dumps(request).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req, timeout=300) as response:
            result = response.read().decode('utf-8')
        
        # Save result
        with open('/tmp/ai-review/review-result.json', 'w') as f:
            f.write(result)
        
        print("Review complete")
        return 0
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
