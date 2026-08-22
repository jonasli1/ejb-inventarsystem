import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [GroupsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
