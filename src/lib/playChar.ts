// 플레이기록 GMPC / PC 칸 (커플홈 사용자 요청 — "Role은 여기서도 삭제해줘, 누가 KPC인가는 중요하지 않아.
// 대신 GMPC/PC 두 항목을 만들고 캐릭터를 연동할 수 있게 — 자관 캐릭터(AU 포함) 혹은 TRPG 캐릭터 리스트의 캐릭터로")
//
// 칸 하나에 캐릭터 하나. 직접 적은 이름만 둘 수도 있고, 자관 캐릭터(원래 모습 또는 AU)나 TRPG 캐릭터에 연동할 수도 있다.
// 연동한 칸은 볼 때마다 지금 캐릭터 데이터로 이름·색·주소를 다시 만든다 — 캐릭터 이름을 바꾸면 기록에도 바로 반영된다.
// name은 연동할 때의 이름을 같이 적어 두는 자리 — 캐릭터가 지워졌거나 읽을 권한이 없는 방문자에게는 이 이름이 보인다.
import { Character, Relation, charInAu, charPath, auParamOf } from './charStore';
import type { TrpgChar } from './tcharStore';

export interface PlayCharRef {
  name: string;
  /** 연동한 캐릭터의 출처 — 자관 캐릭터(AU 포함) / TRPG 캐릭터 리스트. 없으면 직접 적은 이름 */
  src?: 'rel' | 'tchar';
  /** rel: Character.id · tchar: TrpgChar.id */
  charId?: string;
  /** rel일 때 AU 키(`relId:auId`) — 없으면 원래 모습 */
  auKey?: string;
}

export interface PlayCharView {
  name: string;
  href?: string;     // 누르면 갈 캐릭터 페이지
  color?: string;    // 자관 캐릭터의 테마색 (이름 앞 점)
  tip?: string;      // 어디 캐릭터인지 (자관 · AU / TRPG 캐릭터)
}

/** 표에 보일 모습 — 연동한 캐릭터가 있으면 지금 데이터로, 없으면 적어 둔 이름 */
export function playCharView(
  ref: PlayCharRef | undefined, chars: Character[], rels: Relation[], tchars: TrpgChar[],
): PlayCharView | null {
  if (!ref) return null;
  if (ref.src === 'rel' && ref.charId) {
    const c = chars.find(x => x.id === ref.charId);
    if (c) {
      const shown = charInAu(c, rels, ref.auKey);
      let tip = '자관 캐릭터';
      let href = charPath(c);
      if (ref.auKey) {
        const i = ref.auKey.indexOf(':');
        const rel = rels.find(r => r.id === ref.auKey!.slice(0, i));
        const au = rel?.aus.find(a => a.id === ref.auKey!.slice(i + 1));
        if (rel && au) tip = `${rel.name} · ${au.label}`;
        href += `?au=${encodeURIComponent(auParamOf(c, rels, ref.auKey))}`;
      }
      return { name: shown.name, href, color: shown.color, tip };
    }
  }
  if (ref.src === 'tchar' && ref.charId) {
    const t = tchars.find(x => x.id === ref.charId);
    if (t) return { name: t.name, href: `/tchars/${t.id}`, tip: t.rule ? `TRPG 캐릭터 · ${t.rule}` : 'TRPG 캐릭터' };
  }
  const n = ref.name?.trim();
  return n ? { name: n } : null;
}

/** 칸이 비었는지 — 이름도 연동도 없으면 저장하지 않는다 */
export const playCharEmpty = (ref?: PlayCharRef) => !ref || (!ref.name?.trim() && !ref.charId);
