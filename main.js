(() => {
  // =========================
  // Santo do Dia — Tradicional (1962) + Atual (Vatican News / pt)
  // =========================

  const $ = (id) => document.getElementById(id);

  // ---------- util ----------
  const pad2 = (n) => String(n).padStart(2, "0");

  function formatDatePtBR(d) {
    try {
      return d.toLocaleDateString("pt-BR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d.toLocaleDateString("pt-BR");
    }
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setLink(id, href) {
    const el = $(id);
    if (el) el.href = href;
  }

  function showError(textId, errId, msg) {
    const textEl = $(textId);
    const errEl = $(errId);
    if (textEl) {
      textEl.classList.remove("loading");
      textEl.textContent = "Não foi possível carregar.";
    }
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = msg;
    }
  }

  // ---------- CORS helpers ----------
  const proxyAllOrigins = (url) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  const proxyJina = (url) => `https://r.jina.ai/${url}`;

  async function fetchWithTimeout(url, ms = 12000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchTextViaProxies(url, ms = 12000) {
    const tries = [proxyAllOrigins(url), proxyJina(url)];
    let lastErr = null;
    for (const u of tries) {
      try {
        return await fetchWithTimeout(u, ms);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Falha ao buscar via proxy");
  }

  // ---------- (1) Tradicional 1962 via Divinum Officium ----------
  function extractTraditionalTitle(rawText) {
    const lines = rawText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // preferir linha com "~"
    let c = lines.find((l) => l.includes("~") && l.length < 160);
    if (c) return c;

    // fallback: linhas típicas de título
    c = lines.find(
      (l) =>
        /^(S\.|Ss\.|Sancti|Sanctae|Beatae|B\.|Dominica|Feria|Commemoratio)/i.test(l) &&
        l.length < 170
    );
    if (c) return c;

    c = lines.find((l) => l.length > 10 && l.length < 120);
    return c || "Celebração do dia";
  }

  async function loadTraditional(d) {
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const yyyy = d.getFullYear();

    const directUrl =
      `https://www.divinumofficium.com/cgi-bin/horas/Pofficium.pl` +
      `?command=prayOmnes&date1=${mm}-${dd}-${yyyy}` +
      `&lang2=Portugues&version=Rubrics+1960+-+1960&votive=Hodie`;

    setLink("tradLink", directUrl);

    const raw = await fetchTextViaProxies(directUrl, 15000);
    const title = extractTraditionalTitle(raw);

    const el = $("tradSaint");
    if (el) {
      el.classList.remove("loading");
      el.textContent = title;
    }
  }

  // ---------- (2) Atual via Vatican News (pt) ----------
  function cleanTitle(s) {
    if (!s) return "";
    return s
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*Vatican News\s*$/i, "")
      .replace(/\s*\|\s*Vatican News\s*$/i, "")
      .replace(/^\s*santo do dia\s*[-–—:]\s*/i, "")
      .trim();
  }

  function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = x.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(x);
      }
    }
    return out;
  }

  function extractSaintNamesFromVaticanHTML(html) {
    // Parse com DOMParser (mais estável que regex puro)
    const doc = new DOMParser().parseFromString(html, "text/html");

    // 1) Tenta pegar um título “oficial”
    const og = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const h1 = doc.querySelector("h1")?.textContent;
    const titleTag = doc.querySelector("title")?.textContent;

    const baseTitle = cleanTitle((og || h1 || titleTag || "").trim());

    // 2) Tenta pegar a lista de santos do corpo (quando houver múltiplos)
    // Heurística: muitos sites colocam nomes em headings dentro do artigo.
    const headings = Array.from(doc.querySelectorAll("main h2, main h3, article h2, article h3, .content h2, .content h3"))
      .map(el => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(t => t && t.length < 140);

    // Filtra headings “genéricos”
    const bad = new Set([
      "santo do dia",
      "santos do dia",
      "santo do dia - vatican news",
      "santo do dia – vatican news",
      "santo do dia — vatican news",
      "santo do dia:",
    ]);

    const likelyNames = headings.filter(t => {
      const low = t.toLowerCase();
      if (bad.has(low)) return false;

      // sinais comuns em pt: São/Santa/Santo/Beato/Beata/Santos/Santas/SS./S.
      if (/^(são|santa|santo|beato|beata|santos|santas|ss\.|s\.)\b/i.test(t)) return true;

      // também aceita nomes que contenham "São"/"Santa" no meio
      if (/\b(são|santa|santo|beato|beata)\b/i.test(t)) return true;

      return false;
    });

    const names = uniq(likelyNames);

    // 3) Se não achou nada no corpo, cai no título da página
    if (names.length === 0) {
      return baseTitle || "Santo do dia";
    }

    // Se vier uma lista longa, juntamos com • (fica bonito no seu card)
    return names.join(" • ");
  }

  async function loadCurrent(d) {
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());

    const url = `https://www.vaticannews.va/pt/santo-do-dia/${mm}/${dd}.html`;
    setLink("curLink", url);

    const html = await fetchTextViaProxies(url, 15000);
    const saints = extractSaintNamesFromVaticanHTML(html);

    const el = $("curSaint");
    if (el) {
      el.classList.remove("loading");
      el.textContent = saints || "Santo do dia";
    }
  }

  // ---------- Boot ----------
  async function main() {
    const now = new Date();

    // Se isso não mudar, o JS não está rodando (caminho errado / sem defer)
    setText("datePill", formatDatePtBR(now));

    // reset placeholders
    const tradErr = $("tradErr");
    const curErr = $("curErr");
    if (tradErr) tradErr.style.display = "none";
    if (curErr) curErr.style.display = "none";

    setText("tradSaint", "Carregando…");
    setText("curSaint", "Carregando…");

    const tradSaint = $("tradSaint");
    const curSaint = $("curSaint");
    if (tradSaint) tradSaint.classList.add("loading");
    if (curSaint) curSaint.classList.add("loading");

    try {
      await loadTraditional(now);
    } catch (e) {
      showError("tradSaint", "tradErr", `Erro (tradicional): ${e?.message || e}`);
    }

    try {
      await loadCurrent(now);
    } catch (e) {
      showError("curSaint", "curErr", `Erro (atual): ${e?.message || e}`);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
