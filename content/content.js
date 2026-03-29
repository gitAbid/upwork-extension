// content/content.js — DOM scraping, MutationObserver, badge injection

(function () {
  'use strict';

  // ─── Constants (inlined since content scripts can't import modules) ───────
  const STORAGE_KEYS = {
    WEIGHTS: 'ujm_weights',
    THRESHOLDS: 'ujm_thresholds',
    TARGET_COUNTRIES: 'ujm_target_countries',
    EXTENSION_ENABLED: 'ujm_extension_enabled',
    USER_HOURLY_RATE: 'ujm_user_hourly_rate',
    USER_FIXED_MIN: 'ujm_user_fixed_min',
    USER_FIXED_MAX: 'ujm_user_fixed_max',
    CUSTOM_RULES: 'ujm_custom_rules',
  };

  const DEFAULT_WEIGHTS = { rules: 40, llm: 60 };
  const SCORE_THRESHOLDS = { GREEN: 80, YELLOW: 50 };
  const MESSAGE_TYPES = { SCORE_JOB: 'SCORE_JOB', FETCH_JOB_DETAILS: 'FETCH_JOB_DETAILS' };

  // ─── Rules-based scoring (inlined from shared/scoring.js) ─────────────────
  function applyRulesScore(jobData) {
    const flags = [];
    const rateLabels = {};
    let rawPoints = 0;
    const RAW_MAX = 130;

    const proposals = jobData.proposalCount ?? 999;
    if (proposals < 5)        { rawPoints += 30; flags.push('low_competition'); }
    else if (proposals < 15)  { rawPoints += 20; }
    else if (proposals < 30)  { rawPoints += 10; }
    else if (proposals < 50)  { rawPoints += 5;  flags.push('high_competition'); }
    else                      { rawPoints += 0;  flags.push('high_competition'); }

    const { budgetType, budgetMin, budgetMax } = jobData;

    // ─── HOURLY RATE LOGIC ───────────────────────────────────────────────────────
    if (budgetType === 'hourly') {
      const rangeLow = budgetMin ?? budgetMax ?? 0;
      const rangeHigh = budgetMax ?? budgetMin ?? 0;
      const rangeStr = rangeLow === rangeHigh
        ? `${formatMoney(rangeLow)}/hr`
        : `${formatMoney(rangeLow)}-${formatMoney(rangeHigh)}/hr`;

      // Use comparison logic if user rate is set
      if (userHourlyRate && userHourlyRate > 0) {
        const midpoint = (rangeLow + rangeHigh) / 2;
        const premiumThreshold = rangeHigh * 1.5;

        console.log('[UJM] Hourly calculation:', { userHourlyRate, rangeLow, rangeHigh, midpoint, premiumThreshold });

        if (userHourlyRate < rangeLow) {
          rawPoints += 0; flags.push('hourly_below_minimum');
          rateLabels.hourly_below_minimum = `Below Min · ${rangeStr}`;
        } else if (userHourlyRate <= midpoint) {
          rawPoints += 30; flags.push('hourly_budget_friendly');
          rateLabels.hourly_budget_friendly = `Sweet Spot · ${rangeStr}`;
        } else if (userHourlyRate <= rangeHigh) {
          rawPoints += 25; flags.push('hourly_near_top');
          rateLabels.hourly_near_top = `Near Top · ${rangeStr}`;
        } else if (userHourlyRate <= premiumThreshold) {
          rawPoints += 15; flags.push('hourly_above_market');
          rateLabels.hourly_above_market = `Above Market · ${rangeStr}`;
        } else {
          rawPoints += 5; flags.push('hourly_premium');
          rateLabels.hourly_premium = `Premium · ${rangeStr}`;
        }
      } else {
        // FALLBACK: Use original fixed thresholds
        const rate = rangeHigh;
        console.log('[UJM] Using fallback hourly logic (no user rate set)');
        if (rate >= 30 && rate <= 80) {
          rawPoints += 30; flags.push('budget_match');
          rateLabels.budget_match = `Good Rate · ${rangeStr}`;
        } else if (rate > 80 && rate <= 150) {
          rawPoints += 20; flags.push('budget_high');
          rateLabels.budget_high = `High Rate · ${formatMoney(rate)}+/hr`;
        } else if (rate >= 20 && rate < 30) {
          rawPoints += 15; flags.push('budget_low');
          rateLabels.budget_low = `Low Rate · ${formatMoney(rate)}/hr`;
        } else {
          rawPoints += 0; flags.push('budget_too_low');
          rateLabels.budget_too_low = `Low Rate · <${formatMoney(rate)}/hr`;
        }
      }
    }
    // ─── FIXED PRICE LOGIC ───────────────────────────────────────────────────────
    else if (budgetType === 'fixed') {
      const clientBudget = budgetMax ?? budgetMin ?? 0;
      const budgetStr = `${formatMoney(clientBudget)} fixed`;

      // Use comparison logic if user's fixed range is set
      if (userFixedMin && userFixedMax && userFixedMin > 0 && userFixedMax > 0) {
        const yourMidpoint = (userFixedMin + userFixedMax) / 2;

        console.log('[UJM] Fixed calculation:', { userFixedMin, userFixedMax, clientBudget, yourMidpoint });

        if (clientBudget < userFixedMin) {
          rawPoints += 0; flags.push('fixed_not_viable');
          rateLabels.fixed_not_viable = `Too Low · ${budgetStr}`;
        } else if (clientBudget <= yourMidpoint) {
          rawPoints += 20; flags.push('fixed_acceptable');
          rateLabels.fixed_acceptable = `Acceptable · ${budgetStr}`;
        } else if (clientBudget <= userFixedMax) {
          rawPoints += 30; flags.push('fixed_good_fit');
          rateLabels.fixed_good_fit = `Good Fit · ${budgetStr}`;
        } else {
          rawPoints += 35; flags.push('fixed_premium_opportunity');
          rateLabels.fixed_premium_opportunity = `Premium · ${formatMoney(clientBudget)}+ fixed`;
        }
      } else {
        // FALLBACK: Use original fixed thresholds
        console.log('[UJM] Using fallback fixed logic (no user range set)');
        const rangeStr = (budgetMin != null && budgetMax != null && budgetMin !== budgetMax)
          ? `${formatMoney(budgetMin)}-${formatMoney(budgetMax)} fixed`
          : budgetStr;
        if (clientBudget >= 100 && clientBudget <= 500) {
          rawPoints += 30; flags.push('budget_match');
          rateLabels.budget_match = `Good Price · ${rangeStr}`;
        } else if (clientBudget > 500 && clientBudget <= 1000) {
          rawPoints += 20; flags.push('budget_high');
          rateLabels.budget_high = `High Price · ${formatMoney(clientBudget)}+ fixed`;
        } else if (clientBudget > 1000) {
          rawPoints += 15; flags.push('budget_very_high');
          rateLabels.budget_very_high = `High Price · ${formatMoney(clientBudget)}+ fixed`;
        } else {
          rawPoints += 5; flags.push('budget_too_low');
          rateLabels.budget_too_low = `Low Price · <${formatMoney(clientBudget)} fixed`;
        }
      }
    }

    const country = (jobData.clientCountry ?? '').trim();
    const usUkAu = ['United States', 'United Kingdom', 'Australia'];
    const westernEurope = ['Germany', 'France', 'Netherlands', 'Sweden', 'Denmark',
      'Norway', 'Switzerland', 'Belgium', 'Austria', 'Finland', 'Ireland'];
    if (usUkAu.some(c => country.toLowerCase().includes(c.toLowerCase()))) {
      rawPoints += 25; flags.push('preferred_location');
    } else if (country.toLowerCase().includes('canada')) {
      rawPoints += 15; flags.push('good_location');
    } else if (westernEurope.some(c => country.toLowerCase().includes(c.toLowerCase()))) {
      rawPoints += 10; flags.push('acceptable_location');
    }

    const postedTime = (jobData.postedTime ?? '').toLowerCase();
    const hrs = extractNumber(postedTime);
    if (postedTime.includes('minute') || postedTime.includes('just now') ||
        (postedTime.includes('second'))) {
      rawPoints += 15; flags.push('just_posted');
    } else if (postedTime.includes('hour') && hrs <= 1) {
      rawPoints += 15; flags.push('just_posted');
    } else if (postedTime.includes('hour') && hrs <= 6) {
      rawPoints += 10; flags.push('recently_posted');
    } else if (postedTime.includes('hour') && hrs <= 24) {
      rawPoints += 5;
    } else {
      rawPoints += 0;
      if (postedTime) flags.push('old_posting');
    }

    const score = Math.round((rawPoints / RAW_MAX) * 100);
    return { score: Math.min(100, Math.max(0, score)), flags, rateLabels };
  }

  function extractNumber(str) {
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function formatMoney(n) {
    if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
    return `$${Math.round(n)}`;
  }

  // ─── Custom rules evaluator (additive bonus/penalty on top of base scoring) ─
  const NUMERIC_FIELDS = ['proposals', 'budget_min', 'budget_max'];

  function applyCustomRules(jobData, rules) {
    const flags = [];
    let bonusPoints = 0;

    for (const rule of rules) {
      if (!rule.name || !rule.operator) continue;

      let fieldValue;
      switch (rule.field) {
        case 'proposals':   fieldValue = jobData.proposalCount ?? 999; break;
        case 'budget_min':  fieldValue = jobData.budgetMin ?? 0; break;
        case 'budget_max':  fieldValue = jobData.budgetMax ?? 0; break;
        case 'country':     fieldValue = (jobData.clientCountry ?? '').toLowerCase(); break;
        case 'posted_time': fieldValue = jobData.postedTime ?? ''; break;
        case 'title':       fieldValue = (jobData.title ?? '').toLowerCase(); break;
        default: continue;
      }

      const ruleValue = NUMERIC_FIELDS.includes(rule.field)
        ? parseFloat(rule.value) || 0
        : String(rule.value || '').toLowerCase();

      let matched = false;
      switch (rule.operator) {
        case 'lt':           matched = typeof fieldValue === 'number' && fieldValue < ruleValue; break;
        case 'lte':          matched = typeof fieldValue === 'number' && fieldValue <= ruleValue; break;
        case 'gt':           matched = typeof fieldValue === 'number' && fieldValue > ruleValue; break;
        case 'gte':          matched = typeof fieldValue === 'number' && fieldValue >= ruleValue; break;
        case 'eq':           matched = String(fieldValue) === String(ruleValue); break;
        case 'contains':     matched = String(fieldValue).includes(String(ruleValue)); break;
        case 'not_contains': matched = !String(fieldValue).includes(String(ruleValue)); break;
      }

      if (matched) {
        bonusPoints += rule.points || 0;
        if (rule.flag) flags.push(rule.flag);
      }
    }

    return { bonusPoints, flags };
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let processedCards = new WeakSet();
  const inFlightIds = new Set();
  let extensionEnabled = true;
  let userHourlyRate = undefined;
  let userFixedMin = undefined;
  let userFixedMax = undefined;
  let customRules = [];

  // ─── Inject floating toggle button ───────────────────────────────────────────
  let toggleButton = null;

  function injectFloatingToggle() {
    // Remove existing if any
    document.querySelector('.ujm-floating-toggle')?.remove();

    const toggle = document.createElement('div');
    toggle.className = 'ujm-floating-toggle';
    toggle.innerHTML = `
      <button class="ujm-toggle-btn" id="ujm-extension-toggle" title="Toggle extension on/off">
        <span class="ujm-toggle-icon">⚡</span>
        <span class="ujm-toggle-text">On</span>
      </button>
    `;
    document.body.appendChild(toggle);
    toggleButton = toggle;

    const btn = toggle.querySelector('.ujm-toggle-btn');
    const icon = toggle.querySelector('.ujm-toggle-icon');
    const text = toggle.querySelector('.ujm-toggle-text');

    updateToggleButtonState();

    btn.addEventListener('click', async () => {
      extensionEnabled = !extensionEnabled;
      await chrome.storage.sync.set({ [STORAGE_KEYS.EXTENSION_ENABLED]: extensionEnabled });
      updateToggleButtonState();

      if (extensionEnabled) {
        // Re-enable and process all visible cards
        processAllVisible();
      } else {
        // Disable and remove all badges
        document.querySelectorAll('.ujm-title-row').forEach(wrapper => {
          // Move title back out before removing
          const title = wrapper.querySelector('a[data-test*="job-tile-title"], [data-test="UpCLineClamp"], h2, h3');
          if (title && wrapper.parentNode) {
            wrapper.parentNode.insertBefore(title, wrapper);
          }
          wrapper.remove();
        });
        document.querySelectorAll('.ujm-flags-row').forEach(el => el.remove());
        document.querySelectorAll('.ujm-wrapper').forEach(el => el.remove());
      }
    });

    function updateToggleButtonState() {
      if (extensionEnabled) {
        toggle.classList.remove('ujm-toggle-off');
        toggle.classList.add('ujm-toggle-on');
        icon.textContent = '⚡';
        text.textContent = 'On';
      } else {
        toggle.classList.remove('ujm-toggle-on');
        toggle.classList.add('ujm-toggle-off');
        icon.textContent = '⏸';
        text.textContent = 'Off';
      }
    }

    // Expose update function globally so we can call it later
    toggle.updateToggleButtonState = updateToggleButtonState;
  }

  // Call immediately to inject the toggle
  injectFloatingToggle();

  // ─── DOM scraping ──────────────────────────────────────────────────────────
  function scrapeCard(card) {
    const text = s => {
      const el = card.querySelector(s);
      return el ? el.innerText.trim() : '';
    };

    // Selectors handle both find-work and search pages
    const title = text('[data-test="job-tile-title-link UpLink"]') ||
      text('[data-test="UpCLineClamp"]') ||
      text('[data-test="job-save-button"]').replace(/^Save job\s*/i, '').trim() ||
      text('h2') || text('h3');
    const description = text('[data-test="UpCLineClamp JobDescription"]') ||
      text('[data-test="job-description-text"]') ||
      text('[data-test="job-description-line-clamp"]');
    const budgetRaw = text('[data-test="job-type-label"]') || text('[data-test="job-type"]');
    const proposalsRaw = text('[data-test="proposals-tier"]') || text('[data-test="proposals"]');
    const clientCountry = text('[data-test="location"]') || text('[data-test="client-country"]');
    const postedTime = text('[data-test="job-pubilshed-date"]') || text('[data-test="posted-on"]');

    const skillEls = card.querySelectorAll('[data-test="token"], [data-test="attr-item"]');
    const skills = [...skillEls].map(el => el.innerText.trim()).filter(Boolean);

    const { budgetType, budgetMin, budgetMax } = parseBudget(budgetRaw);
    const proposalCount = parseProposals(proposalsRaw);

    // Derive a stable job ID from the card
    const uid = card.dataset?.evOpeningUid || card.dataset?.evJobUid || card.dataset?.jobUid || hashStr(title + description.slice(0, 60));

    // Extract job ciphertext (~022XXXXXX) from the title link href for GraphQL API
    // Actual DOM: <h3 class="job-tile-title"><a class="air3-link" href="/jobs/..._~022.../...">
    const linkEl =
      card.querySelector('h3.job-tile-title a.air3-link') ||
      card.querySelector('h2.job-tile-title a.air3-link') ||
      card.querySelector('a[href*="~"]') ||
      card.querySelector('a[href*="%7E"]') ||
      card.querySelector('a[data-test="job-tile-title-link UpLink"]') ||
      card.querySelector('a[data-test*="job-tile-title"]') ||
      card.querySelector('h2 a, h3 a');
    const href = linkEl?.getAttribute('href') || '';
    const ciphertextMatch = href.match(/(~|%7E)(\d+)/i) || href.match(/\/~(\d+)/);
    const ciphertext = ciphertextMatch ? `~${ciphertextMatch[2] || ciphertextMatch[1]}` : null;

    // Fallback: construct ciphertext from data-ev-opening_uid attribute on the card
    // evOpeningUid is the numeric part (e.g. "2038231650943502613")
    // Full ciphertext format requires "~02" prefix (e.g. "~022038231650943502613")
    const fallbackCiphertext = !ciphertext && card.dataset?.evOpeningUid
      ? `~02${card.dataset.evOpeningUid}`
      : null;

    console.log('[UJM] scrapeCard:', {
      title: title.slice(0, 40),
      href: href.slice(0, 80),
      ciphertext: ciphertext || fallbackCiphertext,
    });

    // Derive numeric UID from ciphertext (~022... → 2038...) for bid/connects queries
    // Strip ~ and the 02 prefix to get the raw numeric job post UID
    const numericUid = (ciphertext || fallbackCiphertext)
      ? (ciphertext || fallbackCiphertext).slice(3)
      : null;

    return { uid, numericUid, title, description, budgetType, budgetMin, budgetMax, proposalCount, clientCountry, skills, postedTime, ciphertext: ciphertext || fallbackCiphertext };
  }

  function parseBudget(raw) {
    if (!raw) return { budgetType: 'unknown', budgetMin: null, budgetMax: null };
    const clean = raw.replace(/,/g, '');
    // Hourly: "$45.00-$65.00/hr" or "$45/hr"
    const hourlyRange = clean.match(/\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)\s*\/\s*hr/i);
    if (hourlyRange) return { budgetType: 'hourly', budgetMin: parseFloat(hourlyRange[1]), budgetMax: parseFloat(hourlyRange[2]) };
    const hourlySingle = clean.match(/\$?([\d.]+)\s*\/\s*hr/i);
    if (hourlySingle) return { budgetType: 'hourly', budgetMin: parseFloat(hourlySingle[1]), budgetMax: parseFloat(hourlySingle[1]) };
    // Fixed: "$250" or "$1,000"
    const fixed = clean.match(/\$?([\d.]+)/);
    if (fixed) return { budgetType: 'fixed', budgetMin: parseFloat(fixed[1]), budgetMax: parseFloat(fixed[1]) };
    return { budgetType: 'unknown', budgetMin: null, budgetMax: null };
  }

  function parseProposals(raw) {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower.includes('less than 5') || lower.includes('< 5')) return 2;
    if (lower.includes('50+') || lower.includes('50 or more')) return 55;
    const range = lower.match(/(\d+)\s*(?:to|-)\s*(\d+)/);
    if (range) return Math.round((parseInt(range[1]) + parseInt(range[2])) / 2);
    const single = lower.match(/(\d+)/);
    if (single) return parseInt(single[1]);
    return null;
  }

  function hashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'ujm-' + Math.abs(hash).toString(36);
  }

  // ─── Badge injection ────────────────────────────────────────────────────────
  const FLAG_LABELS = {
    low_competition:    'Low Competition',
    high_competition:   'High Competition',
    just_posted:        'Just Posted',
    recently_posted:    'Recent',
    old_posting:        'Old Post',
    preferred_location: 'Top Location',
    good_location:      'Good Location',
    acceptable_location:'OK Location',
  };

  const FLAG_PILL_COLOR = {
    low_competition:     'green',
    just_posted:         'green',
    recently_posted:     'green',
    budget_match:        'green',
    // Hourly rate colors
    hourly_budget_friendly:    'green',
    hourly_near_top:           'green',
    hourly_above_market:       'yellow',
    hourly_premium:            'yellow',
    hourly_below_minimum:      'red',
    // Fixed price colors
    fixed_acceptable:          'yellow',
    fixed_good_fit:            'green',
    fixed_premium_opportunity: 'green',
    fixed_not_viable:          'red',
    // Fallback colors
    budget_too_low:      'red',
    budget_high:         'yellow',
    budget_very_high:    'yellow',
    budget_low:          'yellow',
    // Location colors
    preferred_location:  'green',
    good_location:       'green',
    acceptable_location: 'gray',
    high_competition:    'red',
    old_posting:         'red',
  };

  function injectLoadingBadge(card, uid) {
    removeBadge(card);

    const badge = document.createElement('div');
    badge.className = 'ujm-badge ujm-loading';
    badge.dataset.ujmId = uid;
    badge.textContent = '…';

    // Inject inline with title if possible
    const titleEl = card.querySelector('[data-test="job-tile-title-link UpLink"]') ||
      card.querySelector('[data-test="UpCLineClamp"]') ||
      card.querySelector('h2') || card.querySelector('h3');

    if (titleEl) {
      // Create a narrow flex wrapper around just the title + loading badge
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'ujm-title-row';
      titleEl.before(titleWrapper);
      titleWrapper.appendChild(titleEl);
      titleWrapper.appendChild(badge);
    } else {
      // Fallback: absolute positioning
      const wrapper = document.createElement('div');
      wrapper.className = 'ujm-wrapper';
      wrapper.appendChild(badge);
      card.appendChild(wrapper);
    }
  }

  function injectBadge(card, { score, reason, flags, llmScore, rulesScore, optimizationSkipped, deepData, deepBonus }, rateLabels) {
    removeBadge(card);

    const colorClass = score >= SCORE_THRESHOLDS.GREEN ? 'ujm-green'
      : score >= SCORE_THRESHOLDS.YELLOW ? 'ujm-yellow'
      : 'ujm-red';

    const rulesOnly = llmScore === null;

    // Find the title element to inject inline beside it
    const titleEl = card.querySelector('[data-test="job-tile-title-link UpLink"]') ||
      card.querySelector('[data-test="UpCLineClamp"]') ||
      card.querySelector('h2') || card.querySelector('h3');

    // Score row: just the final score badge (R: and AI: moved to tooltip only)
    const chipRow = document.createElement('div');
    chipRow.className = 'ujm-chip-row';

    const finalChip = document.createElement('div');
    finalChip.className = `ujm-badge ${colorClass}${rulesOnly ? ' ujm-rules-only' : ''}${optimizationSkipped ? ' ujm-optimization-skipped' : ''}`;
    finalChip.textContent = score;
    finalChip.title = `Final weighted score`;

    // If optimization was skipped, add a manual trigger button
    if (optimizationSkipped) {
      finalChip.classList.add('ujm-clickable');
      finalChip.title = 'Optimized out (no stack match). Click to analyze anyway.';
    }

    // Tooltip on final chip
    const tooltip = document.createElement('div');
    tooltip.className = 'ujm-tooltip';

    const flagsHtml = (flags || []).map(f =>
      `<span class="ujm-flag">${f.replace(/_/g, ' ')}</span>`
    ).join('');

    // Build deep data tooltip sections
    let deepDataHtml = '';
    if (deepData) {
      const c = deepData.client || {};
      const a = deepData.activity || {};
      const b = deepData.bids || {};
      const cn = deepData.connects || {};
      const ap = deepData.application || {};
      const q = deepData.qualifications || {};
      const j = deepData.job || {};

      // Client section
      const clientRating = c.rating != null ? `${c.rating.toFixed(1)} rating` : '';
      const clientSpend = c.totalSpend > 0 ? `$${c.totalSpend >= 1000 ? (c.totalSpend / 1000).toFixed(1) + 'k' : Math.round(c.totalSpend)} spent` : '';
      const clientJobs = c.totalAssignments > 0 ? `${c.totalAssignments} jobs` : '';
      const clientVerified = c.paymentVerified ? 'Payment Verified' : '';
      const clientCountry = c.country || '';
      const clientLine = [clientRating, clientSpend, clientJobs].filter(Boolean).join('  |  ') || 'No client data';
      const clientMeta = [clientVerified, clientCountry, c.enterprise ? 'Enterprise' : ''].filter(Boolean).join('  |  ');

      // Activity section
      const applicants = a.totalApplicants > 0 ? `${a.totalApplicants} applicants` : '';
      const hired = a.totalHired > 0 ? `${a.totalHired} hired` : '';
      const positions = a.numberOfPositions > 1 ? `${a.numberOfPositions} positions` : '';
      const activityLine = [applicants, hired, positions].filter(Boolean).join('  |  ');

      // Bid section — top 3 competitor bids + median/p80
      const medianBid = b.medianBid != null ? `Median: $${b.medianBid}` : '';
      const p80Bid = b.p80Bid != null ? `P80: $${b.p80Bid}` : '';
      const bidStats = [medianBid, p80Bid].filter(Boolean).join('  |  ');
      const topBids = (b.competitorBids || []).slice(0, 3);
      const topBidsHtml = topBids.length
        ? topBids.map(bid => `<span class="ujm-bid-item">$${bid.amount}</span>`).join('')
        : '';
      const bidLine = bidStats || (topBidsHtml ? 'Competitor bids:' : '');

      // Qualification matches
      const qualLine = q.matched != null ? `Qualifications: ${q.matched}/${q.total} matched` : '';

      // Job details
      const workload = j.workload || '';
      const tier = j.contractorTier || '';
      const engagement = j.engagement || '';
      const jobMeta = [tier, engagement, workload].filter(Boolean).join('  |  ');

      // Application status
      const appliedLine = ap.alreadyApplied ? 'Already Applied' : (ap.alreadyHired ? 'Already Hired' : '');

      // Connects section
      const connectsLine = cn.price != null
        ? `${cn.price} connects  |  Balance: ${cn.connectsBalance ?? '?'}${cn.connectsBalance != null && cn.connectsBalance < cn.price ? ' (insufficient)' : ''}`
        : '';

      deepDataHtml = `
        <div class="ujm-tooltip-divider"></div>
        <div class="ujm-tooltip-section-title">CLIENT</div>
        <div class="ujm-tooltip-detail">${escapeHtml(clientLine)}</div>
        ${clientMeta ? `<div class="ujm-tooltip-detail">${escapeHtml(clientMeta)}</div>` : ''}
        <div class="ujm-tooltip-section-title">INSIGHTS</div>
        ${activityLine ? `<div class="ujm-tooltip-detail ujm-tooltip-activity">📊 ${escapeHtml(activityLine)}</div>` : ''}
        ${bidLine ? `<div class="ujm-tooltip-detail ujm-tooltip-bids">💰 ${escapeHtml(bidLine)}</div>` : ''}
        ${topBidsHtml ? `<div class="ujm-tooltip-detail ujm-tooltip-top-bids">Top bids: ${topBidsHtml}</div>` : ''}
        ${connectsLine ? `<div class="ujm-tooltip-detail ujm-tooltip-connects">🔗 ${escapeHtml(connectsLine)}</div>` : ''}
        ${qualLine ? `<div class="ujm-tooltip-detail">✅ ${escapeHtml(qualLine)}</div>` : ''}
        ${jobMeta ? `<div class="ujm-tooltip-detail">${escapeHtml(jobMeta)}</div>` : ''}
        ${appliedLine ? `<div class="ujm-tooltip-detail ujm-tooltip-warning">${escapeHtml(appliedLine)}</div>` : ''}
      `;
    }

    tooltip.innerHTML = `
      <div class="ujm-tooltip-header">Job Match Analysis</div>
      <div class="ujm-tooltip-scores">
        <div class="ujm-tooltip-score-row">
          <span class="ujm-tooltip-label">Rules Match</span>
          <span class="ujm-tooltip-val">${rulesScore ?? '—'}</span>
        </div>
        <div class="ujm-tooltip-score-row">
          <span class="ujm-tooltip-label">AI Analysis</span>
          <span class="ujm-tooltip-val">${rulesOnly ? '—' : llmScore}</span>
        </div>
        ${deepBonus ? `<div class="ujm-tooltip-score-row">
          <span class="ujm-tooltip-label">Deep Data</span>
          <span class="ujm-tooltip-val">${deepBonus > 0 ? '+' : ''}${deepBonus}</span>
        </div>` : ''}
        <div class="ujm-tooltip-score-row ujm-tooltip-final">
          <span class="ujm-tooltip-label">Final Score</span>
          <span class="ujm-tooltip-val">${score}/100</span>
        </div>
      </div>
      ${reason ? `<div class="ujm-tooltip-reason">${escapeHtml(reason)}</div>` : ''}
      ${flagsHtml ? `<div class="ujm-tooltip-flags">${flagsHtml}</div>` : ''}
      ${deepDataHtml}
    `;

    finalChip.appendChild(tooltip);

    chipRow.appendChild(finalChip);

    // Flag pills (both known system flags and custom rule flags), deduplicated
    const allPillFlags = [...new Set((flags || []).filter(f => FLAG_LABELS[f] || DEEP_FLAG_LABELS[f] || f))];
    const pillRow = document.createElement('div');
    pillRow.className = 'ujm-flags-row';
    if (allPillFlags.length) {
      allPillFlags.forEach(f => {
        const pill = document.createElement('span');
        const isDeep = !!DEEP_FLAG_LABELS[f];
        const isCustom = !FLAG_LABELS[f] && !rateLabels?.[f] && !isDeep;
        const color = isDeep ? (DEEP_PILL_COLORS[f] || 'gray') : (isCustom ? 'blue' : (FLAG_PILL_COLOR[f] || 'gray'));
        pill.className = `ujm-pill ujm-pill-${color}`;
        pill.textContent = rateLabels?.[f] || DEEP_FLAG_LABELS[f] || FLAG_LABELS[f] || f;
        pillRow.appendChild(pill);
      });
    }

    // Bid info pill (from deep data)
    if (deepData?.bids?.medianBid != null) {
      const bidPill = document.createElement('span');
      bidPill.className = 'ujm-pill ujm-pill-blue';
      bidPill.textContent = `Median $${deepData.bids.medianBid}`;
      pillRow.appendChild(bidPill);
    }
    if (deepData?.activity?.totalApplicants > 0) {
      const compPill = document.createElement('span');
      const appCount = deepData.activity.totalApplicants;
      const compColor = appCount > 50 ? 'red' : appCount > 20 ? 'yellow' : 'green';
      compPill.className = `ujm-pill ujm-pill-${compColor}`;
      compPill.textContent = `${appCount} applicants`;
      pillRow.appendChild(compPill);
    }
    if (deepData?.connects?.price != null) {
      const cnPill = document.createElement('span');
      const canAfford = deepData.connects.connectsBalance != null && deepData.connects.connectsBalance >= deepData.connects.price;
      cnPill.className = `ujm-pill ujm-pill-${canAfford ? 'green' : 'red'}`;
      cnPill.textContent = `${deepData.connects.price} connects`;
      pillRow.appendChild(cnPill);
    }

    // If optimization was skipped, make the badge clickable for manual analysis
    if (optimizationSkipped) {
      finalChip.style.cursor = 'pointer';
      finalChip.addEventListener('click', () => {
        manualAnalyze(card);
      });
    }

    // Inject relative to title element for inline layout
    if (titleEl) {
      // Create a narrow flex wrapper around just the title + chips
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'ujm-title-row';
      titleEl.before(titleWrapper);
      titleWrapper.appendChild(titleEl);
      titleWrapper.appendChild(chipRow);
      // Pill row goes after the wrapper so it drops below
      titleWrapper.after(pillRow);
    } else {
      // Fallback: no title found, use wrapper with absolute positioning
      const wrapper = document.createElement('div');
      wrapper.className = 'ujm-wrapper';
      wrapper.appendChild(chipRow);
      if (allPillFlags.length) wrapper.appendChild(pillRow);
      card.appendChild(wrapper);
    }
  }

  function removeBadge(card) {
    // Unwrap title from our flex container
    const titleRow = card.querySelector('.ujm-title-row');
    if (titleRow && titleRow.parentNode) {
      // Move the original title element back out before removing the wrapper
      const title = titleRow.querySelector('a[data-test*="job-tile-title"], [data-test="UpCLineClamp"], h2, h3');
      if (title) {
        titleRow.parentNode.insertBefore(title, titleRow);
      }
      titleRow.remove(); // also removes chipRow and loading badge inside it
    }
    // Clean up ALL pill rows (sibling of the removed wrapper)
    card.querySelectorAll('.ujm-flags-row').forEach(el => el.remove());
    // Fallback cleanup for absolute-positioned wrapper
    card.querySelector('.ujm-wrapper')?.remove();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ─── Manual analysis trigger for optimization-skipped jobs ─────────────────────
  async function manualAnalyze(card) {
    const jobData = scrapeCard(card);
    if (!jobData.title) return;

    const { score: rulesScore, flags, rateLabels } = applyRulesScore(jobData);
    const { bonusPoints, flags: customFlags } = applyCustomRules(jobData, customRules);
    const adjustedRulesScore = Math.min(100, Math.max(0, rulesScore + bonusPoints));
    const allFlags = [...flags, ...customFlags];

    injectLoadingBadge(card, jobData.uid);

    // Send forced analysis request
    const payload = { ...jobData, rulesScore: adjustedRulesScore, flags: allFlags, forceAnalysis: true };
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SCORE_JOB, payload }, response => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(response);
        });
      });
    } catch (err) {
      result = { score: adjustedRulesScore, reason: 'Extension error: ' + err.message, flags: allFlags, llmScore: null, rulesScore: adjustedRulesScore };
    }

    if (!document.contains(card)) return;
    if (!result) {
      result = { score: adjustedRulesScore, reason: 'No response from service worker.', flags: allFlags, llmScore: null, rulesScore: adjustedRulesScore };
    }
    injectBadge(card, result, rateLabels);
  }

  // ─── Check if extension is enabled ────────────────────────────────────────────
  async function checkExtensionEnabled() {
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEYS.EXTENSION_ENABLED);
      extensionEnabled = stored[STORAGE_KEYS.EXTENSION_ENABLED] !== false; // default true
      // Update the toggle button state
      if (toggleButton && toggleButton.updateToggleButtonState) {
        toggleButton.updateToggleButtonState();
      }
      return extensionEnabled;
    } catch (_) {
      extensionEnabled = true;
      return true;
    }
  }

  // ─── Listen for extension enabled state changes ────────────────────────────────
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[STORAGE_KEYS.EXTENSION_ENABLED]) {
      extensionEnabled = changes[STORAGE_KEYS.EXTENSION_ENABLED].newValue !== false;
      // Update the toggle button state
      if (toggleButton && toggleButton.updateToggleButtonState) {
        toggleButton.updateToggleButtonState();
      }
      if (extensionEnabled) {
        // Extension was re-enabled, reprocess all visible cards
        processAllVisible();
      } else {
        // Extension was disabled, remove all badges
        document.querySelectorAll('.ujm-title-row').forEach(wrapper => {
          const title = wrapper.querySelector('a[data-test*="job-tile-title"], [data-test="UpCLineClamp"], h2, h3');
          if (title && wrapper.parentNode) {
            wrapper.parentNode.insertBefore(title, wrapper);
          }
          wrapper.remove();
        });
        document.querySelectorAll('.ujm-flags-row').forEach(el => el.remove());
        document.querySelectorAll('.ujm-wrapper').forEach(el => el.remove());
      }
    }
  });

  // ─── Deep data (GraphQL) scoring + display ──────────────────────────────────

  const DEEP_FLAG_LABELS = {
    client_payment_verified:     'Verified',
    client_payment_unverified:   'Unverified',
    client_high_rated:           '',
    client_good_rated:           '',
    client_high_spend:           'High Spend',
    client_good_spend:           '',
    client_active_hirer:         'Active Hirer',
    client_new:                  'New Client',
    high_competition_actual:     'High Comp',
    low_competition_actual:      'Low Comp',
    position_filled:             'Filled',
    buyer_active_now:            'Active Now',
    buyer_active_recent:         'Active',
    already_applied:             'Applied',
    already_hired:               'Hired',
  };

  const DEEP_PILL_COLORS = {
    client_payment_verified:     'green',
    client_payment_unverified:   'red',
    client_high_rated:           'green',
    client_good_rated:           'green',
    client_high_spend:           'green',
    client_good_spend:           'green',
    client_active_hirer:         'green',
    client_new:                  'yellow',
    high_competition_actual:     'red',
    low_competition_actual:      'green',
    position_filled:             'red',
    buyer_active_now:            'green',
    buyer_active_recent:         'green',
    already_applied:             'blue',
    already_hired:               'gray',
  };

  function applyDeepDataScore(deepData) {
    const flags = [];
    const rateLabels = {};
    let bonusPoints = 0;

    if (!deepData) return { bonusPoints: 0, flags: [], rateLabels: {} };

    const { client, activity, application, bids } = deepData;

    // Client payment verified
    if (client) {
      if (client.paymentVerified) {
        bonusPoints += 10;
        flags.push('client_payment_verified');
        rateLabels.client_payment_verified = 'Verified';
      } else {
        flags.push('client_payment_unverified');
        rateLabels.client_payment_unverified = 'Unverified';
      }

      // Client rating
      if (client.rating !== null && client.rating !== undefined) {
        if (client.rating >= 4.8) {
          bonusPoints += 10;
          const label = `${client.rating.toFixed(1)} Client`;
          flags.push('client_high_rated');
          rateLabels.client_high_rated = label;
        } else if (client.rating >= 4.0) {
          bonusPoints += 5;
          const label = `${client.rating.toFixed(1)} Client`;
          flags.push('client_good_rated');
          rateLabels.client_good_rated = label;
        }
      }

      // Client total spend
      if (client.totalSpend > 5000) {
        bonusPoints += 10;
        flags.push('client_high_spend');
        const spendStr = client.totalSpend >= 1000 ? `$${(client.totalSpend / 1000).toFixed(1)}k spent` : `$${Math.round(client.totalSpend)} spent`;
        rateLabels.client_high_spend = spendStr;
      } else if (client.totalSpend > 1000) {
        bonusPoints += 5;
        flags.push('client_good_spend');
        rateLabels.client_good_spend = `$${(client.totalSpend / 1000).toFixed(1)}k spent`;
      }

      // Client hire rate
      if (client.totalAssignments > 0) {
        const hireRate = client.totalJobsWithHires / Math.max(1, client.totalAssignments);
        if (hireRate >= 0.8 && client.totalAssignments >= 5) {
          bonusPoints += 5;
          flags.push('client_active_hirer');
          rateLabels.client_active_hirer = `${client.totalAssignments} hires`;
        }
      } else if (client.totalAssignments === 0 && client.totalSpend === 0) {
        bonusPoints -= 5;
        flags.push('client_new');
        rateLabels.client_new = 'New Client';
      }
    }

    // Competition (actual numbers from API)
    if (activity) {
      if (activity.totalApplicants > 50) {
        bonusPoints -= 10;
        flags.push('high_competition_actual');
        rateLabels.high_competition_actual = `${activity.totalApplicants} apps`;
      } else if (activity.totalApplicants > 0 && activity.totalApplicants <= 10) {
        bonusPoints += 5;
        flags.push('low_competition_actual');
        rateLabels.low_competition_actual = `${activity.totalApplicants} apps`;
      }

      // Position already filled
      if (activity.totalHired >= activity.numberOfPositions) {
        bonusPoints -= 20;
        flags.push('position_filled');
        rateLabels.position_filled = `${activity.totalHired}/${activity.numberOfPositions} hired`;
      }

      // Buyer activity
      if (activity.lastBuyerActivity) {
        const lastActive = new Date(activity.lastBuyerActivity);
        const hoursAgo = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 1) {
          bonusPoints += 5;
          flags.push('buyer_active_now');
          rateLabels.buyer_active_now = 'Active Now';
        } else if (hoursAgo < 6) {
          bonusPoints += 3;
          flags.push('buyer_active_recent');
          rateLabels.buyer_active_recent = 'Active';
        }
      }
    }

    // Application status
    if (application) {
      if (application.alreadyApplied) {
        flags.push('already_applied');
        rateLabels.already_applied = 'Applied';
      }
      if (application.alreadyHired) {
        flags.push('already_hired');
        rateLabels.already_hired = 'Hired';
      }
    }

    return { bonusPoints, flags, rateLabels };
  }

  async function fetchAndInjectDeepData(card, jobData, baseResult, rateLabels) {
    console.log('[UJM] fetchAndInjectDeepData called, ciphertext:', jobData.ciphertext, 'numericUid:', jobData.numericUid);
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: MESSAGE_TYPES.FETCH_JOB_DETAILS, payload: { ciphertext: jobData.ciphertext, jobPostUid: jobData.numericUid || null } },
          res => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(res);
          },
        );
      });

      if (!response?.success || !response.data) {
        console.log('[UJM] Deep data fetch returned no data:', response);
        return;
      }

      const dd = response.data;
      console.log('[UJM] Deep data received:', {
        connects: dd.connects,
        medianBid: dd.bids?.medianBid,
        topBids: dd.bids?.competitorBids?.length || 0,
      });
      const deepData = response.data;
      const { bonusPoints, flags: deepFlags, rateLabels: deepRateLabels } = applyDeepDataScore(deepData);

      // Re-score with deep data bonus
      const baseScore = baseResult.score ?? 0;
      const newScore = Math.min(100, Math.max(0, baseScore + bonusPoints));

      // Merge flags and rate labels
      const mergedFlags = [...(baseResult.flags || []), ...deepFlags];
      const mergedRateLabels = { ...(rateLabels || {}), ...deepRateLabels };

      // Update the result with deep data
      const updatedResult = {
        ...baseResult,
        score: newScore,
        flags: mergedFlags,
        deepData,
        deepBonus: bonusPoints,
      };

      // Re-inject the badge with updated data
      if (!document.contains(card)) return;
      injectBadge(card, updatedResult, mergedRateLabels);

    } catch (err) {
      console.log('[UJM] Deep data fetch failed for', jobData.ciphertext, err.message);
    }
  }

  // ─── Process a single card ─────────────────────────────────────────────────
  async function processCard(card) {
    if (processedCards.has(card)) return;
    processedCards.add(card);

    // Check if extension is enabled
    if (!extensionEnabled) return;

    const jobData = scrapeCard(card);
    if (!jobData.title) return; // skip empty/non-job cards

    if (inFlightIds.has(jobData.uid)) return;
    inFlightIds.add(jobData.uid);

    const { score: rulesScore, flags, rateLabels } = applyRulesScore(jobData);
    const { bonusPoints, flags: customFlags } = applyCustomRules(jobData, customRules);
    const adjustedRulesScore = Math.min(100, Math.max(0, rulesScore + bonusPoints));
    const allFlags = [...flags, ...customFlags];

    injectLoadingBadge(card, jobData.uid);

    // Retrieve weights from storage
    let weights = DEFAULT_WEIGHTS;
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEYS.WEIGHTS);
      if (stored[STORAGE_KEYS.WEIGHTS]) weights = stored[STORAGE_KEYS.WEIGHTS];
    } catch (_) {}

    // Send to service worker for LLM scoring
    const payload = { ...jobData, rulesScore: adjustedRulesScore, flags: allFlags };
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SCORE_JOB, payload }, response => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(response);
        });
      });
    } catch (err) {
      result = { score: adjustedRulesScore, reason: 'Extension error: ' + err.message, flags: allFlags, llmScore: null, rulesScore: adjustedRulesScore };
    }

    // Guard: card may have been removed from DOM
    if (!document.contains(card)) {
      inFlightIds.delete(jobData.uid);
      return;
    }

    if (!result) {
      result = { score: adjustedRulesScore, reason: 'No response from service worker.', flags: allFlags, llmScore: null, rulesScore: adjustedRulesScore };
    }
    injectBadge(card, result, rateLabels);
    inFlightIds.delete(jobData.uid);

    // ── Fetch deep data (GraphQL job details) if ciphertext is available ──────
    if (jobData.ciphertext) {
      fetchAndInjectDeepData(card, jobData, result, rateLabels);
    }
  }

  // ─── Scan for cards ────────────────────────────────────────────────────────
  const JOB_CARD_SELECTOR = '[data-test="job-tile-list"] > section.air3-card-section, [data-test="JobsList"] article[data-test="JobTile"]';

  function processAllVisible() {
    if (!extensionEnabled) return;
    document.querySelectorAll(JOB_CARD_SELECTOR).forEach(card => {
      processCard(card).catch(console.error);
    });
  }

  // ─── MutationObserver for new cards ───────────────────────────────────────
  let debounceTimer = null;
  const observer = new MutationObserver(mutations => {
    let hasNewCards = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches && node.matches(JOB_CARD_SELECTOR)) { hasNewCards = true; break; }
        if (node.querySelector && node.querySelector(JOB_CARD_SELECTOR)) { hasNewCards = true; break; }
      }
      if (hasNewCards) break;
    }
    if (!hasNewCards) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processAllVisible, 50);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ─── SPA navigation detection ──────────────────────────────────────────────
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Give SPA time to render then scan
      setTimeout(processAllVisible, 600);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // ─── Initial scan ──────────────────────────────────────────────────────────
  // Load user hourly rate and fixed price range BEFORE processing any cards
  // to prevent race condition where cards are scored with undefined settings
  chrome.storage.sync.get([STORAGE_KEYS.USER_HOURLY_RATE, STORAGE_KEYS.USER_FIXED_MIN, STORAGE_KEYS.USER_FIXED_MAX, STORAGE_KEYS.CUSTOM_RULES], (data) => {
    userHourlyRate = data[STORAGE_KEYS.USER_HOURLY_RATE] || null;
    userFixedMin = data[STORAGE_KEYS.USER_FIXED_MIN] || null;
    userFixedMax = data[STORAGE_KEYS.USER_FIXED_MAX] || null;
    customRules = Array.isArray(data[STORAGE_KEYS.CUSTOM_RULES]) ? data[STORAGE_KEYS.CUSTOM_RULES] : [];
    console.log('[UJM] Loaded user settings:', { userHourlyRate, userFixedMin, userFixedMax, customRulesCount: customRules.length });

    // Process cards AFTER settings are loaded
    checkExtensionEnabled().then(() => {
      processAllVisible();
      // Retry after short delay in case cards load after document_idle
      setTimeout(processAllVisible, 1500);
    });
  });

  // Listen for changes to user hourly rate and fixed price range
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      let settingsChanged = false;
      if (changes[STORAGE_KEYS.USER_HOURLY_RATE]) {
        userHourlyRate = changes[STORAGE_KEYS.USER_HOURLY_RATE].newValue || null;
        console.log('[UJM] Updated userHourlyRate:', userHourlyRate);
        settingsChanged = true;
      }
      if (changes[STORAGE_KEYS.USER_FIXED_MIN]) {
        userFixedMin = changes[STORAGE_KEYS.USER_FIXED_MIN].newValue || null;
        console.log('[UJM] Updated userFixedMin:', userFixedMin);
        settingsChanged = true;
      }
      if (changes[STORAGE_KEYS.USER_FIXED_MAX]) {
        userFixedMax = changes[STORAGE_KEYS.USER_FIXED_MAX].newValue || null;
        console.log('[UJM] Updated userFixedMax:', userFixedMax);
        settingsChanged = true;
      }
      if (changes[STORAGE_KEYS.CUSTOM_RULES]) {
        customRules = Array.isArray(changes[STORAGE_KEYS.CUSTOM_RULES].newValue) ? changes[STORAGE_KEYS.CUSTOM_RULES].newValue : [];
        console.log('[UJM] Updated customRules:', customRules.length, 'rules');
        settingsChanged = true;
      }
      if (settingsChanged) {
        processedCards = new WeakSet();
        if (extensionEnabled) processAllVisible();
      }
    }
  });

})();
