(() => {
  const $ = (id) => document.getElementById(id);

  function pad2(n){ return String(n).padStart(2, "0"); }

  function formatDatePtBR(d){
    return d.toLocaleDateString("pt-BR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  // Proxies HTTPS (para páginas/HTTP e evitar CORS/mixed content)
  const proxyJina = (url) => `https://r.jina.ai/${url.replace(/^http:\/\//i, "http://").replace(/^https:\/\//i, "https://")}`;
  const proxyAllOrigins = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  async function fetchWithTimeout(url, ms=9000){
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try{
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchJsonViaProxies(httpOrHttpsUrl){
    // tenta AllOrigins primeiro (geralmente mais “puro”), depois Jina
    const tries = [proxyAllOrigins(httpOrHttpsUrl), proxyJina(httpOrHttpsUrl)];
    let lastErr = null;

    for (const u of tries){
      try{
        const raw = await fetchWithTimeout(u, 9000);

        // pode vir JSON puro ou texto com JSON “no meio”
        try{
          return JSON.parse(raw);
        } catch {
          const start = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          if (start === -1 || end === -1 || end <= start) throw new Error("JSON não encontrado");
          return JSON.parse(raw.slice(start, end + 1));
        }
      } catch(e){
        lastErr = e;
      }
    }
    throw lastErr || new Error("Falha ao obter JSON");
  }

  function showError(textEl, errEl, msg){
    textEl.classList.remove("loading");
    textEl.textContent = "Não foi possível carregar.";
    errEl.style.display = "block";
    errEl.textContent = msg;
  }

  // ===== Tradicional (1962) via Divinum Officium =====
  function extractTraditionalTitle(rawText){
    // rawText aqui é texto “achatado” do proxy; escolhemos linha “festa do dia”
    const lines = rawText
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    // Preferência: linha com "~" (muito típico)
    let c = lines.find(l => l.includes("~") && l.length < 140);
    if (c) return c;

    // fallback: linhas que pareçam “título de festa”
    c = lines.find(l =>
      /^(S\.|Ss\.|Sancti|Sanctae|Beatae|B\.|Dominica|Feria|Commemoratio)/i.test(l) &&
      l.length < 160
    );
    if (c) return c;

    return lines.find(l => l.length > 8 && l.length < 120) || "Celebração do dia";
  }

  async function loadTraditional(d){
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const yyyy = d.getFullYear();

    const directUrl =
      `https://www.divinumofficium.com/cgi-bin/horas/Pofficium.pl` +
      `?command=prayOmnes&date1=${mm}-${dd}-${yyyy}` +
      `&lang2=Portugues&version=Rubrics+1960+-+1960&votive=Hodie`;

    $("tradLink").href = directUrl;

    // tenta dois proxys
    const tries = [proxyAllOrigins(directUrl), proxyJina(directUrl)];
    let lastErr = null;

    for (const u of tries){
      try{
        const raw = await fetchWithTimeout(u, 12000);
        const title = extractTraditionalTitle(raw);

        $("tradSaint").classList.remove("loading");
        $("tradSaint").textContent = title;
        return;
      } catch(e){
        lastErr = e;
      }
    }

    throw lastErr || new Error("Falha ao carregar tradicional");
  }

  // ===== Atual (Calendário Romano) via CalAPI =====
  async function loadCurrent(){
    // ATENÇÃO: é HTTP, então sempre via proxy
    const apiHttp = "http://calapi.inadiutorium.cz/api/v0/en/calendars/default/today";
    $("curLink").href = apiHttp;

    const data = await fetchJsonViaProxies(apiHttp);

    const c = Array.isArray(data.celebrations) ? data.celebrations : [];
    const title = c.length ? c[0].title : "Celebração do dia";

    $("curSaint").classList.remove("loading");
    $("curSaint").textContent = title;
  }

  async function main(){
    // Se o JS rodar, isso SOME do “—” imediatamente
    const now = new Date();
    $("datePill").textContent = formatDatePtBR(now);

    // placeholders
    $("tradSaint").textContent = "Carregando…";
    $("curSaint").textContent = "Carregando…";
    $("tradErr").style.display = "none";
    $("curErr").style.display = "none";

    try{
      await loadTraditional(now);
    } catch(e){
      showError($("tradSaint"), $("tradErr"), `Erro (tradicional): ${e.message}`);
    }

    try{
      await loadCurrent();
    } catch(e){
      showError($("curSaint"), $("curErr"), `Erro (atual): ${e.message}`);
    }
  }

  main();
})();
