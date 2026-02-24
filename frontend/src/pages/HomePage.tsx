import { useEffect, useState } from 'react';
import { Card, Table, Select } from 'antd';
import dayjs from 'dayjs';
import { useAuth } from '../stores/auth';
import { assessmentsApi } from '../api/client';

type RankingRow = { userId: number; userName: string; score: number; workPlanScore?: number; weeklyReportScore?: number; rank: number };

export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<RankingRow[]>([]);
  const [departmentName, setDepartmentName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState(() => dayjs().format('YYYY-MM'));

  useEffect(() => {
    let cancelled = false;
    const [y, m] = yearMonth.split('-');
    (async () => {
      setLoading(true);
      try {
        const list = await assessmentsApi.monthly(y, m, user?.departmentId);
        if (cancelled) return;
        const first = list.find((d) => user?.departmentId == null || d.departmentId === user.departmentId) ?? list[0];
        setData(first?.rankings ?? []);
        setDepartmentName(first?.departmentName ?? '');
      } catch {
        if (!cancelled) setData([]);
        if (!cancelled) setDepartmentName('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [yearMonth, user?.departmentId]);

  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const end = dayjs();
    for (let i = 0; i < 12; i++) {
      const d = end.subtract(i, 'month');
      opts.push({ value: d.format('YYYY-MM'), label: d.format('YYYY年MM月') });
    }
    return opts;
  })();

  return (
    <div>
      <Card
        title={departmentName ? `${departmentName}评分排名` : '所属部门评分排名'}
        extra={
          <Select
            style={{ width: 140 }}
            value={yearMonth}
            onChange={setYearMonth}
            options={monthOptions}
          />
        }
      >
        <Table
          loading={loading}
          dataSource={data}
          rowKey="userId"
          size="small"
          pagination={false}
          columns={[
            { title: '名次', dataIndex: 'rank', key: 'rank', width: 70, align: 'center' as const },
            { title: '姓名', dataIndex: 'userName', key: 'userName', width: 120 },
            { title: '工作计划得分', dataIndex: 'workPlanScore', key: 'workPlanScore', width: 100, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
            { title: '周报得分', dataIndex: 'weeklyReportScore', key: 'weeklyReportScore', width: 90, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
            { title: '总分', dataIndex: 'score', key: 'score', width: 80, align: 'right' as const, render: (v: number) => (v ?? 0).toFixed(1) },
          ]}
        />
      </Card>
    </div>
  );
}
