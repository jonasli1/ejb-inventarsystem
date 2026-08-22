import PDFDocument from 'pdfkit';

export interface PdfColumn {
  header: string;
  key: string;
  width: number;
}

export interface PdfSection {
  title?: string;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
}

/** Renders a title plus one or more simple tabular sections to a PDF buffer. */
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
      if (doc.y > 480) doc.addPage();
      if (section.title) {
        doc.fontSize(12).font('Helvetica-Bold').text(section.title);
        doc.moveDown(0.3);
      }
      drawTable(doc, section.columns, section.rows);
      doc.moveDown(0.8);
    }

    doc.end();
  });
}

function drawTable(
  doc: PDFKit.PDFDocument,
  columns: PdfColumn[],
  rows: Record<string, unknown>[],
) {
  const startX = doc.page.margins.left;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  let y = doc.y;

  const xFor = (i: number) =>
    startX + columns.slice(0, i).reduce((sum, c) => sum + c.width, 0);

  const drawHeader = () => {
    doc.fontSize(9).font('Helvetica-Bold');
    columns.forEach((c, i) => {
      doc.text(c.header, xFor(i), y, { width: c.width, ellipsis: true });
    });
    y += 16;
    doc
      .moveTo(startX, y - 2)
      .lineTo(startX + columns.reduce((sum, c) => sum + c.width, 0), y - 2)
      .strokeColor('#cccccc')
      .stroke();
  };

  drawHeader();
  doc.font('Helvetica').fontSize(8.5);

  for (const row of rows) {
    if (y > pageBottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.font('Helvetica').fontSize(8.5);
    }
    columns.forEach((c, i) => {
      const value = row[c.key];
      doc.text(
        value == null || value === '' ? '–' : String(value),
        xFor(i),
        y,
        {
          width: c.width,
          ellipsis: true,
        },
      );
    });
    y += 14;
  }

  doc.y = y;
}
