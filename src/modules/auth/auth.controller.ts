import { Controller, Post, Get, Body, UseGuards, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
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
import { ResendVerificationDto } from './dto/resend-verification.dto';
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
  @ApiResponse({ status: 201, description: 'Docente registrado. Email de verificación enviado.' })
  @ApiResponse({ status: 409, description: 'Email ya registrado.' })
  async registerTeacher(@Body() dto: RegisterTeacherDto) {
    return this.authService.registerTeacher(dto);
  }

  @Public()
  @Post('register/student')
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Registrar un alumno usando código de invitación' })
  @ApiResponse({ status: 201, description: 'Alumno registrado y unido a la clase.' })
  @ApiResponse({ status: 404, description: 'Código de invitación inválido.' })
  async registerStudent(@Body() dto: RegisterStudentDto) {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('register/parent')
  @UseGuards(RecaptchaGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Registrar un padre/tutor y vincular con un alumno' })
  @ApiResponse({ status: 201, description: 'Padre registrado. Confirmación de vinculación enviada.' })
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
  @ApiOperation({ summary: 'Renovar access_token usando refresh_token' })
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
  @ApiOperation({ summary: 'Iniciar flujo de autenticación con Google' })
  async googleAuth() {
    // Passport redirige automáticamente a Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Callback de Google OAuth — redirige al frontend con tokens' })
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
  @ApiOperation({ summary: 'Reenviar email de verificacion' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  // VERIFY EMAIL
  // ─────────────────────────────────────────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar email con token del link' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // ─────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión e invalidar refresh token' })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  // ─────────────────────────────────────────────────
  // ME (util para debug)
  // ─────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar token y ver usuario autenticado' })
  async me(@CurrentUser() user: any) {
    return { data: user };
  }
}
