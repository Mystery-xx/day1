#!/usr/bin/env python3
"""
format-review-comment.py
Converts ReviewResult JSON to GitHub-flavored Markdown for PR comments.

Usage:
    python format-review-comment.py <input_json_path> [output_path]
"""

import json
import os
import sys


MAX_COMMENT_SIZE = 64000  # GitHub comment limit
MAX_FINDINGS_PER_CATEGORY = 10


def load_review_result(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def format_severity_badge(severity: str) -> str:
    badges = {
        "CRITICAL": "🔴 CRITICAL",
        "HIGH": "🟠 HIGH",
        "MEDIUM": "🟡 MEDIUM",
        "LOW": "🔵 LOW",
        "INFO": "⚪ INFO",
    }
    return badges.get(severity.upper(), severity)


def format_finding(finding: dict) -> str:
    file_path = finding.get("file", "unknown")
    line = finding.get("line", 0)
    severity = finding.get("severity", "INFO")
    description = finding.get("description", "")
    suggestion = finding.get("suggestion", "")

    out = []
    if line > 0:
        out.append(f"**File**: `{file_path}:{line}`")
    else:
        out.append(f"**File**: `{file_path}`")
    out.append(f"**Severity**: {format_severity_badge(severity)}")
    out.append("")
    out.append(f"**Issue**: {description}")
    if suggestion:
        out.append("")
        out.append(f"**Suggestion**: {suggestion}")
    return "\n".join(out)


def format_review(result: dict) -> str:
    findings = result.get("findings", [])
    severity_counts = result.get("severityCounts", {})
    review_time_ms = result.get("reviewTimeMs", 0)
    token_usage = result.get("tokenUsage", 0)
    partial_success = result.get("partialSuccess", False)
    failed_agents = result.get("failedAgents", [])

    # Categorize findings
    categories = {
        "bug_hunter": [],
        "architecture": [],
        "security": [],
        "style": [],
    }
    unknown = []

    for f in findings:
        cat = f.get("category", "").lower()
        if "bug" in cat:
            categories["bug_hunter"].append(f)
        elif "arch" in cat or "architecture" in cat:
            categories["architecture"].append(f)
        elif "sec" in cat or "security" in cat:
            categories["security"].append(f)
        elif "style" in cat:
            categories["style"].append(f)
        else:
            unknown.append(f)

    lines = []
    lines.append("## 🤖 AI Code Review")
    lines.append("")

    # Summary
    review_time_s = review_time_ms / 1000
    lines.append(f"**Review Time**: {review_time_s:.1f}s | **Tokens**: {token_usage}")
    if partial_success:
        lines.append(f"**⚠️ Partial**: {len(failed_agents)} agent(s) failed: {', '.join(failed_agents)}")
    lines.append("")

    # Severity summary
    lines.append("### Summary")
    all_findings = sum(len(v) for v in categories.values()) + len(unknown)
    if all_findings == 0:
        lines.append("✅ No issues found.")
        lines.append("")

    lines.append(f"- 🐛 **Bugs**: {len(categories['bug_hunter'])} issues")
    lines.append(f"- 🏛️ **Architecture**: {len(categories['architecture'])} concerns")
    lines.append(f"- 🔒 **Security**: {len(categories['security'])} issues")
    lines.append(f"- ✨ **Style**: {len(categories['style'])} suggestions")
    lines.append("")

    # Section: Bugs
    lines.append("---")
    lines.append("### 🐛 Potential Bugs")
    if categories["bug_hunter"]:
        lines.append("")
        for i, f in enumerate(categories["bug_hunter"][:MAX_FINDINGS_PER_CATEGORY], 1):
            lines.append(f"#### {i}. {f.get('description', 'Issue')[:80]}")
            lines.append(format_finding(f))
            lines.append("")
        if len(categories["bug_hunter"]) > MAX_FINDINGS_PER_CATEGORY:
            lines.append(f"_...and {len(categories['bug_hunter']) - MAX_FINDINGS_PER_CATEGORY} more bugs found._")
    else:
        if "bug_hunter" not in [a.lower() for a in failed_agents]:
            lines.append("\n✅ No bugs detected.\n")
        else:
            lines.append("\n❌ Analysis unavailable.\n")

    # Section: Architecture
    lines.append("---")
    lines.append("### 🏛️ Architectural Issues")
    if categories["architecture"]:
        lines.append("")
        for i, f in enumerate(categories["architecture"][:MAX_FINDINGS_PER_CATEGORY], 1):
            lines.append(f"#### {i}. {f.get('description', 'Issue')[:80]}")
            lines.append(format_finding(f))
            lines.append("")
        if len(categories["architecture"]) > MAX_FINDINGS_PER_CATEGORY:
            lines.append(f"_...and {len(categories['architecture']) - MAX_FINDINGS_PER_CATEGORY} more architecture concerns._")
    else:
        if "architecture" not in [a.lower() for a in failed_agents]:
            lines.append("\n✅ No architecture concerns.\n")
        else:
            lines.append("\n❌ Analysis unavailable.\n")

    # Section: Security
    lines.append("---")
    lines.append("### 🔒 Security Concerns")
    if categories["security"]:
        lines.append("")
        for i, f in enumerate(categories["security"][:MAX_FINDINGS_PER_CATEGORY], 1):
            lines.append(f"#### {i}. {f.get('description', 'Issue')[:80]}")
            lines.append(format_finding(f))
            lines.append("")
        if len(categories["security"]) > MAX_FINDINGS_PER_CATEGORY:
            lines.append(f"_...and {len(categories['security']) - MAX_FINDINGS_PER_CATEGORY} more security issues._")
    else:
        if "security" not in [a.lower() for a in failed_agents]:
            lines.append("\n✅ No security concerns.\n")
        else:
            lines.append("\n❌ Analysis unavailable.\n")

    # Section: Style
    lines.append("---")
    lines.append("### ✨ Style Recommendations")
    if categories["style"]:
        lines.append("")
        for i, f in enumerate(categories["style"][:MAX_FINDINGS_PER_CATEGORY], 1):
            lines.append(f"#### {i}. {f.get('description', 'Issue')[:80]}")
            lines.append(format_finding(f))
            lines.append("")
        if len(categories["style"]) > MAX_FINDINGS_PER_CATEGORY:
            lines.append(f"_...and {len(categories['style']) - MAX_FINDINGS_PER_CATEGORY} more style suggestions._")
    else:
        if "style" not in [a.lower() for a in failed_agents]:
            lines.append("\n✅ No style issues.\n")
        else:
            lines.append("\n❌ Analysis unavailable.\n")

    # Unknown category findings
    if unknown:
        lines.append("---")
        lines.append("### Additional Findings")
        for i, f in enumerate(unknown[:5], 1):
            lines.append(f"#### {i}. {f.get('description', 'Issue')[:80]}")
            lines.append(format_finding(f))
            lines.append("")

    # Metrics collapsible section
    lines.append("<details>")
    lines.append("<summary>📊 Review Metrics</summary>")
    lines.append("")
    lines.append(f"- Tokens used: {token_usage}")
    lines.append(f"- Review time: {review_time_s:.1f}s")
    agents_total = 4
    agents_ok = agents_total - len(failed_agents)
    lines.append(f"- Sub-agents: {agents_ok}/{agents_total} completed")
    if failed_agents:
        lines.append(f"- Failed agents: {', '.join(failed_agents)}")
    lines.append(f"- Total findings: {all_findings}")
    lines.append("")
    lines.append("</details>")
    lines.append("")
    lines.append("<!-- AI_CODE_REVIEW -->")

    result_text = "\n".join(lines)

    # Truncate if too long
    if len(result_text) > MAX_COMMENT_SIZE:
        result_text = result_text[: MAX_COMMENT_SIZE - 50] + "\n\n_...truncated due to comment size limit._\n\n<!-- AI_CODE_REVIEW -->"

    return result_text


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input_json> [output_path]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "comment.md"

    result = load_review_result(input_path)
    comment = format_review(result)

    with open(output_path, "w") as f:
        f.write(comment)

    print(f"Formatted comment written to {output_path} ({len(comment)} chars)", file=sys.stderr)

    # Also print the first few lines for verification
    print(f"Preview: {comment[:200]}...", file=sys.stderr)


if __name__ == "__main__":
    main()
