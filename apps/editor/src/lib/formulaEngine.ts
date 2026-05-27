import { TableCell } from "../types";

// ─────────────────────────────────────────────────────────
// Excel-compatible formula engine
// Supports: SUM, AVERAGE, COUNT, COUNTA, MAX, MIN, PRODUCT,
//           ROUND, ABS, IF, CONCAT, CONCATENATE, UPPER, LOWER,
//           LEN, TRIM, LEFT, RIGHT, MID, VLOOKUP (basic),
//           COUNTIF, SUMIF, IFERROR, TODAY, NOW
// ─────────────────────────────────────────────────────────

/** Convert Excel column letter(s) to 0-based index: A→0, B→1, AA→26 */
function colLetterToIndex(col: string): number {
  let n = 0;
  for (const c of col.toUpperCase()) {
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Parse a cell address like "B3" → { col: 1, row: 2 } (0-based) */
function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!m) return null;
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

/** Resolve a single cell value from tableData */
function getCellValue(ref: string, tableData: TableCell[][]): string {
  const pos = parseCellRef(ref);
  if (!pos) return "";
  const row = tableData[pos.row];
  if (!row) return "";
  const cell = row[pos.col];
  if (!cell) return "";
  if (cell.formula) return evaluateFormula(cell.formula, tableData);
  return cell.value ?? "";
}

/** Parse a range like "B2:D5" → array of cell refs */
function parseRange(range: string, tableData: TableCell[][]): string[] {
  const parts = range.split(":");
  if (parts.length === 1) return [parts[0]];
  const from = parseCellRef(parts[0]);
  const to = parseCellRef(parts[1]);
  if (!from || !to) return [];
  const refs: string[] = [];
  for (let r = from.row; r <= to.row; r++) {
    for (let c = from.col; c <= to.col; c++) {
      // Build back the letter
      let col = "";
      let n = c + 1;
      while (n > 0) {
        const rem = (n - 1) % 26;
        col = String.fromCharCode(65 + rem) + col;
        n = Math.floor((n - 1) / 26);
      }
      refs.push(`${col}${r + 1}`);
    }
  }
  return refs;
}

/** Get numeric values from a range */
function getNumericValues(range: string, tableData: TableCell[][]): number[] {
  const refs = parseRange(range, tableData);
  return refs
    .map(r => {
      const v = getCellValue(r, tableData);
      return parseFloat(v.replace(/,/g, ""));
    })
    .filter(n => !isNaN(n));
}

/** Tokenize formula arguments (handles nested parentheses) */
function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of argsStr) {
    if (ch === "(" ) depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/**
 * Main formula evaluator.
 * Accepts a formula string like "=SUM(B2:B5)" and returns the computed value as string.
 */
export function evaluateFormula(formulaStr: string, tableData: TableCell[][]): string {
  if (!formulaStr || !formulaStr.startsWith("=")) return formulaStr;

  const expr = formulaStr.slice(1).trim();

  try {
    return evalExpr(expr, tableData);
  } catch (e) {
    return "#ERROR!";
  }
}

function evalExpr(expr: string, tableData: TableCell[][]): string {
  const upper = expr.trim().toUpperCase();

  // ── Numeric literal ──────────────────────────────────────
  const num = parseFloat(expr);
  if (!isNaN(num) && /^-?\d*\.?\d+$/.test(expr.trim())) {
    return expr.trim();
  }

  // ── String literal ───────────────────────────────────────
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return expr.slice(1, -1);
  }

  // ── Cell reference (e.g. B3) ─────────────────────────────
  if (/^[A-Z]+\d+$/i.test(expr.trim())) {
    return getCellValue(expr.trim(), tableData);
  }

  // ── Function call ─────────────────────────────────────────
  const fnMatch = expr.match(/^([A-Z_]+)\((.+)\)$/is);
  if (fnMatch) {
    const fnName = fnMatch[1].toUpperCase();
    const argsStr = fnMatch[2];
    const args = splitArgs(argsStr);

    switch (fnName) {
      case "SUM": {
        let total = 0;
        for (const a of args) {
          const vals = getNumericValues(a, tableData);
          if (vals.length > 0) {
            total += vals.reduce((s, v) => s + v, 0);
          } else {
            const v = parseFloat(evalExpr(a, tableData));
            if (!isNaN(v)) total += v;
          }
        }
        return formatNumber(total);
      }

      case "AVERAGE": {
        const allVals = args.flatMap(a => getNumericValues(a, tableData));
        if (allVals.length === 0) return "#DIV/0!";
        return formatNumber(allVals.reduce((s, v) => s + v, 0) / allVals.length);
      }

      case "COUNT": {
        const cnt = args.flatMap(a => getNumericValues(a, tableData)).length;
        return String(cnt);
      }

      case "COUNTA": {
        let cnt = 0;
        for (const a of args) {
          const refs = parseRange(a, tableData);
          cnt += refs.filter(r => getCellValue(r, tableData).trim() !== "").length;
        }
        return String(cnt);
      }

      case "MAX": {
        const allVals = args.flatMap(a => getNumericValues(a, tableData));
        if (allVals.length === 0) return "0";
        return formatNumber(Math.max(...allVals));
      }

      case "MIN": {
        const allVals = args.flatMap(a => getNumericValues(a, tableData));
        if (allVals.length === 0) return "0";
        return formatNumber(Math.min(...allVals));
      }

      case "PRODUCT": {
        const allVals = args.flatMap(a => getNumericValues(a, tableData));
        if (allVals.length === 0) return "0";
        return formatNumber(allVals.reduce((p, v) => p * v, 1));
      }

      case "ROUND": {
        if (args.length < 2) return "#VALUE!";
        const val = parseFloat(evalExpr(args[0], tableData));
        const digits = parseInt(evalExpr(args[1], tableData), 10);
        if (isNaN(val) || isNaN(digits)) return "#VALUE!";
        return formatNumber(parseFloat(val.toFixed(digits)));
      }

      case "ABS": {
        const v = parseFloat(evalExpr(args[0], tableData));
        return isNaN(v) ? "#VALUE!" : formatNumber(Math.abs(v));
      }

      case "SQRT": {
        const v = parseFloat(evalExpr(args[0], tableData));
        return isNaN(v) || v < 0 ? "#NUM!" : formatNumber(Math.sqrt(v));
      }

      case "POWER": {
        if (args.length < 2) return "#VALUE!";
        const base = parseFloat(evalExpr(args[0], tableData));
        const exp = parseFloat(evalExpr(args[1], tableData));
        return isNaN(base) || isNaN(exp) ? "#VALUE!" : formatNumber(Math.pow(base, exp));
      }

      case "IF": {
        if (args.length < 2) return "#VALUE!";
        const condVal = evalExpr(args[0], tableData).trim();
        const isTruthy = condVal !== "0" && condVal !== "" && condVal !== "FALSE";
        return evalExpr(args.length > 1 ? (isTruthy ? args[1] : (args[2] ?? "FALSE")) : args[1], tableData);
      }

      case "IFERROR": {
        try {
          const result = evalExpr(args[0], tableData);
          if (result.startsWith("#")) {
            return args.length > 1 ? evalExpr(args[1], tableData) : "";
          }
          return result;
        } catch {
          return args.length > 1 ? evalExpr(args[1], tableData) : "";
        }
      }

      case "CONCAT":
      case "CONCATENATE": {
        return args.map(a => {
          const refs = parseRange(a, tableData);
          if (refs.length > 1) return refs.map(r => getCellValue(r, tableData)).join("");
          return evalExpr(a, tableData);
        }).join("");
      }

      case "UPPER": {
        return evalExpr(args[0], tableData).toUpperCase();
      }

      case "LOWER": {
        return evalExpr(args[0], tableData).toLowerCase();
      }

      case "PROPER": {
        const s = evalExpr(args[0], tableData);
        return s.replace(/\b\w/g, c => c.toUpperCase());
      }

      case "LEN": {
        return String(evalExpr(args[0], tableData).length);
      }

      case "TRIM": {
        return evalExpr(args[0], tableData).trim();
      }

      case "LEFT": {
        const s = evalExpr(args[0], tableData);
        const n = args.length > 1 ? parseInt(evalExpr(args[1], tableData), 10) : 1;
        return s.slice(0, n);
      }

      case "RIGHT": {
        const s = evalExpr(args[0], tableData);
        const n = args.length > 1 ? parseInt(evalExpr(args[1], tableData), 10) : 1;
        return s.slice(-n);
      }

      case "MID": {
        if (args.length < 3) return "#VALUE!";
        const s = evalExpr(args[0], tableData);
        const start = parseInt(evalExpr(args[1], tableData), 10) - 1;
        const len = parseInt(evalExpr(args[2], tableData), 10);
        return s.slice(start, start + len);
      }

      case "TEXT": {
        if (args.length < 2) return evalExpr(args[0], tableData);
        const val = parseFloat(evalExpr(args[0], tableData));
        if (isNaN(val)) return evalExpr(args[0], tableData);
        const fmt = evalExpr(args[1], tableData);
        // Basic number formatting
        if (fmt.includes("%")) return (val * 100).toFixed(0) + "%";
        const decimals = (fmt.match(/\.0+/) || [""])[0].length - 1;
        return val.toFixed(Math.max(0, decimals));
      }

      case "VALUE": {
        const s = evalExpr(args[0], tableData).replace(/,/g, "");
        const v = parseFloat(s);
        return isNaN(v) ? "#VALUE!" : formatNumber(v);
      }

      case "COUNTIF": {
        if (args.length < 2) return "#VALUE!";
        const refs = parseRange(args[0], tableData);
        const criteria = evalExpr(args[1], tableData).replace(/^["']|["']$/g, "");
        let cnt = 0;
        for (const r of refs) {
          const v = getCellValue(r, tableData);
          if (matchesCriteria(v, criteria)) cnt++;
        }
        return String(cnt);
      }

      case "SUMIF": {
        if (args.length < 2) return "#VALUE!";
        const rangeRefs = parseRange(args[0], tableData);
        const criteria = evalExpr(args[1], tableData).replace(/^["']|["']$/g, "");
        const sumRefs = args.length > 2 ? parseRange(args[2], tableData) : rangeRefs;
        let total = 0;
        rangeRefs.forEach((r, i) => {
          if (matchesCriteria(getCellValue(r, tableData), criteria)) {
            const sumRef = sumRefs[i] ?? r;
            const v = parseFloat(getCellValue(sumRef, tableData));
            if (!isNaN(v)) total += v;
          }
        });
        return formatNumber(total);
      }

      case "TODAY": {
        const d = new Date();
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      }

      case "NOW": {
        const d = new Date();
        return d.toLocaleString("vi-VN");
      }

      case "YEAR": {
        const v = evalExpr(args[0], tableData);
        const d = new Date(v);
        return isNaN(d.getTime()) ? "#VALUE!" : String(d.getFullYear());
      }

      case "MONTH": {
        const v = evalExpr(args[0], tableData);
        const d = new Date(v);
        return isNaN(d.getTime()) ? "#VALUE!" : String(d.getMonth() + 1);
      }

      case "DAY": {
        const v = evalExpr(args[0], tableData);
        const d = new Date(v);
        return isNaN(d.getTime()) ? "#VALUE!" : String(d.getDate());
      }

      case "INT": {
        const v = parseFloat(evalExpr(args[0], tableData));
        return isNaN(v) ? "#VALUE!" : String(Math.floor(v));
      }

      case "MOD": {
        if (args.length < 2) return "#VALUE!";
        const a = parseFloat(evalExpr(args[0], tableData));
        const b = parseFloat(evalExpr(args[1], tableData));
        if (isNaN(a) || isNaN(b) || b === 0) return "#DIV/0!";
        return formatNumber(a % b);
      }

      case "VLOOKUP": {
        if (args.length < 3) return "#VALUE!";
        const lookupVal = evalExpr(args[0], tableData);
        const rangeRef = args[1];
        const colIdx = parseInt(evalExpr(args[2], tableData), 10) - 1;
        // Parse range start
        const rangeMatch = rangeRef.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
        if (!rangeMatch) return "#N/A";
        const startRow = parseInt(rangeMatch[2], 10) - 1;
        const endRow = parseInt(rangeMatch[4], 10) - 1;
        const startCol = colLetterToIndex(rangeMatch[1]);
        for (let r = startRow; r <= endRow; r++) {
          const row = tableData[r];
          if (!row) continue;
          const firstCellVal = row[startCol]?.value ?? "";
          if (firstCellVal === lookupVal) {
            const targetCell = row[startCol + colIdx];
            return targetCell?.value ?? "#N/A";
          }
        }
        return "#N/A";
      }

      default:
        return `#NAME?(${fnName})`;
    }
  }

  // ── Simple arithmetic expression ──────────────────────────
  return evalArithmetic(expr, tableData);
}

/** Basic arithmetic evaluator for +, -, *, / with cell refs */
function evalArithmetic(expr: string, tableData: TableCell[][]): string {
  // Replace cell refs with their numeric values
  const resolved = expr.replace(/[A-Z]+\d+/gi, ref => {
    const val = getCellValue(ref, tableData);
    const n = parseFloat(val);
    return isNaN(n) ? "0" : String(n);
  });

  try {
    // Safe eval-like: only allow numbers, operators, parens, whitespace
    if (/^[\d\s+\-*/().^%]+$/.test(resolved)) {
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${resolved})`)();
      return typeof result === "number" ? formatNumber(result) : String(result);
    }
  } catch { /* fall through */ }

  return expr;
}

/** Format number: removes unnecessary trailing zeros */
function formatNumber(n: number): string {
  if (!isFinite(n)) return "#NUM!";
  // Up to 6 decimal places, strip trailing zeros
  const formatted = parseFloat(n.toFixed(6)).toString();
  return formatted;
}

/** Check if a cell value matches a criteria string (supports >, <, >=, <=, <>, *) */
function matchesCriteria(cellVal: string, criteria: string): boolean {
  const operators = [
    { prefix: ">=", fn: (a: number, b: number) => a >= b },
    { prefix: "<=", fn: (a: number, b: number) => a <= b },
    { prefix: "<>", fn: (a: number, b: number) => a !== b },
    { prefix: ">", fn: (a: number, b: number) => a > b },
    { prefix: "<", fn: (a: number, b: number) => a < b },
  ];

  for (const op of operators) {
    if (criteria.startsWith(op.prefix)) {
      const threshold = parseFloat(criteria.slice(op.prefix.length));
      const cellNum = parseFloat(cellVal);
      if (!isNaN(threshold) && !isNaN(cellNum)) {
        return op.fn(cellNum, threshold);
      }
    }
  }

  // Wildcard match (*)
  if (criteria.includes("*")) {
    const pattern = criteria.replace(/\*/g, ".*");
    return new RegExp(`^${pattern}$`, "i").test(cellVal);
  }

  // Exact match
  return cellVal === criteria || cellVal.toLowerCase() === criteria.toLowerCase();
}
