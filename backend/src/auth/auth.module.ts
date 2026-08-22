import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GroupsModule } from '../groups/groups.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ChurchToolsService } from './churchtools/churchtools.service';
import { WebauthnService } from './webauthn/webauthn.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), GroupsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ChurchToolsService, WebauthnService],
  exports: [AuthService],
})
export class AuthModule {}
