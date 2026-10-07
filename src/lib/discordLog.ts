// 디스코드 복사본 → 역극 로그 (커플홈 사용자 요청 — "디스코드에서 복사한 파일을 받으면 알아서 파싱해서 예쁘게 로그로").
//
// 디스코드 채팅을 긁어 붙이면 보통 이런 모양이다:
//   네리스            ← 이름
//   앱                ← (봇/앱 표시, 없을 수도)
//    — 2026-09-29 오후 11:13
//   (본문… 여러 줄일 수 있다)
// 그 밖에 「이름 — 오늘 오후 11:13」 한 줄짜리, 「[오후 11:13] 이름: 본문」 꼴도 받아 준다.
// 「-」만 적힌 발화는 장면 구분선으로 쓰인 것이라, 매칭에서 지문으로 두면 「· · ·」로 들어간다.
import type { RpMessage } from './rpStore';

export interface DcMessage { speaker: string; date: string; text: string }
export interface DcSpeaker { name: string; count: number }
export interface DcParsed { messages: DcMessage[]; speakers: DcSpeaker[] }

const TS = /(?:(\d{4})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{1,2})\.?|(오늘|어제|today|yesterday))[\s,]*(?:(오전|오후|AM|PM|am|pm)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/;
const TAG = /^(앱|APP|BOT|봇)$/i;

/** 시각 문자열 → ISO. 「오늘/어제」는 지금 날짜 기준, 오전/오후·AM/PM 모두 받는다 */
function toIso(m: RegExpMatchArray): string {
  const now = new Date();
  let y = now.getFullYear(), mo = now.getMonth() + 1, d = now.getDate();
  if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if (/어제|yesterday/i.test(m[4] ?? '')) {
    const t = new Date(now); t.setDate(t.getDate() - 1);
    y = t.getFullYear(); mo = t.getMonth() + 1; d = t.getDate();
  }
  let hh = +m[6];
  const mm = +m[7];
  const ap = (m[5] ?? m[8] ?? '').toLowerCase();
  if (ap === '오후' || ap === 'pm') { if (hh < 12) hh += 12; }
  else if (ap === '오전' || ap === 'am') { if (hh === 12) hh = 0; }
  const dt = new Date(y, mo - 1, d, hh, mm);
  return Number.isNaN(dt.getTime()) ? now.toISOString() : dt.toISOString();
}

export function parseDiscordLog(raw: string): DcParsed {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const msgs: DcMessage[] = [];
  let cur: DcMessage | null = null;
  const push = () => {
    if (cur) {
      cur.text = cur.text.replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n');
      if (cur.text) msgs.push(cur);
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    // (a) 「이름」 / [앱] / 「 — 시각」 — 두세 줄짜리 머리. 시각 줄 자체(— 로 시작)는 이름이 될 수 없다
    if (t && !/^[—–]\s/.test(t) && i + 1 < lines.length) {
      let j = i + 1;
      if (TAG.test(lines[j].trim()) && j + 1 < lines.length) j += 1;
      const m = /^[—–]\s*(.+)$/.exec(lines[j].trim());
      const ts = m ? TS.exec(m[1]) : null;
      if (m && ts && m[1].replace(TS, '').trim() === '') {
        push();
        cur = { speaker: t, date: toIso(ts), text: '' };
        i = j;
        continue;
      }
    }
    // (b) 「이름 — 시각」 한 줄짜리 머리
    const one = /^(.+?)\s+[—–]\s+(.+)$/.exec(t);
    if (one) {
      const ts = TS.exec(one[2]);
      if (ts && one[2].replace(TS, '').trim() === '') {
        push();
        cur = { speaker: one[1].trim(), date: toIso(ts), text: '' };
        continue;
      }
    }
    // (c) 「[시각] 이름: 본문」 한 줄짜리
    const br = /^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/.exec(t);
    if (br) {
      const ts = TS.exec(br[1]);
      if (ts) {
        push();
        cur = { speaker: br[2].trim(), date: toIso(ts), text: br[3] };
        continue;
      }
    }
    // 본문 줄 — 빈 줄도 문단 구분으로 남긴다 (앞뒤 빈 줄은 push에서 정리)
    if (cur) cur.text += (cur.text || t === '' ? '\n' : '') + line.replace(/\s+$/, '');
  }
  push();
  const counts = new Map<string, number>();
  msgs.forEach(m => counts.set(m.speaker, (counts.get(m.speaker) ?? 0) + 1));
  return { messages: msgs, speakers: [...counts].map(([name, count]) => ({ name, count })) };
}

/** 발화자 → 무엇으로 넣을지: 자관(혹은 그 밖)의 캐릭터 / 지문(서술) / 제외 */
export type DcMap = Record<string, { kind: 'char'; charId: string } | { kind: 'desc' } | { kind: 'skip' }>;

/** 매칭대로 역극 발화 목록으로 — rpLogHtml/rpLogText가 그대로 그린다. authorId는 역극 방이 아니라 비워 둔다 */
export function dcToMessages(p: DcParsed, map: DcMap): RpMessage[] {
  const out: RpMessage[] = [];
  p.messages.forEach((m, i) => {
    const mp = map[m.speaker];
    if (!mp || mp.kind === 'skip') return;
    const text = m.text.trim() === '-' ? '· · ·' : m.text;
    if (mp.kind === 'desc') out.push({ id: `dc-${i}`, kind: 'desc', authorId: '', text, date: m.date });
    else out.push({ id: `dc-${i}`, kind: 'char', charId: mp.charId, authorId: '', text, date: m.date });
  });
  return out;
}

/** 이름으로 캐릭터 자동 매칭 — 대소문자·공백 무시, 캐릭터 이름 또는 한 줄 소개(sub)에 그대로 들어 있으면 */
export function guessChar<T extends { id: string; name: string; sub?: string }>(speaker: string, chars: T[]): T | undefined {
  const k = speaker.trim().toLowerCase();
  if (!k || k === '-') return undefined;
  return chars.find(c => c.name.trim().toLowerCase() === k)
    ?? chars.find(c => (c.sub ?? '').toLowerCase().split(/[\s·,/|]+/).includes(k))
    ?? chars.find(c => c.name.trim().toLowerCase().includes(k) || k.includes(c.name.trim().toLowerCase()));
}
