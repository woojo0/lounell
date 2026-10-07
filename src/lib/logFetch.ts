// 로그 페이지 주소 → 본문 (커플홈 사용자 요청 — "로그 주소도 입력할 수 있게").
// /api/fetchlog 가 서버에서 대신 받아 오고(CORS 회피), 여기서 글자 인코딩을 맞추고 HTML이면 <base>를 끼워
// 그 페이지의 상대 주소(그림·CSS)가 원래 사이트 기준으로 풀리게 한다. 원본 바이트는 File로 돌려줘 「원본 파일」로도 보관한다.
import { decodeLogText, isHtmlBody } from './galleryStore';

export interface FetchedLog {
  /** 받은 그대로의 바이트 — 원본 파일로 보관 */
  file: File;
  /** 본문으로 저장할 글 — HTML이면 <base href> 가 들어가 있다 */
  text: string;
  /** HTML <title> (있으면 — 제목 칸이 비어 있을 때 채운다) */
  title?: string;
  /** 리다이렉트를 따라간 최종 주소 */
  finalUrl: string;
}

/** 주소에서 파일 이름 — 경로 마지막 조각(확장자가 있으면), 없으면 호스트 이름.html */
function fileNameOf(url: string, type: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
    if (/\.[a-z0-9]{1,5}$/i.test(last)) return last;
    return `${u.hostname}${/plain/i.test(type) ? '.txt' : '.html'}`;
  } catch { return 'log.html'; }
}

/** HTML에 <base href> 끼우기 — 이미 있으면 그대로 */
export function withBase(html: string, url: string): string {
  if (/<base\s/i.test(html)) return html;
  const tag = `<base href="${url.replace(/"/g, '&quot;')}">`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const root = /<html[^>]*>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + `<head>${tag}</head>` + html.slice(root.index + root[0].length);
  return tag + html;
}

export async function fetchLogUrl(url: string): Promise<FetchedLog> {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) throw new Error('http(s) 주소만 됩니다');
  const res = await fetch(`/api/fetchlog?u=${encodeURIComponent(u)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const blob = await res.blob();
  const finalUrl = res.headers.get('x-final-url') || u;
  const file = new File([blob], fileNameOf(finalUrl, blob.type), { type: blob.type || 'text/html' });
  let text = await decodeLogText(file);
  let title: string | undefined;
  if (isHtmlBody(text)) {
    title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || undefined;
    text = withBase(text, finalUrl);
  }
  return { file, text, title, finalUrl };
}
