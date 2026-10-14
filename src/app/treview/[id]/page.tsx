'use client';
// TRPG 리뷰 상세 (v2.1 사용자 요청) — 왼쪽에 대표 이미지, 오른쪽에 시나리오 정보와 GM 평점 · PC 평점을 나눠서.
// 사람마다 「이름 ★★★★☆」 아래 한줄평. EDIT(페이지)은 쓴 사람·관리자·글쓰기 권한이 있는 회원(editorIds), DELETE는 쓴 사람·관리자
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgReview, REVIEW_KEY, REVIEW_SEED, starText, ratersOf, canEditReview, reviewLinkViews } from '@/lib/reviewStore';
import { TrpgLog, TRPG_SEED } from '@/lib/galleryStore';
import { useBoardSettings, reviewCatsOf, boardBadgeStyle } from '@/lib/boardStore';
import { ConfirmModal } from '@/components/ui/Modal';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { PageTitle } from '@/components/ui/PageText';

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [rows, setRows, loaded] = useLocalList<TrpgReview>(REVIEW_KEY, REVIEW_SEED);
  const { st: boardSet } = useBoardSettings();
  const [delAsk, setDelAsk] = useState(false);
  const [logs] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);   // 연결한 로그의 제목·주소 (v2.1)
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
  // 수정 — 관리자 · 쓴 사람 · 글쓰기 권한이 있는 회원 (가입자도 수정, v2.1 사용자 요청). 삭제는 쓴 사람·관리자
  const canManage = canEditReview(r, isAdmin, user?.id);
  const canDelete = isAdmin || (!!user && r.authorId === user.id);
  const badge = cats.find(c => c.label === r.category);
  const rs = ratersOf(r);
  // 연결한 로그 — 보는 사람이 볼 수 없는 로그는 빠진다 (reviewLinkViews)
  const linkViews = reviewLinkViews(r.logs, logs, isAdmin);

  return (
    <section className="page rv-detail">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        {/* 작성자·작성날짜는 보이지 않는다 (사용자 요청 — cm_260929 8bbdaa7과 같게. 말머리는 아래 배지로) */}
        <div className="head-actions">
          {canManage && <button className="btn btn-dark" onClick={() => router.push(`/treview/${r.id}/edit`)}>EDIT</button>}
          {canDelete && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      <div className="panel rv-detail-panel">
        {/* 왼쪽 — 대표 이미지 (3:4) */}
        {r.thumbId && (
          <div className="rv-detail-img">
            <CroppedBlobImg fileRef={r.thumbId} crop={r.thumbCrop} ph="cool" />
          </div>
        )}
        {/* 오른쪽 — 시나리오 정보, 그 아래 GM 평점 · PC 평점 */}
        <div style={{ minWidth: 0 }}>
          <h2 className="rv-d-title">
            {r.category && <span style={boardBadgeStyle(badge)}>{r.category}</span>}
            {r.title}
          </h2>
          <div className="rv-d-meta">
            {[r.rule && `룰 ${r.rule}`, r.playDate && `플레이 ${r.playDate.replace(/-/g, '.')}`].filter(Boolean).join(' · ')}
          </div>
          {(['GM', 'PC'] as const).map(role => {
            const list = rs.filter(x => x.role === role);
            if (!list.length) return null;
            return (
              <div key={role} className="rv-d-group">
                <div className="rv-d-role">{role} 평점</div>
                {list.map(x => (
                  <div key={x.id} className="rv-d-rater">
                    <div className="hd">
                      <b>{x.name || role}</b>
                      <span className="st"><i>{starText(x.stars)}</i>{x.stars > 0 ? `${x.stars}/5` : '별점 없음'}</span>
                    </div>
                    {x.text && <p className="tx">{x.text}</p>}
                  </div>
                ))}
              </div>
            );
          })}
          {rs.length === 0 && <p className="hint" style={{ marginTop: 18 }}>아직 평가가 없습니다</p>}
          {linkViews.length > 0 && (
            <div className="rv-d-group">
              <div className="rv-d-role">로그</div>
              <div className="rv-d-logs">
                {linkViews.map(v => (
                  <a key={v.id} className="rv-d-log" href={v.href}
                    {...(v.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : { onClick: (e: React.MouseEvent) => { e.preventDefault(); router.push(v.href); } })}>
                    <span className="tg">{v.tag}</span>
                    <span className="tx">{v.text}{v.sub && <small>{v.sub}</small>}</span>
                    <span className="ar">{v.external ? '↗' : '›'}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal open={delAsk} title="이 리뷰를 삭제하시겠습니까?" body="삭제한 리뷰는 복구할 수 없습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setRows(rows.filter(x => x.id !== r.id)); router.push(tt.href); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
