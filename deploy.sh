#!/bin/bash

# Configuration
# Get the directory where the script is located
REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$REPO_DIR" || exit 1

echo "[$(date)] Checking for updates..."

# --- NEW: Safety Backup ---
if [ -f "data.sqlite" ]; then
    BACKUP_DIR="backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/data_$(date +%Y%m%d_%H%M%S).sqlite.bak"
    cp data.sqlite "$BACKUP_FILE"
    echo "[$(date)] Created safety backup: $BACKUP_FILE"
    
    # Keep only the last 10 backups to save space
    ls -tp "$BACKUP_DIR"/data_*.sqlite.bak | grep -v '/$' | tail -n +11 | xargs -I {} rm -- {}
fi
# --------------------------

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
