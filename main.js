(() => {
  // =========================
  // Santo do Dia — Tradicional (1962) + Atual (Vatican News / pt)
  // Robusto para Notion embed (CORS, proxies, HTML ou texto "jina")
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

  // ---------- proxies ----------
  // AllOrigins tende a devolver HTML "de verdade" (bom p/ DOMParser)
  const proxyAllOrigins = (url) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  // Jina devolve a página "achatada" em texto/markdown (bom p/ regex por "##")
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
    // NOTE: ordem importa: tentamos HTML primeiro
    const tries = [
      { kind: "html", url: proxyAllOrigins(url) },
      { kind: "text", url: proxyJina(url) },
    ];

    let lastErr = null;
    for (const t of tries) {
      try {
        const raw = await fetchWithTimeout(t.url, ms);
        return { raw, kind: t.kind };
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

    const { raw } = await fetchTextViaProxies(directUrl, 15000);
    const title = extractTraditionalTitle(raw);

    const el = $("tradSaint");
    if (el) {
      el.classList.remove("loading");
      el.textContent = title;
    }
  }

  // ---------- (2) Atual via Vatican News (pt) ----------
  function normalizeSpaces(s) {
    return (s || "").replace(/\s+/g, " ").trim();
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

  function looksLikeSaintName(t) {
    const s = t.toLowerCase();
    // Vatican usa muito "S." / "Ss." (latinizante), e também pode aparecer "São/Santa"
    return (
      /^(s\.|ss\.)\s*/i.test(t) ||
      /^(são|santa|santo|beato|beata|santos|santas)\b/i.test(t) ||
      s.includes(" presbítero") ||
      s.includes(" bispo") ||
      s.includes(" mártir") ||
      s.includes(" virgem") ||
      s.includes(" abade") ||
      s.includes(" diácono")
    );
  }

  function extractFromHTML(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Na página real, o santo aparece como "##  S. Félix de Nola, presbítero" (heading) :contentReference[oaicite:1]{index=1}
    // Vamos capturar H2/H3 dentro da área principal.
    const candidates = Array.from(
      doc.querySelectorAll("main h2, main h3, article h2, article h3")
    )
      .map((el) => normalizeSpaces(el.textContent))
      .filter((t) => t && t.length < 160)
      .filter(looksLikeSaintName);

    const names = uniq(candidates);

    if (names.length) return names.join(" • ");

    // fallback (raro): tentar pegar o primeiro heading "Santo do dia" e o próximo
    const allH = Array.from(doc.querySelectorAll("h1,h2,h3"))
      .map((el) => normalizeSpaces(el.textContent))
      .filter(Boolean);

    const idx = allH.findIndex((t) => t.toLowerCase() === "santo do dia");
    if (idx >= 0 && allH[idx + 1]) return allH[idx + 1];

    return "";
  }

  function extractFromJinaText(text) {
    // Jina retorna linhas markdown com "#  Santo do dia" e depois "##  S. ..." :contentReference[oaicite:2]{index=2}
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // acha o bloco do "Santo do dia"
    const i = lines.findIndex((l) => /^#\s+Santo do dia$/i.test(l));
    const slice = i >= 0 ? lines.slice(i, i + 80) : lines;

    // pega todos "## ..." que pareçam santo
    const saints = [];
    for (const l of slice) {
      const m = l.match(/^##\s+(.*)$/);
      if (m) {
        const cand = normalizeSpaces(m[1]);
        if (cand && cand.length < 160 && looksLikeSaintName(cand)) saints.push(cand);
      }
    }

    const names = uniq(saints);
    return names.length ? names.join(" • ") : "";
  }

  async function loadCurrent(d) {
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());

    const url = `https://www.vaticannews.va/pt/santo-do-dia/${mm}/${dd}.html`;
    setLink("curLink", url);

    const { raw, kind } = await fetchTextViaProxies(url, 15000);

    let saints = "";
    if (kind === "html") saints = extractFromHTML(raw);
    if (!saints) saints = extractFromJinaText(raw); // fallback universal
    if (!saints) {
      // último fallback: algo legível (sem “título da página” genérico)
      saints = "Santo do dia";
    }

    const el = $("curSaint");
    if (el) {
      el.classList.remove("loading");
      el.textContent = saints;
    }
  }

  // ---------- Boot ----------
  async function main() {
    const now = new Date();

    setText("datePill", formatDatePtBR(now));

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
