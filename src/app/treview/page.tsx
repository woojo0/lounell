'use client';
// TRPG 리뷰 게시판 (v2.1 사용자 요청) — 시나리오마다 별점 + 한줄 평. 3:4 타일 그리드 · 페어 말머리 탭 · 검색 · WRITE(모달) · 12개씩 페이지.
// 말머리·별점 이름은 환경설정 > 게시판 관리 「TRPG 리뷰 말머리」, 글쓰기 권한은 환경설정 「권한」(기본: 가입자).
// 수정은 쓴 사람·관리자·글쓰기 권한이 있는 회원 — 저장할 때 editorIds에 적고, 옛 글은 관리자가 열 때 채운다
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secStamp, MAIN_SEC } from '@/lib/sectionStore';
import { useLocalList, newId, fmtDate } from '@/lib/postStore';
import {
  TrpgReview, REVIEW_KEY, REVIEW_SEED, starText, reviewRoles, canWriteReview, reviewEditorIds, sameIdList,
} from '@/lib/reviewStore';
import { useBoardSettings, reviewCatsOf, reviewStarsOf, boardBadgeStyle } from '@/lib/boardStore';
import { useMenuSettings } from '@/lib/menuStore';
import { useMembers } from '@/lib/members';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { ReviewForm } from '@/components/trpg/ReviewForm';
import { useToast } from '@/components/ui/Toast';

const PER = 12;   // 4열 × 3줄

function ReviewPageInner() {
  const router = useRouter();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [all, setAll, loaded] = useLocalList<TrpgReview>(REVIEW_KEY, REVIEW_SEED);
  const sec = useSectionParam('treview');
  const rows = filterSection(all, sec.id);
  const setRows = sectionSetter(all, sec.id, setAll);
  const [menuSet, , menuLoaded] = useMenuSettings();
  const members = useMembers();
  const { st: boardSet } = useBoardSettings();
  const cats = reviewCatsOf(boardSet, sec.id);
  const starNames = reviewStarsOf(boardSet);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [writeOpen, setWriteOpen] = useState(false);
  useEffect(() => { setPage(1); }, [q, cat]);

  /* 수정 가능 회원 채우기 (v2.1) — 서버 규칙은 문서에 적힌 editorIds만 보므로, 관리자가 이 페이지를 열 때
     「지금 글쓰기 권한이 있는 회원」을 옛 글에도 적어 둔다 (이미 맞으면 아무것도 안 쓴다) */
  useEffect(() => {
    if (!isAdmin || !user || !loaded || !menuLoaded || !members.length) return;
    const next = all.map(r => {
      const w = reviewEditorIds(menuSet, r.secId ?? MAIN_SEC, members);
      return sameIdList(r.editorIds, w) ? r : { ...r, editorIds: w };
    });
    if (next.some((r, i) => r !== all[i])) setAll(next);
  }, [isAdmin, user, loaded, menuLoaded, members, menuSet, all, setAll]);

  const canWrite = !!user && canWriteReview(menuSet, sec.id, { loggedIn: !!user, isAdmin, id: user?.id });
  const query = q.trim().toLowerCase();
  const visible = rows
    .filter(r => isAdmin || r.visibility === 'public' || (r.visibility === 'member' && !!user) || (!!user && r.authorId === user.id))
    .filter(r => !cat || r.category === cat)
    .filter(r => !query || r.title.toLowerCase().includes(query) || r.rule.toLowerCase().includes(query)
      || r.category.toLowerCase().includes(query) || reviewRoles(r).toLowerCase().includes(query))
    .sort((a, b) => (b.playDate ?? b.date.slice(0, 10)).localeCompare(a.playDate ?? a.date.slice(0, 10)) || b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(visible.length / PER));
  const cur = Math.min(page, pages);
  const paged = visible.slice((cur - 1) * PER, cur * PER);
  const badgeOf = (label: string) => cats.find(c => c.label === label);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'TRPG REVIEW' : sec.name}</PageTitle>
        <EditableDesc k="treview-desc" def="시나리오마다 별점과 한줄 평 — 페어별 말머리로 모아 봅니다" />
      </div>
      <div className="toolrow">
        <div className="seg">
          <button className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>ALL</button>
          {cats.map(c => (
            <button key={c.id} className={cat === c.label ? 'on' : ''} onClick={() => setCat(c.label)}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchBar placeholder="시나리오·룰·말머리·캐릭터 검색" onSearch={setQ} />
          {canWrite && <button className="btn btn-dark" onClick={() => setWriteOpen(true)}>✎ WRITE</button>}
        </div>
      </div>

      {paged.length > 0 && (
        <div className="rv-grid">
          {paged.map(r => {
            const roles = reviewRoles(r);
            return (
              <article key={r.id} className="panel tc-card rv-card" onClick={() => router.push(`/treview/${r.id}`)}>
                {/* 3:4 타일 — 대표 이미지, 없으면 자리표시자 (v2.1 사용자 요청) */}
                <div className="rv-img">
                  <CroppedBlobImg fileRef={r.thumbId} crop={r.thumbCrop} ph="cool" label={r.thumbId ? undefined : 'REVIEW'} />
                  {r.category && <span className="rv-badge" style={boardBadgeStyle(badgeOf(r.category))}>{r.category}</span>}
                </div>
                <div className="bd">
                  <b className="nm">{r.title}</b>
                  <small className="meta">{[r.rule, r.playDate ? r.playDate.replace(/-/g, '.') : fmtDate(r.date)].filter(Boolean).join(' · ')}</small>
                  {roles && <small className="meta">{roles}</small>}
                  <div className="rv-stars">
                    <span className="s">{r.stars2 !== undefined && starNames.a}<i>{starText(r.stars)}</i></span>
                    {r.stars2 !== undefined && <span className="s">{starNames.b}<i>{starText(r.stars2)}</i></span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          {query ? '검색 결과가 없습니다' : '아직 리뷰가 없습니다'}
        </div>
      )}
      {visible.length > PER && <Pager page={cur} total={pages} onChange={setPage} />}

      {/* 글쓰기 — 모달 (별점·한줄 평이라 페이지를 따로 두지 않았다) */}
      <Modal open={writeOpen} onClose={() => setWriteOpen(false)} title="리뷰 쓰기"
        desc="시나리오 이름 · 페어 말머리 · 룰 · GM/PC 캐릭터 · 별점 · 대표 이미지 · 한줄 평">
        {writeOpen && user && (
          <ReviewForm initial={null} cats={cats} starNames={starNames}
            onCancel={() => setWriteOpen(false)}
            onSave={v => {
              const r: TrpgReview = {
                id: newId(), ...v, date: new Date().toISOString(), author: user.nickname, authorId: user.id, ...secStamp(sec.id),
                editorIds: reviewEditorIds(menuSet, sec.id, members),   // 글쓰기 권한이 있는 회원은 서로의 리뷰도 고친다
              };
              setRows([r, ...rows]);
              setWriteOpen(false);
              toast('리뷰가 등록되었습니다');
            }} />
        )}
      </Modal>
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function ReviewPage() {
  return <Suspense fallback={<section className="page" />}><ReviewPageInner /></Suspense>;
}
