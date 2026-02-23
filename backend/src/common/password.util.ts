import { BadRequestException } from '@nestjs/common';

const MIN_LENGTH = 8;
const PASSWORD_STRENGTH_MSG =
  '密码至少 8 位，且包含大写字母、小写字母、数字和特殊字符各至少一个';

/**
 * 校验密码强度：至少 8 位，且包含大写、小写、数字、特殊字符各至少一个。
 * 不符合时抛出 BadRequestException。
 */
export function validatePasswordStrength(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    throw new BadRequestException(PASSWORD_STRENGTH_MSG);
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestException(PASSWORD_STRENGTH_MSG);
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestException(PASSWORD_STRENGTH_MSG);
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException(PASSWORD_STRENGTH_MSG);
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestException(PASSWORD_STRENGTH_MSG);
  }
}
