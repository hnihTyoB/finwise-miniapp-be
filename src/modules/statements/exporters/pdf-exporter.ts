import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { ExportTransactionRow, ExportSummary } from '../statement.dto';

const NAVY = '#1E3A8A';
const HEADER_BG = '#1E3A8A';
const ROW_ALT = '#F8FAFC';
const ROW_LIGHT = '#FFFFFF';
const GREEN = '#16A34A';
const RED = '#DC2626';
const GREY = '#64748B';
const LIGHT_GREY = '#E2E8F0';
const ACCENT = '#3B82F6';

function resolveFontPaths(): { regular?: string; bold?: string } {
  const candidates: Array<{ regular: string; bold: string }> = [
    // Windows standard fonts
    { regular: 'C:\\Windows\\Fonts\\arial.ttf', bold: 'C:\\Windows\\Fonts\\arialbd.ttf' },
    { regular: 'C:\\Windows\\Fonts\\tahoma.ttf', bold: 'C:\\Windows\\Fonts\\tahomabd.ttf' },
    { regular: 'C:\\Windows\\Fonts\\segoeui.ttf', bold: 'C:\\Windows\\Fonts\\segoeuib.ttf' },
    // Linux standard fonts
    { regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' },
    { regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' },
    { regular: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', bold: '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf' },
    // macOS fonts
    { regular: '/System/Library/Fonts/Supplemental/Arial.ttf', bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf' },
    { regular: '/Library/Fonts/Arial.ttf', bold: '/Library/Fonts/Arial Bold.ttf' },
  ];

  for (const c of candidates) {
    if (fs.existsSync(c.regular) && fs.existsSync(c.bold)) {
      return c;
    }
  }
  return {};
}

function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'));
}

function formatVndPdf(val: string | number, hasUnicode = true): string {
  const num = Number(val);
  if (hasUnicode) {
    return num.toLocaleString('vi-VN') + ' ₫';
  }
  return num.toLocaleString('en-US') + ' VND';
}

function logoPath(): string | null {
  // Try several relative paths from the backend root
  const candidates = [
    path.resolve(__dirname, '../../../../storage/logo.png'),
    path.resolve(__dirname, '../../../storage/logo.png'),
    // Frontend's public logo as fallback
    path.resolve(__dirname, '../../../../../finwise-miniapp-fe/public/logo.png'),
    path.resolve(__dirname, '../../../../../finwise-miniapp-fe/src/static/logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Sinh tài liệu PDF chuẩn ngân hàng:
 * - Hỗ trợ font Unicode tiếng Việt (Arial, DejaVu, Liberation) kèm fallback sạch diacritics
 * - Watermark bảo mật xoay 45°
 * - Bảng kê giao dịch 2 màu (zebra striping)
 * - Mã QR xác thực tính hợp lệ
 * - Logo FinWise (nếu tồn tại)
 * - Bảo vệ mật khẩu PDF (nếu có password)
 */
export async function buildPdfBuffer(
  rows: ExportTransactionRow[],
  summary: ExportSummary,
  verificationCode: string,
  verifyUrl: string,
  password?: string,
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const pdfOptions: PDFKit.PDFDocumentOptions = {
      size: 'A4',
      margins: { top: 60, left: 40, right: 40, bottom: 60 },
      info: {
        Title: `Sao kê FinWise - ${summary.dateFrom.toISOString().slice(0, 10)} - ${summary.dateTo.toISOString().slice(0, 10)}`,
        Author: 'FinWise',
        Subject: 'Bảng sao kê giao dịch tài chính cá nhân',
        CreationDate: new Date(),
      },
    };

    if (password) {
      (pdfOptions as any).userPassword = password;
      (pdfOptions as any).ownerPassword = password + '_owner';
      (pdfOptions as any).permissions = {
        printing: 'highResolution',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      };
    }

    const doc = new PDFDocument(pdfOptions);
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fonts = resolveFontPaths();
    const hasUnicodeFont = Boolean(fonts.regular && fonts.bold);

    if (hasUnicodeFont) {
      doc.registerFont('AppFont', fonts.regular!);
      doc.registerFont('AppFont-Bold', fonts.bold!);
    }

    const FONT_REGULAR = hasUnicodeFont ? 'AppFont' : 'Helvetica';
    const FONT_BOLD = hasUnicodeFont ? 'AppFont-Bold' : 'Helvetica-Bold';

    // Safe text helper: if running in an environment without Unicode TTF fonts,
    // strip diacritics cleanly instead of printing corrupted '?' replacement characters
    const txt = (s: string | null | undefined): string => {
      const val = s ?? '';
      return hasUnicodeFont ? val : stripDiacritics(val);
    };

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const marginLeft = 40;
    const contentWidth = pageWidth - marginLeft * 2;

    // ─── Watermark helper (called on each page) ────────────────────────────
    const drawWatermark = () => {
      const savedX = doc.x;
      const savedY = doc.y;
      doc.save();
      doc.rotate(45, { origin: [pageWidth / 2, pageHeight / 2] });
      doc.fontSize(20).fillColor('#94A3B8', 0.07).font(FONT_BOLD);
      const watermarkText = txt(`BẢO MẬT - FINWISE STATEMENT - ${verificationCode}`);
      const yPositions = [-100, 50, 200, 350, 500];
      for (const y of yPositions) {
        doc.text(watermarkText, -pageWidth, y, {
          width: pageWidth * 3,
          align: 'center',
          lineBreak: false,
        });
      }
      doc.restore();
      doc.x = savedX;
      doc.y = savedY;
    };

    doc.on('pageAdded', drawWatermark);
    drawWatermark();

    // ─── Generate QR Code Buffer for Info Box ────────────────────────────
    const qrSize = 52;
    let qrBuffer: Buffer | null = null;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: qrSize * 2,
        margin: 0,
        color: { dark: '#1E3A8A', light: '#FFFFFF' },
      });
      qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    } catch {
      // QR generation failed, skip gracefully
    }

    // ─── Header: Logo + Title ─────────────────────────────────────────────
    const logo = logoPath();
    const headerY = 42;
    const logoSize = 30; // 30x30 pt matches the 2 text rows (16pt + 9.5pt) seamlessly

    if (logo) {
      try {
        doc.image(logo, marginLeft, headerY, { width: logoSize, height: logoSize });
      } catch {
        // ignore if image fails to load
      }
    }

    const titleX = logo ? marginLeft + logoSize + 10 : marginLeft;
    const titleWidth = logo ? contentWidth - (logoSize + 10) : contentWidth;

    doc
      .fontSize(16)
      .fillColor(NAVY)
      .font(FONT_BOLD)
      .text(txt('BẢNG SAO KÊ GIAO DỊCH TÀI CHÍNH'), titleX, headerY + 1, {
        align: logo ? 'left' : 'center',
        width: titleWidth,
      });

    doc
      .fontSize(9)
      .fillColor(GREY)
      .font(FONT_REGULAR)
      .text('PERSONAL ACCOUNT STATEMENT | FINWISE', titleX, headerY + 19, {
        align: logo ? 'left' : 'center',
        width: titleWidth,
      });

    // ─── Info Box with Compact QR on the Right ────────────────────────────
    const infoBoxY = headerY + logoSize + 12;
    const infoBoxHeight = 70;
    doc
      .roundedRect(marginLeft, infoBoxY, contentWidth, infoBoxHeight, 6)
      .fillAndStroke('#EFF6FF', '#BFDBFE');

    // Column 1: Account Info
    const col1X = marginLeft + 12;
    const infoItemsLeft: [string, string][] = [
      [txt('Chủ tài khoản:'), txt(summary.userName ?? 'N/A')],
      [txt('Ví tài khoản:'), txt(summary.walletName ?? 'Tất cả ví')],
      [txt('Kỳ sao kê:'), `${summary.dateFrom.toISOString().slice(0, 10)} → ${summary.dateTo.toISOString().slice(0, 10)}`],
    ];

    infoItemsLeft.forEach(([label, value], i) => {
      const y = infoBoxY + 10 + i * 18;
      doc.fontSize(8.5).font(FONT_BOLD).fillColor(NAVY).text(label, col1X, y)
        .font(FONT_REGULAR).fillColor('#1E293B').text(value, col1X + 75, y);
    });

    // Column 2: Statement Info
    const col2X = marginLeft + 215;
    const infoItemsRight: [string, string, boolean][] = [
      [txt('Mã sao kê:'), verificationCode.slice(0, 20), false],
      [txt('Ngày phát hành:'), new Date().toISOString().slice(0, 10), false],
      [txt('Số dư cuối kỳ:'), formatVndPdf(summary.closingBalance, hasUnicodeFont), true],
    ];

    infoItemsRight.forEach(([label, value, isBalance], i) => {
      const y = infoBoxY + 10 + i * 18;
      doc.fontSize(8.5).font(FONT_BOLD).fillColor(NAVY).text(label, col2X, y)
        .font(isBalance ? FONT_BOLD : FONT_REGULAR)
        .fillColor(isBalance ? '#0F766E' : '#1E293B')
        .text(value, col2X + 80, y);
    });

    // Column 3: Compact QR Code Badge
    if (qrBuffer) {
      const qrX = marginLeft + contentWidth - qrSize - 12;
      const qrY = infoBoxY + (infoBoxHeight - qrSize) / 2;
      doc
        .roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 4)
        .fillAndStroke('#FFFFFF', '#CBD5E1');
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.link(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, verifyUrl);
    }

    // ─── Summary KPI bar ──────────────────────────────────────────────────
    const kpiY = infoBoxY + infoBoxHeight + 8;
    const kpiWidth = (contentWidth - 10) / 3;
    const kpis = [
      { label: txt('Tổng thu nhập'), value: `+${formatVndPdf(summary.totalIncome, hasUnicodeFont)}`, color: GREEN },
      { label: txt('Tổng chi tiêu'), value: `-${formatVndPdf(summary.totalExpense, hasUnicodeFont)}`, color: RED },
      {
        label: txt('Tiết kiệm ròng'),
        value: `${parseFloat(summary.netSavings) >= 0 ? '+' : ''}${formatVndPdf(summary.netSavings, hasUnicodeFont)}`,
        color: parseFloat(summary.netSavings) >= 0 ? '#0F766E' : RED,
      },
    ];

    kpis.forEach((kpi, i) => {
      const x = marginLeft + i * (kpiWidth + 5);
      doc.roundedRect(x, kpiY, kpiWidth, 32, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fontSize(7.5).fillColor(GREY).font(FONT_REGULAR).text(kpi.label, x + 8, kpiY + 4);
      doc.fontSize(9.5).fillColor(kpi.color).font(FONT_BOLD).text(kpi.value, x + 8, kpiY + 16);
    });

    // ─── Transaction table ─────────────────────────────────────────────────
    doc.y = kpiY + 32 + 10;
    const tableHeaders = [
      '#',
      txt('Ngày'),
      txt('Ví / Danh mục'),
      txt('Loại'),
      txt(hasUnicodeFont ? 'Số tiền (₫)' : 'Số tiền (VND)'),
      txt('Mô tả'),
    ];
    const colWidths = [24, 68, 145, 38, 85, contentWidth - 24 - 68 - 145 - 38 - 85];

    const drawTableHeader = () => {
      const headerY = doc.y;
      doc.rect(marginLeft, headerY, contentWidth, 18).fill(HEADER_BG);
      let x = marginLeft;
      tableHeaders.forEach((h, i) => {
        doc.fontSize(7.5).fillColor('#FFFFFF').font(FONT_BOLD)
          .text(h, x + 3, headerY + 5, {
            width: colWidths[i] - 6,
            align: i === 4 ? 'right' : (i === 3 || i === 0 ? 'center' : 'left'),
          });
        x += colWidths[i];
      });
      doc.y = headerY + 18;
    };

    drawTableHeader();

    const ROW_HEIGHT = 16;
    for (let i = 0; i < rows.length; i++) {
      // Natural pagination when rows exceed page space (leave 55pt for summary & footer)
      if (doc.y + ROW_HEIGHT > pageHeight - 55) {
        doc.addPage();
        drawTableHeader();
      }

      const row = rows[i];
      const isIncome = row.categoryType === 'INCOME';
      const rowBg = i % 2 === 0 ? ROW_LIGHT : ROW_ALT;
      const rowY = doc.y;

      doc.rect(marginLeft, rowY, contentWidth, ROW_HEIGHT).fill(rowBg);

      let x = marginLeft;
      const cells = [
        { text: String(i + 1), align: 'center' as const },
        { text: row.date.toISOString().slice(0, 10), align: 'left' as const },
        { text: txt(`${row.walletName} / ${row.categoryName}`), align: 'left' as const },
        { text: txt(isIncome ? 'Thu' : 'Chi'), align: 'center' as const },
        { text: `${isIncome ? '+' : '-'}${formatVndPdf(row.amount, hasUnicodeFont)}`, align: 'right' as const },
        { text: txt((row.description ?? '').slice(0, 42)), align: 'left' as const },
      ];

      cells.forEach((cell, ci) => {
        if (ci === 4) {
          doc.fillColor(isIncome ? GREEN : RED).font(FONT_BOLD);
        } else {
          doc.fillColor('#1E293B').font(FONT_REGULAR);
        }
        doc.fontSize(7.5).text(cell.text, x + 3, rowY + 4, {
          width: colWidths[ci] - 6,
          align: cell.align,
          lineBreak: false,
        });
        x += colWidths[ci];
      });

      doc.y = rowY + ROW_HEIGHT;
    }

    // Summary Row
    if (doc.y + 20 > pageHeight - 45) {
      doc.addPage();
    }
    const sumY = doc.y;
    doc.rect(marginLeft, sumY, contentWidth, 18).fill('#F1F5F9');
    doc.fontSize(8).fillColor(NAVY).font(FONT_BOLD)
      .text(`TỔNG CỘNG (${rows.length} giao dịch)`, marginLeft + 10, sumY + 5)
      .text(
        `${parseFloat(summary.netSavings) >= 0 ? '+' : ''}${formatVndPdf(summary.netSavings, hasUnicodeFont)}`,
        marginLeft,
        sumY + 5,
        { width: contentWidth - 10, align: 'right' },
      );
    doc.y = sumY + 18;

    // Clean Bank-Grade Footer
    const footerY = doc.y + 12;
    doc.moveTo(marginLeft, footerY).lineTo(marginLeft + contentWidth, footerY).strokeColor('#E2E8F0').lineWidth(0.75).stroke();

    const footerTextY = footerY + 6;
    doc
      .fontSize(7)
      .fillColor(GREY)
      .font(FONT_REGULAR)
      .text(
        txt('* Bản sao kê điện tử được trích xuất tự động từ hệ thống FinWise và có giá trị đối chiếu giao dịch cá nhân.'),
        marginLeft,
        footerTextY,
      )
      .text(
        txt(`Xác thực trực tuyến: ${verifyUrl}`),
        marginLeft,
        footerTextY + 9,
        { link: verifyUrl, underline: true },
      );

    doc.end();
  });
}
