'use client';
// TRPG 리뷰 게시판 (v2.1 사용자 요청 — "간단하게 별점을 매기고 한줄 평가를 적는 형태").
// 시나리오마다 글 하나 — 시나리오 이름 · 페어 말머리(환경설정 > 게시판 관리) · TRPG 룰 · 플레이한 날 · 공개범위 ·
// 대표 이미지(목록의 3:4 타일) · 인물별 평가(GM/PC · 이름 · 별점 · 한줄평 — 인원 추가로 PC 여럿). 글은 콘텐츠 컬렉션 trpg_reviews.
// 수정은 쓴 사람·관리자, 그리고 이 게시판에 글쓰기 권한이 있는 회원(editorIds — 각자 자기 평가를 같은 글에 적는다).
import type { Visibility } from './charStore';
import type { CropValue } from '@/components/ui/CropEditor';
import type { MenuSettings } from './menuStore';
import { canWriteAt, writeKeyOf } from './menuStore';
import type { MemberLite } from './members';

/** 인물별 평가 한 사람 (v2.1 사용자 요청 — 「GM 무무 ★★★★☆ / 무무 한줄평: …」, 누가 매긴 별점인지 보이게) */
export interface ReviewRater {
  id: string;
  role: 'GM' | 'PC';
  name: string;              // 누가 매겼는지 — 자유 입력 (사람이든 캐릭터든)
  stars: number;             // 1~5 · 0이면 아직 안 매김
  text: string;              // 한줄평 (여러 줄 가능)
}

export interface TrpgReview {
  /** 소속 섹션 (여러 개로 만들었을 때). 없으면 기본 게시판 */
  secId?: string;
  id: string;
  title: string;             // 시나리오 이름 (글 제목)
  category: string;          // 페어 말머리 — 환경설정 > 게시판 관리의 TRPG 리뷰 말머리 중 하나 (없으면 빈 값)
  rule: string;              // TRPG 룰
  /** 인물별 평가 (v2.1). 없으면 옛 글 — 아래 옛 칸에서 읽는다 (ratersOf) */
  raters?: ReviewRater[];
  playDate?: string;         // 플레이한 날 (선택, YYYY-MM-DD)
  /** 대표 이미지 — 목록의 3:4 타일 · 상세 왼쪽. 없으면 자리표시자 */
  thumbId?: string;
  thumbCrop?: CropValue;
  date: string;              // 등록 ISO
  author: string;
  authorId: string;
  visibility: Visibility;
  /** 수정할 수 있는 회원 — 저장할 때 이 게시판에 글쓰기 권한이 있는 회원 전원을 적는다 (서버 규칙이 이 목록을 본다) */
  editorIds?: string[];
  /* ---- 옛 칸 (v2.1 처음 판 — 별점 둘 · 본문 하나 · GM/PC 이름 또는 롤 선택). 새로 저장하면 raters로 옮기고 지운다 ---- */
  gm?: string;
  pc?: string;
  role?: 'GM' | 'PC' | '';
  stars?: number;
  stars2?: number;
  body?: string;
}

export const REVIEW_KEY = 'ohome.treview.v1';
export const REVIEW_SEED: TrpgReview[] = [];

/** 별점 글자 — ★★★★☆ */
export const starText = (n: number): string => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
};

/** HTML 본문을 줄바꿈이 남은 글자로 — 옛 글의 본문을 한줄평 칸으로 옮길 때 */
export const reviewHtmlText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map(s => s.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** 인물별 평가 — 옛 글(별점 둘 · 본문 하나)은 이 모양으로 바꿔 읽는다.
 *  첫 별점은 이름이 있는 쪽(GM 먼저)에, 본문은 그 사람의 한줄평으로. 두 번째 별점은 반대 롤에 */
export function ratersOf(r: TrpgReview): ReviewRater[] {
  if (r.raters?.length) return r.raters;
  const gm = r.gm?.trim() ?? '', pc = r.pc?.trim() ?? '';
  const first: 'GM' | 'PC' = gm ? 'GM' : pc ? 'PC' : r.role === 'PC' ? 'PC' : 'GM';
  const second: 'GM' | 'PC' = first === 'GM' ? 'PC' : 'GM';
  const nameOf = (role: 'GM' | 'PC') => (role === 'GM' ? gm : pc);
  const text = r.body ? reviewHtmlText(r.body) : '';
  const out: ReviewRater[] = [];
  if ((r.stars ?? 0) > 0 || nameOf(first) || text) {
    out.push({ id: `${r.id}-1`, role: first, name: nameOf(first), stars: r.stars ?? 0, text });
  }
  if (r.stars2 !== undefined || nameOf(second)) {
    out.push({ id: `${r.id}-2`, role: second, name: nameOf(second), stars: r.stars2 ?? 0, text: '' });
  }
  return out;
}

/** 「GM 무무」 — 이름이 없으면 롤만 */
export const raterLabel = (x: Pick<ReviewRater, 'role' | 'name'>): string =>
  x.name.trim() ? `${x.role} ${x.name.trim()}` : x.role;

/** 검색용 글자 — 이름·한줄평 전부 */
export const reviewSearchText = (r: TrpgReview): string =>
  ratersOf(r).map(x => `${raterLabel(x)} ${x.text}`).join(' ');

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
