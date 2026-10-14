'use client';
// 플레이기록 입력 폼 (4.16 v1.8) — 라벨 영문 통일 · 플레이스홀더 없음 ·
// 시나리오 자동완성(기존 기록 검색 드롭다운) · 로그 연결(외부 URL / 내 백업 로그 검색 토글)
import React, { useState } from 'react';
import { PlayRecord, TrpgLog, TRPG_SEED } from '@/lib/galleryStore';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, Relation, REL_SEED, charAuOptions } from '@/lib/charStore';
import { TrpgChar, TCHAR_SEED } from '@/lib/tcharStore';
import { PlayCharRef, playCharEmpty } from '@/lib/playChar';
import { KInput, KDate, KSelect } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';

export interface PlaylogFormValue {
  date?: string; scenario: string; scenarioLink?: string;
  writer: string; withText: string; playtime: string;
  /** GMPC · PC (커플홈 — Role 대신) — 비우면 undefined */
  gmpc?: PlayCharRef; pc?: PlayCharRef;
  url?: string; logId?: string;
}

type CharOpt = { value: string; label: string; ref: PlayCharRef };

/** GMPC · PC 칸 하나 — 직접 적기 / 자관 캐릭터(AU 포함) / TRPG 캐릭터 중 골라 연동 (커플홈 사용자 요청) */
function CharPick({ label, value, onChange, relOpts, tOpts }: {
  label: string; value?: PlayCharRef; onChange: (v?: PlayCharRef) => void;
  relOpts: CharOpt[]; tOpts: CharOpt[];
}) {
  const [mode, setMode] = useState<'text' | 'rel' | 'tchar'>(value?.src ?? 'text');
  const opts = mode === 'rel' ? relOpts : tOpts;
  const cur = value?.src === mode && value.charId ? opts.find(o => o.ref.charId === value.charId && (o.ref.auKey ?? '') === (value.auKey ?? '')) : undefined;
  const pickMode = (m: 'text' | 'rel' | 'tchar') => {
    setMode(m);
    // 직접 적기로 돌아가면 연동만 풀고 이름은 남긴다 — 다른 출처로 바꾸면 고를 때까지 비운다
    if (m === 'text') onChange(value?.name?.trim() ? { name: value.name } : undefined);
    else if (value?.src !== m) onChange(undefined);
  };
  return (
    <div>
      <label className="k-label" style={{ marginBottom: 5 }}>{label}</label>
      <div className="mini-seg" style={{ marginBottom: 6 }}>
        <button className={mode === 'text' ? 'on' : ''} onClick={() => pickMode('text')}>직접</button>
        <button className={mode === 'rel' ? 'on' : ''} onClick={() => pickMode('rel')}>자관 캐릭터</button>
        <button className={mode === 'tchar' ? 'on' : ''} onClick={() => pickMode('tchar')}>TRPG 캐릭터</button>
      </div>
      {mode === 'text' ? (
        <KInput value={value?.src ? '' : value?.name ?? ''} onChange={e => onChange(e.target.value ? { name: e.target.value } : undefined)} />
      ) : opts.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>{mode === 'rel' ? '자관에 넣은 캐릭터가 없습니다' : 'TRPG 캐릭터 리스트가 비어 있습니다'}</p>
      ) : (
        <KSelect minWidth={180} maxWidth={320} value={cur?.value ?? ''} placeholder="캐릭터 선택"
          options={[{ value: '', label: '캐릭터 선택' }, ...opts.map(o => ({ value: o.value, label: o.label }))]}
          onChange={v => { const o = opts.find(x => x.value === v); onChange(o ? o.ref : undefined); }} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="k-label" style={{ marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

export function PlaylogForm({ initial, records, onSave, onCancel }: {
  initial: PlayRecord | null;
  records: PlayRecord[];            // 시나리오 자동완성 소스
  onSave: (v: PlaylogFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const isNew = !initial;
  const [logs] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [date, setDate] = useState(initial?.date ?? '');
  const [scenario, setScenario] = useState(initial?.scenario ?? '');
  const [scenarioLink, setScenarioLink] = useState(initial?.scenarioLink ?? '');
  const [writer, setWriter] = useState(initial?.writer ?? '');
  const [withText, setWithText] = useState(initial?.withText ?? '');
  // GMPC · PC (커플홈 — Role 대신). 옛 기록의 role 값은 건드리지 않는다(보이지 않게 남는다)
  const [gmpc, setGmpc] = useState<PlayCharRef | undefined>(initial?.gmpc);
  const [pc, setPc] = useState<PlayCharRef | undefined>(initial?.pc);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [tchars] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  // 자관 캐릭터 — 자관 멤버인 캐릭터의 원래 모습 + 그 자관의 AU마다 하나씩 (메모·감상타래와 같은 목록)
  const relChars = chars.filter(c => rels.some(r => r.members.some(m => m.charId === c.id)));
  const relOpts: CharOpt[] = charAuOptions(relChars, rels).map(o => ({
    value: `${o.charId}|${o.auKey ?? ''}`, label: o.label,
    ref: { name: o.char.name, src: 'rel', charId: o.charId, ...(o.auKey ? { auKey: o.auKey } : {}) },
  }));
  const tOpts: CharOpt[] = tchars.map(t => ({
    value: t.id, label: t.rule ? `${t.name} · ${t.rule}` : t.name,
    ref: { name: t.name, src: 'tchar', charId: t.id },
  }));
  const [playtime, setPlaytime] = useState(initial?.playtime ?? '');
  const [linkMode, setLinkMode] = useState<'url' | 'log'>(initial?.logId ? 'log' : 'url');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [logId, setLogId] = useState(initial?.logId ?? '');
  const [logQuery, setLogQuery] = useState('');
  const [scOpen, setScOpen] = useState(false);

  // 시나리오 자동완성 — 기존 기록에서 이름 중복 제거
  const scPool = [...new Map(records.map(r => [r.scenario, r])).values()]
    .filter(r => scenario.trim() && r.scenario !== scenario
      && r.scenario.toLowerCase().includes(scenario.trim().toLowerCase()));

  const save = () => {
    if (!scenario.trim()) { toast('Scenario를 입력해 주세요'); return; }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Date는 YYYY-MM-DD 형식으로 입력해 주세요'); return; }
    onSave({
      date: date || undefined,
      scenario: scenario.trim(),
      scenarioLink: scenarioLink.trim() || undefined,
      writer: writer.trim(), withText: withText.trim(), playtime: playtime.trim(),
      gmpc: playCharEmpty(gmpc) ? undefined : { ...gmpc!, name: gmpc!.name.trim() },
      pc: playCharEmpty(pc) ? undefined : { ...pc!, name: pc!.name.trim() },
      url: linkMode === 'url' ? (url.trim() || undefined) : undefined,
      logId: linkMode === 'log' ? (logId || undefined) : undefined,
    });
  };

  return (
    <div className="write-grid">
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Date (optional)"><KDate value={date} onChange={setDate} placeholder="" style={{ width: '100%' }} /></Field>
          <Field label="Playtime"><KInput value={playtime} onChange={e => setPlaytime(e.target.value)} /></Field>
        </div>
        <div style={{ position: 'relative' }}>
          <Field label="Scenario">
            <KInput value={scenario}
              onChange={e => { setScenario(e.target.value); setScOpen(true); }}
              onBlur={() => setTimeout(() => setScOpen(false), 150)} />
          </Field>
          {/* 자동완성 드롭다운 — 클릭 시 이름·링크 채움 (4.16) */}
          {scOpen && scPool.length > 0 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 30,
              background: 'var(--panel-solid)', border: '1.5px solid var(--line)', borderRadius: 9,
              boxShadow: 'var(--sh-dd)', overflow: 'hidden',
            }}>
              {scPool.slice(0, 6).map(r => (
                <div key={r.id} style={{ padding: '8px 12px', cursor: 'var(--cur-pointer,pointer)', fontSize: 12.5, borderBottom: '1px dashed var(--line)' }}
                  onMouseDown={() => {
                    setScenario(r.scenario);
                    if (r.scenarioLink) setScenarioLink(r.scenarioLink);
                    if (r.writer && !writer) setWriter(r.writer);
                    setScOpen(false);
                  }}>
                  <b>{r.scenario}</b> <small style={{ color: 'var(--faint)' }}>{r.writer}</small>
                </div>
              ))}
            </div>
          )}
        </div>
        <Field label="Scenario Link (optional)"><KInput value={scenarioLink} onChange={e => setScenarioLink(e.target.value)} /></Field>
        <Field label="Writer"><KInput value={writer} onChange={e => setWriter(e.target.value)} /></Field>
        {/* GMPC · PC (커플홈 사용자 요청 — Role 대신, 캐릭터 연동) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <CharPick label="GMPC" value={gmpc} onChange={setGmpc} relOpts={relOpts} tOpts={tOpts} />
          <CharPick label="PC" value={pc} onChange={setPc} relOpts={relOpts} tOpts={tOpts} />
        </div>
        <Field label="With"><KInput value={withText} onChange={e => setWithText(e.target.value)} /></Field>

        {/* 로그 연결 — 외부 URL 또는 내 홈 백업 로그 검색 (4.16) */}
        <div>
          <label className="k-label" style={{ marginBottom: 5 }}>Url (optional)</label>
          <div className="mini-seg" style={{ marginBottom: 8 }}>
            <button className={linkMode === 'url' ? 'on' : ''} onClick={() => setLinkMode('url')}>외부 URL</button>
            <button className={linkMode === 'log' ? 'on' : ''} onClick={() => setLinkMode('log')}>내 로그 연결</button>
          </div>
          {linkMode === 'url' ? (
            <KInput value={url} onChange={e => setUrl(e.target.value)} />
          ) : (
            <div>
              <KInput placeholder="로그 검색" value={logQuery} onChange={e => setLogQuery(e.target.value)} />
              <div style={{ marginTop: 6, maxHeight: 150, overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: 9 }}>
                {logs
                  .filter(l => { const s = logQuery.trim().toLowerCase(); return !s || l.title.toLowerCase().includes(s); })
                  .map(l => (
                    <div key={l.id} onClick={() => setLogId(logId === l.id ? '' : l.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', cursor: 'var(--cur-pointer,pointer)',
                        fontSize: 12.5, borderBottom: '1px dashed var(--line)',
                        background: logId === l.id ? 'rgba(127,127,127,.12)' : undefined,
                      }}>
                      <b>№ {String(l.no).padStart(3, '0')}</b> {l.title}
                      {logId === l.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                    </div>
                  ))}
                {logs.length === 0 && <p className="hint" style={{ padding: 10 }}>백업된 로그가 없습니다</p>}
              </div>
            </div>
          )}
        </div>
        <p className="hint" style={{ margin: 0 }}>Date를 비워두면 표 맨 아래에 추가됩니다</p>
      </div>

      <div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
