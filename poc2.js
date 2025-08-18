// Demo client for MAX Bridge BiometricManager + optional backend methods (schema.json)
const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');
const sysEl = $('#sys');
const envPill = $('#env-pill');
const bridgePill = $('#bridge-pill');
const methodsEl = $('#methods');

const MODAL = $('#modal');
$('#settingsBtn').onclick = () => MODAL.style.display = 'flex';
$('#closeModal').onclick = () => MODAL.style.display = 'none';
$('#clearLog').onclick = () => { logEl.textContent = ''; };

// Try to load optional config.json (for backend demo)
let cfg = {};
try { cfg = await fetch('/config.json').then(r => r.json()); } catch {}
envPill.textContent = cfg.API_BASE_URL ? ((cfg.API_BASE_URL||'').includes('/mock') ? 'ENV: mock' : 'ENV: live') : 'ENV: –';

// MAX Bridge presence
const WebApp = window.WebApp;
bridgePill.textContent = WebApp ? 'bridge: present' : 'bridge: none';

// Load schema of optional backend methods (kept for extensibility)
let schema = { methods: [], flow: [] };
try { schema = await fetch('./schema.json').then(r => r.json()); } catch {}
renderMethods(schema);

// Settings load/save
const settings = JSON.parse(localStorage.getItem('biometricDemoSettings') || '{}');
$('#apiBase').value = settings.apiBase || cfg.API_BASE_URL || '';
$('#bearer').value = settings.bearer || '';
$('#userId').value = settings.userId || '';
$('#queryId').value = settings.queryId || '';

$('#saveSettings').onclick = () => {
  const s = {
    apiBase: $('#apiBase').value.trim(),
    bearer: $('#bearer').value.trim(),
    userId: $('#userId').value.trim(),
    queryId: $('#queryId').value.trim(),
  };
  localStorage.setItem('biometricDemoSettings', JSON.stringify(s));
  MODAL.style.display = 'none';
  addLog('Настройки сохранены.');
};

$('#runFlowBtn').onclick = async () => {
  await runFullBiometricFlow();
};

function addLog(line) {
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function showSys() {
  sysEl.innerHTML = '';
  const brState = getBmState();
  sysEl.innerText = JSON.stringify({
    userAgent: navigator.userAgent,
    bridgePresent: !!WebApp,
    bmState: brState
  }, null, 2);
}
showSys();

function getSettings() {
  const s = JSON.parse(localStorage.getItem('biometricDemoSettings') || '{}');
  return {
    apiBase: s.apiBase || cfg.API_BASE_URL || '',
    bearer: s.bearer || '',
    userId: s.userId || '',
    queryId: s.queryId || (WebApp?.initDataUnsafe?.query_id || WebApp?.initData?.query_id || ''),
  };
}

/* =====================
   MAX BiometricManager
   ===================== */
function bm() {
  const obj = WebApp?.BiometricManager;
  if (!obj) addLog('❗ BiometricManager недоступен (нет window.WebApp)');
  return obj;
}
function getBmState() {
  const o = bm();
  if (!o) return null;
  // Read known fields if exist
  const state = {};
  ['isInited','isBiometricAvailable','biometricType','deviceId','isAccessRequested','isAccessGranted','isBiometricTokenSaved']
    .forEach(k => { try { state[k] = o[k]; } catch { state[k] = undefined; } });
  return state;
}
async function refreshBmState() {
  const st = getBmState();
  $('#bm-state').textContent = JSON.stringify(st, null, 2);
  showSys();
}

// Helper to await if Promise-like
async function callMaybeAsync(fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return await r;
    }
    return r;
  } catch (e) {
    throw e;
  }
}

// Wire buttons
$('#bm-init').onclick = async () => {
  if (!bm()) return;
  try {
    await callMaybeAsync(() => bm().init());
    addLog('✅ BiometricManager.init() вызван');
  } catch (e) {
    addLog('❌ init() ошибка: ' + String(e));
  }
  await refreshBmState();
};

$('#bm-request-access').onclick = async () => {
  if (!bm()) return;
  try {
    const res = await callMaybeAsync(() => bm().requestAccess());
    addLog('✅ requestAccess() → ' + JSON.stringify(res));
  } catch (e) {
    addLog('❌ requestAccess() ошибка: ' + String(e));
  }
  await refreshBmState();
};

$('#bm-update-token').onclick = async () => {
  if (!bm()) return;
  const token = $('#bm-token').value;
  try {
    const res = await callMaybeAsync(() => bm().updateBiometricToken(token));
    addLog('✅ updateBiometricToken(' + JSON.stringify(token) + ') → ' + JSON.stringify(res));
  } catch (e) {
    addLog('❌ updateBiometricToken() ошибка: ' + String(e));
  }
  await refreshBmState();
};

$('#bm-auth').onclick = async () => {
  if (!bm()) return;
  const reason = $('#bm-reason').value;
  try {
    // Some bridges may accept a message/label; if not, call without args
    let res;
    try {
      res = await callMaybeAsync(() => reason ? bm().authenticate(reason) : bm().authenticate());
    } catch (inner) {
      // Retry w/o args if first form unsupported
      res = await callMaybeAsync(() => bm().authenticate());
    }
    addLog('✅ authenticate() → ' + JSON.stringify(res));
  } catch (e) {
    addLog('❌ authenticate() ошибка: ' + String(e));
  }
  await refreshBmState();
};

$('#bm-open-settings').onclick = async () => {
  if (!bm()) return;
  try {
    await callMaybeAsync(() => bm().openSettings());
    addLog('ℹ️ openSettings() вызван (клиент может закрыть мини-приложение)');
  } catch (e) {
    addLog('❌ openSettings() ошибка: ' + String(e));
  }
  await refreshBmState();
};

$('#bm-refresh').onclick = refreshBmState;
await refreshBmState();

/* =====================
   Optional backend demo
   ===================== */
function renderMethods(schema) {
  methodsEl.innerHTML = '';
  if (!schema.methods?.length) return;

  const title = document.createElement('div');
  title.className = 'row';
  title.innerHTML = '<div style="font-weight:600;">Серверные методы (пример)</div><span class="small">Нажимайте кнопку, чтобы выполнить вызов.</span>';
  methodsEl.appendChild(title);
  methodsEl.appendChild(document.createElement('div')).className='divider';

  schema.methods.forEach(m => {
    const card = document.createElement('div');
    card.className = 'method-card';
    card.innerHTML = `
      <div class="method row" style="justify-content: space-between;">
        <div>
          <div><span class="kbd">${m.http.toUpperCase()}</span> <b>${m.name}</b> <span class="tag">${m.path}</span></div>
          <div class="small muted">${m.desc || ''}</div>
        </div>
        <div class="row">
          ${m.requires?.includes('queryId') ? '<span class="pill">requires: queryId</span>' : ''}
          ${m.requires?.includes('bearer') ? '<span class="pill">requires: bearer</span>' : ''}
        </div>
      </div>
    `;

    const form = document.createElement('form');
    form.onsubmit = (e) => e.preventDefault();

    (m.params || []).forEach(p => {
      const field = document.createElement('div');
      field.className = 'param';
      field.innerHTML = `
        <label>${p.name} ${p.required ? '*' : ''}</label>
        ${p.type === 'select'
          ? `<select name="${p.name}">${(p.options||[]).map(o => `<option value="${o}">${o}</option>`).join('')}</select>`
          : p.type === 'textarea'
            ? `<textarea name="${p.name}" rows="3" placeholder="${p.placeholder||''}"></textarea>`
            : `<input name="${p.name}" placeholder="${p.placeholder||''}" value="${p.default??''}" />`
        }
        <div class="tag">${p.location||'body'} · ${p.type||'text'}</div>
      `;
      form.appendChild(field);
    });

    const row = document.createElement('div'); row.className = 'row';
    const callBtn = document.createElement('button');
    callBtn.className = 'btn primary'; callBtn.textContent = 'Вызвать метод';
    callBtn.onclick = async () => {
      const res = await callBackendMethod(m, Object.fromEntries(new FormData(form).entries()));
      if (res.ok) {
        addLog(`✅ ${m.name} ok: ` + JSON.stringify(res.data));
      } else {
        addLog(`❌ ${m.name} error: ` + JSON.stringify(res.error));
      }
    };
    row.appendChild(callBtn);
    form.appendChild(row);

    card.appendChild(form);
    card.appendChild(document.createElement('div')).className='divider';
    methodsEl.appendChild(card);
  });
}

function getHeaders(m, s) {
  const headers = { 'content-type': 'application/json' };
  if (m.requires?.includes('bearer') && s.bearer) headers['authorization'] = 'Bearer ' + s.bearer;
  if (m.requires?.includes('queryId')) {
    if (m.queryIdAs === 'header') headers['x-query-id'] = s.queryId;
  }
  return headers;
}

async function callBackendMethod(m, values) {
  const s = getSettings();
  if (!s.apiBase) return { ok:false, error: { message: 'API Base URL не задан (Настройки)' } };

  let path = m.path;
  for (const [k,v] of Object.entries(values)) {
    path = path.replace(new RegExp(':'+k+'\\b','g'), encodeURIComponent(v));
    path = path.replace(new RegExp('{'+k+'}','g'), encodeURIComponent(v));
  }

  const url = new URL(s.apiBase.replace(/\/$/, '') + path);
  const headers = getHeaders(m, s);
  if (m.requires?.includes('queryId') && m.queryIdAs === 'query') url.searchParams.set('queryId', s.queryId);

  (m.params||[]).filter(p => p.location==='query').forEach(p => {
    if (values[p.name] !== undefined && values[p.name] !== '') url.searchParams.set(p.name, values[p.name]);
  });

  let bodyObj = {};
  (m.params||[]).filter(p => (p.location||'body')==='body').forEach(p => {
    if (values[p.name] !== undefined && values[p.name] !== '') {
      if ((p.type==='textarea' || p.type==='json') && typeof values[p.name] === 'string') {
        try { bodyObj[p.name] = JSON.parse(values[p.name]); }
        catch { bodyObj[p.name] = values[p.name]; }
      } else {
        bodyObj[p.name] = values[p.name];
      }
    }
  });

  const init = { method: (m.http||'GET').toUpperCase(), headers };
  if (!['GET','HEAD'].includes(init.method)) init.body = JSON.stringify(bodyObj);

  const started = performance.now();
  try {
    const resp = await fetch(url.toString(), init);
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    const ms = Math.round(performance.now() - started);

    return resp.ok
      ? { ok:true, data, meta:{ status:resp.status, ms } }
      : { ok:false, error:{ status:resp.status, data }, meta:{ ms } };
  } catch (e) {
    return { ok:false, error:{ message: String(e) } };
  }
}

async function runFullBiometricFlow() {
  // Recommended order
  await $('#bm-init').onclick();
  await $('#bm-request-access').onclick();
  // Developer should set token after server-side exchange; here we use the field content
  await $('#bm-update-token').onclick();
  await $('#bm-auth').onclick();
}
