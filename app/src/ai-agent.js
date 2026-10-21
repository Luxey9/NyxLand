"use strict";
// NyxLand AI Agent — modul terpisah, di-require dari main.js
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const http = require("node:http");

module.exports = function registerAiAgent({ app, ipcMain, shell }) {
  // cari config di beberapa kandidat lokasi (userData beda antar build)
  // Hanya userData milik app ini. Tidak ada fallback ke folder build lain:
  // kalau ada, build portable bisa "mewarisi" API key mesin developer.
  const cfCandidates = [path.join(app.getPath("userData"), "ai-config.json")];
  let cfg = {};
  let cfgPath = cfCandidates[0];
  for (const cand of cfCandidates) {
    try {
      const raw = fs.readFileSync(cand, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.apiKey) {
        cfg = parsed;
        cfgPath = cand;
        break;
      }
    } catch {}
  }

  const ROOTS = (cfg.roots && cfg.roots.length
    ? cfg.roots
    : [
        path.join(os.homedir(), "Documents"),
        path.join(os.homedir(), "Downloads"),
        path.join(os.homedir(), "Desktop"),
        path.join(os.homedir(), "Pictures"),
      ]
  ).filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  const SKIP = new Set(["node_modules", ".git", ".cache", "AppData", "$RECYCLE.BIN", "System Volume Information"]);
  const MAX_HITS = 60;
  const MAX_FILES = 40000;

  function inside(p) {
    const r = path.resolve(p);
    return ROOTS.some((root) => {
      const rr = path.resolve(root);
      return r === rr || r.startsWith(rr + path.sep);
    });
  }

  function walk(dir, out, depth) {
    if (depth > 8 || out.length > MAX_FILES) return;
    let ents = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (SKIP.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        out.push({ p: full, d: true });
        walk(full, out, depth + 1);
      } else {
        out.push({ p: full, d: false });
      }
    }
  }

  function search(query, root) {
    const terms = String(query || "")
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) return { hits: [], error: "query kosong" };
    const bases = root && inside(root) ? [root] : ROOTS;
    const hits = [];
    for (const base of bases) {
      const all = [];
      walk(base, all, 0);
      for (const it of all) {
        const name = path.basename(it.p).toLowerCase();
        if (!terms.every((t) => name.includes(t))) continue;
        let size = 0;
        let mtime = 0;
        try {
          const st = fs.statSync(it.p);
          size = st.size;
          mtime = st.mtimeMs;
        } catch {}
        hits.push({ path: it.p, name: path.basename(it.p), dir: it.d, size, mtime });
        if (hits.length >= MAX_HITS) return { hits, truncated: true, roots: bases };
      }
    }
    hits.sort((a, b) => b.mtime - a.mtime);
    return { hits, truncated: false, roots: bases };
  }

  const BIN_EXT = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".exe", ".dll", ".zip", ".rar", ".7z",
    ".mp3", ".mp4", ".mkv", ".pdf", ".docx", ".xlsx", ".pptx", ".asar", ".woff", ".woff2", ".ttf",
  ]);

  function readPath(p, maxBytes) {
    if (!inside(p)) return { error: "path di luar folder yang diizinkan" };
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        const items = fs
          .readdirSync(p, { withFileTypes: true })
          .slice(0, 100)
          .map((e) => (e.isDirectory() ? "[dir] " : "[file] ") + e.name);
        return { path: p, isDir: true, items };
      }
      if (st.size > 4 * 1024 * 1024) return { path: p, error: "file terlalu besar", size: st.size };
      if (BIN_EXT.has(path.extname(p).toLowerCase())) {
        return { path: p, binary: true, size: st.size, note: "file biner, isi tidak dibaca" };
      }
      const limit = maxBytes || 4000;
      const text = fs.readFileSync(p, "utf8").slice(0, limit);
      return { path: p, size: st.size, text, truncated: st.size > limit };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  }

  function runTool(name, args) {
    try {
      if (name === "search_files") return search(args.query, args.root);
      if (name === "list_folder") return readPath(args.path);
      if (name === "read_file") return readPath(args.path, args.maxBytes);
      if (name === "open_path") {
        if (!inside(args.path)) return { error: "path di luar folder yang diizinkan" };
        shell.openPath(args.path);
        return { opened: args.path };
      }
      return { error: "tool tidak dikenal: " + name };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  }

  const TOOLS = [
    {
      type: "function",
      function: {
        name: "search_files",
        description: "Cari file/folder berdasarkan potongan nama di Documents, Downloads, Desktop, Pictures.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "kata dari nama file, misal: laporan magang" },
            root: { type: "string", description: "opsional, batasi ke subfolder" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Baca isi file teks (txt, md, json, js, py, csv, dll).",
        parameters: {
          type: "object",
          properties: { path: { type: "string" }, maxBytes: { type: "integer" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_folder",
        description: "Daftar isi sebuah folder.",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: {
        name: "open_path",
        description: "Buka file/folder di Windows (Explorer / app default).",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    },
  ];

  const SYSTEM =
    "Kamu asisten ringkas di dalam pill NyxLand milik Faqod (Windows 11). Jawab bahasa Indonesia, singkat. " +
    "Tool tersedia: search_files, read_file, list_folder, open_path. " +
    "Folder yang boleh diakses: " + ROOTS.join(" ; ") + ". " +
    "Kalau user minta cari file, panggil search_files dulu. Jangan mengarang path, pakai hasil tool. " +
    "Tidak bisa menghapus, menulis, atau memindah file. Kalau hasil kosong, bilang kosong dan sarankan kata kunci lain.";

  function post(payload) {
    return new Promise((resolve) => {
      const base = String(cfg.baseUrl || "https://ollama.com/v1").replace(/\/+$/, "");
      const u = new URL(base + "/chat/completions");
      const body = JSON.stringify(payload);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: "POST",
          timeout: 180000,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: "Bearer " + (cfg.apiKey || ""),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const txt = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return resolve({ error: "HTTP " + res.statusCode + ": " + txt.slice(0, 300) });
            }
            try {
              resolve(JSON.parse(txt));
            } catch {
              resolve({ error: "respons bukan JSON: " + txt.slice(0, 200) });
            }
          });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ error: "timeout ke endpoint AI" });
      });
      req.on("error", (e) => resolve({ error: String((e && e.message) || e) }));
      req.write(body);
      req.end();
    });
  }

  // streaming SSE dari OpenAI-compatible endpoint
  function postStream(payload, onDelta) {
    return new Promise((resolve) => {
      const base = String(cfg.baseUrl || "https://ollama.com/v1").replace(/\/+$/, "");
      const u = new URL(base + "/chat/completions");
      const body = JSON.stringify({ ...payload, stream: true });
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: "POST",
          timeout: 180000,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: "Bearer " + (cfg.apiKey || ""),
            Accept: "text/event-stream",
          },
        },
        (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve({ error: "HTTP " + res.statusCode + ": " + Buffer.concat(chunks).toString("utf8").slice(0, 300) }));
            return;
          }
          let buf = "";
          let content = "";
          const toolCalls = [];
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            buf += chunk;
            const lines = buf.split("\n");
            buf = lines.pop();
            for (const line of lines) {
              const t = line.trim();
              if (!t || !t.startsWith("data:")) continue;
              const data = t.slice(5).trim();
              if (data === "[DONE]") continue;
              let j;
              try { j = JSON.parse(data); } catch { continue; }
              const d = j.choices && j.choices[0] && j.choices[0].delta;
              if (!d) continue;
              if (d.content) {
                content += d.content;
                try { onDelta(d.content); } catch {}
              }
              if (d.tool_calls) {
                for (const tc of d.tool_calls) {
                  const idx = tc.index || 0;
                  if (!toolCalls[idx]) toolCalls[idx] = { id: "", type: "function", function: { name: "", arguments: "" } };
                  const slot = toolCalls[idx];
                  if (tc.id) slot.id = tc.id;
                  if (tc.function) {
                    if (tc.function.name) slot.function.name += tc.function.name;
                    if (tc.function.arguments) slot.function.arguments += tc.function.arguments;
                  }
                }
              }
            }
          });
          res.on("end", () => {
            const calls = toolCalls.filter(Boolean);
            resolve({ content, tool_calls: calls.length ? calls : null });
          });
        }
      );
      req.on("timeout", () => { req.destroy(); resolve({ error: "timeout ke endpoint AI" }); });
      req.on("error", (e) => resolve({ error: String((e && e.message) || e) }));
      req.write(body);
      req.end();
    });
  }

  const ATTACH_MAX_CHARS = 24000;
  const ATTACH_MAX_BYTES = 8 * 1024 * 1024;

  // Lampiran drag & drop: baca file jadi konteks teks siap tempel ke prompt.
  function attachPath(p) {
    if (!p) return { error: "path kosong" };
    if (!inside(p)) return { error: "path di luar folder yang diizinkan: " + p };
    let st;
    try {
      st = fs.statSync(p);
    } catch (e) {
      return { error: "tidak bisa membaca: " + String((e && e.message) || e) };
    }
    const name = path.basename(p);
    if (st.isDirectory()) {
      let items = [];
      try {
        items = fs
          .readdirSync(p, { withFileTypes: true })
          .slice(0, 200)
          .map((e) => (e.isDirectory() ? "[dir] " : "[file] ") + e.name);
      } catch {}
      return {
        name: name + "/",
        path: p,
        size: 0,
        isDir: true,
        text: items.join("\n"),
        truncated: false,
        binary: false,
      };
    }
    if (st.size > ATTACH_MAX_BYTES) {
      return { name, path: p, size: st.size, error: "file terlalu besar (" + st.size + " byte)" };
    }
    const ext = path.extname(p).toLowerCase();
    if (BIN_EXT.has(ext)) {
      return { name, path: p, size: st.size, binary: true, text: "" };
    }
    let text = "";
    try {
      const buf = fs.readFileSync(p);
      // deteksi biner kasar: ada NUL byte di 8KB pertama
      const probe = buf.subarray(0, 8192);
      const binary = probe.includes(0);
      if (binary) return { name, path: p, size: st.size, binary: true, text: "" };
      text = buf.toString("utf8");
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
    const truncated = text.length > ATTACH_MAX_CHARS;
    return {
      name,
      path: p,
      size: st.size,
      text: truncated ? text.slice(0, ATTACH_MAX_CHARS) : text,
      truncated,
      binary: false,
    };
  }

  ipcMain.handle("ai:attach", (ev, p) => attachPath(p));

  function maskKey(k) {
    const s = String(k || "");
    if (!s) return "";
    if (s.length <= 8) return "\u2022".repeat(s.length);
    return "\u2022".repeat(Math.min(32, Math.max(10, s.length))) ;
  }

  function saveCfg() {
    try {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), { encoding: "utf8", mode: 0o600 });
      try { fs.chmodSync(cfgPath, 0o600); } catch {}
      return { ok: true, path: cfgPath };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  ipcMain.handle("ai:config", () => ({
    model: cfg.model || "",
    baseUrl: cfg.baseUrl || "",
    hasKey: !!cfg.apiKey,
    keyMask: maskKey(cfg.apiKey),
    path: cfgPath,
    roots: ROOTS,
    defaults: { model: "llama3.1:8b", baseUrl: "https://ollama.com/v1" },
  }));

  ipcMain.handle("ai:setconfig", (ev, patch) => {
    try {
      const p = patch || {};
      if (typeof p.model === "string") cfg.model = p.model.trim();
      if (typeof p.baseUrl === "string") cfg.baseUrl = p.baseUrl.trim().replace(/\/+$/, "");
      if (typeof p.apiKey === "string" && p.apiKey.trim()) cfg.apiKey = p.apiKey.trim();
      if (p.clearKey === true) cfg.apiKey = "";
      const r = saveCfg();
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, model: cfg.model || "", baseUrl: cfg.baseUrl || "", hasKey: !!cfg.apiKey, keyMask: maskKey(cfg.apiKey), path: cfgPath };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  ipcMain.handle("ai:testconn", async () => {
    if (!cfg.apiKey) return { ok: false, error: "API key belum di-set" };
    const base = String(cfg.baseUrl || "https://ollama.com/v1").replace(/\/+$/, "");
    const payload = JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false });
    return await new Promise((resolve) => {
      let mod;
      try { mod = new URL(base + "/chat/completions").protocol === "http:" ? http : https; } catch { return resolve({ ok: false, error: "base URL tidak valid" }); }
      let req;
      try {
        req = mod.request(base + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), Authorization: "Bearer " + cfg.apiKey },
        }, (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            let j = {};
            try { j = JSON.parse(d); } catch {}
            if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, status: res.statusCode, model: (j && j.model) || cfg.model });
            else resolve({ ok: false, status: res.statusCode, error: (j && j.error && (j.error.message || j.error)) || ("HTTP " + res.statusCode) });
          });
        });
      } catch (e) { return resolve({ ok: false, error: String((e && e.message) || e) }); }
      req.on("error", (e) => resolve({ ok: false, error: String((e && e.message) || e) }));
      req.setTimeout(15000, () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timeout 15s" }); });
      req.write(payload);
      req.end();
    });
  });

  ipcMain.handle("ai:chat", async (ev, messages) => {
    const send = (ch) => {
      try { if (ev && ev.sender && !ev.sender.isDestroyed()) ev.sender.send("ai:stream", ch); } catch {}
    };
    if (!cfg.apiKey) return { error: "API key belum di-set di " + cfgPath };
    const history = [{ role: "system", content: SYSTEM }, ...(messages || [])];
    const steps = [];
    const maxSteps = Number(cfg.maxSteps || 6);
    for (let i = 0; i < maxSteps; i++) {
      const res = await postStream({ model: cfg.model, messages: history, tools: TOOLS }, (delta) => {
        send({ type: "delta", text: delta });
      });
      if (res.error) { send({ type: "error", message: res.error }); return { error: res.error, steps }; }
      const content = res.content || "";
      const calls = res.tool_calls;
      if (calls && calls.length) {
        history.push({ role: "assistant", content, tool_calls: calls });
        for (const tc of calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
          send({ type: "tool", tool: tc.function.name, args });
          const out = runTool(tc.function.name, args);
          steps.push({ tool: tc.function.name, args, result: out });
          history.push({ role: "tool", tool_call_id: tc.id || ("call_" + Math.random().toString(36).slice(2)), content: JSON.stringify(out).slice(0, 12000) });
        }
        continue;
      }
      send({ type: "end" });
      return { answer: content, steps };
    }
    send({ type: "end" });
    return { answer: "(berhenti: batas langkah agent tercapai)", steps };
  });

  console.log("[ai-agent] config:", cfgPath, "model:", cfg.model, "key:", cfg.apiKey ? "ada" : "TIDAK ADA");
  return { cfgPath, roots: ROOTS };
};
