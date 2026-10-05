// Local funnels dashboard: `npm run funnels` then open http://localhost:4747
//
// Reads funnel_events + web_events with the service-role key from .env
// (SUPABASE_SERVICE_ROLE_KEY — same key scripts/upload-exercise-media.mjs uses)
// and serves aggregate counts on localhost only. The key never reaches the
// browser and the server binds to 127.0.0.1, so nothing is exposed.

import fs from 'node:fs';
import http from 'node:http';
import { summarize } from './lib/funnelStats.mjs';

try {
  for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env optional if vars are already exported */ }

const URL_ = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = Number(process.env.PORT || 4747);
if (!URL_ || !KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL). Add them to .env — Supabase dashboard → Settings → API → service_role.');
  process.exit(1);
}

async function fetchAll(table, columns, sinceIso) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=${columns}&created_at=gte.${encodeURIComponent(sinceIso)}&order=id.asc`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RYZR Funnels</title>
<style>
:root{--bg:#0A0A0A;--s:#1A1A1A;--b:#2a2a2a;--t:#fff;--m:#888;--a:#FF6B22}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:14px -apple-system,Segoe UI,sans-serif;padding:24px;max-width:960px;margin:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--a);margin:28px 0 10px}
.bar{display:flex;gap:8px;align-items:center;margin:12px 0 0;color:var(--m)}
select,button{background:var(--s);color:var(--t);border:1px solid var(--b);border-radius:8px;padding:8px 12px;min-height:44px}
.card{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:16px}
.row{display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;margin:8px 0}
.track{height:12px;background:var(--b);border-radius:6px;overflow:hidden}.fill{height:100%;background:var(--a)}
.n{text-align:right;font-variant-numeric:tabular-nums}.m{color:var(--m);font-size:12px}
table{width:100%;border-collapse:collapse}td,th{padding:8px 4px;border-bottom:1px solid var(--b);text-align:left}th{color:var(--m);font-weight:500}td.n,th.n{text-align:right}
@media(max-width:560px){.row{grid-template-columns:110px 1fr 70px}}
</style>
<h1>RYZR Funnels</h1><div class="m" id="meta">Loading…</div>
<div class="bar"><label>Range <select id="days"><option>7</option><option selected>30</option><option>90</option><option>365</option></select> days</label><button id="go">Refresh</button></div>
<div id="out"></div>
<script>
const $=id=>document.getElementById(id),pct=x=>(x*100).toFixed(0)+'%';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fun=(t,rows)=>'<h2>'+t+'</h2><div class="card">'+rows.map(r=>'<div class="row"><span>'+esc(r.label)+'</span><div class="track"><div class="fill" style="width:'+(r.pctOfFirst*100)+'%"></div></div><span class="n">'+r.count+' <span class="m">'+pct(r.pctOfPrev)+'</span></span></div>').join('')+'<div class="m">Number = people; % = of previous step.</div></div>';
const tbl=(t,h,rows)=>'<h2>'+t+'</h2><div class="card"><table><tr>'+h.map((x,i)=>'<th'+(i?' class="n"':'')+'>'+x+'</th>').join('')+'</tr>'+(rows.length?rows.map(r=>'<tr>'+r.map((x,i)=>'<td'+(i?' class="n"':'')+'>'+esc(x)+'</td>').join('')+'</tr>').join(''):'<tr><td class="m">No data</td></tr>')+'</table></div>';
async function load(){$('meta').textContent='Loading…';
 try{const r=await fetch('/api/stats?days='+$('days').value);const s=await r.json();if(!r.ok)throw new Error(s.error);
 $('meta').textContent=s.rows.app+' app events, '+s.rows.web+' web events · updated '+new Date().toLocaleTimeString();
 $('out').innerHTML=fun('Website',s.web)+fun('In-app onboarding',s.app)
  +tbl('Paywall',['','People'],[['Viewed',s.paywall.viewed],['Purchased',s.paywall.purchased]])
  +tbl('Paywall by source',['Source','Viewed'],s.paywallViews.map(x=>[x.name,x.count]))
  +tbl('Purchases by plan',['Plan','People'],s.purchases.map(x=>[x.name,x.count]))
  +tbl('Plan choice',['Choice','People'],s.planChoice.map(x=>[x.name,x.count]))
  +tbl('Ad campaigns',['Campaign','Landing','CTA','Store'],s.campaigns.map(x=>[x.name,x.landing,x.cta,x.store]));
 }catch(e){$('meta').textContent='Error: '+e.message}}
$('go').onclick=load;$('days').onchange=load;load();
</script>`;

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/stats') {
    try {
      const days = Math.min(730, Math.max(1, Number(u.searchParams.get('days')) || 30));
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const [app, web] = await Promise.all([
        fetchAll('funnel_events', 'step,device_id,props', since),
        fetchAll('web_events', 'step,session_id,utm_campaign', since),
      ]);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(summarize(app, web)));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
}).listen(PORT, '127.0.0.1', () => console.log(`RYZR funnels → http://localhost:${PORT}`));
