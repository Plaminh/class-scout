export const SOURCES = {
  toan: "https://docs.google.com/spreadsheets/d/e/2PACX-1vReVEeh6imU3J6G75TLrJauI8sxtKJ1kH_MSfTRofC1JUWYfWxBlHobJq1_5l9_F2P4GQtPBLxZpFgY/pub?gid=0&single=true&output=csv",
  hoa:  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTtbTYY8pYUGhZhOTCCDLFtJycJW3lHdz-2mhSVRPN17i7GoEtmmXugw3RIVdUC3xuICZr8FYWd4whH/pub?gid=0&single=true&output=csv",
  ly:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vTI-x8FOEuRGBD_8jf2F226n1htK0k5SVJCOwEhcYgt9kWvOzKNkom0jKDAypHcwYDY3XMcKvJAGhPR/pub?gid=0&single=true&output=csv"
};

export const DEFAULT_FILTERS = {
  version: 1,
  minFee: 175000,                 // reject if fee per session <= minFee (0 = rule off)
  maxKm: 7,                       // reject if estimated km > maxKm (0 = rule off)
  sessionsPerWeek: { min: 2, max: 3 },
  skipGrades: [9, 12],
  excludeGenderOnly: ["nam"],     // reject posts that accept ONLY this gender; allowed values "nam", "nu"
  unknownLocation: "review",      // "review" | "reject"
  rules: {
    northernAccent:   { enabled: true, keywords: ["giọng bắc", "người bắc", "bắc bộ"] },
    graduateRequired: { enabled: true, keywords: ["tốt nghiệp"] },
    examPrep:         { enabled: true, keywords: ["ôn thi vào", "thi vào trường", "thi chuyên", "ôn chuyên", "luyện thi vào", "thi vào lớp 10"] },
    multipleStudents: { enabled: true, keywords: ["2hv", "3hv", "2 hv", "3 hv", "2hs", "3hs", "2 hs", "3 hs", "nhiều học viên", "nhóm"] },
    advanced:         { enabled: true, keywords: ["nâng cao", "chuyên sâu"] },
    otherUniversity:  { enabled: true, keywords: ["sư phạm", "bách khoa", "kinh tế", "ngoại thương", "công nghệ", "y dược", "luật", "svsp", "đhsp", "đhbk"], exceptKeywords: ["khtn", "khoa học tự nhiên"] },
    online:           { enabled: true }   // reject ONLINE classes
  }
};

export const REFRESH_MS = 15 * 60 * 1000; // Refresh interval (15 minutes)
