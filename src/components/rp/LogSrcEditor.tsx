'use client';
// RP LOG 본문 편집 — 역극 모양 로그의 원본 발화를 발화 단위로 고친다 (커플홈 사용자 요청: "등록한 다음에 편집모드를 켜서 내용도 수정").
// 줄마다 발화자(자관 캐릭터 / 그 밖 / 지문)와 내용, 오른쪽에 「아래에 추가」·「삭제」. 저장은 바깥(상세 페이지)이
// renderLogSrc로 같은 모양으로 다시 그린다. 긴 로그(수백 줄)도 한 글자마다 전체가 다시 그려지지 않게 줄은 memo
import React, { memo, useCallback, useMemo, useRef } from 'react';
import type { Character } from '@/lib/charStore';
import type { RpMessage } from '@/lib/rpStore';
import type { RpLogSrc } from '@/lib/rpLog';
import { newId } from '@/lib/postStore';
import { KSelect, KTextarea } from '@/components/ui/Kit';

const DESC = '__desc';
type Opt = { value: string; label: string };

const valueOf = (m: RpMessage) => (m.kind === 'char' ? (m.charId ?? '') : DESC);

const Row = memo(function Row({ m, i, base, onPatch, onInsert, onRemove }: {
  m: RpMessage; i: number; base: Opt[];
  onPatch: (i: number, patch: Partial<RpMessage>) => void;
  onInsert: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const v = valueOf(m);
  // 지워진 캐릭터의 발화 — 고르는 목록엔 없지만 지금 값은 보여 준다
  const options = base.some(o => o.value === v) ? base : [{ value: v, label: '(삭제된 캐릭터)' }, ...base];
  return (
    <div className="lsrc-row">
      <KSelect minWidth={130} value={v} options={options}
        onChange={nv => onPatch(i, nv === DESC ? { kind: 'desc', charId: undefined } : { kind: 'char', charId: nv })} />
      <KTextarea value={m.text} onChange={e => onPatch(i, { text: e.target.value })}
        placeholder={m.imgId ? '(사진 메시지 — 글은 비워 둬도 됩니다)' : m.kind === 'char' ? '대사' : '지문(서술)'} />
      <div className="lsrc-act">
        <button type="button" title="아래에 발화 추가" onClick={() => onInsert(i)}>＋</button>
        <button type="button" title="이 발화 삭제" onClick={() => onRemove(i)}>✕</button>
      </div>
    </div>
  );
});

export function LogSrcEditor({ src, onChange, members, others }: {
  src: RpLogSrc;
  onChange: (next: RpLogSrc) => void;
  /** 로그에 연동된 자관의 캐릭터(AU면 그 모습·이름) — 목록 앞에 */
  members: Character[];
  /** 그 밖의 캐릭터 — 「그 밖 · 이름」으로 뒤에 */
  others: Character[];
}) {
  // 줄의 콜백이 매번 바뀌면 memo가 소용없다 — 최신 값은 ref로 보고 콜백은 고정
  const srcRef = useRef(src); srcRef.current = src;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const set = (next: RpMessage[]) => onChangeRef.current({ ...srcRef.current, msgs: next });

  const onPatch = useCallback((i: number, patch: Partial<RpMessage>) =>
    set(srcRef.current.msgs.map((m, j) => (j === i ? { ...m, ...patch } : m))), []);
  const onRemove = useCallback((i: number) => set(srcRef.current.msgs.filter((_, j) => j !== i)), []);
  /** i 다음에 새 발화 — 발화자는 앞 줄과 같게. 시각은 표시하지 않는 로그가 대부분이지만 순서의 기준이라 앞 줄 것을 잇는다 */
  const onInsert = useCallback((i: number) => {
    const msgs = srcRef.current.msgs;
    const prev = msgs[i];
    const blank: RpMessage = {
      id: newId(),
      kind: prev?.kind === 'char' ? 'char' : 'desc',
      charId: prev?.kind === 'char' ? prev.charId : undefined,
      authorId: '',
      text: '',
      date: prev?.date ?? new Date().toISOString(),
    };
    const next = [...msgs];
    next.splice(i + 1, 0, blank);
    set(next);
  }, []);

  const base = useMemo<Opt[]>(() => [
    ...members.map(c => ({ value: c.id, label: c.name })),
    ...others.map(c => ({ value: c.id, label: `그 밖 · ${c.name}` })),
    { value: DESC, label: '지문(서술)' },
  ], [members, others]);

  return (
    <div className="lsrc">
      {src.msgs.map((m, i) => (
        <Row key={m.id} m={m} i={i} base={base} onPatch={onPatch} onInsert={onInsert} onRemove={onRemove} />
      ))}
      <div>
        <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }}
          onClick={() => onInsert(src.msgs.length - 1)}>＋ 발화 추가</button>
      </div>
    </div>
  );
}
