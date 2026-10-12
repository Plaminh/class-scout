import { DEFAULT_FILTERS } from "./config.js";

const KEYS = {
  SEEN_CODES: "class_scout_seen_codes",
  STARRED_CODES: "class_scout_starred_codes",
  LAST_REFRESH: "class_scout_last_refresh",
  FILTERS: "class_scout_filters"
};

// In-memory fallback if localStorage is disabled or throws
const memoryStorage = {
  seen: new Set(),
  starred: new Set(),
  lastRefresh: null,
  filters: null
};

/**
 * Deep clones a plain object.
 * @param {any} obj 
 * @returns {any}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Checks if localStorage is accessible.
 * @returns {boolean}
 */
function isLocalStorageAvailable() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    const testKey = "__test_storage__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Loads a Set from localStorage or fallback.
 * @param {string} key 
 * @param {Set} fallbackSet 
 * @returns {Set<string>}
 */
function loadSet(key, fallbackSet) {
  try {
    if (isLocalStorageAvailable()) {
      const item = window.localStorage.getItem(key);
      if (item) {
        const arr = JSON.parse(item);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      }
    }
  } catch (_e) {
    // Fall back to memory
  }
  return new Set(fallbackSet);
}

/**
 * Saves a Set to localStorage or fallback.
 * @param {string} key 
 * @param {Set<string>} set 
 * @param {Set} fallbackSet 
 */
function saveSet(key, set, fallbackSet) {
  try {
    fallbackSet.clear();
    for (const val of set) {
      fallbackSet.add(val);
    }
    if (isLocalStorageAvailable()) {
      window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
    }
  } catch (_e) {
    // Storage quota or error; memory already updated
  }
}

/**
 * Gets a snapshot of seen codes.
 * @returns {Set<string>}
 */
export function getSeenCodes() {
  return loadSet(KEYS.SEEN_CODES, memoryStorage.seen);
}

/**
 * Adds multiple codes to seen set and persists.
 * @param {Iterable<string>} codes 
 */
export function markCodesAsSeen(codes) {
  const current = getSeenCodes();
  for (const code of codes) {
    if (code) current.add(code);
  }
  saveSet(KEYS.SEEN_CODES, current, memoryStorage.seen);
}

/**
 * Gets a snapshot of starred codes.
 * @returns {Set<string>}
 */
export function getStarredCodes() {
  return loadSet(KEYS.STARRED_CODES, memoryStorage.starred);
}

/**
 * Toggles the starred status of a code and returns new status.
 * @param {string} code 
 * @returns {boolean}
 */
export function toggleStarCode(code) {
  if (!code) return false;
  const current = getStarredCodes();
  const willStar = !current.has(code);
  if (willStar) {
    current.add(code);
  } else {
    current.delete(code);
  }
  saveSet(KEYS.STARRED_CODES, current, memoryStorage.starred);
  return willStar;
}

/**
 * Checks if a code is starred.
 * @param {string} code 
 * @returns {boolean}
 */
export function isCodeStarred(code) {
  if (!code) return false;
  return getStarredCodes().has(code);
}

/**
 * Gets the last refresh timestamp in milliseconds, or null.
 * @returns {number|null}
 */
export function getLastRefreshTime() {
  try {
    if (isLocalStorageAvailable()) {
      const item = window.localStorage.getItem(KEYS.LAST_REFRESH);
      if (item) {
        const val = parseInt(item, 10);
        return isNaN(val) ? null : val;
      }
    }
  } catch (_e) {
    // Fall back to memory
  }
  return memoryStorage.lastRefresh;
}

/**
 * Sets the last refresh timestamp.
 * @param {number} timestamp 
 */
export function setLastRefreshTime(timestamp) {
  memoryStorage.lastRefresh = timestamp;
  try {
    if (isLocalStorageAvailable()) {
      window.localStorage.setItem(KEYS.LAST_REFRESH, String(timestamp));
    }
  } catch (_e) {
    // Ignore
  }
}

/**
 * Validates and merges an unknown object into a valid Filters object conforming to DEFAULT_FILTERS.
 * Drops unknown keys, clamps numbers, validates types, and falls back to defaults for missing/invalid fields.
 * Never throws.
 * @param {unknown} raw 
 * @returns {object}
 */
export function validateAndMergeFilters(raw) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return deepClone(DEFAULT_FILTERS);
    }

    // Version check: if version doesn't match, fall back to defaults
    if (raw.version !== DEFAULT_FILTERS.version) {
      return deepClone(DEFAULT_FILTERS);
    }

    const result = {
      version: DEFAULT_FILTERS.version
    };

    // minFee: number >= 0, clamped between 0 and 10,000,000
    if (typeof raw.minFee === "number" && !isNaN(raw.minFee)) {
      result.minFee = Math.max(0, Math.min(10000000, Math.round(raw.minFee)));
    } else {
      result.minFee = DEFAULT_FILTERS.minFee;
    }

    // maxKm: number >= 0, clamped between 0 and 100 (rounded to 1 decimal place)
    if (typeof raw.maxKm === "number" && !isNaN(raw.maxKm)) {
      result.maxKm = Math.max(0, Math.min(100, Math.round(raw.maxKm * 10) / 10));
    } else {
      result.maxKm = DEFAULT_FILTERS.maxKm;
    }

    // sessionsPerWeek: { min, max }
    if (raw.sessionsPerWeek && typeof raw.sessionsPerWeek === "object" && !Array.isArray(raw.sessionsPerWeek)) {
      let min = typeof raw.sessionsPerWeek.min === "number" && !isNaN(raw.sessionsPerWeek.min)
        ? Math.max(1, Math.min(7, Math.round(raw.sessionsPerWeek.min)))
        : DEFAULT_FILTERS.sessionsPerWeek.min;
      let max = typeof raw.sessionsPerWeek.max === "number" && !isNaN(raw.sessionsPerWeek.max)
        ? Math.max(1, Math.min(7, Math.round(raw.sessionsPerWeek.max)))
        : DEFAULT_FILTERS.sessionsPerWeek.max;
      if (min > max) {
        max = min;
      }
      result.sessionsPerWeek = { min, max };
    } else {
      result.sessionsPerWeek = deepClone(DEFAULT_FILTERS.sessionsPerWeek);
    }

    // skipGrades: array of numbers in 1..12
    if (Array.isArray(raw.skipGrades)) {
      const validGrades = raw.skipGrades
        .filter((g) => Number.isInteger(g) && g >= 1 && g <= 12);
      result.skipGrades = Array.from(new Set(validGrades)).sort((a, b) => a - b);
    } else {
      result.skipGrades = [...DEFAULT_FILTERS.skipGrades];
    }

    // excludeGenderOnly: array of allowed values ["nam", "nu"]
    if (Array.isArray(raw.excludeGenderOnly)) {
      const validGenders = raw.excludeGenderOnly
        .filter((g) => g === "nam" || g === "nu");
      result.excludeGenderOnly = Array.from(new Set(validGenders));
    } else {
      result.excludeGenderOnly = [...DEFAULT_FILTERS.excludeGenderOnly];
    }

    // unknownLocation: "review" | "reject"
    if (raw.unknownLocation === "review" || raw.unknownLocation === "reject") {
      result.unknownLocation = raw.unknownLocation;
    } else {
      result.unknownLocation = DEFAULT_FILTERS.unknownLocation;
    }

    // rules
    result.rules = {};
    const defaultRules = DEFAULT_FILTERS.rules;
    const rawRules = (raw.rules && typeof raw.rules === "object" && !Array.isArray(raw.rules)) ? raw.rules : {};

    for (const ruleKey of Object.keys(defaultRules)) {
      const defaultRule = defaultRules[ruleKey];
      const rawRule = rawRules[ruleKey];

      if (rawRule && typeof rawRule === "object" && !Array.isArray(rawRule)) {
        const ruleObj = {
          enabled: typeof rawRule.enabled === "boolean" ? rawRule.enabled : defaultRule.enabled
        };

        if (defaultRule.keywords !== undefined) {
          if (Array.isArray(rawRule.keywords)) {
            ruleObj.keywords = rawRule.keywords
              .filter((k) => typeof k === "string")
              .map((k) => k.trim())
              .filter(Boolean);
          } else {
            ruleObj.keywords = [...defaultRule.keywords];
          }
        }

        if (defaultRule.exceptKeywords !== undefined) {
          if (Array.isArray(rawRule.exceptKeywords)) {
            ruleObj.exceptKeywords = rawRule.exceptKeywords
              .filter((k) => typeof k === "string")
              .map((k) => k.trim())
              .filter(Boolean);
          } else {
            ruleObj.exceptKeywords = [...defaultRule.exceptKeywords];
          }
        }

        result.rules[ruleKey] = ruleObj;
      } else {
        result.rules[ruleKey] = deepClone(defaultRule);
      }
    }

    return result;
  } catch (_e) {
    return deepClone(DEFAULT_FILTERS);
  }
}

/**
 * Loads filters from localStorage or in-memory fallback.
 * Validates, merges with defaults, and never throws.
 * @returns {object}
 */
export function loadFilters() {
  try {
    if (isLocalStorageAvailable()) {
      const item = window.localStorage.getItem(KEYS.FILTERS);
      if (item) {
        const parsed = JSON.parse(item);
        const validated = validateAndMergeFilters(parsed);
        memoryStorage.filters = deepClone(validated);
        return validated;
      }
    }
  } catch (_e) {
    // Fall back to memory
  }

  if (memoryStorage.filters) {
    return validateAndMergeFilters(memoryStorage.filters);
  }

  const def = deepClone(DEFAULT_FILTERS);
  memoryStorage.filters = deepClone(def);
  return def;
}

/**
 * Saves filters to localStorage and memory storage.
 * Never throws.
 * @param {object} filters 
 */
export function saveFilters(filters) {
  try {
    const validated = validateAndMergeFilters(filters);
    memoryStorage.filters = deepClone(validated);
    if (isLocalStorageAvailable()) {
      window.localStorage.setItem(KEYS.FILTERS, JSON.stringify(validated));
    }
  } catch (_e) {
    // Ignore quota or storage errors
  }
}

/**
 * Resets filters to DEFAULT_FILTERS in localStorage and memory.
 * Never throws.
 * @returns {object}
 */
export function resetFilters() {
  const def = deepClone(DEFAULT_FILTERS);
  saveFilters(def);
  return def;
}
