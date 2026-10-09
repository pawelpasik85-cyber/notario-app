var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/widget/scriptable-entry.ts
var scriptable_entry_exports = {};
__export(scriptable_entry_exports, {
  snapshotFromRecords: () => snapshotFromRecords
});
module.exports = __toCommonJS(scriptable_entry_exports);

// src/core/util/date.ts
var pad = (n, w = 2) => String(n).padStart(w, "0");
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// src/core/model/types.ts
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};

// src/core/services/recurrence.ts
var FREQS = ["daily", "weekly", "monthly", "yearly"];
var MAX_STEPS = 1e4;
function normalizeRecurrence(r) {
  if (r == null) return null;
  if (typeof r !== "object") throw new ValidationError("Nieprawid\u0142owe powtarzanie");
  const x = r;
  if (!FREQS.includes(x.freq)) throw new ValidationError("Nieznany rodzaj powtarzania");
  const interval = x.interval == null ? 1 : Number(x.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) throw new ValidationError("Odst\u0119p powtarzania musi by\u0107 liczb\u0105 1\u2013365");
  const out = { freq: x.freq, interval };
  if (x.freq === "weekly" && Array.isArray(x.byWeekday) && x.byWeekday.length) {
    const days = [...new Set(x.byWeekday.map(Number))].sort();
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ValidationError("Nieprawid\u0142owy dzie\u0144 tygodnia");
    out.byWeekday = days;
  }
  if (x.count != null) {
    const c = Number(x.count);
    if (!Number.isInteger(c) || c < 1 || c > 1e3) throw new ValidationError("Liczba powt\xF3rze\u0144 musi by\u0107 1\u20131000");
    out.count = c;
  }
  if (x.until != null && x.until !== "") {
    if (typeof x.until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.until)) throw new ValidationError("Data ko\u0144ca powtarzania: RRRR-MM-DD");
    out.until = x.until;
  }
  return out;
}
var ymd = (d) => d.split("-").map(Number);
var pad2 = (n) => String(n).padStart(2, "0");
var weekdayOf = (date) => {
  const [y, m, d] = ymd(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};
var dayDiff = (a, b) => {
  const [y1, m1, d1] = ymd(a);
  const [y2, m2, d2] = ymd(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};
function addMonthsClamped(date, months, day) {
  const [y, m] = ymd(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12 + 1;
  return `${ny}-${pad2(nm)}-${pad2(Math.min(day, daysInMonth(ny, nm)))}`;
}
function* startDays(anchor, rule) {
  var _a, _b;
  const step = (_a = rule.interval) != null ? _a : 1;
  const day = ymd(anchor)[2];
  if (rule.freq === "daily") {
    for (let i = 0; ; i++) yield addDays(anchor, i * step);
  } else if (rule.freq === "weekly") {
    const wd = ((_b = rule.byWeekday) == null ? void 0 : _b.length) ? rule.byWeekday : [weekdayOf(anchor)];
    const monday = addDays(anchor, -weekdayOf(anchor));
    for (let w = 0; ; w++) {
      const weekStart = addDays(monday, w * 7 * step);
      for (const d of wd) {
        const date = addDays(weekStart, d);
        if (date >= anchor) yield date;
      }
    }
  } else {
    const months = rule.freq === "monthly" ? step : step * 12;
    for (let i = 0; ; i++) yield addMonthsClamped(anchor, i * months, day);
  }
}
function expandOccurrences(item, rule, from, to, limit = 500) {
  var _a;
  const base = (_a = item.startAt) != null ? _a : item.dueAt;
  if (!base || !item.dueAt) return [];
  const anchor = base.slice(0, 10);
  const startTime = item.startAt ? item.startAt.slice(10) : "";
  const dueTime = item.dueAt.slice(10);
  const length = item.startAt ? dayDiff(anchor, item.dueAt.slice(0, 10)) : 0;
  const out = [];
  let n = 0;
  for (const d of startDays(anchor, rule)) {
    n++;
    if (n > MAX_STEPS) break;
    if (rule.count != null && n > rule.count) break;
    if (rule.until && d > rule.until) break;
    const startAt = item.startAt ? d + startTime : null;
    if ((startAt != null ? startAt : d) >= to) break;
    const dueAt = addDays(d, length) + dueTime;
    if (dueAt < from) continue;
    out.push({ key: d, startAt, dueAt });
    if (out.length >= limit) break;
  }
  return out;
}

// src/core/services/holidays.ts
var pad3 = (n) => String(n).padStart(2, "0");
var iso = (d) => `${d.getFullYear()}-${pad3(d.getMonth() + 1)}-${pad3(d.getDate())}`;
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(year, month - 1, day);
}
var cache = /* @__PURE__ */ new Map();
function holidaysOf(year) {
  const hit = cache.get(year);
  if (hit) return hit;
  const out = /* @__PURE__ */ new Map();
  const add2 = (date, name, dayOff, occasion = false) => {
    const prev = out.get(date);
    out.set(date, prev ? { name: `${prev.name} \xB7 ${name}`, dayOff: prev.dayOff || dayOff, occasion: !!prev.occasion && occasion } : { name, dayOff, occasion });
  };
  const fixed = (m, d, name, dayOff) => add2(`${year}-${pad3(m)}-${pad3(d)}`, name, dayOff);
  const e = easter(year);
  const fromEaster = (days, name, dayOff) => {
    const d = new Date(e.getFullYear(), e.getMonth(), e.getDate() + days);
    add2(iso(d), name, dayOff);
  };
  fixed(1, 1, "Nowy Rok", true);
  fixed(1, 6, "Trzech Kr\xF3li (Objawienie Pa\u0144skie)", true);
  fromEaster(0, "Wielkanoc", true);
  fromEaster(1, "Poniedzia\u0142ek Wielkanocny", true);
  fixed(5, 1, "\u015Awi\u0119to Pracy", true);
  fixed(5, 3, "\u015Awi\u0119to Konstytucji 3 Maja", true);
  fromEaster(49, "Zielone \u015Awi\u0105tki (Zes\u0142anie Ducha \u015Awi\u0119tego)", true);
  fromEaster(60, "Bo\u017Ce Cia\u0142o", true);
  fixed(8, 15, "Wniebowzi\u0119cie NMP \xB7 \u015Awi\u0119to Wojska Polskiego", true);
  fixed(11, 1, "Wszystkich \u015Awi\u0119tych", true);
  fixed(11, 11, "Narodowe \u015Awi\u0119to Niepodleg\u0142o\u015Bci", true);
  if (year >= 2025) fixed(12, 24, "Wigilia Bo\u017Cego Narodzenia", true);
  fixed(12, 25, "Bo\u017Ce Narodzenie (pierwszy dzie\u0144)", true);
  fixed(12, 26, "Bo\u017Ce Narodzenie (drugi dzie\u0144)", true);
  fixed(2, 2, "Ofiarowanie Pa\u0144skie (MB Gromnicznej)", false);
  fromEaster(-46, "\u015Aroda Popielcowa", false);
  fromEaster(-7, "Niedziela Palmowa", false);
  fromEaster(-3, "Wielki Czwartek", false);
  fromEaster(-2, "Wielki Pi\u0105tek", false);
  fromEaster(-1, "Wielka Sobota", false);
  fromEaster(42, "Wniebowst\u0105pienie Pa\u0144skie", false);
  fixed(11, 2, "Zaduszki", false);
  fixed(12, 8, "Niepokalane Pocz\u0119cie NMP", false);
  if (year < 2025) fixed(12, 24, "Wigilia Bo\u017Cego Narodzenia", false);
  const occ = (m, d, name) => add2(`${year}-${pad3(m)}-${pad3(d)}`, name, false, true);
  occ(1, 21, "Dzie\u0144 Babci");
  occ(1, 22, "Dzie\u0144 Dziadka");
  occ(2, 14, "Walentynki");
  add2(iso(new Date(e.getFullYear(), e.getMonth(), e.getDate() - 52)), "T\u0142usty Czwartek", false, true);
  occ(3, 8, "Dzie\u0144 Kobiet");
  occ(4, 1, "Prima aprilis");
  occ(5, 26, "Dzie\u0144 Matki");
  occ(6, 1, "Dzie\u0144 Dziecka");
  occ(6, 23, "Dzie\u0144 Ojca");
  occ(9, 30, "Dzie\u0144 Ch\u0142opaka");
  occ(10, 14, "Dzie\u0144 Nauczyciela");
  occ(11, 29, "Andrzejki");
  occ(12, 6, "Miko\u0142ajki");
  occ(12, 31, "Sylwester");
  cache.set(year, out);
  return out;
}
function holidayOn(date) {
  return holidaysOf(Number(date.slice(0, 4))).get(date.slice(0, 10));
}

// src/core/services/workdays.ts
var pad4 = (n) => String(n).padStart(2, "0");
function shift(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad4(t.getUTCMonth() + 1)}-${pad4(t.getUTCDate())}`;
}
function weekdayIndex(date) {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
function dayOffOn(date) {
  const h = holidayOn(date);
  return (h == null ? void 0 : h.dayOff) ? { date: date.slice(0, 10), name: h.name } : null;
}
function isWorkday(date) {
  return weekdayIndex(date) < 5 && !dayOffOn(date);
}
function daysOffBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = shift(d, 1)) {
    const h = dayOffOn(d);
    if (h) out.push(h);
  }
  return out;
}

// src/core/services/leave.ts
var LEAVE_TYPES = [
  { code: "UW", name: "Urlop wypoczynkowy", hint: "20 dni przy sta\u017Cu poni\u017Cej 10 lat, 26 dni od 10 lat (do sta\u017Cu wlicza si\u0119 szko\u0142a)", color: "#22c55e", unit: "work", limit: "uw" },
  { code: "U\u017B", name: "Urlop na \u017C\u0105danie", hint: "4 dni w roku, wliczane do wypoczynkowego", color: "#84cc16", unit: "work", limit: 4, partOf: "UW" },
  { code: "SW", name: "Si\u0142a wy\u017Csza", hint: "art. 148\xB9 KP \u2014 2 dni (lub 16 godz.) w roku, p\u0142atne 50%", color: "#f59e0b", unit: "work", limit: 2 },
  { code: "UO", name: "Urlop okoliczno\u015Bciowy", hint: "2 dni: w\u0142asny \u015Blub, narodziny dziecka, \u015Bmier\u0107 bliskich; 1 dzie\u0144: \u015Blub dziecka, \u015Bmier\u0107 rodze\u0144stwa, te\u015Bci\xF3w, dziadk\xF3w", color: "#a855f7", unit: "work" },
  { code: "OP", name: "Opieka nad dzieckiem", hint: "art. 188 KP \u2014 2 dni (lub 16 godz.) w roku na dziecko do 14 lat", color: "#06b6d4", unit: "work", limit: 2 },
  { code: "UOP", name: "Urlop opieku\u0144czy", hint: "5 dni w roku, bezp\u0142atny \u2014 opieka nad cz\u0142onkiem rodziny", color: "#0ea5e9", unit: "work", limit: 5 },
  { code: "L4", name: "Zwolnienie lekarskie (L4)", hint: "Liczone w dniach kalendarzowych. Przez 33 dni w roku p\u0142aci pracodawca (14 dni po 50. roku \u017Cycia), potem ZUS", color: "#ef4444", unit: "calendar", employerDays: 33 },
  { code: "UM", name: "Urlop macierzy\u0144ski", hint: "20 tygodni przy jednym dziecku", color: "#ec4899", unit: "calendar", limit: 140, total: true },
  { code: "UR", name: "Urlop rodzicielski", hint: "41 tygodni (43 przy wi\u0119cej ni\u017C jednym dziecku) do podzia\u0142u mi\u0119dzy rodzic\xF3w; z tego 9 tygodni przys\u0142uguje tylko ojcu (URO) i tylko matce", color: "#d946ef", unit: "calendar", limit: 287, total: true },
  { code: "URO", name: "Rodzicielski ojca", hint: "9 tygodni urlopu rodzicielskiego tylko dla ojca (te\u017C nazywane \u201Etacierzy\u0144skim\u201D) \u2014 nie przechodz\u0105 na matk\u0119, przepadaj\u0105, je\u015Bli ojciec ich nie we\u017Amie; do 6. roku \u017Cycia dziecka, w maks. 5 cz\u0119\u015Bciach; wliczane do 41 tygodni; p\u0142atne 70%", color: "#6366f1", unit: "calendar", limit: 63, total: true, partOf: "UR" },
  { code: "UOJ", name: "Urlop ojcowski", hint: "2 tygodnie = 14 dni kalendarzowych (weekendy te\u017C si\u0119 licz\u0105), do uko\u0144czenia przez dziecko 12 miesi\u0119cy; jednorazowo albo w 2 cz\u0119\u015Bciach po tygodniu; p\u0142atny 100%. Potocznie \u201Etacierzy\u0144ski\u201D", color: "#3b82f6", unit: "calendar", limit: 14, total: true },
  { code: "UB", name: "Urlop bezp\u0142atny", hint: "Na wniosek, bez limitu; liczony w dniach kalendarzowych", color: "#64748b", unit: "calendar" }
];
var LEAVE = new Map(LEAVE_TYPES.map((t) => [t.code, t]));
var DEFAULT_LEAVE = { uw: 26 };
function allowance(s, year) {
  var _a, _b;
  const v = (_a = s == null ? void 0 : s.years) == null ? void 0 : _a[String(year)];
  return (_b = v != null ? v : s == null ? void 0 : s.uw) != null ? _b : DEFAULT_LEAVE.uw;
}
var pad5 = (n) => String(n).padStart(2, "0");
function next(date) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad5(t.getUTCMonth() + 1)}-${pad5(t.getUTCDate())}`;
}
function counts(type, date) {
  return type.unit === "calendar" || isWorkday(date);
}
function countDays(a, from = "0000-01-01", to = "9999-12-31") {
  const type = LEAVE.get(a.tag);
  if (!type) return 0;
  let n = 0;
  const s = a.startDate > from ? a.startDate : from;
  const e = a.dueDate < to ? a.dueDate : to;
  for (let d = s; d <= e; d = next(d)) if (counts(type, d)) n++;
  return n;
}
function leaveSummary(list, year, settings, today) {
  var _a;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const live = list.filter((a) => a.status !== "cancelled");
  const rows = /* @__PURE__ */ new Map();
  for (const type of LEAVE_TYPES) {
    let used = 0;
    let planned = 0;
    const [f, t] = type.total ? ["0000-01-01", "9999-12-31"] : [from, to];
    for (const a of live.filter((x) => x.tag === type.code)) {
      used += countDays(a, f, t < today ? t : today);
      planned += countDays(a, today > f ? next(today) : f, t);
    }
    const limit = type.limit === "uw" ? allowance(settings, year) : (_a = type.limit) != null ? _a : null;
    rows.set(type.code, { type, used, planned, limit, left: limit == null ? null : limit - used - planned });
  }
  for (const part of LEAVE_TYPES.filter((t) => t.partOf)) {
    const whole = rows.get(part.partOf);
    const own = rows.get(part.code);
    whole.left = whole.left - own.used - own.planned;
    own.left = Math.min(own.left, Math.max(0, whole.left));
  }
  return [...rows.values()];
}

// src/widget/snapshot.ts
var STATUS_COLOR = { new: "#3b82f6", in_progress: "#a855f7", ready: "#22c55e", shipped: "#64748b", cancelled: "#475569" };
var MAX_SPAN = 62;
var pad6 = (n) => String(n).padStart(2, "0");
function shiftDay(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad6(t.getUTCMonth() + 1)}-${pad6(t.getUTCDate())}`;
}
function widgetRange(today) {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7);
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    lo: shiftDay(`${today.slice(0, 7)}-01`, -7),
    hi: shiftDay(`${end.getUTCFullYear()}-${pad6(end.getUTCMonth() + 1)}-${pad6(end.getUTCDate())}`, 7)
  };
}
function push(days, d, m) {
  var _a;
  const list = (_a = days[d]) != null ? _a : days[d] = [];
  if (list.length < 3 && !list.some((x) => x.c === m.c && x.code === m.code)) list.push(m);
}
function add(list, d, e) {
  var _a;
  const l = (_a = list[d]) != null ? _a : list[d] = [];
  if (l.length < 10) l.push(e);
}
function eachDay(from, to, lo, hi, fn) {
  let d = from < lo ? lo : from;
  const end = to > hi ? hi : to;
  for (let n = 0; d <= end && n < MAX_SPAN; d = shiftDay(d, 1), n++) fn(d);
}
var plural = (n, one, few, many) => n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
function buildSnapshot(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const { today } = input;
  const { lo, hi } = widgetRange(today);
  const off = daysOffBetween(lo, hi).map((h) => h.date);
  const mainDays = {};
  const mainList = {};
  const sorted = [...input.main].sort((a, b) => {
    var _a2, _b2;
    return ((_a2 = a.start) != null ? _a2 : a.due).localeCompare((_b2 = b.start) != null ? _b2 : b.due);
  });
  for (const e of sorted) {
    if (e.type === "task" && e.done) continue;
    const first = ((_a = e.start) != null ? _a : e.due).slice(0, 10);
    const at = (_b = e.start) != null ? _b : e.due;
    eachDay(first, e.due.slice(0, 10), lo, hi, (d) => {
      push(mainDays, d, { c: e.color });
      add(mainList, d, { t: e.title || "Bez tytu\u0142u", c: e.color, time: d === first && at.length > 10 ? at.slice(11, 16) : void 0, s: e.type === "task" ? "zadanie" : void 0 });
    });
  }
  const todayTasks = input.main.filter((e) => e.type === "task" && !e.done && e.due.slice(0, 10) === today).length;
  const next2 = input.main.filter((e) => e.type === "event" && e.due.slice(0, 10) >= today).sort((a, b) => {
    var _a2, _b2;
    return ((_a2 = a.start) != null ? _a2 : a.due).localeCompare((_b2 = b.start) != null ? _b2 : b.due);
  }).slice(0, 4).map((e) => {
    var _a2;
    const at = (_a2 = e.start) != null ? _a2 : e.due;
    return { d: at.slice(0, 10) < today ? today : at.slice(0, 10), time: at.length > 10 ? at.slice(11, 16) : void 0, t: e.title || "Bez tytu\u0142u", c: e.color };
  });
  const pages = [{
    id: "main",
    name: "Kalendarz",
    icon: "\u{1F4C5}",
    color: "#7c5cff",
    kind: "main",
    days: mainDays,
    off,
    info: todayTasks ? `Dzi\u015B ${todayTasks} ${plural(todayTasks, "zadanie", "zadania", "zada\u0144")}` : "Dzi\u015B bez zada\u0144",
    next: next2,
    list: mainList
  }];
  for (const cal of input.calendars) {
    const all = input.orders.filter((o) => o.calendarId === cal.id && o.status !== "cancelled");
    const days = {};
    const dayList = {};
    let info;
    let list;
    const kind = cal.kind === "study" || cal.kind === "work" ? cal.kind : "orders";
    if (kind === "work") {
      const abs = all.filter((o) => LEAVE.has(o.tag));
      for (const o of abs) {
        const type = LEAVE.get(o.tag);
        eachDay(o.startDate, o.dueDate, lo, hi, (d) => {
          if (!counts(type, d)) return;
          push(days, d, { c: type.color, code: type.code });
          add(dayList, d, { t: type.name, c: type.color, s: type.code });
        });
      }
      const sum = leaveSummary(abs, +today.slice(0, 4), cal.leave, today);
      const uw = sum.find((r) => r.type.code === "UW");
      const l4 = sum.find((r) => r.type.code === "L4");
      info = `Urlop: zosta\u0142o ${uw.left} z ${uw.limit}${l4.used + l4.planned ? ` \xB7 L4: ${l4.used + l4.planned} dni` : ""}`;
      list = abs.filter((o) => o.dueDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 4).map((o) => {
        const ty = LEAVE.get(o.tag);
        return { d: o.startDate < today ? today : o.startDate, t: ty.name, c: ty.color, s: ty.code };
      });
    } else {
      const active = all.filter((o) => o.status !== "shipped");
      const isLate = (o) => (o.status === "new" || o.status === "in_progress") && o.dueDate < today;
      for (const o of all) {
        const end = o.shipDate && o.shipDate > o.dueDate ? o.shipDate : o.dueDate;
        const c = isLate(o) ? "#ef4444" : (_d = (_c = STATUS_COLOR[o.status]) != null ? _c : cal.color) != null ? _d : "#f97316";
        eachDay(o.startDate, end, lo, hi, (d) => {
          push(days, d, { c });
          const s = d === o.dueDate ? "termin" : d === o.shipDate ? "wysy\u0142ka" : d === o.startDate ? "start" : d > o.dueDate ? "do wysy\u0142ki" : "w toku";
          add(dayList, d, { t: `${o.tag ? `${o.tag}: ` : ""}${o.title}`, c, s });
        });
      }
      const late = active.filter(isLate).length;
      info = `${active.length} w toku${late ? ` \xB7 ${late} po terminie` : ""}`;
      list = active.map((o) => ({ o, d: o.status === "ready" && o.shipDate ? o.shipDate : o.dueDate })).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 4).map(({ o, d }) => {
        var _a2;
        return {
          d,
          t: `${o.tag ? `${o.tag}: ` : ""}${o.title}`,
          c: isLate(o) ? "#ef4444" : (_a2 = STATUS_COLOR[o.status]) != null ? _a2 : "#f97316",
          s: o.status === "ready" && o.shipDate ? "wysy\u0142ka" : isLate(o) ? "po terminie" : "termin"
        };
      });
    }
    pages.push({ id: cal.id, name: cal.name, icon: (_e = cal.icon) != null ? _e : "\u2B50", color: (_f = cal.color) != null ? _f : "#f97316", kind, days, off, info, next: list, list: dayList });
  }
  return { v: 1, made: ((_g = input.now) != null ? _g : /* @__PURE__ */ new Date()).toISOString(), today, pages, tasks: (_i = input.tasks) != null ? _i : tasksOf(input.main, today, (_h = input.now) != null ? _h : /* @__PURE__ */ new Date()) };
}
function tasksOf(main, today, now) {
  const nowLocal = `${today}T${pad6(now.getHours())}:${pad6(now.getMinutes())}`;
  const tasks = main.filter((e) => e.type === "task");
  const late = (e) => !e.done && (e.due.length > 10 ? e.due < nowLocal : e.due < today);
  const todays = tasks.filter((e) => e.due.slice(0, 10) === today && !late(e)).sort((a, b) => Number(a.done) - Number(b.done) || (a.due.length > 10 ? a.due : `${a.due}T99`).localeCompare(b.due.length > 10 ? b.due : `${b.due}T99`));
  const overdue = tasks.filter(late).sort((a, b) => a.due.localeCompare(b.due));
  const map = (e) => ({ t: e.title || "Bez tytu\u0142u", c: e.color, time: e.due.length > 10 ? e.due.slice(11, 16) : void 0, done: e.done || void 0, d: e.due.slice(0, 10), pay: e.pay || void 0 });
  return { today: todays.slice(0, 20).map(map), overdue: overdue.slice(-20).map(map) };
}

// src/widget/from-records.ts
var str = (v) => v == null ? null : String(v);
function snapshotFromRecords(records, today, now = /* @__PURE__ */ new Date()) {
  var _a, _b, _c;
  const { lo, hi } = widgetRange(today);
  const by = (t) => records.filter((r) => r.tbl === t && r.data);
  const cat = new Map(by("categories").map((r) => [r.id, r.data]));
  const fol = new Map(by("folders").map((r) => [r.id, r.data]));
  const done = new Set(by("occurrence_states").filter((r) => r.data.status === "done").map((r) => `${r.data.item_id}|${r.data.occurrence_key}`));
  const colorOf = (d) => {
    const c = d.category_id ? cat.get(String(d.category_id)) : void 0;
    if (c == null ? void 0 : c.color) return String(c.color);
    const f = d.folder_id ? fol.get(String(d.folder_id)) : void 0;
    const fc = (f == null ? void 0 : f.category_id) ? cat.get(String(f.category_id)) : void 0;
    if (fc == null ? void 0 : fc.color) return String(fc.color);
    if (f == null ? void 0 : f.color) return String(f.color);
    return d.type === "event" ? "#7c5cff" : "#3b82f6";
  };
  const pays = new Set(by("payments").map((r) => r.id));
  const main = [];
  for (const r of by("items")) {
    const d = r.data;
    if (d.deleted_at || !d.due_at || d.type !== "task" && d.type !== "event") continue;
    const base = { startAt: str(d.start_at), dueAt: String(d.due_at) };
    const type = d.type;
    let rule = null;
    try {
      rule = d.recurrence ? normalizeRecurrence(typeof d.recurrence === "string" ? JSON.parse(d.recurrence) : d.recurrence) : null;
    } catch {
      rule = null;
    }
    if (rule) {
      for (const o of expandOccurrences(base, rule, type === "task" ? shiftDay(today, -60) : lo, shiftDay(hi, 1))) {
        main.push({ type, title: String((_a = d.title) != null ? _a : ""), start: o.startAt, due: o.dueAt, done: done.has(`${r.id}|${o.key}`), color: colorOf(d), pay: pays.has(r.id) });
      }
    } else {
      const first = ((_b = base.startAt) != null ? _b : base.dueAt).slice(0, 10);
      const keepLate = type === "task" && d.status !== "done" && base.dueAt.slice(0, 10) >= shiftDay(today, -60);
      if (base.dueAt.slice(0, 10) < lo && !keepLate || first > hi) continue;
      main.push({ type, title: String((_c = d.title) != null ? _c : ""), start: base.startAt, due: base.dueAt, done: d.status === "done", color: colorOf(d), pay: pays.has(r.id) });
    }
  }
  const calendars = by("calendars").map((r) => {
    var _a2, _b2, _c2, _d;
    let leave = null;
    try {
      leave = r.data.leave ? JSON.parse(String(r.data.leave)) : null;
    } catch {
      leave = null;
    }
    return { id: r.id, name: String((_a2 = r.data.name) != null ? _a2 : ""), kind: String((_b2 = r.data.kind) != null ? _b2 : "orders"), icon: str(r.data.icon), color: str(r.data.color), leave, sort: Number((_c2 = r.data.sort_order) != null ? _c2 : 0), created: String((_d = r.data.created_at) != null ? _d : "") };
  }).sort((a, b) => a.sort - b.sort || a.created.localeCompare(b.created));
  const orders = by("orders").map((r) => {
    var _a2, _b2;
    return {
      calendarId: String(r.data.calendar_id),
      title: String((_a2 = r.data.title) != null ? _a2 : ""),
      tag: str(r.data.tag),
      startDate: String(r.data.start_date),
      dueDate: String(r.data.due_date),
      shipDate: str(r.data.ship_date),
      status: String((_b2 = r.data.status) != null ? _b2 : "new")
    };
  });
  return buildSnapshot({ today, now, main, calendars, orders });
}
