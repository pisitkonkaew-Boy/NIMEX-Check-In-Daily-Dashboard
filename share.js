/* NIMEX Check-in Daily — แชร์/ส่งออกแบบเลือกหัวข้อ + อินโฟกราฟิก 16:9 (สกิล nimex-export-infographic-169)
   - ใช้ตัวกรองบนหน้า (เดือน / ถึงวันที่ · ไม่รวมวันอาทิตย์) ผ่าน getFilteredData() ของหน้าเดิม ไม่เปลี่ยนสูตรเดิม
   - % = จำนวนรายการสถานะนั้น ÷ รายการทั้งหมด × 100 (1 รายการ = รถ 1 คัน ใน 1 วัน) · ค่าปรับ = ผลรวมค่าปรับหลัง Waive
   - ช่วงก่อนหน้า = จำนวนวันทำการ (จันทร์–เสาร์) เท่ากัน ติดกันก่อนวันแรกของช่วงที่เลือก
   - เกรด DC จาก % ตรงเวลา ปิดไว้ก่อน ผู้ดูแลตั้งเกณฑ์และเปิดได้ที่หน้า ⚙️ ตั้งค่า
   - กราฟ 4 ช่องในอินโฟกราฟิก ผู้ดูแลเลือกได้ที่หน้า ⚙️ ตั้งค่า */
(function () {
'use strict';
var KPIS = [
  { id: 'n',    l: 'จำนวนรายการ',          pct: false, dir: 0 },
  { id: 'on',   l: '% ตรงเวลา',            pct: true,  dir: 1 },
  { id: 'late', l: '% สาย',                pct: true,  dir: -1 },
  { id: 'nock', l: '% ไม่ Check in',        pct: true,  dir: -1 },
  { id: 'off',  l: '% Check in ไม่ตรงจุด',  pct: true,  dir: -1 },
  { id: 'fine', l: 'ค่าปรับรวม (บาท)',       pct: false, dir: -1 }
];
var KBY = {}; KPIS.forEach(function (k) { KBY[k.id] = k; });
var CHARTS = [
  ['daily_on', '% ตรงเวลารายวัน · ช่วงนี้เทียบช่วงก่อนหน้า'],
  ['daily_mix', 'สัดส่วน 4 สถานะรายวัน'],
  ['fine_cause', 'ค่าปรับตามสาเหตุ · ช่วงนี้เทียบช่วงก่อนหน้า'],
  ['grade', 'สัดส่วนเกรด DC + แย่สุด 3 อันดับ'],
  ['dc_worst_on', 'DC % ตรงเวลาต่ำสุด 10 อันดับ'],
  ['dc_worst_mix', '% สาย / ไม่ตรงจุด / ไม่ Check in ของ DC ที่ตรงเวลาต่ำสุด'],
  ['dc_fine', 'DC ค่าปรับสูงสุด 10 อันดับ'],
  ['reg_on', '% ตรงเวลารายภาค · เทียบช่วงก่อนหน้า'],
  ['reg_mix', 'สัดส่วน 4 สถานะรายภาค'],
  ['reg_fine', 'ค่าปรับรายภาค แยกสาเหตุ'],
  ['dc_worst_reg', 'DC % ตรงเวลาต่ำสุด 10 อันดับ (ระบุภาค)']
];
var CBY = {}; CHARTS.forEach(function (c) { CBY[c[0]] = c[1]; });
var DEF = { gradeOn: false, grade: { A: 90, B: 85, C: 80, D: 70 }, minRows: 10, charts: ['daily_on', 'daily_mix', 'fine_cause', 'dc_worst_on'], chartsDay: ['reg_on', 'reg_mix', 'reg_fine', 'dc_worst_reg'] };
/* ภาค: ใช้ DC → โซน ชุดเดียวกับระบบ Check-in Performance (เหนือ/อีสาน/ใต้ รวมโซนย่อย) */
var REG_ORDER = ['BKK', 'กลาง', 'ตะวันออก', 'ตะวันตก', 'เหนือ', 'อีสาน', 'ใต้'];
function zmap() { var c = (window.CID && CID.getShare()) || {}; return window.CID_ZMAP || c.zmap || {}; }
/* ดึง DC → โซน ล่าสุดจาก Performance (ครั้งเดียวต่อการเปิดหน้า) แล้วเก็บสำเนาไว้ในค่าตั้งของระบบนี้ถ้าเปลี่ยน */
var zoneP = null;
function ensureZmap() {
  if (window.CID_ZMAP) return Promise.resolve(window.CID_ZMAP);
  if (zoneP) return zoneP;
  if (!window.CID_ZONE_API) return Promise.resolve(zmap());
  zoneP = fetch(window.CID_ZONE_API + (window.CID_ZONE_API.indexOf('?') < 0 ? '?' : '&') + 'z=' + Date.now()).then(function (r) { return r.json(); }).then(function (j) {
    var m = j && (j.meta || j.data || j).zmap; if (!m || typeof m !== 'object' || !Object.keys(m).length) throw new Error('no zmap');
    window.CID_ZMAP = m;
    var cur = (window.CID && CID.getShare()) || {};
    if (window.CID && CID.isAdmin() && JSON.stringify(cur.zmap || {}) !== JSON.stringify(m)) CID.saveShare(Object.assign({}, cur, { zmap: m })).catch(function () {});
    return m;
  }).catch(function () { zoneP = null; return zmap(); });
  return zoneP;
}
function regionOf(dc) { var z = zmap()[String(dc).split(' ')[0]]; if (!z) return 'ไม่ระบุ'; return /^เหนือ/.test(z) ? 'เหนือ' : /^อีสาน/.test(z) ? 'อีสาน' : /^ใต้/.test(z) ? 'ใต้' : z; }
function hasRegions() { return Object.keys(zmap()).length > 0; }
var GC = { A: '#123f8c', B: '#6e93d6', C: '#d4a72c', D: '#d9822b', F: '#b8334a' };
var GE = { A: '🔵', B: '🟦', C: '🟡', D: '🟠', F: '🔴' }, MD = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
var GOOD = '#1a9e5f', BAD = '#b8334a';           /* ผลต่าง: ดี = เขียว แย่ = แดง (ตามสกิล) */
var COL = { on: '#1d57b8', late: '#b8860b', off: '#2f8f8f', nock: '#b8334a', prev: '#9fb0cc' };   /* สีสถานะเดียวกับหน้าแดชบอร์ด */
var ST = { on: 'ตรงเวลา', lt: 'สาย', ab: 'ไม่ Check in', wp: 'Check in ไม่ตรงจุด' };
var BWK = ['on', 'late', 'nock', 'off'];
var SECS = [['kpi', 'KPI หลัก'], ['dc', 'DC ที่ % ตรงเวลาต่ำสุด 10 อันดับ'], ['fine', 'DC ค่าปรับสูงสุด 10 อันดับ'], ['vt', 'ผลตามประเภทรถ'], ['plate', 'ทะเบียนที่มีปัญหามากที่สุด 10 อันดับ']]
  .concat(BWK.map(function (id) { return ['bw_' + id, 'ดีสุด/แย่สุด · ' + KBY[id].l]; }));
var picked = { kpi: 1, dc: 1, fine: 1, vt: 1 };
var DAY = 864e5;

/* ---------- เครื่องมือเล็ก ---------- */
function $(id) { return document.getElementById(id); }
function E(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function nf(v) { return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '–'; }
function p1(v) { return Number.isFinite(v) ? v.toFixed(1) + '%' : '–'; }
function fmtK(id, v) { return KBY[id].pct ? p1(v) : nf(v); }
function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function cfg() {
  var s = (window.CID && CID.getShare()) || {}, g = s.grade || DEF.grade;
  var ch = Array.isArray(s.charts) && s.charts.length === 4 && s.charts.every(function (c) { return CBY[c]; }) ? s.charts.slice() : DEF.charts.slice();
  var chd = Array.isArray(s.chartsDay) && s.chartsDay.length === 4 && s.chartsDay.every(function (c) { return CBY[c]; }) ? s.chartsDay.slice() : DEF.chartsDay.slice();
  return { gradeOn: !!s.gradeOn, grade: g, minRows: s.minRows || DEF.minRows, charts: ch, chartsDay: chd };
}
function grade(v) { var c = cfg(), g = c.grade; return !c.gradeOn || !Number.isFinite(v) ? '' : v >= g.A ? 'A' : v >= g.B ? 'B' : v >= g.C ? 'C' : v >= g.D ? 'D' : 'F'; }
function adm() { return !window.CID || CID.isAdmin(); }
function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function isoOf(t) { return new Date(t).toISOString().slice(0, 10); }
function sunday(t) { return new Date(t).getUTCDay() === 0; }
function ddmm(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }

/* ---------- สถิติ (สถานะ/ค่าปรับจากผลที่หน้าเดิมคำนวณไว้) ---------- */
function stats(rows) {
  var n = rows.length, c = { on: 0, lt: 0, ab: 0, wp: 0 }, f = { lt: 0, ab: 0, wp: 0 }, fine = 0, cars = new Set();
  rows.forEach(function (r) {
    fine += r.fine; cars.add(r.plate || r.code);
    if (r.status === ST.on) c.on++; else if (r.status === ST.lt) { c.lt++; f.lt += r.fine; }
    else if (r.status === ST.wp) { c.wp++; f.wp += r.fine; } else if (r.status === ST.ab) { c.ab++; f.ab += r.fine; }
  });
  var p = function (k) { return n ? c[k] / n * 100 : NaN; };
  return { n: n, on: p('on'), late: p('lt'), nock: p('ab'), off: p('wp'), fine: fine, cars: cars.size, c: c, f: f };
}
function group(rows, key) { var m = new Map(); rows.forEach(function (r) { var k = key(r), a = m.get(k); if (!a) m.set(k, a = []); a.push(r); }); return m; }
function datesOf(rows) { return Array.from(new Set(rows.map(function (r) { return r.dateISO; }))).sort(); }

function period() {
  if (window.cidCompare) {   /* ใช้ช่วงและกติกาเทียบเดียวกับแถบ วัน/สัปดาห์/เดือน (period.js) */
    var c = cidCompare(), cu = getFilteredData();
    if (c.empty || !cu.length) return { cur: [], prev: null, curLabel: 'ไม่มีข้อมูล', prevLabel: '', N: 0 };
    return { cur: cu, prev: c.prev && c.prev.length ? c.prev : null, N: c.N, d0: c.from, d1: c.to, p0: c.pfrom, p1: c.pto, curLabel: c.label, prevLabel: c.prevLabel, rule: c.rule };
  }
  var cur = getFilteredData(), ds = datesOf(cur);
  if (!ds.length) return { cur: [], prev: null, curLabel: 'ไม่มีข้อมูล', prevLabel: '', N: 0 };
  var d0 = ds[0], d1 = ds[ds.length - 1], N = 0, t;
  for (t = utc(d0); t <= utc(d1); t += DAY) if (!sunday(t)) N++;
  var k = 0, p0 = null, p1_ = null;
  for (t = utc(d0) - DAY; k < N; t -= DAY) if (!sunday(t)) { if (!p1_) p1_ = isoOf(t); p0 = isoOf(t); k++; }
  var prev = (typeof visibleResults === 'function' ? visibleResults() : S.results).filter(function (r) { return r.dateISO >= p0 && r.dateISO <= p1_ && !isSunday(r.dateISO); });
  var pd = datesOf(prev).length;
  return { cur: cur, prev: prev.length ? prev : null, N: N, d0: d0, d1: d1, p0: p0, p1: p1_,
    curLabel: fmtTH(d0) + (d1 !== d0 ? ' – ' + fmtTH(d1) : '') + ' (' + N + ' วันทำการ)',
    prevLabel: prev.length ? fmtTH(p0) + (p1_ !== p0 ? ' – ' + fmtTH(p1_) : '') + (pd < N ? ' (มีข้อมูล ' + pd + ' จาก ' + N + ' วัน)' : '') : '' };
}
function scopeText() { var d = getFilteredData(), n = new Set(d.map(function (r) { return r.dc; })).size, rg = hasRegions() ? new Set(d.map(function (r) { return regionOf(r.dc); })).size : 0; return 'ทุก DC (' + nf(n) + ' DC' + (rg ? ' · ' + rg + ' ภาค' : '') + ')'; }
function otherFilters() {
  var t = [];
  var pm = window.cidPeriod ? cidPeriod.get().mode : 'custom';
  try { if (pm === 'custom' && S.execFilterMonth) { var m = S.execFilterMonth.split('-'); t.push('เดือน ' + ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][+m[1]] + ' ' + (+m[0] + 543)); } if (pm === 'custom' && S.execFilterTo) t.push('ถึง ' + fmtTH(S.execFilterTo)); } catch (e) {}
  t.push('ไม่รวมวันอาทิตย์'); t.push('ค่าปรับหลัง Waive');
  return t.join(' · ');
}

/* ---------- ข้อมูลแต่ละหัวข้อ ---------- */
function kpiData(P) {
  var C = stats(P.cur), R = P.prev ? stats(P.prev) : null;
  return KPIS.map(function (k) {
    var id = k.id, v = C[id], pv = R ? R[id] : NaN, diff = NaN;
    if (R && Number.isFinite(v) && Number.isFinite(pv)) diff = k.pct ? v - pv : (pv ? (v - pv) / pv * 100 : NaN);
    return { id: id, l: k.l, v: v, prev: pv, diff: diff, cars: C.cars,
      good: (!k.dir || !Number.isFinite(diff) || Math.abs(diff) < 0.05) ? null : (k.dir > 0 ? diff > 0 : diff < 0), gr: id === 'on' ? grade(v) : '' };
  });
}
function dcData(rows) { var out = []; group(rows, function (r) { return r.dc; }).forEach(function (a, d) { var s = stats(a); s.name = d; s.gr = grade(s.on); out.push(s); }); return out; }
function dcRanked(P) { var mr = cfg().minRows; return dcData(P.cur).filter(function (s) { return s.n >= mr; }); }
function dcWorst10(P) { return dcRanked(P).sort(function (a, b) { return a.on - b.on || b.n - a.n; }).slice(0, 10); }
function dcFine10(P) { return dcData(P.cur).filter(function (s) { return s.fine > 0; }).sort(function (a, b) { return b.fine - a.fine; }).slice(0, 10); }
function regData(rows) {
  var g = group(rows, function (r) { return regionOf(r.dc); }), out = [];
  REG_ORDER.concat(['ไม่ระบุ']).forEach(function (k) { if (g.has(k)) { var s = stats(g.get(k)); s.name = k; s.dcs = new Set(g.get(k).map(function (r) { return r.dc; })).size; out.push(s); } });
  return out;
}
function vtData(P) { var out = []; group(P.cur, function (r) { return r.vehicleType || '-'; }).forEach(function (a, k) { var s = stats(a); s.name = k; out.push(s); }); return out.sort(function (a, b) { return b.n - a.n; }); }
function plateData(P) {   /* เรียงแบบเดียวกับหน้า "วิเคราะห์ความเสี่ยง": สาย + ไม่ตรงจุด×2 + ไม่ Check in×2 */
  var m = {};
  P.cur.forEach(function (r) {
    if (r.status === ST.on) return; var k = r.plate || r.code, x = m[k] || (m[k] = { plate: k, dc: r.dc, lt: 0, wp: 0, ab: 0, fn: 0 });
    if (r.status === ST.lt) x.lt++; else if (r.status === ST.wp) x.wp++; else x.ab++; x.fn += r.fine;
  });
  return Object.values(m).sort(function (a, b) { return (b.lt + b.wp * 2 + b.ab * 2) - (a.lt + a.wp * 2 + a.ab * 2); }).slice(0, 10);
}
/* ดีสุด/แย่สุด: DC 5+5 (ถ้าน้อยกว่า ใช้ครึ่งหนึ่ง ไม่ซ้ำกัน); ตัวที่ต่ำ = ดี เรียงกลับด้าน */
function bw(list, key, n, dir) {
  var arr = list.filter(function (x) { return Number.isFinite(x[key]); }).sort(function (a, b) { return dir > 0 ? b[key] - a[key] : a[key] - b[key]; });
  var k = Math.min(n, Math.floor(arr.length / 2));
  return { best: arr.slice(0, k), worst: arr.slice(arr.length - k).reverse(), all: arr };
}
function bwData(P, id) { return bw(dcRanked(P), id, 5, KBY[id].dir); }

/* ---------- ข้อความสรุป (อีโมจิ) ---------- */
function diffTxt(t) {
  if (!Number.isFinite(t.diff)) return 'ไม่มีช่วงก่อนหน้า';
  var z = Math.abs(t.diff) < 0.05, s = (z ? '±' : t.diff > 0 ? '+' : '−') + Math.abs(t.diff).toFixed(1) + (KBY[t.id].pct ? ' จุด' : '%');
  return (t.good === null ? '' : t.good ? '🟢 ' : '🔴 ') + s;
}
function summaryText() {
  var P = period(), L = ['📊 NIMEX Check-in Daily', '🗓️ ' + P.curLabel + '  |  📍 ' + scopeText(), P.prevLabel ? '↔️ เทียบ ' + P.prevLabel : '↔️ ไม่มีช่วงก่อนหน้า', '⚙️ ' + otherFilters()];
  var sec = function (t) { L.push(''); L.push(t); }, mr = cfg().minRows;
  if (picked.kpi) { sec('🎯 KPI หลัก'); kpiData(P).forEach(function (t) { L.push((t.gr ? GE[t.gr] + ' ' : '• ') + t.l + ': ' + fmtK(t.id, t.v) + (t.id === 'n' ? ' (' + nf(t.cars) + ' คัน)' : '') + (t.gr ? ' เกรด ' + t.gr : '') + '  (' + diffTxt(t) + ')'); }); }
  if (picked.dc) { sec('🚨 DC ที่ % ตรงเวลาต่ำสุด (≥ ' + mr + ' รายการ)'); dcWorst10(P).slice(0, 5).forEach(function (s, i) { L.push(MD[i] + ' ' + s.name + ': ' + p1(s.on) + (s.gr ? ' เกรด ' + s.gr : '') + ' · ' + nf(s.n) + ' รายการ'); }); }
  if (picked.fine) { sec('💰 DC ค่าปรับสูงสุด'); dcFine10(P).slice(0, 5).forEach(function (s, i) { L.push(MD[i] + ' ' + s.name + ': ' + nf(s.fine) + ' บาท · ' + nf(s.n) + ' รายการ'); }); }
  if (picked.vt) { sec('🚚 ตามประเภทรถ'); vtData(P).forEach(function (s) { L.push('• ' + s.name + ': ' + nf(s.n) + ' รายการ · ' + nf(s.cars) + ' คัน · ตรงเวลา ' + p1(s.on)); }); }
  if (picked.plate) { sec('🚗 ทะเบียนที่มีปัญหามากที่สุด'); plateData(P).slice(0, 5).forEach(function (p, i) { L.push(MD[i] + ' ' + p.plate + ' (' + p.dc + '): สาย ' + p.lt + ' · ไม่ตรงจุด ' + p.wp + ' · ไม่ Check in ' + p.ab + ' · ปรับ ' + nf(p.fn) + ' บาท'); }); }
  BWK.forEach(function (id) {
    if (!picked['bw_' + id]) return; var B = bwData(P, id);
    sec('🏅 ดีสุด/แย่สุด · ' + KBY[id].l + (KBY[id].dir < 0 ? ' (ต่ำ = ดี)' : '') + ' (DC ≥ ' + mr + ' รายการ)');
    if (!B.best.length) L.push('มี DC ไม่พอจัดอันดับ');
    B.best.forEach(function (s) { L.push('🟢 ' + s.name + ': ' + p1(s[id]) + ' · ' + nf(s.n) + ' รายการ'); });
    B.worst.forEach(function (s) { L.push('🔴 ' + s.name + ': ' + p1(s[id]) + ' · ' + nf(s.n) + ' รายการ'); });
  });
  return L.join('\n');
}

/* ---------- SVG: ฟอนต์ Prompt + โลโก้ฝังในภาพ (ไม่ใช้ html2canvas) ---------- */
var FONT_CSS = null, LOGO = null;
function fontCss() {
  if (FONT_CSS != null) return FONT_CSS;
  var out = [], seen = {};
  [].forEach.call(document.querySelectorAll('style'), function (s) { (s.textContent.match(/@font-face\s*\{[^}]*\}/g) || []).forEach(function (f) { if (f.indexOf('Prompt') >= 0 && !seen[f]) { seen[f] = 1; out.push(f); } }); });
  return (FONT_CSS = out.join('\n'));
}
function logoData() {
  if (LOGO) return Promise.resolve(LOGO);
  try {
    var im = document.querySelector('img.nx-logo');
    if (im && im.complete && im.naturalWidth) { var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); LOGO = c.toDataURL('image/png'); return Promise.resolve(LOGO); }
  } catch (e) { LOGO = null; }
  return fetch('logo.png').then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (res) { var f = new FileReader(); f.onload = function () { LOGO = f.result; res(LOGO); }; f.readAsDataURL(b); }); }).catch(function () { return ''; });
}
function wrapSvg(W, H, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Prompt, sans-serif"><defs><style>' + fontCss() + ' text{font-family:Prompt,sans-serif}</style></defs>' + body + '</svg>';
}
function toPng(svg, W, H, scale) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function (b) { b ? res(b) : rej(new Error('png')); }, 'image/png');
    };
    img.onerror = function () { rej(new Error('svg')); }; img.src = url;
  });
}
function waitFonts() { return (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve(); }
function T(x, y, s, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-size="' + (o.fs || 16) + '" font-weight="' + (o.fw || 400) + '" fill="' + (o.c || '#0b1f3f') + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + '>' + E(s) + '</text>'; }
function R(x, y, w, h, c, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + Math.max(0, w) + '" height="' + Math.max(0, h) + '"' + (rx ? ' rx="' + rx + '"' : '') + ' fill="' + c + '"/>'; }
function noData(x, y, w, h, t) { return T(x + w / 2, y + h / 2, t || 'ไม่มีข้อมูล', { fs: 16, a: 'middle', c: '#55657f' }); }

/* ---------- กราฟ ---------- */
function niceAxis(vals) {   /* % ช่วงแคบ (เช่น 85–98%) ไม่เริ่มที่ 0 */
  var v = vals.filter(Number.isFinite); if (!v.length) return { lo: 0, hi: 100, note: '' };
  var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
  var lo = (v.length >= 2 && mn >= 40 && mx - mn <= 30) ? Math.max(0, Math.floor((mn - 5) / 10) * 10) : 0, top = Math.min(100, Math.max(mx * 1.08, lo + 4)), span = Math.max(1, top - lo), step = [1, 2, 5, 10, 20, 25].filter(function (x) { return x * 4 >= span; })[0] || 25;
  var hi = lo + step * 4; if (hi > 100 && mx <= 100) hi = 100;
  return { lo: lo, hi: hi, note: lo ? 'แกนเริ่มที่ ' + lo + '%' : '' };
}
function niceMax(mx) { if (!(mx > 0)) return 1; var e = Math.pow(10, Math.floor(Math.log10(mx))), m = mx / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
function panel(x, y, w, h, title, sub) {
  return '<g transform="translate(' + x + ' ' + y + ')"><rect width="' + w + '" height="' + h + '" rx="16" fill="#fff" stroke="#dbe3f0"/><rect width="' + w + '" height="5" rx="2" fill="#d4af37"/>' +
    T(22, 38, title, { fs: 20, fw: 600, c: '#0a2a5e' }) + (sub ? T(w - 20, 38, sub, { fs: 13.5, c: '#55657f', a: 'end' }) : '') + '</g>';
}
function legend(x, y, items) { var s = '', xx = x; items.forEach(function (it) { s += R(xx, y - 11, 14, 14, it[1], 3) + T(xx + 20, y + 1, it[0], { fs: 13.5 }); xx += 34 + it[0].length * 8.2; }); return s; }
function gridY(x, y, w, ch, base, lo, hi, fmt) {
  var s = ''; for (var t = 0; t <= 4; t++) { var gv = lo + (hi - lo) * t / 4, gy = base - ch * t / 4; s += '<line x1="' + x + '" x2="' + (x + w) + '" y1="' + gy + '" y2="' + gy + '" stroke="#e4e9f2"/>' + T(x - 6, gy + 4, fmt(gv), { fs: 11.5, c: '#8a99b3', a: 'end' }); }
  return s;
}
function pctTick(v) { return (Math.round(v * 10) / 10) + '%'; }
function kTick(v) { return v >= 1000 ? (Math.round(v / 100) / 10) + 'k' : String(Math.round(v)); }
/* แท่งแนวนอน: items [{name, n, v}] */
function hbars(x, y, w, h, items, color, pct) {
  if (!items.length) return { s: noData(x, y, w, h), note: '' };
  var ax = pct ? niceAxis(items.map(function (i) { return i.v; })) : { lo: 0, hi: niceMax(Math.max.apply(null, items.map(function (i) { return i.v; }))), note: '' };
  var lab = Math.min(300, w * .42), vw = 110, bwd = w - lab - vw, rh = Math.min(64, h / Math.max(1, items.length)), two = rh >= 46, s = '';
  items.forEach(function (it, i) {
    var yy = y + i * rh, len = Number.isFinite(it.v) ? Math.max(2, (Math.max(it.v, ax.lo) - ax.lo) / (ax.hi - ax.lo) * bwd) : 0, cy = yy + rh / 2;
    if (two) s += T(x, cy - 3, cut(it.name, 26), { fs: 16, fw: 600 }) + T(x, cy + 16, nf(it.n) + ' รายการ', { fs: 12.5, c: '#55657f' });
    else s += T(x, cy + 5, cut(it.name, it.tag ? 18 : 22), { fs: 14, fw: 600 }) + (it.tag ? R(x + lab - 150, cy - 9, 58, 20, '#eef2f9', 10) + T(x + lab - 121, cy + 5, it.tag, { fs: 11.5, fw: 600, c: '#0a2a5e', a: 'middle' }) : '') + T(x + lab - 8, cy + 5, nf(it.n) + ' รายการ', { fs: 11.5, c: '#8a99b3', a: 'end' });
    s += R(x + lab, yy + rh * .2, bwd, rh * .6, '#eef2f9', 6) + R(x + lab, yy + rh * .2, len, rh * .6, color, 6);
    s += T(x + lab + bwd + 10, cy + 6, pct ? p1(it.v) : nf(it.v), { fs: two ? 19 : 15, fw: 600, c: '#0a2a5e' });
  });
  return { s: s, note: ax.note };
}
/* แท่งกลุ่มแนวตั้ง: groups [{label, sub, vals:[]}] series [[name,color]] */
function vgroups(x, y, w, h, groups, series, pct) {
  if (!groups.length) return { s: noData(x, y, w, h), note: '' };
  var all = []; groups.forEach(function (g) { all = all.concat(g.vals); });
  var ax = pct ? niceAxis(all) : { lo: 0, hi: niceMax(Math.max.apply(null, all.filter(Number.isFinite).concat([0]))), note: '' };
  var base = y + h - 42, ch = h - 76, gw = w / groups.length, ns = series.length, bwid = Math.min(40, gw * .8 / ns), s = gridY(x, y, w, ch, base, ax.lo, ax.hi, pct ? pctTick : kTick);
  groups.forEach(function (g, i) {
    var cx = x + gw * i + gw / 2, x0 = cx - bwid * ns / 2;
    g.vals.forEach(function (v, j) {
      if (!Number.isFinite(v)) return; var hh = Math.max(2, (Math.min(Math.max(v, ax.lo), ax.hi) - ax.lo) / (ax.hi - ax.lo) * ch), bx = x0 + j * bwid;
      s += R(bx + 1, base - hh, bwid - 2, hh, series[j][1], 3) + T(bx + bwid / 2, base - hh - 5, pct ? (v < 10 ? v.toFixed(1) : Math.round(v)) : kTick(v), { fs: 11, fw: 600, c: '#33445f', a: 'middle' });
    });
    s += T(cx, base + 19, cut(g.label, Math.max(6, Math.floor(gw / 9))), { fs: 13, fw: 600, a: 'middle' }) + (g.sub ? T(cx, base + 35, g.sub, { fs: 11, c: '#8a99b3', a: 'middle' }) : '');
  });
  s += legend(x, y + 6, series);
  return { s: s, note: ax.note };
}
/* เส้นรายวัน: labels [], series [[name,color,vals,dash]] */
function lines(x, y, w, h, labels, series) {
  var n = labels.length; if (!n) return { s: noData(x, y, w, h), note: '' };
  var all = []; series.forEach(function (sr) { all = all.concat(sr[2]); });
  var ax = niceAxis(all), base = y + h - 30, ch = h - 64, s = gridY(x, y, w, ch, base, ax.lo, ax.hi, pctTick);
  var px = function (i) { return n > 1 ? x + 8 + i * (w - 16) / (n - 1) : x + w / 2; }, py = function (v) { return base - (Math.min(Math.max(v, ax.lo), ax.hi) - ax.lo) / (ax.hi - ax.lo) * ch; };
  series.forEach(function (sr, k) {
    var pts = [], seg = '';
    sr[2].slice(0, n).forEach(function (v, i) { if (Number.isFinite(v)) pts.push([px(i), py(v), v, i]); });
    pts.forEach(function (p, i) { seg += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
    if (seg) s += '<path d="' + seg + '" fill="none" stroke="' + sr[1] + '" stroke-width="' + (k ? 2.5 : 3.5) + '"' + (sr[3] ? ' stroke-dasharray="7 5"' : '') + '/>';
    pts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (k ? 3 : 4.5) + '" fill="' + sr[1] + '"/>'; if (!k && (n <= 14 || p[3] === 0 || p[3] === n - 1)) s += T(p[0], p[1] - 9, p[2].toFixed(1), { fs: 11, fw: 600, c: '#0a2a5e', a: 'middle' }); });
  });
  var every = Math.ceil(n / 13); labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) s += T(px(i), base + 20, l, { fs: 11.5, c: '#55657f', a: 'middle' }); });
  s += legend(x, y + 6, series.map(function (sr) { return [sr[0], sr[1]]; }));
  return { s: s, note: ax.note };
}
/* แท่ง 100% ซ้อน 4 สถานะ */
function stack100(x, y, w, h, cols) {
  if (!cols.length) return { s: noData(x, y, w, h), note: '' };
  var base = y + h - 30, ch = h - 64, gw = w / cols.length, bw = Math.min(46, gw * .72), s = gridY(x, y, w, ch, base, 0, 100, pctTick), keys = [['on', 'ตรงเวลา'], ['late', 'สาย'], ['off', 'ไม่ตรงจุด'], ['nock', 'ไม่ Check in']];
  cols.forEach(function (c, i) {
    var cx = x + gw * i + gw / 2, yy = base;
    keys.forEach(function (k) { var v = c.s[k[0]] || 0, hh = v / 100 * ch; yy -= hh; s += R(cx - bw / 2, yy, bw, hh, COL[k[0]]); });
    if (cols.length <= 16) s += T(cx, base - ch * (c.s.on / 100) / 2 + 4, Math.round(c.s.on), { fs: 11, fw: 600, c: '#fff', a: 'middle' });
    var every = Math.ceil(cols.length / 13); if (i % every === 0 || i === cols.length - 1) s += T(cx, base + 20, c.label, { fs: c.sub ? 13.5 : 11.5, fw: c.sub ? 600 : 400, c: c.sub ? '#0b1f3f' : '#55657f', a: 'middle' }) + (c.sub ? T(cx, base + 35, c.sub, { fs: 11, c: '#8a99b3', a: 'middle' }) : '');
  });
  s += legend(x, y + 6, keys.map(function (k) { return [k[1], COL[k[0]]]; }));
  return { s: s, note: 'ตัวเลขในแท่ง = % ตรงเวลา' };
}
/* แท่งซ้อนค่าจริง: cols [{label, sub, parts:[v...], total, prevTotal}] keys [[name,color]] */
function stackAbs(x, y, w, h, cols, keys, fmt) {
  if (!cols.length) return { s: noData(x, y, w, h), note: '' };
  var mx = 0; cols.forEach(function (c) { mx = Math.max(mx, c.total, Number.isFinite(c.prevTotal) ? c.prevTotal : 0); });
  var hi = niceMax(mx * 1.12 / 4) * 4, base = y + h - 42, ch = h - 80, gw = w / cols.length, bw = Math.min(56, gw * .5), s = gridY(x, y, w, ch, base, 0, hi, kTick);
  cols.forEach(function (c, i) {
    var cx = x + gw * i + gw / 2, yy = base;
    c.parts.forEach(function (v, j) { var hh = v / hi * ch; if (hh > 0) { yy -= hh; s += R(cx - bw / 2, yy, bw, hh, keys[j][1]); } });
    if (Number.isFinite(c.prevTotal) && c.prevTotal > 0) { var py = base - c.prevTotal / hi * ch; s += '<line x1="' + (cx - bw / 2 - 6) + '" x2="' + (cx + bw / 2 + 6) + '" y1="' + py + '" y2="' + py + '" stroke="#0a2a5e" stroke-width="2.5" stroke-dasharray="5 3"/>'; }
    s += T(cx, Math.min(yy, Number.isFinite(c.prevTotal) ? base - c.prevTotal / hi * ch : yy) - 7, fmt(c.total), { fs: 13, fw: 600, c: '#0a2a5e', a: 'middle' });
    s += T(cx, base + 19, c.label, { fs: 13.5, fw: 600, a: 'middle' }) + (c.sub ? T(cx, base + 35, c.sub, { fs: 11, c: '#8a99b3', a: 'middle' }) : '');
  });
  s += legend(x, y + 6, keys);
  return { s: s, note: '' };
}
function donut(cx, cy, r, counts) {
  var tot = 0, s = '', a0 = -Math.PI / 2; ['A','B','C','D','F'].forEach(function (g) { tot += counts[g] || 0; });
  if (!tot) return T(cx, cy, 'ไม่มี DC ที่ถึงเกณฑ์', { fs: 16, a: 'middle', c: '#55657f' });
  ['A','B','C','D','F'].forEach(function (g) {
    var v = counts[g] || 0; if (!v) return; var a1 = a0 + v / tot * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, ri = r * .6;
    if (v === tot) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + ri) / 2 + '" fill="none" stroke="' + GC[g] + '" stroke-width="' + (r - ri) + '"/>';
    else s += '<path d="M' + (cx + r * Math.cos(a0)) + ' ' + (cy + r * Math.sin(a0)) + 'A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + (cx + r * Math.cos(a1)) + ' ' + (cy + r * Math.sin(a1)) + 'L' + (cx + ri * Math.cos(a1)) + ' ' + (cy + ri * Math.sin(a1)) + 'A' + ri + ' ' + ri + ' 0 ' + big + ' 0 ' + (cx + ri * Math.cos(a0)) + ' ' + (cy + ri * Math.sin(a0)) + 'Z" fill="' + GC[g] + '"/>';
    a0 = a1;
  });
  return s + T(cx, cy + 4, nf(tot), { fs: 34, fw: 600, c: '#0a2a5e', a: 'middle' }) + T(cx, cy + 28, 'DC', { fs: 15, c: '#55657f', a: 'middle' });
}
function dailyRows(rows) { var g = group(rows, function (r) { return r.dateISO; }); return Array.from(g.keys()).sort().map(function (d) { return { d: d, s: stats(g.get(d)) }; }); }
function chart(id, X, Y, PW, PH, P) {
  var x = X + 70, y = Y + 62, w = PW - 96, h = PH - 76, mr = cfg().minRows, g, title = CBY[id] || id, sub = '';
  if (id === 'daily_on') {
    var dc = dailyRows(P.cur), dp = P.prev ? dailyRows(P.prev) : [];
    var ser = [['ช่วงนี้', COL.on, dc.map(function (d) { return d.s.on; })]]; if (dp.length) ser.push(['ช่วงก่อนหน้า (ลำดับวันทำการเดียวกัน)', COL.prev, dp.map(function (d) { return d.s.on; }), 1]);
    g = lines(x, y, w, h, dc.map(function (d) { return ddmm(d.d); }), ser); sub = [g.note, dp.length ? '' : 'ไม่มีช่วงก่อนหน้า'].filter(Boolean).join(' · ');
  } else if (id === 'daily_mix') {
    var dd = dailyRows(P.cur), cols;
    if (dd.length > 31) { var gw = group(P.cur, function (r) { return getWeekKey(r.dateISO); }); cols = Array.from(gw.keys()).sort().map(function (k) { return { label: ddmm(k), s: stats(gw.get(k)) }; }); sub = 'รายสัปดาห์ (เริ่มวันจันทร์)'; }
    else cols = dd.map(function (d) { return { label: ddmm(d.d), s: d.s }; });
    g = stack100(x, y, w, h, cols); sub = [sub, g.note].filter(Boolean).join(' · ');
  } else if (id === 'fine_cause') {
    var C = stats(P.cur), Rv = P.prev ? stats(P.prev) : null, lab = [['สาย', 'lt'], ['ไม่ตรงจุด', 'wp'], ['ไม่ Check in', 'ab']];
    var ser2 = [['ช่วงนี้', '#123f8c']]; if (Rv) ser2.push(['ช่วงก่อนหน้า', COL.prev]);
    g = vgroups(x, y, w, h, lab.map(function (l) { return { label: l[0], sub: nf(C.c[l[1]]) + ' รายการ', vals: Rv ? [C.f[l[1]], Rv.f[l[1]]] : [C.f[l[1]]] }; }), ser2, false);
    sub = 'รวม ' + nf(C.fine) + ' บาท' + (Rv ? ' · ก่อนหน้า ' + nf(Rv.fine) + ' บาท' : ' · ไม่มีช่วงก่อนหน้า');
  } else if (id === 'dc_worst_on') {
    g = hbars(X + 24, y + 4, PW - 48, h - 8, dcWorst10(P).map(function (s) { return { name: s.name, n: s.n, v: s.on }; }), COL.on, true);
    sub = ['DC ≥ ' + nf(mr) + ' รายการ', g.note].filter(Boolean).join(' · ');
  } else if (id === 'dc_worst_mix') {
    var W6 = dcWorst10(P).slice(0, 6);
    g = vgroups(x, y, w, h, W6.map(function (s) { return { label: s.name, sub: nf(s.n) + ' รายการ', vals: [s.late, s.off, s.nock] }; }), [['% สาย', COL.late], ['% ไม่ตรงจุด', COL.off], ['% ไม่ Check in', COL.nock]], true);
    sub = ['ต่ำ = ดี · DC ≥ ' + nf(mr) + ' รายการ', g.note].filter(Boolean).join(' · ');
  } else if (id === 'dc_fine') {
    g = hbars(X + 24, y + 4, PW - 48, h - 8, dcFine10(P).map(function (s) { return { name: s.name, n: s.n, v: s.fine }; }), COL.nock, false);
    sub = 'บาท';
  } else if (id === 'reg_on' || id === 'reg_mix' || id === 'reg_fine' || id === 'dc_worst_reg') {
    if (!hasRegions()) g = { s: noData(X, Y + 30, PW, PH - 30, 'ยังไม่มีข้อมูลภาคของ DC') };
    else if (id === 'reg_on') {
      var RC = regData(P.cur), RP = P.prev ? regData(P.prev) : [], pm = {}; RP.forEach(function (r) { pm[r.name] = r; });
      var serR = [['ช่วงนี้', COL.on]]; if (P.prev) serR.push(['ช่วงก่อนหน้า', COL.prev]);
      g = vgroups(x, y, w, h, RC.map(function (r) { return { label: r.name, sub: nf(r.n) + ' รายการ', vals: P.prev ? [r.on, pm[r.name] ? pm[r.name].on : NaN] : [r.on] }; }), serR, true);
      sub = [g.note, P.prev ? '' : 'ไม่มีช่วงก่อนหน้า'].filter(Boolean).join(' · ');
    } else if (id === 'reg_mix') {
      g = stack100(x, y, w, h, regData(P.cur).map(function (r) { return { label: r.name, sub: nf(r.n) + ' รายการ', s: r }; }));
      sub = g.note;
    } else if (id === 'reg_fine') {
      var RF = regData(P.cur), RFP = P.prev ? regData(P.prev) : [], fm = {}; RFP.forEach(function (r) { fm[r.name] = r; });
      g = stackAbs(x, y, w, h, RF.map(function (r) { return { label: r.name, sub: (r.c.lt + r.c.wp + r.c.ab) + ' รายการผิด', parts: [r.f.lt, r.f.wp, r.f.ab], total: r.fine, prevTotal: P.prev ? (fm[r.name] ? fm[r.name].fine : 0) : NaN }; }),
        [['สาย', COL.late], ['ไม่ตรงจุด', COL.off], ['ไม่ Check in', COL.nock]], function (v) { return nf(v); });
      var tC = stats(P.cur).fine, tP = P.prev ? stats(P.prev).fine : NaN;
      sub = 'รวม ' + nf(tC) + ' บาท' + (P.prev ? ' · เส้นประ = ช่วงก่อนหน้า (' + nf(tP) + ' บาท)' : ' · ไม่มีช่วงก่อนหน้า');
    } else {
      g = hbars(X + 24, y + 4, PW - 48, h - 8, dcWorst10(P).map(function (s) { return { name: s.name, n: s.n, v: s.on, tag: regionOf(s.name) }; }), COL.on, true);
      sub = ['DC ≥ ' + nf(mr) + ' รายการ', g.note].filter(Boolean).join(' · ');
    }
  } else if (id === 'grade') {
    if (!cfg().gradeOn) g = { s: noData(X, Y + 30, PW, PH - 30, 'ปิดการแสดงเกรดอยู่ (เปิดได้ที่หน้า ⚙️ ตั้งค่า)') };
    else {
      var DD = dcRanked(P), cnt = {}, gc = cfg().grade, prevG = { B: 'A', C: 'B', D: 'C' }, ly = Y + 70, s = '';
      DD.forEach(function (d) { cnt[d.gr] = (cnt[d.gr] || 0) + 1; });
      s += donut(X + 170, Y + PH / 2 + 18, Math.min(120, PH / 2 - 50), cnt);
      ['A','B','C','D','F'].forEach(function (k, i) { var rng = k === 'A' ? '≥ ' + gc.A + '%' : k === 'F' ? '< ' + gc.D + '%' : gc[k] + '–<' + gc[prevG[k]] + '%'; s += R(X + 330, ly + i * 30, 18, 18, GC[k], 4) + T(X + 356, ly + i * 30 + 15, k + '  ' + rng + '  ·  ' + (cnt[k] || 0) + ' DC', { fs: 15 }); });
      var wy = ly + 170; s += T(X + 330, wy, 'แย่สุด 3 อันดับ', { fs: 16, fw: 600, c: BAD });
      dcWorst10(P).slice(0, 3).forEach(function (d, i) { s += '<circle cx="' + (X + 342) + '" cy="' + (wy + 26 + i * 30) + '" r="11" fill="' + BAD + '"/>' + T(X + 342, wy + 31 + i * 30, i + 1, { fs: 13, fw: 600, c: '#fff', a: 'middle' }) + T(X + 362, wy + 31 + i * 30, cut(d.name, 24) + '  ' + p1(d.on) + ' · ' + nf(d.n) + ' รายการ', { fs: 15 }); });
      g = { s: s }; sub = 'DC ≥ ' + nf(mr) + ' รายการ';
    }
  }
  return panel(X, Y, PW, PH, title, sub) + (g ? g.s : '');
}

/* ---------- อินโฟกราฟิก 16:9 (1920×1080 → PNG 3840×2160) ---------- */
function infographic(logo) {
  var W = 1920, H = 1080, P = period(), K = kpiData(P), s = '';
  s += R(0, 0, W, H, '#eef2f9');
  s += R(0, 0, W, 120, '#0a2a5e') + R(0, 116, W, 4, '#d4af37');
  s += R(28, 22, 170, 76, '#fff', 12) + (logo ? '<image href="' + logo + '" x="38" y="30" width="150" height="60" preserveAspectRatio="xMidYMid meet"/>' : '');
  s += T(226, 60, 'NIMEX Check-in Daily · สรุปผลการ Check-in รายวัน', { fs: 33, fw: 600, c: '#fff' }) + T(226, 94, P.curLabel + (P.prevLabel ? '  ·  เทียบ ' + P.prevLabel : '  ·  ไม่มีช่วงก่อนหน้า'), { fs: 19, c: '#f0d57a' });
  var sc = scopeText(); s += R(W - 330, 34, 302, 52, '#d4af37', 26) + T(W - 179, 68, '📍 ' + cut(sc, 22), { fs: 20, fw: 600, c: '#0a2a5e', a: 'middle' });
  var gap = 16, n = K.length, cw = (W - 56 - gap * (n - 1)) / n, cy = 140, chh = 170;
  K.forEach(function (t, i) {
    var x = 28 + i * (cw + gap), bar = t.gr ? GC[t.gr] : '#d4af37', dc = t.good === null ? '#cfdcf2' : t.good ? '#5fe0a0' : '#ff8a98';
    s += '<g transform="translate(' + x + ' ' + cy + ')">' + R(0, 0, cw, chh, '#0a2a5e', 16) + R(0, chh - 6, cw, 6, bar, 3);
    s += T(cw / 2, 38, t.l, { fs: 17, fw: 500, c: '#f0d57a', a: 'middle' }) + T(cw / 2, 98, fmtK(t.id, t.v), { fs: 44, fw: 600, c: '#fff', a: 'middle' });
    s += T(cw / 2, 132, Number.isFinite(t.diff) ? (Math.abs(t.diff) < 0.05 ? '' : t.diff > 0 ? '▲ ' : '▼ ') + diffTxt(t).replace(/^🟢 |^🔴 /, '') : 'ไม่มีช่วงก่อนหน้า', { fs: 16, fw: 600, c: Number.isFinite(t.diff) ? dc : '#cfdcf2', a: 'middle' });
    if (t.id === 'n') s += T(cw / 2, 154, nf(t.cars) + ' คัน', { fs: 13, c: '#cfdcf2', a: 'middle' });
    else if (KBY[t.id].dir < 0) s += T(cw / 2, 154, 'ต่ำ = ดี', { fs: 13, c: '#cfdcf2', a: 'middle' });
    if (t.gr) s += R(cw - 50, 12, 38, 38, bar, 10) + T(cw - 31, 39, t.gr, { fs: 22, fw: 600, c: '#fff', a: 'middle' });
    s += '</g>';
  });
  var top = cy + chh + 20, pw = (W - 56 - 20) / 2, ph = (H - top - 52 - 20) / 2, xs = [28, 28 + pw + 20], ys = [top, top + ph + 20];
  (dayMode() ? cfg().chartsDay : cfg().charts).forEach(function (id, i) { s += chart(id, xs[i % 2], ys[i >> 1], pw, ph, P); });
  s += R(0, H - 40, W, 40, '#0a2a5e') + T(28, H - 14, 'สูตร: % = รายการสถานะนั้น ÷ รายการทั้งหมด × 100 (1 รายการ = รถ 1 คัน/วัน) · ผลต่างของ % เป็นจุด · ' + (P.rule || 'ช่วงก่อนหน้า = วันทำการ (จ.–ส.) เท่ากันก่อนหน้า') + (cfg().gradeOn ? ' · เกรดจาก % ตรงเวลา' : '') + ' · ' + otherFilters(), { fs: 13.5, c: '#cfdcf2' }) + T(W - 28, H - 14, 'NIMEX Fleet Hub', { fs: 15, fw: 600, c: '#f0d57a', a: 'end' });
  return wrapSvg(W, H, s);
}

/* ---------- ตาราง (ใช้ทั้ง PNG ยาว, PowerPoint, Excel) ---------- */
function sections(P) {
  var out = [], c = cfg(), mr = c.minRows, G = c.gradeOn;
  var gh = function (h) { return G ? h.concat(['เกรด']) : h; }, gv = function (r, g) { return G ? r.concat([g || '–']) : r; };
  if (picked.kpi) out.push({ k: 'kpi', t: 'KPI หลัก', w: [3, 2, 2, 2, 1], head: gh(['ตัวชี้วัด', 'ช่วงนี้', 'ช่วงก่อนหน้า', 'ผลต่าง']), rows: kpiData(P).map(function (t) { return gv([t.l, fmtK(t.id, t.v) + (t.id === 'n' ? ' (' + nf(t.cars) + ' คัน)' : ''), P.prev ? fmtK(t.id, t.prev) : '–', diffTxt(t).replace(/^🟢 |^🔴 /, '')], t.gr); }) });
  if (picked.dc) out.push({ k: 'dc', t: 'DC ที่ % ตรงเวลาต่ำสุด 10 อันดับ (≥ ' + nf(mr) + ' รายการ)', w: [.6, 4, 1.4, 1.6, 1.4, 1.8, 1.8, 1.8, 1], head: gh(['#', 'DC', 'รายการ', '% ตรงเวลา', '% สาย', '% ไม่ Check in', '% ไม่ตรงจุด', 'ค่าปรับ (บาท)']), rows: dcWorst10(P).map(function (s, i) { return gv([i + 1, s.name, nf(s.n), p1(s.on), p1(s.late), p1(s.nock), p1(s.off), nf(s.fine)], s.gr); }) });
  if (picked.fine) out.push({ k: 'fine', t: 'DC ค่าปรับสูงสุด 10 อันดับ', w: [.6, 4, 1.4, 2, 2, 2, 2], head: ['#', 'DC', 'รายการ', 'ค่าปรับรวม (บาท)', 'สาย (บาท)', 'ไม่ตรงจุด (บาท)', 'ไม่ Check in (บาท)'], rows: dcFine10(P).map(function (s, i) { return [i + 1, s.name, nf(s.n), nf(s.fine), nf(s.f.lt), nf(s.f.wp), nf(s.f.ab)]; }) });
  if (picked.vt) out.push({ k: 'vt', t: 'ผลตามประเภทรถ', w: [4, 1.4, 1.2, 1.6, 1.4, 1.8, 1.8, 1.8], head: ['ประเภทรถ', 'รายการ', 'คัน', '% ตรงเวลา', '% สาย', '% ไม่ Check in', '% ไม่ตรงจุด', 'ค่าปรับ (บาท)'], rows: vtData(P).map(function (s) { return [s.name, nf(s.n), nf(s.cars), p1(s.on), p1(s.late), p1(s.nock), p1(s.off), nf(s.fine)]; }) });
  if (picked.plate) out.push({ k: 'plate', t: 'ทะเบียนที่มีปัญหามากที่สุด 10 อันดับ', w: [.6, 2, 3.4, 1.2, 1.4, 1.6, 1.8], head: ['#', 'ทะเบียน', 'DC', 'สาย', 'ไม่ตรงจุด', 'ไม่ Check in', 'ค่าปรับ (บาท)'], rows: plateData(P).map(function (p, i) { return [i + 1, p.plate, p.dc, p.lt, p.wp, p.ab, nf(p.fn)]; }) });
  BWK.forEach(function (id) {
    if (!picked['bw_' + id]) return; var k = KBY[id], B = bwData(P, id), tag = function (x) { return B.best.indexOf(x) >= 0 ? 'ดีสุด' : B.worst.indexOf(x) >= 0 ? 'แย่สุด' : ''; };
    out.push({ k: 'bw_' + id, t: 'ดีสุด/แย่สุด · ' + k.l + (k.dir < 0 ? ' (ต่ำ = ดี)' : '') + ' · DC ≥ ' + nf(mr) + ' รายการ', w: [1.2, 5, 1.6, 2], head: ['ป้าย', 'DC', 'รายการ', k.l],
      rows: B.best.concat(B.worst).map(function (s) { return [tag(s), s.name, nf(s.n), p1(s[id])]; }),
      full: B.all.map(function (s, i) { return [tag(s), i + 1, s.name, s.n, +s[id].toFixed(2)]; }), fullHead: ['ป้าย', 'อันดับ', 'DC', 'รายการ', k.l] });
  });
  return out;
}
function tableSvg(sec, W) {
  var rh = 36, ws = sec.w.slice(0, sec.head.length), sum = ws.reduce(function (a, b) { return a + b; }, 0), xs = [], acc = 0, s = T(0, 26, sec.t, { fs: 22, fw: 600, c: '#0a2a5e' }), y0 = 42;
  ws.forEach(function (w) { xs.push(acc / sum * W + 10); acc += w; });
  s += R(0, y0, W, rh, '#0a2a5e', 6);
  sec.head.forEach(function (h, i) { s += T(xs[i], y0 + 24, h, { fs: 14.5, fw: 600, c: '#fff' }); });
  sec.rows.forEach(function (r, j) {
    var y = y0 + (j + 1) * rh; if (j % 2) s += R(0, y, W, rh, '#f2f5fb');
    r.forEach(function (c, i) { var col = c === 'แย่สุด' || (c === 'F' && i === r.length - 1) ? BAD : c === 'ดีสุด' ? GOOD : '#0b1f3f'; s += T(xs[i], y + 24, cut(c, Math.max(4, Math.floor(ws[i] / sum * W / 8.5))), { fs: 14.5, fw: i < 1 ? 600 : 400, c: col }); });
  });
  if (!sec.rows.length) s += T(10, y0 + rh + 24, 'ไม่มีข้อมูลตามตัวกรอง', { fs: 14.5, c: '#55657f' });
  return { s: s, h: y0 + (Math.max(1, sec.rows.length) + 1) * rh };
}
function longSvg(logo) {
  var P = period(), W = 1500, x = 40, y = 160, body = '', secs = sections(P);
  secs.forEach(function (sec) { var t = tableSvg(sec, W - 80); body += '<g transform="translate(' + x + ' ' + y + ')">' + t.s + '</g>'; y += t.h + 40; });
  var H = y + 30, head = R(0, 0, W, H, '#fff') + R(0, 0, W, 130, '#0a2a5e') + R(0, 126, W, 4, '#d4af37') + R(28, 22, 150, 76, '#fff', 12) +
    (logo ? '<image href="' + logo + '" x="36" y="30" width="134" height="60" preserveAspectRatio="xMidYMid meet"/>' : '') + T(200, 56, 'NIMEX Check-in Daily', { fs: 32, fw: 600, c: '#fff' }) +
    T(200, 88, P.curLabel + ' · ' + scopeText() + (P.prevLabel ? ' · เทียบ ' + P.prevLabel : ' · ไม่มีช่วงก่อนหน้า'), { fs: 18, c: '#f0d57a' }) + T(200, 114, otherFilters(), { fs: 14, c: '#cfdcf2' });
  return { svg: wrapSvg(W, H, head + body), W: W, H: H };
}

/* ---------- ไฟล์ ---------- */
var SHEET = { kpi: 'KPI หลัก', dc: 'DC ตรงเวลาต่ำสุด 10', fine: 'DC ค่าปรับสูงสุด 10', vt: 'ประเภทรถ', plate: 'ทะเบียนมีปัญหา 10', bw_on: 'ดีสุด-แย่สุด % ตรงเวลา', bw_late: 'ดีสุด-แย่สุด % สาย', bw_nock: 'ดีสุด-แย่สุด % ไม่ Check in', bw_off: 'ดีสุด-แย่สุด % ไม่ตรงจุด' };
var LIBS = { pptx: ['PptxGenJS', 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'], xlsx: ['XLSX', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'] };
function loadLib(k) { return new Promise(function (res, rej) { var g = LIBS[k][0]; if (window[g]) return res(); var s = document.createElement('script'); s.src = LIBS[k][1]; s.onload = res; s.onerror = function () { rej(new Error('โหลดไลบรารีไม่สำเร็จ')); }; document.head.appendChild(s); }); }
function fname() { var P = period(); return 'NIMEX-CheckinDaily-' + (P.d0 || 'nodata') + (P.d1 && P.d1 !== P.d0 ? '_' + P.d1 : ''); }
function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function say(m) { var x = $('cis-msg'); if (x) x.textContent = m; }
function hasData() { if (!getFilteredData().length) { say('ไม่มีข้อมูลในช่วงที่เลือก'); return false; } return true; }
function doInfo() { if (!hasData()) return; say('กำลังสร้างอินโฟกราฟิก…'); return ensureZmap().then(waitFonts).then(logoData).then(function (lg) { return toPng(infographic(lg), 1920, 1080, 2); }).then(function (b) { download(b, fname() + '-infographic-16x9.png'); say('✓ ดาวน์โหลดอินโฟกราฟิก 16:9 แล้ว (3840×2160)'); }).catch(function (e) { say('สร้างภาพไม่สำเร็จ: ' + e.message); }); }
function doPng() { if (!hasData()) return; if (!sections(period()).length) return say('กรุณาเลือกหัวข้ออย่างน้อย 1 หัวข้อ'); say('กำลังสร้างรูป…'); return waitFonts().then(logoData).then(function (lg) { var L = longSvg(lg); return toPng(L.svg, L.W, L.H, 2); }).then(function (b) { download(b, fname() + '.png'); say('✓ ดาวน์โหลดรูป PNG แล้ว'); }).catch(function (e) { say('สร้างรูปไม่สำเร็จ: ' + e.message); }); }
function doXlsx() {
  if (!hasData()) return; var P = period(), secs = sections(P); if (!secs.length) return say('กรุณาเลือกหัวข้ออย่างน้อย 1 หัวข้อ');
  return loadLib('xlsx').then(function () {
    var wb = XLSX.utils.book_new(), used = {};
    secs.forEach(function (sec) {
      var aoa = [[sec.t], [P.curLabel + ' · ' + scopeText() + (P.prevLabel ? ' · เทียบ ' + P.prevLabel : ' · ไม่มีช่วงก่อนหน้า')], [otherFilters()], []];
      if (sec.full) { aoa.push(sec.fullHead); aoa = aoa.concat(sec.full); } else { aoa.push(sec.head); aoa = aoa.concat(sec.rows); }
      var name = SHEET[sec.k] || sec.k, i = 2; while (used[name]) name = name.slice(0, 26) + ' ' + (i++); used[name] = 1;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    });
    XLSX.writeFile(wb, fname() + '.xlsx'); say('✓ ดาวน์โหลด Excel แล้ว (' + secs.length + ' ชีต)');
  }).catch(function (e) { say('สร้าง Excel ไม่สำเร็จ: ' + e.message); });
}
function doPptx() {
  if (!hasData()) return; var P = period(), secs = sections(P); say('กำลังสร้าง PowerPoint…');
  return Promise.all([loadLib('pptx'), ensureZmap().then(waitFonts).then(logoData)]).then(function (x) {
    return toPng(infographic(x[1]), 1920, 1080, 1).then(function (b) { return new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsDataURL(b); }); });
  }).then(function (img) {
    var pp = new PptxGenJS(); pp.layout = 'LAYOUT_WIDE';
    pp.addSlide().addImage({ data: img, x: 0, y: 0, w: 13.333, h: 7.5 });
    secs.forEach(function (sec) {
      var sl = pp.addSlide(); sl.background = { color: 'FFFFFF' };
      sl.addShape(pp.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: '0A2A5E' } });
      sl.addText(sec.t, { x: 0.4, y: 0.12, w: 12.5, h: 0.45, fontFace: 'Prompt', fontSize: 22, bold: true, color: 'FFFFFF' });
      sl.addText(P.curLabel + ' · ' + scopeText(), { x: 0.4, y: 0.52, w: 12.5, h: 0.3, fontFace: 'Prompt', fontSize: 12, color: 'F0D57A' });
      var rows = [sec.head.map(function (h) { return { text: String(h), options: { bold: true, color: 'FFFFFF', fill: { color: '0A2A5E' } } }; })]
        .concat((sec.rows.length ? sec.rows : [['ไม่มีข้อมูลตามตัวกรอง'].concat(sec.head.slice(1).map(function () { return ''; }))]).slice(0, 14).map(function (r) { return r.map(function (c) { return { text: String(c), options: { color: c === 'แย่สุด' ? 'B8334A' : c === 'ดีสุด' ? '1A9E5F' : '0B1F3F' } }; }); }));
      var sum = sec.w.slice(0, sec.head.length).reduce(function (a, b) { return a + b; }, 0);
      sl.addTable(rows, { x: 0.4, y: 1.15, w: 12.5, colW: sec.w.slice(0, sec.head.length).map(function (w) { return w / sum * 12.5; }), fontFace: 'Prompt', fontSize: 11.5, border: { type: 'solid', color: 'DBE3F0', pt: 0.5 }, autoPage: false });
    });
    return pp.writeFile({ fileName: fname() + '.pptx' });
  }).then(function () { say('✓ ดาวน์โหลด PowerPoint แล้ว (' + (secs.length + 1) + ' สไลด์)'); }).catch(function (e) { say('สร้าง PowerPoint ไม่สำเร็จ: ' + e.message); });
}

/* ---------- หน้าต่างแชร์ ---------- */
function render() {
  var P = period(), c = cfg();
  $('cis-body').innerHTML =
    '<p class="cis-note">🗓️ ' + E(P.curLabel) + ' · 📍 ' + E(scopeText()) + '<br>↔️ ' + (P.prevLabel ? 'เทียบ ' + E(P.prevLabel) : 'ไม่มีช่วงก่อนหน้า (ไม่มีข้อมูลในช่วงวันทำการก่อนหน้า หรือเลือก "ทุกเดือน")') +
    '<br>⚙️ ' + E(otherFilters()) + '<br>ใช้ช่วงที่เลือกบนแถบด้านบน (วัน / สัปดาห์ / เดือน / กำหนดเอง) — เปลี่ยนแล้วเปิดหน้าต่างนี้ใหม่</p>' +
    '<button type="button" class="cis-info" data-act="info">🖼️ อินโฟกราฟิก 16:9</button>' +
    '<p class="cis-note">กราฟ 4 ช่อง' + (dayMode() ? ' (โหมดวัน)' : '') + ': ' + (dayMode() ? c.chartsDay : c.charts).map(function (id, i) { return (i + 1) + ') ' + E(CBY[id]); }).join(' · ') + ' · เกรด ' + (c.gradeOn ? 'เปิด' : 'ปิด') + (dayMode() && !hasRegions() ? ' · ⚠️ ยังโหลดภาคของ DC ไม่ได้' : '') + '</p>' +
    '<div class="cis-h">เลือกหัวข้อสำหรับ Excel / PowerPoint / PNG / ข้อความ</div><div class="cis-checks">' + SECS.map(function (s) { return '<label><input type="checkbox" data-sec="' + s[0] + '"' + (picked[s[0]] ? ' checked' : '') + '> ' + E(s[1]) + '</label>'; }).join('') + '</div>' +
    '<div class="cis-btns"><button type="button" data-act="xlsx">Excel</button><button type="button" data-act="pptx">PowerPoint</button><button type="button" data-act="png">รูป PNG ยาว</button></div>' +
    '<label class="cis-h" for="cis-text">ข้อความสรุป (คัดลอกไปวาง LINE / อีเมล)</label><textarea id="cis-text" rows="9">' + E(summaryText()) + '</textarea>' +
    '<div class="cis-btns"><button type="button" class="alt" data-act="copy">คัดลอกข้อความ</button><button type="button" class="alt" data-act="settings">⚙️ ตั้งค่าเกรด / กราฟ</button></div><p class="cis-msg" id="cis-msg" role="status"></p>';
}
function dayMode() { return !!(window.cidPeriod && cidPeriod.get().mode === 'day'); }
function open() { if (!adm()) return; $('cis').hidden = false; render(); ensureZmap().then(function () { if (!$('cis').hidden) render(); }); }
function close() { $('cis').hidden = true; }

/* ---------- ส่วนตั้งค่าในหน้า ⚙️ ตั้งค่า ---------- */
function settingsHtml() {
  var c = cfg();
  return '<h3>📤 อินโฟกราฟิก / เกรด DC</h3>' +
    '<label class="settings-checkbox-item cid-switch"><input type="checkbox" id="cid-grade-on"' + (c.gradeOn ? ' checked' : '') + '><div><div class="settings-checkbox-label">แสดงเกรด DC (A–F จาก % ตรงเวลา)</div><div class="settings-checkbox-sub">ปิดอยู่ = ไม่แสดงเกรดในการ์ด ตาราง และอินโฟกราฟิก · ตั้งเกณฑ์ไว้ก่อนแล้วค่อยเปิดได้</div></div></label>' +
    '<div class="cid-grade">' + ['A','B','C','D'].map(function (g) { return '<label><span style="background:' + GC[g] + '">' + g + '</span> ≥ <input type="number" min="0" max="100" step="0.1" id="cid-g' + g + '" value="' + c.grade[g] + '" class="config-input"> %</label>'; }).join('') + '<label><span style="background:' + GC.F + '">F</span> ต่ำกว่า D</label></div>' +
    '<label class="cid-row">DC ต้องมีอย่างน้อย <input type="number" min="1" max="100000" id="cid-min" value="' + c.minRows + '" class="config-input" style="width:96px"> รายการ จึงนำมาจัดอันดับ / ให้เกรด</label>' +
    '<div class="cid-row" style="font-weight:600">กราฟ 4 ช่องในอินโฟกราฟิก</div><div class="cid-charts">' + [0, 1, 2, 3].map(function (i) {
      return '<label>ช่อง ' + (i + 1) + (i === 0 ? ' (บนซ้าย)' : i === 1 ? ' (บนขวา)' : i === 2 ? ' (ล่างซ้าย)' : ' (ล่างขวา)') + '<select id="cid-ch' + i + '" class="config-input">' + CHARTS.map(function (o) { return '<option value="' + o[0] + '"' + (c.charts[i] === o[0] ? ' selected' : '') + '>' + E(o[1]) + (o[0] === 'grade' ? ' (ต้องเปิดเกรด)' : '') + '</option>'; }).join('') + '</select></label>';
    }).join('') + '</div>' +
    '<div class="cid-row" style="font-weight:600;margin-top:14px">กราฟ 4 ช่อง เมื่อเลือก "วัน" (รายภาค)</div><div class="cid-charts">' + [0, 1, 2, 3].map(function (i) {
      return '<label>ช่อง ' + (i + 1) + '<select id="cid-chd' + i + '" class="config-input">' + CHARTS.map(function (o) { return '<option value="' + o[0] + '"' + (c.chartsDay[i] === o[0] ? ' selected' : '') + '>' + E(o[1]) + (o[0] === 'grade' ? ' (ต้องเปิดเกรด)' : '') + '</option>'; }).join('') + '</select></label>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button type="button" class="settings-btn settings-btn-primary" id="cid-share-save">💾 บันทึกค่าตั้ง</button><span id="cid-share-msg" role="status" style="font-size:12px;color:var(--text2)"></span></div>';
}
function saveSettings() {
  var m = $('cid-share-msg'), sy = function (t) { m.textContent = t; };
  var g = {}; ['A','B','C','D'].forEach(function (k) { g[k] = +$('cid-g' + k).value; });
  if (!(g.A >= g.B && g.B >= g.C && g.C >= g.D) || ['A','B','C','D'].some(function (k) { return !(g[k] >= 0 && g[k] <= 100); })) return sy('เกณฑ์ต้องเรียง A ≥ B ≥ C ≥ D และอยู่ระหว่าง 0–100');
  var mr = Math.round(+$('cid-min').value); if (!(mr >= 1 && mr <= 100000)) return sy('จำนวนรายการขั้นต่ำต้องอยู่ระหว่าง 1–100,000');
  var on = $('cid-grade-on').checked, ch = [0, 1, 2, 3].map(function (i) { return $('cid-ch' + i).value; });
  var chd = [0, 1, 2, 3].map(function (i) { return $('cid-chd' + i).value; });
  if (new Set(ch).size < 4 || new Set(chd).size < 4) return sy('เลือกกราฟไม่ซ้ำกันทั้ง 4 ช่อง (ทั้งชุดปกติและชุดโหมดวัน)');
  if (!on && (ch.indexOf('grade') >= 0 || chd.indexOf('grade') >= 0)) return sy('กราฟ "สัดส่วนเกรด DC" ต้องเปิดการแสดงเกรดก่อน');
  sy('กำลังบันทึก…');
  var prevS = (window.CID && CID.getShare()) || {};
  CID.saveShare(Object.assign({}, prevS, { gradeOn: on, grade: g, minRows: mr, charts: ch, chartsDay: chd })).then(function () { sy('✓ บันทึกแล้ว' + (CID.online ? ' ทุกคนเห็นค่าตั้งเดียวกัน' : '')); })
    .catch(function (e) { sy('บันทึกไม่สำเร็จ: ' + (e.message === 'denied' ? 'รหัสไม่ถูกต้อง' : e.message)); });
}
function refresh() { var b = $('cid-share-set'); if (b) b.innerHTML = settingsHtml(); }

function mount() {
  var d = document.createElement('div'); d.id = 'cis'; d.hidden = true; d.className = 'cis';
  d.innerHTML = '<div class="cis-box" role="dialog" aria-modal="true" aria-labelledby="cis-t"><div class="cis-top"><h2 id="cis-t">📤 แชร์และส่งออก</h2><button type="button" class="cis-x" data-act="close" aria-label="ปิด">✕</button></div><div id="cis-body"></div></div>';
  document.body.appendChild(d);
  d.addEventListener('click', function (e) {
    if (e.target === d) return close();
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act;
    if (a === 'close') close(); else if (a === 'info') doInfo(); else if (a === 'png') doPng(); else if (a === 'xlsx') doXlsx(); else if (a === 'pptx') doPptx();
    else if (a === 'copy') { var t = $('cis-text'); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { say('✓ คัดลอกข้อความแล้ว'); }).catch(function () { t.select(); document.execCommand('copy'); say('✓ คัดลอกข้อความแล้ว'); }); }
    else if (a === 'settings') { close(); goPage('settings'); setTimeout(function () { var s = $('cid-share-set'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); }
  });
  d.addEventListener('change', function (e) {
    var k = e.target.dataset && e.target.dataset.sec;
    if (k) { if (e.target.checked) picked[k] = 1; else delete picked[k]; var t = $('cis-text'); if (t) t.value = summaryText(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('cis').hidden) close(); });
  var btn = $('shareBtn'); if (btn) btn.onclick = open;
  var pg = $('page-settings');
  if (pg && !$('cid-share-set')) {
    var sec = document.createElement('div'); sec.className = 'settings-section'; sec.id = 'cid-share-set'; sec.style.marginBottom = '14px';
    var t0 = pg.querySelector('.section-title'); if (t0) t0.after(sec); else pg.insertBefore(sec, pg.firstChild);
    sec.addEventListener('click', function (e) { if (e.target.id === 'cid-share-save') saveSettings(); });
    refresh();
  }
}
window.cidShare = { open: open, refresh: refresh, summaryText: summaryText, period: period, kpiData: kpiData, dcWorst10: dcWorst10, dcFine10: dcFine10, dcRanked: dcRanked, bwData: bwData, vtData: vtData, plateData: plateData, infographic: infographic, sections: sections, longSvg: longSvg, picked: picked, cfg: cfg };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
