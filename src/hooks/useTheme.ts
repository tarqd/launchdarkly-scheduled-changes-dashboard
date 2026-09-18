import { useCallback, useEffect, useState } from 'react';

export type Theme = 'default' | 'dark';

const STORAGE_KEY = 'ldsc:theme';

function initialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'default') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
}

/**
 * LaunchPad themes are driven by `data-theme` on an ancestor element, so the
 * toggle just writes that attribute on `<body>`.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'default' : 'dark'));
  }, []);

  return [theme, toggle];
}
