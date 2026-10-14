'use client';
// TRPG 리뷰 수정 (v2.1 사용자 요청 — 모달 대신 페이지) — 쓴 사람·관리자·이 게시판에 글쓰기 권한이 있는 회원(editorIds)
import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { TrpgReview, REVIEW_KEY, REVIEW_SEED, canEditReview } from '@/lib/reviewStore';
import { ReviewForm } from '@/components/trpg/ReviewForm';
import { PageTitle } from '@/components/ui/PageText';

export default function ReviewEditPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [rows, , loaded] = useLocalList<TrpgReview>(REVIEW_KEY, REVIEW_SEED);
  const r = rows.find(x => x.id === id);
  // 소속 게시판이 비공개면 주소로 들어와도 열리지 않게 — 다른 early return보다 먼저 (훅)
  const blocked = useHrefBlock(r && sectionHref('treview', r.secId ?? MAIN_SEC));
  const tt = useSectionTitle('treview', r?.secId, 'TRPG REVIEW');
  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!r || !canEditReview(r, isAdmin, user?.id)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>리뷰를 찾을 수 없거나 수정 권한이 없습니다</p></div>
      </section>
    );
  }
  return <Suspense fallback={<section className="page" />}><ReviewForm initial={r} /></Suspense>;
}
