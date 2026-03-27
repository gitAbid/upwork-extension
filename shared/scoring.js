// shared/scoring.js — pure rules-based scoring functions, no DOM/network

/**
 * applyRulesScore(jobData, userHourlyRate, userFixedMin, userFixedMax) → { score: 0-100, flags: string[] }
 *
 * Point allocation (raw max 130, normalized to 100):
 * - Proposals: <5 → 30pts, 5-15 → 20pts, 15-30 → 10pts, 30-50 → 5pts, 50+ → 0pts
 * - Hourly budget (with user rate):
 *   * Below minimum (< range low) → 0pts
 *   * Budget friendly (range low to midpoint) → 30pts
 *   * Near top of range (midpoint to range high) → 25pts
 *   * Above market (range high to premium threshold) → 15pts
 *   * Premium (> premium threshold) → 5pts
 * - Hourly budget (without user rate): $30-80/hr → 30pts, $81-150 → 20pts, $20-29 → 15pts, <$20 → 0pts
 * - Fixed price (with user range):
 *   * Not viable (< your min) → 0pts
 *   * Acceptable (your min to midpoint) → 20pts
 *   * Good fit (midpoint to your max) → 30pts
 *   * Premium opportunity (> your max) → 35pts
 * - Fixed price (without user range): $100-500 → 30pts, $500-1000 → 20pts, <$100 → 5pts, >$1000 → 15pts
 * - Client location: US/UK/AU → 25pts, Canada → 15pts, W. Europe → 10pts, other → 0pts
 * - Posted time: <1hr → 15pts, 1-6hr → 10pts, 6-24hr → 5pts, >1 day → 0pts
 */
function applyRulesScore(jobData, userHourlyRate, userFixedMin, userFixedMax) {
  const flags = [];
  const rateLabels = {};
  let rawPoints = 0;
  const RAW_MAX = 130;

  // --- Proposals scoring ---
  const proposals = jobData.proposalCount ?? 999;
  if (proposals < 5) {
    rawPoints += 30;
    flags.push('low_competition');
  } else if (proposals < 15) {
    rawPoints += 20;
  } else if (proposals < 30) {
    rawPoints += 10;
  } else if (proposals < 50) {
    rawPoints += 5;
    flags.push('high_competition');
  } else {
    rawPoints += 0;
    flags.push('high_competition');
  }

  // --- Budget scoring ---
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
  // Unknown budget: 0 points, no flag

  // --- Client location scoring ---
  const country = (jobData.clientCountry ?? '').trim();
  const usUkAu = ['United States', 'United Kingdom', 'Australia'];
  const westernEurope = ['Germany', 'France', 'Netherlands', 'Sweden', 'Denmark',
    'Norway', 'Switzerland', 'Belgium', 'Austria', 'Finland', 'Ireland'];
  if (usUkAu.some(c => country.toLowerCase().includes(c.toLowerCase()))) {
    rawPoints += 25;
    flags.push('preferred_location');
  } else if (country.toLowerCase().includes('canada')) {
    rawPoints += 15;
    flags.push('good_location');
  } else if (westernEurope.some(c => country.toLowerCase().includes(c.toLowerCase()))) {
    rawPoints += 10;
    flags.push('acceptable_location');
  } else {
    rawPoints += 0;
  }

  // --- Posted time scoring ---
  const postedTime = (jobData.postedTime ?? '').toLowerCase();
  if (postedTime.includes('minute') || postedTime.includes('just now') ||
      (postedTime.includes('hour') && extractNumber(postedTime) < 1)) {
    rawPoints += 15;
    flags.push('just_posted');
  } else if (postedTime.includes('hour') && extractNumber(postedTime) <= 6) {
    rawPoints += 10;
    flags.push('recently_posted');
  } else if (postedTime.includes('hour') && extractNumber(postedTime) <= 24) {
    rawPoints += 5;
  } else {
    rawPoints += 0;
    flags.push('old_posting');
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

/**
 * applyCustomRules(jobData, rules) → { bonusPoints: number, flags: string[] }
 *
 * Evaluates user-defined custom rules as additive modifiers on top of base scoring.
 * Positive points = bonus, negative = penalty, 0 = flag only.
 */
function applyCustomRules(jobData, rules) {
  const flags = [];
  let bonusPoints = 0;

  const NUMERIC_FIELDS = ['proposals', 'budget_min', 'budget_max'];

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

/**
 * combineScores(rulesScore, llmScore, weights) → final weighted score (0-100)
 * weights: { rules: 0-100, llm: 0-100 } (should sum to 100)
 */
function combineScores(rulesScore, llmScore, weights) {
  const rw = (weights.rules ?? 40) / 100;
  const lw = (weights.llm ?? 60) / 100;
  return Math.round(rulesScore * rw + llmScore * lw);
}
