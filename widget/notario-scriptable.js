// Notario — widget kalendarzy na iPhone'a (Scriptable).
// Ten plik pobiera instalator „Notario” w Scriptable; nie trzeba go edytować.
// Dane: konto Notario (to samo co w aplikacji), czytane z serwera synchronizacji
// tylko do odczytu. Hasło nie jest zapisywane — tylko token sesji w pęku kluczy iOS.

const SB_URL = 'https://wdqljuhkaqokjelwuyvf.supabase.co';
const SB_KEY = 'sb_publishable_Si1QdjcU3n_-H_gqpZ6Z6A_XD2lYgmT';
const APP_URL = 'https://pawelpasik85-cyber.github.io/notario-app/';
const KC_SESSION = 'notario.widget.session';
const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const WD = ['nd', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const BG = '#0b1222';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- sign-in (token kept in the iOS keychain) ----------
function loadSession() {
  try { return Keychain.contains(KC_SESSION) ? JSON.parse(Keychain.get(KC_SESSION)) : null; } catch (e) { return null; }
}
function saveSession(t) {
  const s = { access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (Number(t.expires_in) || 3600) * 1000 };
  Keychain.set(KC_SESSION, JSON.stringify(s));
  return s;
}
async function auth(path, body) {
  const r = new Request(`${SB_URL}${path}`);
  r.method = 'POST';
  r.headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  r.body = JSON.stringify(body);
  const j = await r.loadJSON();
  if (!j || !j.access_token) throw new Error((j && (j.msg || j.error_description || j.message)) || 'Logowanie nie powiodło się');
  return saveSession(j);
}
async function token() {
  const s = loadSession();
  if (!s) return null;
  if (s.exp > Date.now() + 60000) return s.access;
  try { return (await auth('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh })).access; } catch (e) { return null; }
}
async function login() {
  const a = new Alert();
  a.title = 'Notario — logowanie';
  a.message = 'Zaloguj się tym samym kontem co w aplikacji Notario. Hasło nie zostanie zapisane.';
  a.addTextField('e-mail');
  a.addSecureTextField('hasło');
  a.addAction('Zaloguj');
  a.addCancelAction('Anuluj');
  if ((await a.presentAlert()) === -1) return null;
  return (await auth('/auth/v1/token?grant_type=password', { email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) })).access;
}

// ---------- data ----------
async function rows(tok, query) {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) {
    const r = new Request(`${SB_URL}/rest/v1/records?${query}&order=id&limit=1000&offset=${from}`);
    r.headers = { apikey: SB_KEY, Authorization: `Bearer ${tok}` };
    const j = await r.loadJSON();
    if (!Array.isArray(j)) throw new Error((j && j.message) || 'Brak danych z serwera');
    out.push(...j);
    if (j.length < 1000) break;
  }
  return out;
}
const ITEM_FIELDS = ['type', 'title', 'due_at', 'start_at', 'recurrence', 'status', 'category_id', 'folder_id', 'deleted_at'];
async function fetchRecords(tok) {
  const small = await rows(tok, 'select=tbl,id,data&deleted=eq.false&tbl=in.(categories,folders,calendars,orders,occurrence_states)');
  const sel = ['id', ...ITEM_FIELDS.map((f) => `${f}:data->>${f}`)].join(',');
  const items = await rows(tok, `select=${sel}&deleted=eq.false&tbl=eq.items&data->>due_at=not.is.null`);
  for (const it of items) {
    const data = {};
    for (const f of ITEM_FIELDS) data[f] = it[f];
    small.push({ tbl: 'items', id: it.id, data });
  }
  return small;
}

// ---------- drawing ----------
function pickPage(snap, param) {
  const p = (param || '').trim().toLowerCase();
  if (!p) return snap.pages[0];
  const n = parseInt(p, 10);
  if (!Number.isNaN(n) && snap.pages[n - 1]) return snap.pages[n - 1];
  return snap.pages.find((x) => x.name.toLowerCase() === p) || snap.pages.find((x) => x.name.toLowerCase().startsWith(p)) || snap.pages[0];
}

function drawGrid(page, today, size, weeksOnly) {
  const W = size.width, H = size.height;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const t = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const month = t.getMonth();
  let start, weeks;
  if (weeksOnly) {
    start = new Date(t); start.setDate(t.getDate() - ((t.getDay() + 6) % 7)); weeks = weeksOnly;
  } else {
    const first = new Date(t.getFullYear(), month, 1);
    const lead = (first.getDay() + 6) % 7;
    const daysIn = new Date(t.getFullYear(), month + 1, 0).getDate();
    start = new Date(first); start.setDate(1 - lead); weeks = Math.ceil((lead + daysIn) / 7);
  }
  const head = 14, cw = W / 7, ch = (H - head) / weeks;
  ctx.setFont(Font.mediumSystemFont(9));
  ctx.setTextColor(new Color('#8090a8'));
  ctx.setTextAlignedCenter();
  for (let i = 0; i < 7; i++) ctx.drawTextInRect(DOW[i], new Rect(cw * i, 0, cw, head));
  const off = new Set(page.off || []);
  const numSize = Math.min(13, ch * 0.42);
  for (let cell = 0; cell < weeks * 7; cell++) {
    const d = new Date(start); d.setDate(start.getDate() + cell);
    const key = ymd(d);
    const col = cell % 7, row = Math.floor(cell / 7);
    const r = new Rect(cw * col + 1.5, head + ch * row + 1.5, cw - 3, ch - 3);
    const other = !weeksOnly && d.getMonth() !== month;
    const marks = (page.days && page.days[key]) || [];
    const m0 = marks[0];
    const isOff = off.has(key);
    const isToday = key === today;
    let bg, alpha;
    if (m0 && m0.code) { bg = m0.c; alpha = other ? 0.3 : 0.8; }
    else if (m0) { bg = m0.c; alpha = other ? 0.1 : 0.28; }
    else if (isOff) { bg = '#ff4d5e'; alpha = other ? 0.06 : 0.15; }
    else { bg = '#ffffff'; alpha = other ? 0.015 : 0.04; }
    const p = new Path(); p.addRoundedRect(r, 6, 6);
    ctx.addPath(p); ctx.setFillColor(new Color(bg, alpha)); ctx.fillPath();
    const ny = r.y + 2;
    if (isToday) {
      const s = numSize + 7;
      ctx.setFillColor(new Color('#2f6bff'));
      ctx.fillEllipse(new Rect(r.x + r.width / 2 - s / 2, ny - 1.5, s, s));
    }
    let nc = isToday ? '#ffffff' : isOff ? '#ff6b78' : col >= 5 ? '#9aa6ba' : '#e8ecf4';
    if (m0 && m0.code && !isToday) nc = '#ffffff';
    ctx.setTextColor(new Color(nc, other ? 0.35 : 1));
    ctx.setFont(isOff || isToday ? Font.boldSystemFont(numSize) : Font.systemFont(numSize));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(String(d.getDate()), new Rect(r.x, ny + 1, r.width, numSize + 4));
    if (m0 && m0.code) {
      if (r.height > numSize * 2.1) {
        const cs = Math.min(9, ch * 0.3);
        ctx.setFont(Font.boldSystemFont(cs));
        ctx.setTextColor(new Color('#ffffff', other ? 0.4 : 1));
        ctx.drawTextInRect(m0.code, new Rect(r.x, r.y + r.height - cs - 5, r.width, cs + 3));
      }
    } else if (marks.length) {
      const k = Math.min(3, marks.length), dot = Math.min(5, r.width / 6), gap = dot * 1.5;
      const x0 = r.x + r.width / 2 - (gap * (k - 1)) / 2;
      for (let i = 0; i < k; i++) {
        ctx.setFillColor(new Color(marks[i].c, other ? 0.4 : 1));
        ctx.fillEllipse(new Rect(x0 + gap * i - dot / 2, r.y + r.height - dot - 3, dot, dot));
      }
    }
  }
  return ctx.getImage();
}

function whenLabel(d, today) {
  if (d === today) return 'dziś';
  const t = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + 1);
  if (d === ymd(t)) return 'jutro';
  const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return `${WD[x.getDay()]} ${x.getDate()}.${d.slice(5, 7)}`;
}

function addNext(w, page, today, max, fontSize) {
  const list = (page.next || []).filter((n) => n.d >= today).slice(0, max);
  if (!list.length) {
    const t = w.addText('Nic zaplanowanego');
    t.font = Font.systemFont(fontSize); t.textColor = new Color('#8090a8');
    return;
  }
  for (const n of list) {
    const row = w.addStack();
    row.centerAlignContent();
    const dot = row.addText('● ');
    dot.font = Font.systemFont(fontSize); dot.textColor = new Color(n.c || '#7c5cff');
    const when = row.addText(`${whenLabel(n.d, today)}${n.time ? ` ${n.time}` : ''}  `);
    when.font = Font.mediumSystemFont(fontSize); when.textColor = new Color('#93a3bd');
    const txt = row.addText(`${n.s && n.s !== 'termin' ? `${n.s}: ` : ''}${n.t}`);
    txt.font = Font.systemFont(fontSize); txt.textColor = new Color('#e8ecf4'); txt.lineLimit = 1;
  }
}

function buildWidget(snap, page, family, note) {
  const today = ymd(new Date());
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color(page.color || '#7c5cff', 0.35), new Color(BG, 1), new Color(BG, 1)];
  g.locations = [0, 0.45, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  w.setPadding(12, 12, 10, 12);
  w.url = `scriptable:///run/${encodeURIComponent(Script.name())}?cal=${encodeURIComponent(page.id)}`;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText(`${page.icon || ''} ${page.name}`);
  title.font = Font.boldSystemFont(family === 'small' ? 13 : 15); title.textColor = Color.white(); title.lineLimit = 1;
  head.addSpacer();
  if (family !== 'small') {
    const n = snap.pages.length;
    const idx = snap.pages.indexOf(page);
    const dots = head.addText(n > 1 ? snap.pages.map((_, i) => (i === idx ? '●' : '○')).join(' ') : '');
    dots.font = Font.systemFont(7); dots.textColor = new Color('#8090a8');
  }
  const t = new Date();
  const info = w.addText(`${MONTHS[t.getMonth()]} ${t.getFullYear()} · ${page.info || ''}${note ? ` · ${note}` : ''}`);
  info.font = Font.systemFont(10); info.textColor = new Color('#aab4c8'); info.lineLimit = 1;
  w.addSpacer(6);

  if (family === 'small') {
    addNext(w, page, today, 3, 10);
    w.addSpacer();
  } else if (family === 'medium') {
    const img = w.addImage(drawGrid(page, today, new Size(320, 80), 2));
    img.imageSize = new Size(320, 80); img.centerAlignImage();
    w.addSpacer(4);
    addNext(w, page, today, 1, 10);
  } else {
    const img = w.addImage(drawGrid(page, today, new Size(320, 230)));
    img.imageSize = new Size(320, 230); img.centerAlignImage();
    w.addSpacer(6);
    addNext(w, page, today, 3, 11);
  }
  return w;
}

function messageWidget(text) {
  const w = new ListWidget();
  w.backgroundColor = new Color(BG);
  const h = w.addText('📅 Notario'); h.font = Font.boldSystemFont(15); h.textColor = Color.white();
  w.addSpacer(6);
  const t = w.addText(text); t.font = Font.systemFont(12); t.textColor = new Color('#aab4c8');
  return w;
}


// ---------- full-screen preview (opened by tapping the widget) ----------
// Swipe left / right = the next / previous calendar; ‹ › = month; tap a day = what is on it.
function viewerHtml(snap, startId) {
  const data = JSON.stringify({ snap, startId, app: APP_URL }).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="pl"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">' +
  '<style>' +
  ':root{color-scheme:dark}html{background:#0b1222}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
  'body{margin:0;min-height:100vh;background:#0b1222;color:#e8ecf4;font:15px -apple-system,system-ui,sans-serif;overflow-x:hidden;' +
  'padding:calc(env(safe-area-inset-top) + 8px) 14px calc(env(safe-area-inset-bottom) + 16px);transition:background .25s}' +
  '.tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -14px 10px;padding:0 14px}.tabs::-webkit-scrollbar{display:none}' +
  '.tabs button{flex:none;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#aab4c8;border-radius:999px;padding:7px 12px;font:inherit;font-size:13.5px;font-weight:600}' +
  '.tabs button.on{color:#fff;border-color:var(--c);background:color-mix(in srgb,var(--c) 35%,transparent)}' +
  '.dots{text-align:center;color:#56637a;font-size:9px;letter-spacing:4px;margin:-4px 0 6px}.dots b{color:#fff}' +
  'h1{font-size:22px;margin:4px 0 2px}.info{color:#aab4c8;font-size:13px;margin-bottom:12px}' +
  '.mh{display:flex;align-items:center;gap:8px;margin-bottom:6px}.mh h2{flex:1;font-size:17px;margin:0}' +
  '.mh button{width:38px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;font-size:20px}' +
  '.mh button:disabled{opacity:.25}' +
  '.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.dow{text-align:center;font-size:11px;color:#8090a8;padding-bottom:2px}' +
  '.d{position:relative;height:48px;border-radius:9px;background:rgba(255,255,255,.04);border:0;color:#e8ecf4;font:inherit;font-size:14px;padding:4px 0 0;display:flex;flex-direction:column;align-items:center;gap:3px}' +
  '.d.o{opacity:.35}.d.we span{color:#9aa6ba}.d.off{background:rgba(255,77,94,.14)}.d.off span{color:#ff6b78;font-weight:700}' +
  '.d.t span{background:#2f6bff;color:#fff;border-radius:999px;padding:0 7px;font-weight:700}' +
  '.d.sel{outline:2px solid var(--c);outline-offset:-2px}' +
  '.d.code{background:var(--m)}.d.code span{color:#fff}.d i{font-style:normal;font-size:10px;font-weight:800;color:#fff;background:var(--m);border-radius:5px;padding:2px 4px;line-height:1}' +
  '.d.tint{background:color-mix(in srgb,var(--m) 26%,rgba(255,255,255,.03))}' +
  '.dt{display:flex;gap:3px}.dt em{width:5px;height:5px;border-radius:50%}' +
  'h3{font-size:15px;margin:16px 0 8px}' +
  '.row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.04);border-left:4px solid var(--c);margin-bottom:6px}' +
  '.row small{color:#93a3bd;display:block;font-size:12px}.row .w{min-width:62px;color:#93a3bd;font-size:12.5px}' +
  '.empty{color:#8090a8;font-size:13.5px}' +
  '.foot{margin-top:18px;display:grid;gap:8px}.foot a{display:block;text-align:center;padding:12px;border-radius:12px;background:rgba(255,255,255,.06);color:#c4b5fd;text-decoration:none;font-weight:600}' +
  '.hint{color:#6b7891;font-size:12px;text-align:center;margin-top:6px}' +
  '#page{transition:transform .22s ease,opacity .22s ease}' +
  '</style></head><body><nav class="tabs" id="tabs"></nav><div class="dots" id="dots"></div><div id="page"></div>' +
  '<div class="foot"><a id="open" href="#">Otwórz Notario</a><a href="notario:logout" style="color:#f87171">Wyloguj widżet</a></div>' +
  '<p class="hint">Przesuń palcem w bok, aby przejść do innego kalendarza.</p>' +
  '<script>var D=' + data + ';' + VIEWER_JS + '</script></body></html>';
}
const VIEWER_JS = `
var S=D.snap,P=S.pages,today=S.today,cur=Math.max(0,P.findIndex(function(p){return p.id===D.startId})),mo=0,sel=null;
var MONTHS=['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
var WD=['nd','pon','wt','śr','czw','pt','sob'];
function pad(n){return (n<10?'0':'')+n}
function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function when(d){if(d===today)return 'dziś';var t=new Date(+today.slice(0,4),+today.slice(5,7)-1,+today.slice(8,10)+1);if(d===ymd(t))return 'jutro';var x=new Date(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10));return WD[x.getDay()]+' '+x.getDate()+'.'+d.slice(5,7)}
function render(dir){
  var p=P[cur],c=p.color||'#7c5cff';document.documentElement.style.setProperty('--c',c);
  document.body.style.background='linear-gradient(180deg,'+c+'33 0,#0b1222 260px) no-repeat #0b1222';
  document.getElementById('tabs').innerHTML=P.map(function(x,i){return '<button data-i="'+i+'" class="'+(i===cur?'on':'')+'" style="--c:'+(x.color||'#7c5cff')+'">'+esc(x.icon)+' '+esc(x.name)+'</button>'}).join('');
  document.getElementById('dots').innerHTML=P.length>1?P.map(function(x,i){return i===cur?'<b>●</b>':'○'}).join(''):'';
  var tb=document.querySelector('.tabs .on');if(tb)tb.scrollIntoView({inline:'center',block:'nearest'});
  var t=new Date(+today.slice(0,4),+today.slice(5,7)-1+mo,1),m=t.getMonth(),lead=(t.getDay()+6)%7,n=new Date(t.getFullYear(),m+1,0).getDate(),weeks=Math.ceil((lead+n)/7);
  var off={};(p.off||[]).forEach(function(d){off[d]=1});
  var h='<h1>'+esc(p.icon)+' '+esc(p.name)+'</h1><div class="info">'+esc(p.info)+'</div>';
  h+='<div class="mh"><h2>'+MONTHS[m]+' '+t.getFullYear()+'</h2><button id="pm" '+(mo<=0?'disabled':'')+'>‹</button><button id="nm" '+(mo>=1?'disabled':'')+'>›</button></div>';
  h+='<div class="grid">'+['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(function(x){return '<div class="dow">'+x+'</div>'}).join('');
  for(var k=0;k<weeks*7;k++){
    var d=new Date(t.getFullYear(),m,1-lead+k),key=ymd(d),mk=(p.days&&p.days[key])||[],m0=mk[0],cls='d';
    if(d.getMonth()!==m)cls+=' o';if(k%7>=5)cls+=' we';if(off[key])cls+=' off';if(key===today)cls+=' t';if(key===sel)cls+=' sel';
    var inner='<span>'+d.getDate()+'</span>',st='';
    if(m0&&m0.code){cls+=' code';st=' style="--m:'+m0.c+'"';inner+='<i>'+esc(m0.code)+'</i>'}
    else if(m0){cls+=' tint';st=' style="--m:'+m0.c+'"';inner+='<div class="dt">'+mk.slice(0,3).map(function(x){return '<em style="background:'+x.c+'"></em>'}).join('')+'</div>'}
    h+='<button class="'+cls+'"'+st+' data-d="'+key+'">'+inner+'</button>';
  }
  h+='</div>';
  var rows;
  if(sel){var l=(p.list&&p.list[sel])||[];h+='<h3>'+when(sel)+'</h3>';rows=l.map(function(e){return '<div class="row" style="--c:'+e.c+'"><div>'+(e.time?'<b>'+e.time+'</b> ':'')+esc(e.t)+(e.s?'<small>'+esc(e.s)+'</small>':'')+'</div></div>'}).join('')||'<p class="empty">Nic tego dnia.</p>'}
  else{h+='<h3>Najbliższe</h3>';rows=(p.next||[]).filter(function(e){return e.d>=today}).map(function(e){return '<div class="row" style="--c:'+e.c+'"><span class="w">'+when(e.d)+(e.time?'<br>'+e.time:'')+'</span><div>'+(e.s?esc(e.s)+': ':'')+esc(e.t)+'</div></div>'}).join('')||'<p class="empty">Nic zaplanowanego.</p>'}
  h+=rows;
  var pg=document.getElementById('page');pg.innerHTML=h;
  if(dir){pg.style.transition='none';pg.style.transform='translateX('+(dir*40)+'px)';pg.style.opacity='.3';pg.offsetWidth;pg.style.transition='';pg.style.transform='';pg.style.opacity=''}
  document.getElementById('open').href=D.app+'?cal='+encodeURIComponent(p.id);
}
function go(i,dir){if(i<0||i>=P.length)return;cur=i;sel=null;mo=0;render(dir)}
document.addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  if(b.dataset.i)go(+b.dataset.i,+b.dataset.i>cur?1:-1);
  else if(b.id==='pm'){mo=0;sel=null;render(-1)}else if(b.id==='nm'){mo=1;sel=null;render(1)}
  else if(b.dataset.d){sel=sel===b.dataset.d?null:b.dataset.d;render(0)}
});
var sx=null,sy=0;
document.addEventListener('touchstart',function(e){var t=e.touches[0];sx=t.clientX;sy=t.clientY},{passive:true});
document.addEventListener('touchend',function(e){if(sx==null)return;var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;sx=null;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.4){if(e.target.closest('.tabs'))return;go(cur+(dx<0?1:-1),dx<0?1:-1)}},{passive:true});
render(0);
`;

async function showViewer(snap, startId) {
  const wv = new WebView();
  wv.shouldAllowRequest = (req) => {
    const u = String(req.url || '');
    if (u.startsWith('notario:logout')) {
      Keychain.remove(KC_SESSION);
      wv.loadHTML('<body style="background:#0b1222;color:#e8ecf4;font:17px -apple-system;padding:60px 24px;text-align:center">Wylogowano. Uruchom skrypt Notario ponownie, aby się zalogować.</body>');
      return false;
    }
    if (u.startsWith('http')) { Safari.open(u); return false; }
    return true;
  };
  await wv.loadHTML(viewerHtml(snap, startId));
  await wv.present(true);
}

// ---------- main ----------
async function run(core) {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), 'notario-widget-cache.json');
  const family = config.widgetFamily || 'large';
  let tok = await token();
  if (!tok && config.runsInApp) {
    try { tok = await login(); } catch (e) {
      const a = new Alert(); a.title = 'Nie udało się zalogować'; a.message = String(e.message || e); a.addAction('OK'); await a.presentAlert();
    }
  }
  let snap = null;
  let note = '';
  if (tok) {
    try {
      const recs = await fetchRecords(tok);
      snap = core.snapshotFromRecords(recs, ymd(new Date()));
      fm.writeString(cachePath, JSON.stringify(snap));
    } catch (e) { note = 'offline'; }
  }
  if (!snap && fm.fileExists(cachePath)) {
    try { snap = JSON.parse(fm.readString(cachePath)); note = note || 'zapisane'; } catch (e) { snap = null; }
  }
  if (!snap) {
    const w = messageWidget(tok ? 'Brak połączenia z serwerem. Spróbuj później.' : 'Otwórz Scriptable i uruchom skrypt „Notario”, aby się zalogować.');
    if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
    return;
  }

  if (config.runsInWidget) {
    Script.setWidget(buildWidget(snap, pickPage(snap, args.widgetParameter), family, note));
    return;
  }

  // Run in the app (also when the widget is tapped): the full-screen preview.
  const q = (args.queryParameters || {});
  await showViewer(snap, q.cal || (snap.pages[0] && snap.pages[0].id));
};
run.viewerHtml = viewerHtml;
module.exports = run;
