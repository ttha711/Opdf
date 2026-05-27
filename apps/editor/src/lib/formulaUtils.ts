import { TableCell } from "../types";

// Helper to parse cell ranges and return their numeric contents recursively
export const getRangeValues = (
  startCell: string,
  endCell: string,
  tableData: TableCell[][],
  currentFormula: string
): number[] => {
  const parseCellRef = (ref: string) => {
    const colMatch = ref.match(/^[A-Z]+/);
    const rowMatch = ref.match(/[0-9]+$/);
    if (!colMatch || !rowMatch) return { col: 0, row: 0 };
    const colRef = colMatch[0];
    const rowRef = parseInt(rowMatch[0]) - 1; // 1-based to 0-based index
    
    let colIdx = 0;
    for (let i = 0; i < colRef.length; i++) {
      colIdx = colIdx * 26 + (colRef.charCodeAt(i) - 64);
    }
    return { col: colIdx - 1, row: rowRef };
  };

  const start = parseCellRef(startCell);
  const end = parseCellRef(endCell);

  const values: number[] = [];
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = tableData[r]?.[c];
      if (cell) {
        let valStr = cell.value;
        if (cell.formula && cell.formula !== currentFormula) {
          valStr = evaluateFormula(cell.formula, tableData);
        }
        const num = parseFloat(String(valStr).replace(/[^0-9.-]/g, ""));
        if (!isNaN(num)) values.push(num);
      }
    }
  }
  return values;
};

export const evaluateFormula = (formulaStr: string, tableData: TableCell[][]): string => {
  try {
    const cleanFormula = formulaStr.trim().toUpperCase();
    
    // SUMPRODUCT check first
    const matchSumProduct = cleanFormula.match(/^=SUMPRODUCT\(([A-Z]+[0-9]+):([A-Z]+[0-9]+),\s*([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/);
    if (matchSumProduct) {
      const [_, r1Start, r1End, r2Start, r2End] = matchSumProduct;
      const r1 = getRangeValues(r1Start, r1End, tableData, formulaStr);
      const r2 = getRangeValues(r2Start, r2End, tableData, formulaStr);
      if (r1.length !== r2.length || r1.length === 0) return "#VALUE!";
      let sum = 0;
      for (let i = 0; i < r1.length; i++) {
        sum += r1[i] * r2[i];
      }
      return sum.toLocaleString("vi-VN");
    }

    // Single range checks
    const match = cleanFormula.match(/^=(SUM|AVERAGE|PRODUCT|COUNT|MIN|MAX)\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/);
    if (!match) return "#VALUE!";
    const [_, func, startCell, endCell] = match;

    const values = getRangeValues(startCell, endCell, tableData, formulaStr);
    if (values.length === 0) return "0";

    switch (func) {
      case "SUM":
        return values.reduce((a, b) => a + b, 0).toLocaleString("vi-VN");
      case "AVERAGE":
        return (values.reduce((a, b) => a + b, 0) / values.length).toLocaleString("vi-VN");
      case "PRODUCT":
        return values.reduce((a, b) => a * b, 1).toLocaleString("vi-VN");
      case "COUNT":
        return values.length.toString();
      case "MIN":
        return Math.min(...values).toLocaleString("vi-VN");
      case "MAX":
        return Math.max(...values).toLocaleString("vi-VN");
      default:
        return "#NAME?";
    }
  } catch (err) {
    return "#ERROR!";
  }
};
