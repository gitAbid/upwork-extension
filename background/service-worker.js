// background/service-worker.js — LLM API calls + request queue

import { STORAGE_KEYS, PROVIDER_URLS, MESSAGE_TYPES, DEFAULT_WEIGHTS, DEFAULT_MODELS, LOG_MAX_ENTRIES, DEFAULT_CUSTOM_RULES, DEFAULT_STACK_KEYWORDS } from '../shared/constants.js';

const MAX_CONCURRENT = 3;
let activeRequests = 0;
const queue = [];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === MESSAGE_TYPES.SCORE_JOB) {
    enqueue(msg.payload, sendResponse);
    return true; // async response
  }
  if (msg.type === MESSAGE_TYPES.FETCH_MODELS) {
    fetchModelsForProvider(msg.provider, msg.apiKey, msg.customUrl)
      .then(models => sendResponse({ models }))
      .catch(err => sendResponse({ models: [], error: err.message }));
    return true;
  }
  return false;
});

function enqueue(payload, sendResponse) {
  if (activeRequests < MAX_CONCURRENT) {
    processRequest(payload, sendResponse);
  } else {
    queue.push({ payload, sendResponse });
  }
}

function drainQueue() {
  if (queue.length === 0 || activeRequests >= MAX_CONCURRENT) return;
  const next = queue.shift();
  processRequest(next.payload, next.sendResponse);
}

async function processRequest(payload, sendResponse) {
  activeRequests++;
  try {
    const result = await scoreJob(payload);
    sendResponse(result);
  } catch (err) {
    sendResponse({ score: payload.rulesScore ?? 0, reason: 'Service worker error: ' + err.message, flags: payload.flags ?? [], llmScore: null, rulesScore: payload.rulesScore ?? 0 });
  } finally {
    activeRequests--;
    drainQueue();
  }
}

async function scoreJob(payload) {
  const keys = [
    STORAGE_KEYS.PROFILE,
    STORAGE_KEYS.PROVIDER,
    STORAGE_KEYS.MODEL,
    STORAGE_KEYS.API_KEY_OPENAI,
    STORAGE_KEYS.API_KEY_ANTHROPIC,
    STORAGE_KEYS.API_KEY_GEMINI,
    STORAGE_KEYS.API_KEY_CUSTOM,
    STORAGE_KEYS.CUSTOM_URL,
    STORAGE_KEYS.CUSTOM_PROMPT,
    STORAGE_KEYS.WEIGHTS,
    STORAGE_KEYS.CUSTOM_RULES,
    STORAGE_KEYS.STACK_KEYWORDS,
    STORAGE_KEYS.OPTIMIZATION_ENABLED,
  ];
  const data = await chrome.storage.sync.get(keys);

  const provider = data[STORAGE_KEYS.PROVIDER] || 'openai';
  const profile = data[STORAGE_KEYS.PROFILE] || '';
  const customPrompt = data[STORAGE_KEYS.CUSTOM_PROMPT] || '';
  const weights = data[STORAGE_KEYS.WEIGHTS] || DEFAULT_WEIGHTS;
  const customRules = data[STORAGE_KEYS.CUSTOM_RULES] || DEFAULT_CUSTOM_RULES;
  const stackKeywords = data[STORAGE_KEYS.STACK_KEYWORDS] || DEFAULT_STACK_KEYWORDS;
  const optimizationEnabled = data[STORAGE_KEYS.OPTIMIZATION_ENABLED] || false;

  // Per-provider stored models map, or fall back to default
  const storedModels = data[STORAGE_KEYS.MODEL] || {};
  const model = storedModels[provider] || DEFAULT_MODELS[provider];

  const apiKey = {
    openai: data[STORAGE_KEYS.API_KEY_OPENAI],
    anthropic: data[STORAGE_KEYS.API_KEY_ANTHROPIC],
    gemini: data[STORAGE_KEYS.API_KEY_GEMINI],
    zai: data[STORAGE_KEYS.API_KEY_CUSTOM],
    custom: data[STORAGE_KEYS.API_KEY_CUSTOM],
  }[provider];

  const customUrl = data[STORAGE_KEYS.CUSTOM_URL] || '';

  const rulesScore = payload.rulesScore ?? 0;
  const flags = payload.flags ?? [];

  if (!apiKey || !profile) {
    return { score: rulesScore, reason: apiKey ? 'No profile set.' : 'No API key set — rules score only.', rulesScore, llmScore: null, flags, optimizationSkipped: false };
  }

  // Optimization check: if enabled and stack/domain keywords don't match, skip AI (unless forceAnalysis is true)
  if (optimizationEnabled && !payload.forceAnalysis && !checkStackMatch(payload, stackKeywords)) {
    return { score: rulesScore, reason: 'Optimization: No stack/domain match. Click to analyze.', rulesScore, llmScore: null, flags, optimizationSkipped: true };
  }

  const systemPrompt = buildSystemPrompt(profile, customPrompt);
  const userMessage = buildUserMessage(payload);

  let llmScore = null;
  let reason = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let rawResponse = '';
  let logError = null;

  const t0 = Date.now();
  try {
    const result = await callLLM(provider, apiKey, model, systemPrompt, userMessage, customUrl);
    llmScore = Math.min(100, Math.max(0, result.score));
    reason = result.reason || '';
    tokensIn = result.tokensIn || 0;
    tokensOut = result.tokensOut || 0;
    rawResponse = result.rawResponse || JSON.stringify({ score: result.score, reason: result.reason });
  } catch (err) {
    reason = 'LLM error: ' + err.message;
    llmScore = null;
    logError = err.message;
  }
  const durationMs = Date.now() - t0;

  // Track token usage
  if (tokensIn || tokensOut) {
    await addTokenUsage(provider, model, tokensIn, tokensOut);
  }

  const rw = (weights.rules ?? 40) / 100;
  const lw = (weights.llm ?? 60) / 100;
  const finalScore = llmScore !== null
    ? Math.round(rulesScore * rw + llmScore * lw)
    : rulesScore;

  // Append request log entry if logging enabled
  const logSettings = await chrome.storage.local.get(STORAGE_KEYS.LOG_ENABLED);
  if (logSettings[STORAGE_KEYS.LOG_ENABLED]) {
    await appendLog({
      id: `ujm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      provider,
      model,
      jobTitle: (payload.title || 'N/A').slice(0, 120),
      jobUid: payload.uid || '',
      systemPrompt: systemPrompt.slice(0, 8000),
      userMessage: userMessage.slice(0, 5000),
      rawResponse: rawResponse.slice(0, 4000),
      score: finalScore,
      llmScore,
      rulesScore,
      reason,
      tokensIn,
      tokensOut,
      durationMs,
      error: logError,
    });
  }

  return { score: finalScore, reason, rulesScore, llmScore, flags, optimizationSkipped: false };
}

function checkStackMatch(jobData, stackKeywords) {
  const searchText = [
    jobData.title || '',
    jobData.description || '',
    ...(jobData.skills || [])
  ].join(' ').toLowerCase();

  return stackKeywords.some(keyword => {
    const kw = keyword.toLowerCase();
    return searchText.includes(kw);
  });
}

async function appendLog(entry) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.REQUEST_LOG);
  const log = stored[STORAGE_KEYS.REQUEST_LOG] || [];
  log.push(entry);
  if (log.length > LOG_MAX_ENTRIES) log.splice(0, log.length - LOG_MAX_ENTRIES);
  await chrome.storage.local.set({ [STORAGE_KEYS.REQUEST_LOG]: log });
}

async function addTokenUsage(provider, model, tokensIn, tokensOut) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TOKEN_USAGE);
  const usage = stored[STORAGE_KEYS.TOKEN_USAGE] || {};
  if (!usage[provider]) usage[provider] = {};
  if (!usage[provider][model]) usage[provider][model] = { input: 0, output: 0, calls: 0 };
  usage[provider][model].input += tokensIn;
  usage[provider][model].output += tokensOut;
  usage[provider][model].calls += 1;
  await chrome.storage.local.set({ [STORAGE_KEYS.TOKEN_USAGE]: usage });
}

// ─── Dynamic model fetching ─────────────────────────────────────────────────

async function fetchModelsForProvider(provider, apiKey, customUrl) {
  switch (provider) {
    case 'openai':    return fetchOpenAIModels(apiKey);
    case 'anthropic': return fetchAnthropicModels(apiKey);
    case 'gemini':    return fetchGeminiModels(apiKey);
    case 'zai':       return fetchZaiModels(apiKey);
    case 'custom':    return fetchCustomModels(apiKey, customUrl);
    default: return [];
  }
}

async function fetchOpenAIModels(apiKey) {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': 'Bearer ' + apiKey },
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const CHAT_PREFIXES = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o3'];
  return data.data
    .filter(m => CHAT_PREFIXES.some(p => m.id.startsWith(p)) && !m.id.includes('instruct'))
    .sort((a, b) => b.created - a.created)
    .map(m => ({ id: m.id, label: m.id }));
}

async function fetchAnthropicModels(apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const list = data.data || data.models || [];
  return list.map(m => ({ id: m.id, label: m.display_name || m.id }));
}

async function fetchGeminiModels(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=50`
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => ({
      id: m.name.replace('models/', ''),
      label: m.displayName || m.name.replace('models/', ''),
    }));
}

async function fetchZaiModels(apiKey) {
  // z.ai models - using OpenAI-compatible endpoint
  const res = await fetch('https://api.z.ai/api/v1/models', {
    headers: { 'Authorization': 'Bearer ' + apiKey },
  });
  if (!res.ok) throw new Error(`Z.ai ${res.status}`);
  const data = await res.json();
  return (data.data || [])
    .map(m => ({ id: m.id, label: m.id }));
}

async function fetchCustomModels(apiKey, customUrl) {
  if (!customUrl) throw new Error('Custom URL is required');
  const url = customUrl.replace(/\/$/, '').replace(/\/chat\/completions.*$/, '') + '/models';
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + apiKey },
  });
  if (!res.ok) throw new Error(`Custom endpoint ${res.status}`);
  const data = await res.json();
  return (data.data || [])
    .map(m => ({ id: m.id, label: m.id }));
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildSystemPrompt(profile, customPrompt) {
  return `You are a job matching assistant. The user is a freelancer with the following profile:\n\n${profile}\n\n${customPrompt ? customPrompt + '\n\n' : ''}When given a job posting, respond ONLY with valid JSON in this exact format:\n{"score": <0-100>, "reason": "<one sentence, max 120 chars>"}\n\nScore meaning: 100 = perfect match, 0 = completely irrelevant.\nDo not include any other text outside the JSON.`;
}

function buildUserMessage(payload) {
  const budget = payload.budgetType === 'hourly'
    ? `$${payload.budgetMin ?? '?'}–$${payload.budgetMax ?? '?'}/hr`
    : payload.budgetType === 'fixed'
    ? `Fixed $${payload.budgetMax ?? payload.budgetMin ?? '?'}`
    : 'Not specified';

  return `Job Title: ${payload.title || 'N/A'}
Client Location: ${payload.clientCountry || 'Unknown'}
Budget: ${budget}
Proposals so far: ${payload.proposalCount ?? 'Unknown'}
Required Skills: ${(payload.skills || []).join(', ') || 'Not listed'}
Posted: ${payload.postedTime || 'Unknown'}

Description:
${(payload.description || '').slice(0, 4000)}`;
}

// ─── LLM callers ────────────────────────────────────────────────────────────

async function callLLM(provider, apiKey, model, systemPrompt, userMessage, customUrl) {
  switch (provider) {
    case 'openai':    return callOpenAI(apiKey, model, systemPrompt, userMessage);
    case 'anthropic': return callAnthropic(apiKey, model, systemPrompt, userMessage);
    case 'gemini':    return callGemini(apiKey, model, systemPrompt, userMessage);
    case 'zai':       return callOpenAICompatible(apiKey, model, systemPrompt, userMessage, 'https://api.z.ai/api/v1/chat/completions');
    case 'custom':    return callOpenAICompatible(apiKey, model, systemPrompt, userMessage, customUrl);
    default: throw new Error('Unknown provider: ' + provider);
  }
}

async function callOpenAI(apiKey, model, systemPrompt, userMessage) {
  const res = await fetch(PROVIDER_URLS.openai, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 100,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const parsed = parseJsonResponse(data.choices[0].message.content);
  parsed.tokensIn = data.usage?.prompt_tokens || 0;
  parsed.tokensOut = data.usage?.completion_tokens || 0;
  parsed.rawResponse = JSON.stringify(data);
  return parsed;
}

async function callOpenAICompatible(apiKey, model, systemPrompt, userMessage, baseUrl) {
  const url = baseUrl || '';
  if (!url) throw new Error('Base URL is required for custom provider');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiKey ? `Bearer ${apiKey}` : undefined,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 100,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Provider ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const parsed = parseJsonResponse(data.choices[0].message.content);
  parsed.tokensIn = data.usage?.prompt_tokens || 0;
  parsed.tokensOut = data.usage?.completion_tokens || 0;
  parsed.rawResponse = JSON.stringify(data);
  return parsed;
}

async function callAnthropic(apiKey, model, systemPrompt, userMessage) {
  const res = await fetch(PROVIDER_URLS.anthropic, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 100,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const parsed = parseJsonResponse(data.content[0].text);
  parsed.tokensIn = data.usage?.input_tokens || 0;
  parsed.tokensOut = data.usage?.output_tokens || 0;
  parsed.rawResponse = JSON.stringify(data);
  return parsed;
}

async function callGemini(apiKey, model, systemPrompt, userMessage) {
  const url = `${PROVIDER_URLS.gemini}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: systemPrompt + '\n\n' + userMessage }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 100,
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const parsed = parseJsonResponse(data.candidates[0].content.parts[0].text);
  parsed.tokensIn = data.usageMetadata?.promptTokenCount || 0;
  parsed.tokensOut = data.usageMetadata?.candidatesTokenCount || 0;
  parsed.rawResponse = JSON.stringify(data);
  return parsed;
}

function parseJsonResponse(text) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.score === 'number' && typeof parsed.reason === 'string') return parsed;
    throw new Error('Unexpected JSON shape');
  } catch {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { score: parsed.score ?? 0, reason: parsed.reason ?? '' };
    }
    throw new Error('Could not parse LLM JSON response');
  }
}
