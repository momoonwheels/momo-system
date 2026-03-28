# Momo on the Wheels — Deployment Guide

## Step 1: Supabase Setup
1. Go to https://supabase.com and create a new project
2. In the SQL Editor, run the entire contents of `supabase/schema.sql`
3. Go to Settings → API and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Anthropic API Key
1. Go to https://console.anthropic.com
2. Create an API key → `ANTHROPIC_API_KEY`

## Step 3: Deploy to Vercel
1. Push this repo to GitHub
2. Go to https://vercel.com → New Project → Import your repo
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   ```
4. Click Deploy
5. Your app is live at `https://your-app.vercel.app`

## Step 4: Verify
1. Open the app → Dashboard should load
2. Go to Config → all settings should be pre-populated
3. Go to Planned Orders → select a location, enter some test orders
4. Go to Packaging → verify it calculates correctly
5. Go to Order List → verify ingredient totals
6. Try uploading a test receipt

## Local Development
```bash
npm install
cp .env.local.example .env.local
# Fill in your env vars
npm run dev
```

## Architecture Notes
- All calculations are in `src/lib/calculations.ts` — this is the single source of truth
- API routes are in `src/app/api/` — these are iPad-ready REST endpoints
- When building the iPad app, point it at the same Supabase project
- When adding authentication, enable Supabase Auth and update the RLS policies in schema.sql

## Adding a New Location (Salem launch)
1. In Supabase Table Editor → locations → insert new row:
   - name: "Salem Food Truck"
   - type: "food_truck"
   - active: true
2. That's it — it will appear in all dropdowns automatically

## Updating Configuration
All batch sizes, serving sizes, package sizes are in the Config page.
Change any value → all calculations update everywhere.
No code changes needed.