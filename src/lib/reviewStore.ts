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
import { logPath } from './galleryStore';

/** 인물별 평가 한 사람 (v2.1 사용자 요청 — 「GM 이름 ★★★★☆ / 이름 한줄평: …」, 누가 매긴 별점인지 보이게) */
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
  /** 연결한 로그 (v2.1 사용자 요청) — 등록된 로그 또는 주소, 여러 개 */
  logs?: ReviewLogLink[];
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

/** 「GM 이름」 — 이름이 없으면 롤만 */
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

/* ---------- 로그 연결 (v2.1 사용자 요청 — 이미 등록된 로그를 고르거나 주소를 넣는다, 여러 개) ---------- */

/** 리뷰에 붙인 로그 하나 — 등록된 로그(logId) 또는 주소(url) */
export interface ReviewLogLink {
  id: string;
  /** 이 홈의 로그 백업에 등록된 로그 */
  logId?: string;
  /** 고를 때의 제목·주소·전체공개 여부 — 보는 사람의 로그 목록에 그 로그가 없을 때(목록에서 숨긴 로그) 대신 쓴다.
   *  제목·주소는 고를 때 전체공개였던 로그만 적어 둔다 — 리뷰 문서는 리뷰를 볼 수 있는 사람 누구에게나 내려가므로,
   *  화면에서 숨기는 것만으로는 비공개·멤버공개 로그의 제목이 문서째 새어 나간다 (이 홈에서 고침) */
  title?: string;
  path?: string;
  pub?: boolean;
  /** 바깥 주소 또는 이 홈 안의 주소(/…) */
  url?: string;
  /** 주소에 붙일 이름 (선택) */
  label?: string;
}

/** 로그 번호 표기 — 직접 적은 번호, 없으면 LOG 012 */
export const logNoLabel = (l: { no: number; noText?: string }): string =>
  l.noText?.trim() || `LOG ${String(l.no).padStart(3, '0')}`;

/** 등록된 로그로 붙이기 — 전체공개 로그면 제목·주소도 적어 두고, 아니면 로그 id만 (위 ReviewLogLink 주석) */
export const logLinkOf = (l: { id: string; slug?: string; title: string; visibility: string }, id: string): ReviewLogLink =>
  l.visibility === 'public'
    ? { id, logId: l.id, title: l.title, path: logPath(l), pub: true }
    : { id, logId: l.id, pub: false };

/** 이 홈 안의 주소인가 — 「/」로 시작하되 「//」·「/\」(브라우저가 바깥 주소로 읽는다)·공백·역슬래시는 안 된다 */
export const isInternalPath = (s: string): boolean => /^\/(?![/\\])[^\s\\]*$/.test(s);

/** 주소 다듬기 — http(s) 주소나 이 홈 안의 주소(/…)만 받는다. 도메인만 적었으면 https:// 를 붙인다 */
export function normalizeLinkUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (isInternalPath(s)) return s;
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s)) return `https://${s}`;
  return null;
}

/** 이 홈의 로그 주소(/log/{id 또는 별명} — 옛 /trpg/… 주소도)면 그 로그 — 주소로 넣어도 등록된 로그로 붙인다 */
export function logFromUrl<T extends { id: string; slug?: string }>(url: string, logs: T[]): T | undefined {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return undefined;
    const m = u.pathname.match(/^\/(?:log|trpg)\/([^/]+)\/?$/);   // RP LOG 주소 (옛 /trpg/…는 /log/…로 넘겨 주므로 같이 받는다)
    if (!m) return undefined;
    const key = decodeURIComponent(m[1]);
    return logs.find(l => l.id === key || l.slug === key);
  } catch { return undefined; }
}

export const prettyUrl = (u: string): string => u.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** 상세에 보여 줄 로그 줄 — 보는 사람이 볼 수 없는 로그는 뺀다 */
export interface ReviewLinkView { id: string; tag: string; text: string; sub?: string; href: string; external: boolean }
export function reviewLinkViews(
  links: ReviewLogLink[] | undefined,
  logs: { id: string; slug?: string; title: string; no: number; noText?: string }[],
  isAdmin: boolean,
): ReviewLinkView[] {
  const out: ReviewLinkView[] = [];
  for (const x of links ?? []) {
    if (x.logId) {
      const l = logs.find(y => y.id === x.logId);
      if (l) out.push({ id: x.id, tag: logNoLabel(l), text: l.title, href: logPath(l), external: false });
      // 목록에 없는 로그 — 관리자에게 없으면 지워진 것, 회원에게 없으면 목록에서 숨겼거나 볼 수 없는 것 (고를 때 전체공개였던 것만)
      else if (!isAdmin && x.pub && x.path && isInternalPath(x.path)) out.push({ id: x.id, tag: 'LOG', text: x.title || '로그', href: x.path, external: false });
      continue;
    }
    if (!x.url) continue;
    const internal = isInternalPath(x.url);
    if (!internal && !/^https?:\/\//i.test(x.url)) continue;   // 저장된 값도 다시 거른다 (javascript: 등)
    out.push({
      id: x.id, tag: internal ? 'PAGE' : 'URL', text: x.label?.trim() || prettyUrl(x.url),
      sub: x.label?.trim() ? prettyUrl(x.url) : undefined, href: x.url, external: !internal,
    });
  }
  return out;
}
