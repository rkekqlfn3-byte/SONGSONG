/* ============================================================
   13. 기업 추가 — 입력 창과 시트 저장
   ============================================================ */
const COMPANY_DIALOG = $('#companyDialog');
const COMPANY_FORM = $('#companyForm');
const COMPANY_STATE = $('#companyState');
let companyReturnFocus = null;
let companyEditTarget = null;
let companyScheduleEdited = false;
let companySaving = false;
let agencyBranchManuallySelected = false;
let agencyBranchAutoValue = '';
let agencySuggestionTimer = 0;
const COMPANY_STEPS = ['basic', 'schedule', 'docs'];
const OPTIONAL_COMPANY_FIELDS = [
  'newOwner', 'newCoach', 'newContactName', 'newContactTitle',
  'newContactPhone', 'newContactEmail', 'newEmployeeCount', 'newWorkplaceNumber',
  'newCompanyAddress', 'newAgencyBranch', 'newHrd4uId', 'newMemo',
  'newConsult1Date', 'newConsult2Date',
];

function setCompanyState(message, tone) {
  COMPANY_STATE.textContent = message || '';
  COMPANY_STATE.className = 'company-state' + (message ? ` show ${tone || ''}` : '');
}
function fieldHasValue(id) {
  const box = $('#' + id);
  return !!box && (box.type === 'checkbox' ? box.checked : !!box.value.trim());
}
function setCompanyFormStep(step, focusFirst) {
  const next = COMPANY_STEPS.includes(step) ? step : 'basic';
  COMPANY_FORM.querySelectorAll('.company-form-tab').forEach(button => {
    const active = button.dataset.companyStep === next;
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  COMPANY_FORM.querySelectorAll('.company-step-panel').forEach(panel => {
    panel.hidden = panel.dataset.companyStepPanel !== next;
  });
  if (next === 'docs') $('#companyDocs').open = true;
  const body = $('.company-body', COMPANY_FORM);
  if (body) body.scrollTop = 0;
  if (focusFirst) {
    const panel = $(`[data-company-step-panel="${next}"]`, COMPANY_FORM);
    const first = panel && $('input:not([type="hidden"]):not([readonly]):not([disabled]),select:not([disabled])', panel);
    if (first) requestAnimationFrame(() => first.focus());
  }
}
function companyDocProgress() {
  let done = 0;
  for (const def of DOC_DEFS) {
    const box = docInput(def.k);
    if (!box) continue;
    const hasValue = box.type === 'checkbox' ? box.checked : !!box.value.trim();
    if (hasValue) done++;
  }
  return { done, total: DOC_DEFS.length };
}
function updateCompanyFormProgress() {
  const requiredIds = ['newStatus', 'newCompanyName'];
  const requiredDone = requiredIds.filter(fieldHasValue).length;
  const optionalMissing = OPTIONAL_COMPANY_FIELDS.filter(id => !fieldHasValue(id)).length;
  const scheduleDone = ['newConsult1Date', 'newConsult2Date'].filter(fieldHasValue).length;
  const docs = companyDocProgress();
  $('#companyBasicCount').textContent = `필수 ${requiredDone}/${requiredIds.length}`;
  $('#companyScheduleCount').textContent = `${scheduleDone}/2`;
  $('#companyDocsCount').textContent = `${docs.done}/${docs.total}`;
  const basicTab = $('#companyTabBasic');
  const scheduleTab = $('#companyTabSchedule');
  const docsTab = $('#companyTabDocs');
  basicTab.classList.toggle('is-required-missing', requiredDone < requiredIds.length);
  scheduleTab.classList.toggle('is-incomplete', scheduleDone < 2);
  docsTab.classList.toggle('is-incomplete', docs.done < docs.total);
  const progress = $('#companyProgress');
  const validationErrors = COMPANY_FORM.querySelectorAll('[aria-invalid="true"]').length;
  progress.classList.toggle('required-missing', requiredDone < requiredIds.length);
  progress.classList.toggle('has-errors', validationErrors > 0);
  progress.innerHTML = `<strong>필수 ${requiredDone}/${requiredIds.length}</strong><span class="sep" aria-hidden="true"></span>` +
    `<span>${validationErrors ? `입력 오류 ${validationErrors}개` : `선택 ${optionalMissing}개 비어 있음`}</span>`;
  $('#companySave').disabled = companySaving || requiredDone < requiredIds.length || validationErrors > 0;
}
function populateCompanyChoices() {
  const owners = uniq(state.M.companies.map(c => c.owner).concat(state.M.coaches.map(c => c.owner)));
  const ownerOptions = owners.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  $('#newOwner').innerHTML = '<option value="">미배정</option>' + ownerOptions;
  for (const id of ['#newConsult1Owner', '#newConsult2Owner']) {
    $(id).innerHTML = '<option value="">선택하세요</option>' + ownerOptions;
  }
  const coaches = [...state.M.coaches].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  $('#newCoach').innerHTML = '<option value="">미배정</option>' +
    coaches.map(coach => `<option value="${esc(coach.name)}">${esc(coach.name)}</option>`).join('');
  $('#newAgencyBranch').innerHTML = '<option value="">선택하세요</option>' +
    AGENCY_BRANCHES.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
}
function setChoiceValue(select, value) {
  const next = String(value || '').trim();
  if (next && ![...select.options].some(option => option.value === next)) {
    const option = document.createElement('option');
    option.value = next;
    option.textContent = `${next} · 기존값`;
    select.appendChild(option);
  }
  select.value = next;
}
function setAgencyBranchHint(message, tone) {
  const hint = $('#agencyBranchHint');
  hint.textContent = message;
  hint.className = 'field-hint' + (tone ? ` ${tone}` : '');
}
function syncAgencyBranchField() {
  if (typeof syncSearchableSelects === 'function') syncSearchableSelects($('#newAgencyBranch'));
  updateCompanyFormProgress();
}
function applyAgencyBranchSuggestion(force) {
  clearTimeout(agencySuggestionTimer);
  const branch = $('#newAgencyBranch');
  const address = $('#newCompanyAddress').value.trim();
  if (force) agencyBranchManuallySelected = false;

  if (agencyBranchManuallySelected && !force) {
    setAgencyBranchHint(
      branch.value
        ? `${branch.value} 직접 선택됨 · 주소로 다시 찾으려면 ‘주소로 찾기’를 누르세요.`
        : '공단지사를 직접 비워두었습니다 · 자동 추천은 ‘주소로 찾기’를 누르세요.',
      'manual'
    );
    return null;
  }

  const suggestion = suggestAgencyBranch(address);
  if (suggestion) {
    setChoiceValue(branch, suggestion.branch);
    agencyBranchAutoValue = suggestion.branch;
    agencyBranchManuallySelected = false;
    syncAgencyBranchField();
    setAgencyBranchHint(`${suggestion.area} 주소 기준으로 ${suggestion.branch}를 선택했습니다.`, 'ready');
    return suggestion;
  }

  if (agencyBranchAutoValue && branch.value === agencyBranchAutoValue) branch.value = '';
  agencyBranchAutoValue = '';
  syncAgencyBranchField();
  setAgencyBranchHint(
    address
      ? '주소에서 관할 지사를 확인하지 못했습니다. 직접 선택하거나 ‘주소로 찾기’를 다시 눌러주세요.'
      : '주소를 입력하면 관할 지사를 자동으로 추천합니다.',
    address ? 'warn' : ''
  );
  return null;
}
function queueAgencyBranchSuggestion() {
  clearTimeout(agencySuggestionTimer);
  agencySuggestionTimer = setTimeout(() => applyAgencyBranchSuggestion(false), 240);
}
function resetAgencyBranchAutomation(company) {
  clearTimeout(agencySuggestionTimer);
  const branch = $('#newAgencyBranch');
  const existing = String(branch.value || '').trim();
  agencyBranchAutoValue = '';
  agencyBranchManuallySelected = !!company && !!existing;
  if (agencyBranchManuallySelected) {
    setAgencyBranchHint(`${existing} 저장값을 유지합니다. 주소 기준으로 바꾸려면 ‘주소로 찾기’를 누르세요.`, 'manual');
  } else if ($('#newCompanyAddress').value.trim()) {
    applyAgencyBranchSuggestion(false);
  } else {
    setAgencyBranchHint('주소를 입력하면 관할 지사를 자동으로 추천합니다.', '');
  }
}
function markAgencyBranchManual() {
  agencyBranchManuallySelected = true;
  agencyBranchAutoValue = '';
  const value = $('#newAgencyBranch').value;
  setAgencyBranchHint(
    value
      ? `${value} 직접 선택됨 · 주소가 바뀌어도 자동으로 덮어쓰지 않습니다.`
      : '공단지사를 직접 비워두었습니다 · 자동 추천은 ‘주소로 찾기’를 누르세요.',
    'manual'
  );
}
function syncVisitControls(index, markEdited) {
  const checked = $(`#newConsult${index}Visit`).checked;
  const owner = $(`#newConsult${index}Owner`);
  const hint = $(`#newConsult${index}OwnerHint`);
  owner.disabled = !checked;
  if (checked && !owner.value && $('#newOwner').value) owner.value = $('#newOwner').value;
  hint.textContent = checked ? '동행할 내부 담당자를 선택하세요.' : '동행 체크 시 선택할 수 있습니다.';
  hint.classList.toggle('ready', checked);
  if (typeof syncSearchableSelects === 'function') syncSearchableSelects(owner);
  if (markEdited) companyScheduleEdited = true;
  updateCompanyFormProgress();
}
function fillConsultationFields(company) {
  const year = getBaseYear();
  const items = company ? company.consultations : [{}, {}];
  items.forEach((item, i) => {
    const index = i + 1;
    const fallback = i === 0 && company ? company.start : null;
    const rawDate = item.date || fallback;
    $(`#newConsult${index}Date`).value = rawDate ? mdWithYear(rawDate, year) : (item.dateRaw || '');
    $(`#newConsult${index}Time`).value = item.time || '';
    $(`#newConsult${index}Visit`).checked = !!item.visit;
    $(`#newConsult${index}Owner`).value = item.owner || '';
    syncVisitControls(index, false);
  });
  const note = $('#legacyVisitNote');
  const latest = company && company.latestVisit;
  if (latest && (latest.owner || latest.dateRaw || latest.time)) {
    note.textContent = `현재 시트 최근 방문: ${latest.date ? korDate(latest.date) : (latest.dateRaw || '일자 미정')} ${latest.time || ''} · ${latest.owner || '담당자 미정'}`;
    note.classList.add('show');
  } else {
    note.textContent = '';
    note.classList.remove('show');
  }
  companyScheduleEdited = false;
}
function consultationFormValues(year) {
  return [1, 2].map(index => {
    const date = monthDayToDate($(`#newConsult${index}Date`).value, year);
    const visit = $(`#newConsult${index}Visit`).checked;
    return {
      index,
      date,
      dateText: $(`#newConsult${index}Date`).value.trim(),
      time: $(`#newConsult${index}Time`).value,
      visit,
      owner: visit ? $(`#newConsult${index}Owner`).value : '',
    };
  });
}
const docFieldId = def => 'newDoc_' + def.k;
const docInput = k => $('#' + docFieldId(byDocKey(k)));

/** 서류 탭 15개 열을 단계별 입력 칸으로 — DOC_DEFS가 유일한 기준이라 열이 바뀌면 폼도 같이 따라간다 */
function buildCompanyDocFields() {
  $('#companyDocFields').innerHTML = STAGES.map(stage => {
    const fields = DOC_DEFS.filter(d => d.stage === stage).map(docFieldHtml).join('');
    return `<div class="doc-stage"><h4>${esc(stage)}</h4><div class="company-fields">${fields}</div></div>`;
  }).join('');
  docInput('teamStart').oninput = syncTeamEnd;   // 종료일은 시작일에 붙어 따라온다
}
function docFieldHtml(d) {
  const id = docFieldId(d);
  const locked = docLocked(d) || d.type === 'auto';
  if (d.type === 'mark' && !locked) {
    return `<div class="company-field check">
      <input type="checkbox" id="${id}">
      <label for="${id}">${esc(d.label)}</label>
    </div>`;
  }
  const note = d.byCoach ? '코치 공통 · 서류현황에서 수정'
    : d.type === 'auto' ? '시작일 +28일 자동'
    : d.type === 'range' ? '월/일 ~ 12/31'
    : '월/일';
  const box = `<input type="text" id="${id}" inputmode="numeric" autocomplete="off"
    placeholder="${locked ? '자동 입력' : '예: 6/22'}"${locked ? ' readonly tabindex="-1"' : ''}>`;
  return `<div class="company-field">
    <label for="${id}">${esc(d.label)}<span class="auto">${note}</span></label>
    ${d.type === 'range' ? `<div class="md-range">${box}<span class="md-suffix">~ 12/31</span></div>` : box}
  </div>`;
}

/** 약정 종료일 = 약정 시작일 + 28일. 사람이 고칠 수 없는 계산값이라 dataset에 실제 날짜를 남긴다 */
function syncTeamEnd() {
  const year = getBaseYear();
  const start = monthDayToDate(docInput('teamStart').value, year);
  const end = start ? addDays(start, 28) : null;
  const box = docInput('teamEnd');
  box.value = mdWithYear(end, year);
  box.dataset.iso = end ? iso(end) : '';
}

function updateCoachContact(options = {}) {
  const coach = state.M.coaches.find(c => c.name === $('#newCoach').value);
  const override = $('#coachContactOverride');
  if (options.resetOverride) override.checked = false;
  if (!override.checked || options.useMaster) {
    $('#newCoachEmail').value = coach ? coach.email : '';
    $('#newCoachPhone').value = coach ? coach.phone : '';
  }
  $('#newCoachEmail').readOnly = !override.checked;
  $('#newCoachPhone').readOnly = !override.checked;
  override.disabled = !coach && !override.checked;
  $('#coachContactHelp').textContent = override.checked
    ? '이 기업에만 별도 연락처를 저장합니다. 코치 기본 정보는 바뀌지 않습니다.'
    : coach
      ? '훈련코치 탭의 연락처를 사용합니다. 기본 정보 변경은 훈련코치 탭에서 수정하세요.'
      : '훈련코치를 선택하면 코치 탭의 연락처가 자동 입력됩니다.';
  // 동의서 3종·통장사본은 코치 공통값 — 기업 기본정보 폼에서는 현재 상태만 보여준다
  const year = getBaseYear();
  for (const d of DOC_DEFS) {
    if (!d.byCoach) continue;
    const raw = coach ? coach[d.byCoach] : '';
    const box = docInput(d.k);
    if (d.type === 'mark') { box.value = filled(raw) ? 'O' : ''; box.dataset.iso = ''; continue; }
    const date = toDate(raw);
    box.value = mdWithYear(date, year);
    box.dataset.iso = date ? iso(date) : '';
  }
  updateCompanyFormProgress();
}

function setCompanyDialogMode(editing) {
  $('#companyDialogEyebrow').textContent = editing ? 'EDIT COMPANY' : 'NEW COMPANY';
  $('#companyDialogTitle').textContent = editing ? '기업 정보 수정' : '기업 추가';
  $('#companyDialogSub').textContent = editing
    ? '변경한 내용을 Google Sheet와 대시보드에 함께 반영합니다.'
    : '등록하면 Google Sheet와 대시보드에 함께 반영됩니다.';
  $('#companySave').textContent = editing ? '변경사항 저장' : 'Google Sheet에 저장';
}

function fillCompanyDocFields(company) {
  for (const d of DOC_DEFS) {
    const box = docInput(d.k);
    const raw = company.docs[d.k];
    if (d.type === 'mark') {
      if (box.type === 'checkbox') box.checked = filled(raw);
      else box.value = filled(raw) ? 'O' : '';
      continue;
    }
    box.value = docCellText(raw);
    if (box.readOnly) {
      const date = toDate(raw);
      box.dataset.iso = date ? iso(date) : '';
    }
  }
}

function openCompanyDialog() {
  companyReturnFocus = document.activeElement;
  companyEditTarget = null;
  setCompanyDialogMode(false);
  COMPANY_FORM.reset();
  clearCompanyFieldValidations();
  populateCompanyChoices();
  $('#newStatus').value = '검토요청';
  fillConsultationFields(null);
  $('#coachContactOverride').checked = false;
  $('#companyDocs').open = true;
  COMPANY_FORM.querySelectorAll('.bad').forEach(box => box.classList.remove('bad'));
  updateCoachContact({ useMaster: true });
  syncTeamEnd();
  setCompanyFormStep('basic');
  updateCompanyFormProgress();
  resetAgencyBranchAutomation(null);
  if (typeof syncSearchableSelects === 'function') syncSearchableSelects(COMPANY_FORM);
  setCompanyState(`${getBaseYear()}년 기준 · 날짜는 6/22 처럼 월/일만 적으면 됩니다.`, 'ok');
  COMPANY_DIALOG.classList.add('open');
  COMPANY_DIALOG.setAttribute('aria-hidden', 'false');
  rememberCompanyForm();
  requestAnimationFrame(() => $('#newCompanyName').focus());
}

function openCompanyEditDialog(company) {
  companyReturnFocus = document.activeElement;
  companyEditTarget = company;
  setCompanyDialogMode(true);
  COMPANY_FORM.reset();
  clearCompanyFieldValidations();
  populateCompanyChoices();
  $('#newStatus').value = company.status;
  $('#newOwner').value = company.owner;
  $('#newCoach').value = company.coachName;
  $('#newCompanyName').value = company.name;
  $('#newContactName').value = company.contact.name;
  $('#newContactTitle').value = company.contact.title;
  $('#newContactPhone').value = company.contact.phone;
  $('#newContactEmail').value = company.contact.email;
  $('#newMemo').value = company.memo || '';
  const workplace = company.workplace || {};
  $('#newEmployeeCount').value = workplace.employeeCount || '';
  $('#newWorkplaceNumber').value = workplace.managementNumber || '';
  $('#newCompanyAddress').value = workplace.address || '';
  setChoiceValue($('#newAgencyBranch'), workplace.agencyBranch);
  $('#newHrd4uId').value = workplace.hrd4uId || '';
  fillConsultationFields(company);
  fillCompanyDocFields(company);
  const coach = state.M.coaches.find(c => c.name === company.coachName);
  const masterEmail = coach ? String(coach.email || '').trim() : '';
  const masterPhone = coach ? String(coach.phone || '').trim() : '';
  const savedEmail = String(company.coachEmail || '').trim();
  const savedPhone = String(company.coachPhone || '').trim();
  const contactDiffers = !!(savedEmail || savedPhone) && (savedEmail !== masterEmail || savedPhone !== masterPhone);
  $('#coachContactOverride').checked = contactDiffers;
  $('#newCoachEmail').value = contactDiffers ? savedEmail : masterEmail;
  $('#newCoachPhone').value = contactDiffers ? savedPhone : masterPhone;
  updateCoachContact({ useMaster: !contactDiffers });
  syncTeamEnd();
  $('#companyDocs').open = true;
  setCompanyFormStep('basic');
  updateCompanyFormProgress();
  resetAgencyBranchAutomation(company);
  if (typeof syncSearchableSelects === 'function') syncSearchableSelects(COMPANY_FORM);
  COMPANY_FORM.querySelectorAll('.bad').forEach(box => box.classList.remove('bad'));
  setCompanyState(`${company.name} 정보를 수정합니다. 날짜는 6/22처럼 월/일로 입력하세요.`, 'ok');
  COMPANY_DIALOG.classList.add('open');
  COMPANY_DIALOG.setAttribute('aria-hidden', 'false');
  rememberCompanyForm();
  requestAnimationFrame(() => $('#newStatus').focus());
}
/**
 * 잘못 등록한 기업을 «신청취소»로 돌린다.
 * 행을 지우지 않으므로 기록은 남고, 진행 중 집계·마감 관리에서는 빠진다.
 * 되돌리려면 수정 창에서 진행현황만 다시 바꾸면 된다.
 */
async function cancelCompany(company) {
  if (!company) return false;
  if (company.status === '신청취소') { toast(`${company.name} — 이미 신청취소 상태입니다.`); return false; }
  const before = company.status;

  const ok = confirm(
    `«${company.name}» 을(를) 신청취소로 바꿉니다.\n\n` +
    `· 목록과 시트에는 그대로 남습니다\n` +
    `· 진행 중 건수·마감 관리에서는 빠집니다\n` +
    `· 되돌리려면 수정에서 진행현황만 바꾸면 됩니다\n\n계속할까요?`
  );
  if (!ok) return false;

  const endpoint = writeEndpoint();
  const consult = company.consultations || [{}, {}];
  const payload = {
    originalCompanyName: company.name,
    companyName: company.name,
    status: '신청취소',
    owner: company.owner || '',
    contactName: company.contact.name || '',
    contactTitle: company.contact.title || '',
    contactPhone: company.contact.phone || '',
    contactEmail: company.contact.email || '',
    employeeCount: (company.workplace && company.workplace.employeeCount) || '',
    workplaceNumber: (company.workplace && company.workplace.managementNumber) || '',
    companyAddress: (company.workplace && company.workplace.address) || '',
    agencyBranch: (company.workplace && company.workplace.agencyBranch) || '',
    hrd4uId: (company.workplace && company.workplace.hrd4uId) || '',
    startDate: company.start ? iso(company.start) : '',
    endDate: company.end ? iso(company.end) : '',
    coachName: company.coachName || '',
    coachEmail: company.coachEmail || '',
    coachPhone: company.coachPhone || '',
    scheduleChanged: false,          // 일정 열은 건드리지 않는다
    _audit: {
      type: 'CANCEL',
      target: company.name,
      detail: `진행현황 ${before} → 신청취소`,
      tone: 'warn',
      before: { status: before },
      after: { status: '신청취소' }
    }
  };

  toast(`${company.name} 신청취소 처리 중…`);
  try {
    await requestSheetWrite(endpoint, 'updateCompany', payload);
    company.status = '신청취소';
    render();
    toastUndo(`${company.name} — 신청취소 처리됨`, () => restoreCompanyStatus(company, before));
    return true;
  } catch (e) {
    console.error(e);
    toast('신청취소 실패 — ' + (e.message || '저장 연결을 확인하세요'));
    return false;
  }
}
/** 신청취소를 되돌린다 — 바꾸기 전 진행현황으로 */
async function restoreCompanyStatus(company, status) {
  try {
    await requestSheetWrite(writeEndpoint(), 'updateCompany', {
      originalCompanyName: company.name,
      companyName: company.name,
      status: status || '검토요청',
      owner: company.owner || '',
      contactName: company.contact.name || '',
      contactTitle: company.contact.title || '',
      contactPhone: company.contact.phone || '',
      contactEmail: company.contact.email || '',
      employeeCount: (company.workplace && company.workplace.employeeCount) || '',
      workplaceNumber: (company.workplace && company.workplace.managementNumber) || '',
      companyAddress: (company.workplace && company.workplace.address) || '',
      agencyBranch: (company.workplace && company.workplace.agencyBranch) || '',
      hrd4uId: (company.workplace && company.workplace.hrd4uId) || '',
      startDate: company.start ? iso(company.start) : '',
      endDate: company.end ? iso(company.end) : '',
      coachName: company.coachName || '',
      coachEmail: company.coachEmail || '',
      coachPhone: company.coachPhone || '',
      scheduleChanged: false,
      _audit: {
        type: 'RESTORE',
        target: company.name,
        detail: `신청취소 → ${status || '검토요청'}`,
        tone: 'info',
        before: { status: '신청취소' },
        after: { status: status || '검토요청' }
      }
    });
    company.status = status;
    render();
    toast(`${company.name} — ${status}(으)로 되돌림`);
  } catch (e) {
    console.error(e);
    toast('되돌리기 실패 — ' + (e.message || '저장 연결을 확인하세요'));
  }
}

/**
 * 창을 열 때의 입력 상태를 기억해 두고, 닫을 때 달라졌는지 비교한다.
 * 세 탭을 다 채운 뒤 바깥을 잘못 눌러 전부 날아가는 일을 막는다.
 */
let companyFormSnapshot = '';
function companyFormFingerprint() {
  return [...COMPANY_FORM.querySelectorAll('input, select, textarea')]
    .map(box => (box.type === 'checkbox' || box.type === 'radio') ? (box.checked ? '1' : '0') : box.value)
    .join('');
}
function rememberCompanyForm() { companyFormSnapshot = companyFormFingerprint(); }
function companyFormDirty() {
  return COMPANY_DIALOG.classList.contains('open') && companyFormFingerprint() !== companyFormSnapshot;
}

const COMPANY_VALIDATION_IDS = [
  'newCompanyName', 'newContactPhone', 'newContactEmail', 'newEmployeeCount',
  'newWorkplaceNumber', 'newCoachEmail', 'newCoachPhone',
  'newConsult1Date', 'newConsult2Date'
];

function companyValidationMessage(box) {
  const value = String(box.value || '').trim();
  if (box.id === 'newCompanyName') {
    if (!value) return '기업명은 반드시 입력해주세요.';
    if (state.M.companies.some(company => company !== companyEditTarget && company.name.trim() === value)) {
      return '같은 기업명이 이미 등록되어 있습니다.';
    }
  }
  if (box.id === 'newContactEmail' || box.id === 'newCoachEmail') {
    if (value && box.validity.typeMismatch) return '이메일 형식을 확인해주세요. 예: name@company.com';
  }
  if (box.id === 'newContactPhone' || box.id === 'newCoachPhone') {
    const digits = value.replace(/\D/g, '');
    if (value && (!/^[+\d()\-\s]+$/.test(value) || digits.length < 9 || digits.length > 13)) {
      return '전화번호는 숫자와 하이픈으로 입력해주세요.';
    }
  }
  if (box.id === 'newEmployeeCount' && value) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) return '근로자 수는 0 이상의 정수로 입력해주세요.';
  }
  if (box.id === 'newWorkplaceNumber' && value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 11) return '사업장 관리번호 11자리를 확인해주세요.';
  }
  if (box.id === 'newConsult1Date' || box.id === 'newConsult2Date') {
    const date = value ? monthDayToDate(value, getBaseYear()) : null;
    if (value && !date) return '6/22처럼 월/일 형식으로 입력해주세요.';
    const first = monthDayToDate($('#newConsult1Date').value, getBaseYear());
    const second = monthDayToDate($('#newConsult2Date').value, getBaseYear());
    if (box.id === 'newConsult2Date' && first && second && second < first) {
      return '2차 컨설팅일은 1차 컨설팅일보다 빠를 수 없습니다.';
    }
  }
  return '';
}

function paintCompanyFieldValidation(box, message) {
  const host = box && box.closest('.company-field');
  if (!host) return;
  let note = host.querySelector(`.field-validation[data-for="${box.id}"]`);
  if (!note) {
    note = document.createElement('span');
    note.className = 'field-validation';
    note.dataset.for = box.id;
    note.setAttribute('aria-live', 'polite');
    host.appendChild(note);
  }
  box.classList.toggle('bad', !!message);
  box.setAttribute('aria-invalid', message ? 'true' : 'false');
  note.textContent = message;
  note.classList.toggle('show', !!message);
  note.classList.toggle('bad', !!message);
  updateCompanyFormProgress();
}

function validateCompanyField(box) {
  if (!box || !COMPANY_VALIDATION_IDS.includes(box.id) || box.disabled || box.readOnly) return true;
  const message = companyValidationMessage(box);
  paintCompanyFieldValidation(box, message);
  return !message;
}

function validateCompanyFormFields() {
  let firstInvalid = null;
  COMPANY_VALIDATION_IDS.forEach(id => {
    const box = $('#' + id);
    if (!validateCompanyField(box) && !firstInvalid) firstInvalid = box;
  });
  return firstInvalid;
}

function clearCompanyFieldValidations() {
  COMPANY_FORM.querySelectorAll('.field-validation').forEach(note => note.remove());
  COMPANY_FORM.querySelectorAll('[aria-invalid="true"]').forEach(box => box.setAttribute('aria-invalid', 'false'));
  COMPANY_FORM.querySelectorAll('.bad').forEach(box => box.classList.remove('bad'));
}

/** force: true 는 저장이 끝난 뒤처럼 물어볼 필요가 없을 때 쓴다 */
function closeCompanyDialog(options) {
  const wasOpen = COMPANY_DIALOG.classList.contains('open');
  if (wasOpen && !(options && options.force) && companyFormDirty()) {
    const label = companyEditTarget ? '수정 중인 내용' : '입력 중인 내용';
    if (!confirm(`${label}이 있습니다.\n저장하지 않고 닫으면 사라집니다.\n\n닫을까요?`)) return false;
  }
  COMPANY_DIALOG.classList.remove('open');
  COMPANY_DIALOG.setAttribute('aria-hidden', 'true');
  if (wasOpen && companyReturnFocus && document.contains(companyReturnFocus)) companyReturnFocus.focus();
  return true;
}
/** 서류 입력 칸 → { 컬럼키: 값 }. 날짜는 yyyy-mm-dd, O 표시는 'O', 약정기간은 '시작 ~ 12/31' */
function collectDocValues() {
  const year = getBaseYear();
  const yearEnd = new Date(year, 11, 31);
  const out = {};
  for (const d of DOC_DEFS) {
    if (docLocked(d)) continue;                 // 수식이 채우는 열은 보내지 않는다
    const box = docInput(d.k);
    if (d.type === 'mark') { out[d.k] = box.checked ? 'O' : ''; continue; }
    if (box.dataset.iso !== undefined && box.readOnly) { out[d.k] = box.dataset.iso; continue; }
    const date = monthDayToDate(box.value, year);
    out[d.k] = !date ? ''
      : d.type === 'range' ? `${iso(date)} ~ ${iso(yearEnd)}`
      : iso(date);
  }
  return out;
}

/**
 * 서류 날짜 검사 — 형식이 먼저, 그 다음 순서.
 * 컨설팅 신청서 ≤ 표준 협약서 ≤ 약정서 작성일 ≤ 약정기간 ≤ 약정 시작일
 */
function validateDocDates(year) {
  for (const d of DOC_DEFS) {
    if (d.type !== 'date' && d.type !== 'range') continue;
    if (d.byCoach) continue;
    const box = docInput(d.k);
    if (box.value.trim() && !monthDayToDate(box.value, year)) {
      return { box, message: `${d.label} — 6/22 처럼 월/일로 적어주세요.` };
    }
  }
  let prev = null;
  for (const d of DOC_DEFS.filter(x => x.order).sort((a, b) => a.order - b.order)) {
    const box = docInput(d.k);
    const date = monthDayToDate(box.value, year);
    if (!date) continue;                       // 비워둔 항목은 순서 검사에서 건너뛴다
    if (prev && date < prev.date) {
      return { box, message: `${d.label}(${md(date)})은 ${prev.label}(${md(prev.date)})보다 빠를 수 없습니다.` };
    }
    prev = { date, label: d.label };
  }
  return null;
}
/** 문제가 된 칸을 붉게 표시하고 포커스 — 다시 입력하면 표시가 풀린다 */
function markBadField(box, message) {
  box.classList.add('bad');
  if (message) paintCompanyFieldValidation(box, message);
  box.focus();
  box.addEventListener('input', () => {
    box.classList.remove('bad');
    if (message) paintCompanyFieldValidation(box, '');
  }, { once: true });
}
function setCompanyBusy(busy) {
  companySaving = busy;
  const save = $('#companySave');
  save.textContent = busy
    ? (companyEditTarget ? '변경사항 저장 중…' : '시트에 저장 중…')
    : (companyEditTarget ? '변경사항 저장' : 'Google Sheet에 저장');
  $('#companyCancel').disabled = busy;
  updateCompanyFormProgress();
}
async function saveCompany() {
  const liveInvalid = validateCompanyFormFields();
  if (liveInvalid) {
    const panel = liveInvalid.closest('[data-company-step-panel]');
    setCompanyFormStep(panel ? panel.dataset.companyStepPanel : 'basic');
    setCompanyState(companyValidationMessage(liveInvalid), 'bad');
    requestAnimationFrame(() => liveInvalid.focus());
    return;
  }
  if (!COMPANY_FORM.checkValidity()) {
    const invalid = COMPANY_FORM.querySelector(':invalid');
    const panel = invalid && invalid.closest('[data-company-step-panel]');
    setCompanyFormStep(panel ? panel.dataset.companyStepPanel : 'basic');
    requestAnimationFrame(() => invalid ? invalid.reportValidity() : COMPANY_FORM.reportValidity());
    return;
  }
  const companyName = $('#newCompanyName').value.trim();
  if (state.M.companies.some(c => c !== companyEditTarget && c.name.trim() === companyName)) {
    setCompanyState('같은 기업명이 이미 등록되어 있습니다. 기업명을 확인하세요.', 'bad');
    setCompanyFormStep('basic');
    $('#newCompanyName').focus();
    return;
  }
  const year = getBaseYear();
  const consultations = consultationFormValues(year);
  for (const item of consultations) {
    const dateBox = $(`#newConsult${item.index}Date`);
    if (item.dateText && !item.date) {
      setCompanyState(`${item.index}차 컨설팅일 — 6/22 처럼 월/일로 적어주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(dateBox);
      return;
    }
    if (item.time && !item.date) {
      setCompanyState(`${item.index}차 컨설팅 시간을 입력하려면 날짜도 선택해주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(dateBox);
      return;
    }
    if (item.visit && !item.date) {
      setCompanyState(`${item.index}차 동행을 체크하려면 컨설팅일을 입력해주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(dateBox);
      return;
    }
    if (item.visit && !item.owner) {
      const ownerBox = $(`#newConsult${item.index}Owner`);
      setCompanyState(`${item.index}차 동행 담당자를 선택해주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(ownerBox);
      return;
    }
  }
  if (consultations[0].date && consultations[1].date && consultations[1].date < consultations[0].date) {
    setCompanyState('2차 컨설팅일은 1차 컨설팅일보다 빠를 수 없습니다.', 'bad');
    setCompanyFormStep('schedule');
    markBadField($('#newConsult2Date'));
    return;
  }
  const docProblem = validateDocDates(year);
  if (docProblem) {
    setCompanyFormStep('docs');
    $('#companyDocs').open = true;
    setCompanyState(docProblem.message, 'bad');
    markBadField(docProblem.box);
    return;
  }
  const firstDate = consultations[0].date;
  const startDate = firstDate ? iso(firstDate) : '';
  const endDate = firstDate ? iso(addDays(firstDate, 28)) : '';
  const endpoint = writeEndpoint();
  const payload = {
    originalCompanyName: companyEditTarget ? companyEditTarget.name : '',
    status: $('#newStatus').value,
    owner: $('#newOwner').value,
    companyName,
    contactName: $('#newContactName').value.trim(),
    contactTitle: $('#newContactTitle').value.trim(),
    contactPhone: $('#newContactPhone').value.trim(),
    contactEmail: $('#newContactEmail').value.trim(),
    memo: $('#newMemo').value.trim(),
    employeeCount: $('#newEmployeeCount').value.trim(),
    workplaceNumber: $('#newWorkplaceNumber').value.trim(),
    companyAddress: $('#newCompanyAddress').value.trim(),
    agencyBranch: $('#newAgencyBranch').value.trim(),
    hrd4uId: $('#newHrd4uId').value.trim(),
    startDate,
    endDate,
    coachName: $('#newCoach').value,
    coachEmail: $('#newCoachEmail').value.trim(),
    coachPhone: $('#newCoachPhone').value.trim(),
    scheduleChanged: !companyEditTarget || companyScheduleEdited,
    consult1Date: iso(consultations[0].date),
    consult1Time: consultations[0].time,
    consult1Visit: consultations[0].visit ? 'O' : '',
    consult1Owner: consultations[0].owner,
    consult2Date: iso(consultations[1].date),
    consult2Time: consultations[1].time,
    consult2Visit: consultations[1].visit ? 'O' : '',
    consult2Owner: consultations[1].owner,
    docs: collectDocValues(),
  };
  setCompanyBusy(true);
  setCompanyState(`${companyName} 정보를 Google Sheet에 ${companyEditTarget ? '반영' : '저장'}하고 있습니다…`, '');
  try {
    const wasEditing = !!companyEditTarget;
    const oldName = companyEditTarget ? companyEditTarget.name : '';
    payload._audit = {
      type: wasEditing ? 'EDIT' : 'ADD',
      target: companyName,
      detail: wasEditing
        ? `기업 정보 및 일정 수정 완료 (${payload.status})`
        : `새 기업 신규 등록 완료 (${payload.status})`,
      tone: wasEditing ? 'info' : 'ok',
      before: wasEditing ? {
        companyName: oldName,
        status: companyEditTarget.status,
        owner: companyEditTarget.owner,
        coachName: companyEditTarget.coachName,
        contact: companyEditTarget.contact,
        workplace: companyEditTarget.workplace,
        memo: companyEditTarget.memo || '',
        startDate: companyEditTarget.start ? iso(companyEditTarget.start) : '',
        endDate: companyEditTarget.end ? iso(companyEditTarget.end) : '',
        consultations: companyEditTarget.consultations
      } : '',
      after: {
        companyName: payload.companyName,
        status: payload.status,
        owner: payload.owner,
        coachName: payload.coachName,
        contactName: payload.contactName,
        contactTitle: payload.contactTitle,
        contactPhone: payload.contactPhone,
        contactEmail: payload.contactEmail,
        employeeCount: payload.employeeCount,
        workplaceNumber: payload.workplaceNumber,
        companyAddress: payload.companyAddress,
        agencyBranch: payload.agencyBranch,
        hrd4uId: payload.hrd4uId,
        memo: payload.memo,
        startDate: payload.startDate,
        endDate: payload.endDate,
        consult1Date: payload.consult1Date,
        consult1Time: payload.consult1Time,
        consult1Visit: payload.consult1Visit,
        consult1Owner: payload.consult1Owner,
        consult2Date: payload.consult2Date,
        consult2Time: payload.consult2Time,
        consult2Visit: payload.consult2Visit,
        consult2Owner: payload.consult2Owner
      }
    };
    await requestSheetWrite(endpoint, wasEditing ? 'updateCompany' : 'addCompany', payload);
    if (wasEditing && oldName !== companyName && twoWeekExtensions[oldName]) {
      twoWeekExtensions[companyName] = true;
      delete twoWeekExtensions[oldName];
      try { localStorage.setItem(EXTENSION_KEY, JSON.stringify(twoWeekExtensions)); } catch {}
    }
    closeCompanyDialog({ force: true });        // 저장이 끝났으니 다시 묻지 않는다
    const synced = await syncFromSheet(localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL, { silent: true, reason: 'after-write' });
    if (synced) {
      go('comp', { q: companyName, status: '', owner: '', coach: '' });
      toast(`${companyName} ${wasEditing ? '수정' : '등록'} 완료`);
    } else {
      toast(`시트 ${wasEditing ? '수정' : '저장'} 완료 — 잠시 후 동기화 버튼을 눌러주세요.`);
    }
  } catch (e) {
    console.error(e);
    setCompanyState('저장 실패 — ' + (e.message || '저장 연결을 확인하세요.'), 'bad');
  } finally {
    setCompanyBusy(false);
  }
}
