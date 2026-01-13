(() => {
  // =========================
  // Santo do Dia — Tradicional (1962) + Atual (Calendário Romano)
  // Robustez máxima p/ Notion embeds (CORS + Mixed Content + timeouts)
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

  // ---------- CORS / Mixed content helpers ----------
  // IMPORTANT: calapi é http://, então SEMPRE via proxy https
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

  function extractJsonFromPossiblyWrappedText(raw) {
    // tenta JSON puro
    try {
      return JSON.parse(raw);
    } catch {}

    // tenta pegar o primeiro objeto {...}
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("JSON não encontrado");
    }
    return JSON.parse(raw.slice(start, end + 1));
  }

  async function fetchJsonViaProxies(url, ms = 12000) {
    const raw = await fetchTextViaProxies(url, ms);
    return extractJsonFromPossiblyWrappedText(raw);
  }

  // ---------- (1) Tradicional 1962 via Divinum Officium ----------
  function extractTraditionalTitle(rawText) {
    const lines = rawText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // preferir linha com "~" (muito frequente no topo)
    let c = lines.find((l) => l.includes("~") && l.length < 160);
    if (c) return c;

    // fallback: linhas típicas de título litúrgico
    c = lines.find(
      (l) =>
        /^(S\.|Ss\.|Sancti|Sanctae|Beatae|B\.|Dominica|Feria|Commemoratio)/i.test(l) &&
        l.length < 170
    );
    if (c) return c;

    // fallback: primeira linha curta “decente”
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

  // ---------- (2) Atual (Calendário Romano) via CalAPI ----------
  function isLikelySaintTitle(title) {
    if (!title) return false;
    const s = title.toLowerCase();

    // marcadores fortes (inglês)
    if (s.includes("saint") || s.startsWith("st.") || s.includes("blessed")) return true;

    // termos comuns de “dia litúrgico”
    const lit = [
      "feria",
      "weekday",
      "sunday",
      "advent",
      "lent",
      "easter",
      "christmas",
      "ordinary time",
      "octave",
      "season",
    ];
    if (lit.some((k) => s.includes(k))) return false;

    // se não parece “feria/tempo”, aceitamos como celebração de santo
    return true;
  }

  async function loadCurrent() {
    const apiHttp = "http://calapi.inadiutorium.cz/api/v0/en/calendars/default/today";
    setLink("curLink", apiHttp);

    // (HTTP) -> via proxy HTTPS
    const data = await fetchJsonViaProxies(apiHttp, 12000);

    const celebrations = Array.isArray(data.celebrations) ? data.celebrations : [];

    // 1) tenta “santo” primeiro
    const picked = celebrations.find((c) => isLikelySaintTitle(c?.title));

    // 2) fallback: celebração principal do dia
    const title =
      (picked && picked.title) ||
      (celebrations[0] && celebrations[0].title) ||
      "Celebração do dia";

    const el = $("curSaint");
    if (el) {
      el.classList.remove("loading");
      el.textContent = title;
    }
  }

  // ---------- Boot ----------
  async function main() {
    const now = new Date();

    // Se isso não mudar, o JS não está rodando (caminho do main.js errado ou sem defer)
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
      await loadCurrent();
    } catch (e) {
      showError("curSaint", "curErr", `Erro (atual): ${e?.message || e}`);
    }
  }

  // rodar quando o DOM estiver pronto (extra seguro em embeds)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
