import { DEFAULT_FILTERS } from "./config.js";

/**
 * Normalizes text by applying NFKC, lowercase, mapping đ/Đ to d, and removing Vietnamese diacritics.
 * @param {string} text 
 * @returns {string}
 */
export function fold(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Checks whether foldedText matches a folded keyword using word-boundary-aware matching.
 * @param {string} foldedText 
 * @param {string} foldedKw 
 * @returns {boolean}
 */
export function matchKeyword(foldedText, foldedKw) {
  if (!foldedKw) return false;
  const kw = foldedKw.trim();
  if (!kw) return false;

  const startBoundary = /^[a-z0-9]/i.test(kw) ? "(?<![a-z0-9])" : "";
  const endBoundary = /[a-z0-9]$/i.test(kw) ? "(?![a-z0-9])" : "";
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "i");
  return regex.test(foldedText);
}

/**
 * Checks if any keyword in the list matches the folded text.
 * @param {string} foldedText 
 * @param {string[]} keywords 
 * @returns {boolean}
 */
export function matchesAnyKeyword(foldedText, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return false;
  for (const rawKw of keywords) {
    if (typeof rawKw === "string" && rawKw.trim()) {
      if (matchKeyword(foldedText, fold(rawKw))) {
        return true;
      }
    }
  }
  return false;
}

export const NON_GENDER_PHRASES = [
  "mien nam",
  "viet nam",
  "nam dinh",
  "nam bo",
  "tay nam",
  "dong nam",
  "nam sai gon",
  "nam tu liem"
];

/**
 * Derives the set of accepted genders ('nam', 'nu') from listing.requirement.
 * @param {string} requirement 
 * @returns {Set<string>}
 */
export function getAcceptedGenders(requirement) {
  const folded = fold(requirement);
  const genders = new Set();

  let textForNam = folded;
  for (const phrase of NON_GENDER_PHRASES) {
    textForNam = textForNam.replaceAll(phrase, " ");
  }

  if (/(?<![a-z0-9])nam(?![a-z0-9])/i.test(textForNam)) {
    genders.add("nam");
  }
  if (/(?<![a-z0-9])nu(?![a-z0-9])/i.test(folded)) {
    genders.add("nu");
  }
  return genders;
}

/**
 * Formats currency amount in Vietnamese locale.
 * @param {number} amount 
 * @returns {string}
 */
function formatVND(amount) {
  return amount.toLocaleString("vi-VN");
}

/**
 * Evaluates a listing against filter criteria.
 * Pure function: deterministic and performs no I/O.
 * Reads listing.km directly.
 * 
 * @param {object} listing 
 * @param {object} [filters=DEFAULT_FILTERS] 
 * @returns {object|null}
 */
export function evaluate(listing, filters = DEFAULT_FILTERS) {
  if (!listing) return null;

  const f = filters || DEFAULT_FILTERS;
  const failingReasons = [];

  // Pre-fold listing fields for fast keyword lookups
  const foldedRaw = fold(listing.raw || "");
  const foldedReq = fold(listing.requirement || "");
  const foldedAddress = fold(listing.address || "");

  const rules = f.rules || {};

  // 1. northernAccent
  if (rules.northernAccent?.enabled) {
    if (matchesAnyKeyword(foldedRaw, rules.northernAccent.keywords)) {
      failingReasons.push({
        id: "northernAccent",
        label: "Yêu cầu giọng Bắc"
      });
    }
  }

  // 2. graduateRequired
  if (rules.graduateRequired?.enabled) {
    if (matchesAnyKeyword(foldedReq, rules.graduateRequired.keywords)) {
      failingReasons.push({
        id: "graduateRequired",
        label: "Yêu cầu GV/SV tốt nghiệp"
      });
    }
  }

  // 3. Gender rule
  if (Array.isArray(f.excludeGenderOnly) && f.excludeGenderOnly.length > 0) {
    const acceptedGenders = getAcceptedGenders(listing.requirement);
    if (acceptedGenders.size === 1) {
      const onlyGender = Array.from(acceptedGenders)[0];
      if (f.excludeGenderOnly.includes(onlyGender)) {
        failingReasons.push({
          id: "excludeGenderOnly",
          label: onlyGender === "nam" ? "Chỉ nhận gia sư Nam" : "Chỉ nhận gia sư Nữ"
        });
      }
    }
  }

  // 4. examPrep
  if (rules.examPrep?.enabled) {
    if (matchesAnyKeyword(foldedRaw, rules.examPrep.keywords)) {
      failingReasons.push({
        id: "examPrep",
        label: "Luyện thi / Ôn chuyên"
      });
    }
  }

  // 5. skipGrades
  if (Array.isArray(f.skipGrades) && f.skipGrades.length > 0) {
    if (listing.grade !== null && listing.grade !== undefined && f.skipGrades.includes(listing.grade)) {
      failingReasons.push({
        id: "skipGrades",
        label: `Bỏ qua lớp ${listing.grade}`
      });
    }
  }

  // 6. minFee (0 = rule off)
  if (typeof f.minFee === "number" && f.minFee > 0) {
    if (listing.feePerSession !== null && listing.feePerSession !== undefined && listing.feePerSession <= f.minFee) {
      failingReasons.push({
        id: "minFee",
        label: `Học phí ≤ ${formatVND(f.minFee)}đ/buổi`
      });
    }
  }

  // 7. sessionsPerWeek
  if (f.sessionsPerWeek && typeof f.sessionsPerWeek === "object") {
    const { min, max } = f.sessionsPerWeek;
    if (listing.perWeek !== null && listing.perWeek !== undefined) {
      const tooFew = typeof min === "number" && min > 0 && listing.perWeek < min;
      const tooMany = typeof max === "number" && max > 0 && listing.perWeek > max;
      if (tooFew || tooMany) {
        failingReasons.push({
          id: "sessionsPerWeek",
          label: `Số buổi không phù hợp (${listing.perWeek}b/tuần)`
        });
      }
    }
  }

  // 8. multipleStudents
  if (rules.multipleStudents?.enabled) {
    if (matchesAnyKeyword(foldedRaw, rules.multipleStudents.keywords)) {
      failingReasons.push({
        id: "multipleStudents",
        label: "Dạy nhóm / nhiều học viên"
      });
    }
  }

  // 9. advanced
  if (rules.advanced?.enabled) {
    if (matchesAnyKeyword(foldedRaw, rules.advanced.keywords)) {
      failingReasons.push({
        id: "advanced",
        label: "Học nâng cao / chuyên sâu"
      });
    }
  }

  // 10. otherUniversity (with exceptKeywords)
  if (rules.otherUniversity?.enabled) {
    const hasOther = matchesAnyKeyword(foldedReq, rules.otherUniversity.keywords);
    const hasExcept = matchesAnyKeyword(foldedReq, rules.otherUniversity.exceptKeywords);
    if (hasOther && !hasExcept) {
      failingReasons.push({
        id: "otherUniversity",
        label: "Yêu cầu trường khác (ĐHSP, ĐHBK...)"
      });
    }
  }

  // 11. online
  if (rules.online?.enabled) {
    if (foldedAddress.includes("online")) {
      failingReasons.push({
        id: "online",
        label: "Lớp học Online"
      });
    }
  }

  // 12. maxKm (0 = rule off)
  if (typeof f.maxKm === "number" && f.maxKm > 0) {
    if (listing.km !== null && listing.km !== undefined && listing.km > f.maxKm) {
      const kmStr = String(listing.km).replace(".", ",");
      failingReasons.push({
        id: "maxKm",
        label: `Xa hơn ${f.maxKm} km (≈ ${kmStr} km)`
      });
    }
  }

  // 13. unknownLocation when set to "reject"
  if (f.unknownLocation === "reject" && (listing.km === null || listing.km === undefined)) {
    failingReasons.push({
      id: "unknownLocation",
      label: "Không xác định được vị trí"
    });
  }

  // Status determination:
  // If ANY rejection rule failed -> status = "rejected"
  if (failingReasons.length > 0) {
    listing.status = "rejected";
    listing.reasons = failingReasons;
    return listing;
  }

  // If not rejected, collect unknown notes (fee unknown, sessions/week unknown, parse incomplete, location unknown)
  const notes = [];

  if (!listing.title?.trim() || !listing.address?.trim() || !listing.schedule?.trim() || !listing.pay?.trim()) {
    notes.push({
      id: "parseIncomplete",
      label: "Thông tin chưa đầy đủ"
    });
  }

  if (listing.feePerSession === null || listing.feePerSession === undefined) {
    notes.push({
      id: "unknownFee",
      label: "Chưa rõ học phí"
    });
  }

  if (listing.perWeek === null || listing.perWeek === undefined) {
    notes.push({
      id: "unknownSessions",
      label: "Chưa rõ số buổi/tuần"
    });
  }

  if (listing.km === null || listing.km === undefined) {
    notes.push({
      id: "unknownLocation",
      label: "Chưa rõ vị trí/quận"
    });
  }

  if (notes.length > 0) {
    listing.status = "review";
    listing.reasons = notes;
  } else {
    listing.status = "pass";
    listing.reasons = [];
  }

  return listing;
}
