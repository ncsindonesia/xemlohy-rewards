-- =====================================================================
-- NCS Program Rewards - UPDATE an existing project to version 2
-- (login with phone number only, WhatsApp notifications, free-text shop)
--
-- Only for the project that already runs version 1. Order:
--   1. SQL Editor: run the NEW 01_schema.sql (safe: keeps all data)
--   2. SQL Editor: run this file once
-- A brand-new project does NOT need this file.
-- =====================================================================

-- Members registered with a PIN can now log in with their phone number only.
-- (The website uses the same rule: password = 'NCS-' + phone + '-rewards'.)
update auth.users
   set encrypted_password = extensions.crypt('NCS-' || split_part(email, '@', 1) || '-rewards', extensions.gen_salt('bf')),
       updated_at = now()
 where email like '%@member.neocare.id'
   and id not in (select user_id from public.staff);

-- Check: how many member accounts were updated, and the new settings
select count(*) as member_accounts_updated from auth.users where email like '%@member.neocare.id';
