import { plainToInstance } from 'class-transformer';
import { QueryActivityDto } from './query-activity.dto';

describe('QueryActivityDto', () => {
  it('defaults sortOrder to "desc" (most recent first), overriding the base class default of "asc"', () => {
    const dto = plainToInstance(QueryActivityDto, {});
    expect(dto.sortOrder).toBe('desc');
  });

  it('respects an explicit sortOrder=asc', () => {
    const dto = plainToInstance(QueryActivityDto, { sortOrder: 'asc' });
    expect(dto.sortOrder).toBe('asc');
  });
});
