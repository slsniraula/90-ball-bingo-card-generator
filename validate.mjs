/**
 * @file validate.mjs
 * Standalone validation: generates 100 cards in-memory and verifies all rules.
 * Run: node validate.mjs
 */

// ── Inline core logic (mirrors index.mjs exactly) ──────────────

const CONFIG = {
  TOTAL_CARDS: 100,
  CARD: { ROWS: 3, COLS: 9, NUMBERS_PER_ROW: 5, TOTAL_NUMBERS: 15, MAX_GEN_ATTEMPTS: 2000 },
  COLUMN_RANGES: [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]],
};

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildColumnCounts() {
  const counts = new Array(CONFIG.CARD.COLS).fill(1);
  let remaining = CONFIG.CARD.TOTAL_NUMBERS - CONFIG.CARD.COLS;
  const order = shuffle([...Array(CONFIG.CARD.COLS).keys()]);
  for (const col of order) {
    if (remaining === 0) break;
    const canAdd = Math.min(CONFIG.CARD.ROWS - counts[col], remaining);
    if (canAdd > 0) { const add = randomInt(0, canAdd); counts[col] += add; remaining -= add; }
  }
  if (remaining > 0) {
    for (let col = 0; col < CONFIG.CARD.COLS && remaining > 0; col++) {
      const canAdd = CONFIG.CARD.ROWS - counts[col];
      if (canAdd > 0) { const add = Math.min(canAdd, remaining); counts[col] += add; remaining -= add; }
    }
  }
  return counts;
}

function assignRowsToColumns(colCounts) {
  const { ROWS, NUMBERS_PER_ROW } = CONFIG.CARD;
  const deck = [];
  for (let col = 0; col < CONFIG.CARD.COLS; col++)
    for (let s = 0; s < colCounts[col]; s++) deck.push(col);
  shuffle(deck);
  const rowA = [[], [], []];
  for (const col of deck) {
    const cands = [];
    for (let row = 0; row < ROWS; row++)
      if (rowA[row].length < NUMBERS_PER_ROW && !rowA[row].includes(col)) cands.push(row);
    if (cands.length === 0) return null;
    rowA[cands[randomInt(0, cands.length - 1)]].push(col);
  }
  for (let row = 0; row < ROWS; row++) if (rowA[row].length !== NUMBERS_PER_ROW) return null;
  return rowA;
}

function pickDistinct(min, max, count) {
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);
  shuffle(pool);
  return pool.slice(0, count);
}

function generateCardNumbers() {
  const colCounts = buildColumnCounts();
  const rowA = assignRowsToColumns(colCounts);
  if (!rowA) return null;
  const card = Array.from({ length: CONFIG.CARD.COLS }, () => new Array(CONFIG.CARD.ROWS).fill(null));
  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    const [min, max] = CONFIG.COLUMN_RANGES[col];
    const nums = pickDistinct(min, max, colCounts[col]).sort((a, b) => a - b);
    const rows = [];
    for (let row = 0; row < CONFIG.CARD.ROWS; row++) if (rowA[row].includes(col)) rows.push(row);
    for (let i = 0; i < rows.length; i++) card[col][rows[i]] = nums[i];
  }
  return card;
}

function validateCard(card) {
  if (!card) return { valid: false, errors: ["null card"] };
  const errs = [];
  const all = card.flat().filter(n => n !== null);
  if (all.length !== CONFIG.CARD.TOTAL_NUMBERS) errs.push(`Total ${all.length} ≠ 15`);
  for (let row = 0; row < CONFIG.CARD.ROWS; row++) {
    const cnt = card.map(c => c[row]).filter(n => n !== null).length;
    if (cnt !== CONFIG.CARD.NUMBERS_PER_ROW) errs.push(`Row${row}: ${cnt}≠5`);
  }
  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    const cnt = card[col].filter(n => n !== null).length;
    if (cnt < 1 || cnt > 3) errs.push(`Col${col}: ${cnt} numbers`);
    const [min, max] = CONFIG.COLUMN_RANGES[col];
    card[col].forEach(n => { if (n !== null && (n < min || n > max)) errs.push(`Col${col}: ${n} out of [${min},${max}]`); });
    const nums = card[col].filter(n => n !== null);
    const sorted = [...nums].sort((a, b) => a - b);
    if (JSON.stringify(nums) !== JSON.stringify(sorted)) errs.push(`Col${col} unsorted: [${nums}]`);
  }
  if (new Set(all).size !== all.length) errs.push("Duplicate numbers");
  return { valid: errs.length === 0, errors: errs };
}

const sigs = new Set();
function isUnique(card) {
  const sig = JSON.stringify(card);
  if (sigs.has(sig)) return false;
  sigs.add(sig);
  return true;
}

function genCard(id) {
  for (let a = 0; a < CONFIG.CARD.MAX_GEN_ATTEMPTS; a++) {
    const card = generateCardNumbers();
    if (!card) continue;
    const { valid } = validateCard(card);
    if (!valid) continue;
    if (!isUnique(card)) continue;
    return card;
  }
  throw new Error(`Failed card #${id}`);
}

// ── Run validation ──────────────────────────────────────────

console.log("🔍 Running validation for", CONFIG.TOTAL_CARDS, "cards...\n");

let passed = 0;
let failed = 0;

for (let i = 1; i <= CONFIG.TOTAL_CARDS; i++) {
  const card = genCard(i);
  const { valid, errors } = validateCard(card);
  if (valid) {
    passed++;
  } else {
    failed++;
    console.error(`❌ Card #${i} FAILED:`, errors);
  }
}

console.log(`\n📊 Results:`);
console.log(`   ✅ Passed : ${passed}/${CONFIG.TOTAL_CARDS}`);
console.log(`   ❌ Failed : ${failed}/${CONFIG.TOTAL_CARDS}`);
console.log(`   🔑 Unique signatures: ${sigs.size}`);

if (failed === 0 && sigs.size === CONFIG.TOTAL_CARDS) {
  console.log("\n🎉 ALL CHECKS PASSED! Tambola card logic is correct.");
} else {
  console.error("\n💥 SOME CHECKS FAILED. Review errors above.");
  process.exit(1);
}
