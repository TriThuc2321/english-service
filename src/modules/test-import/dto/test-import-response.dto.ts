import { ApiProperty } from '@nestjs/swagger';

import type { IImportIssue } from '../test-import.type.js';

import { TestDetailDto } from '../../tests/dto/test-response.dto.js';

export class ImportWarningDto implements IImportIssue {
  @ApiProperty({ enum: ['warning'] })
  severity: 'warning';

  @ApiProperty({ example: 'sections[0].parts[1].groups[0].questions[2]' })
  path: string;

  @ApiProperty({ example: 'answer "roads" to 3 is not in the passage' })
  message: string;
}

export class TestImportResultDto {
  @ApiProperty({ type: TestDetailDto })
  test: TestDetailDto;

  @ApiProperty({
    type: [ImportWarningDto],
    description:
      'Non-blocking findings for the reviewer; errors reject the import with 400',
  })
  warnings: ImportWarningDto[];
}
