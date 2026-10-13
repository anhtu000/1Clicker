// Builds tools/sim/out/report.html from tools/sim/out/report.json and the content files.
// Run after `npm run sim`: node --experimental-strip-types tools/sim/report.ts
// The page is in Vietnamese: it is read by the project owner, not by players.
import { readFileSync, writeFileSync } from 'node:fs';
import { formatNumber } from '../../core/format.ts';
import { loadContent } from './player.ts';

const content = loadContent((p) => readFileSync(p, 'utf8'));
const report = JSON.parse(readFileSync('tools/sim/out/report.json', 'utf8'));
const P = report.policies;
const S = report.profiles.slow;
const IDLE = report.profiles.idle;
const NORMAL = report.profiles.normal;
/** First main run (collection bonus), when the sim has it. */
const MAIN = report.mainRun as Record<string, { p10: number; p50: number; p90: number }> | undefined;

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const num = (n: number) => formatNumber(n);
const vi = (s: string | number) => String(s).replace('.', ',');
const oneIn = (p: number) => (1 / p < 10 ? `1 / ${vi((1 / p).toFixed(1))}` : `1 / ${num(Math.round(1 / p))}`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const TIER_VI = ['Bụi sao', 'Thiên thạch', 'Tiểu hành tinh', 'Sao chổi', 'Mặt trăng', 'Hành tinh', 'Khí khổng lồ', 'Ngôi sao', 'Hố đen', 'Thiên hà'];
const RARITY_VI = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const UPGRADE_VI: Record<string, [string, string]> = {
  focus: ['Core Focus', 'Nhấp tay: cấp 1 ×2,25, mỗi cấp sau ×1,5 (không tăng tàu thu), 25 cấp. Trước khi có Thiên hà chỉ tới cấp 17; từ cấp 21 giá tăng ×1,8 mỗi cấp'],
  slots: ['Orbit Ring', 'Hiện khi có Mặt trăng. +1 ô trên bảng mỗi cấp, 8 cấp (8 → 16 ô); giá từ 10M, mỗi cấp khoảng ×2,2'],
  discount: ['Lean Optics', 'Hiện khi có Tiểu hành tinh. Giá quét ×0,88 mỗi cấp, 11 cấp; trước khi có Thiên hà chỉ tới cấp 8'],
  fleet: ['Probe Fleet', 'Hiện khi có Tiểu hành tinh. Cấp 1 mở tàu thu (tự kiếm năng lượng, không cần nhấp; không nhận bằng quảng cáo). Các cấp sau nhân thu nhập tàu thu khoảng ×1,6, 20 cấp; trước khi có Thiên hà chỉ tới cấp 13; từ cấp 16 giá tăng ×1,8 mỗi cấp'],
  crit: ['Supernova Tap', '+4% cơ hội nhấp chí mạng ×6 mỗi cấp, 8 cấp (chỉ nhấp tay)'],
  luck: ['Stellar Luck', 'Trọng số Rare trở lên +25% mỗi cấp, 8 cấp'],
  lens: ['Gravity Lens', 'Sau auto. Quét ra tối đa cấp 4 (Sao chổi). Tỉ lệ cấp 1/2/3/4: cấp 0 là 100/0/0/0%, cấp 10 là 40/30/20/10%'],
  binary: ['Binary Merge', 'Sau auto. +3% cơ hội ghép ra thêm 1 bản giống hệt (tới Khí khổng lồ)'],
  starMagnet: ['Star Magnet', 'Sau auto. Sao băng nhiều hơn 8% mỗi cấp, 8 cấp'],
  relay: ['Deep Space Relay', '+2 giờ trần thu nhập khi vắng mặt (gốc 2 giờ)'],
  autoScan: ['Auto Scanner', 'Tự quét mỗi 6 / 4 / 3 / 2 / 1,5 giây'],
  autoMerge: ['Gravity Well', 'Tự ghép một cặp mỗi 5 / 3,5 / 2,5 / 1,5 giây'],
};
const POLICY_VI: Record<string, string> = {
  none: 'Không xem quảng cáo',
  realistic: 'Xem quảng cáo thật',
  basic: 'Basic Launch (thưởng không cần quảng cáo)',
};

const median = (what: string, policy = 'none') => P[policy].milestoneMedians[what] as number | undefined;
const tierWhat = (t: number) => `First ${content.tiers[t - 1].id} (tier ${t})`;

type Status = 'ok' | 'near' | 'miss';
const chip = (s: Status) =>
  `<span class="chip ${s}">${s === 'ok' ? 'Đạt' : s === 'near' ? 'Sát mốc' : 'Chưa đạt'}</span>`;
const within = (v: number, lo: number, hi: number, slack = 0.1): Status =>
  v >= lo && v <= hi ? 'ok' : v >= lo * (1 - slack) && v <= hi * (1 + slack) ? 'near' : 'miss';

// ---------- verdict rows ----------
const probes = ['none', 'realistic', 'basic'].map((p) => median('Bought fleet L1', p) ?? 0);
const verdict: [string, string, string, Status][] = [
  ['Phần thưởng đầu tiên', 'Trong 5 giây', `Lần nhấp đầu cho +1 ngay. 90% người chơi có thiên thể đầu tiên sau ${P.none.firstScanP90 < 1 ? 'chưa tới 1 giây' : `${Math.ceil(P.none.firstScanP90)} giây`}`, P.none.firstScanP90 <= 5 ? 'ok' : 'near'],
  [
    '10 phút đầu có thứ mới',
    'Mỗi 1–2 phút',
    `Khoảng dài nhất giữa hai thứ mới: ${mmss(P.none.newThingGap.p50)} (trung vị), ${mmss(P.none.newThingGap.p90)} (90%)`,
    P.none.newThingGap.p90 <= 120 ? 'ok' : P.none.newThingGap.p90 <= 150 ? 'near' : 'miss',
  ],
  [
    'Tự động hoá',
    'Phút 4–5',
    `${mmss(probes[0])} không quảng cáo · ${mmss(probes[1])} có quảng cáo · ${mmss(probes[2])} Basic Launch`,
    probes.every((t) => t >= 240 && t <= 300) ? 'ok' : probes.every((t) => t >= 210 && t <= 330) ? 'near' : 'miss',
  ],
  [
    'Về đích lượt tính giờ, có quảng cáo',
    'Dưới 60 phút',
    `Trung vị ${mmss(P.realistic.p50)} (xem quảng cáo thật) · ${mmss(P.basic.p50)} (Basic Launch)`,
    [P.realistic.p50, P.basic.p50].every((t) => t <= 3600) ? 'ok' : 'near',
  ],
  ['Về đích lượt tính giờ, không quảng cáo', 'Dưới 60 phút', `Trung vị ${mmss(P.none.p50)}, 80% người chơi trong ${mmss(P.none.p10)}–${mmss(P.none.p90)}`, P.none.p50 <= 3600 ? 'ok' : P.none.p50 <= 3960 ? 'near' : 'miss'],
  ...(MAIN
    ? [
        [
          'Lượt chính đầu tiên (người mới)',
          'Tham khảo',
          `Trung vị ${mmss(MAIN.none.p50)} không quảng cáo · ${mmss(MAIN.realistic.p50)} có quảng cáo · ${mmss(MAIN.basic.p50)} Basic Launch. Từ 13/10 không còn thưởng bộ sưu tập, nên gần như bằng lượt tính giờ`,
          'ok',
        ] as [string, string, string, Status],
      ]
    : []),
  [
    'Nhấp đều so với chỉ để auto',
    'Thu nhập gấp khoảng 2 lần',
    `Nhấp 4,5 lần/giây cho thêm ${Math.round(NORMAL.none.tapToAuto.to30 * 100)}% so với auto trong 30 phút đầu, ${Math.round(NORMAL.none.tapToAuto.after30 * 100)}% sau đó`,
    NORMAL.none.tapToAuto.to30 >= 0.8 ? 'ok' : 'near',
  ],
  [
    'Người nhấp đều so với người thi thoảng nhấp',
    'Về đích sớm hơn 30–40%',
    `${mmss(NORMAL.none.p50)} so với ${mmss(IDLE.none.p50)}: sớm hơn ${Math.round((1 - NORMAL.none.p50 / IDLE.none.p50) * 100)}%`,
    within((1 - NORMAL.none.p50 / IDLE.none.p50) * 100, 30, 40),
  ],
  [
    'Khoảng chỉ nhấp, không mua được gì',
    '10–20 giây trong 10 phút đầu',
    `Dài nhất 10 phút đầu: ${Math.round(P.none.gapsP50.first10)} giây (trung vị). Sau phút 30: ${Math.round(P.none.gapsP50.after30)} giây`,
    P.none.gapsP50.first10 <= 21 ? 'ok' : 'near',
  ],
];

// ---------- finish-time chart ----------
const rows = [
  { id: 'none', label: POLICY_VI.none, d: P.none, slot: 1 },
  { id: 'realistic', label: POLICY_VI.realistic, d: P.realistic, slot: 2 },
  { id: 'basic', label: 'Basic Launch', d: P.basic, slot: 3 },
];
const slowRows = [
  { label: 'Không quảng cáo, nhấp chậm', d: S.none, slot: 1 },
  { label: 'Quảng cáo thật, nhấp chậm', d: S.realistic, slot: 2 },
  { label: 'Basic Launch, nhấp chậm', d: S.basic, slot: 3 },
  { label: 'Không quảng cáo, thi thoảng nhấp', d: IDLE.none, slot: 1 },
];
const MAX_MIN = 150;
const chartW = 640;
const labelW = 0;
const x = (sec: number) => labelW + (Math.min(sec / 60, MAX_MIN) / MAX_MIN) * chartW;
function rangeChart() {
  const all = [...rows.map((r) => ({ ...r, slow: false })), ...slowRows.map((r) => ({ ...r, slow: true }))];
  const rowH = 34;
  const top = 26;
  const h = top + all.length * rowH + 30;
  let svg = `<svg viewBox="-8 0 ${chartW + 16} ${h}" role="img" aria-label="Thời gian về đích theo cách dùng quảng cáo">`;
  // target bands
  // Target since 13/10: under an hour with or without ads.
  svg += `<rect x="${x(0)}" y="${top - 8}" width="${x(60 * 60) - x(0)}" height="${all.length * rowH + 4}" class="band"/>`;
  svg += `<text x="${x(30 * 60)}" y="12" class="bandlab" text-anchor="middle">mục tiêu: dưới 1 giờ</text>`;
  for (let m = 0; m <= MAX_MIN; m += 10) {
    svg += `<line x1="${x(m * 60)}" x2="${x(m * 60)}" y1="${top - 8}" y2="${top + all.length * rowH - 4}" class="grid"/>`;
    svg += `<text x="${x(m * 60)}" y="${h - 8}" class="tick" text-anchor="middle">${m}</text>`;
  }
  all.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2 - 4;
    const tip = `${r.label}: 10% về đích trước ${mmss(r.d.p10)}, trung vị ${mmss(r.d.p50)}, 90% trước ${mmss(r.d.p90)}`;
    svg += `<g class="row"><title>${esc(tip)}</title>`;
    svg += `<rect x="${x(r.d.p10)}" y="${cy - 5}" width="${Math.max(2, x(r.d.p90) - x(r.d.p10))}" height="10" rx="4" class="rng s${r.slot}${r.slow ? ' slow' : ''}"/>`;
    svg += `<circle cx="${x(r.d.p50)}" cy="${cy}" r="6" class="dot s${r.slot}"/>`;
    svg += `<text x="${x(r.d.p90) + 10}" y="${cy + 4}" class="val">${mmss(r.d.p50)}</text>`;
    svg += `</g>`;
  });
  svg += `</svg>`;
  const legend = all
    .map((r, i) => `<li><span class="key s${r.slot}${r.slow ? ' slow' : ''}"></span>${esc(r.label)}<span class="muted">hàng ${i + 1}</span></li>`)
    .join('');
  return { svg, legend, all };
}
const chart = rangeChart();

// ---------- timeline (no ads, median minute of each event) ----------
const WHAT_VI = (w: string): string | null => {
  let m = /^First (\w+) \(tier (\d+)\)$/.exec(w);
  if (m) return `Có <b>${TIER_VI[Number(m[2]) - 1]}</b> đầu tiên (cấp ${m[2]})`;
  m = /^First (rare|epic|legendary|mythic)$/.exec(w);
  if (m) return `Ra <b>${m[1][0].toUpperCase() + m[1].slice(1)}</b> đầu tiên`;
  if (w === 'First shooting star caught') return 'Bắt được <b>sao băng</b> đầu tiên';
  m = /^Bought (\w+) L1$/.exec(w);
  if (m) return `Mua <b>${UPGRADE_VI[m[1]]?.[0] ?? m[1]}</b> cấp 1`;
  if (w.startsWith('Automation')) return null;
  return null;
};
const timeline = Object.entries(P.none.milestoneMedians as Record<string, number>)
  .map(([w, t]) => ({ w, t, vi: WHAT_VI(w) }))
  .filter((e) => e.vi && e.t <= 15 * 60)
  .sort((a, b) => a.t - b.t);

// ---------- tier table ----------
const tierRows = content.tiers
  .map((_, i) => {
    const t = i + 1;
    const cells = ['none', 'realistic', 'basic'].map((p) => {
      const v = median(tierWhat(t), p);
      return `<td class="n">${v === undefined ? '–' : mmss(v)}</td>`;
    });
    return `<tr><td>${t}</td><td>${TIER_VI[i]}</td><td class="n">${num(content.economy.tierValueGrowth ** i * (content.economy.bodyValueScale ?? 1))}</td>${cells.join('')}</tr>`;
  })
  .join('');

// ---------- rarity table ----------
const weights = content.rarities.map((r) => r.weight);
const total = weights.reduce((a, b) => a + b, 0);
const luckMax = 1 + 0.3 * 5;
const totalLuck = weights[0] + weights.slice(1).reduce((a, b) => a + b * luckMax, 0);
const pityText = (i: number) => {
  const rule = content.pity.find((p) => p.minTier === i);
  return rule ? `chắc chắn trong ${rule.within} lượt` : i === 4 ? 'không có' : '–';
};
const rarityRows = content.rarities
  .map((r, i) => {
    const p = r.weight / total;
    const pl = (i === 0 ? r.weight : r.weight * luckMax) / totalLuck;
    return `<tr><td><span class="rar" style="--rc:${r.color}"></span>${RARITY_VI[i]}</td><td class="n">${vi((p * 100).toFixed(1))}%</td><td class="n">${oneIn(p)}</td><td class="n">${oneIn(pl)}</td><td class="n">×${String(r.mult).replace('.', ',')}</td><td>${pityText(i)}</td></tr>`;
  })
  .join('');

// ---------- upgrade table ----------
const upgradeRows = content.upgrades
  .map((u) => {
    const [name, what] = UPGRADE_VI[u.id] ?? [u.id, ''];
    const costs = (u.costs ?? []).map(num).join(' · ');
    const plan = median(`Bought ${u.id} L1`);
    return `<tr><td><b>${name}</b><div class="muted">${what}</div></td><td class="n">${u.max}</td><td class="n">${plan === undefined ? '–' : mmss(plan)}</td><td class="mono costs">${costs}</td></tr>`;
  })
  .join('');

// ---------- scan price examples ----------
const sc = content.economy.scan;
const scanAt = (u: number) => Math.ceil(sc.baseCost * ((u + 1) ** sc.exponent - u ** sc.exponent));
const scanExamples = [0, 1, 3, 7, 15, 31, 63, 127, 255]
  .map((u) => `<tr><td class="n">${u + 1}</td><td class="n">${num(scanAt(u))}</td></tr>`)
  .join('');

const reward = content.economy.rewarded;
const generated = new Date(report.generatedAt);
const stamp = `${generated.getDate()}/${generated.getMonth() + 1}/${generated.getFullYear()}`;

const html = `<title>Kinh tế Cosmic RNG Clicker</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column; verdict first, then charts and tables that back it up. */
:root {
  --bg: #f5f6fa; --panel: #ffffff; --fg: #161827; --muted: #5d6178; --line: #e1e4ee; --accent: #3d47b8;
  --ok: #1d7a46; --ok-bg: #e3f3ea; --near: #8a5a00; --near-bg: #fbf0d9; --miss: #a3322f; --miss-bg: #f9e4e3;
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --band: rgba(61,71,184,.07); --band2: rgba(61,71,184,.04);
  --display: "Be Vietnam Pro", system-ui, sans-serif; --body: "Be Vietnam Pro", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #10121c; --panel: #171a28; --fg: #e9ebf5; --muted: #a3a8c3; --line: #2a2f45; --accent: #9aa3ff;
  --ok: #6fd39b; --ok-bg: #173325; --near: #f1c46b; --near-bg: #3a2e14; --miss: #f19b98; --miss-bg: #3b1d1c;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --band: rgba(154,163,255,.09); --band2: rgba(154,163,255,.05); color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #10121c; --panel: #171a28; --fg: #e9ebf5; --muted: #a3a8c3; --line: #2a2f45; --accent: #9aa3ff;
  --ok: #6fd39b; --ok-bg: #173325; --near: #f1c46b; --near-bg: #3a2e14; --miss: #f19b98; --miss-bg: #3b1d1c;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --band: rgba(154,163,255,.09); --band2: rgba(154,163,255,.05); color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--body); }
.wrap { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; display: grid; gap: 40px; }
header { display: grid; gap: 8px; }
.eyebrow { font: 500 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { font: 700 30px/1.2 var(--display); margin: 0; text-wrap: balance; letter-spacing: -0.01em; }
h2 { font: 600 20px/1.3 var(--display); margin: 0 0 6px; text-wrap: balance; }
p { margin: 0; max-width: 68ch; }
.muted { color: var(--muted); font-size: 13px; }
section { display: grid; gap: 14px; min-width: 0; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font: 500 12px/1.3 var(--mono); color: var(--muted); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td.n, .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
td.n { white-space: nowrap; }
.costs { font-size: 12.5px; line-height: 1.7; min-width: 260px; }
.chip { display: inline-block; font: 600 12px/1 var(--body); padding: 5px 9px; border-radius: 999px; white-space: nowrap; }
.chip.ok { color: var(--ok); background: var(--ok-bg); } .chip.near { color: var(--near); background: var(--near-bg); } .chip.miss { color: var(--miss); background: var(--miss-bg); }
.rar { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--rc); margin-right: 8px; box-shadow: 0 0 0 2px var(--panel), 0 0 0 3px var(--line); }
.chart { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 12px 6px; overflow-x: auto; }
.chart svg { width: 100%; min-width: 520px; height: auto; display: block; }
.grid { stroke: var(--line); stroke-width: 1; } .tick, .val, .bandlab { fill: var(--muted); font: 11px var(--mono); } .val { fill: var(--fg); font-weight: 500; }
.band { fill: var(--band); } .band.b2 { fill: var(--band2); }
.rng { opacity: .35; } .rng.slow { opacity: .18; }
.s1 { fill: var(--s1); background: var(--s1); } .s2 { fill: var(--s2); background: var(--s2); } .s3 { fill: var(--s3); background: var(--s3); }
.dot { stroke: var(--panel); stroke-width: 2; }
.legend { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; }
.legend li { display: flex; align-items: center; gap: 8px; } .legend .muted { font-size: 11px; }
.key { width: 18px; height: 8px; border-radius: 4px; display: inline-block; } .key.slow { opacity: .45; }
ol.tl { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--line); display: grid; gap: 2px; }
ol.tl li { display: grid; grid-template-columns: 56px 1fr; gap: 12px; padding: 4px 0 4px 14px; position: relative; }
ol.tl li::before { content: ""; position: absolute; left: -5px; top: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
ol.tl time { font: 500 13px/1.6 var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; }
ul.plain { margin: 0; padding-left: 18px; display: grid; gap: 6px; max-width: 70ch; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.two > * { min-width: 0; }
code { font: 13px var(--mono); background: var(--band); padding: 1px 5px; border-radius: 4px; }
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Game #1 · mô phỏng ${report.seeds} lượt mỗi trường hợp · ${stamp}</div>
  <h1>Kinh tế Cosmic RNG Clicker</h1>
  <p>Kết quả mô phỏng một người chơi trên đúng code kinh tế của game (<code>src/logic</code>) với nội dung trong <code>src/content/*.json</code>. Số dưới đây là đề xuất, chờ duyệt trước khi chốt.</p>
</header>

<section>
  <h2>Đối chiếu với mốc</h2>
  <div class="scroll"><table>
    <thead><tr><th>Mốc</th><th>Cần</th><th>Mô phỏng</th><th></th></tr></thead>
    <tbody>${verdict.map(([a, b, c, s]) => `<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td><td>${chip(s)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="muted">"Thứ mới" gồm: cấp thiên thể mới, độ hiếm mới, thẻ nâng cấp mới hiện trong shop, lần mua đầu của một nâng cấp, sao băng đầu tiên. Khoảng "chỉ nhấp" là lúc người chơi đang nhấp để đủ tiền cho món tiếp theo, không có quét, ghép, mua hay bắt sao.</p>
</section>

<section>
  <h2>Thời gian về đích</h2>
  <p class="muted">Đây là lượt tính giờ. ${MAIN ? `Lượt chính đầu tiên của người mới (kiểm tra chéo): trung vị ${mmss(MAIN.none.p50)} không quảng cáo, ${mmss(MAIN.realistic.p50)} có quảng cáo, ${mmss(MAIN.basic.p50)} Basic Launch. ` : ''}Vạch là khoảng 80% người chơi ở giữa (10% đến 90%), chấm là trung vị. Hàng nhạt: người nhấp chậm bằng nửa, và người chỉ thi thoảng nhấp sau khi có auto. Thời gian tính cả lúc xem quảng cáo.</p>
  <div class="chart">${chart.svg}<ul class="legend">${chart.legend}</ul></div>
  <div class="scroll"><table>
    <thead><tr><th>Trường hợp</th><th>10%</th><th>Trung vị</th><th>90%</th><th>Thưởng đã dùng</th></tr></thead>
    <tbody>${chart.all
      .map(
        (r) =>
          `<tr><td>${esc(r.label)}</td><td class="n">${mmss(r.d.p10)}</td><td class="n">${mmss(r.d.p50)}</td><td class="n">${mmss(r.d.p90)}</td><td class="n">${r.d.rewardsP50 ? `${r.d.rewardsP50.freeUpgrade} nâng cấp · ${r.d.rewardsP50.luckyScan} quét` : '–'}</td></tr>`,
      )
      .join('')}</tbody>
  </table></div>
</section>

<section>
  <h2>15 phút đầu, không xem quảng cáo</h2>
  <p class="muted">Phút trung vị của từng sự kiện trên ${report.seeds} lượt. Người chơi còn mua thêm các cấp sau của nâng cấp ở giữa các mốc này.</p>
  <ol class="tl">${timeline.map((e) => `<li><time>${mmss(e.t)}</time><span>${e.vi}</span></li>`).join('')}</ol>
</section>

<section>
  <h2>Cấp thiên thể</h2>
  <p class="muted">Ghép 2 thiên thể cùng cấp thành cấp sau. Sức mạnh mỗi cấp gấp ${content.economy.tierValueGrowth} cấp trước, nhân thêm theo độ hiếm, rồi ×${vi(content.economy.bodyValueScale ?? 1)} (từ 13/10). Năng lượng mỗi lần nhấp = (1 + tổng sức mạnh trên bảng) × nâng cấp. Thiên thể ẩn có sức mạnh bằng ${content.specials.map((sp) => vi(sp.power)).join(', ')} Thiên hà cùng độ hiếm (theo thứ tự ${content.specials.map((sp) => TIER_VI[sp.tier - 1]).join(', ')} + Thiên hà).</p>
  <p class="muted">Thưởng khi ghép: mỗi lần ghép trả một phần giá Scan hiện tại, theo cấp của cặp và độ hiếm của mảnh hiếm hơn (cấp 1 Common 0%, cấp 8 Legendary 100%).</p>
  <div class="scroll"><table>
    <thead><tr><th>Cấp</th>${content.rarities.map((r) => `<th>${r.id[0].toUpperCase()}${r.id.slice(1)}</th>`).join('')}</tr></thead>
    <tbody>${content.economy.mergeBonus.scanShare.map((row, i) => `<tr><td>${i + 1}</td>${row.map((v) => `<td>${Math.round(v * 100)}%</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>
  <div class="scroll"><table>
    <thead><tr><th>Cấp</th><th>Thiên thể</th><th>Sức mạnh</th><th>Không QC</th><th>QC thật</th><th>Basic</th></tr></thead>
    <tbody>${tierRows}</tbody>
  </table></div>
</section>

<section>
  <h2>Độ hiếm và tỉ lệ</h2>
  <p class="muted">Mỗi lần quét và mỗi lần ghép đều quay độ hiếm. Ghép hai thiên thể: ${Math.round(content.economy.mergeRarity.keepAverage * 100)}% ra đúng trung bình cộng độ hiếm của cặp (làm tròn xuống, ví dụ Epic với Common ra Rare), còn lại quay theo tỉ lệ gốc có Stellar Luck, nên có thể thấp hơn hoặc cao hơn. Ghép lên ${TIER_VI[content.economy.mergeRarity.rollFromTier - 1]} và ${TIER_VI[content.economy.goalTier - 1]} luôn quay theo tỉ lệ gốc. 5 bậc × 10 cấp = 50 thiên thể để sưu tầm; từ 13/10 thiên thể mới không cộng năng lượng.</p>
  <div class="scroll"><table>
    <thead><tr><th>Độ hiếm</th><th>Tỉ lệ</th><th>Hiện trong game</th><th>Stellar Luck tối đa</th><th>Sức mạnh</th><th>Bảo hiểm</th></tr></thead>
    <tbody>${rarityRows}</tbody>
  </table></div>
  <p class="muted">Bảo hiểm Legendary tính cho Legendary hoặc cao hơn. Lượt quét thứ ${content.economy.script.rareScan} và lần ghép đầu tiên luôn ra Rare trở lên. Trung vị người chơi sưu tầm được ${P.none.codexP50}/50 lúc về đích.</p>
</section>

<section>
  <h2>Nâng cấp và giá</h2>
  <p class="muted">Giá từng cấp, cách nhau bằng dấu chấm giữa. Cột "Mua lần đầu" là phút trung vị người chơi không xem quảng cáo mua cấp 1. Tổng ${content.upgrades.length} dòng nâng cấp, ${content.upgrades.reduce((a, u) => a + u.max, 0)} cấp.</p>
  <div class="scroll"><table>
    <thead><tr><th>Nâng cấp</th><th>Cấp</th><th>Mua lần đầu</th><th>Giá từng cấp</th></tr></thead>
    <tbody>${upgradeRows}</tbody>
  </table></div>
</section>

<section class="two">
  <div style="display:grid;gap:10px">
    <h2>Giá quét</h2>
    <p class="muted">Tổng đã trả cho U đơn vị bụi sao = ${String(sc.baseCost).replace('.', ',')} × U<sup>${String(sc.exponent).replace('.', ',')}</sup>. Mỗi lần quét là 1 đơn vị. Giá dưới đây chưa tính Lean Optics.</p>
    <div class="scroll"><table><thead><tr><th>Đơn vị thứ</th><th>Giá</th></tr></thead><tbody>${scanExamples}</tbody></table></div>
  </div>
  <div style="display:grid;gap:10px;align-content:start">
    <h2>Quảng cáo có thưởng</h2>
    <ul class="plain">
      <li><b>Nâng cấp miễn phí</b>: gắn trên món đắt nhất chưa mua được, trong tầm ${vi(reward.freeUpgrade.maxIncomeSeconds / 60)} phút thu nhập. Hồi ${vi(reward.freeUpgrade.cooldown / 60)} phút.</li>
      <li><b>Lượt quét may mắn</b>: cao hơn ${reward.luckyScan.tierBonus} cấp so với một lần quét thường, ít nhất Rare, không làm tăng giá quét. Hồi ${vi(reward.luckyScan.cooldown / 60)} phút.</li>
      <li><b>Thêm 1 bản sau khi ghép</b>: thẻ thưởng đầu bảng nâng cấp đổi thành "Copy" trong 8 giây sau mỗi lần ghép, tới cấp ${TIER_VI[reward.twin.maxTier - 1]}. Hồi ${vi(reward.twin.cooldown / 60)} phút.</li>
      <li>Mọi nút thưởng chỉ xuất hiện sau vài phút đầu (quét may mắn từ phút ${vi(reward.luckyScan.firstAt / 60)}, nâng cấp miễn phí từ phút ${vi(reward.freeUpgrade.firstAt / 60)}).</li>
      <li><b>Khi portal tắt quảng cáo</b> (Basic Launch): thưởng vẫn trao, thời gian hồi ×${String(reward.freeCooldownMult).replace('.', ',')}.</li>
      <li>Ngoài màn chơi: x${reward.offlineMult} thu nhập khi vắng mặt, x${reward.dailyMult} quà ngày.</li>
    </ul>
  </div>
</section>

<section>
  <h2>Giả định của mô phỏng</h2>
  <ul class="plain">
    <li>Nhấp tay 6 lần/giây trong 5 phút đầu, 4,5 lần/giây đến phút 15, sau đó 3 lần/giây. Người nhấp chậm bằng một nửa.</li>
    <li>Mỗi thao tác tốn thời gian: quét 0,35 giây, ghép 1 giây, mua 0,6 giây. Lúc đó không nhấp.</li>
    <li>Luôn ghép ngay khi có cặp. Khi món rẻ nhất trong shop còn thiếu dưới 30 giây thu nhập thì ngừng quét để để dành.</li>
    <li>Bắt 5/6 số sao băng. Mỗi sao cho khoảng ${content.economy.stars.seconds} giây thu nhập, 1/10 là sao vàng x5. Sao xuất hiện ${content.economy.stars.everyMin}–${content.economy.stars.everyMax} giây sau khi đợt trước hết (bắt xong hoặc bay mất), ${Math.round((content.economy.stars.doubleChance ?? 0) * 100)}% số đợt có 2 sao. Lượt chính sau Thiên hà: sao giá trị ×${content.economy.stars.valueMultEndless ?? 1}, giá quét tăng chậm ${Math.round(1 / (content.economy.scan.endlessGrowth ?? 1))} lần.</li>
    <li>Ba kiểu người chơi: nhấp đều (6, rồi 4,5, rồi 3 lần/giây), nhấp chậm bằng nửa, và thi thoảng nhấp (0,5 lần/giây sau khi có auto, không mua nâng cấp nhấp tay).</li>
    <li>Xem quảng cáo thật: bấm nút thưởng khoảng 1,5 phút sau khi nút sẵn sàng, mỗi quảng cáo 30 giây, game dừng trong lúc đó.</li>
    <li>Chơi liền một phiên. Chưa mô phỏng thu nhập khi vắng mặt và quà ngày.</li>
  </ul>
</section>
</div>`;

writeFileSync('tools/sim/out/report.html', html);
console.log('Wrote tools/sim/out/report.html');
