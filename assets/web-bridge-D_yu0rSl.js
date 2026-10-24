import{n as A,i as O,N as k,a as gt,V as p,P as ve,b as Y,e as Et,c as U,l as ae,t as ne,d as Me,f as Ne,g as Ot,p as St,h as wt,j as ht,k as Dt,m as It,S as Ct}from"./index-Baw8fmKP.js";function Ut(e){let t=0;return function(r){const c=`sp_${t}`;e.exec(t===0?"BEGIN IMMEDIATE":`SAVEPOINT ${c}`),t++;try{const l=r();return t--,e.exec(t===0?"COMMIT":`RELEASE ${c}`),l}catch(l){throw t--,e.exec(t===0?"ROLLBACK":`ROLLBACK TO ${c}; RELEASE ${c}`),l}}}function vt(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const pe=[{name:"categories",key:["id"],scope:"all",mergeBy:{col:"name",where:"deleted_at IS NULL",nocase:!0}},{name:"tags",key:["id"],scope:"all",mergeBy:{col:"name",nocase:!0}},{name:"folders",key:["id"],scope:"own",refs:{category_id:"categories",parent_id:"folders"},mergeBy:{col:"name",where:"parent_id IS NULL AND deleted_at IS NULL",nocase:!0,sameSpace:!0}},{name:"items",key:["id"],scope:"own",refs:{category_id:"categories",folder_id:"folders"},localOnly:["opened_at"]},{name:"files",key:["id"],scope:"file",mergeBy:{col:"sha256"}},{name:"payments",key:["item_id"],scope:"item",itemCol:"item_id"},{name:"occurrence_states",key:["item_id","occurrence_key"],scope:"item",itemCol:"item_id"},{name:"checklist_items",key:["id"],scope:"item",itemCol:"item_id"},{name:"item_tags",key:["item_id","tag_id"],scope:"item",itemCol:"item_id",refs:{tag_id:"tags"}},{name:"item_links",key:["from_item_id","to_item_id","relation"],scope:"item",itemCol:"from_item_id"},{name:"item_files",key:["item_id","file_id"],scope:"item",itemCol:"item_id",refs:{file_id:"files"}},{name:"reminder_rules",key:["id"],scope:"item",itemCol:"item_id"},{name:"goals",key:["id"],scope:"own",since:3},{name:"calendars",key:["id"],scope:"own",since:4},{name:"orders",key:["id"],scope:"own",since:4,refs:{calendar_id:"calendars"}},{name:"class_slots",key:["id"],scope:"own",since:5,refs:{calendar_id:"calendars"}},{name:"vault",key:["id"],scope:"own",since:10},{name:"shop_lists",key:["id"],scope:"own",since:11,mergeBy:{col:"name",nocase:!0,sameSpace:!0}},{name:"shop_items",key:["id"],scope:"own",since:11,refs:{list_id:"shop_lists"}}],X=new Map(pe.map(e=>[e.name,e])),Le="|",Re=(e,t)=>e.key.map(o=>`${t}.${o}`).join(` || '${Le}' || `),ee="strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",te="(SELECT value FROM sync_state WHERE key = 'applying') = '0'",Mt=["type","title","body_json","body_text","folder_id","parent_item_id","category_id","status","priority","favorite","pinned","sort_order","start_at","due_at","all_day","recurrence","completed_at","trashed_with","created_at","updated_at","deleted_at","space_id"];function kt(){const e=[`
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
`];for(const o of pe.filter(r=>!r.since))e.push(P(o));e.push(`
CREATE TRIGGER sync_item_files_file_ai AFTER INSERT ON item_files WHEN ${te} BEGIN
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('files', new.file_id, ${ee});
END;`);const t=pe.filter(o=>o.scope==="item");return e.push(`
CREATE TRIGGER sync_items_space_au AFTER UPDATE OF space_id ON items WHEN ${te} BEGIN
${t.map(o=>`  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${o.name}', ${Re(o,o.name)}, ${ee} FROM ${o.name} WHERE ${o.itemCol} = new.id;`).join(`
`)}
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', file_id, ${ee} FROM item_files WHERE item_id = new.id;
END;`),e.join(`
`)}function P(e){const t=r=>`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${e.name}', ${Re(e,r)}, ${ee});`,o=e.name==="items"?` OF ${Mt.filter(r=>!(e.localOnly??[]).includes(r)).join(", ")}`:"";return`
CREATE TRIGGER sync_${e.name}_ai AFTER INSERT ON ${e.name} WHEN ${te} BEGIN ${t("new")} END;
CREATE TRIGGER sync_${e.name}_au AFTER UPDATE${o} ON ${e.name} WHEN ${te} BEGIN ${t("new")} END;
CREATE TRIGGER sync_${e.name}_ad AFTER DELETE ON ${e.name} WHEN ${te} BEGIN ${t("old")} END;
-- Everything that already exists goes out on the first sync.
INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${e.name}', ${Re(e,e.name)}, ${ee} FROM ${e.name};`}function Ft(){return`
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
${P(X.get("goals"))}`}function bt(){return`
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
${P(X.get("orders"))}`}function Wt(){return`
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
`}function Xt(){return`
CREATE TABLE vault (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('meta', 'entry')),
  payload     TEXT NOT NULL,          -- meta: salt + check; entry: {"iv","ct"} (ciphertext only)
  space_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
${P(X.get("vault"))}`}function $t(){return`
ALTER TABLE calendars ADD COLUMN leave TEXT;    -- {"uw":26,"years":{"2026":20}}
`}function xt(){return`
ALTER TABLE calendars ADD COLUMN logo TEXT;     -- small image as data URL (≤ ~60 kB)
ALTER TABLE calendars ADD COLUMN color2 TEXT;   -- second brand colour (gradient)
`}function Pt(){return`
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
`}function zt(){return`
ALTER TABLE payments ADD COLUMN kind TEXT;   -- monthly | yearly | installment | other
`}function Bt(){return`
ALTER TABLE orders ADD COLUMN ship_method TEXT;
ALTER TABLE orders ADD COLUMN tracking TEXT;
`}const z=e=>`replace(replace(${e}, 'ł', 'l'), 'Ł', 'L')`,G=e=>z(`
  coalesce((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = ${e}), '')
  || ' ' ||
  coalesce((SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id
            WHERE x.item_id = ${e}), '')`),Gt=[{version:1,name:"initial schema",sql:`
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

`},{version:2,name:"sync: spaces and change log",sql:kt()},{version:3,name:"goals",sql:Ft()},{version:4,name:"calendars and orders",sql:bt()},{version:5,name:"student calendars and timetable",sql:Wt()},{version:6,name:"calendar logo and brand colours",sql:xt()},{version:7,name:"work calendars: leave allowance",sql:$t()},{version:8,name:"order costs",sql:Ht()},{version:9,name:"payments are tasks",sql:`UPDATE items SET type = 'task', status = COALESCE(status, 'todo'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE type <> 'task' AND id IN (SELECT item_id FROM payments);`},{version:10,name:"password vault",sql:Xt()},{version:11,name:"shopping lists",sql:Pt()},{version:12,name:"payment kind",sql:zt()},{version:13,name:"order shipping method",sql:Bt()}],jt=`
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
`,Yt=`
DELETE FROM items_fts;
INSERT INTO items_fts (item_id, title, body, extra)
  SELECT i.id, ${z("i.title")}, ${z("i.body_text")}, ${G("i.id")} FROM items i;
`;function Kt(e,t=Gt){const o=e.get("PRAGMA user_version"),r=Number(o?.user_version??0),c=[],l=[...t].sort((n,i)=>n.version-i.version).filter(n=>n.version>r);for(const n of l){e.exec("BEGIN IMMEDIATE");try{e.exec(n.sql),e.exec(`PRAGMA user_version = ${n.version}`),e.exec("COMMIT"),c.push(n.version)}catch(i){throw e.exec("ROLLBACK"),new Error(`Migration ${n.version} (${n.name}) failed: ${i.message}`)}}return c}function Jt(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function Vt(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function Zt(e,t=!0){if(Vt(e))return!0;if(!t||!Jt(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(jt),e.exec(Yt),e.exec("COMMIT"),!0}catch(o){throw e.exec("ROLLBACK"),o}}const ze=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:A(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),Qt=/^#[0-9a-fA-F]{6}$/,qt=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}],en=[{name:"Urodziny",color:"#EC4899",icon:"cake"},{name:"Wakacje",color:"#14B8A6",icon:"plane"},{name:"Zdrowie",color:"#38BDF8",icon:"heart"},{name:"Rodzina",color:"#FACC15",icon:"users"}],tn=[{name:"Urlop",color:"#06B6D4",icon:"sun"},{name:"Wyjazd",color:"#F97316",icon:"map"},{name:"Sport",color:"#22C55E",icon:"dumbbell"},{name:"Zajęcia",color:"#8B5CF6",icon:"graduation-cap"}];function nn(e){const{db:t,env:o}=e;function r(n){const i=t.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[n]);if(!i)throw new k("Category",n);return ze(i)}function c(n,i){if(n!==void 0&&!n.trim())throw new p("Nazwa kategorii nie może być pusta");if(i!==void 0&&!Qt.test(i))throw new p("Kolor musi mieć format #RRGGBB")}function l(n){c(n.name,n.color);const i=o.newId(),d=O(o.now());return t.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[i,n.name.trim(),n.color,n.icon??null,gt(e,"categories","deleted_at IS NULL",[]),d,d]),r(i)}return{create:l,list(){return t.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(ze)},get:r,update(n,i){const d=r(n);return c(i.name,i.color),t.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[i.name?.trim()??d.name,i.color??d.color,i.icon===void 0?d.icon:i.icon,i.sortOrder??d.sortOrder,O(o.now()),n]),r(n)},remove(n){r(n),e.tx(()=>{const i=O(o.now());t.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[i,n]),t.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[i,n]),t.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[i,i,n])})},seedDefaults(){const n=t.get("SELECT COUNT(*) AS c FROM categories");if(A(n?.c??0)===0)for(const d of qt)l(d);const i=(d,u)=>{if(!t.get("SELECT 1 AS x FROM settings WHERE key = ?",[d])){for(const E of u)t.get("SELECT 1 AS x FROM categories WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL",[E.name])||l(E);t.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",[d,"true",O(o.now())])}};i("seed.eventCategories",en),i("seed.eventCategories2",tn)}}}const de=e=>({id:e.id,name:e.name,color:e.color});function Se(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function on(e){const{db:t,env:o}=e;function r(n){const i=t.get("SELECT id, name, color FROM tags WHERE id = ?",[n]);if(!i)throw new k("Tag",n);return de(i)}function c(n){const i=Se(n);if(!i)throw new p("Nazwa tagu nie może być pusta");const d=t.get("SELECT id, name, color FROM tags WHERE name = ?",[i]);if(d)return de(d);const u=o.newId(),E=O(o.now());return t.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[u,i,E,E]),r(u)}function l(n){return t.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[n]).map(de)}return{get:r,ensure:c,list(){return t.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(n=>({...de(n),itemCount:A(n.item_count)}))},forItem:l,setForItem(n,i){return e.tx(()=>{const d=new Map;for(const _ of i.map(Se))_&&!d.has(_.toLowerCase())&&d.set(_.toLowerCase(),_);const u=[...d.values()].map(c),E=new Set(u.map(_=>_.id)),T=t.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[n]).map(_=>_.tag_id);for(const _ of T)E.has(_)||t.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[n,_]);for(const _ of E)T.includes(_)||t.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[n,_]);return t.run("UPDATE items SET updated_at = ? WHERE id = ?",[O(o.now()),n]),l(n)})},update(n,i){const d=r(n),u=i.name===void 0?d.name:Se(i.name);if(!u)throw new p("Nazwa tagu nie może być pusta");if(t.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[u,n]))throw new p(`Tag „${u}” już istnieje`);return t.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[u,i.color===void 0?d.color:i.color,O(o.now()),n]),r(n)},remove(n){r(n),t.run("DELETE FROM tags WHERE id = ?",[n])}}}const Be=["note","task","event"],Ge=["todo","in_progress","done","on_hold"],K=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id, i.space_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency, p.kind AS pay_kind,
         (SELECT COUNT(*) FROM occurrence_states o WHERE o.item_id = i.id AND o.status = 'done') AS occ_done,
         i.opened_at, i.updated_at, i.deleted_at, i.recurrence,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count,
         (SELECT group_concat(DISTINCT f.mime) FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id) AS file_mimes
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,J=e=>({id:e.id,type:e.type,title:e.title,spaceId:e.space_id??null,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:A(e.priority),favorite:Y(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:Y(e.all_day),isPayment:Y(e.is_payment),amountMinor:e.amount_minor==null?null:A(e.amount_minor),currency:e.currency,paymentKind:ve.includes(String(e.pay_kind))?e.pay_kind:null,seriesDone:A(e.occ_done??0),openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:A(e.file_count??0),fileMimes:e.file_mimes?String(e.file_mimes).split(","):[],recurrence:ut(e.recurrence),occurrence:null});function ut(e){if(!e)return null;try{return Me(JSON.parse(e))}catch{return null}}function mt(e,t,o){return{...e,startAt:t.startAt,dueAt:t.dueAt,occurrence:t.key,status:e.type==="task"?o?"done":"todo":e.status}}function Tt(e,t){const o=new Map;if(!t.length)return o;const r=e.all(`SELECT item_id, occurrence_key FROM occurrence_states WHERE status = 'done' AND item_id IN (${t.map(()=>"?").join(",")})`,t);for(const c of r)o.has(c.item_id)||o.set(c.item_id,new Set),o.get(c.item_id).add(c.occurrence_key);return o}function ye(e,t,o,r){const c=Tt(e,t.map(n=>n.id)),l=[];for(const n of t){if(!n.recurrence)continue;const i=c.get(n.id);for(const d of Et(n,n.recurrence,o,r))l.push(mt(n,d,!!i?.has(d.key)))}return l}function ce(e,t){if(t!=null&&!Ot(t))throw new p(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${t}”`)}function je(e,t){if(e&&t&&e.slice(0,10)>t.slice(0,10))throw new p("Koniec nie może być przed początkiem")}function Ye(e){if(e===0||e===1||e===2||e===3)return e;throw new p("Priorytet musi być liczbą 0–3")}function rn(e,t){const{db:o,env:r}=e;function c(a){return o.get("SELECT * FROM items WHERE id = ?",[a])}function l(a){const s=o.get("SELECT amount_minor, currency, account, payee, kind FROM payments WHERE item_id = ?",[a]);return s?{amountMinor:s.amount_minor==null?null:A(s.amount_minor),currency:s.currency,account:s.account,payee:s.payee,kind:ve.includes(String(s.kind))?s.kind:null}:null}function n(a){return{id:a.id,type:a.type,title:a.title,spaceId:a.space_id??null,bodyJson:St(a.body_json),bodyText:a.body_text,folderId:a.folder_id,parentItemId:a.parent_item_id,categoryId:a.category_id,status:a.status,priority:A(a.priority),favorite:Y(a.favorite),pinned:Y(a.pinned),sortOrder:A(a.sort_order),startAt:a.start_at,dueAt:a.due_at,allDay:Y(a.all_day),recurrence:ut(a.recurrence),completedAt:a.completed_at,openedAt:a.opened_at,createdAt:a.created_at,updatedAt:a.updated_at,deletedAt:a.deleted_at,tags:t.tags.forItem(a.id),payment:l(a.id)}}const i=a=>ae(o,"categories",a);function d(a){const s=c(a);if(!s)throw new k("Item",a);return n(s)}function u(a){const s=d(a);if(s.deletedAt)throw new k("Item",a);return s}function E(a){a&&t.folders.get(a)}function T(a,s){if(a){if(a===s)throw new p("Element nie może być swoim rodzicem");u(a)}}function _(a,s){const m=l(a),f=s.amountMinor===void 0?m?.amountMinor??null:s.amountMinor;if(f!=null&&(!Number.isInteger(f)||f<0))throw new p("Kwota musi być nieujemną liczbą całkowitą w groszach");const L=s.kind===void 0?m?.kind??null:s.kind;if(L!=null&&!ve.includes(L))throw new p("Nieznany rodzaj płatności");o.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee, kind) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee, kind = excluded.kind`,[a,f,s.currency??m?.currency??"PLN",s.account??m?.account??"",s.payee??m?.payee??"",L])}function N(a){const s=a?o.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[a]):o.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(s?.m==null?0:A(s.m))+1}function R(a){const s=Tt(o,[a.id]).get(a.id)??new Set,m=ne(r.now()),f=Et(a,a.recurrence,U(m,-366),U(m,800),2e3),L=f.find(h=>!s.has(h.key)&&(a.type==="task"||h.dueAt.slice(0,10)>=m)),w=L??f[f.length-1];return w?mt(a,w,!L&&a.type==="task"):a}const g={get:u,getAny:d,create(a){if(a.payment!=null&&a.type!=="task"&&(a={...a,type:"task"}),!Be.includes(a.type))throw new p(`Nieznany typ elementu: ${String(a.type)}`);ce("Początek",a.startAt),ce("Termin",a.dueAt),je(a.startAt,a.dueAt);const s=Me(a.recurrence);if(s&&!a.dueAt)throw new p("Powtarzanie wymaga daty");if(a.status!=null&&!Ge.includes(a.status))throw new p("Nieznany status");const m=Ye(a.priority??1),f=a.folderId??null;E(f),T(a.parentItemId);const L=f?t.folders.get(f).itemDefaults:null,w=i(a.categoryId!==void 0?a.categoryId:L?.categoryId??null),h=a.payment!=null||a.payment===void 0&&!!L?.isPayment&&a.type==="task",D=a.type==="task"?a.status??"todo":null,F=a.dueAt??a.startAt,W=F?Ne(F):!1,b=O(r.now()),C=r.newId();return e.tx(()=>(o.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, recurrence, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[C,a.type,(a.title??"").trim(),a.bodyJson==null?null:JSON.stringify(a.bodyJson),a.bodyText??"",f,a.parentItemId??null,w,D,m,a.favorite?1:0,N(f),a.startAt??null,a.dueAt??null,W?1:0,s?JSON.stringify(s):null,D==="done"?b:null,b,b]),h&&_(C,{currency:L?.currency,...a.payment??{}}),a.tags?.length&&t.tags.setForItem(C,a.tags),u(C)))},update(a,s){const m=u(a);if(s.type!==void 0&&!Be.includes(s.type))throw new p("Nieznany typ elementu");if(s.status!=null&&!Ge.includes(s.status))throw new p("Nieznany status");ce("Początek",s.startAt),ce("Termin",s.dueAt),s.folderId!==void 0&&E(s.folderId),s.parentItemId!==void 0&&T(s.parentItemId,a);const f=s.type??m.type;if((s.payment===void 0?!!m.payment:s.payment!=null)&&f!=="task")throw new p("Płatność jest zawsze zadaniem (do zapłaty w terminie)");let w=s.status===void 0?m.status:s.status;f==="task"&&w==null&&(w="todo"),f!=="task"&&(w=null);const h=s.startAt===void 0?m.startAt:s.startAt,D=s.dueAt===void 0?m.dueAt:s.dueAt;je(h,D);const F=s.recurrence===void 0?m.recurrence:Me(s.recurrence);if(F&&!D)throw new p("Powtarzanie wymaga daty");const W=D??h,b=O(r.now()),C=w==="done"?m.completedAt??b:null,$=s.priority===void 0?m.priority:Ye(s.priority);return e.tx(()=>(o.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, recurrence = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[f,s.title===void 0?m.title:s.title.trim(),s.bodyJson===void 0?m.bodyJson==null?null:JSON.stringify(m.bodyJson):s.bodyJson==null?null:JSON.stringify(s.bodyJson),s.bodyText??m.bodyText,s.folderId===void 0?ae(o,"folders",m.folderId):s.folderId,s.parentItemId===void 0?ae(o,"items",m.parentItemId):s.parentItemId,i(s.categoryId===void 0?m.categoryId:s.categoryId),w,$,s.favorite??m.favorite?1:0,s.pinned??m.pinned?1:0,s.sortOrder??m.sortOrder,h,D,W&&Ne(W)?1:0,F?JSON.stringify(F):null,C,b,a]),s.payment===null?o.run("DELETE FROM payments WHERE item_id = ?",[a]):s.payment!==void 0&&_(a,s.payment),u(a)))},setTags(a,s){return u(a),t.tags.setForItem(a,s)},setStatus(a,s,m){const f=u(a);if(m&&f.recurrence){const L=O(r.now());return s==="done"?o.run(`INSERT INTO occurrence_states (item_id, occurrence_key, status, completed_at, updated_at) VALUES (?, ?, 'done', ?, ?)
             ON CONFLICT(item_id, occurrence_key) DO UPDATE SET status = 'done', completed_at = excluded.completed_at, updated_at = excluded.updated_at`,[a,m,L,L]):o.run("DELETE FROM occurrence_states WHERE item_id = ? AND occurrence_key = ?",[a,m]),u(a)}return g.update(a,{status:s})},paymentCheck(a,s){const m=u(a),f={isPayment:!!m.payment,title:m.title};if(!m.recurrence)return{...f,paidSameMonth:null,total:null,done:0};const L=o.all("SELECT occurrence_key AS k FROM occurrence_states WHERE item_id = ? AND status = 'done'",[a]).map(D=>D.k),w=new Set([ne(r.now()).slice(0,7),...s?[s.slice(0,7)]:[]]),h=L.filter(D=>D!==s&&w.has(D.slice(0,7))).sort().pop()??null;return{...f,paidSameMonth:h?h.slice(0,10):null,total:m.recurrence.count??null,done:L.filter(D=>D!==s).length}},toggleFavorite(a){return g.update(a,{favorite:!u(a).favorite})},markOpened(a){u(a),o.run("UPDATE items SET opened_at = ? WHERE id = ?",[O(r.now()),a])},setSpace(a,s){const m=u(a);return e.tx(()=>{const f=m.folderId?t.folders.find(m.folderId):null,L=f&&(f.spaceId??null)===s;o.run("UPDATE items SET space_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",[s,L?ae(o,"folders",m.folderId):null,O(r.now()),a])}),u(a)},move(a,s,m){return u(a),E(s),e.tx(()=>{const f=(s?o.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[s,a]):o.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[a])).map(w=>w.id),L=m===void 0?f.length:Math.max(0,Math.min(m,f.length));f.splice(L,0,a),o.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[s,O(r.now()),a]),f.forEach((w,h)=>o.run("UPDATE items SET sort_order = ? WHERE id = ?",[h+1,w]))}),u(a)},trash(a){u(a);const s=O(r.now());o.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[s,s,a])},restore(a){const s=d(a);return e.tx(()=>{const m=O(r.now()),f=s.folderId?t.folders.find(s.folderId):null,L=f&&!f.deletedAt?f.id:null;o.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[L,m,a])}),u(a)},purge(a){if(!d(a).deletedAt)throw new p("Najpierw przenieś element do kosza");o.run("DELETE FROM items WHERE id = ?",[a])},query(a={}){const s=[[a.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL",[],!1]],m=(y,I=[],v=!1)=>s.push([y,I,v]);if(a.type){const y=Array.isArray(a.type)?a.type:[a.type];m(`i.type IN (${y.map(()=>"?").join(",")})`,y)}if(a.folderId===null)m("i.folder_id IS NULL");else if(a.folderId!==void 0)if(a.includeSubfolders){const y=t.folders.descendantIds(a.folderId);m(`i.folder_id IN (${y.map(()=>"?").join(",")})`,y)}else m("i.folder_id = ?",[a.folderId]);if(a.status){const y=Array.isArray(a.status)?a.status:[a.status];m(`i.status IN (${y.map(()=>"?").join(",")})`,y,!0)}a.openOnly&&m("(i.status IS NULL OR i.status <> 'done')",[],!0),a.favorite!==void 0&&m(`i.favorite = ${a.favorite?1:0}`),a.tagId&&m("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)",[a.tagId]),a.payment!==void 0&&m(`p.item_id IS ${a.payment?"NOT NULL":"NULL"}`);const f=s.filter(y=>!y[2]),L=f.map(y=>y[0]),w=f.flatMap(y=>y[1]),h=!!(a.dueFrom||a.dueTo);h&&m("i.recurrence IS NULL"),a.dueFrom&&m("i.due_at >= ?",[a.dueFrom]),a.dueTo&&m("COALESCE(i.start_at, i.due_at) < ?",[a.dueTo]);const D=s.map(y=>y[0]),F=s.flatMap(y=>y[1]),W={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[a.orderBy??"manual"];a.orderBy==="opened"&&D.push("i.opened_at IS NOT NULL");const b=a.limit&&a.limit>0?` LIMIT ${Math.floor(a.limit)}`:"",C=o.all(`${K} WHERE ${D.join(" AND ")} ORDER BY ${W}${b}`,F).map(J),$=o.all(`${K} WHERE ${[...L,"i.recurrence IS NOT NULL","i.due_at IS NOT NULL"].join(" AND ")}`,w).map(J).filter(y=>y.recurrence);if(!$.length||a.trashed||a.orderBy==="opened")return C;const ie=y=>(!a.openOnly||y.status!=="done")&&(!a.status||(Array.isArray(a.status)?a.status:[a.status]).includes(y.status)),oe=y=>y.sort((I,v)=>(I.dueAt==null?1:0)-(v.dueAt==null?1:0)||((I.dueAt??"")<(v.dueAt??"")?-1:(I.dueAt??"")>(v.dueAt??"")?1:0)||v.priority-I.priority),re=y=>a.limit&&a.limit>0?y.slice(0,Math.floor(a.limit)):y;if(h){const y=a.dueFrom??"0000-01-01",I=a.dueTo??U(y.slice(0,10),400),v=ye(o,$,y,I).filter(ie);return v.length?re(oe([...C,...v])):C}const x=new Map($.map(y=>[y.id,R(y)])),H=C.flatMap(y=>{const I=x.get(y.id);return I?ie(I)?[I]:[]:[y]});return a.orderBy==="due"?oe(H):H},occurrences(a,s){const m=o.all(`${K} WHERE i.deleted_at IS NULL AND i.recurrence IS NOT NULL AND i.due_at IS NOT NULL`).map(J);return ye(o,m,a,s)}};return g}const Q={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function sn(e){const{db:t,env:o}=e;return{get(r){const c=t.get("SELECT value FROM settings WHERE key = ?",[r]);if(!c)return Q[r];try{return JSON.parse(c.value)}catch{return Q[r]}},set(r,c){if(!(r in Q))throw new Error(`Unknown setting: ${String(r)}`);return t.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[r,JSON.stringify(c),O(o.now())]),c},all(){const r={...Q};for(const c of t.all("SELECT key, value FROM settings"))if(c.key in Q)try{r[c.key]=JSON.parse(c.value)}catch{}return r}}}const le=e=>String(e).padStart(2,"0");function an(e,t){if(e.mode==="before"){const r=t.length>10?t.slice(0,16):`${t.slice(0,10)}T${e.timeOfDay??"09:00"}`,[c,l,n]=r.slice(0,10).split("-").map(Number),i=new Date(Date.UTC(c,l-1,n,+r.slice(11,13),+r.slice(14,16))-e.offsetMinutes*6e4);return`${i.getUTCFullYear()}-${le(i.getUTCMonth()+1)}-${le(i.getUTCDate())}T${le(i.getUTCHours())}:${le(i.getUTCMinutes())}`}return`${U(t.slice(0,10),-Math.round(e.offsetMinutes/1440))}T${e.timeOfDay??(t.length>10?t.slice(11,16):"09:00")}`}const dn=/^([01]\d|2[0-3]):[0-5]\d$/,cn=60*1440;function ln(e){if(e.mode!=="before"&&e.mode!=="on_day")throw new p("Nieznany rodzaj przypomnienia");const t=Number(e.offsetMinutes??0);if(!Number.isInteger(t)||t<0||t>cn)throw new p("Przypomnienie: wyprzedzenie 0–60 dni");if(e.timeOfDay!=null&&e.timeOfDay!==""&&!dn.test(e.timeOfDay))throw new p("Godzina przypomnienia: GG:MM");return{mode:e.mode,offsetMinutes:t,timeOfDay:e.timeOfDay||null}}function Ke(e,t){return wt(an(e,t))}function En(e){const{db:t,env:o}=e,r=c=>({id:c.id,mode:c.mode,offsetMinutes:A(c.offset_minutes??0),timeOfDay:c.time_of_day});return{forItem(c){return t.all("SELECT * FROM reminder_rules WHERE item_id = ? AND enabled = 1 ORDER BY sort_order",[c]).map(r)},set(c,l){const n=l.map(ln);if(n.length>5)throw new p("Najwyżej 5 przypomnień");if(!t.get("SELECT 1 FROM items WHERE id = ? AND deleted_at IS NULL",[c]))throw new p("Nie ma takiego wpisu");const i=O(o.now());return e.tx(()=>{const d=t.all("SELECT * FROM reminder_rules WHERE item_id = ? ORDER BY sort_order",[c]).map(r);return d.length===n.length&&d.every((E,T)=>E.mode===n[T].mode&&E.offsetMinutes===n[T].offsetMinutes&&E.timeOfDay===n[T].timeOfDay)?d:(t.run("DELETE FROM reminder_rules WHERE item_id = ?",[c]),n.forEach((E,T)=>t.run(`INSERT INTO reminder_rules (id, item_id, mode, offset_minutes, time_of_day, enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,[o.newId(),c,E.mode,E.offsetMinutes,E.timeOfDay,T+1,i,i])),t.all("SELECT * FROM reminder_rules WHERE item_id = ? ORDER BY sort_order",[c]).map(r))})},due(c,l){const n=new Date(c),i=new Date(l),d=t.all("SELECT * FROM reminder_rules WHERE enabled = 1"),u=new Map;for(const s of d)u.set(s.item_id,[...u.get(s.item_id)??[],r(s)]);const E=[...u.keys()],T=E.length?t.all(`${K} WHERE i.deleted_at IS NULL AND i.due_at IS NOT NULL AND i.id IN (${E.map(()=>"?").join(",")})`,E).map(J):[],_=s=>`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,N=U(_(n),-1),R=U(_(i),62),g=[...T.filter(s=>!s.recurrence),...ye(t,T.filter(s=>s.recurrence),N,R)],a=[];for(const s of g){if(s.type==="task"&&s.status==="done")continue;const m=s.startAt??s.dueAt;for(const f of u.get(s.id)??[]){const L=Ke(f,m);L>=n&&L<i&&a.push({key:`${f.id}|${s.occurrence??""}`,itemId:s.id,occurrence:s.occurrence,title:s.title,type:s.type,startAt:s.startAt,dueAt:s.dueAt,fireAt:L.toISOString(),isPayment:s.isPayment,amountMinor:s.amountMinor,currency:s.currency})}}for(const s of t.all("SELECT * FROM orders WHERE remind_days IS NOT NULL AND status NOT IN ('shipped', 'cancelled')")){const m={mode:"on_day",offsetMinutes:A(s.remind_days)*1440,timeOfDay:"09:00"},f=[];s.status!=="ready"&&f.push(["due",s.due_date]),s.ship_date&&f.push(["ship",s.ship_date]);for(const[L,w]of f){const h=Ke(m,w);h>=n&&h<i&&a.push({key:`order|${s.id}|${L}|${w}`,itemId:s.id,occurrence:null,title:s.title,type:"task",startAt:null,dueAt:w,fireAt:h.toISOString(),isPayment:!1,amountMinor:s.amount_minor==null?null:A(s.amount_minor),currency:"PLN",order:{kind:L,calendarId:s.calendar_id,client:s.client}})}}return a.sort((s,m)=>s.fireAt.localeCompare(m.fireAt))}}}const Je=["week","month","year"],_t=e=>String(e).padStart(2,"0");function Ve(e,t){const[o,r,c]=t.split("-").map(Number);if(e==="year")return`${o}-01-01`;if(e==="month")return`${o}-${_t(r)}-01`;const l=(new Date(Date.UTC(o,r-1,c)).getUTCDay()+6)%7;return U(t.slice(0,10),-l)}function un(e,t){const[o,r]=t.split("-").map(Number);return e==="year"?`${o+1}-01-01`:e==="month"?r===12?`${o+1}-01-01`:`${o}-${_t(r+1)}-01`:U(t,7)}const Ze=e=>{const t=e.target==null?null:A(e.target),o=A(e.progress);return{id:e.id,title:e.title,notes:e.notes,period:e.period,periodStart:e.period_start,periodEnd:un(e.period,e.period_start),target:t,progress:o,done:!!e.done_at||t!=null&&o>=t,doneAt:e.done_at,color:e.color,sortOrder:A(e.sort_order),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}};function Qe(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<1||t>1e6)throw new p("Cel liczbowy: liczba całkowita od 1");return t}function mn(e){const{db:t,env:o}=e,r=l=>t.get("SELECT * FROM goals WHERE id = ?",[l]),c=l=>{const n=r(l);if(!n)throw new k("Goal",l);return Ze(n)};return{get:c,list(l={}){const n=l.date??ne(o.now()),i=l.period?[l.period]:Je,d=[];for(const u of i)d.push(...t.all("SELECT * FROM goals WHERE period = ? AND period_start = ? ORDER BY sort_order, created_at",[u,Ve(u,n)]).map(Ze));return d},create(l){const n=(l.title??"").trim();if(!n)throw new p("Wpisz, jaki to cel");if(!Je.includes(l.period))throw new p("Okres: tydzień, miesiąc albo rok");const i=Ve(l.period,l.date??ne(o.now())),d=o.newId(),u=O(o.now()),E=t.get("SELECT MAX(sort_order) AS m FROM goals WHERE period = ? AND period_start = ?",[l.period,i]);return t.run(`INSERT INTO goals (id, title, notes, period, period_start, target, progress, color, sort_order, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,[d,n,l.notes??"",l.period,i,Qe(l.target),l.color??null,(E?.m==null?0:A(E.m))+1,l.spaceId??null,u,u]),c(d)},update(l,n){const i=c(l),d=n.title===void 0?i.title:n.title.trim();if(!d)throw new p("Wpisz, jaki to cel");const u=n.target===void 0?i.target:Qe(n.target);let E=n.progress===void 0?i.progress:Math.round(Number(n.progress));(!Number.isFinite(E)||E<0)&&(E=0),u!=null&&(E=Math.min(E,u));const T=n.done===void 0?i.doneAt:n.done?i.doneAt??O(o.now()):null;return t.run("UPDATE goals SET title = ?, notes = ?, target = ?, progress = ?, done_at = ?, color = ?, space_id = ?, updated_at = ? WHERE id = ?",[d,n.notes??i.notes,u,E,T,n.color===void 0?i.color:n.color,n.spaceId===void 0?i.spaceId:n.spaceId,O(o.now()),l]),c(l)},step(l,n){const i=c(l);return this.update(l,{progress:i.progress+Math.sign(n)})},remove(l){c(l),t.run("DELETE FROM goals WHERE id = ?",[l])}}}const we="vault-meta",Tn=2e4;function qe(e){if(typeof e!="string"||e.length>Tn)throw new p("Sejf: nieprawidłowe dane");let t;try{t=JSON.parse(e)}catch{throw new p("Sejf: nieprawidłowe dane")}const o=r=>!!r&&typeof r.iv=="string"&&typeof r.ct=="string";if(!(o(t)||typeof t.salt=="string"&&o(t.check)))throw new p("Sejf: dane muszą być zaszyfrowane");return e}function _n(e){const{db:t,env:o}=e;return{meta(){return t.get("SELECT * FROM vault WHERE id = ? AND kind = 'meta'",[we])?.payload??null},createMeta(r){if(t.get("SELECT 1 FROM vault WHERE id = ?",[we]))throw new p("Sejf już istnieje");const c=O(o.now());t.run("INSERT INTO vault (id, kind, payload, space_id, created_at, updated_at) VALUES (?, 'meta', ?, NULL, ?, ?)",[we,qe(r),c,c])},list(){return t.all("SELECT * FROM vault WHERE kind = 'entry' ORDER BY created_at").map(r=>({id:r.id,payload:r.payload,updatedAt:r.updated_at}))},save(r,c){qe(c);const l=O(o.now());if(r&&t.get("SELECT 1 FROM vault WHERE id = ? AND kind = 'entry'",[r]))return t.run("UPDATE vault SET payload = ?, updated_at = ? WHERE id = ?",[c,l,r]),r;const n=o.newId();return t.run("INSERT INTO vault (id, kind, payload, space_id, created_at, updated_at) VALUES (?, 'entry', ?, NULL, ?, ?)",[n,c,l,l]),n},remove(r){t.run("DELETE FROM vault WHERE id = ? AND kind = 'entry'",[r])}}}const q=e=>e.replace(/\s+/g," ").trim().slice(0,120);function fn(e){const{db:t,env:o}=e,r=()=>O(o.now()),c=d=>{const u=t.get("SELECT * FROM shop_lists WHERE id = ?",[d]);if(!u)throw new k("Lista zakupów",d);return u},l=d=>{const u=t.get("SELECT * FROM shop_items WHERE id = ?",[d]);if(!u)throw new k("Produkt",d);return u},n=d=>A(t.get("SELECT MAX(sort_order) AS m FROM shop_items WHERE list_id = ?",[d])?.m??0)+1,i=d=>({id:d.id,listId:d.list_id,text:d.text,done:!!A(d.done),times:A(d.times)});return{lists(){return t.all(`SELECT l.*, (SELECT COUNT(*) FROM shop_items i WHERE i.list_id = l.id AND i.hidden = 0 AND i.done = 0) AS to_buy,
                (SELECT COUNT(*) FROM shop_items i WHERE i.list_id = l.id AND i.hidden = 0 AND i.done = 1) AS bought
         FROM shop_lists l ORDER BY l.sort_order, l.created_at`).map(d=>({id:d.id,name:d.name,spaceId:d.space_id??null,toBuy:A(d.to_buy),bought:A(d.bought)}))},createList(d,u=null){const E=q(d??"");if(!E)throw new p("Wpisz nazwę listy");const T=o.newId(),_=r(),N=A(t.get("SELECT MAX(sort_order) AS m FROM shop_lists")?.m??0)+1;return t.run("INSERT INTO shop_lists (id, name, sort_order, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",[T,E,N,u,_,_]),{id:T,name:E,spaceId:u,toBuy:0,bought:0}},renameList(d,u){c(d);const E=q(u??"");if(!E)throw new p("Wpisz nazwę listy");t.run("UPDATE shop_lists SET name = ?, updated_at = ? WHERE id = ?",[E,r(),d])},setListSpace(d,u){c(d),e.tx(()=>{const E=r();t.run("UPDATE shop_lists SET space_id = ?, updated_at = ? WHERE id = ?",[u,E,d]),t.run("UPDATE shop_items SET space_id = ?, updated_at = ? WHERE list_id = ?",[u,E,d])})},removeList(d){e.tx(()=>{t.run("DELETE FROM shop_items WHERE list_id = ?",[d]),t.run("DELETE FROM shop_lists WHERE id = ?",[d])})},items(d){return t.all("SELECT * FROM shop_items WHERE list_id = ? AND hidden = 0 ORDER BY done, CASE WHEN done = 1 THEN done_at END DESC, sort_order",[d]).map(i)},add(d,u){const E=c(d),T=[...new Set(String(u??"").split(/\n|;/).map(q).filter(Boolean))];if(!T.length)throw new p("Wpisz produkt");return e.tx(()=>T.map(_=>{const N=r(),R=t.get("SELECT * FROM shop_items WHERE list_id = ? AND text = ? COLLATE NOCASE ORDER BY hidden, done LIMIT 1",[d,_]);if(R&&!A(R.hidden)&&!A(R.done))return i(R);if(R)return t.run("UPDATE shop_items SET done = 0, done_at = NULL, hidden = 0, times = times + 1, sort_order = ?, updated_at = ? WHERE id = ?",[n(d),N,R.id]),i(l(R.id));const g=o.newId();return t.run(`INSERT INTO shop_items (id, list_id, text, done, hidden, times, sort_order, space_id, created_at, updated_at)
                VALUES (?, ?, ?, 0, 0, 1, ?, ?, ?, ?)`,[g,d,_,n(d),E.space_id,N,N]),i(l(g))}))},setDone(d,u){l(d);const E=r();t.run("UPDATE shop_items SET done = ?, done_at = ?, updated_at = ? WHERE id = ?",[u?1:0,u?E:null,E,d])},rename(d,u){l(d);const E=q(u??"");if(!E)throw new p("Wpisz produkt");t.run("UPDATE shop_items SET text = ?, updated_at = ? WHERE id = ?",[E,r(),d])},remove(d){t.run("DELETE FROM shop_items WHERE id = ?",[d])},clearBought(d){return t.run("UPDATE shop_items SET hidden = 1, updated_at = ? WHERE list_id = ? AND hidden = 0 AND done = 1",[r(),d]).changes},suggestions(d,u="",E=12){const T=q(u).toLocaleLowerCase("pl"),_=new Set(t.all("SELECT lower(text) AS t FROM shop_items WHERE list_id = ? AND hidden = 0 AND done = 0",[d]).map(g=>g.t)),N=T?t.all("SELECT text, SUM(times) AS times FROM shop_items GROUP BY lower(text) ORDER BY times DESC, MAX(updated_at) DESC LIMIT 300"):t.all("SELECT text, times FROM shop_items WHERE list_id = ? AND (hidden = 1 OR done = 1) AND times >= 2 ORDER BY times DESC, updated_at DESC LIMIT 100",[d]),R=[];for(const g of N){const a=g.text.toLocaleLowerCase("pl");if(!_.has(a)&&!(T&&(!a.includes(T)||a===T))&&(R.push({text:g.text,times:A(g.times)}),R.length>=E))break}return R}}}const et=["new","in_progress","ready","shipped","cancelled"],ke=e=>e==="study"||e==="work"?e:"orders";function Nn(e){if(!e)return null;try{const t=JSON.parse(e);return typeof t?.uw=="number"?{uw:t.uw,years:t.years??void 0,...t.schedule?{schedule:t.schedule}:{}}:null}catch{return null}}function pn(e){if(e==null)return null;const t=c=>Number.isInteger(c)&&c>=0&&c<=60;if(!t(e.uw))throw new p("Urlop wypoczynkowy: 0–60 dni");const o={};for(const[c,l]of Object.entries(e.years??{})){if(!/^\d{4}$/.test(c)||!t(l))throw new p("Urlop wypoczynkowy: 0–60 dni");o[c]=l}let r=null;try{r=ht(e.schedule)}catch(c){throw new p(c.message)}return JSON.stringify({uw:e.uw,...Object.keys(o).length?{years:o}:{},...r?{schedule:r}:{}})}const tt=e=>({id:e.id,name:e.name,kind:ke(e.kind),leave:Nn(e.leave??null),icon:e.icon,itemLabel:e.item_label||"Zlecenie",color:e.color,color2:e.color2??null,logo:e.logo??null,sortOrder:A(e.sort_order),spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}),he=e=>({id:e.id,calendarId:e.calendar_id,title:e.title,client:e.client,notes:e.notes,startDate:e.start_date,dueDate:e.due_date,shipDate:e.ship_date,status:e.status,tag:e.tag??null,amountMinor:e.amount_minor==null?null:A(e.amount_minor),costMinor:e.cost_minor==null?null:A(e.cost_minor),remindDays:e.remind_days==null?null:A(e.remind_days),shipMethod:e.ship_method??null,tracking:e.tracking??null,spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at}),Ee=(e,t)=>(e??"").trim().slice(0,t)||null;function nt(e,t,o){for(const[r,c]of[["Od kiedy",e],["Termin",t]])if(!Ne(c))throw new p(`${r}: wybierz dzień`);if(t<e)throw new p("Termin nie może być przed początkiem");if(o!=null){if(!Ne(o))throw new p("Wysyłka: wybierz dzień");if(o<e)throw new p("Wysyłka nie może być przed początkiem")}}function it(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<0||t>60)throw new p("Przypomnienie: 0–60 dni przed");return t}function ue(e){if(e==null||e==="")return null;const t=Number(e);if(!Number.isInteger(t)||t<0)throw new p("Kwota musi być nieujemna");return t}function ot(e){const t=(e??"").trim();return t?[...t].slice(0,2).join(""):null}const Ln=/^#[0-9a-fA-F]{6}$/,rt=e=>(e??"").trim().slice(0,30)||null,st=/^([01]\d|2[0-3]):[0-5]\d$/,me=e=>({id:e.id,calendarId:e.calendar_id,subject:e.subject,form:e.form,weekday:A(e.weekday),startTime:e.start_time,endTime:e.end_time,room:e.room,teacher:e.teacher,every:e.every,color:e.color,spaceId:e.space_id??null,createdAt:e.created_at,updatedAt:e.updated_at});function at(e){if(!e.subject.trim())throw new p("Wpisz nazwę przedmiotu");if(!Number.isInteger(e.weekday)||e.weekday<0||e.weekday>6)throw new p("Wybierz dzień tygodnia");if(!st.test(e.startTime)||!st.test(e.endTime))throw new p("Godziny w formacie GG:MM");if(e.endTime<=e.startTime)throw new p("Koniec zajęć musi być po początku");if(e.every&&!["week","odd","even"].includes(e.every))throw new p("Co tydzień, nieparzyste albo parzyste")}function Rn(e){const{db:t,env:o}=e,r=n=>{const i=t.get("SELECT * FROM calendars WHERE id = ?",[n]);if(!i)throw new k("Calendar",n);return tt(i)},c=n=>{const i=t.get("SELECT * FROM orders WHERE id = ?",[n]);if(!i)throw new k("Order",n);return he(i)},l={calendars:{list(){return t.all("SELECT * FROM calendars ORDER BY sort_order, created_at").map(tt)},create(n){const i=(n.name??"").trim();if(!i)throw new p("Nazwij kalendarz, np. Zlecenia");const d=o.newId(),u=O(o.now()),E=t.get("SELECT MAX(sort_order) AS m FROM calendars");return t.run("INSERT INTO calendars (id, name, kind, icon, item_label, color, sort_order, space_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",[d,i.slice(0,40),ke(n.kind),ot(n.icon),(n.itemLabel??"").trim().slice(0,30)||"Zlecenie",n.color??null,(E?.m==null?0:A(E.m))+1,n.spaceId??null,u,u]),r(d)},update(n,i){const d=r(n),u=i.name===void 0?d.name:i.name.trim().slice(0,40);if(!u)throw new p("Nazwij kalendarz");const E=i.spaceId===void 0?d.spaceId:i.spaceId;for(const _ of[i.color,i.color2])if(_!=null&&!Ln.test(_))throw new p("Kolor: #RRGGBB");if(i.logo!=null&&(!/^data:image\/(png|jpeg|webp);base64,/.test(i.logo)||i.logo.length>9e4))throw new p("Logo: mały obrazek PNG/JPEG");const T=O(o.now());return e.tx(()=>{t.run("UPDATE calendars SET name = ?, kind = ?, icon = ?, item_label = ?, color = ?, space_id = ?, updated_at = ? WHERE id = ?",[u,i.kind===void 0?d.kind:ke(i.kind),i.icon===void 0?d.icon:ot(i.icon),i.itemLabel===void 0?d.itemLabel:i.itemLabel.trim().slice(0,30)||"Zlecenie",i.color===void 0?d.color:i.color,E,T,n]),(i.color2!==void 0||i.logo!==void 0)&&t.run("UPDATE calendars SET color2 = ?, logo = ?, updated_at = ? WHERE id = ?",[i.color2===void 0?d.color2:i.color2,i.logo===void 0?d.logo:i.logo,T,n]),i.leave!==void 0&&t.run("UPDATE calendars SET leave = ?, updated_at = ? WHERE id = ?",[pn(i.leave),T,n]),E!==d.spaceId&&(t.run("UPDATE orders SET space_id = ?, updated_at = ? WHERE calendar_id = ?",[E,T,n]),t.run("UPDATE class_slots SET space_id = ?, updated_at = ? WHERE calendar_id = ?",[E,T,n]))}),r(n)},reorder(n){const i=t.all("SELECT id, sort_order FROM calendars ORDER BY sort_order, created_at"),d=[...n.filter(E=>i.some(T=>T.id===E)),...i.map(E=>E.id).filter(E=>!n.includes(E))],u=O(o.now());return e.tx(()=>d.forEach((E,T)=>{A(i.find(_=>_.id===E).sort_order)!==T+1&&t.run("UPDATE calendars SET sort_order = ?, updated_at = ? WHERE id = ?",[T+1,u,E])})),l.calendars.list()},remove(n){r(n),e.tx(()=>{t.run("DELETE FROM orders WHERE calendar_id = ?",[n]),t.run("DELETE FROM class_slots WHERE calendar_id = ?",[n]),t.run("DELETE FROM calendars WHERE id = ?",[n])})}},classes:{list(n){return t.all("SELECT * FROM class_slots WHERE calendar_id = ? ORDER BY weekday, start_time",[n]).map(me)},create(n){const i=r(n.calendarId);at(n);const d=o.newId(),u=O(o.now());return t.run(`INSERT INTO class_slots (id, calendar_id, subject, form, weekday, start_time, end_time, room, teacher, every, color, space_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[d,i.id,n.subject.trim(),(n.form??"").trim(),n.weekday,n.startTime,n.endTime,(n.room??"").trim(),(n.teacher??"").trim(),n.every??"week",n.color??null,i.spaceId,u,u]),me(t.get("SELECT * FROM class_slots WHERE id = ?",[d]))},update(n,i){const d=t.get("SELECT * FROM class_slots WHERE id = ?",[n]);if(!d)throw new k("Class",n);const E={...me(d),...Object.fromEntries(Object.entries(i).filter(([,T])=>T!==void 0))};return at(E),t.run("UPDATE class_slots SET subject = ?, form = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, teacher = ?, every = ?, color = ?, updated_at = ? WHERE id = ?",[E.subject.trim(),E.form.trim(),E.weekday,E.startTime,E.endTime,E.room.trim(),E.teacher.trim(),E.every,E.color,O(o.now()),n]),me(t.get("SELECT * FROM class_slots WHERE id = ?",[n]))},remove(n){t.run("DELETE FROM class_slots WHERE id = ?",[n])}},get:c,list(n,i){return(i?t.all(`SELECT * FROM orders WHERE calendar_id = ? AND start_date < ? AND MAX(due_date, COALESCE(ship_date, due_date)) >= ?
           ORDER BY start_date, due_date`,[n,i.to,i.from]):t.all("SELECT * FROM orders WHERE calendar_id = ? ORDER BY due_date, start_date",[n])).map(he)},create(n){const i=r(n.calendarId),d=(n.title??"").trim();if(!d)throw new p("Wpisz, co to za zamówienie");const u=n.shipDate||null;nt(n.startDate,n.dueDate,u);const E=n.status??"new";if(!et.includes(E))throw new p("Nieznany status");const T=o.newId(),_=O(o.now());return t.run(`INSERT INTO orders (id, calendar_id, title, client, notes, start_date, due_date, ship_date, status, amount_minor, cost_minor, remind_days, tag, ship_method, tracking, space_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[T,i.id,d,(n.client??"").trim(),n.notes??"",n.startDate,n.dueDate,u,E,ue(n.amountMinor),ue(n.costMinor),it(n.remindDays),rt(n.tag),Ee(n.shipMethod,60),Ee(n.tracking,80),i.spaceId,_,_]),c(T)},update(n,i){const d=c(n),u=i.title===void 0?d.title:i.title.trim();if(!u)throw new p("Wpisz, co to za zamówienie");const E=i.startDate??d.startDate,T=i.dueDate??d.dueDate,_=i.shipDate===void 0?d.shipDate:i.shipDate||null;nt(E,T,_);const N=i.status??d.status;if(!et.includes(N))throw new p("Nieznany status");return t.run(`UPDATE orders SET title = ?, client = ?, notes = ?, start_date = ?, due_date = ?, ship_date = ?, status = ?, amount_minor = ?, cost_minor = ?,
           remind_days = ?, tag = ?, ship_method = ?, tracking = ?, updated_at = ? WHERE id = ?`,[u,i.client===void 0?d.client:i.client.trim(),i.notes??d.notes,E,T,_,N,i.amountMinor===void 0?d.amountMinor:ue(i.amountMinor),i.costMinor===void 0?d.costMinor:ue(i.costMinor),i.remindDays===void 0?d.remindDays:it(i.remindDays),i.tag===void 0?d.tag:rt(i.tag),i.shipMethod===void 0?d.shipMethod:Ee(i.shipMethod,60),i.tracking===void 0?d.tracking:Ee(i.tracking,80),O(o.now()),n]),c(n)},setStatus(n,i){return l.update(n,{status:i})},remove(n){c(n),t.run("DELETE FROM orders WHERE id = ?",[n])},withReminders(){return t.all("SELECT * FROM orders WHERE remind_days IS NOT NULL AND status NOT IN ('shipped', 'cancelled')").map(he)}};return l}const _e=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:A(e.size),width:e.width==null?null:A(e.width),height:e.height==null?null:A(e.height),createdAt:e.created_at}),De=e=>({..._e(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),Ie=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,yn=/^[0-9a-f]{64}$/;function An(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function gn(e,t){const{db:o,env:r}=e;function c(n){const i=n.sha256?.toLowerCase();if(!i||!yn.test(i))throw new p("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(n.size)||n.size<0)throw new p("Nieprawidłowy rozmiar pliku");const d=o.get("SELECT * FROM files WHERE sha256 = ?",[i]);if(d)return _e(d);const u=r.newId();return o.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[u,i,n.name.trim()||"plik",n.mime||"application/octet-stream",n.size,n.width??null,n.height??null,O(r.now())]),_e(o.get("SELECT * FROM files WHERE id = ?",[u]))}function l(n,i,d="attachment"){if(t.items.get(n),!o.get("SELECT 1 FROM files WHERE id = ?",[i]))throw new k("File",i);const u=o.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[n]),E=O(r.now());o.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[n,i,d,(u?.m==null?0:A(u.m))+1,E]),o.run("UPDATE items SET updated_at = ? WHERE id = ?",[E,n])}return{register:c,addToItem(n,i){return e.tx(()=>{const d=c(i);return l(n,d.id),De(o.get(`${Ie} WHERE x.item_id = ? AND x.file_id = ?`,[n,d.id]))})},addToFolder(n,i,d){return e.tx(()=>{n&&t.folders.get(n);const u=c(i),E=t.items.create({type:"note",title:d?.trim()||An(u.name),folderId:n});return l(E.id,u.id),t.items.get(E.id)})},detach(n,i){t.items.get(n),o.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[n,i]),o.run("UPDATE items SET updated_at = ? WHERE id = ?",[O(r.now()),n])},rename(n,i){if(!i.trim())throw new p("Nazwa pliku nie może być pusta");o.run("UPDATE files SET name = ? WHERE id = ?",[i.trim(),n]);const d=o.get("SELECT * FROM files WHERE id = ?",[n]);if(!d)throw new k("File",n);return _e(d)},forItem(n){return o.all(`${Ie} WHERE x.item_id = ? ORDER BY x.sort_order`,[n]).map(De)},forFolder(n,i={}){const d=["i.deleted_at IS NULL"],u=[];if(n===null)d.push("i.folder_id IS NULL");else if(i.includeSubfolders){const T=t.folders.descendantIds(n);d.push(`i.folder_id IN (${T.map(()=>"?").join(",")})`),u.push(...T)}else d.push("i.folder_id = ?"),u.push(n);i.imagesOnly&&d.push("f.mime LIKE 'image/%'");const E=i.limit&&i.limit>0?` LIMIT ${Math.floor(i.limit)}`:"";return o.all(`${Ie} WHERE ${d.join(" AND ")} ORDER BY x.created_at DESC, f.name${E}`,u).map(De)}}}function On(e){const{db:t,env:o}=e,r="i.deleted_at IS NULL AND i.recurrence IS NULL AND (i.status IS NULL OR i.status <> 'done')",c="i.deleted_at IS NULL AND i.recurrence IS NULL",l="(i.status IS NULL OR i.status <> 'done')";function n(d,u,E="i.due_at, i.priority DESC",T=50){return t.all(`${K} WHERE ${d} ORDER BY ${E} LIMIT ${T}`,u).map(J)}function i(d,u){const E=t.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${d}`,u);return Number(E?.c??0)}return{summary(){const d=o.now(),u=ne(d),E=U(u,1),T=U(u,8),_=Dt(d),N=`${r} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,R=[u,_],g=`${r} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,a=[u,E,_],s=`${c} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ? AND ${l})`,m=U(E,1),f=`${c} AND i.type = 'task' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?`,L=[E,m],w=`${c} AND i.type = 'event' AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.all_day = 0 AND i.start_at IS NULL AND i.due_at < ?)`,h=[u,T,_],D=`${u.slice(0,7)}-01`,[F,W]=u.split("-").map(Number),b=W===12?`${F+1}-01-01`:`${F}-${String(W+1).padStart(2,"0")}-01`,C=`${c} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,$=[D,b],ie=`${r} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,oe=[u,U(u,7)],re=t.all(`${K} WHERE i.deleted_at IS NULL AND i.recurrence IS NOT NULL
        AND i.due_at IS NOT NULL AND i.type IN ('task', 'event')`,[]).map(J),x=(S,se)=>re.length?ye(t,re,S,se):[],H=S=>S.status!=="done",y=S=>S.type==="task"&&H(S)&&!!S.dueAt&&(S.allDay||S.dueAt.length===10?S.dueAt<u:S.dueAt<_),I=x(u,E).filter(S=>S.type==="task"&&!(S.dueAt.length>10&&S.dueAt<_&&H(S))),v=x(E,m).filter(S=>S.type==="task"),$e=x(u,T).filter(S=>S.type==="event"&&!(S.dueAt.length>10&&!S.startAt&&S.dueAt<_)),xe=x(D,b).filter(S=>S.isPayment),Pe=x(U(u,-60),E).filter(y),At=x(u,U(u,7)).filter(S=>S.isPayment&&H(S)&&S.dueAt>=u),Z=(S,se)=>se.length?[...S,...se].sort((ge,Oe)=>(ge.dueAt??"")<(Oe.dueAt??"")?-1:(ge.dueAt??"")>(Oe.dueAt??"")?1:Oe.priority-ge.priority):S;return{overdue:Z(n(N,R),Pe),today:Z(n(s,a),I),tomorrow:Z(n(f,L),v),upcoming:Z(n(w,h),$e),paymentsMonth:Z(n(C,$,"i.due_at",200),xe),recentNotes:n("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:n("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:n("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:i(N,R)+Pe.length,today:i(g,a)+I.filter(H).length,tomorrow:v.filter(H).length+i(`${r} AND ${f.replace(`${c} AND `,"")}`,L),upcoming:i(w,h)+$e.length,paymentsMonth:i(`${C} AND ${l}`,$)+xe.filter(H).length,paymentsThisWeek:i(ie,oe)+At.length,notes:i("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:i("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const He="",Xe="";function Sn(e){const t=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(o=>o.trim()).filter(Boolean).slice(0,12);return t.length?t.map(o=>`"${o.replace(/"/g,"")}"*`).join(" "):null}const wn=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function hn(e,t){const o=/[\u0001\u0002]/g,r=e.replace(/^…/,"").replace(/…$/,""),c=r.replace(o,"");if(!c)return e;for(const l of t){const n=wn(l).indexOf(c);if(n<0)continue;const i=l.slice(n,n+c.length);let d="",u=0;for(const E of r)E===He||E===Xe?d+=E:d+=i[u++];return e.replace(r,d)}return e}const ft=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],B=e=>ft.reduce((t,[o,r])=>`replace(${t}, '${o}', '${r}')`,`coalesce(${e}, '')`),Fe=e=>ft.reduce((t,[o,r])=>t.split(o).join(r),e).toLowerCase();function Dn(e,t){const o=Fe(e);let r=-1,c=0;for(const i of t){const d=o.indexOf(i);d>=0&&(r<0||d<r)&&(r=d,c=i.length)}if(r<0)return e.slice(0,90);const l=Math.max(0,r-40),n=Math.min(e.length,r+c+60);return`${l>0?"…":""}${e.slice(l,r)}${He}${e.slice(r,r+c)}${Xe}${e.slice(r+c,n)}${n<e.length?"…":""}`}function In(e,t){const{db:o}=e;function r(c,l){const n=Fe(c).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!n.length)return[];const i=`(${B("i.title")} || ' ' || ${B("i.body_text")} || ' ' ||
      ${B("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${B("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return o.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${n.map(()=>`instr(lower(${i}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${B("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...n,n[0],l]).map(u=>({...u,snip:Dn(u.body_text||u.title,n)}))}return{fullText:()=>t.fullText,search(c,l=30){const n=Sn(c);if(!n)return[];const i=t.fullText?o.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${He}', '${Xe}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[n,l]):r(c,l),d=Fe(c.trim());return[...o.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${B("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[d]).map(E=>({kind:"folder",id:E.id,title:E.name,snippet:"",folderId:E.parent_id})),...i.map(E=>({kind:"item",id:E.id,title:E.title,snippet:hn(E.snip??"",[E.body_text,E.title]),itemType:E.type,folderId:E.folder_id}))]}}}function Cn(e){const{db:t}=e;return{list(){const o=t.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),r=t.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...o.map(c=>({kind:"item",id:c.id,title:c.title,deletedAt:c.deleted_at,itemType:c.type})),...r.map(c=>({kind:"folder",id:c.id,title:c.name,deletedAt:c.deleted_at}))].sort((c,l)=>l.deletedAt.localeCompare(c.deletedAt))}}}const Un={now:()=>new Date,newId:()=>crypto.randomUUID()};function vn(e,t={}){vt(e),Kt(e);const o=Zt(e,t.fullText!==!1),r={db:e,tx:Ut(e),env:t.env??Un},c=nn(r),l=It(r),n=on(r),i=rn(r,{tags:n,folders:l}),d=sn(r),u=En(r),E=mn(r),T=_n(r),_=fn(r),N=Rn(r),R=gn(r,{items:i,folders:l}),g=On(r),a=In(r,{fullText:o}),s=Cn(r);t.seed!==!1&&(c.seedDefaults(),t.seedFolders!==!1&&l.seedDefaults());const m={categories:{list:c.list,create:c.create,update:c.update,remove:c.remove},folders:{tree:l.tree,list:l.list,get:l.get,path:l.path,create:l.create,update:l.update,move:l.move,trash:l.trash,restore:l.restore,purge:l.purge,setSpace:l.setSpace},tags:{list:n.list,update:n.update,remove:n.remove},items:{get:i.get,create:i.create,update:i.update,setTags:i.setTags,setStatus:i.setStatus,paymentCheck:i.paymentCheck,toggleFavorite:i.toggleFavorite,markOpened:i.markOpened,move:i.move,trash:i.trash,restore:i.restore,purge:i.purge,query:i.query,setSpace:i.setSpace,occurrences:i.occurrences},calendars:{list:N.calendars.list,create:N.calendars.create,update:N.calendars.update,remove:N.calendars.remove,reorder:N.calendars.reorder},classes:{list:N.classes.list,create:N.classes.create,update:N.classes.update,remove:N.classes.remove},orders:{list:N.list,get:N.get,create:N.create,update:N.update,setStatus:N.setStatus,remove:N.remove},shopping:{lists:_.lists,createList:_.createList,renameList:_.renameList,setListSpace:_.setListSpace,removeList:_.removeList,items:_.items,add:_.add,setDone:_.setDone,rename:_.rename,remove:_.remove,clearBought:_.clearBought,suggestions:_.suggestions},vault:{meta:T.meta,createMeta:T.createMeta,list:T.list,save:T.save,remove:T.remove},goals:{list:E.list,get:E.get,create:E.create,update:E.update,step:(f,L)=>E.step(f,L),remove:E.remove},reminders:{forItem:u.forItem,set:u.set,due:u.due},files:{register:R.register,addToItem:R.addToItem,addToFolder:R.addToFolder,detach:R.detach,rename:R.rename,forItem:R.forItem,forFolder:R.forFolder},trash:{list:s.list,purge(f){return r.tx(()=>{let L=0;for(const w of f)try{w.kind==="item"?i.purge(w.id):l.purge(w.id),L++}catch{}return L})},empty(){return m.trash.purge(s.list().map(f=>({kind:f.kind,id:f.id})))}},dashboard:{summary:g.summary},search:{query:a.search,fullText:a.fullText},settings:{all:d.all,get:d.get,set:d.set}};return{api:m,close:()=>e.close()}}const Mn=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","folders.setSpace","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","items.setSpace","reminders.set","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set","trash.purge","trash.empty","goals.create","goals.update","goals.step","goals.remove","vault.createMeta","vault.save","vault.remove","shopping.createList","shopping.renameList","shopping.setListSpace","shopping.removeList","shopping.add","shopping.setDone","shopping.rename","shopping.remove","shopping.clearBought","calendars.create","calendars.update","calendars.remove","calendars.reorder","orders.create","orders.update","orders.setStatus","orders.remove","classes.create","classes.update","classes.remove"]);function kn(e,t){if(typeof t!="string")return null;const[o,r,...c]=t.split(".");if(!o||!r||c.length||!Object.prototype.hasOwnProperty.call(e,o))return null;const l=e[o];if(!Object.prototype.hasOwnProperty.call(l,r))return null;const n=l[r];return typeof n=="function"?n:null}function Fn(e,t,o){const r=kn(e,t);if(!r)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(t)}`}},mutated:!1};try{return{result:{ok:!0,value:r(...Array.isArray(o)?o:[])},mutated:Mn.has(t)}}catch(c){const l=c;return l.name!=="ValidationError"&&l.name!=="NotFoundError"&&console.error(`[core] ${String(t)} failed`,l),{result:{ok:!1,error:{name:l.name||"Error",message:l.message||String(c)}},mutated:!1}}}function bn(e,t){const o=new e.Database(t??null),r=l=>l.map(n=>typeof n=="bigint"?Number(n):n);function c(l,n,i){const d=o.prepare(l);try{n.length&&d.bind(r(n));const u=[];for(;d.step()&&(u.push(d.getAsObject()),!!i););return u}finally{d.free()}}return{exec:l=>{o.exec(l)},run:(l,n=[])=>(o.run(l,r(n)),{changes:o.getRowsModified()}),get:(l,n=[])=>c(l,n,!1)[0],all:(l,n=[])=>c(l,n,!0),close:()=>o.close(),exportBytes:()=>{const l=o.export();return o.exec("PRAGMA foreign_keys = ON;"),l}}}const Wn="notatnik",Ae="files",j="blobs";function Nt(){return new Promise((e,t)=>{const o=indexedDB.open(Wn,2);o.onupgradeneeded=()=>{const r=o.result.objectStoreNames;r.contains(Ae)||o.result.createObjectStore(Ae),r.contains(j)||o.result.createObjectStore(j)},o.onsuccess=()=>e(o.result),o.onerror=()=>t(o.error)})}async function fe(e,t=Ae){const o=await Nt();try{return await new Promise((r,c)=>{const l=o.transaction(t,"readonly").objectStore(t).get(e);l.onsuccess=()=>r(l.result?new Uint8Array(l.result):null),l.onerror=()=>c(l.error)})}finally{o.close()}}async function pt(e,t,o=Ae){const r=await Nt();try{await new Promise((c,l)=>{const n=r.transaction(o,"readwrite");n.objectStore(o).put(t.slice().buffer,e),n.oncomplete=()=>c(),n.onerror=()=>l(n.error),n.onabort=()=>l(n.error)})}finally{r.close()}}async function Hn(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function Xn(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const t=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(t)].map(o=>o.toString(16).padStart(2,"0")).join("")}function $n(e){const t=new Map,o=new Map;return{async put(r,c){const l=await Xn(r);return e()?await fe(l,j).catch(()=>null)||await pt(l,r,j):t.set(l,r),{sha256:l,size:r.byteLength}},async read(r){return t.get(r)??(e()?await fe(r,j).catch(()=>null):null)},async url(r,c){const l=o.get(r);if(l)return l;const n=t.get(r)??(e()?await fe(r,j).catch(()=>null):null);if(!n)return null;const i=URL.createObjectURL(new Blob([n.slice().buffer],{type:c||"application/octet-stream"}));return o.set(r,i),i}}}const be=e=>e.sharedId?[e.privateId,e.sharedId]:[e.privateId],xn=e=>typeof e=="bigint"?Number(e):e;function Lt(e,t){const o=t.split(Le);return[e.key.map(r=>`${r} = ?`).join(" AND "),e.key.map((r,c)=>o[c]??"")]}function Rt(e,t,o){const[r,c]=Lt(t,o),l=e.get(`SELECT * FROM ${t.name} WHERE ${r}`,c);if(!l)return;const n={};for(const[i,d]of Object.entries(l))n[i]=xn(d);return n}function yt(e,t,o){return e.get("SELECT space_id FROM items WHERE id = ?",[String(t)])?.space_id??o.privateId}function Pn(e,t,o,r){switch(t.scope){case"own":return[o.space_id??r.privateId];case"item":return[yt(e,o[t.itemCol],r)];case"all":return be(r);case"file":{const c=e.all("SELECT DISTINCT i.space_id AS s FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ?",[String(o.id)]).map(i=>i.s??r.privateId),l=new Set(be(r)),n=[...new Set(c)].filter(i=>l.has(i));return n.length?n:[r.privateId]}}}function zn(e){return Number(e.get("SELECT COUNT(*) AS n FROM sync_outbox")?.n??0)}function Bn(e,t,o=300){const r=e.all("SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at LIMIT ?",[o]),c=[];for(const l of r){const n=X.get(l.tbl);if(!n)continue;const i=Rt(e,n,l.id);if(!i){c.push({space_id:null,tbl:n.name,id:l.id,data:null,deleted:!0,stamp:l.changed_at,exclusive:!1});continue}const d=n.scope==="own"||n.scope==="item",u=new Set(be(t));for(const E of Pn(e,n,i,t).filter(T=>u.has(T)))c.push({space_id:E,tbl:n.name,id:l.id,data:i,deleted:!1,stamp:l.changed_at,exclusive:d}),n.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(i.sha256),E,"up",String(i.mime)])}return{entries:c,taken:r}}function Gn(e,t){e.exec("BEGIN");try{for(const o of t)e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?",[o.tbl,o.id,o.changed_at]);e.exec("COMMIT")}catch(o){throw e.exec("ROLLBACK"),o}}const dt=new WeakMap;function jn(e,t){let o=dt.get(e);o||dt.set(e,o=new Map);let r=o.get(t);return r||(r=new Set(e.all(`PRAGMA table_info(${t})`).map(c=>c.name)),o.set(t,r)),r}function Te(e,t,o){return e.get("SELECT local_id FROM sync_idmap WHERE tbl = ? AND remote_id = ?",[t,o])?.local_id??o}function Yn(e,t,o,r){return t.scope==="own"?o.space_id??r.privateId:t.scope==="item"?yt(e,o[t.itemCol],r):null}function Kn(e,t,o){if(!t.length)return 0;let r=0;e.exec("PRAGMA foreign_keys = OFF"),e.exec("BEGIN");try{e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");for(const c of t){e.exec("SAVEPOINT rec");try{r+=Jn(e,c,o),e.exec("RELEASE rec")}catch(l){e.exec("ROLLBACK TO rec; RELEASE rec")}}e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'"),e.exec("COMMIT")}catch(c){throw e.exec("ROLLBACK"),c}finally{e.exec("PRAGMA foreign_keys = ON")}return r}function Jn(e,t,o){let r=0;const c=X.get(t.tbl);if(!c)return 0;const l=t.id.split(Le),n=c.key.map((s,m)=>{const f=l[m]??"";return c.refs?.[s]?Te(e,c.refs[s],f):c.mergeBy?Te(e,c.name,f):f}),i=n.join(Le),d=e.get("SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?",[c.name,i]);if(d&&d.changed_at>t.stamp)return r;const u=Rt(e,c,i);if(t.deleted||!t.data){if(!u)return r;const s=Yn(e,c,u,o);if(s!==null&&s!==t.space_id)return r;const[m,f]=Lt(c,i);return r+=e.run(`DELETE FROM ${c.name} WHERE ${m}`,f).changes,d&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[c.name,i]),r}const E={...t.data},T=t.space_id===o.privateId?null:t.space_id,_=c.name!=="folders"||E.parent_id==null&&E.deleted_at==null;if(c.mergeBy&&!u&&_){const s=c.mergeBy,m=e.get(`SELECT id FROM ${c.name} WHERE ${s.col} = ?${s.nocase?" COLLATE NOCASE":""}${s.where?` AND ${s.where}`:""}${s.sameSpace?" AND space_id IS ?":""} AND id <> ? LIMIT 1`,s.sameSpace?[String(E[s.col]),T,String(E.id)]:[String(E[s.col]),String(E.id)]);if(m)return e.run("INSERT OR REPLACE INTO sync_idmap (tbl, remote_id, local_id) VALUES (?, ?, ?)",[c.name,String(E.id),m.id]),r}for(const[s,m]of Object.entries(c.refs??{}))typeof E[s]=="string"&&(E[s]=Te(e,m,E[s]));if(c.name==="folders"&&E.item_defaults)try{const s=typeof E.item_defaults=="string"?JSON.parse(E.item_defaults):E.item_defaults;s&&typeof s.categoryId=="string"&&(E.item_defaults=JSON.stringify({...s,categoryId:Te(e,"categories",s.categoryId)}))}catch{}if(c.key.forEach((s,m)=>{E[s]=n[m]}),c.scope==="own"&&(E.space_id=T),u&&typeof u.updated_at=="string"&&typeof E.updated_at=="string"&&u.updated_at>E.updated_at)return r;const N=Object.keys(E).filter(s=>jn(e,c.name).has(s)&&!(c.localOnly??[]).includes(s)),R=N.map(s=>{const m=E[s];return m===void 0?null:typeof m=="object"&&m!==null?JSON.stringify(m):m}),g=N.filter(s=>!c.key.includes(s)),a=g.length?`DO UPDATE SET ${g.map(s=>`${s} = excluded.${s}`).join(", ")}`:"DO NOTHING";return r+=e.run(`INSERT INTO ${c.name} (${N.join(", ")}) VALUES (${N.map(()=>"?").join(", ")}) ON CONFLICT(${c.key.join(", ")}) ${a}`,R).changes,d&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[c.name,i]),c.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(E.sha256),t.space_id,"down",String(E.mime)]),r}function Vn(e,t,o){const r=t?.sharedId&&t.sharedId!==o.sharedId?t.sharedId:null;e.exec("BEGIN");try{if(r){e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");const c="SELECT id FROM items WHERE space_id = ?";for(const l of pe)l.scope==="item"&&e.run(`DELETE FROM sync_outbox WHERE tbl = ? AND id IN (SELECT ${Re(l,l.name)} FROM ${l.name} WHERE ${l.itemCol} IN (${c}))`,[l.name,r]);e.run(`DELETE FROM sync_outbox WHERE tbl = 'items' AND id IN (${c})`,[r]),e.run("DELETE FROM sync_outbox WHERE tbl = 'folders' AND id IN (SELECT id FROM folders WHERE space_id = ?)",[r]),e.run("DELETE FROM items WHERE space_id = ?",[r]),e.run("DELETE FROM folders WHERE space_id = ?",[r]),e.run("DELETE FROM sync_outbox WHERE tbl = 'goals' AND id IN (SELECT id FROM goals WHERE space_id = ?)",[r]),e.run("DELETE FROM goals WHERE space_id = ?",[r]);for(const l of["orders","class_slots","calendars"])e.run(`DELETE FROM sync_outbox WHERE tbl = '${l}' AND id IN (SELECT id FROM ${l} WHERE space_id = ?)`,[r]),e.run(`DELETE FROM ${l} WHERE space_id = ?`,[r]);e.run("DELETE FROM sync_blobs WHERE space_id = ?",[r]),e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'")}V(e,"spaces",JSON.stringify(o)),V(e,"cursor",null),e.exec("COMMIT")}catch(c){throw e.exec("ROLLBACK"),c}}function We(e,t){return e.get("SELECT value FROM sync_state WHERE key = ?",[t])?.value??null}function V(e,t,o){o===null?e.run("DELETE FROM sync_state WHERE key = ?",[t]):e.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",[t,o])}const Zn=50,ct=500,Qn=8;async function qn(e,t,o,r){for(let i=0;i<100;i++){const{entries:d,taken:u}=Bn(e,t);if(!u.length)break;d.length&&await o.push(d),Gn(e,u)}let c=0,l=Number(We(e,"cursor")??0);for(let i=0;i<200;i++){const d=Math.max(0,l-(i===0?Zn:0)),u=await o.pull(d,ct);if(!u.length)break;c+=Kn(e,u,t);const E=Math.max(...u.map(T=>T.rev));if(E>l&&(l=E,V(e,"cursor",String(l))),u.length<ct)break}const n=e.all("SELECT * FROM sync_blobs WHERE tries < 40 ORDER BY dir DESC, tries LIMIT ?",[Qn]);for(const i of n)try{let d=!1;if(i.dir==="up"){const u=await r.read(i.sha256);u&&await o.upload(i.space_id,i.sha256,u,i.mime),d=!0}else if(await r.read(i.sha256))d=!0;else{const u=await o.download(i.space_id,i.sha256);u&&(await r.write(u,i.mime),d=!0,c++)}d?e.run("DELETE FROM sync_blobs WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir]):e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir])}catch{e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[i.sha256,i.space_id,i.dir])}return c}class M extends Error{constructor(t,o=0,r=!1){super(t),this.status=o,this.offline=r}}const Ce=e=>({accessToken:e.access_token,refreshToken:e.refresh_token,expiresAt:Date.now()+e.expires_in*1e3,userId:e.user.id,email:e.user.email});function ei(e,t){const o=t.msg??t.message??t.error_description??"",r=t.error_code??t.code??"";return r==="invalid_credentials"||/invalid login credentials/i.test(o)?"Nieprawidłowy e-mail lub hasło.":r==="user_already_exists"||/already registered/i.test(o)?"To konto już istnieje — zaloguj się.":r==="weak_password"||/password should be/i.test(o)?"Hasło jest za krótkie (minimum 6 znaków).":/database error saving new user|nie ma zaproszenia/i.test(o)||r==="unexpected_failure"?"Ten adres e-mail nie ma zaproszenia do Notario.":r==="validation_failed"||/email/i.test(o)&&e===400?"Sprawdź adres e-mail.":e===429?"Za dużo prób. Spróbuj za chwilę.":o||`Błąd serwera (${e}).`}function ti(e,t){let o=t.load(),r=null;async function c(T,_={}){const N=new Headers(_.headers);N.set("apikey",e.key),_.auth!==!1&&N.set("Authorization",`Bearer ${await i()}`);let R;try{R=await fetch(`${e.url}${T}`,{..._,headers:N})}catch{throw new M("Brak połączenia z internetem.",0,!0)}return R}async function l(T,_){const N=await c(T,{method:"POST",auth:!1,headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}),R=await N.json().catch(()=>({}));if(!N.ok)throw new M(ei(N.status,R),N.status);return R}function n(T){o=T,t.save(T)}async function i(){if(!o)throw new M("Nie zalogowano.",401);return o.expiresAt-Date.now()>6e4?o.accessToken:(r??(r=(async()=>{try{const T=await l("/auth/v1/token?grant_type=refresh_token",{refresh_token:o.refreshToken}),_=Ce(T);return n(_),_}catch(T){throw T instanceof M&&(T.status===400||T.status===401)&&n(null),T}finally{r=null}})()),(await r).accessToken)}async function d(T){if(T.status===401)throw new M("Sesja wygasła. Zaloguj się ponownie.",401);if(!T.ok){const N=await T.text().catch(()=>"");throw new M(`Serwer odrzucił zapytanie (${T.status}) ${N.slice(0,200)}`,T.status)}const _=await T.text();return _?JSON.parse(_):null}const u=async(T,_)=>d(await c(`/rest/v1/rpc/${T}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}));return{transport:{async push(T){await u("push_records",{changes:T})},async pull(T,_){const N=`select=space_id,tbl,id,data,deleted,stamp,rev&rev=gt.${T}&order=rev.asc&limit=${_}`;return d(await c(`/rest/v1/records?${N}`))},async upload(T,_,N,R){const g=await c(`/storage/v1/object/blobs/${T}/${_}`,{method:"POST",headers:{"Content-Type":R||"application/octet-stream"},body:N.slice().buffer});if(g.ok||g.status===409)return;const a=await g.text().catch(()=>"");if(!(g.status===400&&/exists|duplicate/i.test(a)))throw new M(`Nie udało się wysłać pliku (${g.status}).`,g.status)},async download(T,_){const N=await c(`/storage/v1/object/authenticated/blobs/${T}/${_}`);if(N.status===404||N.status===400)return null;if(!N.ok)throw new M(`Nie udało się pobrać pliku (${N.status}).`,N.status);return new Uint8Array(await N.arrayBuffer())}},rpc:u,session:()=>o,async signIn(T,_){const N=await l("/auth/v1/token?grant_type=password",{email:T.trim(),password:_}),R=Ce(N);return n(R),R},async signUp(T,_){const N=await l("/auth/v1/signup",{email:T.trim(),password:_});if("access_token"in N&&N.access_token){const R=Ce(N);return n(R),R}return this.signIn(T,_)},async deleteAccount(T){if(!o)throw new M("Nie zalogowano.",401);await this.signIn(o.email,T);const _=await c("/functions/v1/delete-account",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}),N=await _.json().catch(()=>({}));if(!_.ok)throw new M(N.error??`Nie udało się usunąć konta (${_.status}).`,_.status);n(null)},async signOut(){const T=o;n(null),T&&await fetch(`${e.url}/auth/v1/logout`,{method:"POST",headers:{apikey:e.key,Authorization:`Bearer ${T.accessToken}`}}).catch(()=>{})},async spaces(){const T=await u("my_spaces",{}),_=T.find(N=>N.kind==="private");if(!_)throw new M("Konto nie ma jeszcze swojej przestrzeni na serwerze.");return{privateId:_.id,sharedId:T.find(N=>N.kind==="shared")?.id??null}}}}function ni(e){const t=/"message"\s*:\s*"([^"]+)"/.exec(e);return t?t[1]:e.replace(/^Serwer odrzucił zapytanie \(\d+\)\s*/,"")}function ii(e){const t=ti(e.config,e.store),o=new Set;let r=t.session()?"idle":"off",c=null,l=null,n=null,i=!1,d;function u(){const s=We(e.db,"spaces");return s?JSON.parse(s):null}function E(){const s=t.session();return{signedIn:!!s,email:s?.email??null,state:s?r:"off",error:c,lastSyncAt:l,pending:zn(e.db),sharedSpaceId:s?u()?.sharedId??null:null}}const T=()=>{const s=E();o.forEach(m=>m(s))};async function _(){const s=t.session();if(!s){r="off";return}r="syncing",T();try{We(e.db,"user")!==s.userId&&(V(e.db,"user",s.userId),V(e.db,"cursor",null),V(e.db,"spaces",null));const m=u(),f=await t.spaces();(!m||m.privateId!==f.privateId||m.sharedId!==f.sharedId)&&(Vn(e.db,m,f),e.onRemoteChange());const L=await qn(e.db,f,t.transport,e.blobs);e.onDbWritten(),L>0&&e.onRemoteChange(),r="idle",c=null,l=Date.now()}catch(m){const f=m;r=f.offline?"offline":"error",c=f.offline?null:f.message,t.session()||(r="off"),e.onDbWritten()}T()}async function N(s,m){try{await t.rpc(s,m)}catch(f){throw new M(ni(f.message))}await R()}function R(){return clearTimeout(d),n?(i=!0,n):(n=(async()=>{do i=!1,await _();while(i)})().finally(()=>{n=null}),n)}function g(s=1200){t.session()&&(clearTimeout(d),d=setTimeout(()=>void R(),s))}const a=setInterval(()=>{t.session()&&e.visible()&&!n&&R()},e.pollMs??5e3);return{status:E,syncNow:R,schedule:g,onStatus(s){return o.add(s),()=>o.delete(s)},async signIn(s,m){return await t.signIn(s,m),c=null,await R(),E()},async signUp(s,m){return await t.signUp(s,m),c=null,await R(),E()},async signOut(){return await t.signOut(),r="off",c=null,T(),E()},async deleteAccount(s){await t.deleteAccount(s),r="off",c=null,T()},stop(){clearInterval(a),clearTimeout(d)},async savePush(s){await t.rpc("save_push_subscription",{p_endpoint:s.endpoint,p_p256dh:s.p256dh,p_auth:s.auth,p_tz:s.tz})},family:{info:()=>t.rpc("family_info",{}),invite:s=>N("family_invite",{p_email:s}),cancelInvite:s=>N("family_cancel_invite",{p_id:s}),declineInvite:s=>N("family_decline_invite",{p_id:s}),removeMember:s=>N("family_remove_member",{p_user:s}),leave:()=>N("family_leave",{}),async acceptInvite(s,m){await N("family_accept_invite",{p_id:s,p_bring:m}),e.db.run("INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM files"),e.onDbWritten()}}}}const lt="notatnik.sqlite",Ue="notario.session",oi=400;async function si(e){const t=await e(),o={persistent:!1};let r=null;try{r=await fe(lt),o.persistent=!0}catch{o.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const c=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;o.persistent&&!await Hn()&&!c&&(o.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const l=bn(t,r),n=vn(l);let i=!r,d,u=Promise.resolve(),E=!1;const T=()=>{if(clearTimeout(d),E||!i||!o.persistent)return u;i=!1;const m=l.exportBytes();return u=u.then(()=>pt(lt,m)).then(()=>{o.lastSavedAt=Date.now()}).catch(f=>{i=!0,console.error("Saving database failed",f),o.note="Nie udało się zapisać danych w pamięci przeglądarki."}),u},_=()=>{i=!0,clearTimeout(d),d=setTimeout(T,oi)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&T()}),window.addEventListener("pagehide",()=>void T()),i&&_();const N=new Set,R=m=>{const f={method:m,at:Date.now()};queueMicrotask(()=>N.forEach(L=>L(f)))},g=$n(()=>o.persistent),a=ii({db:l,config:Ct,store:{load(){try{return JSON.parse(localStorage.getItem(Ue)??"null")}catch{return null}},save(m){try{m?localStorage.setItem(Ue,JSON.stringify(m)):localStorage.removeItem(Ue)}catch{}}},blobs:{read:m=>g.read(m),write:async(m,f)=>{await g.put(m,f)}},onDbWritten:_,onRemoteChange:()=>R("sync.pull"),visible:()=>document.visibilityState==="visible"&&navigator.onLine!==!1});window.addEventListener("online",()=>void a.syncNow()),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&a.syncNow()}),a.syncNow();const s={async call(m,f){const{result:L,mutated:w}=Fn(n.api,m,f);return w&&(_(),R(m),a.schedule()),L.ok?{ok:!0,value:L.value===void 0?void 0:structuredClone(L.value)}:L},onChanged(m){return N.add(m),()=>N.delete(m)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...o}),blobs:g,sync:{status:a.status,onStatus:a.onStatus,signIn:a.signIn,signUp:a.signUp,signOut:a.signOut,async deleteAccount(m){await a.deleteAccount(m),E=!0,clearTimeout(d),a.stop();try{for(const f of Object.keys(localStorage))(f.startsWith("notario.")||f.startsWith("notatnik"))&&localStorage.removeItem(f)}catch{}await new Promise(f=>{const L=indexedDB.deleteDatabase("notatnik");L.onsuccess=L.onerror=L.onblocked=()=>f()})},syncNow:a.syncNow,family:a.family,savePush:a.savePush}};window.bridge=s}export{si as installWebBridge};
