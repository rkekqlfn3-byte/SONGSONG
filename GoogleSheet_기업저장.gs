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
 */

const VERSION = '2026-07-26k';

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
  { key: 'employeeCount',    header: '근로자수',        type: 'number' },
  { key: 'workplaceNumber',  header: '사업장 관리번호', type: 'text' },
  { key: 'companyAddress',   header: '주소',            type: 'text' },
  { key: 'agencyBranch',     header: '공단지사',        type: 'text' },
  { key: 'hrd4uId',          header: 'HRD4U ID',        type: 'text' }
];

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
  try {
    const action = e && e.parameter ? e.parameter.action : '';
    if (action === 'ping') return response_({ ok: true, message: 'ready', version: VERSION }, e);
    if (action === 'diag') return response_({ ok: true, version: VERSION, sheets: diag_() }, e);
    if (action === 'setupFormulas') return response_({ ok: true, version: VERSION, applied: setupFormulas_() }, e);

    const payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');

    if (action === 'updateDocs') {
      const updated = updateDocs_(payload);
      return response_({ ok: true, company: updated.company, docRow: updated.docRow, wrote: updated.wrote }, e);
    }
    if (action === 'updateCoachDocs') {
      const updated = updateCoachDocs_(payload);
      return response_({ ok: true, coach: updated.coach, coachRow: updated.coachRow, wrote: updated.wrote }, e);
    }
    if (action === 'updateCompany') {
      const updated = updateCompany_(payload);
      return response_({ ok: true, company: updated.company, row: updated.row, docRow: updated.docRow }, e);
    }
    if (action !== 'addCompany') throw new Error('지원하지 않는 요청입니다.');

    const result = addCompany_(payload);
    return response_({ ok: true, company: result.company, row: result.row, docRow: result.docRow }, e);
  } catch (error) {
    return response_({ ok: false, error: error && error.message ? error.message : String(error) }, e);
  }
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
    const extraHeaders = {
      visitOwner: '담당',
      visitDate: '일자',
      visitTime: '시간'
    };
    COMPANY_INFO_COLUMNS.concat(CONSULTATION_COLUMNS).forEach(function (def) {
      extraHeaders[def.key] = def.header;
    });
    Object.keys(extraHeaders).forEach(function (key) {
      const index = sourceHeader.indexOf(extraHeaders[key]);
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
  const missing = definitions.filter(function (def) { return headers.indexOf(def.header) < 0; });
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

function writeConsultationCells_(sheet, row, columns, schedule) {
  CONSULTATION_COLUMNS.forEach(function (def) {
    if (!columns[def.key]) return;
    const cell = sheet.getRange(row, columns[def.key]);
    cell.setValue(schedule[def.key]);
    if (def.type === 'date') cell.setNumberFormat('MM/dd ddd');
  });
  const latest = schedule.latestVisit;
  if (columns.visitOwner) sheet.getRange(row, columns.visitOwner).setValue(latest ? latest.owner : '');
  if (columns.visitDate) {
    const cell = sheet.getRange(row, columns.visitDate);
    cell.setValue(latest ? latest.date : '');
    cell.setNumberFormat('MM/dd ddd');
  }
  if (columns.visitTime) sheet.getRange(row, columns.visitTime).setValue(latest ? latest.time : '');
}

function sourceWidth_(columns) {
  return Object.keys(columns).reduce(function (max, key) {
    return Math.max(max, columns[key]);
  }, 0);
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
    Object.keys(companyInfo).forEach(function (key) {
      row[columns[key] - 1] = companyInfo[key];
    });
    if (schedule) setConsultationRowValues_(row, columns, schedule);

    const insertedRow = appendStyledRow_(source, row);
    if (schedule) writeConsultationCells_(source, insertedRow, columns, schedule);
    SpreadsheetApp.flush();   // 수식이 서류 탭에 새 행을 만들 때까지 기다린다

    const written = writeDocumentRow_(book, companyName, data.docs || {});
    SpreadsheetApp.flush();

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
    if (!hasScheduleFlag || scheduleChanged) {
      values.startDate = parseDate_(data.startDate);
      values.endDate = parseDate_(data.endDate);
    }
    Object.keys(values).forEach(function (key) {
      source.getRange(targetRow, columns[key]).setValue(values[key]);
    });
    if (schedule) writeConsultationCells_(source, targetRow, columns, schedule);
    SpreadsheetApp.flush();

    let written = writeDocumentRow_(book, companyName, data.docs || {});
    if (!written && companyName !== originalName) {
      written = writeDocumentRow_(book, originalName, data.docs || {});
    }
    SpreadsheetApp.flush();
    return { company: companyName, row: targetRow, docRow: written ? written.row : null };
  } finally {
    lock.releaseLock();
  }
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
    SpreadsheetApp.flush();
    return { company: companyName, docRow: result.row, wrote: result.wrote };
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
    SpreadsheetApp.flush();
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

  const wrote = [];
  COACH_DOCUMENT_COLUMNS.forEach(function (def) {
    if (!Object.prototype.hasOwnProperty.call(docs, def.key)) return;
    sheet.getRange(target, def.col).setValue(docValue_(def, docs[def.key]));
    wrote.push(def.key);
  });
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

  const wrote = [];
  DOCUMENT_MANUAL_COLUMNS.forEach(function (def) {
    if (!Object.prototype.hasOwnProperty.call(docs, def.key)) return;
    sheet.getRange(target, def.col).setValue(docValue_(def, docs[def.key]));
    wrote.push(def.key);
  });
  return { row: target, wrote: wrote };
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

function parseDate_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(+match[1], +match[2] - 1, +match[3], 12, 0, 0) : '';
}

function cleanText_(value) {
  const text = String(value == null ? '' : value).trim();
  return /^[=+@]/.test(text) ? "'" + text : text;
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
