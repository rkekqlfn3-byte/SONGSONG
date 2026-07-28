/* ============================================================
   14. 잠금 화면과 사용자 관리

   이 프로그램의 자료는 모두 시트 쪽 스크립트 한 곳을 거쳐 오간다.
   그래서 문도 그 한 곳에만 세우면 된다. 여기서는
   «암호를 받아 지문으로 바꿔 저장하는 일»과 «관리자의 사용자 관리»만 맡는다.

   암호 원문은 이 브라우저 밖으로 나가지 않는다.
   ============================================================ */

let authGateOpen = false;

/** 잠금 화면을 띄운다. 맞는 암호를 넣을 때까지 화면을 덮는다 */
function openAuthGate(message) {
  if (authGateOpen) {
    if (message) setAuthGateMessage(message, 'bad');
    return;
  }
  authGateOpen = true;
  // 잠금 뒤에 예전 자료가 남아 보이지 않게 화면도 비운다
  if (typeof showDataPlaceholder === 'function' && !storedAuthKey()) {
    showDataPlaceholder('암호를 넣으면 자료를 불러옵니다.', '');
  }
  const back = document.createElement('div');
  back.className = 'auth-gate';
  back.id = 'authGate';
  back.innerHTML = `
    <form class="auth-box" id="authForm">
      <div class="auth-mark">🔒</div>
      <h2>AI훈련로드맵 운영 콘솔</h2>
      <p class="auth-sub">이어서 쓰려면 암호를 넣어주세요.</p>
      <label class="auth-field">
        <span>암호</span>
        <input type="password" id="authPassword" autocomplete="current-password">
      </label>
      <div class="auth-state" id="authState" role="status" aria-live="polite"></div>
      <button class="btn primary" type="submit" id="authSubmit">들어가기</button>
      <p class="auth-note">암호는 이 브라우저에만 기억됩니다. 다음부터는 묻지 않습니다.</p>
    </form>`;
  document.body.appendChild(back);
  if (message) setAuthGateMessage(message, 'bad');

  const input = back.querySelector('#authPassword');
  const button = back.querySelector('#authSubmit');
  back.querySelector('#authForm').onsubmit = async event => {
    event.preventDefault();
    const password = input.value;
    if (!password) { setAuthGateMessage('암호를 넣어주세요.', 'bad'); input.focus(); return; }
    button.disabled = true;
    setAuthGateMessage('확인하는 중…', '');
    try {
      const key = await makeAuthKey(password);
      const res = await verifyAuthKey(key);
      saveAuth(key, res.name, res.role);
      input.value = '';
      closeAuthGate();
      // 들어오자마자 최신 자료를 받아온다
      syncFromSheet(localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL,
        { silent: true, saveEndpoint: true, reason: 'auth' });
    } catch (error) {
      setAuthGateMessage(error.message || '암호가 맞지 않습니다.', 'bad');
      input.select();
      input.focus();
    } finally {
      button.disabled = false;
    }
  };
  requestAnimationFrame(() => input.focus());
}

function setAuthGateMessage(text, tone) {
  const box = document.getElementById('authState');
  if (!box) return;
  box.textContent = text || '';
  box.className = 'auth-state' + (tone ? ` ${tone}` : '');
}

function closeAuthGate() {
  const back = document.getElementById('authGate');
  if (back) back.remove();
  authGateOpen = false;
}

/** 지문 하나를 시트에 물어본다. 맞으면 이름과 등급이 돌아온다 */
function verifyAuthKey(key) {
  const url = new URL(writeEndpoint());
  const callback = `authcb_${Math.random().toString(36).slice(2)}`;
  url.searchParams.set('action', 'auth');
  url.searchParams.set('key', key);
  url.searchParams.set('callback', callback);
  url.searchParams.set('_', Date.now());
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const clear = () => {
      clearTimeout(timer);
      script.remove();
      try { delete window[callback]; } catch { window[callback] = undefined; }
    };
    const timer = setTimeout(() => {
      clear();
      reject(new Error('연결이 오래 걸립니다. 잠시 뒤 다시 해주세요.'));
    }, 20000);
    window[callback] = response => {
      clear();
      if (!response || response.ok !== true) {
        reject(new Error((response && response.error) || '암호가 맞지 않습니다.'));
        return;
      }
      resolve(response);
    };
    script.onerror = () => {
      clear();
      reject(new Error('저장용 주소에 연결하지 못했습니다.'));
    };
    script.src = url.href;
    document.head.appendChild(script);
  });
}

/** 시작할 때 — 열쇠가 없으면 잠금 화면, 있으면 조용히 확인만 한다 */
async function initAuthGate() {
  const key = storedAuthKey();
  if (!key) { openAuthGate(''); return false; }
  try {
    const res = await verifyAuthKey(key);
    saveAuth(key, res.name, res.role);
    return true;
  } catch (error) {
    // 연결이 안 되는 것과 암호가 틀린 것은 다르다.
    // 잠깐 끊겼다고 쫓아내면 곤란하므로, 암호 문제일 때만 잠근다
    if (/맞지 않|필요/.test(error.message || '')) {
      clearAuth();
      openAuthGate(error.message);
      return false;
    }
    return true;
  }
}

/* ------------------------------------------------------------
   사용자 관리 — 관리자 계정만 보인다
   ------------------------------------------------------------ */
async function openAccountManager() {
  if (!isMasterAccount()) return;
  const host = document.getElementById('accountManager');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = '<div class="account-loading">사용자 목록을 불러오는 중…</div>';
  try {
    const res = await requestSheetWrite(writeEndpoint(), 'listAccounts', {});
    paintAccountManager(res.accounts || []);
  } catch (error) {
    host.innerHTML = `<div class="account-error">${esc(error.message || '목록을 불러오지 못했습니다.')}</div>`;
  }
}

function accountDateText(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? esc(String(value)) : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function paintAccountManager(accounts) {
  const host = document.getElementById('accountManager');
  if (!host) return;
  const me = storedAuthName();
  host.innerHTML = `
    <div class="account-head"><h3>쓸 수 있는 사람 ${accounts.length}명</h3></div>
    <div class="account-list">
      ${accounts.map(a => `
        <div class="account-row">
          <div class="account-name">${esc(a.name)}${a.name === me ? '<em>나</em>' : ''}
            <span class="account-role${a.role === 'master' ? ' is-master' : ''}">${a.role === 'master' ? '관리자' : '일반'}</span>
          </div>
          <div class="account-meta">등록 ${accountDateText(a.createdAt)} · 마지막 사용 ${accountDateText(a.lastUsed)}</div>
          <div class="account-actions">
            <button type="button" class="btn" data-account-key="${esc(a.name)}">암호 바꾸기</button>
            <button type="button" class="btn account-danger" data-account-del="${esc(a.name)}"${a.name === me ? ' disabled' : ''}>지우기</button>
          </div>
        </div>`).join('')}
    </div>
    <form class="account-add" id="accountAddForm">
      <h3>사람 추가</h3>
      <div class="account-add-fields">
        <label><span>이름</span><input type="text" id="accountNewName" maxlength="40" placeholder="예: 이성희"></label>
        <label><span>암호</span><input type="password" id="accountNewKey" autocomplete="new-password" placeholder="8자 이상"></label>
        <label><span>등급</span>
          <select id="accountNewRole" data-searchable="off">
            <option value="user">일반 — 화면만 사용</option>
            <option value="master">관리자 — 사람 추가·삭제 가능</option>
          </select>
        </label>
      </div>
      <div class="account-state" id="accountState" role="status" aria-live="polite"></div>
      <button class="btn primary" type="submit">추가</button>
    </form>`;

  host.querySelectorAll('[data-account-del]').forEach(btn => {
    btn.onclick = () => removeAccountFlow(btn.dataset.accountDel);
  });
  host.querySelectorAll('[data-account-key]').forEach(btn => {
    btn.onclick = () => changeAccountKeyFlow(btn.dataset.accountKey);
  });
  host.querySelector('#accountAddForm').onsubmit = async event => {
    event.preventDefault();
    const name = host.querySelector('#accountNewName').value.trim();
    const password = host.querySelector('#accountNewKey').value;
    const role = host.querySelector('#accountNewRole').value;
    if (!name) { setAccountState('이름을 적어주세요.', 'bad'); return; }
    if (password.length < 8) { setAccountState('암호는 8자 이상으로 정해주세요.', 'bad'); return; }
    setAccountState('추가하는 중…', '');
    try {
      const newKey = await makeAuthKey(password);
      const res = await requestSheetWrite(writeEndpoint(), 'addAccount', { name, newKey, role });
      paintAccountManager(res.accounts || []);
      setAccountState(`${name} 님을 추가했습니다. 그분에게 암호를 알려주세요.`, 'ok');
    } catch (error) {
      setAccountState(error.message || '추가하지 못했습니다.', 'bad');
    }
  };
}

function setAccountState(text, tone) {
  const box = document.getElementById('accountState');
  if (!box) return;
  box.textContent = text || '';
  box.className = 'account-state' + (tone ? ` ${tone}` : '');
}

async function removeAccountFlow(name) {
  if (!confirm(`${name} 님을 지우면 그분은 더 이상 들어올 수 없습니다.\n지울까요?`)) return;
  try {
    const res = await requestSheetWrite(writeEndpoint(), 'removeAccount', { name });
    paintAccountManager(res.accounts || []);
    setAccountState(`${name} 님을 지웠습니다.`, 'ok');
  } catch (error) {
    setAccountState(error.message || '지우지 못했습니다.', 'bad');
  }
}

async function changeAccountKeyFlow(name) {
  const password = prompt(`${name} 님의 새 암호를 넣어주세요. (8자 이상)`);
  if (password == null) return;
  const trimmed = password.trim();
  if (trimmed.length < 8) { setAccountState('암호는 8자 이상으로 정해주세요.', 'bad'); return; }
  try {
    const newKey = await makeAuthKey(trimmed);
    const res = await requestSheetWrite(writeEndpoint(), 'changeAccountKey', { name, newKey });
    paintAccountManager(res.accounts || []);
    const mine = name === storedAuthName();
    if (mine) saveAuth(newKey, name, 'master');   // 내 암호를 바꿨으면 이 브라우저도 새 열쇠로
    setAccountState(`${name} 님의 암호를 바꿨습니다.${mine ? '' : ' 그분에게 새 암호를 알려주세요.'}`, 'ok');
  } catch (error) {
    setAccountState(error.message || '바꾸지 못했습니다.', 'bad');
  }
}

/** 설정창을 열 때 — 지금 누구로 쓰고 있는지, 관리자면 사용자 관리까지 */
function paintAuthSection() {
  const who = document.getElementById('authWho');
  if (who) {
    const name = storedAuthName();
    who.innerHTML = name
      ? `<b>${esc(name)}</b> 님으로 사용 중${isMasterAccount() ? ' <span class="account-role is-master">관리자</span>' : ''}`
      : '';
  }
  const manager = document.getElementById('accountManager');
  if (!manager) return;
  if (isMasterAccount()) openAccountManager();
  else { manager.hidden = true; manager.innerHTML = ''; }
}
