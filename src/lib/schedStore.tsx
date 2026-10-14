'use client';
// 스케줄러 (4.12) — 월간 캘린더 일정 + 카테고리(관리자 편집) + 등록 권한 옵션
// 투두/D-day는 메인 위젯 데이터(mainStore)를 그대로 공유
import { useCallback, useEffect, useMemo, useState } from 'react';
import { newId, useLocalList } from './postStore';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';
import { MAIN_SEC, inSection, secStamp } from './sectionStore';
import { currentUserId } from './currentUser';
import { isServerMode } from './backend';
import { useAuth } from './auth';

export interface SchedCategory { id: string; label: string; color: string }

export const DEFAULT_SCHED_CATS: SchedCategory[] = [
  { id: 'sc-trpg', label: 'TRPG 세션', color: '#b39b6b' },
  { id: 'sc-due', label: '마감', color: '#a63a45' },
  { id: 'sc-anniv', label: '기념일', color: '#4c6a8e' },
];

export interface SchedEvent {
  id: string;
  title: string;
  start: string;             // YYYY-MM-DD
  end?: string;              // 기간 일정 (선택)
  catId: string;
  color?: string;            // 개별 색 (없으면 카테고리 색)
  memo?: string;
  visibility: Visibility;
  /** 반복 — 없음 / 매년 / 매주 (v2.1 사용자 요청). 매주는 몇 주 동안(repeatCount) 또는 언제까지(repeatUntil)로 끝을 정할 수 있다 — 둘 다 비우면 계속 */
  repeat: 'none' | 'yearly' | 'weekly';
  repeatCount?: number;      // 매주 — 몇 주 동안 (1 이상)
  repeatUntil?: string;      // 매주 — YYYY-MM-DD 까지
  secId?: string;            // 어느 스케줄러 것인지 (v2.0) — 없으면 기본 스케줄러
  /** 등록한 회원 (v2.1) — 회원도 일정을 넣을 수 있게 되면서. 없는 옛 일정은 관리자 것. 수정·삭제는 본인과 관리자 */
  authorId?: string;
}

/** 일정은 콘텐츠 컬렉션에 한 건씩 (v2.1 사용자 요청 — "회원도 달력 일정 추가"). 예전엔 설정(ohome.sched.v1) 안 배열이라
 *  서버 모드에서 관리자만 쓸 수 있었다. 옛 저장분은 관리자가 열었을 때 한 번 옮겨진다 (useSched) */
export const SCHED_EV_KEY = 'ohome.schedev.v1';
export const SCHED_EV_SEED: SchedEvent[] = [];
/** 이 일정을 고칠 수 있는가 — 관리자 · 등록한 본인 */
export const canEditEvent = (e: SchedEvent, isAdmin: boolean, uid?: string | null): boolean =>
  isAdmin || (!!uid && e.authorId === uid);

// 배포 기본 — 더미 일정 없음 (v1.9)
const SEED_EVENTS: SchedEvent[] = [];

interface SchedState {
  events: SchedEvent[];
  /** 기본 스케줄러의 카테고리 — 예전 저장분이 그대로 여기 있다 */
  cats: SchedCategory[];
  /** 스케줄러별 카테고리 (v2.0 사용자 요청) — 정한 적이 없으면 기본 것을 그대로 쓴다.
   *  새로 만들자마자 카테고리가 빈칸이면 일정부터 못 넣는다. */
  secCats?: Record<string, SchedCategory[]>;
  allowMember: boolean;      // 회원도 일정 등록 허용 (4.12 등록 권한 옵션) — 스케줄러 공통
}

/** 그 스케줄러의 카테고리 (v2.0) — 따로 정한 적이 없으면 기본 스케줄러 것 */
const catsOf = (s: SchedState, sec: string): SchedCategory[] =>
  (sec === MAIN_SEC ? s.cats : s.secCats?.[sec] ?? s.cats);

/** 그 스케줄러의 카테고리를 담은 patch — 기본이면 예전 자리에 그대로 저장한다 */
const catsPatch = (s: SchedState, sec: string, cats: SchedCategory[]): Partial<SchedState> =>
  (sec === MAIN_SEC ? { cats } : { secCats: { ...s.secCats, [sec]: cats } });

/** 모든 스케줄러의 카테고리를 합친 것 (id 중복 제거) — 섹션을 안 가리는 쪽(메인 위젯)이 쓴다.
 *  일정 색을 카테고리에서 끌어오므로, 합쳐 두지 않으면 다른 스케줄러 일정이 기본색으로 나온다 */
const allCats = (s: SchedState): SchedCategory[] => {
  const seen = new Map<string, SchedCategory>();
  [...s.cats, ...Object.values(s.secCats ?? {}).flat()].forEach(c => { if (!seen.has(c.id)) seen.set(c.id, c); });
  return [...seen.values()];
};

const DEFAULTS: SchedState = { events: SEED_EVENTS, cats: DEFAULT_SCHED_CATS, allowMember: false };
const KEY = 'ohome.sched.v1';

/**
 * 스케줄러 (v2.0 — 여러 개, 사용자 요청).
 * secId를 주면 **그 스케줄러 것만** 보여 주고 거기에 저장한다.
 * 주지 않으면 **전부** 돌려준다 — 메인 위젯이 그렇게 쓴다(어느 스케줄러든 다가오는 일정은 다가온다).
 */
export function useSched(secId?: string) {
  const [raw, setSt] = useState<SchedState>(DEFAULTS);
  const sec = secId ?? MAIN_SEC;
  const [setLoaded_, setLoadedFlag] = useState(false);
  // 일정은 콘텐츠 컬렉션 (v2.1) — 회원도 자기 일정을 넣고 고칠 수 있게. 카테고리·회원 허용 옵션은 설정(관리자) 그대로
  const [rows, setRows, rowsLoaded] = useLocalList<SchedEvent>(SCHED_EV_KEY, SCHED_EV_SEED);
  const { isAdmin } = useAuth();
  useEffect(() => {
    try {
      const stored = getRawSetting(KEY);
      if (stored) setSt({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch { /* 기본값 */ }
    setLoadedFlag(true);
  }, []);
  const loaded = setLoaded_ && rowsLoaded;
  const apply = useCallback((fn: (s: SchedState) => SchedState) => {
    setSt(s => {
      const n = fn(s);
      try { setSetting(KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  /* 옛 저장분(설정 안 events) → 컬렉션으로 한 번 옮긴다 — 설정은 관리자만 쓸 수 있으니 관리자(또는 서버 없는 로컬)가 열었을 때.
     옮기기 전에는 아래 all이 둘을 합쳐 보여 주므로 회원에게도 사라져 보이지 않는다 */
  useEffect(() => {
    if (!loaded || raw.events.length === 0) return;
    if (isServerMode() && !isAdmin) return;
    const legacy = raw.events.filter(e => !rows.some(r => r.id === e.id));
    setRows([...rows, ...legacy]);
    apply(s => ({ ...s, events: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, raw.events.length, isAdmin]);
  const all = useMemo(() => [...raw.events, ...rows], [raw.events, rows]);
  const addEvent = useCallback((ev: Omit<SchedEvent, 'id'>) =>
    setRows([...rows, { id: newId(), ...ev, authorId: currentUserId() ?? undefined, ...secStamp(sec) }]), [rows, setRows, sec]);
  const updateEvent = useCallback((id: string, p: Partial<SchedEvent>) => {
    if (rows.some(e => e.id === id)) setRows(rows.map(e => (e.id === id ? { ...e, ...p } : e)));
    else apply(s => ({ ...s, events: s.events.map(e => (e.id === id ? { ...e, ...p } : e)) }));   // 아직 안 옮겨진 옛 일정
  }, [rows, setRows, apply]);
  const removeEvent = useCallback((id: string) => {
    if (rows.some(e => e.id === id)) setRows(rows.filter(e => e.id !== id));
    else apply(s => ({ ...s, events: s.events.filter(e => e.id !== id) }));
  }, [rows, setRows, apply]);
  // 카테고리는 보고 있는 스케줄러 것만 건드린다 (v2.0)
  const mutCats = useCallback((fn: (cats: SchedCategory[]) => SchedCategory[]) =>
    apply(s => ({ ...s, ...catsPatch(s, sec, fn(catsOf(s, sec))) })), [apply, sec]);
  const patchCat = useCallback((id: string, p: Partial<SchedCategory>) =>
    mutCats(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c))), [mutCats]);
  const addCat = useCallback(() =>
    mutCats(cs => [...cs, { id: newId(), label: '새 카테고리', color: '#8a8f98' }]), [mutCats]);
  const removeCat = useCallback((id: string) => mutCats(cs => cs.filter(c => c.id !== id)), [mutCats]);
  const setCats = useCallback((cats: SchedCategory[]) => mutCats(() => cats), [mutCats]);
  /** 특정 날짜 안에서 순서 바꾸기 (v2.0) — 달력 칸에는 위에서 3개만 보이므로 순서가 곧 우선순위다.
   *  그 날짜에 걸리는 일정들이 차지하던 자리에 새 순서를 그대로 끼워 넣는다. */
  const reorderOn = useCallback((ids: string[]) => {
    const pos = rows.map((e, i) => (ids.includes(e.id) ? i : -1)).filter(i => i >= 0);
    const byId = new Map(rows.map(e => [e.id, e]));
    const next = [...rows];
    ids.forEach((id, k) => { const e = byId.get(id); if (e && pos[k] !== undefined) next[pos[k]] = e; });
    setRows(next);
  }, [rows, setRows]);
  const setAllowMember = useCallback((v: boolean) => apply(s => ({ ...s, allowMember: v })), [apply]);
  /* 화면이 볼 상태 — 섹션을 지정하면 그 스케줄러 것만, 아니면 전부.
     저장은 위 함수들이 **원본**을 상대로 하므로 다른 스케줄러가 지워지지 않는다 */
  const st: SchedState = useMemo(() => (secId === undefined
    ? { ...raw, events: all, cats: allCats(raw) }
    : { ...raw, events: all.filter(e => inSection(e.secId, sec)), cats: catsOf(raw, sec) }
  ), [raw, all, secId, sec]);
  return {
    st, loaded, addEvent, updateEvent, removeEvent,
    patchCat, addCat, removeCat, setCats, setAllowMember, reorderOn,
  };
}

/** 일정 표시 색 — 개별 색 우선, 없으면 카테고리 색 */
export const eventColor = (e: SchedEvent, cats: SchedCategory[]) =>
  e.color ?? cats.find(c => c.id === e.catId)?.color ?? '#8a8f98';

const DAY = 86400000;
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / DAY);
const addDays = (a: string, n: number) => {
  const d = new Date(a + 'T00:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 해당 날짜(YYYY-MM-DD)에 걸리는 일정인지 — 기간·매년·매주 반복 지원 */
export function eventOnDate(e: SchedEvent, date: string): boolean {
  const end = e.end && e.end >= e.start ? e.end : e.start;
  if (e.repeat === 'yearly') {
    // 월-일만 비교 (기간 반복은 시작 월-일~끝 월-일)
    const md = date.slice(5);
    return e.start.slice(5) <= md && md <= end.slice(5);
  }
  if (e.repeat === 'weekly') {
    // 매주 같은 요일에 (v2.1 사용자 요청) — 기간 일정이면 그 길이만큼. 몇 주 동안·언제까지로 끝을 정할 수 있다
    if (date < e.start) return false;
    if (e.repeatUntil && date > e.repeatUntil) return false;
    const diff = daysBetween(e.start, date);
    const week = Math.floor(diff / 7);
    if (e.repeatCount && e.repeatCount > 0 && week >= e.repeatCount) return false;
    return diff - week * 7 <= daysBetween(e.start, end);
  }
  return e.start <= date && date <= end;
}

/** 오늘(포함) 이후 이 일정이 처음 오는 날 — 다가오는 일정 목록용. 끝난 반복이면 null */
export function nextOccurrence(e: SchedEvent, today: string): string | null {
  if (e.repeat === 'yearly') {
    const y = Number(today.slice(0, 4));
    const thisYear = `${y}-${e.start.slice(5)}`;
    return thisYear >= today ? thisYear : `${y + 1}-${e.start.slice(5)}`;
  }
  if (e.repeat === 'weekly') {
    if (e.start >= today) return e.start;
    const diff = daysBetween(e.start, today);
    const week = Math.ceil(diff / 7);
    const d = addDays(e.start, week * 7);
    if (e.repeatUntil && d > e.repeatUntil) return null;
    if (e.repeatCount && e.repeatCount > 0 && week >= e.repeatCount) return null;
    return d;
  }
  return e.start >= today || (!!e.end && e.end >= today) ? e.start : null;
}
