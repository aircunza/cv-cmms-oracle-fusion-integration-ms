import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOracleInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  environment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}
