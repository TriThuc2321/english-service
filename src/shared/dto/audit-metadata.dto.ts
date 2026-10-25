import { ApiProperty } from '@nestjs/swagger';

export class AuditUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  firstName: string;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatar: string | null;
}

export class AuditMetadataDto {
  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdById: string | null;

  @ApiProperty({ type: AuditUserDto, nullable: true })
  createdBy: AuditUserDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  updatedById: string | null;

  @ApiProperty({ type: AuditUserDto, nullable: true })
  updatedBy: AuditUserDto | null;
}
