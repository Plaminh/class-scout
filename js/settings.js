import { DEFAULT_FILTERS } from "./config.js";

/**
 * Creates a DOM element with className and optional textContent.
 * Strict DOM API only (DOM nodes and textContent).
 * @param {string} tag 
 * @param {string} [className] 
 * @param {string} [text] 
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) {
    element.textContent = text;
  }
  return element;
}

/**
 * Counts how many settings differ from DEFAULT_FILTERS.
 * @param {object} filters 
 * @param {object} [defaultFilters=DEFAULT_FILTERS] 
 * @returns {number}
 */
export function countFilterDifferences(filters, defaultFilters = DEFAULT_FILTERS) {
  if (!filters) return 0;
  let count = 0;

  // 1. minFee
  if (filters.minFee !== defaultFilters.minFee) count++;

  // 2. maxKm
  if (filters.maxKm !== defaultFilters.maxKm) count++;

  // 3. unknownLocation
  if (filters.unknownLocation !== defaultFilters.unknownLocation) count++;

  // 4. sessionsPerWeek
  const sDef = defaultFilters.sessionsPerWeek || {};
  const sCur = filters.sessionsPerWeek || {};
  if (sCur.min !== sDef.min || sCur.max !== sDef.max) count++;

  // 5. skipGrades
  const gradesDef = new Set(defaultFilters.skipGrades || []);
  const gradesCur = new Set(filters.skipGrades || []);
  if (gradesDef.size !== gradesCur.size || [...gradesCur].some((g) => !gradesDef.has(g))) {
    count++;
  }

  // 6. excludeGenderOnly
  const genderDef = new Set(defaultFilters.excludeGenderOnly || []);
  const genderCur = new Set(filters.excludeGenderOnly || []);
  if (genderDef.size !== genderCur.size || [...genderCur].some((g) => !genderDef.has(g))) {
    count++;
  }

  // 7. rules
  const rulesDef = defaultFilters.rules || {};
  const rulesCur = filters.rules || {};

  for (const key of Object.keys(rulesDef)) {
    const rDef = rulesDef[key] || {};
    const rCur = rulesCur[key] || {};

    let ruleDiff = false;
    if (rCur.enabled !== rDef.enabled) {
      ruleDiff = true;
    }

    if (rDef.keywords !== undefined) {
      const kwDef = (rDef.keywords || []).map((k) => k.trim().toLowerCase());
      const kwCur = (rCur.keywords || []).map((k) => k.trim().toLowerCase());
      if (kwDef.length !== kwCur.length || kwCur.some((k, idx) => k !== kwDef[idx])) {
        ruleDiff = true;
      }
    }

    if (rDef.exceptKeywords !== undefined) {
      const exDef = (rDef.exceptKeywords || []).map((k) => k.trim().toLowerCase());
      const exCur = (rCur.exceptKeywords || []).map((k) => k.trim().toLowerCase());
      if (exDef.length !== exCur.length || exCur.some((k, idx) => k !== exDef[idx])) {
        ruleDiff = true;
      }
    }

    if (ruleDiff) count++;
  }

  return count;
}

/**
 * Splits text by commas or newlines into trimmed non-empty keywords.
 * @param {string} text 
 * @returns {string[]}
 */
function parseKeywordsText(text) {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Settings Drawer Controller
 */
export class SettingsDrawer {
  /**
   * @param {object} options
   * @param {object} options.initialFilters
   * @param {function(object): void} options.onFilterChange
   * @param {function(): void} options.onResetFilters
   */
  constructor({ initialFilters, onFilterChange, onResetFilters }) {
    this.filters = JSON.parse(JSON.stringify(initialFilters));
    this.onFilterChange = onFilterChange;
    this.onResetFilters = onResetFilters;
    this.isOpen = false;
    this.lastFocusedElement = null;
    this.debounceTimer = null;

    this.initDOM();
  }

  /**
   * Initializes and appends drawer and overlay DOM.
   */
  initDOM() {
    // Overlay
    this.overlay = el("div", "settings-overlay");
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.addEventListener("click", () => this.close());

    // Drawer container
    this.drawer = el("aside", "settings-drawer");
    this.drawer.setAttribute("role", "dialog");
    this.drawer.setAttribute("aria-modal", "true");
    this.drawer.setAttribute("aria-labelledby", "settings-drawer-title");
    this.drawer.setAttribute("aria-hidden", "true");

    // Header
    const header = el("div", "settings-header");
    const title = el("h2", "settings-title", "Bộ lọc tìm kiếm");
    title.id = "settings-drawer-title";

    this.closeBtn = el("button", "settings-close-btn", "✕");
    this.closeBtn.type = "button";
    this.closeBtn.setAttribute("aria-label", "Đóng bộ lọc");
    this.closeBtn.addEventListener("click", () => this.close());

    header.append(title, this.closeBtn);
    this.drawer.append(header);

    // Body container
    this.body = el("div", "settings-body");
    this.renderBody();
    this.drawer.append(this.body);

    // Mount to document
    document.body.append(this.overlay, this.drawer);

    // Global Esc listener
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * Renders all settings controls into this.body.
   */
  renderBody() {
    this.body.replaceChildren();

    // Short note
    const noteBanner = el("div", "settings-note");
    noteBanner.append(el("span", "note-icon", "ℹ️ "));
    noteBanner.append(el("span", "", "Khoảng cách chỉ là ước lượng theo quận."));
    this.body.append(noteBanner);

    // Group 1: Học phí & khoảng cách
    this.renderFeeAndDistanceGroup();

    // Group 2: Lịch & lớp
    this.renderScheduleAndGradeGroup();

    // Group 3: Giới tính
    this.renderGenderGroup();

    // Group 4: Luật theo từ khóa
    this.renderKeywordRulesGroup();

    // Group 5: Lớp ONLINE
    this.renderOnlineGroup();

    // Group 6: Khôi phục mặc định
    this.renderResetGroup();
  }

  /**
   * Dispatches debounced filter changes.
   * @param {boolean} [immediate=false]
   */
  triggerChange(immediate = false) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const emit = () => {
      if (typeof this.onFilterChange === "function") {
        this.onFilterChange(JSON.parse(JSON.stringify(this.filters)));
      }
    };

    if (immediate) {
      emit();
    } else {
      this.debounceTimer = setTimeout(emit, 300);
    }
  }

  /**
   * Group 1: Học phí & khoảng cách
   */
  renderFeeAndDistanceGroup() {
    const group = el("section", "settings-group");
    group.append(el("h3", "settings-group-title", "Học phí & khoảng cách"));

    // Min fee
    const feeRow = el("div", "settings-field");
    const feeLabel = el("label", "settings-label", "Loại nếu học phí ≤ (đ/buổi):");
    feeLabel.htmlFor = "filter-min-fee";
    const feeInput = el("input", "settings-input");
    feeInput.id = "filter-min-fee";
    feeInput.type = "number";
    feeInput.min = "0";
    feeInput.step = "5000";
    feeInput.value = String(this.filters.minFee ?? 0);
    feeInput.placeholder = "0 = tắt";
    feeInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      this.filters.minFee = isNaN(val) || val < 0 ? 0 : val;
      this.triggerChange(false);
    });
    const feeHelp = el("span", "field-hint", "0 = tắt quy tắc này");
    feeRow.append(feeLabel, feeInput, feeHelp);
    group.append(feeRow);

    // Max km
    const kmRow = el("div", "settings-field");
    const kmLabel = el("label", "settings-label", "Khoảng cách tối đa (km):");
    kmLabel.htmlFor = "filter-max-km";
    const kmInput = el("input", "settings-input");
    kmInput.id = "filter-max-km";
    kmInput.type = "number";
    kmInput.min = "0";
    kmInput.step = "0.5";
    kmInput.value = String(this.filters.maxKm ?? 0);
    kmInput.placeholder = "0 = tắt";
    kmInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      this.filters.maxKm = isNaN(val) || val < 0 ? 0 : val;
      this.triggerChange(false);
    });
    const kmHelp = el("span", "field-hint", "0 = tắt quy tắc này");
    kmRow.append(kmLabel, kmInput, kmHelp);
    group.append(kmRow);

    // Unknown location behavior
    const locRow = el("div", "settings-field");
    const locLabel = el("label", "settings-label", "Khi không xác định được vị trí:");
    locLabel.htmlFor = "filter-unknown-loc";
    const locSelect = el("select", "settings-select");
    locSelect.id = "filter-unknown-loc";

    const optReview = el("option", "", "Cần xem");
    optReview.value = "review";
    const optReject = el("option", "", "Loại");
    optReject.value = "reject";

    if (this.filters.unknownLocation === "reject") {
      optReject.selected = true;
    } else {
      optReview.selected = true;
    }

    locSelect.append(optReview, optReject);
    locSelect.addEventListener("change", (e) => {
      this.filters.unknownLocation = e.target.value;
      this.triggerChange(true);
    });

    locRow.append(locLabel, locSelect);
    group.append(locRow);

    this.body.append(group);
  }

  /**
   * Group 2: Lịch & lớp
   */
  renderScheduleAndGradeGroup() {
    const group = el("section", "settings-group");
    group.append(el("h3", "settings-group-title", "Lịch & lớp"));

    // Sessions per week min/max
    const sessField = el("div", "settings-field");
    const sessLabel = el("label", "settings-label", "Số buổi/tuần (chấp nhận):");
    sessField.append(sessLabel);

    const rangeRow = el("div", "range-row");
    const minInput = el("input", "settings-input range-input");
    minInput.id = "filter-sess-min";
    minInput.type = "number";
    minInput.min = "1";
    minInput.max = "7";
    minInput.value = String(this.filters.sessionsPerWeek?.min ?? 2);
    minInput.setAttribute("aria-label", "Số buổi tối thiểu");

    const spanTo = el("span", "range-separator", "đến");

    const maxInput = el("input", "settings-input range-input");
    maxInput.id = "filter-sess-max";
    maxInput.type = "number";
    maxInput.min = "1";
    maxInput.max = "7";
    maxInput.value = String(this.filters.sessionsPerWeek?.max ?? 3);
    maxInput.setAttribute("aria-label", "Số buổi tối đa");

    const updateSessions = () => {
      let min = parseInt(minInput.value, 10);
      let max = parseInt(maxInput.value, 10);
      if (isNaN(min) || min < 1) min = 1;
      if (isNaN(max) || max < 1) max = 1;
      if (min > max) max = min;
      this.filters.sessionsPerWeek = { min, max };
      this.triggerChange(false);
    };

    minInput.addEventListener("input", updateSessions);
    maxInput.addEventListener("input", updateSessions);

    rangeRow.append(minInput, spanTo, maxInput);
    sessField.append(rangeRow);
    group.append(sessField);

    // Skip grades (chips 1..12)
    const gradeField = el("div", "settings-field");
    const gradeLabel = el("label", "settings-label", "Bỏ qua các lớp (bấm để loại):");
    gradeField.append(gradeLabel);

    const chipsContainer = el("div", "grade-chips-container");
    chipsContainer.setAttribute("role", "group");
    chipsContainer.setAttribute("aria-label", "Bỏ qua các lớp");

    if (!Array.isArray(this.filters.skipGrades)) {
      this.filters.skipGrades = [];
    }

    for (let g = 1; g <= 12; g++) {
      const isSkipped = this.filters.skipGrades.includes(g);
      const chip = el(
        "button",
        `grade-chip ${isSkipped ? "chip-skipped" : ""}`,
        `Lớp ${g}`
      );
      chip.type = "button";
      chip.setAttribute("aria-pressed", isSkipped ? "true" : "false");
      chip.addEventListener("click", () => {
        const idx = this.filters.skipGrades.indexOf(g);
        if (idx >= 0) {
          this.filters.skipGrades.splice(idx, 1);
          chip.classList.remove("chip-skipped");
          chip.setAttribute("aria-pressed", "false");
        } else {
          this.filters.skipGrades.push(g);
          this.filters.skipGrades.sort((a, b) => a - b);
          chip.classList.add("chip-skipped");
          chip.setAttribute("aria-pressed", "true");
        }
        this.triggerChange(true);
      });
      chipsContainer.append(chip);
    }

    gradeField.append(chipsContainer);
    group.append(gradeField);

    this.body.append(group);
  }

  /**
   * Group 3: Giới tính
   */
  renderGenderGroup() {
    const group = el("section", "settings-group");
    group.append(el("h3", "settings-group-title", "Giới tính"));

    if (!Array.isArray(this.filters.excludeGenderOnly)) {
      this.filters.excludeGenderOnly = [];
    }

    // Checkbox Male
    const maleLabel = el("label", "settings-checkbox-label");
    const maleCheck = el("input", "settings-checkbox");
    maleCheck.type = "checkbox";
    maleCheck.id = "filter-exclude-male";
    maleCheck.checked = this.filters.excludeGenderOnly.includes("nam");
    maleCheck.addEventListener("change", (e) => {
      const idx = this.filters.excludeGenderOnly.indexOf("nam");
      if (e.target.checked && idx === -1) {
        this.filters.excludeGenderOnly.push("nam");
      } else if (!e.target.checked && idx >= 0) {
        this.filters.excludeGenderOnly.splice(idx, 1);
      }
      this.triggerChange(true);
    });
    maleLabel.append(maleCheck, el("span", "", "Loại lớp chỉ nhận Nam"));
    group.append(maleLabel);

    // Checkbox Female
    const femaleLabel = el("label", "settings-checkbox-label");
    const femaleCheck = el("input", "settings-checkbox");
    femaleCheck.type = "checkbox";
    femaleCheck.id = "filter-exclude-female";
    femaleCheck.checked = this.filters.excludeGenderOnly.includes("nu");
    femaleCheck.addEventListener("change", (e) => {
      const idx = this.filters.excludeGenderOnly.indexOf("nu");
      if (e.target.checked && idx === -1) {
        this.filters.excludeGenderOnly.push("nu");
      } else if (!e.target.checked && idx >= 0) {
        this.filters.excludeGenderOnly.splice(idx, 1);
      }
      this.triggerChange(true);
    });
    femaleLabel.append(femaleCheck, el("span", "", "Loại lớp chỉ nhận Nữ"));
    group.append(femaleLabel);

    this.body.append(group);
  }

  /**
   * Group 4: Luật theo từ khóa
   */
  renderKeywordRulesGroup() {
    const group = el("section", "settings-group");
    group.append(el("h3", "settings-group-title", "Luật theo từ khóa"));

    const ruleDefinitions = [
      { key: "northernAccent", label: "Giọng Bắc", desc: "Loại yêu cầu giọng Bắc" },
      { key: "graduateRequired", label: "Yêu cầu tốt nghiệp", desc: "Loại yêu cầu GV/SV tốt nghiệp" },
      { key: "examPrep", label: "Luyện thi / Ôn chuyên", desc: "Loại lớp ôn thi vào trường, thi chuyên" },
      { key: "multipleStudents", label: "Dạy nhóm / Nhiều học viên", desc: "Loại lớp từ 2 học viên trở lên" },
      { key: "advanced", label: "Nâng cao / Chuyên sâu", desc: "Loại yêu cầu dạy nâng cao" },
      {
        key: "otherUniversity",
        label: "Yêu cầu trường khác",
        desc: "Loại yêu cầu trường ngoài KHTN (ĐHSP, ĐHBK...)",
        hasExceptions: true
      }
    ];

    if (!this.filters.rules) {
      this.filters.rules = {};
    }

    for (const def of ruleDefinitions) {
      if (!this.filters.rules[def.key]) {
        this.filters.rules[def.key] = { enabled: true, keywords: [] };
      }
      const ruleObj = this.filters.rules[def.key];

      const itemCard = el("div", "rule-card");

      // Card Header: Toggle checkbox
      const cardHeader = el("div", "rule-card-header");
      const toggleLabel = el("label", "settings-checkbox-label");
      const toggleCheck = el("input", "settings-checkbox");
      toggleCheck.type = "checkbox";
      toggleCheck.id = `rule-toggle-${def.key}`;
      toggleCheck.checked = !!ruleObj.enabled;
      toggleCheck.addEventListener("change", (e) => {
        ruleObj.enabled = e.target.checked;
        this.triggerChange(true);
      });
      toggleLabel.append(toggleCheck, el("strong", "", def.label));
      cardHeader.append(toggleLabel);

      if (def.desc) {
        cardHeader.append(el("div", "rule-card-desc", def.desc));
      }
      itemCard.append(cardHeader);

      // Keywords textarea
      const kwBox = el("div", "settings-field");
      const kwLabel = el("label", "settings-label-sm", "Từ khóa (mỗi dòng hoặc cách nhau bởi dấu phẩy):");
      kwLabel.htmlFor = `rule-kw-${def.key}`;
      const kwArea = el("textarea", "settings-textarea");
      kwArea.id = `rule-kw-${def.key}`;
      kwArea.rows = 2;
      kwArea.value = (ruleObj.keywords || []).join("\n");
      kwArea.placeholder = "Nhập từ khóa...";
      kwArea.addEventListener("input", (e) => {
        ruleObj.keywords = parseKeywordsText(e.target.value);
        this.triggerChange(false);
      });
      kwBox.append(kwLabel, kwArea);
      itemCard.append(kwBox);

      // Exceptions textarea (for otherUniversity)
      if (def.hasExceptions) {
        const exBox = el("div", "settings-field");
        const exLabel = el("label", "settings-label-sm", "Ngoại lệ (không loại nếu chứa từ khóa này):");
        exLabel.htmlFor = `rule-ex-${def.key}`;
        const exArea = el("textarea", "settings-textarea");
        exArea.id = `rule-ex-${def.key}`;
        exArea.rows = 2;
        exArea.value = (ruleObj.exceptKeywords || []).join("\n");
        exArea.placeholder = "Nhập từ khóa ngoại lệ...";
        exArea.addEventListener("input", (e) => {
          ruleObj.exceptKeywords = parseKeywordsText(e.target.value);
          this.triggerChange(false);
        });
        exBox.append(exLabel, exArea);
        itemCard.append(exBox);
      }

      group.append(itemCard);
    }

    this.body.append(group);
  }

  /**
   * Group 5: Lớp ONLINE
   */
  renderOnlineGroup() {
    const group = el("section", "settings-group");
    group.append(el("h3", "settings-group-title", "Hình thức học"));

    if (!this.filters.rules) {
      this.filters.rules = {};
    }
    if (!this.filters.rules.online) {
      this.filters.rules.online = { enabled: true };
    }

    const onlineLabel = el("label", "settings-checkbox-label");
    const onlineCheck = el("input", "settings-checkbox");
    onlineCheck.type = "checkbox";
    onlineCheck.id = "filter-online-toggle";
    onlineCheck.checked = !!this.filters.rules.online.enabled;
    onlineCheck.addEventListener("change", (e) => {
      this.filters.rules.online.enabled = e.target.checked;
      this.triggerChange(true);
    });
    onlineLabel.append(onlineCheck, el("span", "", "Loại lớp ONLINE"));
    group.append(onlineLabel);

    this.body.append(group);
  }

  /**
   * Group 6: Khôi phục mặc định
   */
  renderResetGroup() {
    const group = el("section", "settings-group settings-reset-group");
    const resetBtn = el("button", "btn-secondary btn-reset-filters", "Khôi phục mặc định");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Khôi phục toàn bộ bộ lọc về giá trị mặc định?");
      if (confirmed) {
        if (typeof this.onResetFilters === "function") {
          this.onResetFilters();
        }
      }
    });
    group.append(resetBtn);
    this.body.append(group);
  }

  /**
   * Synchronizes UI controls with updated external filters.
   * @param {object} newFilters 
   */
  updateFilters(newFilters) {
    this.filters = JSON.parse(JSON.stringify(newFilters));
    this.renderBody();
  }

  /**
   * Opens the settings drawer.
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastFocusedElement = document.activeElement;

    this.overlay.classList.add("open");
    this.drawer.classList.add("open");
    this.overlay.setAttribute("aria-hidden", "false");
    this.drawer.setAttribute("aria-hidden", "false");

    // Move focus inside
    setTimeout(() => {
      this.closeBtn.focus();
    }, 50);
  }

  /**
   * Closes the settings drawer and restores focus.
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.overlay.classList.remove("open");
    this.drawer.classList.remove("open");
    this.overlay.setAttribute("aria-hidden", "true");
    this.drawer.setAttribute("aria-hidden", "true");

    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === "function") {
      this.lastFocusedElement.focus();
    }
  }
}
