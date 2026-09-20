import { ExportTransactionRow, ExportSummary } from '../statement.dto';

/**
 * Xuất danh sách giao dịch thành chuỗi CSV chuẩn RFC 4180
 * với UTF-8 BOM để Excel trên Windows hiển thị đúng tiếng Việt có dấu.
 */
export function buildCsvBuffer(
  rows: ExportTransactionRow[],
  summary: ExportSummary,
): Buffer {
  // BOM: \xEF\xBB\xBF — giúp Excel nhận diện UTF-8 trên Windows
  const BOM = '\uFEFF';

  const escapeCell = (val: string | null | undefined): string => {
    const s = val ?? '';
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const formatAmount = (amountStr: string, type: 'INCOME' | 'EXPENSE'): string => {
    const sign = type === 'INCOME' ? '+' : '-';
    return `${sign}${amountStr}`;
  };

  // Header comment lines
  const headerLines = [
    `# BẢNG SAO KÊ GIAO DỊCH TÀI CHÍNH - FINWISE`,
    `# Người dùng,${escapeCell(summary.userName ?? 'N/A')}`,
    `# Ví,${escapeCell(summary.walletName ?? 'Tất cả ví')}`,
    `# Kỳ sao kê,${summary.dateFrom.toISOString().slice(0, 10)} → ${summary.dateTo.toISOString().slice(0, 10)}`,
    `# Số dư đầu kỳ,${summary.openingBalance} ${summary.currency}`,
    `# Tổng thu,${summary.totalIncome} ${summary.currency}`,
    `# Tổng chi,${summary.totalExpense} ${summary.currency}`,
    `# Tiết kiệm ròng,${summary.netSavings} ${summary.currency}`,
    `# Số dư cuối kỳ,${summary.closingBalance} ${summary.currency}`,
    `# Tổng giao dịch,${summary.recordCount}`,
    '',
  ];

  // Column header
  const columns = [
    'STT',
    'Mã GD',
    'Ngày',
    'Ví',
    'Danh mục',
    'Loại',
    `Số tiền (${summary.currency})`,
    'Mô tả',
    'Địa điểm',
  ];

  const dataLines = rows.map((row, idx) => [
    String(idx + 1),
    escapeCell(row.id.slice(0, 8).toUpperCase()),
    row.date.toISOString().slice(0, 10),
    escapeCell(row.walletName),
    escapeCell(row.categoryName),
    row.categoryType === 'INCOME' ? 'Thu' : 'Chi',
    formatAmount(row.amount, row.categoryType),
    escapeCell(row.description),
    escapeCell(row.location),
  ].join(','));

  const allLines = [
    ...headerLines,
    columns.join(','),
    ...dataLines,
  ];

  return Buffer.from(BOM + allLines.join('\r\n'), 'utf-8');
}
