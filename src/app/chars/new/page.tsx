'use client';
// 캐릭터 등록 페이지 (4.4) — 전용 페이지 (모달 아님)
import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED } from '@/lib/charStore';
import { useSectionParam, secStamp, secQuery, useSectionTitle } from '@/lib/sectionStore';
import { useMenuSettings, canWriteAt, writeKeyOf, writeDefaultOf } from '@/lib/menuStore';
import { CharEditForm } from '@/components/chars/CharEditForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CharNewInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const params = useSearchParams();
  // 상대 캐릭터 리스트에서 눌러 왔으면(?partner=1) 상대 캐릭터(own=false)로 등록 (cm_260929 acc3537)
  const partner = params.get('partner') === '1';
  const kind = partner ? 'pchars' : 'chars';
  const sec = useSectionParam(kind);   // 어느 캐릭터 목록에서 눌러 왔는지 (v2.0)
  // 큰 글씨 — 추가 섹션이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle(kind, sec.id, partner ? 'ADD PARTNER CHARACTER' : 'ADD CHARACTER');
  // 커플홈 — 캐릭터 목록이 없으므로 만들고 나면 부른 곳(자관 시작 안내·자관 등록·멤버 추가)으로 돌아간다.
  // 사이트 안 주소만 받는다 — 바깥 주소로 튀지 않게
  const nextRaw = params.get('next');
  const next = nextRaw && /^\/(?![\/])/.test(nextRaw) ? nextRaw : null;
  // 등록 권한 — 환경설정 「권한」에서. 내 자캐(/chars)는 기본 관리자, 상대 캐릭터(/pchars)는 기본 가입자 (writeDefaultOf)
  const [menuSet, , menuLoaded] = useMenuSettings();

  if (!loaded || !menuLoaded) return <section className="page" />;
  if (!canWriteAt(menuSet, writeKeyOf(partner ? '/pchars' : '/chars', sec.id), { loggedIn: !!user, isAdmin, id: user?.id }, writeDefaultOf(partner ? '/pchars' : '/chars'))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>{isAdmin || !user ? '관리자 전용' : '허용된 회원만 등록할 수 있습니다'}</p></div>
      </section>
    );
  }
  // 회원이 등록하면 그 회원에게 「편집까지」 권한을 붙인다 — 자기가 만든 캐릭터를 고칠 수 있게 (cm_260929 acc3537).
  // 기존 권한 체계(grants → 서버 editorIds)를 그대로 타므로 서버 규칙도 저장을 허용한다
  const selfGrant = !isAdmin && user ? [{ userId: user.id, level: 'edit' as const }] : [];

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        {partner
          ? <EditableDesc k="pchars-new-desc" def="상대 캐릭터 등록 — 내 캐릭터가 아니라 상대 캐릭터로 저장됩니다 · 아트 첫 장이 대표" />
          : <EditableDesc k="chars-new-desc" def="캐릭터 등록 — 아트 첫 장이 대표 · 탭 내용은 전용 편집 화면에서 작성" />}
      </div>
      <CharEditForm
        initial={null}
        existingIds={chars.flatMap(c => [c.id, ...(c.slug ? [c.slug] : [])])}
        onCancel={() => router.push(next ?? (partner ? '/pchars' + secQuery(kind, sec.id) : '/rels'))}
        onSave={c => {
          // 상대 캐릭터 리스트에서 왔으면 own=false로 — 그 밖에는 폼에서 고른 값 그대로 (자관 멤버 추가 등)
          setChars([...chars, {
            ...c, ...(partner ? { own: false } : {}), ...secStamp(sec.id),
            ...(selfGrant.length ? { grants: [...(c.grants ?? []), ...selfGrant] } : {}),
          }]);
          toast('캐릭터가 등록되었습니다');
          router.push(next ?? `/chars/${c.id}`);
        }}
      />
    </section>
  );
}

export default function CharNewPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><CharNewInner /></Suspense>;
}
