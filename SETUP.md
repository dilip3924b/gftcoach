# Setting Up Your GFT Coach Backend

## Step 1: Create Supabase Account (2 minutes)
1. Go to supabase.com
2. Click "Start your project" 
3. Sign up with GitHub or email
4. Click "New Project"
5. Name it: GFTCoach
6. Set a database password (save this somewhere!)
7. Choose region: Southeast Asia (Singapore) — closest to India
8. Click "Create new project"
9. Wait 2 minutes for it to set up

## Step 2: Create Your Database Tables (3 minutes)
1. In your Supabase dashboard, click "SQL Editor" on left sidebar
2. Click "New Query"
3. Copy and paste the full contents of `SQL_SCHEMA.sql`
4. Click "Run" (green button)
5. You should see "Success. No rows returned"

## Step 3: Get Your API Keys (1 minute)
1. Click "Settings" (gear icon) on left sidebar
2. Click "API"
3. Copy your "Project URL" — looks like: https://xxxx.supabase.co
4. Copy your "anon public" key — long string of letters/numbers

## Step 4: Add Keys to the App (1 minute)
1. Open the file: `lib/supabase.js`
2. Replace YOUR_SUPABASE_URL with your Project URL
3. Replace YOUR_SUPABASE_ANON_KEY with your anon key
4. Save the file

## Step 5: Install new packages (2 minutes)
Run these commands in your terminal inside the GFTCoach folder:

```bash
npx expo install @supabase/supabase-js
npx expo install @react-native-async-storage/async-storage
npx expo install react-native-url-polyfill
npx expo install expo-network
```

## Step 6: Test it!
Run: npx expo start
Scan QR code with Expo Go
Create an account in the app
Log a test trade
Check your Supabase dashboard → Table Editor → trades
You should see your trade there! ✅
