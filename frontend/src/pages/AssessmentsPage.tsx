import { useEffect, useRef, useState } from 'react';
import { Card, Tabs, Table, Select } from 'antd';
import dayjs from 'dayjs';
import { assessmentsApi, departmentsApi, positionsApi } from '../api/client';
import { useAuth } from '../stores/auth';

type RankingRow = { userId: number; userName: string; score: number; workPlanScore?: number; weeklyReportScore?: number; rank: number; positionName?: string | null };
type DeptRanking = { departmentId: number; departmentName: string; rankings: RankingRow[] };

export default function AssessmentsPage() {
  const { user } = useAuth();
  const [monthlyData, setMonthlyData] = useState<DeptRanking[]>([]);
  const [yearlyData, setYearlyData] = useState<DeptRanking[]>([]);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [positionOptionsAll, setPositionOptionsAll] = useState<{ id: number; departmentId: number; name: string }[]>([]);
  const [monthYear, setMonthYear] = useState(() => dayjs().format('YYYY-MM'));
  const [year, setYear] = useState(() => dayjs().format('YYYY'));
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [positionId, setPositionId] = useState<number | undefined>();
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingYearly, setLoadingYearly] = useState(false);
  const initialDeptSetRef = useRef(false);

  const positionOptionsByDept = departmentId != null ? positionOptionsAll.filter((p) => p.departmentId === departmentId) : positionOptionsAll;

  useEffect(() => {
    departmentsApi.list().then((list) => setDepartments(list.filter((d) => d.enabled).map((d) => ({ id: d.id, name: d.name }))));
    positionsApi.list().then((list) => setPositionOptionsAll(list.filter((p) => p.enabled).map((p) => ({ id: p.id, departmentId: p.departmentId, name: p.name }))));
  }, []);

  // 第一次打开时部门筛选默认选中登录人所属部门
  useEffect(() => {
    if (initialDeptSetRef.current || !user?.departmentId || departments.length === 0) return;
    const hasDept = departments.some((d) => d.id === user.departmentId);
    if (hasDept) {
      setDepartmentId(user.departmentId);
      initialDeptSetRef.current = true;
    }
  }, [user?.departmentId, departments]);

  useEffect(() => {
    let cancelled = false;
    setLoadingMonthly(true);
    const [y, m] = monthYear.split('-');
    assessmentsApi.monthly(y, m, departmentId, positionId).then((data) => {
      if (!cancelled) {
        setMonthlyData(data);
        setLoadingMonthly(false);
      }
    }).catch(() => { if (!cancelled) setLoadingMonthly(false); });
    return () => { cancelled = true; };
  }, [monthYear, departmentId, positionId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingYearly(true);
    assessmentsApi.yearly(year, departmentId, positionId).then((data) => {
      if (!cancelled) {
        setYearlyData(data);
        setLoadingYearly(false);
      }
    }).catch(() => { if (!cancelled) setLoadingYearly(false); });
    return () => { cancelled = true; };
  }, [year, departmentId, positionId]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = dayjs().year() - i;
    return { value: String(y), label: `${y}年` };
  });

  return (
    <div>
      <Card title="考核排名">
        <Tabs
          items={[
            {
              key: 'monthly',
              label: '月度排名',
              children: (
                <div>
                  <Select
                    placeholder="部门"
                    allowClear
                    style={{ width: 160, marginRight: 8 }}
                    value={departmentId}
                    onChange={(v) => { setDepartmentId(v); setPositionId(undefined); }}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  />
                  <Select
                    placeholder="岗位"
                    allowClear
                    style={{ width: 120, marginRight: 8 }}
                    value={positionId}
                    onChange={setPositionId}
                    options={positionOptionsByDept.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <Select
                    style={{ width: 140 }}
                    value={monthYear}
                    onChange={setMonthYear}
                    options={Array.from({ length: 12 }, (_, i) => {
                      const d = dayjs().subtract(i, 'month');
                      return { value: d.format('YYYY-MM'), label: d.format('YYYY年MM月') };
                    })}
                  />
                  {monthlyData.map((dept) => (
                    <Card type="inner" key={dept.departmentId} title={dept.departmentName} style={{ marginTop: 16 }}>
                      <Table
                        loading={loadingMonthly}
                        dataSource={dept.rankings}
                        rowKey="userId"
                        size="small"
                        pagination={false}
                        columns={[
                          { title: '名次', dataIndex: 'rank', key: 'rank', width: 70, align: 'center' as const },
                          { title: '姓名', dataIndex: 'userName', key: 'userName', width: 120 },
                          { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 100, ellipsis: true, render: (v: string | null | undefined) => v ?? '-' },
                          { title: '工作计划得分', dataIndex: 'workPlanScore', key: 'workPlanScore', width: 100, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
                          { title: '周报得分', dataIndex: 'weeklyReportScore', key: 'weeklyReportScore', width: 90, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
                          { title: '总分', dataIndex: 'score', key: 'score', width: 80, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
                        ]}
                      />
                    </Card>
                  ))}
                </div>
              ),
            },
            {
              key: 'yearly',
              label: '年度排名',
              children: (
                <div>
                  <Select
                    placeholder="部门"
                    allowClear
                    style={{ width: 160, marginRight: 8 }}
                    value={departmentId}
                    onChange={(v) => { setDepartmentId(v); setPositionId(undefined); }}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  />
                  <Select
                    placeholder="岗位"
                    allowClear
                    style={{ width: 120, marginRight: 8 }}
                    value={positionId}
                    onChange={setPositionId}
                    options={positionOptionsByDept.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <Select style={{ width: 120 }} value={year} onChange={setYear} options={yearOptions} />
                  {yearlyData.map((dept) => (
                    <Card type="inner" key={dept.departmentId} title={dept.departmentName} style={{ marginTop: 16 }}>
                      <Table
                        loading={loadingYearly}
                        dataSource={dept.rankings}
                        rowKey="userId"
                        size="small"
                        pagination={false}
                        columns={[
                          { title: '名次', dataIndex: 'rank', key: 'rank', width: 70, align: 'center' as const },
                          { title: '姓名', dataIndex: 'userName', key: 'userName', width: 120 },
                          { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 100, ellipsis: true, render: (v: string | null | undefined) => v ?? '-' },
                          { title: '工作计划得分', dataIndex: 'workPlanScore', key: 'workPlanScore', width: 100, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
                          { title: '周报得分', dataIndex: 'weeklyReportScore', key: 'weeklyReportScore', width: 90, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
                          { title: '总分', dataIndex: 'score', key: 'score', width: 80, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
                        ]}
                      />
                    </Card>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
