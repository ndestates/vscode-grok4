#!/bin/bash

# Script to clean up obsolete remote branches
# This will delete merged branches from remote while keeping local copies

echo "🧹 Cleaning up obsolete remote branches..."
echo "These branches have been merged into master and will be deleted from remote:"
echo ""

# List of merged branches to delete (excluding master and HEAD)
MERGED_BRANCHES=(
    "develop"
    "develop-1.0.4"
    "develop-1.0.5"
    "develop-1.3.5"
    "develop-1.4.2"
    "feature/chat-participant"
    "feature/develop-1-1-0"
    "feature/develop-1.3.0"
    "feature/develop-1.4.9"
    "feature/develop-1.5.0"
    "feature/develop-1.5.2"
    "feature/develop-1.5.5"
    "feature/develop-1.5.6"
    "feature/develop-1.5.9"
    "feature/develop-1.6.0"
    "feature/develop-1.6.2"
    "feature/develop-1.6.4"
    "feature/develop-1.6.5"
    "feature/develop-1.6.6"
    "feature/develop-1.6.8"
    "feature/develop-1.7.0"
    "feature/develop-1.7.1-workspace-export"
    "feature/develop-1.7.2"
    "feature/develop-1.7.7"
    "feature/develop-1.7.8"
    "feature/develop-1.7.9"
    "feature/grok-refactor-1.5.7"
    "feature/modular-1.5.1"
    "feature/multiple-files"
    "release-v1.2.0"
    "release/release-1.6.7"
)

# Delete each branch
for branch in "${MERGED_BRANCHES[@]}"; do
    echo "Deleting remote branch: $branch"
    git push origin --delete "$branch"
done

echo ""
echo "✅ Cleanup complete!"
echo "📝 Note: Local copies of these branches are preserved."
echo "📝 Unmerged branches were kept on remote for safety."
