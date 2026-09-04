import { IsNotEmpty, IsString } from 'class-validator';

export class FindInventoryByMaterialCodeDto {
  @IsNotEmpty()
  @IsString()
  materialCode!: string;
}

export class SearchInventoryByDescriptionDto {
  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsNotEmpty()
  @IsString()
  organizationCode!: string;
}
