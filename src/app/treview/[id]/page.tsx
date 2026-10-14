'use client';
// TRPG 리뷰 상세 (v2.1) — 대표 이미지 + 말머리·시나리오·룰·GM/PC·별점·플레이한 날 + 본문.
// EDIT(모달)·DELETE는 쓴 사람·관리자, 그리고 이 게시판에 글쓰기 권한이 있는 회원(editorIds)
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { TrpgReview, REVIEW_KEY, REVIEW_SEED, starText, reviewRoles, canEditReview, reviewEditorIds } from '@/lib/reviewStore';
import { useBoardSettings, reviewCatsOf, reviewStarsOf, boardBadgeStyle } from '@/lib/boardStore';
import { useMenuSettings } from '@/lib/menuStore';
import { useMembers } from '@/lib/members';
import { sanitizeHtml } from '@/lib/sanitize';
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { PageTitle } from '@/components/ui/PageText';
import { ReviewForm } from '@/components/trpg/ReviewForm';
import { useToast } from '@/components/ui/Toast';

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [rows, setRows, loaded] = useLocalList<TrpgReview>(REVIEW_KEY, REVIEW_SEED);
  const { st: boardSet } = useBoardSettings();
  const [menuSet] = useMenuSettings();
  const members = useMembers();
  const [editOpen, setEditOpen] = useState(false);
  const [delAsk, setDelAsk] = useState(false);
  const r = rows.find(x => x.id === id);
  // 소속 게시판이 비공개면 주소로 들어와도 열리지 않게 — 다른 early return보다 먼저 (훅)
  const blocked = useHrefBlock(r && sectionHref('treview', r.secId ?? MAIN_SEC));
  const tt = useSectionTitle('treview', r?.secId, 'TRPG REVIEW');
  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!r || (r.visibility === 'private' && !isAdmin && r.authorId !== user?.id) || (r.visibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>리뷰를 찾을 수 없거나 열람 권한이 없습니다</p></div>
      </section>
    );
  }
  const cats = reviewCatsOf(boardSet, r.secId ?? MAIN_SEC);
  const starNames = reviewStarsOf(boardSet);
  // 수정·삭제 — 관리자 · 쓴 사람 · 글쓰기 권한이 있는 회원 (v2.1 사용자 요청 — 가입자도 수정)
  const canManage = canEditReview(r, isAdmin, user?.id);
  const canDelete = isAdmin || (!!user && r.authorId === user.id);
  const badge = cats.find(c => c.label === r.category);
  const roles = reviewRoles(r);

  return (
    <section className="page rv-detail">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <p>{[r.category, r.author, fmtDate(r.date)].filter(Boolean).join(' · ')}</p>
        <div className="head-actions">
          {canManage && <button className="btn btn-dark" onClick={() => setEditOpen(true)}>EDIT</button>}
          {canDelete && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      <div className="panel rv-detail-panel" style={{ padding: 22, maxWidth: 960, margin: '0 auto' }}>
        {/* 대표 이미지 (v2.1) — 있으면 왼쪽에 3:4 */}
        {r.thumbId && (
          <div className="rv-detail-img">
            <CroppedBlobImg fileRef={r.thumbId} crop={r.thumbCrop} ph="cool" />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 19, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {r.category && <span style={boardBadgeStyle(badge)}>{r.category}</span>}
            {r.title}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>
            {[r.rule && `룰 ${r.rule}`, roles, r.playDate && `플레이 ${r.playDate.replace(/-/g, '.')}`].filter(Boolean).join(' · ')}
          </div>
          <div className="rv-stars">
            <span className="s">{r.stars2 !== undefined && starNames.a}<i>{starText(r.stars)}</i>{r.stars}/5</span>
            {r.stars2 !== undefined && <span className="s">{starNames.b}<i>{starText(r.stars2)}</i>{r.stars2}/5</span>}
          </div>
          {r.body && (
            <div className="post-body" style={{ fontSize: 13.5, lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.body) }} />
          )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="리뷰 수정">
        {editOpen && (
          <ReviewForm initial={r} cats={cats} starNames={starNames}
            onCancel={() => setEditOpen(false)}
            onSave={v => {
              // 글쓰기 권한이 있는 회원 목록도 지금 값으로 새로 적는다 (서버 규칙이 이 목록을 본다)
              const editorIds = reviewEditorIds(menuSet, r.secId ?? MAIN_SEC, members, r.editorIds);
              setRows(rows.map(x => (x.id === r.id ? { ...x, ...v, role: undefined, editorIds } : x)));
              setEditOpen(false);
              toast('저장되었습니다');
            }} />
        )}
      </Modal>
      <ConfirmModal open={delAsk} title="이 리뷰를 삭제하시겠습니까?" body="삭제한 리뷰는 복구할 수 없습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setRows(rows.filter(x => x.id !== r.id)); router.push(tt.href); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
