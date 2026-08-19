import { IsString, MaxLength, MinLength } from 'class-validator';

export class AppendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
