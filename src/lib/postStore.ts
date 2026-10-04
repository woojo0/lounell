'use client';
// 게시판·방명록 타입 + 공용 목록 저장소 훅
// v2.0: 서버(Supabase) 연결이 있으면 DB, 없으면 localStorage — 화면 코드는 동일하다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostMode } from './sanitize';
import { isServerMode } from './supabase';
import { TABLE_OF, fetchList, syncList, subscribeTable } from './db';
import { currentUserId } from './currentUser';

/** 목록 저장 실패 알림 (v2.0) — 조용히 되돌리면 "쓴 게 바로 지워진다"로만 보여 원인을 알 수 없다.
 *  ListSync가 받아 화면에 띄운다 (설정 저장 실패 알림과 같은 방식) */
export const LIST_ERR_EVT = 'ohome-list-error';
/** 저장 실패를 안내하지 않을 표 (커플홈) — 입력 중 표시처럼 임시 데이터는 규칙이 아직 없어도 홈을 막지 않는다.
 *  대신 LIST_QUIET_ERR_EVT로만 알려서, 쓰는 쪽이 그만두게 한다 */
export const QUIET_TABLES = new Set(['rp_typing']);
export const LIST_QUIET_ERR_EVT = 'ohome-list-quiet-error';
/** 같은 탭 안에서 목록이 바뀌었을 때 (로컬 모드) — detail: { key, next } */
const LIST_EVT = 'ohome-list';

export interface Comment {
  id: string;
  author: string;
  authorId: string;      // 게스트 댓글은 '' (방문자 권한 — 4.10/5.2)
  text: string;
  date: string;          // ISO
  parentId?: string;     // 대댓글
  guestPw?: string;      // 게스트 본인 수정·삭제용 (mock — 실서비스는 서버 해시)
  /** 캐입 댓글 (커플홈) — 이 캐릭터로 쓴 댓글. author에는 쓸 당시 캐릭터 이름이 들어 있다.
   *  권한(수정·삭제)은 여전히 authorId(쓴 회원) 기준 */
  charId?: string;
  /** 그 캐릭터의 AU 모습으로 쓴 댓글 (커플홈 사용자 요청) — `relId:auId`. 없으면 원래 모습 */
  auKey?: string;
}

/**
 * 댓글 한 줄 = 자기 문서 하나 (v2.0).
 *
 * 예전에는 댓글이 글(Post·RoadItem) 안 배열에 들어 있었다. 그래서 **댓글을 달려면 그 글을
 * UPDATE 해야 했고**, 보안 규칙의 「글 수정은 작성자 또는 관리자만」에 걸려 일반 회원이
 * 관리자 글에 댓글을 달면 서버가 거부했다 — 화면에는 잠깐 보였다가 서버 값으로 되돌아와
 * "댓글이 바로 지워지는" 것처럼 보였다 (포크 사용자 제보로 확인).
 *
 * 댓글을 별도 컬렉션으로 빼면 글을 건드릴 필요가 없고, 각 댓글이 자기 authorId를 가지므로
 * 「내가 쓴 댓글은 내가 수정·삭제」가 규칙 그대로 성립한다.
 */
export const COMMENT_KEY = 'ohome.comments.v1';

export interface CommentRow extends Comment {
  targetId: string;                 // 달린 대상(글·로드뷰 항목·감상타래·방명록·일기)의 id
  /** 대상 종류 — 같은 컬렉션을 나눠 쓴다 (thread·guest: v2.0 사용자 요청 · diary: 커플홈) */
  target: 'post' | 'road' | 'thread' | 'guest' | 'diary' | 'memo';
}

export const COMMENT_SEED: CommentRow[] = [];

/** 대상 하나의 댓글 — 분리 저장분 + 옛 글 안에 남아 있던 것(legacy)을 합쳐 시간순으로 */
export function commentsFor(
  rows: CommentRow[], target: CommentRow['target'], targetId: string, legacy: Comment[] = [],
): Comment[] {
  const mine = rows.filter(r => r.target === target && r.targetId === targetId);
  const seen = new Set(mine.map(r => r.id));
  return [...legacy.filter(c => !seen.has(c.id)), ...mine]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type FoldType = 'spoiler' | 'adult' | 'custom';

export interface Post {
  id: string;
  title: string;
  body: string;
  mode: PostMode;        // 렌더 방식 (md / html)
  /** 무엇으로 썼는지 (v2.0) — 에디터로 쓴 글을 수정할 때 HTML 소스가 뜨지 않게 기억한다.
   *  렌더는 mode로 하고, 이 값은 수정 화면을 어떤 모드로 열지에만 쓴다. */
  authored?: 'editor';
  category: string;      // 말머리
  author: string;
  authorId: string;
  date: string;          // ISO
  secret: boolean;       // 비밀글
  notice: boolean;       // 공지 고정
  fold: { type: FoldType; label?: string } | null; // 스포일러/수위 접기 (6.2)
  comments: Comment[];
  boardId?: string;      // 소속 게시판 (5.2 다중 게시판 — 없으면 기본 'main')
  /** 태그 (v2.0 사용자 요청) — 기본형 목록의 작성자 왼쪽에 나열되고 검색에 걸린다 */
  tags?: string[];
  thumbSrc?: string;     // 티켓 스킨 대표 이미지 — 본문에 삽입한 이미지 중 선택 (v1.9)
  thumbCrop?: { x: number; y: number; scale: number };  // 대표 썸네일 크롭 (16:9)
}

export interface GuestEntry {
  id: string;
  author: string;
  authorId?: string;      // 로그인 회원이면
  guestPw?: string;       // 게스트 작성 시 본인 수정·삭제용 (mock — 실서비스는 서버 해시)
  body: string;
  secret: boolean;
  date: string;
  reply?: { author: string; text: string; date: string } | null; // 관리자 답글
}

export const BOARD_CATEGORIES = ['잡담', '설정', '합작', '기타'];

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** 목록 저장소 훅 — 서버 모드면 DB, 아니면 localStorage (v2.0)
 *
 *  화면 코드는 예전 그대로 `[목록, 통째로 저장, 로드완료]`를 쓴다.
 *  서버 모드에서는 저장할 때 이전/새 배열을 비교해 바뀐 행만 insert/update/delete 하고,
 *  다른 사람의 변경은 실시간 구독으로 받아 온다. (로컬 모드는 storage 이벤트로 탭 간 동기화)
 */
export function useLocalList<T extends { id?: string }>(key: string, seed: T[]): [T[], (next: T[]) => void, boolean] {
  const server = isServerMode() && !!TABLE_OF[key];
  const table = TABLE_OF[key];
  // 서버 모드에선 시드를 화면에 내보내지 않는다 (v2.0 사용자 발견) — 서버 목록을 받아오기 전까지
  // 예시 데이터가 잠깐 보였다 사라지는 깜빡임의 원인이었다. 시드는 로컬 모드의 시작값일 뿐이고,
  // 서버 모드에서 시드를 기준으로 삼으면 저장할 때 없는 행을 지우려 드는 문제도 있었다.
  const [list, setList] = useState<T[]>(() => (server ? [] : seed));
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<T[]>(list);          // diff 기준이 되는 "DB에 있다고 아는" 상태
  latest.current = list;
  // 순번 — 서버 fetch가 여러 건 동시에 떠 있을 때, 늦게 시작한 것보다 먼저 도착한 낡은 결과가
  // 화면을 덮어쓰지 않게 한다 (v2.0 사용자 발견 — "휴지통에 방금 넣은 게 새로고침해야 보임").
  // 원인: 실시간 구독이 같은 변경에 두 번(로컬 반영 1회 · 서버 확정 1회) 반응해 fetch가 겹치면
  // 나중에 시작했지만 먼저 끝난 요청이 있고, 그보다 늦게 끝나는 "시작은 먼저였던" 요청이 결과를
  // 되돌려써 버릴 수 있다. 낙관적 갱신(update) 시점에도 순번을 올려 그 전에 나간 fetch는 전부
  // 낡은 것으로 취급 — 막 반영한 내 변경을 이전 결과가 지우지 못하게 한다.
  const reqId = useRef(0);

  useEffect(() => {
    let alive = true;
    if (server) {
      const load = () => {
        const id = ++reqId.current;
        fetchList<T & { id: string }>(table)
          .then(rows => {
            if (!alive || id !== reqId.current) return;   // 그 사이 더 최신 요청이 있었으면 버림
            setList(rows); latest.current = rows; setLoaded(true);
          })
          .catch(() => { if (alive) setLoaded(true); });
      };
      load();
      const off = subscribeTable(table, load);   // 다른 사람이 쓰면 바로 반영
      return () => { alive = false; off(); };
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) setList(JSON.parse(raw));
    } catch { /* 시드 유지 */ }
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try { setList(JSON.parse(e.newValue)); } catch { /* 무시 */ }
    };
    // 같은 탭의 다른 화면(상단바 등)이 저장한 것도 바로 — storage 이벤트는 다른 탭에만 간다 (커플홈:
    // 자관을 만들면 상단 메뉴에 그 자관 항목이 바로 보여야 한다. 서버 모드는 구독이 이 일을 한다)
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; next: T[] }>).detail;
      if (d?.key === key && d.next !== latest.current) { setList(d.next); latest.current = d.next; }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(LIST_EVT, onLocal);
    return () => { alive = false; window.removeEventListener('storage', onStorage); window.removeEventListener(LIST_EVT, onLocal); };
  }, [key, server, table]);

  const update = useCallback((next: T[]) => {
    const prev = latest.current;
    // 이 시점 이전에 나간 fetch는 전부 낡은 것으로 표시 — 뒤늦게 도착해도 이 낙관적 갱신을 덮지 않는다
    const id = ++reqId.current;
    setList(next);            // 낙관적 반영 — 화면은 즉시 바뀐다
    latest.current = next;
    if (server) {
      syncList(table, prev as unknown as { id: string }[], next as unknown as { id: string }[], currentUserId())
        .catch(err => {
          // 실패하면 서버 상태로 되돌려 화면과 DB가 어긋난 채로 남지 않게 —
          // 되돌리기만 하면 "방금 쓴 게 스스로 사라지는" 것처럼 보이므로 이유도 함께 알린다 (v2.0)
          console.error('[ohome] 저장 실패', err);
          try {
            window.dispatchEvent(new CustomEvent(QUIET_TABLES.has(table) ? LIST_QUIET_ERR_EVT : LIST_ERR_EVT, {
              detail: { table, message: err instanceof Error ? err.message : String(err) },
            }));
          } catch { /* 무시 */ }
          reqId.current = id;   // 이 복구 fetch는 유효한 최신 요청으로 인정
          fetchList<T & { id: string }>(table)
            .then(rows => { if (id === reqId.current) { setList(rows); latest.current = rows; } })
            .catch(() => { /* 무시 */ });
        });
      return;
    }
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 무시 */ }
    try { window.dispatchEvent(new CustomEvent(LIST_EVT, { detail: { key, next } })); } catch { /* 무시 */ }
  }, [key, server, table]);

  return [list, update, loaded];
}

/* ---------- 시드 (데모) ---------- */
export const BOARD_SEED: Post[] = [];

export const GUEST_SEED: GuestEntry[] = [];

/** 오늘 날짜 YYYY-MM-DD — **이 컴퓨터의 시간대**로 (커플홈 사용자 제보 — 「방금 뽑은 질문에 어제 날짜가 찍힌다」:
 *  toISOString()은 UTC라 한국 아침 9시 전에는 전날 날짜가 나왔다) */
export const todayYmd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
