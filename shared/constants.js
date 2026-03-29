// shared/constants.js — single source of truth for all magic values

const STORAGE_KEYS = {
  PROFILE: 'ujm_profile',
  PROVIDER: 'ujm_provider',
  MODEL: 'ujm_model',
  API_KEY_OPENAI: 'ujm_api_key_openai',
  API_KEY_ANTHROPIC: 'ujm_api_key_anthropic',
  API_KEY_GEMINI: 'ujm_api_key_gemini',
  API_KEY_CUSTOM: 'ujm_api_key_custom',
  CUSTOM_URL: 'ujm_custom_url',
  CUSTOM_PROMPT: 'ujm_custom_prompt',
  WEIGHTS: 'ujm_weights',
  THRESHOLDS: 'ujm_thresholds',
  TARGET_COUNTRIES: 'ujm_target_countries',
  TOKEN_USAGE: 'ujm_token_usage',
  LOG_ENABLED: 'ujm_log_enabled',
  REQUEST_LOG: 'ujm_request_log',
  DARK_MODE: 'ujm_dark_mode',
  CUSTOM_RULES: 'ujm_custom_rules',
  OPTIMIZATION_ENABLED: 'ujm_optimization_enabled',
  JOB_DETAILS_CACHE: 'ujm_job_details_cache',
  STACK_KEYWORDS: 'ujm_stack_keywords',
  EXTENSION_ENABLED: 'ujm_extension_enabled',
  USER_HOURLY_RATE: 'ujm_user_hourly_rate',
  USER_FIXED_MIN: 'ujm_user_fixed_min',
  USER_FIXED_MAX: 'ujm_user_fixed_max',
};

const LOG_MAX_ENTRIES = 200;

const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/',
  zai: 'https://api.z.ai/api/v1/chat/completions',
  custom: '', // user-configured
};

const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-4o-mini',  label: 'GPT-4o Mini (fast, cheap)' },
    { id: 'gpt-4o',       label: 'GPT-4o (best quality)' },
    { id: 'gpt-3.5-turbo',label: 'GPT-3.5 Turbo (legacy)' },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku (fast, cheap)' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (best quality)' },
    { id: 'claude-3-haiku-20240307',    label: 'Claude 3 Haiku (legacy)' },
  ],
  gemini: [
    { id: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash (fast, cheap)' },
    { id: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro (best quality)' },
    { id: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash (latest)' },
  ],
  zai: [
    { id: 'z1-mini',  label: 'Z1 Mini (fast)' },
    { id: 'z1',       label: 'Z1 (standard)' },
    { id: 'z1-pro',   label: 'Z1 Pro (best quality)' },
  ],
  custom: [],
};

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  gemini: 'gemini-1.5-flash',
  zai: 'z1-mini',
  custom: '',
};

const DEFAULT_PROVIDER = 'openai';

const DEFAULT_WEIGHTS = {
  rules: 40,
  llm: 60,
};

const DEFAULT_THRESHOLDS = {
  maxProposals: 50,
  hourlyMin: 30,
  hourlyMax: 80,
  fixedMin: 100,
  fixedMax: 500,
};

const DEFAULT_TARGET_COUNTRIES = ['United States', 'United Kingdom', 'Australia'];

const SCORE_THRESHOLDS = {
  GREEN: 80,
  YELLOW: 50,
};

const MESSAGE_TYPES = {
  SCORE_JOB: 'SCORE_JOB',
  FETCH_MODELS: 'FETCH_MODELS',
  FETCH_JOB_DETAILS: 'FETCH_JOB_DETAILS',
};

// Default custom rules — examples demonstrating the system (base scoring is hardcoded; these add bonus/penalty on top)
const DEFAULT_CUSTOM_RULES = [
  { id: 'r1', name: 'Penalize 50+ proposals', field: 'proposals', operator: 'gte', value: '50', points: -20, flag: '' },
  { id: 'r2', name: 'Bonus for US/UK clients', field: 'country', operator: 'contains', value: 'United States', points: 15, flag: 'US Client' },
  { id: 'r3', name: 'Avoid WordPress jobs', field: 'title', operator: 'contains', value: 'WordPress', points: -30, flag: 'WP Job' },
  { id: 'r4', name: 'Bonus: React keyword', field: 'title', operator: 'contains', value: 'React', points: 20, flag: 'Has React' },
];

const DEFAULT_STACK_KEYWORDS = ['react', 'node', 'python', 'javascript', 'typescript', 'next.js', 'vue', 'angular'];

export {
  STORAGE_KEYS,
  PROVIDER_URLS,
  PROVIDER_MODELS,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_TARGET_COUNTRIES,
  SCORE_THRESHOLDS,
  MESSAGE_TYPES,
  LOG_MAX_ENTRIES,
  DEFAULT_CUSTOM_RULES,
  DEFAULT_STACK_KEYWORDS,
};
