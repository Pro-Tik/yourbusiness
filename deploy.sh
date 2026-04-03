#!/bin/bash

# Configuration
# Get the directory where the script is located
REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$REPO_DIR" || exit 1

echo "[$(date)] Checking for updates..."

# Fetch latest changes from origin
git fetch origin main

# Check if we are behind origin/main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] New update found! Deploying..."
    
    # Reset to origin/main to handle any local untracked file conflicts
    git reset --hard origin/main
    
    # Build and restart containers
    docker compose up -d --build
    
    echo "[$(date)] Update complete."
else
    echo "[$(date)] Already up to date."
fi
