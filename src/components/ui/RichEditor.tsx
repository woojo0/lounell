'use client';
// 리치 텍스트 에디터 (TipTap) — 프로필 탭 등 HTML 콘텐츠 작성용
// 자체 스타일 툴바 (7장 — 기본 UI 금지) · 출력은 HTML, 저장 시 새니타이즈는 렌더 쪽에서 (6.3)
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { putBlob } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

/** 로컬 모드용 — 파일을 그대로 본문에 심는다 (서버가 없어 올릴 곳이 없을 때) */
function toDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

function TBtn({ on, label, title, onClick }: { on?: boolean; label: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" data-tip={title} className={`re-btn ${on ? 'on' : ''}`}
      onMouseDown={e => e.preventDefault()} onClick={onClick}>
      {label}
    </button>
  );
}

export function RichEditor({ value, onChange, placeholder }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // 링크 (v2.1 사용자 요청) — 툴바 아래 작은 입력줄로 주소를 받는다 (기본 prompt 창은 쓰지 않는다)
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  // HTML 코드 모드 (v2.1 사용자 요청) — 코드를 그대로 저장한다. 편집기로 돌아가면 지원하지 않는 태그·스타일이 정리될 수 있다
  const [srcMode, setSrcMode] = useState(false);
  const editor = useEditor({
    // StarterKit(v3)에 든 링크는 누르면 바로 열리지 않게 — 편집 중 클릭은 커서 이동 (링크 삽입 v2.1)
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }), Image],
    content: value || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 're-content prose' },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // 외부 값이 완전히 바뀐 경우(탭 전환) 동기화
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return <div className="re-wrap" style={{ minHeight: 200 }} />;

  /* 링크 (v2.1) — 선택한 글자에 주소를 건다. 비우고 적용하면 해제 */
  const openLink = () => {
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkOpen(o => !o);
  };
  const applyLink = () => {
    const u = linkUrl.trim();
    if (!u) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else {
      const href = /^(https?:|mailto:|\/)/.test(u) ? u : `https://${u}`;
      // 글자를 고르지 않았으면 주소 글자를 넣어 링크로
      if (editor.state.selection.empty) editor.chain().focus().insertContent(`<a href="${href}" target="_blank">${href}</a>`).run();
      else editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank' }).run();
    }
    setLinkOpen(false);
  };
  /* HTML 코드 모드 (v2.1) — 코드 칸의 값이 그대로 저장값. 편집기로 돌아갈 때 그 코드를 다시 읽어 들인다 */
  const toggleSrc = () => {
    if (srcMode) editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    setSrcMode(s => !s);
  };

  /* 이미지는 **올려서** 넣는다 (v2.0 사용자 요청 — 예전엔 URL을 직접 적게 했다).
     다른 이미지들과 같은 경로(putBlob)를 타므로 서버 모드면 저장소에 올라가고 공개 주소가 나온다.
     서버가 없는 로컬 모드에서는 그 주소가 이 브라우저 안에서만 뜻이 있는 파일 id라
     <img>가 읽지 못한다 — 그때만 본문에 그대로 심는다(개발·오프라인용). */
  const insertImage = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const ref = await putBlob(f);
      const src = /^https?:/.test(ref) ? ref : await toDataUrl(f);
      editor.chain().focus().setImage({ src }).run();
    } catch (e) {
      // 조용히 실패하면 「올렸는데 왜 안 들어가지」가 된다 — 사유를 그대로 보여 준다
      toast(`이미지를 올리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  return (
    <div className="re-wrap">
      <div className="re-toolbar">
        <TBtn title="굵게" label={<b>B</b>} on={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <TBtn title="기울임" label={<i>I</i>} on={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <TBtn title="취소선" label={<s>S</s>} on={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()} />
        <span className="re-sep" />
        <TBtn title="제목" label="H2" on={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <TBtn title="소제목" label="H3" on={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <span className="re-sep" />
        <TBtn title="글머리 목록" label="•≡" on={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <TBtn title="번호 목록" label="1≡" on={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <TBtn title="인용" label="❝" on={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <TBtn title="구분선" label="—" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <span className="re-sep" />
        {/* 링크 · HTML 코드 (v2.1 사용자 요청 — 「본문 글자에 링크를 걸거나 html 코드를 적용」) */}
        <TBtn title="링크 (선택한 글자에)" label="🔗" on={editor.isActive('link') || linkOpen} onClick={openLink} />
        <TBtn title={srcMode ? '편집기로 돌아가기' : 'HTML 코드로 편집'} label={<span style={{ fontSize: 11, fontFamily: 'monospace' }}>&lt;/&gt;</span>} on={srcMode} onClick={toggleSrc} />
        <span className="re-sep" />
        <TBtn title={busy ? '올리는 중…' : '이미지 올리기'} label={busy ? '⏳' : '🖼'}
          onClick={() => { if (!busy) fileRef.current?.click(); }} />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void insertImage(f); }} />
        {/* 실행 취소·다시 실행은 모바일에서 숨김 — 툴바가 두 줄로 넘어가 본문 영역을 침범 (v1.9 사용자 확정)
            (단축키 Ctrl+Z / Ctrl+Shift+Z는 그대로 동작) */}
        <span className="re-sep re-hide-m" />
        <span className="re-hide-m" style={{ display: 'contents' }}>
          <TBtn title="실행 취소" label="↶" onClick={() => editor.chain().focus().undo().run()} />
          <TBtn title="다시 실행" label="↷" onClick={() => editor.chain().focus().redo().run()} />
        </span>
      </div>
      {linkOpen && !srcMode && (
        <div className="re-linkrow">
          <input className="k-input" placeholder="https://… (비우고 적용하면 링크 해제)" value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setLinkOpen(false); }} />
          <button type="button" className="btn btn-dark" style={{ height: 30, padding: '0 12px', fontSize: 11 }} onClick={applyLink}>적용</button>
          <button type="button" className="btn btn-ghost" style={{ height: 30, padding: '0 10px', fontSize: 11 }} onClick={() => setLinkOpen(false)}>닫기</button>
        </div>
      )}
      {srcMode ? (
        /* HTML 코드 — 적은 그대로 저장된다 (표시할 때 스크립트 등은 걸러진다) */
        <div className="re-body">
          <textarea className="re-src" value={value} spellCheck={false}
            onChange={e => onChange(e.target.value)} placeholder="<p>HTML 코드를 여기에</p>" />
          <div className="hint" style={{ padding: '4px 10px 8px' }}>HTML 코드는 적은 그대로 저장됩니다 — 편집기로 돌아가면 지원하지 않는 태그·스타일은 정리될 수 있습니다 (script·iframe 등은 표시할 때 걸러집니다)</div>
        </div>
      ) : (
        /* 플레이스홀더는 본문 영역 기준으로 — 툴바가 두 줄이 돼도 안 밀림 (v1.9 사용자 발견) */
        <div className="re-body">
          <EditorContent editor={editor} />
          {placeholder && editor.isEmpty && <div className="re-ph">{placeholder}</div>}
        </div>
      )}
    </div>
  );
}
