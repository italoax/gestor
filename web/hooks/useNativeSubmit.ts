'use client';
import { useEffect, useRef } from 'react';

export function useNativeSubmit(confirmMessage?: string) {
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const reset = () => {
      submitted.current = false;
    };
    window.addEventListener('pageshow', reset);
    const finished = (event: Event) => {
      if (event.target === form.current) reset();
    };
    document.addEventListener('gestor:submit-finished', finished);
    return () => {
      window.removeEventListener('pageshow', reset);
      document.removeEventListener('gestor:submit-finished', finished);
    };
  }, []);
  return (event) => {
    if (
      submitted.current ||
      (confirmMessage && !window.confirm(confirmMessage))
    )
      event.preventDefault();
    else {
      form.current = event.currentTarget;
      submitted.current = true;
    }
  };
}
