// 로그 페이지 주소로 등록하기 (커플홈 사용자 요청 — "로그 주소도 입력할 수 있게").
//
// 브라우저가 다른 사이트의 로그 HTML을 직접 받아 오면 CORS에 막히므로(크리스탈리아·코코포리아 로그 호스팅 등),
// 서버가 대신 받아 같은 출처로 내준다. 받은 내용은 RP LOG 본문으로 저장된다(백업 목적 — 원본 사이트가 사라져도 남게).
//
// 아무 주소나 대신 받아 주는 통로가 되지 않게: http(s)만, 내부망·로컬 주소는 막고, 글(text/*)만, 8MB까지, 15초 안에.
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function isPrivateHost(h: string): boolean {
  const host = h.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.includes(':')) return true;   // IPv6 리터럴은 그냥 막는다
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u') ?? '';
  let target: URL;
  try { target = new URL(u); } catch { return new Response('bad url', { status: 400 }); }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return new Response('host not allowed', { status: 400 });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      cache: 'no-store',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; OHomeLogFetch/1.0)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    });
    if (!res.ok) return new Response(`upstream ${res.status}`, { status: 502 });
    const ct = res.headers.get('content-type') ?? '';
    // 글만 — 그림·PDF 같은 건 로그 본문이 될 수 없다 (content-type이 없는 정적 호스팅은 통과)
    if (ct && !/^(text\/|application\/(xhtml\+xml|xml|json))/i.test(ct)) return new Response('not a text document', { status: 415 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response('too large', { status: 413 });
    return new Response(buf, {
      headers: {
        'content-type': ct || 'text/html',
        // 리다이렉트를 따라간 최종 주소 — 상대 주소(그림·CSS)의 기준으로 쓴다
        'x-final-url': res.url || target.toString(),
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
