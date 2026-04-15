import { supabase } from '@/lib/supabase';
import type { TransportData, RouteLeg } from '@/components/TransportFields';
import { EMPTY_TRANSPORT } from '@/components/TransportFields';

export async function saveTransportDetails(
  transactionId: string,
  data: TransportData
): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized');

  const { error } = await supabase
    .from('transport_details')
    .insert({
      transaction_id: transactionId,
      purpose: data.purpose,
      route_legs: data.route_legs,
      round_trip: data.round_trip || 'one_way',
      class: data.class_value || null,
      class_reason: data.class_reason || null,
      companion: data.companion || null,
      flight_train_no: data.flight_train_no || null,
      route_note: data.route_note || null,
      daily_allowance: 0,
      hotel_allowance: 0,
    } as any);

  if (error) throw error;
}

export async function updateTransportDetails(
  transactionId: string,
  data: TransportData
): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized');

  // 既存レコードを削除してから再挿入
  await supabase
    .from('transport_details')
    .delete()
    .eq('transaction_id', transactionId);

  await saveTransportDetails(transactionId, data);
}

export async function loadTransportDetails(
  transactionId: string
): Promise<TransportData | null> {
  if (!supabase) return null;

  const { data } = await supabase
    .from('transport_details')
    .select('*')
    .eq('transaction_id', transactionId)
    .single();

  if (!data) return null;

  const row = data as any;
  const legs: RouteLeg[] = Array.isArray(row.route_legs) && row.route_legs.length > 0
    ? row.route_legs.map((l: any) => ({
        from: l.from || '',
        to: l.to || '',
        method: l.method || '電車',
        carrier: l.carrier || '',
        amount: l.amount || 0,
        green: l.green || false,
      }))
    : [{ from: '', to: '', method: '電車', carrier: '', amount: 0, green: false }];

  return {
    purpose: row.purpose || '撮影',
    route_legs: legs,
    round_trip: row.round_trip || 'one_way',
    same_route: true,
    same_amount: true,
    return_legs: [],
    return_amount: 0,
    payment_method: 'ic',
    class_value: row.class || '普通席',
    class_reason: row.class_reason || '',
    companion: row.companion || '',
    flight_train_no: row.flight_train_no || '',
    route_note: row.route_note || '',
  };
}

/** route_legsからルートプレビュー文字列を生成 */
export function buildRoutePreview(legs: RouteLeg[]): string {
  if (!legs || legs.length === 0) return '';
  return [legs[0].from, ...legs.map(l => l.to)].filter(Boolean).join(' → ');
}

/** route_legsの合計金額を計算 */
export function calcRouteTotal(legs: RouteLeg[]): number {
  if (!legs) return 0;
  return legs.reduce((s, l) => s + (l.amount || 0), 0);
}
