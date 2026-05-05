'use client';

/**
 * XLineTaper.tsx — komu10 X ライン Type I/II 静的版
 *
 * 正典: canon-x-line-v1.1(s75 確定 / Drive `1yr7kVFWp9JFmkSTm2nSWgTZEoS9CVoc2`)
 * 派生運用: canon-x-line-applications-v1.0(s89 確定 / Drive `1SFQYWEjsT0tz-v1XtSZ9Kzpx4XKtabfA`)
 *
 * 仕様:
 *   - Type II 非対称テーパー: 片側のみ細くなる(polygon で実装)
 *   - Type I 対称テーパー: 両端から細くなる(polygon で実装)
 *   - stroke 5値固定: 0.4 / 0.6 / 1.0 / 1.6 / 2.6 pt
 *   - テーパー率 5値: 52 / 32 / 20 / 12 / 8 %
 *   - 線端 butt 固定(round 禁止)
 *   - 色: 単色 or グラデ(双方向)
 *
 * 実装責任:
 *   起草 = Patrick Collison(s91 v0.48.0)
 *   SVG 監修 = Sara Soueidan
 *   規定書整合性 = Paula Scher(CDO)
 *   最終裁定 = Hedi Slimane(CEO)
 *
 * 失敗事例#59 是正の構造的継続。
 */

import { useReducedMotion, motion } from 'framer-motion';

type XLineType = 'II-1' | 'II-2' | 'II-3' | 'II-4' | 'II-5'
               | 'I-1' | 'I-2' | 'I-3' | 'I-4' | 'I-5';
type XLineDirection = 'forward' | 'reverse';
type XLineColor = 'gold-on-dark' | 'gold-on-light' | 'milk-solid' | 'black-solid' | 'gold-solid';

// canon-x-line-v1.1 §3 規定値
const STROKE_VALUES: Record<XLineType, number> = {
  'II-1': 0.4, 'II-2': 0.6, 'II-3': 1.0, 'II-4': 1.6, 'II-5': 2.6,
  'I-1': 0.4,  'I-2': 0.6,  'I-3': 1.0,  'I-4': 1.6,  'I-5': 2.6,
};

const TAPER_RATES: Record<XLineType, number> = {
  // Type II 非対称(stroke ごとにテーパー率)
  'II-1': 0.52, 'II-2': 0.32, 'II-3': 0.20, 'II-4': 0.12, 'II-5': 0.08,
  // Type I 対称(stroke ごとにテーパー率)
  'I-1': 0.50, 'I-2': 0.33, 'I-3': 0.20, 'I-4': 0.12, 'I-5': 0.08,
};

interface XLineTaperProps {
  /** X ライン種別 */
  type: XLineType;
  /** Type II の方向(Type I では無視) */
  direction?: XLineDirection;
  /** 色運用 */
  color?: XLineColor;
  /** 表示幅(px・親要素 100% 利用なら省略) */
  width?: number | string;
  /** 章扉モードのフェードイン演出を有効化 */
  animate?: boolean;
  /** スタイル上書き */
  style?: React.CSSProperties;
  /** ARIA */
  'aria-hidden'?: boolean;
}

export default function XLineTaper({
  type,
  direction = 'forward',
  color = 'gold-on-dark',
  width = '100%',
  animate = false,
  style,
  'aria-hidden': ariaHidden = true,
}: XLineTaperProps) {
  const reduceMotion = useReducedMotion();
  const stroke = STROKE_VALUES[type];
  const taperRate = TAPER_RATES[type];
  const isType1 = type.startsWith('I-');

  // SVG 設計:
  // - viewBox = 1000 x stroke*10(stroke を視覚解像度の十分な倍率にする)
  // - 線の左端(または両端)は taperRate * stroke の太さ
  // - 線の右端は stroke の太さ(Type II Forward 時)
  // - polygon で台形を描く
  const vbHeight = stroke * 10;
  const thickEnd = vbHeight;       // 太い側の高さ(viewBox 単位)
  const thinEnd = vbHeight * taperRate; // 細い側の高さ

  // polygon の4頂点座標(viewBox 0..1000 x 0..vbHeight)
  let points: string;
  if (isType1) {
    // Type I 対称: 両端から細くなる
    const halfMid = thickEnd / 2;
    const halfEnd = thinEnd / 2;
    points = [
      `0,${halfMid - halfEnd}`,            // 左端 上
      `500,0`,                              // 中央 上
      `1000,${halfMid - halfEnd}`,          // 右端 上
      `1000,${halfMid + halfEnd}`,          // 右端 下
      `500,${vbHeight}`,                    // 中央 下
      `0,${halfMid + halfEnd}`,             // 左端 下
    ].join(' ');
  } else {
    // Type II 非対称: 片側のみ細くなる
    if (direction === 'forward') {
      // 左 = 細い / 右 = 太い
      const leftTopY = (thickEnd - thinEnd) / 2;
      const leftBotY = leftTopY + thinEnd;
      points = [
        `0,${leftTopY}`,
        `1000,0`,
        `1000,${vbHeight}`,
        `0,${leftBotY}`,
      ].join(' ');
    } else {
      // 左 = 太い / 右 = 細い(Reverse)
      const rightTopY = (thickEnd - thinEnd) / 2;
      const rightBotY = rightTopY + thinEnd;
      points = [
        `0,0`,
        `1000,${rightTopY}`,
        `1000,${rightBotY}`,
        `0,${vbHeight}`,
      ].join(' ');
    }
  }

  // 色運用(canon §4.1 基本バリエーション完全遵守)
  const fillSpec = (() => {
    switch (color) {
      case 'gold-on-dark':
        // 暗背景: X Milk(#FAFAF6)⇄ X Gold(#B8893A)グラデ
        return { type: 'gradient', start: '#FAFAF6', end: '#B8893A' } as const;
      case 'gold-on-light':
        // 明背景: X Black(#0A0A0B)⇄ X Gold(#B8893A)グラデ
        return { type: 'gradient', start: '#0A0A0B', end: '#B8893A' } as const;
      case 'gold-solid':
        return { type: 'solid', color: '#B8893A' } as const;
      case 'milk-solid':
        return { type: 'solid', color: '#FAFAF6' } as const;
      case 'black-solid':
        return { type: 'solid', color: '#0A0A0B' } as const;
    }
  })();

  // Reverse 時はグラデ方向を反転
  const gradX1 = direction === 'reverse' ? '1' : '0';
  const gradX2 = direction === 'reverse' ? '0' : '1';

  // 一意な gradient ID
  const gradId = `xline-grad-${type}-${direction}-${color}-${Math.random().toString(36).slice(2, 8)}`;

  const svgContent = (
    <svg
      width={width}
      height={Math.max(stroke + 1, 4)}
      viewBox={`0 0 1000 ${vbHeight}`}
      preserveAspectRatio="none"
      style={{ display: 'block', ...style }}
      aria-hidden={ariaHidden}
    >
      {fillSpec.type === 'gradient' && (
        <defs>
          <linearGradient id={gradId} x1={gradX1} y1="0" x2={gradX2} y2="0">
            <stop offset="0%" stopColor={fillSpec.start} />
            <stop offset="100%" stopColor={fillSpec.end} />
          </linearGradient>
        </defs>
      )}
      <polygon
        points={points}
        fill={fillSpec.type === 'gradient' ? `url(#${gradId})` : fillSpec.color}
      />
    </svg>
  );

  // 章扉モードの「描き出し」演出: 太い側からの幅伸長
  if (animate && !reduceMotion) {
    return (
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{
          transformOrigin: direction === 'forward' ? 'right center' : 'left center',
          width: '100%',
        }}
      >
        {svgContent}
      </motion.div>
    );
  }

  return svgContent;
}
