import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';
import './ghost-text.css';

export interface SenderInfo {
  name?: string;
}

export interface Suggestion {
  text: string;
  type: 'opener' | 'closer' | 'custom';
  score?: number;
}

export interface AutoCompleteOptions {
  suggestions: {
    openers?: string[];
    closers?: string[];
    custom?: string[];
  };
  sender?: SenderInfo;
  myInfo?: SenderInfo;
  maxSuggestions?: number;
  minChars?: number;
  debounceMs?: number;
}

// Fuzzy matching function
const fuzzyMatch = (str: string, pattern: string): number => {
  const strLower = str.toLowerCase();
  const patternLower = pattern.toLowerCase();
  
  if (strLower === patternLower) return 1;
  if (strLower.startsWith(patternLower)) return 0.8;
  
  let score = 0;
  let patternIndex = 0;
  
  for (let i = 0; i < strLower.length && patternIndex < patternLower.length; i++) {
    if (strLower[i] === patternLower[patternIndex]) {
      score += 1;
      patternIndex++;
    }
  }
  
  return score / patternLower.length;
};

export const AutoComplete = Extension.create<AutoCompleteOptions>({
  name: 'ghostText',

  addProseMirrorPlugins() {
    const key = new PluginKey('ghostText');
    const options = this.options;
    let selectedIndex = 0;
    let lastDebounceTime = 0;
    const DEBOUNCE_MS = options.debounceMs || 150;
    const MAX_SUGGESTIONS = options.maxSuggestions || 5;
    const MIN_CHARS = options.minChars || 3;

    const findMatchingSuggestions = (currentText: string, opts: AutoCompleteOptions): Suggestion[] => {
      if (!currentText || currentText.length < MIN_CHARS) return [];

      const now = Date.now();
      if (now - lastDebounceTime < DEBOUNCE_MS) return [];
      lastDebounceTime = now;

      if (opts.sender) {
        const { name } = opts.sender;
        if (name) {
          opts.suggestions.openers?.push(
            `Hello ${name},\n\n`,
            `Hi ${name},\n\n`,
            `Dear ${name},\n\n`,
            `Good morning ${name},\n\n`,
            `Good afternoon ${name},\n\n`,
            `Good evening ${name},\n\n`,
          );
        }
      }

      if (opts.myInfo) {
        const { name } = opts.myInfo;
        if (name) {
          opts.suggestions.closers?.push(
            `Best regards,\n${name}`,
            `Kind regards,\n${name}`,
            `Sincerely,\n${name}`,
            `Thanks,\n${name}`,
          );
        }
      }

      const allSuggestions: Suggestion[] = [
        ...(opts.suggestions.openers?.map(text => ({ text, type: 'opener' as const })) || []),
        ...(opts.suggestions.closers?.map(text => ({ text, type: 'closer' as const })) || []),
        ...(opts.suggestions.custom?.map(text => ({ text, type: 'custom' as const })) || []),
      ];

      return allSuggestions
        .map(suggestion => ({
          ...suggestion,
          score: fuzzyMatch(suggestion.text, currentText)
        }))
        .filter(suggestion => suggestion.score > 0.3)
        .sort((a, b) => b.score! - a.score!)
        .slice(0, MAX_SUGGESTIONS);
    };

    return [
      new Plugin({
        key,
        props: {
          handleKeyDown(view, event) {
            const { state } = view;
            const { selection } = state;
            if (!(selection instanceof TextSelection) || !selection.$cursor) {
              return false;
            }

            const pos = selection.$cursor.pos;
            const currentLine = state.doc.textBetween(
              state.doc.resolve(pos).start(),
              pos,
              '\n',
              '\0',
            );

            const suggestions = findMatchingSuggestions(currentLine, options);
            if (!suggestions.length) return false;

            // Handle keyboard navigation
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % suggestions.length;
              } else {
                selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
              }
              return true;
            }

            // Handle selection
            if (event.key === 'Tab' || event.key === 'Enter') {
              event.preventDefault();
              const suggestion = suggestions[selectedIndex];
              if (!suggestion) return false;

              const remainingText = suggestion.text.slice(currentLine.length);
              if (!remainingText) return false;

              view.dispatch(view.state.tr.insertText(remainingText, pos));
              selectedIndex = 0;
              return true;
            }

            return false;
          },
          decorations: (state) => {
            const { doc, selection } = state;
            const decorations: Decoration[] = [];

            if (!(selection instanceof TextSelection) || !selection.$cursor) {
              return DecorationSet.empty;
            }

            const pos = selection.$cursor.pos;
            const currentLine = doc.textBetween(doc.resolve(pos).start(), pos, '\n', '\0');

            const suggestions = findMatchingSuggestions(currentLine, options);
            if (!suggestions.length) return DecorationSet.empty;

            // Create suggestion panel
            const panel = document.createElement('div');
            panel.className = 'suggestion-panel';
            
            suggestions.forEach((suggestion, index) => {
              const item = document.createElement('div');
              item.className = `suggestion-item ${index === selectedIndex ? 'selected' : ''}`;
              item.textContent = suggestion.text;
              panel.appendChild(item);
            });

            // Create ghost text decoration
            const suggestion = suggestions[selectedIndex];
            if (!suggestion) return DecorationSet.empty;

            const remainingText = suggestion.text.slice(currentLine.length);
            const ghostText = Decoration.widget(pos, () => {
              const span = document.createElement('span');
              span.textContent = remainingText;
              span.className = 'ghost-text-suggestion';
              return span;
            });

            // Create panel decoration
            const panelDecoration = Decoration.widget(pos, () => panel);

            decorations.push(ghostText, panelDecoration);
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
