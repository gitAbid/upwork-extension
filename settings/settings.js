// settings/settings.js — chrome.storage.sync read/write for all settings
import { STORAGE_KEYS, MESSAGE_TYPES, DEFAULT_PROVIDER, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, DEFAULT_TARGET_COUNTRIES, DEFAULT_MODELS, PROVIDER_MODELS, DEFAULT_CUSTOM_RULES, DEFAULT_STACK_KEYWORDS } from '../shared/constants.js';

const API_KEY_LINKS = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/keys',
  gemini: 'https://aistudio.google.com/apikey',
  zai: 'https://z.ai',
  custom: null,
};

// --- DOM refs (will be initialized after DOM is ready) ---
let form, profileEl, userHourlyRateEl, userFixedMinEl, userFixedMaxEl, customPromptEl, apiKeyEl, toggleKeyBtn, apiKeyLink, customUrlEl, customUrlRow;
let modelSelect, modelStatus, refreshModelsBtn, refreshIcon;
let weightRulesEl, weightLlmEl, weightRulesVal, weightLlmVal;
let maxProposalsEl, hourlyMinEl, hourlyMaxEl, fixedMinEl, fixedMaxEl;
let countriesList, newCountryEl, addCountryBtn;
let saveStatus, resetBtn, resetUsageBtn, tokenUsageTable;
let logEnabledEl, clearLogBtn, logList;
let rulesList, addRuleBtn, resetRulesBtn;
let optimizationEnabledEl, keywordsList, newKeywordEl, addKeywordBtn;

function initDOMRefs() {
  form = document.getElementById('settings-form');
  profileEl = document.getElementById('profile');
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
  tokenUsageTable = document.getElementById('token-usage-table');
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

let currentProvider = DEFAULT_PROVIDER;
let targetCountries = [...DEFAULT_TARGET_COUNTRIES];
let stackKeywords = [...DEFAULT_STACK_KEYWORDS];
let customRules = JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES));
// Stores per-provider selected model: { openai: 'gpt-4o-mini', anthropic: '...', gemini: '...', zai: '...', custom: '...' }
let storedModels = {};

// --- Dark mode (applied early to avoid flash) ---
async function applyDarkMode() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.DARK_MODE);
  const isDark = stored[STORAGE_KEYS.DARK_MODE] || false;
  document.body.classList.toggle('dark', isDark);
  const btn = document.getElementById('dark-mode-btn');
  if (btn) {
    btn.textContent = isDark ? '☀️' : '🌙';
  }
}

function setupDarkModeToggle() {
  const btn = document.getElementById('dark-mode-btn');
  if (!btn) return;

  // Remove any existing listeners to prevent duplicates
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    const isDark = document.body.classList.toggle('dark');
    newBtn.textContent = isDark ? '☀️' : '🌙';
    await chrome.storage.local.set({ [STORAGE_KEYS.DARK_MODE]: isDark });
  });
}

// --- Load settings on page open ---
async function loadSettings() {
  // Initialize DOM references first
  initDOMRefs();

  // Apply dark mode first to avoid flash
  await applyDarkMode();

  // Get all sync data - use getAll to be resilient to key changes
  const allSyncData = await chrome.storage.sync.get(null);
  const localData = await chrome.storage.local.get(null);

  // Extract only the keys we need from the retrieved data
  const data = {
    [STORAGE_KEYS.PROFILE]: allSyncData[STORAGE_KEYS.PROFILE] || '',
    [STORAGE_KEYS.PROVIDER]: allSyncData[STORAGE_KEYS.PROVIDER] || DEFAULT_PROVIDER,
    [STORAGE_KEYS.MODEL]: allSyncData[STORAGE_KEYS.MODEL] || {},
    [STORAGE_KEYS.API_KEY_OPENAI]: allSyncData[STORAGE_KEYS.API_KEY_OPENAI] || '',
    [STORAGE_KEYS.API_KEY_ANTHROPIC]: allSyncData[STORAGE_KEYS.API_KEY_ANTHROPIC] || '',
    [STORAGE_KEYS.API_KEY_GEMINI]: allSyncData[STORAGE_KEYS.API_KEY_GEMINI] || '',
    [STORAGE_KEYS.API_KEY_CUSTOM]: allSyncData[STORAGE_KEYS.API_KEY_CUSTOM] || '',
    [STORAGE_KEYS.CUSTOM_URL]: allSyncData[STORAGE_KEYS.CUSTOM_URL] || '',
    [STORAGE_KEYS.CUSTOM_PROMPT]: allSyncData[STORAGE_KEYS.CUSTOM_PROMPT] || '',
    [STORAGE_KEYS.WEIGHTS]: allSyncData[STORAGE_KEYS.WEIGHTS] || DEFAULT_WEIGHTS,
    [STORAGE_KEYS.THRESHOLDS]: allSyncData[STORAGE_KEYS.THRESHOLDS] || DEFAULT_THRESHOLDS,
    [STORAGE_KEYS.TARGET_COUNTRIES]: allSyncData[STORAGE_KEYS.TARGET_COUNTRIES] || [...DEFAULT_TARGET_COUNTRIES],
    [STORAGE_KEYS.CUSTOM_RULES]: allSyncData[STORAGE_KEYS.CUSTOM_RULES] || JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES)),
    [STORAGE_KEYS.STACK_KEYWORDS]: allSyncData[STORAGE_KEYS.STACK_KEYWORDS] || [...DEFAULT_STACK_KEYWORDS],
    [STORAGE_KEYS.OPTIMIZATION_ENABLED]: allSyncData[STORAGE_KEYS.OPTIMIZATION_ENABLED] || false,
    [STORAGE_KEYS.EXTENSION_ENABLED]: allSyncData[STORAGE_KEYS.EXTENSION_ENABLED],
  };

  // Extension enabled - Note: The actual toggle is now on the Upwork page as a floating button
  // We just store/retrieve the state here for persistence
  const extensionEnabled = data[STORAGE_KEYS.EXTENSION_ENABLED] !== false; // default true
  // Update global variable for extension state (used by other parts)
  window.extensionEnabledState = extensionEnabled;

  profileEl.value = data[STORAGE_KEYS.PROFILE] || '';
  userHourlyRateEl.value = allSyncData[STORAGE_KEYS.USER_HOURLY_RATE] || '';
  userFixedMinEl.value = allSyncData[STORAGE_KEYS.USER_FIXED_MIN] || '';
  userFixedMaxEl.value = allSyncData[STORAGE_KEYS.USER_FIXED_MAX] || '';
  customPromptEl.value = data[STORAGE_KEYS.CUSTOM_PROMPT] || '';

  currentProvider = data[STORAGE_KEYS.PROVIDER] || DEFAULT_PROVIDER;
  const providerRadio = document.querySelector(`input[name="provider"][value="${currentProvider}"]`);
  if (providerRadio) providerRadio.checked = true;
  updateApiKeySection();

  const keyForProvider = getApiKeyStorageKey(currentProvider);
  apiKeyEl.value = data[keyForProvider] || '';
  customUrlEl.value = data[STORAGE_KEYS.CUSTOM_URL] || '';

  storedModels = data[STORAGE_KEYS.MODEL] || {};

  // Populate model dropdown with fallback static list, then try refresh
  populateModelDropdown(PROVIDER_MODELS[currentProvider] || [], storedModels[currentProvider] || DEFAULT_MODELS[currentProvider]);

  const weights = data[STORAGE_KEYS.WEIGHTS] || DEFAULT_WEIGHTS;
  weightRulesEl.value = weights.rules;
  weightLlmEl.value = weights.llm;
  weightRulesVal.textContent = weights.rules + '%';
  weightLlmVal.textContent = weights.llm + '%';

  // Custom rules
  customRules = data[STORAGE_KEYS.CUSTOM_RULES] || JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES));
  renderRules();

  // Optimization and keywords
  optimizationEnabledEl.checked = data[STORAGE_KEYS.OPTIMIZATION_ENABLED] || false;
  stackKeywords = data[STORAGE_KEYS.STACK_KEYWORDS] || [...DEFAULT_STACK_KEYWORDS];
  renderKeywords();

  const thresholds = data[STORAGE_KEYS.THRESHOLDS] || DEFAULT_THRESHOLDS;
  maxProposalsEl.value = thresholds.maxProposals;
  hourlyMinEl.value = thresholds.hourlyMin;
  hourlyMaxEl.value = thresholds.hourlyMax;
  fixedMinEl.value = thresholds.fixedMin;
  fixedMaxEl.value = thresholds.fixedMax;

  targetCountries = data[STORAGE_KEYS.TARGET_COUNTRIES] || [...DEFAULT_TARGET_COUNTRIES];
  renderCountries();

  // Log
  logEnabledEl.checked = localData[STORAGE_KEYS.LOG_ENABLED] || false;
  renderLog(localData[STORAGE_KEYS.REQUEST_LOG] || []);

  renderTokenUsage(localData[STORAGE_KEYS.TOKEN_USAGE] || {});
}

// --- Model dropdown helpers ---
function populateModelDropdown(models, selectedId) {
  modelSelect.innerHTML = '';
  if (!models.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— enter API key then click Refresh —';
    modelSelect.appendChild(opt);
    return;
  }
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    if (m.id === selectedId) opt.selected = true;
    modelSelect.appendChild(opt);
  });
  if (selectedId && !models.find(m => m.id === selectedId)) {
    // Selected model not in list — add it
    const opt = document.createElement('option');
    opt.value = selectedId;
    opt.textContent = selectedId + ' (saved)';
    opt.selected = true;
    modelSelect.prepend(opt);
  }
}

async function refreshModels() {
  const apiKey = apiKeyEl.value.trim();
  const customUrl = customUrlEl.value.trim();

  if (currentProvider === 'custom' && !customUrl) {
    modelStatus.textContent = 'Enter a Custom API URL first.';
    modelStatus.style.color = '#ef4444';
    return;
  }

  if (currentProvider !== 'custom' && !apiKey) {
    modelStatus.textContent = 'Enter an API key first.';
    modelStatus.style.color = '#ef4444';
    return;
  }

  refreshIcon.style.animation = 'ujm-spin 0.8s linear infinite';
  refreshModelsBtn.disabled = true;
  modelStatus.textContent = 'Fetching models…';
  modelStatus.style.color = '';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.FETCH_MODELS, provider: currentProvider, apiKey, customUrl },
        res => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(res);
        }
      );
    });

    if (response.error) throw new Error(response.error);

    const models = response.models || [];
    if (!models.length) throw new Error('No models returned');

    const currentSelected = modelSelect.value || storedModels[currentProvider] || DEFAULT_MODELS[currentProvider];
    populateModelDropdown(models, currentSelected);
    modelStatus.textContent = `${models.length} models loaded.`;
    modelStatus.style.color = '#16a34a';
  } catch (err) {
    modelStatus.textContent = 'Error: ' + err.message;
    modelStatus.style.color = '#ef4444';
    // Fall back to static list
    populateModelDropdown(PROVIDER_MODELS[currentProvider] || [], storedModels[currentProvider] || DEFAULT_MODELS[currentProvider]);
  } finally {
    refreshIcon.style.animation = '';
    refreshModelsBtn.disabled = false;
    setTimeout(() => { if (modelStatus.style.color === 'rgb(22, 163, 74)') modelStatus.textContent = ''; }, 3000);
  }
}

// --- Save settings ---
async function saveSettings(e) {
  e.preventDefault();

  // Persist selected model for current provider
  storedModels[currentProvider] = modelSelect.value || DEFAULT_MODELS[currentProvider];

  const weights = {
    rules: parseInt(weightRulesEl.value, 10),
    llm: parseInt(weightLlmEl.value, 10),
  };

  const thresholds = {
    maxProposals: parseInt(maxProposalsEl.value, 10),
    hourlyMin: parseFloat(hourlyMinEl.value),
    hourlyMax: parseFloat(hourlyMaxEl.value),
    fixedMin: parseFloat(fixedMinEl.value),
    fixedMax: parseFloat(fixedMaxEl.value),
  };

  const toSave = {
    [STORAGE_KEYS.PROFILE]: profileEl.value.trim(),
    [STORAGE_KEYS.USER_HOURLY_RATE]: userHourlyRateEl.value ? parseFloat(userHourlyRateEl.value) : null,
    [STORAGE_KEYS.USER_FIXED_MIN]: userFixedMinEl.value ? parseFloat(userFixedMinEl.value) : null,
    [STORAGE_KEYS.USER_FIXED_MAX]: userFixedMaxEl.value ? parseFloat(userFixedMaxEl.value) : null,
    [STORAGE_KEYS.PROVIDER]: currentProvider,
    [STORAGE_KEYS.MODEL]: storedModels,
    [STORAGE_KEYS.CUSTOM_PROMPT]: customPromptEl.value.trim(),
    [STORAGE_KEYS.WEIGHTS]: weights,
    [STORAGE_KEYS.THRESHOLDS]: thresholds,
    [STORAGE_KEYS.TARGET_COUNTRIES]: targetCountries,
    [STORAGE_KEYS.CUSTOM_RULES]: customRules,
    [STORAGE_KEYS.STACK_KEYWORDS]: stackKeywords,
    [STORAGE_KEYS.OPTIMIZATION_ENABLED]: optimizationEnabledEl.checked,
    [STORAGE_KEYS.CUSTOM_URL]: customUrlEl.value.trim(),
    [STORAGE_KEYS.EXTENSION_ENABLED]: window.extensionEnabledState !== false,
  };

  if (currentProvider === 'custom') {
    toSave[STORAGE_KEYS.API_KEY_CUSTOM] = apiKeyEl.value.trim();
  } else {
    toSave[getApiKeyStorageKey(currentProvider)] = apiKeyEl.value.trim();
  }

  try {
    await chrome.storage.sync.set(toSave);
    showStatus('Settings saved!', false);
  } catch (err) {
    showStatus('Error saving: ' + err.message, true);
  }
}

function updateApiKeySection() {
  const link = API_KEY_LINKS[currentProvider];
  // Show/hide custom URL input
  if (currentProvider === 'custom') {
    customUrlRow.style.display = 'block';
    apiKeyEl.placeholder = 'Optional API key (leave empty if not required)';
    apiKeyLink.innerHTML = '';
  } else {
    customUrlRow.style.display = 'none';
    apiKeyEl.placeholder = currentProvider === 'openai' ? 'sk-...'
      : currentProvider === 'anthropic' ? 'sk-ant-...'
      : currentProvider === 'gemini' ? 'AIza...'
      : currentProvider === 'zai' ? 'zai-...'
      : 'Enter API key';
    apiKeyLink.innerHTML = link ? `<a href="${link}" target="_blank" rel="noopener">Get API key ↗</a>` : '';
  }
}

// --- Custom Rules Editor ---
function renderRules() {
  rulesList.innerHTML = '';

  if (!customRules.length) {
    rulesList.innerHTML = '<p class="usage-empty">No rules defined. Click "Add Rule" to create one.</p>';
    return;
  }

  customRules.forEach((rule, index) => {
    const ruleEl = document.createElement('div');
    ruleEl.className = 'rule-item';
    ruleEl.innerHTML = `
      <div class="rule-header">
        <input type="text" class="rule-name" value="${escapeHtml(rule.name)}" placeholder="Rule name" data-index="${index}">
        <button class="btn-danger-xs" data-index="${index}" title="Delete rule">×</button>
      </div>
      <div class="rule-body">
        <div class="rule-field-row">
          <label>Field</label>
          <select class="rule-field" data-index="${index}">
            <option value="proposals" ${rule.field === 'proposals' ? 'selected' : ''}>Proposals</option>
            <option value="hourly" ${rule.field === 'hourly' ? 'selected' : ''}>Hourly Rate</option>
            <option value="fixed" ${rule.field === 'fixed' ? 'selected' : ''}>Fixed Budget</option>
            <option value="country" ${rule.field === 'country' ? 'selected' : ''}>Client Country</option>
            <option value="posted" ${rule.field === 'posted' ? 'selected' : ''}>Posted Time</option>
            <option value="skills" ${rule.field === 'skills' ? 'selected' : ''}>Skills Contains</option>
          </select>
        </div>
        <div class="rule-field-row">
          <label>Operator</label>
          <select class="rule-operator" data-index="${index}">
            <option value="lt" ${rule.operator === 'lt' ? 'selected' : ''}>Less than</option>
            <option value="lte" ${rule.operator === 'lte' ? 'selected' : ''}>Less than or equal</option>
            <option value="gt" ${rule.operator === 'gt' ? 'selected' : ''}>Greater than</option>
            <option value="gte" ${rule.operator === 'gte' ? 'selected' : ''}>Greater than or equal</option>
            <option value="eq" ${rule.operator === 'eq' ? 'selected' : ''}>Equal to</option>
            <option value="range" ${rule.operator === 'range' ? 'selected' : ''}>Range (e.g., 30-80)</option>
            <option value="contains" ${rule.operator === 'contains' ? 'selected' : ''}>Contains text</option>
            <option value="in" ${rule.operator === 'in' ? 'selected' : ''}>In list (comma-separated)</option>
          </select>
        </div>
        <div class="rule-field-row">
          <label>Value</label>
          <input type="text" class="rule-value" value="${escapeHtml(String(rule.value))}" placeholder="Value to compare" data-index="${index}">
        </div>
        <div class="rule-field-row">
          <label>Points</label>
          <input type="number" class="rule-points" value="${rule.points}" min="0" max="100" data-index="${index}">
        </div>
        <div class="rule-field-row">
          <label>Flag</label>
          <input type="text" class="rule-flag" value="${escapeHtml(rule.flag || '')}" placeholder="e.g., budget_match (optional)" data-index="${index}">
        </div>
      </div>
    `;
    rulesList.appendChild(ruleEl);
  });

  // Add event listeners
  document.querySelectorAll('.rule-name').forEach(el => {
    el.addEventListener('change', (e) => {
      customRules[e.target.dataset.index].name = e.target.value;
    });
  });

  document.querySelectorAll('.rule-field').forEach(el => {
    el.addEventListener('change', (e) => {
      customRules[e.target.dataset.index].field = e.target.value;
    });
  });

  document.querySelectorAll('.rule-operator').forEach(el => {
    el.addEventListener('change', (e) => {
      customRules[e.target.dataset.index].operator = e.target.value;
    });
  });

  document.querySelectorAll('.rule-value').forEach(el => {
    el.addEventListener('change', (e) => {
      customRules[e.target.dataset.index].value = e.target.value;
    });
  });

  document.querySelectorAll('.rule-points').forEach(el => {
    el.addEventListener('change', (e) => {
      customRules[e.target.dataset.index].points = parseInt(e.target.value, 10) || 0;
    });
  });

  document.querySelectorAll('.rule-flag').forEach(el => {
    el.addEventListener('change', (e) => {
      customRules[e.target.dataset.index].flag = e.target.value;
    });
  });

  document.querySelectorAll('.btn-danger-xs').forEach(el => {
    el.addEventListener('click', (e) => {
      customRules.splice(parseInt(e.target.dataset.index, 10), 1);
      renderRules();
    });
  });
}

// --- Countries tag list ---
function renderCountries() {
  countriesList.innerHTML = '';
  targetCountries.forEach((country, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escapeHtml(country)}<button class="tag-remove" data-i="${i}" title="Remove">×</button>`;
    countriesList.appendChild(tag);
  });
}

// --- Keywords tag list ---
function renderKeywords() {
  keywordsList.innerHTML = '';
  stackKeywords.forEach((keyword, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escapeHtml(keyword)}<button class="tag-remove" data-type="keyword" data-i="${i}" title="Remove">×</button>`;
    keywordsList.appendChild(tag);
  });
}

function renderLog(entries) {
  logList.innerHTML = '';

  const valid = entries.filter(e => e && e.ts && e.provider);

  if (!valid.length) {
    logList.innerHTML = '<p class="usage-empty">No log entries yet.</p>';
    return;
  }

  const sorted = [...valid].reverse();
  sorted.forEach(entry => {
    const finalScore = entry.score;
    const scoreClass = finalScore === null || finalScore === undefined
      ? 'score-null'
      : finalScore >= 80 ? 'score-green'
      : finalScore >= 50 ? 'score-yellow'
      : 'score-red';
    const scoreText = finalScore === null || finalScore === undefined ? '—' : finalScore;
    const totalTok = (entry.tokensIn || 0) + (entry.tokensOut || 0);
    const ts = new Date(entry.ts).toLocaleString(undefined, {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

    const llmPart = entry.llmScore !== null && entry.llmScore !== undefined ? entry.llmScore : '—';
    const rulesPart = entry.rulesScore !== null && entry.rulesScore !== undefined ? entry.rulesScore : '—';
    const scoreTitle = `Final (weighted): ${scoreText}  |  LLM: ${llmPart}  |  Rules: ${rulesPart}`;

    const header = document.createElement('div');
    header.className = 'log-header';
    header.innerHTML = `
      <span class="log-chevron">▶</span>
      <span class="log-ts">${escapeHtml(ts)}</span>
      <span class="log-pill">${escapeHtml(entry.provider)}/${escapeHtml(entry.model)}</span>
      <span class="log-title">${escapeHtml((entry.jobTitle || 'N/A').slice(0, 50))}</span>
      <span class="log-scores">
        <span class="log-score-chip score-rules" title="Rules score">R:${rulesPart}</span>
        <span class="log-score-chip score-ai" title="AI (LLM) score">AI:${llmPart}</span>
        <span class="log-score-chip ${scoreClass}" title="Final weighted score">⇒${scoreText}</span>
      </span>
      <span class="log-meta">${totalTok}t</span>
      <span class="log-meta">${entry.durationMs}ms</span>
    `;

    const body = document.createElement('div');
    body.className = 'log-body';

    if (entry.error) {
      const sec = document.createElement('div');
      sec.className = 'log-section log-section--error';
      sec.innerHTML = `<div class="log-section-label">Error</div><pre class="log-pre">${escapeHtml(entry.error)}</pre>`;
      body.appendChild(sec);
    }

    const fields = [
      { label: 'Score Breakdown', value: `Rules: ${rulesPart}  |  AI (LLM): ${llmPart}  |  Final (weighted): ${scoreText}` },
      { label: 'Reason', value: entry.reason },
      { label: 'System Prompt', value: entry.systemPrompt },
      { label: 'User Message', value: entry.userMessage },
      { label: 'Raw Response', value: entry.rawResponse },
    ];
    fields.forEach(({ label, value }) => {
      if (!value) return;
      const sec = document.createElement('div');
      sec.className = 'log-section';
      sec.innerHTML = `<div class="log-section-label">${label}</div><pre class="log-pre">${escapeHtml(value)}</pre>`;
      body.appendChild(sec);
    });

    header.addEventListener('click', () => {
      const isOpen = body.classList.contains('log-body--open');
      body.classList.toggle('log-body--open', !isOpen);
      header.classList.toggle('log-header--open', !isOpen);
      header.querySelector('.log-chevron').textContent = isOpen ? '▶' : '▼';
    });

    const row = document.createElement('div');
    row.className = 'log-entry';
    row.appendChild(header);
    row.appendChild(body);
    logList.appendChild(row);
  });
}

// --- Token usage ---
function renderTokenUsage(usage) {
  tokenUsageTable.innerHTML = '';

  const entries = [];
  for (const [provider, models] of Object.entries(usage)) {
    for (const [model, stats] of Object.entries(models)) {
      entries.push({ provider, model, ...stats });
    }
  }

  if (!entries.length) {
    tokenUsageTable.innerHTML = '<p class="usage-empty">No usage recorded yet.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'usage-tbl';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Provider</th>
        <th>Model</th>
        <th>Calls</th>
        <th>Input tokens</th>
        <th>Output tokens</th>
        <th>Total tokens</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  let totalIn = 0, totalOut = 0, totalCalls = 0;
  for (const e of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(e.provider)}</td>
      <td class="model-cell">${escapeHtml(e.model)}</td>
      <td>${e.calls.toLocaleString()}</td>
      <td>${e.input.toLocaleString()}</td>
      <td>${e.output.toLocaleString()}</td>
      <td><strong>${(e.input + e.output).toLocaleString()}</strong></td>
    `;
    tbody.appendChild(tr);
    totalIn += e.input;
    totalOut += e.output;
    totalCalls += e.calls;
  }
  if (entries.length > 1) {
    const tr = document.createElement('tr');
    tr.className = 'usage-total-row';
    tr.innerHTML = `
      <td colspan="2"><strong>Total</strong></td>
      <td>${totalCalls.toLocaleString()}</td>
      <td>${totalIn.toLocaleString()}</td>
      <td>${totalOut.toLocaleString()}</td>
      <td><strong>${(totalIn + totalOut).toLocaleString()}</strong></td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tokenUsageTable.appendChild(table);
}

// --- Helpers ---
function getApiKeyStorageKey(provider) {
  return {
    openai: STORAGE_KEYS.API_KEY_OPENAI,
    anthropic: STORAGE_KEYS.API_KEY_ANTHROPIC,
    gemini: STORAGE_KEYS.API_KEY_GEMINI,
    zai: STORAGE_KEYS.API_KEY_CUSTOM,
    custom: STORAGE_KEYS.API_KEY_CUSTOM,
  }[provider];
}

function showStatus(msg, isError) {
  saveStatus.textContent = msg;
  saveStatus.className = 'save-status' + (isError ? ' error' : '');
  setTimeout(() => { saveStatus.textContent = ''; }, 3000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Boot - wait for DOM to be ready
function boot() {
  initDOMRefs();
  setupDarkModeToggle();
  setupEventListeners();
  loadSettings();
}

function setupEventListeners() {
  // Show/hide API key
  toggleKeyBtn.addEventListener('click', () => {
    apiKeyEl.type = apiKeyEl.type === 'password' ? 'text' : 'password';
    toggleKeyBtn.innerHTML = apiKeyEl.type === 'password' ? '&#128065;' : '&#128683;';
  });

  // Provider switching
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      // Save current key + model before switching
      if (apiKeyEl.value.trim()) {
        await chrome.storage.sync.set({ [getApiKeyStorageKey(currentProvider)]: apiKeyEl.value.trim() });
      }
      storedModels[currentProvider] = modelSelect.value || DEFAULT_MODELS[currentProvider];

      currentProvider = radio.value;
      updateApiKeySection();

      // Load key for new provider
      const data = await chrome.storage.sync.get([getApiKeyStorageKey(currentProvider), STORAGE_KEYS.MODEL, STORAGE_KEYS.CUSTOM_URL]);
      apiKeyEl.value = data[getApiKeyStorageKey(currentProvider)] || '';
      customUrlEl.value = data[STORAGE_KEYS.CUSTOM_URL] || '';
      storedModels = data[STORAGE_KEYS.MODEL] || storedModels;

      // Reset model list to static fallback for new provider
      populateModelDropdown(PROVIDER_MODELS[currentProvider] || [], storedModels[currentProvider] || DEFAULT_MODELS[currentProvider]);
      modelStatus.textContent = '';
    });
  });

  // Linked sliders
  weightRulesEl.addEventListener('input', () => {
    const v = parseInt(weightRulesEl.value, 10);
    weightLlmEl.value = 100 - v;
    weightRulesVal.textContent = v + '%';
    weightLlmVal.textContent = (100 - v) + '%';
  });

  weightLlmEl.addEventListener('input', () => {
    const v = parseInt(weightLlmEl.value, 10);
    weightRulesEl.value = 100 - v;
    weightLlmVal.textContent = v + '%';
    weightRulesVal.textContent = (100 - v) + '%';
  });

  // Add rule button
  addRuleBtn.addEventListener('click', () => {
    const newRule = {
      id: 'r' + Date.now(),
      name: 'New Rule',
      field: 'proposals',
      operator: 'lt',
      value: '10',
      points: 10,
      flag: ''
    };
    customRules.push(newRule);
    renderRules();
  });

  // Reset rules button
  resetRulesBtn.addEventListener('click', () => {
    if (!confirm('Reset rules to defaults?')) return;
    customRules = JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES));
    renderRules();
    showStatus('Rules reset to defaults.', false);
  });

  // Countries tag list
  countriesList.addEventListener('click', e => {
    if (e.target.classList.contains('tag-remove')) {
      const i = parseInt(e.target.dataset.i, 10);
      targetCountries.splice(i, 1);
      renderCountries();
    }
  });

  addCountryBtn.addEventListener('click', () => {
    const val = newCountryEl.value.trim();
    if (val && !targetCountries.includes(val)) {
      targetCountries.push(val);
      renderCountries();
    }
    newCountryEl.value = '';
  });

  newCountryEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCountryBtn.click(); }
  });

  // Keywords tag list
  keywordsList.addEventListener('click', e => {
    if (e.target.classList.contains('tag-remove') && e.target.dataset.type === 'keyword') {
      const i = parseInt(e.target.dataset.i, 10);
      stackKeywords.splice(i, 1);
      renderKeywords();
    }
  });

  addKeywordBtn.addEventListener('click', () => {
    const val = newKeywordEl.value.trim().toLowerCase();
    if (val && !stackKeywords.includes(val)) {
      stackKeywords.push(val);
      renderKeywords();
    }
    newKeywordEl.value = '';
  });

  newKeywordEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addKeywordBtn.click(); }
  });

  // Request Log
  logEnabledEl.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.LOG_ENABLED]: logEnabledEl.checked });
  });

  clearLogBtn.addEventListener('click', async () => {
    if (!confirm('Clear all request log entries?')) return;
    await chrome.storage.local.set({ [STORAGE_KEYS.REQUEST_LOG]: [] });
    renderLog([]);
    showStatus('Log cleared.', false);
  });

  // Token usage reset
  resetUsageBtn.addEventListener('click', async () => {
    if (!confirm('Reset all token usage counters?')) return;
    await chrome.storage.local.set({ [STORAGE_KEYS.TOKEN_USAGE]: {} });
    renderTokenUsage({});
    showStatus('Usage reset.', false);
  });

  // Reset button
  resetBtn.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    profileEl.value = '';
    customPromptEl.value = '';
    apiKeyEl.value = '';
    customUrlEl.value = '';
    currentProvider = DEFAULT_PROVIDER;
    document.querySelector(`input[name="provider"][value="${DEFAULT_PROVIDER}"]`).checked = true;
    updateApiKeySection();
    storedModels = {};
    populateModelDropdown(PROVIDER_MODELS[DEFAULT_PROVIDER] || [], DEFAULT_MODELS[DEFAULT_PROVIDER]);
    modelStatus.textContent = '';
    weightRulesEl.value = DEFAULT_WEIGHTS.rules;
    weightLlmEl.value = DEFAULT_WEIGHTS.llm;
    weightRulesVal.textContent = DEFAULT_WEIGHTS.rules + '%';
    weightLlmVal.textContent = DEFAULT_WEIGHTS.llm + '%';
    maxProposalsEl.value = DEFAULT_THRESHOLDS.maxProposals;
    hourlyMinEl.value = DEFAULT_THRESHOLDS.hourlyMin;
    hourlyMaxEl.value = DEFAULT_THRESHOLDS.hourlyMax;
    fixedMinEl.value = DEFAULT_THRESHOLDS.fixedMin;
    fixedMaxEl.value = DEFAULT_THRESHOLDS.fixedMax;
    targetCountries = [...DEFAULT_TARGET_COUNTRIES];
    renderCountries();
    customRules = JSON.parse(JSON.stringify(DEFAULT_CUSTOM_RULES));
    renderRules();
    stackKeywords = [...DEFAULT_STACK_KEYWORDS];
    renderKeywords();
    optimizationEnabledEl.checked = false;
    window.extensionEnabledState = true;
    showStatus('Reset to defaults.', false);
  });

  // Form submit
  form.addEventListener('submit', saveSettings);

  // Refresh models button
  refreshModelsBtn.addEventListener('click', refreshModels);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => boot());
} else {
  // DOM is already ready
  boot();
}
