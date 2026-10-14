'use client';
import { useEffect, useRef } from 'react';

export function useNativeSubmit(confirmMessage?: string) {
  const submitted = useRef(false);
  useEffect(() => {
    const reset = () => {
      submitted.current = false;
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (event) => {
    if (
      submitted.current ||
      (confirmMessage && !window.confirm(confirmMessage))
    )
      event.preventDefault();
    else submitted.current = true;
  };
}
