// 역극 로그 만들기 (커플홈) — 역극 방의 발화를 txt / html 로그로.
// txt는 파일 저장용, html은 파일 저장 + RP LOG 게시판 본문용(상세에서 원본 스타일 그대로 그려진다).
import type { RpMessage } from './rpStore';
import { hexRgb } from './rpStore';
import type { Character } from './charStore';

export interface RpLogInfo {
  title: string;
  sub?: string;           // 방 소제목 — 페어면 캐릭터 이름 둘, 다인관이면 자관명
}

export interface RpLogOpts {
  /** 시각 표시 — 켜면 줄 앞에 [HH:MM], 날짜가 바뀌는 곳에 구분선 */
  time: boolean;
  /** RP LOG 게시판 본문용 — 제목·캐릭터 이름은 게시판 상세가 이미 위에 보여 주므로 빼고 기간·개수만 */
  forBoard?: boolean;
  /** HTML 모양 (커플홈 사용자 요청 — 메신저 방을 저장했는데 메신저 느낌이 없었다): 'imsg'면 아이폰 문자 말풍선 */
  style?: 'script' | 'imsg';
  /** 메신저 모양에서 오른쪽(파란 말풍선)에 둘 캐릭터 id — 저장하는 사람이 방에서 보던 그대로 */
  rightIds?: string[];
  /** 프로필 사진 (커플홈 사용자 요청) — 캐릭터 id → 주소(홈 저장소)와 얼굴칸 안 위치(인라인 스타일). 없으면 사진 없이 */
  faces?: Record<string, { url: string; style: string }>;
  /** 좌우를 정하지 않고 캐릭터 id만 적어 둔다 (RP LOG 게시판용) — 보는 사람에 따라 상세 페이지가 applyLogSides로 정한다 */
  neutralSides?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 첫 발화 ~ 마지막 발화 날짜 (같은 날이면 하나만) */
export function rpLogRange(msgs: RpMessage[]): string {
  if (!msgs.length) return '';
  const a = ymd(msgs[0].date);
  const b = ymd(msgs[msgs.length - 1].date);
  return a === b ? a : `${a} – ${b}`;
}

/** 마지막 발화 날짜 — RP LOG의 날짜 칸(YYYY-MM-DD) */
export function rpLogLastDate(msgs: RpMessage[]): string {
  const iso = msgs.length ? msgs[msgs.length - 1].date : new Date().toISOString();
  return ymd(iso).replace(/\./g, '-');
}

/** 이 로그에서 말한 캐릭터 — 처음 말한 순서대로 (RP LOG의 「동행」 칸·썸네일 색) */
export function rpSpeakers(msgs: RpMessage[], chars: Character[]): Character[] {
  const seen = new Set<string>();
  const out: Character[] = [];
  for (const m of msgs) {
    if (m.kind !== 'char' || !m.charId || seen.has(m.charId)) continue;
    seen.add(m.charId);
    const c = chars.find(x => x.id === m.charId);
    if (c) out.push(c);
  }
  return out;
}

const nameOf = (chars: Character[], id?: string) =>
  chars.find(c => c.id === id)?.name || '(삭제된 캐릭터)';

/** 텍스트 로그 — 발화마다 빈 줄로 나눈다. 캐릭터 발화는 「이름: 대사」, 지문은 그대로 */
export function rpLogText(info: RpLogInfo, msgs: RpMessage[], chars: Character[], opts: RpLogOpts): string {
  const head = [
    ...(opts.forBoard ? [] : [info.title, ...(info.sub ? [info.sub] : [])]),
    [rpLogRange(msgs), `대화 ${msgs.length}개`].filter(Boolean).join(' · '),
    '─'.repeat(28),
  ];
  const body: string[] = [];
  let day = '';
  for (const m of msgs) {
    if (opts.time) {
      const d = ymd(m.date);
      if (d !== day) { day = d; body.push(`── ${d} ──`); }
    }
    const t = opts.time ? `[${hm(m.date)}] ` : '';
    const txt = m.text || (m.imgId ? '[사진]' : '');   // 사진만 보낸 문자 (커플홈 메신저 방)
    body.push(m.kind === 'char' ? `${t}${nameOf(chars, m.charId)}: ${txt}` : `${t}${txt}`);
  }
  return [...head, '', body.join('\n\n'), ''].join('\n');
}

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** 스타일 속성에 넣어도 되는 색만 — 저장된 값이 이상하면 기본색 */
const safeHex = (c?: string) => (c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? c : '#5d636d');

const DATE_RE = /^(\d{4}\s?[.\-/]\s?\d{1,2}\s?[.\-/]\s?\d{1,2}\.?)([\s\S]*)$/;
const GAP = 30 * 60 * 1000;

/** 메신저 모양 줄들 — 역극 페이지의 iMessage 표시와 같은 규칙: 같은 캐릭터가 이어 말하면 묶고(꼬리는 묶음 끝에만),
 *  이름은 상대 쪽에서 말하는 캐릭터가 바뀔 때만, 날짜로 시작하는 지문은 날짜 줄, 「일반 RP」 글은 대본 카드 */
function imsgRows(msgs: RpMessage[], chars: Character[], opts: RpLogOpts): string[] {
  const right = new Set(opts.rightIds ?? []);
  const rows: string[] = [];
  let day = '';
  msgs.forEach((m, i) => {
    if (opts.time) {
      const d = ymd(m.date);
      if (d !== day) { day = d; rows.push(`<div class="sys date"><b>${d}</b></div>`); }
    }
    const txt = m.text || (m.imgId ? '[사진]' : '');
    if (m.kind !== 'char') {
      const dm = m.text.trim().match(DATE_RE);
      rows.push(`<div class="sys${dm ? ' date' : ''}">${dm ? `<b>${esc(dm[1])}</b>${esc(dm[2])}` : esc(txt)}</div>`);
      return;
    }
    const me = right.has(m.charId ?? '');
    if (m.rp) {
      const c = chars.find(x => x.id === m.charId);
      const hex = safeHex(c?.color);
      rows.push(`<div class="m${!opts.neutralSides && me ? ' me' : ''}" data-c="${esc(m.charId ?? '')}" style="--c:${hex};--rgb:${hexRgb(hex)}"><div class="who">${esc(nameOf(chars, m.charId))}</div><div class="txt">${esc(txt)}</div></div>`);
      return;
    }
    const prev = msgs[i - 1], next = msgs[i + 1];
    const gap = !prev || Date.parse(m.date) - Date.parse(prev.date) > GAP;
    const first = gap || prev.kind !== 'char' || prev.charId !== m.charId || !!prev.rp;
    const last = !next || next.kind !== 'char' || next.charId !== m.charId || !!next.rp || Date.parse(next.date) - Date.parse(m.date) > GAP;
    const nameNeeded = !prev || prev.kind !== 'char' || prev.charId !== m.charId;
    const short = m.text.trim().length > 0 && m.text.trim().length <= 3;
    const side = opts.neutralSides ? '' : (me ? ' me' : ' them');
    // 얼굴은 사진 옵션을 켰을 때만 — 상대 쪽 묶음 끝에 하나 (내 쪽·중간은 CSS가 숨긴다). 좌우를 안 정한 본문은 전부 적어 둔다
    const f = opts.faces?.[m.charId ?? ''];
    const face = opts.faces ? `<span class="f">${f ? `<img src="${esc(f.url)}" style="${esc(f.style)}" alt="">` : ''}</span>` : '';
    const nm = nameNeeded && (opts.neutralSides || !me) ? `<div class="n">${esc(nameOf(chars, m.charId))}</div>` : '';
    rows.push(`<div class="b${side}${first ? ' first' : ''}${last ? ' last' : ''}" data-c="${esc(m.charId ?? '')}">${face}<div class="col">${nm}<div class="bub${short ? ' short' : ''}">${esc(txt)}</div></div></div>`);
  });
  return rows;
}

const IMSG_CSS = `
body{margin:0;background:#f2f2f7;color:#111;font-family:-apple-system,'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;font-size:14px}
.log{max-width:560px;margin:0 auto;padding:28px 16px 44px}
.hd{text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #e3e3df}
.hd h1{font-size:19px;letter-spacing:.06em;margin:0 0 6px;font-weight:700}
.hd .sub{font-size:12.5px;color:#666b74;letter-spacing:.08em}
.hd .meta{font-size:11px;color:#9a9ea6;margin-top:5px;letter-spacing:.04em}
.chat{display:flex;flex-direction:column;gap:2px;background:#fff;border-radius:18px;padding:16px 14px}
.sys{align-self:center;text-align:center;max-width:82%;font-size:11.5px;line-height:1.7;color:#8e8e93;margin:6px 0;white-space:pre-wrap;word-break:break-word}
.sys.date{margin:16px 0 8px;font-size:11px}
.sys.date b{font-weight:700;margin-right:4px}
.b{display:flex;align-items:flex-end;gap:14px;max-width:72%;position:relative}
.b.them{align-self:flex-start;margin-left:8px}
.b.me{align-self:flex-end;flex-direction:row-reverse;gap:6px;margin-right:8px}
.b.first{margin-top:8px}
.col{display:flex;flex-direction:column;min-width:0}
.b.me .col{align-items:flex-end}
.n{font-size:10px;color:#8e8e93;margin:0 0 3px 4px}
.b.me .n{display:none}
.f{width:26px;height:26px;border-radius:50%;overflow:hidden;position:relative;flex-shrink:0;align-self:flex-end;background:#d8d8dc}
.b:not(.last) .f{visibility:hidden}
.b.me .f{display:none}
.f img{display:block}
.bub{position:relative;padding:7px 12px;border-radius:18px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:#e9e9eb;color:#000;max-width:100%;min-width:37px}
.b.me .bub{background:#0b84ff;color:#fff}
.bub.short{text-align:center}
.b.them:not(.last) .bub{border-bottom-left-radius:5px}
.b.them:not(.first) .bub{border-top-left-radius:5px}
.b.me:not(.last) .bub{border-bottom-right-radius:5px}
.b.me:not(.first) .bub{border-top-right-radius:5px}
.b.last .bub::before{content:"";position:absolute;bottom:0;width:20px;height:20px;z-index:0}
.b.them.last .bub::before{left:-7px;background:#e9e9eb;border-bottom-right-radius:15px}
.b.me.last .bub::before{right:-8px;background:#0b84ff;border-bottom-left-radius:15px}
.b.last .bub::after{content:"";position:absolute;bottom:0;width:10px;height:20px;background:#fff;z-index:1}
.b.them.last .bub::after{left:-10px;border-bottom-right-radius:10px}
.b.me.last .bub::after{right:-10px;border-bottom-left-radius:10px}
.m{align-self:flex-start;max-width:82%;margin:10px 0;padding:9px 14px 10px;border-left:3px solid var(--c);background:rgba(var(--rgb),.08);border-radius:0 10px 10px 0}
.m.me{align-self:flex-end;border-left:none;border-right:3px solid var(--c);border-radius:10px 0 0 10px}
.m .who{font-size:12px;font-weight:700;color:var(--c);letter-spacing:.05em;margin-bottom:3px}
.m .txt{white-space:pre-wrap;word-break:break-word;line-height:1.75}
`;

/** HTML 로그 — 한 장짜리 문서. 기본(대본 모양)은 캐릭터 발화가 테마색 줄무늬 카드, 지문은 가운데 서술.
 *  메신저 모양(opts.style 'imsg')은 아이폰 문자 말풍선 — 역극 페이지에서 보던 그대로 */
export function rpLogHtml(info: RpLogInfo, msgs: RpMessage[], chars: Character[], opts: RpLogOpts): string {
  if (opts.style === 'imsg') {
    const meta = [rpLogRange(msgs), `대화 ${msgs.length}개`].filter(Boolean).join(' · ');
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(info.title)}</title>
<style>${IMSG_CSS}</style>
</head>
<body>
<div class="log">
<div class="hd">${opts.forBoard ? '' : `<h1>${esc(info.title)}</h1>${info.sub ? `<div class="sub">${esc(info.sub)}</div>` : ''}`}${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div>
<div class="chat">
${imsgRows(msgs, chars, opts).join('\n')}
</div>
</div>
</body>
</html>
`;
  }
  const rows: string[] = [];
  let day = '';
  for (const m of msgs) {
    if (opts.time) {
      const d = ymd(m.date);
      if (d !== day) { day = d; rows.push(`<div class="day">${d}</div>`); }
    }
    const t = opts.time ? `<span class="t">${hm(m.date)}</span>` : '';
    if (m.kind === 'char') {
      const c = chars.find(x => x.id === m.charId);
      const hex = safeHex(c?.color);
      rows.push(`<div class="m" style="--c:${hex};--rgb:${hexRgb(hex)}"><div class="who">${esc(nameOf(chars, m.charId))}${t}</div><div class="txt">${esc(m.text || (m.imgId ? '[사진]' : ''))}</div></div>`);
    } else {
      rows.push(`<div class="d">${t}${esc(m.text || (m.imgId ? '[사진]' : ''))}</div>`);
    }
  }
  const meta = [rpLogRange(msgs), `대화 ${msgs.length}개`].filter(Boolean).join(' · ');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(info.title)}</title>
<style>
body{margin:0;background:#f7f7f5;color:#2a2d33;font-family:'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;font-size:14px}
.log{max-width:720px;margin:0 auto;padding:34px 20px 44px}
.hd{text-align:center;margin-bottom:26px;padding-bottom:18px;border-bottom:1px solid #e3e3df}
.hd h1{font-size:21px;letter-spacing:.06em;margin:0 0 6px;font-weight:700}
.hd .sub{font-size:12.5px;color:#666b74;letter-spacing:.08em}
.hd .meta{font-size:11px;color:#9a9ea6;margin-top:5px;letter-spacing:.04em}
.day{text-align:center;font-size:11px;color:#9a9ea6;letter-spacing:.16em;margin:26px 0 10px}
.m{margin:10px 0;padding:9px 14px 10px;border-left:3px solid var(--c);background:rgba(var(--rgb),.08);border-radius:0 10px 10px 0}
.m .who{font-size:12px;font-weight:700;color:var(--c);letter-spacing:.05em;margin-bottom:3px}
.m .txt{white-space:pre-wrap;word-break:break-word;line-height:1.75}
.d{margin:18px 6%;text-align:center;color:#50555e;line-height:1.85;white-space:pre-wrap;word-break:break-word}
.t{font-size:10px;font-weight:400;color:#a3a7ae;margin-left:8px;letter-spacing:.02em}
.d .t{display:block;margin:0 0 2px}
</style>
</head>
<body>
<div class="log">
<div class="hd">${opts.forBoard ? '' : `<h1>${esc(info.title)}</h1>${info.sub ? `<div class="sub">${esc(info.sub)}</div>` : ''}`}${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div>
${rows.join('\n')}
</div>
</body>
</html>
`;
}

/** 좌우를 안 정한 메신저 본문(neutralSides)에 보는 사람 기준으로 me/them을 붙인다 (커플홈 사용자 요청 —
 *  RP LOG 게시판에서는 관리자에게는 자캐가, 역극 참여 회원에게는 자기 캐릭터가 오른쪽).
 *  이미 좌우가 있는 본문(파일 저장본·옛 로그)은 data-c가 없어 그대로다 */
export function applyLogSides(html: string, rightIds: string[]): string {
  const right = new Set(rightIds);
  return html
    .replace(/<div class="b([^"]*)" data-c="([^"]*)"/g, (_s, cls: string, id: string) =>
      `<div class="b${cls} ${right.has(id) ? 'me' : 'them'}" data-c="${id}"`)
    .replace(/<div class="m([^"]*)" data-c="([^"]*)"/g, (_s, cls: string, id: string) =>
      `<div class="m${cls}${right.has(id) ? ' me' : ''}" data-c="${id}"`);
}

/** 로그 전체를 새 탭에서 한 장으로 (커플홈 사용자 요청 — 방 안에서는 잘라서 보여 주므로 전체는 여기서).
 *  팝업이 막히면 파일로 내려받는다 */
export function openLogWindow(title: string, html: string): void {
  const u = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const w = window.open(u, '_blank');
  if (!w) downloadText(logFileName(title, 'html'), html, 'text/html');
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}

/** 파일 이름으로 못 쓰는 문자를 걷어 낸다 (윈도 금지 문자 포함) */
export const logFileName = (title: string, ext: 'txt' | 'html') =>
  `${(title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'roleplay-log').slice(0, 80)}.${ext}`;

/** 브라우저에서 바로 내려받기 */
export function downloadText(name: string, text: string, mime: string): void {
  const u = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = u; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
