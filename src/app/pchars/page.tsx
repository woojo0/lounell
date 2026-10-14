'use client';
// 상대 캐릭터 리스트 (v2.1 사용자 요청) — 내 캐릭터(own) 말고 상대 캐릭터(own=false)만 모아 보는 목록.
// 자관 상세에서 등록한 상대 캐릭터가 여기 모이고, 여기서 ＋ ADD로 직접 등록할 수도 있다(own=false로 저장).
// 카드 모양·검색·정렬은 캐릭터 리스트(/chars)와 같다
import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, charPath, charGrant } from '@/lib/charStore';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useMenuSettings, canWriteAt, writeKeyOf, writeDefaultOf } from '@/lib/menuStore';
import { SearchBar, FitText } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

function PCharsInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn } = useMainStore();
  // 등록 권한 — 환경설정 「권한」에서 (기본: 관리자)
  const [menuSet] = useMenuSettings();
  const [charsAll, setCharsAll] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  // 여러 개로 만든 상대 캐릭터 목록 — 주소의 ?s= 가 가리키는 것만. 자관에서 등록한 상대 캐릭터(소속 없음)는 기본 목록에
  const sec = useSectionParam('pchars');
  const chars = filterSection(charsAll, sec.id);
  // 저장은 이 목록 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 목록이 지워지지 않는다
  const setChars = sectionSetter(charsAll, sec.id, setCharsAll);
  const [q, setQ] = useState('');

  const visible = chars
    .filter(c => !c.own)   // 상대 캐릭터만 — 내 캐릭터는 /chars
    .filter(c => isAdmin || c.visibility === 'public' || (!!user && !!charGrant(c, user.id)))
    .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.sub.includes(q));

  // 편집모드 카드 드래그 정렬
  const sort = useCardSort(visible, next => setChars(mergeOrder(chars, next)), editOn && isAdmin);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'PARTNER CHARACTERS' : sec.name}</PageTitle>
        <EditableDesc k="pchars-desc" def="상대 캐릭터 목록 — 내 캐릭터는 캐릭터 리스트에, 상대 캐릭터는 여기에" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {canWriteAt(menuSet, writeKeyOf('/pchars', sec.id), { loggedIn: !!user, isAdmin, id: user?.id }, writeDefaultOf('/pchars')) && (
            <button className="btn btn-dark"
              onClick={() => router.push('/chars/new' + (secQuery('pchars', sec.id) ? `${secQuery('pchars', sec.id)}&partner=1` : '?partner=1'))}>＋ ADD CHARACTER</button>
          )}
        </div>
      </div>
      <div className="g5 chars-grid">
        {visible.map((c, i) => {
          const priv = c.visibility === 'private';
          const sp = sort(i) as { style?: React.CSSProperties };
          return (
            <div key={c.id} className="char-card" {...sort(i)}
              style={{ ...(priv ? { opacity: .45 } : undefined), ...sp.style }}
              onClick={() => { if (!editOn) router.push(charPath(c)); }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass || 'cool'}
                  label={priv ? '비공개' : '3:4'} />
              </div>
              <div className="nm">
                <b style={{ minWidth: 0, flex: 1 }}><FitText>{c.name}</FitText></b>
                <i style={{ background: c.color }} />
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--page-desc)', fontSize: 13, padding: 40 }}>
            표시할 상대 캐릭터가 없습니다
          </p>
        )}
      </div>
    </section>
  );
}

export default function PCharsPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><PCharsInner /></Suspense>;
}
