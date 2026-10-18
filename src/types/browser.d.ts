export {};

declare global {
  interface Navigator {
    connection?: { saveData?: boolean; effectiveType?: string };
  }
  interface Window {
    __gestorPwaManaged?: boolean;
    __dashData?: any;
    __devReload?: any;
    __geoData?: any;
    __gestorAbort?: AbortController;
    __gestorInitPage?: () => void;
    __gestorInitShell?: () => void;
    __gestorShellAbort?: AbortController;
    __gestorVisualEffects?: any;
    __waSessoesInterval?: any;
    csrfFetch?: typeof fetch;
    gestorClientFieldTools?: Record<string, (...args: any[]) => any>;
    gestorMountReactPage?: any;
    gestorNavigate?: (href: string) => Promise<boolean>;
    gestorPageModules?: Record<string, (...args: any[]) => any>;
    gestorPolling?: any;
    gestorReactClients?: any;
    gestorRefresh?: () => void;
    gestorSetModalState?: (modal: HTMLElement, open: boolean) => void;
    getCsrfToken?: () => string;
    pushStatus?: () => Promise<any>;
    pushSubscribe?: () => Promise<any>;
    pushUnsubscribe?: () => Promise<any>;
    gestorShowNotice?: (text: string, error?: boolean) => void;
    gestorConfirmAction?: (
      message: string,
      source?: HTMLElement,
      trigger?: HTMLElement,
    ) => Promise<boolean>;
  }
}
