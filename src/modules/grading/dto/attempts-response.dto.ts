import { ApiProperty } from '@nestjs/swagger';

import {
  AttemptListItemDto,
  AttemptResultDto,
} from '../../student-attempts/dto/student-attempt-response.dto.js';
import { GradingUserDto } from './grading-response.dto.js';

export class StudentAttemptItemDto extends AttemptListItemDto {
  @ApiProperty({ type: GradingUserDto })
  student: GradingUserDto;
}

export class StudentAttemptResultDto extends AttemptResultDto {
  @ApiProperty({ type: GradingUserDto })
  student: GradingUserDto;
}
