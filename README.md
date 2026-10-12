# Class Scout

A static web application that periodically fetches tutoring-class listings published as CSV from Google Sheets, parses each post, evaluates customizable filtering rules, and organizes classes into **Phù hợp** (Match), **Cần xem** (Review), and **Đã loại** (Rejected) tabs.

Built with vanilla HTML, CSS, and ES Modules: no frameworks, no bundlers, no backend, and no API keys.

---

## 🌟 Key Features

- **Editable Filters in UI**: Every filter criterion (fee threshold, max distance, sessions per week, skip grades, gender exclusions, keyword rules, and online classes) can be edited directly from the UI via the **Bộ lọc** drawer.
- **Instant Live Evaluation**: Changes to filters apply live (debounced) and re-evaluate cached listings in memory with zero network delay and zero distance recomputations.
- **Multiple Rejection Reasons**: Rejected listings display all failing reason badges simultaneously in Vietnamese with correct diacritics.
- **Diacritic-Agnostic Keyword Matching**: Custom keywords can be entered with or without Vietnamese diacritics (e.g., `tot nghiep` matches `Tốt Nghiệp`).
- **Persistence**: User filter settings, starred listings, and seen listings persist locally across sessions via `localStorage`.

---

## 📁 Project Structure

```text
class-scout/
├── css/
│   └── style.css            # Responsive layout, dark mode, drawer styles
├── data/
│   └── districts.json       # Approximate driving distances by district
├── js/
│   ├── app.js               # Application orchestration (refresh vs. applyFilters)
│   ├── config.js            # SOURCES, REFRESH_MS, DEFAULT_FILTERS
│   ├── distance.js          # District-based distance lookup
│   ├── fetcher.js           # Multi-subject CSV fetching via PapaParse
│   ├── parser.js            # Post text parsing and normalization
│   ├── rules.js             # Data-driven pure evaluation logic and keyword folding
│   ├── settings.js          # Settings drawer DOM and filter controls
│   ├── storage.js           # LocalStorage wrapper and filter validation
│   └── ui.js                # DOM rendering for header, controls, and listing cards
├── tests/
│   ├── fixtures/
│   │   └── raw.json         # Real-world scraped sample posts
│   └── parser.test.js       # Unit tests using node:test
├── index.html               # Main single-page application entry point
├── package.json             # Test script definition
└── README.md                # Documentation and guide
```

---

## 🚀 How to Run Locally

Because the project uses ES Modules (`import`/`export`), it must be served over HTTP:

1. Open a terminal in the `class-scout/` directory:
   ```bash
   cd class-scout
   ```
2. Start Python's built-in HTTP server:
   ```bash
   python -m http.server 8000
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

---

## 🌐 How to Deploy on GitHub Pages

1. Commit and push the repository to GitHub.
2. In your GitHub repository, go to **Settings** > **Pages**.
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or `master`), folder: `/` (or root).
4. Save and wait a few moments for the site to be published at `https://<username>.github.io/<repo>/`.

---

## ⚙️ Filter Model & Customization

Default filtering preferences are defined in [`js/config.js`](js/config.js) under `DEFAULT_FILTERS`. All settings can be adjusted in real time using the **Bộ lọc** button in the header:

- **Học phí tối thiểu**: Reject if fee per session is less than or equal to the threshold (set to `0` to turn off).
- **Khoảng cách tối đa**: Reject if approximate distance exceeds the threshold (set to `0` to turn off).
- **Vị trí không xác định**: Choose whether unrecognized locations land in **Cần xem** or **Đã loại**.
- **Số buổi/tuần**: Specify accepted range of sessions per week.
- **Bỏ qua lớp**: Toggle grade chips (1–12) to automatically exclude specific grades.
- **Giới tính**: Filter out classes that exclusively accept male or female tutors.
- **Luật từ khóa**: Toggle and configure custom keywords for northern accent, graduate requirement, exam preparation, multiple students, advanced tutoring, and other universities (with exception keywords).
- **Lớp Online**: Toggle rejection of online tutoring classes.
- **Khôi phục mặc định**: Reset all settings back to default values.

---

## 🧪 Running Tests

Unit tests use Node.js's built-in test runner (`node:test`) with zero external dependencies:

```bash
# Run tests inside class-scout/
node --test

# Or run specific test file
node --test tests/parser.test.js
```

---

## 🚫 Out of Scope (MVP Limitations)

The following capabilities are intentionally out of scope for this MVP:
- **Push notifications**: Web notifications are out of scope for this MVP to keep the app lightweight and distraction-free.
- **Interactive map**: Distances use precomputed district centroid tables rather than dynamic GPS mapping.
- **Editable home area**: Home coordinates/reference area are fixed to District 10 in this release.
- **Cross-device synchronization**: User preferences and starred items are stored strictly in client-side `localStorage`.
