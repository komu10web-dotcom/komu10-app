import { supabase } from '@/lib/supabase';
import type { TransportData, RouteLeg } from '@/components/TransportFields';

// v0.30.0: leg を JSONB 保存用に正規化(新フィールドも全て保持)
function normalizeLegForSave(l: RouteLeg): RouteLeg {
  // 旧method「電車」は「普通電車」へ自動マイグレ
  const method = l.method === '電車' ? '普通電車' : (l.method || '普通電車');
  return {
    from: l.from || '',
    to: l.to || '',
    method,
    carrier: l.carrier || '',
    amount: Number(l.amount) || 0,
    green: !!l.green,
    green_amount: Number(l.green_amount) || 0,
    class_value: l.class_value || '',
    class_reason: l.class_reason || '',
    client_name: l.client_name || '',
    flight_train_no: l.flight_train_no || '',
    passenger_count: Number(l.passenger_count) || 1,
    companion_memo: l.companion_memo || '',
  };
}

// v0.30.0: leg を読み込み時に正規化(後方互換も含む)
function normalizeLegForLoad(l: any): RouteLeg {
  const method = l?.method === '電車' ? '普通電車' : (l?.method || '普通電車');
  return {
    from: l?.from || '',
    to: l?.to || '',
    method,
    carrier: l?.carrier || '',
    amount: Number(l?.amount) || 0,
    green: !!l?.green,
    green_amount: Number(l?.green_amount) || 0,
    class_value: l?.class_value || '',
    class_reason: l?.class_reason || '',
    client_name: l?.client_name || '',
    flight_train_no: l?.flight_train_no || '',
    passenger_count: Number(l?.passenger_count) || 1,
    companion_memo: l?.companion_memo || '',
  };
}

export async function saveTransportDetails(
  transactionId: string,
  data: TransportData
): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized');

  const normalizedRouteLegs = (data.route_legs || []).map(normalizeLegForSave);
  const normalizedReturnLegs = (data.return_legs || []).map(normalizeLegForSave);

  const { error } = await supabase
    .from('transport_details')
    .insert({
      transaction_id: transactionId,
      purpose: data.purpose,
      route_legs: normalizedRouteLegs,
      round_trip: data.round_trip || 'one_way',
      // 後方互換のため class/class_reason/companion/flight_train_no は保持
      class: data.class_value || null,
      class_reason: data.class_reason || null,
      companion: data.companion || null,
      flight_train_no: data.flight_train_no || null,
      route_note: data.route_note || null,
      daily_allowance: 0,
      hotel_allowance: 0,
      return_legs: normalizedReturnLegs,
      same_route: data.same_route !== undefined ? data.same_route : true,
      same_amount: data.same_amount !== undefined ? data.same_amount : true,
      return_amount: data.return_amount || 0,
      return_mode: data.return_mode || 'auto_reverse',
      payment_method: data.payment_method || 'ic',
    } as any);

  if (error) throw error;
}

export async function updateTransportDetails(
  transactionId: string,
  data: TransportData
): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized');

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
    ? row.route_legs.map(normalizeLegForLoad)
    : [normalizeLegForLoad({})];

  return {
    purpose: row.purpose || '商談',
    route_legs: legs,
    round_trip: row.round_trip || 'one_way',
    same_route: row.same_route !== undefined ? row.same_route : true,
    same_amount: row.same_amount !== undefined ? row.same_amount : true,
    return_legs: Array.isArray(row.return_legs) && row.return_legs.length > 0
      ? row.return_legs.map(normalizeLegForLoad)
      : [],
    return_amount: row.return_amount || 0,
    return_mode: row.return_mode || 'auto_reverse',
    payment_method: row.payment_method || 'ic',
    class_value: row.class || '',
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

/** route_legsの合計金額を計算 — v0.30.0: 普通電車のグリーン料金別入力も加算 */
export function calcRouteTotal(legs: RouteLeg[]): number {
  if (!legs) return 0;
  return legs.reduce((s, l) => {
    const base = Number(l.amount) || 0;
    const greenAdd = (l.method === '普通電車' && l.green) ? (Number(l.green_amount) || 0) : 0;
    return s + base + greenAdd;
  }, 0);
}
