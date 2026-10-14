// 자관 질문 리스트 (v1.9) — 환경설정에서 관리하는 질문 세트.
// CP(커플)/NCP(커플 아님)로 구분 — 자관·AU의 CP/NCP에 맞는 세트를 골라 QUESTIONS 섹션에 넣는다.
// 기본 DB는 추후 사용자 제공분으로 교체 예정 — 아래 시드는 자리 표시용 소량.
import { useCallback, useEffect, useState } from 'react';
import { RelCpTag } from './charStore';
import { getSetting, setSetting, onSettingChange } from './settingStore';

export interface RelQuestionSet {
  id: string;
  name: string;          // 세트 이름
  cat: RelCpTag;         // CP / NCP
  questions: string[];
}

export const RELQ_KEY = 'ohome.relqsets.v1';

export const RELQ_SEED: RelQuestionSet[] = [];

export const CP_LABEL: Record<RelCpTag, string> = { cp: 'CP', ncp: 'NCP' };

/** 질문 세트 목록 (v2.1) — 사이트 설정(ohome.relqsets.v1)으로 저장해 서버에도 올라간다.
 *  예전엔 useLocalList로 이 브라우저에만 남아 다른 기기·다른 회원에게는 보이지 않았다 (사용자 제보 — 「질문리스트가 로컬에만 저장」).
 *  키는 그대로라 예전에 이 브라우저에 쌓아 둔 세트도 그대로 읽히고, 다음 저장 때 서버로 올라간다 */
export function useRelqSets(): [RelQuestionSet[], (next: RelQuestionSet[]) => void, boolean] {
  const [sets, setSets] = useState<RelQuestionSet[]>(RELQ_SEED);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const readSets = () => {
      const v = getSetting<RelQuestionSet[] | null>(RELQ_KEY, null);
      setSets(Array.isArray(v) ? v : RELQ_SEED);
    };
    readSets();
    setLoaded(true);
    return onSettingChange(k => { if (k === RELQ_KEY) readSets(); });
  }, []);
  const save = useCallback((next: RelQuestionSet[]) => { setSets(next); setSetting(RELQ_KEY, next); }, []);
  return [sets, save, loaded];
}
