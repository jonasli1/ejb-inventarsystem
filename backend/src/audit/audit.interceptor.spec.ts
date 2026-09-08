import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUDITED_KEY, type AuditedMetadata } from './audited.decorator';

function createContext(
  method: string,
  params: Record<string, string>,
  user?: { id: string },
): ExecutionContext {
  const request = { method, params, user };
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('AuditInterceptor', () => {
  let reflector: { get: jest.Mock };
  let prisma: { article: { findUnique: jest.Mock } };
  let audit: { log: jest.Mock };
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    prisma = { article: { findUnique: jest.fn() } };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  function flush() {
    // AuditService.log() is fired from a rxjs `tap` callback without being
    // awaited by the interceptor itself (by design - logging must never
    // delay the actual response), so tests need a tick for the promise
    // chain to run before asserting on the mock.
    return new Promise((resolve) => setImmediate(resolve));
  }

  it('passes requests through untouched when no @Audited metadata is present', async () => {
    reflector.get.mockReturnValue(undefined);
    const context = createContext('POST', {});
    const result = await interceptor.intercept(
      context,
      handlerReturning({ id: 'x' }),
    );
    await flush();
    expect(audit.log).not.toHaveBeenCalled();
    // No "before" lookup should have been attempted either.
    expect(prisma.article.findUnique).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('create (POST): captures the response as "after", no "before" lookup', async () => {
    const meta: AuditedMetadata = { entityType: 'Article', category: 'article' };
    reflector.get.mockReturnValue(meta);
    const context = createContext('POST', {}, { id: 'actor-1' });

    const obs = await interceptor.intercept(
      context,
      handlerReturning({ id: 'article-1', name: 'Neuer Artikel' }),
    );
    obs.subscribe();
    await flush();

    expect(prisma.article.findUnique).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Article',
        entityId: 'article-1',
        action: 'create',
        category: 'article',
        userId: 'actor-1',
        before: undefined,
        after: { id: 'article-1', name: 'Neuer Artikel' },
      }),
    );
  });

  it('update (PUT): fetches "before" first, then logs "before" and "after"', async () => {
    const meta: AuditedMetadata = { entityType: 'Article', category: 'article' };
    reflector.get.mockReturnValue(meta);
    prisma.article.findUnique.mockResolvedValue({
      id: 'article-1',
      name: 'Alter Name',
    });
    const context = createContext(
      'PUT',
      { id: 'article-1' },
      { id: 'actor-1' },
    );

    const obs = await interceptor.intercept(
      context,
      handlerReturning({ id: 'article-1', name: 'Neuer Name' }),
    );
    obs.subscribe();
    await flush();

    expect(prisma.article.findUnique).toHaveBeenCalledWith({
      where: { id: 'article-1' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        before: { id: 'article-1', name: 'Alter Name' },
        after: { id: 'article-1', name: 'Neuer Name' },
      }),
    );
  });

  it('delete (DELETE): logs "before" only, no "after"', async () => {
    const meta: AuditedMetadata = { entityType: 'Article', category: 'article' };
    reflector.get.mockReturnValue(meta);
    prisma.article.findUnique.mockResolvedValue({
      id: 'article-1',
      name: 'Wird gelöscht',
    });
    const context = createContext(
      'DELETE',
      { id: 'article-1' },
      { id: 'actor-1' },
    );

    const obs = await interceptor.intercept(context, handlerReturning(undefined));
    obs.subscribe();
    await flush();

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'article-1',
        action: 'delete',
        before: { id: 'article-1', name: 'Wird gelöscht' },
        after: undefined,
      }),
    );
  });

  it('honors an explicit action override (e.g. a POST that is really an update)', async () => {
    const meta: AuditedMetadata = {
      entityType: 'InventoryItem',
      category: 'inventory',
      action: 'update',
    };
    reflector.get.mockReturnValue(meta);
    (prisma as unknown as { inventoryItem: { findUnique: jest.Mock } }).inventoryItem = {
      findUnique: jest.fn().mockResolvedValue({ id: 'item-1', roomId: 'room-a' }),
    };
    const context = createContext('POST', { id: 'item-1' }, { id: 'actor-1' });

    const obs = await interceptor.intercept(
      context,
      handlerReturning({ id: 'item-1', roomId: 'room-b' }),
    );
    obs.subscribe();
    await flush();

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update' }),
    );
  });
});
