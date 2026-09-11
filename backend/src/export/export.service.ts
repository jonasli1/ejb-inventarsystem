import { Injectable } from '@nestjs/common';
import { AppNotFoundException } from '../common/exceptions/app.exception';
import ExcelJS from 'exceljs';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ArticlesService } from '../articles/articles.service';
import { renderPdf, type PdfColumn } from './pdf-table';
import {
  describeMovement,
  fmtDate,
  fmtDateTime,
  fmtPrice,
  INVENTORY_STATUS_LABEL,
  LOAN_STATUS_LABEL,
  MOVEMENT_TYPE_LABEL,
} from '../common/constants/labels';
import type {
  ExportFormat,
  ExportInventoryQueryDto,
  ExportArticlesQueryDto,
} from './dto/export-query.dto';

export interface ExportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_CONTENT_TYPE = 'application/pdf';

const INVENTORY_ITEM_EXPORT_INCLUDE = {
  article: true,
  location: true,
  room: true,
  ownerOrganization: true,
  ownerUnit: true,
} satisfies Prisma.InventoryItemInclude;

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function sheetName(name: string): string {
  // Excel worksheet names: max 31 chars, no []:*?/\\
  return name.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet';
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly articlesService: ArticlesService,
  ) {}

  // -----------------------------------------------------------------------
  // Loan export
  // -----------------------------------------------------------------------

  async exportLoan(id: string, format: ExportFormat): Promise<ExportFile> {
    const loan = await this.prisma.loan.findFirst({
      where: { id, deletedAt: null },
      include: {
        lentBy: { select: { displayName: true, email: true } },
        items: { include: { inventoryItem: { include: { article: true } } } },
      },
    });
    if (!loan) throw new AppNotFoundException('Ausleihe nicht gefunden.');

    const borrower = loan.borrowerName ?? loan.borrowerPersonId ?? '–';
    const meta = [
      { label: 'Ausleiher', value: borrower },
      { label: 'Status', value: LOAN_STATUS_LABEL[loan.status] ?? loan.status },
      { label: 'Geplantes Ausgabedatum', value: fmtDate(loan.checkoutDate) },
      { label: 'Fällig am', value: fmtDate(loan.dueDate) },
      { label: 'Tatsächlich ausgegeben am', value: fmtDate(loan.issuedAt) },
      { label: 'Zurückgegeben am', value: fmtDate(loan.returnedAt) },
      { label: 'Erfasst von', value: loan.lentBy.displayName },
      { label: 'Notizen', value: loan.notes ?? '' },
    ];

    const columns: PdfColumn[] = [
      { header: 'Inventarnummer', key: 'inventoryNumber', width: 110 },
      { header: 'Artikel', key: 'article', width: 160 },
      { header: 'Zustand bei Ausgabe', key: 'checkedOutCondition', width: 100 },
      { header: 'Zurückgegeben am', key: 'returnedAt', width: 110 },
      { header: 'Rückgabezustand', key: 'returnedCondition', width: 100 },
    ];
    const rows = loan.items.map((item) => ({
      inventoryNumber: item.inventoryItem.inventoryNumber,
      article: item.inventoryItem.article.name,
      checkedOutCondition:
        item.checkedOutCondition != null ? `${item.checkedOutCondition}%` : '',
      returnedAt: fmtDate(item.returnedAt),
      returnedCondition:
        item.returnedCondition != null ? `${item.returnedCondition}%` : '',
    }));

    const filename = `Ausleihe-${slug(borrower)}-${loan.id.slice(0, 8)}`;

    if (format === 'pdf') {
      const buffer = await renderPdf(`Ausleihe: ${borrower}`, meta, [
        { title: 'Objekte', columns, rows },
      ]);
      return {
        buffer,
        filename: `${filename}.pdf`,
        contentType: PDF_CONTENT_TYPE,
      };
    }

    const workbook = new ExcelJS.Workbook();
    const infoSheet = workbook.addWorksheet('Ausleihe');
    infoSheet.columns = [
      { header: 'Feld', key: 'label', width: 24 },
      { header: 'Wert', key: 'value', width: 40 },
    ];
    infoSheet.getRow(1).font = { bold: true };
    meta.forEach((m) => infoSheet.addRow(m));

    const itemsSheet = workbook.addWorksheet('Objekte');
    itemsSheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.round(c.width / 6),
    }));
    itemsSheet.getRow(1).font = { bold: true };
    rows.forEach((r) => itemsSheet.addRow(r));

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `${filename}.xlsx`,
      contentType: XLSX_CONTENT_TYPE,
    };
  }

  // -----------------------------------------------------------------------
  // Inventory export - a single flat, naturally-sorted list matching
  // exactly the given filters/search (same buildWhere as the list itself)
  // -----------------------------------------------------------------------

  async exportInventory(
    query: ExportInventoryQueryDto,
    format: ExportFormat,
  ): Promise<ExportFile> {
    const where = await this.inventoryService.buildWhere(query);
    const items = await this.prisma.inventoryItem.findMany({
      where,
      include: INVENTORY_ITEM_EXPORT_INCLUDE,
      orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
    });

    const columns: PdfColumn[] = [
      { header: 'Inventarnummer', key: 'inventoryNumber', width: 90 },
      { header: 'Artikel', key: 'article', width: 130 },
      { header: 'Status', key: 'status', width: 90 },
      { header: 'Standort', key: 'location', width: 100 },
      { header: 'Raum', key: 'room', width: 80 },
      { header: 'Eigentümer-Org.', key: 'org', width: 110 },
      { header: 'Eigentümer-Einheit', key: 'unit', width: 110 },
      { header: 'Anschaffungspreis', key: 'purchasePrice', width: 90 },
      { header: 'Anschaffungsdatum', key: 'purchaseDate', width: 90 },
      { header: 'Seriennummer', key: 'serialNumber', width: 100 },
    ];

    const toRow = (item: (typeof items)[number]) => ({
      inventoryNumber: item.inventoryNumber,
      article: item.article.name,
      status: INVENTORY_STATUS_LABEL[item.status] ?? item.status,
      location: item.location.name,
      room: item.room.name,
      org: item.ownerOrganization.name,
      unit: item.ownerUnit.name,
      purchasePrice: fmtPrice(item.purchasePrice),
      purchaseDate: fmtDate(item.purchaseDate),
      serialNumber: item.serialNumber ?? '',
    });

    if (format === 'pdf') {
      const buffer = await renderPdf(
        'Inventar',
        [{ label: 'Anzahl Objekte', value: String(items.length) }],
        [{ columns, rows: items.map(toRow) }],
      );
      return {
        buffer,
        filename: 'Inventar.pdf',
        contentType: PDF_CONTENT_TYPE,
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName('Inventar'));
    sheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.round(c.width / 6),
    }));
    sheet.getRow(1).font = { bold: true };
    items.forEach((item) => sheet.addRow(toRow(item)));

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: 'Inventar.xlsx',
      contentType: XLSX_CONTENT_TYPE,
    };
  }

  // -----------------------------------------------------------------------
  // Single inventory item, including its activity history
  // -----------------------------------------------------------------------

  async exportInventoryItem(
    id: string,
    format: ExportFormat,
  ): Promise<ExportFile> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: INVENTORY_ITEM_EXPORT_INCLUDE,
    });
    if (!item) throw new AppNotFoundException('Inventarobjekt nicht gefunden.');

    const movements = await this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      include: {
        fromRoom: true,
        toRoom: true,
        user: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const meta = [
      { label: 'Inventarnummer', value: item.inventoryNumber ?? '–' },
      { label: 'Artikel', value: item.article.name },
      {
        label: 'Status',
        value: INVENTORY_STATUS_LABEL[item.status] ?? item.status,
      },
      { label: 'Standort', value: `${item.location.name} / ${item.room.name}` },
      {
        label: 'Eigentümer',
        value: `${item.ownerOrganization.name} / ${item.ownerUnit.name}`,
      },
      { label: 'Anschaffungspreis', value: fmtPrice(item.purchasePrice) },
      { label: 'Anschaffungsdatum', value: fmtDate(item.purchaseDate) },
      { label: 'Seriennummer', value: item.serialNumber ?? '' },
      { label: 'Notizen', value: item.notes ?? '' },
    ];

    const columns: PdfColumn[] = [
      { header: 'Datum', key: 'date', width: 100 },
      { header: 'Typ', key: 'type', width: 90 },
      { header: 'Änderung', key: 'change', width: 160 },
      { header: 'Notiz', key: 'note', width: 140 },
      { header: 'Benutzer', key: 'user', width: 110 },
    ];
    const rows = movements.map((m) => ({
      date: fmtDateTime(m.createdAt),
      type: MOVEMENT_TYPE_LABEL[m.type] ?? m.type,
      change: describeMovement(m),
      note: m.note ?? '',
      user: m.user?.displayName ?? '',
    }));

    const filename = `Inventarobjekt-${slug(item.inventoryNumber ?? item.id)}`;

    if (format === 'pdf') {
      const buffer = await renderPdf(
        `Inventarobjekt: ${item.inventoryNumber ?? item.id}`,
        meta,
        [{ title: 'Aktivitäten', columns, rows }],
      );
      return {
        buffer,
        filename: `${filename}.pdf`,
        contentType: PDF_CONTENT_TYPE,
      };
    }

    const workbook = new ExcelJS.Workbook();
    const infoSheet = workbook.addWorksheet('Objekt');
    infoSheet.columns = [
      { header: 'Feld', key: 'label', width: 24 },
      { header: 'Wert', key: 'value', width: 40 },
    ];
    infoSheet.getRow(1).font = { bold: true };
    meta.forEach((m) => infoSheet.addRow(m));

    const activitySheet = workbook.addWorksheet('Aktivitäten');
    activitySheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.round(c.width / 6),
    }));
    activitySheet.getRow(1).font = { bold: true };
    rows.forEach((r) => activitySheet.addRow(r));

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `${filename}.xlsx`,
      contentType: XLSX_CONTENT_TYPE,
    };
  }

  // -----------------------------------------------------------------------
  // Articles export (one or many)
  // -----------------------------------------------------------------------

  async exportArticles(
    query: ExportArticlesQueryDto,
    format: ExportFormat,
  ): Promise<ExportFile> {
    const where = await this.articlesService.buildWhere(query);
    const articles = await this.prisma.article.findMany({
      where: {
        ...where,
        ...(query.articleIds?.length ? { id: { in: query.articleIds } } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    if (query.articleIds?.length && articles.length === 0) {
      throw new AppNotFoundException('Keine passenden Artikel gefunden.');
    }

    const units = await this.prisma.inventoryItem.findMany({
      where: { articleId: { in: articles.map((a) => a.id) }, deletedAt: null },
      include: INVENTORY_ITEM_EXPORT_INCLUDE,
      orderBy: { inventoryNumber: 'asc' },
    });

    const counts = new Map<
      string,
      { total: number; available: number; borrowed: number }
    >();
    for (const unit of units) {
      const entry = counts.get(unit.articleId) ?? {
        total: 0,
        available: 0,
        borrowed: 0,
      };
      entry.total += 1;
      if (unit.status === 'available') entry.available += 1;
      if (unit.status === 'borrowed') entry.borrowed += 1;
      counts.set(unit.articleId, entry);
    }

    const articleColumns: PdfColumn[] = [
      { header: 'Name', key: 'name', width: 180 },
      { header: 'Kategorie', key: 'category', width: 130 },
      { header: 'Bestand gesamt', key: 'total', width: 90 },
      { header: 'Verfügbar', key: 'available', width: 90 },
      { header: 'Ausgeliehen', key: 'borrowed', width: 90 },
    ];
    const articleRows = articles.map((a) => {
      const c = counts.get(a.id) ?? { total: 0, available: 0, borrowed: 0 };
      return {
        name: a.name,
        category: a.category?.name ?? '',
        total: c.total,
        available: c.available,
        borrowed: c.borrowed,
      };
    });

    const unitColumns: PdfColumn[] = [
      { header: 'Artikel', key: 'article', width: 130 },
      { header: 'Inventarnummer', key: 'inventoryNumber', width: 100 },
      { header: 'Status', key: 'status', width: 90 },
      { header: 'Standort', key: 'location', width: 100 },
      { header: 'Raum', key: 'room', width: 80 },
      { header: 'Anschaffungspreis', key: 'purchasePrice', width: 90 },
      { header: 'Anschaffungsdatum', key: 'purchaseDate', width: 90 },
    ];
    const unitRows = units.map((u) => ({
      article: u.article.name,
      inventoryNumber: u.inventoryNumber,
      status: INVENTORY_STATUS_LABEL[u.status] ?? u.status,
      location: u.location.name,
      room: u.room.name,
      purchasePrice: fmtPrice(u.purchasePrice),
      purchaseDate: fmtDate(u.purchaseDate),
    }));

    const filename =
      articles.length === 1
        ? `Artikel-${slug(articles[0].name)}`
        : `Artikel-${articles.length}-Stueck`;

    if (format === 'pdf') {
      const buffer = await renderPdf(
        articles.length === 1
          ? `Artikel: ${articles[0].name}`
          : 'Artikel-Export',
        [{ label: 'Anzahl Artikel', value: String(articles.length) }],
        [
          { title: 'Artikel', columns: articleColumns, rows: articleRows },
          { title: 'Objekte', columns: unitColumns, rows: unitRows },
        ],
      );
      return {
        buffer,
        filename: `${filename}.pdf`,
        contentType: PDF_CONTENT_TYPE,
      };
    }

    const workbook = new ExcelJS.Workbook();
    const articleSheet = workbook.addWorksheet('Artikel');
    articleSheet.columns = articleColumns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.round(c.width / 6),
    }));
    articleSheet.getRow(1).font = { bold: true };
    articleRows.forEach((r) => articleSheet.addRow(r));

    const unitSheet = workbook.addWorksheet('Objekte');
    unitSheet.columns = unitColumns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.round(c.width / 6),
    }));
    unitSheet.getRow(1).font = { bold: true };
    unitRows.forEach((r) => unitSheet.addRow(r));

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `${filename}.xlsx`,
      contentType: XLSX_CONTENT_TYPE,
    };
  }
}
