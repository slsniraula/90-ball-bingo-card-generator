/**
 * @file index.mjs
 * @description Production-ready Tambola/Housie Bingo Card Generator.
 *              Generates a PDF with 100 unique, validated 9×3 bingo cards.
 *              Uses jsPDF 2.5.x for PDF generation.
 *
 * Card Rules:
 *  - 9 columns × 3 rows per card
 *  - Each row has exactly 5 numbers and 4 blanks
 *  - Each column has 1–3 numbers (never 0, never all 3 occupied in every col)
 *  - Column i holds numbers in a specific range (col 0 → 1–9, ..., col 8 → 80–90)
 *  - Numbers within each column are sorted ascending (top → bottom)
 *  - 15 numbers total per card; no duplicates within a card; no duplicate cards
 */

import { jsPDF } from "jspdf";
import fs from "fs";

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────

/** @type {Object} Global configuration — no magic numbers anywhere else */
const CONFIG = {
  TOTAL_CARDS: 100,

  CARD: {
    ROWS: 3,
    COLS: 9,
    NUMBERS_PER_ROW: 5,
    BLANKS_PER_ROW: 4,
    TOTAL_NUMBERS: 15,
    MAX_GEN_ATTEMPTS: 2000, // max retries before giving up on a single card
  },

  LAYOUT: {
    PAGE_WIDTH: 210,   // A4 width  (mm)
    PAGE_HEIGHT: 297,  // A4 height (mm)
    MARGIN: 10,        // outer page margin (mm)
    CARD_WIDTH: 90,    // card width  (mm)
    // 3 cards tall: 10 + 3×80 + 2×12 + 10 = 286mm ≤ 297mm ✓
    CARD_HEIGHT: 70,   // card height (mm)
    CARD_GAP_X: 10,    // horizontal gap between cards (mm)
    CARD_GAP_Y: 22,     // vertical gap between cards   (mm)
    CARDS_PER_ROW: 2,
    CARDS_PER_COL: 3,
    CARDS_PER_PAGE: 6,
    HEADER_HEIGHT: 8,  // slim card-number header height (mm)
  },

  STYLING: {
    BORDER_WIDTH: 1,          // card outer border (pt)
    CELL_BORDER_WIDTH: 0.5,   // grid cell border  (pt)
    HEADER_BG: "#F0F0F0",
    CELL_BG_FILLED: "#F5F9FF",
    CELL_BG_BLANK: "#FFFFFF",
    BORDER_COLOR: "#000000",
    CELL_BORDER_COLOR: "#CCCCCC",
    HEADER_TEXT_COLOR: "#333333",
    NUMBER_TEXT_COLOR: "#000000",
    NUMBER_FONT_SIZE: 14,     // pt — numbers inside grid cells
    CARD_ID_FONT_SIZE: 11,    // pt — "Card #NNN" in header
  },

  /** Column range definitions — index = column position (0-based) */
  COLUMN_RANGES: [
    [1,  9],   // col 0
    [10, 19],  // col 1
    [20, 29],  // col 2
    [30, 39],  // col 3
    [40, 49],  // col 4
    [50, 59],  // col 5
    [60, 69],  // col 6
    [70, 79],  // col 7
    [80, 90],  // col 8
  ],
};

// ─────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Returns a random integer in the inclusive range [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Shuffles an array in-place using Fisher-Yates and returns it.
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function shuffle(array) {
  for (let idx = array.length - 1; idx > 0; idx--) {
    const swapIdx = randomInt(0, idx);
    [array[idx], array[swapIdx]] = [array[swapIdx], array[idx]];
  }
  return array;
}

/**
 * Converts a hex color string (#RRGGBB) into a jsPDF-compatible {r,g,b} object.
 * @param {string} hex  e.g. "#F5F9FF"
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

// ─────────────────────────────────────────────────────────────
// CARD GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Generates one valid Tambola card.
 *
 * Card is represented as a 2-D array: card[col][row]
 * Null means the cell is blank.
 *
 * Algorithm:
 *  1. Build column-occupancy pattern ensuring 15 total numbers with each
 *     column having 1–3 numbers and each row having exactly 5 numbers.
 *  2. For each column, draw the required count of distinct numbers from
 *     that column's range.
 *  3. Sort each column's values ascending, placing them in the occupied rows.
 *
 * @returns {(number|null)[][]}  card[col][row], 9 cols × 3 rows
 */
function generateCardNumbers() {
  // Step 1 – decide how many numbers go in each column (1, 2, or 3)
  // Sum must equal 15; each col gets at least 1.
  const colCounts = buildColumnCounts();

  // Step 2 – decide which ROWS within each column are occupied
  // and place numbers there
  const card = buildCardFromCounts(colCounts);

  return card;
}

/**
 * Produces an array of 9 integers (each 1–3) that sum exactly to 15.
 * Each value represents how many numbers will occupy that column.
 * Uses a constrained-random approach: start with all 1s (= 9 total),
 * then distribute the remaining 6 across columns without exceeding 3.
 *
 * @returns {number[]} length-9 array
 */
function buildColumnCounts() {
  const counts = new Array(CONFIG.CARD.COLS).fill(1); // start: every col has 1
  let remaining = CONFIG.CARD.TOTAL_NUMBERS - CONFIG.CARD.COLS; // 15 - 9 = 6

  // Column indices that can still accept more numbers
  const order = shuffle([...Array(CONFIG.CARD.COLS).keys()]);

  for (const col of order) {
    if (remaining === 0) break;
    const canAdd = Math.min(CONFIG.CARD.ROWS - counts[col], remaining);
    if (canAdd > 0) {
      const add = randomInt(0, canAdd);
      counts[col] += add;
      remaining -= add;
    }
  }

  // If there's still remaining (unlikely but safe-guard): force it in
  if (remaining > 0) {
    for (let col = 0; col < CONFIG.CARD.COLS && remaining > 0; col++) {
      const canAdd = CONFIG.CARD.ROWS - counts[col];
      if (canAdd > 0) {
        const add = Math.min(canAdd, remaining);
        counts[col] += add;
        remaining -= add;
      }
    }
  }

  return counts;
}

/**
 * Given per-column counts, assigns numbers and builds the card grid.
 *
 * Strategy:
 *  - For each column, pick `count` unique numbers from that column's range.
 *  - Determine row assignments so that every row ends up with exactly 5 numbers.
 *  - Sort the chosen numbers ascending; assign top→bottom within occupied rows.
 *
 * @param {number[]} colCounts  per-column number counts (length 9, sum = 15)
 * @returns {(number|null)[][]}
 */
function buildCardFromCounts(colCounts) {
  // Build row-assignment matrix: rowSlots[row] = list of col indices assigned to that row
  const rowAssignments = assignRowsToColumns(colCounts);
  if (!rowAssignments) return null; // assignment failed; caller will retry

  // Initialise empty grid
  const card = Array.from({ length: CONFIG.CARD.COLS }, () =>
    new Array(CONFIG.CARD.ROWS).fill(null)
  );

  // For each column: pick numbers, sort them, fill in the assigned rows
  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    const [min, max] = CONFIG.COLUMN_RANGES[col];
    const count = colCounts[col];
    const numbers = pickDistinctNumbers(min, max, count);
    numbers.sort((a, b) => a - b); // ascending

    // Find which rows this column occupies (from rowAssignments)
    const occupiedRows = [];
    for (let row = 0; row < CONFIG.CARD.ROWS; row++) {
      if (rowAssignments[row].includes(col)) {
        occupiedRows.push(row);
      }
    }
    // occupiedRows is already in row order (0,1,2) — pair with sorted numbers
    for (let i = 0; i < occupiedRows.length; i++) {
      card[col][occupiedRows[i]] = numbers[i];
    }
  }

  return card;
}

/**
 * Assigns columns to rows such that every row gets exactly NUMBERS_PER_ROW
 * column slots while respecting per-column count requirements.
 *
 * Returns a row→[colIndices] mapping, or null if no valid assignment found.
 *
 * @param {number[]} colCounts
 * @returns {number[][]|null}
 */
function assignRowsToColumns(colCounts) {
  const { ROWS, NUMBERS_PER_ROW } = CONFIG.CARD;

  // Build a "deck" of (col, slot) pairs — each col appears colCounts[col] times
  const deck = [];
  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    for (let slot = 0; slot < colCounts[col]; slot++) {
      deck.push(col);
    }
  }
  shuffle(deck); // randomise assignment order

  // Greedy row fill with backtracking
  const rowAssignments = [[], [], []]; // rowAssignments[row] = [col, ...]
  const colRowCount = new Array(CONFIG.CARD.COLS).fill(0); // how many rows each col already has

  // Each col must appear in exactly colCounts[col] distinct rows
  // We process the shuffled deck sequentially
  for (const col of deck) {
    // Find a row that:
    //  a) isn't already full (< NUMBERS_PER_ROW)
    //  b) doesn't already have this col
    const candidates = [];
    for (let row = 0; row < ROWS; row++) {
      if (
        rowAssignments[row].length < NUMBERS_PER_ROW &&
        !rowAssignments[row].includes(col)
      ) {
        candidates.push(row);
      }
    }
    if (candidates.length === 0) return null; // dead-end; caller retries
    const chosenRow = candidates[randomInt(0, candidates.length - 1)];
    rowAssignments[chosenRow].push(col);
    colRowCount[col]++;
  }

  // Verify all rows have exactly NUMBERS_PER_ROW
  for (let row = 0; row < ROWS; row++) {
    if (rowAssignments[row].length !== NUMBERS_PER_ROW) return null;
  }

  return rowAssignments;
}

/**
 * Picks `count` distinct integers from the inclusive range [min, max].
 * @param {number} min
 * @param {number} max
 * @param {number} count
 * @returns {number[]}
 */
function pickDistinctNumbers(min, max, count) {
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);
  shuffle(pool);
  return pool.slice(0, count);
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Validates a generated card against all Tambola rules.
 *
 * @param {(number|null)[][]} card  card[col][row]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCard(card) {
  if (!card) return { valid: false, errors: ["Card is null/undefined"] };

  const errors = [];

  // 1. Total number count
  const allNumbers = card.flat().filter((n) => n !== null);
  if (allNumbers.length !== CONFIG.CARD.TOTAL_NUMBERS) {
    errors.push(
      `Total numbers: ${allNumbers.length}, expected ${CONFIG.CARD.TOTAL_NUMBERS}`
    );
  }

  // 2. Each row has exactly NUMBERS_PER_ROW numbers
  for (let row = 0; row < CONFIG.CARD.ROWS; row++) {
    const rowCount = card
      .map((col) => col[row])
      .filter((n) => n !== null).length;
    if (rowCount !== CONFIG.CARD.NUMBERS_PER_ROW) {
      errors.push(
        `Row ${row}: ${rowCount} numbers, expected ${CONFIG.CARD.NUMBERS_PER_ROW}`
      );
    }
  }

  // 3. Each column has 1–3 numbers
  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    const colCount = card[col].filter((n) => n !== null).length;
    if (colCount < 1 || colCount > CONFIG.CARD.ROWS) {
      errors.push(
        `Col ${col}: ${colCount} numbers, expected 1–${CONFIG.CARD.ROWS}`
      );
    }
  }

  // 4. Column range enforcement
  card.forEach((col, colIdx) => {
    const [min, max] = CONFIG.COLUMN_RANGES[colIdx];
    col.forEach((num) => {
      if (num !== null && (num < min || num > max)) {
        errors.push(
          `Col ${colIdx}: ${num} is outside range ${min}–${max}`
        );
      }
    });
  });

  // 5. No duplicates within card
  if (new Set(allNumbers).size !== allNumbers.length) {
    errors.push("Duplicate numbers found within the card");
  }

  // 6. Column values sorted ascending (ignoring nulls, top→bottom)
  card.forEach((col, colIdx) => {
    const nums = col.filter((n) => n !== null);
    const sorted = [...nums].sort((a, b) => a - b);
    if (JSON.stringify(nums) !== JSON.stringify(sorted)) {
      errors.push(`Col ${colIdx} is not sorted ascending. Got: [${nums}]`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────
// DUPLICATE PREVENTION
// ─────────────────────────────────────────────────────────────

/** Stores stringified card signatures to detect duplicates. */
const generatedCardSignatures = new Set();

/**
 * Checks whether a card is unique among all previously generated cards.
 * If unique, registers its signature and returns true.
 *
 * @param {(number|null)[][]} card
 * @returns {boolean}
 */
function isUnique(card) {
  const signature = JSON.stringify(card);
  if (generatedCardSignatures.has(signature)) return false;
  generatedCardSignatures.add(signature);
  return true;
}

// ─────────────────────────────────────────────────────────────
// CARD GENERATION WITH RETRY
// ─────────────────────────────────────────────────────────────

/**
 * Generates a single, unique, validated Tambola card.
 * Retries up to CONFIG.CARD.MAX_GEN_ATTEMPTS times.
 *
 * @param {number} cardId  1-based card identifier (for error messages)
 * @returns {(number|null)[][]}
 * @throws {Error} if a valid unique card cannot be produced within the attempt limit
 */
function generateUniqueValidCard(cardId) {
  for (let attempt = 1; attempt <= CONFIG.CARD.MAX_GEN_ATTEMPTS; attempt++) {
    const card = generateCardNumbers();
    if (!card) continue; // row assignment failed; retry

    const { valid, errors } = validateCard(card);
    if (!valid) {
      // Validation errors — these indicate a logic bug; log for debugging
      if (attempt === 1) {
        console.warn(`Card #${cardId} validation failed (attempt ${attempt}):`, errors);
      }
      continue;
    }

    if (!isUnique(card)) continue; // duplicate; retry

    return card;
  }

  throw new Error(
    `Failed to generate a valid unique card #${cardId} after ` +
      `${CONFIG.CARD.MAX_GEN_ATTEMPTS} attempts`
  );
}

// ─────────────────────────────────────────────────────────────
// PDF RENDERING
// ─────────────────────────────────────────────────────────────

/**
 * Renders a single Tambola card onto the PDF document at the given position.
 *
 * Layout inside the card bounding box (xOffset, yOffset):
 *  ┌─────────────────────────────────────────┐
 *  │   HEADER: "Card #NNN" (centered, bold)  │ ← HEADER_HEIGHT mm
 *  ├─────────────────────────────────────────┤
 *  │   Grid  (3 rows × 9 cols of cells)      │
 *  └─────────────────────────────────────────┘
 *
 * @param {jsPDF}             doc      jsPDF instance
 * @param {(number|null)[][]} card     card[col][row]
 * @param {number}            cardId   1-based card ID
 * @param {number}            xOffset  left edge of the card (mm)
 * @param {number}            yOffset  top  edge of the card (mm)
 */
function renderCardToPDF(doc, card, cardId, xOffset, yOffset) {
  const { CARD_WIDTH, CARD_HEIGHT, HEADER_HEIGHT } = CONFIG.LAYOUT;
  const {
    BORDER_WIDTH,
    CELL_BORDER_WIDTH,
    HEADER_BG,
    CELL_BG_FILLED,
    CELL_BG_BLANK,
    BORDER_COLOR,
    CELL_BORDER_COLOR,
    HEADER_TEXT_COLOR,
    NUMBER_TEXT_COLOR,
    NUMBER_FONT_SIZE,
    CARD_ID_FONT_SIZE,
  } = CONFIG.STYLING;

  // Grid starts immediately after the header
  const gridTop    = yOffset + HEADER_HEIGHT;
  const gridHeight = CARD_HEIGHT - HEADER_HEIGHT;
  const cellWidth  = CARD_WIDTH / CONFIG.CARD.COLS;
  const cellHeight = gridHeight / CONFIG.CARD.ROWS;

  // ── Colour helpers ───────────────────────────────────────────
  const setFill = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    doc.setFillColor(r, g, b);
  };

  const setDraw = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    doc.setDrawColor(r, g, b);
  };

  const setTextColor = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    doc.setTextColor(r, g, b);
  };

  // ── 1. Outer card border ─────────────────────────────────────
  doc.setLineWidth(BORDER_WIDTH * 0.352778); // pt → mm
  setDraw(BORDER_COLOR);
  doc.rect(xOffset, yOffset, CARD_WIDTH, CARD_HEIGHT, "S");

  // ── 2. Header background ─────────────────────────────────────
  setFill(HEADER_BG);
  setDraw(BORDER_COLOR);
  doc.rect(xOffset, yOffset, CARD_WIDTH, HEADER_HEIGHT, "F");

  // ── 3. Header separator line ─────────────────────────────────
  doc.setLineWidth(0.3);
  setDraw(BORDER_COLOR);
  doc.line(
    xOffset, yOffset + HEADER_HEIGHT,
    xOffset + CARD_WIDTH, yOffset + HEADER_HEIGHT
  );

  // ── 4. Card number — centred, bold ──────────────────────────
  setTextColor(HEADER_TEXT_COLOR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(CARD_ID_FONT_SIZE);
  // Vertical centre within the header band
  const cardIdY = yOffset + HEADER_HEIGHT / 2 + CARD_ID_FONT_SIZE * 0.352778 / 2;
  doc.text(
    `Card #${String(cardId).padStart(3, "0")}`,
    xOffset + CARD_WIDTH / 2,
    cardIdY,
    { align: "center" }
  );

  // ── 5. Grid cells ────────────────────────────────────────────
  doc.setLineWidth(CELL_BORDER_WIDTH * 0.352778); // pt → mm

  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    for (let row = 0; row < CONFIG.CARD.ROWS; row++) {
      const cellX     = xOffset + col * cellWidth;
      const cellY     = gridTop  + row * cellHeight;
      const cellValue = card[col][row];
      const isFilled  = cellValue !== null;

      setFill(isFilled ? CELL_BG_FILLED : CELL_BG_BLANK);
      setDraw(CELL_BORDER_COLOR);
      doc.rect(cellX, cellY, cellWidth, cellHeight, "FD");
    }
  }

  // ── 6. Grid numbers ──────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(NUMBER_FONT_SIZE);
  setTextColor(NUMBER_TEXT_COLOR);

  for (let col = 0; col < CONFIG.CARD.COLS; col++) {
    for (let row = 0; row < CONFIG.CARD.ROWS; row++) {
      const cellValue = card[col][row];
      if (cellValue === null) continue;

      const cellX = xOffset + col * cellWidth;
      const cellY = gridTop  + row * cellHeight;

      // Vertically centre the number within the cell
      const textY = cellY + cellHeight / 2 + NUMBER_FONT_SIZE * 0.352778 / 2 - 0.5;
      doc.text(
        String(cellValue),
        cellX + cellWidth / 2,
        textY,
        { align: "center" }
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PDF ORCHESTRATION
// ─────────────────────────────────────────────────────────────

/**
 * Creates the complete jsPDF document containing 100 Tambola cards.
 * Cards are arranged 2×3 per A4 page (17 pages total).
 *
 * @returns {jsPDF}
 * @throws {Error} if card generation or page count validation fails
 */
function createPDFDocument() {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const {
    TOTAL_CARDS,
  } = CONFIG;

  const {
    MARGIN,
    CARD_WIDTH,
    CARD_HEIGHT,
    CARD_GAP_X,
    CARD_GAP_Y,
    CARDS_PER_ROW,
    CARDS_PER_PAGE,
  } = CONFIG.LAYOUT;

  // Pre-calculate card top-left positions on a page (0-based card slot index)
  const cardSlotPositions = [];
  for (let slot = 0; slot < CARDS_PER_PAGE; slot++) {
    const row = Math.floor(slot / CARDS_PER_ROW);
    const col = slot % CARDS_PER_ROW;
    const xOffset = MARGIN + col * (CARD_WIDTH + CARD_GAP_X);
    const yOffset = MARGIN + row * (CARD_HEIGHT + CARD_GAP_Y);
    cardSlotPositions.push({ xOffset, yOffset });
  }

  const LOG_INTERVAL = 10;

  for (let cardIndex = 0; cardIndex < TOTAL_CARDS; cardIndex++) {
    const cardId = cardIndex + 1;

    // Add a new page for every page except the first
    if (cardIndex > 0 && cardIndex % CARDS_PER_PAGE === 0) {
      doc.addPage();
    }

    // Generate a valid, unique card
    const card = generateUniqueValidCard(cardId);

    // Log progress every LOG_INTERVAL cards
    if (cardId % LOG_INTERVAL === 0 || cardId === 1 || cardId === TOTAL_CARDS) {
      console.log(`Generated ${cardId}/${TOTAL_CARDS} cards...`);
    }

    // Determine position on current page
    const slotIndex = cardIndex % CARDS_PER_PAGE;
    const { xOffset, yOffset } = cardSlotPositions[slotIndex];

    renderCardToPDF(doc, card, cardId, xOffset, yOffset);
  }

  // Final validation — verify page count
  const expectedPages = Math.ceil(TOTAL_CARDS / CARDS_PER_PAGE);
  const actualPages = doc.internal.getNumberOfPages();
  if (actualPages !== expectedPages) {
    throw new Error(
      `Page count mismatch: expected ${expectedPages}, got ${actualPages}`
    );
  }
  console.log(`✅ PDF has exactly ${actualPages} pages.`);

  return doc;
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────

/**
 * Main function — generates the PDF and saves it to disk.
 */
function main() {
  try {
    console.log("🎱 Tambola Card Generator starting...");
    console.log(`   Generating ${CONFIG.TOTAL_CARDS} unique cards...`);

    const doc = createPDFDocument();

    // Build filename with timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-:T]/g, "_")
      .split(".")[0]; // e.g. "2026_04_11_08_30_00"
    const fileName = `Tambola_Cards_100_${timestamp}.pdf`;

    // Save to disk using Node.js Buffer output
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    fs.writeFileSync(fileName, pdfBuffer);

    console.log(`\n✅ Done! PDF saved as: ${fileName}`);
    console.log(`   Total cards: ${CONFIG.TOTAL_CARDS}`);
    console.log(`   Total pages: ${Math.ceil(CONFIG.TOTAL_CARDS / CONFIG.LAYOUT.CARDS_PER_PAGE)}`);
    console.log(`   Unique card signatures tracked: ${generatedCardSignatures.size}`);

    // Clean up signature set to free memory
    generatedCardSignatures.clear();
  } catch (err) {
    console.error("❌ Error generating PDF:", err.message);
    process.exit(1);
  }
}

main();
