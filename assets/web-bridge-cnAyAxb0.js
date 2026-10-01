function he(e){let t=0;return function(n){const a=`sp_${t}`;e.exec(t===0?"BEGIN IMMEDIATE":`SAVEPOINT ${a}`),t++;try{const E=n();return t--,e.exec(t===0?"COMMIT":`RELEASE ${a}`),E}catch(E){throw t--,e.exec(t===0?"ROLLBACK":`ROLLBACK TO ${a}; RELEASE ${a}`),E}}}function De(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const ie=[{name:"categories",key:["id"],scope:"all",mergeBy:{col:"name",where:"deleted_at IS NULL",nocase:!0}},{name:"tags",key:["id"],scope:"all",mergeBy:{col:"name",nocase:!0}},{name:"folders",key:["id"],scope:"own",refs:{category_id:"categories"}},{name:"items",key:["id"],scope:"own",refs:{category_id:"categories"},localOnly:["opened_at"]},{name:"files",key:["id"],scope:"file",mergeBy:{col:"sha256"}},{name:"payments",key:["item_id"],scope:"item",itemCol:"item_id"},{name:"occurrence_states",key:["item_id","occurrence_key"],scope:"item",itemCol:"item_id"},{name:"checklist_items",key:["id"],scope:"item",itemCol:"item_id"},{name:"item_tags",key:["item_id","tag_id"],scope:"item",itemCol:"item_id",refs:{tag_id:"tags"}},{name:"item_links",key:["from_item_id","to_item_id","relation"],scope:"item",itemCol:"from_item_id"},{name:"item_files",key:["item_id","file_id"],scope:"item",itemCol:"item_id",refs:{file_id:"files"}},{name:"reminder_rules",key:["id"],scope:"item",itemCol:"item_id"}],fe=new Map(ie.map(e=>[e.name,e])),G="|",Y=(e,t)=>e.key.map(i=>`${t}.${i}`).join(` || '${G}' || `),b="strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",k="(SELECT value FROM sync_state WHERE key = 'applying') = '0'",Ce=["type","title","body_json","body_text","folder_id","parent_item_id","category_id","status","priority","favorite","pinned","sort_order","start_at","due_at","all_day","recurrence","completed_at","trashed_with","created_at","updated_at","deleted_at","space_id"];function Ue(){const e=[`
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
`];for(const i of ie){const n=E=>`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('${i.name}', ${Y(i,E)}, ${b});`,a=i.name==="items"?` OF ${Ce.filter(E=>!(i.localOnly??[]).includes(E)).join(", ")}`:"";e.push(`
CREATE TRIGGER sync_${i.name}_ai AFTER INSERT ON ${i.name} WHEN ${k} BEGIN ${n("new")} END;
CREATE TRIGGER sync_${i.name}_au AFTER UPDATE${a} ON ${i.name} WHEN ${k} BEGIN ${n("new")} END;
CREATE TRIGGER sync_${i.name}_ad AFTER DELETE ON ${i.name} WHEN ${k} BEGIN ${n("old")} END;`),e.push(`INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${i.name}', ${Y(i,i.name)}, ${b} FROM ${i.name};`)}e.push(`
CREATE TRIGGER sync_item_files_file_ai AFTER INSERT ON item_files WHEN ${k} BEGIN
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) VALUES ('files', new.file_id, ${b});
END;`);const t=ie.filter(i=>i.scope==="item");return e.push(`
CREATE TRIGGER sync_items_space_au AFTER UPDATE OF space_id ON items WHEN ${k} BEGIN
${t.map(i=>`  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT '${i.name}', ${Y(i,i.name)}, ${b} FROM ${i.name} WHERE ${i.itemCol} = new.id;`).join(`
`)}
  INSERT OR REPLACE INTO sync_outbox (tbl, id, changed_at) SELECT 'files', file_id, ${b} FROM item_files WHERE item_id = new.id;
END;`),e.join(`
`)}const w=e=>`replace(replace(${e}, 'ł', 'l'), 'Ł', 'L')`,C=e=>w(`
  coalesce((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = ${e}), '')
  || ' ' ||
  coalesce((SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id
            WHERE x.item_id = ${e}), '')`),ve=[{version:1,name:"initial schema",sql:`
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

`},{version:2,name:"sync: spaces and change log",sql:Ue()}],Fe=`
-- Full-text search ------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(
  item_id UNINDEXED,
  title,
  body,
  extra,                                          -- tag names + attachment file names
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (item_id, title, body, extra) VALUES (new.id, ${w("new.title")}, ${w("new.body_text")}, '');
END;
CREATE TRIGGER items_fts_au AFTER UPDATE OF title, body_text ON items BEGIN
  UPDATE items_fts SET title = ${w("new.title")}, body = ${w("new.body_text")} WHERE item_id = new.id;
END;
CREATE TRIGGER items_fts_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE item_id = old.id;
END;
CREATE TRIGGER item_tags_fts_ai AFTER INSERT ON item_tags BEGIN
  UPDATE items_fts SET extra = ${C("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_tags_fts_ad AFTER DELETE ON item_tags BEGIN
  UPDATE items_fts SET extra = ${C("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER item_files_fts_ai AFTER INSERT ON item_files BEGIN
  UPDATE items_fts SET extra = ${C("new.item_id")} WHERE item_id = new.item_id;
END;
CREATE TRIGGER item_files_fts_ad AFTER DELETE ON item_files BEGIN
  UPDATE items_fts SET extra = ${C("old.item_id")} WHERE item_id = old.item_id;
END;
CREATE TRIGGER tags_fts_au AFTER UPDATE OF name ON tags BEGIN
  UPDATE items_fts SET extra = ${C("items_fts.item_id")}
  WHERE item_id IN (SELECT item_id FROM item_tags WHERE tag_id = new.id);
END;
`,Me=`
DELETE FROM items_fts;
INSERT INTO items_fts (item_id, title, body, extra)
  SELECT i.id, ${w("i.title")}, ${w("i.body_text")}, ${C("i.id")} FROM items i;
`;function be(e,t=ve){const i=e.get("PRAGMA user_version"),n=Number(i?.user_version??0),a=[],E=[...t].sort((r,s)=>r.version-s.version).filter(r=>r.version>n);for(const r of E){e.exec("BEGIN IMMEDIATE");try{e.exec(r.sql),e.exec(`PRAGMA user_version = ${r.version}`),e.exec("COMMIT"),a.push(r.version)}catch(s){throw e.exec("ROLLBACK"),new Error(`Migration ${r.version} (${r.name}) failed: ${s.message}`)}}return a}function ke(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function $e(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function xe(e,t=!0){if($e(e))return!0;if(!t||!ke(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(Fe),e.exec(Me),e.exec("COMMIT"),!0}catch(i){throw e.exec("ROLLBACK"),i}}class y extends Error{constructor(t){super(t),this.name="ValidationError"}}class S extends Error{constructor(t,i){super(`${t} not found: ${i}`),this.name="NotFoundError"}}const I=e=>e===1||e===1n||e===!0,A=e=>typeof e=="bigint"?Number(e):e;function j(e){if(e==null||e==="")return null;try{return JSON.parse(String(e))}catch{return null}}function Ne(e,t,i,n){const a=e.db.get(`SELECT MAX(sort_order) AS m FROM ${t} WHERE ${i}`,n);return(a?.m==null?0:A(a.m))+1}const v=(e,t=2)=>String(e).padStart(t,"0"),He=/^(\d{4})-(\d{2})-(\d{2})$/,We=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;function ne(e){const t=He.exec(e);return!!t&&pe(+t[1],+t[2],+t[3])}function Xe(e){const t=We.exec(e);return!!t&&pe(+t[1],+t[2],+t[3])&&+t[4]<24&&+t[5]<60}function Pe(e){return ne(e)||Xe(e)}function pe(e,t,i){return t>=1&&t<=12&&i>=1&&i<=Be(e,t)}function Be(e,t){return new Date(Date.UTC(e,t,0)).getUTCDate()}function Le(e){return`${e.getFullYear()}-${v(e.getMonth()+1)}-${v(e.getDate())}`}function Ge(e){return`${Le(e)}T${v(e.getHours())}:${v(e.getMinutes())}`}function J(e,t){const[i,n,a]=e.split("-").map(Number),E=new Date(Date.UTC(i,n-1,a+t));return`${E.getUTCFullYear()}-${v(E.getUTCMonth()+1)}-${v(E.getUTCDate())}`}function R(e){return e.toISOString()}const de=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:A(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),je=/^#[0-9a-fA-F]{6}$/,ze=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}];function Ye(e){const{db:t,env:i}=e;function n(r){const s=t.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[r]);if(!s)throw new S("Category",r);return de(s)}function a(r,s){if(r!==void 0&&!r.trim())throw new y("Nazwa kategorii nie może być pusta");if(s!==void 0&&!je.test(s))throw new y("Kolor musi mieć format #RRGGBB")}function E(r){a(r.name,r.color);const s=i.newId(),T=R(i.now());return t.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[s,r.name.trim(),r.color,r.icon??null,Ne(e,"categories","deleted_at IS NULL",[]),T,T]),n(s)}return{create:E,list(){return t.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(de)},get:n,update(r,s){const T=n(r);return a(s.name,s.color),t.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[s.name?.trim()??T.name,s.color??T.color,s.icon===void 0?T.icon:s.icon,s.sortOrder??T.sortOrder,R(i.now()),r]),n(r)},remove(r){n(r),e.tx(()=>{const s=R(i.now());t.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[s,r]),t.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[s,r]),t.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[s,s,r])})},seedDefaults(){const r=t.get("SELECT COUNT(*) AS c FROM categories");if(!(A(r?.c??0)>0))for(const s of ze)E(s)}}}const K=e=>({id:e.id,parentId:e.parent_id,spaceId:e.space_id??null,kind:e.kind,name:e.name,icon:e.icon,color:e.color,description:e.description,categoryId:e.category_id,sortOrder:A(e.sort_order),calendarSync:I(e.calendar_sync),itemDefaults:j(e.item_defaults),settings:j(e.settings),createdAt:e.created_at,updatedAt:e.updated_at,deletedAt:e.deleted_at}),Je=`
  WITH RECURSIVE sub(id) AS (
    SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
  ) SELECT id FROM sub`;function Ke(e){const{db:t,env:i}=e;function n(l){const c=t.get("SELECT * FROM folders WHERE id = ?",[l]);return c?K(c):null}function a(l,c){const u=r(l),_=u.map(()=>"?").join(","),N=R(i.now());t.run(`UPDATE folders SET space_id = ?, updated_at = ? WHERE id IN (${_}) AND space_id IS NOT ?`,[c,N,...u,c]),t.run(`UPDATE items SET space_id = ?, updated_at = ? WHERE folder_id IN (${_}) AND space_id IS NOT ?`,[c,N,...u,c])}function E(l){const c=n(l);if(!c||c.deletedAt)throw new S("Folder",l);return c}function r(l){return t.all(Je,[l]).map(c=>c.id)}function s(l){l&&E(l)}function T(l){return l===null?["parent_id IS NULL AND deleted_at IS NULL",[]]:["parent_id = ? AND deleted_at IS NULL",[l]]}return{get:E,find:n,descendantIds:r,list(){return t.all("SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order, name").map(K)},tree(){const l=t.all(`
        SELECT f.*,
          (SELECT COUNT(*) FROM items i WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS item_count,
          (SELECT fl.sha256 FROM items i JOIN item_files x ON x.item_id = i.id JOIN files fl ON fl.id = x.file_id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL AND fl.mime LIKE 'image/%'
            ORDER BY x.created_at DESC LIMIT 1) AS cover_sha,
          (SELECT COUNT(*) FROM items i JOIN item_files x ON x.item_id = i.id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS file_count
        FROM folders f WHERE f.deleted_at IS NULL ORDER BY f.sort_order, f.name`),c=new Map;for(const _ of l)c.set(_.id,{...K(_),children:[],itemCount:A(_.item_count),coverSha:_.cover_sha??null,fileCount:A(_.file_count)});const u=[];for(const _ of c.values()){const N=_.parentId?c.get(_.parentId):void 0;(N?N.children:u).push(_)}return u},path(l){const c=[];let u=E(l);const _=new Set;for(;u&&!_.has(u.id);)_.add(u.id),c.unshift(u),u=u.parentId?n(u.parentId):null;return c},create(l){const c=l.name?.trim();if(!c)throw new y("Nazwa folderu nie może być pusta");const u=l.parentId??null;s(u);const _=i.newId(),N=R(i.now()),[o,d]=T(u);return t.run(`INSERT INTO folders (id, parent_id, kind, name, icon, color, description, category_id, sort_order,
           calendar_sync, item_defaults, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[_,u,l.kind??"folder",c,l.icon??null,l.color??null,l.description??"",l.categoryId??null,Ne(e,"folders",o,d),l.calendarSync===!1?0:1,l.itemDefaults?JSON.stringify(l.itemDefaults):null,N,N]),E(_)},update(l,c){const u=E(l);if(c.name!==void 0&&!c.name.trim())throw new y("Nazwa folderu nie może być pusta");return t.run(`UPDATE folders SET kind = ?, name = ?, icon = ?, color = ?, description = ?, category_id = ?,
           calendar_sync = ?, item_defaults = ?, settings = ?, updated_at = ? WHERE id = ?`,[c.kind??u.kind,c.name?.trim()??u.name,c.icon===void 0?u.icon:c.icon,c.color===void 0?u.color:c.color,c.description??u.description,c.categoryId===void 0?u.categoryId:c.categoryId,c.calendarSync??u.calendarSync?1:0,JSON.stringify(c.itemDefaults===void 0?u.itemDefaults:c.itemDefaults),JSON.stringify(c.settings===void 0?u.settings:c.settings),R(i.now()),l]),E(l)},move(l,c,u){if(E(l),c!==null&&(s(c),r(l).includes(c)))throw new y("Nie można przenieść folderu do jego podfolderu");return e.tx(()=>{const[_,N]=T(c),o=t.all(`SELECT id FROM folders WHERE ${_} AND id <> ? ORDER BY sort_order, name`,[...N,l]).map(f=>f.id),d=u===void 0?o.length:Math.max(0,Math.min(u,o.length));o.splice(d,0,l);const m=R(i.now());t.run("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?",[c,m,l]),o.forEach((f,p)=>t.run("UPDATE folders SET sort_order = ? WHERE id = ?",[p+1,f])),c!==null&&a(l,E(c).spaceId)}),E(l)},setSpace(l,c){return E(l),e.tx(()=>a(l,c)),E(l)},trash(l){E(l),e.tx(()=>{const c=R(i.now()),u=r(l),_=u.map(()=>"?").join(",");t.run(`UPDATE items SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE folder_id IN (${_}) AND deleted_at IS NULL`,[c,l,c,...u]),t.run(`UPDATE folders SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE id IN (${_}) AND deleted_at IS NULL`,[c,l,c,...u])})},restore(l){const c=n(l);if(!c)throw new S("Folder",l);return e.tx(()=>{const u=R(i.now());t.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[u,l]),t.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[u,l]),t.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE id = ?",[u,l]);const _=c.parentId?n(c.parentId):null;c.parentId&&(!_||_.deletedAt)&&t.run("UPDATE folders SET parent_id = NULL WHERE id = ?",[l])}),E(l)},purge(l){const c=n(l);if(c){if(!c.deletedAt)throw new y("Najpierw przenieś folder do kosza");e.tx(()=>{t.run("DELETE FROM items WHERE trashed_with = ?",[l]);const u=r(l),_=u.map(()=>"?").join(",");t.run(`UPDATE items SET folder_id = NULL WHERE folder_id IN (${_})`,u),t.run("DELETE FROM folders WHERE id = ?",[l])})}}}}const W=e=>({id:e.id,name:e.name,color:e.color});function V(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function Ve(e){const{db:t,env:i}=e;function n(r){const s=t.get("SELECT id, name, color FROM tags WHERE id = ?",[r]);if(!s)throw new S("Tag",r);return W(s)}function a(r){const s=V(r);if(!s)throw new y("Nazwa tagu nie może być pusta");const T=t.get("SELECT id, name, color FROM tags WHERE name = ?",[s]);if(T)return W(T);const l=i.newId(),c=R(i.now());return t.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[l,s,c,c]),n(l)}function E(r){return t.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[r]).map(W)}return{get:n,ensure:a,list(){return t.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(r=>({...W(r),itemCount:A(r.item_count)}))},forItem:E,setForItem(r,s){return e.tx(()=>{const T=new Map;for(const _ of s.map(V))_&&!T.has(_.toLowerCase())&&T.set(_.toLowerCase(),_);const l=[...T.values()].map(a),c=new Set(l.map(_=>_.id)),u=t.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[r]).map(_=>_.tag_id);for(const _ of u)c.has(_)||t.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[r,_]);for(const _ of c)u.includes(_)||t.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[r,_]);return t.run("UPDATE items SET updated_at = ? WHERE id = ?",[R(i.now()),r]),E(r)})},update(r,s){const T=n(r),l=s.name===void 0?T.name:V(s.name);if(!l)throw new y("Nazwa tagu nie może być pusta");if(t.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[l,r]))throw new y(`Tag „${l}” już istnieje`);return t.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[l,s.color===void 0?T.color:s.color,R(i.now()),r]),n(r)},remove(r){n(r),t.run("DELETE FROM tags WHERE id = ?",[r])}}}const le=["note","task","event"],Ee=["todo","in_progress","done","on_hold"],Re=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id, i.space_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency,
         i.opened_at, i.updated_at, i.deleted_at,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,ye=e=>({id:e.id,type:e.type,title:e.title,spaceId:e.space_id??null,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:A(e.priority),favorite:I(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:I(e.all_day),isPayment:I(e.is_payment),amountMinor:e.amount_minor==null?null:A(e.amount_minor),currency:e.currency,openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:A(e.file_count??0)});function X(e,t){if(t!=null&&!Pe(t))throw new y(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${t}”`)}function ce(e){if(e===0||e===1||e===2||e===3)return e;throw new y("Priorytet musi być liczbą 0–3")}function Qe(e,t){const{db:i,env:n}=e;function a(o){return i.get("SELECT * FROM items WHERE id = ?",[o])}function E(o){const d=i.get("SELECT amount_minor, currency, account, payee FROM payments WHERE item_id = ?",[o]);return d?{amountMinor:d.amount_minor==null?null:A(d.amount_minor),currency:d.currency,account:d.account,payee:d.payee}:null}function r(o){return{id:o.id,type:o.type,title:o.title,spaceId:o.space_id??null,bodyJson:j(o.body_json),bodyText:o.body_text,folderId:o.folder_id,parentItemId:o.parent_item_id,categoryId:o.category_id,status:o.status,priority:A(o.priority),favorite:I(o.favorite),pinned:I(o.pinned),sortOrder:A(o.sort_order),startAt:o.start_at,dueAt:o.due_at,allDay:I(o.all_day),recurrence:j(o.recurrence),completedAt:o.completed_at,openedAt:o.opened_at,createdAt:o.created_at,updatedAt:o.updated_at,deletedAt:o.deleted_at,tags:t.tags.forItem(o.id),payment:E(o.id)}}function s(o){const d=a(o);if(!d)throw new S("Item",o);return r(d)}function T(o){const d=s(o);if(d.deletedAt)throw new S("Item",o);return d}function l(o){o&&t.folders.get(o)}function c(o,d){if(o){if(o===d)throw new y("Element nie może być swoim rodzicem");T(o)}}function u(o,d){const m=E(o),f=d.amountMinor===void 0?m?.amountMinor??null:d.amountMinor;if(f!=null&&(!Number.isInteger(f)||f<0))throw new y("Kwota musi być nieujemną liczbą całkowitą w groszach");i.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee`,[o,f,d.currency??m?.currency??"PLN",d.account??m?.account??"",d.payee??m?.payee??""])}function _(o){const d=o?i.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[o]):i.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(d?.m==null?0:A(d.m))+1}const N={get:T,getAny:s,create(o){if(!le.includes(o.type))throw new y(`Nieznany typ elementu: ${String(o.type)}`);if(X("Początek",o.startAt),X("Termin",o.dueAt),o.status!=null&&!Ee.includes(o.status))throw new y("Nieznany status");const d=ce(o.priority??1),m=o.folderId??null;l(m),c(o.parentItemId);const f=m?t.folders.get(m).itemDefaults:null,p=o.categoryId!==void 0?o.categoryId:f?.categoryId??null,L=o.payment!=null||o.payment===void 0&&!!f?.isPayment&&o.type==="task",O=o.type==="task"?o.status??"todo":null,F=o.dueAt??o.startAt,H=F?ne(F):!1,M=R(n.now()),h=n.newId();return e.tx(()=>(i.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[h,o.type,(o.title??"").trim(),o.bodyJson==null?null:JSON.stringify(o.bodyJson),o.bodyText??"",m,o.parentItemId??null,p,O,d,o.favorite?1:0,_(m),o.startAt??null,o.dueAt??null,H?1:0,O==="done"?M:null,M,M]),L&&u(h,{currency:f?.currency,...o.payment??{}}),o.tags?.length&&t.tags.setForItem(h,o.tags),T(h)))},update(o,d){const m=T(o);if(d.type!==void 0&&!le.includes(d.type))throw new y("Nieznany typ elementu");if(d.status!=null&&!Ee.includes(d.status))throw new y("Nieznany status");X("Początek",d.startAt),X("Termin",d.dueAt),d.folderId!==void 0&&l(d.folderId),d.parentItemId!==void 0&&c(d.parentItemId,o);const f=d.type??m.type;let p=d.status===void 0?m.status:d.status;f==="task"&&p==null&&(p="todo"),f!=="task"&&(p=null);const L=d.startAt===void 0?m.startAt:d.startAt,O=d.dueAt===void 0?m.dueAt:d.dueAt,F=O??L,H=R(n.now()),M=p==="done"?m.completedAt??H:null,h=d.priority===void 0?m.priority:ce(d.priority);return e.tx(()=>(i.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[f,d.title===void 0?m.title:d.title.trim(),d.bodyJson===void 0?m.bodyJson==null?null:JSON.stringify(m.bodyJson):d.bodyJson==null?null:JSON.stringify(d.bodyJson),d.bodyText??m.bodyText,d.folderId===void 0?m.folderId:d.folderId,d.parentItemId===void 0?m.parentItemId:d.parentItemId,d.categoryId===void 0?m.categoryId:d.categoryId,p,h,d.favorite??m.favorite?1:0,d.pinned??m.pinned?1:0,d.sortOrder??m.sortOrder,L,O,F&&ne(F)?1:0,M,H,o]),d.payment===null?i.run("DELETE FROM payments WHERE item_id = ?",[o]):d.payment!==void 0&&u(o,d.payment),T(o)))},setTags(o,d){return T(o),t.tags.setForItem(o,d)},setStatus(o,d){return N.update(o,{status:d})},toggleFavorite(o){return N.update(o,{favorite:!T(o).favorite})},markOpened(o){T(o),i.run("UPDATE items SET opened_at = ? WHERE id = ?",[R(n.now()),o])},setSpace(o,d){const m=T(o);return e.tx(()=>{const f=m.folderId?t.folders.find(m.folderId):null,p=f&&(f.spaceId??null)===d;i.run("UPDATE items SET space_id = ?, folder_id = ?, updated_at = ? WHERE id = ?",[d,p?m.folderId:null,R(n.now()),o])}),T(o)},move(o,d,m){return T(o),l(d),e.tx(()=>{const f=(d?i.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[d,o]):i.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[o])).map(L=>L.id),p=m===void 0?f.length:Math.max(0,Math.min(m,f.length));f.splice(p,0,o),i.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[d,R(n.now()),o]),f.forEach((L,O)=>i.run("UPDATE items SET sort_order = ? WHERE id = ?",[O+1,L]))}),T(o)},trash(o){T(o);const d=R(n.now());i.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[d,d,o])},restore(o){const d=s(o);return e.tx(()=>{const m=R(n.now()),f=d.folderId?t.folders.find(d.folderId):null,p=f&&!f.deletedAt?f.id:null;i.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[p,m,o])}),T(o)},purge(o){if(!s(o).deletedAt)throw new y("Najpierw przenieś element do kosza");i.run("DELETE FROM items WHERE id = ?",[o])},query(o={}){const d=[o.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL"],m=[];if(o.type){const L=Array.isArray(o.type)?o.type:[o.type];d.push(`i.type IN (${L.map(()=>"?").join(",")})`),m.push(...L)}if(o.folderId===null)d.push("i.folder_id IS NULL");else if(o.folderId!==void 0)if(o.includeSubfolders){const L=t.folders.descendantIds(o.folderId);d.push(`i.folder_id IN (${L.map(()=>"?").join(",")})`),m.push(...L)}else d.push("i.folder_id = ?"),m.push(o.folderId);if(o.status){const L=Array.isArray(o.status)?o.status:[o.status];d.push(`i.status IN (${L.map(()=>"?").join(",")})`),m.push(...L)}o.openOnly&&d.push("(i.status IS NULL OR i.status <> 'done')"),o.favorite!==void 0&&d.push(`i.favorite = ${o.favorite?1:0}`),o.tagId&&(d.push("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)"),m.push(o.tagId)),o.payment!==void 0&&d.push(`p.item_id IS ${o.payment?"NOT NULL":"NULL"}`),o.dueFrom&&(d.push("i.due_at >= ?"),m.push(o.dueFrom)),o.dueTo&&(d.push("i.due_at < ?"),m.push(o.dueTo));const f={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[o.orderBy??"manual"];o.orderBy==="opened"&&d.push("i.opened_at IS NOT NULL");const p=o.limit&&o.limit>0?` LIMIT ${Math.floor(o.limit)}`:"";return i.all(`${Re} WHERE ${d.join(" AND ")} ORDER BY ${f}${p}`,m).map(ye)}};return N}const $={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function Ze(e){const{db:t,env:i}=e;return{get(n){const a=t.get("SELECT value FROM settings WHERE key = ?",[n]);if(!a)return $[n];try{return JSON.parse(a.value)}catch{return $[n]}},set(n,a){if(!(n in $))throw new Error(`Unknown setting: ${String(n)}`);return t.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[n,JSON.stringify(a),R(i.now())]),a},all(){const n={...$};for(const a of t.all("SELECT key, value FROM settings"))if(a.key in $)try{n[a.key]=JSON.parse(a.value)}catch{}return n}}}const P=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:A(e.size),width:e.width==null?null:A(e.width),height:e.height==null?null:A(e.height),createdAt:e.created_at}),Q=e=>({...P(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),Z=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,qe=/^[0-9a-f]{64}$/;function et(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function tt(e,t){const{db:i,env:n}=e;function a(r){const s=r.sha256?.toLowerCase();if(!s||!qe.test(s))throw new y("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(r.size)||r.size<0)throw new y("Nieprawidłowy rozmiar pliku");const T=i.get("SELECT * FROM files WHERE sha256 = ?",[s]);if(T)return P(T);const l=n.newId();return i.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[l,s,r.name.trim()||"plik",r.mime||"application/octet-stream",r.size,r.width??null,r.height??null,R(n.now())]),P(i.get("SELECT * FROM files WHERE id = ?",[l]))}function E(r,s,T="attachment"){if(t.items.get(r),!i.get("SELECT 1 FROM files WHERE id = ?",[s]))throw new S("File",s);const l=i.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[r]),c=R(n.now());i.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[r,s,T,(l?.m==null?0:A(l.m))+1,c]),i.run("UPDATE items SET updated_at = ? WHERE id = ?",[c,r])}return{register:a,addToItem(r,s){return e.tx(()=>{const T=a(s);return E(r,T.id),Q(i.get(`${Z} WHERE x.item_id = ? AND x.file_id = ?`,[r,T.id]))})},addToFolder(r,s,T){return e.tx(()=>{r&&t.folders.get(r);const l=a(s),c=t.items.create({type:"note",title:T?.trim()||et(l.name),folderId:r});return E(c.id,l.id),t.items.get(c.id)})},detach(r,s){t.items.get(r),i.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[r,s]),i.run("UPDATE items SET updated_at = ? WHERE id = ?",[R(n.now()),r])},rename(r,s){if(!s.trim())throw new y("Nazwa pliku nie może być pusta");i.run("UPDATE files SET name = ? WHERE id = ?",[s.trim(),r]);const T=i.get("SELECT * FROM files WHERE id = ?",[r]);if(!T)throw new S("File",r);return P(T)},forItem(r){return i.all(`${Z} WHERE x.item_id = ? ORDER BY x.sort_order`,[r]).map(Q)},forFolder(r,s={}){const T=["i.deleted_at IS NULL"],l=[];if(r===null)T.push("i.folder_id IS NULL");else if(s.includeSubfolders){const u=t.folders.descendantIds(r);T.push(`i.folder_id IN (${u.map(()=>"?").join(",")})`),l.push(...u)}else T.push("i.folder_id = ?"),l.push(r);s.imagesOnly&&T.push("f.mime LIKE 'image/%'");const c=s.limit&&s.limit>0?` LIMIT ${Math.floor(s.limit)}`:"";return i.all(`${Z} WHERE ${T.join(" AND ")} ORDER BY x.created_at DESC, f.name${c}`,l).map(Q)}}}function it(e){const{db:t,env:i}=e,n="i.deleted_at IS NULL AND (i.status IS NULL OR i.status <> 'done')";function a(r,s,T="i.due_at, i.priority DESC",l=50){return t.all(`${Re} WHERE ${r} ORDER BY ${T} LIMIT ${l}`,s).map(ye)}function E(r,s){const T=t.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${r}`,s);return Number(T?.c??0)}return{summary(){const r=i.now(),s=Le(r),T=J(s,1),l=J(s,8),c=Ge(r),u=`${n} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,_=[s,c],N=`${n} AND i.type IN ('task', 'event') AND i.due_at >= ? AND i.due_at < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,o=[s,T,c],d=`${n} AND i.type IN ('task', 'event') AND i.due_at >= ? AND i.due_at < ?`,m=[T,l],f=`${n} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,p=[s,J(s,7)];return{overdue:a(u,_),today:a(N,o),upcoming:a(d,m),recentNotes:a("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:a("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:a("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:E(u,_),today:E(N,o),upcoming:E(d,m),paymentsThisWeek:E(f,p),notes:E("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:E("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const se="",ae="";function nt(e){const t=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(i=>i.trim()).filter(Boolean).slice(0,12);return t.length?t.map(i=>`"${i.replace(/"/g,"")}"*`).join(" "):null}const rt=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function ot(e,t){const i=/[\u0001\u0002]/g,n=e.replace(/^…/,"").replace(/…$/,""),a=n.replace(i,"");if(!a)return e;for(const E of t){const r=rt(E).indexOf(a);if(r<0)continue;const s=E.slice(r,r+a.length);let T="",l=0;for(const c of n)c===se||c===ae?T+=c:T+=s[l++];return e.replace(n,T)}return e}const Ae=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],D=e=>Ae.reduce((t,[i,n])=>`replace(${t}, '${i}', '${n}')`,`coalesce(${e}, '')`),re=e=>Ae.reduce((t,[i,n])=>t.split(i).join(n),e).toLowerCase();function st(e,t){const i=re(e);let n=-1,a=0;for(const s of t){const T=i.indexOf(s);T>=0&&(n<0||T<n)&&(n=T,a=s.length)}if(n<0)return e.slice(0,90);const E=Math.max(0,n-40),r=Math.min(e.length,n+a+60);return`${E>0?"…":""}${e.slice(E,n)}${se}${e.slice(n,n+a)}${ae}${e.slice(n+a,r)}${r<e.length?"…":""}`}function at(e,t){const{db:i}=e;function n(a,E){const r=re(a).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!r.length)return[];const s=`(${D("i.title")} || ' ' || ${D("i.body_text")} || ' ' ||
      ${D("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${D("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return i.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${r.map(()=>`instr(lower(${s}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${D("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...r,r[0],E]).map(l=>({...l,snip:st(l.body_text||l.title,r)}))}return{fullText:()=>t.fullText,search(a,E=30){const r=nt(a);if(!r)return[];const s=t.fullText?i.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${se}', '${ae}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[r,E]):n(a,E),T=re(a.trim());return[...i.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${D("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[T]).map(c=>({kind:"folder",id:c.id,title:c.name,snippet:"",folderId:c.parent_id})),...s.map(c=>({kind:"item",id:c.id,title:c.title,snippet:ot(c.snip??"",[c.body_text,c.title]),itemType:c.type,folderId:c.folder_id}))]}}}function dt(e){const{db:t}=e;return{list(){const i=t.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),n=t.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...i.map(a=>({kind:"item",id:a.id,title:a.title,deletedAt:a.deleted_at,itemType:a.type})),...n.map(a=>({kind:"folder",id:a.id,title:a.name,deletedAt:a.deleted_at}))].sort((a,E)=>E.deletedAt.localeCompare(a.deletedAt))}}}const lt={now:()=>new Date,newId:()=>crypto.randomUUID()};function Et(e,t={}){De(e),be(e);const i=xe(e,t.fullText!==!1),n={db:e,tx:he(e),env:t.env??lt},a=Ye(n),E=Ke(n),r=Ve(n),s=Qe(n,{tags:r,folders:E}),T=Ze(n),l=tt(n,{items:s,folders:E}),c=it(n),u=at(n,{fullText:i}),_=dt(n);return t.seed!==!1&&a.seedDefaults(),{api:{categories:{list:a.list,create:a.create,update:a.update,remove:a.remove},folders:{tree:E.tree,list:E.list,get:E.get,path:E.path,create:E.create,update:E.update,move:E.move,trash:E.trash,restore:E.restore,purge:E.purge,setSpace:E.setSpace},tags:{list:r.list,update:r.update,remove:r.remove},items:{get:s.get,create:s.create,update:s.update,setTags:s.setTags,setStatus:s.setStatus,toggleFavorite:s.toggleFavorite,markOpened:s.markOpened,move:s.move,trash:s.trash,restore:s.restore,purge:s.purge,query:s.query,setSpace:s.setSpace},files:{register:l.register,addToItem:l.addToItem,addToFolder:l.addToFolder,detach:l.detach,rename:l.rename,forItem:l.forItem,forFolder:l.forFolder},trash:{list:_.list},dashboard:{summary:c.summary},search:{query:u.search,fullText:u.fullText},settings:{all:T.all,get:T.get,set:T.set}},close:()=>e.close()}}const ct=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","folders.setSpace","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","items.setSpace","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set"]);function ut(e,t){if(typeof t!="string")return null;const[i,n,...a]=t.split(".");if(!i||!n||a.length||!Object.prototype.hasOwnProperty.call(e,i))return null;const E=e[i];if(!Object.prototype.hasOwnProperty.call(E,n))return null;const r=E[n];return typeof r=="function"?r:null}function Tt(e,t,i){const n=ut(e,t);if(!n)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(t)}`}},mutated:!1};try{return{result:{ok:!0,value:n(...Array.isArray(i)?i:[])},mutated:ct.has(t)}}catch(a){const E=a;return E.name!=="ValidationError"&&E.name!=="NotFoundError"&&console.error(`[core] ${String(t)} failed`,E),{result:{ok:!1,error:{name:E.name||"Error",message:E.message||String(a)}},mutated:!1}}}function mt(e,t){const i=new e.Database(t??null),n=E=>E.map(r=>typeof r=="bigint"?Number(r):r);function a(E,r,s){const T=i.prepare(E);try{r.length&&T.bind(n(r));const l=[];for(;T.step()&&(l.push(T.getAsObject()),!!s););return l}finally{T.free()}}return{exec:E=>{i.exec(E)},run:(E,r=[])=>(i.run(E,n(r)),{changes:i.getRowsModified()}),get:(E,r=[])=>a(E,r,!1)[0],all:(E,r=[])=>a(E,r,!0),close:()=>i.close(),exportBytes:()=>{const E=i.export();return i.exec("PRAGMA foreign_keys = ON;"),E}}}const _t="notatnik",z="files",U="blobs";function Oe(){return new Promise((e,t)=>{const i=indexedDB.open(_t,2);i.onupgradeneeded=()=>{const n=i.result.objectStoreNames;n.contains(z)||i.result.createObjectStore(z),n.contains(U)||i.result.createObjectStore(U)},i.onsuccess=()=>e(i.result),i.onerror=()=>t(i.error)})}async function B(e,t=z){const i=await Oe();try{return await new Promise((n,a)=>{const E=i.transaction(t,"readonly").objectStore(t).get(e);E.onsuccess=()=>n(E.result?new Uint8Array(E.result):null),E.onerror=()=>a(E.error)})}finally{i.close()}}async function ge(e,t,i=z){const n=await Oe();try{await new Promise((a,E)=>{const r=n.transaction(i,"readwrite");r.objectStore(i).put(t.slice().buffer,e),r.oncomplete=()=>a(),r.onerror=()=>E(r.error),r.onabort=()=>E(r.error)})}finally{n.close()}}async function ft(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function Nt(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const t=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(t)].map(i=>i.toString(16).padStart(2,"0")).join("")}function pt(e){const t=new Map,i=new Map;return{async put(n,a){const E=await Nt(n);return e()?await B(E,U).catch(()=>null)||await ge(E,n,U):t.set(E,n),{sha256:E,size:n.byteLength}},async read(n){return t.get(n)??(e()?await B(n,U).catch(()=>null):null)},async url(n,a){const E=i.get(n);if(E)return E;const r=t.get(n)??(e()?await B(n,U).catch(()=>null):null);if(!r)return null;const s=URL.createObjectURL(new Blob([r.slice().buffer],{type:a||"application/octet-stream"}));return i.set(n,s),s}}}const ue=e=>e.sharedId?[e.privateId,e.sharedId]:[e.privateId],Lt=e=>typeof e=="bigint"?Number(e):e;function Se(e,t){const i=t.split(G);return[e.key.map(n=>`${n} = ?`).join(" AND "),e.key.map((n,a)=>i[a]??"")]}function we(e,t,i){const[n,a]=Se(t,i),E=e.get(`SELECT * FROM ${t.name} WHERE ${n}`,a);if(!E)return;const r={};for(const[s,T]of Object.entries(E))r[s]=Lt(T);return r}function Ie(e,t,i){return e.get("SELECT space_id FROM items WHERE id = ?",[String(t)])?.space_id??i.privateId}function Rt(e,t,i,n){switch(t.scope){case"own":return[i.space_id??n.privateId];case"item":return[Ie(e,i[t.itemCol],n)];case"all":return ue(n);case"file":{const a=e.all("SELECT DISTINCT i.space_id AS s FROM item_files x JOIN items i ON i.id = x.item_id WHERE x.file_id = ?",[String(i.id)]).map(s=>s.s??n.privateId),E=new Set(ue(n)),r=[...new Set(a)].filter(s=>E.has(s));return r.length?r:[n.privateId]}}}function yt(e){return Number(e.get("SELECT COUNT(*) AS n FROM sync_outbox")?.n??0)}function At(e,t,i=300){const n=e.all("SELECT tbl, id, changed_at FROM sync_outbox ORDER BY changed_at LIMIT ?",[i]),a=[];for(const E of n){const r=fe.get(E.tbl);if(!r)continue;const s=we(e,r,E.id);if(!s){a.push({space_id:null,tbl:r.name,id:E.id,data:null,deleted:!0,stamp:E.changed_at,exclusive:!1});continue}const T=r.scope==="own"||r.scope==="item";for(const l of Rt(e,r,s,t))a.push({space_id:l,tbl:r.name,id:E.id,data:s,deleted:!1,stamp:E.changed_at,exclusive:T}),r.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(s.sha256),l,"up",String(s.mime)])}return{entries:a,taken:n}}function Ot(e,t){e.exec("BEGIN");try{for(const i of t)e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ? AND changed_at = ?",[i.tbl,i.id,i.changed_at]);e.exec("COMMIT")}catch(i){throw e.exec("ROLLBACK"),i}}const Te=new WeakMap;function gt(e,t){let i=Te.get(e);i||Te.set(e,i=new Map);let n=i.get(t);return n||(n=new Set(e.all(`PRAGMA table_info(${t})`).map(a=>a.name)),i.set(t,n)),n}function q(e,t,i){return e.get("SELECT local_id FROM sync_idmap WHERE tbl = ? AND remote_id = ?",[t,i])?.local_id??i}function St(e,t,i,n){return t.scope==="own"?i.space_id??n.privateId:t.scope==="item"?Ie(e,i[t.itemCol],n):null}function wt(e,t,i){if(!t.length)return 0;let n=0;e.exec("PRAGMA foreign_keys = OFF"),e.exec("BEGIN");try{e.run("UPDATE sync_state SET value = '1' WHERE key = 'applying'");for(const a of t){e.exec("SAVEPOINT rec");try{n+=It(e,a,i),e.exec("RELEASE rec")}catch(E){e.exec("ROLLBACK TO rec; RELEASE rec")}}e.run("UPDATE sync_state SET value = '0' WHERE key = 'applying'"),e.exec("COMMIT")}catch(a){throw e.exec("ROLLBACK"),a}finally{e.exec("PRAGMA foreign_keys = ON")}return n}function It(e,t,i){let n=0;const a=fe.get(t.tbl);if(!a)return 0;const E=t.id.split(G),r=a.key.map((d,m)=>{const f=E[m]??"";return a.refs?.[d]?q(e,a.refs[d],f):a.mergeBy?q(e,a.name,f):f}),s=r.join(G),T=e.get("SELECT changed_at FROM sync_outbox WHERE tbl = ? AND id = ?",[a.name,s]);if(T&&T.changed_at>t.stamp)return n;const l=we(e,a,s);if(t.deleted||!t.data){if(!l)return n;const d=St(e,a,l,i);if(d!==null&&d!==t.space_id)return n;const[m,f]=Se(a,s);return n+=e.run(`DELETE FROM ${a.name} WHERE ${m}`,f).changes,T&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[a.name,s]),n}const c={...t.data};if(a.mergeBy&&!l){const d=a.mergeBy,m=e.get(`SELECT id FROM ${a.name} WHERE ${d.col} = ?${d.nocase?" COLLATE NOCASE":""}${d.where?` AND ${d.where}`:""} AND id <> ? LIMIT 1`,[String(c[d.col]),String(c.id)]);if(m)return e.run("INSERT OR REPLACE INTO sync_idmap (tbl, remote_id, local_id) VALUES (?, ?, ?)",[a.name,String(c.id),m.id]),n}for(const[d,m]of Object.entries(a.refs??{}))typeof c[d]=="string"&&(c[d]=q(e,m,c[d]));if(a.key.forEach((d,m)=>{c[d]=r[m]}),a.scope==="own"&&(c.space_id=t.space_id===i.privateId?null:t.space_id),l&&typeof l.updated_at=="string"&&typeof c.updated_at=="string"&&l.updated_at>c.updated_at)return n;const u=Object.keys(c).filter(d=>gt(e,a.name).has(d)&&!(a.localOnly??[]).includes(d)),_=u.map(d=>{const m=c[d];return m===void 0?null:typeof m=="object"&&m!==null?JSON.stringify(m):m}),N=u.filter(d=>!a.key.includes(d)),o=N.length?`DO UPDATE SET ${N.map(d=>`${d} = excluded.${d}`).join(", ")}`:"DO NOTHING";return n+=e.run(`INSERT INTO ${a.name} (${u.join(", ")}) VALUES (${u.map(()=>"?").join(", ")}) ON CONFLICT(${a.key.join(", ")}) ${o}`,_).changes,T&&e.run("DELETE FROM sync_outbox WHERE tbl = ? AND id = ?",[a.name,s]),a.name==="files"&&e.run("INSERT OR IGNORE INTO sync_blobs (sha256, space_id, dir, mime) VALUES (?, ?, ?, ?)",[String(c.sha256),t.space_id,"down",String(c.mime)]),n}function oe(e,t){return e.get("SELECT value FROM sync_state WHERE key = ?",[t])?.value??null}function x(e,t,i){i===null?e.run("DELETE FROM sync_state WHERE key = ?",[t]):e.run("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",[t,i])}const ht=50,me=500,Dt=8;async function Ct(e,t,i,n){for(let s=0;s<100;s++){const{entries:T,taken:l}=At(e,t);if(!l.length)break;T.length&&await i.push(T),Ot(e,l)}let a=0,E=Number(oe(e,"cursor")??0);for(let s=0;s<200;s++){const T=Math.max(0,E-(s===0?ht:0)),l=await i.pull(T,me);if(!l.length)break;a+=wt(e,l,t);const c=Math.max(...l.map(u=>u.rev));if(c>E&&(E=c,x(e,"cursor",String(E))),l.length<me)break}const r=e.all("SELECT * FROM sync_blobs WHERE tries < 40 ORDER BY dir DESC, tries LIMIT ?",[Dt]);for(const s of r)try{let T=!1;if(s.dir==="up"){const l=await n.read(s.sha256);l&&await i.upload(s.space_id,s.sha256,l,s.mime),T=!0}else if(await n.read(s.sha256))T=!0;else{const l=await i.download(s.space_id,s.sha256);l&&(await n.write(l,s.mime),T=!0,a++)}T?e.run("DELETE FROM sync_blobs WHERE sha256 = ? AND space_id = ? AND dir = ?",[s.sha256,s.space_id,s.dir]):e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[s.sha256,s.space_id,s.dir])}catch{e.run("UPDATE sync_blobs SET tries = tries + 1 WHERE sha256 = ? AND space_id = ? AND dir = ?",[s.sha256,s.space_id,s.dir])}return a}class g extends Error{constructor(t,i=0,n=!1){super(t),this.status=i,this.offline=n}}const ee=e=>({accessToken:e.access_token,refreshToken:e.refresh_token,expiresAt:Date.now()+e.expires_in*1e3,userId:e.user.id,email:e.user.email});function Ut(e,t){const i=t.msg??t.message??t.error_description??"",n=t.error_code??t.code??"";return n==="invalid_credentials"||/invalid login credentials/i.test(i)?"Nieprawidłowy e-mail lub hasło.":n==="user_already_exists"||/already registered/i.test(i)?"To konto już istnieje — zaloguj się.":n==="weak_password"||/password should be/i.test(i)?"Hasło jest za krótkie (minimum 6 znaków).":/database error saving new user|nie ma zaproszenia/i.test(i)||n==="unexpected_failure"?"Ten adres e-mail nie ma zaproszenia do Notario.":n==="validation_failed"||/email/i.test(i)&&e===400?"Sprawdź adres e-mail.":e===429?"Za dużo prób. Spróbuj za chwilę.":i||`Błąd serwera (${e}).`}function vt(e,t){let i=t.load(),n=null;async function a(u,_={}){const N=new Headers(_.headers);N.set("apikey",e.key),_.auth!==!1&&N.set("Authorization",`Bearer ${await s()}`);let o;try{o=await fetch(`${e.url}${u}`,{..._,headers:N})}catch{throw new g("Brak połączenia z internetem.",0,!0)}return o}async function E(u,_){const N=await a(u,{method:"POST",auth:!1,headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}),o=await N.json().catch(()=>({}));if(!N.ok)throw new g(Ut(N.status,o),N.status);return o}function r(u){i=u,t.save(u)}async function s(){if(!i)throw new g("Nie zalogowano.",401);return i.expiresAt-Date.now()>6e4?i.accessToken:(n??(n=(async()=>{try{const u=await E("/auth/v1/token?grant_type=refresh_token",{refresh_token:i.refreshToken}),_=ee(u);return r(_),_}catch(u){throw u instanceof g&&(u.status===400||u.status===401)&&r(null),u}finally{n=null}})()),(await n).accessToken)}async function T(u){if(u.status===401)throw new g("Sesja wygasła. Zaloguj się ponownie.",401);if(!u.ok){const N=await u.text().catch(()=>"");throw new g(`Serwer odrzucił zapytanie (${u.status}) ${N.slice(0,200)}`,u.status)}const _=await u.text();return _?JSON.parse(_):null}const l=async(u,_)=>T(await a(`/rest/v1/rpc/${u}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(_)}));return{transport:{async push(u){await l("push_records",{changes:u})},async pull(u,_){const N=`select=space_id,tbl,id,data,deleted,stamp,rev&rev=gt.${u}&order=rev.asc&limit=${_}`;return T(await a(`/rest/v1/records?${N}`))},async upload(u,_,N,o){const d=await a(`/storage/v1/object/blobs/${u}/${_}`,{method:"POST",headers:{"Content-Type":o||"application/octet-stream"},body:N.slice().buffer});if(d.ok||d.status===409)return;const m=await d.text().catch(()=>"");if(!(d.status===400&&/exists|duplicate/i.test(m)))throw new g(`Nie udało się wysłać pliku (${d.status}).`,d.status)},async download(u,_){const N=await a(`/storage/v1/object/authenticated/blobs/${u}/${_}`);if(N.status===404||N.status===400)return null;if(!N.ok)throw new g(`Nie udało się pobrać pliku (${N.status}).`,N.status);return new Uint8Array(await N.arrayBuffer())}},session:()=>i,async signIn(u,_){const N=await E("/auth/v1/token?grant_type=password",{email:u.trim(),password:_}),o=ee(N);return r(o),o},async signUp(u,_){const N=await E("/auth/v1/signup",{email:u.trim(),password:_});if("access_token"in N&&N.access_token){const o=ee(N);return r(o),o}return this.signIn(u,_)},async signOut(){const u=i;r(null),u&&await fetch(`${e.url}/auth/v1/logout`,{method:"POST",headers:{apikey:e.key,Authorization:`Bearer ${u.accessToken}`}}).catch(()=>{})},async spaces(){const u=await l("my_spaces",{}),_=u.find(N=>N.kind==="private");if(!_)throw new g("Konto nie ma jeszcze swojej przestrzeni na serwerze.");return{privateId:_.id,sharedId:u.find(N=>N.kind==="shared")?.id??null}}}}function Ft(e){const t=vt(e.config,e.store),i=new Set;let n=t.session()?"idle":"off",a=null,E=null,r=null,s=!1,T;function l(){const m=oe(e.db,"spaces");return m?JSON.parse(m):null}function c(){const m=t.session();return{signedIn:!!m,email:m?.email??null,state:m?n:"off",error:a,lastSyncAt:E,pending:yt(e.db),sharedSpaceId:m?l()?.sharedId??null:null}}const u=()=>{const m=c();i.forEach(f=>f(m))};async function _(){const m=t.session();if(!m){n="off";return}n="syncing",u();try{oe(e.db,"user")!==m.userId&&(x(e.db,"user",m.userId),x(e.db,"cursor",null),x(e.db,"spaces",null));let f=l();f||(f=await t.spaces(),x(e.db,"spaces",JSON.stringify(f)));const p=await Ct(e.db,f,t.transport,e.blobs);e.onDbWritten(),p>0&&e.onRemoteChange(),n="idle",a=null,E=Date.now()}catch(f){const p=f;n=p.offline?"offline":"error",a=p.offline?null:p.message,t.session()||(n="off"),e.onDbWritten()}u()}function N(){return clearTimeout(T),r?(s=!0,r):(r=(async()=>{do s=!1,await _();while(s)})().finally(()=>{r=null}),r)}function o(m=1200){t.session()&&(clearTimeout(T),T=setTimeout(()=>void N(),m))}const d=setInterval(()=>{t.session()&&e.visible()&&!r&&N()},e.pollMs??5e3);return{status:c,syncNow:N,schedule:o,onStatus(m){return i.add(m),()=>i.delete(m)},async signIn(m,f){return await t.signIn(m,f),a=null,await N(),c()},async signUp(m,f){return await t.signUp(m,f),a=null,await N(),c()},async signOut(){return await t.signOut(),n="off",a=null,u(),c()},stop(){clearInterval(d),clearTimeout(T)}}}const Mt={url:"https://wdqljuhkaqokjelwuyvf.supabase.co",key:"sb_publishable_Si1QdjcU3n_-H_gqpZ6Z6A_XD2lYgmT"},_e="notatnik.sqlite",te="notario.session",bt=400;async function kt(e){const t=await e(),i={persistent:!1};let n=null;try{n=await B(_e),i.persistent=!0}catch{i.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const a=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;i.persistent&&!await ft()&&!a&&(i.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const E=mt(t,n),r=Et(E);let s=!n,T,l=Promise.resolve();const c=()=>{if(clearTimeout(T),!s||!i.persistent)return l;s=!1;const f=E.exportBytes();return l=l.then(()=>ge(_e,f)).then(()=>{i.lastSavedAt=Date.now()}).catch(p=>{s=!0,console.error("Saving database failed",p),i.note="Nie udało się zapisać danych w pamięci przeglądarki."}),l},u=()=>{s=!0,clearTimeout(T),T=setTimeout(c,bt)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&c()}),window.addEventListener("pagehide",()=>void c()),s&&u();const _=new Set,N=f=>{const p={method:f,at:Date.now()};queueMicrotask(()=>_.forEach(L=>L(p)))},o=pt(()=>i.persistent),d=Ft({db:E,config:Mt,store:{load(){try{return JSON.parse(localStorage.getItem(te)??"null")}catch{return null}},save(f){try{f?localStorage.setItem(te,JSON.stringify(f)):localStorage.removeItem(te)}catch{}}},blobs:{read:f=>o.read(f),write:async(f,p)=>{await o.put(f,p)}},onDbWritten:u,onRemoteChange:()=>N("sync.pull"),visible:()=>document.visibilityState==="visible"&&navigator.onLine!==!1});window.addEventListener("online",()=>void d.syncNow()),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&d.syncNow()}),d.syncNow();const m={async call(f,p){const{result:L,mutated:O}=Tt(r.api,f,p);return O&&(u(),N(f),d.schedule()),L.ok?{ok:!0,value:L.value===void 0?void 0:structuredClone(L.value)}:L},onChanged(f){return _.add(f),()=>_.delete(f)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...i}),blobs:o,sync:{status:d.status,onStatus:d.onStatus,signIn:d.signIn,signUp:d.signUp,signOut:d.signOut,syncNow:d.syncNow}};window.bridge=m}export{kt as installWebBridge};
