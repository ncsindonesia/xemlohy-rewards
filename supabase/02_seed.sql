-- =====================================================================
-- Xemlohy Smart Rewards - starting data (run once, after 01_schema.sql)
-- Values marked "proposed" in the developer brief; change them later in
-- the admin portal (Pengaturan / Hadiah) without touching this file.
-- =====================================================================

insert into public.settings (key, value, note) values
  ('farmer_daily_cap',      '20',              'Maks. botol per petani per hari sebelum poin ditahan untuk diperiksa'),
  ('retailer_monthly_cap',  '50',              'Maks. karton per retailer per bulan sebelum poin ditahan untuk diperiksa'),
  ('retailer_hold_days',    '14',              'Hari tunggu sebelum poin karton retailer bisa dipakai'),
  ('points_expiry_months',  '12',              'Masa berlaku poin (bulan) - dicatat; kedaluwarsa otomatis belum aktif'),
  ('point_value_rp',        '0',               'Nilai rupiah per poin, untuk menghitung kewajiban poin (diisi Finance)'),
  ('whatsapp_number',       '"6281517733335"', 'Nomor WhatsApp NeoCare untuk tombol bantuan'),
  ('program_open',          'true',            'false = poin belum bisa diklaim, scan hanya cek keaslian')
on conflict (key) do nothing;

insert into public.products (sku, name, size_ml, farmer_points, retailer_points_per_carton, bottles_per_carton) values
  ('XEM-100', 'Xemlohy', 100, 10, 24, 24),
  ('XEM-250', 'Xemlohy', 250, 25, 24, 24),
  ('XEM-500', 'Xemlohy', 500, 50, 24, 24)
on conflict (sku) do nothing;

insert into public.rewards (catalog, name, description, points, kind, stock, sort)
select * from (values
  ('farmer', 'Pulsa',         'Pulsa dikirim ke nomor HP Anda',            250,  'pulsa', null::int, 1),
  ('farmer', 'Topi Xemlohy',  'Topi lapangan Xemlohy',                     500,  'goods', null::int, 2),
  ('farmer', 'Kaos Polo',     'Kaos polo Xemlohy',                         1000, 'goods', null::int, 3),
  ('farmer', 'Sprayer',       'Sprayer punggung untuk penyemprotan',       5000, 'goods', null::int, 4)
) v(catalog, name, description, points, kind, stock, sort)
where not exists (select 1 from public.rewards);
