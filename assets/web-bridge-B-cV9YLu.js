function De(e){let t=0;return function(n){const d=`sp_${t}`;e.exec(t===0?"BEGIN IMMEDIATE":`SAVEPOINT ${d}`),t++;try{const l=n();return t--,e.exec(t===0?"COMMIT":`RELEASE ${d}`),l}catch(l){throw t--,e.exec(t===0?"ROLLBACK":`ROLLBACK TO ${d}; RELEASE ${d}`),l}}}function Ce(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const ie=[{name:"categories",key:["id"],scope:"all",mergeBy:{col:"name",where:"deleted_at IS NULL",nocase:!0}},{name:"tags",key:["id"],scope:"all",mergeBy:{col:"name",nocase:!0}},{name:"folders",key:["id"],scope:"own",refs:{category_id:"categories",parent_id:"folders"},mergeBy:{col:"name",where:"parent_id IS NULL AND deleted_at IS NULL",nocase:!0,sameSpace:!0}},{name:"items",key:["id"],scope:"own",refs:{category_id:"categories",folder_id:"folders"},localOnly:["opened_at"]},{name:"files",key:["id"],scope:"file",mergeBy:{col:"sha256"}},{name:"payments",key:["item_id"],scope:"item",itemCol:"item_id"},{name:"occurrence_states",key:["item_id","occurrence_key"],scope:"item",itemCol:"item_id"},{name:"checklist_items",key:["id"],scope:"item",itemCol:"item_id"},{name:"item_tags",key:["item_id","tag_id"],scope:"item",itemCol:"item_id",refs:{tag_id:"tags"}},{name:"item_links",key:["from_item_id","to_item_id","relation"],scope:"item",itemCol:"from_item_id"},{name:"item_files",key:["item_id","file_id"],scope:"item",itemCol:"item_id",refs:{file_id:"files"}},{name:"reminder_rules",key:["id"],scope:"item",itemCol:"item_id"}],Ne=new Map(ie.map(e=>[e.name,e])),j="|",J=(e,t)=>e.key.map(i=>`${t}.${i}`).join(` || '${j}' || `),k="strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",$="(SELECT value FROM sync_state WHERE key = 'applying') = '0'",Ue=["type","title","body_json","body_text","folder_id","parent_item_id","category_id","status","priority","favorite","pinned","sort_order","start_at","due_at","all_day","recurrence","completed_at","trashed_with","created_at","updated_at","deleted_at","space_id"];function ve(){const e=[`
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
`];for(const i of ie){const n=l=>`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${i.name}', ${J(i,l)}, ${k});`,d=i.name==="items"?` OF ${Ue.filter(l=>!(i.localOnly??[]).includes(l)).join(", ")}`:"";e.push(`
CREATE TRIGGER sync_${i.name}_ai AFTER INSERT ON ${i.name} WHEN ${$} BEGIN ${n("new")} END;
CREATE TRIGGER sync_${i.name}_au AFTER UPDATE${d} ON ${i.name} WHEN ${$} BEGIN ${n("new")} END;
CREATE TRIGGER sync_${i.name}_ad AFTER DELETE ON ${i.name} WHEN ${$} BEGIN ${n("old")} END;`),e.push(`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${i.name}', ${J(i,i.name)}, ${k} FROM ${i.name};`)}e.push(`
CREATE TRIGGER sync_item_files_file_ai AFTER INSERT ON item_files WHEN ${$} BEGIN
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('files', new.file_id, ${k});
END;`);const t=ie.filter(i=>i.scope==="item");return e.push(`
CREATE TRIGGER sync_items_space_au AFTER UPDATE OF space_id ON items WHEN ${$} BEGIN
${t.map(i=>`  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${i.name}', ${J(i,i.name)}, ${k} FROM ${i.name} WHERE ${i.itemCol} = new.id;`).join(`
`)}
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', file_id, ${k} FROM item_files WHERE item_id = new.id;
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
`;function ke(e,t=Fe){const i=e.get("PRAGMA user_version"),n=Number(i?.user_version??0),d=[],l=[...t].sort((o,s)=>o.version-s.version).filter(o=>o.version>n);for(const o of l){e.exec("BEGIN IMMEDIATE");try{e.exec(o.sql),e.exec(`PRAGMA user_version = ${o.version}`),e.exec("COMMIT"),d.push(o.version)}catch(s){throw e.exec("ROLLBACK"),new Error(`Migration ${o.version} (${o.name}) failed: ${s.message}`)}}return d}function $e(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function xe(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function He(e,t=!0){if(xe(e))return!0;if(!t||!$e(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(Me),e.exec(be),e.exec("COMMIT"),!0}catch(i){throw e.exec("ROLLBACK"),i}}class A extends Error{constructor(t){super(t),this.name="ValidationError"}}class w extends Error{constructor(t,i){super(`${t} not found: ${i}`),this.name="NotFoundError"}}const D=e=>e===1||e===1n||e===!0,y=e=>typeof e=="bigint"?Number(e):e;function z(e){if(e==null||e==="")return null;try{return JSON.parse(String(e))}catch{return null}}function Le(e,t,i,n){const d=e.db.get(`SELECT MAX(sort_order) AS m FROM ${t} WHERE ${i}`,n);return(d?.m==null?0:y(d.m))+1}const b=(e,t=2)=>String(e).padStart(t,"0"),We=/^(\d{4})-(\d{2})-(\d{2})$/,Pe=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;function ne(e){const t=We.exec(e);return!!t&&pe(+t[1],+t[2],+t[3])}function Xe(e){const t=Pe.exec(e);return!!t&&pe(+t[1],+t[2],+t[3])&&+t[4]<24&&+t[5]<60}function Be(e){return ne(e)||Xe(e)}function pe(e,t,i){return t>=1&&t<=12&&i>=1&&i<=Ge(e,t)}function Ge(e,t){return new Date(Date.UTC(e,t,0)).getUTCDate()}function Re(e){return`${e.getFullYear()}-${b(e.getMonth()+1)}-${b(e.getDate())}`}function je(e){return`${Re(e)}T${b(e.getHours())}:${b(e.getMinutes())}`}function W(e,t){const[i,n,d]=e.split("-").map(Number),l=new Date(Date.UTC(i,n-1,d+t));return`${l.getUTCFullYear()}-${b(l.getUTCMonth()+1)}-${b(l.getUTCDate())}`}function R(e){return e.toISOString()}const de=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:y(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),ze=/^#[0-9a-fA-F]{6}$/,Ye=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}];function Je(e){const{db:t,env:i}=e;function n(o){const s=t.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[o]);if(!s)throw new w("Category",o);return de(s)}function d(o,s){if(o!==void 0&&!o.trim())throw new A("Nazwa kategorii nie może być pusta");if(s!==void 0&&!ze.test(s))throw new A("Kolor musi mieć format #RRGGBB")}function l(o){d(o.name,o.color);const s=i.newId(),u=R(i.now());return t.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[s,o.name.trim(),o.color,o.icon??null,Le(e,"categories","deleted_at IS NULL",[]),u,u]),n(s)}return{create:l,list(){return t.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(de)},get:n,update(o,s){const u=n(o);return d(s.name,s.color),t.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[s.name?.trim()??u.name,s.color??u.color,s.icon===void 0?u.icon:s.icon,s.sortOrder??u.sortOrder,R(i.now()),o]),n(o)},remove(o){n(o),e.tx(()=>{const s=R(i.now());t.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[s,o]),t.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[s,o]),t.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[s,s,o])})},seedDefaults(){const o=t.get("SELECT COUNT(*) AS c FROM categories");if(!(y(o?.c??0)>0))for(const s of Ye)l(s)}}}const K=e=>({id:e.id,parentId:e.parent_id,spaceId:e.space_id??null,kind:e.kind,name:e.name,icon:e.icon,color:e.color,description:e.description,categoryId:e.category_id,sortOrder:y(e.sort_order),calendarSync:D(e.calendar_sync),itemDefaults:z(e.item_defaults),settings:z(e.settings),createdAt:e.created_at,updatedAt:e.updated_at,deletedAt:e.deleted_at}),Ke=[{name:"Praca",color:"#3B82F6",icon:"briefcase",category:"Praca"},{name:"Dom",color:"#F97316",icon:"home",category:"Dom"},{name:"Finanse",color:"#22C55E",icon:"wallet",category:"Płatności"},{name:"Podróże",color:"#A855F7",icon:"plane"},{name:"Pomysły",color:"#EC4899",icon:"lightbulb"},{name:"Rozwój",color:"#EAB308",icon:"book"}],Ve=`
  WITH RECURSIVE sub(id) AS (
    SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
  ) SELECT id FROM sub`;function Qe(e){const{db:t,env:i}=e;function n(a){const c=t.get("SELECT * FROM folders WHERE id = ?",[a]);return c?K(c):null}function d(a,c){const T=o(a),_=T.map(()=>"?").join(","),N=R(i.now());t.run(`UPDATE folders SET space_id = ?, updated_at = ? WHERE id IN (${_}) AND space_id IS NOT ?`,[c,N,...T,c]),t.run(`UPDATE items SET space_id = ?, updated_at = ? WHERE folder_id IN (${_}) AND space_id IS NOT ?`,[c,N,...T,c])}function l(a){const c=n(a);if(!c||c.deletedAt)throw new w("Folder",a);return c}function o(a){return t.all(Ve,[a]).map(c=>c.id)}function s(a){a&&l(a)}function u(a){return a===null?["parent_id IS NULL AND deleted_at IS NULL",[]]:["parent_id = ? AND deleted_at IS NULL",[a]]}return{get:l,find:n,descendantIds:o,list(){return t.all("SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order, name").map(K)},tree(){const a=t.all(`
        SELECT f.*,
          (SELECT COUNT(*) FROM items i WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS item_count,
          (SELECT fl.sha256 FROM items i JOIN item_files x ON x.item_id = i.id JOIN files fl ON fl.id = x.file_id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL AND fl.mime LIKE 'image/%'
            ORDER BY x.created_at DESC LIMIT 1) AS cover_sha,
          (SELECT COUNT(*) FROM items i JOIN item_files x ON x.item_id = i.id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS file_count
        FROM folders f WHERE f.deleted_at IS NULL ORDER BY f.sort_order, f.name`),c=new Map;for(const _ of a)c.set(_.id,{...K(_),children:[],itemCount:y(_.item_count),coverSha:_.cover_sha??null,fileCount:y(_.file_count)});const T=[];for(const _ of c.values()){const N=_.parentId?c.get(_.parentId):void 0;(N?N.children:T).push(_)}return T},path(a){const c=[];let T=l(a);const _=new Set;for(;T&&!_.has(T.id);)_.add(T.id),c.unshift(T),T=T.parentId?n(T.parentId):null;return c},seedDefaults(){t.get("SELECT 1 AS x FROM settings WHERE key = ?",["seed.folders"])||e.tx(()=>{for(const a of Ke){if(t.get("SELECT 1 AS x FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL AND name = ? COLLATE NOCASE",[a.name]))continue;const T=a.category?t.get("SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL",[a.category]):void 0;this.create({name:a.name,color:a.color,icon:a.icon,itemDefaults:T?{categoryId:T.id}:null})}t.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",["seed.folders","true",R(i.now())])})},create(a){const c=a.name?.trim();if(!c)throw new A("Nazwa folderu nie może być pusta");const T=a.parentId??null;s(T);const _=i.newId(),N=R(i.now()),[r,E]=u(T);return t.run(`INSERT INTO folders (id, parent_id, kind, name, icon, color, description, category_id, sort_order,
           calendar_sync, item_defaults, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[_,T,a.kind??"folder",c,a.icon??null,a.color??null,a.description??"",a.categoryId??null,Le(e,"folders",r,E),a.calendarSync===!1?0:1,a.itemDefaults?JSON.stringify(a.itemDefaults):null,N,N]),l(_)},update(a,c){const T=l(a);if(c.name!==void 0&&!c.name.trim())throw new A("Nazwa folderu nie może być pusta");return t.run(`UPDATE folders SET kind = ?, name = ?, icon = ?, color = ?, description = ?, category_id = ?,
           calendar_sync = ?, item_defaults = ?, settings = ?, updated_at = ? WHERE id = ?`,[c.kind??T.kind,c.name?.trim()??T.name,c.icon===void 0?T.icon:c.icon,c.color===void 0?T.color:c.color,c.description??T.description,c.categoryId===void 0?T.categoryId:c.categoryId,c.calendarSync??T.calendarSync?1:0,JSON.stringify(c.itemDefaults===void 0?T.itemDefaults:c.itemDefaults),JSON.stringify(c.settings===void 0?T.settings:c.settings),R(i.now()),a]),l(a)},move(a,c,T){if(l(a),c!==null&&(s(c),o(a).includes(c)))throw new A("Nie można przenieść folderu do jego podfolderu");return e.tx(()=>{const[_,N]=u(c),r=t.all(`SELECT id FROM folders WHERE ${_} AND id <> ? ORDER BY sort_order, name`,[...N,a]).map(m=>m.id),E=T===void 0?r.length:Math.max(0,Math.min(T,r.length));r.splice(E,0,a);const f=R(i.now());t.run("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?",[c,f,a]),r.forEach((m,L)=>t.run("UPDATE folders SET sort_order = ? WHERE id = ?",[L+1,m])),c!==null&&d(a,l(c).spaceId)}),l(a)},setSpace(a,c){return l(a),e.tx(()=>d(a,c)),l(a)},trash(a){l(a),e.tx(()=>{const c=R(i.now()),T=o(a),_=T.map(()=>"?").join(",");t.run(`UPDATE items SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE folder_id IN (${_}) AND deleted_at IS NULL`,[c,a,c,...T]),t.run(`UPDATE folders SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE id IN (${_}) AND deleted_at IS NULL`,[c,a,c,...T])})},restore(a){const c=n(a);if(!c)throw new w("Folder",a);return e.tx(()=>{const T=R(i.now());t.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[T,a]),t.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[T,a]),t.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE id = ?",[T,a]);const _=c.parentId?n(c.parentId):null;c.parentId&&(!_||_.deletedAt)&&t.run("UPDATE folders SET parent_id = NULL WHERE id = ?",[a])}),l(a)},purge(a){const c=n(a);if(c){if(!c.deletedAt)throw new A("Najpierw przenieś folder do kosza");e.tx(()=>{t.run("DELETE FROM items WHERE trashed_with = ?",[a]);const T=o(a),_=T.map(()=>"?").join(",");t.run(`UPDATE items SET folder_id = NULL WHERE folder_id IN (${_})`,T),t.run("DELETE FROM folders WHERE id = ?",[a])})}}}}const P=e=>({id:e.id,name:e.name,color:e.color});function V(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function Ze(e){const{db:t,env:i}=e;function n(o){const s=t.get("SELECT id, name, color FROM tags WHERE id = ?",[o]);if(!s)throw new w("Tag",o);return P(s)}function d(o){const s=V(o);if(!s)throw new A("Nazwa tagu nie może być pusta");const u=t.get("SELECT id, name, color FROM tags WHERE name = ?",[s]);if(u)return P(u);const a=i.newId(),c=R(i.now());return t.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[a,s,c,c]),n(a)}function l(o){return t.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[o]).map(P)}return{get:n,ensure:d,list(){return t.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(o=>({...P(o),itemCount:y(o.item_count)}))},forItem:l,setForItem(o,s){return e.tx(()=>{const u=new Map;for(const _ of s.map(V))_&&!u.has(_.toLowerCase())&&u.set(_.toLowerCase(),_);const a=[...u.values()].map(d),c=new Set(a.map(_=>_.id)),T=t.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[o]).map(_=>_.tag_id);for(const _ of T)c.has(_)||t.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[o,_]);for(const _ of c)T.includes(_)||t.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[o,_]);return t.run("UPDATE items SET updated_at = ? WHERE id = ?",[R(i.now()),o]),l(o)})},update(o,s){const u=n(o),a=s.name===void 0?u.name:V(s.name);if(!a)throw new A("Nazwa tagu nie może być pusta");if(t.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[a,o]))throw new A(`Tag „${a}” już istnieje`);return t.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[a,s.color===void 0?u.color:s.color,R(i.now()),o]),n(o)},remove(o){n(o),t.run("DELETE FROM tags WHERE id = ?",[o])}}}const le=["note","task","event"],ce=["todo","in_progress","done","on_hold"],Ae=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id, i.space_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency,
         i.opened_at, i.updated_at, i.deleted_at,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,ye=e=>({id:e.id,type:e.type,title:e.title,spaceId:e.space_id??null,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:y(e.priority),favorite:D(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:D(e.all_day),isPayment:D(e.is_payment),amountMinor:e.amount_minor==null?null:y(e.amount_minor),currency:e.currency,openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:y(e.file_count??0)});function X(e,t){if(t!=null&&!Be(t))throw new A(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${t}”`)}function Ee(e,t){if(e&&t&&e.slice(0,10)>t.slice(0,10))throw new A("Koniec nie może być przed początkiem")}function ue(e){if(e===0||e===1||e===2||e===3)return e;throw new A("Priorytet musi być liczbą 0–3")}function qe(e,t){const{db:i,env:n}=e;function d(r){return i.get("SELECT * FROM items WHERE id = ?",[r])}function l(r){const E=i.get("SELECT amount_minor, currency, account, payee FROM payments WHERE item_id = ?",[r]);return E?{amountMinor:E.amount_minor==null?null:y(E.amount_minor),currency:E.currency,account:E.account,payee:E.payee}:null}function o(r){return{id:r.id,type:r.type,title:r.title,spaceId:r.space_id??null,bodyJson:z(r.body_json),bodyText:r.body_text,folderId:r.folder_id,parentItemId:r.parent_item_id,categoryId:r.category_id,status:r.status,priority:y(r.priority),favorite:D(r.favorite),pinned:D(r.pinned),sortOrder:y(r.sort_order),startAt:r.start_at,dueAt:r.due_at,allDay:D(r.all_day),recurrence:z(r.recurrence),completedAt:r.completed_at,openedAt:r.opened_at,createdAt:r.created_at,updatedAt:r.updated_at,deletedAt:r.deleted_at,tags:t.tags.forItem(r.id),payment:l(r.id)}}function s(r){const E=d(r);if(!E)throw new w("Item",r);return o(E)}function u(r){const E=s(r);if(E.deletedAt)throw new w("Item",r);return E}function a(r){r&&t.folders.get(r)}function c(r,E){if(r){if(r===E)throw new A("Element nie może być swoim rodzicem");u(r)}}function T(r,E){const f=l(r),m=E.amountMinor===void 0?f?.amountMinor??null:E.amountMinor;if(m!=null&&(!Number.isInteger(m)||m<0))throw new A("Kwota musi być nieujemną liczbą całkowitą w groszach");i.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee`,[r,m,E.currency??f?.currency??"PLN",E.account??f?.account??"",E.payee??f?.payee??""])}function _(r){const E=r?i.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[r]):i.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(E?.m==null?0:y(E.m))+1}const N={get:u,getAny:s,create(r){if(!le.includes(r.type))throw new A(`Nieznany typ elementu: ${String(r.type)}`);if(X("Początek",r.startAt),X("Termin",r.dueAt),Ee(r.startAt,r.dueAt),r.status!=null&&!ce.includes(r.status))throw new A("Nieznany status");const E=ue(r.priority??1),f=r.folderId??null;a(f),c(r.parentItemId);const m=f?t.folders.get(f).itemDefaults:null,L=r.categoryId!==void 0?r.categoryId:m?.categoryId??null,p=r.payment!=null||r.payment===void 0&&!!m?.isPayment&&r.type==="task",S=r.type==="task"?r.status??"todo":null,g=r.dueAt??r.startAt,C=g?ne(g):!1,I=R(n.now()),U=n.newId();return e.tx(()=>(i.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[U,r.type,(r.title??"").trim(),r.bodyJson==null?null:JSON.stringify(r.bodyJson),r.bodyText??"",f,r.parentItemId??null,L,S,E,r.favorite?1:0,_(f),r.startAt??null,r.dueAt??null,C?1:0,S==="done"?I:null,I,I]),p&&T(U,{currency:m?.currency,...r.payment??{}}),r.tags?.length&&t.tags.setForItem(U,r.tags),u(U)))},update(r,E){const f=u(r);if(E.type!==void 0&&!le.includes(E.type))throw new A("Nieznany typ elementu");if(E.status!=null&&!ce.includes(E.status))throw new A("Nieznany status");X("Początek",E.startAt),X("Termin",E.dueAt),E.folderId!==void 0&&a(E.folderId),E.parentItemId!==void 0&&c(E.parentItemId,r);const m=E.type??f.type;let L=E.status===void 0?f.status:E.status;m==="task"&&L==null&&(L="todo"),m!=="task"&&(L=null);const p=E.startAt===void 0?f.startAt:E.startAt,S=E.dueAt===void 0?f.dueAt:E.dueAt;Ee(p,S);const g=S??p,C=R(n.now()),I=L==="done"?f.completedAt??C:null,U=E.priority===void 0?f.priority:ue(E.priority);return e.tx(()=>(i.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[m,E.title===void 0?f.title:E.title.trim(),E.bodyJson===void 0?f.bodyJson==null?null:JSON.stringify(f.bodyJson):E.bodyJson==null?null:JSON.stringify(E.bodyJson),E.bodyText??f.bodyText,E.folderId===void 0?f.folderId:E.folderId,E.parentItemId===void 0?f.parentItemId:E.parentItemId,E.categoryId===void 0?f.categoryId:E.categoryId,L,U,E.favorite??f.favorite?1:0,E.pinned??f.pinned?1:0,E.sortOrder??f.sortOrder,p,S,g&&ne(g)?1:0,I,C,r]),E.payment===null?i.run("DELETE FROM payments WHERE item_id = ?",[r]):E.payment!==void 0&&T(r,E.payment),u(r)))},setTags(r,E){return u(r),t.tags.setForItem(r,E)},setStatus(r,E){return N.update(r,{status:E})},toggleFavorite(r){return N.update(r,{favorite:!u(r).favorite})},markOpened(r){u(r),i.run("UPDATE items SET opened_at = ? WHERE id = ?",[R(n.now()),r])},setSpace(r,E){const f=u(r);return e.tx(()=>{const m=f.folderId?t.folders.find(f.folderId):null,L=m&&(m.spaceId??null)===E;i.run("UPDATE items SET space_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",[E,L?f.folderId:null,R(n.now()),r])}),u(r)},move(r,E,f){return u(r),a(E),e.tx(()=>{const m=(E?i.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[E,r]):i.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[r])).map(p=>p.id),L=f===void 0?m.length:Math.max(0,Math.min(f,m.length));m.splice(L,0,r),i.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[E,R(n.now()),r]),m.forEach((p,S)=>i.run("UPDATE items SET sort_order = ? WHERE id = ?",[S+1,p]))}),u(r)},trash(r){u(r);const E=R(n.now());i.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[E,E,r])},restore(r){const E=s(r);return e.tx(()=>{const f=R(n.now()),m=E.folderId?t.folders.find(E.folderId):null,L=m&&!m.deletedAt?m.id:null;i.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[L,f,r])}),u(r)},purge(r){if(!s(r).deletedAt)throw new A("Najpierw przenieś element do kosza");i.run("DELETE FROM items WHERE id = ?",[r])},query(r={}){const E=[r.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL"],f=[];if(r.type){const p=Array.isArray(r.type)?r.type:[r.type];E.push(`i.type IN (${p.map(()=>"?").join(",")})`),f.push(...p)}if(r.folderId===null)E.push("i.folder_id IS NULL");else if(r.folderId!==void 0)if(r.includeSubfolders){const p=t.folders.descendantIds(r.folderId);E.push(`i.folder_id IN (${p.map(()=>"?").join(",")})`),f.push(...p)}else E.push("i.folder_id = ?"),f.push(r.folderId);if(r.status){const p=Array.isArray(r.status)?r.status:[r.status];E.push(`i.status IN (${p.map(()=>"?").join(",")})`),f.push(...p)}r.openOnly&&E.push("(i.status IS NULL OR i.status <> 'done')"),r.favorite!==void 0&&E.push(`i.favorite = ${r.favorite?1:0}`),r.tagId&&(E.push("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)"),f.push(r.tagId)),r.payment!==void 0&&E.push(`p.item_id IS ${r.payment?"NOT NULL":"NULL"}`),r.dueFrom&&(E.push("i.due_at >= ?"),f.push(r.dueFrom)),r.dueTo&&(E.push("COALESCE(i.start_at, i.due_at) < ?"),f.push(r.dueTo));const m={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[r.orderBy??"manual"];r.orderBy==="opened"&&E.push("i.opened_at IS NOT NULL");const L=r.limit&&r.limit>0?` LIMIT ${Math.floor(r.limit)}`:"";return i.all(`${Ae} WHERE ${E.join(" AND ")} ORDER BY ${m}${L}`,f).map(ye)}};return N}const x={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function et(e){const{db:t,env:i}=e;return{get(n){const d=t.get("SELECT value FROM settings WHERE key = ?",[n]);if(!d)return x[n];try{return JSON.parse(d.value)}catch{return x[n]}},set(n,d){if(!(n in x))throw new Error(`Unknown setting: ${String(n)}`);return t.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[n,JSON.stringify(d),R(i.now())]),d},all(){const n={...x};for(const d of t.all("SELECT key, value FROM settings"))if(d.key in x)try{n[d.key]=JSON.parse(d.value)}catch{}return n}}}const B=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:y(e.size),width:e.width==null?null:y(e.width),height:e.height==null?null:y(e.height),createdAt:e.created_at}),Q=e=>({...B(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),Z=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,tt=/^[0-9a-f]{64}$/;function it(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function nt(e,t){const{db:i,env:n}=e;function d(o){const s=o.sha256?.toLowerCase();if(!s||!tt.test(s))throw new A("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(o.size)||o.size<0)throw new A("Nieprawidłowy rozmiar pliku");const u=i.get("SELECT * FROM files WHERE sha256 = ?",[s]);if(u)return B(u);const a=n.newId();return i.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[a,s,o.name.trim()||"plik",o.mime||"application/octet-stream",o.size,o.width??null,o.height??null,R(n.now())]),B(i.get("SELECT * FROM files WHERE id = ?",[a]))}function l(o,s,u="attachment"){if(t.items.get(o),!i.get("SELECT 1 FROM files WHERE id = ?",[s]))throw new w("File",s);const a=i.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[o]),c=R(n.now());i.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[o,s,u,(a?.m==null?0:y(a.m))+1,c]),i.run("UPDATE items SET updated_at = ? WHERE id = ?",[c,o])}return{register:d,addToItem(o,s){return e.tx(()=>{const u=d(s);return l(o,u.id),Q(i.get(`${Z} WHERE x.item_id = ? AND x.file_id = ?`,[o,u.id]))})},addToFolder(o,s,u){return e.tx(()=>{o&&t.folders.get(o);const a=d(s),c=t.items.create({type:"note",title:u?.trim()||it(a.name),folderId:o});return l(c.id,a.id),t.items.get(c.id)})},detach(o,s){t.items.get(o),i.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[o,s]),i.run("UPDATE items SET updated_at = ? WHERE id = ?",[R(n.now()),o])},rename(o,s){if(!s.trim())throw new A("Nazwa pliku nie może być pusta");i.run("UPDATE files SET name = ? WHERE id = ?",[s.trim(),o]);const u=i.get("SELECT * FROM files WHERE id = ?",[o]);if(!u)throw new w("File",o);return B(u)},forItem(o){return i.all(`${Z} WHERE x.item_id = ? ORDER BY x.sort_order`,[o]).map(Q)},forFolder(o,s={}){const u=["i.deleted_at IS NULL"],a=[];if(o===null)u.push("i.folder_id IS NULL");else if(s.includeSubfolders){const T=t.folders.descendantIds(o);u.push(`i.folder_id IN (${T.map(()=>"?").join(",")})`),a.push(...T)}else u.push("i.folder_id = ?"),a.push(o);s.imagesOnly&&u.push("f.mime LIKE 'image/%'");const c=s.limit&&s.limit>0?` LIMIT ${Math.floor(s.limit)}`:"";return i.all(`${Z} WHERE ${u.join(" AND ")} ORDER BY x.created_at DESC, f.name${c}`,a).map(Q)}}}function ot(e){const{db:t,env:i}=e,n="i.deleted_at IS NULL AND (i.status IS NULL OR i.status <> 'done')",d="(i.status IS NULL OR i.status <> 'done')";function l(s,u,a="i.due_at, i.priority DESC",c=50){return t.all(`${Ae} WHERE ${s} ORDER BY ${a} LIMIT ${c}`,u).map(ye)}function o(s,u){const a=t.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${s}`,u);return Number(a?.c??0)}return{summary(){const s=i.now(),u=Re(s),a=W(u,1),c=W(u,8),T=je(s),_=`${n} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,N=[u,T],r=`${n} AND i.type IN ('task', 'event') AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,E=[u,a,T],f=`i.deleted_at IS NULL AND i.type IN ('task', 'event') AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ? AND ${d})`,m=W(a,1),L="i.deleted_at IS NULL AND i.type IN ('task', 'event') AND i.due_at >= ? AND COALESCE(i.start_at, i.due_at) < ?",p=[a,m],S=`${n} AND i.type IN ('task', 'event') AND COALESCE(i.start_at, i.due_at) >= ? AND COALESCE(i.start_at, i.due_at) < ?`,g=[a,c],C=`${n} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,I=[u,W(u,7)];return{overdue:l(_,N),today:l(f,E),tomorrow:l(L,p),upcoming:l(S,g),recentNotes:l("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:l("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:l("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:o(_,N),today:o(r,E),tomorrow:o(`${n} AND ${L.replace("i.deleted_at IS NULL AND ","")}`,p),upcoming:o(S,g),paymentsThisWeek:o(C,I),notes:o("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:o("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const se="",ae="";function rt(e){const t=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(i=>i.trim()).filter(Boolean).slice(0,12);return t.length?t.map(i=>`"${i.replace(/"/g,"")}"*`).join(" "):null}const st=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function at(e,t){const i=/[\u0001\u0002]/g,n=e.replace(/^…/,"").replace(/…$/,""),d=n.replace(i,"");if(!d)return e;for(const l of t){const o=st(l).indexOf(d);if(o<0)continue;const s=l.slice(o,o+d.length);let u="",a=0;for(const c of n)c===se||c===ae?u+=c:u+=s[a++];return e.replace(n,u)}return e}const Se=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],v=e=>Se.reduce((t,[i,n])=>`replace(${t}, '${i}', '${n}')`,`coalesce(${e}, '')`),oe=e=>Se.reduce((t,[i,n])=>t.split(i).join(n),e).toLowerCase();function dt(e,t){const i=oe(e);let n=-1,d=0;for(const s of t){const u=i.indexOf(s);u>=0&&(n<0||u<n)&&(n=u,d=s.length)}if(n<0)return e.slice(0,90);const l=Math.max(0,n-40),o=Math.min(e.length,n+d+60);return`${l>0?"…":""}${e.slice(l,n)}${se}${e.slice(n,n+d)}${ae}${e.slice(n+d,o)}${o<e.length?"…":""}`}function lt(e,t){const{db:i}=e;function n(d,l){const o=oe(d).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!o.length)return[];const s=`(${v("i.title")} || ' ' || ${v("i.body_text")} || ' ' ||
      ${v("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${v("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return i.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${o.map(()=>`instr(lower(${s}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${v("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...o,o[0],l]).map(a=>({...a,snip:dt(a.body_text||a.title,o)}))}return{fullText:()=>t.fullText,search(d,l=30){const o=rt(d);if(!o)return[];const s=t.fullText?i.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${se}', '${ae}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[o,l]):n(d,l),u=oe(d.trim());return[...i.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${v("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[u]).map(c=>({kind:"folder",id:c.id,title:c.name,snippet:"",folderId:c.parent_id})),...s.map(c=>({kind:"item",id:c.id,title:c.title,snippet:at(c.snip??"",[c.body_text,c.title]),itemType:c.type,folderId:c.folder_id}))]}}}function ct(e){const{db:t}=e;return{list(){const i=t.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),n=t.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...i.map(d=>({kind:"item",id:d.id,title:d.title,deletedAt:d.deleted_at,itemType:d.type})),...n.map(d=>({kind:"folder",id:d.id,title:d.name,deletedAt:d.deleted_at}))].sort((d,l)=>l.deletedAt.localeCompare(d.deletedAt))}}}const Et={now:()=>new Date,newId:()=>crypto.randomUUID()};function ut(e,t={}){Ce(e),ke(e);const i=He(e,t.fullText!==!1),n={db:e,tx:De(e),env:t.env??Et},d=Je(n),l=Qe(n),o=Ze(n),s=qe(n,{tags:o,folders:l}),u=et(n),a=nt(n,{items:s,folders:l}),c=ot(n),T=lt(n,{fullText:i}),_=ct(n);return t.seed!==!1&&(d.seedDefaults(),t.seedFolders!==!1&&l.seedDefaults()),{api:{categories:{list:d.list,create:d.create,update:d.update,remove:d.remove},folders:{tree:l.tree,list:l.list,get:l.get,path:l.path,create:l.create,update:l.update,move:l.move,trash:l.trash,restore:l.restore,purge:l.purge,setSpace:l.setSpace},tags:{list:o.list,update:o.update,remove:o.remove},items:{get:s.get,create:s.create,update:s.update,setTags:s.setTags,setStatus:s.setStatus,toggleFavorite:s.toggleFavorite,markOpened:s.markOpened,move:s.move,trash:s.trash,restore:s.restore,purge:s.purge,query:s.query,setSpace:s.setSpace},files:{register:a.register,addToItem:a.addToItem,addToFolder:a.addToFolder,detach:a.detach,rename:a.rename,forItem:a.forItem,forFolder:a.forFolder},trash:{list:_.list},dashboard:{summary:c.summary},search:{query:T.search,fullText:T.fullText},settings:{all:u.all,get:u.get,set:u.set}},close:()=>e.close()}}const Tt=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","folders.setSpace","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","items.setSpace","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set"]);function mt(e,t){if(typeof t!="string")return null;const[i,n,...d]=t.split(".");if(!i||!n||d.length||!Object.prototype.hasOwnProperty.call(e,i))return null;const l=e[i];if(!Object.prototype.hasOwnProperty.call(l,n))return null;const o=l[n];return typeof o=="function"?o:null}function _t(e,t,i){const n=mt(e,t);if(!n)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(t)}`}},mutated:!1};try{return{result:{ok:!0,value:n(...Array.isArray(i)?i:[])},mutated:Tt.has(t)}}catch(d){const l=d;return l.name!=="ValidationError"&&l.name!=="NotFoundError"&&console.error(`[core] ${String(t)} failed`,l),{result:{ok:!1,error:{name:l.name||"Error",message:l.message||String(d)}},mutated:!1}}}function ft(e,t){const i=new e.Database(t??null),n=l=>l.map(o=>typeof o=="bigint"?Number(o):o);function d(l,o,s){const u=i.prepare(l);try{o.length&&u.bind(n(o));const a=[];for(;u.step()&&(a.push(u.getAsObject()),!!s););return a}finally{u.free()}}return{exec:l=>{i.exec(l)},run:(l,o=[])=>(i.run(l,n(o)),{changes:i.getRowsModified()}),get:(l,o=[])=>d(l,o,!1)[0],all:(l,o=[])=>d(l,o,!0),close:()=>i.close(),exportBytes:()=>{const l=i.export();return i.exec("PRAGMA foreign_keys = ON;"),l}}}const Nt="notatnik",Y="files",M="blobs";function Oe(){return new Promise((e,t)=>{const i=indexedDB.open(Nt,2);i.onupgradeneeded=()=>{const n=i.result.objectStoreNames;n.contains(Y)||i.result.createObjectStore(Y),n.contains(M)||i.result.createObjectStore(M)},i.onsuccess=()=>e(i.result),i.onerror=()=>t(i.error)})}async function G(e,t=Y){const i=await Oe();try{return await new Promise((n,d)=>{const l=i.transaction(t,"readonly").objectStore(t).get(e);l.onsuccess=()=>n(l.result?new Uint8Array(l.result):null),l.onerror=()=>d(l.error)})}finally{i.close()}}async function ge(e,t,i=Y){const n=await Oe();try{await new Promise((d,l)=>{const o=n.transaction(i,"readwrite");o.objectStore(i).put(t.slice().buffer,e),o.oncomplete=()=>d(),o.onerror=()=>l(o.error),o.onabort=()=>l(o.error)})}finally{n.close()}}async function Lt(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function pt(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const t=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(t)].map(i=>i.toString(16).padStart(2,"0")).join("")}function Rt(e){const t=new Map,i=new Map;return{async put(n,d){const l=await pt(n);return e()?await G(l,M).catch(()=>null)||await ge(l,n,M):t.set(l,n),{sha256:l,size:n.byteLength}},async read(n){return t.get(n)??(e()?await G(n,M).catch(()=>null):null)},async url(n,d){const l=i.get(n);if(l)return l;const o=t.get(n)??(e()?await G(n,M).catch(()=>null):null);if(!o)return null;const s=URL.createObjectURL(new Blob([o.slice().buffer],{type:d||"application/octet-stream"}));return i.set(n,s),s}}}const Te=e=>e.sharedId?[e.privateId,e.sharedId]:[e.privateId],At=e=>typeof e=="bigint"?Number(e):e;function we(e,t){const i=t.split(j);return[e.key.map(n=>`${n} = ?`).join(" AND "),e.key.map((n,d)=>i[d]??"")]}function Ie(e,t,i){const[n,d]=we(t,i),l=e.get(`SELECT * FROM ${t.name} WHERE ${n}`,d);if(!l)return;const o={};for(const[s,u]of Object.entries(l))o[s]=At(u);return o}function he(e,t,i){return e.get("SELECT space_id FROM items WHERE id = ?",[String(t)])?.space_id??i.privateId}function yt(e,t,i,n){switch(t.scope){case"own":return[i.space_id??n.privateId];case"item":return[he(e,i[t.itemCol],n)];case"all":return Te(n);case"file":{const d=e.all("SELECT DISTINCT i.space_id AS s FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ?",[String(i.id)]).map(s=>s.s??n.privateId),l=new Set(Te(n)),o=[...new Set(d)].filter(s=>l.has(s));return o.length?o:[n.privateId]}}}function St(e){return Number(e.get("SELECT COUNT(*) AS n FROM sync_outbox")?.n??0)}function Ot(e,t,i=300){const n=e.all("SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at LIMIT ?",[i]),d=[];for(const l of n){const o=Ne.get(l.tbl);if(!o)continue;const s=Ie(e,o,l.id);if(!s){d.push({space_id:null,tbl:o.name,id:l.id,data:null,deleted:!0,stamp:l.changed_at,exclusive:!1});continue}const u=o.scope==="own"||o.scope==="item";for(const a of yt(e,o,s,t))d.push({space_id:a,tbl:o.name,id:l.id,data:s,deleted:!1,stamp:l.changed_at,exclusive:u}),o.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(s.sha256),a,"up",String(s.mime)])}return{entries:d,taken:n}}function gt(e,t){e.exec("BEGIN");try{for(const i of t)e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?",[i.tbl,i.id,i.changed_at]);e.exec("COMMIT")}catch(i){throw e.exec("ROLLBACK"),i}}const me=new WeakMap;function wt(e,t){let i=me.get(e);i||me.set(e,i=new Map);let n=i.get(t);return n||(n=new Set(e.all(`PRAGMA table_info(${t})`).map(d=>d.name)),i.set(t,n)),n}function q(e,t,i){return e.get("SELECT local_id FROM sync_idmap WHERE tbl = ? AND remote_id = ?",[t,i])?.local_id??i}function It(e,t,i,n){return t.scope==="own"?i.space_id??n.privateId:t.scope==="item"?he(e,i[t.itemCol],n):null}function ht(e,t,i){if(!t.length)return 0;let n=0;e.exec("PRAGMA foreign_keys = OFF"),e.exec("BEGIN");try{e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");for(const d of t){e.exec("SAVEPOINT rec");try{n+=Dt(e,d,i),e.exec("RELEASE rec")}catch(l){e.exec("ROLLBACK TO rec; RELEASE rec")}}e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'"),e.exec("COMMIT")}catch(d){throw e.exec("ROLLBACK"),d}finally{e.exec("PRAGMA foreign_keys = ON")}return n}function Dt(e,t,i){let n=0;const d=Ne.get(t.tbl);if(!d)return 0;const l=t.id.split(j),o=d.key.map((m,L)=>{const p=l[L]??"";return d.refs?.[m]?q(e,d.refs[m],p):d.mergeBy?q(e,d.name,p):p}),s=o.join(j),u=e.get("SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,s]);if(u&&u.changed_at>t.stamp)return n;const a=Ie(e,d,s);if(t.deleted||!t.data){if(!a)return n;const m=It(e,d,a,i);if(m!==null&&m!==t.space_id)return n;const[L,p]=we(d,s);return n+=e.run(`DELETE FROM ${d.name} WHERE ${L}`,p).changes,u&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,s]),n}const c={...t.data},T=t.space_id===i.privateId?null:t.space_id,_=d.name!=="folders"||c.parent_id==null&&c.deleted_at==null;if(d.mergeBy&&!a&&_){const m=d.mergeBy,L=e.get(`SELECT id FROM ${d.name} WHERE ${m.col} = ?${m.nocase?" COLLATE NOCASE":""}${m.where?` AND ${m.where}`:""}${m.sameSpace?" AND space_id IS ?":""} AND id <> ? LIMIT 1`,m.sameSpace?[String(c[m.col]),T,String(c.id)]:[String(c[m.col]),String(c.id)]);if(L)return e.run("INSERT OR REPLACE INTO sync_idmap (tbl, remote_id, local_id) VALUES (?, ?, ?)",[d.name,String(c.id),L.id]),n}for(const[m,L]of Object.entries(d.refs??{}))typeof c[m]=="string"&&(c[m]=q(e,L,c[m]));if(d.key.forEach((m,L)=>{c[m]=o[L]}),d.scope==="own"&&(c.space_id=T),a&&typeof a.updated_at=="string"&&typeof c.updated_at=="string"&&a.updated_at>c.updated_at)return n;const N=Object.keys(c).filter(m=>wt(e,d.name).has(m)&&!(d.localOnly??[]).includes(m)),r=N.map(m=>{const L=c[m];return L===void 0?null:typeof L=="object"&&L!==null?JSON.stringify(L):L}),E=N.filter(m=>!d.key.includes(m)),f=E.length?`DO UPDATE SET ${E.map(m=>`${m} = excluded.${m}`).join(", ")}`:"DO NOTHING";return n+=e.run(`INSERT INTO ${d.name} (${N.join(", ")}) VALUES (${N.map(()=>"?").join(", ")}) ON CONFLICT(${d.key.join(", ")}) ${f}`,r).changes,u&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[d.name,s]),d.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(c.sha256),t.space_id,"down",String(c.mime)]),n}function re(e,t){return e.get("SELECT value FROM sync_state WHERE key = ?",[t])?.value??null}function H(e,t,i){i===null?e.run("DELETE FROM sync_state WHERE key = ?",[t]):e.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",[t,i])}const Ct=50,_e=500,Ut=8;async function vt(e,t,i,n){for(let s=0;s<100;s++){const{entries:u,taken:a}=Ot(e,t);if(!a.length)break;u.length&&await i.push(u),gt(e,a)}let d=0,l=Number(re(e,"cursor")??0);for(let s=0;s<200;s++){const u=Math.max(0,l-(s===0?Ct:0)),a=await i.pull(u,_e);if(!a.length)break;d+=ht(e,a,t);const c=Math.max(...a.map(T=>T.rev));if(c>l&&(l=c,H(e,"cursor",String(l))),a.length<_e)break}const o=e.all("SELECT * FROM sync_blobs WHERE tries < 40 ORDER BY dir DESC, tries LIMIT ?",[Ut]);for(const s of o)try{let u=!1;if(s.dir==="up"){const a=await n.read(s.sha256);a&&await i.upload(s.space_id,s.sha256,a,s.mime),u=!0}else if(await n.read(s.sha256))u=!0;else{const a=await i.download(s.space_id,s.sha256);a&&(await n.write(a,s.mime),u=!0,d++)}u?e.run("DELETE FROM sync_blobs WHERE sha256 = ? AND space_id = ? AND dir = ?",[s.sha256,s.space_id,s.dir]):e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[s.sha256,s.space_id,s.dir])}catch{e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[s.sha256,s.space_id,s.dir])}return d}class O extends Error{constructor(t,i=0,n=!1){super(t),this.status=i,this.offline=n}}const ee=e=>({accessToken:e.access_token,refreshToken:e.refresh_token,expiresAt:Date.now()+e.expires_in*1e3,userId:e.user.id,email:e.user.email});function Ft(e,t){const i=t.msg??t.message??t.error_description??"",n=t.error_code??t.code??"";return n==="invalid_credentials"||/invalid login credentials/i.test(i)?"Nieprawidłowy e-mail lub hasło.":n==="user_already_exists"||/already registered/i.test(i)?"To konto już istnieje — zaloguj się.":n==="weak_password"||/password should be/i.test(i)?"Hasło jest za krótkie (minimum 6 znaków).":/database error saving new user|nie ma zaproszenia/i.test(i)||n==="unexpected_failure"?"Ten adres e-mail nie ma zaproszenia do Notario.":n==="validation_failed"||/email/i.test(i)&&e===400?"Sprawdź adres e-mail.":e===429?"Za dużo prób. Spróbuj za chwilę.":i||`Błąd serwera (${e}).`}function Mt(e,t){let i=t.load(),n=null;async function d(T,_={}){const N=new Headers(_.headers);N.set("apikey",e.key),_.auth!==!1&&N.set("Authorization",`Bearer ${await s()}`);let r;try{r=await fetch(`${e.url}${T}`,{..._,headers:N})}catch{throw new O("Brak połączenia z internetem.",0,!0)}return r}async function l(T,_){const N=await d(T,{method:"POST",auth:!1,headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}),r=await N.json().catch(()=>({}));if(!N.ok)throw new O(Ft(N.status,r),N.status);return r}function o(T){i=T,t.save(T)}async function s(){if(!i)throw new O("Nie zalogowano.",401);return i.expiresAt-Date.now()>6e4?i.accessToken:(n??(n=(async()=>{try{const T=await l("/auth/v1/token?grant_type=refresh_token",{refresh_token:i.refreshToken}),_=ee(T);return o(_),_}catch(T){throw T instanceof O&&(T.status===400||T.status===401)&&o(null),T}finally{n=null}})()),(await n).accessToken)}async function u(T){if(T.status===401)throw new O("Sesja wygasła. Zaloguj się ponownie.",401);if(!T.ok){const N=await T.text().catch(()=>"");throw new O(`Serwer odrzucił zapytanie (${T.status}) ${N.slice(0,200)}`,T.status)}const _=await T.text();return _?JSON.parse(_):null}const a=async(T,_)=>u(await d(`/rest/v1/rpc/${T}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}));return{transport:{async push(T){await a("push_records",{changes:T})},async pull(T,_){const N=`select=space_id,tbl,id,data,deleted,stamp,rev&rev=gt.${T}&order=rev.asc&limit=${_}`;return u(await d(`/rest/v1/records?${N}`))},async upload(T,_,N,r){const E=await d(`/storage/v1/object/blobs/${T}/${_}`,{method:"POST",headers:{"Content-Type":r||"application/octet-stream"},body:N.slice().buffer});if(E.ok||E.status===409)return;const f=await E.text().catch(()=>"");if(!(E.status===400&&/exists|duplicate/i.test(f)))throw new O(`Nie udało się wysłać pliku (${E.status}).`,E.status)},async download(T,_){const N=await d(`/storage/v1/object/authenticated/blobs/${T}/${_}`);if(N.status===404||N.status===400)return null;if(!N.ok)throw new O(`Nie udało się pobrać pliku (${N.status}).`,N.status);return new Uint8Array(await N.arrayBuffer())}},session:()=>i,async signIn(T,_){const N=await l("/auth/v1/token?grant_type=password",{email:T.trim(),password:_}),r=ee(N);return o(r),r},async signUp(T,_){const N=await l("/auth/v1/signup",{email:T.trim(),password:_});if("access_token"in N&&N.access_token){const r=ee(N);return o(r),r}return this.signIn(T,_)},async signOut(){const T=i;o(null),T&&await fetch(`${e.url}/auth/v1/logout`,{method:"POST",headers:{apikey:e.key,Authorization:`Bearer ${T.accessToken}`}}).catch(()=>{})},async spaces(){const T=await a("my_spaces",{}),_=T.find(N=>N.kind==="private");if(!_)throw new O("Konto nie ma jeszcze swojej przestrzeni na serwerze.");return{privateId:_.id,sharedId:T.find(N=>N.kind==="shared")?.id??null}}}}function bt(e){const t=Mt(e.config,e.store),i=new Set;let n=t.session()?"idle":"off",d=null,l=null,o=null,s=!1,u;function a(){const f=re(e.db,"spaces");return f?JSON.parse(f):null}function c(){const f=t.session();return{signedIn:!!f,email:f?.email??null,state:f?n:"off",error:d,lastSyncAt:l,pending:St(e.db),sharedSpaceId:f?a()?.sharedId??null:null}}const T=()=>{const f=c();i.forEach(m=>m(f))};async function _(){const f=t.session();if(!f){n="off";return}n="syncing",T();try{re(e.db,"user")!==f.userId&&(H(e.db,"user",f.userId),H(e.db,"cursor",null),H(e.db,"spaces",null));let m=a();m||(m=await t.spaces(),H(e.db,"spaces",JSON.stringify(m)));const L=await vt(e.db,m,t.transport,e.blobs);e.onDbWritten(),L>0&&e.onRemoteChange(),n="idle",d=null,l=Date.now()}catch(m){const L=m;n=L.offline?"offline":"error",d=L.offline?null:L.message,t.session()||(n="off"),e.onDbWritten()}T()}function N(){return clearTimeout(u),o?(s=!0,o):(o=(async()=>{do s=!1,await _();while(s)})().finally(()=>{o=null}),o)}function r(f=1200){t.session()&&(clearTimeout(u),u=setTimeout(()=>void N(),f))}const E=setInterval(()=>{t.session()&&e.visible()&&!o&&N()},e.pollMs??5e3);return{status:c,syncNow:N,schedule:r,onStatus(f){return i.add(f),()=>i.delete(f)},async signIn(f,m){return await t.signIn(f,m),d=null,await N(),c()},async signUp(f,m){return await t.signUp(f,m),d=null,await N(),c()},async signOut(){return await t.signOut(),n="off",d=null,T(),c()},stop(){clearInterval(E),clearTimeout(u)}}}const kt={url:"https://wdqljuhkaqokjelwuyvf.supabase.co",key:"sb_publishable_Si1QdjcU3n_-H_gqpZ6Z6A_XD2lYgmT"},fe="notatnik.sqlite",te="notario.session",$t=400;async function xt(e){const t=await e(),i={persistent:!1};let n=null;try{n=await G(fe),i.persistent=!0}catch{i.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const d=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;i.persistent&&!await Lt()&&!d&&(i.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const l=ft(t,n),o=ut(l);let s=!n,u,a=Promise.resolve();const c=()=>{if(clearTimeout(u),!s||!i.persistent)return a;s=!1;const m=l.exportBytes();return a=a.then(()=>ge(fe,m)).then(()=>{i.lastSavedAt=Date.now()}).catch(L=>{s=!0,console.error("Saving database failed",L),i.note="Nie udało się zapisać danych w pamięci przeglądarki."}),a},T=()=>{s=!0,clearTimeout(u),u=setTimeout(c,$t)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&c()}),window.addEventListener("pagehide",()=>void c()),s&&T();const _=new Set,N=m=>{const L={method:m,at:Date.now()};queueMicrotask(()=>_.forEach(p=>p(L)))},r=Rt(()=>i.persistent),E=bt({db:l,config:kt,store:{load(){try{return JSON.parse(localStorage.getItem(te)??"null")}catch{return null}},save(m){try{m?localStorage.setItem(te,JSON.stringify(m)):localStorage.removeItem(te)}catch{}}},blobs:{read:m=>r.read(m),write:async(m,L)=>{await r.put(m,L)}},onDbWritten:T,onRemoteChange:()=>N("sync.pull"),visible:()=>document.visibilityState==="visible"&&navigator.onLine!==!1});window.addEventListener("online",()=>void E.syncNow()),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&E.syncNow()}),E.syncNow();const f={async call(m,L){const{result:p,mutated:S}=_t(o.api,m,L);return S&&(T(),N(m),E.schedule()),p.ok?{ok:!0,value:p.value===void 0?void 0:structuredClone(p.value)}:p},onChanged(m){return _.add(m),()=>_.delete(m)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...i}),blobs:r,sync:{status:E.status,onStatus:E.onStatus,signIn:E.signIn,signUp:E.signUp,signOut:E.signOut,syncNow:E.syncNow}};window.bridge=f}export{xt as installWebBridge};
