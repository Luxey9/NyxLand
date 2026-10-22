/* NyxLand — Pengingat Waktu Sholat
 * Sumber blok yang di-inject ke akhir bundle renderer
 * (app/.vite/renderer/main_window/assets/index-*.js).
 * Butuh: m (react), o (jsx-runtime) di scope modul bundle,
 * plus blok injeksi lawas: __QP_NOTIFY__, __QP_NOTIF_CLOSE__, __QP_ROOT__.
 * IPC: salah:times (main process) — di-bridge lewat preload `salahTimes`.
 */
/* ===== NyxLand — Pengingat Waktu Sholat (injected block) =====
   Dipasang di akhir bundle renderer (.vite/renderer/main_window/assets/index-*.js).
   Butuh: m (react), o (jsx-runtime) — dua-duanya top-level var di bundle.
   Bergantung pada blok injeksi lawas: __QP_NOTIFY__, __QP_NOTIF_CLOSE__, __QP_ACTX__.
*/
;(function () {
  var R = m, h = R.createElement;
  var LS = window.localStorage;
  var ACCENT = "#2dd4bf";
  var MUTED = "rgba(255,255,255,0.55)";
  var PRAYERS = [["subuh", "Subuh"], ["dzuhur", "Dzuhur"], ["ashar", "Ashar"], ["maghrib", "Maghrib"], ["isya", "Isya"]];

  function pad(n) { return n < 10 ? "0" + n : "" + n }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isNaN(n) ? d : n }
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 }
  function toMin(t) { var mm = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); return mm ? (parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10)) : -1 }
  function log(msg) { try { if (window.electronAPI && window.electronAPI.logMessage) window.electronAPI.logMessage("info", "SALAH " + msg) } catch (e) { } }

  function readCfg() {
    return {
      on: LS.getItem("salah-enabled") !== "0",
      sound: LS.getItem("salah-sound") !== "0",
      pre: num(LS.getItem("salah-pre"), 10)
    };
  }
  function setCfgItem(k, v) { try { LS.setItem(k, String(v)) } catch (e) { } }
  function readSched() { try { var x = JSON.parse(LS.getItem("salah-cache") || "null"); return (x && x.times) ? x : null } catch (e) { return null } }
  function coords() { try { var c = JSON.parse(LS.getItem("location-coords") || "null"); if (c && typeof c.lat === "number" && typeof c.lon === "number") return c } catch (e) { } return null }
  function locLabel() {
    var a = LS.getItem("location-area") || "", c = LS.getItem("location") || "";
    var src = LS.getItem("location-source") === "gps" ? "GPS" : "";
    var co = coords();
    if (!a && co) a = co.lat.toFixed(2) + ", " + co.lon.toFixed(2);
    if (!a) a = c;
    a = String(a || "");
    var full = a || "\u2014";
    var seg = full.split(",").map(function (x) { return x.trim() }).filter(Boolean);
    var short = seg.length > 1 ? seg[0] : full;
    return { label: short, full: full, src: src };
  }
  function bumpAll() { try { window.dispatchEvent(new CustomEvent("qp-salah-changed")) } catch (e) { } }

  var fetching = false;
  function fetchSched(force) {
    if (fetching && !force) return;
    var api = window.electronAPI && window.electronAPI.salahTimes;
    if (!api) { log("no-bridge"); return }
    fetching = true;
    var c = coords(), city = LS.getItem("location") || "";
    api(c ? c.lat : null, c ? c.lon : null, city).then(function (r) {
      fetching = false;
      if (!r || !r.ok) {
        window.__QP_SALAH_ERR__ = (r && r.error) || "gagal";
        log("fetch-fail " + window.__QP_SALAH_ERR__);
        bumpAll(); return;
      }
      window.__QP_SALAH_ERR__ = "";
      try { LS.setItem("salah-cache", JSON.stringify({ ts: Date.now(), dateKey: todayKey(), times: r.times, method: r.method || "", tz: r.timezone || "", lat: r.lat, lon: r.lon })) } catch (e) { }
      log("ok subuh=" + r.times.subuh + " maghrib=" + r.times.maghrib);
      bumpAll();
    }).catch(function (x) { fetching = false; log("fetch-throw " + ((x && x.message) || x)) });
  }
  function ensureFresh() {
    var s = readSched();
    if (!s || s.dateKey !== todayKey() || (Date.now() - (s.ts || 0)) > 6 * 3600e3) fetchSched(true);
  }

  /* ---------- nada pengingat ---------- */
  window.__QP_SALAH_BEEP__ = function (kind) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!window.__QP_ACTX__) window.__QP_ACTX__ = new AC();
      var ctx = window.__QP_ACTX__; if (ctx.state === "suspended") ctx.resume();
      function tone(at, f, dur, gain, type) {
        var oo = ctx.createOscillator(), g = ctx.createGain();
        oo.type = type || "triangle"; oo.frequency.setValueAtTime(f, at);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(gain, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
        oo.connect(g); g.connect(ctx.destination); oo.start(at); oo.stop(at + dur + 0.03);
      }
      var t = ctx.currentTime + 0.03;
      if (kind === "time") {
        var mel = [523.25, 659.25, 783.99, 1046.5];
        for (var rep = 0; rep < 2; rep++) {
          var b = t + rep * 1.35;
          for (var i = 0; i < mel.length; i++) tone(b + i * 0.2, mel[i], 0.34, 0.2 - i * 0.015, "triangle");
          tone(b + 0.95, 392.0, 0.5, 0.12, "sine");
        }
      } else {
        for (var s = 0; s < 2; s++) { tone(t + s * 0.24, 659.25, 0.14, 0.13, "sine"); tone(t + s * 0.24 + 0.12, 783.99, 0.18, 0.11, "sine"); }
      }
    } catch (e) { }
  };

  /* ---------- tick pengingat ---------- */
  function readFired() { try { var x = JSON.parse(LS.getItem("salah-fired") || "null"); if (x && x.dateKey === todayKey() && x.fired) return x } catch (e) { } return { dateKey: todayKey(), fired: {} } }
  function notify(title, body, kind, key) {
    var cfg = readCfg();
    if (cfg.sound) { try { window.__QP_SALAH_BEEP__(kind) } catch (e) { } }
    try {
      if (window.__QP_NOTIFY__) {
        window.__QP_NOTIFY__({ id: "qp-salah-" + key + "-" + Date.now(), appName: "Sholat", title: title, body: body, priority: "high" });
        if (window.__QP_NOTIF_CLOSE__) {
          if (window.__QP_NOTCH_TIMER__) clearTimeout(window.__QP_NOTCH_TIMER__);
          window.__QP_NOTCH_TIMER__ = setTimeout(function () { try { window.__QP_NOTIF_CLOSE__() } catch (e) { } }, 12000);
        }
        log("fire " + kind + " " + key);
      }
    } catch (e) { }
  }
  window.__QP_SALAH_TICK__ = function () {
    var cfg = readCfg(); if (!cfg.on) return;
    var s = readSched(); if (!s || !s.times) return;
    var now = nowMin(), f = readFired(), dirty = false, lab = locLabel();
    for (var i = 0; i < PRAYERS.length; i++) {
      var k = PRAYERS[i][0], nm = PRAYERS[i][1], tv = s.times[k], mi = toMin(tv);
      if (mi < 0) continue;
      if (!f.fired[k] && now >= mi && now - mi < 10) {
        f.fired[k] = 1; dirty = true;
        notify("Waktu " + nm, tv + " \u00B7 " + lab.full, "time", k);
      }
      if (cfg.pre > 0) {
        var pk = k + ":pre";
        if (!f.fired[pk] && now >= mi - cfg.pre && now < mi) {
          f.fired[pk] = 1; dirty = true;
          notify(cfg.pre + " menit lagi " + nm, tv + " \u00B7 " + lab.full, "soon", pk);
        }
      }
    }
    if (dirty) { try { LS.setItem("salah-fired", JSON.stringify(f)) } catch (e) { } }
  };

  /* ---------- UI tab ---------- */
  function nextPrayer(s) {
    if (!s || !s.times) return null;
    var now = nowMin();
    for (var i = 0; i < PRAYERS.length; i++) {
      var mi = toMin(s.times[PRAYERS[i][0]]);
      if (mi >= 0 && mi > now) return { key: PRAYERS[i][0], name: PRAYERS[i][1], time: s.times[PRAYERS[i][0]], min: mi - now };
    }
    var m0 = toMin(s.times.subuh);
    return m0 >= 0 ? { key: "subuh", name: "Subuh", time: s.times.subuh, min: m0 + 1440 - now, tomorrow: true } : null;
  }
  function fmtLeft(min) {
    if (min <= 0) return "sekarang";
    var hh = Math.floor(min / 60), mm = Math.floor(min % 60);
    return (hh > 0 ? hh + "j " : "") + mm + "m";
  }
  function pillStyle(active, dim) {
    return {
      border: "1px solid " + (active ? "rgba(45,212,191,0.55)" : "rgba(255,255,255,0.14)"),
      background: active ? "rgba(45,212,191,0.18)" : "rgba(255,255,255,0.05)",
      color: active ? "#7ff0e0" : "rgba(255,255,255,0.72)",
      borderRadius: 7, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer",
      fontFamily: "OpenRunde, system-ui, sans-serif", opacity: dim ? 0.6 : 1, whiteSpace: "nowrap"
    };
  }
  function Btn(label, onClick, extra, key) {
    var st = pillStyle(false, false);
    for (var k in (extra || {})) st[k] = extra[k];
    return h("button", { key: key || label, type: "button", onClick: onClick, style: st }, label);
  }

  function QpSholatTab(props) {
    var P0 = (props && props.textColor) || "#ffffff";
    var st = m.useState(0), bump = st[1];
    var s2 = m.useState(readSched()), sched = s2[0], setSched = s2[1];
    var c2 = m.useState(readCfg()), cfg = c2[0], setCfg = c2[1];
    var b2 = m.useState(false), busy = b2[0], setBusy = b2[1];

    function rerender() { setSched(readSched()); setCfg(readCfg()); bump(function (x) { return x + 1 }) }

    m.useEffect(function () {
      rerender(); ensureFresh();
      var iv = setInterval(function () { try { window.__QP_SALAH_TICK__() } catch (e) { } rerender() }, 1000);
      var iv2 = setInterval(function () { ensureFresh() }, 10 * 60 * 1000);
      function onCh() { rerender() }
      window.addEventListener("qp-salah-changed", onCh);
      window.addEventListener("qp-location-changed", onCh);
      return function () {
        clearInterval(iv); clearInterval(iv2);
        window.removeEventListener("qp-salah-changed", onCh);
        window.removeEventListener("qp-location-changed", onCh);
      };
    }, []);

    function setPre(v) { setCfgItem("salah-pre", v); setCfg(readCfg()) }
    function toggleKey(k, cur) { setCfgItem(k, cur ? "0" : "1"); setCfg(readCfg()) }
    function useGPS() {
      setBusy(true);
      var api = window.electronAPI;
      var p = (api && api.locateCity) ? api.locateCity() : Promise.resolve({ ok: false, error: "IPC tidak tersedia" });
      p.then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || "gagal ambil GPS");
        return api.reverseCity(r.lat, r.lon).then(function (v) { return { fix: r, rev: v || {} } });
      }).then(function (x) {
        if (x.rev && x.rev.ok && x.rev.label) setCfgItem("location", x.rev.label);
        setCfgItem("location-source", "gps");
        setCfgItem("location-coords", JSON.stringify({ lat: x.fix.lat, lon: x.fix.lon, accuracy: x.fix.accuracy }));
        bumpAll(); fetchSched(true); setBusy(false);
      }).catch(function () { setBusy(false) });
    }

    var s = sched || readSched();
    var nx = nextPrayer(s);
    var lab = locLabel();
    var errv = window.__QP_SALAH_ERR__ || "";
    var now = nowMin();
    var blocks = [];

    if (!s) {
      blocks.push(h("div", { key: "empty", style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: MUTED, lineHeight: 1.5 } }, [
        h("div", { key: "a", style: { fontSize: 14, fontWeight: 800, color: P0 } }, "Jadwal sholat belum tersedia"),
        h("div", { key: "b" }, errv ? ("Sumber jadwal: " + errv) : "Menyiapkan jadwal\u2026 (butuh internet + lokasi)"),
        h("div", { key: "c", style: { display: "flex", gap: 6, marginTop: 4 } }, [
          Btn(busy ? "Mengambil\u2026" : "Pakai lokasi GPS", useGPS, { background: "rgba(45,212,191,0.18)", border: "1px solid rgba(45,212,191,0.5)", color: "#7ff0e0" }, "gps"),
          Btn("Muat ulang", function () { fetchSched(true) }, { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" }, "reload")
        ])
      ]));
    } else {
      blocks.push(h("div", { key: "top", style: { display: "flex", alignItems: "center", gap: 10 } }, [
        h("div", { key: "next", style: { display: "flex", flexDirection: "column", gap: 0, minWidth: 0 } }, [
          h("div", { key: "l", style: { fontSize: 8.5, fontWeight: 800, letterSpacing: "0.09em", color: MUTED } }, nx && nx.tomorrow ? "BERIKUTNYA (BESOK)" : "BERIKUTNYA"),
          h("div", { key: "n", style: { display: "flex", alignItems: "baseline", gap: 7 } }, [
            h("span", { key: "nm", style: { fontSize: 17, fontWeight: 800, color: P0 } }, nx ? nx.name : "\u2014"),
            h("span", { key: "tv", style: { fontSize: 13, fontWeight: 700, color: ACCENT } }, nx ? nx.time : "")
          ])
        ]),
        h("div", { key: "cd", style: { marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 5 } }, [
          h("span", { key: "v", style: { fontSize: 16, fontWeight: 800, color: P0 } }, nx ? fmtLeft(nx.min) : "\u2014"),
          h("span", { key: "u", style: { fontSize: 9.5, fontWeight: 700, color: MUTED } }, "lagi")
        ]),
        Btn("\u27F3", function () { fetchSched(true) }, { padding: "3px 9px", fontSize: 13 }, "rf")
      ]));

      blocks.push(h("div", { key: "grid", style: { display: "flex", gap: 6 } }, PRAYERS.map(function (p) {
        var tv = s.times[p[0]] || "\u2014";
        var isNext = nx && nx.key === p[0] && !nx.tomorrow;
        var past = toMin(tv) >= 0 && toMin(tv) < now && !isNext;
        return h("div", { key: p[0], style: {
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          borderRadius: 9, padding: "5px 4px",
          background: isNext ? "rgba(45,212,191,0.16)" : "rgba(255,255,255,0.045)",
          border: "1px solid " + (isNext ? "rgba(45,212,191,0.5)" : "rgba(255,255,255,0.09)"),
          opacity: past ? 0.42 : 1
        } }, [
          h("span", { key: "n", style: { fontSize: 9.5, fontWeight: 700, color: isNext ? "#7ff0e0" : MUTED } }, p[1]),
          h("span", { key: "t", style: { fontSize: 13.5, fontWeight: 800, color: isNext ? ACCENT : P0 } }, tv)
        ]);
      })));

      blocks.push(h("div", { key: "ctl", style: { display: "flex", alignItems: "center", gap: 6, marginTop: "auto" } }, [
        Btn("Pengingat", function () { toggleKey("salah-enabled", cfg.on) }, pillStyle(cfg.on, false), "tg1"),
        Btn("Suara", function () { toggleKey("salah-sound", cfg.sound) }, pillStyle(cfg.sound, false), "tg2"),
        h("span", { key: "preL", style: { fontSize: 9.5, fontWeight: 700, color: MUTED, marginLeft: 4 } }, "ingatkan"),
        [0, 5, 10, 15, 20].map(function (v) { return Btn(v === 0 ? "pas waktu" : v + "m", function () { setPre(v) }, pillStyle(cfg.pre === v, false), "pre" + v) }),
        h("span", { key: "loc", style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 } }, [
          h("span", { key: "i" }, "\uD83D\uDCCD"),
          h("span", { key: "t", title: lab.full + (lab.src ? " \u00B7 " + lab.src : ""), style: { maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, lab.label + (lab.src ? " \u00B7 " + lab.src : "")),
          errv ? h("span", { key: "e", style: { color: "#fbbf24" } }, " \u00B7 offline") : null
        ])
      ]));
    }

    return h("div", {
      style: {
        width: "100%", height: "100%", boxSizing: "border-box", padding: "4px 14px 8px",
        display: "flex", flexDirection: "column", gap: 8,
        fontFamily: "OpenRunde, system-ui, sans-serif", color: P0, userSelect: "none"
      }
    }, blocks);
  }
  window.__QP_SALAH_TAB__ = QpSholatTab;

  /* ---------- ticker headless (jalan walau tab tidak dibuka) ---------- */
  function Ticker() {
    m.useEffect(function () {
      try { window.__QP_SALAH_TICK__(); ensureFresh(); } catch (e) { }
      var iv = setInterval(function () { try { window.__QP_SALAH_TICK__(); ensureFresh(); } catch (e) { } }, 15000);
      return function () { clearInterval(iv) };
    }, []);
    return null;
  }
  window.__QP_SALAH_TICKER__ = Ticker;

  function mount() {
    try {
      if (!window.__QP_SALAH_TICKER__ || !window.__QP_ROOT__ || !window.__QP_ROOT__.createRoot) return;
      var host = document.getElementById("qp-salah-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "qp-salah-host";
        host.style.display = "none";
        document.body.appendChild(host);
      }
      if (!host.__root) host.__root = window.__QP_ROOT__.createRoot(host);
      host.__root.render(h(window.__QP_SALAH_TICKER__, null));
    } catch (e) { }
  }
  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(mount, 1600);
  else window.addEventListener("DOMContentLoaded", function () { setTimeout(mount, 1600) });
  setInterval(mount, 5000);

  /* ---------- debug hooks (buat verifikasi) ---------- */
  window.__QP_SALAH_REFRESH__ = function () { fetchSched(true) };
  window.__QP_SALAH_STATE__ = function () { return { sched: readSched(), cfg: readCfg(), fired: readFired(), loc: locLabel(), err: window.__QP_SALAH_ERR__ || "" } };
  log("block-ready");
})();
