import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    this.fromAddress = configService.get<string>('NODE_ENV') === 'production'
      ? 'NovaDev Studios <noreply@novadevstudios.com>'
      : 'NovaDev Studios <onboarding@resend.dev>';
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const verificationUrl = `${frontendUrl}/auth/verify-email?token=${token}`;

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(`[DEV] Email de verificación para ${to}`);
      this.logger.warn(`[DEV] URL: ${verificationUrl}`);
      this.logger.warn(`[DEV] Token: ${token}`);
      return;
    }

    const result = await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject: '¡Verificá tu cuenta en NovaDev Studios!',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>¡Bienvenido/a a NovaDev Studios!</h2>
          <p>Hacé clic en el botón para verificar tu cuenta:</p>
          <a
            href="${verificationUrl}"
            style="display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;"
          >
            Verificar mi cuenta
          </a>
          <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">
            El link expira en 24 horas. Si no creaste una cuenta, ignorá este email.
          </p>
        </div>
      `,
    });

    this.logger.log(`Resend response: ${JSON.stringify(result)}`);
    this.logger.log(`Email de verificación enviado a: ${to}`);
  }

  async sendParentLinkConfirmation(
    to: string,
    parentName: string,
    studentAlias: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const confirmUrl = `${frontendUrl}/auth/confirm-link?token=${token}`;

    await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject: `${parentName} quiere vincularse como tu tutor en NovaDev Studios`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Solicitud de vinculación</h2>
          <p><strong>${parentName}</strong> solicitó vincularse como padre/tutor del alumno <strong>${studentAlias}</strong>.</p>
          <p>Si sos ${studentAlias}, confirmá la vinculación:</p>
          <a
            href="${confirmUrl}"
            style="display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;"
          >
            Confirmar vinculación
          </a>
          <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">
            El link expira en 48 horas. Si no reconocés esta solicitud, ignorá este email.
          </p>
        </div>
      `,
    });

    this.logger.log(`Email de vinculación padre-alumno enviado a: ${to}`);
  }
}
