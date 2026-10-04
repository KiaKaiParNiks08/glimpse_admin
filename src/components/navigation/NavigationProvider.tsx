'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  Suspense,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import styles from './navigation.module.css';

type RouteProgressContextValue = {
  pendingHref: string | null;
  /** Push a route once. A second click to the same URL while it is in flight is ignored. */
  navigate: (href: string) => void;
};

const RouteProgressContext = createContext<RouteProgressContextValue>({
  pendingHref: null,
  navigate: () => {},
});

export function useRouteProgress() {
  return useContext(RouteProgressContext);
}

function toLocalPath(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pendingRef = useRef<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [bar, setBar] = useState<'off' | 'run' | 'done'>('off');

  const begin = useCallback((href: string) => {
    const next = toLocalPath(href);
    if (!next || next === currentPath()) return false;
    if (pendingRef.current === next) return false;
    pendingRef.current = next;
    setPendingHref(next);
    setBar('run');
    return true;
  }, []);

  const finish = useCallback((fullPath: string) => {
    const pending = pendingRef.current;
    if (!pending) return;
    const pendingPath = pending.split('?')[0];
    const arrived = fullPath === pending || fullPath.split('?')[0] === pendingPath;
    if (!arrived) return;
    pendingRef.current = null;
    setPendingHref(null);
    setBar('done');
  }, []);

  const navigate = useCallback(
    (href: string) => {
      if (!begin(href)) return;
      router.push(href);
    },
    [begin, router]
  );

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const next = toLocalPath(href);
      if (!next || next === currentPath()) return;
      if (pendingRef.current === next) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      begin(href);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [begin]);

  useEffect(() => {
    if (bar !== 'done') return;
    const timeout = window.setTimeout(() => setBar('off'), 180);
    return () => window.clearTimeout(timeout);
  }, [bar]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => {
      pendingRef.current = null;
      setPendingHref(null);
      setBar('off');
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  return (
    <RouteProgressContext.Provider value={{ pendingHref, navigate }}>
      <Suspense fallback={null}>
        <RouteProgressWatcher onArrive={finish} />
      </Suspense>
      {bar !== 'off' && (
        <div
          className={`${styles.bar} ${bar === 'done' ? styles.barDone : ''}`}
          role="progressbar"
          aria-hidden="true"
        />
      )}
      {children}
    </RouteProgressContext.Provider>
  );
}

function RouteProgressWatcher({ onArrive }: { onArrive: (fullPath: string) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    onArrive(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search, onArrive]);

  return null;
}
