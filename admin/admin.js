/* NCS Program Rewards - NCS admin portal (staff only). Requires Supabase. */
(function () {
  "use strict";
  var CFG = window.XEM_CONFIG || {};
  var root, sb, ME = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString("id-ID"); }
  function dt(x, t) { if (!x) return ""; var o = { day: "numeric", month: "short", year: "numeric" }; if (t) { o.hour = "2-digit"; o.minute = "2-digit"; } return new Date(x).toLocaleDateString("id-ID", o); }
  function phone(p) { return p ? "0" + String(p).slice(2) : ""; }
  function waTo(p, text) { return "https://wa.me/" + String(p || "").replace(/\D/g, "") + (text ? "?text=" + encodeURIComponent(text) : ""); }
  function waBtn(p) { return p ? ' <a class="wa-link" href="' + waTo(p) + '" target="_blank" rel="noopener" title="Chat WhatsApp">WA</a>' : ""; }
  function toast(m) { var t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2800); }
  function can(roles) { return ME && roles.indexOf(ME.role) >= 0; }
  function rpc(fn, args) { return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; }); }
  function errBox(m) { return '<div class="err">' + esc(m) + "</div>"; }
  function modal(html) {
    var b = document.createElement("div"); b.className = "modal-back"; b.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + "</div>";
    b.addEventListener("click", function (e) { if (e.target === b) b.remove(); }); document.body.appendChild(b); return b;
  }
  function ask(title, fields, okLabel) {
    return new Promise(function (resolve) {
      var m = modal("<h2>" + esc(title) + '</h2><div class="form">' + fields.map(function (f) {
        return "<label>" + esc(f.label) + (f.type === "textarea" ? '<textarea class="input" data-k="' + f.key + '">' + esc(f.value || "") + "</textarea>"
          : '<input class="input" data-k="' + f.key + '" type="' + (f.type || "text") + '" value="' + esc(f.value || "") + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "") + ">") + "</label>";
      }).join("") + '</div><div class="btns"><button class="btn" id="ok">' + esc(okLabel || "Simpan") + '</button><button class="btn ghost" id="no">Batal</button></div>');
      $("#no", m).onclick = function () { m.remove(); resolve(null); };
      $("#ok", m).onclick = function () { var o = {}; $all("[data-k]", m).forEach(function (el) { o[el.getAttribute("data-k")] = el.value.trim(); }); m.remove(); resolve(o); };
    });
  }
  function csvDownload(name, rows) {
    if (!rows || !rows.length) { toast("Tidak ada data"); return; }
    var cols = Object.keys(rows[0]);
    var q = function (v) { v = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = "﻿" + cols.join(",") + "\n" + rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }
  function table(cols, rows, onRow) {
    if (!rows.length) return '<p class="muted">Tidak ada data.</p>';
    return '<div class="tbl-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th class="' + (c.n ? "n" : "") + '">' + esc(c.t) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r, i) { return '<tr data-i="' + i + '"' + (onRow ? ' class="click"' : "") + ">" + cols.map(function (c) { return '<td class="' + (c.n ? "n" : "") + '">' + c.f(r) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div>";
  }

  // ------------------------------------------------------------- shell
  var PAGES = [
    ["dashboard", "Dashboard", ["admin", "field", "viewer"]],
    ["penukaran", "Penukaran", ["admin", "viewer"]],
    ["pesan", "Pesan WA", ["admin", "viewer"]],
    ["retailer", "Verifikasi retailer", ["admin", "field"]],
    ["review", "Poin ditahan", ["admin", "viewer"]],
    ["anggota", "Anggota", ["admin", "field", "viewer"]],
    ["kode", "Kode QR", ["admin", "viewer"]],
    ["hadiah", "Hadiah", ["admin", "viewer"]],
    ["laporan", "Laporan palsu & flag", ["admin", "field", "viewer"]],
    ["pengaturan", "Pengaturan & ekspor", ["admin", "viewer"]]
  ];
  var badges = {};
  function shell(active, body) {
    root.innerHTML = '<div class="wrap"><nav class="side" aria-label="Menu admin"><div class="brand"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#F2B544"/><path d="M10 22c2-7 6-11 12-12-1 6-5 10-12 12z" fill="#123D22"/></svg><div><b>NCS Program Rewards</b><span>Admin NCS</span></div></div>' +
      PAGES.filter(function (p) { return can(p[2]); }).map(function (p) {
        return '<a href="#' + p[0] + '"' + (p[0] === active ? ' aria-current="page"' : "") + ">" + esc(p[1]) + (badges[p[0]] ? '<span class="badge">' + num(badges[p[0]]) + "</span>" : "") + "</a>";
      }).join("") + '<div class="who">' + esc(ME.name) + " · " + esc(ME.role) + '<br><button id="logout">Keluar</button></div></nav><main class="main" id="main">' + body + "</main></div>";
    $("#logout").onclick = function () { sb.auth.signOut().then(function () { ME = null; login(); }); };
  }
  function route() {
    var h = (location.hash || "#dashboard").slice(1).split("?")[0];
    var p = PAGES.filter(function (x) { return x[0] === h && can(x[2]); })[0] || PAGES[0];
    shell(p[0], '<div class="spinner"></div>');
    ({ dashboard: pDashboard, penukaran: pRedemptions, pesan: pWa, retailer: pRetailers, review: pReview, anggota: pMembers, kode: pCodes, hadiah: pRewards,
       laporan: pReports, pengaturan: pSettings })[p[0]]().catch(function (e) { $("#main").innerHTML = errBox(e.message); });
  }
  window.addEventListener("hashchange", function () { if (ME) route(); });
  function setMain(html) { var m = $("#main"); if (m) m.innerHTML = html; return m; }
  function refreshBadges() {
    return rpc("admin_stats").then(function (s) {
      badges = { pesan: s.wa_todo, penukaran: s.redemptions_open, retailer: s.retailers_pending, review: s.review_open, laporan: s.reports_new + s.flags_open };
      return s;
    });
  }

  // ------------------------------------------------------------- dashboard
  function bars(weeks) {
    if (!weeks.length) return '<p class="muted">Belum ada scan.</p>';
    var max = Math.max.apply(null, weeks.map(function (w) { return w.b100 + w.b250 + w.b500; }).concat([1]));
    var C = { b100: "#E0A12E", b250: "#1F6B3A", b500: "#6E9A7A" };
    return '<div class="legend"><span><i style="background:#E0A12E"></i>100 ml</span><span><i style="background:#1F6B3A"></i>250 ml</span><span><i style="background:#6E9A7A"></i>500 ml</span></div>' +
      '<div class="bars" role="img" aria-label="Botol di-scan per minggu">' + weeks.map(function (w) {
        var tot = w.b100 + w.b250 + w.b500;
        return '<div class="col" title="' + esc(w.week) + ": " + tot + ' botol"><div class="tot">' + num(tot) + "</div>" +
          ["b500", "b250", "b100"].map(function (k) { return w[k] ? '<div class="seg" style="height:' + (100 * w[k] / max) + "%;background:" + C[k] + '"></div>' : ""; }).join("") + "</div>";
      }).join("") + '</div><div class="bars-x">' + weeks.map(function (w) { return "<span>" + esc(dt(w.week).replace(/ \d{4}$/, "")) + "</span>"; }).join("") + "</div>";
  }
  function pDashboard() {
    return refreshBadges().then(function (s) {
      shell("dashboard", "");
      var liab = s.point_value_rp ? "Rp " + num((s.points_available + s.points_pending) * s.point_value_rp) : "Isi nilai poin di Pengaturan";
      var codes = s.codes || {};
      setMain('<div class="head"><div><h1>Dashboard program</h1><div class="muted">Data langsung dari database · ' + esc(dt(new Date(), true)) + "</div></div></div>" +
        '<section class="kpis">' +
        kpi(num(s.farmers), "Petani terdaftar", "aktif 30 hari: " + num(s.farmers_active_30)) +
        kpi(num(s.bottles_scanned), "Botol di-scan", codes.activated || codes.redeemed ? "scan-through " + pct(100 * s.bottles_scanned / Math.max(1, (codes.activated || 0) + (codes.redeemed || 0))) + " dari kode aktif" : "") +
        kpi((s.repeat_rate || 0) + "%", "Repeat rate", "petani scan di ≥ 2 hari berbeda") +
        kpi(num(s.cartons_scanned), "Karton diterima retailer", num(s.retailers_active) + " retailer aktif · " + num(s.retailers_pending) + " menunggu") +
        kpi(num(s.points_available + s.points_pending), "Poin beredar", liab) +
        kpi(num(s.fake_signals_7d), "Sinyal pemalsuan (7 hari)", num(s.reports_new) + " laporan baru", s.fake_signals_7d ? "bad" : "") + "</section>" +
        '<section class="kpis">' + kpi(num(s.redemptions_open), "Penukaran terbuka", num(s.redemptions_late) + " lebih dari 3 hari", s.redemptions_late ? "warn" : "") +
        kpi(num(s.review_open), "Poin ditahan (review)", "") + kpi(num(s.flags_open), "Flag fraud terbuka", "", s.flags_open ? "warn" : "") +
        kpi(num(codes.activated || 0), "Kode aktif belum di-scan", num(codes.generated || 0) + " belum diaktifkan · " + num(codes.void || 0) + " void") + "</section>" +
        '<div class="cols"><section class="card"><h2>Botol di-scan per minggu</h2>' + bars(s.by_week) + "</section>" +
        '<section class="card"><h2>Retailer teratas (karton)</h2>' + table([{ t: "Toko", f: function (r) { return esc(r.shop_name); } }, { t: "Kab/Kota", f: function (r) { return esc(r.regency); } }, { t: "Karton", n: 1, f: function (r) { return num(r.cartons); } }], s.top_retailers) + "</section></div>" +
        '<div class="cols"><section class="card"><h2>Per provinsi</h2>' + table([{ t: "Provinsi", f: function (r) { return esc(r.province); } }, { t: "Petani", n: 1, f: function (r) { return num(r.farmers); } },
          { t: "Botol", n: 1, f: function (r) { return num(r.bottles); } }, { t: "Retailer", n: 1, f: function (r) { return num(r.retailers); } }, { t: "Karton", n: 1, f: function (r) { return num(r.cartons); } }], s.by_province) + "</section>" +
        '<section class="card"><h2>Sell-in vs sell-out per kabupaten</h2>' + table([{ t: "Kab/Kota", f: function (r) { return esc(r.regency) + '<div class="muted">' + esc(r.province) + "</div>"; } },
          { t: "Karton (sell-in)", n: 1, f: function (r) { return num(r.cartons); } }, { t: "Botol (sell-out)", n: 1, f: function (r) { return num(r.bottles); } }, { t: "Petani", n: 1, f: function (r) { return num(r.farmers); } }], s.by_regency) + "</section></div>" +
        '<section class="card"><h2>Petani per tanaman utama</h2>' + table([{ t: "Tanaman", f: function (r) { return esc(r.crop); } }, { t: "Petani", n: 1, f: function (r) { return num(r.n); } }], s.by_crop) + "</section>");
    });
  }
  function pct(x) { return Number(x).toLocaleString("id-ID", { maximumFractionDigits: x >= 10 ? 0 : x >= 1 ? 1 : 2 }) + "%"; }
  function kpi(v, l, s, cls) { return '<div class="kpi ' + (cls || "") + '"><div class="v">' + v + '</div><div class="l">' + esc(l) + "</div>" + (s ? '<div class="s">' + esc(s) + "</div>" : "") + "</div>"; }

  // ------------------------------------------------------------- redemptions
  var RST = { requested: ["warn", "Diminta"], approved: ["", "Disetujui"], shipped: ["", "Dikirim"], completed: ["grey", "Selesai"], rejected: ["bad", "Ditolak"] };
  function pRedemptions() {
    var st = (location.hash.split("?s=")[1]) || "open";
    return rpc("admin_redemptions", { p_status: st }).then(function (rows) {
      setMain('<div class="head"><h1>Penukaran hadiah</h1><div class="toolbar"><select class="input" id="st">' +
        [["open", "Terbuka"], ["requested", "Diminta"], ["approved", "Disetujui"], ["shipped", "Dikirim"], ["completed", "Selesai"], ["rejected", "Ditolak"], ["all", "Semua"]].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === st ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
        '</select><button class="btn ghost" id="exp">Ekspor CSV</button></div></div>' +
        '<p class="muted">Pulsa: kirim lewat penyedia pulsa ke nomor terdaftar, lalu tandai Selesai. Barang: Setujui → Kirim (isi resi) → Selesai. Tolak = poin otomatis dikembalikan ke anggota. Setiap perubahan status otomatis membuat pesan WhatsApp ke anggota (menu Pesan WA).</p>' +
        '<section class="card">' + table([
          { t: "Tanggal", f: function (r) { return esc(dt(r.created_at, true)); } },
          { t: "Anggota", f: function (r) { return esc(r.member_name) + '<div class="muted">' + esc(phone(r.phone)) + waBtn(r.phone) + " · " + esc(r.regency || "") + "</div>"; } },
          { t: "Hadiah", f: function (r) { return esc(r.reward_name) + '<div class="muted">' + num(r.points) + " poin</div>"; } },
          { t: "Kirim ke", f: function (r) { return r.delivery === "pulsa" ? "Pulsa " + esc(phone(r.pulsa_phone)) : (r.delivery === "pickup" ? "Ambil di: " : "Alamat: ") + esc(r.address || "") + (r.note ? '<div class="muted">Catatan: ' + esc(r.note) + "</div>" : ""); } },
          { t: "Status", f: function (r) { var s = RST[r.status]; return '<span class="pill ' + s[0] + '">' + s[1] + "</span>" + (r.tracking ? '<div class="muted">Resi ' + esc(r.tracking) + "</div>" : "") + (r.admin_note ? '<div class="muted">' + esc(r.admin_note) + "</div>" : ""); } },
          { t: "", f: function (r) {
            if (!can(["admin"]) || r.status === "completed" || r.status === "rejected") return "";
            var b = [];
            if (r.status === "requested") b.push('<button class="btn sm" data-a="approved" data-id="' + r.id + '">Setujui</button>');
            if (r.kind !== "pulsa" && (r.status === "requested" || r.status === "approved")) b.push('<button class="btn sm ghost" data-a="shipped" data-id="' + r.id + '">Kirim</button>');
            b.push('<button class="btn sm ghost" data-a="completed" data-id="' + r.id + '">Selesai</button>');
            b.push('<button class="btn sm danger" data-a="rejected" data-id="' + r.id + '">Tolak</button>');
            return '<div class="btns">' + b.join("") + "</div>"; } }
        ], rows) + "</section>");
      $("#st").onchange = function () { location.hash = "penukaran?s=" + this.value; };
      $("#exp").onclick = function () { rpc("admin_export", { p_what: "redemptions" }).then(function (r) { csvDownload("penukaran", r); }); };
      $all("[data-a]").forEach(function (b) {
        b.onclick = function () {
          var a = b.getAttribute("data-a"), id = +b.getAttribute("data-id");
          var p = a === "shipped" ? ask("Tandai dikirim", [{ key: "tracking", label: "Kurir & nomor resi" }]) :
            a === "rejected" ? ask("Tolak penukaran", [{ key: "note", label: "Alasan (dilihat anggota)", type: "textarea" }], "Tolak & kembalikan poin") : Promise.resolve({});
          p.then(function (v) {
            if (!v) return;
            if (a === "rejected" && !v.note) return toast("Alasan wajib diisi");
            return rpc("admin_set_redemption", { p_id: id, p_status: a, p_tracking: v.tracking || null, p_note: v.note || null }).then(function () { toast("Tersimpan"); route(); });
          }).catch(function (e) { toast(e.message); });
        };
      });
    });
  }


  // ------------------------------------------------------------- WhatsApp messages
  var WAK = { welcome: "Selamat datang", points: "Poin masuk", redeem_requested: "Penukaran diterima", redeem_approved: "Penukaran disetujui",
    redeem_shipped: "Hadiah dikirim", redeem_completed: "Penukaran selesai", redeem_rejected: "Penukaran ditolak", retailer_verified: "Toko terverifikasi",
    retailer_rejected: "Toko ditolak", review_approved: "Poin tertahan disetujui", review_rejected: "Poin tertahan ditolak", points_adjusted: "Penyesuaian poin",
    member_blocked: "Akun dibekukan", member_active: "Akun diaktifkan", report: "Laporan diterima", test: "Tes" };
  var WAS = { manual: ["warn", "Perlu dikirim"], new: ["warn", "Perlu dikirim"], queued: ["", "Diproses gateway"], sent: ["grey", "Terkirim"], failed: ["bad", "Gagal"], skipped: ["grey", "Dilewati"] };
  function pWa() {
    var st = (location.hash.split("?s=")[1]) || "todo";
    return rpc("admin_wa_outbox", { p_status: st }).then(function (d) {
      var admin = can(["admin"]), c = d.counts || {}, auto = d.provider === "fonnte";
      var todo = (c.manual || 0) + (c.new || 0) + (c.failed || 0);
      var warn = !d.notify ? "Pengiriman WhatsApp sedang dimatikan (wa_notify = false): tidak ada pesan baru yang dibuat." :
        auto && !d.token_set ? "Mode otomatis dipilih tetapi token Fonnte belum diisi: pesan masuk daftar manual." :
        auto && !d.net_ready ? "Ekstensi pg_net belum aktif di Supabase: pesan masuk daftar manual. Jalankan ulang 01_schema.sql atau aktifkan pg_net di Database > Extensions." : "";
      setMain('<div class="head"><h1>Pesan WhatsApp ke anggota</h1><div class="toolbar"><select class="input" id="st">' +
        [["todo", "Perlu dikirim (" + todo + ")"], ["queued", "Diproses gateway"], ["sent", "Terkirim"], ["failed", "Gagal"], ["skipped", "Dilewati"], ["all", "Semua"]].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === st ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div></div>" +
        '<section class="card"><h2>Cara kirim: ' + (auto ? "otomatis lewat Fonnte" : "manual oleh admin") + "</h2>" +
        '<p class="muted">' + (auto ? "Pesan dikirim otomatis dari nomor WhatsApp yang terhubung di Fonnte. Pesan yang gagal muncul di daftar Perlu dikirim."
          : "Setiap ada poin masuk, penukaran, atau perubahan status, pesan siap kirim muncul di bawah. Klik <b>Buka WhatsApp</b> (pesan sudah terisi), kirim, lalu klik <b>Terkirim</b>.") +
        " Pesan poin digabung: beberapa scan dalam ±1 menit menjadi satu pesan berisi total poin.</p>" + (warn ? errBox(warn) : "") +
        (admin ? '<div class="toolbar" style="margin-top:10px"><label>Cara kirim <select class="input" id="prov"><option value="manual">Manual oleh admin</option><option value="fonnte">Otomatis (Fonnte)</option></select></label>' +
          '<label>Token Fonnte <input class="input" id="tok" type="password" autocomplete="off" placeholder="' + (d.token_set ? "sudah tersimpan (isi untuk ganti)" : "tempel token dari fonnte.com") + '"></label>' +
          '<button class="btn ghost" id="tok-save">Simpan</button>' + (d.token_set ? '<button class="btn ghost" id="tok-del">Hapus token</button>' : "") + "</div>" +
          '<div class="toolbar" style="margin-top:8px"><label><input type="checkbox" id="notify"' + (d.notify ? " checked" : "") + "> Kirim pesan WhatsApp ke anggota</label>" +
          '<input class="input" id="test-ph" placeholder="No. HP untuk tes, mis. 0812..." style="max-width:220px"><button class="btn ghost" id="test">Kirim pesan tes</button></div>' : "") +
        "</section>" +
        '<section class="card">' + table([
          { t: "Waktu", f: function (r) { return esc(dt(r.created_at, true)) + (r.sent_at ? '<div class="muted">terkirim ' + esc(dt(r.sent_at, true)) + "</div>" : ""); } },
          { t: "Kepada", f: function (r) { return esc(r.member_type === "retailer" && r.shop_name ? r.shop_name : (r.name || "-")) + '<div class="muted">' + esc(phone(r.phone)) + "</div>"; } },
          { t: "Jenis", f: function (r) { return esc(WAK[r.kind] || r.kind); } },
          { t: "Pesan", f: function (r) { return '<div class="wa-msg">' + esc(r.message) + "</div>"; } },
          { t: "Status", f: function (r) { var s = WAS[r.status] || ["", r.status]; return '<span class="pill ' + s[0] + '">' + s[1] + "</span>" + (r.status === "failed" && r.response ? '<div class="muted">' + esc(r.response) + "</div>" : ""); } },
          { t: "", f: function (r) {
            if (!admin || ["manual", "new", "failed"].indexOf(r.status) < 0) return "";
            return '<div class="btns"><a class="btn sm" target="_blank" rel="noopener" data-open="' + r.id + '" href="' + esc(waTo(r.phone, r.message)) + '">Buka WhatsApp</a>' +
              '<button class="btn sm ghost" data-mark="sent" data-id="' + r.id + '">Terkirim</button>' +
              (auto ? '<button class="btn sm ghost" data-resend="' + r.id + '">Kirim ulang otomatis</button>' : "") +
              '<button class="btn sm ghost" data-mark="skipped" data-id="' + r.id + '">Lewati</button></div>'; } }
        ], d.rows) + "</section>");
      $("#st").onchange = function () { location.hash = "pesan?s=" + this.value; };
      if (!admin) return;
      $("#prov").value = d.provider;
      $("#prov").onchange = function () { rpc("admin_save_setting", { p_key: "wa_provider", p_value: this.value }).then(function () { toast("Tersimpan"); route(); }).catch(function (e) { toast(e.message); }); };
      $("#notify").onchange = function () { rpc("admin_save_setting", { p_key: "wa_notify", p_value: this.checked }).then(function () { toast("Tersimpan"); route(); }).catch(function (e) { toast(e.message); }); };
      $("#tok-save").onclick = function () { var v = $("#tok").value.trim(); if (!v) return toast("Tempel token dulu"); rpc("admin_wa_set_token", { p_token: v }).then(function () { toast("Token tersimpan"); route(); }).catch(function (e) { toast(e.message); }); };
      if ($("#tok-del")) $("#tok-del").onclick = function () { rpc("admin_wa_set_token", { p_token: "" }).then(function () { toast("Token dihapus"); route(); }); };
      $("#test").onclick = function () {
        rpc("admin_wa_test", { p_phone: $("#test-ph").value }).then(function (r) {
          toast(r.result === "queued" ? "Pesan tes dikirim ke Fonnte. Cek status di daftar Semua dalam 1 menit." : "Pesan tes masuk daftar Perlu dikirim (mode manual).");
          setTimeout(route, 1500);
        }).catch(function (e) { toast(e.message); });
      };
      $all("[data-open]").forEach(function (a) { a.addEventListener("click", function () { var b = $('[data-mark="sent"][data-id="' + a.getAttribute("data-open") + '"]'); if (b) b.classList.remove("ghost"); }); });
      $all("[data-mark]").forEach(function (b) {
        b.onclick = function () { rpc("admin_wa_mark", { p_ids: [+b.getAttribute("data-id")], p_status: b.getAttribute("data-mark") }).then(function () { b.closest("tr").remove(); refreshBadges(); }).catch(function (e) { toast(e.message); }); };
      });
      $all("[data-resend]").forEach(function (b) {
        b.onclick = function () { rpc("admin_wa_resend", { p_id: +b.getAttribute("data-resend") }).then(function (r) { toast(r.result === "queued" ? "Dikirim ulang" : "Gateway belum siap, tetap manual"); setTimeout(route, 1200); }).catch(function (e) { toast(e.message); }); };
      });
    });
  }

  // ------------------------------------------------------------- retailers
  function pRetailers() {
    return Promise.all([rpc("admin_members", { p_type: "retailer", p_status: "pending", p_search: null }), rpc("admin_members", { p_type: "retailer", p_status: "active", p_search: null })]).then(function (r) {
      var pend = r[0], act = r[1];
      setMain('<div class="head"><h1>Verifikasi retailer</h1></div><p class="muted">Kunjungi atau telepon toko, cek nama, alamat dan lokasi, lalu verifikasi. Karton yang sudah di-scan akan masuk masa tunggu ' +
        "sejak tanggal scan.</p><section class=\"card\"><h2>Menunggu verifikasi (" + pend.length + ")</h2>" + table([
          { t: "Daftar", f: function (m) { return esc(dt(m.created_at)); } },
          { t: "Toko", f: function (m) { return "<b>" + esc(m.shop_name) + "</b><div class=\"muted\">" + esc(m.owner_name) + " · " + esc(phone(m.phone)) + waBtn(m.phone) + "</div>"; } },
          { t: "Alamat", f: function (m) { return esc(m.address) + '<div class="muted">' + esc([m.district, m.regency, m.province].filter(Boolean).join(", ")) + "</div>" +
              (m.lat ? '<a href="https://maps.google.com/?q=' + m.lat + "," + m.lng + '" target="_blank" rel="noopener">Lihat di peta</a>' : ""); } },
          { t: "Distributor", f: function (m) { return esc(m.distributor); } },
          { t: "Karton", n: 1, f: function (m) { return num(m.scans); } },
          { t: "", f: function (m) { return '<div class="btns"><button class="btn sm" data-v="1" data-id="' + m.id + '">Verifikasi</button><button class="btn sm danger" data-v="0" data-id="' + m.id + '">Tolak</button></div>'; } }
        ], pend) + '</section><section class="card"><h2>Retailer aktif (' + act.length + ")</h2>" + table([
          { t: "Toko", f: function (m) { return esc(m.shop_name) + '<div class="muted">' + esc(phone(m.phone)) + "</div>"; } },
          { t: "Kab/Kota", f: function (m) { return esc(m.regency); } }, { t: "Diverifikasi", f: function (m) { return esc(dt(m.verified_at)); } },
          { t: "Karton", n: 1, f: function (m) { return num(m.scans); } }, { t: "Poin", n: 1, f: function (m) { return num(m.available) + (m.pending ? '<div class="muted">+' + num(m.pending) + " tertahan</div>" : ""); } }
        ], act) + "</section>");
      $all("[data-v]").forEach(function (b) {
        b.onclick = function () {
          var ok = b.getAttribute("data-v") === "1";
          ask(ok ? "Verifikasi toko" : "Tolak pendaftaran toko", [{ key: "note", label: ok ? "Catatan (mis. dikunjungi FA tanggal ...)" : "Alasan penolakan", type: "textarea" }], ok ? "Verifikasi" : "Tolak").then(function (v) {
            if (!v) return;
            return rpc("admin_verify_retailer", { p_member: b.getAttribute("data-id"), p_approve: ok, p_note: v.note || null }).then(function (r) { toast(ok ? "Terverifikasi · " + r.released + " karton masuk masa tunggu" : "Ditolak"); route(); });
          }).catch(function (e) { toast(e.message); });
        };
      });
    });
  }

  // ------------------------------------------------------------- points review
  function pReview() {
    return rpc("admin_review_list").then(function (rows) {
      setMain('<div class="head"><h1>Poin ditahan</h1></div><p class="muted">Scan di atas batas harian/bulanan, atau karton dari toko yang belum diverifikasi. Setujui jika wajar; tolak jika mencurigakan (poin tidak diberikan).</p>' +
        '<section class="card">' + table([
          { t: "Waktu", f: function (r) { return esc(dt(r.created_at, true)); } },
          { t: "Anggota", f: function (r) { return esc(r.type === "retailer" ? r.shop_name : r.name) + '<div class="muted">' + esc(phone(r.phone)) + " · " + esc(r.regency || "") + "</div>"; } },
          { t: "Kode", f: function (r) { return '<span class="mono">' + esc(r.ref) + "</span>"; } },
          { t: "Poin", n: 1, f: function (r) { return num(r.delta); } },
          { t: "Alasan", f: function (r) { return esc(r.note); } },
          { t: "", f: function (r) { return can(["admin"]) ? '<div class="btns"><button class="btn sm" data-ok="1" data-id="' + r.id + '"' + (r.type === "retailer" && r.member_status !== "active" ? " disabled title=\"Verifikasi toko dulu\"" : "") + '>Setujui</button><button class="btn sm danger" data-ok="0" data-id="' + r.id + '">Tolak</button></div>' : ""; } }
        ], rows) + "</section>");
      $all("[data-ok]").forEach(function (b) {
        b.onclick = function () { rpc("admin_review_decide", { p_entry: +b.getAttribute("data-id"), p_approve: b.getAttribute("data-ok") === "1" }).then(function () { toast("Tersimpan"); route(); }).catch(function (e) { toast(e.message); }); };
      });
    });
  }

  // ------------------------------------------------------------- members
  var MST = { active: ["", "Aktif"], pending: ["warn", "Menunggu"], blocked: ["bad", "Dibekukan"], rejected: ["bad", "Ditolak"] };
  function pMembers() {
    var q = memo.mq || { type: "", status: "", search: "" };
    return rpc("admin_members", { p_type: q.type || null, p_status: q.status || null, p_search: q.search || null }).then(function (rows) {
      setMain('<div class="head"><h1>Anggota</h1><div class="toolbar"><input class="input" id="q" placeholder="Cari nama, no HP, toko, kabupaten" value="' + esc(q.search) + '">' +
        '<select class="input" id="t"><option value="">Semua jenis</option><option value="farmer"' + (q.type === "farmer" ? " selected" : "") + '>Petani</option><option value="retailer"' + (q.type === "retailer" ? " selected" : "") + ">Retailer</option></select>" +
        '<select class="input" id="s"><option value="">Semua status</option>' + Object.keys(MST).map(function (k) { return '<option value="' + k + '"' + (q.status === k ? " selected" : "") + ">" + MST[k][1] + "</option>"; }).join("") + "</select>" +
        '<button class="btn" id="go">Cari</button>' + (can(["admin", "viewer"]) ? '<button class="btn ghost" id="exp">Ekspor CSV</button>' : "") + "</div></div>" +
        '<p class="muted">' + rows.length + " anggota (maks. 500 ditampilkan). Klik baris untuk detail.</p>" +
        '<section class="card">' + table([
          { t: "Nama", f: function (m) { return "<b>" + esc(m.type === "retailer" ? m.shop_name : m.name) + "</b>" + (m.type === "retailer" ? '<div class="muted">' + esc(m.owner_name) + "</div>" : ""); } },
          { t: "No HP", f: function (m) { return esc(phone(m.phone)); } },
          { t: "Jenis", f: function (m) { return m.type === "retailer" ? "Retailer" : "Petani"; } },
          { t: "Wilayah", f: function (m) { return esc([m.regency, m.province].filter(Boolean).join(", ")); } },
          { t: "Beli di toko", f: function (m) { return esc(m.bought_from_text || ""); } },
          { t: "Scan", n: 1, f: function (m) { return num(m.scans); } },
          { t: "Poin", n: 1, f: function (m) { return num(m.available) + (m.pending ? '<div class="muted">+' + num(m.pending) + " tertahan</div>" : ""); } },
          { t: "Status", f: function (m) { var s = MST[m.status]; return '<span class="pill ' + s[0] + '">' + s[1] + "</span>"; } }
        ], rows, true) + "</section>");
      function search() { memo.mq = { type: $("#t").value, status: $("#s").value, search: $("#q").value.trim() }; route(); }
      $("#go").onclick = search; $("#q").onkeydown = function (e) { if (e.key === "Enter") search(); };
      if ($("#exp")) $("#exp").onclick = function () { rpc("admin_export", { p_what: "members" }).then(function (r) { csvDownload("anggota", r); }); };
      $all("tr.click").forEach(function (tr) { tr.onclick = function () { memberDetail(rows[+tr.getAttribute("data-i")]); }; });
    });
  }
  var memo = {};
  function memberDetail(m) {
    rpc("admin_member_detail", { p_member: m.id }).then(function (d) {
      var md = modal("<h2>" + esc(m.type === "retailer" ? m.shop_name : m.name) + '</h2><div class="muted">' + esc(phone(m.phone)) + waBtn(m.phone) + " · " + (m.type === "retailer" ? "Retailer" : "Petani") + " · daftar " + esc(dt(m.created_at)) +
        "</div><div>" + esc([m.address, m.district, m.regency, m.province].filter(Boolean).join(", ")) + (m.crop ? " · Tanaman: " + esc(m.crop) : "") + (m.land_ha ? " · " + esc(m.land_ha) + " ha" : "") + "</div>" +
        (m.bought_from_text ? '<div>Beli di toko: <b>' + esc(m.bought_from_text) + "</b></div>" : "") +
        '<div class="kpis">' + kpi(num(m.available), "Poin bisa dipakai") + kpi(num(m.pending), "Poin tertahan") + kpi(num(m.scans), "Scan") + "</div>" +
        (can(["admin"]) ? '<div class="btns"><button class="btn ghost" id="adj">Sesuaikan poin</button>' +
          (m.status === "blocked" ? '<button class="btn" id="unb">Aktifkan</button>' : m.status === "active" ? '<button class="btn danger" id="blk">Bekukan</button>' : "") + "</div>" : "") +
        "<h3>Riwayat poin</h3>" + table([{ t: "Waktu", f: function (l) { return esc(dt(l.created_at, true)); } }, { t: "Jenis", f: function (l) { return esc(l.kind); } },
          { t: "Ref", f: function (l) { return '<span class="mono">' + esc(l.ref || "") + "</span>"; } }, { t: "Status", f: function (l) { return esc(l.status) + (l.available_at ? '<div class="muted">aktif ' + esc(dt(l.available_at)) + "</div>" : ""); } },
          { t: "Catatan", f: function (l) { return esc(l.note || ""); } }, { t: "Poin", n: 1, f: function (l) { return (l.delta > 0 ? "+" : "") + num(l.delta); } }], d.ledger) +
        (d.flags.length ? "<h3>Flag</h3>" + table([{ t: "Waktu", f: function (f) { return esc(dt(f.created_at, true)); } }, { t: "Aturan", f: function (f) { return esc(f.rule); } }, { t: "Detail", f: function (f) { return esc(f.details); } }, { t: "Status", f: function (f) { return esc(f.status); } }], d.flags) : "") +
        '<div class="btns"><button class="btn ghost" id="close">Tutup</button></div>');
      $("#close", md).onclick = function () { md.remove(); };
      var act = function (p) { p.then(function (x) { if (x !== false) { toast("Tersimpan"); md.remove(); route(); } }).catch(function (e) { toast(e.message); }); };
      if ($("#adj", md)) $("#adj", md).onclick = function () {
        act(ask("Sesuaikan poin", [{ key: "d", label: "Jumlah poin (+ tambah / - kurangi)", type: "number" }, { key: "n", label: "Alasan (wajib, dicatat di audit)", type: "textarea" }]).then(function (v) {
          if (!v) return false; return rpc("admin_adjust_points", { p_member: m.id, p_delta: parseInt(v.d, 10), p_note: v.n });
        }));
      };
      if ($("#blk", md)) $("#blk", md).onclick = function () { act(ask("Bekukan akun", [{ key: "n", label: "Alasan", type: "textarea" }], "Bekukan").then(function (v) { if (!v) return false; return rpc("admin_set_member_status", { p_member: m.id, p_status: "blocked", p_note: v.n }); })); };
      if ($("#unb", md)) $("#unb", md).onclick = function () { act(rpc("admin_set_member_status", { p_member: m.id, p_status: "active", p_note: null })); };
    }).catch(function (e) { toast(e.message); });
  }

  // ------------------------------------------------------------- QR codes
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === "," || c === ";") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function toImportRows(text) {
    var rows = parseCSV(text.replace(/^﻿/, "")); if (rows.length < 2) throw new Error("File kosong");
    var h = rows[0].map(function (x) { return x.trim().toLowerCase(); }), ix = function (n) { return h.indexOf(n); };
    var out = [];
    if (ix("code") >= 0 && ix("sku") >= 0) {
      rows.slice(1).forEach(function (r) { out.push({ code: r[ix("code")], type: r[ix("type")], sku: r[ix("sku")], code_batch: r[ix("code_batch")], production_batch: ix("production_batch") >= 0 ? r[ix("production_batch")] : "" }); });
    } else if (ix("qr_content") >= 0) {
      rows.slice(1).forEach(function (r) {
        var size = String(r[ix("size")] || "").replace(/\D/g, "");
        out.push({ code: String(r[ix("qr_content")]).split("/").pop(), type: String(r[ix("type")]).toLowerCase(), sku: "XEM-" + size, code_batch: r[ix("code_batch")] });
      });
    } else throw new Error("Kolom tidak dikenali. Pakai file import (code,type,sku,code_batch) atau file printer (qr_content,type,size,code_batch).");
    return out.filter(function (r) { return r.code; });
  }
  function pCodes() {
    return rpc("admin_code_summary").then(function (rows) {
      var admin = can(["admin"]);
      setMain('<div class="head"><h1>Kode QR</h1></div>' +
        '<section class="card"><h2>Ringkasan per batch</h2><p class="muted">Kode baru masuk sebagai "belum aktif". Aktifkan batch saat barang keluar gudang NCS; sebelum itu scan hanya menampilkan "produk asli, poin belum aktif".</p>' +
        table([{ t: "Batch kode", f: function (r) { return esc(r.code_batch); } }, { t: "Jenis", f: function (r) { return r.type === "carton" ? "Karton" : "Botol"; } }, { t: "SKU", f: function (r) { return esc(r.sku); } },
          { t: "Total", n: 1, f: function (r) { return num(r.total); } }, { t: "Belum aktif", n: 1, f: function (r) { return num(r.generated); } }, { t: "Aktif", n: 1, f: function (r) { return num(r.activated); } },
          { t: "Sudah diklaim", n: 1, f: function (r) { return num(r.redeemed); } }, { t: "Void", n: 1, f: function (r) { return num(r.void); } },
          { t: "", f: function (r, i) { return admin ? '<div class="btns">' + (r.generated ? '<button class="btn sm" data-act="1" data-k="' + esc(JSON.stringify([r.code_batch, r.sku, r.type])) + '">Aktifkan ' + num(r.generated) + "</button>" : "") +
              (r.activated ? '<button class="btn sm ghost" data-act="0" data-k="' + esc(JSON.stringify([r.code_batch, r.sku, r.type])) + '">Nonaktifkan</button>' : "") + "</div>" : ""; } }], rows) + "</section>" +
        (admin ? '<section class="card"><h2>Import kode dari file CSV</h2><p class="muted">Pilih file <b>..._QR_Import_Codes_....csv</b> atau file CSV dari printer. Kode yang sudah ada dilewati otomatis, jadi aman diimpor ulang.</p>' +
          '<div class="toolbar"><input type="file" id="file" accept=".csv,text/csv" class="input" style="padding:6px"><button class="btn" id="imp">Import</button></div><div id="imp-msg" style="margin-top:10px"></div></section>' : "") +
        '<section class="card"><h2>Cek satu kode</h2><div class="toolbar"><input class="input mono" id="lc" placeholder="XXXXX-XXXXX-X"><button class="btn ghost" id="lk">Cek</button>' +
        (admin ? '<button class="btn danger" id="vd">Void kode ini</button>' : "") + '</div><div id="lk-out" style="margin-top:10px"></div></section>');
      $all("[data-act]").forEach(function (b) {
        b.onclick = function () {
          var k = JSON.parse(b.getAttribute("data-k")), on = b.getAttribute("data-act") === "1";
          if (!confirmBox(on ? "Aktifkan semua kode " + k[2] + " " + k[1] + " di batch " + k[0] + "? Poin bisa diklaim setelah ini." : "Nonaktifkan kode yang belum diklaim di batch ini?")) return;
          rpc("admin_activate_codes", { p_code_batch: k[0], p_sku: k[1], p_type: k[2], p_activate: on }).then(function (r) { toast(num(r.count) + " kode " + (on ? "diaktifkan" : "dinonaktifkan")); route(); }).catch(function (e) { toast(e.message); });
        };
      });
      if ($("#imp")) $("#imp").onclick = function () {
        var f = $("#file").files[0], out = $("#imp-msg"); if (!f) return toast("Pilih file CSV dulu");
        var btn = this; btn.disabled = true;
        f.text().then(function (text) {
          var all = toImportRows(text), size = 1000, i = 0, tot = { inserted: 0, invalid: 0, duplicates: 0 };
          out.innerHTML = '<div class="progress"><div style="width:0%"></div></div><p class="muted" id="pg">0 / ' + num(all.length) + "</p>";
          function next() {
            if (i >= all.length) { btn.disabled = false; out.innerHTML = '<div class="ok">Selesai: ' + num(tot.inserted) + " kode baru, " + num(tot.duplicates) + " sudah ada (dilewati), " + num(tot.invalid) + " tidak valid.</div>"; setTimeout(route, 1500); return; }
            return rpc("admin_import_codes", { p_rows: all.slice(i, i + size) }).then(function (r) {
              tot.inserted += r.inserted; tot.invalid += r.invalid; tot.duplicates += r.duplicates; i += size;
              $(".progress div", out).style.width = Math.round(100 * Math.min(i, all.length) / all.length) + "%"; $("#pg").textContent = num(Math.min(i, all.length)) + " / " + num(all.length);
              return next();
            });
          }
          return next();
        }).catch(function (e) { btn.disabled = false; out.innerHTML = errBox(e.message); });
      };
      $("#lk").onclick = function () {
        rpc("admin_lookup_code", { p_code: $("#lc").value }).then(function (d) {
          var c = d.code;
          $("#lk-out").innerHTML = !c ? errBox("Kode tidak ada di database (kemungkinan palsu atau salah ketik).") :
            '<div class="ok"><b class="mono">' + esc(c.code) + "</b> · " + esc(c.type) + " " + esc(c.sku) + " · batch " + esc(c.code_batch) + " · status <b>" + esc(c.status) + "</b>" +
            (c.member ? " · diklaim " + esc(dt(c.redeemed_at, true)) + " oleh " + esc(c.member.name) + " (" + esc(phone(c.member.phone)) + ")" : "") + (c.void_reason ? " · alasan void: " + esc(c.void_reason) : "") + "</div>" +
            (d.scans.length ? "<h3 style=\"margin-top:12px\">Riwayat scan</h3>" + table([{ t: "Waktu", f: function (s) { return esc(dt(s.created_at, true)); } }, { t: "Aksi", f: function (s) { return esc(s.action); } },
              { t: "Hasil", f: function (s) { return esc(s.result); } }, { t: "Anggota", f: function (s) { return esc(s.name ? s.name + " " + phone(s.phone) : "-"); } }, { t: "IP", f: function (s) { return esc(s.ip || ""); } }], d.scans) : "");
        }).catch(function (e) { $("#lk-out").innerHTML = errBox(e.message); });
      };
      if ($("#vd")) $("#vd").onclick = function () {
        ask("Void kode " + $("#lc").value, [{ key: "r", label: "Alasan (mis. label rusak, dicuri)", type: "textarea" }], "Void").then(function (v) {
          if (!v) return; return rpc("admin_void_code", { p_code: $("#lc").value, p_reason: v.r }).then(function () { toast("Kode di-void"); $("#lk").click(); });
        }).catch(function (e) { toast(e.message); });
      };
    });
  }
  function confirmBox(msg) { return window.confirm(msg); }

  // ------------------------------------------------------------- rewards
  function pRewards() {
    return rpc("admin_rewards").then(function (rows) {
      setMain('<div class="head"><h1>Hadiah</h1>' + (can(["admin"]) ? '<button class="btn" id="add">Tambah hadiah</button>' : "") + "</div>" +
        '<section class="card">' + table([{ t: "Katalog", f: function (r) { return r.catalog === "retailer" ? "Retailer" : "Petani"; } }, { t: "Nama", f: function (r) { return "<b>" + esc(r.name) + '</b><div class="muted">' + esc(r.description || "") + "</div>"; } },
          { t: "Jenis", f: function (r) { return r.kind === "pulsa" ? "Pulsa" : "Barang"; } }, { t: "Poin", n: 1, f: function (r) { return num(r.points); } },
          { t: "Stok", n: 1, f: function (r) { return r.stock == null ? "∞" : num(r.stock); } }, { t: "Status", f: function (r) { return r.active ? '<span class="pill">Aktif</span>' : '<span class="pill grey">Nonaktif</span>'; } }], rows, can(["admin"])) + "</section>");
      if (!can(["admin"])) return;
      $("#add").onclick = function () { rewardForm({ catalog: "farmer", kind: "goods", active: true }); };
      $all("tr.click").forEach(function (tr) { tr.onclick = function () { rewardForm(rows[+tr.getAttribute("data-i")]); }; });
    });
  }
  function rewardForm(r) {
    var m = modal("<h2>" + (r.id ? "Ubah hadiah" : "Tambah hadiah") + '</h2><div class="form">' +
      '<label>Katalog<select class="input" id="c"><option value="farmer">Petani</option><option value="retailer">Retailer</option></select></label>' +
      '<label>Jenis<select class="input" id="k"><option value="goods">Barang</option><option value="pulsa">Pulsa</option></select></label>' +
      '<label>Nama<input class="input" id="n" value="' + esc(r.name || "") + '"></label><label>Poin<input class="input" id="p" type="number" min="1" value="' + esc(r.points || "") + '"></label>' +
      '<label>Stok (kosong = tak terbatas)<input class="input" id="s" type="number" min="0" value="' + esc(r.stock == null ? "" : r.stock) + '"></label>' +
      '<label>Urutan<input class="input" id="o" type="number" value="' + esc(r.sort || 0) + '"></label>' +
      '<label>Link gambar (opsional)<input class="input" id="i" value="' + esc(r.image_url || "") + '"></label>' +
      '<label>Status<select class="input" id="a"><option value="true">Aktif</option><option value="false">Nonaktif</option></select></label></div>' +
      '<label style="font-size:13px;font-weight:600">Deskripsi<textarea class="input" id="d">' + esc(r.description || "") + '</textarea></label>' +
      '<div class="btns"><button class="btn" id="sv">Simpan</button><button class="btn ghost" id="cl">Batal</button></div>');
    $("#c", m).value = r.catalog; $("#k", m).value = r.kind; $("#a", m).value = String(r.active !== false);
    $("#cl", m).onclick = function () { m.remove(); };
    $("#sv", m).onclick = function () {
      var p = { id: r.id || "", catalog: $("#c", m).value, kind: $("#k", m).value, name: $("#n", m).value.trim(), points: $("#p", m).value, stock: $("#s", m).value,
        sort: $("#o", m).value, image_url: $("#i", m).value.trim(), active: $("#a", m).value === "true", description: $("#d", m).value.trim() };
      if (!p.name || !(+p.points > 0)) return toast("Nama dan poin wajib diisi");
      rpc("admin_save_reward", { p: p }).then(function () { m.remove(); toast("Tersimpan"); route(); }).catch(function (e) { toast(e.message); });
    };
  }

  // ------------------------------------------------------------- reports & flags
  var RPS = { new: ["warn", "Baru"], checked: ["", "Diperiksa"], confirmed_fake: ["bad", "Palsu"], not_fake: ["grey", "Bukan palsu"] };
  function pReports() {
    return Promise.all([rpc("admin_reports", { p_status: "all" }), rpc("admin_flags", { p_status: "open" })]).then(function (r) {
      var reps = r[0], flags = r[1];
      setMain('<div class="head"><h1>Laporan produk palsu</h1></div><section class="card">' + table([
          { t: "Waktu", f: function (x) { return esc(dt(x.created_at, true)); } }, { t: "Kode", f: function (x) { return '<span class="mono">' + esc(x.code_entered || "-") + "</span>"; } },
          { t: "Toko / lokasi", f: function (x) { return esc(x.shop_name || "") + '<div class="muted">' + esc(x.location || "") + "</div>" + (x.lat ? '<a target="_blank" rel="noopener" href="https://maps.google.com/?q=' + x.lat + "," + x.lng + '">Peta</a>' : ""); } },
          { t: "Keterangan", f: function (x) { return esc(x.notes || "") + (x.member_name ? '<div class="muted">Pelapor: ' + esc(x.member_name) + " " + esc(phone(x.member_phone)) + "</div>" : ""); } },
          { t: "Foto", f: function (x) { return x.photo_path ? '<button class="btn sm ghost" data-photo="' + esc(x.photo_path) + '">Lihat</button>' : "-"; } },
          { t: "Status", f: function (x) { var s = RPS[x.status]; return can(["admin", "field"]) ? '<select class="input" data-rep="' + x.id + '">' + Object.keys(RPS).map(function (k) { return '<option value="' + k + '"' + (k === x.status ? " selected" : "") + ">" + RPS[k][1] + "</option>"; }).join("") + "</select>" : '<span class="pill ' + s[0] + '">' + s[1] + "</span>"; } }
        ], reps) + '</section><div class="head"><h1>Flag fraud terbuka</h1></div><section class="card">' + table([
          { t: "Waktu", f: function (x) { return esc(dt(x.created_at, true)); } }, { t: "Aturan", f: function (x) { return esc({ code_already_used: "Kode sudah dipakai orang lain", farmer_daily_cap: "Melebihi batas harian", retailer_monthly_cap: "Melebihi batas bulanan" }[x.rule] || x.rule); } },
          { t: "Anggota", f: function (x) { return esc(x.name || "-") + '<div class="muted">' + esc(phone(x.phone)) + "</div>"; } }, { t: "Kode", f: function (x) { return '<span class="mono">' + esc(x.code || "") + "</span>"; } },
          { t: "Detail", f: function (x) { return esc(x.details || ""); } },
          { t: "", f: function (x) { return can(["admin"]) ? '<div class="btns"><button class="btn sm ghost" data-flag="cleared" data-id="' + x.id + '">Wajar</button><button class="btn sm danger" data-flag="confirmed" data-id="' + x.id + '">Fraud</button></div>' : ""; } }
        ], flags) + "</section>");
      $all("[data-rep]").forEach(function (s) { s.onchange = function () { rpc("admin_set_report", { p_id: +s.getAttribute("data-rep"), p_status: s.value }).then(function () { toast("Tersimpan"); }); }; });
      $all("[data-flag]").forEach(function (b) { b.onclick = function () { rpc("admin_set_flag", { p_id: +b.getAttribute("data-id"), p_status: b.getAttribute("data-flag") }).then(function () { toast("Tersimpan"); route(); }); }; });
      $all("[data-photo]").forEach(function (b) {
        b.onclick = function () {
          sb.storage.from("reports").createSignedUrl(b.getAttribute("data-photo"), 300).then(function (r) {
            if (r.error) return toast(r.error.message);
            var m = modal('<img src="' + esc(r.data.signedUrl) + '" alt="Foto laporan" style="max-width:100%;border-radius:10px"><div class="btns"><button class="btn ghost" id="x">Tutup</button></div>');
            $("#x", m).onclick = function () { m.remove(); };
          });
        };
      });
    });
  }

  // ------------------------------------------------------------- settings & export
  var SET_LABEL = { farmer_daily_cap: "Batas botol per petani per hari", retailer_monthly_cap: "Batas karton per retailer per bulan", retailer_hold_days: "Masa tunggu poin karton (hari)",
    points_expiry_months: "Masa berlaku poin (bulan)", point_value_rp: "Nilai rupiah per poin", whatsapp_number: "Nomor WhatsApp NeoCare", program_open: "Program dibuka (true/false)",
    program_name: "Nama program", app_url: "Alamat website", wa_notify: "Kirim pesan WhatsApp (true/false)", wa_provider: "Cara kirim WhatsApp (manual / fonnte)", wa_api_url: "Alamat API Fonnte" };
  function pSettings() {
    return rpc("admin_settings").then(function (s) {
      var admin = can(["admin"]);
      setMain('<div class="head"><h1>Pengaturan</h1></div><section class="card">' + table([
          { t: "Pengaturan", f: function (k) { return "<b>" + esc(SET_LABEL[k] || k) + '</b><div class="muted">' + esc(s[k].note || "") + "</div>"; } },
          { t: "Nilai", f: function (k) { return admin ? '<input class="input" data-set="' + esc(k) + '" value="' + esc(typeof s[k].value === "string" ? s[k].value : JSON.stringify(s[k].value)) + '">' : esc(JSON.stringify(s[k].value)); } },
          { t: "", f: function (k) { return admin ? '<button class="btn sm" data-save="' + esc(k) + '">Simpan</button>' : ""; } }
        ], Object.keys(s)) + "</section>" +
        '<div class="head"><h1>Ekspor data (CSV, bisa dibuka di Excel)</h1></div><section class="card"><div class="btns">' +
        [["members", "Anggota"], ["ledger", "Riwayat poin"], ["redemptions", "Penukaran"], ["scans", "Semua scan"], ["reports", "Laporan palsu"], ["wa", "Pesan WhatsApp"]].map(function (x) { return '<button class="btn ghost" data-exp="' + x[0] + '">' + x[1] + "</button>"; }).join("") +
        '</div><p class="muted" style="margin-top:10px">Setiap ekspor dicatat di audit log. File berisi data pribadi: simpan dengan aman.</p></section>');
      $all("[data-save]").forEach(function (b) {
        b.onclick = function () {
          var k = b.getAttribute("data-save"), raw = $('[data-set="' + k + '"]').value.trim(), v;
          if (k === "whatsapp_number") v = raw.replace(/\D/g, ""); else { try { v = JSON.parse(raw); } catch (e) { v = raw; } }   // plain text is saved as text
          rpc("admin_save_setting", { p_key: k, p_value: v }).then(function () { toast("Tersimpan"); }).catch(function (e) { toast(e.message); });
        };
      });
      $all("[data-exp]").forEach(function (b) { b.onclick = function () { var w = b.getAttribute("data-exp"); rpc("admin_export", { p_what: w }).then(function (r) { csvDownload(w, r); }).catch(function (e) { toast(e.message); }); }; });
    });
  }

  // ------------------------------------------------------------- login
  function login(msg) {
    root.innerHTML = '<form class="login card" id="f"><div style="display:flex;gap:10px;align-items:center"><svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#F2B544"/><path d="M10 22c2-7 6-11 12-12-1 6-5 10-12 12z" fill="#123D22"/></svg><div><b>NCS Program Rewards</b><div class="muted">Admin portal NCS</div></div></div>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Email<input class="input" id="em" type="email" autocomplete="username"></label>' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Password<input class="input" id="pw" type="password" autocomplete="current-password"></label>' +
      (msg ? errBox(msg) : "") + '<div id="m"></div><button class="btn" type="submit">Masuk</button></form>';
    $("#f").onsubmit = function (e) {
      e.preventDefault(); var b = this.querySelector("button"); b.disabled = true;
      sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value }).then(function (r) {
        if (r.error) throw new Error(/invalid/i.test(r.error.message) ? "Email atau password salah." : r.error.message);
        return boot();
      }).catch(function (err) { b.disabled = false; $("#m").innerHTML = errBox(err.message); });
    };
  }
  function boot() {
    return rpc("admin_me").then(function (me) {
      if (!me) { return sb.auth.signOut().then(function () { login("Akun ini bukan staf NCS. Minta admin menambahkan Anda ke tabel staff."); }); }
      ME = me; return refreshBadges().catch(function () {}).then(route);
    });
  }
  function start() {
    root = document.getElementById("root");
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) { root.innerHTML = '<div class="login card">' + errBox("Admin portal memerlukan Supabase. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di config.js.") + "</div>"; return; }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "xem-admin-auth" } });
    sb.auth.getSession().then(function (r) { if (r.data.session) return boot().catch(function (e) { login(e.message); }); login(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
