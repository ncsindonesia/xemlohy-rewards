# Xemlohy Smart Rewards – web app

Mobile web app for the Xemlohy loyalty program of PT Neo Crop Solutions (NCS), live at
`https://rewards.neocare.id`.

| Part | Address | Who uses it |
| --- | --- | --- |
| Member app | `https://rewards.neocare.id/` | Farmers (scan bottles) and retailers (scan cartons) |
| Bottle / carton links in the QR | `/b/<code>` and `/c/<code>` | Opened by the phone camera |
| Admin portal | `https://rewards.neocare.id/admin/` | NCS staff only |

The website is plain HTML/JavaScript hosted on **GitHub Pages**. Data, logins and all
security checks live in **Supabase** (a hosted PostgreSQL database).

---

## What is in this folder

| File / folder | What it is |
| --- | --- |
| `index.html`, `404.html` | The app page. `404.html` is an identical copy, so every QR link (`/b/...`, `/c/...`) opens the app on GitHub Pages. |
| `app.js`, `styles.css` | Member app (Bahasa Indonesia, mobile first). |
| `admin/` | Admin portal. |
| `config.js` | **The only file you edit**: Supabase address and public key. |
| `supabase/01_schema.sql` | Database tables, security rules and all server logic. |
| `supabase/02_seed.sql` | Starting settings, the 3 Xemlohy products and the 4 farmer rewards. |
| `supabase/03_storage.sql` | Private photo storage for counterfeit reports. |
| `vendor/` | Supabase client 2.45.4 and QR scanner 2.3.8 (bundled, no outside CDN needed). |
| `manifest.webmanifest`, `icons/` | Lets members add the app to their home screen. |
| `CNAME` | Tells GitHub Pages to serve `rewards.neocare.id`. Keep it. |

The QR code list (`Xemlohy_QR_Import_Codes_CB-2611-01.csv`) is **not** in this folder on
purpose. Never upload it to GitHub: the repository is public.

Until `config.js` is filled in, the app runs in **DEMO mode** (yellow banner): everything
works, but data stays on that one phone. Useful for showing the flow.

---

## Setup (about 1 hour, once)

### 1. Create the Supabase project
1. Sign up at <https://supabase.com> with an NCS email (not a personal one).
2. **New project** → name `xemlohy-rewards` → region **Southeast Asia (Singapore)** →
   choose a strong database password and store it safely.

### 2. Login settings
1. **Authentication → Sign In / Providers → Email**: keep Email enabled, **turn OFF
   "Confirm email"**, save. (Members log in with phone + 6-digit PIN; the app stores each
   account as `<phone>@member.neocare.id`. No email is ever sent.)
2. **Authentication → URL Configuration**: Site URL = `https://rewards.neocare.id`.

### 3. Create the database
**SQL Editor → New query**, paste and **Run** each file, in this order:
1. `supabase/01_schema.sql`
2. `supabase/02_seed.sql`
3. `supabase/03_storage.sql`

Each should end with "Success. No rows returned". `01_schema.sql` is safe to run again
later (it never deletes data).

### 4. Create the first admin
1. **Authentication → Users → Add user → Create new user**: your email + a strong
   password, tick **Auto Confirm User**.
2. SQL Editor, run (change the email and name):
   ```sql
   insert into public.staff (user_id, name, role)
   select id, 'Wahyu Winarto', 'admin' from auth.users where email = 'your.email@neocropsolutions.com';
   ```
   Roles: `admin` (everything), `field` (FA/sales: verify retailers, see members and
   reports; limit to an area with `area = 'Garut'`), `viewer` (read-only dashboards).

### 5. Connect the website to Supabase
**Project Settings → API**: copy the **Project URL** and the **anon public** key into
`config.js`:
```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```
The anon key is meant to be public. **Never** put the `service_role` key in any file.

### 6. Publish on GitHub Pages
In the existing repository that serves `rewards.neocare.id`: **Add file → Upload files**,
drag in everything from this folder (replacing the holding page's `index.html` and
`404.html`), **Commit**. Pages settings and DNS stay as they are. Wait 1–2 minutes.

### 7. Load the printed QR codes
1. Open `https://rewards.neocare.id/admin/` and log in.
2. **Kode QR → Import kode dari file CSV** → choose
   `Xemlohy_QR_Import_Codes_CB-2611-01.csv` → **Import** (52,084 codes, about 1 minute).
   Re-importing is safe: existing codes are skipped.
3. Codes start as **belum aktif**: a scan shows "produk asli, poin belum aktif".
   Click **Aktifkan** for a batch when those goods leave the NCS warehouse.

### 8. Test before the pilot
Scan the test sheet with 3–5 phones. Register a test farmer and a test retailer, claim
codes, redeem, approve in the admin portal. Then remove the test accounts (SQL Editor):
```sql
-- replace the phone numbers with your test numbers (format 62...)
delete from public.point_ledger where member_id in (select id from public.members where phone in ('6281234567890'));
delete from public.redemptions  where member_id in (select id from public.members where phone in ('6281234567890'));
update public.members set bought_from = null where bought_from in (select id from public.members where phone in ('6281234567890'));
update public.qr_codes set status = 'activated', redeemed_by = null, redeemed_at = null
 where redeemed_by in (select id from public.members where phone in ('6281234567890'));
delete from public.members where phone in ('6281234567890');
delete from auth.users where email in ('6281234567890@member.neocare.id');
```

---

## Daily work in the admin portal

| Menu | What to do |
| --- | --- |
| Dashboard | Farmers, scans, repeat rate, sell-in vs sell-out, points liability, counterfeit signals. |
| Penukaran | Pulsa: send through your pulsa provider, then **Selesai**. Goods: **Setujui → Kirim** (courier + receipt no.) **→ Selesai**. **Tolak** returns the points automatically. Target: within 3 working days. |
| Verifikasi retailer | Visit or call the shop, then **Verifikasi**. Cartons scanned earlier enter the 14-day hold from their scan date. |
| Poin ditahan | Scans above the daily/monthly limit. Approve if normal, reject if suspicious. |
| Anggota | Search members; adjust points (reason required), **reset a forgotten PIN**, freeze an account. |
| Kode QR | Import, activate/deactivate batches, look up one code (who claimed it, scan history), void a damaged/stolen code. |
| Hadiah | Add or change rewards, points, stock. Add the retailer catalogue here. |
| Laporan palsu & flag | Counterfeit reports with photo and map link; automatic fraud flags. |
| Pengaturan & ekspor | Limits, hold days, point value in Rupiah, WhatsApp number, open/close the program; CSV exports for Excel. |

Every admin action is written to the `audit_log` table.

---

## Business rules built in
- One code earns points once, ever; two phones scanning at the same second cannot both get points.
- Bottle codes are for farmers, carton codes for retailers; a phone number is one account.
- Points per bottle: 100 ml = 10, 250 ml = 25, 500 ml = 50. Retailers: 24 per carton (1 per bottle). Change in the `products` table.
- Farmer limit 20 bottles/day; retailer limit 50 cartons/month; above the limit points wait for admin review.
- Retailer points wait 14 days; unverified retailers' points wait until verification.
- More than 10 wrong codes from one network in an hour is blocked for an hour (anti-guessing).

## Not included yet (next phase)
- **WhatsApp notifications and WhatsApp OTP login**: needs a WhatsApp Business provider account.
- **Automatic pulsa sending**: needs a pulsa aggregator API; for now admin sends pulsa and marks it done.
- **Automatic point expiry** after 12 months: the expiry date is stored on every point; the job that removes expired points is not active yet.
- **Terms and Privacy Policy pages**: the registration link currently opens WhatsApp. Publish real pages (UU No. 27/2022 PDP) before the pilot.

## Costs and limits
Supabase **Free** plan: 500 MB database, 50,000 monthly active users, 1 GB file storage,
but **free projects are paused after 1 week of inactivity**. Move to **Pro (USD 25/month)**
before the pilot so the app never pauses and gets daily backups.
GitHub Pages is free.

## Security notes
- All tables are locked (row-level security). Members can only read their own data;
  everything else goes through database functions that check who is calling.
- PINs are stored hashed by Supabase. Staff log in with email + password: use a long,
  unique password for every staff account and remove staff who leave (delete their row in the `staff` table).
- The list of genuine codes never leaves the database; the public check only answers
  for the one code scanned.
