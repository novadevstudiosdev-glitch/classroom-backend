import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend | null;
  private readonly enabled: boolean;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.enabled = Boolean(apiKey);
    this.resend = this.enabled ? new Resend(apiKey) : null;

    if (!this.enabled) {
      this.logger.warn('RESEND_API_KEY no configurada. Se omitira el envio de emails.');
    }

    const configuredFrom = this.configService.get<string>('RESEND_FROM');
    this.fromAddress = configuredFrom ? configuredFrom : configService.get<string>('NODE_ENV') === 'production' ? 'NovaDev Studios <noreply@drajaquelinagrassetti.com>' : 'NovaDev Studios <noreply@drajaquelinagrassetti.com>';
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    if (!this.enabled || !this.resend) {
      this.logger.warn(`Envio de verificacion omitido (Resend deshabilitado) para: ${to}`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const verificationUrl = `${frontendUrl}/auth/verify-email?token=${token}`;

    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject: 'Verifica tu cuenta en NovaDev Studios!',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Bienvenido/a a NovaDev Studios!</h2>
            <p>Hace clic en el boton para verificar tu cuenta:</p>
            <a
              href="${verificationUrl}"
              style="display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;"
            >
              Verificar mi cuenta
            </a>
            <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">
              El link expira en 24 horas. Si no creaste una cuenta, ignora este email.
            </p>
          </div>
        `,
      });
      this.logger.log(`Email de verificacion enviado a: ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de verificacion a ${to}: ${error?.message}`);
    }
  }

  async sendParentLinkConfirmation(to: string, parentName: string, studentAlias: string, token: string): Promise<void> {
    if (!this.enabled || !this.resend) {
      this.logger.warn(`Envio de vinculacion omitido (Resend deshabilitado) para: ${to}`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const confirmUrl = `${frontendUrl}/auth/confirm-link?token=${token}`;

    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject: `${parentName} quiere vincularse como tu tutor en NovaDev Studios`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Solicitud de vinculacion</h2>
            <p><strong>${parentName}</strong> solicito vincularse como padre/tutor del alumno <strong>${studentAlias}</strong>.</p>
            <p>Si sos ${studentAlias}, confirma la vinculacion:</p>
            <a
              href="${confirmUrl}"
              style="display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;"
            >
              Confirmar vinculacion
            </a>
            <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">
              El link expira en 48 horas. Si no reconoces esta solicitud, ignora este email.
            </p>
          </div>
        `,
      });
      this.logger.log(`Email de vinculacion padre-alumno enviado a: ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de vinculacion a ${to}: ${error?.message}`);
    }
  }
}
