import type { EntertainmentData } from '@/components/EntertainmentFields';

export function entertainmentToDescription(data: EntertainmentData, memo?: string): string {
  const parts: string[] = [];
  if (data.guest_name) parts.push(data.guest_name);
  if (data.guest_company) parts.push(`(${data.guest_company})`);
  if (data.guest_count) parts.push(`${data.guest_count}名`);
  parts.push(data.relationship);
  parts.push(data.purpose);

  const prefix = `[接待] ${parts.join(' ')}`;
  return memo ? `${prefix} / ${memo}` : prefix;
}
