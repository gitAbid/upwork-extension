# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Upwork Job Matcher is a Chrome Extension (Manifest V3) that scores job listings against user profiles using a hybrid scoring system: rules-based scoring (budget, location, proposals, posting time) combined with optional LLM analysis (OpenAI/Anthropic/Gemini/Z.ai/Custom).

**No build process** — all JavaScript is ES6 modules loaded directly by Chrome. Settings page uses type="module".

## Extension Architecture

```
content/content.js      → Injected into upwork.com, scrapes job cards, injects badges
background/service-worker.js → Handles LLM API calls, manages request queue (max 3 concurrent)
settings/settings.{html,js,css} → User configuration UI
shared/*.{js}           → Constants and shared scoring logic
```

### Critical: Content Script Module Import Limitation

**Content scripts cannot import modules**. All constants and functions used by `content/content.js` must be **inlined directly**. Do NOT attempt to add `import` statements to content.js.

When adding new storage keys or constants:
1. Add to `shared/constants.js` (source of truth for background/settings)
2. **Also inline** in `content/content.js` STORAGE_KEYS object

Example:
```javascript
// shared/constants.js
const STORAGE_KEYS = {
  NEW_SETTING: 'ujm_new_setting',
};

// content/content.js (inlined, no import)
const STORAGE_KEYS = {
  // ... existing keys
  NEW_SETTING: 'ujm_new_setting',
};
```

## Storage Patterns

- **chrome.storage.sync**: User settings (profile, API keys, preferences) — synced across devices
- **chrome.storage.local**: Logs and token usage — local only

Storage keys are defined in `shared/constants.js` → `STORAGE_KEYS`. Always use constants, never string literals.

## Scoring Flow

1. Content script observes job cards via MutationObserver
2. Scrapes job data (title, budget, skills, location, proposals, posting time)
3. Applies rules-based scoring (inlined in content.js)
4. Sends message to service worker for LLM analysis (if enabled)
5. Service worker queues request, calls LLM API, tracks token usage
6. Content script injects badge + flag pills into job card

### Budget Comparison Logic (Sophisticated)

**Hourly Rate** (user sets their rate):
- Calculate client range midpoint: `(budgetMin + budgetMax) / 2`
- Premium threshold: `budgetMax * 1.5`
- Compare user rate against bands: below minimum (0pts), budget friendly (30pts), near top (25pts), above market (15pts), premium (5pts)
- Fallback (no user rate): fixed thresholds $30-80/hr = good

**Fixed Price** (user sets their acceptable range):
- Compare client budget against user's min/max range
- Calculate user midpoint: `(userFixedMin + userFixedMax) / 2`
- Bands: not viable (< min, 0pts), acceptable (min→midpoint, 20pts), good fit (midpoint→max, 30pts), premium opportunity (> max, 35pts)
- Fallback (no user range): fixed thresholds $100-500 = good

**Mirror changes**: When updating budget logic in `content/content.js`, also update `shared/scoring.js` for consistency.

## Key Files

### content/content.js
- Scrapes job data from Upwork DOM selectors
- Rules-based scoring (must stay inlined)
- Badge injection with flag pills
- Toggle button for extension on/off
- Storage listeners for real-time settings updates

### background/service-worker.js
- LLM API integration (OpenAI, Anthropic, Gemini, Z.ai, Custom)
- Request queue with max 3 concurrent requests
- Token usage tracking per provider/model
- Request logging (optional, up to 200 entries)
- Stack-based optimization (skip LLM if no keyword match)

### shared/constants.js
- All storage keys, provider URLs, model lists
- Default values for weights, thresholds, countries
- Default custom rules and stack keywords
- **Source of truth** — add new constants here first

### shared/scoring.js
- Pure rules-based scoring functions
- Used by settings.js for live preview/testing
- Must mirror budget logic from content.js

## Chrome Extension Development

### Loading the Extension
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project directory

### Reloading During Development
- **Service worker**: Click "Reload" on extension card (or chrome://extensions/ → Service worker link)
- **Content script**: Refresh the Upwork page
- **Settings page**: Close and reopen settings tab

### Debugging
- Content script: Inspect job card element, Console shows `[UJM]` prefixed logs
- Service worker: chrome://extensions/ → Service worker link (opens DevTools)
- Settings: Right-click settings page → Inspect

## Common Patterns

### Adding New User Settings
1. Add storage key to `shared/constants.js`
2. Add to `content/content.js` STORAGE_KEYS (inlined)
3. Add UI field to `settings/settings.html`
4. Add DOM ref in `settings/settings.js` initDOMRefs()
5. Add load logic in `settings/settings.js` loadSettings()
6. Add save logic in `settings/settings.js` saveSettings()
7. Add storage listener in `content/content.js` if content script needs to react to changes

### Modifying Badge/Flag Display
- Labels: `content/content.js` → `FLAG_LABELS` object
- Colors: `content/content.js` → `FLAG_PILL_COLOR` object
- CSS: `content/content.css` → `.ujm-pill-*` classes

### Provider-Specific Model Lists
Models are fetched dynamically from provider APIs. To add a new provider:
1. Add to `shared/constants.js` → PROVIDER_URLS, DEFAULT_MODELS
2. Add fetch function in `background/service-worker.js` → fetch*Models()
3. Add caller in `background/service-worker.js` → callLLM() switch statement
4. Add to settings.html provider radio options

## Known Constraints

- Content scripts run in isolated world, cannot share variables with page scripts
- chrome.storage.sync has quota limits (100KB total, 8KB per item)
- Service worker terminates after 30s idle — queue state resets
- MutationObserver may fire multiple times per DOM change — WeakSet used to track processed cards
