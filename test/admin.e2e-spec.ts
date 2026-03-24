import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupUsers,
  createAdminUser,
  getOrCreateMinigame,
  cleanupMinigame,
  getVerificationToken,
} from './helpers/create-app';

const TS = Date.now();
const ADMIN_EMAIL = `e2e.admin.${TS}@test.com`;
const ADMIN_PASSWORD = 'Test1234!';
const TEACHER_EMAIL = `e2e.teacher.admin.${TS}@test.com`;

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherUserId: string;
  let minigameId: string;
  let minigameCreated: boolean;
  let createdMinigameId: string | null = null;

  beforeAll(async () => {
    app = await createTestApp();

    // Crear admin directo en DB
    await createAdminUser(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = adminLogin.body.data.access_token;

    // Registrar un teacher para usarlo en tests de usuarios
    await request(app.getHttpServer())
      .post('/api/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: 'Test1234!',
        first_name: 'Teacher',
        last_name: 'Admin',
        country: 'AR',
        recaptcha_token: 'test-token',
      })
      .expect(201);

    // Verificar el email del teacher para poder loguearlo
    const teacherVerifyToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: teacherVerifyToken })
      .expect(200);

    const teacherLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEACHER_EMAIL, password: 'Test1234!' })
      .expect(200);

    // Obtener user_id del teacher desde el token
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${teacherLogin.body.data.access_token}`);
    teacherUserId = meRes.body.data.data.sub;

    const minigame = await getOrCreateMinigame(app);
    minigameId = minigame.id;
    minigameCreated = minigame.created;
  });

  afterAll(async () => {
    if (createdMinigameId) await cleanupMinigame(app, createdMinigameId);
    if (minigameCreated) await cleanupMinigame(app, minigameId);
    await cleanupUsers(app, [ADMIN_EMAIL, TEACHER_EMAIL]);
    await app.close();
  });

  // ─── STATS ────────────────────────────────────────────

  it('GET /admin/stats → 200 retorna estadísticas globales', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('users');
    expect(res.body.data).toHaveProperty('content');
    expect(res.body.data).toHaveProperty('engagement');
    expect(res.body.data.users).toHaveProperty('teachers');
    expect(res.body.data.users).toHaveProperty('students');
    expect(res.body.data.content).toHaveProperty('active_classrooms');
    expect(res.body.data.engagement).toHaveProperty('total_xp_distributed');
  });

  it('GET /admin/stats → 403 si no es admin', async () => {
    const teacherLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEACHER_EMAIL, password: 'Test1234!' });
    const teacherToken = teacherLogin.body.data.access_token;

    await request(app.getHttpServer())
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);
  });

  // ─── USERS ────────────────────────────────────────────

  it('GET /admin/users → 200 lista usuarios paginados', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('users');
    expect(res.body.data).toHaveProperty('meta');
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.meta).toHaveProperty('total');
    expect(res.body.data.meta).toHaveProperty('total_pages');
  });

  it('GET /admin/users?role=teacher → 200 filtra por rol', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?role=teacher')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.users.every((u: any) => u.role === 'teacher')).toBe(true);
  });

  it('DELETE /admin/users/:id/suspend → 200 suspende usuario', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/admin/users/${teacherUserId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.message).toBeDefined();
  });

  it('PATCH /admin/users/:id/restore → 200 restaura usuario', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/users/${teacherUserId}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.message).toBeDefined();
  });

  it('DELETE /admin/users/:id/suspend → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .delete('/api/admin/users/00000000-0000-0000-0000-000000000000/suspend')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  // ─── MINIGAMES ────────────────────────────────────────

  it('GET /admin/minigames → 200 lista todos los minijuegos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/minigames')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /admin/minigames → 201 crea minijuego', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/minigames')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `e2e-admin-minigame-${TS}`,
        title: 'Minijuego Admin E2E',
        type: 'quiz_rush',
        config_json: { duration_seconds: 30 },
      })
      .expect(201);

    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.slug).toBe(`e2e-admin-minigame-${TS}`);
    createdMinigameId = res.body.data.id;
  });

  it('POST /admin/minigames → 409 slug duplicado', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/minigames')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: `e2e-admin-minigame-${TS}`,
        title: 'Duplicado',
        type: 'quiz_rush',
      })
      .expect(409);
  });

  it('PATCH /admin/minigames/:id → 200 actualiza minijuego', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/minigames/${createdMinigameId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Minijuego Admin Actualizado' })
      .expect(200);

    expect(res.body.data.title).toBe('Minijuego Admin Actualizado');
  });

  it('PATCH /admin/minigames/:id/toggle → 200 cambia is_active', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/minigames/${createdMinigameId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('is_active');
  });

  it('DELETE /admin/minigames/:id → 200 elimina minijuego', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/admin/minigames/${createdMinigameId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.message).toBeDefined();
    createdMinigameId = null; // ya no necesita cleanup
  });

  it('DELETE /admin/minigames/:id → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .delete('/api/admin/minigames/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
