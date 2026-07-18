#!/usr/bin/env python3
"""
collect-metrics.py
Collects and stores AI code review metrics in append-only JSONL format.

Usage:
    python collect-metrics.py <review_result_json_path> <metrics_file_path>
"""

import json
import os
import sys
import datetime


def collect_metrics(review_result: dict) -> dict:
    """Extract metrics from a review result."""
    findings = review_result.get("findings", [])
    severity_counts = review_result.get("severityCounts", {})
    review_time_ms = review_result.get("reviewTimeMs", 0)
    token_usage = review_result.get("tokenUsage", 0)
    partial_success = review_result.get("partialSuccess", False)
    failed_agents = review_result.get("failedAgents", [])

    return {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "review_time_seconds": round(review_time_ms / 1000, 2),
        "token_count": token_usage,
        "findings_count": len(findings),
        "severity_counts": {
            "critical": severity_counts.get("CRITICAL", 0),
            "high": severity_counts.get("HIGH", 0),
            "medium": severity_counts.get("MEDIUM", 0),
            "low": severity_counts.get("LOW", 0),
            "info": severity_counts.get("INFO", 0),
        },
        "agents_completed": 4 - len(failed_agents),
        "agents_total": 4,
        "partial_success": partial_success,
        "failed_agents": failed_agents,
    }


def load_existing_metrics(path: str) -> list:
    """Load existing metrics from JSONL file."""
    if not os.path.exists(path):
        return []
    metrics = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    metrics.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return metrics


def calculate_summary(all_metrics: list) -> dict:
    """Calculate summary statistics from all metrics."""
    if not all_metrics:
        return {}

    recent = all_metrics[-5:]  # Last 5 reviews
    all_times = [m.get("review_time_seconds", 0) for m in recent]
    all_tokens = [m.get("token_count", 0) for m in recent]
    successful = sum(1 for m in recent if not m.get("partial_success", True))
    total = len(recent)

    return {
        "total_reviews": len(all_metrics),
        "recent_avg_time_seconds": round(sum(all_times) / len(all_times), 2) if all_times else 0,
        "recent_avg_tokens": round(sum(all_tokens) / len(all_tokens), 1) if all_tokens else 0,
        "recent_success_rate": f"{successful}/{total}",
        "recent_total_findings": sum(m.get("findings_count", 0) for m in recent),
    }


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <review_result_json> <metrics_file>", file=sys.stderr)
        print(f"  review_result_json: path to ReviewResult JSON file", file=sys.stderr)
        print(f"  metrics_file:       path to append-only JSONL metrics file", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    metrics_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"WARNING: Review result file not found: {input_path}", file=sys.stderr)
        sys.exit(0)

    with open(input_path) as f:
        review_result = json.load(f)

    entry = collect_metrics(review_result)

    # Append to JSONL
    os.makedirs(os.path.dirname(metrics_path) or ".", exist_ok=True)
    with open(metrics_path, "a") as f:
        f.write(json.dumps(entry) + "\n")

    # Load all and print summary
    all_metrics = load_existing_metrics(metrics_path)
    summary = calculate_summary(all_metrics)

    print(f"Metrics appended to {metrics_path}", file=sys.stderr)
    print(f"Total reviews tracked: {summary.get('total_reviews', 0)}", file=sys.stderr)
    print(f"Recent avg time: {summary.get('recent_avg_time_seconds', 'N/A')}s", file=sys.stderr)
    print(f"Recent avg tokens: {summary.get('recent_avg_tokens', 'N/A')}", file=sys.stderr)


if __name__ == "__main__":
    main()
