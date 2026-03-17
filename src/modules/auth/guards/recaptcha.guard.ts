import { Injectable, CanActivate, ExecutionContext, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class RecaptchaGuard implements CanActivate {
  private readonly logger = new Logger(RecaptchaGuard.name);

  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // En desarrollo, saltear la validación si no hay secret key configurada
    const secretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');
    const isDev = this.configService.get<string>('NODE_ENV') === 'development';

    if (isDev && !secretKey) {
      this.logger.warn('reCAPTCHA desactivado en desarrollo (RECAPTCHA_SECRET_KEY no configurada).');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const recaptchaToken = request.body?.recaptcha_token;

    if (!recaptchaToken) {
      throw new BadRequestException('Token de reCAPTCHA requerido.');
    }

    try {
      const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
        params: {
          secret: secretKey,
          response: recaptchaToken,
        },
      });

      const { success, score, action } = response.data;

      // Para reCAPTCHA v3: score >= 0.5 es considerado humano
      if (!success || (score !== undefined && score < 0.5)) {
        this.logger.warn(`reCAPTCHA fallido. Score: ${score}, Action: ${action}`);
        throw new BadRequestException('Verificación reCAPTCHA fallida. Intentá de nuevo.');
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Error al validar reCAPTCHA:', error.message);
      throw new BadRequestException('Error al verificar reCAPTCHA.');
    }
  }
}
