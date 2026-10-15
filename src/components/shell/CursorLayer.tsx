'use client';
// 커스텀 마우스 커서 적용 (5.1 v1.1 · v1.9 애니메이션) — 상태별 등록 이미지를 전역 스타일로 주입.
// 등록 안 한 상태는 기본 커서 폴백 · 전체 끄면 스타일 제거.
// .ani(윈도우 애니메이션 커서)는 프레임을 뽑아 CSS cursor를 교체하며 재생 (lib/aniCursor).
// .cur는 파일에 내장된 핫스팟을 그대로 사용 (CSS 좌표 생략).
//
// 애니메이션 재생 방식 (커플홈 사용자 제보 — 「커서가 막 깜빡깜빡해, 등록해 둔 것과 기본을 왔다 갔다」):
// 예전에는 프레임이 넘어갈 때마다 커서 스타일시트 **전체**를 새 글로 갈아 끼웠다. 그러면 브라우저가 모든 커서 그림을
// 다시 불러오는 동안 기본 커서로 돌아가 보인다 — 움직이는 커서를 네 상태(기본·포인터·텍스트·클릭 중)에 다 걸면
// 1초에 30번 넘게 갈아 끼워 계속 깜빡였다. 이제는 모든 프레임의 규칙을 처음에 한 번만 적어 두고
// (html[data-cur-상태="프레임 번호"] 조건), 재생은 <html>의 data 속성만 바꾼다. 스타일시트는 그대로라 그림을
// 다시 불러오지 않고, 프레임 그림은 시작 전에 미리 풀어 둔다. 동시에 넘어가는 프레임은 한 번에 바꾸고,
// 탭이 가려져 있거나 마우스 커서가 없는 기기(폰·태블릿)에서는 재생하지 않는다.
import { useEffect } from 'react';
import { useCursorSettings, CursorState } from '@/lib/cursorStore';
import { getBlob } from '@/lib/blobStore';
import { parseAni, isCur } from '@/lib/aniCursor';

// 상태 → 전역 CSS 변수 (v1.9) — globals.css·인라인 스타일의 cursor:var(--cur-pointer,pointer) /
// var(--cur-grab,grab) 사용처 전부에 자동 적용. 셀렉터 나열로 못 잡던 div+onClick 요소
// (로고·알림 종·프로필 등)도 이 변수로 커버 — 미등록 상태면 fallback 키워드로 동작.
const VAR_NAME: Partial<Record<CursorState, string>> = {
  default: '--cur-default', pointer: '--cur-pointer', grab: '--cur-grab', active: '--cur-active',
  // 크기조절 4방향 (v1.9) — .rs 핸들·드래그 중 전역 고정 규칙이 사용
  rsNwse: '--cur-rs-nwse', rsNesw: '--cur-rs-nesw', rsEw: '--cur-rs-ew', rsNs: '--cur-rs-ns',
};

// 상태 → 적용 셀렉터 (커서 폴백 포함)
const RULES: Record<CursorState, { sel: string; fallback: string }> = {
  default: { sel: 'body, .page, .panel', fallback: 'auto' },
  pointer: {
    sel: [
      'a', 'button', 'label', '.btn', '.tag', '.pill', '.k-select', '.k-toggle', '.k-check', '.k-radio',
      '.rp-room', '.thr-item', '.memo-list-item', '.fc', '.g-item', '.char-card', '.rel-card',
      '.cm-card', '.dt-card', '.tc-card', '.list-item', '.brow', '.ap-row', '.ticket', '.more', '.cur',
    ].join(', '),
    fallback: 'pointer',
  },
  text: { sel: 'input, textarea, [contenteditable="true"], .re-content', fallback: 'text' },
  active: { sel: 'body:active, *:active', fallback: 'auto' },
  // .wgt는 편집모드에서만 드래그 가능 — 평상시 배너 등 위젯 위에서 grab이 뜨던 문제 수정 (v1.9)
  // 편집모드에선 메인 영역 전체 grab 통일 — 드래그 중 내부 요소를 지나며 커서가 튀지 않게
  // 편집 핸들(.rs 크기조절 · .rr 기울기)은 제외 — 전체 grab 규칙(!important)이 핸들 커서를 덮어
  // 시스템 커서와 커스텀 커서가 섞여 깨져 보이던 문제 (v1.9 사용자 발견)
  grab: { sel: '.drag-h, .postit:not(.ro), [draggable="true"], body.edit-on .page-main-wrap, body.edit-on .page-main-wrap *:not(.rs):not(.rr)', fallback: 'grab' },
  // 크기조절 4방향 (v1.9 사용자 요청) — nwse는 위젯 우하단 핸들, 나머지는 예약 클래스(향후 사용처)
  rsNwse: { sel: '.wgt .rs, .cur-rs-nwse', fallback: 'nwse-resize' },
  rsNesw: { sel: '.cur-rs-nesw', fallback: 'nesw-resize' },
  rsEw: { sel: '.cur-rs-ew', fallback: 'ew-resize' },
  rsNs: { sel: '.cur-rs-ns', fallback: 'ns-resize' },
};

interface AnimState { key: CursorState; urls: string[]; delays: number[] }

/** 지금 프레임 번호를 적는 <html> 속성 — HTML 속성 이름은 소문자 */
const attrOf = (key: CursorState) => `data-cur-${key.toLowerCase()}`;
/** 셀렉터 목록 하나하나 앞에 조건을 붙인다 — 「a, button」 → 「html[…] a, html[…] button」 */
const scoped = (sel: string, cond: string) => sel.split(',').map(s => `${cond} ${s.trim()}`).join(', ');
/** 같은 때에 넘어갈 프레임은 한 번에 (ms) — 상태마다 따로 바꾸면 그만큼 화면 스타일을 다시 계산한다 */
const BATCH_MS = 6;
/** 프레임 그림을 미리 받는 데 기다리는 최대 시간 (ms) */
const PRELOAD_MS = 1500;

export function CursorLayer() {
  const [st] = useCursorSettings();

  useEffect(() => {
    const styleId = 'ohome-cursor-style';
    const root = document.documentElement;
    if (!st.enabled || Object.keys(st.states).length === 0) {
      document.getElementById(styleId)?.remove();
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    const attrs: string[] = [];
    let timer = 0;
    let onVis: (() => void) | null = null;

    (async () => {
      const parts: string[] = [];
      const anims: AnimState[] = [];
      for (const key of Object.keys(st.states) as CursorState[]) {
        const entry = st.states[key];
        if (!entry) continue;
        const blob = await getBlob(entry.imgId);
        if (!blob || cancelled) continue;
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const rule = RULES[key];
        const vn = VAR_NAME[key];
        const ani = parseAni(buf);
        if (ani && ani.steps.length > 1) {
          // 움직이는 커서 — 프레임마다 규칙을 미리 다 적어 둔다 (위 주석). .ani 프레임은 .cur라 핫스팟이 들어 있다
          const frameUrls = ani.frames.map(f => { const u = URL.createObjectURL(f); urls.push(u); return u; });
          const stepUrls = ani.steps.map(i => frameUrls[i]);
          const attr = attrOf(key);
          stepUrls.forEach((u, k) => {
            const cond = `html[${attr}="${k}"]`;
            parts.push(`${scoped(rule.sel, cond)}{cursor:url("${u}"), ${rule.fallback} !important}`);
            if (vn) parts.push(`${cond}{${vn}:url("${u}"), ${rule.fallback}}`);
          });
          anims.push({ key, urls: stepUrls, delays: ani.delays });
        } else {
          // 멈춘 커서 (프레임이 하나뿐인 .ani 포함). .cur는 내장 핫스팟 사용 — CSS 좌표를 붙이면 무시되는 브라우저가 있어 생략
          const one = ani ? ani.frames[ani.steps[0]] : blob;
          const url = URL.createObjectURL(one);
          urls.push(url);
          const hs = ani || isCur(buf) ? '' : ` ${entry.hx} ${entry.hy}`;
          parts.push(`${rule.sel}{cursor:url("${url}")${hs}, ${rule.fallback} !important}`);
          if (vn) parts.push(`:root{${vn}:url("${url}")${hs}, ${rule.fallback}}`);
        }
      }
      if (cancelled) return;
      // 프레임 그림을 먼저 다 받아 둔다 — 첫 바퀴에도 그림을 받는 동안 기본 커서가 비치지 않게.
      // decode()는 쓰지 않는다: 커서 그림(.cur/.ico)은 화면에 그려질 일이 없어 decode가 끝나지 않는 일이 있었다
      // (그러면 커서가 아예 안 붙는다). load만 기다리고, 늦어도 PRELOAD_MS 뒤에는 그냥 시작한다
      await Promise.all(anims.flatMap(a => a.urls).map(u => new Promise<void>(res => {
        const im = new Image();
        im.onload = () => res();
        im.onerror = () => res();
        im.src = u;
        window.setTimeout(res, PRELOAD_MS);
      })));
      if (cancelled) return;

      for (const a of anims) { const at = attrOf(a.key); root.setAttribute(at, '0'); attrs.push(at); }
      document.getElementById(styleId)?.remove();
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = parts.join('\n');   // 이 뒤로는 고쳐 쓰지 않는다
      document.head.appendChild(styleEl);

      if (anims.length === 0) return;
      // 마우스 커서가 없는 기기(폰·태블릿)는 재생할 필요가 없다 — 첫 프레임 그대로
      const noHover = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
      if (noHover) return;
      const idx = anims.map(() => 0);
      const due = anims.map(a => performance.now() + (a.delays[0] ?? 100));
      const schedule = () => {
        window.clearTimeout(timer);
        if (cancelled || document.hidden) return;   // 가려진 탭에서는 쉬었다가 보이면 다시 (onVis)
        timer = window.setTimeout(tick, Math.max(0, Math.min(...due) - performance.now()));
      };
      const tick = () => {
        if (cancelled) return;
        const now = performance.now();
        anims.forEach((a, n) => {
          if (due[n] > now + BATCH_MS) return;
          idx[n] = (idx[n] + 1) % a.urls.length;
          root.setAttribute(attrOf(a.key), String(idx[n]));
          due[n] = now + (a.delays[idx[n]] ?? 100);
        });
        schedule();
      };
      onVis = () => {
        if (!document.hidden) { const now = performance.now(); due.forEach((d, n) => { due[n] = Math.max(d, now); }); }
        schedule();
      };
      document.addEventListener('visibilitychange', onVis);
      schedule();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      attrs.forEach(at => root.removeAttribute(at));
      urls.forEach(u => URL.revokeObjectURL(u));
      document.getElementById(styleId)?.remove();
    };
  }, [st]);

  return null;
}
