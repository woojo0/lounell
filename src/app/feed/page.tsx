'use client';
// 큰 그림 게시판 (v2.1 사용자 요청 — 「이미지를 좀 더 크게 볼 수 있는 게시판」).
// 한 줄에 글 하나 — 첫 이미지를 원본 크기(폭이 모자라면 축소만)로 크게, 아래에 말머리·제목·날짜.
// 글은 갤러리 글과 같은 모양(BackupPost)이고 작성·상세도 갤러리 것을 같이 쓴다. 말머리 탭 · 검색 · 6개씩 페이지
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, secQuery } from '@/lib/sectionStore';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { BackupPost, FEED_KEY, FEED_SEED } from '@/lib/galleryStore';
import { useBoardSettings, feedCatsOf, boardBadgeStyle, feedHideAuthorOf, perPageOf } from '@/lib/boardStore';
import { useMenuSettings, canWriteAt, writeKeyOf } from '@/lib/menuStore';
import { useBlobUrl } from '@/lib/blobStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const FOLD_LABEL = { spoiler: '스포일러', adult: '수위 주의' };

/** 대표(첫) 이미지 — 원본보다 크게 늘리지 않는다: 폭이 모자랄 때만 줄이고, 작은 그림은 작은 그대로 가운데 */
function FeedImg({ fileRef, ph }: { fileRef?: string; ph?: string }) {
  const url = useBlobUrl(fileRef);
  if (!url) return <div className={`ph ${ph ?? 'cool'}`} style={{ aspectRatio: '16/10' }}><span>IMAGE</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" />;
}

function FeedPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [postsAll] = useLocalList<BackupPost>(FEED_KEY, FEED_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('feed');
  const posts = filterSection(postsAll, sec.id);
  const [menuSet] = useMenuSettings();
  // 말머리 탭 — 환경설정 > 게시판 관리의 큰 그림 말머리
  const { st: boardSet } = useBoardSettings();
  const cats = feedCatsOf(boardSet, sec.id);
  const hideAuthor = feedHideAuthorOf(boardSet, sec.id);   // 작성자 이름 숨기기 (환경설정 > 게시판 관리)
  const [cat, setCat] = useState('');   // '' = ALL
  const [q, setQ] = useState('');
  const [unveiled, setUnveiled] = useState<Record<string, boolean>>({});

  const visible = posts
    .filter(p => isAdmin || p.visibility === 'public' || (p.visibility === 'member' && user))
    .filter(p => !cat || p.category === cat)
    .filter(p => !q || p.title.includes(q) || p.category.includes(q)
      || (p.tags ?? []).some(t => t.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date));   // 최신 글이 위

  const PER = perPageOf(boardSet, 'feed');   // 한 장에 몇 개 — 환경설정 > 게시판 관리 (기본 6, v2.1)
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(visible.length / PER));
  const cur = Math.min(page, pages);
  const paged = visible.slice((cur - 1) * PER, cur * PER);
  useEffect(() => { setPage(1); }, [q, cat]);

  const badgeOf = (p: BackupPost) => cats.find(c => c.label === p.category);
  const count = (p: BackupPost) => Math.max(p.images.length, p.phList.length);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'WORKS' : sec.name}</PageTitle>
        <EditableDesc k="feed-desc" def="게시물이 하나씩 크게 — 합작·일러스트를 큰 화면으로" />
      </div>
      <div className="toolrow">
        {/* 왼쪽: 말머리 탭 ALL / 말머리… — 말머리를 하나도 안 정해 둔 게시판은 ALL만 */}
        <div className="seg">
          <button className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>ALL</button>
          {cats.map(c => (
            <button key={c.id} className={cat === c.label ? 'on' : ''} onClick={() => setCat(c.label)}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchBar onSearch={setQ} />
          {/* 글쓰기 권한 — 환경설정 「권한」에서 게시판마다 (기본: 가입자) · 멤버 선택으로 좁힐 수 있다 */}
          {canWriteAt(menuSet, writeKeyOf('/feed', sec.id), { loggedIn: !!user, isAdmin, id: user?.id }) && (
            <button className="btn btn-dark" onClick={() => router.push('/feed/write' + secQuery('feed', sec.id))}>✎ WRITE</button>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="feed-list">
          {paged.map(p => {
            const folded = !!p.fold && !unveiled[p.id];
            return (
              <article key={p.id} className="panel feed-item"
                onClick={() => { if (!folded) router.push(`/feed/${p.id}`); }}>
                <div className={`art ${folded ? 'veil' : ''}`}>
                  <FeedImg fileRef={p.thumbId ?? p.images[0]} ph={p.phList[0]} />   {/* 썸네일 전용 이미지가 있으면 그것을 (v2.1) */}
                  {folded && (
                    <div className="cover" onClick={e => { e.stopPropagation(); setUnveiled(u => ({ ...u, [p.id]: true })); }}>
                      <div>
                        <b>{p.fold!.type === 'custom' ? (p.fold!.label || '접힘') : FOLD_LABEL[p.fold!.type]}</b>
                        <span>클릭하여 표시</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="cap">
                  {p.category && <span style={boardBadgeStyle(badgeOf(p))}>{p.category}</span>}
                  <b>{p.title}</b>
                  {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
                  <small>{count(p) > 1 ? `${count(p)}장 · ` : ''}{hideAuthor ? '' : `${p.author} · `}{fmtDate(p.madeDate ? p.madeDate + 'T00:00:00' : p.date)}</small>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          게시물이 없습니다
        </div>
      )}
      {visible.length > PER && <Pager page={cur} total={pages} onChange={setPage} />}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function FeedPage() {
  return <Suspense fallback={<section className="page" />}><FeedPageInner /></Suspense>;
}
