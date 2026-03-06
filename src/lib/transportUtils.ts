import { supabase } from '@/lib/supabase';
import type { TransportData } from '@/components/TransportFields';

export async function saveTransportDetails(
  transactionId: string,
  data: TransportData
): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized');

  const { error } = await supabase
    .from('transport_details')
    .insert({
      transaction_id: transactionId,
      from_location: data.from_location,
      to_location: data.to_location,
      transport_type: data.transport_type,
      purpose: data.purpose,
      carrier: data.carrier,
      class: data.class_value || null,
      class_reason: data.class_reason || null,
      round_trip: data.round_trip || 'one_way',
      companion: data.companion || null,
      flight_train_no: data.flight_train_no || null,
      route_note: data.route_note || null,
    } as any);

  if (error) throw error;
}

export async function updateTransportDetails(
  transactionId: string,
  data: TransportData
): Promise<void> {
  if (!supabase) throw new Error('Supabase not initialized');

  // 既存レコードを削除してから再挿入（簡潔さ優先）
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

  return {
    from_location: (data as any).from_location || '',
    to_location: (data as any).to_location || '',
    transport_type: (data as any).transport_type || '電車',
    purpose: (data as any).purpose || '撮影',
    carrier: (data as any).carrier || '',
    class_value: (data as any).class || '普通席',
    class_reason: (data as any).class_reason || '',
    round_trip: (data as any).round_trip || 'one_way',
    companion: (data as any).companion || '',
    flight_train_no: (data as any).flight_train_no || '',
    route_note: (data as any).route_note || '',
  };
}
