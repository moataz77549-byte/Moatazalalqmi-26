# Database Bootstrap Guide

Moataz AI handles its own database initialization to ensure a "zero-touch" deployment experience.

## Automatic Bootstrap Process
When the application starts, it executes the `start.sh` script (defined in the Dockerfile):

1. **Prisma Migrate Deploy**: Applies all pending migrations to the Supabase database.
2. **Prisma DB Seed**: Runs the seed script to initialize essential data.

## Seed Data
The seed script (`prisma/seed.ts`) performs the following:
- Checks if a user with the email `mtzallqmy@gmail.com` exists.
- If not, it creates the **Primary Admin** account with the password `moataz775`.
- Assigns the `ADMIN` role to this user.

## Verification
You can verify the bootstrap by checking the application logs during startup:
```text
[INFO] Database diagnostic: OK
[INFO] Admin user created successfully.
```

## Manual Seeding
If you need to run the seed manually in a development environment:
```bash
bun prisma db seed
```
