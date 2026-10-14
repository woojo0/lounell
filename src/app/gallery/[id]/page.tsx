'use client';
// 그림백업 상세 (4.11) — 본문은 공용 BackupDetail (v2.1 — 큰 그림 게시판과 같은 상세)
import React from 'react';
import { BackupDetail } from '@/components/backup/BackupDetail';

export default function BackupDetailPage() {
  return <BackupDetail kind="gallery" />;
}
