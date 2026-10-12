export const DEFAULT_DISTRICTS = {
  "Quận 1": 3.0,
  "Quận 2": 8.0,
  "Quận 3": 2.5,
  "Quận 4": 5.0,
  "Quận 5": 3.0,
  "Quận 6": 5.0,
  "Quận 7": 8.0,
  "Quận 8": 5.5,
  "Quận 9": 14.0,
  "Quận 10": 1.0,
  "Quận 11": 2.5,
  "Quận 12": 10.5,
  "Bình Thạnh": 6.5,
  "Gò Vấp": 7.5,
  "Phú Nhuận": 4.5,
  "Tân Bình": 3.5,
  "Tân Phú": 5.5,
  "Bình Tân": 6.5,
  "Thủ Đức": 11.0,
  "Hóc Môn": 14.0,
  "Bình Chánh": 12.0,
  "Nhà Bè": 13.0,
  "Củ Chi": 28.0,
  "Cần Giờ": 45.0
};

let currentDistrictsTable = { ...DEFAULT_DISTRICTS };

/**
 * Updates the current districts lookup table.
 * @param {Record<string, number>} table 
 */
export function setDistrictsTable(table) {
  if (table && typeof table === "object") {
    currentDistrictsTable = { ...table };
  }
}

const DISTRICT_PATTERNS = [
  // Double digits first to prevent partial 1 match in 10, 11, 12
  { name: "Quận 10", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)10(?!\d|\p{L})/iu },
  { name: "Quận 11", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)11(?!\d|\p{L})/iu },
  { name: "Quận 12", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)12(?!\d|\p{L})/iu },
  { name: "Quận 1", regex: /(?<!\p{L})(?:(?:quận\s*|q\.?\s*)1|quận\s*nhất)(?!\d|\p{L})/iu },
  { name: "Quận 2", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)2(?!\d|\p{L})/iu },
  { name: "Quận 3", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)3(?!\d|\p{L})/iu },
  { name: "Quận 4", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)4(?!\d|\p{L})/iu },
  { name: "Quận 5", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)5(?!\d|\p{L})/iu },
  { name: "Quận 6", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)6(?!\d|\p{L})/iu },
  { name: "Quận 7", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)7(?!\d|\p{L})/iu },
  { name: "Quận 8", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)8(?!\d|\p{L})/iu },
  { name: "Quận 9", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)9(?!\d|\p{L})/iu },
  { name: "Bình Thạnh", regex: /(?<!tân uyên[^\p{L}\p{N}]*)(?<!\p{L})(?:quận\s*|q\.?\s*)?bình thạnh(?!\p{L})/iu },
  { name: "Gò Vấp", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)?gò vấp(?!\p{L})/iu },
  { name: "Phú Nhuận", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)?phú nhuận(?!\p{L})/iu },
  { name: "Tân Bình", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)?tân bình(?!\p{L})/iu },
  { name: "Tân Phú", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)?tân phú(?!\p{L})/iu },
  { name: "Bình Tân", regex: /(?<!\p{L})(?:quận\s*|q\.?\s*)?bình tân(?!\p{L})/iu },
  { name: "Thủ Đức", regex: /(?<!\p{L})(?:tp\.?\s*|thành phố\s*|quận\s*|q\.?\s*)?thủ đức(?!\p{L})/iu },
  { name: "Hóc Môn", regex: /(?<!\p{L})(?:huyện\s*|h\.?\s*)?hóc môn(?!\p{L})/iu },
  { name: "Bình Chánh", regex: /(?<!\p{L})(?:huyện\s*|h\.?\s*)?bình chánh(?!\p{L})/iu },
  { name: "Nhà Bè", regex: /(?<!\p{L})(?:huyện\s*|h\.?\s*)?nhà bè(?!\p{L})/iu },
  { name: "Củ Chi", regex: /(?<!\p{L})(?:huyện\s*|h\.?\s*)?củ chi(?!\p{L})/iu },
  { name: "Cần Giờ", regex: /(?<!\p{L})(?:huyện\s*|h\.?\s*)?cần giờ(?!\p{L})/iu }
];

/**
 * Looks up the address and returns the minimum approximate driving km, or null.
 * @param {string} address 
 * @param {object} [districtsTable] 
 * @returns {{ km: number } | null}
 */
export function getDistance(address, districtsTable = currentDistrictsTable) {
  if (!address || typeof address !== "string") return null;

  const matchedKmList = [];

  for (const item of DISTRICT_PATTERNS) {
    // If Tan Uyen is present, do not match Binh Thanh
    if (item.name === "Bình Thạnh" && /tân uyên/iu.test(address)) {
      continue;
    }

    if (item.regex.test(address)) {
      const dist = districtsTable[item.name];
      if (typeof dist === "number") {
        matchedKmList.push(dist);
      }
    }
  }

  if (matchedKmList.length === 0) {
    return null;
  }

  return { km: Math.min(...matchedKmList) };
}
