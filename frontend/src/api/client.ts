const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) throw new Error((data as { message?: string }).message ?? res.statusText);
  return data;
}

export const authApi = {
  login: (username: string, password: string) =>
    api<{ access_token: string; user: unknown }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => api<unknown>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
};

export const setupApi = {
  status: () => api<{ installed: boolean }>('/setup/status'),
  init: (body: { username: string; password: string; realName: string }) =>
    api('/setup/init', { method: 'POST', body: JSON.stringify(body) }),
};

export const departmentsApi = {
  list: () => api<{ id: number; name: string; enabled: boolean }[]>('/departments'),
  get: (id: number) => api<{ id: number; name: string; enabled: boolean }>(`/departments/${id}`),
  create: (body: { name: string; enabled?: boolean }) =>
    api<{ id: number }>('/departments', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { name?: string; enabled?: boolean }) =>
    api<{ id: number }>(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => api(`/departments/${id}`, { method: 'DELETE' }),
};

export const positionsApi = {
  list: () =>
    api<{ id: number; departmentId: number; name: string; assessmentCriteria: string; enabled: boolean; departmentName?: string }[]>(
      '/positions',
    ),
  get: (id: number) =>
    api<{ id: number; departmentId: number; name: string; assessmentCriteria: string; enabled: boolean; departmentName?: string }>(
      `/positions/${id}`,
    ),
  create: (body: { departmentId: number; name: string; assessmentCriteria: string | object; enabled?: boolean }) =>
    api<{ id: number }>('/positions', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { departmentId?: number; name?: string; assessmentCriteria?: string | object; enabled?: boolean }) =>
    api<{ id: number }>(`/positions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => api(`/positions/${id}`, { method: 'DELETE' }),
};

export const usersApi = {
  list: () =>
    api<
      {
        id: number;
        username: string;
        realName: string;
        departmentId: number;
        positionId?: number;
        departmentName?: string;
        positionName?: string;
        isAdmin: boolean;
        role?: string;
        enabled: boolean;
      }[]
    >('/users'),
  get: (id: number) =>
    api<{
      id: number;
      username: string;
      realName: string;
      departmentId: number;
      positionId?: number;
      departmentName?: string;
      positionName?: string;
      isAdmin: boolean;
      role?: string;
      enabled: boolean;
    }>(`/users/${id}`),
  create: (body: {
    username: string;
    password?: string;
    realName: string;
    departmentId: number;
    positionId?: number;
    enabled?: boolean;
    role?: string;
  }) => api<{ id: number }>('/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { username?: string; password?: string; realName?: string; departmentId?: number; positionId?: number; enabled?: boolean; role?: string }) =>
    api<{ id: number }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => api(`/users/${id}`, { method: 'DELETE' }),
};

export const settingsApi = {
  get: () => api<Record<string, string>>('/settings'),
  update: (body: Record<string, string>) => api<Record<string, string>>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
};

export const workRecordsApi = {
  list: (params?: { type?: string; recordDate?: string; recordDateStart?: string; recordDateEnd?: string; recorderId?: string; departmentId?: string; positionId?: string }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set('type', params.type);
    if (params?.recordDate) q.set('recordDate', params.recordDate);
    if (params?.recordDateStart) q.set('recordDateStart', params.recordDateStart);
    if (params?.recordDateEnd) q.set('recordDateEnd', params.recordDateEnd);
    if (params?.recorderId) q.set('recorderId', params.recorderId);
    if (params?.departmentId) q.set('departmentId', params.departmentId);
    if (params?.positionId) q.set('positionId', params.positionId);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return api<{ id: number; type: string; recordDate: string; content: string; recorderId: number; recorderName: string; recorderDepartmentName?: string; recorderPositionName?: string; createdAt: string; updatedAt: string }[]>(
      `/work-records${suffix}`,
    );
  },
  get: (id: number) =>
    api<{ id: number; type: string; recordDate: string; content: string; recorderId: number; recorderName: string; recorderDepartmentName?: string; recorderPositionName?: string; createdAt: string; updatedAt: string }>(
      `/work-records/${id}`,
    ),
  create: (body: { type: string; recordDate: string; content: string }) =>
    api<{ id: number }>('/work-records', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { type?: string; recordDate?: string; content?: string }) =>
    api<{ id: number }>(`/work-records/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => api(`/work-records/${id}`, { method: 'DELETE' }),
};

export const scoresApi = {
  listByWorkRecord: (workRecordId: number) =>
    api<{ id: number; scoreType: string; totalScore: number; remark: string | null; scoredAt: string; scorerName: string; scorerId: number }[]>(
      `/work-records/${workRecordId}/scores`,
    ),
  getCriteria: (workRecordId: number) =>
    api<{ name: string; weight?: number; description?: string }[]>(`/work-records/${workRecordId}/criteria`),
  getSummary: (workRecordId: number) => api<{ totalScore: number }>(`/work-records/${workRecordId}/summary`),
  createScore: (workRecordId: number, body: { scoreDetails: { item_name: string; score: number; comment?: string }[]; totalScore: number; remark: string }) =>
    api<{ id: number }>(`/work-records/${workRecordId}/scores`, { method: 'POST', body: JSON.stringify(body) }),
  removeScore: (scoreId: number) => api(`/score-records/${scoreId}`, { method: 'DELETE' }),
  aiTest: (body: { criteriaMarkdown: string; workContent: string }) =>
    api<{ scoreDetails: { item_name: string; score: number; comment: string }[]; totalScore: number; remark: string }>(
      '/scores/ai-test',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  aiGenerateCriteria: (body: { departmentName: string; positionName: string; requirements?: string }) =>
    api<{ content: string }>('/scores/ai-generate-criteria', { method: 'POST', body: JSON.stringify(body) }),
};

export const scoreQueueApi = {
  list: (params?: { status?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return api<{ id: number; workRecordId: number; status: string; createdAt: string; processedAt: string | null; errorMessage: string | null; type: string; recordDate: string; recorderName: string }[]>(
      `/score-queue${suffix}`,
    );
  },
};

export const assessmentsApi = {
  monthly: (year: string, month: string, departmentId?: number, positionId?: number) => {
    const q = new URLSearchParams({ year, month });
    if (departmentId != null) q.set('departmentId', String(departmentId));
    if (positionId != null) q.set('positionId', String(positionId));
    return api<{ departmentId: number; departmentName: string; rankings: { userId: number; userName: string; score: number; rank: number; positionName?: string | null }[] }[]>(
      `/assessments/monthly?${q.toString()}`,
    );
  },
  yearly: (year: string, departmentId?: number, positionId?: number) => {
    const q = new URLSearchParams({ year });
    if (departmentId != null) q.set('departmentId', String(departmentId));
    if (positionId != null) q.set('positionId', String(positionId));
    return api<{ departmentId: number; departmentName: string; rankings: { userId: number; userName: string; score: number; rank: number; positionName?: string | null }[] }[]>(
      `/assessments/yearly?${q.toString()}`,
    );
  },
};
