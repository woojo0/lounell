'use client';
// 큰 그림 게시판 작성창 (v2.1) — 갤러리와 같은 공용 폼(BackupForm), 수정은 /feed/[id]/edit
import React from 'react';
import { BackupForm } from '@/components/backup/BackupForm';

export default function FeedWritePage() {
  return <BackupForm initial={null} kind="feed" />;
}
