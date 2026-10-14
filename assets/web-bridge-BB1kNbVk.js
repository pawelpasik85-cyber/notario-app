import{n as S,i as O,N as b,a as yt,V as p,b as j,e as dt,c as C,l as oe,d as Ce,f as Te,t as _e,g as Rt,p as At,h as gt,j as Ot,k as St,m as wt,S as It}from"./index-CO43-aLQ.js";function Dt(e){let t=0;return function(o){const s=`sp_${t}`;e.exec(t===0?"BEGIN IMMEDIATE":`SAVEPOINT ${s}`),t++;try{const c=o();return t--,e.exec(t===0?"COMMIT":`RELEASE ${s}`),c}catch(c){throw t--,e.exec(t===0?"ROLLBACK":`ROLLBACK TO ${s}; RELEASE ${s}`),c}}}function ht(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const fe=[{name:"categories",key:["id"],scope:"all",mergeBy:{col:"name",where:"deleted_at IS NULL",nocase:!0}},{name:"tags",key:["id"],scope:"all",mergeBy:{col:"name",nocase:!0}},{name:"folders",key:["id"],scope:"own",refs:{category_id:"categories",parent_id:"folders"},mergeBy:{col:"name",where:"parent_id IS NULL AND deleted_at IS NULL",nocase:!0,sameSpace:!0}},{name:"items",key:["id"],scope:"own",refs:{category_id:"categories",folder_id:"folders"},localOnly:["opened_at"]},{name:"files",key:["id"],scope:"file",mergeBy:{col:"sha256"}},{name:"payments",key:["item_id"],scope:"item",itemCol:"item_id"},{name:"occurrence_states",key:["item_id","occurrence_key"],scope:"item",itemCol:"item_id"},{name:"checklist_items",key:["id"],scope:"item",itemCol:"item_id"},{name:"item_tags",key:["item_id","tag_id"],scope:"item",itemCol:"item_id",refs:{tag_id:"tags"}},{name:"item_links",key:["from_item_id","to_item_id","relation"],scope:"item",itemCol:"from_item_id"},{name:"item_files",key:["item_id","file_id"],scope:"item",itemCol:"item_id",refs:{file_id:"files"}},{name:"reminder_rules",key:["id"],scope:"item",itemCol:"item_id"},{name:"goals",key:["id"],scope:"own",since:3},{name:"calendars",key:["id"],scope:"own",since:4},{name:"orders",key:["id"],scope:"own",since:4,refs:{calendar_id:"calendars"}},{name:"class_slots",key:["id"],scope:"own",since:5,refs:{calendar_id:"calendars"}},{name:"vault",key:["id"],scope:"own",since:10}],P=new Map(fe.map(e=>[e.name,e])),Ne="|",pe=(e,t)=>e.key.map(r=>`${t}.${r}`).join(` || '${Ne}' || `),q="strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",ee="(SELECT value FROM sync_state WHERE key = 'applying') = '0'",Ct=["type","title","body_json","body_text","folder_id","parent_item_id","category_id","status","priority","favorite","pinned","sort_order","start_at","due_at","all_day","recurrence","completed_at","trashed_with","created_at","updated_at","deleted_at","space_id"];function Ut(){const e=[`
ALTER TABLE folders ADD COLUMN space_id TEXT;
ALTER TABLE items ADD COLUMN space_id TEXT;
CREATE INDEX idx_items_space ON items(space_id);

-- Local changes waiting to be sent (one row per changed row; newest change time).
CREATE TABLE sync_outbox (
  tbl         TEXT NOT NULL,
  id          TEXT NOT NULL,
  changed_at  TEXT NOT NULL,
  PRIMARY KEY (tbl, id)
);
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO sync_state (key, value) VALUES ('applying', '0');
-- Remote ids matched to local rows (same tag name / same file on two devices).
CREATE TABLE sync_idmap (
  tbl        TEXT NOT NULL,
  remote_id  TEXT NOT NULL,
  local_id   TEXT NOT NULL,
  PRIMARY KEY (tbl, remote_id)
);
-- Photo/file bytes to upload ('up') or download ('down').
CREATE TABLE sync_blobs (
  sha256    TEXT NOT NULL,
  space_id  TEXT NOT NULL,
  dir       TEXT NOT NULL CHECK (dir IN ('up', 'down')),
  mime      TEXT NOT NULL,
  tries     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sha256, space_id, dir)
);

-- An item placed in a folder belongs to the folder's space; a subfolder to its parent's.
CREATE TRIGGER space_item_ai AFTER INSERT ON items WHEN new.folder_id IS NOT NULL BEGIN
  UPDATE items SET space_id = (SELECT space_id FROM folders WHERE id = new.folder_id)
  WHERE id = new.id AND EXISTS (SELECT 1 FROM folders WHERE id = new.folder_id);
END;
CREATE TRIGGER space_item_au AFTER UPDATE OF folder_id ON items WHEN new.folder_id IS NOT NULL BEGIN
  UPDATE items SET space_id = (SELECT space_id FROM folders WHERE id = new.folder_id)
  WHERE id = new.id AND EXISTS (SELECT 1 FROM folders WHERE id = new.folder_id)
    AND space_id IS NOT (SELECT space_id FROM folders WHERE id = new.folder_id);
END;
CREATE TRIGGER space_folder_ai AFTER INSERT ON folders WHEN new.parent_id IS NOT NULL BEGIN
  UPDATE folders SET space_id = (SELECT space_id FROM folders WHERE id = new.parent_id)
  WHERE id = new.id AND EXISTS (SELECT 1 FROM folders WHERE id = new.parent_id);
END;
`];for(const r of fe.filter(o=>!o.since))e.push(V(r));e.push(`
CREATE TRIGGER sync_item_files_file_ai AFTER INSERT ON item_files WHEN ${ee} BEGIN
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('files', new.file_id, ${q});
END;`);const t=fe.filter(r=>r.scope==="item");return e.push(`
CREATE TRIGGER sync_items_space_au AFTER UPDATE OF space_id ON items WHEN ${ee} BEGIN
${t.map(r=>`  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${r.name}', ${pe(r,r.name)}, ${q} FROM ${r.name} WHERE ${r.itemCol} = new.id;`).join(`
`)}
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', file_id, ${q} FROM item_files WHERE item_id = new.id;
END;`),e.join(`
`)}function V(e){const t=o=>`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${e.name}', ${pe(e,o)}, ${q});`,r=e.name==="items"?` OF ${Ct.filter(o=>!(e.localOnly??[]).includes(o)).join(", ")}`:"";return`
CREATE TRIGGER sync_${e.name}_ai AFTER INSERT ON ${e.name} WHEN ${ee} BEGIN ${t("new")} END;
CREATE TRIGGER sync_${e.name}_au AFTER UPDATE${r} ON ${e.name} WHEN ${ee} BEGIN ${t("new")} END;
CREATE TRIGGER sync_${e.name}_ad AFTER DELETE ON ${e.name} WHEN ${ee} BEGIN ${t("old")} END;
-- Everything that already exists goes out on the first sync.
INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${e.name}', ${pe(e,e.name)}, ${q} FROM ${e.name};`}function vt(){return`
CREATE TABLE goals (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  period        TEXT NOT NULL CHECK (period IN ('week', 'month', 'year')),
  period_start  TEXT NOT NULL,              -- first day of that week / month / year
  target        INTEGER,                    -- e.g. 12 trainings; NULL = simply done / not done
  progress      INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  color         TEXT,
  sort_order    REAL NOT NULL DEFAULT 0,
  space_id      TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_goals_period ON goals(period, period_start);
${V(P.get("goals"))}`}function Mt(){return`
CREATE TABLE calendars (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,                        -- emoji / sign shown on the tab (📦, 🎓…)
  item_label  TEXT NOT NULL DEFAULT 'Zlecenie',  -- what one entry is called: Zlecenie, Zajęcia, Projekt…
  color       TEXT,
  sort_order  REAL NOT NULL DEFAULT 0,
  space_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE orders (
  id            TEXT PRIMARY KEY,
  calendar_id   TEXT NOT NULL,
  title         TEXT NOT NULL,
  client        TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  start_date    TEXT NOT NULL,             -- YYYY-MM-DD: work starts
  due_date      TEXT NOT NULL,             -- YYYY-MM-DD: must be done
  ship_date     TEXT,                      -- YYYY-MM-DD: shipping / hand-over (optional)
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'ready', 'shipped', 'cancelled')),
  amount_minor  INTEGER,
  remind_days   INTEGER,                   -- remind N days before the deadline and the shipping (NULL = no)
  space_id      TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_orders_calendar ON orders(calendar_id, due_date);
${V(P.get("calendars"))}
${V(P.get("orders"))}`}function kt(){return`
ALTER TABLE calendars ADD COLUMN kind TEXT NOT NULL DEFAULT 'orders';   -- 'orders' | 'study'
ALTER TABLE orders ADD COLUMN tag TEXT;                                 -- Projekt, Kolokwium, Egzamin…
CREATE TABLE class_slots (
  id           TEXT PRIMARY KEY,
  calendar_id  TEXT NOT NULL,
  subject      TEXT NOT NULL,
  form         TEXT NOT NULL DEFAULT '',     -- wykład, ćwiczenia, laboratorium…
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Monday
  start_time   TEXT NOT NULL,               -- HH:mm
  end_time     TEXT NOT NULL,
  room         TEXT NOT NULL DEFAULT '',
  teacher      TEXT NOT NULL DEFAULT '',
  every        TEXT NOT NULL DEFAULT 'week' CHECK (every IN ('week', 'odd', 'even')),  -- co tydzień / tygodnie nieparzyste / parzyste
  color        TEXT,
  space_id     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_class_slots_calendar ON class_slots(calendar_id, weekday, start_time);
${V(P.get("class_slots"))}`}function Ft(){return`
ALTER TABLE orders ADD COLUMN cost_minor INTEGER;   -- grosze
`}function bt(){return`
CREATE TABLE vault (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('meta', 'entry')),
  payload     TEXT NOT NULL,          -- meta: salt + check; entry: {"iv","ct"} (ciphertext only)
  space_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
${V(P.get("vault"))}`}function $t(){return`
ALTER TABLE calendars ADD COLUMN leave TEXT;    -- {"uw":26,"years":{"2026":20}}
`}function Ht(){return`
ALTER TABLE calendars ADD COLUMN logo TEXT;     -- small image as data URL (≤ ~60 kB)
ALTER TABLE calendars ADD COLUMN color2 TEXT;   -- second brand colour (gradient)
`}const x=e=>`replace(replace(${e}, 'ł', 'l'), 'Ł', 'L')`,B=e=>x(`
  coalesce((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = ${e}), '')
  || ' ' ||
  coalesce((SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id
            WHERE x.item_id = ${e}), '')`),Wt=[{version:1,name:"initial schema",sql:`
-- Colour groups used across calendar/tasks (Praca, Płatności, Dom, …) -------
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  icon        TEXT,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- Folders and projects (a project is a folder with kind = 'project') --------
CREATE TABLE folders (
  id             TEXT PRIMARY KEY,
  parent_id      TEXT REFERENCES folders(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'folder' CHECK (kind IN ('folder', 'project')),
  name           TEXT NOT NULL,
  icon           TEXT,
  color          TEXT,
  description    TEXT NOT NULL DEFAULT '',
  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order     REAL NOT NULL DEFAULT 0,
  calendar_sync  INTEGER NOT NULL DEFAULT 1,     -- items with dates show in calendar
  item_defaults  TEXT,                           -- JSON template for new items
  settings       TEXT,                           -- JSON, folder-specific options
  trashed_with   TEXT,                           -- id of the folder whose deletion trashed this row
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX idx_folders_parent ON folders(parent_id, sort_order);

CREATE TABLE tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- The single object behind notes, tasks, events, payments and duties -------
CREATE TABLE items (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('note', 'task', 'event')),
  title           TEXT NOT NULL DEFAULT '',
  body_json       TEXT,                          -- rich-text document (editor JSON)
  body_text       TEXT NOT NULL DEFAULT '',      -- plain text for search/preview
  folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
  parent_item_id  TEXT REFERENCES items(id) ON DELETE SET NULL,
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  status          TEXT CHECK (status IS NULL OR status IN ('todo', 'in_progress', 'done', 'on_hold')),
  priority        INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3), -- 0 low … 3 critical
  favorite        INTEGER NOT NULL DEFAULT 0,
  pinned          INTEGER NOT NULL DEFAULT 0,
  sort_order      REAL NOT NULL DEFAULT 0,
  start_at        TEXT,
  due_at          TEXT,
  all_day         INTEGER NOT NULL DEFAULT 0,
  recurrence      TEXT,                          -- JSON RecurrenceRule (stage 7)
  completed_at    TEXT,
  opened_at       TEXT,
  trashed_with    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX idx_items_folder  ON items(folder_id, sort_order);
CREATE INDEX idx_items_due     ON items(due_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_items_type    ON items(type, status);
CREATE INDEX idx_items_updated ON items(updated_at);
CREATE INDEX idx_items_opened  ON items(opened_at);
CREATE INDEX idx_items_parent  ON items(parent_item_id);

-- Payment facet (1:1). A payment is a task with an amount. -----------------
CREATE TABLE payments (
  item_id       TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  amount_minor  INTEGER,                         -- grosze, avoids float rounding
  currency      TEXT NOT NULL DEFAULT 'PLN',
  account       TEXT NOT NULL DEFAULT '',        -- account number / description
  payee         TEXT NOT NULL DEFAULT ''
);

-- What the user did with ONE occurrence of a recurring item -----------------
CREATE TABLE occurrence_states (
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  occurrence_key  TEXT NOT NULL,                 -- local due time of that occurrence
  status          TEXT NOT NULL CHECK (status IN ('done', 'skipped')),
  completed_at    TEXT,
  amount_minor    INTEGER,                       -- actually paid, if different
  note            TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (item_id, occurrence_key)
);

CREATE TABLE checklist_items (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_checklist_item ON checklist_items(item_id, sort_order);

CREATE TABLE item_tags (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX idx_item_tags_tag ON item_tags(tag_id);

-- Free-form relations between items (note ↔ task ↔ note) -------------------
CREATE TABLE item_links (
  from_item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  to_item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  relation      TEXT NOT NULL DEFAULT 'related',
  created_at    TEXT NOT NULL,
  PRIMARY KEY (from_item_id, to_item_id, relation)
);
CREATE INDEX idx_item_links_to ON item_links(to_item_id);

-- Content-addressed file store (bytes live on disk under their sha256) ------
CREATE TABLE files (
  id          TEXT PRIMARY KEY,
  sha256      TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT NOT NULL
);

CREATE TABLE item_files (
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  role        TEXT NOT NULL DEFAULT 'attachment' CHECK (role IN ('attachment', 'inline')),
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (item_id, file_id)
);
CREATE INDEX idx_item_files_file ON item_files(file_id);

-- Reminders (stage 8) -----------------------------------------------------
CREATE TABLE reminder_rules (
  id                       TEXT PRIMARY KEY,
  item_id                  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  mode                     TEXT NOT NULL CHECK (mode IN ('before', 'on_day', 'absolute')),
  offset_minutes           INTEGER,              -- 'before': minutes before due
  time_of_day              TEXT,                 -- 'HH:mm' override for day-based offsets
  absolute_at              TEXT,                 -- 'absolute': local date-time
  repeat_every_minutes     INTEGER,              -- nag interval, NULL = fire once
  repeat_limit             TEXT CHECK (repeat_limit IS NULL OR repeat_limit IN ('until_done', 'count', 'duration')),
  repeat_count             INTEGER,
  repeat_duration_minutes  INTEGER,
  after_due                INTEGER NOT NULL DEFAULT 0,   -- keep nagging after the deadline
  enabled                  INTEGER NOT NULL DEFAULT 1,
  sort_order               REAL NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX idx_reminder_rules_item ON reminder_rules(item_id);

CREATE TABLE reminder_events (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  rule_id         TEXT REFERENCES reminder_rules(id) ON DELETE CASCADE,
  occurrence_key  TEXT,
  kind            TEXT NOT NULL CHECK (kind IN ('fired', 'snoozed', 'dismissed')),
  fire_at         TEXT NOT NULL,                 -- UTC instant
  until_at        TEXT,                          -- snoozed until (UTC)
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_reminder_events_item ON reminder_events(item_id, occurrence_key);

-- Note history (stage 12) -------------------------------------------------
CREATE TABLE revisions (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body_json   TEXT,
  body_text   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_revisions_item ON revisions(item_id, created_at);

-- Cached link cards (stage 11) --------------------------------------------
CREATE TABLE link_previews (
  url              TEXT PRIMARY KEY,
  title            TEXT,
  description      TEXT,
  site_name        TEXT,
  favicon_file_id  TEXT REFERENCES files(id) ON DELETE SET NULL,
  image_file_id    TEXT REFERENCES files(id) ON DELETE SET NULL,
  fetched_at       TEXT NOT NULL
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,                     -- JSON
  updated_at  TEXT NOT NULL
);

`},{version:2,name:"sync: spaces and change log",sql:Ut()},{version:3,name:"goals",sql:vt()},{version:4,name:"calendars and orders",sql:Mt()},{version:5,name:"student calendars and timetable",sql:kt()},{version:6,name:"calendar logo and brand colours",sql:Ht()},{version:7,name:"work calendars: leave allowance",sql:$t()},{version:8,name:"order costs",sql:Ft()},{version:9,name:"payments are tasks",sql:`UPDATE items SET type = 'task', status = COALESCE(status, 'todo'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE type <> 'task' AND id IN (SELECT item_id FROM payments);`},{version:10,name:"password vault",sql:bt()}],Xt=`
-- Full-text search ------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(
  item_id UNINDEXED,
  title,
  body,
  extra,                                          -- tag names + attachment file names
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (item_id, title, body, extra) VALUES (new.id, ${x("new.title")}, ${x("new.body_text")}, '');
END;
CREATE TRIGGER items_fts_au AFTER UPDATE OF title, body_text ON items BEGIN
  UPDATE items_fts SET title = ${x("new.title")}, body = ${x("new.body_text")} WHERE item_id = new.id;
END;
CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE item_id = old.id;
END;
CREATE TRIGGER item_tags_fts_ai AFTER INSERT ON item_tags BEGIN
  UPDATE items_fts SET extra = ${B("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_tags_fts_ad AFTER DELETE ON item_tags BEGIN
  UPDATE items_fts SET extra = ${B("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER item_files_fts_ai AFTER INSERT ON item_files BEGIN
  UPDATE items_fts SET extra = ${B("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_files_fts_ad AFTER DELETE ON item_files BEGIN
  UPDATE items_fts SET extra = ${B("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER tags_fts_au AFTER UPDATE OF name ON tags BEGIN
  UPDATE items_fts SET extra = ${B("items_fts.item_id")}
  WHERE item_id IN (SELECT item_id FROM item_tags WHERE tag_id = new.id);
END;
`,xt=`
DELETE FROM items_fts;
INSERT INTO items_fts (item_id, title, body, extra)
  SELECT i.id, ${x("i.title")}, ${x("i.body_text")}, ${B("i.id")} FROM items i;
`;function Pt(e,t=Wt){const r=e.get("PRAGMA user_version"),o=Number(r?.user_version??0),s=[],c=[...t].sort((n,i)=>n.version-i.version).filter(n=>n.version>o);for(const n of c){e.exec("BEGIN IMMEDIATE");try{e.exec(n.sql),e.exec(`PRAGMA user_version = ${n.version}`),e.exec("COMMIT"),s.push(n.version)}catch(i){throw e.exec("ROLLBACK"),new Error(`Migration ${n.version} (${n.name}) failed: ${i.message}`)}}return s}function zt(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function Bt(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function Gt(e,t=!0){if(Bt(e))return!0;if(!t||!zt(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(Xt),e.exec(xt),e.exec("COMMIT"),!0}catch(r){throw e.exec("ROLLBACK"),r}}const Xe=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:S(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),jt=/^#[0-9a-fA-F]{6}$/,Yt=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}],Kt=[{name:"Urodziny",color:"#EC4899",icon:"cake"},{name:"Wakacje",color:"#14B8A6",icon:"plane"},{name:"Zdrowie",color:"#38BDF8",icon:"heart"},{name:"Rodzina",color:"#FACC15",icon:"users"}],Jt=[{name:"Urlop",color:"#06B6D4",icon:"sun"},{name:"Wyjazd",color:"#F97316",icon:"map"},{name:"Sport",color:"#22C55E",icon:"dumbbell"},{name:"Zajęcia",color:"#8B5CF6",icon:"graduation-cap"}];function Vt(e){const{db:t,env:r}=e;function o(n){const i=t.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[n]);if(!i)throw new b("Category",n);return Xe(i)}function s(n,i){if(n!==void 0&&!n.trim())throw new p("Nazwa kategorii nie może być pusta");if(i!==void 0&&!jt.test(i))throw new p("Kolor musi mieć format #RRGGBB")}function c(n){s(n.name,n.color);const i=r.newId(),l=O(r.now());return t.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[i,n.name.trim(),n.color,n.icon??null,yt(e,"categories","deleted_at IS NULL",[]),l,l]),o(i)}return{create:c,list(){return t.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(Xe)},get:o,update(n,i){const l=o(n);return s(i.name,i.color),t.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[i.name?.trim()??l.name,i.color??l.color,i.icon===void 0?l.icon:i.icon,i.sortOrder??l.sortOrder,O(r.now()),n]),o(n)},remove(n){o(n),e.tx(()=>{const i=O(r.now());t.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[i,n]),t.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[i,n]),t.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[i,i,n])})},seedDefaults(){const n=t.get("SELECT COUNT(*) AS c FROM categories");if(S(n?.c??0)===0)for(const l of Yt)c(l);const i=(l,u)=>{if(!t.get("SELECT 1 AS x FROM settings WHERE key = ?",[l])){for(const E of u)t.get("SELECT 1 AS x FROM categories WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL",[E.name])||c(E);t.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",[l,"true",O(r.now())])}};i("seed.eventCategories",Kt),i("seed.eventCategories2",Jt)}}}const ae=e=>({id:e.id,name:e.name,color:e.color});function ge(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function Zt(e){const{db:t,env:r}=e;function o(n){const i=t.get("SELECT id, name, color FROM tags WHERE id = ?",[n]);if(!i)throw new b("Tag",n);return ae(i)}function s(n){const i=ge(n);if(!i)throw new p("Nazwa tagu nie może być pusta");const l=t.get("SELECT id, name, color FROM tags WHERE name = ?",[i]);if(l)return ae(l);const u=r.newId(),E=O(r.now());return t.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[u,i,E,E]),o(u)}function c(n){return t.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[n]).map(ae)}return{get:o,ensure:s,list(){return t.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(n=>({...ae(n),itemCount:S(n.item_count)}))},forItem:c,setForItem(n,i){return e.tx(()=>{const l=new Map;for(const _ of i.map(ge))_&&!l.has(_.toLowerCase())&&l.set(_.toLowerCase(),_);const u=[...l.values()].map(s),E=new Set(u.map(_=>_.id)),T=t.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[n]).map(_=>_.tag_id);for(const _ of T)E.has(_)||t.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[n,_]);for(const _ of E)T.includes(_)||t.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[n,_]);return t.run("UPDATE items SET updated_at = ? WHERE id = ?",[O(r.now()),n]),c(n)})},update(n,i){const l=o(n),u=i.name===void 0?l.name:ge(i.name);if(!u)throw new p("Nazwa tagu nie może być pusta");if(t.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[u,n]))throw new p(`Tag „${u}” już istnieje`);return t.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[u,i.color===void 0?l.color:i.color,O(r.now()),n]),o(n)},remove(n){o(n),t.run("DELETE FROM tags WHERE id = ?",[n])}}}const xe=["note","task","event"],Pe=["todo","in_progress","done","on_hold"],Y=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id, i.space_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency,
         i.opened_at, i.updated_at, i.deleted_at, i.recurrence,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count,
         (SELECT group_concat(DISTINCT f.mime) FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id) AS file_mimes
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,K=e=>({id:e.id,type:e.type,title:e.title,spaceId:e.space_id??null,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:S(e.priority),favorite:j(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:j(e.all_day),isPayment:j(e.is_payment),amountMinor:e.amount_minor==null?null:S(e.amount_minor),currency:e.currency,openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:S(e.file_count??0),fileMimes:e.file_mimes?String(e.file_mimes).split(","):[],recurrence:ct(e.recurrence),occurrence:null});function ct(e){if(!e)return null;try{return Ce(JSON.parse(e))}catch{return null}}function lt(e,t,r){return{...e,startAt:t.startAt,dueAt:t.dueAt,occurrence:t.key,status:e.type==="task"?r?"done":"todo":e.status}}function Et(e,t){const r=new Map;if(!t.length)return r;const o=e.all(`SELECT item_id, occurrence_key FROM occurrence_states WHERE status = 'done' AND item_id IN (${t.map(()=>"?").join(",")})`,t);for(const s of o)r.has(s.item_id)||r.set(s.item_id,new Set),r.get(s.item_id).add(s.occurrence_key);return r}function Le(e,t,r,o){const s=Et(e,t.map(n=>n.id)),c=[];for(const n of t){if(!n.recurrence)continue;const i=s.get(n.id);for(const l of dt(n,n.recurrence,r,o))c.push(lt(n,l,!!i?.has(l.key)))}return c}function se(e,t){if(t!=null&&!Rt(t))throw new p(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${t}”`)}function ze(e,t){if(e&&t&&e.slice(0,10)>t.slice(0,10))throw new p("Koniec nie może być przed początkiem")}function Be(e){if(e===0||e===1||e===2||e===3)return e;throw new p("Priorytet musi być liczbą 0–3")}function Qt(e,t){const{db:r,env:o}=e;function s(d){return r.get("SELECT * FROM items WHERE id = ?",[d])}function c(d){const a=r.get("SELECT amount_minor, currency, account, payee FROM payments WHERE item_id = ?",[d]);return a?{amountMinor:a.amount_minor==null?null:S(a.amount_minor),currency:a.currency,account:a.account,payee:a.payee}:null}function n(d){return{id:d.id,type:d.type,title:d.title,spaceId:d.space_id??null,bodyJson:At(d.body_json),bodyText:d.body_text,folderId:d.folder_id,parentItemId:d.parent_item_id,categoryId:d.category_id,status:d.status,priority:S(d.priority),favorite:j(d.favorite),pinned:j(d.pinned),sortOrder:S(d.sort_order),startAt:d.start_at,dueAt:d.due_at,allDay:j(d.all_day),recurrence:ct(d.recurrence),completedAt:d.completed_at,openedAt:d.opened_at,createdAt:d.created_at,updatedAt:d.updated_at,deletedAt:d.deleted_at,tags:t.tags.forItem(d.id),payment:c(d.id)}}const i=d=>oe(r,"categories",d);function l(d){const a=s(d);if(!a)throw new b("Item",d);return n(a)}function u(d){const a=l(d);if(a.deletedAt)throw new b("Item",d);return a}function E(d){d&&t.folders.get(d)}function T(d,a){if(d){if(d===a)throw new p("Element nie może być swoim rodzicem");u(d)}}function _(d,a){const m=c(d),f=a.amountMinor===void 0?m?.amountMinor??null:a.amountMinor;if(f!=null&&(!Number.isInteger(f)||f<0))throw new p("Kwota musi być nieujemną liczbą całkowitą w groszach");r.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee`,[d,f,a.currency??m?.currency??"PLN",a.account??m?.account??"",a.payee??m?.payee??""])}function N(d){const a=d?r.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[d]):r.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(a?.m==null?0:S(a.m))+1}function R(d){const a=Et(r,[d.id]).get(d.id)??new Set,m=_e(o.now()),f=dt(d,d.recurrence,C(m,-366),C(m,800),2e3),y=f.find(I=>!a.has(I.key)&&(d.type==="task"||I.dueAt.slice(0,10)>=m)),w=y??f[f.length-1];return w?lt(d,w,!y&&d.type==="task"):d}const A={get:u,getAny:l,create(d){if(d.payment!=null&&d.type!=="task"&&(d={...d,type:"task"}),!xe.includes(d.type))throw new p(`Nieznany typ elementu: ${String(d.type)}`);se("Początek",d.startAt),se("Termin",d.dueAt),ze(d.startAt,d.dueAt);const a=Ce(d.recurrence);if(a&&!d.dueAt)throw new p("Powtarzanie wymaga daty");if(d.status!=null&&!Pe.includes(d.status))throw new p("Nieznany status");const m=Be(d.priority??1),f=d.folderId??null;E(f),T(d.parentItemId);const y=f?t.folders.get(f).itemDefaults:null,w=i(d.categoryId!==void 0?d.categoryId:y?.categoryId??null),I=d.payment!=null||d.payment===void 0&&!!y?.isPayment&&d.type==="task",U=d.type==="task"?d.status??"todo":null,M=d.dueAt??d.startAt,$=M?Te(M):!1,k=O(o.now()),h=o.newId();return e.tx(()=>(r.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, recurrence, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[h,d.type,(d.title??"").trim(),d.bodyJson==null?null:JSON.stringify(d.bodyJson),d.bodyText??"",f,d.parentItemId??null,w,U,m,d.favorite?1:0,N(f),d.startAt??null,d.dueAt??null,$?1:0,a?JSON.stringify(a):null,U==="done"?k:null,k,k]),I&&_(h,{currency:y?.currency,...d.payment??{}}),d.tags?.length&&t.tags.setForItem(h,d.tags),u(h)))},update(d,a){const m=u(d);if(a.type!==void 0&&!xe.includes(a.type))throw new p("Nieznany typ elementu");if(a.status!=null&&!Pe.includes(a.status))throw new p("Nieznany status");se("Początek",a.startAt),se("Termin",a.dueAt),a.folderId!==void 0&&E(a.folderId),a.parentItemId!==void 0&&T(a.parentItemId,d);const f=a.type??m.type;if((a.payment===void 0?!!m.payment:a.payment!=null)&&f!=="task")throw new p("Płatność jest zawsze zadaniem (do zapłaty w terminie)");let w=a.status===void 0?m.status:a.status;f==="task"&&w==null&&(w="todo"),f!=="task"&&(w=null);const I=a.startAt===void 0?m.startAt:a.startAt,U=a.dueAt===void 0?m.dueAt:a.dueAt;ze(I,U);const M=a.recurrence===void 0?m.recurrence:Ce(a.recurrence);if(M&&!U)throw new p("Powtarzanie wymaga daty");const $=U??I,k=O(o.now()),h=w==="done"?m.completedAt??k:null,W=a.priority===void 0?m.priority:Be(a.priority);return e.tx(()=>(r.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, recurrence = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[f,a.title===void 0?m.title:a.title.trim(),a.bodyJson===void 0?m.bodyJson==null?null:JSON.stringify(m.bodyJson):a.bodyJson==null?null:JSON.stringify(a.bodyJson),a.bodyText??m.bodyText,a.folderId===void 0?oe(r,"folders",m.folderId):a.folderId,a.parentItemId===void 0?oe(r,"items",m.parentItemId):a.parentItemId,i(a.categoryId===void 0?m.categoryId:a.categoryId),w,W,a.favorite??m.favorite?1:0,a.pinned??m.pinned?1:0,a.sortOrder??m.sortOrder,I,U,$&&Te($)?1:0,M?JSON.stringify(M):null,h,k,d]),a.payment===null?r.run("DELETE FROM payments WHERE item_id = ?",[d]):a.payment!==void 0&&_(d,a.payment),u(d)))},setTags(d,a){return u(d),t.tags.setForItem(d,a)},setStatus(d,a,m){const f=u(d);if(m&&f.recurrence){const y=O(o.now());return a==="done"?r.run(`INSERT INTO occurrence_states (item_id, occurrence_key, status, completed_at, updated_at) VALUES (?, ?, 'done', ?, ?)
             ON CONFLICT(item_id, occurrence_key) DO UPDATE SET status = 'done', completed_at = excluded.completed_at, updated_at = excluded.updated_at`,[d,m,y,y]):r.run("DELETE FROM occurrence_states WHERE item_id = ? AND occurrence_key = ?",[d,m]),u(d)}return A.update(d,{status:a})},toggleFavorite(d){return A.update(d,{favorite:!u(d).favorite})},markOpened(d){u(d),r.run("UPDATE items SET opened_at = ? WHERE id = ?",[O(o.now()),d])},setSpace(d,a){const m=u(d);return e.tx(()=>{const f=m.folderId?t.folders.find(m.folderId):null,y=f&&(f.spaceId??null)===a;r.run("UPDATE items SET space_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",[a,y?oe(r,"folders",m.folderId):null,O(o.now()),d])}),u(d)},move(d,a,m){return u(d),E(a),e.tx(()=>{const f=(a?r.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[a,d]):r.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[d])).map(w=>w.id),y=m===void 0?f.length:Math.max(0,Math.min(m,f.length));f.splice(y,0,d),r.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[a,O(o.now()),d]),f.forEach((w,I)=>r.run("UPDATE items SET sort_order = ? WHERE id = ?",[I+1,w]))}),u(d)},trash(d){u(d);const a=O(o.now());r.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[a,a,d])},restore(d){const a=l(d);return e.tx(()=>{const m=O(o.now()),f=a.folderId?t.folders.find(a.folderId):null,y=f&&!f.deletedAt?f.id:null;r.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[y,m,d])}),u(d)},purge(d){if(!l(d).deletedAt)throw new p("Najpierw przenieś element do kosza");r.run("DELETE FROM items WHERE id = ?",[d])},query(d={}){const a=[[d.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL",[],!1]],m=(L,D=[],v=!1)=>a.push([L,D,v]);if(d.type){const L=Array.isArray(d.type)?d.type:[d.type];m(`i.type IN (${L.map(()=>"?").join(",")})`,L)}if(d.folderId===null)m("i.folder_id IS NULL");else if(d.folderId!==void 0)if(d.includeSubfolders){const L=t.folders.descendantIds(d.folderId);m(`i.folder_id IN (${L.map(()=>"?").join(",")})`,L)}else m("i.folder_id = ?",[d.folderId]);if(d.status){const L=Array.isArray(d.status)?d.status:[d.status];m(`i.status IN (${L.map(()=>"?").join(",")})`,L,!0)}d.openOnly&&m("(i.status IS NULL OR i.status <> 'done')",[],!0),d.favorite!==void 0&&m(`i.favorite = ${d.favorite?1:0}`),d.tagId&&m("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)",[d.tagId]),d.payment!==void 0&&m(`p.item_id IS ${d.payment?"NOT NULL":"NULL"}`);const f=a.filter(L=>!L[2]),y=f.map(L=>L[0]),w=f.flatMap(L=>L[1]),I=!!(d.dueFrom||d.dueTo);I&&m("i.recurrence IS NULL"),d.dueFrom&&m("i.due_at >= ?",[d.dueFrom]),d.dueTo&&m("COALESCE(i.start_at, i.due_at) < ?",[d.dueTo]);const U=a.map(L=>L[0]),M=a.flatMap(L=>L[1]),$={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[d.orderBy??"manual"];d.orderBy==="opened"&&U.push("i.opened_at IS NOT NULL");const k=d.limit&&d.limit>0?` LIMIT ${Math.floor(d.limit)}`:"",h=r.all(`${Y} WHERE ${U.join(" AND ")} ORDER BY ${$}${k}`,M).map(K),W=r.all(`${Y} WHERE ${[...y,"i.recurrence IS NOT NULL","i.due_at IS NOT NULL"].join(" AND ")}`,w).map(K).filter(L=>L.recurrence);if(!W.length||d.trashed||d.orderBy==="opened")return h;const te=L=>(!d.openOnly||L.status!=="done")&&(!d.status||(Array.isArray(d.status)?d.status:[d.status]).includes(L.status)),ne=L=>L.sort((D,v)=>(D.dueAt==null?1:0)-(v.dueAt==null?1:0)||((D.dueAt??"")<(v.dueAt??"")?-1:(D.dueAt??"")>(v.dueAt??"")?1:0)||v.priority-D.priority),ie=L=>d.limit&&d.limit>0?L.slice(0,Math.floor(d.limit)):L;if(I){const L=d.dueFrom??"0000-01-01",D=d.dueTo??C(L.slice(0,10),400),v=Le(r,W,L,D).filter(te);return v.length?ie(ne([...h,...v])):h}const X=new Map(W.map(L=>[L.id,R(L)])),H=h.flatMap(L=>{const D=X.get(L.id);return D?te(D)?[D]:[]:[L]});return d.orderBy==="due"?ne(H):H},occurrences(d,a){const m=r.all(`${Y} WHERE i.deleted_at IS NULL AND i.recurrence IS NOT NULL AND i.due_at IS NOT NULL`).map(K);return Le(r,m,d,a)}};return A}const Q={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function qt(e){const{db:t,env:r}=e;return{get(o){const s=t.get("SELECT value FROM settings WHERE key = ?",[o]);if(!s)return Q[o];try{return JSON.parse(s.value)}catch{return Q[o]}},set(o,s){if(!(o in Q))throw new Error(`Unknown setting: ${String(o)}`);return t.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[o,JSON.stringify(s),O(r.now())]),s},all(){const o={...Q};for(const s of t.all("SELECT key, value FROM settings"))if(s.key in Q)try{o[s.key]=JSON.parse(s.value)}catch{}return o}}}const de=e=>String(e).padStart(2,"0");function en(e,t){if(e.mode==="before"){const o=t.length>10?t.slice(0,16):`${t.slice(0,10)}T${e.timeOfDay??"09:00"}`,[s,c,n]=o.slice(0,10).split("-").map(Number),i=new Date(Date.UTC(s,c-1,n,+o.slice(11,13),+o.slice(14,16))-e.offsetMinutes*6e4);return`${i.getUTCFullYear()}-${de(i.getUTCMonth()+1)}-${de(i.getUTCDate())}T${de(i.getUTCHours())}:${de(i.getUTCMinutes())}`}return`${C(t.slice(0,10),-Math.round(e.offsetMinutes/1440))}T${e.timeOfDay??(t.length>10?t.slice(11,16):"09:00")}`}const tn=/^([01]\d|2[0-3]):[0-5]\d$/,nn=60*1440;function rn(e){if(e.mode!=="before"&&e.mode!=="on_day")throw new p("Nieznany rodzaj przypomnienia");const t=Number(e.offsetMinutes??0);if(!Number.isInteger(t)||t<0||t>nn)throw new p("Przypomnienie: wyprzedzenie 0–60 dni");if(e.timeOfDay!=null&&e.timeOfDay!==""&&!tn.test(e.timeOfDay))throw new p("Godzina przypomnienia: GG:MM");return{mode:e.mode,offsetMinutes:t,timeOfDay:e.timeOfDay||null}}function Ge(e,t){return gt(en(e,t))}function on(e){const{db:t,env:r}=e,o=s=>({id:s.id,mode:s.mode,offsetMinutes:S(s.offset_minutes??0),timeOfDay:s.time_of_day});return{forItem(s){return t.all("SELECT * FROM reminder_rules WHERE item_id = ? AND enabled = 1 ORDER BY sort_order",[s]).map(o)},set(s,c){const n=c.map(rn);if(n.length>5)throw new p("Najwyżej 5 przypomnień");if(!t.get("SELECT 1 FROM items WHERE id = ? AND deleted_at IS NULL",[s]))throw new p("Nie ma takiego wpisu");const i=O(r.now());return e.tx(()=>{const l=t.all("SELECT * FROM reminder_rules WHERE item_id = ? ORDER BY sort_order",[s]).map(o);return l.length===n.length&&l.every((E,T)=>E.mode===n[T].mode&&E.offsetMinutes===n[T].offsetMinutes&&E.timeOfDay===n[T].timeOfDay)?l:(t.run("DELETE FROM reminder_rules WHERE item_id = ?",[s]),n.forEach((E,T)=>t.run(`INSERT INTO reminder_rules (id, item_id, mode, offset_minutes, time_of_day, enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,[r.newId(),s,E.mode,E.offsetMinutes,E.timeOfDay,T+1,i,i])),t.all("SELECT * FROM reminder_rules WHERE item_id = ? ORDER BY sort_order",[s]).map(o))})},due(s,c){const n=new Date(s),i=new Date(c),l=t.all("SELECT * FROM reminder_rules WHERE enabled = 1"),u=new Map;for(const a of l)u.set(a.item_id,[...u.get(a.item_id)??[],o(a)]);const E=[...u.keys()],T=E.length?t.all(`${Y} WHERE i.deleted_at IS NULL AND i.due_at IS NOT NULL AND i.id IN (${E.map(()=>"?").join(",")})`,E).map(K):[],_=a=>`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,"0")}-${String(a.getDate()).padStart(2,"0")}`,N=C(_(n),-1),R=C(_(i),62),A=[...T.filter(a=>!a.recurrence),...Le(t,T.filter(a=>a.recurrence),N,R)],d=[];for(const a of A){if(a.type==="task"&&a.status==="done")continue;const m=a.startAt??a.dueAt;for(const f of u.get(a.id)??[]){const y=Ge(f,m);y>=n&&y<i&&d.push({key:`${f.id}|${a.occurrence??""}`,itemId:a.id,occurrence:a.occurrence,title:a.title,type:a.type,startAt:a.startAt,dueAt:a.dueAt,fireAt:y.toISOString(),isPayment:a.isPayment,amountMinor:a.amountMinor,currency:a.currency})}}for(const a of t.all("SELECT * FROM orders WHERE remind_days IS NOT NULL AND status NOT IN ('shipped', 'cancelled')")){const m={mode:"on_day",offsetMinutes:S(a.remind_days)*1440,timeOfDay:"09:00"},f=[];a.status!=="ready"&&f.push(["due",a.due_date]),a.ship_date&&f.push(["ship",a.ship_date]);for(const[y,w]of f){const I=Ge(m,w);I>=n&&I<i&&d.push({key:`order|${a.id}|${y}|${w}`,itemId:a.id,occurrence:null,title:a.title,type:"task",startAt:null,dueAt:w,fireAt:I.toISOString(),isPayment:!1,amountMinor:a.amount_minor==null?null:S(a.amount_minor),currency:"PLN",order:{kind:y,calendarId:a.calendar_id,client:a.client}})}}return d.sort((a,m)=>a.fireAt.localeCompare(m.fireAt))}}}const je=["week","month","year"],ut=e=>String(e).padStart(2,"0");function Ye(e,t){const[r,o,s]=t.split("-").map(Number);if(e==="year")return`${r}-01-01`;if(e==="month")return`${r}-${ut(o)}-01`;const c=(new Date(Date.UTC(r,o-1,s)).getUTCDay()+6)%7;return C(t.slice(0,10),-c)}function an(e,t){const[r,o]=t.split("-").map(Number);return e==="year"?`${r+1}-01-01`:e==="month"?o===12?`${r+1}-01-01`:`${r}-${ut(o+1)}-01`:C(t,7)}const Ke=e=>{const t=e.target==null?null:S(e.target),r=S(e.progress);return{id:e.id,title:e.title,notes:e.notes,period:e.period,periodStart:e.period_start,periodEnd:an(e.period,e.period_start),target:t,progress:r,done:!!e.done_at||t!=null&&r>=t,doneAt:e.done_at,color:e.color,sortOrder:S(e.sort_order),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}};function Je(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<1||t>1e6)throw new p("Cel liczbowy: liczba całkowita od 1");return t}function sn(e){const{db:t,env:r}=e,o=c=>t.get("SELECT * FROM goals WHERE id = ?",[c]),s=c=>{const n=o(c);if(!n)throw new b("Goal",c);return Ke(n)};return{get:s,list(c={}){const n=c.date??_e(r.now()),i=c.period?[c.period]:je,l=[];for(const u of i)l.push(...t.all("SELECT * FROM goals WHERE period = ? AND period_start = ? ORDER BY sort_order, created_at",[u,Ye(u,n)]).map(Ke));return l},create(c){const n=(c.title??"").trim();if(!n)throw new p("Wpisz, jaki to cel");if(!je.includes(c.period))throw new p("Okres: tydzień, miesiąc albo rok");const i=Ye(c.period,c.date??_e(r.now())),l=r.newId(),u=O(r.now()),E=t.get("SELECT MAX(sort_order) AS m FROM goals WHERE period = ? AND period_start = ?",[c.period,i]);return t.run(`INSERT INTO goals (id, title, notes, period, period_start, target, progress, color, sort_order, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,[l,n,c.notes??"",c.period,i,Je(c.target),c.color??null,(E?.m==null?0:S(E.m))+1,c.spaceId??null,u,u]),s(l)},update(c,n){const i=s(c),l=n.title===void 0?i.title:n.title.trim();if(!l)throw new p("Wpisz, jaki to cel");const u=n.target===void 0?i.target:Je(n.target);let E=n.progress===void 0?i.progress:Math.round(Number(n.progress));(!Number.isFinite(E)||E<0)&&(E=0),u!=null&&(E=Math.min(E,u));const T=n.done===void 0?i.doneAt:n.done?i.doneAt??O(r.now()):null;return t.run("UPDATE goals SET title = ?, notes = ?, target = ?, progress = ?, done_at = ?, color = ?, space_id = ?, updated_at = ? WHERE id = ?",[l,n.notes??i.notes,u,E,T,n.color===void 0?i.color:n.color,n.spaceId===void 0?i.spaceId:n.spaceId,O(r.now()),c]),s(c)},step(c,n){const i=s(c);return this.update(c,{progress:i.progress+Math.sign(n)})},remove(c){s(c),t.run("DELETE FROM goals WHERE id = ?",[c])}}}const Oe="vault-meta",dn=2e4;function Ve(e){if(typeof e!="string"||e.length>dn)throw new p("Sejf: nieprawidłowe dane");let t;try{t=JSON.parse(e)}catch{throw new p("Sejf: nieprawidłowe dane")}const r=o=>!!o&&typeof o.iv=="string"&&typeof o.ct=="string";if(!(r(t)||typeof t.salt=="string"&&r(t.check)))throw new p("Sejf: dane muszą być zaszyfrowane");return e}function cn(e){const{db:t,env:r}=e;return{meta(){return t.get("SELECT * FROM vault WHERE id = ? AND kind = 'meta'",[Oe])?.payload??null},createMeta(o){if(t.get("SELECT 1 FROM vault WHERE id = ?",[Oe]))throw new p("Sejf już istnieje");const s=O(r.now());t.run("INSERT INTO vault (id, kind, payload, space_id, created_at, updated_at) VALUES (?, 'meta', ?, NULL, ?, ?)",[Oe,Ve(o),s,s])},list(){return t.all("SELECT * FROM vault WHERE kind = 'entry' ORDER BY created_at").map(o=>({id:o.id,payload:o.payload,updatedAt:o.updated_at}))},save(o,s){Ve(s);const c=O(r.now());if(o&&t.get("SELECT 1 FROM vault WHERE id = ? AND kind = 'entry'",[o]))return t.run("UPDATE vault SET payload = ?, updated_at = ? WHERE id = ?",[s,c,o]),o;const n=r.newId();return t.run("INSERT INTO vault (id, kind, payload, space_id, created_at, updated_at) VALUES (?, 'entry', ?, NULL, ?, ?)",[n,s,c,c]),n},remove(o){t.run("DELETE FROM vault WHERE id = ? AND kind = 'entry'",[o])}}}const Ze=["new","in_progress","ready","shipped","cancelled"],Ue=e=>e==="study"||e==="work"?e:"orders";function ln(e){if(!e)return null;try{const t=JSON.parse(e);return typeof t?.uw=="number"?{uw:t.uw,years:t.years??void 0,...t.schedule?{schedule:t.schedule}:{}}:null}catch{return null}}function En(e){if(e==null)return null;const t=s=>Number.isInteger(s)&&s>=0&&s<=60;if(!t(e.uw))throw new p("Urlop wypoczynkowy: 0–60 dni");const r={};for(const[s,c]of Object.entries(e.years??{})){if(!/^\d{4}$/.test(s)||!t(c))throw new p("Urlop wypoczynkowy: 0–60 dni");r[s]=c}let o=null;try{o=Ot(e.schedule)}catch(s){throw new p(s.message)}return JSON.stringify({uw:e.uw,...Object.keys(r).length?{years:r}:{},...o?{schedule:o}:{}})}const Qe=e=>({id:e.id,name:e.name,kind:Ue(e.kind),leave:ln(e.leave??null),icon:e.icon,itemLabel:e.item_label||"Zlecenie",color:e.color,color2:e.color2??null,logo:e.logo??null,sortOrder:S(e.sort_order),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}),Se=e=>({id:e.id,calendarId:e.calendar_id,title:e.title,client:e.client,notes:e.notes,startDate:e.start_date,dueDate:e.due_date,shipDate:e.ship_date,status:e.status,tag:e.tag??null,amountMinor:e.amount_minor==null?null:S(e.amount_minor),costMinor:e.cost_minor==null?null:S(e.cost_minor),remindDays:e.remind_days==null?null:S(e.remind_days),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at});function qe(e,t,r){for(const[o,s]of[["Od kiedy",e],["Termin",t]])if(!Te(s))throw new p(`${o}: wybierz dzień`);if(t<e)throw new p("Termin nie może być przed początkiem");if(r!=null){if(!Te(r))throw new p("Wysyłka: wybierz dzień");if(r<e)throw new p("Wysyłka nie może być przed początkiem")}}function et(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<0||t>60)throw new p("Przypomnienie: 0–60 dni przed");return t}function ce(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<0)throw new p("Kwota musi być nieujemna");return t}function tt(e){const t=(e??"").trim();return t?[...t].slice(0,2).join(""):null}const un=/^#[0-9a-fA-F]{6}$/,nt=e=>(e??"").trim().slice(0,30)||null,it=/^([01]\d|2[0-3]):[0-5]\d$/,le=e=>({id:e.id,calendarId:e.calendar_id,subject:e.subject,form:e.form,weekday:S(e.weekday),startTime:e.start_time,endTime:e.end_time,room:e.room,teacher:e.teacher,every:e.every,color:e.color,spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at});function rt(e){if(!e.subject.trim())throw new p("Wpisz nazwę przedmiotu");if(!Number.isInteger(e.weekday)||e.weekday<0||e.weekday>6)throw new p("Wybierz dzień tygodnia");if(!it.test(e.startTime)||!it.test(e.endTime))throw new p("Godziny w formacie GG:MM");if(e.endTime<=e.startTime)throw new p("Koniec zajęć musi być po początku");if(e.every&&!["week","odd","even"].includes(e.every))throw new p("Co tydzień, nieparzyste albo parzyste")}function mn(e){const{db:t,env:r}=e,o=n=>{const i=t.get("SELECT * FROM calendars WHERE id = ?",[n]);if(!i)throw new b("Calendar",n);return Qe(i)},s=n=>{const i=t.get("SELECT * FROM orders WHERE id = ?",[n]);if(!i)throw new b("Order",n);return Se(i)},c={calendars:{list(){return t.all("SELECT * FROM calendars ORDER BY sort_order, created_at").map(Qe)},create(n){const i=(n.name??"").trim();if(!i)throw new p("Nazwij kalendarz, np. Zlecenia");const l=r.newId(),u=O(r.now()),E=t.get("SELECT MAX(sort_order) AS m FROM calendars");return t.run("INSERT INTO calendars (id, name, kind, icon, item_label, color, sort_order, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",[l,i.slice(0,40),Ue(n.kind),tt(n.icon),(n.itemLabel??"").trim().slice(0,30)||"Zlecenie",n.color??null,(E?.m==null?0:S(E.m))+1,n.spaceId??null,u,u]),o(l)},update(n,i){const l=o(n),u=i.name===void 0?l.name:i.name.trim().slice(0,40);if(!u)throw new p("Nazwij kalendarz");const E=i.spaceId===void 0?l.spaceId:i.spaceId;for(const _ of[i.color,i.color2])if(_!=null&&!un.test(_))throw new p("Kolor: #RRGGBB");if(i.logo!=null&&(!/^data:image\/(png|jpeg|webp);base64,/.test(i.logo)||i.logo.length>9e4))throw new p("Logo: mały obrazek PNG/JPEG");const T=O(r.now());return e.tx(()=>{t.run("UPDATE calendars SET name = ?, kind = ?, icon = ?, item_label = ?, color = ?, space_id = ?, updated_at = ? WHERE id = ?",[u,i.kind===void 0?l.kind:Ue(i.kind),i.icon===void 0?l.icon:tt(i.icon),i.itemLabel===void 0?l.itemLabel:i.itemLabel.trim().slice(0,30)||"Zlecenie",i.color===void 0?l.color:i.color,E,T,n]),(i.color2!==void 0||i.logo!==void 0)&&t.run("UPDATE calendars SET color2 = ?, logo = ?, updated_at = ? WHERE id = ?",[i.color2===void 0?l.color2:i.color2,i.logo===void 0?l.logo:i.logo,T,n]),i.leave!==void 0&&t.run("UPDATE calendars SET leave = ?, updated_at = ? WHERE id = ?",[En(i.leave),T,n]),E!==l.spaceId&&(t.run("UPDATE orders SET space_id = ?, updated_at = ? WHERE calendar_id = ?",[E,T,n]),t.run("UPDATE class_slots SET space_id = ?, updated_at = ? WHERE calendar_id = ?",[E,T,n]))}),o(n)},reorder(n){const i=t.all("SELECT id, sort_order FROM calendars ORDER BY sort_order, created_at"),l=[...n.filter(E=>i.some(T=>T.id===E)),...i.map(E=>E.id).filter(E=>!n.includes(E))],u=O(r.now());return e.tx(()=>l.forEach((E,T)=>{S(i.find(_=>_.id===E).sort_order)!==T+1&&t.run("UPDATE calendars SET sort_order = ?, updated_at = ? WHERE id = ?",[T+1,u,E])})),c.calendars.list()},remove(n){o(n),e.tx(()=>{t.run("DELETE FROM orders WHERE calendar_id = ?",[n]),t.run("DELETE FROM class_slots WHERE calendar_id = ?",[n]),t.run("DELETE FROM calendars WHERE id = ?",[n])})}},classes:{list(n){return t.all("SELECT * FROM class_slots WHERE calendar_id = ? ORDER BY weekday, start_time",[n]).map(le)},create(n){const i=o(n.calendarId);rt(n);const l=r.newId(),u=O(r.now());return t.run(`INSERT INTO class_slots (id, calendar_id, subject, form, weekday, start_time, end_time, room, teacher, every, color, space_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[l,i.id,n.subject.trim(),(n.form??"").trim(),n.weekday,n.startTime,n.endTime,(n.room??"").trim(),(n.teacher??"").trim(),n.every??"week",n.color??null,i.spaceId,u,u]),le(t.get("SELECT * FROM class_slots WHERE id = ?",[l]))},update(n,i){const l=t.get("SELECT * FROM class_slots WHERE id = ?",[n]);if(!l)throw new b("Class",n);const E={...le(l),...Object.fromEntries(Object.entries(i).filter(([,T])=>T!==void 0))};return rt(E),t.run("UPDATE class_slots SET subject = ?, form = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, teacher = ?, every = ?, color = ?, updated_at = ? WHERE id = ?",[E.subject.trim(),E.form.trim(),E.weekday,E.startTime,E.endTime,E.room.trim(),E.teacher.trim(),E.every,E.color,O(r.now()),n]),le(t.get("SELECT * FROM class_slots WHERE id = ?",[n]))},remove(n){t.run("DELETE FROM class_slots WHERE id = ?",[n])}},get:s,list(n,i){return(i?t.all(`SELECT * FROM orders WHERE calendar_id = ? AND start_date < ? AND MAX(due_date, COALESCE(ship_date, due_date)) >= ?
           ORDER BY start_date, due_date`,[n,i.to,i.from]):t.all("SELECT * FROM orders WHERE calendar_id = ? ORDER BY due_date, start_date",[n])).map(Se)},create(n){const i=o(n.calendarId),l=(n.title??"").trim();if(!l)throw new p("Wpisz, co to za zamówienie");const u=n.shipDate||null;qe(n.startDate,n.dueDate,u);const E=n.status??"new";if(!Ze.includes(E))throw new p("Nieznany status");const T=r.newId(),_=O(r.now());return t.run(`INSERT INTO orders (id, calendar_id, title, client, notes, start_date, due_date, ship_date, status, amount_minor, cost_minor, remind_days, tag, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[T,i.id,l,(n.client??"").trim(),n.notes??"",n.startDate,n.dueDate,u,E,ce(n.amountMinor),ce(n.costMinor),et(n.remindDays),nt(n.tag),i.spaceId,_,_]),s(T)},update(n,i){const l=s(n),u=i.title===void 0?l.title:i.title.trim();if(!u)throw new p("Wpisz, co to za zamówienie");const E=i.startDate??l.startDate,T=i.dueDate??l.dueDate,_=i.shipDate===void 0?l.shipDate:i.shipDate||null;qe(E,T,_);const N=i.status??l.status;if(!Ze.includes(N))throw new p("Nieznany status");return t.run(`UPDATE orders SET title = ?, client = ?, notes = ?, start_date = ?, due_date = ?, ship_date = ?, status = ?, amount_minor = ?, cost_minor = ?,
           remind_days = ?, tag = ?, updated_at = ? WHERE id = ?`,[u,i.client===void 0?l.client:i.client.trim(),i.notes??l.notes,E,T,_,N,i.amountMinor===void 0?l.amountMinor:ce(i.amountMinor),i.costMinor===void 0?l.costMinor:ce(i.costMinor),i.remindDays===void 0?l.remindDays:et(i.remindDays),i.tag===void 0?l.tag:nt(i.tag),O(r.now()),n]),s(n)},setStatus(n,i){return c.update(n,{status:i})},remove(n){s(n),t.run("DELETE FROM orders WHERE id = ?",[n])},withReminders(){return t.all("SELECT * FROM orders WHERE remind_days IS NOT NULL AND status NOT IN ('shipped', 'cancelled')").map(Se)}};return c}const ue=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:S(e.size),width:e.width==null?null:S(e.width),height:e.height==null?null:S(e.height),createdAt:e.created_at}),we=e=>({...ue(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),Ie=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,Tn=/^[0-9a-f]{64}$/;function _n(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function fn(e,t){const{db:r,env:o}=e;function s(n){const i=n.sha256?.toLowerCase();if(!i||!Tn.test(i))throw new p("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(n.size)||n.size<0)throw new p("Nieprawidłowy rozmiar pliku");const l=r.get("SELECT * FROM files WHERE sha256 = ?",[i]);if(l)return ue(l);const u=o.newId();return r.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[u,i,n.name.trim()||"plik",n.mime||"application/octet-stream",n.size,n.width??null,n.height??null,O(o.now())]),ue(r.get("SELECT * FROM files WHERE id = ?",[u]))}function c(n,i,l="attachment"){if(t.items.get(n),!r.get("SELECT 1 FROM files WHERE id = ?",[i]))throw new b("File",i);const u=r.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[n]),E=O(o.now());r.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[n,i,l,(u?.m==null?0:S(u.m))+1,E]),r.run("UPDATE items SET updated_at = ? WHERE id = ?",[E,n])}return{register:s,addToItem(n,i){return e.tx(()=>{const l=s(i);return c(n,l.id),we(r.get(`${Ie} WHERE x.item_id = ? AND x.file_id = ?`,[n,l.id]))})},addToFolder(n,i,l){return e.tx(()=>{n&&t.folders.get(n);const u=s(i),E=t.items.create({type:"note",title:l?.trim()||_n(u.name),folderId:n});return c(E.id,u.id),t.items.get(E.id)})},detach(n,i){t.items.get(n),r.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[n,i]),r.run("UPDATE items SET updated_at = ? WHERE id = ?",[O(o.now()),n])},rename(n,i){if(!i.trim())throw new p("Nazwa pliku nie może być pusta");r.run("UPDATE files SET name = ? WHERE id = ?",[i.trim(),n]);const l=r.get("SELECT * FROM files WHERE id = ?",[n]);if(!l)throw new b("File",n);return ue(l)},forItem(n){return r.all(`${Ie} WHERE x.item_id = ? ORDER BY x.sort_order`,[n]).map(we)},forFolder(n,i={}){const l=["i.deleted_at IS NULL"],u=[];if(n===null)l.push("i.folder_id IS NULL");else if(i.includeSubfolders){const T=t.folders.descendantIds(n);l.push(`i.folder_id IN (${T.map(()=>"?").join(",")})`),u.push(...T)}else l.push("i.folder_id = ?"),u.push(n);i.imagesOnly&&l.push("f.mime LIKE 'image/%'");const E=i.limit&&i.limit>0?` LIMIT ${Math.floor(i.limit)}`:"";return r.all(`${Ie} WHERE ${l.join(" AND ")} ORDER BY x.created_at DESC, f.name${E}`,u).map(we)}}}function Nn(e){const{db:t,env:r}=e,o="i.deleted_at IS NULL AND i.recurrence IS NULL AND (i.status IS NULL OR i.status <> 'done')",s="i.deleted_at IS NULL AND i.recurrence IS NULL",c="(i.status IS NULL OR i.status <> 'done')";function n(l,u,E="i.due_at, i.priority DESC",T=50){return t.all(`${Y} WHERE ${l} ORDER BY ${E} LIMIT ${T}`,u).map(K)}function i(l,u){const E=t.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${l}`,u);return Number(E?.c??0)}return{summary(){const l=r.now(),u=_e(l),E=C(u,1),T=C(u,8),_=St(l),N=`${o} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,R=[u,_],A=`${o} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,d=[u,E,_],a=`${s} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ? AND ${c})`,m=C(E,1),f=`${s} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?`,y=[E,m],w=`${s} AND i.type = 'event' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.all_day = 0 AND i.start_at IS NULL AND i.due_at < ?)`,I=[u,T,_],U=`${u.slice(0,7)}-01`,[M,$]=u.split("-").map(Number),k=$===12?`${M+1}-01-01`:`${M}-${String($+1).padStart(2,"0")}-01`,h=`${s} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,W=[U,k],te=`${o} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,ne=[u,C(u,7)],ie=t.all(`${Y} WHERE i.deleted_at IS NULL AND i.recurrence IS NOT NULL
        AND i.due_at IS NOT NULL AND i.type IN ('task', 'event')`,[]).map(K),X=(g,re)=>ie.length?Le(t,ie,g,re):[],H=g=>g.status!=="done",L=g=>g.type==="task"&&H(g)&&!!g.dueAt&&(g.allDay||g.dueAt.length===10?g.dueAt<u:g.dueAt<_),D=X(u,E).filter(g=>g.type==="task"&&!(g.dueAt.length>10&&g.dueAt<_&&H(g))),v=X(E,m).filter(g=>g.type==="task"),$e=X(u,T).filter(g=>g.type==="event"&&!(g.dueAt.length>10&&!g.startAt&&g.dueAt<_)),He=X(U,k).filter(g=>g.isPayment),We=X(C(u,-60),E).filter(L),Lt=X(u,C(u,7)).filter(g=>g.isPayment&&H(g)&&g.dueAt>=u),Z=(g,re)=>re.length?[...g,...re].sort((Re,Ae)=>(Re.dueAt??"")<(Ae.dueAt??"")?-1:(Re.dueAt??"")>(Ae.dueAt??"")?1:Ae.priority-Re.priority):g;return{overdue:Z(n(N,R),We),today:Z(n(a,d),D),tomorrow:Z(n(f,y),v),upcoming:Z(n(w,I),$e),paymentsMonth:Z(n(h,W,"i.due_at",200),He),recentNotes:n("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:n("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:n("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:i(N,R)+We.length,today:i(A,d)+D.filter(H).length,tomorrow:v.filter(H).length+i(`${o} AND ${f.replace(`${s} AND `,"")}`,y),upcoming:i(w,I)+$e.length,paymentsMonth:i(`${h} AND ${c}`,W)+He.filter(H).length,paymentsThisWeek:i(te,ne)+Lt.length,notes:i("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:i("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const Fe="",be="";function pn(e){const t=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(r=>r.trim()).filter(Boolean).slice(0,12);return t.length?t.map(r=>`"${r.replace(/"/g,"")}"*`).join(" "):null}const Ln=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function yn(e,t){const r=/[\u0001\u0002]/g,o=e.replace(/^…/,"").replace(/…$/,""),s=o.replace(r,"");if(!s)return e;for(const c of t){const n=Ln(c).indexOf(s);if(n<0)continue;const i=c.slice(n,n+s.length);let l="",u=0;for(const E of o)E===Fe||E===be?l+=E:l+=i[u++];return e.replace(o,l)}return e}const mt=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],z=e=>mt.reduce((t,[r,o])=>`replace(${t}, '${r}', '${o}')`,`coalesce(${e}, '')`),ve=e=>mt.reduce((t,[r,o])=>t.split(r).join(o),e).toLowerCase();function Rn(e,t){const r=ve(e);let o=-1,s=0;for(const i of t){const l=r.indexOf(i);l>=0&&(o<0||l<o)&&(o=l,s=i.length)}if(o<0)return e.slice(0,90);const c=Math.max(0,o-40),n=Math.min(e.length,o+s+60);return`${c>0?"…":""}${e.slice(c,o)}${Fe}${e.slice(o,o+s)}${be}${e.slice(o+s,n)}${n<e.length?"…":""}`}function An(e,t){const{db:r}=e;function o(s,c){const n=ve(s).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!n.length)return[];const i=`(${z("i.title")} || ' ' || ${z("i.body_text")} || ' ' ||
      ${z("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${z("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return r.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${n.map(()=>`instr(lower(${i}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${z("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...n,n[0],c]).map(u=>({...u,snip:Rn(u.body_text||u.title,n)}))}return{fullText:()=>t.fullText,search(s,c=30){const n=pn(s);if(!n)return[];const i=t.fullText?r.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${Fe}', '${be}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[n,c]):o(s,c),l=ve(s.trim());return[...r.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${z("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[l]).map(E=>({kind:"folder",id:E.id,title:E.name,snippet:"",folderId:E.parent_id})),...i.map(E=>({kind:"item",id:E.id,title:E.title,snippet:yn(E.snip??"",[E.body_text,E.title]),itemType:E.type,folderId:E.folder_id}))]}}}function gn(e){const{db:t}=e;return{list(){const r=t.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),o=t.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...r.map(s=>({kind:"item",id:s.id,title:s.title,deletedAt:s.deleted_at,itemType:s.type})),...o.map(s=>({kind:"folder",id:s.id,title:s.name,deletedAt:s.deleted_at}))].sort((s,c)=>c.deletedAt.localeCompare(s.deletedAt))}}}const On={now:()=>new Date,newId:()=>crypto.randomUUID()};function Sn(e,t={}){ht(e),Pt(e);const r=Gt(e,t.fullText!==!1),o={db:e,tx:Dt(e),env:t.env??On},s=Vt(o),c=wt(o),n=Zt(o),i=Qt(o,{tags:n,folders:c}),l=qt(o),u=on(o),E=sn(o),T=cn(o),_=mn(o),N=fn(o,{items:i,folders:c}),R=Nn(o),A=An(o,{fullText:r}),d=gn(o);t.seed!==!1&&(s.seedDefaults(),t.seedFolders!==!1&&c.seedDefaults());const a={categories:{list:s.list,create:s.create,update:s.update,remove:s.remove},folders:{tree:c.tree,list:c.list,get:c.get,path:c.path,create:c.create,update:c.update,move:c.move,trash:c.trash,restore:c.restore,purge:c.purge,setSpace:c.setSpace},tags:{list:n.list,update:n.update,remove:n.remove},items:{get:i.get,create:i.create,update:i.update,setTags:i.setTags,setStatus:i.setStatus,toggleFavorite:i.toggleFavorite,markOpened:i.markOpened,move:i.move,trash:i.trash,restore:i.restore,purge:i.purge,query:i.query,setSpace:i.setSpace,occurrences:i.occurrences},calendars:{list:_.calendars.list,create:_.calendars.create,update:_.calendars.update,remove:_.calendars.remove,reorder:_.calendars.reorder},classes:{list:_.classes.list,create:_.classes.create,update:_.classes.update,remove:_.classes.remove},orders:{list:_.list,get:_.get,create:_.create,update:_.update,setStatus:_.setStatus,remove:_.remove},vault:{meta:T.meta,createMeta:T.createMeta,list:T.list,save:T.save,remove:T.remove},goals:{list:E.list,get:E.get,create:E.create,update:E.update,step:(m,f)=>E.step(m,f),remove:E.remove},reminders:{forItem:u.forItem,set:u.set,due:u.due},files:{register:N.register,addToItem:N.addToItem,addToFolder:N.addToFolder,detach:N.detach,rename:N.rename,forItem:N.forItem,forFolder:N.forFolder},trash:{list:d.list,purge(m){return o.tx(()=>{let f=0;for(const y of m)try{y.kind==="item"?i.purge(y.id):c.purge(y.id),f++}catch{}return f})},empty(){return a.trash.purge(d.list().map(m=>({kind:m.kind,id:m.id})))}},dashboard:{summary:R.summary},search:{query:A.search,fullText:A.fullText},settings:{all:l.all,get:l.get,set:l.set}};return{api:a,close:()=>e.close()}}const wn=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","folders.setSpace","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","items.setSpace","reminders.set","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set","trash.purge","trash.empty","goals.create","goals.update","goals.step","goals.remove","vault.createMeta","vault.save","vault.remove","calendars.create","calendars.update","calendars.remove","calendars.reorder","orders.create","orders.update","orders.setStatus","orders.remove","classes.create","classes.update","classes.remove"]);function In(e,t){if(typeof t!="string")return null;const[r,o,...s]=t.split(".");if(!r||!o||s.length||!Object.prototype.hasOwnProperty.call(e,r))return null;const c=e[r];if(!Object.prototype.hasOwnProperty.call(c,o))return null;const n=c[o];return typeof n=="function"?n:null}function Dn(e,t,r){const o=In(e,t);if(!o)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(t)}`}},mutated:!1};try{return{result:{ok:!0,value:o(...Array.isArray(r)?r:[])},mutated:wn.has(t)}}catch(s){const c=s;return c.name!=="ValidationError"&&c.name!=="NotFoundError"&&console.error(`[core] ${String(t)} failed`,c),{result:{ok:!1,error:{name:c.name||"Error",message:c.message||String(s)}},mutated:!1}}}function hn(e,t){const r=new e.Database(t??null),o=c=>c.map(n=>typeof n=="bigint"?Number(n):n);function s(c,n,i){const l=r.prepare(c);try{n.length&&l.bind(o(n));const u=[];for(;l.step()&&(u.push(l.getAsObject()),!!i););return u}finally{l.free()}}return{exec:c=>{r.exec(c)},run:(c,n=[])=>(r.run(c,o(n)),{changes:r.getRowsModified()}),get:(c,n=[])=>s(c,n,!1)[0],all:(c,n=[])=>s(c,n,!0),close:()=>r.close(),exportBytes:()=>{const c=r.export();return r.exec("PRAGMA foreign_keys = ON;"),c}}}const Cn="notatnik",ye="files",G="blobs";function Tt(){return new Promise((e,t)=>{const r=indexedDB.open(Cn,2);r.onupgradeneeded=()=>{const o=r.result.objectStoreNames;o.contains(ye)||r.result.createObjectStore(ye),o.contains(G)||r.result.createObjectStore(G)},r.onsuccess=()=>e(r.result),r.onerror=()=>t(r.error)})}async function me(e,t=ye){const r=await Tt();try{return await new Promise((o,s)=>{const c=r.transaction(t,"readonly").objectStore(t).get(e);c.onsuccess=()=>o(c.result?new Uint8Array(c.result):null),c.onerror=()=>s(c.error)})}finally{r.close()}}async function _t(e,t,r=ye){const o=await Tt();try{await new Promise((s,c)=>{const n=o.transaction(r,"readwrite");n.objectStore(r).put(t.slice().buffer,e),n.oncomplete=()=>s(),n.onerror=()=>c(n.error),n.onabort=()=>c(n.error)})}finally{o.close()}}async function Un(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function vn(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const t=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(t)].map(r=>r.toString(16).padStart(2,"0")).join("")}function Mn(e){const t=new Map,r=new Map;return{async put(o,s){const c=await vn(o);return e()?await me(c,G).catch(()=>null)||await _t(c,o,G):t.set(c,o),{sha256:c,size:o.byteLength}},async read(o){return t.get(o)??(e()?await me(o,G).catch(()=>null):null)},async url(o,s){const c=r.get(o);if(c)return c;const n=t.get(o)??(e()?await me(o,G).catch(()=>null):null);if(!n)return null;const i=URL.createObjectURL(new Blob([n.slice().buffer],{type:s||"application/octet-stream"}));return r.set(o,i),i}}}const Me=e=>e.sharedId?[e.privateId,e.sharedId]:[e.privateId],kn=e=>typeof e=="bigint"?Number(e):e;function ft(e,t){const r=t.split(Ne);return[e.key.map(o=>`${o} = ?`).join(" AND "),e.key.map((o,s)=>r[s]??"")]}function Nt(e,t,r){const[o,s]=ft(t,r),c=e.get(`SELECT * FROM ${t.name} WHERE ${o}`,s);if(!c)return;const n={};for(const[i,l]of Object.entries(c))n[i]=kn(l);return n}function pt(e,t,r){return e.get("SELECT space_id FROM items WHERE id = ?",[String(t)])?.space_id??r.privateId}function Fn(e,t,r,o){switch(t.scope){case"own":return[r.space_id??o.privateId];case"item":return[pt(e,r[t.itemCol],o)];case"all":return Me(o);case"file":{const s=e.all("SELECT DISTINCT i.space_id AS s FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ?",[String(r.id)]).map(i=>i.s??o.privateId),c=new Set(Me(o)),n=[...new Set(s)].filter(i=>c.has(i));return n.length?n:[o.privateId]}}}function bn(e){return Number(e.get("SELECT COUNT(*) AS n FROM sync_outbox")?.n??0)}function $n(e,t,r=300){const o=e.all("SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at LIMIT ?",[r]),s=[];for(const c of o){const n=P.get(c.tbl);if(!n)continue;const i=Nt(e,n,c.id);if(!i){s.push({space_id:null,tbl:n.name,id:c.id,data:null,deleted:!0,stamp:c.changed_at,exclusive:!1});continue}const l=n.scope==="own"||n.scope==="item",u=new Set(Me(t));for(const E of Fn(e,n,i,t).filter(T=>u.has(T)))s.push({space_id:E,tbl:n.name,id:c.id,data:i,deleted:!1,stamp:c.changed_at,exclusive:l}),n.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(i.sha256),E,"up",String(i.mime)])}return{entries:s,taken:o}}function Hn(e,t){e.exec("BEGIN");try{for(const r of t)e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?",[r.tbl,r.id,r.changed_at]);e.exec("COMMIT")}catch(r){throw e.exec("ROLLBACK"),r}}const ot=new WeakMap;function Wn(e,t){let r=ot.get(e);r||ot.set(e,r=new Map);let o=r.get(t);return o||(o=new Set(e.all(`PRAGMA table_info(${t})`).map(s=>s.name)),r.set(t,o)),o}function Ee(e,t,r){return e.get("SELECT local_id FROM sync_idmap WHERE tbl = ? AND remote_id = ?",[t,r])?.local_id??r}function Xn(e,t,r,o){return t.scope==="own"?r.space_id??o.privateId:t.scope==="item"?pt(e,r[t.itemCol],o):null}function xn(e,t,r){if(!t.length)return 0;let o=0;e.exec("PRAGMA foreign_keys = OFF"),e.exec("BEGIN");try{e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");for(const s of t){e.exec("SAVEPOINT rec");try{o+=Pn(e,s,r),e.exec("RELEASE rec")}catch(c){e.exec("ROLLBACK TO rec; RELEASE rec")}}e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'"),e.exec("COMMIT")}catch(s){throw e.exec("ROLLBACK"),s}finally{e.exec("PRAGMA foreign_keys = ON")}return o}function Pn(e,t,r){let o=0;const s=P.get(t.tbl);if(!s)return 0;const c=t.id.split(Ne),n=s.key.map((a,m)=>{const f=c[m]??"";return s.refs?.[a]?Ee(e,s.refs[a],f):s.mergeBy?Ee(e,s.name,f):f}),i=n.join(Ne),l=e.get("SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?",[s.name,i]);if(l&&l.changed_at>t.stamp)return o;const u=Nt(e,s,i);if(t.deleted||!t.data){if(!u)return o;const a=Xn(e,s,u,r);if(a!==null&&a!==t.space_id)return o;const[m,f]=ft(s,i);return o+=e.run(`DELETE FROM ${s.name} WHERE ${m}`,f).changes,l&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[s.name,i]),o}const E={...t.data},T=t.space_id===r.privateId?null:t.space_id,_=s.name!=="folders"||E.parent_id==null&&E.deleted_at==null;if(s.mergeBy&&!u&&_){const a=s.mergeBy,m=e.get(`SELECT id FROM ${s.name} WHERE ${a.col} = ?${a.nocase?" COLLATE NOCASE":""}${a.where?` AND ${a.where}`:""}${a.sameSpace?" AND space_id IS ?":""} AND id <> ? LIMIT 1`,a.sameSpace?[String(E[a.col]),T,String(E.id)]:[String(E[a.col]),String(E.id)]);if(m)return e.run("INSERT OR REPLACE INTO sync_idmap (tbl, remote_id, local_id) VALUES (?, ?, ?)",[s.name,String(E.id),m.id]),o}for(const[a,m]of Object.entries(s.refs??{}))typeof E[a]=="string"&&(E[a]=Ee(e,m,E[a]));if(s.name==="folders"&&E.item_defaults)try{const a=typeof E.item_defaults=="string"?JSON.parse(E.item_defaults):E.item_defaults;a&&typeof a.categoryId=="string"&&(E.item_defaults=JSON.stringify({...a,categoryId:Ee(e,"categories",a.categoryId)}))}catch{}if(s.key.forEach((a,m)=>{E[a]=n[m]}),s.scope==="own"&&(E.space_id=T),u&&typeof u.updated_at=="string"&&typeof E.updated_at=="string"&&u.updated_at>E.updated_at)return o;const N=Object.keys(E).filter(a=>Wn(e,s.name).has(a)&&!(s.localOnly??[]).includes(a)),R=N.map(a=>{const m=E[a];return m===void 0?null:typeof m=="object"&&m!==null?JSON.stringify(m):m}),A=N.filter(a=>!s.key.includes(a)),d=A.length?`DO UPDATE SET ${A.map(a=>`${a} = excluded.${a}`).join(", ")}`:"DO NOTHING";return o+=e.run(`INSERT INTO ${s.name} (${N.join(", ")}) VALUES (${N.map(()=>"?").join(", ")}) ON CONFLICT(${s.key.join(", ")}) ${d}`,R).changes,l&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[s.name,i]),s.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(E.sha256),t.space_id,"down",String(E.mime)]),o}function zn(e,t,r){const o=t?.sharedId&&t.sharedId!==r.sharedId?t.sharedId:null;e.exec("BEGIN");try{if(o){e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");const s="SELECT id FROM items WHERE space_id = ?";for(const c of fe)c.scope==="item"&&e.run(`DELETE FROM sync_outbox WHERE tbl = ? AND id IN (SELECT ${pe(c,c.name)} FROM ${c.name} WHERE ${c.itemCol} IN (${s}))`,[c.name,o]);e.run(`DELETE FROM sync_outbox WHERE tbl = 'items' AND id IN (${s})`,[o]),e.run("DELETE FROM sync_outbox WHERE tbl = 'folders' AND id IN (SELECT id FROM folders WHERE space_id = ?)",[o]),e.run("DELETE FROM items WHERE space_id = ?",[o]),e.run("DELETE FROM folders WHERE space_id = ?",[o]),e.run("DELETE FROM sync_outbox WHERE tbl = 'goals' AND id IN (SELECT id FROM goals WHERE space_id = ?)",[o]),e.run("DELETE FROM goals WHERE space_id = ?",[o]);for(const c of["orders","class_slots","calendars"])e.run(`DELETE FROM sync_outbox WHERE tbl = '${c}' AND id IN (SELECT id FROM ${c} WHERE space_id = ?)`,[o]),e.run(`DELETE FROM ${c} WHERE space_id = ?`,[o]);e.run("DELETE FROM sync_blobs WHERE space_id = ?",[o]),e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'")}J(e,"spaces",JSON.stringify(r)),J(e,"cursor",null),e.exec("COMMIT")}catch(s){throw e.exec("ROLLBACK"),s}}function ke(e,t){return e.get("SELECT value FROM sync_state WHERE key = ?",[t])?.value??null}function J(e,t,r){r===null?e.run("DELETE FROM sync_state WHERE key = ?",[t]):e.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",[t,r])}const Bn=50,at=500,Gn=8;async function jn(e,t,r,o){for(let i=0;i<100;i++){const{entries:l,taken:u}=$n(e,t);if(!u.length)break;l.length&&await r.push(l),Hn(e,u)}let s=0,c=Number(ke(e,"cursor")??0);for(let i=0;i<200;i++){const l=Math.max(0,c-(i===0?Bn:0)),u=await r.pull(l,at);if(!u.length)break;s+=xn(e,u,t);const E=Math.max(...u.map(T=>T.rev));if(E>c&&(c=E,J(e,"cursor",String(c))),u.length<at)break}const n=e.all("SELECT * FROM sync_blobs WHERE tries < 40 ORDER BY dir DESC, tries LIMIT ?",[Gn]);for(const i of n)try{let l=!1;if(i.dir==="up"){const u=await o.read(i.sha256);u&&await r.upload(i.space_id,i.sha256,u,i.mime),l=!0}else if(await o.read(i.sha256))l=!0;else{const u=await r.download(i.space_id,i.sha256);u&&(await o.write(u,i.mime),l=!0,s++)}l?e.run("DELETE FROM sync_blobs WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir]):e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir])}catch{e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir])}return s}class F extends Error{constructor(t,r=0,o=!1){super(t),this.status=r,this.offline=o}}const De=e=>({accessToken:e.access_token,refreshToken:e.refresh_token,expiresAt:Date.now()+e.expires_in*1e3,userId:e.user.id,email:e.user.email});function Yn(e,t){const r=t.msg??t.message??t.error_description??"",o=t.error_code??t.code??"";return o==="invalid_credentials"||/invalid login credentials/i.test(r)?"Nieprawidłowy e-mail lub hasło.":o==="user_already_exists"||/already registered/i.test(r)?"To konto już istnieje — zaloguj się.":o==="weak_password"||/password should be/i.test(r)?"Hasło jest za krótkie (minimum 6 znaków).":/database error saving new user|nie ma zaproszenia/i.test(r)||o==="unexpected_failure"?"Ten adres e-mail nie ma zaproszenia do Notario.":o==="validation_failed"||/email/i.test(r)&&e===400?"Sprawdź adres e-mail.":e===429?"Za dużo prób. Spróbuj za chwilę.":r||`Błąd serwera (${e}).`}function Kn(e,t){let r=t.load(),o=null;async function s(T,_={}){const N=new Headers(_.headers);N.set("apikey",e.key),_.auth!==!1&&N.set("Authorization",`Bearer ${await i()}`);let R;try{R=await fetch(`${e.url}${T}`,{..._,headers:N})}catch{throw new F("Brak połączenia z internetem.",0,!0)}return R}async function c(T,_){const N=await s(T,{method:"POST",auth:!1,headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}),R=await N.json().catch(()=>({}));if(!N.ok)throw new F(Yn(N.status,R),N.status);return R}function n(T){r=T,t.save(T)}async function i(){if(!r)throw new F("Nie zalogowano.",401);return r.expiresAt-Date.now()>6e4?r.accessToken:(o??(o=(async()=>{try{const T=await c("/auth/v1/token?grant_type=refresh_token",{refresh_token:r.refreshToken}),_=De(T);return n(_),_}catch(T){throw T instanceof F&&(T.status===400||T.status===401)&&n(null),T}finally{o=null}})()),(await o).accessToken)}async function l(T){if(T.status===401)throw new F("Sesja wygasła. Zaloguj się ponownie.",401);if(!T.ok){const N=await T.text().catch(()=>"");throw new F(`Serwer odrzucił zapytanie (${T.status}) ${N.slice(0,200)}`,T.status)}const _=await T.text();return _?JSON.parse(_):null}const u=async(T,_)=>l(await s(`/rest/v1/rpc/${T}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}));return{transport:{async push(T){await u("push_records",{changes:T})},async pull(T,_){const N=`select=space_id,tbl,id,data,deleted,stamp,rev&rev=gt.${T}&order=rev.asc&limit=${_}`;return l(await s(`/rest/v1/records?${N}`))},async upload(T,_,N,R){const A=await s(`/storage/v1/object/blobs/${T}/${_}`,{method:"POST",headers:{"Content-Type":R||"application/octet-stream"},body:N.slice().buffer});if(A.ok||A.status===409)return;const d=await A.text().catch(()=>"");if(!(A.status===400&&/exists|duplicate/i.test(d)))throw new F(`Nie udało się wysłać pliku (${A.status}).`,A.status)},async download(T,_){const N=await s(`/storage/v1/object/authenticated/blobs/${T}/${_}`);if(N.status===404||N.status===400)return null;if(!N.ok)throw new F(`Nie udało się pobrać pliku (${N.status}).`,N.status);return new Uint8Array(await N.arrayBuffer())}},rpc:u,session:()=>r,async signIn(T,_){const N=await c("/auth/v1/token?grant_type=password",{email:T.trim(),password:_}),R=De(N);return n(R),R},async signUp(T,_){const N=await c("/auth/v1/signup",{email:T.trim(),password:_});if("access_token"in N&&N.access_token){const R=De(N);return n(R),R}return this.signIn(T,_)},async signOut(){const T=r;n(null),T&&await fetch(`${e.url}/auth/v1/logout`,{method:"POST",headers:{apikey:e.key,Authorization:`Bearer ${T.accessToken}`}}).catch(()=>{})},async spaces(){const T=await u("my_spaces",{}),_=T.find(N=>N.kind==="private");if(!_)throw new F("Konto nie ma jeszcze swojej przestrzeni na serwerze.");return{privateId:_.id,sharedId:T.find(N=>N.kind==="shared")?.id??null}}}}function Jn(e){const t=/"message"\s*:\s*"([^"]+)"/.exec(e);return t?t[1]:e.replace(/^Serwer odrzucił zapytanie \(\d+\)\s*/,"")}function Vn(e){const t=Kn(e.config,e.store),r=new Set;let o=t.session()?"idle":"off",s=null,c=null,n=null,i=!1,l;function u(){const a=ke(e.db,"spaces");return a?JSON.parse(a):null}function E(){const a=t.session();return{signedIn:!!a,email:a?.email??null,state:a?o:"off",error:s,lastSyncAt:c,pending:bn(e.db),sharedSpaceId:a?u()?.sharedId??null:null}}const T=()=>{const a=E();r.forEach(m=>m(a))};async function _(){const a=t.session();if(!a){o="off";return}o="syncing",T();try{ke(e.db,"user")!==a.userId&&(J(e.db,"user",a.userId),J(e.db,"cursor",null),J(e.db,"spaces",null));const m=u(),f=await t.spaces();(!m||m.privateId!==f.privateId||m.sharedId!==f.sharedId)&&(zn(e.db,m,f),e.onRemoteChange());const y=await jn(e.db,f,t.transport,e.blobs);e.onDbWritten(),y>0&&e.onRemoteChange(),o="idle",s=null,c=Date.now()}catch(m){const f=m;o=f.offline?"offline":"error",s=f.offline?null:f.message,t.session()||(o="off"),e.onDbWritten()}T()}async function N(a,m){try{await t.rpc(a,m)}catch(f){throw new F(Jn(f.message))}await R()}function R(){return clearTimeout(l),n?(i=!0,n):(n=(async()=>{do i=!1,await _();while(i)})().finally(()=>{n=null}),n)}function A(a=1200){t.session()&&(clearTimeout(l),l=setTimeout(()=>void R(),a))}const d=setInterval(()=>{t.session()&&e.visible()&&!n&&R()},e.pollMs??5e3);return{status:E,syncNow:R,schedule:A,onStatus(a){return r.add(a),()=>r.delete(a)},async signIn(a,m){return await t.signIn(a,m),s=null,await R(),E()},async signUp(a,m){return await t.signUp(a,m),s=null,await R(),E()},async signOut(){return await t.signOut(),o="off",s=null,T(),E()},stop(){clearInterval(d),clearTimeout(l)},async savePush(a){await t.rpc("save_push_subscription",{p_endpoint:a.endpoint,p_p256dh:a.p256dh,p_auth:a.auth,p_tz:a.tz})},family:{info:()=>t.rpc("family_info",{}),invite:a=>N("family_invite",{p_email:a}),cancelInvite:a=>N("family_cancel_invite",{p_id:a}),declineInvite:a=>N("family_decline_invite",{p_id:a}),removeMember:a=>N("family_remove_member",{p_user:a}),leave:()=>N("family_leave",{}),async acceptInvite(a,m){await N("family_accept_invite",{p_id:a,p_bring:m}),e.db.run("INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM files"),e.onDbWritten()}}}}const st="notatnik.sqlite",he="notario.session",Zn=400;async function qn(e){const t=await e(),r={persistent:!1};let o=null;try{o=await me(st),r.persistent=!0}catch{r.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const s=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;r.persistent&&!await Un()&&!s&&(r.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const c=hn(t,o),n=Sn(c);let i=!o,l,u=Promise.resolve();const E=()=>{if(clearTimeout(l),!i||!r.persistent)return u;i=!1;const a=c.exportBytes();return u=u.then(()=>_t(st,a)).then(()=>{r.lastSavedAt=Date.now()}).catch(m=>{i=!0,console.error("Saving database failed",m),r.note="Nie udało się zapisać danych w pamięci przeglądarki."}),u},T=()=>{i=!0,clearTimeout(l),l=setTimeout(E,Zn)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&E()}),window.addEventListener("pagehide",()=>void E()),i&&T();const _=new Set,N=a=>{const m={method:a,at:Date.now()};queueMicrotask(()=>_.forEach(f=>f(m)))},R=Mn(()=>r.persistent),A=Vn({db:c,config:It,store:{load(){try{return JSON.parse(localStorage.getItem(he)??"null")}catch{return null}},save(a){try{a?localStorage.setItem(he,JSON.stringify(a)):localStorage.removeItem(he)}catch{}}},blobs:{read:a=>R.read(a),write:async(a,m)=>{await R.put(a,m)}},onDbWritten:T,onRemoteChange:()=>N("sync.pull"),visible:()=>document.visibilityState==="visible"&&navigator.onLine!==!1});window.addEventListener("online",()=>void A.syncNow()),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&A.syncNow()}),A.syncNow();const d={async call(a,m){const{result:f,mutated:y}=Dn(n.api,a,m);return y&&(T(),N(a),A.schedule()),f.ok?{ok:!0,value:f.value===void 0?void 0:structuredClone(f.value)}:f},onChanged(a){return _.add(a),()=>_.delete(a)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...r}),blobs:R,sync:{status:A.status,onStatus:A.onStatus,signIn:A.signIn,signUp:A.signUp,signOut:A.signOut,syncNow:A.syncNow,family:A.family,savePush:A.savePush}};window.bridge=d}export{qn as installWebBridge};
