import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { RecaptchaGuard } from '../src/modules/auth/guards/recaptcha.guard';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../src/modules/auth/guards/jwt-refresh.guard';
import { GoogleOAuthGuard } from '../src/modules/auth/guards/google-oauth.guard';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const authService = {
    resendVerificationEmail: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  beforeAll(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
      ],
    });

    moduleBuilder.overrideGuard(RecaptchaGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(JwtRefreshGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(GoogleOAuthGuard).useValue({ canActivate: () => true });

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /auth/resend-verification returns 200 and calls service', async () => {
    const email = 'test@example.com';

    await request(app.getHttpServer())
      .post('/auth/resend-verification')
      .send({ email })
      .expect(200)
      .expect({ message: 'ok' });

    expect(authService.resendVerificationEmail).toHaveBeenCalledWith(email);
  });
});
