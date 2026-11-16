/* NIMEX Check-in Daily — เชื่อม Google Sheet (Apps Script) และแยกผู้ชม/ผู้ดูแล
   - ไม่เปลี่ยนสูตรเดิม: การคำนวณสถานะ/ค่าปรับยังเป็นโค้ดเดิมใน index.html ทั้งหมด
   - config.js ว่าง (CID_API = '') = ทำงานแบบเดิม เก็บในเบราว์เซอร์ และทุกคนเป็นผู้ดูแล
   - มี CID_API = โหลดผลและค่าตั้งจาก Sheet, ผู้ชมดูอย่างเดียว, ผู้ดูแลเข้าด้วย #admin หรือปุ่ม "🔒 ระบบ"
     (รหัสตรวจที่ Apps Script เท่านั้น) แก้ไขแล้วกด "💾 บันทึกลง Google Sheet" ทุกคนจึงเห็น */
(function () {
'use strict';
var API = window.CID_API || '', ONLINE = !!API, V = window.CID_V || 1;
var SKEY = 'nimex-cid-admin', SHARE_LOCAL = 'nimex_cid_share_v1';
var SYNC = ['nimex_config_v1', 'nimex_vkind_v1', 'nimex_vtype_v1', 'nimex_waive_v1', 'nimex_fine_toggles_v1', 'nimex_dc_exclude_v1'];
var SYNC_NAME = { nimex_config_v1: 'Config ค่าปรับราย DC', nimex_vkind_v1: 'ประเภทการปล่อยรถ', nimex_vtype_v1: 'ประเภทงาน', nimex_waive_v1: 'Waive', nimex_fine_toggles_v1: 'เปิด/ปิดค่าปรับ', nimex_dc_exclude_v1: 'DC ที่ยกเว้นทุกเงื่อนไข', results: 'ผลการ Check-in' };
var RES = ['nimex_results_v1', 'nimex_meta_v1'];
var COLS = ['dc','code','plate','vehicleType','vehicleKind','dateISO','configStart','checkinTime','diffMin','distanceKm','status','fine','waived','waivedFine','billDelivered','dropTotal','dropDelivered','billFailed'];
var NULLABLE = { diffMin: 1, distanceKm: 1 }, ZERO = { fine: 1, waivedFine: 1, billDelivered: 1, dropTotal: 1, dropDelivered: 1, billFailed: 1 };
var MEM = {}, dirty = {}, admin = !ONLINE, sheetCount = 0, updated = '', loaded = !ONLINE, SHARE = {};
var orig = { save: window.storageSave, load: window.storageLoad, del: window.storageDelete, goPage: window.goPage,
  saveTo: window.saveToStorage, clear: window.clearStoredData, pwd: window.requireSettingsPassword,
  waive1: window.toggleWaiveRecord, waiveDC: window.waiveAllInDC };

function $(id) { return document.getElementById(id); }
function ss(v) { try { if (v === undefined) return sessionStorage.getItem(SKEY); if (v === null) sessionStorage.removeItem(SKEY); else sessionStorage.setItem(SKEY, v); } catch (e) { return null; } }
function toast(m) { if (typeof showToast === 'function') showToast(m); }
function post(body, key) {
  return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key: key || ss() }, body)) })
    .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || 'failed'); return j; });
}
function errTh(e) { var m = e && e.message || String(e); return m === 'denied' ? 'รหัสไม่ถูกต้อง' : m === 'busy' ? 'ระบบกำลังบันทึกจากอีกเครื่อง ลองใหม่อีกครั้ง' : m === 'admin_key_not_set' ? 'ยังไม่ได้ตั้ง ADMIN_KEY ใน Script Properties' : m; }

/* ---------- แปลงแถว ↔ ออบเจ็กต์ (รูปเดียวกับที่โค้ดเดิมเก็บใน localStorage) ---------- */
function enc(r) { return COLS.map(function (c) { var v = r[c]; if (c === 'waived') return v === true ? '1' : v === false ? '0' : ''; return v === null || v === undefined ? '' : String(v); }); }
function dec(a) {
  var o = {};
  COLS.forEach(function (c, i) {
    var v = a[i] === undefined || a[i] === null ? '' : String(a[i]);
    if (c === 'waived') { if (v === '1') o.waived = true; else if (v === '0') o.waived = false; }
    else if (NULLABLE[c]) o[c] = v === '' ? null : Number(v);
    else if (ZERO[c]) o[c] = v === '' ? 0 : Number(v);
    else o[c] = v;
  });
  o.dateTH = fmtTH(o.dateISO);
  return o;
}
window.cidEncode = enc; window.cidDecode = dec;   /* ใช้ทดสอบ */

/* ---------- ที่เก็บค่า: แบบออนไลน์ใช้หน่วยความจำ + Sheet แทน localStorage ---------- */
if (ONLINE) {
  window.storageSave = function (k, v) { if (SYNC.indexOf(k) >= 0) { MEM[k] = v; mark(k); return; } if (RES.indexOf(k) >= 0) return; orig.save(k, v); };
  window.storageLoad = function (k) { if (SYNC.indexOf(k) >= 0) return MEM[k] != null ? MEM[k] : null; if (RES.indexOf(k) >= 0) return null; return orig.load(k); };
  window.storageDelete = function (k) { if (SYNC.indexOf(k) >= 0) { delete MEM[k]; mark(k); return; } if (RES.indexOf(k) >= 0) return; orig.del(k); };
  window.saveToStorage = function (results) {
    mark('results');
    if (typeof updateStorageStatusBar === 'function') updateStorageStatusBar({ count: results.length, savedAt: null, dates: Array.from(new Set(results.map(function (r) { return r.dateISO; }))).sort() });
  };
  window.clearStoredData = function () { var n = S.results.length; orig.clear.apply(this, arguments); if (n && !S.results.length) mark('results'); };
  window.requireSettingsPassword = function (cb) { if (admin) cb(); else openLogin(cb); };
}
window.goPage = function (name) {
  if (ONLINE && !admin && ['upload', 'settings', 'share'].indexOf(name) >= 0) return openLogin(function () { window.goPage(name); });
  return orig.goPage.apply(this, arguments);
};
window.toggleWaiveRecord = function () { if (!admin) return toast('เฉพาะผู้ดูแล'); return orig.waive1.apply(this, arguments); };
window.waiveAllInDC = function () { if (!admin) return toast('เฉพาะผู้ดูแล'); return orig.waiveDC.apply(this, arguments); };

function mark(k) { if (!loaded) return; dirty[k] = 1; bar(); }
function dirtyKeys() { return Object.keys(dirty); }

/* ---------- ค่าตั้งแชร์/อินโฟกราฟิก ---------- */
window.CID = {
  online: ONLINE,
  isAdmin: function () { return admin; },
  getShare: function () { if (!ONLINE) { try { return JSON.parse(orig.load(SHARE_LOCAL) || '{}'); } catch (e) { return {}; } } return SHARE; },
  saveShare: function (obj) {
    var s = JSON.stringify(obj);
    if (!ONLINE) { orig.save(SHARE_LOCAL, s); return Promise.resolve(obj); }
    if (!admin) return Promise.reject(new Error('กรุณาเข้าสู่ระบบผู้ดูแลก่อน'));
    return post({ a: 'settings', settings: { share: s } }).then(function () { SHARE = obj; return obj; });
  },
  sheetInfo: function () { return { count: sheetCount, updated: updated }; }
};

/* ---------- ผู้ดูแล ---------- */
function setAdmin(on) {
  admin = !!on || !ONLINE;
  document.body.classList.toggle('nx-admin', admin);
  var b = $('cidLogin'); if (b) b.textContent = admin ? '🔓 ออกจากระบบ' : '🔒 ระบบ';
  if (!admin) { var p = S.currentPage; if (['upload', 'settings', 'share'].indexOf(p) >= 0) orig.goPage('exec'); try { _settingsUnlocked = false; } catch (e) {} }
  bar();
}
function openLogin(after) {
  if (!ONLINE) { if (after) after(); return; }
  var old = $('cid-login'); if (old) old.remove();
  var ov = document.createElement('div'); ov.className = 'pwd-overlay'; ov.id = 'cid-login';
  ov.innerHTML = '<form class="pwd-box" autocomplete="off"><div style="font-size:36px;margin-bottom:8px">🔒</div><h3>เข้าสู่ระบบผู้ดูแล</h3>' +
    '<p>รหัสตรวจที่ระบบ Google Sheet</p><input class="pwd-input" id="cid-key" type="password" autocomplete="current-password" aria-label="รหัสผู้ดูแล" placeholder="รหัสผู้ดูแล">' +
    '<div class="pwd-error" id="cid-err" role="status"></div><div class="pwd-btn-row"><button type="button" class="settings-btn settings-btn-secondary" style="flex:1" data-x>ยกเลิก</button>' +
    '<button type="submit" class="settings-btn settings-btn-primary" style="flex:1">เข้าสู่ระบบ</button></div></form>';
  document.body.appendChild(ov);
  ov.querySelector('[data-x]').onclick = function () { ov.remove(); };
  ov.querySelector('form').onsubmit = function (e) {
    e.preventDefault(); var k = $('cid-key').value, er = $('cid-err'); er.textContent = 'กำลังตรวจรหัส…';
    post({ a: 'auth' }, k).then(function () { ss(k); ov.remove(); setAdmin(true); toast('🔓 เข้าสู่ระบบผู้ดูแลแล้ว'); if (after) after(); })
      .catch(function (x) { er.textContent = errTh(x); $('cid-key').value = ''; $('cid-key').focus(); });
  };
  setTimeout(function () { var f = $('cid-key'); if (f) f.focus(); }, 60);
}

/* ---------- แถบสถานะ Sheet (ผู้ดูแล) ---------- */
function bar() {
  var el = $('cid-sync'); if (!el) return;
  if (!ONLINE || !admin) { el.hidden = true; return; }
  el.hidden = false;
  var d = dirtyKeys(), t = updated ? new Date(updated).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  var mig = !sheetCount && !d.length ? localBackup() : null;
  el.className = 'cid-sync' + (d.length ? ' warn' : '');
  el.innerHTML = '<span>☁️ Google Sheet: ' + sheetCount.toLocaleString() + ' รายการ · อัปเดต ' + t + '</span>' +
    (d.length ? '<b>⚠️ ยังไม่ได้บันทึก: ' + d.map(function (k) { return SYNC_NAME[k] || k; }).join(', ') + '</b><button type="button" id="cid-save">💾 บันทึกลง Google Sheet</button>' : '<span class="ok">✓ ตรงกับ Sheet</span>') +
    (mig ? '<b>เบราว์เซอร์นี้มีข้อมูลเดิม ' + mig.rows.length.toLocaleString() + ' รายการ (' + fmtTH(mig.d0) + ' – ' + fmtTH(mig.d1) + ')</b><button type="button" id="cid-mig">⬆️ ย้ายข้อมูลเดิมขึ้น Google Sheet</button>' : '');
  var b = $('cid-save'); if (b) b.onclick = saveAll;
  var m = $('cid-mig'); if (m) m.onclick = migrate;
}
function say(t) { var m = $('cid-msg'); if (!m) { m = document.createElement('div'); m.id = 'cid-msg'; m.setAttribute('role', 'status'); $('cid-sync').after(m); } m.textContent = t; }

/* ---------- บันทึกทั้งหมดลง Sheet ---------- */
var saving = false;
function saveAll() {
  if (!admin) return openLogin(saveAll);
  if (saving) return;
  var d = dirtyKeys(); if (!d.length) return;
  var rows = S.results, dates = Array.from(new Set(rows.map(function (r) { return r.dateISO; }))).sort(), dcs = new Set(rows.map(function (r) { return r.dc; })).size;
  var setK = d.filter(function (k) { return k !== 'results'; });
  var txt = 'บันทึกลง Google Sheet ให้ผู้ชมทุกคนเห็น\n';
  if (dirty.results) txt += '\n• ผลการ Check-in ' + rows.length.toLocaleString() + ' รายการ (ใน Sheet ตอนนี้ ' + sheetCount.toLocaleString() + ')\n• วันที่ ' + (dates.length ? fmtTH(dates[0]) + ' – ' + fmtTH(dates[dates.length - 1]) + ' (' + dates.length + ' วัน)' : '—') + '\n• ' + dcs + ' DC\n  ข้อมูลผลใน Sheet จะถูกแทนที่ด้วยชุดนี้ทั้งหมด';
  if (setK.length) txt += '\n• ค่าตั้ง: ' + setK.map(function (k) { return SYNC_NAME[k]; }).join(', ');
  if (!window.confirm(txt)) return;
  saving = true; say('กำลังบันทึก…');
  var p = Promise.resolve();
  if (setK.length) p = p.then(function () { var o = {}; setK.forEach(function (k) { o[k] = MEM[k] == null ? null : MEM[k]; }); return post({ a: 'settings', settings: o }); })
    .then(function () { setK.forEach(function (k) { delete dirty[k]; }); });
  if (dirty.results) p = p.then(function () { return pushRows(rows, function (n) { say('กำลังบันทึก ' + n.toLocaleString() + ' / ' + rows.length.toLocaleString() + ' รายการ…'); }); })
    .then(function (r) { sheetCount = r.total; delete dirty.results; });
  p.then(function () { updated = new Date().toISOString(); say('✓ บันทึกแล้ว · ผู้ชมเห็นข้อมูลใหม่แล้ว'); toast('✅ บันทึกลง Google Sheet แล้ว'); })
    .catch(function (e) { say('บันทึกไม่สำเร็จ: ' + errTh(e) + ' (ข้อมูลเดิมใน Sheet ยังอยู่ครบ)'); })
    .then(function () { saving = false; bar(); });
}
function pushRows(rows, step) {
  var i = 0;
  return post({ a: 'begin' }).then(function next() {
    if (i >= rows.length) return post({ a: 'finish', expect: rows.length, note: 'save' });
    var part = rows.slice(i, i + 4000).map(enc); i += part.length; step(i);
    return post({ a: 'append', rows: part }).then(next);
  });
}

/* ---------- ย้ายข้อมูลเดิมจาก localStorage ของเครื่องนี้ (ครั้งแรก) ---------- */
function localBackup() {
  try {
    var r = JSON.parse(orig.load('nimex_results_v1') || 'null'); if (!Array.isArray(r) || !r.length) return null;
    var ds = r.map(function (x) { return x.dateISO; }).sort(); return { rows: r, d0: ds[0], d1: ds[ds.length - 1] };
  } catch (e) { return null; }
}
function migrate() {
  var L = localBackup(); if (!L) return;
  S.results = L.rows.filter(function (r) { return !(r.dateISO && new Date(r.dateISO + 'T00:00:00').getDay() === 0); });
  SYNC.forEach(function (k) { var v = orig.load(k); if (v != null) { MEM[k] = v; dirty[k] = 1; } });
  dirty.results = 1;
  applyAll(); bar(); saveAll();
}

/* ---------- โหลดจาก Sheet ---------- */
function applyAll() {
  loadSettings(); loadFineToggles();
  var dates = Array.from(new Set(S.results.map(function (r) { return r.dateISO; }))).sort();
  updateStorageStatusBar(S.results.length ? { count: S.results.length, savedAt: updated || null, dates: dates } : null);
  updateBadge(); buildAllViews();
  var rb = $('btn-reprocess'); if (rb) rb.disabled = !S.results.length;
  checkReady();
  var ps = $('process-status'); if (ps && S.results.length) ps.textContent = '✓ โหลดข้อมูลจาก Google Sheet ' + S.results.length.toLocaleString() + ' รายการ';
  if (window.cidShare && window.cidShare.refresh) window.cidShare.refresh();
}
function ui() {
  var tr = document.querySelector('.topbar-right');
  if (tr && !$('shareBtn')) {
    var sb = document.createElement('button'); sb.id = 'shareBtn'; sb.type = 'button'; sb.className = 'btn-png nx-admin-only'; sb.textContent = '📤 แชร์/ส่งออก';
    tr.insertBefore(sb, tr.firstChild);
    if (ONLINE) { var lb = document.createElement('button'); lb.id = 'cidLogin'; lb.type = 'button'; lb.className = 'theme-btn'; lb.textContent = '🔒 ระบบ'; lb.onclick = function () { if (admin) { ss(null); setAdmin(false); toast('ออกจากระบบแล้ว'); } else openLogin(); }; tr.appendChild(lb); }
  }
  ['nav-upload', 'nav-share', 'nav-settings'].forEach(function (id) { var n = $(id); if (n) n.classList.add('nx-admin-only'); });
  [].forEach.call(document.querySelectorAll('.btn-png'), function (b) { b.classList.add('nx-admin-only'); });
  var badge = $('data-badge'); if (badge) badge.classList.add('cid-badge');
  if (ONLINE) {   /* ส่วนที่ใช้เฉพาะแบบเดิม: รหัสในหน้าเว็บ และส่งยอดสรุปไป Sheet */
    [].forEach.call(document.querySelectorAll('#page-settings .settings-section h3'), function (h) {
      if (/เปลี่ยนรหัสผ่าน|ส่งข้อมูลไป Google Sheets/.test(h.textContent)) h.closest('.settings-section').style.display = 'none';
    });
    var mc = document.querySelector('.main-content');
    if (mc && !$('cid-sync')) { var s = document.createElement('div'); s.id = 'cid-sync'; s.hidden = true; s.setAttribute('role', 'status'); mc.insertBefore(s, mc.firstChild); }
  }
  setAdmin(admin);
}

function start() {
  ui();
  if (!ONLINE) return;
  window.addEventListener('beforeunload', function (e) { if (admin && dirtyKeys().length) { e.preventDefault(); e.returnValue = ''; } });
  var wantAdmin = /(^|#)admin\b/.test(location.hash), key = ss();
  showLoading('กำลังโหลดข้อมูลจาก Google Sheet...');
  var authP = key ? post({ a: 'auth' }).then(function () { return true; }).catch(function () { ss(null); return false; }) : Promise.resolve(false);
  var dataP = fetch(API + '?v=' + V).then(function (r) { return r.json(); });
  var appP = new Promise(function (res) { setTimeout(res, 150); });   /* ให้ init เดิมของหน้า (50 ms) ทำงานก่อน */
  Promise.all([authP, dataP, appP]).then(function (x) {
    var R = x[1]; if (!R || !R.ok) throw new Error('bad');
    var st = R.settings || {};
    SYNC.forEach(function (k) { if (st[k] != null) MEM[k] = st[k]; });
    try { SHARE = st.share ? JSON.parse(st.share) : {}; } catch (e) { SHARE = {}; }
    var ci = {}; (R.cols || COLS).forEach(function (c, i) { ci[c] = i; });
    S.results = (R.rows || []).map(function (a) { return dec(COLS.map(function (c) { return a[ci[c]]; })); });
    sheetCount = S.results.length; updated = R.updated || '';
    var noSun = S.results.filter(function (r) { return !(r.dateISO && new Date(r.dateISO + 'T00:00:00').getDay() === 0); });
    var sunCut = S.results.length - noSun.length; S.results = noSun;
    loaded = true; dirty = {}; if (sunCut) dirty.results = 1;   /* มีวันอาทิตย์ใน Sheet → แอดมินกดบันทึกเพื่อลบออก */
    hideLoading(); applyAll(); setAdmin(x[0]);
    if (!x[0] && wantAdmin) openLogin();
  }).catch(function () {
    hideLoading(); loaded = true;
    var e = $('exec-no-data'); if (e) e.innerHTML = '<div class="empty-icon">⚠️</div><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>ลองเปิดหน้านี้ใหม่อีกครั้ง</p>';
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
