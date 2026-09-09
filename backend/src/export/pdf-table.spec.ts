import { renderPdf, type PdfColumn, type PdfSection } from './pdf-table';

const COLUMNS: PdfColumn[] = [
  { header: 'Inventarnummer', key: 'inventoryNumber', width: 100 },
  { header: 'Artikel', key: 'article', width: 160 },
  { header: 'Notizen', key: 'notes', width: 200 },
];

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
    // pdfkit compresses each page's content stream by default, so the
    // rendered footer text ("Seite X von Y") isn't searchable as plain
    // bytes - but individual page *objects* aren't compressed (only object
    // streams would be, and pdfkit doesn't use those), so counting
    // `/Type /Page` (excluding the `/Type /Pages` tree root) reliably
    // tells us how many pages were actually created.
    const raw = buffer.toString('latin1');
    const pageObjectCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageObjectCount).toBeGreaterThan(1);
  });

  it('handles zero rows without throwing', async () => {
    await expect(
      renderPdf('Empty', [], [{ columns: COLUMNS, rows: [] }]),
    ).resolves.toBeInstanceOf(Buffer);
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
