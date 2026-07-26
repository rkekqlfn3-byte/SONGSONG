/* ============================================================
   12. 데이터 로드 / 갱신
   ============================================================ */
const LS_KEY = APP_STORAGE_KEY;
const SHEET_ENDPOINT_KEY = LS_KEY + ':sheetEndpoint';
const WRITE_ENDPOINT_KEY = LS_KEY + ':writeEndpoint';
const BASE_YEAR_KEY = LS_KEY + ':baseYear';
const EXTENSION_KEY = LS_KEY + ':twoWeekExtensions';
const LAST_SYNC_KEY = LS_KEY + ':lastSuccessfulSync';
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1zFc5m2g25y_CV1JqYhrKo3aR0v0yzyIIZtuyjNsKr2Q/edit';
/*
 * 저장용 Apps Script 주소.
 *
 * ⚠️ 이 주소를 아는 사람은 로그인 없이 시트를 고칠 수 있습니다.
 *    저장소를 다시 «공개»로 바꾸거나 이 폴더를 외부에 넘기면 그대로 새어나갑니다.
 *    그런 일이 생기면 Apps Script에서 기존 배포를 «보관처리»하고 새 주소를 받으세요.
 *
 * 이전 주소 AKfycbxF5kDX3… 은 공개 저장소에 올라갔던 이력이 있어 폐기했습니다.
 */
const DEFAULT_WRITE_URL = 'https://script.google.com/macros/s/AKfycbwK8dm8mUev8vMZeLLHWRbQI-p0viyqIMzIuuVP7nxjA2V-CEd9Nc4dd02vexJvsZ8x3w/exec';

let lastFailedWrite = null;
function syncClock(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function setSyncHealth(tone, message) {
  const box = $('#syncHealth');
  if (!box) return;
  box.dataset.tone = tone || 'idle';
  box.textContent = message || '동기화 대기';
  box.title = tone === 'bad' ? '눌러서 다시 동기화' : '눌러서 지금 동기화';
}
function initSyncHealth() {
  let saved = '';
  try { saved = localStorage.getItem(LAST_SYNC_KEY) || ''; } catch {}
  setSyncHealth(saved ? 'ok' : 'idle', saved ? `최근 동기화 ${syncClock(saved)}` : '동기화 대기');
}
function failedWriteLabel(action, payload) {
  const target = payload && (payload.companyName || payload.originalCompanyName || payload.coachName);
  const actionNames = {
    addCompany: '기업 추가', updateCompany: '기업 수정', updateDocs: '서류 저장',
    updateCoachDocs: '코치 서류 저장', updateExtension: '2주 연장 저장'
  };
  return `${actionNames[action] || '저장'}${target ? ` · ${target}` : ''}`;
}
function paintSaveRetryBanner(message) {
  const banner = $('#saveRetryBanner');
  if (!banner) return;
  banner.hidden = !lastFailedWrite;
  if (lastFailedWrite) $('#saveRetryMessage').textContent = `${failedWriteLabel(lastFailedWrite.action, lastFailedWrite.payload)} — ${message || lastFailedWrite.message}`;
}
function rememberFailedWrite(endpoint, action, payload, message) {
  lastFailedWrite = { endpoint, action, payload: { ...(payload || {}) }, message: message || '연결을 확인해주세요.' };
  paintSaveRetryBanner();
}
function clearFailedWrite() {
  lastFailedWrite = null;
  paintSaveRetryBanner('');
}
async function retryLastFailedWrite() {
  if (!lastFailedWrite) return false;
  const retry = lastFailedWrite;
  const button = $('#saveRetryButton');
  if (button) { button.disabled = true; button.textContent = '다시 저장 중…'; }
  try {
    await requestSheetWrite(retry.endpoint, retry.action, retry.payload);
    clearFailedWrite();
    await syncFromSheet(localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL, {
      silent: true, reason: 'after-write'
    });
    toast('재저장과 화면 동기화를 완료했습니다.');
    return true;
  } catch (error) {
    paintSaveRetryBanner(error.message || '재저장에 실패했습니다.');
    toast('재저장 실패 — 연결을 확인해주세요.');
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = '다시 저장'; }
  }
}

/** 예전 버전에서 브라우저에만 저장했던 연장값. 시트 열이 생기기 전 데이터의 일회성 호환용이다. */
function readExtensions() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXTENSION_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}
let twoWeekExtensions = readExtensions();
function updateCompanyDeadline(company) {
  // 예전 브라우저 저장값은 새 시트 열로 옮길 때까지 함께 인정한다.
  const sheetValue = filled(company.extensionRaw) || !!twoWeekExtensions[company.name];
  company.extended = !!(company.end && sheetValue);
  company.effectiveEnd = company.end && company.extended ? addDays(company.end, 14) : company.end;
  company.dday = ACTIVE.has(company.status) ? daysFromToday(company.effectiveEnd) : null;
}
async function setCompanyExtension(company, enabled) {
  if (!company || !company.end) {
    toast('종료기한을 먼저 입력해야 2주 연장을 적용할 수 있습니다.');
    return false;
  }

  const before = {
    extended: company.extended,
    extensionRaw: company.extensionRaw,
    extensionStored: company.extensionStored,
  };
  company.extensionRaw = enabled ? 'O' : '';
  company.extensionStored = true;
  updateCompanyDeadline(company);

  try {
    await requestSheetWrite(writeEndpoint(), 'updateExtension', {
      companyName: company.name,
      extended: enabled ? 'O' : '',
      _audit: {
        type: 'EXTEND',
        target: company.name,
        detail: enabled ? '종료 기한 2주 연장 적용 (+14일)' : '2주 연장 해제 (기존 기한 복원)',
        tone: enabled ? 'warn' : 'info',
        before: { extended: before.extended ? 'O' : '' },
        after: { extended: enabled ? 'O' : '' },
      },
    });
    delete twoWeekExtensions[company.name];
    try { localStorage.setItem(EXTENSION_KEY, JSON.stringify(twoWeekExtensions)); } catch {}
    return true;
  } catch (error) {
    company.extended = before.extended;
    company.extensionRaw = before.extensionRaw;
    company.extensionStored = before.extensionStored;
    updateCompanyDeadline(company);
    toast('2주 연장 저장 실패 — ' + (error.message || '연결을 확인해주세요.'));
    return false;
  }
}

/** 서류·일정 입력에 붙는 기준 연도 — 상단에서 한 번 정하면 계속 유지된다 */
function getBaseYear() {
  const saved = parseInt(localStorage.getItem(BASE_YEAR_KEY), 10);
  return (saved >= 2000 && saved <= 2100) ? saved : TODAY.getFullYear();
}
function setBaseYear(year) { localStorage.setItem(BASE_YEAR_KEY, String(year)); }
/** 저장용 주소 — 설정에서 바꾸지 않았으면 배포된 기본 주소를 쓴다 */
const writeEndpoint = () => localStorage.getItem(WRITE_ENDPOINT_KEY) || DEFAULT_WRITE_URL;
/** 읽어오는 탭. headers=0으로 요청하므로 배열 인덱스 = 시트 행 번호 - 1 이 된다 */
const GVIZ_SHEETS = [TAB_DOCS, TAB_SOURCE, TAB_COACH, TAB_MAIL];

function applyData(raw, srcLabel, persist) {
  const M = normalize(raw);               // 실패하면 예외 → 호출부에서 기존 데이터 유지
  state.M = M; state.src = srcLabel;
  $('#stampDate').textContent = raw.generatedAt || iso(TODAY);
  $('#stampSrc').textContent = srcLabel;
  if (persist) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(raw)); }
    catch { toast('브라우저 저장 용량을 초과해 이번 세션에만 적용됩니다.'); }
  }
  render();
}

function normalizeEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Google Sheet 주소를 입력하세요.');
  const directId = raw.match(/^[A-Za-z0-9_-]{20,}$/);
  const urlId = raw.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = directId ? directId[0] : urlId && urlId[1];
  if (!id) throw new Error('Google Sheet 공유 주소 또는 문서 ID를 확인하세요.');
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

function normalizeWriteEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('기업 저장용 Apps Script 주소를 입력하세요.');
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('기업 저장용 주소 형식이 올바르지 않습니다.'); }
  if (url.protocol !== 'https:' || !/\.google\.com$/.test(url.hostname) || !/\/exec\/?$/.test(url.pathname)) {
    throw new Error('/exec로 끝나는 Apps Script 웹 앱 주소를 확인하세요.');
  }
  return url.href;
}

function gvizCellValue(cell) {
  if (!cell || cell.v == null) return '';
  const value = cell.v;
  if (typeof value === 'string') {
    const date = value.match(/^Date\((\d+),(\d+),(\d+)/);
    if (date) {
      const serial = Date.UTC(+date[1], +date[2], +date[3]) / DAY + 25569;
      return String(Math.round(serial));
    }
  }
  if (typeof value === 'number' && value >= 0 && value < 1 && /^\d{1,2}:\d{2}/.test(String(cell.f || ''))) {
    return String(cell.f);
  }
  return String(value);
}

/**
 * 탭 하나를 원시 그리드로 읽는다.
 * headers=0 을 반드시 붙인다 — 빼면 gviz가 헤더를 몇 줄로 볼지 스스로 추측해서
 * 탭마다 행이 밀리고, 헤더가 데이터로 섞여 들어온다.
 */
function loadGvizSheet(spreadsheetId, name) {
  const callback = `__sheetSync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
  url.searchParams.set('sheet', name);
  url.searchParams.set('headers', '0');
  url.searchParams.set('tqx', `out:json;responseHandler:${callback}`);
  url.searchParams.set('_', Date.now());
  return new Promise((resolve, reject) => {
    const script = el('script');
    const clear = () => {
      clearTimeout(timer);
      script.remove();
      try { delete window[callback]; } catch { window[callback] = undefined; }
    };
    const timer = setTimeout(() => {
      clear();
      reject(new Error(`${name} 탭 연결 시간이 초과되었습니다.`));
    }, 20000);
    window[callback] = response => {
      clear();
      if (!response || response.status !== 'ok' || !response.table) {
        reject(new Error(`${name} 탭을 읽지 못했습니다. 탭 이름과 공유 설정을 확인하세요.`));
        return;
      }
      const width = response.table.cols.length;
      resolve(response.table.rows.map(row =>
        Array.from({ length: width }, (_, i) => gvizCellValue(row.c && row.c[i]))
      ));
    };
    script.onerror = () => {
      clear();
      reject(new Error(`${name} 탭에 연결하지 못했습니다. 링크 공유 설정을 확인하세요.`));
    };
    script.src = url.href;
    document.head.appendChild(script);
  });
}

async function fetchSheetData(endpoint) {
  const clean = normalizeEndpoint(endpoint);
  const spreadsheetId = clean.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)[1];
  const values = await Promise.all(GVIZ_SHEETS.map(name => loadGvizSheet(spreadsheetId, name)));
  const sheets = {};
  GVIZ_SHEETS.forEach((name, i) => { sheets[name] = values[i]; });
  const raw = { generatedAt: iso(TODAY), sheets };
  if (raw && raw.error) throw new Error(raw.error);
  normalize(raw); // 화면을 바꾸기 전에 시트 구조부터 검증
  return raw;
}

const SYNC_DIALOG = $('#syncDialog');
const SYNC_ENDPOINT = $('#sheetEndpoint');
const SYNC_WRITE_ENDPOINT = $('#sheetWriteEndpoint');
const SYNC_STATE = $('#syncState');
let syncReturnFocus = null;

function setSyncState(message, tone) {
  SYNC_STATE.textContent = message || '';
  SYNC_STATE.className = 'sync-state' + (message ? ` show ${tone || ''}` : '');
}
function openSyncDialog() {
  syncReturnFocus = document.activeElement;
  SYNC_ENDPOINT.value = localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL;
  SYNC_WRITE_ENDPOINT.value = writeEndpoint();
  setSyncState('');
  SYNC_DIALOG.classList.add('open');
  SYNC_DIALOG.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => SYNC_ENDPOINT.focus());
}
function closeSyncDialog() {
  const wasOpen = SYNC_DIALOG.classList.contains('open');
  SYNC_DIALOG.classList.remove('open');
  SYNC_DIALOG.setAttribute('aria-hidden', 'true');
  if (wasOpen && syncReturnFocus && document.contains(syncReturnFocus)) syncReturnFocus.focus();
}
function setSyncBusy(busy) {
  const main = $('#btnUpdate');
  main.disabled = busy;
  main.textContent = busy ? '동기화 중…' : '↻ 동기화';
  $('#syncTest').disabled = busy;
  $('#syncSave').disabled = busy;
}
let syncInFlightPromise = null;

function syncBlockedByEditing() {
  const documentCellOpen = typeof docEditing !== 'undefined' && !!docEditing;
  const companyFormOpen = typeof COMPANY_DIALOG !== 'undefined' && COMPANY_DIALOG.classList.contains('open');
  const drawerEditOpen = typeof DRAWER !== 'undefined' &&
    DRAWER.classList.contains('open') &&
    !!DRAWER.querySelector('.doc-row-edit');
  return documentCellOpen || companyFormOpen || drawerEditOpen;
}

async function syncFromSheet(endpoint, options) {
  const opts = options || {};
  if (!opts.force && syncBlockedByEditing()) {
    if (!opts.silent) toast('입력 중인 내용을 저장하거나 취소한 뒤 동기화해주세요.');
    return false;
  }
  if (syncInFlightPromise) {
    if (!opts.silent && opts.inDialog) setSyncState('이미 진행 중인 동기화를 기다리고 있습니다…', '');
    return syncInFlightPromise;
  }
  syncInFlightPromise = syncFromSheetOnce(endpoint, opts);
  try {
    return await syncInFlightPromise;
  } finally {
    syncInFlightPromise = null;
  }
}

async function syncFromSheetOnce(endpoint, opts) {
  let clean;
  try { clean = normalizeEndpoint(endpoint); }
  catch (e) {
    if (opts.inDialog) setSyncState(e.message, 'bad'); else toast(e.message);
    return false;
  }
  setSyncBusy(true);
  setSyncHealth('busy', '동기화 중…');
  if (opts.inDialog) setSyncState('Google Sheet에서 데이터를 확인하고 있습니다…', '');
  try {
    const raw = await fetchSheetData(clean);
    if (opts.testOnly) {
      setSyncState('연결 성공 — 필요한 시트 4개를 모두 확인했습니다.', 'ok');
      setSyncHealth('ok', '연결 정상');
      return true;
    }
    if (opts.saveEndpoint) localStorage.setItem(SHEET_ENDPOINT_KEY, clean);
    const sourceLabel = opts.reason === 'manual'
      ? 'Google Sheet · 수동 동기화'
      : opts.reason === 'after-write'
        ? 'Google Sheet · 저장 후 동기화'
        : 'Google Sheet · 자동 동기화';
    applyData(raw, sourceLabel, true);
    const completedAt = new Date().toISOString();
    try { localStorage.setItem(LAST_SYNC_KEY, completedAt); } catch {}
    setSyncHealth('ok', `최근 동기화 ${syncClock(completedAt)}`);
    if (!opts.silent) toast('Google Sheet 최신 데이터로 동기화했습니다.');
    if (opts.inDialog) setSyncState('동기화 완료 — 연결 주소를 저장했습니다.', 'ok');
    if (!opts.silent && typeof addLog === 'function') {
      addLog('SYNC', 'Google Sheet', `시트 4개 탭 수동 동기화 완료 (${raw.sheets ? Object.keys(raw.sheets).length : 0}개 탭)`, 'ok');
    }
    return true;
  } catch (e) {
    console.error(e);
    const msg = '동기화 실패 — ' + (e.message || '데이터를 불러오지 못했습니다.');
    setSyncHealth('bad', '동기화 실패 · 재시도');
    if (opts.inDialog) setSyncState(msg, 'bad');
    else if (!opts.silent) toast(msg + ' 기존 데이터 유지');
    if (!opts.silent && typeof addLog === 'function') addLog('SYNC', 'Google Sheet', msg, 'bad', { success: false });
    return false;
  } finally {
    setSyncBusy(false);
  }
}

function makeRequestId(action) {
  return `${action || 'request'}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function writeAuditMeta(action, payload) {
  const sent = payload || {};
  if (sent._audit) return sent._audit;
  if (action === 'addCompany') {
    return { type: 'ADD', target: sent.companyName, detail: '새 기업 등록', tone: 'ok' };
  }
  if (action === 'updateCompany') {
    return { type: 'EDIT', target: sent.companyName || sent.originalCompanyName, detail: '기업 정보 수정', tone: 'info' };
  }
  if (action === 'updateDocs') {
    return { type: 'DOC', target: sent.companyName, detail: '기업 서류 변경', tone: 'info' };
  }
  if (action === 'updateCoachDocs') {
    return { type: 'COACH_DOC', target: sent.coachName, detail: '코치 공통 서류 변경', tone: 'warn' };
  }
  if (action === 'updateExtension') {
    return { type: 'EXTEND', target: sent.companyName, detail: '종료 기한 2주 연장 변경', tone: 'warn' };
  }
  return null;
}

function requestSheetWrite(endpoint, action, payload) {
  const clean = normalizeWriteEndpoint(endpoint);
  const callback = `__sheetWrite_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const requestId = makeRequestId(action);
  const sentPayload = { ...(payload || {}), _requestId: requestId, _source: 'web' };
  const audit = writeAuditMeta(action, sentPayload);
  const url = new URL(clean);
  url.searchParams.set('action', action);
  url.searchParams.set('payload', JSON.stringify(sentPayload));
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('callback', callback);
  url.searchParams.set('_', Date.now());
  return new Promise((resolve, reject) => {
    const script = el('script');
    let auditFinished = false;
    const finishAudit = (success, message) => {
      if (auditFinished || !audit || typeof addLog !== 'function') return;
      auditFinished = true;
      const detail = success ? audit.detail : `${audit.detail || '저장 요청'} 실패 — ${message}`;
      addLog(audit.type || 'EDIT', audit.target || '공통', detail, success ? (audit.tone || 'info') : 'bad', {
        requestId,
        source: '웹',
        success,
        before: audit.before || '',
        after: audit.after || '',
        error: success ? '' : message
      });
    };
    const clear = () => {
      clearTimeout(timer);
      script.remove();
      try { delete window[callback]; } catch { window[callback] = undefined; }
    };
    const timer = setTimeout(() => {
      clear();
      finishAudit(false, '저장 요청 시간이 초과되었습니다.');
      if (audit) rememberFailedWrite(clean, action, payload, '저장 요청 시간이 초과되었습니다.');
      reject(new Error('저장 요청 시간이 초과되었습니다.'));
    }, 25000);
    window[callback] = response => {
      clear();
      if (!response || response.ok !== true) {
        const message = (response && response.error) || '시트 저장에 실패했습니다.';
        finishAudit(false, message);
        if (audit) rememberFailedWrite(clean, action, payload, message);
        reject(new Error(message));
        return;
      }
      finishAudit(true, '');
      if (audit) clearFailedWrite();
      resolve({ ...response, requestId });
    };
    script.onerror = () => {
      clear();
      finishAudit(false, '저장용 웹 앱에 연결하지 못했습니다.');
      if (audit) rememberFailedWrite(clean, action, payload, '저장용 웹 앱에 연결하지 못했습니다.');
      reject(new Error('저장용 웹 앱에 연결하지 못했습니다.'));
    };
    script.src = url.href;
    document.head.appendChild(script);
  });
}

async function refreshActivityLogsFromSheet(options) {
  const opts = options || {};
  try {
    const response = await requestSheetWrite(writeEndpoint(), 'getAuditLogs', { limit: 100 });
    if (typeof setSheetActivityLogs === 'function') setSheetActivityLogs(response.logs || []);
    paintAuditHealth(response.auditStatus);
    if (!opts.silent) toast(`시트 감사 로그 ${response.logs ? response.logs.length : 0}건을 불러왔습니다.`);
    return true;
  } catch (error) {
    console.error(error);
    paintAuditHealth(null, error.message || '확인 실패');
    if (!opts.silent) toast('시트 감사 로그를 불러오지 못했습니다. Apps Script 새 버전을 배포했는지 확인해주세요.');
    return false;
  }
}

function paintAuditHealth(status, error) {
  const box = $('#auditHealth');
  const text = $('#auditHealthText');
  if (!box || !text) return;
  if (error) {
    box.dataset.tone = 'bad';
    text.textContent = `시트 감사 상태 확인 실패 — ${error}`;
    return;
  }
  if (!status) {
    box.dataset.tone = 'warn';
    text.textContent = 'Apps Script 새 버전 배포 후 감사 트리거 상태를 확인할 수 있습니다.';
    return;
  }
  if (status.error) {
    box.dataset.tone = 'warn';
    text.textContent = `감사 트리거 상태를 읽지 못했습니다 — ${status.error}`;
    return;
  }
  if (status.editInstalled && status.changeInstalled) {
    box.dataset.tone = 'ok';
    const lastEvent = status.lastEditAt || status.lastChangeAt;
    text.textContent = lastEvent
      ? `시트 감사 작동 중 · 최근 직접 수정 ${lastEvent}`
      : '시트 감사 트리거 설치됨 · 셀을 한 번 수정하면 실제 작동 시각이 표시됩니다.';
  } else if (status.editInstalled) {
    box.dataset.tone = 'warn';
    text.textContent = '셀 수정 감사만 작동 중 · installAuditTrigger를 다시 실행해주세요.';
  } else {
    box.dataset.tone = 'bad';
    text.textContent = '시트 직접 수정 감사가 꺼져 있습니다 · installAuditTrigger 실행 필요';
  }
}

/** 비상용 수동 갱신 — 인터넷이 막혔을 때 내려받은 .xlsx로 화면을 채운다 */
async function loadFile(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) { toast('구글 시트에서 내려받은 .xlsx 파일을 넣어주세요.'); return; }
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 xlsx 해제를 지원하지 않습니다. Edge 또는 Chrome에서 열어주세요.');
    const sheets = await readXlsx(file);
    const raw = { generatedAt: iso(TODAY), sheets };
    applyData(raw, `직접 갱신 · ${file.name}`, true);
    toast('최신 데이터로 갱신했습니다.');
    if (typeof addLog === 'function') addLog('SYNC', file.name, 'Excel 파일로 화면 데이터 직접 갱신', 'info');
  } catch (e) {
    console.error(e);
    toast('갱신 실패 — ' + (e.message || '파일을 읽을 수 없습니다') + ' (기존 데이터 유지)');
  }
}

/* ============================================================
   자동 주기 동기화 (Auto Sync)
   ============================================================ */
const AUTO_SYNC_KEY = LS_KEY + ':autoSyncInterval';
let autoSyncTimerId = null;
let autoSyncIntervalMs = 0;

function queueAutoSync() {
  if (!autoSyncIntervalMs) return;
  autoSyncTimerId = setTimeout(async () => {
    autoSyncTimerId = null;
    if (!document.hidden && !syncBlockedByEditing()) {
      const endpoint = localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL;
      await syncFromSheet(endpoint, { silent: true, reason: 'automatic' });
    }
    queueAutoSync();
  }, autoSyncIntervalMs);
}

function setAutoSyncInterval(ms) {
  const interval = parseInt(ms, 10) || 0;
  try { localStorage.setItem(AUTO_SYNC_KEY, String(interval)); } catch {}
  if (autoSyncTimerId) { clearTimeout(autoSyncTimerId); autoSyncTimerId = null; }
  autoSyncIntervalMs = interval;
  if (interval > 0) queueAutoSync();
}

function initAutoSync() {
  const saved = parseInt(localStorage.getItem(AUTO_SYNC_KEY), 10) || 0;
  const select = $('#autoSyncInterval');
  if (select) {
    select.value = String(saved);
    select.onchange = e => {
      const val = parseInt(e.target.value, 10) || 0;
      setAutoSyncInterval(val);
      const detail = val > 0 ? `자동 동기화 ${val / 1000}초 주기로 변경` : '자동 동기화 끄기';
      if (typeof addLog === 'function') addLog('SETTING', '자동 동기화', detail, 'info');
      if (val > 0) toast(`자동 동기화가 설정되었습니다 (${val / 1000}초 주기)`);
      else toast('자동 동기화가 꺼졌습니다.');
    };
  }
  if (saved > 0) setAutoSyncInterval(saved);
}
