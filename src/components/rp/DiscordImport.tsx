'use client';
// 디스코드 복사본 가져오기 (커플홈 사용자 요청) — 디스코드에서 긁어 온 대화를 붙여 넣거나 txt로 올리면
// 발화를 파싱하고, 자관(·AU)을 고른 뒤 발화자마다 그 자관의 캐릭터 / 지문 / 제외로 매칭해 역극 모양 로그로 RP LOG에 올린다.
// 매칭된 캐릭터의 프로필 사진·이름·테마색이 그대로 들어가고, 메신저 모양이면 좌우는 보는 사람 기준(게시판 상세가 정한다).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalList, newId } from '@/lib/postStore';
import { Character, CHAR_SEED, Relation, REL_SEED, charInAu, faceCropOf, pairSides, type Visibility } from '@/lib/charStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, TRPG_BODY_SEED, bodyVisibility, saveLogBody } from '@/lib/galleryStore';
import { useSections, filterSection, secStamp, MAIN_SEC } from '@/lib/sectionStore';
import { parseDiscordLog, dcToMessages, guessChar, type DcMap } from '@/lib/discordLog';
import { rpLogHtml, rpLogText, rpLogRange, rpLogLastDate, rpSpeakers } from '@/lib/rpLog';
import type { RpMessage } from '@/lib/rpStore';
import { resolveFaces, type FaceInfo } from '@/components/rp/RpLogModal';
import { Modal } from '@/components/ui/Modal';
import { KInput, KTextarea, KSelect, KCheck } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';

const isHex = (c?: string) => !!c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c);
const DESC = '__desc', SKIP = '__skip';

export function DiscordImportModal({ onClose, initialSecId = MAIN_SEC }: { onClose: () => void; initialSecId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [logsAll, setLogsAll, logsLoaded] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [bodies, setBodies, bodiesLoaded] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const { list } = useSections();
  const secs = list('trpg');
  const fileRef = useRef<HTMLInputElement>(null);

  // 1) 원문
  const [raw, setRaw] = useState('');
  const parsed = useMemo(() => parseDiscordLog(raw), [raw]);

  // 2) 자관·AU
  const [relId, setRelId] = useState('');
  useEffect(() => { if (!relId && rels[0]) setRelId(rels[0].id); }, [rels, relId]);
  const rel = rels.find(r => r.id === relId);
  const [auId, setAuId] = useState('base');
  const auKey = rel && auId !== 'base' ? `${rel.id}:${auId}` : undefined;
  // 자관 멤버(AU를 골랐으면 그 AU 모습·이름)를 먼저, 그 밖의 캐릭터는 뒤에 — 새로 추가한 캐릭터도 여기서 고른다
  const { members, others, viewChars } = useMemo(() => {
    const ids = rel ? (pairSides(rel) ?? rel.members.map(m => m.charId)) : [];
    const view = (c: Character) => (auKey ? charInAu(c, rels, auKey) : c);
    const members = ids.map(id => chars.find(c => c.id === id)).filter((c): c is Character => !!c).map(view);
    const others = chars.filter(c => !ids.includes(c.id)).map(view);
    return { members, others, viewChars: chars.map(view) };
  }, [rel, auKey, chars, rels]);

  // 3) 발화자 매칭 — 발화자 목록·자관이 바뀌면 아직 안 정한 것만 자동으로 채운다 (이름이 같은 캐릭터, 「-」는 지문)
  const [map, setMap] = useState<DcMap>({});
  useEffect(() => {
    setMap(prev => {
      const next: DcMap = { ...prev };
      for (const s of parsed.speakers) {
        if (next[s.name]) continue;
        if (s.name.trim() === '-') { next[s.name] = { kind: 'desc' }; continue; }
        const g = guessChar(s.name, [...members, ...others]);
        if (g) next[s.name] = { kind: 'char', charId: g.id };
      }
      return next;
    });
  }, [parsed, members, others]);
  const unmapped = parsed.speakers.filter(s => !map[s.name]);
  const msgs = useMemo(() => dcToMessages(parsed, map), [parsed, map]);
  const mapValue = (name: string) => { const m = map[name]; return !m ? '' : m.kind === 'char' ? m.charId : m.kind === 'desc' ? DESC : SKIP; };
  const setMapValue = (name: string, v: string) =>
    setMap(prev => ({ ...prev, [name]: v === DESC ? { kind: 'desc' } : v === SKIP ? { kind: 'skip' } : { kind: 'char', charId: v } }));

  // 4) 모양·올리기
  const [style, setStyle] = useState<'script' | 'imsg'>('imsg');
  const [time, setTime] = useState(false);
  const [withFaces, setWithFaces] = useState(true);
  const [fmt, setFmt] = useState<'html' | 'text'>('html');
  const [title, setTitle] = useState('');
  const [catchphrase, setCatchphrase] = useState('');
  const [vis, setVis] = useState<Visibility>('member');
  const [secId, setSecId] = useState(initialSecId);
  const [busy, setBusy] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const ready = logsLoaded && bodiesLoaded;

  const speakerChars = useMemo(() => rpSpeakers(msgs, viewChars), [msgs, viewChars]);
  const defaultTitle = `${rel?.name ?? '역극'} 로그${msgs.length ? ` · ${rpLogRange(msgs)}` : ''}`;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try { setRaw(await f.text()); } catch { toast('파일을 읽지 못했습니다'); }
  };

  const post = async () => {
    const t = title.trim() || defaultTitle;
    if (!msgs.length) { toast('넣을 발화가 없습니다 — 원문을 붙여 넣고 발화자를 정해 주세요'); return; }
    if (unmapped.length) { toast(`아직 정하지 않은 발화자가 있습니다: ${unmapped.map(s => s.name).join(', ')}`); return; }
    if (!ready || busy) return;
    setBusy(true);
    try {
      const id = newId();
      // 프로필 사진 — 자관에서 잡아 둔 얼굴 위치 그대로 (AU면 그 AU의 사진·위치)
      const faceInfo: FaceInfo = Object.fromEntries(viewChars.map(c => [c.id, { ref: c.thumbId, crop: faceCropOf(c, rels, { relId: rel?.id, auKey }) }]));
      const faces = fmt === 'html' && style === 'imsg' && withFaces ? await resolveFaces(speakerChars, faceInfo) : undefined;
      const info = { title: t, sub: speakerChars.map(c => c.name).join(' · ') };
      const bodyText = fmt === 'html'
        ? rpLogHtml(info, msgs, viewChars, { time, forBoard: true, style, rightIds: [], faces, neutralSides: true })
        : rpLogText(info, msgs, viewChars, { time, forBoard: true });
      const colors = speakerChars.map(c => c.color).filter(isHex);
      const log: TrpgLog = {
        id,
        no: Math.max(0, ...filterSection(logsAll, secId).map(l => l.no)) + 1,
        title: t,
        catchphrase: catchphrase.trim() || undefined,
        writer: '',
        withText: speakerChars.map(c => c.name).join(' · '),
        relId: rel?.id,
        auId: rel && auId !== 'base' ? auId : undefined,
        date: rpLogLastDate(msgs),
        ph: 'cool',
        visibility: vis,
        listHidden: false,
        thumbColor: colors.length ? { c1: colors[0], c2: colors[1] } : { c1: '#4c5a6e', c2: '#242b36' },
        ...secStamp(secId),
      };
      const body: TrpgLogBody = {
        id,
        ...(await saveLogBody(bodyText)),
        bodyHtml: fmt === 'html',
        visibility: bodyVisibility(log),
        ...secStamp(secId),
      };
      setLogsAll([log, ...logsAll]);
      setBodies([...bodies, body]);
      setPostedId(id);
      toast('RP LOG에 올렸습니다');
    } finally {
      setBusy(false);
    }
  };

  const charOptions = [
    { value: '', label: '선택…' },
    ...members.map(c => ({ value: c.id, label: c.name })),
    ...others.map(c => ({ value: c.id, label: `그 밖 · ${c.name}` })),
    { value: DESC, label: '지문(서술)으로' },
    { value: SKIP, label: '제외' },
  ];

  return (
    <Modal open onClose={onClose} title="디스코드 로그 가져오기"
      desc="디스코드에서 복사한 대화를 붙여 넣거나 txt로 올리면 발화를 나눠 읽습니다 — 자관을 고르고 발화자마다 캐릭터를 매칭하면 역극 모양 로그로 저장됩니다"
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>{postedId ? 'CLOSE' : 'CANCEL'}</button>
        {postedId
          ? <button className="btn btn-dark" onClick={() => { onClose(); router.push(`/trpg/${postedId}`); }}>올린 로그 보기 ›</button>
          : <button className="btn btn-dark" disabled={!ready || busy || !msgs.length} onClick={post}>{busy ? '올리는 중…' : '＋ RP LOG에 올리기'}</button>}
      </>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }}
            onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>⤒ txt 파일 올리기</button>
          <small className="hint" style={{ margin: 0 }}>또는 아래에 그대로 붙여 넣기 — 「이름 / 앱 / — 날짜 시각 / 본문」 꼴의 디스코드 복사본</small>
        </div>
        <KTextarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={'네리스\n앱\n — 2026-09-29 오후 11:13\n(본문…)'} style={{ minHeight: 120, fontSize: 12 }} />
        {raw.trim() && parsed.messages.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>발화를 찾지 못했습니다 — 이름 다음 줄에 「— 날짜 시각」이 오는 디스코드 복사본인지 확인해 주세요</p>
        )}
        {parsed.messages.length > 0 && (
          <>
            <p className="hint" style={{ margin: 0 }}>발화 {parsed.messages.length}개 · 발화자 {parsed.speakers.length}명 · {rpLogRange(parsed.messages as unknown as RpMessage[])}</p>
            {/* 자관·AU — 매칭 목록과 이름·사진·위치가 여기 따른다 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="cp-lb">자관</span>
              <KSelect minWidth={140} value={relId} onChange={v => { setRelId(v); setAuId('base'); }}
                options={rels.map(r => ({ value: r.id, label: r.name }))} />
              {rel && rel.aus.some(a => a.id !== 'base') && (
                <KSelect minWidth={120} value={auId} onChange={setAuId}
                  options={[{ value: 'base', label: '원본 설정' }, ...rel.aus.filter(a => a.id !== 'base').map(a => ({ value: a.id, label: a.label || 'AU' }))]} />
              )}
            </div>
            {/* 발화자 매칭 */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="k-label" style={{ margin: 0 }}>발화자 매칭 — 등장인물마다 누구인지</label>
              {parsed.speakers.map(s => (
                <div key={s.name} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0', borderBottom: '1px dashed var(--line)' }}>
                  <b style={{ fontSize: 12.5, minWidth: 90 }}>{s.name === '-' ? '－ (구분선)' : s.name}</b>
                  <small style={{ color: 'var(--faint)' }}>{s.count}개</small>
                  <div style={{ marginLeft: 'auto' }}>
                    <KSelect minWidth={170} value={mapValue(s.name)} onChange={v => setMapValue(s.name, v)} options={charOptions} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => window.open('/chars/new?next=/trpg', '_blank')}>＋ 캐릭터 추가 (새 탭)</button>
                <small className="hint" style={{ margin: 0 }}>맞는 캐릭터가 없으면 새 탭에서 등록한 뒤 여기 목록에서 고르면 됩니다 · 지문(서술)이나 제외로 둘 수도</small>
              </div>
            </div>
            {/* 모양 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="cp-lb">모양</span>
              <div className="mini-seg">
                <button className={style === 'imsg' ? 'on' : ''} onClick={() => setStyle('imsg')}>메신저</button>
                <button className={style === 'script' ? 'on' : ''} onClick={() => setStyle('script')}>대본</button>
              </div>
              <div className="mini-seg">
                <button className={fmt === 'html' ? 'on' : ''} onClick={() => setFmt('html')}>HTML</button>
                <button className={fmt === 'text' ? 'on' : ''} onClick={() => setFmt('text')}>텍스트</button>
              </div>
              {fmt === 'html' && style === 'imsg' && <KCheck label="프로필 사진" checked={withFaces} onChange={setWithFaces} />}
              <KCheck label="시각 표시" checked={time} onChange={setTime} />
            </div>
            <p className="hint" style={{ margin: 0 }}>
              매칭된 캐릭터의 사진·이름·테마색이 그대로 들어갑니다. 메신저 모양의 좌우는 보는 사람 기준 — 관리자에게는 자캐가, 참여 회원에게는 자기 캐릭터가 오른쪽.
            </p>
            {/* 제목·공개 */}
            <KInput placeholder={`제목 (비우면 「${defaultTitle}」)`} value={title} onChange={e => setTitle(e.target.value)} />
            <KInput placeholder="캐치프레이즈 (선택)" value={catchphrase} onChange={e => setCatchphrase(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <KSelect minWidth={120} value={vis} onChange={v => setVis(v as Visibility)}
                options={[
                  { value: 'public', label: '전체공개' },
                  { value: 'member', label: '멤버공개' },
                  { value: 'private', label: '나만보기' },
                ]} />
              {secs.length > 1 && (
                <KSelect minWidth={130} value={secId} onChange={setSecId}
                  options={secs.map(s => ({ value: s.id, label: s.name }))} />
              )}
              {unmapped.length > 0 && <small className="hint" style={{ margin: 0, color: 'var(--accent)' }}>아직 정하지 않은 발화자 {unmapped.length}명</small>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
