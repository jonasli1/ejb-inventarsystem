import { inflateSync } from 'node:zlib';
import { renderPdf, type PdfColumn, type PdfSection } from './pdf-table';

const COLUMNS: PdfColumn[] = [
  { header: 'Inventarnummer', key: 'inventoryNumber', width: 100 },
  { header: 'Artikel', key: 'article', width: 160 },
  { header: 'Notizen', key: 'notes', width: 200 },
];

function countPageObjects(buffer: Buffer): number {
  // pdfkit compresses each page's content stream by default, so the
  // rendered footer text ("Seite X von Y") isn't searchable as plain bytes -
  // but individual page *objects* aren't compressed (only object streams
  // would be, and pdfkit doesn't use those), so counting `/Type /Page`
  // (excluding the `/Type /Pages` tree root) reliably tells us how many
  // pages were actually created.
  const raw = buffer.toString('latin1');
  return (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/**
 * Returns the horizontal position (the `x` in `1 0 0 1 x y Tm`) of every
 * text draw in a single-page PDF's content stream, in document order -
 * lets a test assert *where* a cell was actually drawn (e.g. that an
 * indented row's text sits further right than an unindented one), which
 * `countPageObjects`'s page-count check can't tell you.
 */
function extractTextXPositions(buffer: Buffer): number[] {
  const raw = buffer.toString('latin1');
  const streamMatch = raw.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  if (!streamMatch) return [];
  const content = inflateSync(Buffer.from(streamMatch[1], 'latin1')).toString('latin1');
  return [...content.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm/g)].map((m) => parseFloat(m[1]));
}

describe('renderPdf', () => {
  it('produces a valid PDF buffer', async () => {
    const sections: PdfSection[] = [
      {
        title: 'Objekte',
        columns: COLUMNS,
        rows: [
          { inventoryNumber: 'INV-001', article: 'Mischpult', notes: 'OK' },
        ],
      },
    ];
    const buffer = await renderPdf('Test-Export', [], sections);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('does not spill the page-number footer onto an extra trailing page', async () => {
    // A single short row fits comfortably on one page - the only reason a
    // second page could appear is the footer's own text draw overflowing
    // page.maxY() and triggering pdfkit's automatic page break.
    const sections: PdfSection[] = [
      {
        columns: COLUMNS,
        rows: [{ inventoryNumber: 'INV-001', article: 'Mischpult', notes: 'OK' }],
      },
    ];
    const buffer = await renderPdf('Footer Test', [], sections);
    expect(countPageObjects(buffer)).toBe(1);
  });

  it('does not throw with a very long cell value that must wrap across multiple lines', async () => {
    const longNote = 'Sehr lange Notiz. '.repeat(50);
    const sections: PdfSection[] = [
      {
        columns: COLUMNS,
        rows: [{ inventoryNumber: 'INV-001', article: 'X', notes: longNote }],
      },
    ];
    await expect(
      renderPdf('Wrapping Test', [], sections),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('paginates across many rows', async () => {
    const manyRows = Array.from({ length: 200 }, (_, i) => ({
      inventoryNumber: `INV-${i}`,
      article: `Artikel ${i}`,
      notes: 'Eine Notiz mit etwas mehr Text, damit die Zeile höher wird.',
    }));
    const buffer = await renderPdf('Pagination Test', [], [
      { columns: COLUMNS, rows: manyRows },
    ]);
    expect(countPageObjects(buffer)).toBeGreaterThan(1);
  });

  it('handles zero rows without throwing', async () => {
    await expect(
      renderPdf('Empty', [], [{ columns: COLUMNS, rows: [] }]),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('indents a row\'s cell in the given column when it carries __indent - used to nest an accessory under its main object', async () => {
    const twoColumns: PdfColumn[] = [
      { header: 'Nr', key: 'inventoryNumber', width: 100 },
      { header: 'Artikel', key: 'article', width: 160 },
    ];
    const sections: PdfSection[] = [
      {
        columns: twoColumns,
        rows: [
          { inventoryNumber: 'A1', article: 'Hauptobjekt' },
          { inventoryNumber: 'A2', article: 'Zubehörteil', __indent: true },
        ],
        indentColumnKey: 'article',
      },
    ];
    const buffer = await renderPdf('Indent Test', [], sections);
    const xPositions = extractTextXPositions(buffer);
    // Draw order on this one-page document: title, header x2, row1 x2, row2
    // x2, footer - so each row's "article" cell (the 2nd of its pair) sits
    // at -4 (row 1, unindented) and -2 (row 2, indented) from the end.
    const row1ArticleX = xPositions[xPositions.length - 4];
    const row2ArticleX = xPositions[xPositions.length - 2];
    expect(row2ArticleX - row1ArticleX).toBeCloseTo(14);
  });

  it('scales columns to fill the page regardless of the specified relative widths (no fixed-width overflow)', async () => {
    const wideColumns: PdfColumn[] = [
      { header: 'A', key: 'a', width: 1000 },
      { header: 'B', key: 'b', width: 1000 },
      { header: 'C', key: 'c', width: 1000 },
    ];
    await expect(
      renderPdf('Wide Columns', [], [
        { columns: wideColumns, rows: [{ a: '1', b: '2', c: '3' }] },
      ]),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
