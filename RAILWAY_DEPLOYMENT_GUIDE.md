# Railway Deployment Guide

This guide provides instructions for deploying Moataz AI to Railway.

## Prerequisites
1. A Railway account.
2. The GitHub repository `Moatazalalqmi-26` connected to your Railway account.

## Deployment Steps

### 1. Create a New Project
- Log in to [Railway](https://railway.app/).
- Click **"New Project"** -> **"Deploy from GitHub repo"**.
- Select the `Moatazalalqmi-26` repository.

### 2. Configure Environment Variables
Add the following variables in the Railway dashboard:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase Connection String | `postgresql://postgres:[PWD]@db.[REF].supabase.co:5432/postgres` |
| `JWT_SECRET` | Secret for auth tokens | Generate a random 64-char string |
| `ENCRYPTION_MASTER_KEY` | Key for API key encryption | Generate a random 32-char string |
| `NEXT_PUBLIC_APP_URL` | The public URL of your app | `https://your-app.up.railway.app` |
| `OPENAI_API_KEY` | (Optional) OpenAI Key | `sk-...` |

### 3. Build and Start
Railway will automatically detect the `Dockerfile` and `railway.json`. The deployment process will:
1. Build the Next.js application using Bun.
2. Run Prisma migrations against your Supabase database.
3. Seed the admin user (`mtzallqmy@gmail.com`).
4. Start the production server.

### 4. Verification
Once deployed, check the **Deployments** tab. The health check should turn green, indicating the `/api/v1/health` endpoint is responding successfully.

## Troubleshooting
- **Database Connection**: Ensure your Supabase database allows connections from the Railway IP range (or allow all IPs for testing).
- **Logs**: Use the Railway **Logs** tab to view the structured JSON output for debugging startup issues.
