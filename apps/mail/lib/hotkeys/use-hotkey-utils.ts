import { useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Shortcut, keyboardShortcuts } from '@/config/shortcuts';

export const findShortcut = (action: string) => keyboardShortcuts.find(sc => sc.action === action);

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
  return keys.map(key => {
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
  options: Partial<HotkeyOptions> = {}
) {
  const { scope, preventDefault, ...restOptions } = {
    ...defaultHotkeyOptions,
    ...options,
    ...shortcut,
  };

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (shortcut.preventDefault || preventDefault) {
        event.preventDefault();
      }
      callback();
    },
    [callback, preventDefault]
  );

  useHotkeys(
    formatKeys(shortcut.keys),
    handleKey,
    {
      ...restOptions,
      scopes: [scope],
      preventDefault: shortcut.preventDefault || preventDefault,
    },
    [handleKey]
  );
}

export function useShortcuts(
  shortcuts: Shortcut[],
  handlers: { [key: string]: () => void },
  options: Partial<HotkeyOptions> = {}
) {
  shortcuts.forEach(shortcut => {
    const handler = handlers[shortcut.action];
    if (handler) {
      useShortcut(shortcut, handler, options);
    }
  });
} 