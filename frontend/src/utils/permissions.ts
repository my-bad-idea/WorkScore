import type { User, UserRole } from '../stores/auth';

export function canManageSystemSettings(user: User | null): boolean {
  return user?.role === 'system_admin';
}

export function canUseAiAssessment(user: User | null): boolean {
  return user?.role === 'system_admin' || user?.role === 'department_admin';
}

/** 是否可进入系统配置（部门/岗位/人员/考核队列/AI 测试/系统设置等）；普通用户不可见 */
export function canAccessSystemConfig(user: User | null): boolean {
  return user?.role === 'system_admin' || user?.role === 'department_admin';
}

export function canEditDepartment(user: User | null): boolean {
  return user?.role === 'system_admin';
}

export function canEditPosition(
  user: User | null,
  row: { departmentId: number },
): boolean {
  if (!user) return false;
  if (user.role === 'system_admin') return true;
  if (user.role === 'department_admin' && row.departmentId === user.departmentId) return true;
  return false;
}

export function canEditUser(
  user: User | null,
  row: { departmentId: number },
): boolean {
  if (!user) return false;
  if (user.role === 'system_admin') return true;
  if (user.role === 'department_admin' && row.departmentId === user.departmentId) return true;
  return false;
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'system_admin':
      return '系统管理员';
    case 'department_admin':
      return '部门管理员';
    default:
      return '普通用户';
  }
}
