/**
 * AI훈련로드맵 대시보드 — 시트 연동 API
 *
 * 시트 구조
 *   작성       사람이 직접 입력하는 원본. 기업 추가·수정은 여기에 쓴다.
 *              (탭 이름이 «AI훈련로드맵» 이어도 자동으로 찾는다)
 *   훈련코치   코치 원본. 사람이 직접 입력한다.
 *   서류       기업·코치 정보는 작성/훈련코치에서 수식으로, 서류 날짜는 손으로 입력
 *
 * 설치
 * 1. 시트에서 확장 프로그램 > Apps Script
 * 2. 기존 코드를 지우고 이 파일 전체를 붙여넣어 저장
 * 3. 배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포
 *    ("새 배포"를 누르면 주소가 새로 생기니 쓰지 말 것)
 * 4. 잘 올라갔는지는 /exec?action=ping 의 version 값으로 확인
 *
 * 동작 확인용 주소
 *   ?action=ping           살아있는지 + 배포된 버전
 *   ?action=diag           각 탭의 실제 행·열 크기
 *   ?action=setupFormulas  서류 탭의 수식을 다시 깐다
 *
 * 쓰기 요청
 *   ?action=addCompany&payload=...   AI훈련로드맵 탭에 기업 한 줄 추가
 *   ?action=updateCompany&payload=...  기존 기업의 기본정보 수정
 *   ?action=updateDocs&payload=...     이미 있는 기업의 서류 날짜만 수정
 *   ?action=updateCoachDocs&payload=... 코치 공통 서식8·9·10·통장사본 수정
 *   ?action=updateExtension&payload=... 기업 종료기한 2주 연장 여부 수정
 *   ?action=updateMemo&payload=...      기업 메모만 수정
 *   ?action=syncStatuses&payload=...   1차 컨설팅일 기준 진행현황 자동 갱신
 */

const VERSION = '2026-07-27-consult1';

const SPREADSHEET_ID = '1zFc5m2g25y_CV1JqYhrKo3aR0v0yzyIIZtuyjNsKr2Q';
/*
 * 기업 원본 탭.
 * 그동안 이름이 «작성» ↔ «AI훈련로드맵» 으로 오간 적이 있어 둘 다 받아들인다.
 * 앞에 적힌 이름부터 찾으므로, 실제 쓰는 탭을 앞에 두면 된다.
 * (열 순서가 달라도 sourceColumns_ 가 헤더를 읽어 알아서 맞춘다)
 */
const SOURCE_SHEET_NAMES = ['작성', 'AI훈련로드맵'];
const SOURCE_SHEET = SOURCE_SHEET_NAMES[0];

/** 원본 탭을 찾는다. 이름이 바뀌어도 후보 안에 있으면 계속 동작한다 */
function sourceSheet_(book) {
  for (let i = 0; i < SOURCE_SHEET_NAMES.length; i++) {
    const found = book.getSheetByName(SOURCE_SHEET_NAMES[i]);
    if (found) return found;
  }
  throw new Error('기업 원본 탭을 찾을 수 없습니다. (' + SOURCE_SHEET_NAMES.join(' 또는 ') + ')');
}
const COACH_SHEET = '훈련코치';
const DOCUMENT_SHEET = '서류';
const AUDIT_SHEET = '작업로그';
const AUDIT_TRIGGER_PROPERTY = 'AUDIT_TRIGGER_INSTALLATION';
const AUDIT_HEADERS = [
  '일시', '요청ID', '작업자', '작업종류', '대상', '상세',
  '변경전', '변경후', '입력경로', '성공여부', '오류'
];

/** 작성 탭 열 번호(1부터). 대시보드 입력 칸과 1:1로 맞춘다 */
const SOURCE_COLUMNS_DASHBOARD = {
  status: 1,         // A 진행현황
  owner: 2,          // B 담당자
  companyName: 3,    // C 기업명
  contactName: 4,    // D 기업 담당자
  contactTitle: 5,   // E 직급
  contactPhone: 6,   // F 전화번호
  contactEmail: 7,   // G 이메일
  startDate: 8,      // H 컨설팅 시작
  endDate: 9,        // I 종료기한
  coachName: 10,     // J 코치
  coachEmail: 11,    // K 코치 이메일
  coachPhone: 12     // L 코치 연락처
};
const SOURCE_COLUMNS_LEGACY = {
  owner: 1,          // A 담당자
  status: 2,         // B 진행현황
  companyName: 3,    // C 기업명
  coachName: 4,      // D 코치
  coachEmail: 5,     // E 메일
  coachPhone: 6,     // F 연락처
  startDate: 7,      // G 컨설팅 시작
  endDate: 8,        // H 종료기한
  employeeCount: 10, // J 근로자수
  workplaceNumber: 11, // K 앞쪽 사업장 관리번호
  companyAddress: 12,  // L 주소
  agencyBranch: 13,    // M 공단지사
  hrd4uId: 15,         // O HRD4U
  contactName: 19,   // S 기업 담당자
  contactTitle: 20,  // T 직급
  contactPhone: 21,  // U 전화번호
  contactEmail: 22   // V 이메일
};
const SOURCE_FIRST_ROW = 3;
const SOURCE_HEADER_ROW = 2;
const COACH_FIRST_ROW = 3;
const DOCUMENT_FIRST_ROW = 4;

/** 기업 원본 탭에 추가되는 사업장 기본정보 열. 같은 헤더가 이미 있으면 그 열을 그대로 사용한다. */
const COMPANY_INFO_COLUMNS = [
  { key: 'employeeCount',    header: '근로자수',          type: 'number' },
  // 공백 유무가 다른 기존 헤더를 모두 인정하되, 앞쪽 열을 우선 사용한다.
  { key: 'workplaceNumber',  header: '사업장 관리번호',   aliases: ['사업장 관리번호', '사업장관리번호'], type: 'text' },
  { key: 'companyAddress',   header: '주소',              type: 'text' },
  { key: 'agencyBranch',     header: '공단지사',          type: 'text' },
  // «HRD4U ID»가 아니라 정확히 «HRD4U»인 열만 사용한다.
  { key: 'hrd4uId',          header: 'HRD4U',             aliases: ['HRD4U'], type: 'text' }
];

/** 종료기한 연장 여부는 기업 기본정보 수정과 분리해, 일반 수정 때 기존 체크가 지워지지 않게 한다. */
const COMPANY_EXTENSION_COLUMN = {
  key: 'twoWeekExtension',
  header: '2주 연장',
  aliases: ['2주 연장'],
  type: 'mark'
};
/** 메모는 시트와 웹이 함께 쓰는 단일 원본 열이다. 없으면 원본 탭 끝에 만든다. */
const COMPANY_MEMO_COLUMN = {
  key: 'memo',
  header: '메모',
  aliases: ['메모'],
  type: 'text'
};
const COMPANY_SOURCE_COLUMNS = COMPANY_INFO_COLUMNS.concat([COMPANY_EXTENSION_COLUMN, COMPANY_MEMO_COLUMN]);

/** 기업 원본 탭에 추가되는 1·2차 컨설팅 일정 열. 기존 열은 건드리지 않고 마지막 열 뒤에 붙인다. */
const CONSULTATION_COLUMNS = [
  { key: 'consult1Date',  header: '1차 컨설팅일', type: 'date' },
  { key: 'consult1Time',  header: '1차 시간',      type: 'text' },
  { key: 'consult1Visit', header: '1차 방문',      type: 'mark' },
  { key: 'consult1Owner', header: '1차 담당',      type: 'text' },
  { key: 'consult2Date',  header: '2차 컨설팅일', type: 'date' },
  { key: 'consult2Time',  header: '2차 시간',      type: 'text' },
  { key: 'consult2Visit', header: '2차 방문',      type: 'mark' },
  { key: 'consult2Owner', header: '2차 담당',      type: 'text' }
];

/**
 * 서류 탭에서 손으로 채우는 열만 모았다.
 * 개인정보수집(M)·정보공유(N)·사업참여(O)·통장사본(T)은 훈련코치에서 수식으로 오므로 제외한다.
 */
const DOCUMENT_MANUAL_COLUMNS = [
  { key: 'bizApply',  col: 6,  type: 'mark' },  // F 사업 참여 신청서
  { key: 'consult',   col: 7,  type: 'date' },  // G 컨설팅 신청서
  { key: 'contract',  col: 8,  type: 'date' },  // H 표준 협약서
  { key: 'teamWrite', col: 9,  type: 'date' },  // I 약정서 작성일
  { key: 'teamTerm',  col: 10, type: 'text' },  // J 약정 기간
  { key: 'teamStart', col: 11, type: 'date' },  // K 약정 시작일
  { key: 'teamEnd',   col: 12, type: 'date' },  // L 약정 종료일
  { key: 'log1',      col: 16, type: 'date' },  // P 수행일지 1차
  { key: 'log2',      col: 17, type: 'date' },  // Q 수행일지 2차
  { key: 'report',    col: 18, type: 'date' },  // R 보고서
  { key: 'payslip',   col: 19, type: 'mark' }   // S 수당지급 명세서
];

/** 훈련코치 탭의 코치 공통 제출 서류. 수정하면 해당 코치의 모든 담당 기업에 같이 반영된다. */
const COACH_DOCUMENT_COLUMNS = [
  { key: 'privacy',  col: 8,  type: 'date' },  // H 개인정보 수집 동의 [서식8]
  { key: 'share',    col: 9,  type: 'date' },  // I 정보공유 동의 [서식9]
  { key: 'join',     col: 10, type: 'date' },  // J 사업 참여 서약 [서식10]
  { key: 'bankbook', col: 11, type: 'mark' }   // K 통장 사본
];

/** @원본 / @코치 는 탭 이름으로 치환된다 */
const FORMULAS = [
  {
    sheet: DOCUMENT_SHEET, row: 4, col: 2, width: 4,
    text: '=FILTER({@원본!@STATUS3:@STATUS,@원본!@OWNER3:@OWNER,@원본!@NAME3:@NAME,@원본!@COACH3:@COACH},@원본!@NAME3:@NAME<>"")'
  },
  {
    sheet: DOCUMENT_SHEET, row: 4, col: 13, width: 3,
    text: '=ARRAYFORMULA(IF(E4:E500="","",IFERROR(VLOOKUP(E4:E500,@코치!$B$3:$K,{7,8,9},FALSE),"")))'
  },
  {
    sheet: DOCUMENT_SHEET, row: 4, col: 20, width: 1,
    text: '=ARRAYFORMULA(IF(E4:E500="","",IFERROR(VLOOKUP(E4:E500,@코치!$B$3:$K,10,FALSE),"")))'
  }
];

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  let payload = {};
  let skipDefaultAudit = false;
  try {
    if (action === 'ping') return response_({ ok: true, message: 'ready', version: VERSION }, e);
    if (action === 'diag') return response_({ ok: true, version: VERSION, sheets: diag_() }, e);
    if (action === 'getAuditLogs') {
      const requested = JSON.parse((e.parameter && e.parameter.payload) || '{}');
      const requestedLimit = requested.limit || (e.parameter && e.parameter.limit) || 100;
      const limit = String(requestedLimit).toLowerCase() === 'all'
        ? 'all'
        : Math.min(Math.max(parseInt(requestedLimit, 10) || 100, 1), 5000);
      return response_({
        ok: true,
        version: VERSION,
        logs: getAuditLogs_(limit),
        auditStatus: auditTriggerStatus_()
      }, e);
    }

    payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
    let result;
    if (action === 'setupFormulas') {
      result = { applied: setupFormulas_() };
    } else if (action === 'updateDocs') {
      const updated = updateDocs_(payload);
      // scheduleSaved = 컨설팅 일정까지 같은 요청에서 처리했는지 (앱이 이것으로 새 버전인지 판별한다)
      result = {
        company: updated.company, docRow: updated.docRow, wrote: updated.wrote,
        scheduleSaved: updated.scheduleRow != null, row: updated.scheduleRow,
        statusSaved: updated.scheduleRow != null && !!cleanText_(payload.newStatus)
      };
    } else if (action === 'updateCoachDocs') {
      const updated = updateCoachDocs_(payload);
      result = { coach: updated.coach, coachRow: updated.coachRow, wrote: updated.wrote };
    } else if (action === 'updateExtension') {
      const updated = updateExtension_(payload);
      result = { company: updated.company, row: updated.row, extended: updated.extended };
    } else if (action === 'updateMemo') {
      const updated = updateMemo_(payload);
      result = { company: updated.company, row: updated.row, memo: updated.memo };
    } else if (action === 'syncStatuses') {
      result = syncConsultationStatuses_('web');
      // 실제 변경이 있을 때 syncConsultationStatuses_가 자동 변경 내역을 직접 기록한다.
      skipDefaultAudit = true;
    } else if (action === 'updateCompany') {
      const updated = updateCompany_(payload);
      result = { company: updated.company, row: updated.row, docRow: updated.docRow };
    } else if (action === 'addCompany') {
      const added = addCompany_(payload);
      result = { company: added.company, row: added.row, docRow: added.docRow };
    } else {
      throw new Error('지원하지 않는 요청입니다.');
    }

    const auditLogged = skipDefaultAudit ? !!result.auditLogged : appendAuditLog_(auditRecord_(action, payload, result, true, ''));
    return response_(Object.assign({ ok: true, version: VERSION, auditLogged: auditLogged }, result), e);
  } catch (error) {
    if (action && action !== 'ping' && action !== 'diag' && action !== 'getAuditLogs') {
      appendAuditLog_(auditRecord_(action, payload, null, false, error && error.message ? error.message : String(error)));
    }
    return response_({ ok: false, error: error && error.message ? error.message : String(error) }, e);
  }
}

/* ============================================================
   1차 컨설팅일 기준 진행현황 자동 변경
   ============================================================ */
const CONSULTATION_STATUS_TRIGGER = 'runConsultationStatusAutomation';
const CONSULTATION_READY_STATUSES = { '검토요청': true, '검토완료': true };

/** 시트에서 읽은 날짜를 비교 가능한 yyyy-mm-dd로 맞춘다. */
function consultationDateKey_(value, zone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, zone, 'yyyy-MM-dd');
  }
  const text = String(value == null ? '' : value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Math.round(Number(text));
    if (serial >= 20000 && serial <= 80000) {
      return Utilities.formatDate(new Date(1899, 11, 30 + serial, 12, 0, 0), zone, 'yyyy-MM-dd');
    }
  }
  return '';
}

/**
 * 검토요청·검토완료 기업만 대상으로 한다.
 * 1차 컨설팅일이 없으면 기존 «컨설팅 시작»을 호환용 날짜로 사용한다.
 */
function advanceConsultationStatuses_(book, now) {
  const source = sourceSheet_(book);
  const columns = sourceColumns_(source);
  const lastRow = source.getLastRow();
  const count = Math.max(0, lastRow - SOURCE_FIRST_ROW + 1);
  const zone = book.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Seoul';
  const today = Utilities.formatDate(now || new Date(), zone, 'yyyy-MM-dd');
  if (!count || !columns.status || !columns.companyName || (!columns.consult1Date && !columns.startDate)) {
    return { updated: 0, companies: [], changes: [], today: today };
  }

  const statuses = source.getRange(SOURCE_FIRST_ROW, columns.status, count, 1).getDisplayValues();
  const names = source.getRange(SOURCE_FIRST_ROW, columns.companyName, count, 1).getDisplayValues();
  const firstDates = columns.consult1Date
    ? source.getRange(SOURCE_FIRST_ROW, columns.consult1Date, count, 1).getValues()
    : [];
  const legacyDates = columns.startDate
    ? source.getRange(SOURCE_FIRST_ROW, columns.startDate, count, 1).getValues()
    : [];
  const ranges = [];
  const changes = [];

  for (let i = 0; i < count; i++) {
    const status = String(statuses[i][0] || '').trim();
    if (!CONSULTATION_READY_STATUSES[status]) continue;
    const firstRaw = firstDates[i] && firstDates[i][0];
    const legacyRaw = legacyDates[i] && legacyDates[i][0];
    const dueDate = consultationDateKey_(firstRaw, zone) || consultationDateKey_(legacyRaw, zone);
    if (!dueDate || dueDate > today) continue;
    const row = SOURCE_FIRST_ROW + i;
    const company = String(names[i][0] || '').trim() || ('행 ' + row);
    ranges.push(columnLetter_(columns.status) + row);
    changes.push({ company: company, row: row, dueDate: dueDate, before: status, after: '컨설팅진행' });
  }

  if (ranges.length) {
    source.getRangeList(ranges).setValue('컨설팅진행');
    SpreadsheetApp.flush();
  }
  return {
    updated: changes.length,
    companies: changes.map(function (item) { return item.company; }),
    changes: changes,
    today: today
  };
}

function syncConsultationStatuses_(sourceLabel) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let result;
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    result = advanceConsultationStatuses_(book, new Date());
  } finally {
    lock.releaseLock();
  }
  result.auditLogged = false;
  if (result.updated) {
    result.auditLogged = appendAuditLog_({
      requestId: 'consult_auto_' + Date.now(),
      actor: '자동화',
      action: 'AUTO_STATUS',
      target: result.companies.join(', '),
      detail: '1차 컨설팅일 도래 · 진행현황을 컨설팅진행으로 자동 변경 (' + result.updated + '건)',
      before: result.changes.map(function (item) { return { company: item.company, status: item.before }; }),
      after: result.changes.map(function (item) { return { company: item.company, status: item.after, firstConsultation: item.dueDate }; }),
      source: sourceLabel || 'automation',
      success: true,
      error: ''
    });
  }
  return result;
}

/** 매시간 자동 실행되는 함수. 웹을 열지 않아도 시트의 진행현황을 갱신한다. */
function runConsultationStatusAutomation() {
  return syncConsultationStatuses_('time-trigger');
}

/** Apps Script 편집기에서 처음 한 번 실행해 매시간 자동 점검을 설치한다. */
function installConsultationStatusAutomation() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === CONSULTATION_STATUS_TRIGGER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(CONSULTATION_STATUS_TRIGGER).timeBased().everyHours(1).create();
  const first = runConsultationStatusAutomation();
  const message = '1차 컨설팅일 자동 상태 변경 설치 완료 · 현재 ' + first.updated + '건 변경';
  console.log(message);
  return message;
}

/** 각 탭이 실제로 몇 행 몇 열인지 — 범위를 벗어나는 오류의 원인을 보려고 */
function diag_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  // 실제 탭 이름을 통째로 돌려준다.
  // 이름이 한 글자만 달라도 스크립트는 «없다»고 하는데, 화면으로는 구분이 안 되기 때문이다.
  const all = book.getSheets().map(function (s) {
    return { name: s.getName(), lastRow: s.getLastRow(), lastColumn: s.getLastColumn() };
  });
  let sourceName = '(못 찾음)';
  try { sourceName = sourceSheet_(book).getName(); } catch (e) {}
  return {
    시트전체: all,
    쓰는탭: { 기업원본: sourceName, 코치: COACH_SHEET, 서류: DOCUMENT_SHEET },
    후보: SOURCE_SHEET_NAMES
  };
}

/**
 * 서류 탭의 수식을 다시 깐다.
 * 수식이 펼쳐질 자리에 값이 남아 있으면 #REF!가 나므로 먼저 비운다.
 * 병합된 셀이 걸쳐 있어도 수식이 안 들어가니, 안 먹으면 병합부터 풀어야 한다.
 * 원본인 작성·훈련코치 탭은 건드리지 않는다.
 */
function setupFormulas_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const source = sourceSheet_(book);
  const columns = sourceColumns_(source);
  const applied = [];

  FORMULAS.forEach(function (spec) {
    const sheet = book.getSheetByName(spec.sheet);
    if (!sheet) throw new Error(spec.sheet + ' 탭을 찾을 수 없습니다.');

    const height = sheet.getMaxRows() - spec.row + 1;
    if (height > 0) sheet.getRange(spec.row, spec.col, height, spec.width).clearContent();

    const text = spec.text
      .replace(/@원본/g, "'" + source.getName() + "'")
      .replace(/@코치/g, "'" + COACH_SHEET + "'")
      .replace(/@STATUS/g, columnLetter_(columns.status))
      .replace(/@OWNER/g, columnLetter_(columns.owner))
      .replace(/@NAME/g, columnLetter_(columns.companyName))
      .replace(/@COACH/g, columnLetter_(columns.coachName));
    sheet.getRange(spec.row, spec.col).setFormula(text);
    applied.push(spec.sheet + '!' + columnLetter_(spec.col) + spec.row);
  });

  SpreadsheetApp.flush();
  return applied;
}

/** 원본 탭은 파일 버전에 따라 진행현황/담당자 열 순서가 달라 헤더와 실제 상태값으로 판별한다 */
function sourceColumns_(sheet) {
  const width = Math.max(12, sheet.getLastColumn());
  const headerRows = sheet
    .getRange(1, 1, Math.max(1, SOURCE_FIRST_ROW - 1), width)
    .getDisplayValues();
  let base = null;
  let sourceHeader = null;
  for (let r = 0; r < headerRows.length; r++) {
    const row = headerRows[r].map(function (v) { return String(v || '').trim(); });
    const statusIndex = row.indexOf('진행현황');
    const nameIndex = row.indexOf('기업명');
    if (nameIndex === 2) sourceHeader = row;
    if (nameIndex === 2 && statusIndex === 0) base = SOURCE_COLUMNS_DASHBOARD;
    if (nameIndex === 2 && statusIndex === 1) base = SOURCE_COLUMNS_LEGACY;
  }

  if (!base) {
    const statuses = {
      '검토요청': true, '검토완료': true, '컨설팅진행': true, '보고서제출': true, '지급준비': true,
      '지급완료': true, '기타': true, '신청불가': true, '신청취소': true
    };
    const sampleCount = Math.min(Math.max(sheet.getLastRow() - SOURCE_FIRST_ROW + 1, 0), 50);
    if (sampleCount > 0) {
      const sample = sheet.getRange(SOURCE_FIRST_ROW, 1, sampleCount, 2).getDisplayValues();
      let first = 0, second = 0;
      sample.forEach(function (row) {
        if (statuses[String(row[0] || '').trim()]) first++;
        if (statuses[String(row[1] || '').trim()]) second++;
      });
      if (first > second) base = SOURCE_COLUMNS_DASHBOARD;
    }
  }
  if (!base) base = SOURCE_COLUMNS_LEGACY;

  const columns = {};
  Object.keys(base).forEach(function (key) { columns[key] = base[key]; });
  if (sourceHeader) {
    /*
     * 헤더 이름으로 열을 찾는다. 여기서 찾은 값이 위치 기반 기본값을 덮어쓴다.
     * 핵심 열까지 이름으로 찾아야 «화면은 맞게 보이는데 시트에는 엉뚱한 칸에 저장»되는 일이 없다.
     * (대시보드 쪽 js/core.js 의 SOURCE_EXTRA_HEADERS 와 같은 이름을 쓴다)
     */
    const extraHeaders = {
      status: ['진행현황'],
      owner: ['코치별 담당'],       // 옛 이름 «담당자»는 기업 담당자와 겹쳐서 넣지 않는다
      companyName: ['기업명'],
      coachName: ['코치'],
      coachEmail: ['메일'],
      coachPhone: ['연락처'],
      contactName: ['기업 담당자'],
      contactTitle: ['직급'],
      contactPhone: ['전화번호'],
      contactEmail: ['이메일'],
      memo: ['메모'],
      startDate: ['컨설팅시작', '컨설팅 시작'],
      endDate: ['종료기한', '종료 기한'],
      visitOwner: ['방문 담당', '담당'],   // 시트에서 «담당» → «방문 담당» 으로 바뀜
      visitDate: ['일자'],
      visitTime: ['시간']
    };
    COMPANY_SOURCE_COLUMNS.concat(CONSULTATION_COLUMNS).forEach(function (def) {
      extraHeaders[def.key] = def.aliases || [def.header];
    });
    Object.keys(extraHeaders).forEach(function (key) {
      const labels = Array.isArray(extraHeaders[key]) ? extraHeaders[key] : [extraHeaders[key]];
      // 행의 왼쪽부터 검사하여 중복 헤더가 있으면 가장 앞쪽 열을 선택한다.
      const index = sourceHeader.findIndex(function (cell) { return labels.indexOf(cell) >= 0; });
      if (index >= 0) columns[key] = index + 1;
    });
  }
  return columns;
}

/** 요청된 확장 열이 없으면 원본 마지막 열 뒤에 안전하게 추가한다. */
function ensureSourceExtraColumns_(sheet, definitions, groupTitle) {
  const width = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(SOURCE_HEADER_ROW, 1, 1, width).getDisplayValues()[0]
    .map(function (v) { return String(v || '').trim(); });
  const missing = definitions.filter(function (def) {
    const labels = def.aliases || [def.header];
    return !headers.some(function (cell) { return labels.indexOf(cell) >= 0; });
  });
  if (!missing.length) return;

  const requiredLastColumn = width + missing.length;
  if (requiredLastColumn > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredLastColumn - sheet.getMaxColumns());
  }
  let nextColumn = width + 1;
  missing.forEach(function (def, index) {
    if (index === 0) sheet.getRange(1, nextColumn).setValue(groupTitle);
    sheet.getRange(SOURCE_HEADER_ROW, nextColumn).setValue(def.header);
    nextColumn++;
  });
}

function ensureCompanyInfoColumns_(sheet) {
  ensureSourceExtraColumns_(sheet, COMPANY_INFO_COLUMNS, '사업장 정보');
}

function ensureExtensionColumn_(sheet) {
  ensureSourceExtraColumns_(sheet, [COMPANY_EXTENSION_COLUMN], '종료기한 관리');
}

function ensureMemoColumn_(sheet) {
  ensureSourceExtraColumns_(sheet, [COMPANY_MEMO_COLUMN], '기업 메모');
}

function ensureConsultationColumns_(sheet) {
  ensureSourceExtraColumns_(sheet, CONSULTATION_COLUMNS, '1·2차 컨설팅 일정');
}

function employeeCount_(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (!/^\d+$/.test(raw)) throw new Error('근로자 수는 0 이상의 정수로 입력해주세요.');
  const count = Number(raw);
  if (!isFinite(count) || count > 9007199254740991) {
    throw new Error('근로자 수가 너무 큽니다.');
  }
  return count;
}

function companyInfoValues_(data) {
  return {
    employeeCount: employeeCount_(data.employeeCount),
    workplaceNumber: cleanText_(data.workplaceNumber),
    companyAddress: cleanText_(data.companyAddress),
    agencyBranch: cleanText_(data.agencyBranch),
    hrd4uId: cleanText_(data.hrd4uId)
  };
}

function consultationValues_(data) {
  const values = {};
  const visits = [];
  [1, 2].forEach(function (index) {
    const prefix = 'consult' + index;
    const date = parseDate_(data[prefix + 'Date']);
    const time = cleanText_(data[prefix + 'Time']);
    const visit = cleanText_(data[prefix + 'Visit']) ? 'O' : '';
    const owner = visit ? cleanText_(data[prefix + 'Owner']) : '';
    if (time && !date) throw new Error(index + '차 컨설팅 시간을 입력하려면 날짜가 필요합니다.');
    if (visit && !date) throw new Error(index + '차 방문을 체크하려면 컨설팅일이 필요합니다.');
    if (visit && !owner) throw new Error(index + '차 방문 담당자를 선택해주세요.');
    values[prefix + 'Date'] = date;
    values[prefix + 'Time'] = time;
    values[prefix + 'Visit'] = visit;
    values[prefix + 'Owner'] = owner;
    if (visit) visits.push({ date: date, time: time, owner: owner, index: index });
  });
  if (values.consult1Date && values.consult2Date && values.consult2Date < values.consult1Date) {
    throw new Error('2차 컨설팅일은 1차 컨설팅일보다 빠를 수 없습니다.');
  }
  visits.sort(function (a, b) {
    const diff = a.date.getTime() - b.date.getTime();
    return diff || a.index - b.index;
  });
  values.latestVisit = visits.length ? visits[visits.length - 1] : null;
  return values;
}

function setConsultationRowValues_(row, columns, schedule) {
  CONSULTATION_COLUMNS.forEach(function (def) {
    if (columns[def.key]) row[columns[def.key] - 1] = schedule[def.key];
  });
  if (columns.visitOwner) row[columns.visitOwner - 1] = schedule.latestVisit ? schedule.latestVisit.owner : '';
  if (columns.visitDate) row[columns.visitDate - 1] = schedule.latestVisit ? schedule.latestVisit.date : '';
  if (columns.visitTime) row[columns.visitTime - 1] = schedule.latestVisit ? schedule.latestVisit.time : '';
}

/**
 * 값은 한 줄 통째로 쓰고(setConsultationRowValues_), 날짜 칸의 «표시 형식»만 따로 입힌다.
 * 형식은 값과 달리 한 번에 묶을 수 없어 날짜 열에만 최소로 건다.
 */
function formatConsultationCells_(sheet, row, columns) {
  CONSULTATION_COLUMNS.forEach(function (def) {
    if (def.type !== 'date' || !columns[def.key]) return;
    sheet.getRange(row, columns[def.key]).setNumberFormat('MM/dd ddd');
  });
  if (columns.visitDate) sheet.getRange(row, columns.visitDate).setNumberFormat('MM/dd ddd');
}

function sourceWidth_(columns) {
  return Object.keys(columns).reduce(function (max, key) {
    return Math.max(max, columns[key]);
  }, 0);
}

/**
 * 원본 탭의 한 줄을 «한 번에» 고쳐 쓴다. 칸마다 쓰면 열 수만큼 시트를 왕복해 느리다.
 * 수식이 들어 있는 칸은 계산된 값이 아니라 «수식 그대로» 되돌려 써서 수식이 사라지지 않게 한다.
 */
function writeSourceRow_(sheet, row, columns, patch) {
  const width = Math.max(sheet.getLastColumn(), sourceWidth_(columns));
  const range = sheet.getRange(row, 1, 1, width);
  const values = range.getValues()[0];
  const formulas = range.getFormulas()[0];
  for (let i = 0; i < width; i++) {
    if (formulas[i]) values[i] = formulas[i];
  }
  patch(values);
  range.setValues([values]);
}

function addCompany_(data) {
  const companyName = cleanText_(data.companyName);
  if (!companyName) throw new Error('기업명은 필수입니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const source = sourceSheet_(book);
    const scheduleChanged = data.scheduleChanged === true || String(data.scheduleChanged).toLowerCase() === 'true';
    ensureCompanyInfoColumns_(source);
    ensureMemoColumn_(source);
    if (scheduleChanged) ensureConsultationColumns_(source);
    const columns = sourceColumns_(source);
    const schedule = scheduleChanged ? consultationValues_(data) : null;
    const companyInfo = companyInfoValues_(data);

    const lastRow = source.getLastRow();
    if (lastRow >= SOURCE_FIRST_ROW) {
      const names = source
        .getRange(SOURCE_FIRST_ROW, columns.companyName, lastRow - SOURCE_FIRST_ROW + 1, 1)
        .getDisplayValues();
      const clash = names.some(function (r) { return String(r[0]).trim() === companyName; });
      if (clash) throw new Error('같은 기업명이 이미 등록되어 있습니다.');
    }

    const row = [];
    while (row.length < sourceWidth_(columns)) row.push('');
    row[columns.owner - 1] = cleanText_(data.owner);
    row[columns.status - 1] = cleanText_(data.status) || '검토요청';
    row[columns.companyName - 1] = companyName;
    row[columns.coachName - 1] = cleanText_(data.coachName);
    row[columns.coachEmail - 1] = cleanText_(data.coachEmail);
    row[columns.coachPhone - 1] = cleanText_(data.coachPhone);
    row[columns.startDate - 1] = parseDate_(data.startDate);
    row[columns.endDate - 1] = parseDate_(data.endDate);
    row[columns.contactName - 1] = cleanText_(data.contactName);
    row[columns.contactTitle - 1] = cleanText_(data.contactTitle);
    row[columns.contactPhone - 1] = cleanText_(data.contactPhone);
    row[columns.contactEmail - 1] = cleanText_(data.contactEmail);
    if (columns.memo) row[columns.memo - 1] = cleanText_(data.memo);
    Object.keys(companyInfo).forEach(function (key) {
      row[columns[key] - 1] = companyInfo[key];
    });
    if (schedule) setConsultationRowValues_(row, columns, schedule);

    const insertedRow = appendStyledRow_(source, row);
    if (schedule) formatConsultationCells_(source, insertedRow, columns);
    SpreadsheetApp.flush();   // 수식이 서류 탭에 새 행을 만들 때까지 기다린다

    const written = writeDocumentRow_(book, companyName, data.docs || {});

    return { company: companyName, row: insertedRow, docRow: written ? written.row : null };
  } finally {
    lock.releaseLock();
  }
}

/** 기존 기업의 기본정보를 수정하고, 함께 전달된 서류 값도 같은 기업 행에 반영한다 */
function updateCompany_(data) {
  const originalName = cleanText_(data.originalCompanyName);
  const companyName = cleanText_(data.companyName);
  if (!originalName) throw new Error('수정할 기존 기업명이 필요합니다.');
  if (!companyName) throw new Error('기업명은 필수입니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const source = sourceSheet_(book);
    const hasScheduleFlag = Object.prototype.hasOwnProperty.call(data, 'scheduleChanged');
    const scheduleChanged = data.scheduleChanged === true || String(data.scheduleChanged).toLowerCase() === 'true';
    ensureCompanyInfoColumns_(source);
    ensureMemoColumn_(source);
    if (scheduleChanged) ensureConsultationColumns_(source);
    const columns = sourceColumns_(source);
    const schedule = scheduleChanged ? consultationValues_(data) : null;
    const companyInfo = companyInfoValues_(data);

    const lastRow = source.getLastRow();
    if (lastRow < SOURCE_FIRST_ROW) throw new Error('수정할 기업 데이터를 찾지 못했습니다.');
    const names = source
      .getRange(SOURCE_FIRST_ROW, columns.companyName, lastRow - SOURCE_FIRST_ROW + 1, 1)
      .getDisplayValues();
    let targetRow = 0;
    for (let i = 0; i < names.length; i++) {
      const name = String(names[i][0]).trim();
      if (name === originalName) targetRow = SOURCE_FIRST_ROW + i;
      if (name === companyName && name !== originalName) {
        throw new Error('같은 기업명이 이미 등록되어 있습니다.');
      }
    }
    if (!targetRow) throw new Error('«' + originalName + '» 기업 행을 찾지 못했습니다.');

    const values = {
      status: cleanText_(data.status) || '검토요청',
      owner: cleanText_(data.owner),
      companyName: companyName,
      contactName: cleanText_(data.contactName),
      contactTitle: cleanText_(data.contactTitle),
      contactPhone: cleanText_(data.contactPhone),
      contactEmail: cleanText_(data.contactEmail),
      coachName: cleanText_(data.coachName),
      coachEmail: cleanText_(data.coachEmail),
      coachPhone: cleanText_(data.coachPhone)
    };
    Object.keys(companyInfo).forEach(function (key) {
      values[key] = companyInfo[key];
    });
    // 메모는 보내온 경우에만 건드린다. 안 보냈는데 덮어쓰면 기존 메모가 지워진다.
    if (Object.prototype.hasOwnProperty.call(data, 'memo')) values.memo = cleanText_(data.memo);
    if (!hasScheduleFlag || scheduleChanged) {
      values.startDate = parseDate_(data.startDate);
      values.endDate = parseDate_(data.endDate);
    }
    /*
     * 한 줄을 통째로 읽어 고칠 칸만 바꾼 뒤 «한 번에» 쓴다.
     * 칸마다 setValue 하면 열 개수만큼 시트 서버를 왕복해 눈에 띄게 느리다.
     */
    writeSourceRow_(source, targetRow, columns, function (rowValues) {
      Object.keys(values).forEach(function (key) {
        // 시트에 그 열이 없으면 건너뛴다 (헤더를 못 찾은 항목까지 쓰려다 오류가 나지 않게)
        if (!columns[key]) return;
        rowValues[columns[key] - 1] = values[key];
      });
      if (schedule) setConsultationRowValues_(rowValues, columns, schedule);
    });
    if (schedule) formatConsultationCells_(source, targetRow, columns);

    // 기업명을 바꾼 경우에만 서류 탭의 이름 열(수식)이 다시 계산될 때까지 기다린다
    if (companyName !== originalName) SpreadsheetApp.flush();

    let written = writeDocumentRow_(book, companyName, data.docs || {});
    if (!written && companyName !== originalName) {
      written = writeDocumentRow_(book, originalName, data.docs || {});
    }
    return { company: companyName, row: targetRow, docRow: written ? written.row : null };
  } finally {
    lock.releaseLock();
  }
}

/** 기존 기업의 메모 한 칸만 수정한다. 다른 기업 정보는 읽거나 덮어쓰지 않는다. */
function updateMemo_(data) {
  const companyName = cleanText_(data.companyName);
  const memo = cleanText_(data.memo);
  if (!companyName) throw new Error('기업명이 필요합니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const source = sourceSheet_(book);
    ensureMemoColumn_(source);
    const columns = sourceColumns_(source);
    const lastRow = source.getLastRow();
    if (lastRow < SOURCE_FIRST_ROW) throw new Error('기업 데이터를 찾지 못했습니다.');

    const names = source
      .getRange(SOURCE_FIRST_ROW, columns.companyName, lastRow - SOURCE_FIRST_ROW + 1, 1)
      .getDisplayValues();
    let targetRow = 0;
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === companyName) {
        targetRow = SOURCE_FIRST_ROW + i;
        break;
      }
    }
    if (!targetRow) throw new Error('«' + companyName + '» 기업 행을 찾지 못했습니다.');

    source.getRange(targetRow, columns.memo).setValue(memo);
    return { company: companyName, row: targetRow, memo: memo };
  } finally {
    lock.releaseLock();
  }
}

/** 기업 종료기한의 2주 연장 여부만 원본 탭에 저장한다. */
function updateExtension_(data) {
  const companyName = cleanText_(data.companyName);
  if (!companyName) throw new Error('기업명이 필요합니다.');
  const enabled = data.extended === true ||
    /^(O|1|true|yes)$/i.test(String(data.extended == null ? '' : data.extended).trim());

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const source = sourceSheet_(book);
    ensureExtensionColumn_(source);
    const columns = sourceColumns_(source);
    const lastRow = source.getLastRow();
    if (lastRow < SOURCE_FIRST_ROW) throw new Error('기업 데이터를 찾지 못했습니다.');

    const names = source
      .getRange(SOURCE_FIRST_ROW, columns.companyName, lastRow - SOURCE_FIRST_ROW + 1, 1)
      .getDisplayValues();
    let targetRow = 0;
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === companyName) {
        targetRow = SOURCE_FIRST_ROW + i;
        break;
      }
    }
    if (!targetRow) throw new Error('«' + companyName + '» 기업 행을 찾지 못했습니다.');
    if (enabled && !source.getRange(targetRow, columns.endDate).getValue()) {
      throw new Error('종료기한을 먼저 입력해야 2주 연장을 적용할 수 있습니다.');
    }

    source.getRange(targetRow, columns.twoWeekExtension).setValue(enabled ? 'O' : '');
    return { company: companyName, row: targetRow, extended: enabled };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 컨설팅 일정(1·2차 날짜·시간·동행)과 컨설팅 시작·종료기한만 원본 탭에 반영한다.
 * scheduleChanged가 없으면 아무것도 하지 않는다. 기업 기본정보는 건드리지 않는다.
 */
/**
 * 앱이 자동으로 올려 보내는 진행현황만 받는다.
 * 아무 값이나 진행현황 칸에 들어가지 않도록 아는 값인지 확인한다.
 */
function autoStatusValue_(raw) {
  const value = cleanText_(raw);
  if (!value) return '';
  const allowed = ['검토요청', '검토완료', '컨설팅진행', '보고서제출', '지급준비', '지급완료'];
  if (allowed.indexOf(value) < 0) throw new Error('알 수 없는 진행현황입니다: ' + value);
  return value;
}

function applyScheduleToSource_(book, companyName, data) {
  const changed = data.scheduleChanged === true || String(data.scheduleChanged).toLowerCase() === 'true';
  const newStatus = autoStatusValue_(data.newStatus);
  if (!changed && !newStatus) return null;
  const source = sourceSheet_(book);
  if (changed) ensureConsultationColumns_(source);
  const columns = sourceColumns_(source);
  const schedule = changed ? consultationValues_(data) : null;

  const lastRow = source.getLastRow();
  if (lastRow < SOURCE_FIRST_ROW) return null;
  const names = source
    .getRange(SOURCE_FIRST_ROW, columns.companyName, lastRow - SOURCE_FIRST_ROW + 1, 1)
    .getDisplayValues();
  let targetRow = 0;
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0] || '').trim() === companyName) { targetRow = SOURCE_FIRST_ROW + i; break; }
  }
  if (!targetRow) return null;

  writeSourceRow_(source, targetRow, columns, function (rowValues) {
    if (schedule) {
      setConsultationRowValues_(rowValues, columns, schedule);
      if (Object.prototype.hasOwnProperty.call(data, 'startDate') && columns.startDate) {
        rowValues[columns.startDate - 1] = parseDate_(data.startDate);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'endDate') && columns.endDate) {
        rowValues[columns.endDate - 1] = parseDate_(data.endDate);
      }
    }
    // 수행일지 1·2차와 보고서가 모두 들어오면 앱이 «보고서제출»을 함께 보낸다
    if (newStatus && columns.status) rowValues[columns.status - 1] = newStatus;
  });
  if (schedule) formatConsultationCells_(source, targetRow, columns);
  return targetRow;
}

/** 이미 등록된 기업의 서류 날짜만 고쳐 쓴다 (대시보드 서류 현황 편집용) */
function updateDocs_(data) {
  const companyName = cleanText_(data.companyName);
  if (!companyName) throw new Error('기업명이 필요합니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = writeDocumentRow_(book, companyName, data.docs || {});
    if (!result) throw new Error('서류 탭에서 «' + companyName + '» 행을 찾지 못했습니다.');
    // 수행일지처럼 컨설팅 일정과 묶인 서류는 일정까지 같은 요청에서 처리한다 (왕복 한 번으로)
    const scheduleRow = applyScheduleToSource_(book, companyName, data);
    return { company: companyName, docRow: result.row, wrote: result.wrote, scheduleRow: scheduleRow };
  } finally {
    lock.releaseLock();
  }
}

/** 코치 기준 서식8·9·10·통장사본을 훈련코치 탭에 기록한다. */
function updateCoachDocs_(data) {
  const coachName = cleanText_(data.coachName);
  if (!coachName) throw new Error('코치명이 필요합니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const result = writeCoachDocumentRow_(book, coachName, data.docs || {});
    if (!result) throw new Error('훈련코치 탭에서 «' + coachName + '» 코치 행을 찾지 못했습니다.');
    return { coach: coachName, coachRow: result.row, wrote: result.wrote };
  } finally {
    lock.releaseLock();
  }
}

/** 전달된 코치 서류 키만 수정한다. */
function writeCoachDocumentRow_(book, coachName, docs) {
  const sheet = book.getSheetByName(COACH_SHEET);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < COACH_FIRST_ROW) return null;
  const names = sheet
    .getRange(COACH_FIRST_ROW, 2, lastRow - COACH_FIRST_ROW + 1, 1)
    .getDisplayValues();
  let target = 0;
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === coachName) { target = COACH_FIRST_ROW + i; break; }
  }
  if (!target) return null;

  // H~K가 붙어 있으므로 한 번에 읽고 한 번에 쓴다 (칸마다 쓰면 그만큼 왕복한다)
  const wrote = [];
  const changed = COACH_DOCUMENT_COLUMNS.filter(function (def) {
    return Object.prototype.hasOwnProperty.call(docs, def.key);
  });
  if (!changed.length) return { row: target, wrote: wrote };
  const first = COACH_DOCUMENT_COLUMNS[0].col;
  const range = sheet.getRange(target, first, 1, COACH_DOCUMENT_COLUMNS.length);
  const values = range.getValues()[0];
  changed.forEach(function (def) {
    values[def.col - first] = docValue_(def, docs[def.key]);
    wrote.push(def.key);
  });
  range.setValues([values]);
  return { row: target, wrote: wrote };
}

/**
 * 서류 탭에서 해당 기업 행을 찾아 손으로 채우는 열만 기록한다.
 * 기업·코치 열은 수식이 만들어내므로 절대 건드리지 않는다.
 * docs에 들어 있는 키만 쓴다 — 빈 문자열을 보내면 그 칸을 비우겠다는 뜻이다.
 */
function writeDocumentRow_(book, companyName, docs) {
  const sheet = book.getSheetByName(DOCUMENT_SHEET);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < DOCUMENT_FIRST_ROW) return null;

  const names = sheet
    .getRange(DOCUMENT_FIRST_ROW, 4, lastRow - DOCUMENT_FIRST_ROW + 1, 1)
    .getDisplayValues();
  let target = 0;
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === companyName) { target = DOCUMENT_FIRST_ROW + i; break; }
  }
  if (!target) return null;

  /*
   * 손으로 채우는 열은 F~L, P~S 처럼 «붙어 있는 덩어리»로 나뉜다.
   * 덩어리 단위로 한 번에 읽고 한 번에 써서 왕복을 줄인다.
   * 사이에 낀 M·N·O·T는 수식 열이라 절대 건드리지 않는다.
   */
  const wrote = [];
  manualColumnRuns_().forEach(function (run) {
    const changed = run.filter(function (def) {
      return Object.prototype.hasOwnProperty.call(docs, def.key);
    });
    if (!changed.length) return;
    const first = run[0].col;
    const range = sheet.getRange(target, first, 1, run.length);
    const values = range.getValues()[0];
    changed.forEach(function (def) {
      values[def.col - first] = docValue_(def, docs[def.key]);
      wrote.push(def.key);
    });
    range.setValues([values]);
  });
  return { row: target, wrote: wrote };
}

/** 손으로 채우는 서류 열을 «붙어 있는 덩어리»로 묶는다 (F~L, P~S 같은 식) */
function manualColumnRuns_() {
  const sorted = DOCUMENT_MANUAL_COLUMNS.slice().sort(function (a, b) { return a.col - b.col; });
  const runs = [];
  sorted.forEach(function (def) {
    const last = runs.length ? runs[runs.length - 1] : null;
    if (last && def.col === last[last.length - 1].col + 1) last.push(def);
    else runs.push([def]);
  });
  return runs;
}

function docValue_(def, raw) {
  if (def.type === 'mark') return String(raw == null ? '' : raw).trim() ? 'O' : '';
  if (def.type === 'text') return cleanText_(raw);
  return parseDate_(raw);
}

/**
 * 마지막 행 바로 아래에 한 줄 추가. 윗행 서식을 그대로 물려받는다.
 * getRange는 시트 크기를 넘어서면 오류가 나므로, 행이 모자라면 미리 늘리고 열은 시트 폭에 맞춘다.
 */
function appendStyledRow_(sheet, values) {
  const maxColumns = sheet.getMaxColumns();
  const width = Math.min(values.length, maxColumns);
  const overflow = values.slice(width).filter(function (v) { return v !== '' && v != null; });
  if (overflow.length) {
    throw new Error(sheet.getName() + ' 탭에 열이 부족합니다 — ' + values.length + '개가 필요한데 ' + maxColumns + '개뿐입니다.');
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const targetRow = lastRow + 1;
  const maxRows = sheet.getMaxRows();
  if (targetRow > maxRows) sheet.insertRowsAfter(maxRows, targetRow - maxRows);

  if (lastRow > 1) {
    sheet.getRange(lastRow, 1, 1, width).copyTo(
      sheet.getRange(targetRow, 1, 1, width),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
  }
  sheet.getRange(targetRow, 1, 1, width).setValues([values.slice(0, width)]);
  return targetRow;
}

function columnLetter_(index) {
  let n = index, out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/*
 * yyyy-mm-dd 만 날짜로 인정한다.
 * new Date(2026, 1, 30) 은 오류가 아니라 3월 2일로 조용히 넘어가므로,
 * 만들어진 날짜가 입력한 연·월·일과 같은지 되짚어 «없는 날짜»를 걸러낸다.
 */
function parseDate_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = +match[1], month = +match[2], day = +match[3];
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const rolled = date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day;
  if (rolled) throw new Error('없는 날짜입니다: ' + match[0]);
  return date;
}

function cleanText_(value) {
  const text = String(value == null ? '' : value).trim();
  return /^[=+@]/.test(text) ? "'" + text : text;
}

function auditJson_(value) {
  if (value == null || value === '') return '';
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value); }
  catch (e) { text = String(value); }
  return text.length > 45000 ? text.slice(0, 45000) + '…' : text;
}

function auditPayloadAfter_(payload) {
  const out = {};
  Object.keys(payload || {}).forEach(function (key) {
    if (key.charAt(0) === '_') return;
    out[key] = payload[key];
  });
  return out;
}

function auditRecord_(action, payload, result, success, error) {
  const audit = payload && payload._audit ? payload._audit : {};
  const target = audit.target || payload.companyName || payload.originalCompanyName || payload.coachName || '공통';
  // 기업의 내부 담당자(payload.owner)와 실제 웹 작업자는 다를 수 있다.
  // 웹은 설정에 저장한 작업자 이름을 _audit.actor로 보내고, 없으면 «웹 사용자»로 남긴다.
  let actor = audit.actor || '';
  if (!actor) {
    try { actor = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  }
  return {
    requestId: payload._requestId || '',
    actor: actor || '웹 사용자',
    action: audit.type || action || 'UNKNOWN',
    target: target,
    detail: audit.detail || '',
    before: Object.prototype.hasOwnProperty.call(audit, 'before') ? audit.before : '',
    after: Object.prototype.hasOwnProperty.call(audit, 'after') ? audit.after : (success ? auditPayloadAfter_(payload) : ''),
    source: payload._source || 'web',
    success: !!success,
    error: error || '',
    result: result || null
  };
}

function ensureAuditSheet_(book) {
  let sheet = book.getSheetByName(AUDIT_SHEET);
  if (!sheet) sheet = book.insertSheet(AUDIT_SHEET);
  const current = sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).getDisplayValues()[0];
  const valid = AUDIT_HEADERS.every(function (header, index) { return current[index] === header; });
  if (!valid) {
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setValues([AUDIT_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, AUDIT_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function appendAuditLog_(record) {
  try {
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ensureAuditSheet_(book);
    const zone = book.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Seoul';
    sheet.appendRow([
      Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd HH:mm:ss'),
      cleanText_(record.requestId),
      cleanText_(record.actor),
      cleanText_(record.action),
      cleanText_(record.target),
      cleanText_(record.detail),
      auditJson_(record.before),
      auditJson_(record.after),
      cleanText_(record.source),
      record.success ? '성공' : '실패',
      cleanText_(record.error)
    ]);
    return true;
  } catch (error) {
    console.error('감사 로그 저장 실패', error);
    return false;
  }
}

function getAuditLogs_(limit) {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = book.getSheetByName(AUDIT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const count = limit === 'all'
    ? sheet.getLastRow() - 1
    : Math.min(limit || 100, sheet.getLastRow() - 1);
  const start = sheet.getLastRow() - count + 1;
  const rows = sheet.getRange(start, 1, count, AUDIT_HEADERS.length).getDisplayValues();
  return rows.reverse().map(function (row) {
    return {
      time: row[0], requestId: row[1], actor: row[2], type: row[3],
      target: row[4], detail: row[5], before: row[6], after: row[7],
      source: row[8], success: row[9] === '성공', error: row[10]
    };
  });
}

function auditTriggerStatus_() {
  const status = { editInstalled: false, changeInstalled: false, installedCount: 0 };
  let recorded = {};
  try {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      const handler = trigger.getHandlerFunction();
      if (handler === 'auditSheetEdit') status.editInstalled = true;
      if (handler === 'auditSheetChange') status.changeInstalled = true;
    });
  } catch (error) {
    status.error = error && error.message ? error.message : String(error);
  }
  try {
    recorded = JSON.parse(PropertiesService.getScriptProperties().getProperty(AUDIT_TRIGGER_PROPERTY) || '{}');
  } catch (error) {}
  // 웹 앱과 편집기 실행자의 «현재 사용자»가 다르면 getProjectTriggers()는 빈 배열을 돌려준다.
  // 그래서 설치 함수가 성공했을 때 남긴 스크립트 공용 기록을 함께 사용한다.
  status.editInstalled = status.editInstalled || recorded.editInstalled === true;
  status.changeInstalled = status.changeInstalled || recorded.changeInstalled === true;
  status.installedCount = (status.editInstalled ? 1 : 0) + (status.changeInstalled ? 1 : 0);
  status.installedAt = recorded.installedAt || '';
  status.lastEditAt = recorded.lastEditAt || '';
  status.lastChangeAt = recorded.lastChangeAt || '';
  status.detection = recorded.editInstalled || recorded.changeInstalled ? 'installation-record' : 'current-user';
  return status;
}

function isAuditedSheetName_(sheetName) {
  return !!sheetName && sheetName !== AUDIT_SHEET;
}

/**
 * 시트에서 사람이 직접 바꾼 셀과 행·열 구조 변경도 작업로그에 남긴다.
 * Apps Script 편집기에서 installAuditTrigger를 한 번 직접 실행해야 한다.
 */
function installAuditTrigger() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === 'auditSheetEdit' || handler === 'auditSheetChange') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('auditSheetEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('auditSheetChange').forSpreadsheet(book).onChange().create();
  ensureAuditSheet_(book);
  const zone = book.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Seoul';
  const installedAt = Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd HH:mm:ss');
  PropertiesService.getScriptProperties().setProperty(AUDIT_TRIGGER_PROPERTY, JSON.stringify({
    editInstalled: true,
    changeInstalled: true,
    installedAt: installedAt,
    lastEditAt: '',
    lastChangeAt: ''
  }));
  appendAuditLog_({
    requestId: 'trigger_install_' + Date.now(),
    actor: 'Apps Script 사용자',
    action: 'SETTING',
    target: AUDIT_SHEET,
    detail: '시트 셀 수정·행/열 구조 변경 감사 트리거 설치 완료',
    before: '',
    after: { auditSheetEdit: true, auditSheetChange: true, installedAt: installedAt },
    source: 'apps-script',
    success: true,
    error: ''
  });
  const message = 'auditSheetEdit + auditSheetChange 설치 완료 · ' + installedAt;
  console.log(message);
  return message;
}

function markAuditTriggerEvent_(field) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const record = JSON.parse(properties.getProperty(AUDIT_TRIGGER_PROPERTY) || '{}');
    const zone = Session.getScriptTimeZone() || 'Asia/Seoul';
    record[field] = Utilities.formatDate(new Date(), zone, 'yyyy-MM-dd HH:mm:ss');
    properties.setProperty(AUDIT_TRIGGER_PROPERTY, JSON.stringify(record));
  } catch (error) {
    console.error('감사 트리거 작동 시각 저장 실패', error);
  }
}

function auditSheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  if (!isAuditedSheetName_(sheetName)) return;
  markAuditTriggerEvent_('lastEditAt');

  let actor = '';
  try { actor = Session.getActiveUser().getEmail(); } catch (error) {}
  const after = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1
    ? e.range.getDisplayValue()
    : e.range.getDisplayValues();
  appendAuditLog_({
    requestId: 'sheet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    actor: actor || '시트 사용자',
    action: 'SHEET_EDIT',
    target: sheetName + '!' + e.range.getA1Notation(),
    detail: e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 ? '셀 직접 수정' : '범위 직접 수정',
    before: Object.prototype.hasOwnProperty.call(e, 'oldValue') ? e.oldValue : '',
    after: after,
    source: 'sheet',
    success: true,
    error: ''
  });
}

function auditSheetChange(e) {
  if (!e || !e.source || e.changeType === 'EDIT') return;
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet ? sheet.getName() : '';
  if (!isAuditedSheetName_(sheetName)) return;
  markAuditTriggerEvent_('lastChangeAt');
  const labels = {
    INSERT_ROW: '행 추가', REMOVE_ROW: '행 삭제',
    INSERT_COLUMN: '열 추가', REMOVE_COLUMN: '열 삭제',
    INSERT_GRID: '시트 추가', REMOVE_GRID: '시트 삭제',
    FORMAT: '서식 변경', OTHER: '기타 구조 변경'
  };
  let actor = '';
  try { actor = Session.getActiveUser().getEmail(); } catch (error) {}
  const changeType = e.changeType || 'OTHER';
  appendAuditLog_({
    requestId: 'sheet_change_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    actor: actor || '시트 사용자',
    action: 'SHEET_CHANGE',
    target: sheetName || '스프레드시트',
    detail: labels[changeType] || changeType,
    before: '',
    after: { changeType: changeType, sheet: sheetName },
    source: 'sheet',
    success: true,
    error: ''
  });
}

function response_(value, e) {
  const json = JSON.stringify(value);
  const callback = e && e.parameter && e.parameter.callback;
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
