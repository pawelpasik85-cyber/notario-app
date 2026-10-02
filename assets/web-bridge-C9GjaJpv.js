function De(e){let t=0;return function(n){const d=`sp_${t}`;e.exec(t===0?"BEGIN IMMEDIATE":`SAVEPOINT ${d}`),t++;try{const l=n();return t--,e.exec(t===0?"COMMIT":`RELEASE ${d}`),l}catch(l){throw t--,e.exec(t===0?"ROLLBACK":`ROLLBACK TO ${d}; RELEASE ${d}`),l}}}function Ce(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const j=[{name:"categories",key:["id"],scope:"all",mergeBy:{col:"name",where:"deleted_at IS NULL",nocase:!0}},{name:"tags",key:["id"],scope:"all",mergeBy:{col:"name",nocase:!0}},{name:"folders",key:["id"],scope:"own",refs:{category_id:"categories",parent_id:"folders"},mergeBy:{col:"name",where:"parent_id IS NULL AND deleted_at IS NULL",nocase:!0,sameSpace:!0}},{name:"items",key:["id"],scope:"own",refs:{category_id:"categories",folder_id:"folders"},localOnly:["opened_at"]},{name:"files",key:["id"],scope:"file",mergeBy:{col:"sha256"}},{name:"payments",key:["item_id"],scope:"item",itemCol:"item_id"},{name:"occurrence_states",key:["item_id","occurrence_key"],scope:"item",itemCol:"item_id"},{name:"checklist_items",key:["id"],scope:"item",itemCol:"item_id"},{name:"item_tags",key:["item_id","tag_id"],scope:"item",itemCol:"item_id",refs:{tag_id:"tags"}},{name:"item_links",key:["from_item_id","to_item_id","relation"],scope:"item",itemCol:"from_item_id"},{name:"item_files",key:["item_id","file_id"],scope:"item",itemCol:"item_id",refs:{file_id:"files"}},{name:"reminder_rules",key:["id"],scope:"item",itemCol:"item_id"}],Ne=new Map(j.map(e=>[e.name,e])),Y="|",B=(e,t)=>e.key.map(i=>`${t}.${i}`).join(` || '${Y}' || `),$="strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",x="(SELECT value FROM sync_state WHERE key = 'applying') = '0'",Ue=["type","title","body_json","body_text","folder_id","parent_item_id","category_id","status","priority","favorite","pinned","sort_order","start_at","due_at","all_day","recurrence","completed_at","trashed_with","created_at","updated_at","deleted_at","space_id"];function ve(){const e=[`
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
`];for(const i of j){const n=l=>`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${i.name}', ${B(i,l)}, ${$});`,d=i.name==="items"?` OF ${Ue.filter(l=>!(i.localOnly??[]).includes(l)).join(", ")}`:"";e.push(`
CREATE TRIGGER sync_${i.name}_ai AFTER INSERT ON ${i.name} WHEN ${x} BEGIN ${n("new")} END;
CREATE TRIGGER sync_${i.name}_au AFTER UPDATE${d} ON ${i.name} WHEN ${x} BEGIN ${n("new")} END;
CREATE TRIGGER sync_${i.name}_ad AFTER DELETE ON ${i.name} WHEN ${x} BEGIN ${n("old")} END;`),e.push(`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${i.name}', ${B(i,i.name)}, ${$} FROM ${i.name};`)}e.push(`
CREATE TRIGGER sync_item_files_file_ai AFTER INSERT ON item_files WHEN ${x} BEGIN
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('files', new.file_id, ${$});
END;`);const t=j.filter(i=>i.scope==="item");return e.push(`
CREATE TRIGGER sync_items_space_au AFTER UPDATE OF space_id ON items WHEN ${x} BEGIN
${t.map(i=>`  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${i.name}', ${B(i,i.name)}, ${$} FROM ${i.name} WHERE ${i.itemCol} = new.id;`).join(`
`)}
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', file_id, ${$} FROM item_files WHERE item_id = new.id;
END;`),e.join(`
`)}const h=e=>`replace(replace(${e}, 'ł', 'l'), 'Ł', 'L')`,F=e=>h(`
  coalesce((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = ${e}), '')
  || ' ' ||
  coalesce((SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id
            WHERE x.item_id = ${e}), '')`),Fe=[{version:1,name:"initial schema",sql:`
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

`},{version:2,name:"sync: spaces and change log",sql:ve()}],Me=`
-- Full-text search ------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(
  item_id UNINDEXED,
  title,
  body,
  extra,                                          -- tag names + attachment file names
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (item_id, title, body, extra) VALUES (new.id, ${h("new.title")}, ${h("new.body_text")}, '');
END;
CREATE TRIGGER items_fts_au AFTER UPDATE OF title, body_text ON items BEGIN
  UPDATE items_fts SET title = ${h("new.title")}, body = ${h("new.body_text")} WHERE item_id = new.id;
END;
CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE item_id = old.id;
END;
CREATE TRIGGER item_tags_fts_ai AFTER INSERT ON item_tags BEGIN
  UPDATE items_fts SET extra = ${F("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_tags_fts_ad AFTER DELETE ON item_tags BEGIN
  UPDATE items_fts SET extra = ${F("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER item_files_fts_ai AFTER INSERT ON item_files BEGIN
  UPDATE items_fts SET extra = ${F("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_files_fts_ad AFTER DELETE ON item_files BEGIN
  UPDATE items_fts SET extra = ${F("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER tags_fts_au AFTER UPDATE OF name ON tags BEGIN
  UPDATE items_fts SET extra = ${F("items_fts.item_id")}
  WHERE item_id IN (SELECT item_id FROM item_tags WHERE tag_id = new.id);
END;
`,be=`
DELETE FROM items_fts;
INSERT INTO items_fts (item_id, title, body, extra)
  SELECT i.id, ${h("i.title")}, ${h("i.body_text")}, ${F("i.id")} FROM items i;
`;function ke(e,t=Fe){const i=e.get("PRAGMA user_version"),n=Number(i?.user_version??0),d=[],l=[...t].sort((o,a)=>o.version-a.version).filter(o=>o.version>n);for(const o of l){e.exec("BEGIN IMMEDIATE");try{e.exec(o.sql),e.exec(`PRAGMA user_version = ${o.version}`),e.exec("COMMIT"),d.push(o.version)}catch(a){throw e.exec("ROLLBACK"),new Error(`Migration ${o.version} (${o.name}) failed: ${a.message}`)}}return d}function $e(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function xe(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function He(e,t=!0){if(xe(e))return!0;if(!t||!$e(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(Me),e.exec(be),e.exec("COMMIT"),!0}catch(i){throw e.exec("ROLLBACK"),i}}class y extends Error{constructor(t){super(t),this.name="ValidationError"}}class I extends Error{constructor(t,i){super(`${t} not found: ${i}`),this.name="NotFoundError"}}const D=e=>e===1||e===1n||e===!0,A=e=>typeof e=="bigint"?Number(e):e;function K(e){if(e==null||e==="")return null;try{return JSON.parse(String(e))}catch{return null}}function Le(e,t,i,n){const d=e.db.get(`SELECT MAX(sort_order) AS m FROM ${t} WHERE ${i}`,n);return(d?.m==null?0:A(d.m))+1}const k=(e,t=2)=>String(e).padStart(t,"0"),We=/^(\d{4})-(\d{2})-(\d{2})$/,Pe=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;function ne(e){const t=We.exec(e);return!!t&&pe(+t[1],+t[2],+t[3])}function Xe(e){const t=Pe.exec(e);return!!t&&pe(+t[1],+t[2],+t[3])&&+t[4]<24&&+t[5]<60}function Be(e){return ne(e)||Xe(e)}function pe(e,t,i){return t>=1&&t<=12&&i>=1&&i<=Ge(e,t)}function Ge(e,t){return new Date(Date.UTC(e,t,0)).getUTCDate()}function Re(e){return`${e.getFullYear()}-${k(e.getMonth()+1)}-${k(e.getDate())}`}function ze(e){return`${Re(e)}T${k(e.getHours())}:${k(e.getMinutes())}`}function W(e,t){const[i,n,d]=e.split("-").map(Number),l=new Date(Date.UTC(i,n-1,d+t));return`${l.getUTCFullYear()}-${k(l.getUTCMonth()+1)}-${k(l.getUTCDate())}`}function R(e){return e.toISOString()}const le=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:A(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),je=/^#[0-9a-fA-F]{6}$/,Ye=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}];function Ke(e){const{db:t,env:i}=e;function n(o){const a=t.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[o]);if(!a)throw new I("Category",o);return le(a)}function d(o,a){if(o!==void 0&&!o.trim())throw new y("Nazwa kategorii nie może być pusta");if(a!==void 0&&!je.test(a))throw new y("Kolor musi mieć format #RRGGBB")}function l(o){d(o.name,o.color);const a=i.newId(),u=R(i.now());return t.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[a,o.name.trim(),o.color,o.icon??null,Le(e,"categories","deleted_at IS NULL",[]),u,u]),n(a)}return{create:l,list(){return t.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(le)},get:n,update(o,a){const u=n(o);return d(a.name,a.color),t.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[a.name?.trim()??u.name,a.color??u.color,a.icon===void 0?u.icon:a.icon,a.sortOrder??u.sortOrder,R(i.now()),o]),n(o)},remove(o){n(o),e.tx(()=>{const a=R(i.now());t.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[a,o]),t.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[a,o]),t.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[a,a,o])})},seedDefaults(){const o=t.get("SELECT COUNT(*) AS c FROM categories");if(!(A(o?.c??0)>0))for(const a of Ye)l(a)}}}const V=e=>({id:e.id,parentId:e.parent_id,spaceId:e.space_id??null,kind:e.kind,name:e.name,icon:e.icon,color:e.color,description:e.description,categoryId:e.category_id,sortOrder:A(e.sort_order),calendarSync:D(e.calendar_sync),itemDefaults:K(e.item_defaults),settings:K(e.settings),createdAt:e.created_at,updatedAt:e.updated_at,deletedAt:e.deleted_at}),Je=[{name:"Praca",color:"#3B82F6",icon:"briefcase",category:"Praca"},{name:"Dom",color:"#F97316",icon:"home",category:"Dom"},{name:"Finanse",color:"#22C55E",icon:"wallet",category:"Płatności"},{name:"Podróże",color:"#A855F7",icon:"plane"},{name:"Pomysły",color:"#EC4899",icon:"lightbulb"},{name:"Rozwój",color:"#EAB308",icon:"book"}],Ve=`
  WITH RECURSIVE sub(id) AS (
    SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
  ) SELECT id FROM sub`;function Qe(e){const{db:t,env:i}=e;function n(s){const E=t.get("SELECT * FROM folders WHERE id = ?",[s]);return E?V(E):null}function d(s,E){const m=o(s),_=m.map(()=>"?").join(","),f=R(i.now());t.run(`UPDATE folders SET space_id = ?, updated_at = ? WHERE id IN (${_}) AND space_id IS NOT ?`,[E,f,...m,E]),t.run(`UPDATE items SET space_id = ?, updated_at = ? WHERE folder_id IN (${_}) AND space_id IS NOT ?`,[E,f,...m,E])}function l(s){const E=n(s);if(!E||E.deletedAt)throw new I("Folder",s);return E}function o(s){return t.all(Ve,[s]).map(E=>E.id)}function a(s){s&&l(s)}function u(s){return s===null?["parent_id IS NULL AND deleted_at IS NULL",[]]:["parent_id = ? AND deleted_at IS NULL",[s]]}return{get:l,find:n,descendantIds:o,list(){return t.all("SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order, name").map(V)},tree(){const s=t.all(`
        SELECT f.*,
          (SELECT COUNT(*) FROM items i WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS item_count,
          (SELECT fl.sha256 FROM items i JOIN item_files x ON x.item_id = i.id JOIN files fl ON fl.id = x.file_id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL AND fl.mime LIKE 'image/%'
            ORDER BY x.created_at DESC LIMIT 1) AS cover_sha,
          (SELECT COUNT(*) FROM items i JOIN item_files x ON x.item_id = i.id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS file_count
        FROM folders f WHERE f.deleted_at IS NULL ORDER BY f.sort_order, f.name`),E=new Map;for(const _ of s)E.set(_.id,{...V(_),children:[],itemCount:A(_.item_count),coverSha:_.cover_sha??null,fileCount:A(_.file_count)});const m=[];for(const _ of E.values()){const f=_.parentId?E.get(_.parentId):void 0;(f?f.children:m).push(_)}return m},path(s){const E=[];let m=l(s);const _=new Set;for(;m&&!_.has(m.id);)_.add(m.id),E.unshift(m),m=m.parentId?n(m.parentId):null;return E},seedDefaults(){t.get("SELECT 1 AS x FROM settings WHERE key = ?",["seed.folders"])||e.tx(()=>{for(const s of Je){if(t.get("SELECT 1 AS x FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL AND name = ? COLLATE NOCASE",[s.name]))continue;const m=s.category?t.get("SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL",[s.category]):void 0;this.create({name:s.name,color:s.color,icon:s.icon,itemDefaults:m?{categoryId:m.id}:null})}t.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",["seed.folders","true",R(i.now())])})},create(s){const E=s.name?.trim();if(!E)throw new y("Nazwa folderu nie może być pusta");const m=s.parentId??null;a(m);const _=i.newId(),f=R(i.now()),[r,c]=u(m);return t.run(`INSERT INTO folders (id, parent_id, kind, name, icon, color, description, category_id, sort_order,
           calendar_sync, item_defaults, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[_,m,s.kind??"folder",E,s.icon??null,s.color??null,s.description??"",s.categoryId??null,Le(e,"folders",r,c),s.calendarSync===!1?0:1,s.itemDefaults?JSON.stringify(s.itemDefaults):null,f,f]),l(_)},update(s,E){const m=l(s);if(E.name!==void 0&&!E.name.trim())throw new y("Nazwa folderu nie może być pusta");return t.run(`UPDATE folders SET kind = ?, name = ?, icon = ?, color = ?, description = ?, category_id = ?,
           calendar_sync = ?, item_defaults = ?, settings = ?, updated_at = ? WHERE id = ?`,[E.kind??m.kind,E.name?.trim()??m.name,E.icon===void 0?m.icon:E.icon,E.color===void 0?m.color:E.color,E.description??m.description,E.categoryId===void 0?m.categoryId:E.categoryId,E.calendarSync??m.calendarSync?1:0,JSON.stringify(E.itemDefaults===void 0?m.itemDefaults:E.itemDefaults),JSON.stringify(E.settings===void 0?m.settings:E.settings),R(i.now()),s]),l(s)},move(s,E,m){if(l(s),E!==null&&(a(E),o(s).includes(E)))throw new y("Nie można przenieść folderu do jego podfolderu");return e.tx(()=>{const[_,f]=u(E),r=t.all(`SELECT id FROM folders WHERE ${_} AND id <> ? ORDER BY sort_order, name`,[...f,s]).map(T=>T.id),c=m===void 0?r.length:Math.max(0,Math.min(m,r.length));r.splice(c,0,s);const L=R(i.now());t.run("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?",[E,L,s]),r.forEach((T,N)=>t.run("UPDATE folders SET sort_order = ? WHERE id = ?",[N+1,T])),E!==null&&d(s,l(E).spaceId)}),l(s)},setSpace(s,E){return l(s),e.tx(()=>d(s,E)),l(s)},trash(s){l(s),e.tx(()=>{const E=R(i.now()),m=o(s),_=m.map(()=>"?").join(",");t.run(`UPDATE items SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE folder_id IN (${_}) AND deleted_at IS NULL`,[E,s,E,...m]),t.run(`UPDATE folders SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE id IN (${_}) AND deleted_at IS NULL`,[E,s,E,...m])})},restore(s){const E=n(s);if(!E)throw new I("Folder",s);return e.tx(()=>{const m=R(i.now());t.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[m,s]),t.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[m,s]),t.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE id = ?",[m,s]);const _=E.parentId?n(E.parentId):null;E.parentId&&(!_||_.deletedAt)&&t.run("UPDATE folders SET parent_id = NULL WHERE id = ?",[s])}),l(s)},purge(s){const E=n(s);if(E){if(!E.deletedAt)throw new y("Najpierw przenieś folder do kosza");e.tx(()=>{t.run("DELETE FROM items WHERE trashed_with = ?",[s]);const m=o(s),_=m.map(()=>"?").join(",");t.run(`UPDATE items SET folder_id = NULL WHERE folder_id IN (${_})`,m),t.run("DELETE FROM folders WHERE id = ?",[s])})}}}}const P=e=>({id:e.id,name:e.name,color:e.color});function Q(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function Ze(e){const{db:t,env:i}=e;function n(o){const a=t.get("SELECT id, name, color FROM tags WHERE id = ?",[o]);if(!a)throw new I("Tag",o);return P(a)}function d(o){const a=Q(o);if(!a)throw new y("Nazwa tagu nie może być pusta");const u=t.get("SELECT id, name, color FROM tags WHERE name = ?",[a]);if(u)return P(u);const s=i.newId(),E=R(i.now());return t.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[s,a,E,E]),n(s)}function l(o){return t.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[o]).map(P)}return{get:n,ensure:d,list(){return t.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(o=>({...P(o),itemCount:A(o.item_count)}))},forItem:l,setForItem(o,a){return e.tx(()=>{const u=new Map;for(const _ of a.map(Q))_&&!u.has(_.toLowerCase())&&u.set(_.toLowerCase(),_);const s=[...u.values()].map(d),E=new Set(s.map(_=>_.id)),m=t.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[o]).map(_=>_.tag_id);for(const _ of m)E.has(_)||t.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[o,_]);for(const _ of E)m.includes(_)||t.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[o,_]);return t.run("UPDATE items SET updated_at = ? WHERE id = ?",[R(i.now()),o]),l(o)})},update(o,a){const u=n(o),s=a.name===void 0?u.name:Q(a.name);if(!s)throw new y("Nazwa tagu nie może być pusta");if(t.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[s,o]))throw new y(`Tag „${s}” już istnieje`);return t.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[s,a.color===void 0?u.color:a.color,R(i.now()),o]),n(o)},remove(o){n(o),t.run("DELETE FROM tags WHERE id = ?",[o])}}}const Ee=["note","task","event"],ce=["todo","in_progress","done","on_hold"],ye=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id, i.space_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency,
         i.opened_at, i.updated_at, i.deleted_at,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,Ae=e=>({id:e.id,type:e.type,title:e.title,spaceId:e.space_id??null,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:A(e.priority),favorite:D(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:D(e.all_day),isPayment:D(e.is_payment),amountMinor:e.amount_minor==null?null:A(e.amount_minor),currency:e.currency,openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:A(e.file_count??0)});function X(e,t){if(t!=null&&!Be(t))throw new y(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${t}”`)}function ue(e,t){if(e&&t&&e.slice(0,10)>t.slice(0,10))throw new y("Koniec nie może być przed początkiem")}function me(e){if(e===0||e===1||e===2||e===3)return e;throw new y("Priorytet musi być liczbą 0–3")}function qe(e,t){const{db:i,env:n}=e;function d(r){return i.get("SELECT * FROM items WHERE id = ?",[r])}function l(r){const c=i.get("SELECT amount_minor, currency, account, payee FROM payments WHERE item_id = ?",[r]);return c?{amountMinor:c.amount_minor==null?null:A(c.amount_minor),currency:c.currency,account:c.account,payee:c.payee}:null}function o(r){return{id:r.id,type:r.type,title:r.title,spaceId:r.space_id??null,bodyJson:K(r.body_json),bodyText:r.body_text,folderId:r.folder_id,parentItemId:r.parent_item_id,categoryId:r.category_id,status:r.status,priority:A(r.priority),favorite:D(r.favorite),pinned:D(r.pinned),sortOrder:A(r.sort_order),startAt:r.start_at,dueAt:r.due_at,allDay:D(r.all_day),recurrence:K(r.recurrence),completedAt:r.completed_at,openedAt:r.opened_at,createdAt:r.created_at,updatedAt:r.updated_at,deletedAt:r.deleted_at,tags:t.tags.forItem(r.id),payment:l(r.id)}}function a(r){const c=d(r);if(!c)throw new I("Item",r);return o(c)}function u(r){const c=a(r);if(c.deletedAt)throw new I("Item",r);return c}function s(r){r&&t.folders.get(r)}function E(r,c){if(r){if(r===c)throw new y("Element nie może być swoim rodzicem");u(r)}}function m(r,c){const L=l(r),T=c.amountMinor===void 0?L?.amountMinor??null:c.amountMinor;if(T!=null&&(!Number.isInteger(T)||T<0))throw new y("Kwota musi być nieujemną liczbą całkowitą w groszach");i.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee`,[r,T,c.currency??L?.currency??"PLN",c.account??L?.account??"",c.payee??L?.payee??""])}function _(r){const c=r?i.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[r]):i.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(c?.m==null?0:A(c.m))+1}const f={get:u,getAny:a,create(r){if(!Ee.includes(r.type))throw new y(`Nieznany typ elementu: ${String(r.type)}`);if(X("Początek",r.startAt),X("Termin",r.dueAt),ue(r.startAt,r.dueAt),r.status!=null&&!ce.includes(r.status))throw new y("Nieznany status");const c=me(r.priority??1),L=r.folderId??null;s(L),E(r.parentItemId);const T=L?t.folders.get(L).itemDefaults:null,N=r.categoryId!==void 0?r.categoryId:T?.categoryId??null,p=r.payment!=null||r.payment===void 0&&!!T?.isPayment&&r.type==="task",S=r.type==="task"?r.status??"todo":null,g=r.dueAt??r.startAt,C=g?ne(g):!1,w=R(n.now()),U=n.newId();return e.tx(()=>(i.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[U,r.type,(r.title??"").trim(),r.bodyJson==null?null:JSON.stringify(r.bodyJson),r.bodyText??"",L,r.parentItemId??null,N,S,c,r.favorite?1:0,_(L),r.startAt??null,r.dueAt??null,C?1:0,S==="done"?w:null,w,w]),p&&m(U,{currency:T?.currency,...r.payment??{}}),r.tags?.length&&t.tags.setForItem(U,r.tags),u(U)))},update(r,c){const L=u(r);if(c.type!==void 0&&!Ee.includes(c.type))throw new y("Nieznany typ elementu");if(c.status!=null&&!ce.includes(c.status))throw new y("Nieznany status");X("Początek",c.startAt),X("Termin",c.dueAt),c.folderId!==void 0&&s(c.folderId),c.parentItemId!==void 0&&E(c.parentItemId,r);const T=c.type??L.type;let N=c.status===void 0?L.status:c.status;T==="task"&&N==null&&(N="todo"),T!=="task"&&(N=null);const p=c.startAt===void 0?L.startAt:c.startAt,S=c.dueAt===void 0?L.dueAt:c.dueAt;ue(p,S);const g=S??p,C=R(n.now()),w=N==="done"?L.completedAt??C:null,U=c.priority===void 0?L.priority:me(c.priority);return e.tx(()=>(i.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[T,c.title===void 0?L.title:c.title.trim(),c.bodyJson===void 0?L.bodyJson==null?null:JSON.stringify(L.bodyJson):c.bodyJson==null?null:JSON.stringify(c.bodyJson),c.bodyText??L.bodyText,c.folderId===void 0?L.folderId:c.folderId,c.parentItemId===void 0?L.parentItemId:c.parentItemId,c.categoryId===void 0?L.categoryId:c.categoryId,N,U,c.favorite??L.favorite?1:0,c.pinned??L.pinned?1:0,c.sortOrder??L.sortOrder,p,S,g&&ne(g)?1:0,w,C,r]),c.payment===null?i.run("DELETE FROM payments WHERE item_id = ?",[r]):c.payment!==void 0&&m(r,c.payment),u(r)))},setTags(r,c){return u(r),t.tags.setForItem(r,c)},setStatus(r,c){return f.update(r,{status:c})},toggleFavorite(r){return f.update(r,{favorite:!u(r).favorite})},markOpened(r){u(r),i.run("UPDATE items SET opened_at = ? WHERE id = ?",[R(n.now()),r])},setSpace(r,c){const L=u(r);return e.tx(()=>{const T=L.folderId?t.folders.find(L.folderId):null,N=T&&(T.spaceId??null)===c;i.run("UPDATE items SET space_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",[c,N?L.folderId:null,R(n.now()),r])}),u(r)},move(r,c,L){return u(r),s(c),e.tx(()=>{const T=(c?i.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[c,r]):i.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[r])).map(p=>p.id),N=L===void 0?T.length:Math.max(0,Math.min(L,T.length));T.splice(N,0,r),i.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[c,R(n.now()),r]),T.forEach((p,S)=>i.run("UPDATE items SET sort_order = ? WHERE id = ?",[S+1,p]))}),u(r)},trash(r){u(r);const c=R(n.now());i.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[c,c,r])},restore(r){const c=a(r);return e.tx(()=>{const L=R(n.now()),T=c.folderId?t.folders.find(c.folderId):null,N=T&&!T.deletedAt?T.id:null;i.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[N,L,r])}),u(r)},purge(r){if(!a(r).deletedAt)throw new y("Najpierw przenieś element do kosza");i.run("DELETE FROM items WHERE id = ?",[r])},query(r={}){const c=[r.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL"],L=[];if(r.type){const p=Array.isArray(r.type)?r.type:[r.type];c.push(`i.type IN (${p.map(()=>"?").join(",")})`),L.push(...p)}if(r.folderId===null)c.push("i.folder_id IS NULL");else if(r.folderId!==void 0)if(r.includeSubfolders){const p=t.folders.descendantIds(r.folderId);c.push(`i.folder_id IN (${p.map(()=>"?").join(",")})`),L.push(...p)}else c.push("i.folder_id = ?"),L.push(r.folderId);if(r.status){const p=Array.isArray(r.status)?r.status:[r.status];c.push(`i.status IN (${p.map(()=>"?").join(",")})`),L.push(...p)}r.openOnly&&c.push("(i.status IS NULL OR i.status <> 'done')"),r.favorite!==void 0&&c.push(`i.favorite = ${r.favorite?1:0}`),r.tagId&&(c.push("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)"),L.push(r.tagId)),r.payment!==void 0&&c.push(`p.item_id IS ${r.payment?"NOT NULL":"NULL"}`),r.dueFrom&&(c.push("i.due_at >= ?"),L.push(r.dueFrom)),r.dueTo&&(c.push("COALESCE(i.start_at, i.due_at) < ?"),L.push(r.dueTo));const T={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[r.orderBy??"manual"];r.orderBy==="opened"&&c.push("i.opened_at IS NOT NULL");const N=r.limit&&r.limit>0?` LIMIT ${Math.floor(r.limit)}`:"";return i.all(`${ye} WHERE ${c.join(" AND ")} ORDER BY ${T}${N}`,L).map(Ae)}};return f}const H={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function et(e){const{db:t,env:i}=e;return{get(n){const d=t.get("SELECT value FROM settings WHERE key = ?",[n]);if(!d)return H[n];try{return JSON.parse(d.value)}catch{return H[n]}},set(n,d){if(!(n in H))throw new Error(`Unknown setting: ${String(n)}`);return t.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[n,JSON.stringify(d),R(i.now())]),d},all(){const n={...H};for(const d of t.all("SELECT key, value FROM settings"))if(d.key in H)try{n[d.key]=JSON.parse(d.value)}catch{}return n}}}const G=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:A(e.size),width:e.width==null?null:A(e.width),height:e.height==null?null:A(e.height),createdAt:e.created_at}),Z=e=>({...G(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),q=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,tt=/^[0-9a-f]{64}$/;function it(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function nt(e,t){const{db:i,env:n}=e;function d(o){const a=o.sha256?.toLowerCase();if(!a||!tt.test(a))throw new y("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(o.size)||o.size<0)throw new y("Nieprawidłowy rozmiar pliku");const u=i.get("SELECT * FROM files WHERE sha256 = ?",[a]);if(u)return G(u);const s=n.newId();return i.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[s,a,o.name.trim()||"plik",o.mime||"application/octet-stream",o.size,o.width??null,o.height??null,R(n.now())]),G(i.get("SELECT * FROM files WHERE id = ?",[s]))}function l(o,a,u="attachment"){if(t.items.get(o),!i.get("SELECT 1 FROM files WHERE id = ?",[a]))throw new I("File",a);const s=i.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[o]),E=R(n.now());i.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[o,a,u,(s?.m==null?0:A(s.m))+1,E]),i.run("UPDATE items SET updated_at = ? WHERE id = ?",[E,o])}return{register:d,addToItem(o,a){return e.tx(()=>{const u=d(a);return l(o,u.id),Z(i.get(`${q} WHERE x.item_id = ? AND x.file_id = ?`,[o,u.id]))})},addToFolder(o,a,u){return e.tx(()=>{o&&t.folders.get(o);const s=d(a),E=t.items.create({type:"note",title:u?.trim()||it(s.name),folderId:o});return l(E.id,s.id),t.items.get(E.id)})},detach(o,a){t.items.get(o),i.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[o,a]),i.run("UPDATE items SET updated_at = ? WHERE id = ?",[R(n.now()),o])},rename(o,a){if(!a.trim())throw new y("Nazwa pliku nie może być pusta");i.run("UPDATE files SET name = ? WHERE id = ?",[a.trim(),o]);const u=i.get("SELECT * FROM files WHERE id = ?",[o]);if(!u)throw new I("File",o);return G(u)},forItem(o){return i.all(`${q} WHERE x.item_id = ? ORDER BY x.sort_order`,[o]).map(Z)},forFolder(o,a={}){const u=["i.deleted_at IS NULL"],s=[];if(o===null)u.push("i.folder_id IS NULL");else if(a.includeSubfolders){const m=t.folders.descendantIds(o);u.push(`i.folder_id IN (${m.map(()=>"?").join(",")})`),s.push(...m)}else u.push("i.folder_id = ?"),s.push(o);a.imagesOnly&&u.push("f.mime LIKE 'image/%'");const E=a.limit&&a.limit>0?` LIMIT ${Math.floor(a.limit)}`:"";return i.all(`${q} WHERE ${u.join(" AND ")} ORDER BY x.created_at DESC, f.name${E}`,s).map(Z)}}}function ot(e){const{db:t,env:i}=e,n="i.deleted_at IS NULL AND (i.status IS NULL OR i.status <> 'done')",d="(i.status IS NULL OR i.status <> 'done')";function l(a,u,s="i.due_at, i.priority DESC",E=50){return t.all(`${ye} WHERE ${a} ORDER BY ${s} LIMIT ${E}`,u).map(Ae)}function o(a,u){const s=t.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${a}`,u);return Number(s?.c??0)}return{summary(){const a=i.now(),u=Re(a),s=W(u,1),E=W(u,8),m=ze(a),_=`${n} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,f=[u,m],r=`${n} AND i.type IN ('task', 'event') AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,c=[u,s,m],L=`i.deleted_at IS NULL AND i.type IN ('task', 'event') AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ? AND ${d})`,T=W(s,1),N="i.deleted_at IS NULL AND i.type IN ('task', 'event') AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?",p=[s,T],S=`${n} AND i.type IN ('task', 'event') AND COALESCE(i.start_at, i.due_at) >= ? AND COALESCE(i.start_at, i.due_at) < ?`,g=[s,E],C=`${n} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,w=[u,W(u,7)];return{overdue:l(_,f),today:l(L,c),tomorrow:l(N,p),upcoming:l(S,g),recentNotes:l("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:l("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:l("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:o(_,f),today:o(r,c),tomorrow:o(`${n} AND ${N.replace("i.deleted_at IS NULL AND ","")}`,p),upcoming:o(S,g),paymentsThisWeek:o(C,w),notes:o("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:o("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const se="",de="";function rt(e){const t=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(i=>i.trim()).filter(Boolean).slice(0,12);return t.length?t.map(i=>`"${i.replace(/"/g,"")}"*`).join(" "):null}const at=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function st(e,t){const i=/[\u0001\u0002]/g,n=e.replace(/^…/,"").replace(/…$/,""),d=n.replace(i,"");if(!d)return e;for(const l of t){const o=at(l).indexOf(d);if(o<0)continue;const a=l.slice(o,o+d.length);let u="",s=0;for(const E of n)E===se||E===de?u+=E:u+=a[s++];return e.replace(n,u)}return e}const Se=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],v=e=>Se.reduce((t,[i,n])=>`replace(${t}, '${i}', '${n}')`,`coalesce(${e}, '')`),oe=e=>Se.reduce((t,[i,n])=>t.split(i).join(n),e).toLowerCase();function dt(e,t){const i=oe(e);let n=-1,d=0;for(const a of t){const u=i.indexOf(a);u>=0&&(n<0||u<n)&&(n=u,d=a.length)}if(n<0)return e.slice(0,90);const l=Math.max(0,n-40),o=Math.min(e.length,n+d+60);return`${l>0?"…":""}${e.slice(l,n)}${se}${e.slice(n,n+d)}${de}${e.slice(n+d,o)}${o<e.length?"…":""}`}function lt(e,t){const{db:i}=e;function n(d,l){const o=oe(d).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!o.length)return[];const a=`(${v("i.title")} || ' ' || ${v("i.body_text")} || ' ' ||
      ${v("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${v("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return i.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${o.map(()=>`instr(lower(${a}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${v("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...o,o[0],l]).map(s=>({...s,snip:dt(s.body_text||s.title,o)}))}return{fullText:()=>t.fullText,search(d,l=30){const o=rt(d);if(!o)return[];const a=t.fullText?i.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${se}', '${de}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[o,l]):n(d,l),u=oe(d.trim());return[...i.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${v("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[u]).map(E=>({kind:"folder",id:E.id,title:E.name,snippet:"",folderId:E.parent_id})),...a.map(E=>({kind:"item",id:E.id,title:E.title,snippet:st(E.snip??"",[E.body_text,E.title]),itemType:E.type,folderId:E.folder_id}))]}}}function Et(e){const{db:t}=e;return{list(){const i=t.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),n=t.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...i.map(d=>({kind:"item",id:d.id,title:d.title,deletedAt:d.deleted_at,itemType:d.type})),...n.map(d=>({kind:"folder",id:d.id,title:d.name,deletedAt:d.deleted_at}))].sort((d,l)=>l.deletedAt.localeCompare(d.deletedAt))}}}const ct={now:()=>new Date,newId:()=>crypto.randomUUID()};function ut(e,t={}){Ce(e),ke(e);const i=He(e,t.fullText!==!1),n={db:e,tx:De(e),env:t.env??ct},d=Ke(n),l=Qe(n),o=Ze(n),a=qe(n,{tags:o,folders:l}),u=et(n),s=nt(n,{items:a,folders:l}),E=ot(n),m=lt(n,{fullText:i}),_=Et(n);return t.seed!==!1&&(d.seedDefaults(),t.seedFolders!==!1&&l.seedDefaults()),{api:{categories:{list:d.list,create:d.create,update:d.update,remove:d.remove},folders:{tree:l.tree,list:l.list,get:l.get,path:l.path,create:l.create,update:l.update,move:l.move,trash:l.trash,restore:l.restore,purge:l.purge,setSpace:l.setSpace},tags:{list:o.list,update:o.update,remove:o.remove},items:{get:a.get,create:a.create,update:a.update,setTags:a.setTags,setStatus:a.setStatus,toggleFavorite:a.toggleFavorite,markOpened:a.markOpened,move:a.move,trash:a.trash,restore:a.restore,purge:a.purge,query:a.query,setSpace:a.setSpace},files:{register:s.register,addToItem:s.addToItem,addToFolder:s.addToFolder,detach:s.detach,rename:s.rename,forItem:s.forItem,forFolder:s.forFolder},trash:{list:_.list},dashboard:{summary:E.summary},search:{query:m.search,fullText:m.fullText},settings:{all:u.all,get:u.get,set:u.set}},close:()=>e.close()}}const mt=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","folders.setSpace","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","items.setSpace","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set"]);function Tt(e,t){if(typeof t!="string")return null;const[i,n,...d]=t.split(".");if(!i||!n||d.length||!Object.prototype.hasOwnProperty.call(e,i))return null;const l=e[i];if(!Object.prototype.hasOwnProperty.call(l,n))return null;const o=l[n];return typeof o=="function"?o:null}function _t(e,t,i){const n=Tt(e,t);if(!n)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(t)}`}},mutated:!1};try{return{result:{ok:!0,value:n(...Array.isArray(i)?i:[])},mutated:mt.has(t)}}catch(d){const l=d;return l.name!=="ValidationError"&&l.name!=="NotFoundError"&&console.error(`[core] ${String(t)} failed`,l),{result:{ok:!1,error:{name:l.name||"Error",message:l.message||String(d)}},mutated:!1}}}function ft(e,t){const i=new e.Database(t??null),n=l=>l.map(o=>typeof o=="bigint"?Number(o):o);function d(l,o,a){const u=i.prepare(l);try{o.length&&u.bind(n(o));const s=[];for(;u.step()&&(s.push(u.getAsObject()),!!a););return s}finally{u.free()}}return{exec:l=>{i.exec(l)},run:(l,o=[])=>(i.run(l,n(o)),{changes:i.getRowsModified()}),get:(l,o=[])=>d(l,o,!1)[0],all:(l,o=[])=>d(l,o,!0),close:()=>i.close(),exportBytes:()=>{const l=i.export();return i.exec("PRAGMA foreign_keys = ON;"),l}}}const Nt="notatnik",J="files",M="blobs";function Oe(){return new Promise((e,t)=>{const i=indexedDB.open(Nt,2);i.onupgradeneeded=()=>{const n=i.result.objectStoreNames;n.contains(J)||i.result.createObjectStore(J),n.contains(M)||i.result.createObjectStore(M)},i.onsuccess=()=>e(i.result),i.onerror=()=>t(i.error)})}async function z(e,t=J){const i=await Oe();try{return await new Promise((n,d)=>{const l=i.transaction(t,"readonly").objectStore(t).get(e);l.onsuccess=()=>n(l.result?new Uint8Array(l.result):null),l.onerror=()=>d(l.error)})}finally{i.close()}}async function ge(e,t,i=J){const n=await Oe();try{await new Promise((d,l)=>{const o=n.transaction(i,"readwrite");o.objectStore(i).put(t.slice().buffer,e),o.oncomplete=()=>d(),o.onerror=()=>l(o.error),o.onabort=()=>l(o.error)})}finally{n.close()}}async function Lt(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function pt(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const t=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(t)].map(i=>i.toString(16).padStart(2,"0")).join("")}function Rt(e){const t=new Map,i=new Map;return{async put(n,d){const l=await pt(n);return e()?await z(l,M).catch(()=>null)||await ge(l,n,M):t.set(l,n),{sha256:l,size:n.byteLength}},async read(n){return t.get(n)??(e()?await z(n,M).catch(()=>null):null)},async url(n,d){const l=i.get(n);if(l)return l;const o=t.get(n)??(e()?await z(n,M).catch(()=>null):null);if(!o)return null;const a=URL.createObjectURL(new Blob([o.slice().buffer],{type:d||"application/octet-stream"}));return i.set(n,a),a}}}const re=e=>e.sharedId?[e.privateId,e.sharedId]:[e.privateId],yt=e=>typeof e=="bigint"?Number(e):e;function Ie(e,t){const i=t.split(Y);return[e.key.map(n=>`${n} = ?`).join(" AND "),e.key.map((n,d)=>i[d]??"")]}function we(e,t,i){const[n,d]=Ie(t,i),l=e.get(`SELECT * FROM ${t.name} WHERE ${n}`,d);if(!l)return;const o={};for(const[a,u]of Object.entries(l))o[a]=yt(u);return o}function he(e,t,i){return e.get("SELECT space_id FROM items WHERE id = ?",[String(t)])?.space_id??i.privateId}function At(e,t,i,n){switch(t.scope){case"own":return[i.space_id??n.privateId];case"item":return[he(e,i[t.itemCol],n)];case"all":return re(n);case"file":{const d=e.all("SELECT DISTINCT i.space_id AS s FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ?",[String(i.id)]).map(a=>a.s??n.privateId),l=new Set(re(n)),o=[...new Set(d)].filter(a=>l.has(a));return o.length?o:[n.privateId]}}}function St(e){return Number(e.get("SELECT COUNT(*) AS n FROM sync_outbox")?.n??0)}function Ot(e,t,i=300){const n=e.all("SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at LIMIT ?",[i]),d=[];for(const l of n){const o=Ne.get(l.tbl);if(!o)continue;const a=we(e,o,l.id);if(!a){d.push({space_id:null,tbl:o.name,id:l.id,data:null,deleted:!0,stamp:l.changed_at,exclusive:!1});continue}const u=o.scope==="own"||o.scope==="item",s=new Set(re(t));for(const E of At(e,o,a,t).filter(m=>s.has(m)))d.push({space_id:E,tbl:o.name,id:l.id,data:a,deleted:!1,stamp:l.changed_at,exclusive:u}),o.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(a.sha256),E,"up",String(a.mime)])}return{entries:d,taken:n}}function gt(e,t){e.exec("BEGIN");try{for(const i of t)e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?",[i.tbl,i.id,i.changed_at]);e.exec("COMMIT")}catch(i){throw e.exec("ROLLBACK"),i}}const Te=new WeakMap;function It(e,t){let i=Te.get(e);i||Te.set(e,i=new Map);let n=i.get(t);return n||(n=new Set(e.all(`PRAGMA table_info(${t})`).map(d=>d.name)),i.set(t,n)),n}function ee(e,t,i){return e.get("SELECT local_id FROM sync_idmap WHERE tbl = ? AND remote_id = ?",[t,i])?.local_id??i}function wt(e,t,i,n){return t.scope==="own"?i.space_id??n.privateId:t.scope==="item"?he(e,i[t.itemCol],n):null}function ht(e,t,i){if(!t.length)return 0;let n=0;e.exec("PRAGMA foreign_keys = OFF"),e.exec("BEGIN");try{e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");for(const d of t){e.exec("SAVEPOINT rec");try{n+=Dt(e,d,i),e.exec("RELEASE rec")}catch(l){e.exec("ROLLBACK TO rec; RELEASE rec")}}e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'"),e.exec("COMMIT")}catch(d){throw e.exec("ROLLBACK"),d}finally{e.exec("PRAGMA foreign_keys = ON")}return n}function Dt(e,t,i){let n=0;const d=Ne.get(t.tbl);if(!d)return 0;const l=t.id.split(Y),o=d.key.map((T,N)=>{const p=l[N]??"";return d.refs?.[T]?ee(e,d.refs[T],p):d.mergeBy?ee(e,d.name,p):p}),a=o.join(Y),u=e.get("SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,a]);if(u&&u.changed_at>t.stamp)return n;const s=we(e,d,a);if(t.deleted||!t.data){if(!s)return n;const T=wt(e,d,s,i);if(T!==null&&T!==t.space_id)return n;const[N,p]=Ie(d,a);return n+=e.run(`DELETE FROM ${d.name} WHERE ${N}`,p).changes,u&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,a]),n}const E={...t.data},m=t.space_id===i.privateId?null:t.space_id,_=d.name!=="folders"||E.parent_id==null&&E.deleted_at==null;if(d.mergeBy&&!s&&_){const T=d.mergeBy,N=e.get(`SELECT id FROM ${d.name} WHERE ${T.col} = ?${T.nocase?" COLLATE NOCASE":""}${T.where?` AND ${T.where}`:""}${T.sameSpace?" AND space_id IS ?":""} AND id <> ? LIMIT 1`,T.sameSpace?[String(E[T.col]),m,String(E.id)]:[String(E[T.col]),String(E.id)]);if(N)return e.run("INSERT OR REPLACE INTO sync_idmap (tbl, remote_id, local_id) VALUES (?, ?, ?)",[d.name,String(E.id),N.id]),n}for(const[T,N]of Object.entries(d.refs??{}))typeof E[T]=="string"&&(E[T]=ee(e,N,E[T]));if(d.key.forEach((T,N)=>{E[T]=o[N]}),d.scope==="own"&&(E.space_id=m),s&&typeof s.updated_at=="string"&&typeof E.updated_at=="string"&&s.updated_at>E.updated_at)return n;const f=Object.keys(E).filter(T=>It(e,d.name).has(T)&&!(d.localOnly??[]).includes(T)),r=f.map(T=>{const N=E[T];return N===void 0?null:typeof N=="object"&&N!==null?JSON.stringify(N):N}),c=f.filter(T=>!d.key.includes(T)),L=c.length?`DO UPDATE SET ${c.map(T=>`${T} = excluded.${T}`).join(", ")}`:"DO NOTHING";return n+=e.run(`INSERT INTO ${d.name} (${f.join(", ")}) VALUES (${f.map(()=>"?").join(", ")}) ON CONFLICT(${d.key.join(", ")}) ${L}`,r).changes,u&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,a]),d.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(E.sha256),t.space_id,"down",String(E.mime)]),n}function Ct(e,t,i){const n=t?.sharedId&&t.sharedId!==i.sharedId?t.sharedId:null;e.exec("BEGIN");try{if(n){e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");const d="SELECT id FROM items WHERE space_id = ?";for(const l of j)l.scope==="item"&&e.run(`DELETE FROM sync_outbox WHERE tbl = ? AND id IN (SELECT ${B(l,l.name)} FROM ${l.name} WHERE ${l.itemCol} IN (${d}))`,[l.name,n]);e.run(`DELETE FROM sync_outbox WHERE tbl = 'items' AND id IN (${d})`,[n]),e.run("DELETE FROM sync_outbox WHERE tbl = 'folders' AND id IN (SELECT id FROM folders WHERE space_id = ?)",[n]),e.run("DELETE FROM items WHERE space_id = ?",[n]),e.run("DELETE FROM folders WHERE space_id = ?",[n]),e.run("DELETE FROM sync_blobs WHERE space_id = ?",[n]),e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'")}b(e,"spaces",JSON.stringify(i)),b(e,"cursor",null),e.exec("COMMIT")}catch(d){throw e.exec("ROLLBACK"),d}}function ae(e,t){return e.get("SELECT value FROM sync_state WHERE key = ?",[t])?.value??null}function b(e,t,i){i===null?e.run("DELETE FROM sync_state WHERE key = ?",[t]):e.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",[t,i])}const Ut=50,_e=500,vt=8;async function Ft(e,t,i,n){for(let a=0;a<100;a++){const{entries:u,taken:s}=Ot(e,t);if(!s.length)break;u.length&&await i.push(u),gt(e,s)}let d=0,l=Number(ae(e,"cursor")??0);for(let a=0;a<200;a++){const u=Math.max(0,l-(a===0?Ut:0)),s=await i.pull(u,_e);if(!s.length)break;d+=ht(e,s,t);const E=Math.max(...s.map(m=>m.rev));if(E>l&&(l=E,b(e,"cursor",String(l))),s.length<_e)break}const o=e.all("SELECT * FROM sync_blobs WHERE tries < 40 ORDER BY dir DESC, tries LIMIT ?",[vt]);for(const a of o)try{let u=!1;if(a.dir==="up"){const s=await n.read(a.sha256);s&&await i.upload(a.space_id,a.sha256,s,a.mime),u=!0}else if(await n.read(a.sha256))u=!0;else{const s=await i.download(a.space_id,a.sha256);s&&(await n.write(s,a.mime),u=!0,d++)}u?e.run("DELETE FROM sync_blobs WHERE sha256 = ? AND space_id = ? AND dir = ?",[a.sha256,a.space_id,a.dir]):e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[a.sha256,a.space_id,a.dir])}catch{e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[a.sha256,a.space_id,a.dir])}return d}class O extends Error{constructor(t,i=0,n=!1){super(t),this.status=i,this.offline=n}}const te=e=>({accessToken:e.access_token,refreshToken:e.refresh_token,expiresAt:Date.now()+e.expires_in*1e3,userId:e.user.id,email:e.user.email});function Mt(e,t){const i=t.msg??t.message??t.error_description??"",n=t.error_code??t.code??"";return n==="invalid_credentials"||/invalid login credentials/i.test(i)?"Nieprawidłowy e-mail lub hasło.":n==="user_already_exists"||/already registered/i.test(i)?"To konto już istnieje — zaloguj się.":n==="weak_password"||/password should be/i.test(i)?"Hasło jest za krótkie (minimum 6 znaków).":/database error saving new user|nie ma zaproszenia/i.test(i)||n==="unexpected_failure"?"Ten adres e-mail nie ma zaproszenia do Notario.":n==="validation_failed"||/email/i.test(i)&&e===400?"Sprawdź adres e-mail.":e===429?"Za dużo prób. Spróbuj za chwilę.":i||`Błąd serwera (${e}).`}function bt(e,t){let i=t.load(),n=null;async function d(m,_={}){const f=new Headers(_.headers);f.set("apikey",e.key),_.auth!==!1&&f.set("Authorization",`Bearer ${await a()}`);let r;try{r=await fetch(`${e.url}${m}`,{..._,headers:f})}catch{throw new O("Brak połączenia z internetem.",0,!0)}return r}async function l(m,_){const f=await d(m,{method:"POST",auth:!1,headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}),r=await f.json().catch(()=>({}));if(!f.ok)throw new O(Mt(f.status,r),f.status);return r}function o(m){i=m,t.save(m)}async function a(){if(!i)throw new O("Nie zalogowano.",401);return i.expiresAt-Date.now()>6e4?i.accessToken:(n??(n=(async()=>{try{const m=await l("/auth/v1/token?grant_type=refresh_token",{refresh_token:i.refreshToken}),_=te(m);return o(_),_}catch(m){throw m instanceof O&&(m.status===400||m.status===401)&&o(null),m}finally{n=null}})()),(await n).accessToken)}async function u(m){if(m.status===401)throw new O("Sesja wygasła. Zaloguj się ponownie.",401);if(!m.ok){const f=await m.text().catch(()=>"");throw new O(`Serwer odrzucił zapytanie (${m.status}) ${f.slice(0,200)}`,m.status)}const _=await m.text();return _?JSON.parse(_):null}const s=async(m,_)=>u(await d(`/rest/v1/rpc/${m}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}));return{transport:{async push(m){await s("push_records",{changes:m})},async pull(m,_){const f=`select=space_id,tbl,id,data,deleted,stamp,rev&rev=gt.${m}&order=rev.asc&limit=${_}`;return u(await d(`/rest/v1/records?${f}`))},async upload(m,_,f,r){const c=await d(`/storage/v1/object/blobs/${m}/${_}`,{method:"POST",headers:{"Content-Type":r||"application/octet-stream"},body:f.slice().buffer});if(c.ok||c.status===409)return;const L=await c.text().catch(()=>"");if(!(c.status===400&&/exists|duplicate/i.test(L)))throw new O(`Nie udało się wysłać pliku (${c.status}).`,c.status)},async download(m,_){const f=await d(`/storage/v1/object/authenticated/blobs/${m}/${_}`);if(f.status===404||f.status===400)return null;if(!f.ok)throw new O(`Nie udało się pobrać pliku (${f.status}).`,f.status);return new Uint8Array(await f.arrayBuffer())}},rpc:s,session:()=>i,async signIn(m,_){const f=await l("/auth/v1/token?grant_type=password",{email:m.trim(),password:_}),r=te(f);return o(r),r},async signUp(m,_){const f=await l("/auth/v1/signup",{email:m.trim(),password:_});if("access_token"in f&&f.access_token){const r=te(f);return o(r),r}return this.signIn(m,_)},async signOut(){const m=i;o(null),m&&await fetch(`${e.url}/auth/v1/logout`,{method:"POST",headers:{apikey:e.key,Authorization:`Bearer ${m.accessToken}`}}).catch(()=>{})},async spaces(){const m=await s("my_spaces",{}),_=m.find(f=>f.kind==="private");if(!_)throw new O("Konto nie ma jeszcze swojej przestrzeni na serwerze.");return{privateId:_.id,sharedId:m.find(f=>f.kind==="shared")?.id??null}}}}function kt(e){const t=/"message"\s*:\s*"([^"]+)"/.exec(e);return t?t[1]:e.replace(/^Serwer odrzucił zapytanie \(\d+\)\s*/,"")}function $t(e){const t=bt(e.config,e.store),i=new Set;let n=t.session()?"idle":"off",d=null,l=null,o=null,a=!1,u;function s(){const T=ae(e.db,"spaces");return T?JSON.parse(T):null}function E(){const T=t.session();return{signedIn:!!T,email:T?.email??null,state:T?n:"off",error:d,lastSyncAt:l,pending:St(e.db),sharedSpaceId:T?s()?.sharedId??null:null}}const m=()=>{const T=E();i.forEach(N=>N(T))};async function _(){const T=t.session();if(!T){n="off";return}n="syncing",m();try{ae(e.db,"user")!==T.userId&&(b(e.db,"user",T.userId),b(e.db,"cursor",null),b(e.db,"spaces",null));const N=s(),p=await t.spaces();(!N||N.privateId!==p.privateId||N.sharedId!==p.sharedId)&&(Ct(e.db,N,p),e.onRemoteChange());const S=await Ft(e.db,p,t.transport,e.blobs);e.onDbWritten(),S>0&&e.onRemoteChange(),n="idle",d=null,l=Date.now()}catch(N){const p=N;n=p.offline?"offline":"error",d=p.offline?null:p.message,t.session()||(n="off"),e.onDbWritten()}m()}async function f(T,N){try{await t.rpc(T,N)}catch(p){throw new O(kt(p.message))}await r()}function r(){return clearTimeout(u),o?(a=!0,o):(o=(async()=>{do a=!1,await _();while(a)})().finally(()=>{o=null}),o)}function c(T=1200){t.session()&&(clearTimeout(u),u=setTimeout(()=>void r(),T))}const L=setInterval(()=>{t.session()&&e.visible()&&!o&&r()},e.pollMs??5e3);return{status:E,syncNow:r,schedule:c,onStatus(T){return i.add(T),()=>i.delete(T)},async signIn(T,N){return await t.signIn(T,N),d=null,await r(),E()},async signUp(T,N){return await t.signUp(T,N),d=null,await r(),E()},async signOut(){return await t.signOut(),n="off",d=null,m(),E()},stop(){clearInterval(L),clearTimeout(u)},family:{info:()=>t.rpc("family_info",{}),invite:T=>f("family_invite",{p_email:T}),cancelInvite:T=>f("family_cancel_invite",{p_id:T}),declineInvite:T=>f("family_decline_invite",{p_id:T}),removeMember:T=>f("family_remove_member",{p_user:T}),leave:()=>f("family_leave",{}),async acceptInvite(T,N){await f("family_accept_invite",{p_id:T,p_bring:N}),e.db.run("INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM files"),e.onDbWritten()}}}}const xt={url:"https://wdqljuhkaqokjelwuyvf.supabase.co",key:"sb_publishable_Si1QdjcU3n_-H_gqpZ6Z6A_XD2lYgmT"},fe="notatnik.sqlite",ie="notario.session",Ht=400;async function Wt(e){const t=await e(),i={persistent:!1};let n=null;try{n=await z(fe),i.persistent=!0}catch{i.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const d=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;i.persistent&&!await Lt()&&!d&&(i.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const l=ft(t,n),o=ut(l);let a=!n,u,s=Promise.resolve();const E=()=>{if(clearTimeout(u),!a||!i.persistent)return s;a=!1;const T=l.exportBytes();return s=s.then(()=>ge(fe,T)).then(()=>{i.lastSavedAt=Date.now()}).catch(N=>{a=!0,console.error("Saving database failed",N),i.note="Nie udało się zapisać danych w pamięci przeglądarki."}),s},m=()=>{a=!0,clearTimeout(u),u=setTimeout(E,Ht)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&E()}),window.addEventListener("pagehide",()=>void E()),a&&m();const _=new Set,f=T=>{const N={method:T,at:Date.now()};queueMicrotask(()=>_.forEach(p=>p(N)))},r=Rt(()=>i.persistent),c=$t({db:l,config:xt,store:{load(){try{return JSON.parse(localStorage.getItem(ie)??"null")}catch{return null}},save(T){try{T?localStorage.setItem(ie,JSON.stringify(T)):localStorage.removeItem(ie)}catch{}}},blobs:{read:T=>r.read(T),write:async(T,N)=>{await r.put(T,N)}},onDbWritten:m,onRemoteChange:()=>f("sync.pull"),visible:()=>document.visibilityState==="visible"&&navigator.onLine!==!1});window.addEventListener("online",()=>void c.syncNow()),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&c.syncNow()}),c.syncNow();const L={async call(T,N){const{result:p,mutated:S}=_t(o.api,T,N);return S&&(m(),f(T),c.schedule()),p.ok?{ok:!0,value:p.value===void 0?void 0:structuredClone(p.value)}:p},onChanged(T){return _.add(T),()=>_.delete(T)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...i}),blobs:r,sync:{status:c.status,onStatus:c.onStatus,signIn:c.signIn,signUp:c.signUp,signOut:c.signOut,syncNow:c.syncNow,family:c.family}};window.bridge=L}export{Wt as installWebBridge};
