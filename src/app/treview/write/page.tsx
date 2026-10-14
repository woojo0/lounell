'use client';
// TRPG 리뷰 쓰기 (v2.1 사용자 요청 — 모달 대신 페이지). 수정은 /treview/[id]/edit
import React, { Suspense } from 'react';
import { ReviewForm } from '@/components/trpg/ReviewForm';

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function ReviewWritePage() {
  return <Suspense fallback={<section className="page" />}><ReviewForm initial={null} /></Suspense>;
}
