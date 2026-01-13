(() => {
  // ========== Helpers ==========
  const $ = (id) => document.getElementById(id);

  function pad2(n){ return String(n).padStart(2, "0"); }

  function formatDatePtBR(d){
    // terça-feira, 13 de janeiro de 2026
    return d.toLocaleDateString("pt-BR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  // Proxy simples para driblar CORS em páginas HTML.
  // (o mesmo “truque” costuma ser necessário com Divinum Officium)
  function viaJina(url){
    // r.jina.ai/https://...
    const u = url.replace(/^http:\/\//i, "https://");
    return `https://r.jina.ai/${u}`;
  }

  async function fetchText(url){
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  async function fetchJson(url){
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  function showError(elText, elErr, msg){
    elText.classList.remove("loading");
    elText.textContent = "Não foi possível carregar.";
    elErr.style.display = "block";
    elErr.textContent = msg;
  }

  // ========== (1) Tradicional (Divinum Officium) ==========
  // Vamos extrair a primeira linha do topo que costuma vir como:
  // "S. Luciæ Virginis et Martyris ~ Duplex"
  function extractTraditionalTitle(raw){
    // O proxy do Jina retorna o HTML já “textificado”,
    // mas pode vir com muita coisa. Vamos buscar uma linha plausível.
    const lines = raw
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    // Heurísticas: linha com "~" costuma ser a festa do dia.
    let candidate = lines.find(l => l.includes("~") && l.length < 120);
    if(candidate) return candidate;

    // fallback: algo começando com "S." / "Ss." / "Beatae" etc.
    candidate = lines.find(l => /^(S\.|Ss\.|Beatae|B\.|Sancti|Sanctae)/.test(l) && l.length < 140);
    if(candidate) return candidate;

    // fallback final: primeira linha curta
    candidate = lines.find(l => l.length > 6 && l.length < 80);
    return candidate || "Celebração do dia";
  }

  async function loadTraditional(d){
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const yyyy = d.getFullYear();

    // Endpoint documentado e usado publicamente (Pofficium.pl).
    // Usamos "prayOmnes" para garantir que o topo com a festa apareça.
    const directUrl =
      `https://www.divinumofficium.com/cgi-bin/horas/Pofficium.pl` +
      `?command=prayOmnes&date1=${mm}-${dd}-${yyyy}` +
      `&lang2=Portugues&version=Rubrics+1960+-+1960&votive=Hodie`;

    $("tradLink").href = directUrl;

    const txt = await fetchText(viaJina(directUrl));
    const title = extractTraditionalTitle(txt);

    $("tradSaint").classList.remove("loading");
    $("tradSaint").textContent = title;
  }

  // ========== (2) Atual (CalAPI) ==========
  // Exemplo público: /api/v0/en/calendars/general-en/today 
  // Vamos usar "default" e "today" pra simplificar.
  async function loadCurrent(){
    const apiUrl = "http://calapi.inadiutorium.cz/api/v0/en/calendars/default/today";
    $("curLink").href = apiUrl;

    const data = await fetchJson(apiUrl);

    // Estrutura típica: { date, season, celebrations: [{title, colour, rank, ...}, ...] }
    const c = Array.isArray(data.celebrations) ? data.celebrations : [];
    const title = c.length ? c[0].title : "Celebração do dia";

    $("curSaint").classList.remove("loading");
    $("curSaint").textContent = title;
  }

  // ========== Boot ==========
  async function main(){
    const now = new Date();
    $("datePill").textContent = formatDatePtBR(now);

    try{
      await loadTraditional(now);
    }catch(e){
      showError($("tradSaint"), $("tradErr"), `Erro ao buscar o calendário tradicional (${e.message}).`);
    }

    try{
      await loadCurrent();
    }catch(e){
      showError($("curSaint"), $("curErr"), `Erro ao buscar o calendário atual (${e.message}).`);
    }
  }

  main();
})();
