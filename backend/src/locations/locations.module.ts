import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { RoomsController } from '../rooms/rooms.controller';
import { RoomsService } from '../rooms/rooms.service';

@Module({
  controllers: [LocationsController, RoomsController],
  providers: [LocationsService, RoomsService],
  exports: [LocationsService, RoomsService],
})
export class LocationsModule {}
