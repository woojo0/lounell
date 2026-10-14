// 붙여 넣은 그림 꺼내기 (커플홈 사용자 요청 — 「타래 쓸 때 이미지 추가하는 거 Ctrl+V로도 넣을 수 있게」).
// 캡처 도구(Win+Shift+S)·브라우저 「이미지 복사」로 클립보드에 담긴 그림을 파일로 돌려준다.
// 글자(text/plain)가 같이 있으면 글자 붙여넣기로 두고 그림은 꺼내지 않는다 — 엑셀·워드에서 글을 복사하면
// 그 모양을 그림으로도 같이 싣는 경우가 있어, 글을 붙여 넣으려다 사진이 따라 붙지 않게.
import type React from 'react';

export function pastedImageFiles(e: React.ClipboardEvent): File[] {
  const dt = e.clipboardData;
  if (!dt) return [];
  if ((dt.getData('text/plain') ?? '').trim()) return [];
  const files: File[] = [];
  for (const it of Array.from(dt.items ?? [])) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}
