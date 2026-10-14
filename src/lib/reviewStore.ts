'use client';
// TRPG 리뷰 게시판 (v2.1 사용자 요청 — "간단하게 별점을 매기고 한줄 평가를 적는 형태").
// 시나리오마다 글 하나 — 페어별 말머리(환경설정 > 게시판 관리) · TRPG 룰 · GM/PC 캐릭터 이름 · 별점(둘이 따로 매길 수 있다) ·
// 대표 이미지(3:4 타일) · 본문(한줄 평). 글은 콘텐츠 컬렉션 trpg_reviews.
// 수정은 쓴 사람·관리자, 그리고 이 게시판에 글쓰기 권한이 있는 회원(editorIds — 둘이 같은 리뷰에 별점을 따로 적으려면 상대 글도 고쳐야 한다).
import type { Visibility } from './charStore';
import type { CropValue } from '@/components/ui/CropEditor';
import type { MenuSettings } from './menuStore';
import { canWriteAt, writeKeyOf } from './menuStore';
import type { MemberLite } from './members';

export interface TrpgReview {
  /** 소속 섹션 (여러 개로 만들었을 때). 없으면 기본 게시판 */
  secId?: string;
  id: string;
  title: string;             // 시나리오 이름 (글 제목)
  category: string;          // 페어 말머리 — 환경설정 > 게시판 관리의 TRPG 리뷰 말머리 중 하나 (없으면 빈 값)
  rule: string;              // TRPG 룰
  /** GM / PC 캐릭터 이름 (v2.1 사용자 요청 — 선택이 아니라 이름을 적는다). 옛 글의 role(GM/PC 선택)은 그대로 보여 준다 */
  gm?: string;
  pc?: string;
  role?: 'GM' | 'PC' | '';
  stars: number;             // 별점 1 (1~5)
  stars2?: number;           // 별점 2 (1~5) — 둘이 따로 매길 때 (선택)
  body: string;              // 한줄 평·본문 (HTML)
  playDate?: string;         // 플레이한 날 (선택, YYYY-MM-DD)
  /** 대표 이미지 (v2.1 사용자 요청) — 목록의 3:4 타일. 없으면 자리표시자 */
  thumbId?: string;
  thumbCrop?: CropValue;
  date: string;              // 등록 ISO
  author: string;
  authorId: string;
  visibility: Visibility;
  /** 수정할 수 있는 회원 — 저장할 때 이 게시판에 글쓰기 권한이 있는 회원 전원을 적는다 (서버 규칙이 이 목록을 본다) */
  editorIds?: string[];
}

export const REVIEW_KEY = 'ohome.treview.v1';
export const REVIEW_SEED: TrpgReview[] = [];

/** 별점 글자 — ★★★★☆ */
export const starText = (n: number): string => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
};

/** 본문에서 태그를 뺀 한 줄 — 목록의 한줄 평 */
export const reviewExcerpt = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** GM/PC 표기 — 「GM 푸딩 · PC 곰주」. 옛 글은 role 선택값 */
export const reviewRoles = (r: Pick<TrpgReview, 'gm' | 'pc' | 'role'>): string =>
  [r.gm?.trim() && `GM ${r.gm.trim()}`, r.pc?.trim() && `PC ${r.pc.trim()}`].filter(Boolean).join(' · ')
  || (r.role ? r.role : '');

/** 이 리뷰 게시판에 글을 쓸 수 있는가 — 환경설정 「권한」(기본 가입자) */
export const canWriteReview = (ms: MenuSettings, secId: string | undefined, viewer: { loggedIn: boolean; isAdmin: boolean; id?: string }) =>
  canWriteAt(ms, writeKeyOf('/treview', secId), viewer, 'member');

/** 저장할 때 적는 「수정할 수 있는 회원」 — 지금 이 게시판에 글쓰기 권한이 있는 회원 전원 (trpgPerm과 같은 규칙).
 *  「글쓰기 멤버」를 골랐으면 그들만, 아니면 가입 회원 모두(관리자는 늘 되므로 뺀다). 회원 목록이 아직 안 왔으면 지금 값 유지 */
export function reviewEditorIds(ms: MenuSettings, secId: string | undefined, members: MemberLite[], prev?: string[]): string[] {
  const key = writeKeyOf('/treview', secId);
  if ((ms.writePerm?.[key] ?? 'member') === 'admin') return [];
  const picked = ms.writeMembers?.[key];
  if (picked?.length) return [...new Set(picked)].sort();
  const pool = members.filter(m => m.role !== 'admin').map(m => m.id);
  if (!pool.length) return prev ?? [];
  return [...new Set(pool)].sort();
}

/** 이 리뷰를 고칠 수 있는가 — 관리자 · 쓴 사람 · editorIds에 든 회원 */
export const canEditReview = (r: Pick<TrpgReview, 'authorId' | 'editorIds'>, isAdmin: boolean, uid?: string | null): boolean =>
  isAdmin || (!!uid && (r.authorId === uid || !!r.editorIds?.includes(uid)));

/** 같은 회원 목록인가 (순서 무관) — 바뀐 문서만 다시 쓰려고 */
export const sameIdList = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && b.every(x => a.includes(x));
