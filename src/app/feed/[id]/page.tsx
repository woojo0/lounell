'use client';
// 큰 그림 게시판 상세 (v2.1) — 갤러리 상세와 같은 공용 BackupDetail, 저장 자리만 다르다
import React from 'react';
import { BackupDetail } from '@/components/backup/BackupDetail';

export default function FeedDetailPage() {
  return <BackupDetail kind="feed" />;
}
