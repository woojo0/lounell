'use client';
// 알림음 (커플홈 사용자 요청) — 사이트 어느 페이지에 있든 짧게 울린다.
//  · 내 앞으로 새 안 읽은 알림이 쌓이면 (댓글·타래·메모·일기, 그리고 역극 발화 — 보내는 쪽이 발화마다 rp 알림을 만든다)
//  · 예전에는 역극만은 발화 행 자체를 보고 울렸는데, 그러려면 **모든 페이지에서 역극 발화 전체를 받아 와야** 했고
//    발화가 올 때마다 전체를 다시 받았다 (커플홈 사용자 제보: "로그 로딩이 여전히 느리다" — 모든 화면이 그 읽기와 경쟁했다).
//    rp 알림은 방 단위로 겹쳐도 서버에는 새 행으로 남으므로(notifStore) 받는 쪽은 발화마다 새 알림을 본다
// 레이아웃에 상주한다. 처음 받은 목록은 「이미 있던 것」으로 두고, 그 뒤에 새로 나타난 것에만 울린다
import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { armMsgSound, playMsgTone } from '@/lib/msgSound';
import { readNotifs, NOTIF_EVENT } from '@/lib/notifStore';

/** 접속 직후 몇 초는 울리지 않는다 — 서버에 쌓여 있던 알림을 처음 받아 오는 순간(syncNotifs)에 묵은 알림으로 울리지 않게 */
const QUIET_AFTER_MOUNT_MS = 8000;

export function MsgSound() {
  const { user } = useAuth();

  useEffect(() => { armMsgSound(); }, []);

  // 알림 — 내 앞으로 새로 쌓인 안 읽은 알림. 발생 지점(같은 탭)·서버 받아 오기(syncNotifs)·다른 탭 모두 NOTIF_EVENT/storage로 온다
  const seenNotif = useRef<Set<string> | null>(null);
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    seenNotif.current = null;   // 사용자가 바뀌면 처음부터
    const check = () => {
      const mine = user ? readNotifs().filter(n => n.toUserId === user.id) : [];
      if (!seenNotif.current) { seenNotif.current = new Set(mine.map(n => n.id)); return; }
      const fresh = mine.filter(n => !seenNotif.current!.has(n.id));
      if (!fresh.length) return;
      fresh.forEach(n => seenNotif.current!.add(n.id));
      if (Date.now() - mountedAt.current < QUIET_AFTER_MOUNT_MS) return;
      if (fresh.some(n => !n.read)) playMsgTone();
    };
    check();
    window.addEventListener(NOTIF_EVENT, check);
    window.addEventListener('storage', check);
    return () => { window.removeEventListener(NOTIF_EVENT, check); window.removeEventListener('storage', check); };
  }, [user]);

  return null;
}
