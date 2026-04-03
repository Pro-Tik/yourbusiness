---
description: How to manage the Dockerized WhatsApp Campaign Tool
---

# WhatsApp Campaign Management Workflow

This workflow provides the standard steps for Antigravity (or any agent) to manage the WhatsApp outreach campaign.

## 1. Local Development & Deployment

### Update Code & Deploy
// turbo
1. Fetch latest changes from Git:
   `git pull origin main`
2. Build and restart containers:
   `docker compose up -d --build`

### Check Status
// turbo
1. View running containers:
   `docker ps | grep yourbusiness`
2. View live logs:
   `docker compose logs --tail=50 -f`

## 2. Campaign Monitoring

### Check Database Progress
// turbo
1. See how many leads are pending/sent:
   `sqlite3 data.sqlite "SELECT status, count(*) FROM campaign_leads GROUP BY status;"`

### View Recent Sent Messages
// turbo
1. See the last 5 sent leads:
   `sqlite3 data.sqlite "SELECT phone, sent_at FROM campaign_leads WHERE status='sent' ORDER BY sent_at DESC LIMIT 5;"`

## 3. Remote Management (Procloud)

If you are NOT on the procloud server but want to "use" it:
1. Make code changes in this workspace.
2. Push to git: `git commit -am "Update" && git push origin main`.
3. The server's `deploy.sh` cron job will pick it up automatically within 1 minute.
