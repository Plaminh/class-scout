import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseListing, parseFeePerSession } from "../js/parser.js";
import { evaluate, fold, getAcceptedGenders } from "../js/rules.js";
import { DEFAULT_FILTERS } from "../js/config.js";
import { getDistance } from "../js/distance.js";
import { validateAndMergeFilters, loadFilters } from "../js/storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.join(__dirname, "fixtures", "raw.json");
const rawListings = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));

/**
 * Helper to parse, enrich distance, and evaluate a listing.
 */
function enrichAndEvaluate(rawText, subject = "toan", filters = DEFAULT_FILTERS) {
  const listing = parseListing(rawText, subject);
  if (!listing) return null;
  const dist = getDistance(listing.address);
  listing.km = dist ? dist.km : null;
  return evaluate(listing, filters);
}

test("fixtures contains 30+ real raw posts as an array of strings", () => {
  assert.ok(Array.isArray(rawListings), "raw.json must be an array");
  assert.ok(rawListings.length >= 30, `Expected 30+ rows, got ${rawListings.length}`);
  assert.ok(rawListings.every((item) => typeof item === "string"), "Every item must be a string");
});

test("harvested real fixtures parse without throwing", () => {
  let parsedCount = 0;
  for (const raw of rawListings) {
    const listing = parseListing(raw, "toan");
    if (listing) {
      parsedCount++;
      assert.match(listing.code, /^[A-Z]{2,4}\d{3,4}$/, `Code ${listing.code} must be clean`);
      assert.doesNotMatch(listing.code, /[\p{Extended_Pictographic}\uFE0F]/u);
    }
  }
  assert.ok(parsedCount >= 25, `Expected at least 25 parsed listings from fixtures, got ${parsedCount}`);
});

test("code is clean (no emoji)", () => {
  const postWithEmoji = "Mã lớp:RU6216 ✡️ LỚP 7 TOÁN ( hv nữ )- D/c: Phường 5, Quận 10 - T/g: 2b/tuần ( 20h )- L/g: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const listing = parseListing(postWithEmoji, "toan");
  assert.ok(listing);
  assert.strictEqual(listing.code, "RU6216");
  assert.match(listing.code, /^[A-Z]{2,4}\d{3,4}$/);
  assert.doesNotMatch(listing.code, /[\p{Extended_Pictographic}\uFE0F]/u);

  // Test 🔯 emoji variant
  const postStarEmoji = rawListings.find((r) => r.includes("🔯")) ||
    "Mã lớp:RE0426 🔯 LỚP 11 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const starListing = parseListing(postStarEmoji, "toan");
  assert.ok(starListing);
  assert.match(starListing.code, /^[A-Z]{2,4}\d{3,4}$/);
  assert.doesNotMatch(starListing.code, /[\p{Extended_Pictographic}\uFE0F]/u);
});

test("'1tr25/tháng' + '2b/tuần' gives 156250", () => {
  const feeDirect = parseFeePerSession("1tr25/tháng", 2);
  assert.strictEqual(feeDirect, 156250);

  const rawPost = "Mã lớp:FF1250 ✡️ LỚP 7 TOÁN ( hv nữ )- D/c: Đường Lý Thường Kiệt, Quận 10 - T/g: 2b/tuần ( 19h tối )- L/g: 1tr25/tháng ☑️ Nam/Nữ Phí: 25%";
  const listing = parseListing(rawPost, "toan");
  assert.ok(listing);
  assert.strictEqual(listing.feePerSession, 156250);
});

test("'GV 4tr3 - SV 2tr7' picks the SV price", () => {
  const feeDirect = parseFeePerSession("GV 4tr3/tháng - SV 2tr7/tháng", 4);
  assert.strictEqual(feeDirect, 168750);

  const rawPost = "Mã lớp:ME0352 ✡️ LỚP 7 TOÁN ( hv nam )- D/c: Đường Đào Duy Từ, Quận 10 - T/g: 4b/tuần ( tối )- L/g: GV 4tr3/tháng - SV 2tr7/tháng ☑️ Nam/Nữ Phí: 25%";
  const listing = parseListing(rawPost, "toan");
  assert.ok(listing);
  assert.strictEqual(listing.feePerSession, 168750);
});

test("a post missing the colon after D/c still parses", () => {
  const rawPost = "Mã lớp:MC3344 ✡️ LỚP 7 TOÁN ( hv nữ )- D/c Đường 3 Tháng 2, Quận 10 - T/g: 2b/tuần ( 19h tối )- L/g: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const listing = parseListing(rawPost, "toan");
  assert.ok(listing, "Listing should parse even without colon after D/c");
  assert.match(listing.address, /Đường 3 Tháng 2/i);
  assert.match(listing.schedule, /2b\/tuần/i);
  assert.match(listing.pay, /2tr\/tháng/i);
});

test("the fancy glyph labels parse", () => {
  const rawPost = "Mã lớp:FG1122 ✡️ LỚP 7 TOÁN ( hv nữ )- 𝐃/𝐜: Đường Nguyễn Tri Phương, Quận 10 - 𝗧/𝗴: 2b/tuần ( 19h tối )- 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const listing = parseListing(rawPost, "toan");
  assert.ok(listing, "Listing with fancy glyphs (𝐃/𝐜, 𝗧/𝗴, 𝐋/𝐠) should parse");
  assert.strictEqual(listing.code, "FG1122");
  assert.match(listing.address, /Đường Nguyễn Tri Phương/i);
  assert.match(listing.schedule, /2b\/tuần/i);
  assert.match(listing.pay, /2tr\/tháng/i);
});

test("'Tân Uyên Bình Thạnh' does not match the Bình Thạnh district", () => {
  assert.strictEqual(getDistance("Tân Uyên Bình Thạnh"), null);
  assert.strictEqual(getDistance("khu phố Khánh Hội Tân Phước Khánh Tân Uyên Bình Thạnh"), null);

  const match = getDistance("Ngô Đức Kế Q.bình thạnh");
  assert.ok(match);
  assert.strictEqual(match.km, 6.5);
});

test("defaults classify the fixtures as before, but rejected listings expose multiple reasons when several rules fail", () => {
  // Rule 1: northern accent required
  const p1 = "Mã lớp:RE0409 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần ( sau 19h tối )- 𝐋/𝐠: 2tr/tháng ☑️ GV/SV Tốt Nghiệp ( giọng bắc )Phí: 25%";
  const l1 = enrichAndEvaluate(p1);
  assert.strictEqual(l1.status, "rejected");
  assert.ok(l1.reasons.some((r) => r.id === "northernAccent"));
  // Also notice RE0409 requires GV/SV Tốt Nghiệp -> both reasons exposed!
  assert.ok(l1.reasons.some((r) => r.id === "graduateRequired"));
  assert.ok(l1.reasons.length >= 2, "Must expose multiple failing reasons");

  // Rule 2: graduate required
  const p2 = "Mã lớp:RE0426 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ GV/SV Tốt Nghiệp Phí: 25%";
  const l2 = enrichAndEvaluate(p2);
  assert.strictEqual(l2.status, "rejected");
  assert.ok(l2.reasons.some((r) => r.id === "graduateRequired"));

  // Rule 3: male only
  const p3 = "Mã lớp:MA1234 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam Phí: 25%";
  const l3 = enrichAndEvaluate(p3);
  assert.strictEqual(l3.status, "rejected");
  assert.ok(l3.reasons.some((r) => r.id === "excludeGenderOnly"));

  // Rule 4: school-entrance exam prep
  const p4 = "Mã lớp:TE0404 ✡️ LỚP 7 TOÁN ( hv nữ ôn thi vào 10 )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l4 = enrichAndEvaluate(p4);
  assert.strictEqual(l4.status, "rejected");
  assert.ok(l4.reasons.some((r) => r.id === "examPrep"));

  // Rule 5: grade excluded (grade 9 and 12)
  const p5_12 = "Mã lớp:RD2834 ✡️ LỚP 12 TOÁN ( hv nữ )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l5_12 = enrichAndEvaluate(p5_12);
  assert.strictEqual(l5_12.status, "rejected");
  assert.ok(l5_12.reasons.some((r) => r.id === "skipGrades"));

  const p5_9 = "Mã lớp:RD2661 ✡️ LỚP 9 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l5_9 = enrichAndEvaluate(p5_9);
  assert.strictEqual(l5_9.status, "rejected");
  assert.ok(l5_9.reasons.some((r) => r.id === "skipGrades"));

  // Rule 6: fee too low (150k/buổi <= 175k)
  const p6 = "Mã lớp:GE0306 ✡️ LỚP 7 TOÁN ( hs: nữ )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 150k/buổi ☑️ Nam/Nữ Phí: 25%";
  const l6 = enrichAndEvaluate(p6);
  assert.strictEqual(l6.status, "rejected");
  assert.ok(l6.reasons.some((r) => r.id === "minFee"));

  // Rule 7: not 2-3 sessions/week (4 sessions)
  const p7 = "Mã lớp:LE0315 ✡️ Lớp 4 Toán TV ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 4b/tuần (7h sx )- 𝐋/𝐠: 3tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l7 = enrichAndEvaluate(p7);
  assert.strictEqual(l7.status, "rejected");
  assert.ok(l7.reasons.some((r) => r.id === "sessionsPerWeek"));

  // Rule 8: multiple students
  const p8 = "Mã lớp:RA2501 ✡️ LỚP 7 TOÁN ( 2hv kèm theo CT )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l8 = enrichAndEvaluate(p8);
  assert.strictEqual(l8.status, "rejected");
  assert.ok(l8.reasons.some((r) => r.id === "multipleStudents"));

  // Rule 9: advanced level
  const p9 = "Mã lớp:RD2136 ✡️ LỚP 7 TOÁN ( hv nam , học nâng cao )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l9 = enrichAndEvaluate(p9);
  assert.strictEqual(l9.status, "rejected");
  assert.ok(l9.reasons.some((r) => r.id === "advanced"));

  // Rule 10: other university required
  const p10 = "Mã lớp:MD2750 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ ( có bằng Sư Phạm ) Phí: 25%";
  const l10 = enrichAndEvaluate(p10);
  assert.strictEqual(l10.status, "rejected");
  assert.ok(l10.reasons.some((r) => r.id === "otherUniversity"));

  // Rule 10 exception: KHTN mentioned alongside other university
  const p10_khtn = "Mã lớp:MD2751 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ ( Sư Phạm hoặc Khoa Học Tự Nhiên ) Phí: 25%";
  const l10_khtn = enrichAndEvaluate(p10_khtn);
  assert.notStrictEqual(l10_khtn.status, "rejected");

  // Rule 11: online
  const p11 = "Mã lớp:TD2715 ✡️ LỚP 7 TOÁN ( hv nữ )- 𝐃/𝐜: ONLINE ( Tuyên Quang )- 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const l11 = enrichAndEvaluate(p11);
  assert.strictEqual(l11.status, "rejected");
  assert.ok(l11.reasons.some((r) => r.id === "online"));

  // Multiple failing reasons: An ONLINE post requiring GV/SV Tốt Nghiệp (e.g., RD2885)
  const pMulti = "Mã lớp:UU0801 ✡️ LỚP 8 TOÁN ( hv nam )- 𝐃/𝐜: ONLINE ( Hà Nội )- 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ GV/SV Tốt Nghiệp Phí: 25%";
  const lMulti = enrichAndEvaluate(pMulti);
  assert.strictEqual(lMulti.status, "rejected");
  assert.ok(lMulti.reasons.some((r) => r.id === "online"), "Should contain online reason");
  assert.ok(lMulti.reasons.some((r) => r.id === "graduateRequired"), "Should contain graduate reason");
  assert.strictEqual(lMulti.reasons.length, 2);

  // Distance rule (> 7 km, Hóc Môn = 14 km)
  const pDist = "Mã lớp:TF7788 ✡️ LỚP 7 TOÁN ( hv nữ )- D/c: Nguyễn Thị Sóc, Bà Điểm, Hóc Môn - T/g: 2b/tuần ( 18h )- L/g: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const lDist = enrichAndEvaluate(pDist);
  assert.strictEqual(lDist.status, "rejected");
  assert.ok(lDist.reasons.some((r) => r.id === "maxKm"));
});

test("disabling a rule removes its reason; changing minFee, maxKm, sessionsPerWeek and skipGrades changes the outcome", () => {
  // Post with ONLINE and GV/SV Tốt Nghiệp
  const pMulti = "Mã lớp:UU0801 ✡️ LỚP 8 TOÁN ( hv nam )- 𝐃/𝐜: ONLINE ( Hà Nội )- 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ GV/SV Tốt Nghiệp Phí: 25%";

  // Disable online only
  const customFilters1 = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFilters1.rules.online.enabled = false;
  const l1 = enrichAndEvaluate(pMulti, "toan", customFilters1);
  assert.strictEqual(l1.status, "rejected");
  assert.ok(!l1.reasons.some((r) => r.id === "online"));
  assert.ok(l1.reasons.some((r) => r.id === "graduateRequired"));

  // Disable both online and graduateRequired -> moves out of "Đã loại" into "Cần xem" (because location is Hà Nội)
  const customFilters2 = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFilters2.rules.online.enabled = false;
  customFilters2.rules.graduateRequired.enabled = false;
  const l2 = enrichAndEvaluate(pMulti, "toan", customFilters2);
  assert.strictEqual(l2.status, "review");
  assert.ok(!l2.reasons.some((r) => r.id === "online"));
  assert.ok(!l2.reasons.some((r) => r.id === "graduateRequired"));
  assert.ok(l2.reasons.some((r) => r.id === "unknownLocation"));

  // With a known location in District 10, disabling graduateRequired moves it to "pass"
  const pKnownLoc = "Mã lớp:KN0801 ✡️ LỚP 8 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ GV/SV Tốt Nghiệp Phí: 25%";
  const lKnown = enrichAndEvaluate(pKnownLoc, "toan", customFilters2);
  assert.strictEqual(lKnown.status, "pass");
  assert.strictEqual(lKnown.reasons.length, 0);

  // minFee adjustment: 150k is rejected by default (175k), but passes if minFee is 140k or 0
  const pLowFee = "Mã lớp:GE0306 ✡️ LỚP 7 TOÁN ( hs: nữ )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 150k/buổi ☑️ Nam/Nữ Phí: 25%";
  const customFiltersFee = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFiltersFee.minFee = 140000;
  const lFee = enrichAndEvaluate(pLowFee, "toan", customFiltersFee);
  assert.strictEqual(lFee.status, "pass");

  // maxKm adjustment: Hóc Môn (14 km) is rejected by default (7 km), but passes if maxKm is 15
  const pFar = "Mã lớp:TF7788 ✡️ LỚP 7 TOÁN ( hv nữ )- D/c: Nguyễn Thị Sóc, Bà Điểm, Hóc Môn - T/g: 2b/tuần ( 18h )- L/g: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const customFiltersKm = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFiltersKm.maxKm = 15;
  const lKm = enrichAndEvaluate(pFar, "toan", customFiltersKm);
  assert.strictEqual(lKm.status, "pass");

  // sessionsPerWeek adjustment: 4b/tuần rejected by default (2-3), passes if max is 4
  const p4Sessions = "Mã lớp:LE0315 ✡️ Lớp 4 Toán TV ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 4b/tuần (7h sx )- 𝐋/𝐠: 3tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const customFiltersSess = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFiltersSess.sessionsPerWeek = { min: 2, max: 4 };
  const lSess = enrichAndEvaluate(p4Sessions, "toan", customFiltersSess);
  assert.strictEqual(lSess.status, "pass");

  // skipGrades adjustment: grade 9 rejected by default ([9, 12]), passes if skipGrades is [12]
  const pGrade9 = "Mã lớp:RD2661 ✡️ LỚP 9 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const customFiltersGrade = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFiltersGrade.skipGrades = [12];
  const lGrade = enrichAndEvaluate(pGrade9, "toan", customFiltersGrade);
  assert.strictEqual(lGrade.status, "pass");
});

test("keywords typed without diacritics still match", () => {
  const pGrad = "Mã lớp:RE0426 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ GV/SV Tốt Nghiệp Phí: 25%";
  const customFilters = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  // Replace keywords with non-diacritic keyword
  customFilters.rules.graduateRequired.keywords = ["tot nghiep"];
  const lGrad = enrichAndEvaluate(pGrad, "toan", customFilters);
  assert.strictEqual(lGrad.status, "rejected");
  assert.ok(lGrad.reasons.some((r) => r.id === "graduateRequired"));

  // Check northernAccent with non-diacritic
  const pNorth = "Mã lớp:RE0409 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ ( giọng bắc )Phí: 25%";
  customFilters.rules.northernAccent.keywords = ["giong bac"];
  const lNorth = enrichAndEvaluate(pNorth, "toan", customFilters);
  assert.strictEqual(lNorth.status, "rejected");
  assert.ok(lNorth.reasons.some((r) => r.id === "northernAccent"));
});

test("excludeGenderOnly: ['nu'] rejects female-only posts and accepts male-only ones", () => {
  const customFilters = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  customFilters.excludeGenderOnly = ["nu"];

  // Female only post
  const pFemaleOnly = "Mã lớp:FE1111 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nữ Phí: 25%";
  const lFemale = enrichAndEvaluate(pFemaleOnly, "toan", customFilters);
  assert.strictEqual(lFemale.status, "rejected");
  assert.ok(lFemale.reasons.some((r) => r.id === "excludeGenderOnly"));

  // Male only post should now pass
  const pMaleOnly = "Mã lớp:MA1234 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam Phí: 25%";
  const lMale = enrichAndEvaluate(pMaleOnly, "toan", customFilters);
  assert.strictEqual(lMale.status, "pass");

  // Male/Female post passes
  const pBoth = "Mã lớp:BO1234 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const lBoth = enrichAndEvaluate(pBoth, "toan", customFilters);
  assert.strictEqual(lBoth.status, "pass");
});

test("unknownLocation 'reject' vs 'review'", () => {
  const pLoc = "Mã lớp:UL5566 ✡️ LỚP 7 TOÁN ( hv nam )- D/c: Ngõ 550 Bạch Đằng Hà Nội - T/g: 2b/tuần - L/g: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";

  // Default: unknownLocation is 'review'
  const filtersReview = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  filtersReview.unknownLocation = "review";
  const lReview = enrichAndEvaluate(pLoc, "toan", filtersReview);
  assert.strictEqual(lReview.status, "review");
  assert.ok(lReview.reasons.some((r) => r.id === "unknownLocation"));

  // Reject mode: unknownLocation is 'reject'
  const filtersReject = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  filtersReject.unknownLocation = "reject";
  const lReject = enrichAndEvaluate(pLoc, "toan", filtersReject);
  assert.strictEqual(lReject.status, "rejected");
  assert.ok(lReject.reasons.some((r) => r.id === "unknownLocation"));
});

test("loadFilters/validation: garbage, missing keys and old versions fall back to defaults without throwing", () => {
  // Non-object or empty
  assert.deepStrictEqual(validateAndMergeFilters(null), DEFAULT_FILTERS);
  assert.deepStrictEqual(validateAndMergeFilters(undefined), DEFAULT_FILTERS);
  assert.deepStrictEqual(validateAndMergeFilters("garbage"), DEFAULT_FILTERS);
  assert.deepStrictEqual(validateAndMergeFilters(123), DEFAULT_FILTERS);

  // Wrong or old versions
  assert.deepStrictEqual(validateAndMergeFilters({ version: 0 }), DEFAULT_FILTERS);
  assert.deepStrictEqual(validateAndMergeFilters({ version: 2 }), DEFAULT_FILTERS);

  // Clamping numbers
  const clamped = validateAndMergeFilters({
    version: 1,
    minFee: -50,
    maxKm: 200,
    sessionsPerWeek: { min: 0, max: 10 },
    unknownKey: "should be dropped"
  });
  assert.strictEqual(clamped.minFee, 0);
  assert.strictEqual(clamped.maxKm, 100);
  assert.strictEqual(clamped.sessionsPerWeek.min, 1);
  assert.strictEqual(clamped.sessionsPerWeek.max, 7);
  assert.strictEqual(clamped.unknownKey, undefined);

  // loadFilters() never throws
  const loaded = loadFilters();
  assert.ok(loaded);
  assert.strictEqual(loaded.version, 1);
  assert.strictEqual(typeof loaded.minFee, "number");
});

test("evaluate() makes no I/O and is deterministic (same input → same output)", () => {
  const p = "Mã lớp:SG8821 ✡️ LỚP 8 TOÁN ( hv nam )- 𝐃/𝐜: Đường Đào Duy Từ, Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const listing1 = parseListing(p, "toan");
  listing1.km = 1.0;

  const res1 = evaluate(listing1, DEFAULT_FILTERS);
  assert.strictEqual(res1.status, "pass");

  const listing2 = parseListing(p, "toan");
  listing2.km = 1.0;
  const res2 = evaluate(listing2, DEFAULT_FILTERS);

  assert.deepStrictEqual(res1.status, res2.status);
  assert.deepStrictEqual(res1.reasons, res2.reasons);
  assert.deepStrictEqual(res1.km, res2.km);
});

test("valid post passes evaluation with pass status", () => {
  const pPass = "Mã lớp:SG8821 ✡️ LỚP 8 TOÁN ( hv nam )- 𝐃/𝐜: Đường Đào Duy Từ, Phường 5, Quận 10, Hồ Chí Minh - 𝗧/𝗴: 2b/tuần ( tối T2, T4 )- 𝐋/𝐠: 2tr/tháng ☑️ Nam/Nữ Phí: 25%";
  const lPass = enrichAndEvaluate(pPass);
  assert.strictEqual(lPass.status, "pass");
  assert.deepStrictEqual(lPass.reasons, []);
  assert.strictEqual(lPass.km, 1.0);
});

test("parseFeePerSession correctly handles decimal million formats and preserves existing cases (Bug 1)", () => {
  // Amount before dividing session (using /buổi)
  assert.strictEqual(parseFeePerSession("2.5tr/buổi", 2), 2500000);
  assert.strictEqual(parseFeePerSession("2,5tr/buổi", 2), 2500000);
  assert.strictEqual(parseFeePerSession("2,5 triệu/buổi", 2), 2500000);
  assert.strictEqual(parseFeePerSession("1.25tr/buổi", 2), 1250000);
  assert.strictEqual(parseFeePerSession("2tr5/buổi", 2), 2500000);
  assert.strictEqual(parseFeePerSession("1tr25/buổi", 2), 1250000);
  assert.strictEqual(parseFeePerSession("4tr3/buổi", 2), 4300000);
  assert.strictEqual(parseFeePerSession("3 triệu/buổi", 2), 3000000);

  // Phenomenon case: "SV 2.5tr (3b/tuần)" -> 2_500_000 / (3 * 4) = 208333
  assert.strictEqual(parseFeePerSession("SV 2.5tr (3b/tuần)", 3), 208333);

  // Must not break:
  assert.strictEqual(parseFeePerSession("1.200.000", 2), 150000);
  assert.strictEqual(parseFeePerSession("1.200.000/buổi", 2), 1200000);
  assert.strictEqual(parseFeePerSession("250.000đ/buổi", 2), 250000);
  assert.strictEqual(parseFeePerSession("200k/buổi", 2), 200000);
  assert.strictEqual(parseFeePerSession("GV 4tr3 - SV 2tr7", 4), 168750);

  // Monthly without perWeek returns null
  assert.strictEqual(parseFeePerSession("2.5tr", null), null);
  assert.strictEqual(parseFeePerSession("2.5tr", 0), null);
});

test("getAcceptedGenders ignores geographical terms containing 'nam' (Bug 2)", () => {
  // True gender cases
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Sinh viên Nam")), ["nam"]);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("SV Nữ")), ["nu"]);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Nam/Nữ đều được")).sort(), ["nam", "nu"]);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("GV nam")), ["nam"]);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("nam sinh")), ["nam"]);

  // Non-gender / location cases
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Giọng miền Nam, SV Nữ")), ["nu"]);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Giọng miền Nam")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Việt Nam")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("người Nam Định")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Nam Bộ")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Tây Nam")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Đông Nam")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Nam Sài Gòn")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Nam Từ Liêm")), []);
  assert.deepStrictEqual(Array.from(getAcceptedGenders("Giọng miền Nam, SV Nam")), ["nam"]);
});

test("end-to-end: listing with requirement 'Giọng miền Nam' is not rejected by excludeGenderOnly (Bug 2)", () => {
  const postMienNam = "Mã lớp:MN1234 ✡️ LỚP 7 TOÁN ( hv nam )- 𝐃/𝐜: Phường 5, Quận 10 - 𝗧/𝗴: 2b/tuần - 𝐋/𝐠: 2tr/tháng ☑️ Giọng miền Nam Phí: 25%";
  const lMienNam = enrichAndEvaluate(postMienNam, "toan", DEFAULT_FILTERS);
  assert.ok(lMienNam);
  assert.ok(!lMienNam.reasons.some((r) => r.id === "excludeGenderOnly"), "Should not be rejected for gender");
  assert.strictEqual(lMienNam.status, "pass");
});

