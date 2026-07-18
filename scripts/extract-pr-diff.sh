#!/bin/bash
# extract-pr-diff.sh
# Extracts PR diff and changed files list using GitHub CLI.
# Called by GitHub Actions workflow.
#
# Usage: ./extract-pr-diff.sh <PR_NUMBER> <OUTPUT_DIR>
#
# Outputs:
#   <OUTPUT_DIR>/diff.patch        - Unified diff of the PR
#   <OUTPUT_DIR>/changed-files.json - JSON list of changed files

set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <PR_NUMBER> <OUTPUT_DIR>}"
OUTPUT_DIR="${2:-.}"

mkdir -p "$OUTPUT_DIR"

echo "=== Extracting PR #${PR_NUMBER} diff ==="

# Get unified diff
if ! gh pr diff "$PR_NUMBER" > "$OUTPUT_DIR/diff.patch" 2>/dev/null; then
    echo "ERROR: Failed to get diff for PR #${PR_NUMBER}"
    echo "{}" > "$OUTPUT_DIR/diff.patch"
    exit 1
fi

DIFF_SIZE=$(wc -c < "$OUTPUT_DIR/diff.patch")
echo "Diff size: ${DIFF_SIZE} bytes"

# Get changed files list as JSON
if ! gh pr view "$PR_NUMBER" --json files > "$OUTPUT_DIR/changed-files.json" 2>/dev/null; then
    echo "ERROR: Failed to get changed files for PR #${PR_NUMBER}"
    echo '{"files": []}' > "$OUTPUT_DIR/changed-files.json"
    exit 1
fi

echo "=== Extraction complete ==="
echo "Diff: $OUTPUT_DIR/diff.patch (${DIFF_SIZE} bytes)"
echo "Files: $OUTPUT_DIR/changed-files.json"
