/* NIMEX Check-in Daily — เลือกช่วง วัน / สัปดาห์ / เดือน และเทียบช่วงก่อนหน้าอัตโนมัติ (สกิล nimex-dashboard-upgrade Stage 4)
   - ไม่เปลี่ยนสูตรเดิม: เปลี่ยนเฉพาะ "ช่วงวันที่" ที่ getFilteredData() ส่งให้ทุกหน้า
   - วันทำการ = จันทร์–เสาร์ (ตัดวันอาทิตย์เหมือนเดิม)
   - วัน     : วันที่เลือก เทียบวันเดียวกันของสัปดาห์ก่อน
   - สัปดาห์ : จันทร์ถึงวันล่าสุดที่มีข้อมูลในสัปดาห์ เทียบวันเดียวกันของสัปดาห์ก่อน
   - เดือน   : วันที่ 1 ถึงวันล่าสุดที่มีข้อมูล (N วันทำการ) เทียบ N วันทำการแรกของเดือนก่อน
   - กำหนดเอง: ใช้ตัวกรองเดือน/ถึงวันที่เดิม เทียบจำนวนวันทำการเท่ากันก่อนหน้า
   - ▲▼ ของ % เป็น "จุด" · ดี = น้ำเงิน แย่ = แดง (ตาม Design Kit) */
(function () {
'use strict';
var DAY = 864e5, MN = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'], WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
var GOOD = '#1d57b8', BAD = '#b8334a', NEU = '#6b7a93';
var P = { mode: 'month', key: '', auto: true };   /* auto = ตามช่วงล่าสุดเสมอ จนกว่าผู้ใช้จะเลือกช่วงเอง */
var origFiltered = window.getFilteredData, origBuildExec = window.buildExec, origTeam = window.renderTeamTable;

function $(id) { return document.getElementById(id); }
function utc(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function sun(t) { return new Date(t).getUTCDay() === 0; }
function th(isoD) { var p = isoD.split('-'); return +p[2] + ' ' + MN[+p[1]] + ' ' + (+p[0] + 543); }
function monday(isoD) { var t = utc(isoD), d = new Date(t).getUTCDay(); return iso(t - ((d + 6) % 7) * DAY); }
function workDays(from, to) { var n = 0; for (var t = utc(from); t <= utc(to); t += DAY) if (!sun(t)) n++; return n; }
function allDates() { var s = {}; visibleResults().forEach(function (r) { if (!isSunday(r.dateISO)) s[r.dateISO] = 1; }); return Object.keys(s).sort(); }
function inRange(rows, a, b) { return rows.filter(function (r) { return r.dateISO >= a && r.dateISO <= b && !isSunday(r.dateISO); }); }

/* ---------- ตัวเลือกช่วงของแต่ละโหมด (ล่าสุดก่อน) ---------- */
function options(mode) {
  var ds = allDates(), o = {}, out = [];
  ds.forEach(function (d) {
    var k = mode === 'day' ? d : mode === 'week' ? monday(d) : d.slice(0, 7);
    if (!o[k]) { o[k] = { k: k, last: d }; out.push(o[k]); } else o[k].last = d;
  });
  out.reverse();
  return out.map(function (x) {
    var lab;
    if (mode === 'day') { lab = WD[new Date(utc(x.k)).getUTCDay()] + ' ' + th(x.k); }
    else if (mode === 'week') { lab = 'สัปดาห์ ' + th(x.k) + ' – ' + th(x.last); }
    else { var p = x.k.split('-'); lab = MN[+p[1]] + ' ' + (+p[0] + 543); }
    return { k: x.k, last: x.last, label: lab };
  });
}

/* ---------- ช่วงที่เลือก + ช่วงเทียบ ---------- */
function compare() {
  var c = { mode: P.mode };
  if (P.mode === 'custom') {
    var cur = origFiltered(), ds = cur.map(function (r) { return r.dateISO; }).sort();
    if (!ds.length) return { mode: 'custom', empty: true };
    c.from = ds[0]; c.to = ds[ds.length - 1];
    var N = workDays(c.from, c.to), k = 0, t;
    for (t = utc(c.from) - DAY; k < N; t -= DAY) if (!sun(t)) { if (!c.pto) c.pto = iso(t); c.pfrom = iso(t); k++; }
    c.N = N; c.rule = 'ช่วงก่อนหน้า = วันทำการ (จ.–ส.) เท่ากัน ติดกันก่อนหน้า';
    c.label = th(c.from) + (c.to !== c.from ? ' – ' + th(c.to) : '') + ' (' + N + ' วันทำการ)';
  } else {
    var opts = options(P.mode); if (!opts.length) return { mode: P.mode, empty: true };
    var sel = (!P.auto && opts.filter(function (x) { return x.k === P.key; })[0]) || opts[0]; P.key = sel.k;
    if (P.mode === 'day') { c.from = c.to = sel.k; c.pfrom = c.pto = iso(utc(sel.k) - 7 * DAY); c.N = 1; c.rule = 'เทียบวันเดียวกันของสัปดาห์ก่อน'; c.label = sel.label; }
    else if (P.mode === 'week') { c.from = sel.k; c.to = sel.last; c.pfrom = iso(utc(c.from) - 7 * DAY); c.pto = iso(utc(c.to) - 7 * DAY); c.N = workDays(c.from, c.to); c.rule = 'เทียบวันเดียวกันของสัปดาห์ก่อน'; c.label = sel.label + ' (' + c.N + ' วันทำการ)'; }
    else {
      c.from = sel.k + '-01'; c.to = sel.last; c.N = workDays(c.from, c.to);
      var y = +sel.k.slice(0, 4), m = +sel.k.slice(5, 7) - 1; if (m < 1) { m = 12; y--; }
      var pm = y + '-' + (m < 10 ? '0' : '') + m, k2 = 0, t2 = utc(pm + '-01');
      c.pfrom = pm + '-01';
      while (k2 < c.N && iso(t2).slice(0, 7) === pm) { if (!sun(t2)) { c.pto = iso(t2); k2++; } t2 += DAY; }
      c.rule = 'เทียบ ' + c.N + ' วันทำการแรกของเดือนก่อน';
      c.label = sel.label + ' (' + th(c.from).replace(/ .*/, '') + '–' + th(c.to) + ', ' + c.N + ' วันทำการ)';
    }
  }
  c.prev = c.pfrom ? inRange(visibleResults(), c.pfrom, c.pto) : [];
  var pd = {}; c.prev.forEach(function (r) { pd[r.dateISO] = 1; }); c.prevDays = Object.keys(pd).length;
  c.prevLabel = c.prev.length ? th(c.pfrom) + (c.pto !== c.pfrom ? ' – ' + th(c.pto) : '') + (c.prevDays < c.N ? ' (มีข้อมูล ' + c.prevDays + ' จาก ' + c.N + ' วัน)' : '') : '';
  return c;
}
window.cidCompare = compare;

/* ---------- ทุกหน้าใช้ช่วงที่เลือก ---------- */
var bypass = 0;
window.getFilteredData = function () {
  if (P.mode === 'custom' || bypass) return origFiltered.apply(this, arguments);
  var c = compare(); if (c.empty) return [];
  return inRange(visibleResults(), c.from, c.to);
};

/* หน้า สรุปรายเดือน / รายสัปดาห์ / เทรนด์ มีตัวเลือกเทียบของตัวเอง → ใช้ข้อมูลทุกช่วงเหมือนเดิม */
['buildMonthly', 'buildWeekly', 'buildTrend'].forEach(function (fn) {
  var o = window[fn]; if (typeof o !== 'function') return;
  window[fn] = function () { bypass++; try { return o.apply(this, arguments); } finally { bypass--; } };
});

/* ---------- ▲▼ ---------- */
function stats(rows) {
  var o = { tot: rows.length, on: 0, lt: 0, wp: 0, ab: 0, fine: 0, fl: 0, fw: 0, fa: 0, bd: 0, bt: 0, cars: {} };
  rows.forEach(function (r) {
    o.fine += r.fine; o.cars[r.plate || r.code] = 1; o.bd += r.billDelivered; o.bt += r.billDelivered + r.billFailed;
    if (r.status === 'ตรงเวลา') o.on++; else if (r.status === 'สาย') { o.lt++; o.fl += r.fine; }
    else if (r.status === 'Check in ไม่ตรงจุด') { o.wp++; o.fw += r.fine; } else { o.ab++; o.fa += r.fine; }
  });
  o.carN = Object.keys(o.cars).length;
  var p = function (n) { return o.tot ? n / o.tot * 100 : NaN; };
  o.onP = p(o.on); o.ltP = p(o.lt); o.wpP = p(o.wp); o.abP = p(o.ab); o.bP = o.bt ? o.bd / o.bt * 100 : NaN;
  return o;
}
/* kind: 'pp' (จุด) | 'n' (จำนวน) | 'baht' ; dir: 1 สูง=ดี, -1 ต่ำ=ดี, 0 กลาง */
function delta(cur, prev, kind, dir, has) {
  if (!has || !Number.isFinite(cur) || !Number.isFinite(prev)) return '<span class="pd pd-na">ไม่มีช่วงก่อนหน้า</span>';
  var d = cur - prev, z = kind === 'pp' ? Math.abs(d) < 0.05 : d === 0;
  if (z) return '<span class="pd" style="color:' + NEU + '">● เท่าเดิม</span>';
  var col = !dir ? NEU : (d > 0) === (dir > 0) ? GOOD : BAD, ar = d > 0 ? '▲' : '▼', a = Math.abs(d), txt;
  if (kind === 'pp') txt = a.toFixed(1) + ' จุด';
  else if (kind === 'baht') txt = Math.round(a).toLocaleString() + ' บาท' + (prev ? ' (' + (d > 0 ? '+' : '−') + Math.abs(d / prev * 100).toFixed(0) + '%)' : '');
  else txt = Math.round(a).toLocaleString() + (prev ? ' (' + (d > 0 ? '+' : '−') + Math.abs(d / prev * 100).toFixed(0) + '%)' : '');
  return '<span class="pd" style="color:' + col + '" title="เทียบช่วงก่อนหน้า: ' + (kind === 'pp' ? prev.toFixed(1) + '%' : Math.round(prev).toLocaleString()) + '">' + ar + ' ' + txt + '</span>';
}
function put(afterId, html) {
  var el = $(afterId); if (!el) return;
  var id = afterId + '-pd', x = $(id);
  if (!x) { x = document.createElement('div'); x.id = id; x.className = 'pd-line'; el.after(x); }
  x.innerHTML = html;
}

/* ---------- หน้าเสนอผู้บริหาร ---------- */
window.buildExec = function () {
  var r = origBuildExec.apply(this, arguments);
  try { execDeltas(); } catch (e) { if (window.console) console.warn(e); }
  return r;
};
function execDeltas() {
  var c = compare(), cur = getFilteredData(); if (!cur.length) { pill(c); return; }
  var A = stats(cur), B = stats(c.prev || []), h = !!(c.prev && c.prev.length);
  put('hero-total', delta(A.carN, B.carN, 'n', 0, h));
  put('sub-on-pct', delta(A.onP, B.onP, 'pp', 1, h));
  put('sub-lt-pct', delta(A.ltP, B.ltP, 'pp', -1, h));
  put('sub-wp-pct', delta(A.wpP, B.wpP, 'pp', -1, h));
  put('sub-ab-pct', delta(A.abP, B.abP, 'pp', -1, h));
  put('hero-fine', delta(A.fine, B.fine, 'baht', -1, h));
  put('fine-lt-val', delta(A.fl, B.fl, 'baht', -1, h));
  put('fine-wp-val', delta(A.fw, B.fw, 'baht', -1, h));
  put('fine-ab-val', delta(A.fa, B.fa, 'baht', -1, h));
  var lab = $('exec-daterange-label');
  if (lab) { var x = lab.querySelector('.pd-cmp'); if (!x) { x = document.createElement('span'); x.className = 'pd-cmp'; lab.appendChild(x); } x.textContent = '↔ ' + (h ? 'เทียบ ' + c.prevLabel : 'ไม่มีข้อมูลช่วงก่อนหน้า'); lab.title = c.rule || ''; }
  pill(c);
}

/* ---------- หน้าประชุมทีมงาน: ▲▼ ทุกคอลัมน์ตัวเลข (ราย DC และแถวรวม) ---------- */
window.renderTeamTable = function () {
  var r = origTeam.apply(this, arguments);
  try { teamDeltas(); } catch (e) { if (window.console) console.warn(e); }
  return r;
};
function teamFilter(rows) {
  var gv = function (id) { var e = $(id); return e ? e.value : ''; };
  var dc = gv('team-filter-dc'), plate = gv('team-filter-plate'), status = gv('team-filter-status'), vt = gv('team-filter-vtype'), vk = gv('team-filter-vkind');
  return rows.filter(function (r) { return (!dc || r.dc === dc) && (!plate || r.plate === plate) && (!status || r.status === status) && (!vt || r.vehicleType === vt) && (!vk || r.vehicleKind === vk); });
}
function teamDeltas() {
  var c = compare(), dateSel = ($('team-filter-date') || {}).value;
  var prev = dateSel ? [] : teamFilter(c.prev || []), has = !dateSel && prev.length > 0, by = {};
  prev.forEach(function (r) { (by[r.dc] = by[r.dc] || []).push(r); });
  var cols = [['tot', 'tot', 'n', 0], ['on', 'on', 'n', 1], ['lt', 'lt', 'n', -1], ['wp', 'wp', 'n', -1], ['ab', 'ab', 'n', -1], ['pct', 'onP', 'pp', 1], ['fine', 'fine', 'baht', -1], ['bpct', 'bP', 'pp', 1]];
  var fill = function (tr, A, B, h) {
    cols.forEach(function (k) {
      var td = tr.querySelector('td[data-m="' + k[0] + '"]'); if (!td) return;
      var old = td.querySelector('.pd-cell'); if (old) old.remove();
      var s = document.createElement('div'); s.className = 'pd-cell';
      s.innerHTML = h ? delta(A[k[1]], B[k[1]], k[2], k[3], true).replace(/ \([+−]\d+%\)/, '') : '';
      td.appendChild(s);
    });
  };
  var curRows = S.teamData || [], cb = {};
  curRows.forEach(function (r) { (cb[r.dc] = cb[r.dc] || []).push(r); });
  [].forEach.call(document.querySelectorAll('#team-tbody tr[data-dc]'), function (tr) {
    var dc = tr.dataset.dc, B = by[dc]; fill(tr, stats(cb[dc] || []), stats(B || []), has && !!B);
  });
  var tf = document.querySelector('#team-tfoot tr'); if (tf) fill(tf, stats(curRows), stats(prev), has);
  var note = $('team-pd-note');
  if (!note) { var cnt = $('team-count'); if (cnt) { note = document.createElement('span'); note.id = 'team-pd-note'; note.className = 'pd-note'; cnt.after(note); } }
  if (note) note.textContent = dateSel ? '' : has ? '▲▼ เทียบ ' + c.prevLabel : 'ไม่มีข้อมูลช่วงก่อนหน้า';
}

/* ---------- แถบเลือกช่วง (แถบบน ใช้ได้ทุกหน้า) ---------- */
function pill(c) {
  var el = $('pd-pill'); if (!el) return;
  c = c || compare();
  if (c.empty) { el.textContent = 'ไม่มีข้อมูลในช่วงที่เลือก'; return; }
  el.innerHTML = '<b>' + c.label + '</b><span>' + (c.prev && c.prev.length ? '↔ เทียบ ' + c.prevLabel : '↔ ไม่มีข้อมูลช่วงก่อนหน้า') + '</span>';
  el.title = c.rule;
}
function fillSelect() {
  var s = $('pd-sel'); if (!s) return;
  var custom = P.mode === 'custom';
  [].forEach.call(document.querySelectorAll('#pd-seg button'), function (b) { b.classList.toggle('on', b.dataset.m === P.mode); b.setAttribute('aria-pressed', b.dataset.m === P.mode); });
  s.hidden = custom;
  /* ตัวกรองเดือน/ถึงวันที่เดิม ใช้เฉพาะโหมด "กำหนดเอง" */
  var to = $('exec-filter-date-to');
  [$('exec-filter-month'), to, to && to.previousElementSibling, to && to.nextElementSibling].forEach(function (e) { if (e) e.classList.toggle('pd-hide', !custom); });
  if (custom) return;
  var o = options(P.mode);
  if (P.auto || !o.some(function (x) { return x.k === P.key; })) P.key = o.length ? o[0].k : '';
  s.innerHTML = o.map(function (x) { return '<option value="' + x.k + '"' + (x.k === P.key ? ' selected' : '') + '>' + x.label + '</option>'; }).join('');
}
function rebuild() {
  fillSelect();
  if (typeof buildAllViews === 'function') buildAllViews();
  pill();
  if (window.cidShare && cidShare.refresh) cidShare.refresh();
}
function mount() {
  var tl = document.querySelector('.topbar-left'); if (!tl || $('pd-bar')) return;
  var w = document.createElement('div'); w.id = 'pd-bar';
  w.innerHTML = '<div id="pd-seg" class="pd-seg" role="group" aria-label="เลือกช่วงเวลา">' +
    [['day', 'วัน'], ['week', 'สัปดาห์'], ['month', 'เดือน'], ['custom', 'กำหนดเอง']].map(function (m) { return '<button type="button" data-m="' + m[0] + '" aria-pressed="false">' + m[1] + '</button>'; }).join('') +
    '</div><select id="pd-sel" aria-label="เลือกช่วง"></select><div id="pd-pill" class="pd-pill" role="status"></div>';
  tl.appendChild(w);
  w.querySelector('#pd-seg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === P.mode) return;
    P.mode = b.dataset.m; P.key = ''; P.auto = true; rebuild();
  });
  $('pd-sel').addEventListener('change', function () { P.key = this.value; P.auto = this.selectedIndex === 0; rebuild(); });
  fillSelect(); pill();
}
/* แสดงผลเมื่อข้อมูลพร้อม (หลังโหลดจาก Sheet / อัปโหลด) */
var origBuildAll = window.buildAllViews;
if (origBuildAll) window.buildAllViews = function () { fillSelect(); var r = origBuildAll.apply(this, arguments); pill(); return r; };
window.cidPeriod = { get: function () { return { mode: P.mode, key: P.key }; }, set: function (m, k) { P.mode = m; P.key = k || ''; P.auto = !k; rebuild(); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
