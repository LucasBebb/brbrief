const express = require("express");
const fetch = require("node-fetch");
const xml2js = require("xml2js");

const app = express();
const PORT = process.env.PORT || 3000;

// ── SOURCES ──────────────────────────────────────────────────────────────────
const SOURCES = [
  { name: "Brazil Journal",   domain: "braziljournal.com", rss: "https://braziljournal.com/feed" },
  { name: "NeoFeed",          domain: "neofeed.com.br",    rss: "https://neofeed.com.br/feed" },
  { name: "Valor Econômico",  domain: "valor.globo.com",   rss: "https://www.valor.com.br/rss" },
];

// ── THEMES — specific sectors first, then general ────────────────────────────
const THEMES = [
  {
    id: "financeiro",
    label: "🏦 Serviços Financeiros",
    color: "#1a3a5c",
    bg: "#d6e8f5",
    keywords: [
      "banco", "fintech", "crédito", "financiamento", "seguro", "seguradora",
      "investimento", "fundo", "gestora", "bolsa", "ações", "b3", "cvm",
      "debenture", "cdi", "selic", "cartão", "pagamento", "pix",
      "open finance", "open banking", "itaú", "bradesco", "santander",
      "nubank", "xp ", "btg", "inter ", "c6 bank", "agibank", "sicoob",
      "sicredi", "caixa econômica", "bndes", "banco do brasil",
      "private equity", "venture capital", "ipo", "follow-on",
      "cra", "cri", "fiagro", "fidc", "tesouro direto", "câmbio",
      "mercado financeiro", "prediction market", "corretora",
    ],
  },
  {
    id: "saude",
    label: "🏥 Saúde",
    color: "#1a5c3a",
    bg: "#d6f5e3",
    keywords: [
      "saúde", "hospital", "clínica", "médico", "medicina", "farmácia",
      "medicamento", "remédio", "vacina", "plano de saúde", "ans", "anvisa",
      "oncologia", "diagnóstico", "laboratório", "cirurgia", "paciente",
      "tratamento", "doença", "câncer", "oncoclínicas", "fleury", "hapvida",
      "notredame", "rede d'or", "dasa", "hermes pardini", "pfizer",
      "novo nordisk", "novonordisk", "roche", "bayer", "abbott",
      "biotech", "farmacêutica", "healthtech", "telemedicina", "wellness",
    ],
  },
  {
    id: "educacao",
    label: "🎓 Educação",
    color: "#5c3a1a",
    bg: "#f5ead6",
    keywords: [
      "educação", "escola", "universidade", "faculdade", "ensino",
      "educacional", "edtech", "aluno", "professor", "mec", "enem",
      "vestibular", "graduação", "pós-graduação", "mba", "curso",
      "capacitação", "treinamento", "aprendizagem", "cogna", "kroton",
      "anima", "yduqs", "ser educacional", "afya", "cruzeiro do sul",
      "fgv", "fipe", "insper", "ibmec", "fundação",
    ],
  },
  {
    id: "eco",
    label: "📊 Economia",
    color: "#1a5e32",
    bg: "#d6ead8",
    keywords: [
      "pib", "inflação", "copom", "banco central", "focus", "ipca", "igp",
      "fiscal", "orçamento", "déficit", "superávit", "reforma tributária",
      "petróleo", "commodities", "exportação", "importação", "balança",
      "recessão", "crescimento econômico", "política monetária", "ibge",
      "taxa de juros", "dólar", "real ", "economia brasileira",
    ],
  },
  {
    id: "biz",
    label: "💼 Negócios",
    color: "#6b2d04",
    bg: "#f5e5d8",
    keywords: [
      "empresa", "ceo", "fusão", "aquisição", "m&a", "resultado trimestral",
      "lucro", "receita", "varejo", "indústria", "logística",
      "supply chain", "startup", "empreendedor", "negócio",
    ],
  },
  {
    id: "pol",
    label: "🏛 Política",
    color: "#4a235a",
    bg: "#ede9f5",
    keywords: [
      "governo", "lula", "congresso", "câmara dos deputados", "senado",
      "eleição", "presidente", "ministro", "stf", "judiciário",
      "partido", "candidato", "política", "aprovação", "caiado",
      "legislação", "regulação", "anatel", "cade",
    ],
  },
  {
    id: "tech",
    label: "⚡ Tecnologia & IA",
    color: "#1b4f72",
    bg: "#ddeaf5",
    keywords: [
      "inteligência artificial", " ia ", " ai ", "tecnologia", "software",
      "digital", "llm", "openai", "google", "amazon", "microsoft", "apple",
      "dados", "algoritmo", "robô", "automação", "chatgpt", "machine learning",
      "cloud", "saas", "cibersegurança", "blockchain", "bezos", "spacex",
    ],
  },
];

// ── CACHE ─────────────────────────────────────────────────────────────────────
let cache = { articles: [], updatedAt: null };

// ── CLASSIFY INTO THEME ───────────────────────────────────────────────────────
function classify(title, desc) {
  const text = (title + " " + desc).toLowerCase();
  const scores = {};
  for (const theme of THEMES) {
    scores[theme.id] = 0;
    for (const kw of theme.keywords) {
      if (text.includes(kw)) scores[theme.id]++;
    }
  }
  let best = "biz";
  let bestScore = 0;
  for (const theme of THEMES) {
    if (scores[theme.id] > bestScore) {
      bestScore = scores[theme.id];
      best = theme.id;
    }
  }
  return best;
}

// ── MAKE BULLET POINTS FROM RSS DESCRIPTION ───────────────────────────────────
function makeBullets(rawDesc) {
  const text = rawDesc
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\[…\]|\[\.\.\.\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length < 30) {
    return ["Clique para ler a matéria completa."];
  }

  // Split into sentences on . ! ? followed by space+uppercase
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ"])/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 320);

  if (sentences.length >= 2) {
    return sentences.slice(0, 3);
  }

  // Fallback: split long text into ~2 chunks at punctuation
  const mid = text.indexOf(". ", Math.floor(text.length * 0.35));
  if (mid > 20) {
    return [
      text.slice(0, mid + 1).trim(),
      text.slice(mid + 2).slice(0, 280).trim(),
    ].filter(s => s.length > 10);
  }

  return [text.slice(0, 280)];
}

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function timeAgo(date) {
  const mins = Math.round((Date.now() - date) / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.round(hrs / 24)}d`;
}

// ── FETCH ONE RSS SOURCE ──────────────────────────────────────────────────────
async function fetchSource(src, cutoff) {
  const res = await fetch(src.rss, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BRBRIEF/1.0)" },
    timeout: 10000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

  const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  const arr = Array.isArray(items) ? items : [items];
  const results = [];

  for (const item of arr) {
    const pubDate = new Date(item.pubDate || item.updated || item.published || "");
    if (isNaN(pubDate) || pubDate < cutoff) continue;

    const title = stripHtml(item.title?._ || item.title || "").trim();
    if (title.length < 5) continue;

    const link =
      item.link?.href ||
      (typeof item.link === "string" ? item.link : "") ||
      item.guid?._ || item.guid || "";

    const rawDesc =
      item["content:encoded"] ||
      item.description ||
      item.summary ||
      item.content?._ || "";

    const descClean = stripHtml(rawDesc);
    const bullets = makeBullets(rawDesc);
    const theme = classify(title, descClean);

    results.push({
      title,
      link,
      bullets,
      source: src.name,
      domain: src.domain,
      theme,
      pubDate: pubDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      ageStr: timeAgo(pubDate),
      ts: pubDate.getTime(),
    });
  }

  return results;
}

// ── REFRESH CACHE ─────────────────────────────────────────────────────────────
async function refresh() {
  console.log("[BRBRIEF] Refreshing feeds…");
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const all = [];

  for (const src of SOURCES) {
    try {
      const arts = await fetchSource(src, cutoff);
      all.push(...arts);
      console.log(`  ✓ ${src.name}: ${arts.length} artigos`);
    } catch (e) {
      console.warn(`  ✗ ${src.name}: ${e.message}`);
    }
  }

  all.sort((a, b) => b.ts - a.ts);
  cache = { articles: all, updatedAt: new Date() };
  console.log(`[BRBRIEF] Done. ${all.length} artigos totais.`);
}

// ── BUILD HTML ────────────────────────────────────────────────────────────────
function buildHTML(articles, updatedAt) {
  const total = articles.length;
  const updStr = updatedAt
    ? updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const dateStr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  const grouped = {};
  THEMES.forEach(t => (grouped[t.id] = []));
  articles.forEach(a => { if (grouped[a.theme]) grouped[a.theme].push(a); });

  function esc(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function card(a) {
    const theme = THEMES.find(t => t.id === a.theme);
    const bulletsHtml = a.bullets
      .map(b => `<li>${esc(b)}</li>`)
      .join("");
    const href = a.link && a.link.startsWith("http") ? a.link : "#";
    return `
    <div class="card" data-theme="${a.theme}">
      <div class="card-top">
        <span class="tag" style="background:${theme?.bg};color:${theme?.color}">${theme?.label}</span>
        <span class="card-meta">${esc(a.source)} · ${a.ageStr}</span>
      </div>
      <h3>${esc(a.title)}</h3>
      <ul class="bullets">${bulletsHtml}</ul>
      <a class="read-link" href="${href}" target="_blank" rel="noopener">Ler no ${esc(a.source)} →</a>
    </div>`;
  }

  function themeBlock(theme) {
    const arts = grouped[theme.id];
    if (!arts || arts.length === 0) return "";
    return `
  <div class="theme-block" data-theme="${theme.id}">
    <div class="theme-head" style="border-color:${theme.color}">
      <h2 style="color:${theme.color}">${theme.label}</h2>
      <span class="theme-cnt">${arts.length} artigo${arts.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="grid">${arts.map(card).join("")}</div>
  </div>`;
  }

  const navBtns = [
    `<button class="nb on" onclick="filter('all',this)">Todas</button>`,
    ...THEMES.map(t => `<button class="nb" onclick="filter('${t.id}',this)">${t.label}</button>`),
  ].join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>BRBRIEF — ${dateStr}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:opsz,wght@8..60,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
:root{--ink:#18120e;--ink2:#3a2e28;--ink3:#7a6a62;--ink4:#b8a89e;--paper:#faf8f4;--paper2:#f3ede6;--rule:#d8cec4;--red:#b8271c}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:'Source Serif 4',Georgia,serif;-webkit-font-smoothing:antialiased}
.topbar{background:var(--ink);color:var(--ink4);font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.8px;padding:5px 24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}
.topbar b{color:#fff}
.logo{text-align:center;padding:22px 20px 14px;border-bottom:3px double var(--ink)}
.logo h1{font-family:'Playfair Display',serif;font-size:clamp(52px,11vw,104px);font-weight:900;line-height:1;letter-spacing:-4px}
.logo h1 em{color:var(--red);font-style:normal}
.logo .sub{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:4px;color:var(--ink3);text-transform:uppercase;margin-top:7px}
.srctags{display:flex;justify-content:center;padding:7px 0;border-bottom:1px solid var(--rule);font-family:'DM Sans',sans-serif;font-size:11px;color:var(--ink3);flex-wrap:wrap}
.srctags span{padding:0 14px;border-right:1px solid var(--rule)}
.srctags span:last-child{border-right:none}
.nav{display:flex;overflow-x:auto;border-bottom:2px solid var(--ink);-webkit-overflow-scrolling:touch;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nb{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;padding:9px 16px;border:none;background:none;color:var(--ink3);cursor:pointer;border-right:1px solid var(--rule);white-space:nowrap;flex-shrink:0;transition:all .15s}
.nb:last-child{border-right:none}
.nb.on{color:var(--paper);background:var(--ink)}
.nb:hover:not(.on){color:var(--red)}
.infobar{background:var(--paper2);border-bottom:1px solid var(--rule);padding:9px 24px;font-family:'DM Sans',sans-serif;font-size:11px;color:var(--ink3);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.infobar b{color:var(--ink)}
.refresh-btn{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;background:var(--ink);border:none;padding:6px 14px;cursor:pointer;transition:background .15s;text-decoration:none;display:inline-block}
.refresh-btn:hover{background:var(--red)}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px 70px}
.theme-block{margin-top:44px}
.theme-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;border-bottom:3px solid}
.theme-head h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:700}
.theme-cnt{margin-left:auto;font-family:'DM Sans',sans-serif;font-size:10px;color:var(--ink4)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));border-left:1px solid var(--rule);border-top:1px solid var(--rule)}
.card{padding:22px 18px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);display:flex;flex-direction:column;gap:11px;transition:background .12s}
.card:hover{background:var(--paper2)}
.card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.tag{font-family:'DM Sans',sans-serif;font-size:8px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:3px 7px;white-space:nowrap;border-radius:2px}
.card-meta{font-family:'DM Sans',sans-serif;font-size:9px;color:var(--ink4)}
.card h3{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;line-height:1.4;color:var(--ink)}
.bullets{list-style:none;display:flex;flex-direction:column;gap:7px;flex:1}
.bullets li{font-family:'DM Sans',sans-serif;font-size:12.5px;color:var(--ink2);line-height:1.6;padding-left:15px;position:relative}
.bullets li::before{content:"•";position:absolute;left:0;color:var(--red);font-weight:900}
.read-link{font-family:'DM Sans',sans-serif;font-size:10px;color:var(--red);font-weight:600;text-decoration:none;padding-top:10px;border-top:1px solid var(--rule);display:block;text-align:right}
.read-link:hover{text-decoration:underline}
.empty{text-align:center;padding:80px 20px;margin-top:40px}
.empty-icon{font-size:3rem;margin-bottom:12px}
.empty h3{font-family:'Playfair Display',serif;font-size:22px;margin-bottom:8px}
.empty p{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--ink4);max-width:360px;margin:0 auto;line-height:1.7}
footer{background:var(--ink);color:var(--ink4);text-align:center;padding:18px;font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:.8px;margin-top:50px}
footer b{color:#fff}
@media(max-width:600px){
  .topbar{padding:5px 12px}.logo{padding:14px 12px 10px}
  .nb{padding:8px 12px;font-size:10px}.infobar{padding:8px 12px}
  .wrap{padding:0 10px 50px}.grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="topbar">
  <span><b>${dateStr}</b> · São Paulo, BR</span>
  <span>Atualizado às ${updStr} · Últimas 24 horas</span>
</div>
<div class="logo">
  <h1><em>BR</em>BRIEF</h1>
  <div class="sub">Serviços Financeiros · Saúde · Educação · Economia · Negócios · Política · Tecnologia</div>
</div>
<div class="srctags">
  <span>Brazil Journal</span><span>NeoFeed</span><span>Valor Econômico</span><span>Últimas 24h · Resumo automático</span>
</div>
<div class="nav">${navBtns}</div>
<div class="infobar">
  <span><b>${total} artigo${total !== 1 ? "s" : ""}</b> · últimas 24h · atualizado às ${updStr}</span>
  <a class="refresh-btn" href="/refresh">↻ Atualizar agora</a>
</div>
<div class="wrap">
  ${total === 0 ? `<div class="empty"><div class="empty-icon">🔎</div><h3>Nenhum artigo nas últimas 24h</h3><p>Os sites ainda não publicaram nada hoje. Tente mais tarde.</p></div>` : ""}
  ${THEMES.map(themeBlock).join("")}
</div>
<footer><b>BRBRIEF</b> · Brazil Journal · NeoFeed · Valor Econômico · Atualizado automaticamente a cada hora</footer>
<script>
function filter(cat,btn){
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.theme-block').forEach(b=>{
    b.style.display=(cat==='all'||b.dataset.theme===cat)?'':'none';
  });
}
</script>
</body>
</html>`;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.get("/",        (req, res) => res.send(buildHTML(cache.articles, cache.updatedAt)));
app.get("/refresh", async (req, res) => { await refresh(); res.redirect("/"); });
app.get("/health",  (req, res) => res.json({ status: "ok", articles: cache.articles.length, updatedAt: cache.updatedAt }));

// ── START ─────────────────────────────────────────────────────────────────────
(async () => {
  await refresh();
  setInterval(refresh, 60 * 60 * 1000);
  app.listen(PORT, () => console.log(`[BRBRIEF] Rodando na porta ${PORT}`));
})();
