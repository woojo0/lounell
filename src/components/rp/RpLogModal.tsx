'use client';
// 역극 로그 (커플홈) — 방의 발화를 로그로 만들어 txt/html 파일로 저장하거나 RP LOG 게시판에 올린다.
// 파일 저장은 방 참여자 누구나, 게시판 올리기는 관리자만 (로그 등록이 원래 관리자 전용이다).
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RpRoom, RpMessage } from '@/lib/rpStore';
import type { Character, Visibility } from '@/lib/charStore';
import { rpLogText, rpLogHtml, rpLogRange, rpLogLastDate, rpSpeakers, logFileName, downloadText } from '@/lib/rpLog';
import { useLocalList, newId } from '@/lib/postStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, TRPG_BODY_SEED, bodyVisibility, saveLogBody } from '@/lib/galleryStore';
import { useSections, filterSection, secStamp, MAIN_SEC } from '@/lib/sectionStore';
import { Modal } from '@/components/ui/Modal';
import { KInput, KSelect, KCheck } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';

const isHex = (c?: string) => !!c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c);

export function RpLogModal({ room, msgs, chars, sub, isAdmin, onClose }: {
  room: RpRoom;
  msgs: RpMessage[];
  chars: Character[];       // 이 방에서 쓰는 캐릭터 — AU 방이면 AU 프로필로 바꿔 끼운 것
  sub: string;              // 방 소제목 (캐릭터 이름 둘 / 자관명 / 자유 개설)
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [time, setTime] = useState(false);
  const text = useMemo(() => rpLogText({ title: room.title, sub }, msgs, chars, { time }),
    [room.title, sub, msgs, chars, time]);

  // 파일은 방 제목으로. txt 앞의 BOM은 오래된 편집기에서도 한글이 깨지지 않게 하려는 것
  const saveTxt = () => downloadText(logFileName(room.title, 'txt'), `﻿${text}`, 'text/plain');
  const saveHtml = () => downloadText(logFileName(room.title, 'html'),
    rpLogHtml({ title: room.title, sub }, msgs, chars, { time }), 'text/html');

  const range = rpLogRange(msgs);
  return (
    <Modal open onClose={onClose} title="역극 로그"
      desc={[sub, range, `대화 ${msgs.length}개`].filter(Boolean).join(' · ')}
      actions={<button className="btn btn-ghost" onClick={onClose}>CLOSE</button>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <KCheck label="시각 표시 (날짜가 바뀌는 곳에 구분선)" checked={time} onChange={setTime} />
        <div>
          <label className="k-label">미리보기</label>
          <pre className="rp-log-pre">{text}</pre>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-dark" onClick={saveTxt}>⤓ TXT 저장</button>
          <button className="btn btn-ghost" onClick={saveHtml}>⤓ HTML 저장</button>
          <small className="hint" style={{ margin: 0 }}>HTML은 캐릭터 테마색이 들어간 한 장짜리 문서입니다</small>
        </div>
        {isAdmin && <PostToTrpg room={room} msgs={msgs} chars={chars} sub={sub} time={time} />}
      </div>
    </Modal>
  );
}

/** RP LOG 게시판에 올리기 — 관리자에게만 그려서, 참여자에게는 로그 목록을 불러오지도 않는다 */
function PostToTrpg({ room, msgs, chars, sub, time }: {
  room: RpRoom; msgs: RpMessage[]; chars: Character[]; sub: string; time: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [logsAll, setLogsAll, logsLoaded] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [bodies, setBodies, bodiesLoaded] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const { list } = useSections();
  const secs = list('trpg');   // RP LOG를 여러 개로 만들었으면 어디에 올릴지 고른다

  const [title, setTitle] = useState(room.title);
  const [catchphrase, setCatchphrase] = useState('');
  // 공개 전환한 방이면 전체공개, 아니면 멤버공개부터 — 참여자끼리만 보던 대화가 한 번에 전체로 나가지 않게
  const [vis, setVis] = useState<Visibility>(room.isPublic ? 'public' : 'member');
  const [secId, setSecId] = useState(MAIN_SEC);
  const [fmt, setFmt] = useState<'html' | 'text'>('html');
  const [busy, setBusy] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const ready = logsLoaded && bodiesLoaded;

  const post = async () => {
    if (!title.trim()) { toast('제목을 입력해 주세요'); return; }
    if (!ready || busy) return;
    setBusy(true);
    try {
      const id = newId();
      const speakers = rpSpeakers(msgs, chars);
      const colors = speakers.map(c => c.color).filter(isHex);
      const info = { title: title.trim(), sub };
      const bodyText = fmt === 'html'
        ? rpLogHtml(info, msgs, chars, { time, forBoard: true })
        : rpLogText(info, msgs, chars, { time, forBoard: true });
      const log: TrpgLog = {
        id,
        no: Math.max(0, ...filterSection(logsAll, secId).map(l => l.no)) + 1,   // 그 게시판 안의 순번
        title: title.trim(),
        catchphrase: catchphrase.trim() || undefined,
        writer: '',
        withText: speakers.map(c => c.name).join(' · '),
        relId: room.relId,                  // 자관 기반 방이면 자관 페이지의 로그 목록에도 뜬다
        auId: room.relId && room.auId && room.auId !== 'base' ? room.auId : undefined,   // AU 방이면 그 AU 목록에 (커플홈)
        date: rpLogLastDate(msgs),
        ph: 'cool',
        visibility: vis,
        listHidden: false,
        // 썸네일은 두 캐릭터의 테마색 그라데이션 (한 명이면 단색)
        thumbColor: colors.length
          ? { c1: colors[0], c2: colors[1] }
          : { c1: '#4c5a6e', c2: '#242b36' },
        ...secStamp(secId),
      };
      // 본문은 목록과 분리 저장 — RP LOG 페이지의 등록과 같은 방식 (본문 문서는 뒤에 붙인다)
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

  return (
    <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 14, display: 'grid', gap: 9 }}>
      <label className="k-label" style={{ margin: 0 }}>RP LOG에 올리기</label>
      <KInput placeholder="제목 (필수)" value={title} onChange={e => setTitle(e.target.value)} />
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
        <div className="mini-seg">
          <button className={fmt === 'html' ? 'on' : ''} onClick={() => setFmt('html')}>테마색 HTML</button>
          <button className={fmt === 'text' ? 'on' : ''} onClick={() => setFmt('text')}>텍스트</button>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {room.relId
          ? '이 방의 자관에 연동되어 자관 페이지의 로그 목록에도 표시됩니다. '
          : ''}
        위의 시각 표시 설정이 본문에도 그대로 들어갑니다.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-dark" disabled={!ready || busy || !!postedId} onClick={post}>
          {busy ? '올리는 중…' : postedId ? '올렸습니다' : !ready ? '불러오는 중…' : '＋ RP LOG에 올리기'}
        </button>
        {postedId && (
          <button className="btn btn-ghost" onClick={() => router.push(`/trpg/${postedId}`)}>올린 로그 보기 ›</button>
        )}
      </div>
    </div>
  );
}
