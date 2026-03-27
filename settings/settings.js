import { STORAGE_KEYS, MESSAGE_TYPES, DEFAULT_PROVIDER, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, DEFAULT_TARGET_COUNTRIES, DEFAULT_MODELS, PROVIDER_MODELS, DEFAULT_CUSTOM_RULES, DEFAULT_STACK_KEYWORDS } from '../shared/constants.js';

const API_KEY_LINKS = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  zai: 'https://z.ai',
  custom: null,
};

let sidebarItems, tabPanes, profileEl, userHourlyRateEl, userFixedMinEl, userFixedMaxEl, customPromptEl;
let apiKeyEl, toggleKeyBtn, apiKeyLink, customUrlEl, customUrlRow;
let modelSelect, modelStatus, refreshModelsBtn, refreshIcon;
let weightRulesEl, weightLlmEl, weightRulesVal, weightLlmVal;
let maxProposalsEl, hourlyMinEl, hourlyMaxEl, fixedMinEl, fixedMaxEl;
let countriesList, newCountryEl, addCountryBtn;
let saveStatus, resetBtn, resetUsageBtn, logEnabledEl, clearLogBtn, logList;
let rulesList, addRuleBtn, resetRulesBtn;
let optimizationEnabledEl, keywordsList, newKeywordEl, addKeywordBtn;
let totalTokenCostEl, totalApiCallsEl;

// Settings states
let currentProvider = DEFAULT_PROVIDER;
let targetCountries = [...DEFAULT_TARGET_COUNTRIES];
let stackKeywords = [...DEFAULT_STACK_KEYWORDS];
let customRules = JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES));
let storedModels = {};

function initDOMRefs() {
  sidebarItems = document.querySelectorAll('.sidebar-nav li');
  tabPanes = document.querySelectorAll('.tab-pane');

  profileEl = document.getElementById('profile-bio');
  userHourlyRateEl = document.getElementById('user-hourly-rate');
  userFixedMinEl = document.getElementById('user-fixed-min');
  userFixedMaxEl = document.getElementById('user-fixed-max');
  customPromptEl = document.getElementById('custom-prompt');

  apiKeyEl = document.getElementById('api-key');
  toggleKeyBtn = document.getElementById('toggle-key');
  apiKeyLink = document.getElementById('api-key-link');
  customUrlEl = document.getElementById('custom-url');
  customUrlRow = document.querySelector('.custom-url-row');
  modelSelect = document.getElementById('model-select');
  modelStatus = document.getElementById('model-status');
  refreshModelsBtn = document.getElementById('refresh-models-btn');
  refreshIcon = document.getElementById('refresh-icon');

  weightRulesEl = document.getElementById('weight-rules');
  weightLlmEl = document.getElementById('weight-llm');
  weightRulesVal = document.getElementById('weight-rules-val');
  weightLlmVal = document.getElementById('weight-llm-val');

  maxProposalsEl = document.getElementById('max-proposals');
  hourlyMinEl = document.getElementById('hourly-min');
  hourlyMaxEl = document.getElementById('hourly-max');
  fixedMinEl = document.getElementById('fixed-min');
  fixedMaxEl = document.getElementById('fixed-max');

  countriesList = document.getElementById('countries-list');
  newCountryEl = document.getElementById('new-country');
  addCountryBtn = document.getElementById('add-country-btn');

  saveStatus = document.getElementById('save-status');
  resetBtn = document.getElementById('reset-btn');
  resetUsageBtn = document.getElementById('reset-usage-btn');
  
  totalTokenCostEl = document.getElementById('totalTokenCost');
  totalApiCallsEl = document.getElementById('totalApiCalls');

  logEnabledEl = document.getElementById('log-enabled');
  clearLogBtn = document.getElementById('clear-log-btn');
  logList = document.getElementById('log-list');

  rulesList = document.getElementById('rules-list');
  addRuleBtn = document.getElementById('add-rule-btn');
  resetRulesBtn = document.getElementById('reset-rules-btn');

  optimizationEnabledEl = document.getElementById('optimization-enabled');
  keywordsList = document.getElementById('keywords-list');
  newKeywordEl = document.getElementById('new-keyword');
  addKeywordBtn = document.getElementById('add-keyword-btn');
}

function setupThemeLogic() {
  const savedTheme = localStorage.getItem('ujm-theme');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');

  const setLight = () => {
    document.documentElement.removeAttribute('data-theme');
    if (themeIcon) themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    if (themeText) themeText.textContent = 'Dark Mode';
  };
  const setDark = () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (themeIcon) themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    if (themeText) themeText.textContent = 'Light Mode';
  };

  if (savedTheme === 'dark') setDark();
  else setLight();

  const darkModeBtn = document.getElementById('dark-mode-btn');
  if (darkModeBtn) {
    darkModeBtn.addEventListener('click', () => {
      if (document.documentElement.getAttribute('data-theme') === 'dark') {
        localStorage.setItem('ujm-theme', 'light');
        setLight();
      } else {
        localStorage.setItem('ujm-theme', 'dark');
        setDark();
      }
    });
  }
}

function setupTabLogic() {
  if (!sidebarItems) return;
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (!tabId) return;
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      tabPanes.forEach(pane => pane.classList.remove('active'));
      const activePane = document.getElementById(tabId);
      if (activePane) activePane.classList.add('active');
    });
  });
}

function getApiKeyStorageKey(provider) {
  return { 
    openai: STORAGE_KEYS.API_KEY_OPENAI, 
    anthropic: STORAGE_KEYS.API_KEY_ANTHROPIC, 
    gemini: STORAGE_KEYS.API_KEY_GEMINI, 
    zai: STORAGE_KEYS.API_KEY_CUSTOM, 
    custom: STORAGE_KEYS.API_KEY_CUSTOM 
  }[provider];
}

async function loadSettings() {
  const allSyncData = await chrome.storage.sync.get(null);
  const localData = await chrome.storage.local.get(null);

  if (profileEl) profileEl.value = allSyncData[STORAGE_KEYS.PROFILE] || '';
  if (userHourlyRateEl) userHourlyRateEl.value = allSyncData[STORAGE_KEYS.USER_HOURLY_RATE] || '';
  if (userFixedMinEl) userFixedMinEl.value = allSyncData[STORAGE_KEYS.USER_FIXED_MIN] || '';
  if (userFixedMaxEl) userFixedMaxEl.value = allSyncData[STORAGE_KEYS.USER_FIXED_MAX] || '';
  if (customPromptEl) customPromptEl.value = allSyncData[STORAGE_KEYS.CUSTOM_PROMPT] || '';

  currentProvider = allSyncData[STORAGE_KEYS.PROVIDER] || DEFAULT_PROVIDER;
  document.querySelector(`input[name="provider"][value="${currentProvider}"]`)?.click();

  const keyForProvider = getApiKeyStorageKey(currentProvider);
  if (apiKeyEl) apiKeyEl.value = allSyncData[keyForProvider] || '';
  if (customUrlEl) customUrlEl.value = allSyncData[STORAGE_KEYS.CUSTOM_URL] || '';
  
  storedModels = allSyncData[STORAGE_KEYS.MODEL] || {};
  populateModelDropdown(PROVIDER_MODELS[currentProvider] || [], storedModels[currentProvider] || DEFAULT_MODELS[currentProvider]);

  const weights = allSyncData[STORAGE_KEYS.WEIGHTS] || DEFAULT_WEIGHTS;
  if (weightRulesEl) weightRulesEl.value = weights.rules;
  if (weightLlmEl) weightLlmEl.value = weights.llm;
  if (weightRulesVal) weightRulesVal.textContent = weights.rules + '%';
  if (weightLlmVal) weightLlmVal.textContent = weights.llm + '%';

  customRules = allSyncData[STORAGE_KEYS.CUSTOM_RULES] || JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES));
  renderRules();

  if (optimizationEnabledEl) optimizationEnabledEl.checked = allSyncData[STORAGE_KEYS.OPTIMIZATION_ENABLED] || false;
  const storedKeywords = allSyncData[STORAGE_KEYS.STACK_KEYWORDS];
  stackKeywords = Array.isArray(storedKeywords) ? storedKeywords : [...DEFAULT_STACK_KEYWORDS];
  renderKeywords();

  const thresholds = allSyncData[STORAGE_KEYS.THRESHOLDS] || DEFAULT_THRESHOLDS;
  if (maxProposalsEl) maxProposalsEl.value = thresholds.maxProposals;
  if (hourlyMinEl) hourlyMinEl.value = thresholds.hourlyMin;
  if (hourlyMaxEl) hourlyMaxEl.value = thresholds.hourlyMax;
  if (fixedMinEl) fixedMinEl.value = thresholds.fixedMin;
  if (fixedMaxEl) fixedMaxEl.value = thresholds.fixedMax;

  const storedCountries = allSyncData[STORAGE_KEYS.TARGET_COUNTRIES];
  targetCountries = Array.isArray(storedCountries) ? storedCountries : [...DEFAULT_TARGET_COUNTRIES];
  renderCountries();

  if (logEnabledEl) logEnabledEl.checked = localData[STORAGE_KEYS.LOG_ENABLED] || false;
  renderLog(localData[STORAGE_KEYS.REQUEST_LOG] || []);
  renderStats(localData[STORAGE_KEYS.TOKEN_USAGE] || {}, localData[STORAGE_KEYS.REQUEST_LOG] || []);
}

function populateModelDropdown(models, selectedId) {
  if (!modelSelect) return;
  modelSelect.innerHTML = '';
  if (!models || !models.length) {
    modelSelect.innerHTML = '<option value="">— refresh to load models —</option>';
    return;
  }
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    if (m.id === selectedId) opt.selected = true;
    modelSelect.appendChild(opt);
  });
}

function updateApiKeySection() {
  const link = API_KEY_LINKS[currentProvider];
  if (!apiKeyEl) return;
  if (currentProvider === 'custom') {
    if (customUrlRow) customUrlRow.style.display = 'flex';
    apiKeyEl.placeholder = 'Optional API key...';
    if (apiKeyLink) apiKeyLink.innerHTML = '';
  } else {
    if (customUrlRow) customUrlRow.style.display = 'none';
    apiKeyEl.placeholder = 'Enter API key';
    if (apiKeyLink) apiKeyLink.innerHTML = link ? `<a href="${link}" target="_blank" style="color:var(--accent); text-decoration:none; margin-left:8px;">(Get Key)</a>` : '';
  }
}

async function refreshModels() {
  const apiKey = apiKeyEl?.value.trim();
  const customUrl = customUrlEl?.value.trim();
  if (currentProvider === 'custom' && !customUrl) return showStatus('Enter Custom URL', true);
  if (currentProvider !== 'custom' && !apiKey) return showStatus('Enter API Key', true);

  if (refreshIcon) refreshIcon.classList.add('spinning');
  if (refreshModelsBtn) refreshModelsBtn.disabled = true;

  try {
    const res = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.FETCH_MODELS, provider: currentProvider, apiKey, customUrl }, result => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(result);
      });
    });
    if (res.error) throw new Error(res.error);
    const selected = modelSelect.value || storedModels[currentProvider];
    populateModelDropdown(res.models || [], selected);
    showStatus('Models loaded successfully');
  } catch (err) {
    showStatus('Error: ' + err.message, true);
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('spinning');
    if (refreshModelsBtn) refreshModelsBtn.disabled = false;
  }
}

function renderRules() {
  if (!rulesList) return;
  rulesList.innerHTML = '';
  customRules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'rule-item';

    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.value = rule.name;
    inputName.placeholder = 'Rule Description';
    inputName.addEventListener('input', (e) => customRules[index].name = e.target.value);

    const selectField = document.createElement('select');
    ['proposals', 'hourly', 'fixed', 'country'].forEach(f => {
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = f.toUpperCase();
      if (rule.field === f) opt.selected = true;
      selectField.appendChild(opt);
    });
    selectField.addEventListener('change', (e) => customRules[index].field = e.target.value);

    const btnRemove = document.createElement('button');
    btnRemove.className = 'danger-btn-sm';
    btnRemove.type = 'button';
    btnRemove.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    btnRemove.addEventListener('click', () => { customRules.splice(index, 1); renderRules(); });

    row.appendChild(inputName);
    row.appendChild(selectField);
    row.appendChild(btnRemove);
    rulesList.appendChild(row);
  });
}

function renderCountries() {
  if (!countriesList) return;
  countriesList.innerHTML = '';
  targetCountries.forEach((c, i) => {
    const t = document.createElement('div'); t.className = 'tag';
    t.innerHTML = `${escapeHtml(c)} <span class="tag-remove" data-i="${i}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>`;
    countriesList.appendChild(t);
  });
}

function renderKeywords() {
  if (!keywordsList) return;
  keywordsList.innerHTML = '';
  stackKeywords.forEach((k, i) => {
    const t = document.createElement('div'); t.className = 'tag';
    t.innerHTML = `${escapeHtml(k)} <span class="tag-remove" data-i="${i}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>`;
    keywordsList.appendChild(t);
  });
}

function renderStats(usageObj, logsArr) {
  let total = 0;
  for (const p in usageObj) for (const m in usageObj[p]) total += (usageObj[p][m].input || 0) + (usageObj[p][m].output || 0);
  if (totalTokenCostEl) totalTokenCostEl.textContent = total.toLocaleString();
  if (totalApiCallsEl) totalApiCallsEl.textContent = logsArr.length.toString();
}

let activeLogEntry = null;

function renderLog(entries) {
  if (!logList) return;
  logList.innerHTML = '';
  if (!entries.length) {
    logList.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.85rem;">No activity logs found.</div>';
    return;
  }
  entries.slice(-20).reverse().forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `
      <div class="log-title">${escapeHtml(entry.jobTitle || 'Unknown Job')}</div>
      <div class="log-meta">
        <span class="badge" style="background:var(--primary); color:#fff">★ ${entry.score ?? 'N/A'}</span>
        <span>${new Date(entry.ts || Date.now()).toLocaleTimeString()}</span>
      </div>`;
    div.addEventListener('click', () => openLogModal(entry));
    logList.appendChild(div);
  });
}

const logModal = document.getElementById('log-modal');
const logModalBody = document.getElementById('log-modal-body');
const modalTabs = document.querySelectorAll('.modal-tab');

function openLogModal(entry) {
  activeLogEntry = entry;
  modalTabs.forEach(t => t.classList.remove('active'));
  document.querySelector('.modal-tab[data-target="log-response"]').classList.add('active');
  logModalBody.textContent = JSON.stringify(entry.response || {info: 'No response saved'}, null, 2);
  logModal.classList.add('active');
}

function setupModalListeners() {
  document.querySelector('.modal-close')?.addEventListener('click', () => logModal?.classList.remove('active'));
  logModal?.addEventListener('click', e => { if (e.target === logModal) logModal.classList.remove('active'); });

  modalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modalTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (!activeLogEntry) return;
      
      const target = tab.getAttribute('data-target');
      if (target === 'log-request') logModalBody.textContent = JSON.stringify(activeLogEntry.request || {info:'No data'}, null, 2);
      else if (target === 'log-response') logModalBody.textContent = JSON.stringify(activeLogEntry.response || {info:'No data'}, null, 2);
      else if (target === 'log-job') logModalBody.textContent = JSON.stringify(activeLogEntry.jobContext || {info:'No data'}, null, 2);
    });
  });
}

async function saveAllSettings() {
  storedModels[currentProvider] = modelSelect ? modelSelect.value : DEFAULT_MODELS[currentProvider];

  const toSaveSync = {
    [STORAGE_KEYS.PROFILE]: profileEl ? profileEl.value.trim() : '',
    [STORAGE_KEYS.USER_HOURLY_RATE]: userHourlyRateEl?.value ? parseFloat(userHourlyRateEl.value) : null,
    [STORAGE_KEYS.USER_FIXED_MIN]: userFixedMinEl?.value ? parseFloat(userFixedMinEl.value) : null,
    [STORAGE_KEYS.USER_FIXED_MAX]: userFixedMaxEl?.value ? parseFloat(userFixedMaxEl.value) : null,
    [STORAGE_KEYS.PROVIDER]: currentProvider,
    [STORAGE_KEYS.MODEL]: storedModels,
    [STORAGE_KEYS.CUSTOM_PROMPT]: customPromptEl ? customPromptEl.value.trim() : '',
    [STORAGE_KEYS.WEIGHTS]: {
      rules: weightRulesEl ? parseInt(weightRulesEl.value, 10) : DEFAULT_WEIGHTS.rules,
      llm: weightLlmEl ? parseInt(weightLlmEl.value, 10) : DEFAULT_WEIGHTS.llm,
    },
    [STORAGE_KEYS.THRESHOLDS]: {
      maxProposals: maxProposalsEl ? parseInt(maxProposalsEl.value, 10) : DEFAULT_THRESHOLDS.maxProposals,
      hourlyMin: hourlyMinEl ? parseFloat(hourlyMinEl.value) : DEFAULT_THRESHOLDS.hourlyMin,
      hourlyMax: hourlyMaxEl ? parseFloat(hourlyMaxEl.value) : DEFAULT_THRESHOLDS.hourlyMax,
      fixedMin: fixedMinEl ? parseFloat(fixedMinEl.value) : DEFAULT_THRESHOLDS.fixedMin,
      fixedMax: fixedMaxEl ? parseFloat(fixedMaxEl.value) : DEFAULT_THRESHOLDS.fixedMax,
    },
    [STORAGE_KEYS.TARGET_COUNTRIES]: targetCountries,
    [STORAGE_KEYS.CUSTOM_RULES]: customRules,
    [STORAGE_KEYS.STACK_KEYWORDS]: stackKeywords,
    [STORAGE_KEYS.OPTIMIZATION_ENABLED]: optimizationEnabledEl ? optimizationEnabledEl.checked : false,
    [STORAGE_KEYS.CUSTOM_URL]: customUrlEl ? customUrlEl.value.trim() : '',
  };

  if (apiKeyEl) toSaveSync[getApiKeyStorageKey(currentProvider)] = apiKeyEl.value.trim();

  const toSaveLocal = {
    [STORAGE_KEYS.LOG_ENABLED]: logEnabledEl ? logEnabledEl.checked : false
  };

  try {
    await chrome.storage.sync.set(toSaveSync);
    await chrome.storage.local.set(toSaveLocal);
    showStatus('✓ Settings saved', false);
  } catch (err) {
    showStatus('Error: ' + err.message, true);
  }
}

function showStatus(msg, isError = false) {
  if (!saveStatus) return;
  saveStatus.textContent = msg;
  saveStatus.style.color = isError ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => { saveStatus.textContent = ''; }, 3000);
}

function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function setupEventListeners() {
  document.getElementById('save-btn')?.addEventListener('click', saveAllSettings);
  
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      currentProvider = radio.value;
      updateApiKeySection();
      const storageKey = getApiKeyStorageKey(currentProvider);
      const data = await chrome.storage.sync.get([storageKey]);
      if (apiKeyEl) apiKeyEl.value = data[storageKey] || '';
      populateModelDropdown(PROVIDER_MODELS[currentProvider] || [], storedModels[currentProvider] || DEFAULT_MODELS[currentProvider]);
    });
  });

  toggleKeyBtn?.addEventListener('click', () => { if (apiKeyEl) apiKeyEl.type = apiKeyEl.type === 'password' ? 'text' : 'password'; });
  refreshModelsBtn?.addEventListener('click', refreshModels);

  if (weightRulesEl && weightLlmEl) {
    weightRulesEl.addEventListener('input', () => {
      weightLlmEl.value = 100 - weightRulesEl.value;
      if (weightRulesVal) weightRulesVal.textContent = weightRulesEl.value + '%';
      if (weightLlmVal) weightLlmVal.textContent = weightLlmEl.value + '%';
    });
    weightLlmEl.addEventListener('input', () => {
      weightRulesEl.value = 100 - weightLlmEl.value;
      if (weightLlmVal) weightLlmVal.textContent = weightLlmEl.value + '%';
      if (weightRulesVal) weightRulesVal.textContent = weightRulesEl.value + '%';
    });
  }

  addRuleBtn?.addEventListener('click', () => {
    customRules.push({ id: 'r' + Date.now(), name: '', field: 'proposals', operator: 'lt', value: '10', points: 10, flag: '' });
    renderRules();
  });

  resetRulesBtn?.addEventListener('click', () => {
    if (confirm('Reset scoring rules?')) { customRules = JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES)); renderRules(); }
  });

  addCountryBtn?.addEventListener('click', () => {
    const v = newCountryEl?.value.trim();
    if (v && !targetCountries.includes(v)) { targetCountries.push(v); renderCountries(); }
    if (newCountryEl) newCountryEl.value = '';
  });

  countriesList?.addEventListener('click', e => {
    const closeBtn = e.target.closest('.tag-remove');
    if (closeBtn) { targetCountries.splice(closeBtn.dataset.i, 1); renderCountries(); }
  });

  addKeywordBtn?.addEventListener('click', () => {
    const v = newKeywordEl?.value.trim().toLowerCase();
    if (v && !stackKeywords.includes(v)) { stackKeywords.push(v); renderKeywords(); }
    if (newKeywordEl) newKeywordEl.value = '';
  });

  keywordsList?.addEventListener('click', e => {
    const closeBtn = e.target.closest('.tag-remove');
    if (closeBtn) { stackKeywords.splice(closeBtn.dataset.i, 1); renderKeywords(); }
  });

  resetBtn?.addEventListener('click', () => {
    if (confirm('Erase all settings?')) {
      chrome.storage.sync.clear(() => chrome.storage.local.clear(() => window.location.reload()));
    }
  });

  resetUsageBtn?.addEventListener('click', () => {
    if (confirm('Clear statistics?')) {
      chrome.storage.local.set({ [STORAGE_KEYS.TOKEN_USAGE]: {} }, () => renderStats({}, []));
    }
  });

  clearLogBtn?.addEventListener('click', () => {
    if (confirm('Delete all logs?')) {
      chrome.storage.local.set({ [STORAGE_KEYS.REQUEST_LOG]: [] }, () => renderLog([]));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initDOMRefs();
  setupThemeLogic();
  setupTabLogic();
  setupModalListeners();
  setupEventListeners();
  loadSettings();
});
