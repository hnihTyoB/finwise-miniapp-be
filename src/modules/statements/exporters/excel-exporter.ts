import ExcelJS from 'exceljs';
import { ExportTransactionRow, ExportSummary } from '../statement.dto';

const COLOR_NAVY = '1E293B';
const COLOR_WHITE = 'FFFFFF';
const COLOR_INCOME = '16A34A';
const COLOR_EXPENSE = 'DC2626';
const COLOR_STRIPE_DARK = 'F1F5F9';
const COLOR_HEADER_BG = '1E3A8A';
const COLOR_BALANCE_BG = 'EFF6FF';
const COLOR_POSITIVE = '0F766E';
const COLOR_NEGATIVE = 'B91C1C';

function amountFont(isIncome: boolean, bold = false): Partial<ExcelJS.Font> {
  return { color: { argb: isIncome ? `FF${COLOR_INCOME}` : `FF${COLOR_EXPENSE}` }, bold };
}

function headerFill(hexColor = COLOR_NAVY): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hexColor}` } };
}

function stripeFill(rowIndex: number): ExcelJS.Fill | undefined {
  if (rowIndex % 2 === 0) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLOR_STRIPE_DARK}` } };
  }
  return undefined;
}

function applyHeaderRow(row: ExcelJS.Row, bgHex = COLOR_NAVY) {
  row.eachCell((cell) => {
    cell.fill = headerFill(bgHex);
    cell.font = { color: { argb: `FF${COLOR_WHITE}` }, bold: true, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: `FF${COLOR_WHITE}` } },
    };
  });
  row.height = 28;
  row.commit();
}

function formatVnd(val: string | number): string {
  return Number(val).toLocaleString('vi-VN');
}

/**
 * Sinh workbook Excel 4 sheet chuyên nghiệp.
 * Sheet protection (khóa trang tính, không mã hóa file).
 */
export async function buildExcelBuffer(
  rows: ExportTransactionRow[],
  summary: ExportSummary,
  sheetPassword?: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinWise';
  wb.created = new Date();

  // ─── SHEET 1: Tổng quan dòng tiền ────────────────────────────────────────
  buildOverviewSheet(wb, summary, sheetPassword);

  // ─── SHEET 2: Bảng kê giao dịch chi tiết ────────────────────────────────
  buildTransactionSheet(wb, rows, summary, sheetPassword);

  // ─── SHEET 3: Phân bổ danh mục ───────────────────────────────────────────
  buildCategorySheet(wb, rows, summary, sheetPassword);

  // ─── SHEET 4: Số dư lũy kế từng ngày ────────────────────────────────────
  buildDailyBalanceSheet(wb, rows, summary, sheetPassword);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function buildOverviewSheet(
  wb: ExcelJS.Workbook,
  summary: ExportSummary,
  password?: string,
) {
  const ws = wb.addWorksheet('Tổng quan dòng tiền', {
    properties: { tabColor: { argb: `FF${COLOR_NAVY}` } },
  });
  ws.columns = [
    { width: 30 },
    { width: 24 },
    { width: 20 },
  ];

  // Title row
  ws.mergeCells('A1:C1');
  const title = ws.getCell('A1');
  title.value = '📊 BẢNG SAO KÊ GIAO DỊCH - FINWISE';
  title.font = { bold: true, size: 16, color: { argb: `FF${COLOR_NAVY}` } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  // Subtitle
  ws.mergeCells('A2:C2');
  const subtitle = ws.getCell('A2');
  subtitle.value = `Kỳ sao kê: ${summary.dateFrom.toISOString().slice(0, 10)} → ${summary.dateTo.toISOString().slice(0, 10)}`;
  subtitle.font = { size: 11, italic: true, color: { argb: 'FF64748B' } };
  subtitle.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 22;

  ws.addRow([]);

  // KPI section header
  const kpiHeader = ws.addRow(['CHỈ SỐ TÀI CHÍNH', 'GIÁ TRỊ', 'GHI CHÚ']);
  applyHeaderRow(kpiHeader, COLOR_HEADER_BG);

  const kpiRows: [string, string, string][] = [
    ['👤 Chủ tài khoản', summary.userName ?? '—', ''],
    ['💼 Ví tài khoản', summary.walletName ?? 'Tất cả ví', ''],
    ['📅 Từ ngày', summary.dateFrom.toISOString().slice(0, 10), ''],
    ['📅 Đến ngày', summary.dateTo.toISOString().slice(0, 10), ''],
    ['🏦 Số dư đầu kỳ', `${formatVnd(summary.openingBalance)} ${summary.currency}`, 'Số dư trước kỳ sao kê'],
    ['⬆️  Tổng thu nhập', `${formatVnd(summary.totalIncome)} ${summary.currency}`, ''],
    ['⬇️  Tổng chi tiêu', `${formatVnd(summary.totalExpense)} ${summary.currency}`, ''],
    ['💰 Tiết kiệm ròng', `${formatVnd(summary.netSavings)} ${summary.currency}`, 'Thu - Chi'],
    ['🏦 Số dư cuối kỳ', `${formatVnd(summary.closingBalance)} ${summary.currency}`, ''],
    ['📝 Tổng giao dịch', String(summary.recordCount), ''],
    ['🕐 Ngày trích xuất', new Date().toISOString().slice(0, 10), 'Bởi FinWise'],
  ];

  kpiRows.forEach((rowData, idx) => {
    const r = ws.addRow(rowData);
    const fill = stripeFill(idx);
    if (fill) {
      r.eachCell((cell) => { cell.fill = fill; });
    }
    // Colour value cells
    const label = rowData[0];
    if (label.includes('Tổng thu')) {
      r.getCell(2).font = { color: { argb: `FF${COLOR_INCOME}` }, bold: true };
    } else if (label.includes('Tổng chi')) {
      r.getCell(2).font = { color: { argb: `FF${COLOR_EXPENSE}` }, bold: true };
    } else if (label.includes('Tiết kiệm') || label.includes('cuối kỳ')) {
      const netVal = parseFloat(summary.netSavings);
      r.getCell(2).font = {
        color: { argb: netVal >= 0 ? `FF${COLOR_POSITIVE}` : `FF${COLOR_NEGATIVE}` },
        bold: true,
        size: 12,
      };
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLOR_BALANCE_BG}` } };
    }
    r.height = 22;
    r.commit();
  });

  if (password) {
    ws.protect(password, {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }
}

function buildTransactionSheet(
  wb: ExcelJS.Workbook,
  rows: ExportTransactionRow[],
  summary: ExportSummary,
  password?: string,
) {
  const ws = wb.addWorksheet('Bảng kê chi tiết', {
    properties: { tabColor: { argb: `FF${COLOR_HEADER_BG}` } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { key: 'stt', header: 'STT', width: 6 },
    { key: 'id', header: 'Mã GD', width: 12 },
    { key: 'date', header: 'Ngày', width: 13 },
    { key: 'wallet', header: 'Ví', width: 18 },
    { key: 'category', header: 'Danh mục', width: 20 },
    { key: 'type', header: 'Loại', width: 8 },
    { key: 'amount', header: `Số tiền (${summary.currency})`, width: 18 },
    { key: 'desc', header: 'Mô tả', width: 30 },
    { key: 'location', header: 'Địa điểm', width: 20 },
  ];

  applyHeaderRow(ws.getRow(1), COLOR_HEADER_BG);

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  rows.forEach((row, idx) => {
    const isIncome = row.categoryType === 'INCOME';
    const sign = isIncome ? 1 : -1;
    const amountNum = parseFloat(row.amount) * sign;

    const r = ws.addRow({
      stt: idx + 1,
      id: row.id.slice(0, 8).toUpperCase(),
      date: row.date.toISOString().slice(0, 10),
      wallet: row.walletName,
      category: row.categoryName,
      type: isIncome ? 'Thu' : 'Chi',
      amount: amountNum,
      desc: row.description ?? '',
      location: row.location ?? '',
    });

    const fill = stripeFill(idx);
    if (fill) r.eachCell((cell) => { cell.fill = fill; });

    const currencyNumFmt = summary.currency === 'VND' ? '#,##0' : '#,##0.00';
    const amtCell = r.getCell('amount');
    amtCell.numFmt = currencyNumFmt;
    amtCell.font = amountFont(isIncome);
    amtCell.alignment = { horizontal: 'right' };

    r.getCell('stt').alignment = { horizontal: 'center' };
    r.getCell('date').alignment = { horizontal: 'center' };
    r.getCell('type').alignment = { horizontal: 'center' };
    r.height = 20;
    r.commit();
  });

  // Summary row at bottom
  ws.addRow([]);
  const sumRow = ws.addRow({
    stt: '',
    id: '',
    date: '',
    wallet: '',
    category: 'TỔNG CỘNG',
    type: '',
    amount: rows.reduce((acc, r) => {
      const sign = r.categoryType === 'INCOME' ? 1 : -1;
      return acc + parseFloat(r.amount) * sign;
    }, 0),
    desc: `${rows.length} giao dịch`,
    location: '',
  });
  sumRow.font = { bold: true };
  sumRow.getCell('amount').numFmt = summary.currency === 'VND' ? '#,##0' : '#,##0.00';
  sumRow.getCell('amount').font = { bold: true };
  sumRow.commit();

  if (password) {
    ws.protect(password, {
      selectLockedCells: true,
      selectUnlockedCells: true,
    });
  }
}

function buildCategorySheet(
  wb: ExcelJS.Workbook,
  rows: ExportTransactionRow[],
  summary: ExportSummary,
  password?: string,
) {
  const ws = wb.addWorksheet('Phân bổ danh mục', {
    properties: { tabColor: { argb: 'FF7C3AED' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [
    { header: 'Danh mục', width: 24 },
    { header: 'Loại', width: 10 },
    { header: `Tổng tiền (${summary.currency})`, width: 20 },
    { header: 'Tỷ trọng (%)', width: 14 },
    { header: 'Số GD', width: 10 },
  ];
  applyHeaderRow(ws.getRow(1), '7C3AED');
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  // Group by category
  const categoryMap = new Map<string, { type: 'INCOME' | 'EXPENSE'; total: number; count: number }>();
  for (const r of rows) {
    const existing = categoryMap.get(r.categoryName);
    const amt = parseFloat(r.amount);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      categoryMap.set(r.categoryName, { type: r.categoryType, total: amt, count: 1 });
    }
  }

  const totalExpense = parseFloat(summary.totalExpense) || 1;
  const sorted = [...categoryMap.entries()].sort((a, b) => b[1].total - a[1].total);

  sorted.forEach(([name, data], idx) => {
    const isIncome = data.type === 'INCOME';
    const ratio = isIncome ? null : ((data.total / totalExpense) * 100);
    const r = ws.addRow([
      name,
      isIncome ? 'Thu' : 'Chi',
      data.total,
      ratio !== null ? ratio / 100 : null,
      data.count,
    ]);
    const fill = stripeFill(idx);
    if (fill) r.eachCell((cell) => { cell.fill = fill; });
    const currencyNumFmt = summary.currency === 'VND' ? '#,##0' : '#,##0.00';
    r.getCell(3).numFmt = currencyNumFmt;
    r.getCell(3).font = amountFont(isIncome);
    r.getCell(3).alignment = { horizontal: 'right' };
    if (ratio !== null) {
      r.getCell(4).numFmt = '0.0%';
      r.getCell(4).alignment = { horizontal: 'center' };
    }
    r.getCell(5).alignment = { horizontal: 'center' };
    r.height = 20;
    r.commit();
  });

  if (password) {
    ws.protect(password, { selectLockedCells: true, selectUnlockedCells: true });
  }
}

function buildDailyBalanceSheet(
  wb: ExcelJS.Workbook,
  rows: ExportTransactionRow[],
  summary: ExportSummary,
  password?: string,
) {
  const ws = wb.addWorksheet('Số dư theo ngày', {
    properties: { tabColor: { argb: 'FF059669' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [
    { header: 'Ngày', width: 14 },
    { header: `Số dư đầu ngày (${summary.currency})`, width: 22 },
    { header: `Thu trong ngày (${summary.currency})`, width: 22 },
    { header: `Chi trong ngày (${summary.currency})`, width: 22 },
    { header: `Thay đổi ròng (${summary.currency})`, width: 22 },
    { header: `Số dư cuối ngày (${summary.currency})`, width: 22 },
  ];
  applyHeaderRow(ws.getRow(1), '059669');

  // Build daily buckets
  const dailyMap = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const existing = dailyMap.get(key);
    const amt = parseFloat(r.amount);
    if (existing) {
      if (r.categoryType === 'INCOME') existing.income += amt;
      else existing.expense += amt;
    } else {
      dailyMap.set(key, {
        income: r.categoryType === 'INCOME' ? amt : 0,
        expense: r.categoryType === 'EXPENSE' ? amt : 0,
      });
    }
  }

  const sortedDays = [...dailyMap.keys()].sort();
  let runningBalance = parseFloat(summary.openingBalance);

  sortedDays.forEach((dateStr, idx) => {
    const day = dailyMap.get(dateStr)!;
    const openBalance = runningBalance;
    const netChange = day.income - day.expense;
    runningBalance += netChange;
    const closeBalance = runningBalance;

    const r = ws.addRow([
      dateStr,
      openBalance,
      day.income,
      day.expense,
      netChange,
      closeBalance,
    ]);
    const fill = stripeFill(idx);
    if (fill) r.eachCell((cell) => { cell.fill = fill; });
    const currencyNumFmt = summary.currency === 'VND' ? '#,##0' : '#,##0.00';
    [2, 3, 4, 5, 6].forEach((col) => {
      const cell = r.getCell(col);
      cell.numFmt = currencyNumFmt;
      cell.alignment = { horizontal: 'right' };
    });
    r.getCell(3).font = { color: { argb: `FF${COLOR_INCOME}` } };
    r.getCell(4).font = { color: { argb: `FF${COLOR_EXPENSE}` } };
    r.getCell(5).font = {
      color: { argb: netChange >= 0 ? `FF${COLOR_POSITIVE}` : `FF${COLOR_NEGATIVE}` },
      bold: true,
    };
    r.getCell(6).font = { bold: true };
    r.height = 20;
    r.commit();
  });

  if (password) {
    ws.protect(password, { selectLockedCells: true, selectUnlockedCells: true });
  }
}
