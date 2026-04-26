'use client';

// komu10 v0.30.0 — 所得控除データ層デバッグページ
// URL: /_dev/tax-deductions-debug
// 本番Navからは到達不可。データ層・API・計算ロジックの動作確認専用。
// 将来のリブランディング後に本番UIが完成したら、このページは削除可能。

import { useState } from 'react';
import {
  TAX_DEDUCTION_KEYS,
  PATIENT_TYPES,
  MEDICAL_CATEGORIES,
} from '@/lib/taxConstants';
import {
  calcTotalDeductions,
} from '@/lib/taxDeductionCalc';
import type { Database } from '@/types/database';

type TaxDeduction = Database['public']['Tables']['tax_deductions']['Row'];
type MedicalExpenseDetail = Database['public']['Tables']['medical_expense_details']['Row'];

export default function TaxDeductionsDebugPage() {
  const [owner, setOwner] = useState<'tomo' | 'toshiki'>('toshiki');
  const [year, setYear] = useState(2026);
  const [deductions, setDeductions] = useState<TaxDeduction[]>([]);
  const [details, setDetails] = useState<MedicalExpenseDetail[]>([]);
  const [totalIncome, setTotalIncome] = useState(3_000_000);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  // データ取得
  const fetchAll = async () => {
    try {
      const r1 = await fetch(`/api/tax-deductions/${year}?owner=${owner}`);
      const j1 = await r1.json();
      if (j1.success) {
        setDeductions(j1.data);
        appendLog(`tax_deductions 取得: ${j1.data.length}件`);
      } else {
        appendLog(`tax_deductions 取得エラー: ${j1.error}`);
      }
      const r2 = await fetch(`/api/tax-deductions/${year}/medical-details?owner=${owner}`);
      const j2 = await r2.json();
      if (j2.success) {
        setDetails(j2.data);
        appendLog(`medical_expense_details 取得: ${j2.data.length}件`);
      } else {
        appendLog(`medical_expense_details 取得エラー: ${j2.error}`);
      }
    } catch (e) {
      appendLog(`通信エラー: ${(e as Error).message}`);
    }
  };

  // 単一項目の保存(blur自動保存テスト)
  const saveDeduction = async (key: string, payload: { amount?: number; text_value?: string; bool_value?: boolean }) => {
    try {
      const r = await fetch(`/api/tax-deductions/${year}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, deduction_key: key, ...payload }),
      });
      const j = await r.json();
      if (j.success) {
        appendLog(`保存OK: ${key} = ${JSON.stringify(payload)}`);
        await fetchAll();
      } else {
        appendLog(`保存エラー: ${j.error}`);
      }
    } catch (e) {
      appendLog(`通信エラー: ${(e as Error).message}`);
    }
  };

  // 医療費明細の追加
  const addDetail = async (payload: Partial<MedicalExpenseDetail>) => {
    try {
      const r = await fetch(`/api/tax-deductions/${year}/medical-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, ...payload }),
      });
      const j = await r.json();
      if (j.success) {
        appendLog(`明細追加OK: ${j.data.id}`);
        await fetchAll();
      } else {
        appendLog(`明細追加エラー: ${j.error}`);
      }
    } catch (e) {
      appendLog(`通信エラー: ${(e as Error).message}`);
    }
  };

  // 明細の削除
  const deleteDetail = async (id: string) => {
    try {
      const r = await fetch(`/api/tax-deductions/${year}/medical-details/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (j.success) {
        appendLog(`明細削除OK: ${id}`);
        await fetchAll();
      } else {
        appendLog(`明細削除エラー: ${j.error}`);
      }
    } catch (e) {
      appendLog(`通信エラー: ${(e as Error).message}`);
    }
  };

  // 計算結果の集計
  const calc = calcTotalDeductions({ deductions, details, totalIncome });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1200, margin: '0 auto', color: '#111' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>v0.30.0 所得控除データ層デバッグ</h1>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
        本番UIは未実装。データ層・API・計算ロジックの動作確認専用ページ。本番Navからは到達不可。
      </p>

      <fieldset style={{ border: '1px solid #ccc', padding: 12, marginBottom: 16 }}>
        <legend>環境</legend>
        <label>owner: </label>
        <select value={owner} onChange={e => setOwner(e.target.value as 'tomo' | 'toshiki')}>
          <option value="toshiki">toshiki</option>
          <option value="tomo">tomo</option>
        </select>
        <label style={{ marginLeft: 16 }}>year: </label>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value, 10))} style={{ width: 80 }} />
        <label style={{ marginLeft: 16 }}>所得(足切り計算用): </label>
        <input type="number" value={totalIncome} onChange={e => setTotalIncome(parseInt(e.target.value, 10) || 0)} style={{ width: 120 }} />
        <button onClick={fetchAll} style={{ marginLeft: 16, padding: '4px 12px' }}>データ取得</button>
      </fieldset>

      <fieldset style={{ border: '1px solid #ccc', padding: 12, marginBottom: 16 }}>
        <legend>① 社会保険料控除(全額控除)</legend>
        <input
          type="number"
          placeholder="年額"
          defaultValue={Number(deductions.find(d => d.deduction_key === TAX_DEDUCTION_KEYS.socialInsurance)?.amount ?? 0)}
          onBlur={e => saveDeduction(TAX_DEDUCTION_KEYS.socialInsurance, { amount: parseInt(e.target.value, 10) || 0 })}
          style={{ width: 160 }}
        />
        <span style={{ marginLeft: 8, color: '#666', fontSize: 11 }}>blur で自動保存</span>
      </fieldset>

      <fieldset style={{ border: '1px solid #ccc', padding: 12, marginBottom: 16 }}>
        <legend>② 小規模企業共済等掛金控除(3カテゴリ別年額)</legend>
        {[
          { key: TAX_DEDUCTION_KEYS.smallEnterpriseKyosai, label: '小規模企業共済' },
          { key: TAX_DEDUCTION_KEYS.smallEnterpriseIdeco, label: 'iDeCo' },
          { key: TAX_DEDUCTION_KEYS.smallEnterpriseKokuminKikin, label: '国民年金基金' },
        ].map(item => (
          <div key={item.key} style={{ marginBottom: 6 }}>
            <label style={{ display: 'inline-block', width: 160, fontSize: 12 }}>{item.label}: </label>
            <input
              type="number"
              defaultValue={Number(deductions.find(d => d.deduction_key === item.key)?.amount ?? 0)}
              onBlur={e => saveDeduction(item.key, { amount: parseInt(e.target.value, 10) || 0 })}
              style={{ width: 160 }}
            />
          </div>
        ))}
      </fieldset>

      <fieldset style={{ border: '1px solid #ccc', padding: 12, marginBottom: 16 }}>
        <legend>③ 医療費控除</legend>
        <div style={{ marginBottom: 8 }}>
          <label style={{ width: 220, display: 'inline-block', fontSize: 12 }}>通知書記載額(年額):</label>
          <input
            type="number"
            defaultValue={Number(deductions.find(d => d.deduction_key === TAX_DEDUCTION_KEYS.medicalNotificationAmount)?.amount ?? 0)}
            onBlur={e => saveDeduction(TAX_DEDUCTION_KEYS.medicalNotificationAmount, { amount: parseInt(e.target.value, 10) || 0 })}
            style={{ width: 160 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ width: 220, display: 'inline-block', fontSize: 12 }}>保険等補填額:</label>
          <input
            type="number"
            defaultValue={Number(deductions.find(d => d.deduction_key === TAX_DEDUCTION_KEYS.medicalReimbursement)?.amount ?? 0)}
            onBlur={e => saveDeduction(TAX_DEDUCTION_KEYS.medicalReimbursement, { amount: parseInt(e.target.value, 10) || 0 })}
            style={{ width: 160 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ width: 220, display: 'inline-block', fontSize: 12 }}>適用方式:</label>
          <select
            defaultValue={(deductions.find(d => d.deduction_key === TAX_DEDUCTION_KEYS.medicalMethod)?.text_value ?? 'auto')}
            onChange={e => saveDeduction(TAX_DEDUCTION_KEYS.medicalMethod, { text_value: e.target.value })}
          >
            <option value="auto">自動有利判定</option>
            <option value="medical">医療費控除</option>
            <option value="self_medication">セルフメディケーション</option>
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ width: 220, display: 'inline-block', fontSize: 12 }}>セルメデ要件(健診・予防接種):</label>
          <input
            type="checkbox"
            defaultChecked={Boolean(deductions.find(d => d.deduction_key === TAX_DEDUCTION_KEYS.selfmedQualified)?.bool_value)}
            onChange={e => saveDeduction(TAX_DEDUCTION_KEYS.selfmedQualified, { bool_value: e.target.checked })}
          />
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid #ccc', padding: 12, marginBottom: 16 }}>
        <legend>④ 医療費明細(追加)</legend>
        <DetailAddForm onAdd={addDetail} />
        <hr style={{ margin: '12px 0' }} />
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: 4, textAlign: 'left' }}>日付</th>
              <th style={{ padding: 4, textAlign: 'left' }}>受診者</th>
              <th style={{ padding: 4, textAlign: 'left' }}>カテゴリ</th>
              <th style={{ padding: 4, textAlign: 'left' }}>支払先</th>
              <th style={{ padding: 4, textAlign: 'right' }}>金額</th>
              <th style={{ padding: 4, textAlign: 'right' }}>補填</th>
              <th style={{ padding: 4, textAlign: 'center' }}>★セルメデ</th>
              <th style={{ padding: 4 }}></th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: 4 }}>{d.expense_date}</td>
                <td style={{ padding: 4 }}>{PATIENT_TYPES.find(p => p.key === d.patient_type)?.label}</td>
                <td style={{ padding: 4 }}>{MEDICAL_CATEGORIES.find(c => c.key === d.category)?.label}</td>
                <td style={{ padding: 4 }}>{d.vendor ?? '—'}</td>
                <td style={{ padding: 4, textAlign: 'right' }}>{Number(d.amount).toLocaleString()}</td>
                <td style={{ padding: 4, textAlign: 'right' }}>{Number(d.reimbursement).toLocaleString()}</td>
                <td style={{ padding: 4, textAlign: 'center' }}>{d.is_selfmed ? '★' : ''}</td>
                <td style={{ padding: 4 }}>
                  <button onClick={() => { if (confirm('削除しますか?')) deleteDetail(d.id); }} style={{ fontSize: 10 }}>削除</button>
                </td>
              </tr>
            ))}
            {details.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 8, color: '#999', textAlign: 'center' }}>明細なし</td></tr>
            )}
          </tbody>
        </table>
      </fieldset>

      <fieldset style={{ border: '2px solid #1B4D3E', padding: 12, marginBottom: 16, background: '#fafafa' }}>
        <legend><strong>計算結果(taxDeductionCalc.ts)</strong></legend>
        <pre style={{ fontSize: 11, lineHeight: 1.6, margin: 0 }}>
{`社会保険料控除:           ${calc.socialInsurance.toLocaleString()} 円
小規模企業共済等掛金控除: ${calc.smallEnterprise.toLocaleString()} 円
医療費控除(採用方式):     ${calc.medical.toLocaleString()} 円
─────────────────────
所得控除合計:             ${calc.total.toLocaleString()} 円

【医療費控除の内訳】
  支払医療費合計:    ${calc.breakdown.medicalCalc.paidTotal.toLocaleString()} 円
  補填額合計:        ${calc.breakdown.medicalCalc.reimbursementTotal.toLocaleString()} 円
  正味医療費:        ${calc.breakdown.medicalCalc.netExpense.toLocaleString()} 円
  足切り基準:        ${calc.breakdown.medicalCalc.threshold.toLocaleString()} 円(所得${totalIncome < 2_000_000 ? '×5%' : '基準10万円'})
  医療費控除額:      ${calc.breakdown.medicalCalc.deduction.toLocaleString()} 円

【セルフメディケーション税制】
  対象購入額合計:    ${calc.breakdown.selfmedCalc.paidTotal.toLocaleString()} 円
  補填額合計:        ${calc.breakdown.selfmedCalc.reimbursementTotal.toLocaleString()} 円
  適用要件充足:      ${calc.breakdown.selfmedCalc.qualified ? '✓' : '×'}
  セルメデ控除額:    ${calc.breakdown.selfmedCalc.deduction.toLocaleString()} 円

【有利判定】
  推奨方式:          ${calc.breakdown.advantage.recommended === 'medical' ? '医療費控除' : calc.breakdown.advantage.recommended === 'self_medication' ? 'セルフメディケーション' : '同額'}
  採用方式:          ${calc.breakdown.advantage.applied === 'medical' ? '医療費控除' : calc.breakdown.advantage.applied === 'self_medication' ? 'セルフメディケーション' : '採用なし'}
  両方式の差:        ${calc.breakdown.advantage.difference.toLocaleString()} 円`}
        </pre>
      </fieldset>

      <fieldset style={{ border: '1px solid #ccc', padding: 12 }}>
        <legend>ログ</legend>
        <pre style={{ fontSize: 10, maxHeight: 200, overflow: 'auto', margin: 0, background: '#f8f8f8', padding: 8 }}>
          {log.length === 0 ? '(ログなし)' : log.join('\n')}
        </pre>
      </fieldset>
    </div>
  );
}

// 明細追加フォーム
function DetailAddForm({ onAdd }: { onAdd: (payload: Partial<MedicalExpenseDetail>) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [patientType, setPatientType] = useState<'self' | 'family' | 'other'>('self');
  const [category, setCategory] = useState<'otc' | 'transport' | 'dental' | 'care' | 'other'>('otc');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [reimbursement, setReimbursement] = useState('');
  const [isSelfmed, setIsSelfmed] = useState(false);

  const submit = () => {
    if (!amount || parseInt(amount, 10) <= 0) {
      alert('金額を入力してください');
      return;
    }
    onAdd({
      expense_date: date,
      patient_type: patientType,
      category,
      vendor: vendor || null,
      amount: parseInt(amount, 10),
      reimbursement: parseInt(reimbursement || '0', 10),
      is_selfmed: isSelfmed,
    });
    setVendor('');
    setAmount('');
    setReimbursement('');
    setIsSelfmed(false);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11 }}>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <select value={patientType} onChange={e => setPatientType(e.target.value as 'self' | 'family' | 'other')}>
        {PATIENT_TYPES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <select value={category} onChange={e => setCategory(e.target.value as typeof category)}>
        {MEDICAL_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <input type="text" placeholder="支払先" value={vendor} onChange={e => setVendor(e.target.value)} style={{ width: 120 }} />
      <input type="number" placeholder="金額" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 80 }} />
      <input type="number" placeholder="補填" value={reimbursement} onChange={e => setReimbursement(e.target.value)} style={{ width: 60 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={isSelfmed} onChange={e => setIsSelfmed(e.target.checked)} />
        ★セルメデ
      </label>
      <button onClick={submit} style={{ padding: '4px 10px' }}>追加</button>
    </div>
  );
}
