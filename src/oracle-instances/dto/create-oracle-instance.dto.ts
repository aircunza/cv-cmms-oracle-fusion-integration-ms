import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOracleInstanceDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  environment!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  module!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  username!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  password!: string;
}
