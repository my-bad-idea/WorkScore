import { useEffect, useState } from 'react';
import { Card, Descriptions, Spin, message, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { roleLabel } from '../utils/permissions';
import { workRecordsApi, assessmentsApi } from '../api/client';
import dayjs from 'dayjs';

const { Link } = Typography;

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workRecordCount, setWorkRecordCount] = useState<number | null>(null);
  const [personalRank, setPersonalRank] = useState<{ rank: number; score: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [records, monthData] = await Promise.all([
          workRecordsApi.list({ recorderId: String(user.id) }),
          assessmentsApi.monthly(dayjs().format('YYYY'), dayjs().format('MM'), user.departmentId, user.positionId ?? undefined),
        ]);
        if (cancelled) return;
        setWorkRecordCount(records.length);
        const deptBlock = monthData.find((d) => d.departmentId === user.departmentId);
        const me = deptBlock?.rankings?.find((r) => r.userId === user.id);
        if (me) setPersonalRank({ rank: me.rank, score: me.score });
        else setPersonalRank(null);
      } catch (e) {
        if (!cancelled) message.error(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;

  return (
    <div>
      <Card title="个人信息">
        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
          <Descriptions.Item label="姓名">{user.realName}</Descriptions.Item>
          <Descriptions.Item label="角色">{roleLabel(user.role)}</Descriptions.Item>
          <Descriptions.Item label="部门">{user.departmentName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="岗位">{user.positionName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="工作记录">
            {loading ? <Spin size="small" /> : (
              <>
                共 {workRecordCount ?? 0} 条
                {' · '}
                <Link onClick={() => navigate('/work-records')}>查看工作记录</Link>
              </>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="考核排名（个人）">
            {loading ? <Spin size="small" /> : (
              <>
                {personalRank != null
                  ? `本月第 ${personalRank.rank} 名，得分 ${personalRank.score.toFixed(1)}`
                  : '暂无排名'}
                {' · '}
                <Link onClick={() => navigate('/assessments')}>查看考核排名</Link>
              </>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
