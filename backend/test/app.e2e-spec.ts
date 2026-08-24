import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import nodemailer from 'nodemailer';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChurchToolsService } from '../src/auth/churchtools/churchtools.service';
import { EmailService } from '../src/notifications/email.service';
import { ALL_PERMISSIONS } from '../src/common/constants/permissions';

// EmailService is exercised for real via the DI container in a couple of
// tests below (notification default-on delivery, password reset) - mock the
// wire transport so those don't attempt a real SMTP connection.
jest.mock('nodemailer');

// CreateLoanDto requires these (no longer optional) - spread into every
// loan-creation body in this file that doesn't set them explicitly.
const LOAN_BORROWER_FIELDS = {
  borrowerStreet: 'Teststraße 1',
  borrowerCity: '12345 Teststadt',
  borrowerEmail: 'borrower@example.com',
  borrowerPhone: '+49 170 0000000',
  dueDate: '2030-12-31T00:00:00.000Z',
};

describe('Inventarsystem API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const churchToolsMock = {
    isConfigured: () => true,
    buildAuthorizationUrl: () => ({
      url: 'https://example.church.tools/authorize',
      state: 'stub-state',
    }),
    handleCallback: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ChurchToolsService)
      .useValue(churchToolsMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await seedBaseline(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------

  it('GET /health is public and returns ok', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  // -------------------------------------------------------------------
  // Local auth + RBAC
  // -------------------------------------------------------------------

  describe('local auth + RBAC', () => {
    it('rejects invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong-password' })
        .expect(401);
    });

    it('logs in and returns a token pair', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('rejects a low-privilege user on an admin-only route (403)', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('allows an admin user to list users', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('rotates refresh tokens and rejects the old one after use', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);

      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(201);

      expect(refreshed.body.accessToken).toBeDefined();

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });

    it('revokes a refresh token on logout', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  // -------------------------------------------------------------------
  // ChurchTools group sync
  // -------------------------------------------------------------------

  describe('ChurchTools group sync', () => {
    it('syncs churchtools groups on login and preserves manual memberships', async () => {
      churchToolsMock.handleCallback.mockResolvedValueOnce({
        personId: 'ct-person-1',
        email: 'ct-user@example.com',
        displayName: 'ChurchTools User',
        groups: [
          { id: 'ct-group-1', name: 'Lobpreisteam' },
          { id: 'ct-group-2', name: 'Kinderkirche' },
        ],
      });

      const first = await request(app.getHttpServer())
        .get('/api/v1/auth/churchtools/callback')
        .query({ code: 'stub-code', state: 'stub-state' })
        .expect(200);

      expect(first.body.accessToken).toBeDefined();

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ct-user@example.com' },
      });

      let memberships = await prisma.userGroup.findMany({
        where: { userId: user.id },
        include: { group: true },
      });
      expect(memberships.map((m) => m.group.name).sort()).toEqual([
        'Kinderkirche',
        'Lobpreisteam',
      ]);
      expect(memberships.every((m) => m.source === 'churchtools')).toBe(true);

      // Admin manually assigns an extra group.
      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);

      const manualGroup = await prisma.group.create({
        data: { name: 'Vorstand (manuell)' },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.id}/groups`)
        .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
        .send({ groupId: manualGroup.id })
        .expect(201);

      // Second ChurchTools login drops "Kinderkirche" but must NOT touch the manual group.
      churchToolsMock.handleCallback.mockResolvedValueOnce({
        personId: 'ct-person-1',
        email: 'ct-user@example.com',
        displayName: 'ChurchTools User',
        groups: [{ id: 'ct-group-1', name: 'Lobpreisteam' }],
      });

      await request(app.getHttpServer())
        .get('/api/v1/auth/churchtools/callback')
        .query({ code: 'stub-code-2', state: 'stub-state' })
        .expect(200);

      memberships = await prisma.userGroup.findMany({
        where: { userId: user.id },
        include: { group: true },
      });
      const byName = new Map(memberships.map((m) => [m.group.name, m.source]));

      expect(byName.get('Lobpreisteam')).toBe('churchtools');
      expect(byName.has('Kinderkirche')).toBe(false);
      expect(byName.get('Vorstand (manuell)')).toBe('manual');
    });
  });

  // -------------------------------------------------------------------
  // Core CRUD path: Organizations -> Units -> Locations/Rooms -> Articles -> Inventory -> Loans
  // -------------------------------------------------------------------

  describe('core CRUD + loan lifecycle', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('creates an organization + unit, article, location + room, and inventory item', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'E2E Test Org' })
        .expect(201);

      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'E2E Unit' })
        .expect(201);

      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'E2E Location' })
        .expect(201);

      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'E2E Room', locationId: location.body.id })
        .expect(201);

      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'E2E Article', type: 'UNIQUE' })
        .expect(201);

      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
        })
        .expect(201);

      expect(item.body.status).toBe('available');
      expect(item.body.inventoryNumber).toMatch(/^INV-/);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/inventory?articleId=${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body.data).toHaveLength(1);

      // Regression: query string "false" must not be coerced to boolean true
      // (Boolean("false") === true is a classic class-transformer footgun).
      const flatViaQueryString = await request(app.getHttpServer())
        .get(`/api/v1/inventory?articleId=${article.body.id}&grouped=false`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(flatViaQueryString.body.data[0]).toHaveProperty('inventoryNumber');
      expect(flatViaQueryString.body.data[0]).not.toHaveProperty('units');

      const groupedViaQueryString = await request(app.getHttpServer())
        .get(`/api/v1/inventory?articleId=${article.body.id}&grouped=true`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(groupedViaQueryString.body.data[0]).toHaveProperty('units');
    });

    it('rejects creating an inventory item with a unit that does not belong to the organization', async () => {
      const orgA = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Org A' })
        .expect(201);
      const orgB = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Org B' })
        .expect(201);
      const unitOfB = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgB.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Unit of B' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Mismatch Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Mismatch Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Mismatch Article', type: 'UNIQUE' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: orgA.body.id,
          ownerUnitId: unitOfB.body.id,
        })
        .expect(400);
    });

    it('runs a full loan checkout + return cycle for a BULK article', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Loan Test Org' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Loan Test Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Loan Test Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Loan Test Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Loan Test Cable', type: 'BULK' })
        .expect(201);

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${token}`)
          .send({
            articleId: article.body.id,
            locationId: location.body.id,
            roomId: room.body.id,
            ownerOrganizationId: org.body.id,
            ownerUnitId: unit.body.id,
          })
          .expect(201);
      }

      const checkoutDate = '2026-01-15T00:00:00.000Z';
      const loan = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          borrowerName: 'E2E Borrower',
          ...LOAN_BORROWER_FIELDS,
          checkoutDate,
          items: [{ articleId: article.body.id, quantity: 2 }],
        })
        .expect(201);

      expect(loan.body.items).toHaveLength(2);
      // The admin holds loans.administer, so direct creation is auto-approved.
      expect(loan.body.status).toBe('approved');
      expect(new Date(loan.body.checkoutDate).toISOString()).toBe(checkoutDate);

      // The loan must be viewable in detail, including its resolved items.
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/loans/${loan.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(detail.body.borrowerName).toBe('E2E Borrower');
      expect(detail.body.items).toHaveLength(2);
      expect(detail.body.items[0].inventoryItem.article.name).toBe(
        'Loan Test Cable',
      );

      // Nothing is physically checked out yet -- only the "issue" step
      // (the "Ausgabe-Prozess") flips inventory status to borrowed.
      const afterApproval = await request(app.getHttpServer())
        .get(`/api/v1/articles/${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(afterApproval.body.stock).toEqual({
        total: 3,
        available: 3,
        borrowed: 0,
      });

      const issued = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loan.body.id}/issue`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);
      expect(issued.body.status).toBe('issued');
      expect(issued.body.issuedAt).toBeTruthy();

      const afterCheckout = await request(app.getHttpServer())
        .get(`/api/v1/articles/${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(afterCheckout.body.stock).toEqual({
        total: 3,
        available: 1,
        borrowed: 2,
      });

      const returned = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loan.body.id}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: loan.body.items.map((li: { id: string }) => ({
            loanItemId: li.id,
          })),
        })
        .expect(201);
      expect(returned.body.status).toBe('completed');

      const afterReturn = await request(app.getHttpServer())
        .get(`/api/v1/articles/${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(afterReturn.body.stock).toEqual({
        total: 3,
        available: 3,
        borrowed: 0,
      });
    });

    it('rejects checking out more units than are available', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Overbook Org' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Overbook Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Overbook Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Overbook Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Overbook Article', type: 'BULK' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          borrowerName: 'Greedy Borrower',
          ...LOAN_BORROWER_FIELDS,
          items: [{ articleId: article.body.id, quantity: 5 }],
        })
        .expect(400);
    });
  });

  describe('deletion + Admin role protection', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('deletes a location with locations.manage permission', async () => {
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Deletable Location' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/locations/${location.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/locations/${location.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('deletes an organization with organizations.manage permission', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Deletable Org' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${org.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${org.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('deletes a non-Admin role with roles.manage permission', async () => {
      const role = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Deletable Role' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/roles/${role.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/roles/${role.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('refuses to delete or rename the Admin role, even with roles.manage permission', async () => {
      const roles = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const adminRole = roles.body.find(
        (r: { name: string }) => r.name === 'Admin',
      );
      expect(adminRole).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/api/v1/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .put(`/api/v1/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Not Admin Anymore' })
        .expect(403);

      // still present, still named "Admin"
      const stillThere = await request(app.getHttpServer())
        .get(`/api/v1/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(stillThere.body.name).toBe('Admin');
    });
  });

  describe('user deletion', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('deletes another user', async () => {
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'deleteme@example.com', displayName: 'Delete Me' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${user.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/users/${user.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('refuses to let a user delete their own account', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${me.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      // still present and can still log in
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
    });
  });

  describe('article deletion when out of stock', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('refuses to delete an article that still has inventory items', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Article Delete Org' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Article Delete Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Article Delete Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Article Delete Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Article With Stock', type: 'UNIQUE' })
        .expect(201);
      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      // once the only unit is removed, deletion is allowed
      await request(app.getHttpServer())
        .delete(`/api/v1/inventory/${item.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });

  describe('inventory status restrictions', () => {
    let token: string;
    let articleId: string;
    let locationId: string;
    let roomId: string;
    let orgId: string;
    let unitId: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;

      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Status Org' })
        .expect(201);
      orgId = org.body.id;
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Status Unit' })
        .expect(201);
      unitId = unit.body.id;
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Status Location' })
        .expect(201);
      locationId = location.body.id;
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Status Room', locationId })
        .expect(201);
      roomId = room.body.id;
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Status Article', type: 'UNIQUE' })
        .expect(201);
      articleId = article.body.id;
    });

    it('rejects creating an inventory item with status "borrowed"', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
          status: 'borrowed',
        })
        .expect(400);
    });

    it('allows creating and updating an item with the new "installed" status', async () => {
      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
          status: 'installed',
        })
        .expect(201);
      expect(item.body.status).toBe('installed');

      await request(app.getHttpServer())
        .put(`/api/v1/inventory/${item.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'borrowed' })
        .expect(400);
    });
  });

  describe('loans.view permission (read-only)', () => {
    let adminToken: string;
    let viewerToken: string;
    let loanId: string;

    beforeAll(async () => {
      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      adminToken = adminLogin.body.accessToken;

      const permissions = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const loansViewPermission = permissions.body.find(
        (p: { key: string }) => p.key === 'loans.view',
      );
      expect(loansViewPermission).toBeDefined();

      const role = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Loan Viewer' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/roles/${role.body.id}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissionId: loansViewPermission.id })
        .expect(201);

      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'loanviewer@example.com',
          displayName: 'Loan Viewer',
          password: 'ViewerPass123!',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.body.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: role.body.id })
        .expect(201);

      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'loanviewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      viewerToken = viewerLogin.body.accessToken;

      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Loan Viewer Org' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Loan Viewer Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Loan Viewer Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Loan Viewer Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Loan Viewer Article', type: 'UNIQUE' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
        })
        .expect(201);

      const loan = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          borrowerName: 'Read Only Test',
          ...LOAN_BORROWER_FIELDS,
          items: [{ articleId: article.body.id, quantity: 1 }],
        })
        .expect(201);
      loanId = loan.body.id;
    });

    it('allows a loans.view-only user to list and view loan details', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/loans')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/loans/${loanId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('still refuses a loans.view-only user permission to return a loan', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/return`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ items: [] })
        .expect(403);
    });
  });

  describe('activity feed', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('lists stock movements across all inventory items, most recent first', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Activity Org' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Activity Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Activity Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Activity Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Activity Article', type: 'UNIQUE' })
        .expect(201);
      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
        })
        .expect(201);

      const activity = await request(app.getHttpServer())
        .get(`/api/v1/activity?articleId=${article.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(activity.body.data.length).toBeGreaterThanOrEqual(2);
      expect(activity.body.data[0].source).toBe('movement');
      expect(activity.body.data[0].typeLabel).toBe('Zugang');
      expect(activity.body.data[0].inventoryItem.id).toBe(item.body.id);
      expect(activity.body.data[0].inventoryItem.article.name).toBe(
        'Activity Article',
      );

      // The Article's own creation is also part of the merged feed.
      expect(
        activity.body.data.some(
          (e: { source: string; entityType: string }) =>
            e.source === 'audit' && e.entityType === 'Article',
        ),
      ).toBe(true);
    });
  });

  describe('group -> role auto-assignment', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('grants and revokes a role automatically as group membership changes', async () => {
      const role = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Auto Role via Group' })
        .expect(201);
      const group = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Auto Role Group' })
        .expect(201);
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'group-role@example.com',
          displayName: 'Group Role User',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/groups/${group.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: role.body.id })
        .expect(201);

      // Joining the group grants the mapped role.
      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.body.id}/groups`)
        .set('Authorization', `Bearer ${token}`)
        .send({ groupId: group.body.id })
        .expect(201);

      const afterJoin = await request(app.getHttpServer())
        .get(`/api/v1/users/${user.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        afterJoin.body.userRoles.some(
          (ur: { role: { id: string } }) => ur.role.id === role.body.id,
        ),
      ).toBe(true);

      // A group-derived role cannot be removed manually...
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${user.body.id}/roles/${role.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      // ...but leaving the group revokes it automatically.
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${user.body.id}/groups/${group.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const afterLeave = await request(app.getHttpServer())
        .get(`/api/v1/users/${user.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        afterLeave.body.userRoles.some(
          (ur: { role: { id: string } }) => ur.role.id === role.body.id,
        ),
      ).toBe(false);
    });

    it('preserves a manually-assigned role even if the same role is also group-mapped', async () => {
      const role = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Manual Plus Group Role' })
        .expect(201);
      const group = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Manual Plus Group' })
        .expect(201);
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'manual-plus-group@example.com',
          displayName: 'Manual Plus Group User',
        })
        .expect(201);

      // Manual assignment first.
      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: role.body.id })
        .expect(201);

      // Now also map the group to the same role and add the user to it.
      await request(app.getHttpServer())
        .post(`/api/v1/groups/${group.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: role.body.id })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.body.id}/groups`)
        .set('Authorization', `Bearer ${token}`)
        .send({ groupId: group.body.id })
        .expect(201);

      // Leaving the group must NOT remove the manually-assigned role.
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${user.body.id}/groups/${group.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const stillHasRole = await request(app.getHttpServer())
        .get(`/api/v1/users/${user.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        stillHasRole.body.userRoles.some(
          (ur: { role: { id: string } }) => ur.role.id === role.body.id,
        ),
      ).toBe(true);

      // And it can still be removed manually now that it's manual-only.
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${user.body.id}/roles/${role.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });

  describe('inventory purchase price/date and number search', () => {
    let token: string;
    let articleId: string;
    let locationId: string;
    let roomId: string;
    let orgId: string;
    let unitId: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;

      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Purchase Org' })
        .expect(201);
      orgId = org.body.id;
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Purchase Unit' })
        .expect(201);
      unitId = unit.body.id;
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Purchase Location' })
        .expect(201);
      locationId = location.body.id;
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Purchase Room', locationId })
        .expect(201);
      roomId = room.body.id;
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Purchase Article', type: 'UNIQUE' })
        .expect(201);
      articleId = article.body.id;
    });

    it('defaults purchaseDate to today when omitted, and accepts an explicit price/date', async () => {
      const withDefaults = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
        })
        .expect(201);
      expect(withDefaults.body.purchaseDate).toBeDefined();
      expect(new Date(withDefaults.body.purchaseDate).toDateString()).toBe(
        new Date().toDateString(),
      );

      const explicit = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
          purchasePrice: 149.99,
          purchaseDate: '2025-06-01T00:00:00.000Z',
        })
        .expect(201);
      expect(Number(explicit.body.purchasePrice)).toBeCloseTo(149.99);
      expect(new Date(explicit.body.purchaseDate).toISOString()).toBe(
        '2025-06-01T00:00:00.000Z',
      );

      const updated = await request(app.getHttpServer())
        .put(`/api/v1/inventory/${explicit.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ purchasePrice: 99.5 })
        .expect(200);
      expect(Number(updated.body.purchasePrice)).toBeCloseTo(99.5);
      // purchaseDate untouched by the partial update.
      expect(new Date(updated.body.purchaseDate).toISOString()).toBe(
        '2025-06-01T00:00:00.000Z',
      );
    });

    it('filters inventory by a partial, case-insensitive inventory number match', async () => {
      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
          inventoryNumber: 'SEARCH-ME-001',
        })
        .expect(201);

      const found = await request(app.getHttpServer())
        .get('/api/v1/inventory?search=search-me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        found.body.data.some((i: { id: string }) => i.id === item.body.id),
      ).toBe(true);

      const notFound = await request(app.getHttpServer())
        .get('/api/v1/inventory?search=no-such-number')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(notFound.body.data).toHaveLength(0);
    });
  });

  describe('password self-service and admin management', () => {
    let adminToken: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      adminToken = login.body.accessToken;
    });

    it('lets a user change their own password given the correct current password', async () => {
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'selfchange@example.com',
          displayName: 'Self Change',
          password: 'OldPass123!',
        })
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'selfchange@example.com', password: 'OldPass123!' })
        .expect(201);
      const userToken = login.body.accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPass123!',
          newPasswordConfirmation: 'NewPass123!',
        })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!',
          newPasswordConfirmation: 'MISMATCH!',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!',
          newPasswordConfirmation: 'NewPass123!',
        })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'selfchange@example.com', password: 'OldPass123!' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'selfchange@example.com', password: 'NewPass123!' })
        .expect(201);
    });

    it('refuses users.reset_password without the permission, and allows an admin to reset a password', async () => {
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'resetme@example.com',
          displayName: 'Reset Me',
          password: 'OriginalPass123!',
        })
        .expect(201);

      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.body.id}/reset-password`)
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .send({ newPassword: 'ShouldNotWork123!' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/users/${user.body.id}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'AdminSetPass123!' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'resetme@example.com', password: 'OriginalPass123!' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'resetme@example.com', password: 'AdminSetPass123!' })
        .expect(201);
    });

    it('refuses users.change_email without the permission, and allows an admin to change it', async () => {
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'oldmail@example.com', displayName: 'Mail Change' })
        .expect(201);

      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/v1/users/${user.body.id}/email`)
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .send({ email: 'newmail@example.com' })
        .expect(403);

      await request(app.getHttpServer())
        .put(`/api/v1/users/${user.body.id}/email`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'admin@example.com' })
        .expect(409);

      const changed = await request(app.getHttpServer())
        .put(`/api/v1/users/${user.body.id}/email`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'newmail@example.com' })
        .expect(200);
      expect(changed.body.email).toBe('newmail@example.com');
    });
  });

  describe('export endpoints', () => {
    let token: string;
    let loanId: string;
    let articleId: string;
    let inventoryItemId: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;

      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Export Org' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Export Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Export Location' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Export Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Export Article', type: 'UNIQUE' })
        .expect(201);
      articleId = article.body.id;
      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
        })
        .expect(201);
      inventoryItemId = item.body.id;

      const loan = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          borrowerName: 'Export Borrower',
          ...LOAN_BORROWER_FIELDS,
          items: [{ inventoryItemId }],
        })
        .expect(201);
      loanId = loan.body.id;
    });

    it('exports a single loan as xlsx and pdf', async () => {
      const xlsx = await request(app.getHttpServer())
        .get(`/api/v1/export/loans/${loanId}?format=xlsx`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');

      const pdf = await request(app.getHttpServer())
        .get(`/api/v1/export/loans/${loanId}?format=pdf`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
    });

    it('exports the inventory list grouped by owner or location', async () => {
      const byOwner = await request(app.getHttpServer())
        .get('/api/v1/export/inventory?format=xlsx&groupBy=owner')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(byOwner.headers['content-type']).toContain('spreadsheetml');

      const byLocation = await request(app.getHttpServer())
        .get('/api/v1/export/inventory?format=pdf&groupBy=location')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(byLocation.headers['content-type']).toBe('application/pdf');
    });

    it('exports a single inventory item with its activity history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/export/inventory/${inventoryItemId}?format=xlsx`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });

    it('exports one or more articles', async () => {
      const single = await request(app.getHttpServer())
        .get(`/api/v1/export/articles?format=pdf&articleIds=${articleId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(single.headers['content-type']).toBe('application/pdf');

      const all = await request(app.getHttpServer())
        .get('/api/v1/export/articles?format=xlsx')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(all.headers['content-type']).toContain('spreadsheetml');
    });

    it('refuses export access without reports.view', async () => {
      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .get(`/api/v1/export/loans/${loanId}?format=xlsx`)
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .expect(403);
    });
  });

  describe('universal inventory search', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('matches on article name, manufacturer, owner organization, and location -- not just inventory number', async () => {
      const org = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Zeltbau Suchtest e.V.' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${org.body.id}/units`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Search Unit' })
        .expect(201);
      const location = await request(app.getHttpServer())
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Suchlager Nord' })
        .expect(201);
      const room = await request(app.getHttpServer())
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Search Room', locationId: location.body.id })
        .expect(201);
      const article = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Funkmikrofon Shure',
          type: 'UNIQUE',
          manufacturer: 'Shure Inc.',
        })
        .expect(201);
      const item = await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: article.body.id,
          locationId: location.body.id,
          roomId: room.body.id,
          ownerOrganizationId: org.body.id,
          ownerUnitId: unit.body.id,
          serialNumber: 'SN-SEARCHTEST-001',
        })
        .expect(201);

      for (const search of [
        item.body.inventoryNumber,
        'SN-SEARCHTEST-001',
        'Funkmikrofon',
        'Shure Inc',
        'Zeltbau Suchtest',
        'Suchlager Nord',
      ]) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/inventory?search=${encodeURIComponent(search)}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(
          res.body.data.some((i: { id: string }) => i.id === item.body.id),
        ).toBe(true);
      }

      const noMatch = await request(app.getHttpServer())
        .get('/api/v1/inventory?search=NoSuchThingAtAll')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        noMatch.body.data.some((i: { id: string }) => i.id === item.body.id),
      ).toBe(false);
    });
  });

  describe('group -> organization/unit scope and org-scoped loan approval workflow', () => {
    let adminToken: string;
    let orgA: { id: string };
    let orgB: { id: string };
    let unitA: { id: string };
    let itemA: { id: string; inventoryNumber: string };
    let requesterToken: string;
    let managerAToken: string;
    let managerBToken: string;
    let spenderAToken: string;
    let administerToken: string;
    const borrowerFields = {
      borrowerStreet: 'Teststraße 1',
      borrowerCity: '12345 Teststadt',
      borrowerEmail: 'borrower@example.com',
      borrowerPhone: '+49 170 0000000',
      dueDate: '2030-12-31T00:00:00.000Z',
    };

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      adminToken = login.body.accessToken;

      orgA = (
        await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Org A' })
          .expect(201)
      ).body;
      orgB = (
        await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Org B' })
          .expect(201)
      ).body;
      unitA = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgA.id}/units`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Unit A' })
          .expect(201)
      ).body;
      const location = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Location' })
          .expect(201)
      ).body;
      const room = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Room', locationId: location.id })
          .expect(201)
      ).body;
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      itemA = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            articleId: article.id,
            locationId: location.id,
            roomId: room.id,
            ownerOrganizationId: orgA.id,
            ownerUnitId: unitA.id,
          })
          .expect(201)
      ).body;

      // Groups are scoped to an organization (or a specific unit within it)
      // via the dedicated organization-scopes sub-resource -- membership then
      // implies "belongs to" that org/unit for the org-scoped loans.manage
      // and loans.spend permissions.
      const groupA = (
        await request(app.getHttpServer())
          .post('/api/v1/groups')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Group of Org A' })
          .expect(201)
      ).body;
      const groupAScope = (
        await request(app.getHttpServer())
          .post(`/api/v1/groups/${groupA.id}/organization-scopes`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ organizationId: orgA.id })
          .expect(201)
      ).body;
      expect(groupAScope.organizationId).toBe(orgA.id);
      expect(groupAScope.organizationUnitId).toBeNull();

      const groupB = (
        await request(app.getHttpServer())
          .post('/api/v1/groups')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Group of Org B' })
          .expect(201)
      ).body;
      await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupB.id}/organization-scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ organizationId: orgB.id })
        .expect(201);

      const spenderGroupA = (
        await request(app.getHttpServer())
          .post('/api/v1/groups')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Spenders of Org A' })
          .expect(201)
      ).body;
      await request(app.getHttpServer())
        .post(`/api/v1/groups/${spenderGroupA.id}/organization-scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ organizationId: orgA.id })
        .expect(201);

      const createRole = (
        await request(app.getHttpServer())
          .post('/api/v1/roles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Requester' })
          .expect(201)
      ).body;
      const manageRole = (
        await request(app.getHttpServer())
          .post('/api/v1/roles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Manager' })
          .expect(201)
      ).body;
      const spendRole = (
        await request(app.getHttpServer())
          .post('/api/v1/roles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Spender' })
          .expect(201)
      ).body;
      const administerRole = (
        await request(app.getHttpServer())
          .post('/api/v1/roles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Workflow Administer' })
          .expect(201)
      ).body;

      const permissions = (
        await request(app.getHttpServer())
          .get('/api/v1/permissions')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
      ).body;
      const permByKey = (key: string): { id: string } =>
        permissions.find((p: { key: string }) => p.key === key) as {
          id: string;
        };

      for (const [roleId, key] of [
        [createRole.id, 'loans.create'],
        [manageRole.id, 'loans.manage'],
        [spendRole.id, 'loans.spend'],
        [administerRole.id, 'loans.administer'],
      ] as const) {
        await request(app.getHttpServer())
          .post(`/api/v1/roles/${roleId}/permissions`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ permissionId: permByKey(key).id })
          .expect(201);
      }

      async function createUserWithRoleAndGroup(
        email: string,
        roleId: string,
        groupId?: string,
      ): Promise<string> {
        const user = (
          await request(app.getHttpServer())
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ email, displayName: email, password: 'WorkflowPass123!' })
            .expect(201)
        ).body;
        await request(app.getHttpServer())
          .post(`/api/v1/users/${user.id}/roles`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ roleId })
          .expect(201);
        if (groupId) {
          await request(app.getHttpServer())
            .post(`/api/v1/users/${user.id}/groups`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ groupId })
            .expect(201);
        }
        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'WorkflowPass123!' })
          .expect(201);
        return login.body.accessToken as string;
      }

      requesterToken = await createUserWithRoleAndGroup(
        'requester@example.com',
        createRole.id,
      );
      managerAToken = await createUserWithRoleAndGroup(
        'manager-a@example.com',
        manageRole.id,
        groupA.id,
      );
      managerBToken = await createUserWithRoleAndGroup(
        'manager-b@example.com',
        manageRole.id,
        groupB.id,
      );
      spenderAToken = await createUserWithRoleAndGroup(
        'spender-a@example.com',
        spendRole.id,
        spenderGroupA.id,
      );
      administerToken = await createUserWithRoleAndGroup(
        'administer@example.com',
        administerRole.id,
      );
    });

    it('rejects requesting a fixed-installed item at any permission tier', async () => {
      const installedItem = await request(app.getHttpServer())
        .put(`/api/v1/inventory/${itemA.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'installed' })
        .expect(200);
      expect(installedItem.body.status).toBe('installed');

      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          borrowerName: 'Installed Test',
          ...borrowerFields,
          items: [{ inventoryItemId: itemA.id }],
        })
        .expect(400);

      // Reset back to available for the rest of this describe block.
      await request(app.getHttpServer())
        .put(`/api/v1/inventory/${itemA.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'available' })
        .expect(200);
    });

    it('walks a loan through requested -> approved -> issued -> completed: manage approves (org-scoped), spend issues/returns (separately gated)', async () => {
      // loans.create always requests, regardless of organization.
      const created = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          borrowerName: 'Workflow Borrower',
          ...borrowerFields,
          items: [{ inventoryItemId: itemA.id }],
        })
        .expect(201);
      expect(created.body.status).toBe('requested');
      expect(created.body.items[0].approvedAt).toBeNull();
      const loanId = created.body.id;

      // A loans.manage holder from a *different* organization has nothing in
      // scope to approve.
      await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .send({})
        .expect(403);

      // The loans.manage holder from the *matching* organization can, and
      // this single-item loan becomes fully approved in one call.
      const approved = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({})
        .expect(201);
      expect(approved.body.status).toBe('approved');
      expect(approved.body.items[0].approvedAt).not.toBeNull();
      expect(approved.body.items[0].approvedBy.id).toBeDefined();

      // loans.manage alone no longer covers issuing -- that's loans.spend now.
      await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/issue`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({})
        .expect(403);

      // A loans.spend holder from a different org's scope can't either.
      await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/issue`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .send({})
        .expect(403);

      const issued = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/issue`)
        .set('Authorization', `Bearer ${spenderAToken}`)
        .send({})
        .expect(201);
      expect(issued.body.status).toBe('issued');

      const itemAfterIssue = await request(app.getHttpServer())
        .get(`/api/v1/inventory/${itemA.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(itemAfterIssue.body.status).toBe('borrowed');

      // Returning is likewise loans.spend, not loans.manage.
      await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/return`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          items: issued.body.items.map((li: { id: string }) => ({
            loanItemId: li.id,
          })),
        })
        .expect(403);

      const returned = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/return`)
        .set('Authorization', `Bearer ${spenderAToken}`)
        .send({
          items: issued.body.items.map((li: { id: string }) => ({
            loanItemId: li.id,
          })),
        })
        .expect(201);
      expect(returned.body.status).toBe('completed');
    });

    it('approves a multi-organization loan per item, only becoming "approved" once every item is', async () => {
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Partial Approval Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const location = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Partial Approval Location' })
          .expect(201)
      ).body;
      const room = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Partial Approval Room', locationId: location.id })
          .expect(201)
      ).body;
      const unitB = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgB.id}/units`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Partial Approval Unit B' })
          .expect(201)
      ).body;
      const itemFromA = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            articleId: article.id,
            locationId: location.id,
            roomId: room.id,
            ownerOrganizationId: orgA.id,
            ownerUnitId: unitA.id,
          })
          .expect(201)
      ).body;
      const itemFromB = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            articleId: article.id,
            locationId: location.id,
            roomId: room.id,
            ownerOrganizationId: orgB.id,
            ownerUnitId: unitB.id,
          })
          .expect(201)
      ).body;

      const created = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          borrowerName: 'Multi-Org Borrower',
          ...borrowerFields,
          items: [
            { inventoryItemId: itemFromA.id },
            { inventoryItemId: itemFromB.id },
          ],
        })
        .expect(201);
      const loanId = created.body.id;

      // Org A's manager approves only their own item; the loan stays
      // "requested" because Org B's item is still unapproved.
      const afterFirstApprove = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({})
        .expect(201);
      expect(afterFirstApprove.body.status).toBe('requested');
      const itemAApproval = afterFirstApprove.body.items.find(
        (i: { inventoryItemId: string }) => i.inventoryItemId === itemFromA.id,
      );
      const itemBApproval = afterFirstApprove.body.items.find(
        (i: { inventoryItemId: string }) => i.inventoryItemId === itemFromB.id,
      );
      expect(itemAApproval.approvedAt).not.toBeNull();
      expect(itemBApproval.approvedAt).toBeNull();

      // Org B's manager approves the remaining item -> now fully approved.
      const afterSecondApprove = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .send({})
        .expect(201);
      expect(afterSecondApprove.body.status).toBe('approved');
      expect(
        afterSecondApprove.body.items.every(
          (i: { approvedAt: string | null }) => i.approvedAt !== null,
        ),
      ).toBe(true);
    });

    it('lets loans.administer create a pre-approved loan for any organization, with forceRequested honored', async () => {
      // Uses its own item (rather than itemA) so this test's loans don't
      // linger and affect the double-booking test that runs later.
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Administer Test Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const location = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Administer Test Location' })
          .expect(201)
      ).body;
      const room = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Administer Test Room', locationId: location.id })
          .expect(201)
      ).body;
      const unitB = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgB.id}/units`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Administer Test Unit' })
          .expect(201)
      ).body;
      async function makeItem(): Promise<{ id: string }> {
        return (
          await request(app.getHttpServer())
            .post('/api/v1/inventory')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              articleId: article.id,
              locationId: location.id,
              roomId: room.id,
              ownerOrganizationId: orgB.id,
              ownerUnitId: unitB.id,
            })
            .expect(201)
        ).body as { id: string };
      }
      const itemOne = await makeItem();
      const itemTwo = await makeItem();

      // Default: loans.administer creating directly for another org skips approval.
      const preApproved = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${administerToken}`)
        .send({
          borrowerName: 'Administer Direct',
          ...borrowerFields,
          items: [{ inventoryItemId: itemOne.id }],
        })
        .expect(201);
      expect(preApproved.body.status).toBe('approved');

      // reset-status forces it back to "requested" for re-review, and clears
      // the item-level approval that was fast-path-stamped at creation.
      await request(app.getHttpServer())
        .post(`/api/v1/loans/${preApproved.body.id}/reset-status`)
        .set('Authorization', `Bearer ${administerToken}`)
        .expect(201);
      const afterReset = await request(app.getHttpServer())
        .get(`/api/v1/loans/${preApproved.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(afterReset.body.status).toBe('requested');
      expect(afterReset.body.items[0].approvedAt).toBeNull();

      // forceRequested: create as "requested" up front instead of auto-approving.
      const forcedRequested = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${administerToken}`)
        .send({
          borrowerName: 'Administer Forced Requested',
          ...borrowerFields,
          forceRequested: true,
          items: [{ inventoryItemId: itemTwo.id }],
        })
        .expect(201);
      expect(forcedRequested.body.status).toBe('requested');
    });

    it('rejects a loans.manage holder creating a loan with items outside their organization/unit scope', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${managerBToken}`)
        .send({
          borrowerName: 'Cross-Org Attempt',
          ...borrowerFields,
          items: [{ inventoryItemId: itemA.id }],
        })
        .expect(403);
    });

    it("lets the loan's creator edit it with only loans.create, and lets loans.manage edit any loan unconditionally", async () => {
      // Own item (not the shared itemA) so this test's lingering "requested"
      // loan doesn't block itemA's date range for later tests in this block.
      const editArticle = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Editable Loan Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const editLocation = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Editable Loan Location' })
          .expect(201)
      ).body;
      const editRoom = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Editable Loan Room', locationId: editLocation.id })
          .expect(201)
      ).body;
      const editItem = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            articleId: editArticle.id,
            locationId: editLocation.id,
            roomId: editRoom.id,
            ownerOrganizationId: orgA.id,
            ownerUnitId: unitA.id,
          })
          .expect(201)
      ).body;

      const created = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          borrowerName: 'Editable Loan',
          ...borrowerFields,
          items: [{ inventoryItemId: editItem.id }],
        })
        .expect(201);
      const loanId = created.body.id;

      // Creator (bare loans.create) may edit their own loan.
      await request(app.getHttpServer())
        .put(`/api/v1/loans/${loanId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ notes: 'Von Ersteller bearbeitet' })
        .expect(200);

      // A *different* bare loans.create holder may not.
      const otherRequester = (
        await request(app.getHttpServer())
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'other-requester@example.com',
            displayName: 'Other Requester',
            password: 'WorkflowPass123!',
          })
          .expect(201)
      ).body;
      const roles = (
        await request(app.getHttpServer())
          .get('/api/v1/roles')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
      ).body;
      const requesterRole = roles.find(
        (r: { name: string }) => r.name === 'Workflow Requester',
      );
      await request(app.getHttpServer())
        .post(`/api/v1/users/${otherRequester.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: requesterRole.id })
        .expect(201);
      const otherRequesterLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'other-requester@example.com',
          password: 'WorkflowPass123!',
        })
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/v1/loans/${loanId}`)
        .set('Authorization', `Bearer ${otherRequesterLogin.body.accessToken}`)
        .send({ notes: 'Sollte fehlschlagen' })
        .expect(403);

      // loans.manage may edit it too, even though managerB is scoped to a
      // different organization than the loan's item.
      await request(app.getHttpServer())
        .put(`/api/v1/loans/${loanId}`)
        .set('Authorization', `Bearer ${managerBToken}`)
        .send({ notes: 'Von Manager (andere Organisation) bearbeitet' })
        .expect(200);
    });

    it('resets an approved loan back to "requested" (and clears item approval) when edited', async () => {
      // Own item (not the shared itemA) so this test's lingering "requested"
      // loan doesn't block itemA's date range for later tests in this block.
      const resetArticle = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Reset On Edit Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const resetLocation = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Reset On Edit Location' })
          .expect(201)
      ).body;
      const resetRoom = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Reset On Edit Room', locationId: resetLocation.id })
          .expect(201)
      ).body;
      const resetItem = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            articleId: resetArticle.id,
            locationId: resetLocation.id,
            roomId: resetRoom.id,
            ownerOrganizationId: orgA.id,
            ownerUnitId: unitA.id,
          })
          .expect(201)
      ).body;

      const created = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          borrowerName: 'Reset On Edit',
          ...borrowerFields,
          items: [{ inventoryItemId: resetItem.id }],
        })
        .expect(201);
      const loanId = created.body.id;

      const approved = await request(app.getHttpServer())
        .post(`/api/v1/loans/${loanId}/approve`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({})
        .expect(201);
      expect(approved.body.status).toBe('approved');

      const edited = await request(app.getHttpServer())
        .put(`/api/v1/loans/${loanId}`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({ notes: 'Nachträglich geändert' })
        .expect(200);
      expect(edited.body.status).toBe('requested');
      expect(edited.body.items[0].approvedAt).toBeNull();
    });

    it('prevents double-booking the same item for overlapping future date ranges', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${administerToken}`)
        .send({
          borrowerName: 'Future Borrower 1',
          ...borrowerFields,
          checkoutDate: '2030-01-10T00:00:00.000Z',
          dueDate: '2030-01-20T00:00:00.000Z',
          items: [{ inventoryItemId: itemA.id }],
        })
        .expect(201);
      expect(first.body.status).toBe('approved');

      // Overlaps [2030-01-10, 2030-01-20]
      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${administerToken}`)
        .send({
          borrowerName: 'Future Borrower 2 (conflict)',
          ...borrowerFields,
          checkoutDate: '2030-01-15T00:00:00.000Z',
          dueDate: '2030-01-25T00:00:00.000Z',
          items: [{ inventoryItemId: itemA.id }],
        })
        .expect(400);

      // Does not overlap -- starts after the first loan's due date.
      const nonConflicting = await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${administerToken}`)
        .send({
          borrowerName: 'Future Borrower 3 (no conflict)',
          ...borrowerFields,
          checkoutDate: '2030-01-21T00:00:00.000Z',
          dueDate: '2030-01-25T00:00:00.000Z',
          items: [{ inventoryItemId: itemA.id }],
        })
        .expect(201);
      expect(nonConflicting.body.status).toBe('approved');
    });

    it('validates, lists and removes organization-scopes on a group', async () => {
      const scopeGroup = (
        await request(app.getHttpServer())
          .post('/api/v1/groups')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'Scope Validation Group' })
          .expect(201)
      ).body;

      await request(app.getHttpServer())
        .post(`/api/v1/groups/${scopeGroup.id}/organization-scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ organizationId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);

      // A unit that exists, but not under this organization.
      await request(app.getHttpServer())
        .post(`/api/v1/groups/${scopeGroup.id}/organization-scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ organizationId: orgB.id, organizationUnitId: unitA.id })
        .expect(404);

      const scope = (
        await request(app.getHttpServer())
          .post(`/api/v1/groups/${scopeGroup.id}/organization-scopes`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ organizationId: orgA.id, organizationUnitId: unitA.id })
          .expect(201)
      ).body;

      const listed = await request(app.getHttpServer())
        .get(`/api/v1/groups/${scopeGroup.id}/organization-scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0].organizationUnit.id).toBe(unitA.id);

      // Gated behind groups.manage, not just any authenticated user.
      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(
          `/api/v1/groups/${scopeGroup.id}/organization-scopes/${scope.id}`,
        )
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .delete(
          `/api/v1/groups/${scopeGroup.id}/organization-scopes/${scope.id}`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const afterRemoval = await request(app.getHttpServer())
        .get(`/api/v1/groups/${scopeGroup.id}/organization-scopes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(afterRemoval.body).toHaveLength(0);
    });
  });

  describe('attachments', () => {
    let token: string;
    let inventoryItemId: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;

      const org = (
        await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Attachment Org' })
          .expect(201)
      ).body;
      const unit = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${org.id}/units`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Attachment Unit' })
          .expect(201)
      ).body;
      const location = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Attachment Location' })
          .expect(201)
      ).body;
      const room = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Attachment Room', locationId: location.id })
          .expect(201)
      ).body;
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Attachment Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      inventoryItemId = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${token}`)
          .send({
            articleId: article.id,
            locationId: location.id,
            roomId: room.id,
            ownerOrganizationId: org.id,
            ownerUnitId: unit.id,
          })
          .expect(201)
      ).body.id;
    });

    it('uploads, lists, downloads, and deletes a document attached to an inventory item', async () => {
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/attachments/inventoryItem/${inventoryItemId}`)
        .set('Authorization', `Bearer ${token}`)
        .field('category', 'document')
        .attach('file', Buffer.from('Betriebsanleitung Inhalt'), 'manual.pdf')
        .expect(201);
      expect(upload.body.fileName).toBe('manual.pdf');
      expect(upload.body.category).toBe('document');

      const list = await request(app.getHttpServer())
        .get(
          `/api/v1/attachments?entityType=inventoryItem&entityId=${inventoryItemId}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(list.body).toHaveLength(1);

      const download = await request(app.getHttpServer())
        .get(`/api/v1/attachments/${upload.body.id}/download`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Buffer.from(download.body).toString('utf8')).toBe(
        'Betriebsanleitung Inhalt',
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/attachments/${upload.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const listAfterDelete = await request(app.getHttpServer())
        .get(
          `/api/v1/attachments?entityType=inventoryItem&entityId=${inventoryItemId}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listAfterDelete.body).toHaveLength(0);
    });

    it('keeps inspection documents in a separate category from general documents', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/attachments/inventoryItem/${inventoryItemId}`)
        .set('Authorization', `Bearer ${token}`)
        .field('category', 'inspection')
        .attach('file', Buffer.from('E-Check Protokoll'), 'e-check.pdf')
        .expect(201);

      const documents = await request(app.getHttpServer())
        .get(
          `/api/v1/attachments?entityType=inventoryItem&entityId=${inventoryItemId}&category=document`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const inspections = await request(app.getHttpServer())
        .get(
          `/api/v1/attachments?entityType=inventoryItem&entityId=${inventoryItemId}&category=inspection`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(documents.body).toHaveLength(0);
      expect(inspections.body).toHaveLength(1);
    });

    it('refuses a view-only user permission to upload but allows download', async () => {
      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/attachments/inventoryItem/${inventoryItemId}`)
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .field('category', 'document')
        .attach('file', Buffer.from('nope'), 'nope.txt')
        .expect(403);
    });
  });

  describe('general settings (name/logo/login methods)', () => {
    it('GET /settings/general is public (no auth needed)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/settings/general')
        .expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          displayName: expect.any(String),
          churchToolsEnabled: expect.any(Boolean),
          passkeyEnabled: expect.any(Boolean),
          churchToolsAvailable: expect.any(Boolean),
          passkeyAvailable: expect.any(Boolean),
        }),
      );
    });

    it('gates updates behind settings.manage', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .put('/api/v1/settings/general')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ displayName: 'Should not work' })
        .expect(403);
    });

    it('lets an admin update the display name and toggle login methods, reflected publicly', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const token = login.body.accessToken;

      const updated = await request(app.getHttpServer())
        .put('/api/v1/settings/general')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Mein Inventarsystem',
          churchToolsEnabled: false,
          passkeyEnabled: false,
        })
        .expect(200);
      expect(updated.body.displayName).toBe('Mein Inventarsystem');

      const publicConfig = await request(app.getHttpServer())
        .get('/api/v1/settings/general')
        .expect(200);
      expect(publicConfig.body.displayName).toBe('Mein Inventarsystem');
      // Disabled -> unavailable regardless of env-level ChurchTools config.
      expect(publicConfig.body.churchToolsAvailable).toBe(false);
      expect(publicConfig.body.passkeyAvailable).toBe(false);

      // Restore defaults so later tests (and other suites) aren't affected.
      await request(app.getHttpServer())
        .put('/api/v1/settings/general')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Inventarsystem',
          churchToolsEnabled: true,
          passkeyEnabled: true,
        })
        .expect(200);
    });

    it('rejects a disallowed logo mime type, and lets an admin upload/remove one', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const token = login.body.accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/settings/general/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('not-an-image'), {
          filename: 'file.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      const uploaded = await request(app.getHttpServer())
        .post('/api/v1/settings/general/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('fake-png-bytes'), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(uploaded.body.logoDataUrl).toMatch(/^data:image\/png;base64,/);

      const publicConfig = await request(app.getHttpServer())
        .get('/api/v1/settings/general')
        .expect(200);
      expect(publicConfig.body.logoDataUrl).toMatch(/^data:image\/png;base64,/);

      await request(app.getHttpServer())
        .delete('/api/v1/settings/general/logo')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const afterRemoval = await request(app.getHttpServer())
        .get('/api/v1/settings/general')
        .expect(200);
      expect(afterRemoval.body.logoDataUrl).toBeNull();
    });
  });

  describe('dark mode preference', () => {
    it('defaults to "system" and can be updated by the user themselves', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const token = login.body.accessToken;

      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.themePreference).toBe('system');

      const updated = await request(app.getHttpServer())
        .put('/api/v1/auth/theme')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark' })
        .expect(200);
      expect(updated.body.themePreference).toBe('dark');

      const meAfter = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(meAfter.body.themePreference).toBe('dark');

      // Restore default so other tests relying on admin state aren't affected.
      await request(app.getHttpServer())
        .put('/api/v1/auth/theme')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'system' })
        .expect(200);
    });

    it('rejects an invalid theme value', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .put('/api/v1/auth/theme')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ theme: 'purple' })
        .expect(400);
    });
  });

  describe('backup configuration', () => {
    it('gates backup config behind settings.manage', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .get('/api/v1/backup/config')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('allows an admin to read and update the backup configuration', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const token = login.body.accessToken;

      const initial = await request(app.getHttpServer())
        .get('/api/v1/backup/config')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(initial.body.enabled).toBe(false);
      expect(initial.body.sftpPasswordSet).toBe(false);

      const updated = await request(app.getHttpServer())
        .put('/api/v1/backup/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enabled: true,
          frequency: 'daily',
          destinationType: 'sftp',
          sftpHost: 'backup.example.com',
          sftpPort: 22,
          sftpUsername: 'backup-user',
          sftpPassword: 'super-secret-password',
          sftpRemotePath: '/backups',
        })
        .expect(200);
      expect(updated.body.enabled).toBe(true);
      expect(updated.body.frequency).toBe('daily');
      // The plaintext password must never be echoed back.
      expect(updated.body).not.toHaveProperty('sftpPassword');
      expect(updated.body).not.toHaveProperty('sftpPasswordEnc');
      expect(updated.body.sftpPasswordSet).toBe(true);
    });
  });

  describe('email configuration', () => {
    it('gates email config behind settings.manage', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .get('/api/v1/notifications/email-config')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('allows an admin to read and update the email configuration', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const token = login.body.accessToken;

      const initial = await request(app.getHttpServer())
        .get('/api/v1/notifications/email-config')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(initial.body.enabled).toBe(false);
      expect(initial.body.passwordSet).toBe(false);

      const updated = await request(app.getHttpServer())
        .put('/api/v1/notifications/email-config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          enabled: true,
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          username: 'notify@example.com',
          password: 'super-secret-password',
          fromAddress: 'notify@example.com',
          fromName: 'Inventarsystem',
        })
        .expect(200);
      expect(updated.body.enabled).toBe(true);
      expect(updated.body.host).toBe('smtp.example.com');
      // The plaintext password must never be echoed back.
      expect(updated.body).not.toHaveProperty('password');
      expect(updated.body).not.toHaveProperty('passwordEnc');
      expect(updated.body.passwordSet).toBe(true);
    });
  });

  describe('notification preferences', () => {
    it('only lists events the current user is eligible for', async () => {
      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      const viewerList = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .expect(200);
      expect(viewerList.body).toEqual([]);

      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const adminList = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
        .expect(200);
      expect(adminList.body.map((e: { key: string }) => e.key)).toEqual(
        expect.arrayContaining([
          'loan.requested',
          'loan.approved',
          'loan.issued',
          'loan.returned',
          'backup.failed',
        ]),
      );
      // Events are opt-out, not opt-in: eligible events default to enabled
      // so notifications actually go out without every user first having to
      // discover and visit this settings page.
      expect(
        adminList.body.every((e: { enabled: boolean }) => e.enabled === true),
      ).toBe(true);
    });

    it('toggles a preference the user is eligible for, and ignores one they are not', async () => {
      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      const token = adminLogin.body.accessToken;

      const disabled = await request(app.getHttpServer())
        .put('/api/v1/notifications/preferences/loan.requested')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false })
        .expect(200);
      expect(
        disabled.body.find((e: { key: string }) => e.key === 'loan.requested')
          .enabled,
      ).toBe(false);

      const enabled = await request(app.getHttpServer())
        .put('/api/v1/notifications/preferences/loan.requested')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true })
        .expect(200);
      expect(
        enabled.body.find((e: { key: string }) => e.key === 'loan.requested')
          .enabled,
      ).toBe(true);

      const viewerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      const viewerAttempt = await request(app.getHttpServer())
        .put('/api/v1/notifications/preferences/loan.requested')
        .set('Authorization', `Bearer ${viewerLogin.body.accessToken}`)
        .send({ enabled: false })
        .expect(200);
      // Viewer has none of the required permissions, so the toggle is silently ignored.
      expect(viewerAttempt.body).toEqual([]);
    });

    it('actually delivers an event email to an eligible user with no preference row (regression: opt-in default sent to nobody)', async () => {
      // No PUT to /notifications/preferences/backup.failed here on purpose -
      // this checks the zero-configuration default, not an opt-in toggle.
      // Email config was already enabled with a real host/fromAddress by the
      // 'email configuration' tests above.
      const sendMail = jest.fn().mockResolvedValue(undefined);
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      await app.get(EmailService).notifyEvent('backup.failed', 'Test', 'Body');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@example.com' }),
      );
    });
  });

  describe('forgot password / reset password (unauthenticated)', () => {
    // Relies on email already being enabled with a real host/fromAddress,
    // set up by the 'email configuration' tests above.
    let adminToken: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      adminToken = login.body.accessToken;
    });

    it('reports password-reset availability based on whether email is configured', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/password-reset-available')
        .expect(200);
      expect(res.body).toEqual({ available: true });
    });

    it('always returns 204 for forgot-password, whether or not the address is known (no enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'no-such-user@example.com' })
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'admin@example.com' })
        .expect(204);
    });

    it('completes a full reset: emails a working link, the token is single-use, and other sessions are revoked', async () => {
      const user = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'forgotpw@example.com',
          displayName: 'Forgot PW',
          password: 'OriginalPass123!',
        })
        .expect(201);
      void user;

      const loginBefore = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'forgotpw@example.com', password: 'OriginalPass123!' })
        .expect(201);
      const refreshTokenBefore = loginBefore.body.refreshToken;

      const sendMail = jest.fn().mockResolvedValue(undefined);
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'forgotpw@example.com' })
        .expect(204);

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'forgotpw@example.com' }),
      );
      const emailText: string = sendMail.mock.calls[0][0].text;
      const match = /reset-password\?token=([\w-]+)/.exec(emailText);
      const token = match?.[1];
      expect(token).toBeTruthy();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          newPassword: 'BrandNewPass123!',
          newPasswordConfirmation: 'DOES-NOT-MATCH!',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          newPassword: 'BrandNewPass123!',
          newPasswordConfirmation: 'BrandNewPass123!',
        })
        .expect(204);

      // Single-use: the same token cannot be replayed.
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          newPassword: 'AnotherPass123!',
          newPasswordConfirmation: 'AnotherPass123!',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'forgotpw@example.com', password: 'OriginalPass123!' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'forgotpw@example.com', password: 'BrandNewPass123!' })
        .expect(201);

      // The reset revoked pre-existing sessions.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenBefore })
        .expect(401);
    });

    it('rejects an unknown or garbage token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'not-a-real-token',
          newPassword: 'SomePass123!',
          newPasswordConfirmation: 'SomePass123!',
        })
        .expect(400);
    });
  });

  describe('loan blackout periods', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('gates blackout periods behind loans.administer', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .get('/api/v1/loans/blackout-periods')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('rejects an endDate before startDate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/loans/blackout-periods')
        .set('Authorization', `Bearer ${token}`)
        .send({ startDate: '2026-09-10', endDate: '2026-09-01' })
        .expect(400);
    });

    it('creates, lists, blocks overlapping loans, then deletes a blackout period', async () => {
      const org = (
        await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Blackout Org' })
          .expect(201)
      ).body;
      const unit = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${org.id}/units`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Blackout Unit' })
          .expect(201)
      ).body;
      const location = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Blackout Location' })
          .expect(201)
      ).body;
      const room = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Blackout Room', locationId: location.id })
          .expect(201)
      ).body;
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Blackout Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const item = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${token}`)
          .send({
            articleId: article.id,
            locationId: location.id,
            roomId: room.id,
            ownerOrganizationId: org.id,
            ownerUnitId: unit.id,
          })
          .expect(201)
      ).body;

      const period = await request(app.getHttpServer())
        .post('/api/v1/loans/blackout-periods')
        .set('Authorization', `Bearer ${token}`)
        .send({
          startDate: '2026-09-01',
          endDate: '2026-09-10',
          reason: 'Umbau',
        })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/v1/loans/blackout-periods')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        list.body.some((p: { id: string }) => p.id === period.body.id),
      ).toBe(true);

      // A loans.administer actor is blocked too -- blackout periods are absolute.
      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          borrowerName: 'Blackout Borrower',
          ...LOAN_BORROWER_FIELDS,
          checkoutDate: '2026-09-05T00:00:00.000Z',
          items: [{ inventoryItemId: item.id }],
        })
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/api/v1/loans/blackout-periods/${period.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      // Once removed, the same period books normally again.
      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          borrowerName: 'Blackout Borrower',
          ...LOAN_BORROWER_FIELDS,
          checkoutDate: '2026-09-05T00:00:00.000Z',
          items: [{ inventoryItemId: item.id }],
        })
        .expect(201);
    });
  });

  describe('loan templates', () => {
    let token: string;
    let articleId: string;
    let orgId: string;
    let unitId: string;
    let locationId: string;
    let roomId: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;

      articleId = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Template Article', type: 'UNIQUE' })
          .expect(201)
      ).body.id;

      orgId = (
        await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Template Org' })
          .expect(201)
      ).body.id;
      unitId = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgId}/units`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Template Unit' })
          .expect(201)
      ).body.id;
      locationId = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Template Location' })
          .expect(201)
      ).body.id;
      roomId = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Template Room', locationId })
          .expect(201)
      ).body.id;
    });

    it('gates loan templates behind loans.administer', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'ViewerPass123!' })
        .expect(201);
      await request(app.getHttpServer())
        .get('/api/v1/loans/templates')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    it('creates, reads, lists, and deletes a template', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/loans/templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sonntagsgottesdienst',
          items: [{ articleId, quantity: 2 }],
        })
        .expect(201);
      expect(created.body.items).toHaveLength(1);
      expect(created.body.items[0].quantity).toBe(2);

      const fetched = await request(app.getHttpServer())
        .get(`/api/v1/loans/templates/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(fetched.body.name).toBe('Sonntagsgottesdienst');

      const list = await request(app.getHttpServer())
        .get('/api/v1/loans/templates')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        list.body.some((t: { id: string }) => t.id === created.body.id),
      ).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/v1/loans/templates/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/loans/templates/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('saves a template alongside a loan when saveAsTemplate is given', async () => {
      const item = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${token}`)
          .send({
            articleId,
            locationId,
            roomId,
            ownerOrganizationId: orgId,
            ownerUnitId: unitId,
          })
          .expect(201)
      ).body;

      await request(app.getHttpServer())
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({
          borrowerName: 'Save As Template Borrower',
          ...LOAN_BORROWER_FIELDS,
          items: [{ inventoryItemId: item.id }],
          saveAsTemplate: { name: 'Aus Ausleihe gespeichert' },
        })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/v1/loans/templates')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        list.body.some(
          (t: { name: string }) => t.name === 'Aus Ausleihe gespeichert',
        ),
      ).toBe(true);
    });
  });

  describe('inventory category filter and last-loan photos', () => {
    let token: string;
    let orgId: string;
    let unitId: string;
    let locationId: string;
    let roomId: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;

      orgId = (
        await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Category Filter Org' })
          .expect(201)
      ).body.id;
      unitId = (
        await request(app.getHttpServer())
          .post(`/api/v1/organizations/${orgId}/units`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Category Filter Unit' })
          .expect(201)
      ).body.id;
      locationId = (
        await request(app.getHttpServer())
          .post('/api/v1/locations')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Category Filter Location' })
          .expect(201)
      ).body.id;
      roomId = (
        await request(app.getHttpServer())
          .post('/api/v1/rooms')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Category Filter Room', locationId })
          .expect(201)
      ).body.id;
    });

    it('filters and searches inventory by article category', async () => {
      const categoryA = (
        await request(app.getHttpServer())
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Kabel & Leitungen' })
          .expect(201)
      ).body;
      const categoryB = (
        await request(app.getHttpServer())
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Mikrofone' })
          .expect(201)
      ).body;
      const articleA = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'XLR Kabel 10m',
            type: 'UNIQUE',
            categoryId: categoryA.id,
          })
          .expect(201)
      ).body;
      const articleB = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Handmikrofon',
            type: 'UNIQUE',
            categoryId: categoryB.id,
          })
          .expect(201)
      ).body;
      await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: articleA.id,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({
          articleId: articleB.id,
          locationId,
          roomId,
          ownerOrganizationId: orgId,
          ownerUnitId: unitId,
        })
        .expect(201);

      const byCategory = await request(app.getHttpServer())
        .get(`/api/v1/inventory?categoryId=${categoryA.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        byCategory.body.data.every(
          (i: { articleId: string }) => i.articleId === articleA.id,
        ),
      ).toBe(true);
      expect(byCategory.body.data.length).toBeGreaterThanOrEqual(1);

      const bySearch = await request(app.getHttpServer())
        .get('/api/v1/inventory?search=Mikrofone')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        bySearch.body.data.some(
          (i: { articleId: string }) => i.articleId === articleB.id,
        ),
      ).toBe(true);
    });

    it('the removed last-loan-photos endpoint is gone (superseded by movements)', async () => {
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Removed Endpoint Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const item = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${token}`)
          .send({
            articleId: article.id,
            locationId,
            roomId,
            ownerOrganizationId: orgId,
            ownerUnitId: unitId,
          })
          .expect(201)
      ).body;

      await request(app.getHttpServer())
        .get(`/api/v1/inventory/${item.id}/last-loan-photos`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('links a movement to its loan item, with the checkout photo attached to that loan item', async () => {
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Movement Link Article', type: 'UNIQUE' })
          .expect(201)
      ).body;
      const item = (
        await request(app.getHttpServer())
          .post('/api/v1/inventory')
          .set('Authorization', `Bearer ${token}`)
          .send({
            articleId: article.id,
            locationId,
            roomId,
            ownerOrganizationId: orgId,
            ownerUnitId: unitId,
          })
          .expect(201)
      ).body;

      // admin holds loans.administer -> auto-approved, then issue it to
      // generate the stock movement that should link back to this loan item.
      const loan = (
        await request(app.getHttpServer())
          .post('/api/v1/loans')
          .set('Authorization', `Bearer ${token}`)
          .send({
            borrowerName: 'Movement Link Borrower',
            ...LOAN_BORROWER_FIELDS,
            items: [{ inventoryItemId: item.id }],
          })
          .expect(201)
      ).body;
      const loanItemId = loan.items[0].id;

      await request(app.getHttpServer())
        .post(`/api/v1/attachments/loanItem/${loanItemId}`)
        .set('Authorization', `Bearer ${token}`)
        .field('category', 'checkoutPhoto')
        .attach('file', Buffer.from('fake-jpeg-bytes'), 'checkout.jpg')
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/loans/${loan.id}/issue`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const issueMovement = movements.body.find(
        (m: { loanItem: { id: string } | null }) =>
          m.loanItem?.id === loanItemId,
      );
      expect(issueMovement).toBeDefined();
      expect(issueMovement.loanItem.loanId).toBe(loan.id);

      const photos = await request(app.getHttpServer())
        .get(
          `/api/v1/attachments?entityType=loanItem&entityId=${loanItemId}&category=checkoutPhoto`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(photos.body).toHaveLength(1);
    });
  });

  describe('article search', () => {
    let token: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' })
        .expect(201);
      token = login.body.accessToken;
    });

    it('searches articles by name, manufacturer and category name, and combines with the type filter', async () => {
      const category = (
        await request(app.getHttpServer())
          .post('/api/v1/categories')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Funkmikrofone' })
          .expect(201)
      ).body;
      const article = (
        await request(app.getHttpServer())
          .post('/api/v1/articles')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Drahtlosmikrofon Set',
            type: 'UNIQUE',
            manufacturer: 'Sennheiser',
            categoryId: category.id,
          })
          .expect(201)
      ).body;

      const byName = await request(app.getHttpServer())
        .get('/api/v1/articles?search=Drahtlosmikrofon')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        byName.body.data.some((a: { id: string }) => a.id === article.id),
      ).toBe(true);

      const byManufacturer = await request(app.getHttpServer())
        .get('/api/v1/articles?search=Sennheiser')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        byManufacturer.body.data.some(
          (a: { id: string }) => a.id === article.id,
        ),
      ).toBe(true);

      const byCategoryName = await request(app.getHttpServer())
        .get('/api/v1/articles?search=Funkmikrofone')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        byCategoryName.body.data.some(
          (a: { id: string }) => a.id === article.id,
        ),
      ).toBe(true);

      const noMatch = await request(app.getHttpServer())
        .get('/api/v1/articles?search=Drahtlosmikrofon&type=CONSUMABLE')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        noMatch.body.data.some((a: { id: string }) => a.id === article.id),
      ).toBe(false);
    });
  });
});

async function resetDatabase(prisma: PrismaService) {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.backupConfig.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.emailConfig.deleteMany(),
    prisma.loanTemplateItem.deleteMany(),
    prisma.loanTemplate.deleteMany(),
    prisma.loanBlackoutPeriod.deleteMany(),
    prisma.loanItem.deleteMany(),
    prisma.loan.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.article.deleteMany(),
    prisma.category.deleteMany(),
    prisma.room.deleteMany(),
    prisma.location.deleteMany(),
    prisma.organizationUnit.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.groupRole.deleteMany(),
    prisma.userGroup.deleteMany(),
    prisma.group.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.authIdentity.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function seedBaseline(prisma: PrismaService) {
  const permissionRecords = await Promise.all(
    ALL_PERMISSIONS.map((p) => prisma.permission.create({ data: p })),
  );

  const adminRole = await prisma.role.create({
    data: {
      name: 'Admin',
      rolePermissions: {
        create: permissionRecords.map((p) => ({ permissionId: p.id })),
      },
    },
  });

  const viewerRole = await prisma.role.create({
    data: {
      name: 'Betrachter',
      rolePermissions: {
        create: permissionRecords
          .filter((p) => p.key === 'inventory.view')
          .map((p) => ({ permissionId: p.id })),
      },
    },
  });

  await prisma.user.create({
    data: {
      email: 'admin@example.com',
      displayName: 'E2E Admin',
      authIdentities: {
        create: {
          provider: 'local',
          providerSubject: 'admin@example.com',
          passwordHash: await argon2.hash('AdminPass123!'),
        },
      },
      userRoles: { create: { roleId: adminRole.id } },
    },
  });

  await prisma.user.create({
    data: {
      email: 'viewer@example.com',
      displayName: 'E2E Viewer',
      authIdentities: {
        create: {
          provider: 'local',
          providerSubject: 'viewer@example.com',
          passwordHash: await argon2.hash('ViewerPass123!'),
        },
      },
      userRoles: { create: { roleId: viewerRole.id } },
    },
  });
}
