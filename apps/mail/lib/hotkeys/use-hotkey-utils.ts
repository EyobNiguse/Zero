'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Shortcut, keyboardShortcuts } from '@/config/shortcuts';
import { useHotkeys } from 'react-hotkeys-hook';
import { hotkeysDB } from './hotkeys-db';

export const findShortcut = async (action: string): Promise<Shortcut | undefined> => {
  const savedShortcut = await hotkeysDB.getHotkey(action);
  if (savedShortcut) return savedShortcut;

  return keyboardShortcuts.find((sc) => sc.action === action);
};

const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export const formatKeys = (keys: string[] | undefined): string => {
  if (!keys || !keys.length) return '';

  const mapKey = (key: string) => {
    switch (key) {
      case 'mod':
        return isMac ? 'meta' : 'control';
      case '⌘':
        return 'meta';
      case '#':
        return 'shift+3';
      case '!':
        return 'shift+1';
      default:
        return key;
    }
  };

  if (keys.length > 1) {
    return keys.map(mapKey).join('+');
  }

  const firstKey = keys[0];
  if (!firstKey) return '';
  return mapKey(firstKey);
};

export const formatDisplayKeys = (keys: string[]): string[] => {
  return keys.map((key) => {
    switch (key) {
      case 'mod':
        return isMac ? '⌘' : 'Ctrl';
      case 'meta':
        return '⌘';
      case 'control':
        return 'Ctrl';
      case 'shift':
        return '⇧';
      case 'alt':
        return isMac ? '⌥' : 'Alt';
      case 'enter':
        return '↵';
      case 'escape':
        return 'Esc';
      case 'backspace':
        return '⌫';
      case 'delete':
        return '⌦';
      case 'space':
        return 'Space';
      default:
        return key.length === 1 ? key.toUpperCase() : key;
    }
  });
};

export type HotkeyOptions = {
  scope: string;
  preventDefault?: boolean;
  keydown?: boolean;
  keyup?: boolean;
};

export const defaultHotkeyOptions: HotkeyOptions = {
  scope: 'global',
  preventDefault: false,
  keydown: true,
  keyup: false,
};

export function useShortcut(
  shortcut: Shortcut,
  callback: () => void,
  options: Partial<HotkeyOptions> = {},
) {
  const [currentShortcut, setCurrentShortcut] = useState<Shortcut>(shortcut);

  useEffect(() => {
    hotkeysDB.saveHotkey(shortcut).catch(console.error);

    hotkeysDB
      .getHotkey(shortcut.action)
      .then((saved) => {
        if (saved && saved.keys !== shortcut.keys) {
          setCurrentShortcut(saved);
        }
      })
      .catch(console.error);
  }, [shortcut]);

  const { scope, preventDefault, ...restOptions } = {
    ...defaultHotkeyOptions,
    ...options,
    ...currentShortcut,
  };

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (currentShortcut.preventDefault || preventDefault) {
        event.preventDefault();
      }
      callback();
    },
    [callback, preventDefault, currentShortcut],
  );

  useHotkeys(
    formatKeys(currentShortcut.keys),
    handleKey,
    {
      ...restOptions,
      scopes: [scope],
      preventDefault: shortcut.preventDefault || preventDefault,
    },
    [handleKey],
  );
}

export function useShortcuts(
  shortcuts: Shortcut[],
  handlers: { [key: string]: () => void },
  options: Partial<HotkeyOptions> = {},
) {
  const shortcutMap = useMemo(() => {
    return shortcuts.reduce<Record<string, Shortcut>>((acc, shortcut) => {
      if (handlers[shortcut.action]) {
        acc[shortcut.action] = shortcut;
      }
      return acc;
    }, {});
  }, [shortcuts]);

  const shortcutString = useMemo(() => {
    return Object.entries(shortcutMap)
      .map(([action, shortcut]) => {
        if (handlers[action]) {
          return formatKeys(shortcut.keys);
        }
        return null;
      })
      .filter(Boolean)
      .join(',');
  }, [shortcutMap, handlers]);

  console.log('GETTING SETTING SHORTCUTS');

  useHotkeys(
    shortcutString,
    (event: KeyboardEvent, hotkeysEvent) => {
      const pressedKeys = hotkeysEvent.keys?.join('+') || '';
      const matchingEntry = Object.entries(shortcutMap).find(
        ([_, shortcut]) => formatKeys(shortcut.keys) === pressedKeys,
      );

      if (matchingEntry) {
        const [action, shortcut] = matchingEntry;
        const handlerFn = handlers[action];
        if (handlerFn) {
          if (shortcut.preventDefault || options.preventDefault) {
            event.preventDefault();
          }
          handlerFn();
        }
      }
    },
    {
      ...options,
      scopes: options.scope ? [options.scope] : undefined,
      preventDefault: false, // We'll handle preventDefault per-shortcut
      keyup: false,
      keydown: true,
    },
    [shortcutMap, handlers, options],
  );
}
