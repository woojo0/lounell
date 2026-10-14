'use client';
// TRPG 리뷰 작성/수정 공용 폼 (v2.1 사용자 요청 — 모달이 아니라 페이지로, 시원시원하게).
// 위에서부터: 시나리오 이름 → 말머리 · 룰 → 대표 이미지 · 플레이한 날 · 공개범위 →
// 인물별 평가(GM/PC · 이름 · 별점 · 한줄평). PC가 여럿일 수 있어 아래 「인원 추가」로 줄을 늘린다.
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { useSectionParam, secStamp, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useMenuSettings } from '@/lib/menuStore';
import { useMembers } from '@/lib/members';
import { useBoardSettings, reviewCatsOf } from '@/lib/boardStore';
import {
  TrpgReview, ReviewRater, REVIEW_KEY, REVIEW_SEED, ratersOf, canWriteReview, canEditReview, reviewEditorIds,
  ReviewLogLink, logLinkOf, logNoLabel, normalizeLinkUrl, logFromUrl, prettyUrl,
} from '@/lib/reviewStore';
import { TrpgLog, TRPG_SEED } from '@/lib/galleryStore';
import { KInput, KSelect, KDate, KTextarea } from '@/components/ui/Kit';
import { CropEditor, CropImg, CroppedBlobImg, type CropValue } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import type { Visibility } from '@/lib/charStore';

/** 별점 고르기/보기 — onChange가 있으면 누를 수 있다 (같은 별을 다시 누르면 한 칸 내려간다) */
export function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span className="rv-pick" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={n <= value ? 'on' : ''} disabled={!onChange}
          data-tip={onChange ? `${n}점` : undefined} onClick={() => onChange?.(n === value ? n - 1 : n)}>★</button>
      ))}
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

const blankRater = (role: 'GM' | 'PC'): ReviewRater => ({ id: newId(), role, name: '', stars: 0, text: '' });

export function ReviewForm({ initial }: { initial: TrpgReview | null }) {
  const router = useRouter();
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [all, setAll] = useLocalList<TrpgReview>(REVIEW_KEY, REVIEW_SEED);
  const sec = useSectionParam('treview');
  const isNew = !initial;
  // 수정 주소에는 ?s=가 없으므로 고치는 글 자신의 소속에서 읽는다 (BackupForm과 같은 규칙)
  const secId = initial ? (initial.secId ?? MAIN_SEC) : sec.id;
  const tt = useSectionTitle('treview', secId, 'TRPG REVIEW');
  const [menuSet, , menuLoaded] = useMenuSettings();
  const members = useMembers();
  const { st: boardSet } = useBoardSettings();
  const cats = reviewCatsOf(boardSet, secId);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  // 새 글은 첫 말머리를 기본으로 (말머리 목록이 늦게 와도)
  useEffect(() => {
    if (isNew && !category && cats[0]) setCategory(cats[0].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.length]);
  const [rule, setRule] = useState(initial?.rule ?? '');
  const [playDate, setPlayDate] = useState(initial?.playDate ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [img, setImg] = useState<{ file?: File; url?: string; ref?: string } | null>(initial?.thumbId ? { ref: initial.thumbId } : null);
  const [crop, setCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  // 인물별 평가 — 새 글은 GM 한 줄 + PC 한 줄로 시작, 옛 글은 별점 둘·본문을 이 모양으로 옮겨 연다
  const [raters, setRaters] = useState<ReviewRater[]>(() => {
    const r = initial ? ratersOf(initial) : [];
    return r.length ? r.map(x => ({ ...x })) : [blankRater('GM'), blankRater('PC')];
  });
  const [busy, setBusy] = useState(false);
  // 로그 연결 (v2.1 사용자 요청) — 이미 등록된 로그를 고르거나 주소를 넣는다, 여러 개
  const [logs] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [links, setLinks] = useState<ReviewLogLink[]>(() => (initial?.logs ?? []).map(x => ({ ...x })));
  const [linkMode, setLinkMode] = useState<'log' | 'url'>('log');
  const [logQ, setLogQ] = useState('');
  const [urlIn, setUrlIn] = useState('');
  const [urlLabel, setUrlLabel] = useState('');

  const head = (msg: string) => (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>{msg}</p></div>
    </section>
  );
  if (!user) return head('리뷰는 로그인 후 쓸 수 있습니다');
  // 설정을 읽기 전에는 그리지 않는다 — 막힐 사람에게 폼이 한 번 비치지 않게
  if (isNew && !menuLoaded) return <section className="page" />;
  const viewer = { loggedIn: true, isAdmin, id: user.id };
  if (isNew && !canWriteReview(menuSet, sec.id, viewer)) return head('허용된 회원만 리뷰를 쓸 수 있는 게시판입니다');
  if (initial && !canEditReview(initial, isAdmin, user.id)) return head('이 리뷰를 수정할 권한이 없습니다');

  const patchRater = (id: string, p: Partial<ReviewRater>) => setRaters(rs => rs.map(x => (x.id === id ? { ...x, ...p } : x)));
  const backHref = initial ? `/treview/${initial.id}` : tt.href;

  // 로그 연결 — 고르기는 눌러서 붙였다 뗐다, 주소는 이 홈의 로그 주소면 등록된 로그로 붙인다
  const linkedLog = (id: string) => links.some(x => x.logId === id);
  const toggleLog = (l: TrpgLog) => setLinks(ls => (ls.some(x => x.logId === l.id)
    ? ls.filter(x => x.logId !== l.id)
    : [...ls, logLinkOf(l, newId())]));
  const addUrl = () => {
    const u = normalizeLinkUrl(urlIn);
    if (!u) { toast('주소는 http:// 나 https:// 로 시작하거나, 이 홈 안의 주소(/로 시작)여야 합니다'); return; }
    const l = logFromUrl(u, logs);
    if (l) {
      if (!linkedLog(l.id)) setLinks(ls => [...ls, logLinkOf(l, newId())]);
      toast('이 홈의 로그 주소라 등록된 로그로 붙였습니다');
    } else {
      setLinks(ls => [...ls, { id: newId(), url: u, label: urlLabel.trim() || undefined }]);
    }
    setUrlIn(''); setUrlLabel('');
  };
  const logQuery = logQ.trim().toLowerCase();
  const pickLogs = [...logs]
    .filter(l => !logQuery || l.title.toLowerCase().includes(logQuery) || logNoLabel(l).toLowerCase().includes(logQuery)
      || (l.tags ?? []).some(t => t.toLowerCase().includes(logQuery)) || (l.withText ?? '').toLowerCase().includes(logQuery))
    .sort((a, b) => b.no - a.no);

  const save = async () => {
    if (!title.trim()) { toast('시나리오 이름을 입력해 주세요'); return; }
    // 이름·별점·한줄평이 전부 빈 줄은 버린다
    const rows = raters
      .map(x => ({ ...x, name: x.name.trim(), text: x.text.trim() }))
      .filter(x => x.name || x.stars > 0 || x.text);
    if (!rows.some(x => x.stars > 0)) { toast('별점을 한 명 이상 매겨 주세요'); return; }
    setBusy(true);
    try {
      const thumbId = img ? (img.file ? await putBlob(img.file) : img.ref) : undefined;
      const fields = {
        title: title.trim(),
        category: cats.some(c => c.label === category) ? category : '',
        rule: rule.trim(),
        raters: rows,
        // 연결한 로그 — 등록된 로그는 지금의 제목·주소·공개 여부로 다시 적는다
        logs: (() => {
          const out = links.map(x => {
            const l = x.logId ? logs.find(y => y.id === x.logId) : undefined;
            return l ? logLinkOf(l, x.id) : x;
          });
          return out.length ? out : undefined;
        })(),
        playDate: playDate || undefined,
        visibility,
        thumbId,
        thumbCrop: thumbId ? crop : undefined,
        // 옛 칸(별점 둘·본문·GM/PC 이름)은 이제 raters가 대신한다 — 남겨 두면 두 군데 값이 어긋난다
        gm: undefined, pc: undefined, role: undefined, stars: undefined, stars2: undefined, body: undefined,
      };
      if (!initial) {
        const id = newId();
        const r: TrpgReview = {
          id, ...fields, date: new Date().toISOString(), author: user.nickname, authorId: user.id, ...secStamp(sec.id),
          editorIds: reviewEditorIds(menuSet, sec.id, members),   // 글쓰기 권한이 있는 회원은 서로의 리뷰에 자기 평가를 적는다
        };
        setAll([r, ...all]);
        toast('리뷰가 등록되었습니다');
        router.push(`/treview/${id}`);
      } else {
        const editorIds = reviewEditorIds(menuSet, secId, members, initial.editorIds);
        setAll(all.map(x => (x.id === initial.id ? { ...x, ...fields, editorIds } : x)));
        toast('저장되었습니다');
        router.push(`/treview/${initial.id}`);
      }
    } catch (e) {
      toast(`저장하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k={isNew ? 'treview-write-desc' : 'treview-edit-desc'}
          def={isNew ? '리뷰 쓰기 — 인물마다 별점과 한줄평을 적습니다' : '리뷰 수정'} />
      </div>

      <div className="panel rv-form">
        {/* 시나리오 이름 — 맨 위 */}
        <div>
          <label className="k-label">시나리오 이름</label>
          <KInput className="rv-f-title" placeholder="시나리오 이름 (필수)" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {/* 말머리 · 룰 */}
        <div className="rv-f-row">
          <div className="rv-f-field">
            <label className="k-label">말머리</label>
            {cats.length > 0 ? (
              <KSelect minWidth={150} value={cats.some(c => c.label === category) ? category : ''} onChange={setCategory}
                options={[{ value: '', label: '말머리 없음' }, ...cats.map(c => ({ value: c.label, label: c.label }))]} />
            ) : (
              <small className="hint" style={{ margin: 0 }}>환경설정 › 게시판 관리 › TRPG 리뷰 말머리에서 만듭니다</small>
            )}
          </div>
          <div className="rv-f-field grow">
            <label className="k-label">TRPG 룰</label>
            <KInput placeholder="예: CoC 7판" value={rule} onChange={e => setRule(e.target.value)} />
          </div>
        </div>

        {/* 대표 이미지 · 플레이한 날 · 공개범위 */}
        <div className="rv-f-media">
          <div>
            <label className="k-label">대표 이미지</label>
            <input id="rvThumb" type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (f) { setImg({ file: f, url: URL.createObjectURL(f) }); setCrop(undefined); setCropOpen(true); }
              }} />
            <div className={`rv-f-thumb${img ? ' has' : ''}`} onClick={() => document.getElementById('rvThumb')?.click()}
              data-tip={img ? '이미지 바꾸기' : undefined}>
              {img
                ? (img.url ? <CropImg src={img.url} crop={crop} /> : <CroppedBlobImg fileRef={img.ref} crop={crop} ph="cool" />)
                : <span>＋ 이미지<small>목록에 3:4 타일로</small></span>}
            </div>
            {img && (
              <div className="rv-f-thumb-acts">
                <button type="button" className="btn btn-ghost" onClick={() => setCropOpen(true)}>✂ 위치</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setImg(null); setCrop(undefined); }}>빼기</button>
              </div>
            )}
          </div>
          <div className="rv-f-side">
            <div className="rv-f-field">
              <label className="k-label">플레이한 날</label>
              <KDate value={playDate} onChange={setPlayDate} placeholder="YYYY-MM-DD (선택)" style={{ width: 170 }} />
            </div>
            <div className="rv-f-field">
              <label className="k-label">공개범위</label>
              <KSelect minWidth={150} value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '전체공개' },
                  { value: 'member', label: '멤버공개' },
                  { value: 'private', label: '나만보기' },
                ]} />
            </div>
          </div>
        </div>

        {/* 인물별 평가 — GM [이름] [별점] / [한줄평] · PC가 여럿이면 인원 추가 */}
        <div>
          <label className="k-label">인물별 평가</label>
          <div className="rv-raters">
            {raters.map(x => (
              <div key={x.id} className="rv-rater">
                <div className="rv-rater-hd">
                  <div className="mini-seg">
                    <button type="button" className={x.role === 'GM' ? 'on' : ''} onClick={() => patchRater(x.id, { role: 'GM' })}>GM</button>
                    <button type="button" className={x.role === 'PC' ? 'on' : ''} onClick={() => patchRater(x.id, { role: 'PC' })}>PC</button>
                  </div>
                  <KInput className="rv-rater-name" aria-label={`${x.role} 이름`} value={x.name}
                    onChange={e => patchRater(x.id, { name: e.target.value })} />
                  <Stars value={x.stars} onChange={n => patchRater(x.id, { stars: n })} />
                  {raters.length > 1 && (
                    <button type="button" className="btn btn-ghost rv-rater-del" data-tip="이 사람 빼기"
                      onClick={() => setRaters(rs => rs.filter(y => y.id !== x.id))}>✕</button>
                  )}
                </div>
                <KTextarea aria-label="한줄평" value={x.text} maxRows={12}
                  onChange={e => patchRater(x.id, { text: e.target.value })} />
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost rv-add" onClick={() => setRaters(rs => [...rs, blankRater('PC')])}>＋ 인원 추가</button>
        </div>

        {/* 로그 연결 (v2.1 사용자 요청) — 이미 등록된 로그를 고르거나 주소를 넣는다. 여러 개 붙일 수 있다 */}
        <div>
          <label className="k-label">로그 연결 (선택)</label>
          {links.length > 0 && (
            <div className="rv-links">
              {links.map(x => {
                const l = x.logId ? logs.find(y => y.id === x.logId) : undefined;
                return (
                  <div key={x.id} className="rv-link">
                    <span className="tg">{x.logId ? (l ? logNoLabel(l) : 'LOG') : 'URL'}</span>
                    <span className="tx">
                      {x.logId ? (l?.title ?? x.title ?? '찾을 수 없는 로그') : (x.label || prettyUrl(x.url ?? ''))}
                      {x.logId && !l && <small>목록에 없는 로그</small>}
                      {!x.logId && x.label && <small>{prettyUrl(x.url ?? '')}</small>}
                    </span>
                    <button type="button" className="btn btn-ghost x" data-tip="연결 빼기"
                      onClick={() => setLinks(ls => ls.filter(y => y.id !== x.id))}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mini-seg" style={{ marginBottom: 8 }}>
            <button type="button" className={linkMode === 'log' ? 'on' : ''} onClick={() => setLinkMode('log')}>등록된 로그</button>
            <button type="button" className={linkMode === 'url' ? 'on' : ''} onClick={() => setLinkMode('url')}>주소 넣기</button>
          </div>
          {linkMode === 'log' ? (
            <div>
              <KInput placeholder="로그 검색 — 제목·번호·태그" value={logQ} onChange={e => setLogQ(e.target.value)} />
              <div className="rv-log-pick">
                {pickLogs.map(l => (
                  <div key={l.id} className={`it${linkedLog(l.id) ? ' on' : ''}`} onClick={() => toggleLog(l)}>
                    <span className="no">{logNoLabel(l)}</span>
                    <span className="t">{l.title}</span>
                    {linkedLog(l.id) && <span className="ck">✓</span>}
                  </div>
                ))}
                {pickLogs.length === 0 && (
                  <p className="hint" style={{ padding: 10, margin: 0 }}>{logs.length ? '검색 결과가 없습니다' : '등록된 로그가 없습니다'}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rv-url-row">
              <KInput className="u" placeholder="https://" value={urlIn} onChange={e => setUrlIn(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
              <KInput className="l" placeholder="표시 이름 (선택)" value={urlLabel} onChange={e => setUrlLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
              <button type="button" className="btn btn-ghost" onClick={addUrl}>＋ 추가</button>
            </div>
          )}
        </div>

        <div className="rv-f-foot">
          <button type="button" className="btn btn-ghost" onClick={() => router.push(backHref)}>CANCEL</button>
          <button type="button" className="btn btn-dark" onClick={() => void save()} disabled={busy}>{busy ? '저장 중…' : isNew ? 'POST' : 'SAVE'}</button>
        </div>
      </div>

      {cropOpen && img && (
        <ThumbCrop url={img.url} refId={img.ref} crop={crop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setCrop(c); setCropOpen(false); }} />
      )}
    </section>
  );
}
