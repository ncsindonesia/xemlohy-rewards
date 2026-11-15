-- =====================================================================
-- Xemlohy Smart Rewards - database schema, security and server logic
-- PT Neo Crop Solutions
--
-- Run this whole file once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it drops and recreates the functions, never the data tables.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null,
  note  text
);

create table if not exists public.products (
  sku                        text primary key,
  name                       text not null,
  size_ml                    int  not null,
  farmer_points              int  not null check (farmer_points >= 0),
  retailer_points_per_carton int  not null check (retailer_points_per_carton >= 0),
  bottles_per_carton         int  not null default 24,
  active                     boolean not null default true
);

create table if not exists public.qr_codes (
  code             text primary key check (code ~ '^[2-9A-HJKMNP-Z]{11}$'),
  type             text not null check (type in ('bottle','carton')),
  sku              text not null references public.products(sku),
  code_batch       text not null,
  production_batch text,
  status           text not null default 'generated' check (status in ('generated','activated','redeemed','void')),
  redeemed_by      uuid,
  redeemed_at      timestamptz,
  activated_at     timestamptz,
  void_reason      text,
  imported_at      timestamptz not null default now()
);
create index if not exists qr_codes_batch_idx on public.qr_codes (code_batch, sku, type, status);
create index if not exists qr_codes_redeemed_by_idx on public.qr_codes (redeemed_by);

create table if not exists public.members (
  id            uuid primary key,              -- = auth.users.id
  type          text not null check (type in ('farmer','retailer')),
  phone         text not null unique check (phone ~ '^62[0-9]{8,13}$'),
  name          text not null,
  province      text,
  regency       text,
  district      text,
  crop          text,
  land_ha       numeric,
  shop_name     text,
  owner_name    text,
  address       text,
  distributor   text,
  lat           numeric,
  lng           numeric,
  bought_from   uuid references public.members(id),
  status        text not null default 'active' check (status in ('active','pending','blocked','rejected')),
  status_note   text,
  verified_by   uuid,
  verified_at   timestamptz,
  consent_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists members_type_status_idx on public.members (type, status);

create table if not exists public.point_ledger (
  id            bigint generated always as identity primary key,
  member_id     uuid not null references public.members(id),
  delta         int  not null,
  kind          text not null check (kind in ('scan','redeem','refund','adjust','expire')),
  ref           text,
  status        text not null default 'available' check (status in ('available','pending','review','rejected')),
  available_at  timestamptz,
  expires_at    timestamptz,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists ledger_member_idx on public.point_ledger (member_id, created_at desc);
create index if not exists ledger_status_idx on public.point_ledger (status);

create table if not exists public.scans (
  id          bigint generated always as identity primary key,
  code        text,
  member_id   uuid,
  action      text not null check (action in ('check','claim')),
  result      text not null,
  ip          text,
  user_agent  text,
  lat         numeric,
  lng         numeric,
  created_at  timestamptz not null default now()
);
create index if not exists scans_created_idx on public.scans (created_at desc);
create index if not exists scans_ip_idx on public.scans (ip, created_at desc);
create index if not exists scans_code_idx on public.scans (code);

create table if not exists public.rewards (
  id          bigint generated always as identity primary key,
  catalog     text not null check (catalog in ('farmer','retailer')),
  name        text not null,
  description text,
  points      int  not null check (points > 0),
  kind        text not null default 'goods' check (kind in ('pulsa','goods')),
  stock       int  check (stock is null or stock >= 0),   -- null = unlimited
  image_url   text,
  sort        int  not null default 0,
  active      boolean not null default true
);

create table if not exists public.redemptions (
  id            bigint generated always as identity primary key,
  member_id     uuid not null references public.members(id),
  reward_id     bigint not null references public.rewards(id),
  reward_name   text not null,
  points        int  not null,
  status        text not null default 'requested' check (status in ('requested','approved','shipped','completed','rejected')),
  pulsa_phone   text,
  delivery      text check (delivery in ('address','pickup','pulsa')),
  address       text,
  note          text,
  tracking      text,
  admin_note    text,
  handled_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists redemptions_status_idx on public.redemptions (status, created_at);

create table if not exists public.counterfeit_reports (
  id          bigint generated always as identity primary key,
  code_entered text,
  shop_name   text,
  location    text,
  notes       text,
  lat         numeric,
  lng         numeric,
  photo_path  text,
  member_id   uuid,
  ip          text,
  status      text not null default 'new' check (status in ('new','checked','confirmed_fake','not_fake')),
  created_at  timestamptz not null default now()
);

create table if not exists public.flags (
  id          bigint generated always as identity primary key,
  rule        text not null,
  member_id   uuid,
  code        text,
  details     text,
  status      text not null default 'open' check (status in ('open','cleared','confirmed')),
  reviewed_by uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.staff (
  user_id  uuid primary key,
  name     text not null,
  role     text not null check (role in ('admin','field','viewer')),
  area     text
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Everything is locked by default. Members read only their own rows;
-- all writes and all admin reads go through the functions below.
-- ---------------------------------------------------------------------
alter table public.settings            enable row level security;
alter table public.products            enable row level security;
alter table public.qr_codes            enable row level security;
alter table public.members             enable row level security;
alter table public.point_ledger        enable row level security;
alter table public.scans               enable row level security;
alter table public.rewards             enable row level security;
alter table public.redemptions         enable row level security;
alter table public.counterfeit_reports enable row level security;
alter table public.flags               enable row level security;
alter table public.staff               enable row level security;
alter table public.audit_log           enable row level security;

drop policy if exists "products readable" on public.products;
create policy "products readable" on public.products for select using (true);

drop policy if exists "active rewards readable" on public.rewards;
create policy "active rewards readable" on public.rewards for select using (active);

drop policy if exists "public settings readable" on public.settings;
create policy "public settings readable" on public.settings for select
  using (key in ('whatsapp_number','farmer_daily_cap','retailer_hold_days','points_expiry_months','program_open'));

drop policy if exists "own member row" on public.members;
create policy "own member row" on public.members for select using (id = auth.uid());

drop policy if exists "own ledger" on public.point_ledger;
create policy "own ledger" on public.point_ledger for select using (member_id = auth.uid());

drop policy if exists "own redemptions" on public.redemptions;
create policy "own redemptions" on public.redemptions for select using (member_id = auth.uid());

-- qr_codes, scans, reports, flags, staff, audit_log: no direct access at all.

-- ---------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------
create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default)
$$;

create or replace function public.norm_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

-- 10 random characters + 1 check character over '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
create or replace function public.code_is_valid(p text)
returns boolean language plpgsql immutable as $$
declare
  alpha constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  s int := 0; i int; pos int;
begin
  if p is null or length(p) <> 11 then return false; end if;
  for i in 1..11 loop
    if strpos(alpha, substr(p, i, 1)) = 0 then return false; end if;
  end loop;
  for i in 1..10 loop
    pos := strpos(alpha, substr(p, i, 1)) - 1;
    s := s + i * pos;
  end loop;
  return substr(alpha, (s % 31) + 1, 1) = substr(p, 11, 1);
end $$;

create or replace function public.client_ip()
returns text language sql stable as $$
  select nullif(trim(split_part(coalesce(
           nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for',
           nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip', ''), ',', 1)), '')
$$;

create or replace function public.client_ua()
returns text language sql stable as $$
  select left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 300)
$$;

create or replace function public.mask_phone(p text)
returns text language sql immutable as $$
  select case when p is null then null
              else '0' || substr(p, 3, 3) || '-xxxx-' || right(p, 4) end
$$;

create or replace function public.is_staff(p_roles text[] default array['admin','field','viewer'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = any(p_roles))
$$;

create or replace function public.require_staff(p_roles text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff(p_roles) then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
end $$;

create or replace function public.log_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (user_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details)
$$;

create or replace function public.member_balance(p_member uuid)
returns table (available int, pending int)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(delta) filter (where status = 'available' or (status = 'pending' and available_at <= now())), 0)::int,
    coalesce(sum(delta) filter (where status = 'review'   or (status = 'pending' and available_at >  now())), 0)::int
  from public.point_ledger where member_id = p_member
$$;

create or replace function public.product_json(p_sku text, p_type text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sku', sku, 'name', name, 'size_ml', size_ml, 'type', p_type,
    'points', case when p_type = 'carton' then retailer_points_per_carton else farmer_points end,
    'bottles_per_carton', bottles_per_carton)
  from public.products where sku = p_sku
$$;

-- ---------------------------------------------------------------------
-- PUBLIC: check a code (no login needed)
-- ---------------------------------------------------------------------
create or replace function public.check_code(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c text := public.norm_code(p_code);
  v_ip text := public.client_ip();
  q public.qr_codes;
  res text; extra jsonb := '{}'::jsonb;
begin
  if v_ip is not null and (select count(*) from public.scans s
       where s.ip = v_ip and s.result in ('not_found','typo')
         and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('result', 'blocked');
  end if;

  if not public.code_is_valid(c) then
    insert into public.scans (code, action, result, ip, user_agent) values (left(c, 20), 'check', 'typo', v_ip, public.client_ua());
    return jsonb_build_object('result', 'typo', 'code', left(c, 20));
  end if;

  select * into q from public.qr_codes where code = c;
  if not found then
    res := 'not_found';
  elsif q.status = 'void' then
    res := 'void';
  elsif q.status = 'generated' then
    res := 'inactive';
  elsif q.status = 'redeemed' then
    res := 'used';
    extra := jsonb_build_object('used_at', q.redeemed_at,
               'used_by', (select public.mask_phone(phone) from public.members where id = q.redeemed_by),
               'mine', q.redeemed_by = auth.uid());
  else
    res := 'available';
  end if;

  insert into public.scans (code, member_id, action, result, ip, user_agent)
  values (c, auth.uid(), 'check', res, v_ip, public.client_ua());

  return jsonb_build_object('result', res, 'code', c)
         || coalesce(jsonb_build_object('product', public.product_json(q.sku, q.type)), '{}'::jsonb)
         || extra;
end $$;

-- ---------------------------------------------------------------------
-- MEMBER: registration, profile, summary, history
-- ---------------------------------------------------------------------
create or replace function public.register_member(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  auth_phone text;
  t text := p ->> 'type';
  ph text := regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9]', '', 'g');
begin
  if uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if exists (select 1 from public.members where id = uid) then
    return jsonb_build_object('result', 'exists');
  end if;
  select split_part(email, '@', 1) into auth_phone from auth.users where id = uid;
  if auth_phone is distinct from ph then raise exception 'Nomor HP tidak cocok dengan akun'; end if;
  if t not in ('farmer','retailer') then raise exception 'Jenis anggota tidak valid'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Nama wajib diisi'; end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'Persetujuan wajib dicentang'; end if;

  insert into public.members (id, type, phone, name, province, regency, district, crop, land_ha,
                              shop_name, owner_name, address, distributor, lat, lng, bought_from, status)
  values (uid, t, ph, trim(p ->> 'name'), nullif(trim(p ->> 'province'), ''), nullif(trim(p ->> 'regency'), ''),
          nullif(trim(p ->> 'district'), ''), nullif(trim(p ->> 'crop'), ''),
          nullif(p ->> 'land_ha', '')::numeric,
          nullif(trim(p ->> 'shop_name'), ''), nullif(trim(p ->> 'owner_name'), ''), nullif(trim(p ->> 'address'), ''),
          nullif(trim(p ->> 'distributor'), ''),
          nullif(p ->> 'lat', '')::numeric, nullif(p ->> 'lng', '')::numeric,
          (select id from public.members where id = nullif(p ->> 'bought_from', '')::uuid and type = 'retailer' and status = 'active'),
          case when t = 'retailer' then 'pending' else 'active' end);
  return jsonb_build_object('result', 'ok', 'status', case when t = 'retailer' then 'pending' else 'active' end);
end $$;

create or replace function public.list_retailers(p_regency text default null)
returns table (id uuid, shop_name text, regency text, province text)
language sql stable security definer set search_path = public as $$
  select id, shop_name, regency, province from public.members
  where type = 'retailer' and status = 'active'
    and (p_regency is null or p_regency = '' or regency ilike '%' || p_regency || '%')
  order by shop_name limit 200
$$;

create or replace function public.my_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); m public.members; b record; nxt jsonb; scans_n int;
begin
  if uid is null then return jsonb_build_object('result','login_required'); end if;
  select * into m from public.members where id = uid;
  if not found then return jsonb_build_object('result','no_profile'); end if;
  select * into b from public.member_balance(uid);
  select count(*) into scans_n from public.point_ledger where member_id = uid and kind = 'scan' and status <> 'rejected';
  select jsonb_build_object('name', name, 'points', points, 'missing', points - b.available) into nxt
    from public.rewards where active and catalog = m.type and points > b.available order by points limit 1;
  return jsonb_build_object(
    'result','ok',
    'member', jsonb_build_object('type', m.type, 'name', m.name, 'phone', m.phone, 'status', m.status,
               'province', m.province, 'regency', m.regency, 'crop', m.crop, 'shop_name', m.shop_name,
               'created_at', m.created_at),
    'available', b.available, 'pending', b.pending, 'scans', scans_n,
    'affordable', (select count(*) from public.rewards where active and catalog = m.type and points <= b.available
                     and (stock is null or stock > 0)),
    'next_reward', nxt,
    'recent', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select l.created_at, l.delta, l.kind, l.status, l.available_at, l.ref, l.note,
               (select p.name || ' ' || p.size_ml || ' ml' from public.qr_codes q join public.products p on p.sku = q.sku where q.code = l.ref) as product
        from public.point_ledger l where l.member_id = uid order by l.created_at desc limit 5) x), '[]'::jsonb));
end $$;

create or replace function public.my_history()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('result','login_required'); end if;
  return jsonb_build_object(
    'ledger', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select l.id, l.created_at, l.delta, l.kind, l.status, l.available_at, l.ref, l.note,
               (select p.name || ' ' || p.size_ml || ' ml' from public.qr_codes q join public.products p on p.sku = q.sku where q.code = l.ref) as product
        from public.point_ledger l where l.member_id = uid order by l.created_at desc limit 300) x), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, created_at, reward_name, points, status, tracking, admin_note, delivery
        from public.redemptions where member_id = uid order by created_at desc limit 100) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- MEMBER: claim a code (the core transaction)
-- ---------------------------------------------------------------------
create or replace function public.claim_code(p_code text, p_lat numeric default null, p_lng numeric default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := public.norm_code(p_code);
  v_ip text := public.client_ip();
  m public.members; q public.qr_codes; prod jsonb;
  pts int; st text := 'available'; avail_at timestamptz := null; v_note text := null;
  today_n int; month_n int; b record; res text;
  tz constant text := 'Asia/Jakarta';
begin
  if uid is null then return jsonb_build_object('result','login_required'); end if;
  select * into m from public.members where id = uid;
  if not found then return jsonb_build_object('result','no_profile'); end if;
  if m.status in ('blocked','rejected') then return jsonb_build_object('result','member_blocked'); end if;
  if coalesce((select value from public.settings where key = 'program_open'), 'true'::jsonb) = 'false'::jsonb then
    return jsonb_build_object('result','program_closed');
  end if;

  if not public.code_is_valid(c) then
    insert into public.scans (code, member_id, action, result, ip, user_agent, lat, lng)
    values (left(c, 20), uid, 'claim', 'typo', v_ip, public.client_ua(), p_lat, p_lng);
    return jsonb_build_object('result','typo');
  end if;

  select * into q from public.qr_codes where code = c for update;
  if not found then
    res := 'not_found';
  elsif q.status = 'void' then
    res := 'void';
  elsif q.status = 'generated' then
    res := 'inactive';
  elsif q.status = 'redeemed' then
    res := case when q.redeemed_by = uid then 'already_yours' else 'used' end;
    if res = 'used' then
      insert into public.flags (rule, member_id, code, details)
      values ('code_already_used', uid, c, 'Kode sudah diklaim anggota lain pada ' || to_char(q.redeemed_at at time zone tz, 'DD Mon YYYY HH24:MI'));
    end if;
  elsif (q.type = 'bottle' and m.type <> 'farmer') or (q.type = 'carton' and m.type <> 'retailer') then
    res := 'wrong_type';
  end if;

  if res is not null then
    insert into public.scans (code, member_id, action, result, ip, user_agent, lat, lng)
    values (c, uid, 'claim', res, v_ip, public.client_ua(), p_lat, p_lng);
    return jsonb_build_object('result', res, 'code', c, 'code_type', q.type)
           || case when q.code is not null then jsonb_build_object('product', public.product_json(q.sku, q.type)) else '{}'::jsonb end
           || case when res = 'used' then jsonb_build_object('used_at', q.redeemed_at) else '{}'::jsonb end;
  end if;

  prod := public.product_json(q.sku, q.type);
  pts := (prod ->> 'points')::int;

  if m.type = 'farmer' then
    select count(*) into today_n from public.point_ledger
      where member_id = uid and kind = 'scan'
        and (created_at at time zone tz)::date = (now() at time zone tz)::date;
    if today_n >= public.setting_num('farmer_daily_cap', 20) then
      st := 'review'; v_note := 'Melebihi batas harian, menunggu pemeriksaan';
      insert into public.flags (rule, member_id, code, details)
      values ('farmer_daily_cap', uid, c, 'Scan ke-' || (today_n + 1) || ' hari ini');
    end if;
  else
    select count(*) into month_n from public.point_ledger
      where member_id = uid and kind = 'scan'
        and date_trunc('month', created_at at time zone tz) = date_trunc('month', now() at time zone tz);
    if m.status = 'pending' then
      st := 'review'; v_note := 'Menunggu verifikasi toko';
    elsif month_n >= public.setting_num('retailer_monthly_cap', 50) then
      st := 'review'; v_note := 'Melebihi batas bulanan, menunggu pemeriksaan';
      insert into public.flags (rule, member_id, code, details)
      values ('retailer_monthly_cap', uid, c, 'Karton ke-' || (month_n + 1) || ' bulan ini');
    else
      st := 'pending';
      avail_at := now() + make_interval(days => public.setting_num('retailer_hold_days', 14)::int);
    end if;
  end if;

  update public.qr_codes set status = 'redeemed', redeemed_by = uid, redeemed_at = now() where code = c;

  insert into public.point_ledger (member_id, delta, kind, ref, status, available_at, expires_at, note)
  values (uid, pts, 'scan', c, st, avail_at,
          now() + make_interval(months => public.setting_num('points_expiry_months', 12)::int), v_note);

  insert into public.scans (code, member_id, action, result, ip, user_agent, lat, lng)
  values (c, uid, 'claim', 'credited', v_ip, public.client_ua(), p_lat, p_lng);

  select * into b from public.member_balance(uid);
  return jsonb_build_object('result','credited', 'code', c, 'product', prod, 'points', pts,
                            'point_status', st, 'available_at', avail_at, 'note', v_note,
                            'available', b.available, 'pending', b.pending);
end $$;

-- ---------------------------------------------------------------------
-- MEMBER: redeem a reward
-- ---------------------------------------------------------------------
create or replace function public.request_redemption(p_reward bigint, p_delivery text default null,
                                                     p_pulsa_phone text default null, p_address text default null,
                                                     p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); m public.members; r public.rewards; b record; rid bigint;
begin
  if uid is null then return jsonb_build_object('result','login_required'); end if;
  select * into m from public.members where id = uid for update;   -- serialises redemptions per member
  if not found then return jsonb_build_object('result','no_profile'); end if;
  if m.status <> 'active' then return jsonb_build_object('result','member_not_active'); end if;

  select * into r from public.rewards where id = p_reward and active for update;
  if not found or r.catalog <> m.type then return jsonb_build_object('result','reward_not_found'); end if;
  if r.stock is not null and r.stock <= 0 then return jsonb_build_object('result','out_of_stock'); end if;

  select * into b from public.member_balance(uid);
  if b.available < r.points then
    return jsonb_build_object('result','insufficient', 'available', b.available, 'needed', r.points);
  end if;

  if r.kind = 'pulsa' then
    p_delivery := 'pulsa';
    p_pulsa_phone := coalesce(nullif(regexp_replace(coalesce(p_pulsa_phone,''), '[^0-9]', '', 'g'), ''), m.phone);
  elsif coalesce(p_delivery, '') not in ('address','pickup') or coalesce(trim(p_address), '') = '' then
    return jsonb_build_object('result','address_required');
  end if;

  insert into public.redemptions (member_id, reward_id, reward_name, points, delivery, pulsa_phone, address, note)
  values (uid, r.id, r.name, r.points, p_delivery, p_pulsa_phone, nullif(trim(p_address), ''), nullif(trim(p_note), ''))
  returning id into rid;

  insert into public.point_ledger (member_id, delta, kind, ref, status, note)
  values (uid, -r.points, 'redeem', 'R' || rid, 'available', 'Tukar ' || r.name);

  if r.stock is not null then update public.rewards set stock = stock - 1 where id = r.id; end if;

  select * into b from public.member_balance(uid);
  return jsonb_build_object('result','ok', 'redemption_id', rid, 'available', b.available);
end $$;

-- ---------------------------------------------------------------------
-- PUBLIC: counterfeit report (login optional)
-- ---------------------------------------------------------------------
create or replace function public.submit_report(p_code text, p_shop text, p_location text, p_notes text,
                                                p_lat numeric default null, p_lng numeric default null,
                                                p_photo_path text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_ip text := public.client_ip();
begin
  if v_ip is not null and (select count(*) from public.counterfeit_reports r
                         where r.ip = v_ip and r.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('result','too_many');
  end if;
  insert into public.counterfeit_reports (code_entered, shop_name, location, notes, lat, lng, photo_path, member_id, ip)
  values (left(public.norm_code(p_code), 20), left(p_shop, 200), left(p_location, 300), left(p_notes, 1000),
          p_lat, p_lng, left(p_photo_path, 300), auth.uid(), v_ip);
  return jsonb_build_object('result','ok');
end $$;

-- =====================================================================
-- ADMIN FUNCTIONS (staff only; checked inside every function)
-- =====================================================================
create or replace function public.admin_me()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('name', name, 'role', role, 'area', area)
                   from public.staff where user_id = auth.uid()), 'null'::jsonb)
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb; tz constant text := 'Asia/Jakarta';
begin
  perform public.require_staff(array['admin','field','viewer']);
  select jsonb_build_object(
    'farmers',            (select count(*) from members where type='farmer' and status='active'),
    'farmers_active_30',  (select count(distinct l.member_id) from point_ledger l join members m on m.id=l.member_id
                            where m.type='farmer' and l.kind='scan' and l.created_at > now() - interval '30 days'),
    'retailers_active',   (select count(*) from members where type='retailer' and status='active'),
    'retailers_pending',  (select count(*) from members where type='retailer' and status='pending'),
    'bottles_scanned',    (select count(*) from point_ledger l join qr_codes q on q.code=l.ref
                            where l.kind='scan' and q.type='bottle' and l.status <> 'rejected'),
    'cartons_scanned',    (select count(*) from point_ledger l join qr_codes q on q.code=l.ref
                            where l.kind='scan' and q.type='carton' and l.status <> 'rejected'),
    'repeat_rate',        (select round(100.0 * count(*) filter (where d >= 2) / nullif(count(*),0), 1) from (
                             select l.member_id, count(distinct (l.created_at at time zone tz)::date) d
                             from point_ledger l join members m on m.id=l.member_id
                             where m.type='farmer' and l.kind='scan' and l.status <> 'rejected' group by l.member_id) s),
    'points_available',   (select coalesce(sum(delta) filter (where status='available' or (status='pending' and available_at<=now())),0) from point_ledger),
    'points_pending',     (select coalesce(sum(delta) filter (where status='review' or (status='pending' and available_at>now())),0) from point_ledger),
    'point_value_rp',     public.setting_num('point_value_rp', 0),
    'redemptions_open',   (select count(*) from redemptions where status in ('requested','approved')),
    'redemptions_late',   (select count(*) from redemptions where status in ('requested','approved') and created_at < now() - interval '3 days'),
    'review_open',        (select count(*) from point_ledger where status='review'),
    'flags_open',         (select count(*) from flags where status='open'),
    'fake_signals_7d',    (select count(*) from scans where result='not_found' and created_at > now() - interval '7 days')
                          + (select count(*) from counterfeit_reports where created_at > now() - interval '7 days'),
    'reports_new',        (select count(*) from counterfeit_reports where status='new'),
    'codes', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from qr_codes group by status) s),
    'by_week', (select coalesce(jsonb_agg(w order by w.week), '[]'::jsonb) from (
        select to_char(date_trunc('week', l.created_at at time zone tz), 'YYYY-MM-DD') week,
               count(*) filter (where q.type='bottle' and p.size_ml=100) b100,
               count(*) filter (where q.type='bottle' and p.size_ml=250) b250,
               count(*) filter (where q.type='bottle' and p.size_ml=500) b500,
               count(*) filter (where q.type='carton') cartons
        from point_ledger l join qr_codes q on q.code=l.ref join products p on p.sku=q.sku
        where l.kind='scan' and l.status <> 'rejected' and l.created_at > now() - interval '12 weeks'
        group by 1) w),
    'by_province', (select coalesce(jsonb_agg(x order by x.farmers desc), '[]'::jsonb) from (
        select coalesce(nullif(m.province,''),'(kosong)') province,
               count(distinct m.id) filter (where m.type='farmer') farmers,
               count(distinct m.id) filter (where m.type='retailer' and m.status='active') retailers,
               count(l.id) filter (where m.type='farmer') bottles,
               count(l.id) filter (where m.type='retailer') cartons
        from members m left join point_ledger l on l.member_id=m.id and l.kind='scan' and l.status<>'rejected'
        group by 1) x),
    'by_regency', (select coalesce(jsonb_agg(x order by x.bottles desc, x.cartons desc), '[]'::jsonb) from (
        select coalesce(nullif(m.province,''),'-') province, coalesce(nullif(m.regency,''),'(kosong)') regency,
               count(l.id) filter (where m.type='retailer') cartons,
               count(l.id) filter (where m.type='farmer') bottles,
               count(distinct m.id) filter (where m.type='farmer') farmers
        from members m left join point_ledger l on l.member_id=m.id and l.kind='scan' and l.status<>'rejected'
        group by 1,2 limit 50) x),
    'by_crop', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
        select coalesce(nullif(crop,''),'(kosong)') crop, count(*) n from members where type='farmer' group by 1) x),
    'top_retailers', (select coalesce(jsonb_agg(x order by x.cartons desc), '[]'::jsonb) from (
        select m.shop_name, m.regency, count(l.id) cartons from members m
        join point_ledger l on l.member_id=m.id and l.kind='scan' and l.status<>'rejected'
        where m.type='retailer' group by m.id, m.shop_name, m.regency order by 3 desc limit 10) x)
  ) into out;
  return out;
end $$;

create or replace function public.admin_redemptions(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  return coalesce((select jsonb_agg(x order by x.created_at) from (
    select r.id, r.created_at, r.updated_at, r.reward_name, r.points, r.status, r.delivery, r.pulsa_phone,
           r.address, r.note, r.tracking, r.admin_note, m.name member_name, m.phone, m.type member_type,
           m.regency, m.province, rw.kind
    from redemptions r join members m on m.id = r.member_id join rewards rw on rw.id = r.reward_id
    where (p_status = 'all') or (p_status = 'open' and r.status in ('requested','approved')) or r.status = p_status
    order by r.created_at limit 500) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_redemption(p_id bigint, p_status text, p_tracking text default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r public.redemptions;
begin
  perform public.require_staff(array['admin']);
  select * into r from redemptions where id = p_id for update;
  if not found then raise exception 'Penukaran tidak ditemukan'; end if;
  if p_status not in ('approved','shipped','completed','rejected') then raise exception 'Status tidak valid'; end if;
  if r.status in ('rejected','completed') then raise exception 'Penukaran sudah selesai/ditolak'; end if;
  if p_status = 'rejected' then
    insert into point_ledger (member_id, delta, kind, ref, status, note, created_by)
    values (r.member_id, r.points, 'refund', 'R' || r.id, 'available', 'Pengembalian poin: ' || coalesce(p_note, 'penukaran ditolak'), auth.uid());
    update rewards set stock = stock + 1 where id = r.reward_id and stock is not null;
  end if;
  update redemptions set status = p_status, tracking = coalesce(p_tracking, tracking),
         admin_note = coalesce(p_note, admin_note), handled_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform public.log_audit('redemption_' || p_status, 'redemption', p_id::text,
                           jsonb_build_object('from', r.status, 'tracking', p_tracking, 'note', p_note));
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_members(p_type text default null, p_status text default null, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare my_area text := (select area from staff where user_id = auth.uid());
        my_role text := (select role from staff where user_id = auth.uid());
begin
  perform public.require_staff(array['admin','field','viewer']);
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select m.id, m.type, m.phone, m.name, m.province, m.regency, m.district, m.crop, m.land_ha, m.shop_name,
           m.owner_name, m.address, m.distributor, m.lat, m.lng, m.status, m.status_note, m.created_at, m.verified_at,
           (select available from member_balance(m.id)) available,
           (select pending from member_balance(m.id)) pending,
           (select count(*) from point_ledger l where l.member_id = m.id and l.kind = 'scan' and l.status <> 'rejected') scans
    from members m
    where (p_type is null or p_type = '' or m.type = p_type)
      and (p_status is null or p_status = '' or m.status = p_status)
      and (p_search is null or p_search = '' or m.name ilike '%'||p_search||'%' or m.phone like '%'||regexp_replace(p_search,'^0','')||'%'
           or m.shop_name ilike '%'||p_search||'%' or m.regency ilike '%'||p_search||'%')
      and (my_role <> 'field' or my_area is null or my_area = '' or m.province ilike '%'||my_area||'%' or m.regency ilike '%'||my_area||'%')
    order by m.created_at desc limit 500) x), '[]'::jsonb);
end $$;

create or replace function public.admin_verify_retailer(p_member uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare m public.members; released int := 0;
begin
  perform public.require_staff(array['admin','field']);
  select * into m from members where id = p_member and type = 'retailer' for update;
  if not found then raise exception 'Retailer tidak ditemukan'; end if;
  if p_approve then
    update members set status = 'active', verified_by = auth.uid(), verified_at = now(), status_note = p_note where id = p_member;
    update point_ledger set status = 'pending',
           available_at = greatest(created_at + make_interval(days => public.setting_num('retailer_hold_days', 14)::int), now()),
           note = 'Toko terverifikasi'
     where member_id = p_member and status = 'review' and note = 'Menunggu verifikasi toko';
    get diagnostics released = row_count;
  else
    update members set status = 'rejected', status_note = p_note where id = p_member;
  end if;
  perform public.log_audit(case when p_approve then 'retailer_verified' else 'retailer_rejected' end,
                           'member', p_member::text, jsonb_build_object('note', p_note, 'released_entries', released));
  return jsonb_build_object('result','ok', 'released', released);
end $$;

create or replace function public.admin_set_member_status(p_member uuid, p_status text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare old text;
begin
  perform public.require_staff(array['admin']);
  if p_status not in ('active','blocked') then raise exception 'Status tidak valid'; end if;
  select status into old from members where id = p_member;
  update members set status = p_status, status_note = p_note where id = p_member;
  perform public.log_audit('member_' || p_status, 'member', p_member::text, jsonb_build_object('from', old, 'note', p_note));
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_reset_pin(p_member uuid, p_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  perform public.require_staff(array['admin']);
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 angka'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at = now()
   where id = p_member;
  if not found then raise exception 'Akun tidak ditemukan'; end if;
  perform public.log_audit('pin_reset', 'member', p_member::text, null);
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_adjust_points(p_member uuid, p_delta int, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin']);
  if coalesce(trim(p_note), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  if p_delta = 0 then raise exception 'Jumlah poin tidak boleh 0'; end if;
  insert into point_ledger (member_id, delta, kind, status, note, created_by)
  values (p_member, p_delta, 'adjust', 'available', p_note, auth.uid());
  perform public.log_audit('points_adjusted', 'member', p_member::text, jsonb_build_object('delta', p_delta, 'note', p_note));
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_member_detail(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','field','viewer']);
  return jsonb_build_object(
    'ledger', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, created_at, delta, kind, ref, status, available_at, note from point_ledger
        where member_id = p_member order by created_at desc limit 200) x), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, created_at, reward_name, points, status from redemptions where member_id = p_member
        order by created_at desc limit 100) x), '[]'::jsonb),
    'flags', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select id, created_at, rule, code, details, status from flags where member_id = p_member) x), '[]'::jsonb));
end $$;

create or replace function public.admin_review_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  return coalesce((select jsonb_agg(x order by x.created_at) from (
    select l.id, l.created_at, l.delta, l.ref, l.note, m.id member_id, m.name, m.phone, m.type, m.status member_status,
           m.shop_name, m.regency
    from point_ledger l join members m on m.id = l.member_id
    where l.status = 'review' order by l.created_at limit 500) x), '[]'::jsonb);
end $$;

create or replace function public.admin_review_decide(p_entry bigint, p_approve boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare l public.point_ledger; m public.members;
begin
  perform public.require_staff(array['admin']);
  select * into l from point_ledger where id = p_entry and status = 'review' for update;
  if not found then raise exception 'Data tidak ditemukan'; end if;
  select * into m from members where id = l.member_id;
  if p_approve then
    if m.type = 'retailer' and m.status <> 'active' then raise exception 'Verifikasi toko terlebih dahulu'; end if;
    if m.type = 'retailer' then
      update point_ledger set status = 'pending', note = 'Disetujui admin',
             available_at = greatest(created_at + make_interval(days => public.setting_num('retailer_hold_days', 14)::int), now())
       where id = p_entry;
    else
      update point_ledger set status = 'available', note = 'Disetujui admin' where id = p_entry;
    end if;
  else
    update point_ledger set status = 'rejected', note = 'Ditolak admin' where id = p_entry;
  end if;
  perform public.log_audit(case when p_approve then 'points_approved' else 'points_rejected' end, 'ledger', p_entry::text, null);
  return jsonb_build_object('result','ok');
end $$;

-- ---- QR codes -------------------------------------------------------
create or replace function public.admin_import_codes(p_rows jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare total int; ins int; bad int;
begin
  perform public.require_staff(array['admin']);
  create temp table if not exists _imp (code text, type text, sku text, code_batch text, production_batch text) on commit drop;
  truncate _imp;
  insert into _imp
  select public.norm_code(r ->> 'code'), lower(r ->> 'type'), r ->> 'sku', r ->> 'code_batch', nullif(r ->> 'production_batch', '')
  from jsonb_array_elements(p_rows) r;
  select count(*) into total from _imp;
  select count(*) into bad from _imp
   where not public.code_is_valid(code) or type not in ('bottle','carton')
      or not exists (select 1 from products p where p.sku = _imp.sku) or coalesce(code_batch,'') = '';
  insert into qr_codes (code, type, sku, code_batch, production_batch)
  select distinct on (code) code, type, sku, code_batch, production_batch from _imp
   where public.code_is_valid(code) and type in ('bottle','carton')
     and exists (select 1 from products p where p.sku = _imp.sku) and coalesce(code_batch,'') <> ''
  on conflict (code) do nothing;
  get diagnostics ins = row_count;
  perform public.log_audit('codes_imported', 'qr_codes', null, jsonb_build_object('rows', total, 'inserted', ins, 'invalid', bad));
  return jsonb_build_object('rows', total, 'inserted', ins, 'invalid', bad, 'duplicates', total - ins - bad);
end $$;

create or replace function public.admin_code_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  return coalesce((select jsonb_agg(x order by x.code_batch, x.type, x.sku) from (
    select code_batch, type, sku, count(*) total,
           count(*) filter (where status='generated') generated,
           count(*) filter (where status='activated') activated,
           count(*) filter (where status='redeemed') redeemed,
           count(*) filter (where status='void') void
    from qr_codes group by code_batch, type, sku) x), '[]'::jsonb);
end $$;

create or replace function public.admin_activate_codes(p_code_batch text, p_sku text, p_type text, p_activate boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform public.require_staff(array['admin']);
  if p_activate then
    update qr_codes set status = 'activated', activated_at = now()
     where code_batch = p_code_batch and sku = p_sku and type = p_type and status = 'generated';
  else
    update qr_codes set status = 'generated', activated_at = null
     where code_batch = p_code_batch and sku = p_sku and type = p_type and status = 'activated';
  end if;
  get diagnostics n = row_count;
  perform public.log_audit(case when p_activate then 'codes_activated' else 'codes_deactivated' end, 'qr_codes',
                           p_code_batch, jsonb_build_object('sku', p_sku, 'type', p_type, 'count', n));
  return jsonb_build_object('result','ok', 'count', n);
end $$;

create or replace function public.admin_void_code(p_code text, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c text := public.norm_code(p_code); n int;
begin
  perform public.require_staff(array['admin']);
  update qr_codes set status = 'void', void_reason = p_reason where code = c and status <> 'redeemed';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Kode tidak ditemukan atau sudah diklaim'; end if;
  perform public.log_audit('code_void', 'qr_code', c, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_lookup_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c text := public.norm_code(p_code);
begin
  perform public.require_staff(array['admin','field','viewer']);
  return jsonb_build_object(
    'code', (select to_jsonb(q) || jsonb_build_object('member', (select jsonb_build_object('name', name, 'phone', phone, 'type', type)
               from members where id = q.redeemed_by)) from qr_codes q where q.code = c),
    'scans', coalesce((select jsonb_agg(x order by x.created_at desc) from (
               select s.created_at, s.action, s.result, s.ip, m.name, m.phone from scans s
               left join members m on m.id = s.member_id where s.code = c order by s.created_at desc limit 50) x), '[]'::jsonb));
end $$;

-- ---- rewards, reports, flags, settings, exports ----------------------
create or replace function public.admin_rewards()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.catalog, r.sort, r.points) from rewards r), '[]'::jsonb);
end $$;

create or replace function public.admin_save_reward(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare rid bigint := nullif(p ->> 'id', '')::bigint;
begin
  perform public.require_staff(array['admin']);
  if rid is null then
    insert into rewards (catalog, name, description, points, kind, stock, image_url, sort, active)
    values (p ->> 'catalog', p ->> 'name', p ->> 'description', (p ->> 'points')::int, coalesce(p ->> 'kind','goods'),
            nullif(p ->> 'stock','')::int, nullif(p ->> 'image_url',''), coalesce(nullif(p ->> 'sort','')::int, 0),
            coalesce((p ->> 'active')::boolean, true))
    returning id into rid;
  else
    update rewards set catalog = p ->> 'catalog', name = p ->> 'name', description = p ->> 'description',
           points = (p ->> 'points')::int, kind = coalesce(p ->> 'kind','goods'), stock = nullif(p ->> 'stock','')::int,
           image_url = nullif(p ->> 'image_url',''), sort = coalesce(nullif(p ->> 'sort','')::int, 0),
           active = coalesce((p ->> 'active')::boolean, true)
     where id = rid;
  end if;
  perform public.log_audit('reward_saved', 'reward', rid::text, p);
  return jsonb_build_object('result','ok', 'id', rid);
end $$;

create or replace function public.admin_reports(p_status text default 'new')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','field','viewer']);
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select r.*, m.name member_name, m.phone member_phone from counterfeit_reports r
    left join members m on m.id = r.member_id
    where p_status = 'all' or r.status = p_status order by r.created_at desc limit 300) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_report(p_id bigint, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','field']);
  update counterfeit_reports set status = p_status where id = p_id;
  perform public.log_audit('report_' || p_status, 'report', p_id::text, null);
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_flags(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select f.*, m.name, m.phone, m.type member_type from flags f left join members m on m.id = f.member_id
    where p_status = 'all' or f.status = p_status order by f.created_at desc limit 500) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_flag(p_id bigint, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin']);
  update flags set status = p_status, reviewed_by = auth.uid() where id = p_id;
  perform public.log_audit('flag_' || p_status, 'flag', p_id::text, null);
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  return coalesce((select jsonb_object_agg(key, jsonb_build_object('value', value, 'note', note)) from settings), '{}'::jsonb);
end $$;

create or replace function public.admin_save_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin']);
  update settings set value = p_value where key = p_key;
  if not found then raise exception 'Pengaturan tidak dikenal'; end if;
  perform public.log_audit('setting_saved', 'setting', p_key, p_value);
  return jsonb_build_object('result','ok');
end $$;

create or replace function public.admin_export(p_what text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.require_staff(array['admin','viewer']);
  perform public.log_audit('export', p_what, null, null);
  if p_what = 'members' then
    return coalesce((select jsonb_agg(x) from (
      select m.type, m.phone, m.name, m.province, m.regency, m.district, m.crop, m.land_ha, m.shop_name, m.owner_name,
             m.address, m.distributor, m.status, m.created_at,
             (select available from member_balance(m.id)) points_available,
             (select pending from member_balance(m.id)) points_pending
      from members m order by m.created_at) x), '[]'::jsonb);
  elsif p_what = 'ledger' then
    return coalesce((select jsonb_agg(x) from (
      select l.created_at, m.phone, m.name, m.type, l.kind, l.delta, l.status, l.available_at, l.ref, l.note
      from point_ledger l join members m on m.id = l.member_id order by l.created_at limit 100000) x), '[]'::jsonb);
  elsif p_what = 'redemptions' then
    return coalesce((select jsonb_agg(x) from (
      select r.created_at, r.updated_at, m.phone, m.name, m.type, r.reward_name, r.points, r.status, r.delivery,
             r.pulsa_phone, r.address, r.tracking, r.admin_note
      from redemptions r join members m on m.id = r.member_id order by r.created_at) x), '[]'::jsonb);
  elsif p_what = 'scans' then
    return coalesce((select jsonb_agg(x) from (
      select s.created_at, s.code, s.action, s.result, m.phone, m.name, s.ip, s.lat, s.lng
      from scans s left join members m on m.id = s.member_id order by s.created_at desc limit 100000) x), '[]'::jsonb);
  elsif p_what = 'reports' then
    return coalesce((select jsonb_agg(x) from (
      select created_at, code_entered, shop_name, location, notes, lat, lng, status from counterfeit_reports order by created_at) x), '[]'::jsonb);
  end if;
  raise exception 'Jenis ekspor tidak dikenal';
end $$;

-- ---------------------------------------------------------------------
-- PERMISSIONS: who may call which function
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.check_code(text)                          to anon, authenticated;
grant execute on function public.is_staff(text[])                          to authenticated;   -- used by storage policies
grant execute on function public.submit_report(text,text,text,text,numeric,numeric,text) to anon, authenticated;
grant execute on function public.register_member(jsonb)                    to authenticated;
grant execute on function public.list_retailers(text)                      to authenticated;
grant execute on function public.my_summary()                              to authenticated;
grant execute on function public.my_history()                              to authenticated;
grant execute on function public.claim_code(text,numeric,numeric)          to authenticated;
grant execute on function public.request_redemption(bigint,text,text,text,text) to authenticated;

grant execute on function public.admin_me()                                to authenticated;
grant execute on function public.admin_stats()                             to authenticated;
grant execute on function public.admin_redemptions(text)                   to authenticated;
grant execute on function public.admin_set_redemption(bigint,text,text,text) to authenticated;
grant execute on function public.admin_members(text,text,text)             to authenticated;
grant execute on function public.admin_member_detail(uuid)                 to authenticated;
grant execute on function public.admin_verify_retailer(uuid,boolean,text)  to authenticated;
grant execute on function public.admin_set_member_status(uuid,text,text)   to authenticated;
grant execute on function public.admin_reset_pin(uuid,text)                to authenticated;
grant execute on function public.admin_adjust_points(uuid,int,text)        to authenticated;
grant execute on function public.admin_review_list()                       to authenticated;
grant execute on function public.admin_review_decide(bigint,boolean)       to authenticated;
grant execute on function public.admin_import_codes(jsonb)                 to authenticated;
grant execute on function public.admin_code_summary()                      to authenticated;
grant execute on function public.admin_activate_codes(text,text,text,boolean) to authenticated;
grant execute on function public.admin_void_code(text,text)                to authenticated;
grant execute on function public.admin_lookup_code(text)                   to authenticated;
grant execute on function public.admin_rewards()                           to authenticated;
grant execute on function public.admin_save_reward(jsonb)                  to authenticated;
grant execute on function public.admin_reports(text)                       to authenticated;
grant execute on function public.admin_set_report(bigint,text)             to authenticated;
grant execute on function public.admin_flags(text)                         to authenticated;
grant execute on function public.admin_set_flag(bigint,text)               to authenticated;
grant execute on function public.admin_settings()                          to authenticated;
grant execute on function public.admin_save_setting(text,jsonb)            to authenticated;
grant execute on function public.admin_export(text)                        to authenticated;

-- table-level read access used by the policies above
grant select on public.products, public.rewards, public.settings to anon, authenticated;
grant select on public.members, public.point_ledger, public.redemptions to authenticated;
