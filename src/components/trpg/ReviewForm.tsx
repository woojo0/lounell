'use client';
// TRPG 리뷰 글 폼 (v2.1) — 목록의 WRITE 모달과 상세의 EDIT 모달이 같이 쓴다.
// 시나리오 이름 · 페어 말머리 · 룰 · GM/PC 캐릭터 이름 · 별점(두 번째는 선택) · 대표 이미지(3:4 크롭) · 플레이한 날 · 공개범위 · 본문(한줄 평)
import React, { useState } from 'react';
import { KInput, KSelect, KDate, KCheck } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { CropEditor, CropImg, CroppedBlobImg, type CropValue } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import type { TrpgReview } from '@/lib/reviewStore';
import type { BoardBadge } from '@/lib/boardStore';
import type { Visibility } from '@/lib/charStore';

export type ReviewFormValue = Pick<TrpgReview, 'title' | 'category' | 'rule' | 'gm' | 'pc' | 'stars' | 'stars2' | 'body' | 'playDate' | 'visibility' | 'thumbId' | 'thumbCrop'>;

/** 별점 고르기/보기 — onChange가 있으면 누를 수 있다 */
export function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label?: string }) {
  return (
    <span className="rv-pick-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {label && <span style={{ fontSize: 11.5, color: 'var(--sub)', whiteSpace: 'nowrap' }}>{label}</span>}
      <span className="rv-pick" role={onChange ? 'radiogroup' : undefined}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" className={n <= value ? 'on' : ''} disabled={!onChange}
            data-tip={onChange ? `${n}점` : undefined} onClick={() => onChange?.(n === value ? n - 1 : n)}>★</button>
        ))}
      </span>
    </span>
  );
}

/** 대표 이미지 크롭 (3:4) — 새 파일이면 objectURL, 저장본이면 blob */
function ThumbCrop({ url, refId, crop, onClose, onApply }: {
  url?: string; refId?: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(refId);
  const src = url || loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect="3:4" aspectLabel="타일 (3:4)" initial={crop} onClose={onClose} onApply={onApply} />;
}

export function ReviewForm({ initial, cats, starNames, onSave, onCancel, saveLabel }: {
  initial: TrpgReview | null;
  cats: BoardBadge[];
  starNames: { a: string; b: string };
  onSave: (v: ReviewFormValue) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? (cats[0]?.label ?? ''));
  const [rule, setRule] = useState(initial?.rule ?? '');
  // GM / PC — 캐릭터 이름을 적는다 (v2.1 사용자 요청). 옛 글의 role 선택값은 해당 칸에 옮겨 보여 준다
  const [gm, setGm] = useState(initial?.gm ?? (initial?.role === 'GM' ? initial.role : ''));
  const [pc, setPc] = useState(initial?.pc ?? (initial?.role === 'PC' ? initial.role : ''));
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [two, setTwo] = useState(initial?.stars2 !== undefined);
  const [stars2, setStars2] = useState(initial?.stars2 ?? 0);
  const [playDate, setPlayDate] = useState(initial?.playDate ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [body, setBody] = useState(initial?.body ?? '');
  // 대표 이미지 (v2.1) — 목록의 3:4 타일
  const [img, setImg] = useState<{ file?: File; url?: string; ref?: string } | null>(initial?.thumbId ? { ref: initial.thumbId } : null);
  const [crop, setCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast('시나리오 이름을 입력해 주세요'); return; }
    if (stars < 1) { toast('별점을 매겨 주세요'); return; }
    if (two && stars2 < 1) { toast('두 번째 별점을 매기거나 체크를 꺼 주세요'); return; }
    setBusy(true);
    try {
      const thumbId = img ? (img.file ? await putBlob(img.file) : img.ref) : undefined;
      onSave({
        title: title.trim(), category: cats.some(c => c.label === category) ? category : '',
        rule: rule.trim(), gm: gm.trim() || undefined, pc: pc.trim() || undefined,
        stars, stars2: two ? stars2 : undefined,
        body, playDate: playDate || undefined, visibility,
        thumbId, thumbCrop: thumbId ? crop : undefined,
      });
    } catch (e) {
      toast(`이미지를 올리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <KInput placeholder="시나리오 이름 (필수)" value={title} onChange={e => setTitle(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {cats.length > 0 ? (
          <KSelect minWidth={130} value={cats.some(c => c.label === category) ? category : ''} onChange={setCategory}
            options={[{ value: '', label: '말머리 없음' }, ...cats.map(c => ({ value: c.label, label: c.label }))]} />
        ) : (
          <small className="hint" style={{ margin: 0 }}>페어 말머리는 환경설정 › 게시판 관리 › TRPG 리뷰 말머리에서 만듭니다</small>
        )}
        <KInput placeholder="TRPG 룰" value={rule} onChange={e => setRule(e.target.value)} style={{ width: 150 }} />
      </div>
      {/* GM / PC — 고정 라벨 + 캐릭터 이름 (v2.1 사용자 요청) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cp-lb">GM</span>
        <KInput placeholder="GM 캐릭터 이름" value={gm} onChange={e => setGm(e.target.value)} style={{ width: 170 }} />
        <span className="cp-lb">PC</span>
        <KInput placeholder="PC 캐릭터 이름" value={pc} onChange={e => setPc(e.target.value)} style={{ width: 170 }} />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stars value={stars} onChange={setStars} label={two ? starNames.a : '별점'} />
        <KCheck label="두 번째 별점 (둘이 따로)" checked={two} onChange={setTwo} />
        {two && <Stars value={stars2} onChange={setStars2} label={starNames.b} />}
      </div>
      {/* 대표 이미지 — 목록 타일(3:4) */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cp-lb">대표 이미지</span>
        <input id="rvThumb" type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f) { setImg({ file: f, url: URL.createObjectURL(f) }); setCrop(undefined); setCropOpen(true); }
          }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => document.getElementById('rvThumb')?.click()}>
          {img ? '이미지 바꾸기' : '＋ 이미지'}
        </button>
        {img && (
          <>
            <div style={{ width: 54, aspectRatio: '3/4', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
              {img.url ? <CropImg src={img.url} crop={crop} /> : <CroppedBlobImg fileRef={img.ref} crop={crop} ph="cool" />}
            </div>
            <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 10.5 }} onClick={() => setCropOpen(true)}>✂ 위치</button>
            <span className="fx" data-tip="이미지 제거" onClick={() => { setImg(null); setCrop(undefined); }}>✕</span>
          </>
        )}
        <small className="hint" style={{ margin: 0 }}>게시판 목록에 3:4 타일로 나옵니다</small>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <KDate value={playDate} onChange={setPlayDate} placeholder="플레이한 날 (선택)" style={{ width: 150 }} />
        <KSelect minWidth={120} value={visibility} onChange={v => setVisibility(v as Visibility)}
          options={[
            { value: 'public', label: '전체공개' },
            { value: 'member', label: '멤버공개' },
            { value: 'private', label: '나만보기' },
          ]} />
      </div>
      <div>
        <label className="k-label">한줄 평 · 본문</label>
        <RichEditor value={body} onChange={setBody} placeholder="한줄 평을 적어 주세요 — 길게 써도 됩니다" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>CANCEL</button>
        <button className="btn btn-dark" onClick={() => void save()} disabled={busy}>{busy ? '저장 중…' : (saveLabel ?? (initial ? 'SAVE' : 'POST'))}</button>
      </div>
      {cropOpen && img && (
        <ThumbCrop url={img.url} refId={img.ref} crop={crop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setCrop(c); setCropOpen(false); }} />
      )}
    </div>
  );
}
