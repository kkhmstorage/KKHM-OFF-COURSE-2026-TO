# Supabase Setup & GitHub Pages Free Deployment Guide

## KKHM Islamic & Arts College — Off-Course Activity Management System

This guide explains how to connect the application to a free **Supabase PostgreSQL** database and publish it for free on **GitHub Pages**.

---

## Part 1: Set Up Supabase (Free Tier PostgreSQL + RLS)

1. Go to [https://supabase.com](https://supabase.com) and create a free project (recommended region: **Mumbai / South Asia** for `Asia/Kolkata` low latency).
2. In your Supabase Dashboard, open **SQL Editor** and run the three migration scripts in order:
   - `supabase/migrations/001_schema.sql` — Creates all 22 normalized PostgreSQL tables, foreign keys, unique constraints, and indexes.
   - `supabase/migrations/002_rls_and_rpcs.sql` — Enables Row Level Security (RLS) on all tables and installs secure backend functions (`authenticate_user`, `admin_update_credentials`, `submit_report_unit`, `review_period_entry`).
   - `supabase/migrations/003_seed_and_rls_tests.sql` — Seeds the temporary initial Administrator login (`kkhmoffcourse` / `1111`) and the `2026-27` academic year.
3. Go to **Project Settings -> API** and copy:
   - **Project URL** (`VITE_SUPABASE_URL`)
   - **anon public key** (`VITE_SUPABASE_ANON_KEY`)
   - *Never copy or expose the `service_role` key in frontend code.*

---

## Part 2: Host on GitHub & Publish Free via GitHub Pages

1. Create a new GitHub repository (for example, `kkhm-activity-manager`).
2. Push this project to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial release: KKHM Off-Course Activity Management System"
   git branch -M main
   git remote add origin https://github.com/<your-username>/kkhm-activity-manager.git
   git push -u origin main
   ```
3. Configure your Supabase secrets in GitHub:
   - Open your repository on GitHub -> **Settings** -> **Secrets and variables** -> **Actions**.
   - Add two repository secrets:
     - `VITE_SUPABASE_URL` = your Supabase Project URL
     - `VITE_SUPABASE_ANON_KEY` = your Supabase `anon` public key
4. Enable GitHub Pages (**IMPORTANT**):
   - Open **Settings** -> **Pages**.
   - Under **Build and deployment -> Source**, select **GitHub Actions** (do **NOT** choose *Deploy from a branch*, otherwise GitHub serves raw unbuilt `index.html` and shows a blank white page).
5. The included workflow (`.github/workflows/deploy-pages.yml`) automatically installs dependencies, builds `dist/`, adds `.nojekyll` and `404.html`, and publishes the app to:
   `https://<your-username>.github.io/<repo-name>/`
   - You can verify deployment status under the repository's **Actions** tab (green checkmark = live).

---

## Part 3: First Login & Admin Credential Control

1. Open your published URL.
2. Sign in on the unified login screen using the temporary initial Administrator account:
   - **Username**: `kkhmoffcourse`
   - **Password**: `1111`
3. On first login with the temporary password, a secure prompt opens automatically so you can immediately set your permanent Administrator username and password (you can also update them anytime in **Settings -> Security & Credentials**).
4. Add Mentors and Students individually or use **Students -> Bulk Add Students** (with a ready-to-download `.xlsx` Excel template). You can update or reset any user's username or password at any time from **Settings -> Security & Credentials** or from the respective user table.

---

## Part 4: Database Backups

In Supabase Dashboard -> **Database -> Backups**, enable daily automated backups or export SQL dumps periodically using `pg_dump`:
```bash
pg_dump "$SUPABASE_DB_CONNECTION_STRING" --schema=public --no-owner > kkhm_backup_$(date +%F).sql
```
