/**
 * Parses fee text into VND per session.
 * @param {string} pay 
 * @param {number|null} perWeek 
 * @returns {number|null}
 */
export function parseFeePerSession(pay, perWeek) {
  if (!pay || typeof pay !== "string") return null;
  const payBeforeParen = pay.split("(")[0].trim();
  if (!payBeforeParen) return null;

  let textToParse = payBeforeParen;
  const svIndex = payBeforeParen.search(/\bSV\b/i);
  if (svIndex !== -1) {
    textToParse = payBeforeParen.slice(svIndex);
  }

  let amount = null;
  const trDecimalMatch = textToParse.match(/(?<![\d.,])(\d+)[.,](\d+)\s*(?:tr|triệu)/i);
  const trMatch = textToParse.match(/(?<![\d.,])(\d+)\s*(?:tr|triệu)\s*(\d+)?/i);

  if (trDecimalMatch) {
    const whole = parseInt(trDecimalMatch[1], 10);
    const fracStr = trDecimalMatch[2] || "";
    const frac = fracStr ? parseInt(fracStr, 10) * Math.pow(10, 6 - fracStr.length) : 0;
    amount = whole * 1000000 + frac;
  } else if (trMatch) {
    const whole = parseInt(trMatch[1], 10);
    const fracStr = trMatch[2] || "";
    const frac = fracStr ? parseInt(fracStr, 10) * Math.pow(10, 6 - fracStr.length) : 0;
    amount = whole * 1000000 + frac;
  } else {
    const kMatch = textToParse.match(/(\d+)\s*k\b/i);
    if (kMatch) {
      amount = parseInt(kMatch[1], 10) * 1000;
    } else {
      const numMatch = textToParse.match(/(\d{1,3}(?:[.,]\d{3})+|\d{5,})/);
      if (numMatch) {
        amount = parseInt(numMatch[1].replace(/[.,]/g, ""), 10);
      }
    }
  }

  if (amount === null || isNaN(amount)) return null;

  // If it has "buổi" or equivalent per-session indicator
  const isPerSession = /buổi|buoi|\/b\b/iu.test(payBeforeParen);
  if (isPerSession) {
    return amount;
  }

  // Monthly: amount / (perWeek * 4); null if perWeek is unknown
  if (!perWeek || perWeek <= 0) return null;
  return Math.round(amount / (perWeek * 4));
}

/**
 * Parses a raw post cell into a Listing object.
 * @param {string} text 
 * @param {string} subject 
 * @returns {object|null}
 */
export function parseListing(text, subject) {
  if (!text || typeof text !== "string") return null;

  try {
    // 1. Normalize NFKC first. Fancy glyphs (𝐃/𝐜, 𝗧/𝗴, 𝐋/𝐠) become plain D/c, T/g, L/g.
    const raw = text.normalize("NFKC");

    // 2 & 3. Code: /Mã lớp:?\s*([A-Z]{2,4}\d{3,4})/ (must NOT include the emoji; return null if absent)
    const codeMatch = raw.match(/Mã lớp:?\s*([A-Z]{2,4}\d{3,4})/u);
    if (!codeMatch) return null;
    const code = codeMatch[1];

    const afterCode = raw.slice(codeMatch.index + codeMatch[0].length);

    // Title: text between the code (plus any emoji/spaces) and "- D/c" (or D/c with optional colon/dash)
    const dcMatch = afterCode.match(/(?:^|[\s\n]+)-?\s*D\/c:?/iu);
    if (!dcMatch) return null;

    let title = afterCode
      .slice(0, dcMatch.index)
      .trim()
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/[-:\s]+$/, "")
      .trim();

    // Address: between "D/c:?" and "- T/g"
    const afterDc = afterCode.slice(dcMatch.index + dcMatch[0].length);
    const tgMatch = afterDc.match(/(?:^|[\s\n-])T\/g:?/iu);
    if (!tgMatch) return null;

    const address = afterDc.slice(0, tgMatch.index).trim().replace(/^[:\s-]+/, "").replace(/[-:\s]+$/, "").trim();

    // Schedule: between "T/g:?" and "- L/g"
    const afterTg = afterDc.slice(tgMatch.index + tgMatch[0].length);
    const lgMatch = afterTg.match(/(?:^|[\s\n-])L\/g:?/iu);
    if (!lgMatch) return null;

    const schedule = afterTg.slice(0, lgMatch.index).trim().replace(/^[:\s-]+/, "").replace(/[-:\s]+$/, "").trim();

    // Pay: between "L/g:?" and "☑"
    const afterLg = afterTg.slice(lgMatch.index + lgMatch[0].length);
    const checkMatch = afterLg.match(/☑\ufe0f?/u);
    const pay = (checkMatch ? afterLg.slice(0, checkMatch.index) : afterLg)
      .trim()
      .replace(/^[:\s-]+/, "")
      .replace(/[-:\s]+$/, "")
      .trim();

    // Requirement: between "☑" (optional \ufe0f) and "Phí:"
    let requirement = "";
    if (checkMatch) {
      const afterCheck = afterLg.slice(checkMatch.index + checkMatch[0].length);
      const phiMatch = afterCheck.match(/Phí:?/iu);
      requirement = (phiMatch ? afterCheck.slice(0, phiMatch.index) : afterCheck)
        .trim()
        .replace(/^[:\s-]+/, "")
        .replace(/[-:\s]+$/, "")
        .trim();
    }

    // Grade: number from /lớp\s*(\d+)/i in the title
    const gradeMatch = title.match(/lớp\s*(\d+)/iu);
    const grade = gradeMatch ? parseInt(gradeMatch[1], 10) : null;

    // perWeek: number from /(\d)\s*b\s*\/\s*tu/i in schedule
    const perWeekMatch = schedule.match(/(\d)\s*b\s*\/\s*tu/iu);
    const perWeek = perWeekMatch ? parseInt(perWeekMatch[1], 10) : null;

    // Fee per session
    const feePerSession = parseFeePerSession(pay, perWeek);

    return {
      code,
      title,
      address,
      schedule,
      pay,
      feePerSession,
      requirement,
      raw,
      grade,
      perWeek,
      subjects: subject ? [subject] : [],
      status: null,
      reasons: [],
      km: null
    };
  } catch (_e) {
    // Never throw on a bad cell. Return null if it is not a post.
    return null;
  }
}
