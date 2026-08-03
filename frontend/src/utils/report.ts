import type { ReportReason, ReportStatus } from '../api/types';

export const REPORT_REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'abuse', label: '人身攻击 / 辱骂' },
  { value: 'illegal', label: '违法违规' },
  { value: 'irrelevant', label: '内容无关 / 灌水' },
  { value: 'other', label: '其他' },
];

export function reportReasonLabel(reason: string) {
  return REPORT_REASON_OPTIONS.find(o => o.value === reason)?.label ?? reason;
}

export function reportStatusLabel(status: ReportStatus | string) {
  switch (status) {
    case 'pending': return '待处理';
    case 'resolved': return '已处理';
    case 'dismissed': return '已忽略';
    default: return status;
  }
}
