/**
 * Creates a DOM element with class name and optional textContent.
 * Strict rule: strictly uses textContent and DOM methods.
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
 * Formats a timestamp into human-readable local time string.
 * @param {number|null} timestamp 
 * @returns {string}
 */
export function formatTime(timestamp) {
  if (!timestamp) return "Chưa cập nhật";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Maps subject code to friendly Vietnamese display name.
 * @param {string} subjectCode 
 * @returns {string}
 */
export function getSubjectDisplayName(subjectCode) {
  const map = {
    toan: "Toán",
    hoa: "Hóa",
    ly: "Lý"
  };
  return map[subjectCode] || (subjectCode ? subjectCode.toUpperCase() : "");
}

/**
 * Renders the Header component into container.
 * @param {HTMLElement} container 
 * @param {object} props 
 * @param {number|null} props.lastRefresh 
 * @param {Array<{ subject: string, error: string }>} props.errors 
 * @param {function} props.onRefresh 
 * @param {boolean} props.isRefreshing 
 * @param {number} props.diffCount
 * @param {function} props.onOpenSettings
 */
export function renderHeader(
  container,
  { lastRefresh, errors, onRefresh, isRefreshing, diffCount = 0, onOpenSettings }
) {
  container.replaceChildren();

  const topRow = el("div", "header-top");

  // Title and Updated Time
  const titleGroup = el("div", "app-title-group");
  const h1 = el("h1", "", "Class Scout");
  const updated = el("span", "updated-time", `Cập nhật lúc: ${formatTime(lastRefresh)}`);
  titleGroup.append(h1, updated);

  // Actions: Refresh button and Settings button
  const actions = el("div", "header-actions");

  // Refresh button
  const refreshBtn = el("button", "btn-primary", isRefreshing ? "Đang làm mới..." : "Làm mới");
  refreshBtn.type = "button";
  refreshBtn.disabled = isRefreshing;
  if (isRefreshing) {
    const spinner = el("span", "spinner");
    refreshBtn.prepend(spinner);
  }
  refreshBtn.addEventListener("click", () => {
    if (!isRefreshing && typeof onRefresh === "function") {
      onRefresh();
    }
  });

  // Settings button ("Bộ lọc" with diff badge)
  const settingsBtn = el("button", "btn-secondary btn-settings");
  settingsBtn.type = "button";
  settingsBtn.id = "btn-open-settings";
  const iconSpan = el("span", "", "⚙️ ");
  const textSpan = el("span", "", "Bộ lọc");
  settingsBtn.append(iconSpan, textSpan);

  if (diffCount > 0) {
    const badge = el("span", "badge-filter-diff", String(diffCount));
    badge.title = `${diffCount} tùy chỉnh khác mặc định`;
    settingsBtn.append(badge);
  }

  settingsBtn.addEventListener("click", () => {
    if (typeof onOpenSettings === "function") {
      onOpenSettings();
    }
  });

  actions.append(refreshBtn, settingsBtn);
  topRow.append(titleGroup, actions);
  container.append(topRow);

  // Errors per subject (if any)
  if (errors && errors.length > 0) {
    const errList = el("div", "error-list");
    for (const err of errors) {
      const banner = el("div", "error-banner");
      const icon = el("span", "", "⚠️");
      const msg = el(
        "span",
        "",
        `Lỗi tải môn ${getSubjectDisplayName(err.subject) || err.subject}: ${err.error}`
      );
      banner.append(icon, msg);
      errList.append(banner);
    }
    container.append(errList);
  }
}

/**
 * Renders Controls: tabs, subject filter, text search, new/starred toggles, sort.
 * @param {HTMLElement} container 
 * @param {object} props 
 */
export function renderControls(
  container,
  {
    currentTab,
    counts,
    subjectFilter,
    availableSubjects,
    searchQuery,
    newOnly,
    starredOnly,
    sortBy,
    onTabChange,
    onSubjectChange,
    onSearchChange,
    onNewOnlyChange,
    onStarredOnlyChange,
    onSortChange
  }
) {
  container.replaceChildren();

  // 1. Tabs row ("Phù hợp", "Cần xem", "Đã loại")
  const tabsNav = el("div", "tabs-nav");
  const tabDefs = [
    { id: "pass", label: "Phù hợp", classModifier: "tab-match" },
    { id: "review", label: "Cần xem", classModifier: "tab-review" },
    { id: "rejected", label: "Đã loại", classModifier: "tab-rejected" }
  ];

  for (const tab of tabDefs) {
    const isActive = currentTab === tab.id;
    const btn = el(
      "button",
      `tab-btn ${tab.classModifier} ${isActive ? "active" : ""}`
    );
    btn.type = "button";
    const labelSpan = el("span", "", tab.label);
    const countBadge = el("span", "tab-count", String(counts[tab.id] || 0));
    btn.append(labelSpan, countBadge);

    btn.addEventListener("click", () => {
      if (currentTab !== tab.id && typeof onTabChange === "function") {
        onTabChange(tab.id);
      }
    });
    tabsNav.append(btn);
  }
  container.append(tabsNav);

  // 2. Filter & Search row
  const filterRow = el("div", "filter-row");

  // Search input
  const searchBox = el("div", "search-box");
  const searchInput = el("input", "search-input");
  searchInput.type = "text";
  searchInput.placeholder = "Tìm kiếm từ khóa (địa chỉ, mã, ghi chú...)...";
  searchInput.value = searchQuery || "";
  searchInput.addEventListener("input", (e) => {
    if (typeof onSearchChange === "function") {
      onSearchChange(e.target.value);
    }
  });
  searchBox.append(searchInput);
  filterRow.append(searchBox);

  // Subject selector with Vietnamese names (Toán, Hóa, Lý)
  const subjectGroup = el("div", "select-group");
  const subjectLabel = el("label", "", "Môn:");
  const subjectSelect = el("select");
  const allSubOpt = el("option", "", "Tất cả");
  allSubOpt.value = "";
  subjectSelect.append(allSubOpt);

  for (const sub of availableSubjects) {
    const opt = el("option", "", getSubjectDisplayName(sub));
    opt.value = sub;
    if (subjectFilter === sub) opt.selected = true;
    subjectSelect.append(opt);
  }
  subjectSelect.addEventListener("change", (e) => {
    if (typeof onSubjectChange === "function") {
      onSubjectChange(e.target.value);
    }
  });
  subjectGroup.append(subjectLabel, subjectSelect);
  filterRow.append(subjectGroup);

  // Sort selector ("Mặc định", "Gần nhất", "Lương cao nhất")
  const sortGroup = el("div", "select-group");
  const sortLabel = el("label", "", "Xếp:");
  const sortSelect = el("select");
  const sortOptions = [
    { value: "default", text: "Mặc định" },
    { value: "nearest", text: "Gần nhất" },
    { value: "highestFee", text: "Lương cao nhất" }
  ];
  for (const so of sortOptions) {
    const opt = el("option", "", so.text);
    opt.value = so.value;
    if (sortBy === so.value) opt.selected = true;
    sortSelect.append(opt);
  }
  sortSelect.addEventListener("change", (e) => {
    if (typeof onSortChange === "function") {
      onSortChange(e.target.value);
    }
  });
  sortGroup.append(sortLabel, sortSelect);
  filterRow.append(sortGroup);

  // New Only Toggle
  const newLabel = el("label", "checkbox-toggle");
  const newCheckbox = el("input");
  newCheckbox.type = "checkbox";
  newCheckbox.checked = !!newOnly;
  newCheckbox.addEventListener("change", (e) => {
    if (typeof onNewOnlyChange === "function") {
      onNewOnlyChange(e.target.checked);
    }
  });
  newLabel.append(newCheckbox, el("span", "", "Mới"));
  filterRow.append(newLabel);

  // Starred Only Toggle
  const starLabel = el("label", "checkbox-toggle");
  const starCheckbox = el("input");
  starCheckbox.type = "checkbox";
  starCheckbox.checked = !!starredOnly;
  starCheckbox.addEventListener("change", (e) => {
    if (typeof onStarredOnlyChange === "function") {
      onStarredOnlyChange(e.target.checked);
    }
  });
  starLabel.append(starCheckbox, el("span", "", "Đã gắn sao ★"));
  filterRow.append(starLabel);

  container.append(filterRow);
}

/**
 * Renders a single listing card.
 */
function createListingCard(listing, { onToggleStar }) {
  const card = el("div", "listing-card");

  // Card Header: Code, Subjects, Badges, Star
  const cardHeader = el("div", "card-header");
  const tagsGroup = el("div", "card-tags");

  // Code button (click to copy)
  const codeBtn = el("button", "code-btn", listing.code);
  codeBtn.type = "button";
  codeBtn.title = "Bấm để sao chép mã lớp";
  codeBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(listing.code);
      const originalText = codeBtn.textContent;
      codeBtn.textContent = "Đã chép! ✓";
      setTimeout(() => {
        codeBtn.textContent = originalText;
      }, 1500);
    } catch (_e) {
      // Ignore clipboard permission errors
    }
  });
  tagsGroup.append(codeBtn);

  // NEW Badge
  if (listing.isNew) {
    tagsGroup.append(el("span", "badge badge-new", "MỚI"));
  }

  // Subject badges with Vietnamese display names
  if (listing.subjects && listing.subjects.length > 0) {
    for (const sub of listing.subjects) {
      tagsGroup.append(el("span", "badge badge-subject", getSubjectDisplayName(sub)));
    }
  }

  // Right action: Star toggle
  const actionsGroup = el("div", "card-actions");
  const starBtn = el("button", `star-btn ${listing.isStarred ? "starred" : ""}`, listing.isStarred ? "★" : "☆");
  starBtn.type = "button";
  starBtn.title = listing.isStarred ? "Bỏ gắn sao" : "Gắn sao";
  starBtn.addEventListener("click", () => {
    if (typeof onToggleStar === "function") {
      onToggleStar(listing.code);
    }
  });
  actionsGroup.append(starBtn);

  cardHeader.append(tagsGroup, actionsGroup);
  card.append(cardHeader);

  // Title
  if (listing.title) {
    card.append(el("div", "card-title", listing.title));
  }

  // Details
  const details = el("div", "card-details");

  // Address & Distance
  const addrRow = el("div", "detail-row");
  addrRow.append(el("span", "detail-label", "Địa chỉ:"));
  const addrVal = el("span", "detail-value");
  addrVal.append(document.createTextNode(listing.address || "(Chưa có)"));
  if (listing.km !== null && listing.km !== undefined) {
    const kmStr = String(listing.km).replace(".", ",");
    const distSpan = el("span", "distance-highlight", ` (${kmStr} km)`);
    addrVal.append(distSpan);
  }
  addrRow.append(addrVal);
  details.append(addrRow);

  // Schedule
  const schedRow = el("div", "detail-row");
  schedRow.append(el("span", "detail-label", "Thời gian:"));
  schedRow.append(el("span", "detail-value", listing.schedule || "(Chưa có)"));
  details.append(schedRow);

  // Pay & Fee per session
  const payRow = el("div", "detail-row");
  payRow.append(el("span", "detail-label", "Lương:"));
  const payVal = el("span", "detail-value");
  payVal.append(document.createTextNode(listing.pay || "(Chưa có)"));
  if (listing.feePerSession !== null && listing.feePerSession !== undefined) {
    const feeSpan = el(
      "span",
      "fee-highlight",
      ` (~${listing.feePerSession.toLocaleString("vi-VN")} đ/buổi)`
    );
    payVal.append(feeSpan);
  }
  payRow.append(payVal);
  details.append(payRow);

  // Requirement
  if (listing.requirement) {
    const reqRow = el("div", "detail-row");
    reqRow.append(el("span", "detail-label", "Yêu cầu:"));
    reqRow.append(el("span", "detail-value", listing.requirement));
    details.append(reqRow);
  }

  card.append(details);

  // Reasons chips: show ALL reason chips (red for rejected, amber for review)
  if (listing.reasons && listing.reasons.length > 0) {
    const reasonsContainer = el("div", "card-reasons");
    for (const r of listing.reasons) {
      const chipClass = listing.status === "rejected" ? "chip-rejected" : "chip-review";
      const chipText = typeof r === "object" && r !== null ? r.label : String(r);
      reasonsContainer.append(el("span", `reason-chip ${chipClass}`, chipText));
    }
    card.append(reasonsContainer);
  }

  return card;
}

/**
 * Renders the listings list into container.
 * @param {HTMLElement} container 
 * @param {Array<object>} listings 
 * @param {object} actions 
 * @param {function} actions.onToggleStar 
 */
export function renderListings(container, listings, { onToggleStar }) {
  container.replaceChildren();

  if (!listings || listings.length === 0) {
    const empty = el("div", "empty-state");
    empty.append(el("div", "empty-state-title", "Không có lớp nào"));
    empty.append(el("p", "", "Không tìm thấy lớp học phù hợp với bộ lọc hiện tại."));
    container.append(empty);
    return;
  }

  for (const listing of listings) {
    const card = createListingCard(listing, { onToggleStar });
    container.append(card);
  }
}
