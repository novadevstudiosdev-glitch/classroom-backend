import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TS = Date.now();
const TEACHER_EMAIL = `e2e.teacher.exercises.${TS}@test.com`;
const TEACHER_PASSWORD = 'Test1234!';

describe('Exercises (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let lessonId: string;
  let exerciseId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Setup: registrar, verificar y loguear docente
    await request(app.getHttpServer())
      .post('/auth/register/teacher')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD, first_name: 'Test', last_name: 'Ejercicios', country: 'AR', recaptcha_token: 'test-token' });

    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token: verToken });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
    token = loginRes.body.data.access_token;

    // Crear lección base para los ejercicios
    const lessonRes = await request(app.getHttpServer())
      .post('/lessons')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lección para ejercicios e2e' });
    lessonId = lessonRes.body.data.id;
  });

  afterAll(async () => {
    await cleanupUsers(app, [TEACHER_EMAIL]);
    await app.close();
  });

  // ─── MULTIPLE CHOICE ─────────────────────────────────

  it('POST /exercises → 201 tipo multiple_choice', async () => {
    const res = await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'multiple_choice',
        title: '¿Cuánto es 2+2?',
        order: 0,
        config_json: {
          question: '¿Cuánto es 2+2?',
          options: ['2', '3', '4', '5'],
          correct_index: 2,
        },
      })
      .expect(201);

    expect(res.body.data.type).toBe('multiple_choice');
    exerciseId = res.body.data.id;
  });

  // ─── FILL BLANK ──────────────────────────────────────

  it('POST /exercises → 201 tipo fill_blank', async () => {
    const res = await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'fill_blank',
        title: 'Completar los blancos',
        order: 1,
        config_json: {
          text_with_blanks: 'El cielo es ___ y el sol es ___.',
          answers: ['azul', 'amarillo'],
        },
      })
      .expect(201);

    expect(res.body.data.type).toBe('fill_blank');
  });

  // ─── TRUE FALSE ──────────────────────────────────────

  it('POST /exercises → 201 tipo true_false', async () => {
    const res = await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'true_false',
        title: 'Verdadero o Falso',
        order: 2,
        config_json: {
          statement: 'La Tierra es plana.',
          correct_answer: false,
        },
      })
      .expect(201);

    expect(res.body.data.type).toBe('true_false');
  });

  // ─── MATCH COLUMNS ───────────────────────────────────

  it('POST /exercises → 201 tipo match_columns', async () => {
    const res = await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'match_columns',
        title: 'Unir columnas',
        order: 3,
        config_json: {
          pairs: [
            { left: 'Perro', right: 'Dog' },
            { left: 'Gato', right: 'Cat' },
          ],
        },
      })
      .expect(201);

    expect(res.body.data.type).toBe('match_columns');
  });

  // ─── ORDER ITEMS ─────────────────────────────────────

  it('POST /exercises → 201 tipo order_items', async () => {
    const res = await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'order_items',
        title: 'Ordenar pasos',
        order: 4,
        config_json: {
          items: ['Paso 1', 'Paso 2', 'Paso 3'],
          instruction: 'Ordená los pasos.',
        },
      })
      .expect(201);

    expect(res.body.data.type).toBe('order_items');
  });

  // ─── VALIDACIÓN CONFIG_JSON ───────────────────────────

  it('POST /exercises → 400 config_json inválido para el tipo', async () => {
    await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'multiple_choice',
        title: 'Config inválida',
        config_json: {
          // Falta question, options, correct_index
          algo: 'invalido',
        },
      })
      .expect(400);
  });

  it('POST /exercises → 400 tipo inválido', async () => {
    await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'tipo_inexistente',
        title: 'Tipo inválido',
        config_json: {},
      })
      .expect(400);
  });

  it('POST /exercises → 400 match_columns con menos de 2 pares', async () => {
    await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: lessonId,
        type: 'match_columns',
        title: 'Pocos pares',
        config_json: {
          pairs: [{ left: 'Solo', right: 'One' }],
        },
      })
      .expect(400);
  });

  it('POST /exercises → 404 lesson_id inexistente', async () => {
    await request(app.getHttpServer())
      .post('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lesson_id: '00000000-0000-0000-0000-000000000000',
        type: 'true_false',
        title: 'Sin lección',
        config_json: { statement: 'Test', correct_answer: true },
      })
      .expect(404);
  });

  // ─── GET ONE ──────────────────────────────────────────

  it('GET /exercises/:id → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe(exerciseId);
    expect(res.body.data).toHaveProperty('content_json');
  });

  it('GET /exercises/:id → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .get('/exercises/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ─── UPDATE ───────────────────────────────────────────

  it('PATCH /exercises/:id → 200 actualiza título', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ejercicio actualizado' })
      .expect(200);

    expect(res.body.data.title).toBe('Ejercicio actualizado');
  });

  it('PATCH /exercises/:id → 200 actualiza config_json', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        config_json: {
          question: '¿Cuántos continentes hay?',
          options: ['5', '6', '7', '8'],
          correct_index: 2,
        },
      })
      .expect(200);

    expect(res.body.data.content_json.question).toBe('¿Cuántos continentes hay?');
  });

  it('PATCH /exercises/:id → 400 config_json inválido en update', async () => {
    await request(app.getHttpServer())
      .patch(`/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        config_json: { invalido: true },
      })
      .expect(400);
  });

  // ─── DELETE ───────────────────────────────────────────

  it('DELETE /exercises/:id → 200', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.message).toBeDefined();
  });

  it('GET /exercises/:id → 404 después de eliminado', async () => {
    await request(app.getHttpServer())
      .get(`/exercises/${exerciseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
