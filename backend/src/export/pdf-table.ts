import PDFDocument from 'pdfkit';

export interface PdfColumn {
  header: string;
  key: string;
  /** Relative weight, not an absolute point width - columns are scaled to exactly fill the page's content width, so they never overflow or overlap regardless of what's specified here. */
  width: number;
}

export interface PdfSection {
  title?: string;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
}

const HEADER_FONT_SIZE = 9;
const BODY_FONT_SIZE = 8.5;
const TITLE_FONT_SIZE = 12;
const ROW_PADDING = 4;
const CELL_GAP = 8;

/** Renders a title plus one or more simple tabular sections to a PDF buffer, with page numbers in the footer. */
export async function renderPdf(
  documentTitle: string,
  meta: { label: string; value: string }[],
  sections: PdfSection[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: 'landscape',
      // Needed so we can go back and stamp "Seite X von Y" on every page
      // once the total page count is known, at the very end.
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(documentTitle);
    doc.moveDown(0.5);

    if (meta.length) {
      doc.fontSize(9).font('Helvetica');
      for (const { label, value } of meta) {
        doc.text(`${label}: ${value}`);
      }
      doc.moveDown(0.5);
    }

    for (const section of sections) {
      drawSection(doc, section);
      doc.moveDown(0.8);
    }

    addPageFooters(doc);
    doc.end();
  });
}

function drawSection(doc: PDFKit.PDFDocument, section: PdfSection) {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const widths = scaleColumnWidths(doc, section.columns);

  // Keep a section's title glued to its header + at least one data row -
  // estimate the space both need and start a fresh page up front if they
  // wouldn't fit, rather than the fixed "480pt" guess this used to use
  // (which could still orphan a title at the bottom of a page).
  const titleHeight = section.title ? TITLE_FONT_SIZE + 6 : 0;
  const headerHeight = HEADER_FONT_SIZE + ROW_PADDING * 2;
  // heightOfString() measures using whatever font is currently active, so
  // it must be set explicitly here - otherwise this estimate would use
  // whatever font the previous section (or the title just above) left
  // active, silently under/over-estimating the space actually needed.
  doc.font('Helvetica').fontSize(BODY_FONT_SIZE);
  const firstRowHeight = section.rows.length
    ? rowHeight(doc, section.columns, widths, section.rows[0])
    : 0;
  if (doc.y + titleHeight + headerHeight + firstRowHeight > pageBottom) {
    doc.addPage();
  }

  if (section.title) {
    doc.fontSize(TITLE_FONT_SIZE).font('Helvetica-Bold').text(section.title);
    doc.moveDown(0.3);
  }

  drawTable(doc, section.columns, widths, section.rows);
}

/** Scales the caller-specified (relative) column widths to exactly fill the page's usable content width. */
function scaleColumnWidths(
  doc: PDFKit.PDFDocument,
  columns: PdfColumn[],
): number[] {
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalGap = CELL_GAP * (columns.length - 1);
  const availableForCells = contentWidth - totalGap;
  const specifiedTotal = columns.reduce((sum, c) => sum + c.width, 0) || 1;
  return columns.map((c) => (c.width / specifiedTotal) * availableForCells);
}

function cellText(value: unknown): string {
  return value == null || value === '' ? '–' : String(value);
}

function rowHeight(
  doc: PDFKit.PDFDocument,
  columns: PdfColumn[],
  widths: number[],
  row: Record<string, unknown>,
): number {
  const lineHeights = columns.map((c, i) =>
    doc.heightOfString(cellText(row[c.key]), { width: widths[i] }),
  );
  return Math.max(...lineHeights) + ROW_PADDING * 2;
}

function xFor(
  doc: PDFKit.PDFDocument,
  widths: number[],
  index: number,
): number {
  const startX = doc.page.margins.left;
  let x = startX;
  for (let i = 0; i < index; i++) x += widths[i] + CELL_GAP;
  return x;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  columns: PdfColumn[],
  widths: number[],
  rows: Record<string, unknown>[],
) {
  const startX = doc.page.margins.left;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const tableWidth = widths.reduce((sum, w) => sum + w, 0) + CELL_GAP * (widths.length - 1);
  let y = doc.y;

  const drawHeader = () => {
    doc.fontSize(HEADER_FONT_SIZE).font('Helvetica-Bold');
    const headerHeight =
      Math.max(
        ...columns.map((c, i) => doc.heightOfString(c.header, { width: widths[i] })),
      ) +
      ROW_PADDING * 2;
    columns.forEach((c, i) => {
      doc.text(c.header, xFor(doc, widths, i), y + ROW_PADDING, {
        width: widths[i],
      });
    });
    y += headerHeight;
    doc
      .moveTo(startX, y - 2)
      .lineTo(startX + tableWidth, y - 2)
      .strokeColor('#cccccc')
      .stroke();
  };

  drawHeader();
  doc.font('Helvetica').fontSize(BODY_FONT_SIZE);

  for (const row of rows) {
    const height = rowHeight(doc, columns, widths, row);
    if (y + height > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.font('Helvetica').fontSize(BODY_FONT_SIZE);
    }
    columns.forEach((c, i) => {
      // Wraps across multiple lines instead of truncating with an ellipsis,
      // so long values (a note, a long article name, ...) stay readable
      // rather than being silently cut off.
      doc.text(cellText(row[c.key]), xFor(doc, widths, i), y + ROW_PADDING, {
        width: widths[i],
      });
    });
    y += height;
  }

  doc.y = y;
}

function addPageFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - doc.page.margins.bottom + 12;
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#9ca3af')
      .text(`Seite ${i + 1} von ${range.count}`, doc.page.margins.left, bottom, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center',
        // Without an explicit height, pdfkit treats `bottom` (which is
        // deliberately past page.maxY(), down in the margin gutter) as
        // overflowing the page and silently starts a new page for the
        // footer text instead of drawing it here - bounding the text box
        // keeps the draw on the page we just switchToPage()'d to.
        height: 20,
      })
      .fillColor('#000000');
  }
}
