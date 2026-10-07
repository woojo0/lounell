'use client';
// 역극 메시지 알림음 (커플홈 사용자 요청) — 사이트 어느 페이지에 있든, 내가 참여한 방에 남이 새 발화를 남기면 짧게 울린다.
// 레이아웃에 상주한다. 처음 받은 목록은 「이미 있던 것」으로 두고, 그 뒤에 새로 나타난 남의 발화에만 울린다
import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { RpRoom, RP_SEED, RpMessageRow, RP_MSG_KEY, RP_MSG_SEED, rpMemberIds } from '@/lib/rpStore';
import { Character, CHAR_SEED, Relation, REL_SEED } from '@/lib/charStore';
import { armMsgSound, playMsgTone } from '@/lib/msgSound';

export function MsgSound() {
  const { user } = useAuth();
  const [rows, , loaded] = useLocalList<RpMessageRow>(RP_MSG_KEY, RP_MSG_SEED);
  const [rooms] = useLocalList<RpRoom>('ohome.rp.v1', RP_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { armMsgSound(); }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!seen.current) { seen.current = new Set(rows.map(r => r.id)); return; }
    const fresh = rows.filter(r => !seen.current!.has(r.id));
    if (!fresh.length) return;
    fresh.forEach(r => seen.current!.add(r.id));
    if (!user) return;
    // 내 발화는 빼고, 내가 참여한 방의 것만 (참여자 판정은 역극 페이지와 같은 rpMemberIds)
    const ding = fresh.some(r => {
      if (r.authorId === user.id) return false;
      const room = rooms.find(x => x.id === r.roomId);
      return !!room && rpMemberIds(room, rels, chars).includes(user.id);
    });
    if (ding) playMsgTone();
  }, [rows, loaded, user, rooms, rels, chars]);

  return null;
}
