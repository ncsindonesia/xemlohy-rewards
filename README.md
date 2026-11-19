# NCS Program Rewards – web app (version 2)

Mobile web app for the loyalty program of PT Neo Crop Solutions (NCS), live at
`https://rewards.neocare.id`.

**New in version 2:** members log in with their phone number only (no PIN) · the farmer
types the shop where they bought the product · WhatsApp message to the member for every
event (points, redemption, status changes) · program renamed **NCS Program Rewards**.

> **Already running version 1?** Go to [Update from version 1](#update-from-version-1) –
> you do not need to repeat the full setup.

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
| `supabase/04_update_v2.sql` | Only for a project that already runs version 1 (see below). |
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
   "Confirm email"**, save. (Members log in with their phone number only; the app stores
   each account as `<phone>@member.neocare.id`. No email is ever sent.)
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

### 8. WhatsApp messages (choose one)
Every event creates a WhatsApp message for the member: welcome, points earned (several
scans within about 1 minute are combined into one message with the new total and the link
`https://rewards.neocare.id/`), redemption received / approved / shipped / completed /
rejected, shop verified, held points approved or rejected, admin point adjustments,
account frozen / re-activated, counterfeit report received.

**Option A – Manual (free, works immediately).** The messages appear in the admin menu
**Pesan WA**. Click **Buka WhatsApp** (WhatsApp opens with the number and the text filled
in), press send, then click **Terkirim**. Good for the pilot.

**Option B – Automatic through Fonnte** (Indonesian WhatsApp gateway, paid monthly plan –
check prices at fonnte.com).
1. Register at <https://fonnte.com>, add a device and scan its QR code with the WhatsApp
   number that will send the messages. Use a **separate number**, not the main NeoCare
   number: gateways like Fonnte use normal WhatsApp, and WhatsApp may block a number that
   sends a lot of automatic messages.
2. In Fonnte, copy the device **token**.
3. Admin portal → **Pesan WA** → paste the token → **Simpan** → set **Cara kirim** to
   **Otomatis (Fonnte)** → type your own number → **Kirim pesan tes**. After about
   1 minute choose **Semua** in the filter: the test message should show **Terkirim**.
   **Gagal** shows Fonnte's reason (e.g. "token invalid").
4. The token is stored in a private table: the website can save it, but nobody can read it
   back.

Requirements (normally already true on Supabase): the **pg_net** extension (sends the
messages) and **pg_cron** (sends the last combined point message within a minute).
`01_schema.sql` switches both on. If pg_cron is not available, the combined point message
goes out with the next activity or when an admin opens **Pesan WA**. Check under
**Database → Extensions** if needed.

To stop all messages: **Pesan WA** → untick **Kirim pesan WhatsApp ke anggota**.

### 9. Test before the pilot
Scan the test sheet with 3–5 phones. Register a test farmer and a test retailer, claim
codes, redeem, approve in the admin portal. Then remove the test accounts (SQL Editor):
```sql
-- replace the phone numbers with your test numbers (format 62...)
delete from public.wa_outbox    where phone in ('6281234567890');
delete from public.point_ledger where member_id in (select id from public.members where phone in ('6281234567890'));
delete from public.redemptions  where member_id in (select id from public.members where phone in ('6281234567890'));
update public.members set bought_from = null where bought_from in (select id from public.members where phone in ('6281234567890'));
update public.qr_codes set status = 'activated', redeemed_by = null, redeemed_at = null
 where redeemed_by in (select id from public.members where phone in ('6281234567890'));
delete from public.members where phone in ('6281234567890');
delete from auth.users where email in ('6281234567890@member.neocare.id');
```

---

## Update from version 1
For the project that is already live (all members, points and codes are kept):
1. Supabase **SQL Editor → New query**: paste the **new** `supabase/01_schema.sql` → **Run**.
   It adds the new tables, columns and settings and replaces the functions.
2. New query: paste `supabase/04_update_v2.sql` → **Run** (once). Members who registered
   with a PIN can now log in with their phone number only. The result shows how many
   accounts were updated.
3. GitHub: upload the new website files (`index.html`, `404.html`, `app.js`, `styles.css`,
   `manifest.webmanifest`, `admin/` folder) and replace the old ones. **Do not replace
   `config.js`** – yours already has the Supabase keys.
4. Open the site on a phone and pull down to refresh (or clear the browser cache) so the
   new version loads. Then set up WhatsApp (step 8 above).

---

## Daily work in the admin portal

| Menu | What to do |
| --- | --- |
| Dashboard | Farmers, scans, repeat rate, sell-in vs sell-out, points liability, counterfeit signals. |
| Pesan WA | Messages to members. Manual mode: **Buka WhatsApp** → send → **Terkirim**. Automatic mode: only failed messages need attention (**Kirim ulang otomatis**). |
| Penukaran | Pulsa (always to the member's registered number): send through your pulsa provider, then **Selesai**. Goods: **Setujui → Kirim** (courier + receipt no.) **→ Selesai**. **Tolak** returns the points automatically. Target: within 3 working days. |
| Verifikasi retailer | Visit or call the shop, then **Verifikasi**. Cartons scanned earlier enter the 14-day hold from their scan date. |
| Poin ditahan | Scans above the daily/monthly limit. Approve if normal, reject if suspicious. |
| Anggota | Search members (shows the shop the farmer typed); WA button to chat; adjust points (reason required); freeze an account. |
| Kode QR | Import, activate/deactivate batches, look up one code (who claimed it, scan history), void a damaged/stolen code. |
| Hadiah | Add or change rewards, points, stock. Add the retailer catalogue here. |
| Laporan palsu & flag | Counterfeit reports with photo and map link; automatic fraud flags. |
| Pengaturan & ekspor | Limits, hold days, point value in Rupiah, WhatsApp number, program name, website address, open/close the program; CSV exports for Excel (including all WhatsApp messages). |

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
- **WhatsApp OTP login** (a code sent by WhatsApp at login): can be added on top of the Fonnte connection if phone-only login proves too weak.
- **Message when retailer points finish the 14-day hold**: not sent yet.
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
- **Phone-only login (version 2) is easier for farmers but weaker**: anyone who knows a
  member's phone number can open that account. Safeguards built in: pulsa can only go to the
  registered number; every redemption and status change is sent by WhatsApp to the
  registered number (the real owner sees it); goods redemptions wait for admin approval, so
  call the member when an address looks unusual; accounts can be frozen. If misuse appears,
  add WhatsApp OTP login (see "Not included yet").
- Staff log in with email + password: use a long, unique password for every staff account
  and remove staff who leave (delete their row in the `staff` table).
- The WhatsApp gateway token is write-only (table `secrets`, no access from the website).
- The list of genuine codes never leaves the database; the public check only answers
  for the one code scanned.
