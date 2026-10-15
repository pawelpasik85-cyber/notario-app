import{n as g,i as O,N as M,a as At,V as p,P as Ue,b as Y,e as lt,c as U,l as ae,t as ne,d as ve,f as fe,g as gt,p as Ot,h as St,j as wt,k as ht,m as Dt,S as It}from"./index-CoqVe6k9.js";function Ct(e){let t=0;return function(r){const d=`sp_${t}`;e.exec(t===0?"BEGIN IMMEDIATE":`SAVEPOINT ${d}`),t++;try{const l=r();return t--,e.exec(t===0?"COMMIT":`RELEASE ${d}`),l}catch(l){throw t--,e.exec(t===0?"ROLLBACK":`ROLLBACK TO ${d}; RELEASE ${d}`),l}}}function Ut(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const Ne=[{name:"categories",key:["id"],scope:"all",mergeBy:{col:"name",where:"deleted_at IS NULL",nocase:!0}},{name:"tags",key:["id"],scope:"all",mergeBy:{col:"name",nocase:!0}},{name:"folders",key:["id"],scope:"own",refs:{category_id:"categories",parent_id:"folders"},mergeBy:{col:"name",where:"parent_id IS NULL AND deleted_at IS NULL",nocase:!0,sameSpace:!0}},{name:"items",key:["id"],scope:"own",refs:{category_id:"categories",folder_id:"folders"},localOnly:["opened_at"]},{name:"files",key:["id"],scope:"file",mergeBy:{col:"sha256"}},{name:"payments",key:["item_id"],scope:"item",itemCol:"item_id"},{name:"occurrence_states",key:["item_id","occurrence_key"],scope:"item",itemCol:"item_id"},{name:"checklist_items",key:["id"],scope:"item",itemCol:"item_id"},{name:"item_tags",key:["item_id","tag_id"],scope:"item",itemCol:"item_id",refs:{tag_id:"tags"}},{name:"item_links",key:["from_item_id","to_item_id","relation"],scope:"item",itemCol:"from_item_id"},{name:"item_files",key:["item_id","file_id"],scope:"item",itemCol:"item_id",refs:{file_id:"files"}},{name:"reminder_rules",key:["id"],scope:"item",itemCol:"item_id"},{name:"goals",key:["id"],scope:"own",since:3},{name:"calendars",key:["id"],scope:"own",since:4},{name:"orders",key:["id"],scope:"own",since:4,refs:{calendar_id:"calendars"}},{name:"class_slots",key:["id"],scope:"own",since:5,refs:{calendar_id:"calendars"}},{name:"vault",key:["id"],scope:"own",since:10},{name:"shop_lists",key:["id"],scope:"own",since:11,mergeBy:{col:"name",nocase:!0,sameSpace:!0}},{name:"shop_items",key:["id"],scope:"own",since:11,refs:{list_id:"shop_lists"}}],X=new Map(Ne.map(e=>[e.name,e])),pe="|",Le=(e,t)=>e.key.map(o=>`${t}.${o}`).join(` || '${pe}' || `),ee="strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",te="(SELECT value FROM sync_state WHERE key = 'applying') = '0'",vt=["type","title","body_json","body_text","folder_id","parent_item_id","category_id","status","priority","favorite","pinned","sort_order","start_at","due_at","all_day","recurrence","completed_at","trashed_with","created_at","updated_at","deleted_at","space_id"];function Mt(){const e=[`
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
`];for(const o of Ne.filter(r=>!r.since))e.push(P(o));e.push(`
CREATE TRIGGER sync_item_files_file_ai AFTER INSERT ON item_files WHEN ${te} BEGIN
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('files', new.file_id, ${ee});
END;`);const t=Ne.filter(o=>o.scope==="item");return e.push(`
CREATE TRIGGER sync_items_space_au AFTER UPDATE OF space_id ON items WHEN ${te} BEGIN
${t.map(o=>`  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${o.name}', ${Le(o,o.name)}, ${ee} FROM ${o.name} WHERE ${o.itemCol} = new.id;`).join(`
`)}
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', file_id, ${ee} FROM item_files WHERE item_id = new.id;
END;`),e.join(`
`)}function P(e){const t=r=>`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${e.name}', ${Le(e,r)}, ${ee});`,o=e.name==="items"?` OF ${vt.filter(r=>!(e.localOnly??[]).includes(r)).join(", ")}`:"";return`
CREATE TRIGGER sync_${e.name}_ai AFTER INSERT ON ${e.name} WHEN ${te} BEGIN ${t("new")} END;
CREATE TRIGGER sync_${e.name}_au AFTER UPDATE${o} ON ${e.name} WHEN ${te} BEGIN ${t("new")} END;
CREATE TRIGGER sync_${e.name}_ad AFTER DELETE ON ${e.name} WHEN ${te} BEGIN ${t("old")} END;
-- Everything that already exists goes out on the first sync.
INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${e.name}', ${Le(e,e.name)}, ${ee} FROM ${e.name};`}function kt(){return`
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
${P(X.get("goals"))}`}function Ft(){return`
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
${P(X.get("calendars"))}
${P(X.get("orders"))}`}function bt(){return`
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
${P(X.get("class_slots"))}`}function Ht(){return`
ALTER TABLE orders ADD COLUMN cost_minor INTEGER;   -- grosze
`}function Wt(){return`
CREATE TABLE vault (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('meta', 'entry')),
  payload     TEXT NOT NULL,          -- meta: salt + check; entry: {"iv","ct"} (ciphertext only)
  space_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
${P(X.get("vault"))}`}function Xt(){return`
ALTER TABLE calendars ADD COLUMN leave TEXT;    -- {"uw":26,"years":{"2026":20}}
`}function $t(){return`
ALTER TABLE calendars ADD COLUMN logo TEXT;     -- small image as data URL (≤ ~60 kB)
ALTER TABLE calendars ADD COLUMN color2 TEXT;   -- second brand colour (gradient)
`}function xt(){return`
CREATE TABLE shop_lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  REAL NOT NULL DEFAULT 0,
  space_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE shop_items (
  id          TEXT PRIMARY KEY,
  list_id     TEXT NOT NULL,
  text        TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     TEXT,
  hidden      INTEGER NOT NULL DEFAULT 0,  -- 1 = cleared from the list, kept for "często kupowane"
  times       INTEGER NOT NULL DEFAULT 1,  -- how many times it was put on the list
  sort_order  REAL NOT NULL DEFAULT 0,
  space_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_shop_items_list ON shop_items(list_id, done, sort_order);
${P(X.get("shop_lists"))}
${P(X.get("shop_items"))}
`}function Pt(){return`
ALTER TABLE payments ADD COLUMN kind TEXT;   -- monthly | yearly | installment | other
`}const z=e=>`replace(replace(${e}, 'ł', 'l'), 'Ł', 'L')`,G=e=>z(`
  coalesce((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = ${e}), '')
  || ' ' ||
  coalesce((SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id
            WHERE x.item_id = ${e}), '')`),zt=[{version:1,name:"initial schema",sql:`
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

`},{version:2,name:"sync: spaces and change log",sql:Mt()},{version:3,name:"goals",sql:kt()},{version:4,name:"calendars and orders",sql:Ft()},{version:5,name:"student calendars and timetable",sql:bt()},{version:6,name:"calendar logo and brand colours",sql:$t()},{version:7,name:"work calendars: leave allowance",sql:Xt()},{version:8,name:"order costs",sql:Ht()},{version:9,name:"payments are tasks",sql:`UPDATE items SET type = 'task', status = COALESCE(status, 'todo'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE type <> 'task' AND id IN (SELECT item_id FROM payments);`},{version:10,name:"password vault",sql:Wt()},{version:11,name:"shopping lists",sql:xt()},{version:12,name:"payment kind",sql:Pt()}],Bt=`
-- Full-text search ------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(
  item_id UNINDEXED,
  title,
  body,
  extra,                                          -- tag names + attachment file names
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (item_id, title, body, extra) VALUES (new.id, ${z("new.title")}, ${z("new.body_text")}, '');
END;
CREATE TRIGGER items_fts_au AFTER UPDATE OF title, body_text ON items BEGIN
  UPDATE items_fts SET title = ${z("new.title")}, body = ${z("new.body_text")} WHERE item_id = new.id;
END;
CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE item_id = old.id;
END;
CREATE TRIGGER item_tags_fts_ai AFTER INSERT ON item_tags BEGIN
  UPDATE items_fts SET extra = ${G("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_tags_fts_ad AFTER DELETE ON item_tags BEGIN
  UPDATE items_fts SET extra = ${G("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER item_files_fts_ai AFTER INSERT ON item_files BEGIN
  UPDATE items_fts SET extra = ${G("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_files_fts_ad AFTER DELETE ON item_files BEGIN
  UPDATE items_fts SET extra = ${G("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER tags_fts_au AFTER UPDATE OF name ON tags BEGIN
  UPDATE items_fts SET extra = ${G("items_fts.item_id")}
  WHERE item_id IN (SELECT item_id FROM item_tags WHERE tag_id = new.id);
END;
`,Gt=`
DELETE FROM items_fts;
INSERT INTO items_fts (item_id, title, body, extra)
  SELECT i.id, ${z("i.title")}, ${z("i.body_text")}, ${G("i.id")} FROM items i;
`;function jt(e,t=zt){const o=e.get("PRAGMA user_version"),r=Number(o?.user_version??0),d=[],l=[...t].sort((n,i)=>n.version-i.version).filter(n=>n.version>r);for(const n of l){e.exec("BEGIN IMMEDIATE");try{e.exec(n.sql),e.exec(`PRAGMA user_version = ${n.version}`),e.exec("COMMIT"),d.push(n.version)}catch(i){throw e.exec("ROLLBACK"),new Error(`Migration ${n.version} (${n.name}) failed: ${i.message}`)}}return d}function Yt(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function Kt(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function Jt(e,t=!0){if(Kt(e))return!0;if(!t||!Yt(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(Bt),e.exec(Gt),e.exec("COMMIT"),!0}catch(o){throw e.exec("ROLLBACK"),o}}const Pe=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:g(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),Vt=/^#[0-9a-fA-F]{6}$/,Zt=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}],Qt=[{name:"Urodziny",color:"#EC4899",icon:"cake"},{name:"Wakacje",color:"#14B8A6",icon:"plane"},{name:"Zdrowie",color:"#38BDF8",icon:"heart"},{name:"Rodzina",color:"#FACC15",icon:"users"}],qt=[{name:"Urlop",color:"#06B6D4",icon:"sun"},{name:"Wyjazd",color:"#F97316",icon:"map"},{name:"Sport",color:"#22C55E",icon:"dumbbell"},{name:"Zajęcia",color:"#8B5CF6",icon:"graduation-cap"}];function en(e){const{db:t,env:o}=e;function r(n){const i=t.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[n]);if(!i)throw new M("Category",n);return Pe(i)}function d(n,i){if(n!==void 0&&!n.trim())throw new p("Nazwa kategorii nie może być pusta");if(i!==void 0&&!Vt.test(i))throw new p("Kolor musi mieć format #RRGGBB")}function l(n){d(n.name,n.color);const i=o.newId(),c=O(o.now());return t.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[i,n.name.trim(),n.color,n.icon??null,At(e,"categories","deleted_at IS NULL",[]),c,c]),r(i)}return{create:l,list(){return t.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(Pe)},get:r,update(n,i){const c=r(n);return d(i.name,i.color),t.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[i.name?.trim()??c.name,i.color??c.color,i.icon===void 0?c.icon:i.icon,i.sortOrder??c.sortOrder,O(o.now()),n]),r(n)},remove(n){r(n),e.tx(()=>{const i=O(o.now());t.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[i,n]),t.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[i,n]),t.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[i,i,n])})},seedDefaults(){const n=t.get("SELECT COUNT(*) AS c FROM categories");if(g(n?.c??0)===0)for(const c of Zt)l(c);const i=(c,u)=>{if(!t.get("SELECT 1 AS x FROM settings WHERE key = ?",[c])){for(const E of u)t.get("SELECT 1 AS x FROM categories WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL",[E.name])||l(E);t.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",[c,"true",O(o.now())])}};i("seed.eventCategories",Qt),i("seed.eventCategories2",qt)}}}const de=e=>({id:e.id,name:e.name,color:e.color});function Oe(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function tn(e){const{db:t,env:o}=e;function r(n){const i=t.get("SELECT id, name, color FROM tags WHERE id = ?",[n]);if(!i)throw new M("Tag",n);return de(i)}function d(n){const i=Oe(n);if(!i)throw new p("Nazwa tagu nie może być pusta");const c=t.get("SELECT id, name, color FROM tags WHERE name = ?",[i]);if(c)return de(c);const u=o.newId(),E=O(o.now());return t.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[u,i,E,E]),r(u)}function l(n){return t.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[n]).map(de)}return{get:r,ensure:d,list(){return t.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(n=>({...de(n),itemCount:g(n.item_count)}))},forItem:l,setForItem(n,i){return e.tx(()=>{const c=new Map;for(const _ of i.map(Oe))_&&!c.has(_.toLowerCase())&&c.set(_.toLowerCase(),_);const u=[...c.values()].map(d),E=new Set(u.map(_=>_.id)),m=t.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[n]).map(_=>_.tag_id);for(const _ of m)E.has(_)||t.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[n,_]);for(const _ of E)m.includes(_)||t.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[n,_]);return t.run("UPDATE items SET updated_at = ? WHERE id = ?",[O(o.now()),n]),l(n)})},update(n,i){const c=r(n),u=i.name===void 0?c.name:Oe(i.name);if(!u)throw new p("Nazwa tagu nie może być pusta");if(t.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[u,n]))throw new p(`Tag „${u}” już istnieje`);return t.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[u,i.color===void 0?c.color:i.color,O(o.now()),n]),r(n)},remove(n){r(n),t.run("DELETE FROM tags WHERE id = ?",[n])}}}const ze=["note","task","event"],Be=["todo","in_progress","done","on_hold"],K=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id, i.space_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency, p.kind AS pay_kind,
         (SELECT COUNT(*) FROM occurrence_states o WHERE o.item_id = i.id AND o.status = 'done') AS occ_done,
         i.opened_at, i.updated_at, i.deleted_at, i.recurrence,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count,
         (SELECT group_concat(DISTINCT f.mime) FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id) AS file_mimes
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,J=e=>({id:e.id,type:e.type,title:e.title,spaceId:e.space_id??null,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:g(e.priority),favorite:Y(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:Y(e.all_day),isPayment:Y(e.is_payment),amountMinor:e.amount_minor==null?null:g(e.amount_minor),currency:e.currency,paymentKind:Ue.includes(String(e.pay_kind))?e.pay_kind:null,seriesDone:g(e.occ_done??0),openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:g(e.file_count??0),fileMimes:e.file_mimes?String(e.file_mimes).split(","):[],recurrence:Et(e.recurrence),occurrence:null});function Et(e){if(!e)return null;try{return ve(JSON.parse(e))}catch{return null}}function ut(e,t,o){return{...e,startAt:t.startAt,dueAt:t.dueAt,occurrence:t.key,status:e.type==="task"?o?"done":"todo":e.status}}function mt(e,t){const o=new Map;if(!t.length)return o;const r=e.all(`SELECT item_id, occurrence_key FROM occurrence_states WHERE status = 'done' AND item_id IN (${t.map(()=>"?").join(",")})`,t);for(const d of r)o.has(d.item_id)||o.set(d.item_id,new Set),o.get(d.item_id).add(d.occurrence_key);return o}function Re(e,t,o,r){const d=mt(e,t.map(n=>n.id)),l=[];for(const n of t){if(!n.recurrence)continue;const i=d.get(n.id);for(const c of lt(n,n.recurrence,o,r))l.push(ut(n,c,!!i?.has(c.key)))}return l}function ce(e,t){if(t!=null&&!gt(t))throw new p(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${t}”`)}function Ge(e,t){if(e&&t&&e.slice(0,10)>t.slice(0,10))throw new p("Koniec nie może być przed początkiem")}function je(e){if(e===0||e===1||e===2||e===3)return e;throw new p("Priorytet musi być liczbą 0–3")}function nn(e,t){const{db:o,env:r}=e;function d(a){return o.get("SELECT * FROM items WHERE id = ?",[a])}function l(a){const s=o.get("SELECT amount_minor, currency, account, payee, kind FROM payments WHERE item_id = ?",[a]);return s?{amountMinor:s.amount_minor==null?null:g(s.amount_minor),currency:s.currency,account:s.account,payee:s.payee,kind:Ue.includes(String(s.kind))?s.kind:null}:null}function n(a){return{id:a.id,type:a.type,title:a.title,spaceId:a.space_id??null,bodyJson:Ot(a.body_json),bodyText:a.body_text,folderId:a.folder_id,parentItemId:a.parent_item_id,categoryId:a.category_id,status:a.status,priority:g(a.priority),favorite:Y(a.favorite),pinned:Y(a.pinned),sortOrder:g(a.sort_order),startAt:a.start_at,dueAt:a.due_at,allDay:Y(a.all_day),recurrence:Et(a.recurrence),completedAt:a.completed_at,openedAt:a.opened_at,createdAt:a.created_at,updatedAt:a.updated_at,deletedAt:a.deleted_at,tags:t.tags.forItem(a.id),payment:l(a.id)}}const i=a=>ae(o,"categories",a);function c(a){const s=d(a);if(!s)throw new M("Item",a);return n(s)}function u(a){const s=c(a);if(s.deletedAt)throw new M("Item",a);return s}function E(a){a&&t.folders.get(a)}function m(a,s){if(a){if(a===s)throw new p("Element nie może być swoim rodzicem");u(a)}}function _(a,s){const T=l(a),N=s.amountMinor===void 0?T?.amountMinor??null:s.amountMinor;if(N!=null&&(!Number.isInteger(N)||N<0))throw new p("Kwota musi być nieujemną liczbą całkowitą w groszach");const R=s.kind===void 0?T?.kind??null:s.kind;if(R!=null&&!Ue.includes(R))throw new p("Nieznany rodzaj płatności");o.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee, kind) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee, kind = excluded.kind`,[a,N,s.currency??T?.currency??"PLN",s.account??T?.account??"",s.payee??T?.payee??"",R])}function f(a){const s=a?o.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[a]):o.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(s?.m==null?0:g(s.m))+1}function L(a){const s=mt(o,[a.id]).get(a.id)??new Set,T=ne(r.now()),N=lt(a,a.recurrence,U(T,-366),U(T,800),2e3),R=N.find(h=>!s.has(h.key)&&(a.type==="task"||h.dueAt.slice(0,10)>=T)),w=R??N[N.length-1];return w?ut(a,w,!R&&a.type==="task"):a}const y={get:u,getAny:c,create(a){if(a.payment!=null&&a.type!=="task"&&(a={...a,type:"task"}),!ze.includes(a.type))throw new p(`Nieznany typ elementu: ${String(a.type)}`);ce("Początek",a.startAt),ce("Termin",a.dueAt),Ge(a.startAt,a.dueAt);const s=ve(a.recurrence);if(s&&!a.dueAt)throw new p("Powtarzanie wymaga daty");if(a.status!=null&&!Be.includes(a.status))throw new p("Nieznany status");const T=je(a.priority??1),N=a.folderId??null;E(N),m(a.parentItemId);const R=N?t.folders.get(N).itemDefaults:null,w=i(a.categoryId!==void 0?a.categoryId:R?.categoryId??null),h=a.payment!=null||a.payment===void 0&&!!R?.isPayment&&a.type==="task",D=a.type==="task"?a.status??"todo":null,k=a.dueAt??a.startAt,H=k?fe(k):!1,F=O(r.now()),C=r.newId();return e.tx(()=>(o.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, recurrence, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[C,a.type,(a.title??"").trim(),a.bodyJson==null?null:JSON.stringify(a.bodyJson),a.bodyText??"",N,a.parentItemId??null,w,D,T,a.favorite?1:0,f(N),a.startAt??null,a.dueAt??null,H?1:0,s?JSON.stringify(s):null,D==="done"?F:null,F,F]),h&&_(C,{currency:R?.currency,...a.payment??{}}),a.tags?.length&&t.tags.setForItem(C,a.tags),u(C)))},update(a,s){const T=u(a);if(s.type!==void 0&&!ze.includes(s.type))throw new p("Nieznany typ elementu");if(s.status!=null&&!Be.includes(s.status))throw new p("Nieznany status");ce("Początek",s.startAt),ce("Termin",s.dueAt),s.folderId!==void 0&&E(s.folderId),s.parentItemId!==void 0&&m(s.parentItemId,a);const N=s.type??T.type;if((s.payment===void 0?!!T.payment:s.payment!=null)&&N!=="task")throw new p("Płatność jest zawsze zadaniem (do zapłaty w terminie)");let w=s.status===void 0?T.status:s.status;N==="task"&&w==null&&(w="todo"),N!=="task"&&(w=null);const h=s.startAt===void 0?T.startAt:s.startAt,D=s.dueAt===void 0?T.dueAt:s.dueAt;Ge(h,D);const k=s.recurrence===void 0?T.recurrence:ve(s.recurrence);if(k&&!D)throw new p("Powtarzanie wymaga daty");const H=D??h,F=O(r.now()),C=w==="done"?T.completedAt??F:null,$=s.priority===void 0?T.priority:je(s.priority);return e.tx(()=>(o.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, recurrence = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[N,s.title===void 0?T.title:s.title.trim(),s.bodyJson===void 0?T.bodyJson==null?null:JSON.stringify(T.bodyJson):s.bodyJson==null?null:JSON.stringify(s.bodyJson),s.bodyText??T.bodyText,s.folderId===void 0?ae(o,"folders",T.folderId):s.folderId,s.parentItemId===void 0?ae(o,"items",T.parentItemId):s.parentItemId,i(s.categoryId===void 0?T.categoryId:s.categoryId),w,$,s.favorite??T.favorite?1:0,s.pinned??T.pinned?1:0,s.sortOrder??T.sortOrder,h,D,H&&fe(H)?1:0,k?JSON.stringify(k):null,C,F,a]),s.payment===null?o.run("DELETE FROM payments WHERE item_id = ?",[a]):s.payment!==void 0&&_(a,s.payment),u(a)))},setTags(a,s){return u(a),t.tags.setForItem(a,s)},setStatus(a,s,T){const N=u(a);if(T&&N.recurrence){const R=O(r.now());return s==="done"?o.run(`INSERT INTO occurrence_states (item_id, occurrence_key, status, completed_at, updated_at) VALUES (?, ?, 'done', ?, ?)
             ON CONFLICT(item_id, occurrence_key) DO UPDATE SET status = 'done', completed_at = excluded.completed_at, updated_at = excluded.updated_at`,[a,T,R,R]):o.run("DELETE FROM occurrence_states WHERE item_id = ? AND occurrence_key = ?",[a,T]),u(a)}return y.update(a,{status:s})},paymentCheck(a,s){const T=u(a),N={isPayment:!!T.payment,title:T.title};if(!T.recurrence)return{...N,paidSameMonth:null,total:null,done:0};const R=o.all("SELECT occurrence_key AS k FROM occurrence_states WHERE item_id = ? AND status = 'done'",[a]).map(D=>D.k),w=new Set([ne(r.now()).slice(0,7),...s?[s.slice(0,7)]:[]]),h=R.filter(D=>D!==s&&w.has(D.slice(0,7))).sort().pop()??null;return{...N,paidSameMonth:h?h.slice(0,10):null,total:T.recurrence.count??null,done:R.filter(D=>D!==s).length}},toggleFavorite(a){return y.update(a,{favorite:!u(a).favorite})},markOpened(a){u(a),o.run("UPDATE items SET opened_at = ? WHERE id = ?",[O(r.now()),a])},setSpace(a,s){const T=u(a);return e.tx(()=>{const N=T.folderId?t.folders.find(T.folderId):null,R=N&&(N.spaceId??null)===s;o.run("UPDATE items SET space_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",[s,R?ae(o,"folders",T.folderId):null,O(r.now()),a])}),u(a)},move(a,s,T){return u(a),E(s),e.tx(()=>{const N=(s?o.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[s,a]):o.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[a])).map(w=>w.id),R=T===void 0?N.length:Math.max(0,Math.min(T,N.length));N.splice(R,0,a),o.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[s,O(r.now()),a]),N.forEach((w,h)=>o.run("UPDATE items SET sort_order = ? WHERE id = ?",[h+1,w]))}),u(a)},trash(a){u(a);const s=O(r.now());o.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[s,s,a])},restore(a){const s=c(a);return e.tx(()=>{const T=O(r.now()),N=s.folderId?t.folders.find(s.folderId):null,R=N&&!N.deletedAt?N.id:null;o.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[R,T,a])}),u(a)},purge(a){if(!c(a).deletedAt)throw new p("Najpierw przenieś element do kosza");o.run("DELETE FROM items WHERE id = ?",[a])},query(a={}){const s=[[a.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL",[],!1]],T=(A,I=[],v=!1)=>s.push([A,I,v]);if(a.type){const A=Array.isArray(a.type)?a.type:[a.type];T(`i.type IN (${A.map(()=>"?").join(",")})`,A)}if(a.folderId===null)T("i.folder_id IS NULL");else if(a.folderId!==void 0)if(a.includeSubfolders){const A=t.folders.descendantIds(a.folderId);T(`i.folder_id IN (${A.map(()=>"?").join(",")})`,A)}else T("i.folder_id = ?",[a.folderId]);if(a.status){const A=Array.isArray(a.status)?a.status:[a.status];T(`i.status IN (${A.map(()=>"?").join(",")})`,A,!0)}a.openOnly&&T("(i.status IS NULL OR i.status <> 'done')",[],!0),a.favorite!==void 0&&T(`i.favorite = ${a.favorite?1:0}`),a.tagId&&T("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)",[a.tagId]),a.payment!==void 0&&T(`p.item_id IS ${a.payment?"NOT NULL":"NULL"}`);const N=s.filter(A=>!A[2]),R=N.map(A=>A[0]),w=N.flatMap(A=>A[1]),h=!!(a.dueFrom||a.dueTo);h&&T("i.recurrence IS NULL"),a.dueFrom&&T("i.due_at >= ?",[a.dueFrom]),a.dueTo&&T("COALESCE(i.start_at, i.due_at) < ?",[a.dueTo]);const D=s.map(A=>A[0]),k=s.flatMap(A=>A[1]),H={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[a.orderBy??"manual"];a.orderBy==="opened"&&D.push("i.opened_at IS NOT NULL");const F=a.limit&&a.limit>0?` LIMIT ${Math.floor(a.limit)}`:"",C=o.all(`${K} WHERE ${D.join(" AND ")} ORDER BY ${H}${F}`,k).map(J),$=o.all(`${K} WHERE ${[...R,"i.recurrence IS NOT NULL","i.due_at IS NOT NULL"].join(" AND ")}`,w).map(J).filter(A=>A.recurrence);if(!$.length||a.trashed||a.orderBy==="opened")return C;const ie=A=>(!a.openOnly||A.status!=="done")&&(!a.status||(Array.isArray(a.status)?a.status:[a.status]).includes(A.status)),oe=A=>A.sort((I,v)=>(I.dueAt==null?1:0)-(v.dueAt==null?1:0)||((I.dueAt??"")<(v.dueAt??"")?-1:(I.dueAt??"")>(v.dueAt??"")?1:0)||v.priority-I.priority),re=A=>a.limit&&a.limit>0?A.slice(0,Math.floor(a.limit)):A;if(h){const A=a.dueFrom??"0000-01-01",I=a.dueTo??U(A.slice(0,10),400),v=Re(o,$,A,I).filter(ie);return v.length?re(oe([...C,...v])):C}const x=new Map($.map(A=>[A.id,L(A)])),W=C.flatMap(A=>{const I=x.get(A.id);return I?ie(I)?[I]:[]:[A]});return a.orderBy==="due"?oe(W):W},occurrences(a,s){const T=o.all(`${K} WHERE i.deleted_at IS NULL AND i.recurrence IS NOT NULL AND i.due_at IS NOT NULL`).map(J);return Re(o,T,a,s)}};return y}const Q={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function on(e){const{db:t,env:o}=e;return{get(r){const d=t.get("SELECT value FROM settings WHERE key = ?",[r]);if(!d)return Q[r];try{return JSON.parse(d.value)}catch{return Q[r]}},set(r,d){if(!(r in Q))throw new Error(`Unknown setting: ${String(r)}`);return t.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[r,JSON.stringify(d),O(o.now())]),d},all(){const r={...Q};for(const d of t.all("SELECT key, value FROM settings"))if(d.key in Q)try{r[d.key]=JSON.parse(d.value)}catch{}return r}}}const le=e=>String(e).padStart(2,"0");function rn(e,t){if(e.mode==="before"){const r=t.length>10?t.slice(0,16):`${t.slice(0,10)}T${e.timeOfDay??"09:00"}`,[d,l,n]=r.slice(0,10).split("-").map(Number),i=new Date(Date.UTC(d,l-1,n,+r.slice(11,13),+r.slice(14,16))-e.offsetMinutes*6e4);return`${i.getUTCFullYear()}-${le(i.getUTCMonth()+1)}-${le(i.getUTCDate())}T${le(i.getUTCHours())}:${le(i.getUTCMinutes())}`}return`${U(t.slice(0,10),-Math.round(e.offsetMinutes/1440))}T${e.timeOfDay??(t.length>10?t.slice(11,16):"09:00")}`}const sn=/^([01]\d|2[0-3]):[0-5]\d$/,an=60*1440;function dn(e){if(e.mode!=="before"&&e.mode!=="on_day")throw new p("Nieznany rodzaj przypomnienia");const t=Number(e.offsetMinutes??0);if(!Number.isInteger(t)||t<0||t>an)throw new p("Przypomnienie: wyprzedzenie 0–60 dni");if(e.timeOfDay!=null&&e.timeOfDay!==""&&!sn.test(e.timeOfDay))throw new p("Godzina przypomnienia: GG:MM");return{mode:e.mode,offsetMinutes:t,timeOfDay:e.timeOfDay||null}}function Ye(e,t){return St(rn(e,t))}function cn(e){const{db:t,env:o}=e,r=d=>({id:d.id,mode:d.mode,offsetMinutes:g(d.offset_minutes??0),timeOfDay:d.time_of_day});return{forItem(d){return t.all("SELECT * FROM reminder_rules WHERE item_id = ? AND enabled = 1 ORDER BY sort_order",[d]).map(r)},set(d,l){const n=l.map(dn);if(n.length>5)throw new p("Najwyżej 5 przypomnień");if(!t.get("SELECT 1 FROM items WHERE id = ? AND deleted_at IS NULL",[d]))throw new p("Nie ma takiego wpisu");const i=O(o.now());return e.tx(()=>{const c=t.all("SELECT * FROM reminder_rules WHERE item_id = ? ORDER BY sort_order",[d]).map(r);return c.length===n.length&&c.every((E,m)=>E.mode===n[m].mode&&E.offsetMinutes===n[m].offsetMinutes&&E.timeOfDay===n[m].timeOfDay)?c:(t.run("DELETE FROM reminder_rules WHERE item_id = ?",[d]),n.forEach((E,m)=>t.run(`INSERT INTO reminder_rules (id, item_id, mode, offset_minutes, time_of_day, enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,[o.newId(),d,E.mode,E.offsetMinutes,E.timeOfDay,m+1,i,i])),t.all("SELECT * FROM reminder_rules WHERE item_id = ? ORDER BY sort_order",[d]).map(r))})},due(d,l){const n=new Date(d),i=new Date(l),c=t.all("SELECT * FROM reminder_rules WHERE enabled = 1"),u=new Map;for(const s of c)u.set(s.item_id,[...u.get(s.item_id)??[],r(s)]);const E=[...u.keys()],m=E.length?t.all(`${K} WHERE i.deleted_at IS NULL AND i.due_at IS NOT NULL AND i.id IN (${E.map(()=>"?").join(",")})`,E).map(J):[],_=s=>`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,f=U(_(n),-1),L=U(_(i),62),y=[...m.filter(s=>!s.recurrence),...Re(t,m.filter(s=>s.recurrence),f,L)],a=[];for(const s of y){if(s.type==="task"&&s.status==="done")continue;const T=s.startAt??s.dueAt;for(const N of u.get(s.id)??[]){const R=Ye(N,T);R>=n&&R<i&&a.push({key:`${N.id}|${s.occurrence??""}`,itemId:s.id,occurrence:s.occurrence,title:s.title,type:s.type,startAt:s.startAt,dueAt:s.dueAt,fireAt:R.toISOString(),isPayment:s.isPayment,amountMinor:s.amountMinor,currency:s.currency})}}for(const s of t.all("SELECT * FROM orders WHERE remind_days IS NOT NULL AND status NOT IN ('shipped', 'cancelled')")){const T={mode:"on_day",offsetMinutes:g(s.remind_days)*1440,timeOfDay:"09:00"},N=[];s.status!=="ready"&&N.push(["due",s.due_date]),s.ship_date&&N.push(["ship",s.ship_date]);for(const[R,w]of N){const h=Ye(T,w);h>=n&&h<i&&a.push({key:`order|${s.id}|${R}|${w}`,itemId:s.id,occurrence:null,title:s.title,type:"task",startAt:null,dueAt:w,fireAt:h.toISOString(),isPayment:!1,amountMinor:s.amount_minor==null?null:g(s.amount_minor),currency:"PLN",order:{kind:R,calendarId:s.calendar_id,client:s.client}})}}return a.sort((s,T)=>s.fireAt.localeCompare(T.fireAt))}}}const Ke=["week","month","year"],Tt=e=>String(e).padStart(2,"0");function Je(e,t){const[o,r,d]=t.split("-").map(Number);if(e==="year")return`${o}-01-01`;if(e==="month")return`${o}-${Tt(r)}-01`;const l=(new Date(Date.UTC(o,r-1,d)).getUTCDay()+6)%7;return U(t.slice(0,10),-l)}function ln(e,t){const[o,r]=t.split("-").map(Number);return e==="year"?`${o+1}-01-01`:e==="month"?r===12?`${o+1}-01-01`:`${o}-${Tt(r+1)}-01`:U(t,7)}const Ve=e=>{const t=e.target==null?null:g(e.target),o=g(e.progress);return{id:e.id,title:e.title,notes:e.notes,period:e.period,periodStart:e.period_start,periodEnd:ln(e.period,e.period_start),target:t,progress:o,done:!!e.done_at||t!=null&&o>=t,doneAt:e.done_at,color:e.color,sortOrder:g(e.sort_order),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}};function Ze(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<1||t>1e6)throw new p("Cel liczbowy: liczba całkowita od 1");return t}function En(e){const{db:t,env:o}=e,r=l=>t.get("SELECT * FROM goals WHERE id = ?",[l]),d=l=>{const n=r(l);if(!n)throw new M("Goal",l);return Ve(n)};return{get:d,list(l={}){const n=l.date??ne(o.now()),i=l.period?[l.period]:Ke,c=[];for(const u of i)c.push(...t.all("SELECT * FROM goals WHERE period = ? AND period_start = ? ORDER BY sort_order, created_at",[u,Je(u,n)]).map(Ve));return c},create(l){const n=(l.title??"").trim();if(!n)throw new p("Wpisz, jaki to cel");if(!Ke.includes(l.period))throw new p("Okres: tydzień, miesiąc albo rok");const i=Je(l.period,l.date??ne(o.now())),c=o.newId(),u=O(o.now()),E=t.get("SELECT MAX(sort_order) AS m FROM goals WHERE period = ? AND period_start = ?",[l.period,i]);return t.run(`INSERT INTO goals (id, title, notes, period, period_start, target, progress, color, sort_order, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,[c,n,l.notes??"",l.period,i,Ze(l.target),l.color??null,(E?.m==null?0:g(E.m))+1,l.spaceId??null,u,u]),d(c)},update(l,n){const i=d(l),c=n.title===void 0?i.title:n.title.trim();if(!c)throw new p("Wpisz, jaki to cel");const u=n.target===void 0?i.target:Ze(n.target);let E=n.progress===void 0?i.progress:Math.round(Number(n.progress));(!Number.isFinite(E)||E<0)&&(E=0),u!=null&&(E=Math.min(E,u));const m=n.done===void 0?i.doneAt:n.done?i.doneAt??O(o.now()):null;return t.run("UPDATE goals SET title = ?, notes = ?, target = ?, progress = ?, done_at = ?, color = ?, space_id = ?, updated_at = ? WHERE id = ?",[c,n.notes??i.notes,u,E,m,n.color===void 0?i.color:n.color,n.spaceId===void 0?i.spaceId:n.spaceId,O(o.now()),l]),d(l)},step(l,n){const i=d(l);return this.update(l,{progress:i.progress+Math.sign(n)})},remove(l){d(l),t.run("DELETE FROM goals WHERE id = ?",[l])}}}const Se="vault-meta",un=2e4;function Qe(e){if(typeof e!="string"||e.length>un)throw new p("Sejf: nieprawidłowe dane");let t;try{t=JSON.parse(e)}catch{throw new p("Sejf: nieprawidłowe dane")}const o=r=>!!r&&typeof r.iv=="string"&&typeof r.ct=="string";if(!(o(t)||typeof t.salt=="string"&&o(t.check)))throw new p("Sejf: dane muszą być zaszyfrowane");return e}function mn(e){const{db:t,env:o}=e;return{meta(){return t.get("SELECT * FROM vault WHERE id = ? AND kind = 'meta'",[Se])?.payload??null},createMeta(r){if(t.get("SELECT 1 FROM vault WHERE id = ?",[Se]))throw new p("Sejf już istnieje");const d=O(o.now());t.run("INSERT INTO vault (id, kind, payload, space_id, created_at, updated_at) VALUES (?, 'meta', ?, NULL, ?, ?)",[Se,Qe(r),d,d])},list(){return t.all("SELECT * FROM vault WHERE kind = 'entry' ORDER BY created_at").map(r=>({id:r.id,payload:r.payload,updatedAt:r.updated_at}))},save(r,d){Qe(d);const l=O(o.now());if(r&&t.get("SELECT 1 FROM vault WHERE id = ? AND kind = 'entry'",[r]))return t.run("UPDATE vault SET payload = ?, updated_at = ? WHERE id = ?",[d,l,r]),r;const n=o.newId();return t.run("INSERT INTO vault (id, kind, payload, space_id, created_at, updated_at) VALUES (?, 'entry', ?, NULL, ?, ?)",[n,d,l,l]),n},remove(r){t.run("DELETE FROM vault WHERE id = ? AND kind = 'entry'",[r])}}}const q=e=>e.replace(/\s+/g," ").trim().slice(0,120);function Tn(e){const{db:t,env:o}=e,r=()=>O(o.now()),d=c=>{const u=t.get("SELECT * FROM shop_lists WHERE id = ?",[c]);if(!u)throw new M("Lista zakupów",c);return u},l=c=>{const u=t.get("SELECT * FROM shop_items WHERE id = ?",[c]);if(!u)throw new M("Produkt",c);return u},n=c=>g(t.get("SELECT MAX(sort_order) AS m FROM shop_items WHERE list_id = ?",[c])?.m??0)+1,i=c=>({id:c.id,listId:c.list_id,text:c.text,done:!!g(c.done),times:g(c.times)});return{lists(){return t.all(`SELECT l.*, (SELECT COUNT(*) FROM shop_items i WHERE i.list_id = l.id AND i.hidden = 0 AND i.done = 0) AS to_buy,
                (SELECT COUNT(*) FROM shop_items i WHERE i.list_id = l.id AND i.hidden = 0 AND i.done = 1) AS bought
         FROM shop_lists l ORDER BY l.sort_order, l.created_at`).map(c=>({id:c.id,name:c.name,spaceId:c.space_id??null,toBuy:g(c.to_buy),bought:g(c.bought)}))},createList(c,u=null){const E=q(c??"");if(!E)throw new p("Wpisz nazwę listy");const m=o.newId(),_=r(),f=g(t.get("SELECT MAX(sort_order) AS m FROM shop_lists")?.m??0)+1;return t.run("INSERT INTO shop_lists (id, name, sort_order, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",[m,E,f,u,_,_]),{id:m,name:E,spaceId:u,toBuy:0,bought:0}},renameList(c,u){d(c);const E=q(u??"");if(!E)throw new p("Wpisz nazwę listy");t.run("UPDATE shop_lists SET name = ?, updated_at = ? WHERE id = ?",[E,r(),c])},setListSpace(c,u){d(c),e.tx(()=>{const E=r();t.run("UPDATE shop_lists SET space_id = ?, updated_at = ? WHERE id = ?",[u,E,c]),t.run("UPDATE shop_items SET space_id = ?, updated_at = ? WHERE list_id = ?",[u,E,c])})},removeList(c){e.tx(()=>{t.run("DELETE FROM shop_items WHERE list_id = ?",[c]),t.run("DELETE FROM shop_lists WHERE id = ?",[c])})},items(c){return t.all("SELECT * FROM shop_items WHERE list_id = ? AND hidden = 0 ORDER BY done, CASE WHEN done = 1 THEN done_at END DESC, sort_order",[c]).map(i)},add(c,u){const E=d(c),m=[...new Set(String(u??"").split(/\n|;/).map(q).filter(Boolean))];if(!m.length)throw new p("Wpisz produkt");return e.tx(()=>m.map(_=>{const f=r(),L=t.get("SELECT * FROM shop_items WHERE list_id = ? AND text = ? COLLATE NOCASE ORDER BY hidden, done LIMIT 1",[c,_]);if(L&&!g(L.hidden)&&!g(L.done))return i(L);if(L)return t.run("UPDATE shop_items SET done = 0, done_at = NULL, hidden = 0, times = times + 1, sort_order = ?, updated_at = ? WHERE id = ?",[n(c),f,L.id]),i(l(L.id));const y=o.newId();return t.run(`INSERT INTO shop_items (id, list_id, text, done, hidden, times, sort_order, space_id, created_at, updated_at)
                VALUES (?, ?, ?, 0, 0, 1, ?, ?, ?, ?)`,[y,c,_,n(c),E.space_id,f,f]),i(l(y))}))},setDone(c,u){l(c);const E=r();t.run("UPDATE shop_items SET done = ?, done_at = ?, updated_at = ? WHERE id = ?",[u?1:0,u?E:null,E,c])},rename(c,u){l(c);const E=q(u??"");if(!E)throw new p("Wpisz produkt");t.run("UPDATE shop_items SET text = ?, updated_at = ? WHERE id = ?",[E,r(),c])},remove(c){t.run("DELETE FROM shop_items WHERE id = ?",[c])},clearBought(c){return t.run("UPDATE shop_items SET hidden = 1, updated_at = ? WHERE list_id = ? AND hidden = 0 AND done = 1",[r(),c]).changes},suggestions(c,u="",E=12){const m=q(u).toLocaleLowerCase("pl"),_=new Set(t.all("SELECT lower(text) AS t FROM shop_items WHERE list_id = ? AND hidden = 0 AND done = 0",[c]).map(y=>y.t)),f=m?t.all("SELECT text, SUM(times) AS times FROM shop_items GROUP BY lower(text) ORDER BY times DESC, MAX(updated_at) DESC LIMIT 300"):t.all("SELECT text, times FROM shop_items WHERE list_id = ? AND (hidden = 1 OR done = 1) AND times >= 2 ORDER BY times DESC, updated_at DESC LIMIT 100",[c]),L=[];for(const y of f){const a=y.text.toLocaleLowerCase("pl");if(!_.has(a)&&!(m&&(!a.includes(m)||a===m))&&(L.push({text:y.text,times:g(y.times)}),L.length>=E))break}return L}}}const qe=["new","in_progress","ready","shipped","cancelled"],Me=e=>e==="study"||e==="work"?e:"orders";function _n(e){if(!e)return null;try{const t=JSON.parse(e);return typeof t?.uw=="number"?{uw:t.uw,years:t.years??void 0,...t.schedule?{schedule:t.schedule}:{}}:null}catch{return null}}function fn(e){if(e==null)return null;const t=d=>Number.isInteger(d)&&d>=0&&d<=60;if(!t(e.uw))throw new p("Urlop wypoczynkowy: 0–60 dni");const o={};for(const[d,l]of Object.entries(e.years??{})){if(!/^\d{4}$/.test(d)||!t(l))throw new p("Urlop wypoczynkowy: 0–60 dni");o[d]=l}let r=null;try{r=wt(e.schedule)}catch(d){throw new p(d.message)}return JSON.stringify({uw:e.uw,...Object.keys(o).length?{years:o}:{},...r?{schedule:r}:{}})}const et=e=>({id:e.id,name:e.name,kind:Me(e.kind),leave:_n(e.leave??null),icon:e.icon,itemLabel:e.item_label||"Zlecenie",color:e.color,color2:e.color2??null,logo:e.logo??null,sortOrder:g(e.sort_order),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}),we=e=>({id:e.id,calendarId:e.calendar_id,title:e.title,client:e.client,notes:e.notes,startDate:e.start_date,dueDate:e.due_date,shipDate:e.ship_date,status:e.status,tag:e.tag??null,amountMinor:e.amount_minor==null?null:g(e.amount_minor),costMinor:e.cost_minor==null?null:g(e.cost_minor),remindDays:e.remind_days==null?null:g(e.remind_days),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at});function tt(e,t,o){for(const[r,d]of[["Od kiedy",e],["Termin",t]])if(!fe(d))throw new p(`${r}: wybierz dzień`);if(t<e)throw new p("Termin nie może być przed początkiem");if(o!=null){if(!fe(o))throw new p("Wysyłka: wybierz dzień");if(o<e)throw new p("Wysyłka nie może być przed początkiem")}}function nt(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<0||t>60)throw new p("Przypomnienie: 0–60 dni przed");return t}function Ee(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<0)throw new p("Kwota musi być nieujemna");return t}function it(e){const t=(e??"").trim();return t?[...t].slice(0,2).join(""):null}const Nn=/^#[0-9a-fA-F]{6}$/,ot=e=>(e??"").trim().slice(0,30)||null,rt=/^([01]\d|2[0-3]):[0-5]\d$/,ue=e=>({id:e.id,calendarId:e.calendar_id,subject:e.subject,form:e.form,weekday:g(e.weekday),startTime:e.start_time,endTime:e.end_time,room:e.room,teacher:e.teacher,every:e.every,color:e.color,spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at});function st(e){if(!e.subject.trim())throw new p("Wpisz nazwę przedmiotu");if(!Number.isInteger(e.weekday)||e.weekday<0||e.weekday>6)throw new p("Wybierz dzień tygodnia");if(!rt.test(e.startTime)||!rt.test(e.endTime))throw new p("Godziny w formacie GG:MM");if(e.endTime<=e.startTime)throw new p("Koniec zajęć musi być po początku");if(e.every&&!["week","odd","even"].includes(e.every))throw new p("Co tydzień, nieparzyste albo parzyste")}function pn(e){const{db:t,env:o}=e,r=n=>{const i=t.get("SELECT * FROM calendars WHERE id = ?",[n]);if(!i)throw new M("Calendar",n);return et(i)},d=n=>{const i=t.get("SELECT * FROM orders WHERE id = ?",[n]);if(!i)throw new M("Order",n);return we(i)},l={calendars:{list(){return t.all("SELECT * FROM calendars ORDER BY sort_order, created_at").map(et)},create(n){const i=(n.name??"").trim();if(!i)throw new p("Nazwij kalendarz, np. Zlecenia");const c=o.newId(),u=O(o.now()),E=t.get("SELECT MAX(sort_order) AS m FROM calendars");return t.run("INSERT INTO calendars (id, name, kind, icon, item_label, color, sort_order, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",[c,i.slice(0,40),Me(n.kind),it(n.icon),(n.itemLabel??"").trim().slice(0,30)||"Zlecenie",n.color??null,(E?.m==null?0:g(E.m))+1,n.spaceId??null,u,u]),r(c)},update(n,i){const c=r(n),u=i.name===void 0?c.name:i.name.trim().slice(0,40);if(!u)throw new p("Nazwij kalendarz");const E=i.spaceId===void 0?c.spaceId:i.spaceId;for(const _ of[i.color,i.color2])if(_!=null&&!Nn.test(_))throw new p("Kolor: #RRGGBB");if(i.logo!=null&&(!/^data:image\/(png|jpeg|webp);base64,/.test(i.logo)||i.logo.length>9e4))throw new p("Logo: mały obrazek PNG/JPEG");const m=O(o.now());return e.tx(()=>{t.run("UPDATE calendars SET name = ?, kind = ?, icon = ?, item_label = ?, color = ?, space_id = ?, updated_at = ? WHERE id = ?",[u,i.kind===void 0?c.kind:Me(i.kind),i.icon===void 0?c.icon:it(i.icon),i.itemLabel===void 0?c.itemLabel:i.itemLabel.trim().slice(0,30)||"Zlecenie",i.color===void 0?c.color:i.color,E,m,n]),(i.color2!==void 0||i.logo!==void 0)&&t.run("UPDATE calendars SET color2 = ?, logo = ?, updated_at = ? WHERE id = ?",[i.color2===void 0?c.color2:i.color2,i.logo===void 0?c.logo:i.logo,m,n]),i.leave!==void 0&&t.run("UPDATE calendars SET leave = ?, updated_at = ? WHERE id = ?",[fn(i.leave),m,n]),E!==c.spaceId&&(t.run("UPDATE orders SET space_id = ?, updated_at = ? WHERE calendar_id = ?",[E,m,n]),t.run("UPDATE class_slots SET space_id = ?, updated_at = ? WHERE calendar_id = ?",[E,m,n]))}),r(n)},reorder(n){const i=t.all("SELECT id, sort_order FROM calendars ORDER BY sort_order, created_at"),c=[...n.filter(E=>i.some(m=>m.id===E)),...i.map(E=>E.id).filter(E=>!n.includes(E))],u=O(o.now());return e.tx(()=>c.forEach((E,m)=>{g(i.find(_=>_.id===E).sort_order)!==m+1&&t.run("UPDATE calendars SET sort_order = ?, updated_at = ? WHERE id = ?",[m+1,u,E])})),l.calendars.list()},remove(n){r(n),e.tx(()=>{t.run("DELETE FROM orders WHERE calendar_id = ?",[n]),t.run("DELETE FROM class_slots WHERE calendar_id = ?",[n]),t.run("DELETE FROM calendars WHERE id = ?",[n])})}},classes:{list(n){return t.all("SELECT * FROM class_slots WHERE calendar_id = ? ORDER BY weekday, start_time",[n]).map(ue)},create(n){const i=r(n.calendarId);st(n);const c=o.newId(),u=O(o.now());return t.run(`INSERT INTO class_slots (id, calendar_id, subject, form, weekday, start_time, end_time, room, teacher, every, color, space_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[c,i.id,n.subject.trim(),(n.form??"").trim(),n.weekday,n.startTime,n.endTime,(n.room??"").trim(),(n.teacher??"").trim(),n.every??"week",n.color??null,i.spaceId,u,u]),ue(t.get("SELECT * FROM class_slots WHERE id = ?",[c]))},update(n,i){const c=t.get("SELECT * FROM class_slots WHERE id = ?",[n]);if(!c)throw new M("Class",n);const E={...ue(c),...Object.fromEntries(Object.entries(i).filter(([,m])=>m!==void 0))};return st(E),t.run("UPDATE class_slots SET subject = ?, form = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, teacher = ?, every = ?, color = ?, updated_at = ? WHERE id = ?",[E.subject.trim(),E.form.trim(),E.weekday,E.startTime,E.endTime,E.room.trim(),E.teacher.trim(),E.every,E.color,O(o.now()),n]),ue(t.get("SELECT * FROM class_slots WHERE id = ?",[n]))},remove(n){t.run("DELETE FROM class_slots WHERE id = ?",[n])}},get:d,list(n,i){return(i?t.all(`SELECT * FROM orders WHERE calendar_id = ? AND start_date < ? AND MAX(due_date, COALESCE(ship_date, due_date)) >= ?
           ORDER BY start_date, due_date`,[n,i.to,i.from]):t.all("SELECT * FROM orders WHERE calendar_id = ? ORDER BY due_date, start_date",[n])).map(we)},create(n){const i=r(n.calendarId),c=(n.title??"").trim();if(!c)throw new p("Wpisz, co to za zamówienie");const u=n.shipDate||null;tt(n.startDate,n.dueDate,u);const E=n.status??"new";if(!qe.includes(E))throw new p("Nieznany status");const m=o.newId(),_=O(o.now());return t.run(`INSERT INTO orders (id, calendar_id, title, client, notes, start_date, due_date, ship_date, status, amount_minor, cost_minor, remind_days, tag, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[m,i.id,c,(n.client??"").trim(),n.notes??"",n.startDate,n.dueDate,u,E,Ee(n.amountMinor),Ee(n.costMinor),nt(n.remindDays),ot(n.tag),i.spaceId,_,_]),d(m)},update(n,i){const c=d(n),u=i.title===void 0?c.title:i.title.trim();if(!u)throw new p("Wpisz, co to za zamówienie");const E=i.startDate??c.startDate,m=i.dueDate??c.dueDate,_=i.shipDate===void 0?c.shipDate:i.shipDate||null;tt(E,m,_);const f=i.status??c.status;if(!qe.includes(f))throw new p("Nieznany status");return t.run(`UPDATE orders SET title = ?, client = ?, notes = ?, start_date = ?, due_date = ?, ship_date = ?, status = ?, amount_minor = ?, cost_minor = ?,
           remind_days = ?, tag = ?, updated_at = ? WHERE id = ?`,[u,i.client===void 0?c.client:i.client.trim(),i.notes??c.notes,E,m,_,f,i.amountMinor===void 0?c.amountMinor:Ee(i.amountMinor),i.costMinor===void 0?c.costMinor:Ee(i.costMinor),i.remindDays===void 0?c.remindDays:nt(i.remindDays),i.tag===void 0?c.tag:ot(i.tag),O(o.now()),n]),d(n)},setStatus(n,i){return l.update(n,{status:i})},remove(n){d(n),t.run("DELETE FROM orders WHERE id = ?",[n])},withReminders(){return t.all("SELECT * FROM orders WHERE remind_days IS NOT NULL AND status NOT IN ('shipped', 'cancelled')").map(we)}};return l}const Te=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:g(e.size),width:e.width==null?null:g(e.width),height:e.height==null?null:g(e.height),createdAt:e.created_at}),he=e=>({...Te(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),De=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,Ln=/^[0-9a-f]{64}$/;function Rn(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function yn(e,t){const{db:o,env:r}=e;function d(n){const i=n.sha256?.toLowerCase();if(!i||!Ln.test(i))throw new p("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(n.size)||n.size<0)throw new p("Nieprawidłowy rozmiar pliku");const c=o.get("SELECT * FROM files WHERE sha256 = ?",[i]);if(c)return Te(c);const u=r.newId();return o.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[u,i,n.name.trim()||"plik",n.mime||"application/octet-stream",n.size,n.width??null,n.height??null,O(r.now())]),Te(o.get("SELECT * FROM files WHERE id = ?",[u]))}function l(n,i,c="attachment"){if(t.items.get(n),!o.get("SELECT 1 FROM files WHERE id = ?",[i]))throw new M("File",i);const u=o.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[n]),E=O(r.now());o.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[n,i,c,(u?.m==null?0:g(u.m))+1,E]),o.run("UPDATE items SET updated_at = ? WHERE id = ?",[E,n])}return{register:d,addToItem(n,i){return e.tx(()=>{const c=d(i);return l(n,c.id),he(o.get(`${De} WHERE x.item_id = ? AND x.file_id = ?`,[n,c.id]))})},addToFolder(n,i,c){return e.tx(()=>{n&&t.folders.get(n);const u=d(i),E=t.items.create({type:"note",title:c?.trim()||Rn(u.name),folderId:n});return l(E.id,u.id),t.items.get(E.id)})},detach(n,i){t.items.get(n),o.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[n,i]),o.run("UPDATE items SET updated_at = ? WHERE id = ?",[O(r.now()),n])},rename(n,i){if(!i.trim())throw new p("Nazwa pliku nie może być pusta");o.run("UPDATE files SET name = ? WHERE id = ?",[i.trim(),n]);const c=o.get("SELECT * FROM files WHERE id = ?",[n]);if(!c)throw new M("File",n);return Te(c)},forItem(n){return o.all(`${De} WHERE x.item_id = ? ORDER BY x.sort_order`,[n]).map(he)},forFolder(n,i={}){const c=["i.deleted_at IS NULL"],u=[];if(n===null)c.push("i.folder_id IS NULL");else if(i.includeSubfolders){const m=t.folders.descendantIds(n);c.push(`i.folder_id IN (${m.map(()=>"?").join(",")})`),u.push(...m)}else c.push("i.folder_id = ?"),u.push(n);i.imagesOnly&&c.push("f.mime LIKE 'image/%'");const E=i.limit&&i.limit>0?` LIMIT ${Math.floor(i.limit)}`:"";return o.all(`${De} WHERE ${c.join(" AND ")} ORDER BY x.created_at DESC, f.name${E}`,u).map(he)}}}function An(e){const{db:t,env:o}=e,r="i.deleted_at IS NULL AND i.recurrence IS NULL AND (i.status IS NULL OR i.status <> 'done')",d="i.deleted_at IS NULL AND i.recurrence IS NULL",l="(i.status IS NULL OR i.status <> 'done')";function n(c,u,E="i.due_at, i.priority DESC",m=50){return t.all(`${K} WHERE ${c} ORDER BY ${E} LIMIT ${m}`,u).map(J)}function i(c,u){const E=t.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${c}`,u);return Number(E?.c??0)}return{summary(){const c=o.now(),u=ne(c),E=U(u,1),m=U(u,8),_=ht(c),f=`${r} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,L=[u,_],y=`${r} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,a=[u,E,_],s=`${d} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ? AND ${l})`,T=U(E,1),N=`${d} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?`,R=[E,T],w=`${d} AND i.type = 'event' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.all_day = 0 AND i.start_at IS NULL AND i.due_at < ?)`,h=[u,m,_],D=`${u.slice(0,7)}-01`,[k,H]=u.split("-").map(Number),F=H===12?`${k+1}-01-01`:`${k}-${String(H+1).padStart(2,"0")}-01`,C=`${d} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,$=[D,F],ie=`${r} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,oe=[u,U(u,7)],re=t.all(`${K} WHERE i.deleted_at IS NULL AND i.recurrence IS NOT NULL
        AND i.due_at IS NOT NULL AND i.type IN ('task', 'event')`,[]).map(J),x=(S,se)=>re.length?Re(t,re,S,se):[],W=S=>S.status!=="done",A=S=>S.type==="task"&&W(S)&&!!S.dueAt&&(S.allDay||S.dueAt.length===10?S.dueAt<u:S.dueAt<_),I=x(u,E).filter(S=>S.type==="task"&&!(S.dueAt.length>10&&S.dueAt<_&&W(S))),v=x(E,T).filter(S=>S.type==="task"),Xe=x(u,m).filter(S=>S.type==="event"&&!(S.dueAt.length>10&&!S.startAt&&S.dueAt<_)),$e=x(D,F).filter(S=>S.isPayment),xe=x(U(u,-60),E).filter(A),yt=x(u,U(u,7)).filter(S=>S.isPayment&&W(S)&&S.dueAt>=u),Z=(S,se)=>se.length?[...S,...se].sort((Ae,ge)=>(Ae.dueAt??"")<(ge.dueAt??"")?-1:(Ae.dueAt??"")>(ge.dueAt??"")?1:ge.priority-Ae.priority):S;return{overdue:Z(n(f,L),xe),today:Z(n(s,a),I),tomorrow:Z(n(N,R),v),upcoming:Z(n(w,h),Xe),paymentsMonth:Z(n(C,$,"i.due_at",200),$e),recentNotes:n("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:n("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:n("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:i(f,L)+xe.length,today:i(y,a)+I.filter(W).length,tomorrow:v.filter(W).length+i(`${r} AND ${N.replace(`${d} AND `,"")}`,R),upcoming:i(w,h)+Xe.length,paymentsMonth:i(`${C} AND ${l}`,$)+$e.filter(W).length,paymentsThisWeek:i(ie,oe)+yt.length,notes:i("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:i("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const He="",We="";function gn(e){const t=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(o=>o.trim()).filter(Boolean).slice(0,12);return t.length?t.map(o=>`"${o.replace(/"/g,"")}"*`).join(" "):null}const On=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function Sn(e,t){const o=/[\u0001\u0002]/g,r=e.replace(/^…/,"").replace(/…$/,""),d=r.replace(o,"");if(!d)return e;for(const l of t){const n=On(l).indexOf(d);if(n<0)continue;const i=l.slice(n,n+d.length);let c="",u=0;for(const E of r)E===He||E===We?c+=E:c+=i[u++];return e.replace(r,c)}return e}const _t=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],B=e=>_t.reduce((t,[o,r])=>`replace(${t}, '${o}', '${r}')`,`coalesce(${e}, '')`),ke=e=>_t.reduce((t,[o,r])=>t.split(o).join(r),e).toLowerCase();function wn(e,t){const o=ke(e);let r=-1,d=0;for(const i of t){const c=o.indexOf(i);c>=0&&(r<0||c<r)&&(r=c,d=i.length)}if(r<0)return e.slice(0,90);const l=Math.max(0,r-40),n=Math.min(e.length,r+d+60);return`${l>0?"…":""}${e.slice(l,r)}${He}${e.slice(r,r+d)}${We}${e.slice(r+d,n)}${n<e.length?"…":""}`}function hn(e,t){const{db:o}=e;function r(d,l){const n=ke(d).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!n.length)return[];const i=`(${B("i.title")} || ' ' || ${B("i.body_text")} || ' ' ||
      ${B("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${B("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return o.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${n.map(()=>`instr(lower(${i}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${B("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...n,n[0],l]).map(u=>({...u,snip:wn(u.body_text||u.title,n)}))}return{fullText:()=>t.fullText,search(d,l=30){const n=gn(d);if(!n)return[];const i=t.fullText?o.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${He}', '${We}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[n,l]):r(d,l),c=ke(d.trim());return[...o.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${B("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[c]).map(E=>({kind:"folder",id:E.id,title:E.name,snippet:"",folderId:E.parent_id})),...i.map(E=>({kind:"item",id:E.id,title:E.title,snippet:Sn(E.snip??"",[E.body_text,E.title]),itemType:E.type,folderId:E.folder_id}))]}}}function Dn(e){const{db:t}=e;return{list(){const o=t.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),r=t.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...o.map(d=>({kind:"item",id:d.id,title:d.title,deletedAt:d.deleted_at,itemType:d.type})),...r.map(d=>({kind:"folder",id:d.id,title:d.name,deletedAt:d.deleted_at}))].sort((d,l)=>l.deletedAt.localeCompare(d.deletedAt))}}}const In={now:()=>new Date,newId:()=>crypto.randomUUID()};function Cn(e,t={}){Ut(e),jt(e);const o=Jt(e,t.fullText!==!1),r={db:e,tx:Ct(e),env:t.env??In},d=en(r),l=Dt(r),n=tn(r),i=nn(r,{tags:n,folders:l}),c=on(r),u=cn(r),E=En(r),m=mn(r),_=Tn(r),f=pn(r),L=yn(r,{items:i,folders:l}),y=An(r),a=hn(r,{fullText:o}),s=Dn(r);t.seed!==!1&&(d.seedDefaults(),t.seedFolders!==!1&&l.seedDefaults());const T={categories:{list:d.list,create:d.create,update:d.update,remove:d.remove},folders:{tree:l.tree,list:l.list,get:l.get,path:l.path,create:l.create,update:l.update,move:l.move,trash:l.trash,restore:l.restore,purge:l.purge,setSpace:l.setSpace},tags:{list:n.list,update:n.update,remove:n.remove},items:{get:i.get,create:i.create,update:i.update,setTags:i.setTags,setStatus:i.setStatus,paymentCheck:i.paymentCheck,toggleFavorite:i.toggleFavorite,markOpened:i.markOpened,move:i.move,trash:i.trash,restore:i.restore,purge:i.purge,query:i.query,setSpace:i.setSpace,occurrences:i.occurrences},calendars:{list:f.calendars.list,create:f.calendars.create,update:f.calendars.update,remove:f.calendars.remove,reorder:f.calendars.reorder},classes:{list:f.classes.list,create:f.classes.create,update:f.classes.update,remove:f.classes.remove},orders:{list:f.list,get:f.get,create:f.create,update:f.update,setStatus:f.setStatus,remove:f.remove},shopping:{lists:_.lists,createList:_.createList,renameList:_.renameList,setListSpace:_.setListSpace,removeList:_.removeList,items:_.items,add:_.add,setDone:_.setDone,rename:_.rename,remove:_.remove,clearBought:_.clearBought,suggestions:_.suggestions},vault:{meta:m.meta,createMeta:m.createMeta,list:m.list,save:m.save,remove:m.remove},goals:{list:E.list,get:E.get,create:E.create,update:E.update,step:(N,R)=>E.step(N,R),remove:E.remove},reminders:{forItem:u.forItem,set:u.set,due:u.due},files:{register:L.register,addToItem:L.addToItem,addToFolder:L.addToFolder,detach:L.detach,rename:L.rename,forItem:L.forItem,forFolder:L.forFolder},trash:{list:s.list,purge(N){return r.tx(()=>{let R=0;for(const w of N)try{w.kind==="item"?i.purge(w.id):l.purge(w.id),R++}catch{}return R})},empty(){return T.trash.purge(s.list().map(N=>({kind:N.kind,id:N.id})))}},dashboard:{summary:y.summary},search:{query:a.search,fullText:a.fullText},settings:{all:c.all,get:c.get,set:c.set}};return{api:T,close:()=>e.close()}}const Un=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","folders.setSpace","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","items.setSpace","reminders.set","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set","trash.purge","trash.empty","goals.create","goals.update","goals.step","goals.remove","vault.createMeta","vault.save","vault.remove","shopping.createList","shopping.renameList","shopping.setListSpace","shopping.removeList","shopping.add","shopping.setDone","shopping.rename","shopping.remove","shopping.clearBought","calendars.create","calendars.update","calendars.remove","calendars.reorder","orders.create","orders.update","orders.setStatus","orders.remove","classes.create","classes.update","classes.remove"]);function vn(e,t){if(typeof t!="string")return null;const[o,r,...d]=t.split(".");if(!o||!r||d.length||!Object.prototype.hasOwnProperty.call(e,o))return null;const l=e[o];if(!Object.prototype.hasOwnProperty.call(l,r))return null;const n=l[r];return typeof n=="function"?n:null}function Mn(e,t,o){const r=vn(e,t);if(!r)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(t)}`}},mutated:!1};try{return{result:{ok:!0,value:r(...Array.isArray(o)?o:[])},mutated:Un.has(t)}}catch(d){const l=d;return l.name!=="ValidationError"&&l.name!=="NotFoundError"&&console.error(`[core] ${String(t)} failed`,l),{result:{ok:!1,error:{name:l.name||"Error",message:l.message||String(d)}},mutated:!1}}}function kn(e,t){const o=new e.Database(t??null),r=l=>l.map(n=>typeof n=="bigint"?Number(n):n);function d(l,n,i){const c=o.prepare(l);try{n.length&&c.bind(r(n));const u=[];for(;c.step()&&(u.push(c.getAsObject()),!!i););return u}finally{c.free()}}return{exec:l=>{o.exec(l)},run:(l,n=[])=>(o.run(l,r(n)),{changes:o.getRowsModified()}),get:(l,n=[])=>d(l,n,!1)[0],all:(l,n=[])=>d(l,n,!0),close:()=>o.close(),exportBytes:()=>{const l=o.export();return o.exec("PRAGMA foreign_keys = ON;"),l}}}const Fn="notatnik",ye="files",j="blobs";function ft(){return new Promise((e,t)=>{const o=indexedDB.open(Fn,2);o.onupgradeneeded=()=>{const r=o.result.objectStoreNames;r.contains(ye)||o.result.createObjectStore(ye),r.contains(j)||o.result.createObjectStore(j)},o.onsuccess=()=>e(o.result),o.onerror=()=>t(o.error)})}async function _e(e,t=ye){const o=await ft();try{return await new Promise((r,d)=>{const l=o.transaction(t,"readonly").objectStore(t).get(e);l.onsuccess=()=>r(l.result?new Uint8Array(l.result):null),l.onerror=()=>d(l.error)})}finally{o.close()}}async function Nt(e,t,o=ye){const r=await ft();try{await new Promise((d,l)=>{const n=r.transaction(o,"readwrite");n.objectStore(o).put(t.slice().buffer,e),n.oncomplete=()=>d(),n.onerror=()=>l(n.error),n.onabort=()=>l(n.error)})}finally{r.close()}}async function bn(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function Hn(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const t=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(t)].map(o=>o.toString(16).padStart(2,"0")).join("")}function Wn(e){const t=new Map,o=new Map;return{async put(r,d){const l=await Hn(r);return e()?await _e(l,j).catch(()=>null)||await Nt(l,r,j):t.set(l,r),{sha256:l,size:r.byteLength}},async read(r){return t.get(r)??(e()?await _e(r,j).catch(()=>null):null)},async url(r,d){const l=o.get(r);if(l)return l;const n=t.get(r)??(e()?await _e(r,j).catch(()=>null):null);if(!n)return null;const i=URL.createObjectURL(new Blob([n.slice().buffer],{type:d||"application/octet-stream"}));return o.set(r,i),i}}}const Fe=e=>e.sharedId?[e.privateId,e.sharedId]:[e.privateId],Xn=e=>typeof e=="bigint"?Number(e):e;function pt(e,t){const o=t.split(pe);return[e.key.map(r=>`${r} = ?`).join(" AND "),e.key.map((r,d)=>o[d]??"")]}function Lt(e,t,o){const[r,d]=pt(t,o),l=e.get(`SELECT * FROM ${t.name} WHERE ${r}`,d);if(!l)return;const n={};for(const[i,c]of Object.entries(l))n[i]=Xn(c);return n}function Rt(e,t,o){return e.get("SELECT space_id FROM items WHERE id = ?",[String(t)])?.space_id??o.privateId}function $n(e,t,o,r){switch(t.scope){case"own":return[o.space_id??r.privateId];case"item":return[Rt(e,o[t.itemCol],r)];case"all":return Fe(r);case"file":{const d=e.all("SELECT DISTINCT i.space_id AS s FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ?",[String(o.id)]).map(i=>i.s??r.privateId),l=new Set(Fe(r)),n=[...new Set(d)].filter(i=>l.has(i));return n.length?n:[r.privateId]}}}function xn(e){return Number(e.get("SELECT COUNT(*) AS n FROM sync_outbox")?.n??0)}function Pn(e,t,o=300){const r=e.all("SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at LIMIT ?",[o]),d=[];for(const l of r){const n=X.get(l.tbl);if(!n)continue;const i=Lt(e,n,l.id);if(!i){d.push({space_id:null,tbl:n.name,id:l.id,data:null,deleted:!0,stamp:l.changed_at,exclusive:!1});continue}const c=n.scope==="own"||n.scope==="item",u=new Set(Fe(t));for(const E of $n(e,n,i,t).filter(m=>u.has(m)))d.push({space_id:E,tbl:n.name,id:l.id,data:i,deleted:!1,stamp:l.changed_at,exclusive:c}),n.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(i.sha256),E,"up",String(i.mime)])}return{entries:d,taken:r}}function zn(e,t){e.exec("BEGIN");try{for(const o of t)e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?",[o.tbl,o.id,o.changed_at]);e.exec("COMMIT")}catch(o){throw e.exec("ROLLBACK"),o}}const at=new WeakMap;function Bn(e,t){let o=at.get(e);o||at.set(e,o=new Map);let r=o.get(t);return r||(r=new Set(e.all(`PRAGMA table_info(${t})`).map(d=>d.name)),o.set(t,r)),r}function me(e,t,o){return e.get("SELECT local_id FROM sync_idmap WHERE tbl = ? AND remote_id = ?",[t,o])?.local_id??o}function Gn(e,t,o,r){return t.scope==="own"?o.space_id??r.privateId:t.scope==="item"?Rt(e,o[t.itemCol],r):null}function jn(e,t,o){if(!t.length)return 0;let r=0;e.exec("PRAGMA foreign_keys = OFF"),e.exec("BEGIN");try{e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");for(const d of t){e.exec("SAVEPOINT rec");try{r+=Yn(e,d,o),e.exec("RELEASE rec")}catch(l){e.exec("ROLLBACK TO rec; RELEASE rec")}}e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'"),e.exec("COMMIT")}catch(d){throw e.exec("ROLLBACK"),d}finally{e.exec("PRAGMA foreign_keys = ON")}return r}function Yn(e,t,o){let r=0;const d=X.get(t.tbl);if(!d)return 0;const l=t.id.split(pe),n=d.key.map((s,T)=>{const N=l[T]??"";return d.refs?.[s]?me(e,d.refs[s],N):d.mergeBy?me(e,d.name,N):N}),i=n.join(pe),c=e.get("SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,i]);if(c&&c.changed_at>t.stamp)return r;const u=Lt(e,d,i);if(t.deleted||!t.data){if(!u)return r;const s=Gn(e,d,u,o);if(s!==null&&s!==t.space_id)return r;const[T,N]=pt(d,i);return r+=e.run(`DELETE FROM ${d.name} WHERE ${T}`,N).changes,c&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,i]),r}const E={...t.data},m=t.space_id===o.privateId?null:t.space_id,_=d.name!=="folders"||E.parent_id==null&&E.deleted_at==null;if(d.mergeBy&&!u&&_){const s=d.mergeBy,T=e.get(`SELECT id FROM ${d.name} WHERE ${s.col} = ?${s.nocase?" COLLATE NOCASE":""}${s.where?` AND ${s.where}`:""}${s.sameSpace?" AND space_id IS ?":""} AND id <> ? LIMIT 1`,s.sameSpace?[String(E[s.col]),m,String(E.id)]:[String(E[s.col]),String(E.id)]);if(T)return e.run("INSERT OR REPLACE INTO sync_idmap (tbl, remote_id, local_id) VALUES (?, ?, ?)",[d.name,String(E.id),T.id]),r}for(const[s,T]of Object.entries(d.refs??{}))typeof E[s]=="string"&&(E[s]=me(e,T,E[s]));if(d.name==="folders"&&E.item_defaults)try{const s=typeof E.item_defaults=="string"?JSON.parse(E.item_defaults):E.item_defaults;s&&typeof s.categoryId=="string"&&(E.item_defaults=JSON.stringify({...s,categoryId:me(e,"categories",s.categoryId)}))}catch{}if(d.key.forEach((s,T)=>{E[s]=n[T]}),d.scope==="own"&&(E.space_id=m),u&&typeof u.updated_at=="string"&&typeof E.updated_at=="string"&&u.updated_at>E.updated_at)return r;const f=Object.keys(E).filter(s=>Bn(e,d.name).has(s)&&!(d.localOnly??[]).includes(s)),L=f.map(s=>{const T=E[s];return T===void 0?null:typeof T=="object"&&T!==null?JSON.stringify(T):T}),y=f.filter(s=>!d.key.includes(s)),a=y.length?`DO UPDATE SET ${y.map(s=>`${s} = excluded.${s}`).join(", ")}`:"DO NOTHING";return r+=e.run(`INSERT INTO ${d.name} (${f.join(", ")}) VALUES (${f.map(()=>"?").join(", ")}) ON CONFLICT(${d.key.join(", ")}) ${a}`,L).changes,c&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,i]),d.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(E.sha256),t.space_id,"down",String(E.mime)]),r}function Kn(e,t,o){const r=t?.sharedId&&t.sharedId!==o.sharedId?t.sharedId:null;e.exec("BEGIN");try{if(r){e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");const d="SELECT id FROM items WHERE space_id = ?";for(const l of Ne)l.scope==="item"&&e.run(`DELETE FROM sync_outbox WHERE tbl = ? AND id IN (SELECT ${Le(l,l.name)} FROM ${l.name} WHERE ${l.itemCol} IN (${d}))`,[l.name,r]);e.run(`DELETE FROM sync_outbox WHERE tbl = 'items' AND id IN (${d})`,[r]),e.run("DELETE FROM sync_outbox WHERE tbl = 'folders' AND id IN (SELECT id FROM folders WHERE space_id = ?)",[r]),e.run("DELETE FROM items WHERE space_id = ?",[r]),e.run("DELETE FROM folders WHERE space_id = ?",[r]),e.run("DELETE FROM sync_outbox WHERE tbl = 'goals' AND id IN (SELECT id FROM goals WHERE space_id = ?)",[r]),e.run("DELETE FROM goals WHERE space_id = ?",[r]);for(const l of["orders","class_slots","calendars"])e.run(`DELETE FROM sync_outbox WHERE tbl = '${l}' AND id IN (SELECT id FROM ${l} WHERE space_id = ?)`,[r]),e.run(`DELETE FROM ${l} WHERE space_id = ?`,[r]);e.run("DELETE FROM sync_blobs WHERE space_id = ?",[r]),e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'")}V(e,"spaces",JSON.stringify(o)),V(e,"cursor",null),e.exec("COMMIT")}catch(d){throw e.exec("ROLLBACK"),d}}function be(e,t){return e.get("SELECT value FROM sync_state WHERE key = ?",[t])?.value??null}function V(e,t,o){o===null?e.run("DELETE FROM sync_state WHERE key = ?",[t]):e.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",[t,o])}const Jn=50,dt=500,Vn=8;async function Zn(e,t,o,r){for(let i=0;i<100;i++){const{entries:c,taken:u}=Pn(e,t);if(!u.length)break;c.length&&await o.push(c),zn(e,u)}let d=0,l=Number(be(e,"cursor")??0);for(let i=0;i<200;i++){const c=Math.max(0,l-(i===0?Jn:0)),u=await o.pull(c,dt);if(!u.length)break;d+=jn(e,u,t);const E=Math.max(...u.map(m=>m.rev));if(E>l&&(l=E,V(e,"cursor",String(l))),u.length<dt)break}const n=e.all("SELECT * FROM sync_blobs WHERE tries < 40 ORDER BY dir DESC, tries LIMIT ?",[Vn]);for(const i of n)try{let c=!1;if(i.dir==="up"){const u=await r.read(i.sha256);u&&await o.upload(i.space_id,i.sha256,u,i.mime),c=!0}else if(await r.read(i.sha256))c=!0;else{const u=await o.download(i.space_id,i.sha256);u&&(await r.write(u,i.mime),c=!0,d++)}c?e.run("DELETE FROM sync_blobs WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir]):e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir])}catch{e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir])}return d}class b extends Error{constructor(t,o=0,r=!1){super(t),this.status=o,this.offline=r}}const Ie=e=>({accessToken:e.access_token,refreshToken:e.refresh_token,expiresAt:Date.now()+e.expires_in*1e3,userId:e.user.id,email:e.user.email});function Qn(e,t){const o=t.msg??t.message??t.error_description??"",r=t.error_code??t.code??"";return r==="invalid_credentials"||/invalid login credentials/i.test(o)?"Nieprawidłowy e-mail lub hasło.":r==="user_already_exists"||/already registered/i.test(o)?"To konto już istnieje — zaloguj się.":r==="weak_password"||/password should be/i.test(o)?"Hasło jest za krótkie (minimum 6 znaków).":/database error saving new user|nie ma zaproszenia/i.test(o)||r==="unexpected_failure"?"Ten adres e-mail nie ma zaproszenia do Notario.":r==="validation_failed"||/email/i.test(o)&&e===400?"Sprawdź adres e-mail.":e===429?"Za dużo prób. Spróbuj za chwilę.":o||`Błąd serwera (${e}).`}function qn(e,t){let o=t.load(),r=null;async function d(m,_={}){const f=new Headers(_.headers);f.set("apikey",e.key),_.auth!==!1&&f.set("Authorization",`Bearer ${await i()}`);let L;try{L=await fetch(`${e.url}${m}`,{..._,headers:f})}catch{throw new b("Brak połączenia z internetem.",0,!0)}return L}async function l(m,_){const f=await d(m,{method:"POST",auth:!1,headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}),L=await f.json().catch(()=>({}));if(!f.ok)throw new b(Qn(f.status,L),f.status);return L}function n(m){o=m,t.save(m)}async function i(){if(!o)throw new b("Nie zalogowano.",401);return o.expiresAt-Date.now()>6e4?o.accessToken:(r??(r=(async()=>{try{const m=await l("/auth/v1/token?grant_type=refresh_token",{refresh_token:o.refreshToken}),_=Ie(m);return n(_),_}catch(m){throw m instanceof b&&(m.status===400||m.status===401)&&n(null),m}finally{r=null}})()),(await r).accessToken)}async function c(m){if(m.status===401)throw new b("Sesja wygasła. Zaloguj się ponownie.",401);if(!m.ok){const f=await m.text().catch(()=>"");throw new b(`Serwer odrzucił zapytanie (${m.status}) ${f.slice(0,200)}`,m.status)}const _=await m.text();return _?JSON.parse(_):null}const u=async(m,_)=>c(await d(`/rest/v1/rpc/${m}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}));return{transport:{async push(m){await u("push_records",{changes:m})},async pull(m,_){const f=`select=space_id,tbl,id,data,deleted,stamp,rev&rev=gt.${m}&order=rev.asc&limit=${_}`;return c(await d(`/rest/v1/records?${f}`))},async upload(m,_,f,L){const y=await d(`/storage/v1/object/blobs/${m}/${_}`,{method:"POST",headers:{"Content-Type":L||"application/octet-stream"},body:f.slice().buffer});if(y.ok||y.status===409)return;const a=await y.text().catch(()=>"");if(!(y.status===400&&/exists|duplicate/i.test(a)))throw new b(`Nie udało się wysłać pliku (${y.status}).`,y.status)},async download(m,_){const f=await d(`/storage/v1/object/authenticated/blobs/${m}/${_}`);if(f.status===404||f.status===400)return null;if(!f.ok)throw new b(`Nie udało się pobrać pliku (${f.status}).`,f.status);return new Uint8Array(await f.arrayBuffer())}},rpc:u,session:()=>o,async signIn(m,_){const f=await l("/auth/v1/token?grant_type=password",{email:m.trim(),password:_}),L=Ie(f);return n(L),L},async signUp(m,_){const f=await l("/auth/v1/signup",{email:m.trim(),password:_});if("access_token"in f&&f.access_token){const L=Ie(f);return n(L),L}return this.signIn(m,_)},async signOut(){const m=o;n(null),m&&await fetch(`${e.url}/auth/v1/logout`,{method:"POST",headers:{apikey:e.key,Authorization:`Bearer ${m.accessToken}`}}).catch(()=>{})},async spaces(){const m=await u("my_spaces",{}),_=m.find(f=>f.kind==="private");if(!_)throw new b("Konto nie ma jeszcze swojej przestrzeni na serwerze.");return{privateId:_.id,sharedId:m.find(f=>f.kind==="shared")?.id??null}}}}function ei(e){const t=/"message"\s*:\s*"([^"]+)"/.exec(e);return t?t[1]:e.replace(/^Serwer odrzucił zapytanie \(\d+\)\s*/,"")}function ti(e){const t=qn(e.config,e.store),o=new Set;let r=t.session()?"idle":"off",d=null,l=null,n=null,i=!1,c;function u(){const s=be(e.db,"spaces");return s?JSON.parse(s):null}function E(){const s=t.session();return{signedIn:!!s,email:s?.email??null,state:s?r:"off",error:d,lastSyncAt:l,pending:xn(e.db),sharedSpaceId:s?u()?.sharedId??null:null}}const m=()=>{const s=E();o.forEach(T=>T(s))};async function _(){const s=t.session();if(!s){r="off";return}r="syncing",m();try{be(e.db,"user")!==s.userId&&(V(e.db,"user",s.userId),V(e.db,"cursor",null),V(e.db,"spaces",null));const T=u(),N=await t.spaces();(!T||T.privateId!==N.privateId||T.sharedId!==N.sharedId)&&(Kn(e.db,T,N),e.onRemoteChange());const R=await Zn(e.db,N,t.transport,e.blobs);e.onDbWritten(),R>0&&e.onRemoteChange(),r="idle",d=null,l=Date.now()}catch(T){const N=T;r=N.offline?"offline":"error",d=N.offline?null:N.message,t.session()||(r="off"),e.onDbWritten()}m()}async function f(s,T){try{await t.rpc(s,T)}catch(N){throw new b(ei(N.message))}await L()}function L(){return clearTimeout(c),n?(i=!0,n):(n=(async()=>{do i=!1,await _();while(i)})().finally(()=>{n=null}),n)}function y(s=1200){t.session()&&(clearTimeout(c),c=setTimeout(()=>void L(),s))}const a=setInterval(()=>{t.session()&&e.visible()&&!n&&L()},e.pollMs??5e3);return{status:E,syncNow:L,schedule:y,onStatus(s){return o.add(s),()=>o.delete(s)},async signIn(s,T){return await t.signIn(s,T),d=null,await L(),E()},async signUp(s,T){return await t.signUp(s,T),d=null,await L(),E()},async signOut(){return await t.signOut(),r="off",d=null,m(),E()},stop(){clearInterval(a),clearTimeout(c)},async savePush(s){await t.rpc("save_push_subscription",{p_endpoint:s.endpoint,p_p256dh:s.p256dh,p_auth:s.auth,p_tz:s.tz})},family:{info:()=>t.rpc("family_info",{}),invite:s=>f("family_invite",{p_email:s}),cancelInvite:s=>f("family_cancel_invite",{p_id:s}),declineInvite:s=>f("family_decline_invite",{p_id:s}),removeMember:s=>f("family_remove_member",{p_user:s}),leave:()=>f("family_leave",{}),async acceptInvite(s,T){await f("family_accept_invite",{p_id:s,p_bring:T}),e.db.run("INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM files"),e.onDbWritten()}}}}const ct="notatnik.sqlite",Ce="notario.session",ni=400;async function oi(e){const t=await e(),o={persistent:!1};let r=null;try{r=await _e(ct),o.persistent=!0}catch{o.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const d=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;o.persistent&&!await bn()&&!d&&(o.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const l=kn(t,r),n=Cn(l);let i=!r,c,u=Promise.resolve();const E=()=>{if(clearTimeout(c),!i||!o.persistent)return u;i=!1;const s=l.exportBytes();return u=u.then(()=>Nt(ct,s)).then(()=>{o.lastSavedAt=Date.now()}).catch(T=>{i=!0,console.error("Saving database failed",T),o.note="Nie udało się zapisać danych w pamięci przeglądarki."}),u},m=()=>{i=!0,clearTimeout(c),c=setTimeout(E,ni)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&E()}),window.addEventListener("pagehide",()=>void E()),i&&m();const _=new Set,f=s=>{const T={method:s,at:Date.now()};queueMicrotask(()=>_.forEach(N=>N(T)))},L=Wn(()=>o.persistent),y=ti({db:l,config:It,store:{load(){try{return JSON.parse(localStorage.getItem(Ce)??"null")}catch{return null}},save(s){try{s?localStorage.setItem(Ce,JSON.stringify(s)):localStorage.removeItem(Ce)}catch{}}},blobs:{read:s=>L.read(s),write:async(s,T)=>{await L.put(s,T)}},onDbWritten:m,onRemoteChange:()=>f("sync.pull"),visible:()=>document.visibilityState==="visible"&&navigator.onLine!==!1});window.addEventListener("online",()=>void y.syncNow()),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&y.syncNow()}),y.syncNow();const a={async call(s,T){const{result:N,mutated:R}=Mn(n.api,s,T);return R&&(m(),f(s),y.schedule()),N.ok?{ok:!0,value:N.value===void 0?void 0:structuredClone(N.value)}:N},onChanged(s){return _.add(s),()=>_.delete(s)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...o}),blobs:L,sync:{status:y.status,onStatus:y.onStatus,signIn:y.signIn,signUp:y.signUp,signOut:y.signOut,syncNow:y.syncNow,family:y.family,savePush:y.savePush}};window.bridge=a}export{oi as installWebBridge};
