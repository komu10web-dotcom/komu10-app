/**
 * 領収書ファイル名の自動生成（v0.11.0）
 *
 * フォーマット:
 *   YYYYMMDD_[勘定科目]_[支払先]_[担当者]_[摘要要約30文字]_[連番]_[ラベル].拡張子
 *
 * サニタイズ:
 *   / \ : * ? " < > | → _ 置換
 *   全角/半角スペース → 削除
 *   全角/半角カッコ類 → 削除
 *   連続 _ → 圧縮
 *   先頭/末尾 _ → トリム
 */

export interface FilenameInput {
  date: string;
  kamoku_label: string;
  store: string | null;
  owner: string;
  description: string | null;
  seq_no: number;
  label?: string | null;
  original_filename: string;
}

const OWNER_LABEL: Record<string, string> = {
  tomo: 'トモ',
  toshiki: 'トシキ',
};

export function sanitizeForFilename(input: string): string {
  if (!input) return '';
  return input
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[()（）[\]【】{}「」『』〈〉《》]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDateYYYYMMDD(date: string): string {
  if (!date) return '00000000';
  const normalized = date.replace(/[-/]/g, '');
  return normalized.padEnd(8, '0').substring(0, 8);
}

function extractExtension(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'bin';
}

function formatSeqNo(seq: number): string {
  return String(seq).padStart(2, '0');
}

export function generateReceiptFilename(input: FilenameInput): string {
  const parts: string[] = [];
  parts.push(formatDateYYYYMMDD(input.date));
  parts.push(sanitizeForFilename(input.kamoku_label || 'その他'));
  parts.push(sanitizeForFilename(input.store || '支払先不明'));
  parts.push(OWNER_LABEL[input.owner] || input.owner);

  const desc = sanitizeForFilename(input.description || '').substring(0, 30);
  if (desc) parts.push(desc);

  parts.push(formatSeqNo(input.seq_no));

  const label = sanitizeForFilename(input.label || '');
  if (label) parts.push(label);

  const base = parts.join('_');
  const ext = extractExtension(input.original_filename);
  return `${base}.${ext}`;
}
