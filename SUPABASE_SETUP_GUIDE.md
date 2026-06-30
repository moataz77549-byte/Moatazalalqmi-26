# Supabase Setup Guide

Moataz AI uses Supabase as its primary PostgreSQL database.

## Database Configuration

### 1. Connection String
Use the **Transaction Connection String** for Railway.
- **Format**: `postgresql://postgres:[YOUR-PASSWORD]@db.bwcilwibzxnpclcbgpyk.supabase.co:5432/postgres`
- Ensure you replace `[YOUR-PASSWORD]` with your database password (`moataz775@#`).

### 2. Prisma Integration
The application is configured to use Prisma. During deployment, the following command is executed automatically:
```bash
bun prisma migrate deploy
```
This ensures your Supabase schema is always in sync with the application code.

### 3. PostgreSQL Compatibility
We have verified the following for Supabase:
- **Indexes**: All foreign keys and unique constraints are correctly indexed.
- **Extensions**: Ensure `pgcrypto` is enabled in your Supabase project (usually enabled by default).

## Security Recommendations
- **IP Whitelisting**: If possible, restrict database access to Railway's outbound IP addresses.
- **SSL**: The connection string should use `sslmode=require` in production if supported by your network configuration.

## Manual Schema Reset
If you need to wipe the database and start fresh:
1. Go to the Supabase SQL Editor.
2. Run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.
3. Re-deploy on Railway to trigger a fresh migration and seed.
