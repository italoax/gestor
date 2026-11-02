'use client';
import { useEffect, type RefObject } from 'react';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';

/** Ícones do painel usam o mesmo traço e as mesmas cores dos ícones existentes. */
export function DashboardIcon({ name }: { name: string }) {
  return (
    <span className="dash-motion-icon" data-dash-icon={name} aria-hidden="true">
      {['money', 'growth', 'decline', 'chart'].includes(name) ? (
        <svg
          className="ui-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {name === 'money' && (
            <>
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <circle cx="12" cy="12" r="3" />
              <path d="M6 9h.01M18 15h.01" />
            </>
          )}
          {name === 'growth' && (
            <>
              <path d="m3 17 6-6 4 4 8-9" />
              <path d="M15 6h6v6" />
            </>
          )}
          {name === 'decline' && (
            <>
              <path d="m3 7 6 6 4-4 8 9" />
              <path d="M15 18h6v-6" />
            </>
          )}
          {name === 'chart' && (
            <>
              <path d="M3 3v18h18" />
              <path className="dash-icon-bar" d="M7 16v-5" />
              <path className="dash-icon-bar" d="M12 16V7" />
              <path className="dash-icon-bar" d="M17 16V4" />
            </>
          )}
        </svg>
      ) : (
        <Icon name={name} />
      )}
    </span>
  );
}

/** Entradas por visibilidade, sem alterar valores ou conteúdo SSR. */
export function useDashboardMotion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>('[data-dash-reveal]'),
    );
    let observer: IntersectionObserver | undefined;
    let bellAnimation: Animation | undefined;
    const badge = document.querySelector<HTMLElement>('[data-notif-count]');
    const bell = document.querySelector<SVGElement>('.notif-bell-svg');
    const unreadCount = () =>
      Number.parseInt(badge?.textContent || '0', 10) || 0;
    let unread = unreadCount();
    const notifications = new MutationObserver(() => {
      const next = unreadCount();
      if (
        next > unread &&
        !preference.matches &&
        !document.hidden &&
        bell?.animate
      ) {
        bellAnimation?.cancel();
        bellAnimation = bell.animate(
          [
            { transform: 'rotate(0deg)', offset: 0 },
            { transform: 'rotate(-9deg)', offset: 0.2 },
            { transform: 'rotate(7deg)', offset: 0.55 },
            { transform: 'rotate(-3deg)', offset: 0.8 },
            { transform: 'rotate(0deg)', offset: 1 },
          ],
          { duration: 300, easing: 'ease-out' },
        );
      }
      unread = next;
    });
    if (badge)
      notifications.observe(badge, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    const visibility = () => {
      root.dataset.dashPaused = String(document.hidden);
      if (document.hidden) bellAnimation?.cancel();
    };
    const configure = () => {
      observer?.disconnect();
      root.dataset.dashMotion = preference.matches ? 'off' : 'on';
      if (preference.matches) bellAnimation?.cancel();
      if (preference.matches || !('IntersectionObserver' in window)) return;
      observer = new IntersectionObserver(
        (entries) => {
          let order = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const card = entry.target as HTMLElement;
            card.style.setProperty(
              '--dash-entry-delay',
              `${Math.min(order++, 3) * 20}ms`,
            );
            card.dataset.dashEntered = 'true';
            observer.unobserve(card);
          }
        },
        { threshold: 0.12 },
      );
      cards
        .filter((card) => card.dataset.dashEntered !== 'true')
        .forEach((card) => observer.observe(card));
    };
    visibility();
    configure();
    preference.addEventListener('change', configure);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer?.disconnect();
      notifications.disconnect();
      bellAnimation?.cancel();
      preference.removeEventListener('change', configure);
      document.removeEventListener('visibilitychange', visibility);
      delete root.dataset.dashMotion;
      delete root.dataset.dashPaused;
    };
  }, [ref]);
}
