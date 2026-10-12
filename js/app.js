import { SOURCES, REFRESH_MS, DEFAULT_FILTERS } from "./config.js";
import { fetchAllSubjects } from "./fetcher.js";
import { parseListing } from "./parser.js";
import { evaluate } from "./rules.js";
import { getDistance, setDistrictsTable } from "./distance.js";
import {
  getSeenCodes,
  markCodesAsSeen,
  isCodeStarred,
  toggleStarCode,
  getLastRefreshTime,
  setLastRefreshTime,
  loadFilters,
  saveFilters,
  resetFilters
} from "./storage.js";
import { renderHeader, renderControls, renderListings } from "./ui.js";
import { SettingsDrawer, countFilterDifferences } from "./settings.js";

// Application State
const state = {
  rawEnrichedListings: [], // Enriched listings (listing.km computed once)
  evaluatedListings: [],   // Evaluated listings with current filter rules
  filters: loadFilters(),  // Filter criteria from storage
  errors: [],
  lastRefresh: getLastRefreshTime(),
  isRefreshing: false,
  currentTab: "pass",      // "pass" | "review" | "rejected"
  subjectFilter: "",
  availableSubjects: Object.keys(SOURCES),
  searchQuery: "",
  newOnly: false,
  starredOnly: false,
  sortBy: "default"        // "default" | "nearest" | "highestFee"
};

// DOM Container Elements & Settings Controller
let headerContainer;
let controlsContainer;
let listingsContainer;
let settingsDrawer;

/**
 * Stage (b): Evaluates all cached enriched listings with current filters and re-renders.
 * Instant evaluation: zero network requests, zero distance recalculations.
 */
export function applyFilters() {
  const evaluated = [];
  for (const listing of state.rawEnrichedListings) {
    evaluate(listing, state.filters);
    evaluated.push(listing);
  }
  state.evaluatedListings = evaluated;
  updateUI();
}

/**
 * Filters and sorts listings based on current search/tab/sort criteria.
 * @returns {Array<object>}
 */
function getFilteredAndSortedListings() {
  let list = state.evaluatedListings.filter((l) => l.status === state.currentTab);

  // Subject filter
  if (state.subjectFilter) {
    list = list.filter((l) => l.subjects && l.subjects.includes(state.subjectFilter));
  }

  // Text search over raw listing text
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    list = list.filter((l) => (l.raw || "").toLowerCase().includes(q));
  }

  // New only
  if (state.newOnly) {
    list = list.filter((l) => l.isNew);
  }

  // Starred only
  if (state.starredOnly) {
    list = list.filter((l) => l.isStarred);
  }

  // Sorting
  if (state.sortBy === "nearest") {
    list = [...list].sort((a, b) => {
      if (a.km === null && b.km === null) return 0;
      if (a.km === null) return 1;
      if (b.km === null) return -1;
      return a.km - b.km;
    });
  } else if (state.sortBy === "highestFee") {
    list = [...list].sort((a, b) => {
      if (a.feePerSession === null && b.feePerSession === null) return 0;
      if (a.feePerSession === null) return 1;
      if (b.feePerSession === null) return -1;
      return b.feePerSession - a.feePerSession;
    });
  }

  return list;
}

/**
 * Calculates listing counts for tabs: Phù hợp, Cần xem, Đã loại.
 * @returns {{ pass: number, review: number, rejected: number }}
 */
function getTabCounts() {
  const counts = { pass: 0, review: 0, rejected: 0 };
  for (const l of state.evaluatedListings) {
    if (counts[l.status] !== undefined) {
      counts[l.status]++;
    }
  }
  return counts;
}

/**
 * Re-renders the entire UI (header, controls, listings).
 */
function updateUI() {
  const counts = getTabCounts();
  const diffCount = countFilterDifferences(state.filters, DEFAULT_FILTERS);

  renderHeader(headerContainer, {
    lastRefresh: state.lastRefresh,
    errors: state.errors,
    onRefresh: () => refresh(),
    isRefreshing: state.isRefreshing,
    diffCount,
    onOpenSettings: () => {
      if (settingsDrawer) {
        settingsDrawer.open();
      }
    }
  });

  renderControls(controlsContainer, {
    currentTab: state.currentTab,
    counts,
    subjectFilter: state.subjectFilter,
    availableSubjects: state.availableSubjects,
    searchQuery: state.searchQuery,
    newOnly: state.newOnly,
    starredOnly: state.starredOnly,
    sortBy: state.sortBy,
    onTabChange: (tab) => {
      state.currentTab = tab;
      updateUI();
    },
    onSubjectChange: (sub) => {
      state.subjectFilter = sub;
      updateUI();
    },
    onSearchChange: (query) => {
      state.searchQuery = query;
      updateListingsOnly();
    },
    onNewOnlyChange: (val) => {
      state.newOnly = val;
      updateListingsOnly();
    },
    onStarredOnlyChange: (val) => {
      state.starredOnly = val;
      updateListingsOnly();
    },
    onSortChange: (sort) => {
      state.sortBy = sort;
      updateListingsOnly();
    }
  });

  updateListingsOnly();
}

/**
 * Updates only the listings container to preserve input focus during search.
 */
function updateListingsOnly() {
  const listings = getFilteredAndSortedListings();
  renderListings(listingsContainer, listings, {
    onToggleStar: (code) => {
      const isStarred = toggleStarCode(code);
      const targetCached = state.rawEnrichedListings.find((l) => l.code === code);
      if (targetCached) {
        targetCached.isStarred = isStarred;
      }
      const targetEvaluated = state.evaluatedListings.find((l) => l.code === code);
      if (targetEvaluated) {
        targetEvaluated.isStarred = isStarred;
      }
      updateListingsOnly();
    }
  });
}

/**
 * Stage (a): Fetches, parses, deduplicates, and enriches all listings.
 * Distance lookup (listing.km) is computed ONCE here.
 * @returns {Promise<void>}
 */
export async function refresh() {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  updateUI();

  try {
    // 1. Snapshot seen codes before this refresh to detect new listings
    const previouslySeen = getSeenCodes();

    // 2. Fetch all subjects in parallel
    const subjectResults = await fetchAllSubjects(SOURCES);

    // 3. Collect errors and parse cells
    const errors = [];
    const rawParsedList = [];

    for (const res of subjectResults) {
      if (res.error) {
        errors.push({ subject: res.subject, error: res.error });
      }

      for (const cellText of res.cells) {
        const listing = parseListing(cellText, res.subject);
        if (listing) {
          rawParsedList.push(listing);
        }
      }
    }

    state.errors = errors;

    // 4. Dedupe by code and merge subjects
    const listingMap = new Map();
    for (const listing of rawParsedList) {
      if (listingMap.has(listing.code)) {
        const existing = listingMap.get(listing.code);
        for (const sub of listing.subjects) {
          if (!existing.subjects.includes(sub)) {
            existing.subjects.push(sub);
          }
        }
      } else {
        listingMap.set(listing.code, listing);
      }
    }

    // 5. Enrich: distance lookup (listing.km) computed ONCE, star and new flags
    const enrichedList = [];
    for (const listing of listingMap.values()) {
      const distResult = getDistance(listing.address);
      listing.km = distResult ? distResult.km : null;
      listing.isNew = !previouslySeen.has(listing.code);
      listing.isStarred = isCodeStarred(listing.code);
      enrichedList.push(listing);
    }

    state.rawEnrichedListings = enrichedList;

    // 6. Persist seen codes and refresh timestamp
    markCodesAsSeen(listingMap.keys());
    const now = Date.now();
    state.lastRefresh = now;
    setLastRefreshTime(now);

    // 7. Stage (b): Apply filter rules and render
    applyFilters();
  } catch (_err) {
    // Graceful error handling
  } finally {
    state.isRefreshing = false;
    updateUI();
  }
}

/**
 * Initializes the application on page load.
 */
async function init() {
  headerContainer = document.getElementById("header-container");
  controlsContainer = document.getElementById("controls-container");
  listingsContainer = document.getElementById("listings-container");

  // Load active filters from storage
  state.filters = loadFilters();

  // Initialize Settings Drawer
  settingsDrawer = new SettingsDrawer({
    initialFilters: state.filters,
    onFilterChange: (newFilters) => {
      state.filters = newFilters;
      saveFilters(newFilters);
      applyFilters();
    },
    onResetFilters: () => {
      const def = resetFilters();
      state.filters = def;
      settingsDrawer.updateFilters(def);
      applyFilters();
    }
  });

  // Load districts lookup table
  try {
    const res = await fetch("data/districts.json");
    if (res.ok) {
      const data = await res.json();
      setDistrictsTable(data);
    }
  } catch (_e) {
    // Falls back to DEFAULT_DISTRICTS embedded in distance.js
  }

  // Initial render
  updateUI();

  // Run initial refresh
  await refresh();

  // Periodic refresh every REFRESH_MS (15 minutes)
  setInterval(() => {
    refresh();
  }, REFRESH_MS);

  // Refresh on tab focus if data is older than REFRESH_MS
  window.addEventListener("focus", () => {
    const last = getLastRefreshTime();
    if (last && Date.now() - last > REFRESH_MS && !state.isRefreshing) {
      refresh();
    }
  });
}

// Start app once DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
