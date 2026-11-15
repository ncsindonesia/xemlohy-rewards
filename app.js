/* Xemlohy Smart Rewards - member app (farmers and retailers)
   PT Neo Crop Solutions. Plain JavaScript, no build step.
   Talks to Supabase (see /supabase/*.sql); runs in DEMO mode when config.js has no Supabase URL. */
(function () {
  "use strict";
  var CFG = window.XEM_CONFIG || {};
  var DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
  var ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  var PROVINCES = ["Aceh","Sumatera Utara","Sumatera Barat","Riau","Kepulauan Riau","Jambi","Sumatera Selatan","Kepulauan Bangka Belitung",
    "Bengkulu","Lampung","DKI Jakarta","Jawa Barat","Banten","Jawa Tengah","DI Yogyakarta","Jawa Timur","Bali","Nusa Tenggara Barat",
    "Nusa Tenggara Timur","Kalimantan Barat","Kalimantan Tengah","Kalimantan Selatan","Kalimantan Timur","Kalimantan Utara","Sulawesi Utara",
    "Gorontalo","Sulawesi Tengah","Sulawesi Barat","Sulawesi Selatan","Sulawesi Tenggara","Maluku","Maluku Utara","Papua","Papua Barat",
    "Papua Barat Daya","Papua Tengah","Papua Pegunungan","Papua Selatan"];
  var CROPS = ["Cabai","Tomat","Bawang merah","Padi","Jagung","Buah-buahan","Sayuran lain","Lainnya"];

  // ------------------------------------------------------------------ utils
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString("id-ID"); }
  function dt(x, withTime) {
    if (!x) return "";
    var o = { day: "numeric", month: "short", year: "numeric" };
    if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
    return new Date(x).toLocaleDateString("id-ID", o);
  }
  function normPhone(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.indexOf("62") === 0) d = d.slice(2);
    if (d.charAt(0) === "0") d = d.slice(1);
    return d ? "62" + d : "";
  }
  function phoneOk(p) { return /^628[0-9]{7,12}$/.test(p); }
  function showPhone(p) { return p ? "0" + p.slice(2) : ""; }
  function pinOk(p) { return /^[0-9]{6}$/.test(p); }
  function pinWeak(p) { return /^(\d)\1{5}$/.test(p) || "0123456789".indexOf(p) >= 0 || "9876543210".indexOf(p) >= 0; }
  function normCode(v) { return String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, ""); }
  function codeOk(c) {
    if (!c || c.length !== 11) return false;
    for (var i = 0; i < 11; i++) if (ALPHA.indexOf(c.charAt(i)) < 0) return false;
    var s = 0; for (var j = 0; j < 10; j++) s += (j + 1) * ALPHA.indexOf(c.charAt(j));
    return ALPHA.charAt(s % 31) === c.charAt(10);
  }
  function prettyCode(c) { c = normCode(c); return c.length === 11 ? c.slice(0, 5) + "-" + c.slice(5, 10) + "-" + c.slice(10) : c; }
  function codeFromText(t) {
    var m = String(t || "").match(/\/(b|c)\/([0-9A-Za-z-]+)/);
    return { type: m ? m[1] : null, code: normCode(m ? m[2] : t) };
  }
  function store(kind) {
    return {
      get: function (k) { try { return JSON.parse(window[kind].getItem(k)); } catch (e) { return null; } },
      set: function (k, v) { try { window[kind].setItem(k, JSON.stringify(v)); } catch (e) {} },
      del: function (k) { try { window[kind].removeItem(k); } catch (e) {} }
    };
  }
  var local = store("localStorage"), sess = store("sessionStorage");
  var memo = {};
  function pendingCode(v) { if (v === undefined) return memo.pending || sess.get("xem-pending"); memo.pending = v; if (v) sess.set("xem-pending", v); else sess.del("xem-pending"); }
  function toast(msg, ms) {
    var t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function waLink(text) { return "https://wa.me/" + (CFG.WHATSAPP || "") + "?text=" + encodeURIComponent(text || "Halo NeoCare, saya butuh bantuan program Xemlohy Smart Rewards."); }
  function geo(timeout) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(function (p) { resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); },
        function () { resolve(null); }, { enableHighAccuracy: true, timeout: timeout || 8000, maximumAge: 60000 });
    });
  }
  function geoIfAllowed() {
    if (!navigator.permissions || !navigator.geolocation) return Promise.resolve(null);
    return navigator.permissions.query({ name: "geolocation" }).then(function (r) { return r.state === "granted" ? geo(3000) : null; }, function () { return null; });
  }

  // ------------------------------------------------------------------ icons
  var IC = {
    logo: '<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#F2B544"/><path d="M10 22c2-7 6-11 12-12-1 6-5 10-12 12z" fill="#123D22"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    scan: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>',
    gift: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z"/></svg>',
    clock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>',
    check: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#123D22" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    wa: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z"/></svg>',
    bottle: '<svg width="40" height="72" viewBox="0 0 44 80" role="img" aria-label="Botol Xemlohy"><rect x="15" y="2" width="14" height="10" rx="2" fill="#123D22"/><path d="M12 14h20l4 10v50a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V24z" fill="#1F6B3A"/><rect x="11" y="36" width="22" height="24" rx="3" fill="#F2B544"/></svg>',
    box: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#1F6B3A" stroke-width="1.6" stroke-linejoin="round" role="img" aria-label="Karton"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
    pulsa: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1F6B3A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    goods: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1F6B3A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z"/></svg>'
  };

  // ------------------------------------------------------------------ API (Supabase)
  var sb = null;
  function emailOf(phone) { return phone + "@" + (CFG.MEMBER_EMAIL_DOMAIN || "member.neocare.id"); }
  function authErr(e) {
    var m = (e && e.message) || String(e);
    if (/invalid login credentials/i.test(m)) return new Error("Nomor HP atau PIN salah.");
    if (/already registered|already been registered|user_already_exists/i.test(m)) return new Error("Nomor ini sudah terdaftar. Silakan masuk.");
    if (/rate limit|too many/i.test(m)) return new Error("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
    if (/email.*(invalid|not authorized)/i.test(m)) return new Error("Pendaftaran ditolak server (pengaturan email). Hubungi NeoCare.");
    if (/failed to fetch|network/i.test(m)) return new Error("Tidak ada koneksi internet. Coba lagi.");
    return new Error(m);
  }
  var Real = {
    init: function () {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "xem-auth" } });
      return Promise.resolve();
    },
    session: function () { return sb.auth.getSession().then(function (r) { return r.data.session; }); },
    signIn: function (phone, pin) { return sb.auth.signInWithPassword({ email: emailOf(phone), password: pin }).then(function (r) { if (r.error) throw authErr(r.error); }); },
    signUp: function (phone, pin) {
      return sb.auth.signUp({ email: emailOf(phone), password: pin }).then(function (r) {
        if (r.error) throw authErr(r.error);
        if (!r.data.session) throw new Error("Akun dibuat tetapi belum aktif. Admin perlu mematikan 'Confirm email' di Supabase.");
      });
    },
    signOut: function () { return sb.auth.signOut(); },
    rpc: function (fn, args) {
      return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw authErr(r.error); return r.data; });
    },
    checkCode: function (c) { return this.rpc("check_code", { p_code: c }); },
    claim: function (c, g) { return this.rpc("claim_code", { p_code: c, p_lat: g ? g.lat : null, p_lng: g ? g.lng : null }); },
    register: function (p) { return this.rpc("register_member", { p: p }); },
    summary: function () { return this.rpc("my_summary"); },
    history: function () { return this.rpc("my_history"); },
    rewards: function () {
      return sb.from("rewards").select("*").eq("active", true).order("sort").order("points").then(function (r) { if (r.error) throw authErr(r.error); return r.data; });
    },
    redeem: function (id, delivery, phone, address, note) {
      return this.rpc("request_redemption", { p_reward: id, p_delivery: delivery || null, p_pulsa_phone: phone || null, p_address: address || null, p_note: note || null });
    },
    retailers: function (regency) { return this.rpc("list_retailers", { p_regency: regency || null }); },
    report: function (d) {
      var self = this, up = Promise.resolve(null);
      if (d.file) {
        var path = new Date().toISOString().slice(0, 10) + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
        up = sb.storage.from("reports").upload(path, d.file, { contentType: "image/jpeg", upsert: false }).then(function (r) { return r.error ? null : path; });
      }
      return up.then(function (path) {
        return self.rpc("submit_report", { p_code: d.code || "", p_shop: d.shop || "", p_location: d.location || "", p_notes: d.notes || "",
          p_lat: d.lat || null, p_lng: d.lng || null, p_photo_path: path });
      });
    },
    changePin: function (phone, oldPin, newPin) {
      return this.signIn(phone, oldPin).then(function () {
        return sb.auth.updateUser({ password: newPin }).then(function (r) { if (r.error) throw authErr(r.error); });
      }, function () { throw new Error("PIN lama salah."); });
    }
  };

  // ------------------------------------------------------------------ API (demo, data stays on this phone)
  var Demo = (function () {
    var K = "xem-demo";
    function db() { return local.get(K) || memo.demo || { users: {}, used: {}, me: null, products: { 100: 10, 250: 25 } }; }
    function save(d) { memo.demo = d; local.set(K, d); }
    function me(d) { return d.me && d.users[d.me]; }
    function bal(u) {
      var a = 0, p = 0, now = Date.now();
      u.ledger.forEach(function (l) {
        if (l.status === "available" || (l.status === "pending" && new Date(l.available_at).getTime() <= now)) a += l.delta; else if (l.status !== "rejected") p += l.delta;
      });
      return { available: a, pending: p };
    }
    function product(c, type) {
      var size = ALPHA.indexOf(c.charAt(0)) % 2 ? 250 : 100;
      return { sku: "XEM-" + size, name: "Xemlohy", size_ml: size, type: type, points: type === "carton" ? 24 : (size === 250 ? 25 : 10), bottles_per_carton: 24 };
    }
    var REWARDS = [
      { id: 1, catalog: "farmer", name: "Pulsa", description: "Pulsa dikirim ke nomor HP Anda", points: 250, kind: "pulsa", stock: null },
      { id: 2, catalog: "farmer", name: "Topi Xemlohy", description: "Topi lapangan Xemlohy", points: 500, kind: "goods", stock: null },
      { id: 3, catalog: "farmer", name: "Kaos Polo", description: "Kaos polo Xemlohy", points: 1000, kind: "goods", stock: null },
      { id: 4, catalog: "farmer", name: "Sprayer", description: "Sprayer punggung", points: 5000, kind: "goods", stock: null }
    ];
    function wait(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 250); }); }
    return {
      init: function () { return Promise.resolve(); },
      session: function () { var d = db(); return Promise.resolve(d.me ? { user: { id: d.me, email: d.me + "@demo" } } : null); },
      signIn: function (phone, pin) { var d = db(); var u = d.users[phone]; if (!u || u.pin !== pin) return Promise.reject(new Error("Nomor HP atau PIN salah.")); d.me = phone; save(d); return wait(); },
      signUp: function (phone, pin) { var d = db(); if (d.users[phone]) return Promise.reject(new Error("Nomor ini sudah terdaftar. Silakan masuk.")); d.users[phone] = { pin: pin, member: null, ledger: [], redemptions: [] }; d.me = phone; save(d); return wait(); },
      signOut: function () { var d = db(); d.me = null; save(d); return wait(); },
      checkCode: function (c, type) {
        c = normCode(c); if (!codeOk(c)) return wait({ result: "typo" });
        var d = db(), u = d.used[c], t = type || "bottle";
        if (u) return wait({ result: "used", code: c, product: product(c, u.type), used_at: u.at, used_by: "0" + u.phone.slice(2, 5) + "-xxxx-" + u.phone.slice(-4), mine: u.phone === d.me });
        return wait({ result: "available", code: c, product: product(c, t) });
      },
      claim: function (c, g, type) {
        c = normCode(c); var d = db(), u = me(d);
        if (!u) return wait({ result: "login_required" });
        if (!codeOk(c)) return wait({ result: "typo" });
        var t = type || (u.member.type === "retailer" ? "carton" : "bottle");
        if (d.used[c]) return wait({ result: d.used[c].phone === d.me ? "already_yours" : "used", product: product(c, d.used[c].type), used_at: d.used[c].at });
        if ((t === "bottle") !== (u.member.type === "farmer")) return wait({ result: "wrong_type", code_type: t, product: product(c, t) });
        var p = product(c, t), st = "available", at = null, note = null;
        if (u.member.type === "retailer") { if (u.member.status === "pending") { st = "review"; note = "Menunggu verifikasi toko"; } else { st = "pending"; at = new Date(Date.now() + 14 * 864e5).toISOString(); } }
        d.used[c] = { phone: d.me, at: new Date().toISOString(), type: t };
        u.ledger.unshift({ created_at: new Date().toISOString(), delta: p.points, kind: "scan", status: st, available_at: at, ref: c, note: note, product: "Xemlohy " + p.size_ml + " ml" });
        save(d); var b = bal(u);
        return wait({ result: "credited", code: c, product: p, points: p.points, point_status: st, available_at: at, note: note, available: b.available, pending: b.pending });
      },
      register: function (p) {
        var d = db(), u = me(d); if (!u) return Promise.reject(new Error("Silakan masuk"));
        p.status = p.type === "retailer" ? "pending" : "active"; p.created_at = new Date().toISOString(); u.member = p;
        if (p.type === "farmer") u.ledger.push({ created_at: new Date().toISOString(), delta: 300, kind: "adjust", status: "available", note: "Bonus demo" });
        save(d); return wait({ result: "ok", status: p.status });
      },
      summary: function () {
        var d = db(), u = me(d); if (!u) return wait({ result: "login_required" }); if (!u.member) return wait({ result: "no_profile" });
        var b = bal(u), cat = REWARDS.filter(function (r) { return r.catalog === u.member.type; });
        var nx = cat.filter(function (r) { return r.points > b.available; }).sort(function (a, b2) { return a.points - b2.points; })[0];
        return wait({ result: "ok", member: Object.assign({ phone: d.me }, u.member), available: b.available, pending: b.pending,
          scans: u.ledger.filter(function (l) { return l.kind === "scan"; }).length,
          affordable: cat.filter(function (r) { return r.points <= b.available; }).length,
          next_reward: nx ? { name: nx.name, points: nx.points, missing: nx.points - b.available } : null, recent: u.ledger.slice(0, 5) });
      },
      history: function () { var u = me(db()); return wait({ ledger: u ? u.ledger : [], redemptions: u ? u.redemptions : [] }); },
      rewards: function () { return wait(REWARDS); },
      redeem: function (id, delivery, phone, address) {
        var d = db(), u = me(d), r = REWARDS.filter(function (x) { return x.id === id; })[0], b = bal(u);
        if (b.available < r.points) return wait({ result: "insufficient" });
        if (r.kind !== "pulsa" && (!delivery || !address)) return wait({ result: "address_required" });
        var rid = u.redemptions.length + 1;
        u.redemptions.unshift({ id: rid, created_at: new Date().toISOString(), reward_name: r.name, points: r.points, status: "requested", delivery: r.kind === "pulsa" ? "pulsa" : delivery });
        u.ledger.unshift({ created_at: new Date().toISOString(), delta: -r.points, kind: "redeem", status: "available", ref: "R" + rid, note: "Tukar " + r.name });
        save(d); return wait({ result: "ok", redemption_id: rid, available: bal(u).available });
      },
      retailers: function () { return wait([{ id: "demo-toko", shop_name: "Toko Tani Makmur (demo)", regency: "Garut" }]); },
      report: function () { return wait({ result: "ok" }); },
      changePin: function (phone, oldPin, newPin) { var d = db(), u = d.users[phone]; if (!u || u.pin !== oldPin) return Promise.reject(new Error("PIN lama salah.")); u.pin = newPin; save(d); return wait(); }
    };
  })();

  var API = DEMO ? Demo : Real;
  var S = { session: null, summary: null };   // app state

  function refreshMe() {
    return API.session().then(function (s) {
      S.session = s;
      if (!s) { S.summary = null; return null; }
      return API.summary().then(function (r) { S.summary = r && r.result === "ok" ? r : (r && r.result === "no_profile" ? { result: "no_profile" } : null); return S.summary; });
    });
  }
  function isMember() { return S.summary && S.summary.result === "ok"; }
  function mtype() { return isMember() ? S.summary.member.type : null; }

  // ------------------------------------------------------------------ layout
  var root, scanner = null;
  function header(opts) {
    opts = opts || {};
    var left = opts.back
      ? '<a class="back" href="' + esc(opts.back) + '" data-link aria-label="Kembali">' + IC.back + "</a><h1>" + esc(opts.title || "") + "</h1>"
      : '<a class="brand" href="' + (isMember() ? "/akun" : "/") + '" data-link>' + IC.logo + "<div><b>Xemlohy Smart Rewards</b><span>by Neo Crop Solutions</span></div></a>";
    var right = isMember() && !opts.back ? '<a class="icon-btn" href="/profil" data-link aria-label="Profil">' + IC.user + "</a>" : "";
    return (DEMO ? '<div class="demo-banner">MODE DEMO - data hanya tersimpan di HP ini</div>' : "") + '<header class="top">' + left + right + "</header>";
  }
  function nav(active) {
    if (!isMember()) return "";
    function a(href, ic, label, cls) { return '<a href="' + href + '" data-link class="' + (cls || "") + '"' + (active === href ? ' aria-current="page"' : "") + '><span class="ic">' + ic + "</span>" + label + "</a>"; }
    return '<nav class="nav" aria-label="Menu utama"><div class="nav-inner">' + a("/akun", IC.home, "Beranda") + a("/cek", IC.scan, "Scan", "scan-tab") +
      a("/hadiah", IC.gift, "Hadiah") + a("/riwayat", IC.clock, "Riwayat") + "</div></nav>";
  }
  function page(opts, body) {
    root.innerHTML = '<div class="app">' + header(opts) + '<main class="' + (isMember() && !opts.noNav ? "with-nav" : "") + '">' + body + "</main>" +
      (opts.footer ? '<footer class="foot">PT Neo Crop Solutions · Prosperity Through Efficient Agriculture</footer>' : "") + "</div>" + (opts.noNav ? "" : nav(opts.active));
    window.scrollTo(0, 0);
  }
  function loading(opts) { page(opts || {}, '<div class="spinner" role="status" aria-label="Memuat"></div>'); }
  function errorBox(msg) { return '<div class="err" role="alert">' + esc(msg) + "</div>"; }
  function sheet(html) {
    var back = document.createElement("div"); back.className = "sheet-back";
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="handle"></div>' + html + "</div>";
    back.addEventListener("click", function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
    return back;
  }

  // ------------------------------------------------------------------ router
  function go(path, replace) {
    if (replace) history.replaceState({}, "", path); else history.pushState({}, "", path);
    render();
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-link]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); go(a.getAttribute("href"));
  });
  window.addEventListener("popstate", render);

  var ROUTES = [
    [/^\/$/, viewHome], [/^\/(b|c)\/([^/]+)\/?$/, viewScanResult], [/^\/cek\/?$/, viewScan], [/^\/masuk\/?$/, viewLogin],
    [/^\/daftar\/?$/, viewRegister], [/^\/akun\/?$/, viewDashboard, true], [/^\/hadiah\/?$/, viewRewards], [/^\/riwayat\/?$/, viewHistory, true],
    [/^\/profil\/?$/, viewProfile, true], [/^\/lapor\/?$/, viewReport]
  ];
  function render() {
    stopScanner();
    $all(".sheet-back").forEach(function (x) { x.remove(); });
    var path = location.pathname.replace(/\/index\.html$|\/404\.html$/, "/") || "/";
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i][0]);
      if (m) {
        if (ROUTES[i][2] && !isMember()) { return go(S.session ? "/daftar" : "/masuk", true); }
        return ROUTES[i][1].apply(null, m.slice(1));
      }
    }
    go("/", true);
  }

  // ------------------------------------------------------------------ views
  function viewHome() {
    if (isMember()) return go("/akun", true);
    if (S.session && S.summary && S.summary.result === "no_profile") return go("/daftar", true);
    page({ footer: true },
      '<section class="hero"><h2>Scan botol Xemlohy, kumpulkan poin, tukar hadiah</h2>' +
      "<p>Setiap botol Xemlohy punya kode QR unik untuk cek keaslian produk dan mengumpulkan poin.</p>" +
      '<div class="stack"><a class="btn gold" href="/cek" data-link>' + IC.scan + " Scan / cek kode</a></div></section>" +
      '<section class="card"><h2>Cara ikut program</h2><ol class="steps">' +
      '<li><div class="num-dot">1</div><div><b>Scan</b><div class="muted">Scan kode QR pada label botol Xemlohy dengan kamera HP. Tidak perlu install aplikasi.</div></div></li>' +
      '<li><div class="num-dot">2</div><div><b>Dapat poin</b><div class="muted">Masuk dengan nomor HP dan PIN, kumpulkan poin, tukar dengan hadiah.</div></div></li></ol></section>' +
      '<section class="card"><div class="row between"><h2>Hadiah</h2><a href="/hadiah" data-link class="small">Lihat semua</a></div><div id="rw-prev" class="rewards"><div class="spinner"></div></div></section>' +
      '<section class="stack"><a class="btn" href="/masuk" data-link>Masuk</a><a class="btn ghost" href="/daftar" data-link>Daftar anggota baru</a></section>' +
      '<section class="card flat"><h3>Butuh bantuan?</h3><p class="muted">Hubungi tim NeoCare lewat WhatsApp.</p>' +
      '<a class="btn ghost" href="' + waLink() + '" rel="noopener">' + IC.wa + " Chat WhatsApp NeoCare</a>" +
      '<p class="small center" style="margin-top:12px"><a href="/lapor" data-link>Laporkan produk mencurigakan</a></p></section>');
    API.rewards().then(function (list) {
      var el = $("#rw-prev"); if (!el) return;
      el.innerHTML = list.filter(function (r) { return r.catalog === "farmer"; }).slice(0, 4).map(function (r) { return rewardCard(r, false, true); }).join("") || '<p class="muted">Segera diumumkan.</p>';
    }).catch(function () { var el = $("#rw-prev"); if (el) el.innerHTML = '<p class="muted">Tidak dapat memuat hadiah.</p>'; });
  }

  function productBlock(p, code) {
    if (!p) return "";
    var isCarton = p.type === "carton";
    return '<div class="product"><div class="bottle">' + (isCarton ? IC.box : IC.bottle) + '</div><div><div style="font-size:20px;font-weight:800">' +
      esc(p.name) + " " + esc(p.size_ml) + " ml" + (isCarton ? " (karton)" : "") + '</div><div class="muted">Anti rontok bunga &amp; buah' +
      (isCarton ? " · isi " + esc(p.bottles_per_carton) + " botol" : "") + '</div><div class="muted small">Kode ' + esc(prettyCode(code)) + "</div></div></div>";
  }

  var STATUS = {
    available: ["ok", "Produk Asli Terverifikasi"],
    inactive: ["warn", "Produk asli - poin belum aktif"],
    used: ["bad", "Kode sudah digunakan"],
    already_yours: ["ok", "Kode ini sudah Anda klaim"],
    void: ["bad", "Kode tidak berlaku"],
    not_found: ["bad", "Kode tidak terdaftar"],
    typo: ["bad", "Kode tidak valid"],
    blocked: ["bad", "Terlalu banyak percobaan"],
    wrong_type: ["warn", "Kode untuk jenis anggota lain"],
    program_closed: ["warn", "Program poin belum dibuka"],
    member_blocked: ["bad", "Akun dibekukan"]
  };
  function statusText(r, isRetailerCode) {
    switch (r.result) {
      case "inactive": return "Produk ini asli dari Neo Crop Solutions, tetapi poin untuk batch ini belum diaktifkan. Simpan botol atau foto kodenya, lalu scan lagi nanti.";
      case "used": return "Kode ini sudah diklaim" + (r.used_at ? " pada " + dt(r.used_at, true) : "") + (r.used_by ? " oleh " + r.used_by : "") + ". Jika bukan Anda, laporkan ke NeoCare.";
      case "already_yours": return "Poin untuk kode ini sudah masuk ke akun Anda.";
      case "void": return "Kode ini dinonaktifkan oleh Neo Crop Solutions. Jangan gunakan produk ini dan hubungi NeoCare.";
      case "not_found": return "Kode ini tidak ada di sistem Neo Crop Solutions. Produk mungkin palsu. Jangan gunakan dan laporkan kepada kami.";
      case "typo": return "Periksa kembali kode di bawah QR. Kode terdiri dari 11 huruf/angka.";
      case "blocked": return "Terlalu banyak kode salah dari perangkat ini. Coba lagi dalam 1 jam.";
      case "wrong_type": return isRetailerCode ? "Ini kode karton untuk Mitra Retailer. Petani scan kode QR pada botol." : "Ini kode botol untuk petani. Retailer scan kode QR pada karton.";
      case "program_closed": return "Produk asli. Program poin belum dibuka - simpan kodenya dan scan lagi saat program dibuka.";
      case "member_blocked": return "Akun Anda sedang dibekukan. Hubungi NeoCare untuk bantuan.";
      default: return "";
    }
  }
  function statusCard(r) {
    var s = STATUS[r.result] || ["bad", "Terjadi kesalahan"];
    var bad = s[0] === "bad";
    return '<section class="card status-card ' + (s[0] === "ok" ? "" : s[0]) + '"><span class="pill ' + s[0] + '">' + (bad ? IC.warn : IC.shield) + " " + esc(s[1]) + "</span>" +
      '<p style="margin-top:10px">' + esc(statusText(r, r.product && r.product.type === "carton" || r.code_type === "carton")) + "</p>" +
      (r.result === "not_found" || r.result === "used" || r.result === "void"
        ? '<div class="stack"><a class="btn danger" href="/lapor?kode=' + encodeURIComponent(r.code || "") + '" data-link>Laporkan produk</a><a class="btn ghost" href="' +
          waLink("Halo NeoCare, saya scan kode " + prettyCode(r.code || "") + " dan muncul: " + s[1]) + '" rel="noopener">' + IC.wa + " Hubungi NeoCare</a></div>" : "") +
      (r.result === "typo" ? '<a class="btn ghost" href="/cek" data-link>Ketik ulang kode</a>' : "") + "</section>";
  }

  function viewScanResult(t, rawCode) {
    var code = normCode(decodeURIComponent(rawCode));
    var type = t === "c" ? "carton" : "bottle";
    loading({ back: isMember() ? "/akun" : "/", title: "Hasil scan" });
    if (isMember()) {
      geoIfAllowed().then(function (g) { return API.claim(code, g, type); }).then(function (r) {
        pendingCode(null);
        if (r.result === "credited") return showCredited(r);
        page({ back: "/akun", title: "Hasil scan", active: "/cek" },
          '<section class="card">' + productBlock(r.product, code) + "</section>" + statusCard(Object.assign({ code: code }, r)) +
          '<a class="btn" href="/cek" data-link>' + IC.scan + " Scan kode lain</a>");
      }).catch(function (e) { page({ back: "/akun", title: "Hasil scan" }, errorBox(e.message) + '<a class="btn" href="' + location.pathname + '" data-link>Coba lagi</a>'); });
      return;
    }
    API.checkCode(code, type).then(function (r) {
      var html = r.product ? '<section class="card">' + productBlock(r.product, code) + "</section>" : "";
      if (r.result === "available") {
        pendingCode({ code: code, type: type });
        html += '<section class="card"><span class="pill ok">' + IC.shield + " Produk Asli Terverifikasi</span>" +
          '<div class="ptsbox" style="margin-top:12px"><span>Nilai ' + (type === "carton" ? "karton" : "botol") + " ini</span><b>+" + num(r.product.points) + " poin</b></div>" +
          '<p class="muted" style="margin-top:12px">Masuk atau daftar untuk mengklaim poin. Kode ini disimpan dan otomatis diklaim setelah Anda masuk.</p>' +
          '<div class="stack"><a class="btn" href="/masuk" data-link>Masuk &amp; klaim poin</a><a class="btn ghost" href="/daftar" data-link>Daftar anggota baru</a></div></section>';
      } else html += statusCard(Object.assign({ code: code }, r));
      page({ back: "/", title: "Hasil scan" }, html);
    }).catch(function (e) { page({ back: "/", title: "Hasil scan" }, errorBox(e.message) + '<a class="btn" href="' + location.pathname + '" data-link>Coba lagi</a>'); });
  }

  function showCredited(r) {
    var held = r.point_status !== "available";
    var line = r.point_status === "pending" ? "Poin aktif pada " + dt(r.available_at) + " (masa tunggu karton)."
      : r.point_status === "review" ? (r.note || "Poin menunggu pemeriksaan tim NCS.") : "Poin sudah bisa dipakai.";
    page({ back: "/akun", title: "Poin masuk", active: "/cek" },
      '<section class="success"><div class="tick">' + IC.check + "</div><p>" + esc(r.product.name + " " + r.product.size_ml + " ml" + (r.product.type === "carton" ? " (karton)" : "")) + "</p>" +
      '<div class="big">+' + num(r.points) + "</div><p><b>poin" + (held ? " (tertahan)" : "") + "</b></p><p>" + esc(line) + "</p></section>" +
      '<section class="card"><div class="row between"><span class="muted">Saldo bisa dipakai</span><b style="font-size:24px">' + num(r.available) + "</b></div>" +
      (r.pending ? '<div class="row between"><span class="muted">Poin tertahan</span><b>' + num(r.pending) + "</b></div>" : "") + "</section>" +
      '<div class="stack"><a class="btn gold" href="/cek" data-link>' + IC.scan + (r.product.type === "carton" ? " Scan karton lain" : " Scan botol lain") + '</a><a class="btn ghost" href="/hadiah" data-link>Lihat hadiah</a></div>');
    refreshMe();
  }

  // ---- scanner / manual entry
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if ($('script[src="' + src + '"]')) return res();
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Gagal memuat pemindai")); };
      document.head.appendChild(s);
    });
  }
  function stopScanner() {
    if (scanner) { var s = scanner; scanner = null; try { s.stop().then(function () { s.clear(); }).catch(function () {}); } catch (e) {} }
  }
  function viewScan() {
    var member = isMember();
    page({ back: member ? "/akun" : "/", title: member ? "Scan & klaim poin" : "Cek kode", active: "/cek" },
      '<section class="card"><div id="reader"></div><p class="muted small center" id="scan-hint" style="margin-top:10px">Arahkan kamera ke kode QR pada ' +
      (mtype() === "retailer" ? "karton" : "label botol") + ".</p>" +
      '<button class="btn" id="cam-btn" type="button">' + IC.scan + " Buka kamera</button></section>" +
      (member ? '<section id="log-wrap" class="hidden"><div class="row between"><h3>Sesi ini</h3><b id="log-total">+0 poin</b></div><ul class="list scan-log" id="log"></ul></section>' : "") +
      '<section class="card"><form id="manual" class="stack" novalidate><label class="lbl" for="code-in">Atau ketik kode di bawah QR</label>' +
      '<input id="code-in" class="input code-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-X" maxlength="15">' +
      '<div id="code-err"></div><button class="btn ghost" type="submit">' + (member ? "Klaim kode" : "Cek kode") + "</button></form></section>");
    var input = $("#code-in");
    input.addEventListener("input", function () { var c = normCode(input.value).slice(0, 11); var p = c.slice(0, 5) + (c.length > 5 ? "-" + c.slice(5, 10) : "") + (c.length > 10 ? "-" + c.slice(10) : ""); input.value = p; });
    $("#manual").addEventListener("submit", function (e) {
      e.preventDefault(); var c = normCode(input.value);
      if (!codeOk(c)) { $("#code-err").innerHTML = errorBox("Kode tidak valid. Periksa kembali 11 huruf/angka di bawah QR."); return; }
      go("/" + (mtype() === "retailer" ? "c" : "b") + "/" + c);
    });
    var total = 0, recent = {};
    function onCode(text) {
      var x = codeFromText(text); if (!x.code || recent[x.code] && Date.now() - recent[x.code] < 4000) return;
      recent[x.code] = Date.now();
      if (!codeOk(x.code)) { toast("Kode tidak valid"); return; }
      if (!member) { stopScanner(); return go("/" + (x.type || "b") + "/" + x.code); }
      if (navigator.vibrate) navigator.vibrate(60);
      var li = document.createElement("li"); li.innerHTML = '<div><div class="t">' + esc(prettyCode(x.code)) + '</div><div class="s">Memproses...</div></div>';
      $("#log-wrap").classList.remove("hidden"); $("#log").prepend(li);
      geoIfAllowed().then(function (g) { return API.claim(x.code, g, x.type === "c" ? "carton" : "bottle"); }).then(function (r) {
        if (r.result === "credited") {
          total += r.points; $("#log-total").textContent = "+" + num(total) + " poin";
          li.innerHTML = '<div><div class="t">' + esc(r.product.name + " " + r.product.size_ml + " ml") + '</div><div class="s">' + esc(prettyCode(x.code)) +
            (r.point_status !== "available" ? " · tertahan" : "") + '</div></div><span class="delta ' + (r.point_status === "available" ? "plus" : "held") + '">+' + num(r.points) + "</span>";
        } else {
          var s = STATUS[r.result] || ["bad", r.result];
          li.innerHTML = '<div><div class="t">' + esc(prettyCode(x.code)) + '</div><div class="s">' + esc(s[1]) + '</div></div><a class="small" href="/' + (x.type || "b") + "/" + x.code + '" data-link>Detail</a>';
        }
        refreshMe();
      }).catch(function (e) { li.querySelector(".s").textContent = e.message; });
    }
    $("#cam-btn").addEventListener("click", function () {
      var btn = this; btn.disabled = true; btn.textContent = "Membuka kamera...";
      loadScript("/vendor/html5-qrcode-2.3.8.min.js").then(function () {
        var s = new window.Html5Qrcode("reader", { verbose: false });
        return s.start({ facingMode: "environment" }, { fps: 10, qrbox: function (w, h) { var m = Math.floor(Math.min(w, h) * 0.75); return { width: m, height: m }; } }, onCode, function () {})
          .then(function () { scanner = s; btn.classList.add("hidden"); $("#scan-hint").textContent = member ? "Kamera aktif. Scan beberapa kode berturut-turut." : "Kamera aktif."; });
      }).catch(function (e) {
        btn.disabled = false; btn.innerHTML = IC.scan + " Buka kamera";
        $("#scan-hint").innerHTML = '<span style="color:#A3261B">Kamera tidak bisa dibuka (' + esc(e && e.message || e) + "). Izinkan akses kamera, atau ketik kode di bawah.</span>";
      });
    });
  }

  // ---- login / register
  function phoneField(id, val) {
    return '<div class="field"><label class="lbl" for="' + id + '">Nomor HP (WhatsApp)</label><div class="phone-wrap"><span>+62</span><input id="' + id +
      '" type="tel" inputmode="numeric" autocomplete="tel" placeholder="812 3456 7890" value="' + esc(val || "") + '"></div></div>';
  }
  function pinField(id, label, auto) {
    return '<div class="field"><label class="lbl" for="' + id + '">' + esc(label) + '</label><input id="' + id + '" class="input pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="' +
      (auto || "current-password") + '" placeholder="••••••"></div>';
  }
  function afterAuth() {
    return refreshMe().then(function () {
      if (!isMember()) return go("/daftar", true);
      var p = pendingCode();
      if (p && p.code) { pendingCode(null); return go("/" + (p.type === "carton" ? "c" : "b") + "/" + p.code, true); }
      go("/akun", true);
    });
  }
  function viewLogin() {
    if (isMember()) return go("/akun", true);
    var p = pendingCode();
    page({ back: "/", title: "Masuk", noNav: true },
      (p ? '<div class="ok-msg">Kode ' + esc(prettyCode(p.code)) + " akan diklaim setelah Anda masuk.</div>" : "") +
      '<form id="f" class="card stack" novalidate><h2>Masuk ke akun Anda</h2>' + phoneField("ph") + pinField("pin", "PIN (6 angka)") +
      '<div id="msg"></div><button class="btn" type="submit">Masuk</button>' +
      '<p class="small center">Lupa PIN? <a href="' + waLink("Halo NeoCare, saya lupa PIN akun Xemlohy Smart Rewards.") + '" rel="noopener">Hubungi NeoCare</a></p></form>' +
      '<p class="center muted">Belum punya akun? <a href="/daftar" data-link>Daftar di sini</a></p>');
    $("#f").addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = normPhone($("#ph").value), pin = $("#pin").value, btn = this.querySelector("button");
      if (!phoneOk(phone)) return ($("#msg").innerHTML = errorBox("Nomor HP tidak valid. Contoh: 0812 3456 7890"));
      if (!pinOk(pin)) return ($("#msg").innerHTML = errorBox("PIN harus 6 angka."));
      btn.disabled = true; btn.textContent = "Memproses...";
      API.signIn(phone, pin).then(afterAuth).catch(function (err) { btn.disabled = false; btn.textContent = "Masuk"; $("#msg").innerHTML = errorBox(err.message); });
    });
  }

  function viewRegister() {
    if (isMember()) return go("/akun", true);
    if (S.session && S.summary && S.summary.result === "no_profile") return registerProfile();
    page({ back: "/", title: "Daftar", noNav: true },
      '<form id="f" class="card stack" novalidate><h2>Daftar anggota</h2><p class="muted">Langkah 1 dari 2: buat akun dengan nomor HP dan PIN.</p>' +
      phoneField("ph") + pinField("pin", "Buat PIN (6 angka)", "new-password") + pinField("pin2", "Ulangi PIN", "new-password") +
      '<p class="small muted">PIN dipakai setiap kali masuk. Jangan beri tahu PIN kepada siapa pun, termasuk petugas.</p>' +
      '<div id="msg"></div><button class="btn" type="submit">Lanjut</button></form>' +
      '<p class="center muted">Sudah punya akun? <a href="/masuk" data-link>Masuk</a></p>');
    $("#f").addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = normPhone($("#ph").value), pin = $("#pin").value, pin2 = $("#pin2").value, btn = this.querySelector("button");
      var msg = !phoneOk(phone) ? "Nomor HP tidak valid. Contoh: 0812 3456 7890" : !pinOk(pin) ? "PIN harus 6 angka." :
        pinWeak(pin) ? "PIN terlalu mudah ditebak. Hindari 123456 atau angka yang sama semua." : pin !== pin2 ? "Ulangi PIN tidak sama." : "";
      if (msg) return ($("#msg").innerHTML = errorBox(msg));
      btn.disabled = true; btn.textContent = "Memproses...";
      memo.regPhone = phone;
      API.signUp(phone, pin).then(function () { return refreshMe(); }).then(registerProfile).catch(function (err) {
        btn.disabled = false; btn.textContent = "Lanjut";
        $("#msg").innerHTML = errorBox(err.message) + (/terdaftar/.test(err.message) ? '<a class="btn ghost" style="margin-top:8px" href="/masuk" data-link>Masuk</a>' : "");
      });
    });
  }

  function registerProfile() {
    var type = memo.regType || "farmer", crop = "", loc = null;
    function draw() {
      page({ title: "Daftar", back: null, noNav: true },
        '<form id="f" class="stack" novalidate><section class="card stack"><h2>Langkah 2 dari 2: data anggota</h2>' +
        '<div class="seg" role="group" aria-label="Jenis anggota"><button type="button" data-type="farmer" aria-pressed="' + (type === "farmer") + '">Petani<small>Scan botol</small></button>' +
        '<button type="button" data-type="retailer" aria-pressed="' + (type === "retailer") + '">Retailer / Toko<small>Scan karton</small></button></div>' +
        (type === "farmer"
          ? field("name", "Nama lengkap") + provinceField() + field("regency", "Kabupaten / Kota") + field("district", "Kecamatan", true) +
            '<div class="field"><span class="lbl">Tanaman utama</span><div class="chips" role="group" aria-label="Tanaman utama">' +
            CROPS.map(function (c) { return '<button type="button" class="chip" data-crop="' + esc(c) + '" aria-pressed="' + (crop === c) + '">' + esc(c) + "</button>"; }).join("") + "</div></div>" +
            field("land", "Luas lahan (hektar)", true, "decimal") +
            '<div class="field"><label class="lbl" for="toko">Beli Xemlohy di toko mana? <span class="opt">(opsional)</span></label><select id="toko" class="input"><option value="">Tidak tahu / lewati</option></select></div>'
          : field("owner", "Nama pemilik") + field("shop", "Nama toko") + field("address", "Alamat toko") + provinceField() + field("regency", "Kabupaten / Kota") +
            field("district", "Kecamatan", true) + field("distributor", "Beli dari distributor") +
            '<div class="field"><span class="lbl">Lokasi toko <span class="opt">(disarankan)</span></span><button type="button" class="btn ghost" id="gps">Ambil lokasi toko sekarang</button><div id="gps-msg" class="small muted"></div></div>' +
            '<div class="ok-msg">Akun toko diverifikasi oleh tim NCS terlebih dahulu. Karton yang di-scan sebelum verifikasi tetap dicatat.</div>') +
        '<label class="check"><input type="checkbox" id="consent"><span>Saya berusia 17 tahun ke atas dan menyetujui <a href="' + waLink("Halo NeoCare, saya ingin membaca Syarat Program dan Kebijakan Privasi Xemlohy Smart Rewards.") + '" rel="noopener">Syarat Program &amp; Kebijakan Privasi</a>. Data saya dipakai NCS untuk program ini.</span></label>' +
        '<div id="msg"></div><button class="btn" type="submit">Simpan &amp; selesai</button></section></form>');
      $all("[data-type]").forEach(function (b) { b.addEventListener("click", function () { save(); type = memo.regType = b.getAttribute("data-type"); draw(); }); });
      $all("[data-crop]").forEach(function (b) { b.addEventListener("click", function () { crop = b.getAttribute("data-crop"); $all("[data-crop]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); }); });
      restore();
      var reg = $("#regency");
      if (type === "farmer" && reg) {
        var loadShops = function () {
          API.retailers(reg.value).then(function (list) {
            var sel = $("#toko"); if (!sel) return; var cur = sel.value;
            sel.innerHTML = '<option value="">Tidak tahu / lewati</option>' + list.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.shop_name + (r.regency ? " - " + r.regency : "")) + "</option>"; }).join("");
            sel.value = cur;
          }).catch(function () {});
        };
        reg.addEventListener("change", loadShops); loadShops();
      }
      var gps = $("#gps");
      if (gps) gps.addEventListener("click", function () {
        $("#gps-msg").textContent = "Mencari lokasi...";
        geo(10000).then(function (g) { loc = g; $("#gps-msg").textContent = g ? "Lokasi tersimpan (" + g.lat + ", " + g.lng + ")" : "Lokasi tidak didapat. Izinkan akses lokasi lalu coba lagi."; });
      });
      $("#f").addEventListener("submit", submit);
    }
    function field(id, label, opt, mode) {
      return '<div class="field"><label class="lbl" for="' + id + '">' + esc(label) + (opt ? ' <span class="opt">(opsional)</span>' : "") + '</label><input id="' + id + '" class="input"' +
        (mode ? ' inputmode="' + mode + '"' : "") + ' autocomplete="off"></div>';
    }
    function provinceField() {
      return '<div class="field"><label class="lbl" for="prov">Provinsi</label><select id="prov" class="input"><option value="">Pilih provinsi</option>' +
        PROVINCES.map(function (p) { return "<option>" + esc(p) + "</option>"; }).join("") + "</select></div>";
    }
    var keep = {};
    function save() { $all("#f input.input, #f select").forEach(function (el) { keep[el.id] = el.value; }); }
    function restore() { Object.keys(keep).forEach(function (k) { var el = document.getElementById(k); if (el) el.value = keep[k]; }); }
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
    function submit(e) {
      e.preventDefault();
      var btn = $("#f button[type=submit]");
      var phone = S.session && S.session.user && S.session.user.email ? S.session.user.email.split("@")[0] : (memo.regPhone || "");
      var p = { type: type, phone: phone, province: val("prov"), regency: val("regency"), district: val("district"), consent: $("#consent").checked };
      var need;
      if (type === "farmer") {
        p.name = val("name"); p.crop = crop; p.land_ha = val("land").replace(",", "."); p.bought_from = val("toko");
        need = !p.name ? "Nama wajib diisi." : !p.province ? "Pilih provinsi." : !p.regency ? "Kabupaten/Kota wajib diisi." : "";
      } else {
        p.owner_name = val("owner"); p.name = p.owner_name; p.shop_name = val("shop"); p.address = val("address"); p.distributor = val("distributor");
        if (loc) { p.lat = loc.lat; p.lng = loc.lng; }
        need = !p.owner_name ? "Nama pemilik wajib diisi." : !p.shop_name ? "Nama toko wajib diisi." : !p.address ? "Alamat toko wajib diisi." :
          !p.province ? "Pilih provinsi." : !p.regency ? "Kabupaten/Kota wajib diisi." : "";
      }
      if (!need && !p.consent) need = "Centang persetujuan untuk melanjutkan.";
      if (need) { $("#msg").innerHTML = errorBox(need); return; }
      btn.disabled = true; btn.textContent = "Menyimpan...";
      API.register(p).then(function () { toast(type === "retailer" ? "Pendaftaran toko terkirim. Menunggu verifikasi." : "Selamat bergabung!"); return afterAuth(); })
        .catch(function (err) { btn.disabled = false; btn.textContent = "Simpan & selesai"; $("#msg").innerHTML = errorBox(err.message); });
    }
    draw();
  }

  // ---- dashboard
  function ledgerRow(l) {
    var label = l.kind === "scan" ? "Scan " + (l.product || "Xemlohy") : l.kind === "redeem" ? (l.note || "Tukar hadiah") :
      l.kind === "refund" ? "Poin dikembalikan" : l.kind === "adjust" ? (l.note || "Penyesuaian poin") : l.kind;
    var held = l.status === "review" || (l.status === "pending" && new Date(l.available_at) > new Date());
    var sub = dt(l.created_at, true) + (l.status === "rejected" ? " · ditolak" : l.status === "review" ? " · diperiksa" : held ? " · aktif " + dt(l.available_at) : "");
    var cls = l.status === "rejected" ? "minus" : held ? "held" : l.delta < 0 ? "minus" : "plus";
    return '<li><div><div class="t">' + esc(label) + '</div><div class="s">' + esc(sub) + "</div></div>" +
      '<span class="delta ' + cls + '"' + (l.status === "rejected" ? ' style="text-decoration:line-through"' : "") + ">" + (l.delta > 0 ? "+" : "") + num(l.delta) + "</span></li>";
  }
  function viewDashboard() {
    var s = S.summary, m = s.member, nx = s.next_reward;
    var pct = nx ? Math.max(4, Math.min(100, Math.round(100 * s.available / nx.points))) : 100;
    var banner = m.status === "pending" ? '<div class="card status-card warn"><b>Toko menunggu verifikasi</b><p class="small">Tim NCS akan menghubungi atau mengunjungi toko Anda. Karton yang di-scan tetap dicatat, poin aktif setelah verifikasi.</p></div>'
      : m.status === "rejected" || m.status === "blocked" ? '<div class="card status-card bad"><b>Akun tidak aktif</b><p class="small">Hubungi NeoCare untuk bantuan.</p></div>' : "";
    page({ active: "/akun" },
      banner + '<section class="balance"><div class="row between"><div><div class="lbl2">Halo,</div><div style="font-weight:800;font-size:18px">' + esc(m.type === "retailer" && m.shop_name ? m.shop_name : m.name) +
      '</div></div><span class="pill warn">' + (m.type === "retailer" ? "Mitra Retailer" : "Petani") + "</span></div>" +
      '<div><div class="lbl2">Poin bisa dipakai</div><div class="num">' + num(s.available) + '</div><div class="sub">' + num(s.scans) + (m.type === "retailer" ? " karton" : " botol") + " di-scan" +
      (s.pending ? " · " + num(s.pending) + " poin tertahan" : "") + "</div></div>" +
      '<a class="btn gold" href="/cek" data-link>' + IC.scan + (m.type === "retailer" ? " Scan karton" : " Scan botol") + "</a></section>" +
      '<a class="card" href="/hadiah" data-link style="text-decoration:none;color:inherit;display:block">' +
      (nx ? '<div class="row between small"><b>Menuju ' + esc(nx.name) + " (" + num(nx.points) + ' poin)</b><span class="muted">' + num(nx.missing) + " lagi</span></div>" +
        '<div class="progress" style="margin-top:8px" role="img" aria-label="' + num(s.available) + " dari " + num(nx.points) + ' poin"><div style="width:' + pct + '%"></div></div>'
        : '<b class="small">' + (s.affordable ? "Semua hadiah bisa ditukar" : "Katalog hadiah") + "</b>") +
      (s.affordable ? '<p class="small" style="margin:8px 0 0;color:#1F6B3A;font-weight:700">' + num(s.affordable) + " hadiah sudah bisa ditukar ›</p>" : "") + "</a>" +
      '<div class="row between"><h3 style="margin:0">Aktivitas terakhir</h3><a class="small" href="/riwayat" data-link>Lihat semua</a></div>' +
      (s.recent && s.recent.length ? '<ul class="list">' + s.recent.map(ledgerRow).join("") + "</ul>" : '<div class="card empty">Belum ada aktivitas. Scan ' + (m.type === "retailer" ? "karton" : "botol") + " Xemlohy pertama Anda.</div>"));
  }

  // ---- rewards
  function rewardCard(r, canRedeem, preview, available) {
    var can = canRedeem && available >= r.points && (r.stock == null || r.stock > 0);
    var miss = r.points - (available || 0);
    return '<article class="reward' + (can ? " can" : "") + '"><div class="img">' + (r.image_url ? '<img src="' + esc(r.image_url) + '" alt="">' : (r.kind === "pulsa" ? IC.pulsa : IC.goods)) + "</div>" +
      '<div class="name">' + esc(r.name) + '</div><div class="pts">' + num(r.points) + " poin" + (r.stock === 0 ? " · habis" : "") + "</div>" +
      (preview ? "" : canRedeem ? '<button class="btn' + (can ? "" : "") + '" data-redeem="' + r.id + '"' + (can ? "" : " disabled") + ">" + (can ? "Tukar" : r.stock === 0 ? "Stok habis" : "Kurang " + num(miss)) + "</button>" : "") + "</article>";
  }
  function viewRewards() {
    loading({ active: "/hadiah", back: isMember() ? null : "/", title: "Hadiah" });
    API.rewards().then(function (list) {
      var member = isMember(), cat = mtype() || "farmer", avail = member ? S.summary.available : 0;
      var items = list.filter(function (r) { return r.catalog === cat; });
      page({ active: "/hadiah", back: member ? null : "/", title: "Hadiah" },
        (member ? '<section class="card row between"><div><div class="muted small">Poin bisa dipakai</div><div style="font-size:28px;font-weight:800;color:#123D22">' + num(avail) + "</div></div>" +
          (S.summary.member.status !== "active" ? '<span class="pill warn">Akun belum aktif</span>' : "") + "</section>" : '<div class="ok-msg">Masuk untuk menukar poin dengan hadiah.</div>') +
        (items.length ? '<div class="rewards">' + items.map(function (r) { return rewardCard(r, member && S.summary.member.status === "active", false, avail); }).join("") + "</div>"
          : '<div class="card empty">Katalog hadiah ' + (cat === "retailer" ? "Mitra Retailer" : "") + " segera diumumkan tim NCS.</div>") +
        '<section class="card flat"><h3>Cara penukaran</h3><p class="muted small">Pulsa dikirim ke nomor HP Anda. Barang dikirim ke alamat atau diambil di toko pilihan. Permintaan diproses maksimal 3 hari kerja; statusnya bisa dilihat di Riwayat.</p></section>');
      $all("[data-redeem]").forEach(function (b) { b.addEventListener("click", function () { redeemSheet(items.filter(function (r) { return String(r.id) === b.getAttribute("data-redeem"); })[0]); }); });
    }).catch(function (e) { page({ active: "/hadiah", title: "Hadiah" }, errorBox(e.message)); });
  }
  function redeemSheet(r) {
    var pulsa = r.kind === "pulsa", m = S.summary.member;
    var sh = sheet('<h2>Tukar ' + esc(r.name) + "</h2><p class=\"muted\">" + num(r.points) + " poin akan dipotong dari saldo Anda (" + num(S.summary.available) + " poin).</p>" +
      (pulsa ? '<div class="field"><label class="lbl" for="rp">Kirim pulsa ke nomor</label><div class="phone-wrap"><span>+62</span><input id="rp" type="tel" inputmode="numeric" value="' + esc(showPhone(m.phone).slice(1)) + '"></div></div>'
        : '<div class="seg" role="group" aria-label="Cara terima"><button type="button" data-d="address" aria-pressed="true">Kirim ke alamat</button><button type="button" data-d="pickup" aria-pressed="false">Ambil di toko</button></div>' +
          '<div class="field"><label class="lbl" for="ra" id="ra-l">Alamat lengkap pengiriman</label><textarea id="ra" class="input" placeholder="Nama jalan, desa, kecamatan, kabupaten"></textarea></div>') +
      '<div class="field"><label class="lbl" for="rn">Catatan <span class="opt">(opsional)</span></label><input id="rn" class="input"></div>' +
      '<div id="rmsg"></div><button class="btn" id="rgo" type="button">Konfirmasi tukar</button><button class="btn ghost" id="rcancel" type="button">Batal</button>');
    var delivery = pulsa ? "pulsa" : "address";
    $all("[data-d]", sh).forEach(function (b) {
      b.addEventListener("click", function () {
        delivery = b.getAttribute("data-d"); $all("[data-d]", sh).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        $("#ra-l", sh).textContent = delivery === "pickup" ? "Nama toko dan desa tempat mengambil" : "Alamat lengkap pengiriman";
      });
    });
    $("#rcancel", sh).addEventListener("click", function () { sh.remove(); });
    $("#rgo", sh).addEventListener("click", function () {
      var btn = this, phone = pulsa ? normPhone($("#rp", sh).value) : null, addr = pulsa ? null : $("#ra", sh).value.trim();
      if (pulsa && !phoneOk(phone)) return ($("#rmsg", sh).innerHTML = errorBox("Nomor HP tidak valid."));
      if (!pulsa && !addr) return ($("#rmsg", sh).innerHTML = errorBox(delivery === "pickup" ? "Isi nama toko tempat mengambil." : "Isi alamat pengiriman."));
      btn.disabled = true; btn.textContent = "Memproses...";
      API.redeem(r.id, delivery, phone, addr, $("#rn", sh).value).then(function (res) {
        if (res.result !== "ok") {
          var msg = { insufficient: "Poin tidak cukup.", out_of_stock: "Stok hadiah habis.", member_not_active: "Akun belum aktif.", address_required: "Alamat wajib diisi.", reward_not_found: "Hadiah tidak tersedia." }[res.result] || res.result;
          btn.disabled = false; btn.textContent = "Konfirmasi tukar"; $("#rmsg", sh).innerHTML = errorBox(msg); return;
        }
        sh.remove(); toast("Permintaan penukaran terkirim");
        refreshMe().then(function () {
          page({ active: "/hadiah", title: "Penukaran terkirim", back: "/hadiah" },
            '<section class="success"><div class="tick">' + IC.check + "</div><h2 style=\"color:#fff\">Permintaan terkirim</h2><p>" + esc(r.name) + " · " + num(r.points) + " poin</p>" +
            "<p>Tim NCS memproses maksimal 3 hari kerja. Kabar status ada di menu Riwayat.</p></section>" +
            '<section class="card row between"><span class="muted">Sisa poin</span><b style="font-size:24px">' + num(res.available) + "</b></section>" +
            '<a class="btn ghost" href="/riwayat" data-link>Lihat riwayat penukaran</a>');
        });
      }).catch(function (e) { btn.disabled = false; btn.textContent = "Konfirmasi tukar"; $("#rmsg", sh).innerHTML = errorBox(e.message); });
    });
  }

  // ---- history
  var RSTAT = { requested: ["warn", "Diproses"], approved: ["ok", "Disetujui"], shipped: ["ok", "Dikirim"], completed: ["ok", "Selesai"], rejected: ["bad", "Ditolak"] };
  function viewHistory() {
    loading({ active: "/riwayat" });
    API.history().then(function (h) {
      var tab = memo.histTab || "ledger";
      function draw() {
        page({ active: "/riwayat" },
          '<div class="tabs" role="tablist"><button role="tab" data-tab="ledger" aria-selected="' + (tab === "ledger") + '">Poin</button><button role="tab" data-tab="red" aria-selected="' + (tab === "red") + '">Penukaran</button></div>' +
          (tab === "ledger"
            ? (h.ledger.length ? '<ul class="list">' + h.ledger.map(ledgerRow).join("") + "</ul>" : '<div class="card empty">Belum ada riwayat poin.</div>')
            : (h.redemptions.length ? '<ul class="list">' + h.redemptions.map(function (r) {
                var s = RSTAT[r.status] || ["warn", r.status];
                return '<li><div><div class="t">' + esc(r.reward_name) + '</div><div class="s">' + esc(dt(r.created_at, true)) + " · " + num(r.points) + " poin" +
                  (r.tracking ? " · Resi " + esc(r.tracking) : "") + (r.admin_note ? "<br>" + esc(r.admin_note) : "") + '</div></div><span class="pill ' + s[0] + '">' + s[1] + "</span></li>";
              }).join("") + "</ul>" : '<div class="card empty">Belum ada penukaran.</div>')));
        $all("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { tab = memo.histTab = b.getAttribute("data-tab"); draw(); }); });
      }
      draw();
    }).catch(function (e) { page({ active: "/riwayat" }, errorBox(e.message)); });
  }

  // ---- profile
  function viewProfile() {
    var m = S.summary.member;
    function row(k, v) { return v ? '<li><div><div class="s">' + esc(k) + '</div><div class="t">' + esc(v) + "</div></div></li>" : ""; }
    page({ back: "/akun", title: "Profil" },
      '<ul class="list">' + row("Nama", m.name) + row("Nama toko", m.shop_name) + row("Nomor HP", showPhone(m.phone)) + row("Jenis anggota", m.type === "retailer" ? "Mitra Retailer" : "Petani") +
      row("Status", { active: "Aktif", pending: "Menunggu verifikasi", blocked: "Dibekukan", rejected: "Ditolak" }[m.status]) + row("Wilayah", [m.regency, m.province].filter(Boolean).join(", ")) +
      row("Tanaman utama", m.crop) + row("Anggota sejak", dt(m.created_at)) + "</ul>" +
      '<div class="stack"><button class="btn ghost" id="chg">Ganti PIN</button><a class="btn ghost" href="' + waLink() + '" rel="noopener">' + IC.wa + ' Bantuan WhatsApp NeoCare</a>' +
      '<a class="btn ghost" href="/lapor" data-link>Laporkan produk mencurigakan</a><button class="btn danger" id="out">Keluar</button></div>' +
      '<p class="small muted center">Untuk mengubah data profil, hubungi NeoCare.</p>');
    $("#out").addEventListener("click", function () { API.signOut().then(function () { S.session = null; S.summary = null; go("/", true); }); });
    $("#chg").addEventListener("click", function () {
      var sh = sheet("<h2>Ganti PIN</h2>" + pinField("p0", "PIN lama") + pinField("p1", "PIN baru", "new-password") + pinField("p2", "Ulangi PIN baru", "new-password") +
        '<div id="pm"></div><button class="btn" id="pgo" type="button">Simpan PIN baru</button>');
      $("#pgo", sh).addEventListener("click", function () {
        var a = $("#p0", sh).value, b = $("#p1", sh).value, c = $("#p2", sh).value, btn = this;
        var msg = !pinOk(a) || !pinOk(b) ? "PIN harus 6 angka." : pinWeak(b) ? "PIN baru terlalu mudah ditebak." : b !== c ? "Ulangi PIN tidak sama." : "";
        if (msg) return ($("#pm", sh).innerHTML = errorBox(msg));
        btn.disabled = true;
        API.changePin(m.phone, a, b).then(function () { sh.remove(); toast("PIN berhasil diganti"); }).catch(function (e) { btn.disabled = false; $("#pm", sh).innerHTML = errorBox(e.message); });
      });
    });
  }

  // ---- counterfeit report
  function compress(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve(null);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1280, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.8);
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }
  function viewReport() {
    var q = new URLSearchParams(location.search), loc = null;
    page({ back: isMember() ? "/profil" : "/", title: "Laporkan produk", noNav: !isMember() },
      '<form id="f" class="card stack" novalidate><h2>Bantu kami melacak produk palsu</h2><p class="muted small">Laporan Anda dikirim ke tim Neo Crop Solutions.</p>' +
      '<div class="field"><label class="lbl" for="rc">Kode pada label <span class="opt">(jika ada)</span></label><input id="rc" class="input code-input" value="' + esc(prettyCode(q.get("kode") || "")) + '"></div>' +
      '<div class="field"><label class="lbl" for="photo">Foto botol &amp; label</label><input id="photo" type="file" accept="image/*" capture="environment" class="input" style="padding:12px"></div>' +
      '<div class="field"><label class="lbl" for="rs">Dibeli di toko</label><input id="rs" class="input" placeholder="Nama toko / kios"></div>' +
      '<div class="field"><label class="lbl" for="rl">Lokasi toko</label><input id="rl" class="input" placeholder="Desa, kecamatan, kabupaten"></div>' +
      '<button type="button" class="btn ghost" id="gps">Tambahkan lokasi saya</button><div id="gps-msg" class="small muted"></div>' +
      '<div class="field"><label class="lbl" for="rn">Keterangan <span class="opt">(opsional)</span></label><textarea id="rn" class="input" placeholder="Apa yang mencurigakan?"></textarea></div>' +
      '<div id="msg"></div><button class="btn danger" type="submit">Kirim laporan</button></form>');
    $("#gps").addEventListener("click", function () { $("#gps-msg").textContent = "Mencari lokasi..."; geo(10000).then(function (g) { loc = g; $("#gps-msg").textContent = g ? "Lokasi ditambahkan." : "Lokasi tidak didapat."; }); });
    $("#f").addEventListener("submit", function (e) {
      e.preventDefault(); var btn = this.querySelector("button[type=submit]");
      if (!$("#rs").value.trim() && !$("#photo").files[0] && !$("#rc").value.trim()) return ($("#msg").innerHTML = errorBox("Isi minimal kode, foto, atau nama toko."));
      btn.disabled = true; btn.textContent = "Mengirim...";
      compress($("#photo").files[0]).then(function (blob) {
        return API.report({ code: $("#rc").value, shop: $("#rs").value, location: $("#rl").value, notes: $("#rn").value, lat: loc && loc.lat, lng: loc && loc.lng, file: blob });
      }).then(function (r) {
        if (r.result !== "ok") throw new Error("Terlalu banyak laporan dari perangkat ini. Coba lagi nanti.");
        page({ back: "/", title: "Laporan terkirim", noNav: !isMember() }, '<section class="success"><div class="tick">' + IC.check + '</div><h2 style="color:#fff">Terima kasih</h2><p>Laporan Anda sudah kami terima dan akan diperiksa tim Neo Crop Solutions.</p></section>' +
          '<a class="btn ghost" href="' + (isMember() ? "/akun" : "/") + '" data-link>Kembali</a>');
      }).catch(function (err) { btn.disabled = false; btn.textContent = "Kirim laporan"; $("#msg").innerHTML = errorBox(err.message); });
    });
  }

  // ------------------------------------------------------------------ start
  function start() {
    root = document.getElementById("root");
    if (!DEMO && !window.supabase) { root.innerHTML = '<div class="app"><main>' + errorBox("Gagal memuat aplikasi. Periksa koneksi internet lalu muat ulang.") + "</main></div>"; return; }
    loading({});
    API.init().then(refreshMe).catch(function () {}).then(render);
    if (!DEMO) sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") { S.session = null; S.summary = null; } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
