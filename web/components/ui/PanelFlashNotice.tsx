'use client';
import { useEffect } from 'react';
import { showPanelNotice } from '../../../src/browser/assets/js/ui/panel-feedback.ts';

export function PanelFlashNotice({
  success = [],
  error = [],
}: {
  success?: string[];
  error?: string[];
}) {
  const text = [...success, ...error].join(' ');
  const hasError = error.length > 0;
  useEffect(() => {
    if (text) showPanelNotice(text, hasError);
  }, [text, hasError]);
  return null;
}
