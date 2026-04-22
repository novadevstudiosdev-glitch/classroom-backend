import { Controller, Post, Get, Patch, Body, UseGuards, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterParentDto } from './dto/register-parent.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ConfirmParentLinkDto } from './dto/confirm-parent-link.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RecaptchaGuard } from './guards/recaptcha.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────

  @Public()
  @Post('register/teacher')
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests / minuto
  @ApiOperation({ summary: 'Registrar un nuevo docente' })
  @ApiResponse({ status: 201, description: 'Docente registrado. Retorna user_id y profile_id. Se envía email de verificación.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (campos faltantes o mal formateados).' })
  @ApiResponse({ status: 409, description: 'Email ya registrado.' })
  async registerTeacher(@Body() dto: RegisterTeacherDto) {
    return this.authService.registerTeacher(dto);
  }

  @Public()
  @Post('register/student')
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Registrar un alumno usando código de invitación' })
  @ApiResponse({ status: 201, description: 'Alumno registrado y unido a la clase. Retorna user_id y classroom_id.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (campos faltantes o mal formateados).' })
  @ApiResponse({ status: 404, description: 'Código de invitación inválido o inexistente.' })
  async registerStudent(@Body() dto: RegisterStudentDto) {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('register/parent')
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Registrar un padre/tutor y vincular con un alumno' })
  @ApiResponse({ status: 201, description: 'Padre registrado. Se envía email de confirmación de vinculación al alumno.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado.' })
  @ApiResponse({ status: 409, description: 'Email ya registrado.' })
  async registerParent(@Body() dto: RegisterParentDto) {
    return this.authService.registerParent(dto);
  }

  // ─────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 intentos / minuto
  @ApiOperation({ summary: 'Iniciar sesión con email y contraseña' })
  @ApiResponse({ status: 200, description: 'Login exitoso. Retorna access_token y refresh_token.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─────────────────────────────────────────────────
  // REFRESH TOKEN
  // ─────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access_token usando refresh_token', description: 'Mandá el refresh_token en el header Authorization: Bearer {refresh_token} y también en el body.' })
  @ApiResponse({ status: 200, description: 'Retorna nuevo access_token y refresh_token.' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado.' })
  async refresh(@Req() req: Request, @Body() _dto: RefreshTokenDto) {
    const user = req.user as any;
    return this.authService.refreshTokens(user.sub, user.refreshToken);
  }

  // ─────────────────────────────────────────────────
  // GOOGLE OAUTH
  // ─────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Iniciar flujo de autenticación con Google', description: 'Redirige al usuario a la pantalla de login de Google. No usar desde Swagger — abrir directamente en el browser.' })
  @ApiResponse({ status: 302, description: 'Redirección a Google OAuth.' })
  async googleAuth() {
    // Passport redirige automáticamente a Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Callback de Google OAuth — redirige al frontend con tokens', description: 'Google llama a este endpoint automáticamente. El frontend recibe access_token, refresh_token y role como query params en /auth/callback.' })
  @ApiResponse({ status: 302, description: 'Redirección al frontend con tokens en query params.' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const tokens = await this.authService.loginWithGoogle(req.user);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    // Redirigir al frontend con los tokens como query params
    // El frontend los lee, los guarda y redirige al dashboard
    res.redirect(`${frontendUrl}/auth/callback?` + `access_token=${tokens.access_token}&` + `refresh_token=${tokens.refresh_token}&` + `role=${tokens.role}&` + `profile_id=${tokens.profile_id}`);
  }

  // ─────────────────────────────────────────────────
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenviar email de verificación', description: 'Útil si el usuario no recibió o perdió el email original.' })
  @ApiResponse({ status: 200, description: 'Si el email existe y no está verificado, se reenvía el link.' })
  @ApiResponse({ status: 400, description: 'Email con formato inválido.' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  // VERIFY EMAIL
  // ─────────────────────────────────────────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar email con token del link', description: 'El token viene en la URL del email de verificación (?token=...). El frontend lo extrae y llama a este endpoint.' })
  @ApiResponse({ status: 200, description: 'Email verificado. El usuario ya puede hacer login.' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado.' })
  async verifyEmail(@Body() { token }: VerifyEmailDto) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('confirm-parent-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar vinculacion padre-alumno con token del email' })
  @ApiResponse({ status: 200, description: 'Vinculacion confirmada.' })
  @ApiResponse({ status: 400, description: 'Token invalido o expirado.' })
  async confirmParentLink(@Body() { token }: ConfirmParentLinkDto) {
    return this.authService.confirmParentLink(token);
  }

  // ─────────────────────────────────────────────────
  // FORGOT / RESET PASSWORD
  // ─────────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Solicitar email para restablecer contraseña' })
  @ApiResponse({ status: 200, description: 'Si el email existe, se envía el link de reset.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Restablecer contraseña con token del email' })
  @ApiResponse({ status: 200, description: 'Contraseña restablecida.' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.new_password);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar contraseña (usuario autenticado)' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada.' })
  @ApiResponse({ status: 401, description: 'Contraseña actual incorrecta.' })
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto.current_password, dto.new_password);
  }

  // ─────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión e invalidar refresh token' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada. El refresh token queda inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.sub, user.jti, user.exp);
  }

  // ─────────────────────────────────────────────────
  // ME (util para debug)
  // ─────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar token y ver usuario autenticado', description: 'Retorna sub (user_id), email, role y profile_id del token actual. Útil para debug y para que el front sepa el rol del usuario logueado.' })
  @ApiResponse({ status: 200, description: 'Retorna los datos del JWT: sub, email, role, profile_id.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  async me(@CurrentUser() user: any) {
    return { data: user };
  }

  // ─────────────────────────────────────────────────
  // PROFILE (usado por el frontend para inicializar sesión)
  // ─────────────────────────────────────────────────

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil completo del usuario autenticado', description: 'Retorna id, email, role, profile_id y name (first_name + last_name) en una sola llamada, sin importar el rol.' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  async profile(@CurrentUser() user: any) {
    return this.authService.getMyProfile(user.sub, user.role);
  }
}
