function le(e){let r=0;return function(a){const E=`sp_${r}`;e.exec(r===0?"BEGIN IMMEDIATE":`SAVEPOINT ${E}`),r++;try{const l=a();return r--,e.exec(r===0?"COMMIT":`RELEASE ${E}`),l}catch(l){throw r--,e.exec(r===0?"ROLLBACK":`ROLLBACK TO ${E}; RELEASE ${E}`),l}}}function ce(e){e.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)}const y=e=>`replace(replace(${e}, 'ł', 'l'), 'Ł', 'L')`,C=e=>y(`
  coalesce((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id
            WHERE it.item_id = ${e}), '')
  || ' ' ||
  coalesce((SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id
            WHERE x.item_id = ${e}), '')`),ue=[{version:1,name:"initial schema",sql:`
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

`}],Te=`
-- Full-text search ------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(
  item_id UNINDEXED,
  title,
  body,
  extra,                                          -- tag names + attachment file names
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER items_fts_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (item_id, title, body, extra) VALUES (new.id, ${y("new.title")}, ${y("new.body_text")}, '');
END;
CREATE TRIGGER items_fts_au AFTER UPDATE OF title, body_text ON items BEGIN
  UPDATE items_fts SET title = ${y("new.title")}, body = ${y("new.body_text")} WHERE item_id = new.id;
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
`,me=`
DELETE FROM items_fts;
INSERT INTO items_fts (item_id, title, body, extra)
  SELECT i.id, ${y("i.title")}, ${y("i.body_text")}, ${C("i.id")} FROM items i;
`;function _e(e,r=ue){const o=e.get("PRAGMA user_version"),a=Number(o?.user_version??0),E=[],l=[...r].sort((i,s)=>i.version-s.version).filter(i=>i.version>a);for(const i of l){e.exec("BEGIN IMMEDIATE");try{e.exec(i.sql),e.exec(`PRAGMA user_version = ${i.version}`),e.exec("COMMIT"),E.push(i.version)}catch(s){throw e.exec("ROLLBACK"),new Error(`Migration ${i.version} (${i.name}) failed: ${s.message}`)}}return E}function fe(e){try{return e.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;"),!0}catch{return!1}}function Ne(e){return!!e.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'")}function Le(e,r=!0){if(Ne(e))return!0;if(!r||!fe(e))return!1;e.exec("BEGIN IMMEDIATE");try{return e.exec(Te),e.exec(me),e.exec("COMMIT"),!0}catch(o){throw e.exec("ROLLBACK"),o}}class N extends Error{constructor(r){super(r),this.name="ValidationError"}}class g extends Error{constructor(r,o){super(`${r} not found: ${o}`),this.name="NotFoundError"}}const I=e=>e===1||e===1n||e===!0,A=e=>typeof e=="bigint"?Number(e):e;function $(e){if(e==null||e==="")return null;try{return JSON.parse(String(e))}catch{return null}}function ie(e,r,o,a){const E=e.db.get(`SELECT MAX(sort_order) AS m FROM ${r} WHERE ${o}`,a);return(E?.m==null?0:A(E.m))+1}const U=(e,r=2)=>String(e).padStart(r,"0"),Re=/^(\d{4})-(\d{2})-(\d{2})$/,Ae=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;function Y(e){const r=Re.exec(e);return!!r&&re(+r[1],+r[2],+r[3])}function pe(e){const r=Ae.exec(e);return!!r&&re(+r[1],+r[2],+r[3])&&+r[4]<24&&+r[5]<60}function Oe(e){return Y(e)||pe(e)}function re(e,r,o){return r>=1&&r<=12&&o>=1&&o<=ge(e,r)}function ge(e,r){return new Date(Date.UTC(e,r,0)).getUTCDate()}function ne(e){return`${e.getFullYear()}-${U(e.getMonth()+1)}-${U(e.getDate())}`}function Se(e){return`${ne(e)}T${U(e.getHours())}:${U(e.getMinutes())}`}function k(e,r){const[o,a,E]=e.split("-").map(Number),l=new Date(Date.UTC(o,a-1,E+r));return`${l.getUTCFullYear()}-${U(l.getUTCMonth()+1)}-${U(l.getUTCDate())}`}function L(e){return e.toISOString()}const Q=e=>({id:e.id,name:e.name,color:e.color,icon:e.icon,sortOrder:A(e.sort_order),createdAt:e.created_at,updatedAt:e.updated_at}),ye=/^#[0-9a-fA-F]{6}$/,Ie=[{name:"Praca",color:"#4C8DFF",icon:"briefcase"},{name:"Płatności",color:"#FF5A6E",icon:"wallet"},{name:"Dom",color:"#3DD68C",icon:"home"},{name:"Prywatne",color:"#A472FF",icon:"user"},{name:"Ważne",color:"#FF9F43",icon:"alert-triangle"}];function De(e){const{db:r,env:o}=e;function a(i){const s=r.get("SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",[i]);if(!s)throw new g("Category",i);return Q(s)}function E(i,s){if(i!==void 0&&!i.trim())throw new N("Nazwa kategorii nie może być pusta");if(s!==void 0&&!ye.test(s))throw new N("Kolor musi mieć format #RRGGBB")}function l(i){E(i.name,i.color);const s=o.newId(),n=L(o.now());return r.run("INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",[s,i.name.trim(),i.color,i.icon??null,ie(e,"categories","deleted_at IS NULL",[]),n,n]),a(s)}return{create:l,list(){return r.all("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name").map(Q)},get:a,update(i,s){const n=a(i);return E(s.name,s.color),r.run("UPDATE categories SET name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ? WHERE id = ?",[s.name?.trim()??n.name,s.color??n.color,s.icon===void 0?n.icon:s.icon,s.sortOrder??n.sortOrder,L(o.now()),i]),a(i)},remove(i){a(i),e.tx(()=>{const s=L(o.now());r.run("UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?",[s,i]),r.run("UPDATE folders SET category_id = NULL, updated_at = ? WHERE category_id = ?",[s,i]),r.run("UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?",[s,s,i])})},seedDefaults(){const i=r.get("SELECT COUNT(*) AS c FROM categories");if(!(A(i?.c??0)>0))for(const s of Ie)l(s)}}}const P=e=>({id:e.id,parentId:e.parent_id,kind:e.kind,name:e.name,icon:e.icon,color:e.color,description:e.description,categoryId:e.category_id,sortOrder:A(e.sort_order),calendarSync:I(e.calendar_sync),itemDefaults:$(e.item_defaults),settings:$(e.settings),createdAt:e.created_at,updatedAt:e.updated_at,deletedAt:e.deleted_at}),we=`
  WITH RECURSIVE sub(id) AS (
    SELECT ? UNION ALL SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
  ) SELECT id FROM sub`;function Ce(e){const{db:r,env:o}=e;function a(n){const d=r.get("SELECT * FROM folders WHERE id = ?",[n]);return d?P(d):null}function E(n){const d=a(n);if(!d||d.deletedAt)throw new g("Folder",n);return d}function l(n){return r.all(we,[n]).map(d=>d.id)}function i(n){n&&E(n)}function s(n){return n===null?["parent_id IS NULL AND deleted_at IS NULL",[]]:["parent_id = ? AND deleted_at IS NULL",[n]]}return{get:E,find:a,descendantIds:l,list(){return r.all("SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order, name").map(P)},tree(){const n=r.all(`
        SELECT f.*,
          (SELECT COUNT(*) FROM items i WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS item_count,
          (SELECT fl.sha256 FROM items i JOIN item_files x ON x.item_id = i.id JOIN files fl ON fl.id = x.file_id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL AND fl.mime LIKE 'image/%'
            ORDER BY x.created_at DESC LIMIT 1) AS cover_sha,
          (SELECT COUNT(*) FROM items i JOIN item_files x ON x.item_id = i.id
            WHERE i.folder_id = f.id AND i.deleted_at IS NULL) AS file_count
        FROM folders f WHERE f.deleted_at IS NULL ORDER BY f.sort_order, f.name`),d=new Map;for(const m of n)d.set(m.id,{...P(m),children:[],itemCount:A(m.item_count),coverSha:m.cover_sha??null,fileCount:A(m.file_count)});const u=[];for(const m of d.values()){const _=m.parentId?d.get(m.parentId):void 0;(_?_.children:u).push(m)}return u},path(n){const d=[];let u=E(n);const m=new Set;for(;u&&!m.has(u.id);)m.add(u.id),d.unshift(u),u=u.parentId?a(u.parentId):null;return d},create(n){const d=n.name?.trim();if(!d)throw new N("Nazwa folderu nie może być pusta");const u=n.parentId??null;i(u);const m=o.newId(),_=L(o.now()),[O,t]=s(u);return r.run(`INSERT INTO folders (id, parent_id, kind, name, icon, color, description, category_id, sort_order,
           calendar_sync, item_defaults, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[m,u,n.kind??"folder",d,n.icon??null,n.color??null,n.description??"",n.categoryId??null,ie(e,"folders",O,t),n.calendarSync===!1?0:1,n.itemDefaults?JSON.stringify(n.itemDefaults):null,_,_]),E(m)},update(n,d){const u=E(n);if(d.name!==void 0&&!d.name.trim())throw new N("Nazwa folderu nie może być pusta");return r.run(`UPDATE folders SET kind = ?, name = ?, icon = ?, color = ?, description = ?, category_id = ?,
           calendar_sync = ?, item_defaults = ?, settings = ?, updated_at = ? WHERE id = ?`,[d.kind??u.kind,d.name?.trim()??u.name,d.icon===void 0?u.icon:d.icon,d.color===void 0?u.color:d.color,d.description??u.description,d.categoryId===void 0?u.categoryId:d.categoryId,d.calendarSync??u.calendarSync?1:0,JSON.stringify(d.itemDefaults===void 0?u.itemDefaults:d.itemDefaults),JSON.stringify(d.settings===void 0?u.settings:d.settings),L(o.now()),n]),E(n)},move(n,d,u){if(E(n),d!==null&&(i(d),l(n).includes(d)))throw new N("Nie można przenieść folderu do jego podfolderu");return e.tx(()=>{const[m,_]=s(d),O=r.all(`SELECT id FROM folders WHERE ${m} AND id <> ? ORDER BY sort_order, name`,[..._,n]).map(T=>T.id),t=u===void 0?O.length:Math.max(0,Math.min(u,O.length));O.splice(t,0,n);const c=L(o.now());r.run("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?",[d,c,n]),O.forEach((T,f)=>r.run("UPDATE folders SET sort_order = ? WHERE id = ?",[f+1,T]))}),E(n)},trash(n){E(n),e.tx(()=>{const d=L(o.now()),u=l(n),m=u.map(()=>"?").join(",");r.run(`UPDATE items SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE folder_id IN (${m}) AND deleted_at IS NULL`,[d,n,d,...u]),r.run(`UPDATE folders SET deleted_at = ?, trashed_with = ?, updated_at = ?
           WHERE id IN (${m}) AND deleted_at IS NULL`,[d,n,d,...u])})},restore(n){const d=a(n);if(!d)throw new g("Folder",n);return e.tx(()=>{const u=L(o.now());r.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[u,n]),r.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE trashed_with = ?",[u,n]),r.run("UPDATE folders SET deleted_at = NULL, trashed_with = NULL, updated_at = ? WHERE id = ?",[u,n]);const m=d.parentId?a(d.parentId):null;d.parentId&&(!m||m.deletedAt)&&r.run("UPDATE folders SET parent_id = NULL WHERE id = ?",[n])}),E(n)},purge(n){const d=a(n);if(d){if(!d.deletedAt)throw new N("Najpierw przenieś folder do kosza");e.tx(()=>{r.run("DELETE FROM items WHERE trashed_with = ?",[n]);const u=l(n),m=u.map(()=>"?").join(",");r.run(`UPDATE items SET folder_id = NULL WHERE folder_id IN (${m})`,u),r.run("DELETE FROM folders WHERE id = ?",[n])})}}}}const X=e=>({id:e.id,name:e.name,color:e.color});function B(e){return e.replace(/^#+/,"").trim().replace(/\s+/g," ")}function Ue(e){const{db:r,env:o}=e;function a(i){const s=r.get("SELECT id, name, color FROM tags WHERE id = ?",[i]);if(!s)throw new g("Tag",i);return X(s)}function E(i){const s=B(i);if(!s)throw new N("Nazwa tagu nie może być pusta");const n=r.get("SELECT id, name, color FROM tags WHERE name = ?",[s]);if(n)return X(n);const d=o.newId(),u=L(o.now());return r.run("INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",[d,s,u,u]),a(d)}function l(i){return r.all("SELECT t.id, t.name, t.color FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name COLLATE NOCASE",[i]).map(X)}return{get:a,ensure:E,list(){return r.all(`
          SELECT t.id, t.name, t.color,
            (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id = it.item_id
             WHERE it.tag_id = t.id AND i.deleted_at IS NULL) AS item_count
          FROM tags t ORDER BY t.name COLLATE NOCASE`).map(i=>({...X(i),itemCount:A(i.item_count)}))},forItem:l,setForItem(i,s){return e.tx(()=>{const n=new Map;for(const _ of s.map(B))_&&!n.has(_.toLowerCase())&&n.set(_.toLowerCase(),_);const d=[...n.values()].map(E),u=new Set(d.map(_=>_.id)),m=r.all("SELECT tag_id FROM item_tags WHERE item_id = ?",[i]).map(_=>_.tag_id);for(const _ of m)u.has(_)||r.run("DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",[i,_]);for(const _ of u)m.includes(_)||r.run("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)",[i,_]);return r.run("UPDATE items SET updated_at = ? WHERE id = ?",[L(o.now()),i]),l(i)})},update(i,s){const n=a(i),d=s.name===void 0?n.name:B(s.name);if(!d)throw new N("Nazwa tagu nie może być pusta");if(r.get("SELECT id FROM tags WHERE name = ? AND id <> ?",[d,i]))throw new N(`Tag „${d}” już istnieje`);return r.run("UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?",[d,s.color===void 0?n.color:s.color,L(o.now()),i]),a(i)},remove(i){a(i),r.run("DELETE FROM tags WHERE id = ?",[i])}}}const Z=["note","task","event"],q=["todo","in_progress","done","on_hold"],oe=`
  SELECT i.id, i.type, i.title, substr(i.body_text, 1, 240) AS excerpt, i.folder_id, i.category_id,
         i.status, i.priority, i.favorite, i.start_at, i.due_at, i.all_day,
         (p.item_id IS NOT NULL) AS is_payment, p.amount_minor, p.currency,
         i.opened_at, i.updated_at, i.deleted_at,
         (SELECT f.sha256 FROM item_files x JOIN files f ON f.id = x.file_id
           WHERE x.item_id = i.id AND f.mime LIKE 'image/%' ORDER BY x.sort_order LIMIT 1) AS cover_sha,
         (SELECT COUNT(*) FROM item_files x WHERE x.item_id = i.id) AS file_count
  FROM items i LEFT JOIN payments p ON p.item_id = i.id`,ae=e=>({id:e.id,type:e.type,title:e.title,excerpt:e.excerpt??"",folderId:e.folder_id,categoryId:e.category_id,status:e.status,priority:A(e.priority),favorite:I(e.favorite),startAt:e.start_at,dueAt:e.due_at,allDay:I(e.all_day),isPayment:I(e.is_payment),amountMinor:e.amount_minor==null?null:A(e.amount_minor),currency:e.currency,openedAt:e.opened_at,updatedAt:e.updated_at,deletedAt:e.deleted_at,coverSha:e.cover_sha??null,fileCount:A(e.file_count??0)});function x(e,r){if(r!=null&&!Oe(r))throw new N(`${e}: oczekiwano RRRR-MM-DD lub RRRR-MM-DDTGG:MM, otrzymano „${r}”`)}function ee(e){if(e===0||e===1||e===2||e===3)return e;throw new N("Priorytet musi być liczbą 0–3")}function he(e,r){const{db:o,env:a}=e;function E(t){return o.get("SELECT * FROM items WHERE id = ?",[t])}function l(t){const c=o.get("SELECT amount_minor, currency, account, payee FROM payments WHERE item_id = ?",[t]);return c?{amountMinor:c.amount_minor==null?null:A(c.amount_minor),currency:c.currency,account:c.account,payee:c.payee}:null}function i(t){return{id:t.id,type:t.type,title:t.title,bodyJson:$(t.body_json),bodyText:t.body_text,folderId:t.folder_id,parentItemId:t.parent_item_id,categoryId:t.category_id,status:t.status,priority:A(t.priority),favorite:I(t.favorite),pinned:I(t.pinned),sortOrder:A(t.sort_order),startAt:t.start_at,dueAt:t.due_at,allDay:I(t.all_day),recurrence:$(t.recurrence),completedAt:t.completed_at,openedAt:t.opened_at,createdAt:t.created_at,updatedAt:t.updated_at,deletedAt:t.deleted_at,tags:r.tags.forItem(t.id),payment:l(t.id)}}function s(t){const c=E(t);if(!c)throw new g("Item",t);return i(c)}function n(t){const c=s(t);if(c.deletedAt)throw new g("Item",t);return c}function d(t){t&&r.folders.get(t)}function u(t,c){if(t){if(t===c)throw new N("Element nie może być swoim rodzicem");n(t)}}function m(t,c){const T=l(t),f=c.amountMinor===void 0?T?.amountMinor??null:c.amountMinor;if(f!=null&&(!Number.isInteger(f)||f<0))throw new N("Kwota musi być nieujemną liczbą całkowitą w groszach");o.run(`INSERT INTO payments (item_id, amount_minor, currency, account, payee) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET amount_minor = excluded.amount_minor, currency = excluded.currency,
         account = excluded.account, payee = excluded.payee`,[t,f,c.currency??T?.currency??"PLN",c.account??T?.account??"",c.payee??T?.payee??""])}function _(t){const c=t?o.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id = ?",[t]):o.get("SELECT MAX(sort_order) AS m FROM items WHERE folder_id IS NULL");return(c?.m==null?0:A(c.m))+1}const O={get:n,getAny:s,create(t){if(!Z.includes(t.type))throw new N(`Nieznany typ elementu: ${String(t.type)}`);if(x("Początek",t.startAt),x("Termin",t.dueAt),t.status!=null&&!q.includes(t.status))throw new N("Nieznany status");const c=ee(t.priority??1),T=t.folderId??null;d(T),u(t.parentItemId);const f=T?r.folders.get(T).itemDefaults:null,p=t.categoryId!==void 0?t.categoryId:f?.categoryId??null,R=t.payment!=null||t.payment===void 0&&!!f?.isPayment&&t.type==="task",S=t.type==="task"?t.status??"todo":null,h=t.dueAt??t.startAt,b=h?Y(h):!1,F=L(a.now()),D=a.newId();return e.tx(()=>(o.run(`INSERT INTO items (id, type, title, body_json, body_text, folder_id, parent_item_id, category_id, status,
             priority, favorite, sort_order, start_at, due_at, all_day, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,[D,t.type,(t.title??"").trim(),t.bodyJson==null?null:JSON.stringify(t.bodyJson),t.bodyText??"",T,t.parentItemId??null,p,S,c,t.favorite?1:0,_(T),t.startAt??null,t.dueAt??null,b?1:0,S==="done"?F:null,F,F]),R&&m(D,{currency:f?.currency,...t.payment??{}}),t.tags?.length&&r.tags.setForItem(D,t.tags),n(D)))},update(t,c){const T=n(t);if(c.type!==void 0&&!Z.includes(c.type))throw new N("Nieznany typ elementu");if(c.status!=null&&!q.includes(c.status))throw new N("Nieznany status");x("Początek",c.startAt),x("Termin",c.dueAt),c.folderId!==void 0&&d(c.folderId),c.parentItemId!==void 0&&u(c.parentItemId,t);const f=c.type??T.type;let p=c.status===void 0?T.status:c.status;f==="task"&&p==null&&(p="todo"),f!=="task"&&(p=null);const R=c.startAt===void 0?T.startAt:c.startAt,S=c.dueAt===void 0?T.dueAt:c.dueAt,h=S??R,b=L(a.now()),F=p==="done"?T.completedAt??b:null,D=c.priority===void 0?T.priority:ee(c.priority);return e.tx(()=>(o.run(`UPDATE items SET type = ?, title = ?, body_json = ?, body_text = ?, folder_id = ?, parent_item_id = ?,
             category_id = ?, status = ?, priority = ?, favorite = ?, pinned = ?, sort_order = ?, start_at = ?, due_at = ?,
             all_day = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,[f,c.title===void 0?T.title:c.title.trim(),c.bodyJson===void 0?T.bodyJson==null?null:JSON.stringify(T.bodyJson):c.bodyJson==null?null:JSON.stringify(c.bodyJson),c.bodyText??T.bodyText,c.folderId===void 0?T.folderId:c.folderId,c.parentItemId===void 0?T.parentItemId:c.parentItemId,c.categoryId===void 0?T.categoryId:c.categoryId,p,D,c.favorite??T.favorite?1:0,c.pinned??T.pinned?1:0,c.sortOrder??T.sortOrder,R,S,h&&Y(h)?1:0,F,b,t]),c.payment===null?o.run("DELETE FROM payments WHERE item_id = ?",[t]):c.payment!==void 0&&m(t,c.payment),n(t)))},setTags(t,c){return n(t),r.tags.setForItem(t,c)},setStatus(t,c){return O.update(t,{status:c})},toggleFavorite(t){return O.update(t,{favorite:!n(t).favorite})},markOpened(t){n(t),o.run("UPDATE items SET opened_at = ? WHERE id = ?",[L(a.now()),t])},move(t,c,T){return n(t),d(c),e.tx(()=>{const f=(c?o.all("SELECT id FROM items WHERE folder_id = ? AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[c,t]):o.all("SELECT id FROM items WHERE folder_id IS NULL AND deleted_at IS NULL AND id <> ? ORDER BY sort_order",[t])).map(R=>R.id),p=T===void 0?f.length:Math.max(0,Math.min(T,f.length));f.splice(p,0,t),o.run("UPDATE items SET folder_id = ?, updated_at = ? WHERE id = ?",[c,L(a.now()),t]),f.forEach((R,S)=>o.run("UPDATE items SET sort_order = ? WHERE id = ?",[S+1,R]))}),n(t)},trash(t){n(t);const c=L(a.now());o.run("UPDATE items SET deleted_at = ?, trashed_with = NULL, updated_at = ? WHERE id = ?",[c,c,t])},restore(t){const c=s(t);return e.tx(()=>{const T=L(a.now()),f=c.folderId?r.folders.find(c.folderId):null,p=f&&!f.deletedAt?f.id:null;o.run("UPDATE items SET deleted_at = NULL, trashed_with = NULL, folder_id = ?, updated_at = ? WHERE id = ?",[p,T,t])}),n(t)},purge(t){if(!s(t).deletedAt)throw new N("Najpierw przenieś element do kosza");o.run("DELETE FROM items WHERE id = ?",[t])},query(t={}){const c=[t.trashed?"i.deleted_at IS NOT NULL":"i.deleted_at IS NULL"],T=[];if(t.type){const R=Array.isArray(t.type)?t.type:[t.type];c.push(`i.type IN (${R.map(()=>"?").join(",")})`),T.push(...R)}if(t.folderId===null)c.push("i.folder_id IS NULL");else if(t.folderId!==void 0)if(t.includeSubfolders){const R=r.folders.descendantIds(t.folderId);c.push(`i.folder_id IN (${R.map(()=>"?").join(",")})`),T.push(...R)}else c.push("i.folder_id = ?"),T.push(t.folderId);if(t.status){const R=Array.isArray(t.status)?t.status:[t.status];c.push(`i.status IN (${R.map(()=>"?").join(",")})`),T.push(...R)}t.openOnly&&c.push("(i.status IS NULL OR i.status <> 'done')"),t.favorite!==void 0&&c.push(`i.favorite = ${t.favorite?1:0}`),t.tagId&&(c.push("EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)"),T.push(t.tagId)),t.payment!==void 0&&c.push(`p.item_id IS ${t.payment?"NOT NULL":"NULL"}`),t.dueFrom&&(c.push("i.due_at >= ?"),T.push(t.dueFrom)),t.dueTo&&(c.push("i.due_at < ?"),T.push(t.dueTo));const f={manual:"i.pinned DESC, i.sort_order",updated:"i.updated_at DESC",opened:"i.opened_at DESC",due:"i.due_at IS NULL, i.due_at, i.priority DESC",created:"i.created_at DESC",title:"i.title COLLATE NOCASE"}[t.orderBy??"manual"];t.orderBy==="opened"&&c.push("i.opened_at IS NOT NULL");const p=t.limit&&t.limit>0?` LIMIT ${Math.floor(t.limit)}`:"";return o.all(`${oe} WHERE ${c.join(" AND ")} ORDER BY ${f}${p}`,T).map(ae)}};return O}const v={"ui.theme":"dark","ui.sidebarWidth":264,"ui.rightPanelOpen":!0,"dashboard.cards":[{id:"stats",visible:!0},{id:"overdue",visible:!0},{id:"today",visible:!0},{id:"upcoming",visible:!0},{id:"recentNotes",visible:!0},{id:"favorites",visible:!0}],"reminders.defaultTime":"09:00","profile.greetingName":"",shortcuts:{newNote:"CommandOrControl+N",newTask:"CommandOrControl+Shift+T",search:"CommandOrControl+K",calendar:"CommandOrControl+Shift+C",quickCapture:"CommandOrControl+Shift+Space",screenshot:"CommandOrControl+Shift+S"}};function Fe(e){const{db:r,env:o}=e;return{get(a){const E=r.get("SELECT value FROM settings WHERE key = ?",[a]);if(!E)return v[a];try{return JSON.parse(E.value)}catch{return v[a]}},set(a,E){if(!(a in v))throw new Error(`Unknown setting: ${String(a)}`);return r.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,[a,JSON.stringify(E),L(o.now())]),E},all(){const a={...v};for(const E of r.all("SELECT key, value FROM settings"))if(E.key in v)try{a[E.key]=JSON.parse(E.value)}catch{}return a}}}const H=e=>({id:e.id,sha256:e.sha256,name:e.name,mime:e.mime,size:A(e.size),width:e.width==null?null:A(e.width),height:e.height==null?null:A(e.height),createdAt:e.created_at}),G=e=>({...H(e),itemId:e.item_id,itemTitle:e.item_title,role:e.role,attachedAt:e.attached_at}),z=`
  SELECT f.*, x.item_id, i.title AS item_title, x.role, x.created_at AS attached_at
  FROM item_files x JOIN files f ON f.id = x.file_id JOIN items i ON i.id = x.item_id`,ve=/^[0-9a-f]{64}$/;function Me(e){return e.replace(/\.[^.]{1,8}$/,"").replace(/[_]+/g," ").trim()||e}function be(e,r){const{db:o,env:a}=e;function E(i){const s=i.sha256?.toLowerCase();if(!s||!ve.test(s))throw new N("Nieprawidłowy skrót pliku (SHA-256)");if(!Number.isInteger(i.size)||i.size<0)throw new N("Nieprawidłowy rozmiar pliku");const n=o.get("SELECT * FROM files WHERE sha256 = ?",[s]);if(n)return H(n);const d=a.newId();return o.run("INSERT INTO files (id, sha256, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",[d,s,i.name.trim()||"plik",i.mime||"application/octet-stream",i.size,i.width??null,i.height??null,L(a.now())]),H(o.get("SELECT * FROM files WHERE id = ?",[d]))}function l(i,s,n="attachment"){if(r.items.get(i),!o.get("SELECT 1 FROM files WHERE id = ?",[s]))throw new g("File",s);const d=o.get("SELECT MAX(sort_order) AS m FROM item_files WHERE item_id = ?",[i]),u=L(a.now());o.run(`INSERT INTO item_files (item_id, file_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, file_id) DO NOTHING`,[i,s,n,(d?.m==null?0:A(d.m))+1,u]),o.run("UPDATE items SET updated_at = ? WHERE id = ?",[u,i])}return{register:E,addToItem(i,s){return e.tx(()=>{const n=E(s);return l(i,n.id),G(o.get(`${z} WHERE x.item_id = ? AND x.file_id = ?`,[i,n.id]))})},addToFolder(i,s,n){return e.tx(()=>{i&&r.folders.get(i);const d=E(s),u=r.items.create({type:"note",title:n?.trim()||Me(d.name),folderId:i});return l(u.id,d.id),r.items.get(u.id)})},detach(i,s){r.items.get(i),o.run("DELETE FROM item_files WHERE item_id = ? AND file_id = ?",[i,s]),o.run("UPDATE items SET updated_at = ? WHERE id = ?",[L(a.now()),i])},rename(i,s){if(!s.trim())throw new N("Nazwa pliku nie może być pusta");o.run("UPDATE files SET name = ? WHERE id = ?",[s.trim(),i]);const n=o.get("SELECT * FROM files WHERE id = ?",[i]);if(!n)throw new g("File",i);return H(n)},forItem(i){return o.all(`${z} WHERE x.item_id = ? ORDER BY x.sort_order`,[i]).map(G)},forFolder(i,s={}){const n=["i.deleted_at IS NULL"],d=[];if(i===null)n.push("i.folder_id IS NULL");else if(s.includeSubfolders){const m=r.folders.descendantIds(i);n.push(`i.folder_id IN (${m.map(()=>"?").join(",")})`),d.push(...m)}else n.push("i.folder_id = ?"),d.push(i);s.imagesOnly&&n.push("f.mime LIKE 'image/%'");const u=s.limit&&s.limit>0?` LIMIT ${Math.floor(s.limit)}`:"";return o.all(`${z} WHERE ${n.join(" AND ")} ORDER BY x.created_at DESC, f.name${u}`,d).map(G)}}}function Xe(e){const{db:r,env:o}=e,a="i.deleted_at IS NULL AND (i.status IS NULL OR i.status <> 'done')";function E(i,s,n="i.due_at, i.priority DESC",d=50){return r.all(`${oe} WHERE ${i} ORDER BY ${n} LIMIT ${d}`,s).map(ae)}function l(i,s){const n=r.get(`SELECT COUNT(*) AS c FROM items i LEFT JOIN payments p ON p.item_id = i.id WHERE ${i}`,s);return Number(n?.c??0)}return{summary(){const i=o.now(),s=ne(i),n=k(s,1),d=k(s,8),u=Se(i),m=`${a} AND i.type = 'task' AND i.due_at IS NOT NULL
        AND ((i.all_day = 1 AND i.due_at < ?) OR (i.all_day = 0 AND i.due_at < ?))`,_=[s,u],O=`${a} AND i.type IN ('task', 'event') AND i.due_at >= ? AND i.due_at < ?
        AND NOT (i.type = 'task' AND i.all_day = 0 AND i.due_at < ?)`,t=[s,n,u],c=`${a} AND i.type IN ('task', 'event') AND i.due_at >= ? AND i.due_at < ?`,T=[n,d],f=`${a} AND p.item_id IS NOT NULL AND i.due_at >= ? AND i.due_at < ?`,p=[s,k(s,7)];return{overdue:E(m,_),today:E(O,t),upcoming:E(c,T),recentNotes:E("i.deleted_at IS NULL AND i.type = 'note'",[],"i.updated_at DESC",8),recentlyOpened:E("i.deleted_at IS NULL AND i.opened_at IS NOT NULL",[],"i.opened_at DESC",8),favorites:E("i.deleted_at IS NULL AND i.favorite = 1",[],"i.title COLLATE NOCASE",20),counts:{overdue:l(m,_),today:l(O,t),upcoming:l(c,T),paymentsThisWeek:l(f,p),notes:l("i.deleted_at IS NULL AND i.type = 'note'",[]),favorites:l("i.deleted_at IS NULL AND i.favorite = 1",[])}}}}}const K="",V="";function xe(e){const r=e.normalize("NFC").replace(/ł/g,"l").replace(/Ł/g,"L").split(/[\s"'()*:^+\-,.;!?]+/u).map(o=>o.trim()).filter(Boolean).slice(0,12);return r.length?r.map(o=>`"${o.replace(/"/g,"")}"*`).join(" "):null}const He=e=>e.replace(/ł/g,"l").replace(/Ł/g,"L");function $e(e,r){const o=/[\u0001\u0002]/g,a=e.replace(/^…/,"").replace(/…$/,""),E=a.replace(o,"");if(!E)return e;for(const l of r){const i=He(l).indexOf(E);if(i<0)continue;const s=l.slice(i,i+E.length);let n="",d=0;for(const u of a)u===K||u===V?n+=u:n+=s[d++];return e.replace(a,n)}return e}const se=[["ą","a"],["ć","c"],["ę","e"],["ł","l"],["ń","n"],["ó","o"],["ś","s"],["ź","z"],["ż","z"],["Ą","a"],["Ć","c"],["Ę","e"],["Ł","l"],["Ń","n"],["Ó","o"],["Ś","s"],["Ź","z"],["Ż","z"]],w=e=>se.reduce((r,[o,a])=>`replace(${r}, '${o}', '${a}')`,`coalesce(${e}, '')`),j=e=>se.reduce((r,[o,a])=>r.split(o).join(a),e).toLowerCase();function We(e,r){const o=j(e);let a=-1,E=0;for(const s of r){const n=o.indexOf(s);n>=0&&(a<0||n<a)&&(a=n,E=s.length)}if(a<0)return e.slice(0,90);const l=Math.max(0,a-40),i=Math.min(e.length,a+E+60);return`${l>0?"…":""}${e.slice(l,a)}${K}${e.slice(a,a+E)}${V}${e.slice(a+E,i)}${i<e.length?"…":""}`}function ke(e,r){const{db:o}=e;function a(E,l){const i=j(E).split(/[\s"'()*:^+\-,.;!?]+/u).filter(Boolean).slice(0,8);if(!i.length)return[];const s=`(${w("i.title")} || ' ' || ${w("i.body_text")} || ' ' ||
      ${w("(SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id)")} || ' ' ||
      ${w("(SELECT group_concat(f.name, ' ') FROM item_files x JOIN files f ON f.id = x.file_id WHERE x.item_id = i.id)")})`;return o.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id FROM items i
       WHERE i.deleted_at IS NULL AND ${i.map(()=>`instr(lower(${s}), ?) > 0`).join(" AND ")}
       ORDER BY (instr(lower(${w("i.title")}), ?) > 0) DESC, i.updated_at DESC LIMIT ?`,[...i,i[0],l]).map(d=>({...d,snip:We(d.body_text||d.title,i)}))}return{fullText:()=>r.fullText,search(E,l=30){const i=xe(E);if(!i)return[];const s=r.fullText?o.all(`SELECT i.id, i.title, i.body_text, i.type, i.folder_id,
                snippet(items_fts, -1, '${K}', '${V}', '…', 14) AS snip
         FROM items_fts JOIN items i ON i.id = items_fts.item_id
         WHERE items_fts MATCH ? AND i.deleted_at IS NULL
         ORDER BY bm25(items_fts, 0.0, 8.0, 1.0, 3.0)
         LIMIT ?`,[i,l]):a(E,l),n=j(E.trim());return[...o.all(`SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL AND instr(lower(${w("name")}), ?) > 0
         ORDER BY name COLLATE NOCASE LIMIT 10`,[n]).map(u=>({kind:"folder",id:u.id,title:u.name,snippet:"",folderId:u.parent_id})),...s.map(u=>({kind:"item",id:u.id,title:u.title,snippet:$e(u.snip??"",[u.body_text,u.title]),itemType:u.type,folderId:u.folder_id}))]}}}function Pe(e){const{db:r}=e;return{list(){const o=r.all("SELECT id, title, type, deleted_at FROM items WHERE deleted_at IS NOT NULL AND trashed_with IS NULL"),a=r.all("SELECT id, name, deleted_at FROM folders WHERE deleted_at IS NOT NULL AND trashed_with = id");return[...o.map(E=>({kind:"item",id:E.id,title:E.title,deletedAt:E.deleted_at,itemType:E.type})),...a.map(E=>({kind:"folder",id:E.id,title:E.name,deletedAt:E.deleted_at}))].sort((E,l)=>l.deletedAt.localeCompare(E.deletedAt))}}}const Be={now:()=>new Date,newId:()=>crypto.randomUUID()};function Ge(e,r={}){ce(e),_e(e);const o=Le(e,r.fullText!==!1),a={db:e,tx:le(e),env:r.env??Be},E=De(a),l=Ce(a),i=Ue(a),s=he(a,{tags:i,folders:l}),n=Fe(a),d=be(a,{items:s,folders:l}),u=Xe(a),m=ke(a,{fullText:o}),_=Pe(a);return r.seed!==!1&&E.seedDefaults(),{api:{categories:{list:E.list,create:E.create,update:E.update,remove:E.remove},folders:{tree:l.tree,list:l.list,get:l.get,path:l.path,create:l.create,update:l.update,move:l.move,trash:l.trash,restore:l.restore,purge:l.purge},tags:{list:i.list,update:i.update,remove:i.remove},items:{get:s.get,create:s.create,update:s.update,setTags:s.setTags,setStatus:s.setStatus,toggleFavorite:s.toggleFavorite,markOpened:s.markOpened,move:s.move,trash:s.trash,restore:s.restore,purge:s.purge,query:s.query},files:{register:d.register,addToItem:d.addToItem,addToFolder:d.addToFolder,detach:d.detach,rename:d.rename,forItem:d.forItem,forFolder:d.forFolder},trash:{list:_.list},dashboard:{summary:u.summary},search:{query:m.search,fullText:m.fullText},settings:{all:n.all,get:n.get,set:n.set}},close:()=>e.close()}}const ze=new Set(["categories.create","categories.update","categories.remove","folders.create","folders.update","folders.move","folders.trash","folders.restore","folders.purge","tags.update","tags.remove","items.create","items.update","items.setTags","items.setStatus","items.toggleFavorite","items.move","items.trash","items.restore","items.purge","files.register","files.addToItem","files.addToFolder","files.detach","files.rename","settings.set"]);function Ye(e,r){if(typeof r!="string")return null;const[o,a,...E]=r.split(".");if(!o||!a||E.length||!Object.prototype.hasOwnProperty.call(e,o))return null;const l=e[o];if(!Object.prototype.hasOwnProperty.call(l,a))return null;const i=l[a];return typeof i=="function"?i:null}function je(e,r,o){const a=Ye(e,r);if(!a)return{result:{ok:!1,error:{name:"NotFound",message:`Unknown method: ${String(r)}`}},mutated:!1};try{return{result:{ok:!0,value:a(...Array.isArray(o)?o:[])},mutated:ze.has(r)}}catch(E){const l=E;return l.name!=="ValidationError"&&l.name!=="NotFoundError"&&console.error(`[core] ${String(r)} failed`,l),{result:{ok:!1,error:{name:l.name||"Error",message:l.message||String(E)}},mutated:!1}}}function Je(e,r){const o=new e.Database(r??null),a=l=>l.map(i=>typeof i=="bigint"?Number(i):i);function E(l,i,s){const n=o.prepare(l);try{i.length&&n.bind(a(i));const d=[];for(;n.step()&&(d.push(n.getAsObject()),!!s););return d}finally{n.free()}}return{exec:l=>{o.exec(l)},run:(l,i=[])=>(o.run(l,a(i)),{changes:o.getRowsModified()}),get:(l,i=[])=>E(l,i,!1)[0],all:(l,i=[])=>E(l,i,!0),close:()=>o.close(),exportBytes:()=>{const l=o.export();return o.exec("PRAGMA foreign_keys = ON;"),l}}}const Ke="notatnik",W="files",M="blobs";function de(){return new Promise((e,r)=>{const o=indexedDB.open(Ke,2);o.onupgradeneeded=()=>{const a=o.result.objectStoreNames;a.contains(W)||o.result.createObjectStore(W),a.contains(M)||o.result.createObjectStore(M)},o.onsuccess=()=>e(o.result),o.onerror=()=>r(o.error)})}async function J(e,r=W){const o=await de();try{return await new Promise((a,E)=>{const l=o.transaction(r,"readonly").objectStore(r).get(e);l.onsuccess=()=>a(l.result?new Uint8Array(l.result):null),l.onerror=()=>E(l.error)})}finally{o.close()}}async function Ee(e,r,o=W){const a=await de();try{await new Promise((E,l)=>{const i=a.transaction(o,"readwrite");i.objectStore(o).put(r.slice().buffer,e),i.oncomplete=()=>E(),i.onerror=()=>l(i.error),i.onabort=()=>l(i.error)})}finally{a.close()}}async function Ve(){try{return navigator.storage?.persist?await navigator.storage.persisted()?!0:await navigator.storage.persist():!1}catch{return!1}}async function Qe(e){if(!globalThis.crypto?.subtle)throw new Error("Ta przeglądarka nie obsługuje bezpiecznego skrótu plików (wymagane HTTPS).");const r=await crypto.subtle.digest("SHA-256",e.slice().buffer);return[...new Uint8Array(r)].map(o=>o.toString(16).padStart(2,"0")).join("")}function Ze(e){const r=new Map,o=new Map;return{async put(a,E){const l=await Qe(a);return e()?await J(l,M).catch(()=>null)||await Ee(l,a,M):r.set(l,a),{sha256:l,size:a.byteLength}},async url(a,E){const l=o.get(a);if(l)return l;const i=r.get(a)??(e()?await J(a,M).catch(()=>null):null);if(!i)return null;const s=URL.createObjectURL(new Blob([i.slice().buffer],{type:E||"application/octet-stream"}));return o.set(a,s),s}}}const te="notatnik.sqlite",qe=400;async function et(e){const r=await e(),o={persistent:!1};let a=null;try{a=await J(te),o.persistent=!0}catch{o.note="Ta przeglądarka blokuje zapis danych (np. tryb prywatny). Zmiany znikną po zamknięciu karty."}const E=window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===!0;o.persistent&&!await Ve()&&!E&&(o.note="Dane są zapisane w tej przeglądarce. Wyczyszczenie danych strony je usunie.");const l=Je(r,a),i=Ge(l);let s=!a,n,d=Promise.resolve();const u=()=>{if(clearTimeout(n),!s||!o.persistent)return d;s=!1;const t=l.exportBytes();return d=d.then(()=>Ee(te,t)).then(()=>{o.lastSavedAt=Date.now()}).catch(c=>{s=!0,console.error("Saving database failed",c),o.note="Nie udało się zapisać danych w pamięci przeglądarki."}),d},m=()=>{s=!0,clearTimeout(n),n=setTimeout(u,qe)};document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&u()}),window.addEventListener("pagehide",()=>void u()),s&&m();const _=new Set,O={async call(t,c){const{result:T,mutated:f}=je(i.api,t,c);if(f){m();const p={method:t,at:Date.now()};queueMicrotask(()=>_.forEach(R=>R(p)))}return T.ok?{ok:!0,value:T.value===void 0?void 0:structuredClone(T.value)}:T},onChanged(t){return _.add(t),()=>_.delete(t)},platform:/android/i.test(navigator.userAgent)?"android":/iphone|ipad/i.test(navigator.userAgent)?"ios":"web",runtime:"web",storage:()=>({...o}),blobs:Ze(()=>o.persistent)};window.bridge=O}export{et as installWebBridge};
