'use client';
// 모바일 메뉴 버튼 (v2.1 사용자 요청 — "모바일에서도 메뉴 바가 뜨도록… 버튼을 클릭하면 나오는 형식도 괜찮습니다").
// 화면 오른쪽 아래 「≡」 — BGM 바가 있으면 그 바의 오른쪽 끝 자리(BGM은 왼쪽으로 조금 민다, globals.css). 누르면 상위 메뉴가
// 목록으로 뜨고, 하위가 있는 메뉴는 펼쳐서 고른다. PC(621px 이상)에서는 보이지 않는다 — 상단 메뉴가 있다.
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { boardEntries, useMenuSettings, buildMenu } from '@/lib/menuStore';
import { useBoards } from '@/lib/boardStore';
import { useSections, sectionMenuEntries } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries } from '@/lib/linkStore';
import { useAuth } from '@/lib/auth';

export function MobileMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [grp, setGrp] = useState<string | null>(null);
  const [menuSet, , menuLoaded] = useMenuSettings();
  const { boards, loaded: boardsLoaded } = useBoards();
  const { user, isAdmin } = useAuth();
  const { map: secMap } = useSections();
  const { links } = useCustomLinks();
  useEffect(() => { setOpen(false); }, [pathname]);   // 이동하면 닫는다
  if (pathname === '/settings') return null;          // 환경설정은 PC 전용
  const menu = menuLoaded && boardsLoaded
    ? buildMenu(menuSet, [...boardEntries(boards), ...sectionMenuEntries(secMap), ...linkEntries(links)], { loggedIn: !!user, isAdmin, id: user?.id })
    : [];
  const go = (href: string) => {
    setOpen(false);
    if (/^https?:\/\//.test(href)) window.open(href, '_blank');   // 커스텀 링크의 외부 주소는 새 창 (상단 메뉴와 같은 규칙)
    else router.push(href);
  };
  return (
    <div className="mmenu">
      {open && <div className="mmenu-ov" onClick={() => setOpen(false)} />}
      {open && (
        <div className="mmenu-pop">
          {menu.map(m => (m.children ? (
            <div key={m.label} className={`g ${grp === m.label ? 'open' : ''}`}>
              <button className="top" onClick={() => setGrp(g => (g === m.label ? null : m.label))}>
                {m.label}<span className="ar">{grp === m.label ? '▾' : '▸'}</span>
              </button>
              {grp === m.label && (
                <div className="sub">
                  {m.children.map(c => <button key={c.href} onClick={() => go(c.href)}>{c.label}</button>)}
                </div>
              )}
            </div>
          ) : (
            <button key={m.label} className="top" onClick={() => go(m.href!)}>{m.label}</button>
          )))}
          {menu.length === 0 && <div className="hint" style={{ padding: 10 }}>메뉴가 없습니다</div>}
        </div>
      )}
      <button className="mmenu-btn" aria-label="메뉴" onClick={() => setOpen(o => !o)}>{open ? '✕' : '≡'}</button>
    </div>
  );
}
