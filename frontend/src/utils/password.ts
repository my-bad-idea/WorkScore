import type { Rule } from 'antd/es/form';

const PASSWORD_STRENGTH_MSG =
  '密码至少 8 位，且包含大写字母、小写字母、数字和特殊字符各至少一个';

function checkPasswordStrength(password: string): boolean {
  if (typeof password !== 'string' || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

/**
 * 表单密码强度校验规则：至少 8 位，且包含大写、小写、数字、特殊字符各至少一个。
 */
export function passwordStrengthRule(): Rule {
  return {
    validator(_, value) {
      if (value == null || value === '') return Promise.resolve();
      if (checkPasswordStrength(value)) return Promise.resolve();
      return Promise.reject(new Error(PASSWORD_STRENGTH_MSG));
    },
  };
}
