// 플레이타임 합산 (커플홈 사용자 요청 — 「5H 30M 이런 식으로 적을 수 있고(소문자도 가능) 그걸 시간+분으로 합산해서
// 다시 시간+분 통계를 내서 맨 밑에 · 총 몇 번 갔는지도 Count로」)
//
// 적는 칸은 자유 글이라 여러 모양을 읽는다: 5H 30M · 5h30m · 5h · 90m · 4.5h · 4:30 · 4시간 30분.
// 못 읽는 글(비었거나 「밤샘」 같은 말)은 합계에서 빼고 몇 건인지 따로 알려 준다.

/** 플레이타임 글 → 분. 못 읽으면 null */
export function playMinutes(text: string | undefined): number | null {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return null;
  const colon = t.match(/^(\d+):(\d{1,2})$/);   // 4:30
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  let total = 0;
  let hit = false;
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|시간)/);   // 5h · 4.5h · 5 hours · 5시간
  if (h) { total += Math.round(parseFloat(h[1]) * 60); hit = true; }
  const m = t.match(/(\d+)\s*(?:m|분)/);               // 30m · 30min · 30분
  if (m) { total += parseInt(m[1], 10); hit = true; }
  return hit ? total : null;
}

/** 분 → 「12H 30M」 (적는 모양과 같게 — 0분이면 시간만, 1시간 안 되면 분만) */
export function fmtPlayMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}H ${m}M`;
  if (h) return `${h}H`;
  return `${m}M`;
}

/** 기록들의 합계 — 몇 번(count) · 읽은 플레이타임 합(분) · 못 읽은 건수 */
export function playStats(items: { playtime?: string }[]): { count: number; minutes: number; unread: number } {
  let minutes = 0;
  let unread = 0;
  for (const it of items) {
    const v = playMinutes(it.playtime);
    if (v === null) unread++;
    else minutes += v;
  }
  return { count: items.length, minutes, unread };
}
