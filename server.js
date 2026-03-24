const express = require("express");
const fetch = require("node-fetch");
const xml2js = require("xml2js");

const app = express();
const PORT = process.env.PORT || 3000;

// ── SOURCES ─────────────────────────────────────────────────────────────────
const SOURCES = [
  {
    name: "Brazil Journal",
    domain: "braziljournal.com",
    rss: "https://braziljournal.com/feed",
  },
  {
    name: "NeoFeed",
    domain: "neofeed.com.br",
    rss: "https://neofeed.com.br/feed",
  },
  {
    name: "Valor Econômico",
    domain: "valor.globo.com",
    rss: "https://www.valor.com.br/rss",
  },
];

// ── CACHE ────────────────────────────────────────────────────────────────────
let cache = { articles: [], updatedAt: null };

// ── CATEGORY KEYWORDS ────────────────────────────────────────────────────────
const KEYWORDS = {
  tech: [
    "inteligência artificial", "ia ", " ai ", "startup", "tecnologia",
    "software", "digital", "llm", "openai", "google", "amazon", "microsoft",
    "apple", "dados", "algoritmo", "robô", "automação", "chatgpt", "bezos",
    "spacex", "nasdaq", "ipo tech",
  ],
  eco: [
    "economia", "pib", "inflação", "juros", "selic", "banco central",
    "copom", "focus", "câmbio", "dólar", "ipca", "fiscal", "orçamento",
    "reforma tributária", "déficit", "superávit", "tesouro", "petróleo",
    "commodities", "exportação", "importação", "balança",
  ],
  pol: [
    "governo", "lula", "congresso", "câmara", "senado", "eleição",
    "presidente", "ministro", "stf", "judiciário", "partido", "candidato",
    "política", "voto", "aprovação", "psd", "pt ", "pl ", "caiado",
  ],
  biz: [
    "empresa", "ceo", "fusão", "aquisição", "m&a", "ipo", "bolsa", "ações",
    "mercado", "investimento", "fundo", "capital", "receita", "lucro",
    "resultado", "trimestre", "private equity", "venture", "startup",
    "banco", "fintech", "seguro", "varejo", "indústria",
  ],
};

function classify(text) {
  const t = text.toLowerCase();
  const scores = { tech: 0, eco: 0, pol: 0, biz: 0 };
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    for (const w of words) if (t.includes(w)) scores[cat]++;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "biz";
}

function timeAgo(date) {
  const mins = Math.round((Date.now() - date) / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.round(hrs / 24)}d`;
}

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ── FETCH ONE SOURCE ─────────────────────────────────────────────────────────
async function fetchSource(src, cutoff) {
  const res = await fetch(src.rss, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BRBRIEF/1.0)" },
    timeout: 10000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

  const items =
    parsed?.rss?.channel?.item ||
    parsed?.feed?.entry ||
    [];

  const arr = Array.isArray(items) ? items : [items];
  const results = [];

  for (const item of arr) {
    const pubDate = new Date(
      item.pubDate || item.updated || item.published || ""
    );
    if (isNaN(pubDate) || pubDate < cutoff) continue;

    const title = stripHtml(
      item.title?._ || item.title || ""
    ).trim();
    const link =
      item.link?.href ||
      (typeof item.link === "string" ? item.link : "") ||
      item.guid?._ ||
      item.guid ||
      "";
    const rawDesc =
      item.description ||
      item["content:encoded"] ||
      item.summary ||
      item.content?._ ||
      "";
    const desc = stripHtml(rawDesc);
    const summary = desc.length > 240 ? desc.slice(0, 237) + "…" : desc;
    const category = classify(title + " " + desc);

    if (title.length < 5) continue;

    results.push({
      title,
      link,
      summary: summary || "Clique para ler o artigo completo.",
      source: src.name,
      domain: src.domain,
      category,
      pubDate: pubDate.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
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

// ── HTML TEMPLATE ─────────────────────────────────────────────────────────────
function buildHTML(articles, updatedAt) {
  const total = articles.length;
  const updStr = updatedAt
    ? updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const dateStr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  const SOURCE_ORDER = ["Brazil Journal", "NeoFeed", "Valor Econômico"];
  const grouped = {};
  SOURCE_ORDER.forEach((s) => (grouped[s] = []));
  articles.forEach((a) => {
    if (grouped[a.source]) grouped[a.source].push(a);
  });

  const CAT_LABEL = {
    tech: "⚡ Tecnologia",
    eco: "📊 Economia",
    pol: "🏛 Política",
    biz: "💼 Negócios",
  };
  const CAT_CLS = {
    tech: "t-tech",
    eco: "t-eco",
    pol: "t-pol",
    biz: "t-biz",
  };

  function card(a) {
    const cls = CAT_CLS[a.category] || "t-biz";
    const lbl = CAT_LABEL[a.category] || "💼 Negócios";
    const href = a.link && a.link.startsWith("http") ? a.link : "#";
    return `
    <div class="card" data-cat="${a.category}">
      <div class="card-top">
        <span class="tag ${cls}">${lbl}</span>
        <span class="card-age">${a.ageStr} · ${a.pubDate}</span>
      </div>
      <h3>${a.title.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</h3>
      <p>${a.summary.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
      <a class="read-link" href="${href}" target="_blank" rel="noopener">
        Ler no ${a.source} →
      </a>
    </div>`;
  }

  function srcBlock(name, domain, arts) {
    if (!arts.length) return "";
    return `
  <div class="src-block" data-src="${name}">
    <div class="src-head">
      <h2>${name}</h2>
      <span class="dom">${domain}</span>
      <span class="cnt">${arts.length} artigo${arts.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="grid">
      ${arts.map(card).join("")}
    </div>
  </div>`;
  }

  const blocksHTML = SOURCE_ORDER.map((name) => {
    const src = SOURCES.find((s) => s.name === name);
    return srcBlock(name, src?.domain || "", grouped[name] || []);
  }).join("");

  const emptyMsg =
    total === 0
      ? `<div class="empty"><div class="empty-icon">🔎</div>
         <h3>Nenhum artigo nas últimas 24 horas</h3>
         <p>Os sites ainda não publicaram nada hoje. Tente mais tarde.</p></div>`
      : "";

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
.logo .sub{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:5px;color:var(--ink3);text-transform:uppercase;margin-top:7px}
.srctags{display:flex;justify-content:center;padding:7px 0;border-bottom:1px solid var(--rule);font-family:'DM Sans',sans-serif;font-size:11px;color:var(--ink3);flex-wrap:wrap}
.srctags span{padding:0 14px;border-right:1px solid var(--rule)}
.srctags span:last-child{border-right:none}
.nav{display:flex;justify-content:center;flex-wrap:wrap;border-bottom:2px solid var(--ink)}
.nb{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;padding:9px 18px;border:none;background:none;color:var(--ink3);cursor:pointer;border-right:1px solid var(--rule);white-space:nowrap;transition:all .15s}
.nb:last-child{border-right:none}
.nb.on{color:var(--paper);background:var(--ink)}
.nb:hover:not(.on){color:var(--red)}
.infobar{background:var(--paper2);border-bottom:1px solid var(--rule);padding:9px 24px;font-family:'DM Sans',sans-serif;font-size:11px;color:var(--ink3);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.infobar b{color:var(--ink)}
.refresh-btn{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;background:var(--ink);border:none;padding:6px 14px;cursor:pointer;transition:background .15s;text-decoration:none}
.refresh-btn:hover{background:var(--red)}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px 70px}
.src-block{margin-top:38px}
.src-head{display:flex;align-items:baseline;gap:10px;padding-bottom:9px;border-bottom:2px solid var(--ink)}
.src-head h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:700}
.src-head .dom{font-family:'DM Sans',sans-serif;font-size:10px;color:var(--ink4)}
.src-head .cnt{margin-left:auto;font-family:'DM Sans',sans-serif;font-size:10px;color:var(--ink4)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));border-left:1px solid var(--rule);border-top:1px solid var(--rule)}
.card{padding:20px 18px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);display:flex;flex-direction:column;gap:10px;transition:background .12s}
.card:hover{background:var(--paper2)}
.card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.tag{font-family:'DM Sans',sans-serif;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:3px 7px;white-space:nowrap}
.t-tech{background:#ddeaf5;color:#1b4f72}
.t-eco{background:#d6ead8;color:#1a5e32}
.t-biz{background:#f5e5d8;color:#6b2d04}
.t-pol{background:#ede9f5;color:#4a235a}
.card-age{font-family:'DM Sans',sans-serif;font-size:9px;color:var(--ink4)}
.card h3{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;line-height:1.4;color:var(--ink)}
.card p{font-size:12.5px;color:var(--ink3);line-height:1.75;flex:1}
.read-link{font-family:'DM Sans',sans-serif;font-size:10px;color:var(--red);font-weight:600;text-decoration:none;margin-top:4px;align-self:flex-end}
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
  <div class="sub">Negócios · Economia · Tecnologia · últimas 24 horas</div>
</div>
<div class="srctags">
  <span>Brazil Journal</span><span>NeoFeed</span><span>Valor Econômico</span>
  <span>Tecnologia & IA</span><span>Política & Economia</span><span>Negócios & Finanças</span>
</div>
<div class="nav">
  <button class="nb on" onclick="filter('all',this)">Todas</button>
  <button class="nb" onclick="filter('tech',this)">⚡ Tecnologia</button>
  <button class="nb" onclick="filter('eco',this)">📊 Economia</button>
  <button class="nb" onclick="filter('biz',this)">💼 Negócios</button>
  <button class="nb" onclick="filter('pol',this)">🏛 Política</button>
</div>
<div class="infobar">
  <span><b>${total} artigo${total !== 1 ? "s" : ""}</b> · últimas 24h · atualizado às ${updStr}</span>
  <a class="refresh-btn" href="/refresh">↻ Atualizar agora</a>
</div>
<div class="wrap" id="feed">
  ${emptyMsg}
  ${blocksHTML}
</div>
<footer>
  <b>BRBRIEF</b> · Brazil Journal · NeoFeed · Valor Econômico · Atualizado a cada hora automaticamente
</footer>
<script>
function filter(cat,btn){
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.card').forEach(c=>{
    c.style.display=(cat==='all'||c.dataset.cat===cat)?'':'none';
  });
  document.querySelectorAll('.src-block').forEach(s=>{
    const any=[...s.querySelectorAll('.card')].some(c=>c.style.display!=='none');
    s.style.display=any?'':'none';
  });
}
</script>
</body>
</html>`;
}

// ── ROUTES ─────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(buildHTML(cache.articles, cache.updatedAt));
});

app.get("/refresh", async (req, res) => {
  await refresh();
  res.redirect("/");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    articles: cache.articles.length,
    updatedAt: cache.updatedAt,
  });
});

// ── START ────────────────────────────────────────────────────────────────────
(async () => {
  await refresh(); // fetch on startup
  setInterval(refresh, 60 * 60 * 1000); // refresh every hour
  app.listen(PORT, () => {
    console.log(`[BRBRIEF] Servidor rodando na porta ${PORT}`);
  });
})();
