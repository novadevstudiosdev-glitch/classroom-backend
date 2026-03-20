import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { RecaptchaGuard } from '../../src/modules/auth/guards/recaptcha.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EmailService } from '../../src/modules/email/email.service';

const mockEmailService = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendParentLinkConfirmation: jest.fn().mockResolvedValue(undefined),
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(RecaptchaGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideProvider(EmailService)
    .useValue(mockEmailService)
    .compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();
  return app;
}

export async function cleanupUsers(app: INestApplication, emails: string[]) {
  if (emails.length === 0) return;
  const ds = app.get(DataSource);

  // Castear todo a text::[] para evitar incompatibilidades uuid vs varchar en Supabase
  const txt = (v: string[]) => v; // ya son strings

  const userRows = await ds.query(
    `SELECT id::text as id FROM users WHERE email = ANY($1::text[])`,
    [emails],
  );
  const userIds: string[] = userRows.map((r: any) => r.id);
  if (!userIds.length) return;

  const teacherRows = await ds.query(
    `SELECT id::text as id FROM teacher_profiles WHERE user_id::text = ANY($1::text[])`,
    [userIds],
  );
  const teacherIds: string[] = teacherRows.map((r: any) => r.id);

  const studentRows = await ds.query(
    `SELECT id::text as id FROM student_profiles WHERE user_id::text = ANY($1::text[])`,
    [userIds],
  );
  const studentIds: string[] = studentRows.map((r: any) => r.id);

  const parentRows = await ds.query(
    `SELECT id::text as id FROM parent_profiles WHERE user_id::text = ANY($1::text[])`,
    [userIds],
  );
  const parentIds: string[] = parentRows.map((r: any) => r.id);

  // Eliminar en orden (respetar FK)
  if (parentIds.length) {
    await ds.query(
      `DELETE FROM parent_students WHERE parent_id::text = ANY($1::text[])`,
      [parentIds],
    );
  }

  if (studentIds.length) {
    await ds.query(
      `DELETE FROM classroom_students WHERE student_id::text = ANY($1::text[])`,
      [studentIds],
    );
  }

  if (teacherIds.length) {
    const classroomRows = await ds.query(
      `SELECT id::text as id FROM classrooms WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
    const classroomIds: string[] = classroomRows.map((r: any) => r.id);

    if (classroomIds.length) {
      await ds.query(
        `DELETE FROM lesson_assignments WHERE classroom_id::text = ANY($1::text[])`,
        [classroomIds],
      );
    }

    const lessonRows = await ds.query(
      `SELECT id::text as id FROM lessons WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
    const lessonIds: string[] = lessonRows.map((r: any) => r.id);

    if (lessonIds.length) {
      await ds.query(
        `DELETE FROM exercises WHERE lesson_id::text = ANY($1::text[])`,
        [lessonIds],
      );
    }

    await ds.query(
      `DELETE FROM lessons WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
    await ds.query(
      `DELETE FROM classrooms WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
  }

  if (teacherIds.length)
    await ds.query(`DELETE FROM teacher_profiles WHERE id::text = ANY($1::text[])`, [teacherIds]);
  if (studentIds.length)
    await ds.query(`DELETE FROM student_profiles WHERE id::text = ANY($1::text[])`, [studentIds]);
  if (parentIds.length)
    await ds.query(`DELETE FROM parent_profiles WHERE id::text = ANY($1::text[])`, [parentIds]);

  await ds.query(`DELETE FROM users WHERE id::text = ANY($1::text[])`, [userIds]);
}

export async function getVerificationToken(app: INestApplication, email: string): Promise<string> {
  const ds = app.get(DataSource);
  const rows = await ds.query(
    `SELECT verification_token FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.verification_token;
}
