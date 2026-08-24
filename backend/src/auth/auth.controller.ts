import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordWithTokenDto } from './dto/reset-password-with-token.dto';
import {
  PasskeyLoginOptionsDto,
  PasskeyLoginVerifyDto,
  PasskeyRegisterVerifyDto,
} from './dto/webauthn.dto';

// Read directly from process.env (not ConfigService) because decorator
// metadata is evaluated at module-load time, before Nest's DI container exists.
const AUTH_THROTTLE_LIMIT = parseInt(
  process.env.THROTTLE_AUTH_LIMIT ?? '5',
  10,
);
const AUTH_THROTTLE_TTL = parseInt(
  process.env.THROTTLE_AUTH_TTL ?? '60000',
  10,
);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email + password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<TokenResponseDto> {
    const user = await this.authService.validateLocalUser(
      dto.email,
      dto.password,
    );
    return this.authService.login(user, req.headers['user-agent']);
  }

  @Public()
  @Throttle({
    default: { limit: AUTH_THROTTLE_LIMIT * 2, ttl: AUTH_THROTTLE_TTL },
  })
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(
      dto.refreshToken,
      req.headers['user-agent'],
    );
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  @ApiOperation({
    summary:
      "Change the current user's own password (requires the current one)",
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user.id, dto);
  }

  @ApiBearerAuth()
  @Put('theme')
  @ApiOperation({
    summary: "Set the current user's dark-mode preference (light/dark/system)",
  })
  updateTheme(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateThemeDto,
  ) {
    return this.authService.updateTheme(user.id, dto.theme);
  }

  // -------------------------------------------------------------------
  // Password reset (unauthenticated - "forgot password")
  // -------------------------------------------------------------------

  @Public()
  @Get('password-reset-available')
  @ApiOperation({
    summary:
      'Whether email is configured, i.e. whether "forgot password" can deliver a reset link',
  })
  async passwordResetAvailable(): Promise<{ available: boolean }> {
    return { available: await this.authService.isPasswordResetAvailable() };
  }

  @Public()
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  @ApiOperation({
    summary:
      'Request a password-reset email. Always succeeds, whether or not the address is known.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  @ApiOperation({
    summary: 'Complete a password reset using the token from the email link',
  })
  async resetPassword(@Body() dto: ResetPasswordWithTokenDto): Promise<void> {
    await this.authService.resetPasswordWithToken(
      dto.token,
      dto.newPassword,
      dto.newPasswordConfirmation,
    );
  }

  // -------------------------------------------------------------------
  // ChurchTools OAuth2
  // -------------------------------------------------------------------

  @Public()
  @Get('churchtools/start')
  @ApiOperation({ summary: 'Start the ChurchTools OAuth2 (PKCE) login flow' })
  async churchToolsStart() {
    const { url, state } =
      await this.authService.getChurchToolsAuthorizationUrl();
    return { authorizationUrl: url, state };
  }

  @Public()
  @Get('churchtools/callback')
  @ApiOperation({
    summary: 'ChurchTools OAuth2 callback: exchanges code for tokens',
  })
  async churchToolsCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<TokenResponseDto> {
    return this.authService.loginWithChurchTools(code, state);
  }

  // -------------------------------------------------------------------
  // Passkey / WebAuthn
  // -------------------------------------------------------------------

  @ApiBearerAuth()
  @Post('passkey/register/options')
  @ApiOperation({
    summary: 'Get WebAuthn registration options for the current user',
  })
  async passkeyRegisterOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.createPasskeyRegistrationOptions(user.id);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('passkey/register/verify')
  @ApiOperation({
    summary: 'Verify a WebAuthn registration response and store the passkey',
  })
  async passkeyRegisterVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasskeyRegisterVerifyDto,
  ): Promise<void> {
    await this.authService.verifyPasskeyRegistration(
      user.id,
      dto.challengeId,
      dto.response,
      dto.deviceLabel,
    );
  }

  @Public()
  @Post('passkey/login/options')
  @ApiOperation({ summary: 'Get WebAuthn authentication options' })
  async passkeyLoginOptions(@Body() dto: PasskeyLoginOptionsDto) {
    return this.authService.createPasskeyLoginOptions(dto.email);
  }

  @Public()
  @Throttle({
    default: { limit: AUTH_THROTTLE_LIMIT * 2, ttl: AUTH_THROTTLE_TTL },
  })
  @Post('passkey/login/verify')
  @ApiOperation({
    summary: 'Verify a WebAuthn authentication response and issue tokens',
  })
  async passkeyLoginVerify(
    @Body() dto: PasskeyLoginVerifyDto,
  ): Promise<TokenResponseDto> {
    return this.authService.verifyPasskeyLogin(dto.challengeId, dto.response);
  }
}
