import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';
import './ghost-text.css';

export interface SenderInfo {
  name?: string;
}

export interface AutoCompleteOptions {
  suggestions: {
    openers?: string[];
    closers?: string[];
    custom?: string[];
  };
  sender?: SenderInfo;
  myInfo?: SenderInfo;
}

export const AutoComplete = Extension.create<AutoCompleteOptions>({
  name: 'ghostText',

  addProseMirrorPlugins() {
    const key = new PluginKey('ghostText');
    const options = this.options;

    const findMatchingSuggestions = (currentText: string, opts: AutoCompleteOptions) => {
      if (!currentText) return [];

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
          console.log(name);
          opts.suggestions.closers?.push(
            `Best regards,\n${name}`,
            `Kind regards,\n${name}`,
            `Sincerely,\n${name}`,
            `Thanks,\n${name}`,
          );
        }
      }

      const allSuggestions = [
        ...(opts.suggestions.openers || []),
        ...(opts.suggestions.closers || []),
        ...(opts.suggestions.custom || []),
      ];

      return allSuggestions
        .filter(
          (suggestion) =>
            suggestion.toLowerCase().startsWith(currentText.toLowerCase()) &&
            suggestion.length > currentText.length,
        )
        .sort((a, b) => a.length - b.length);
    };

    return [
      new Plugin({
        key,
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'Tab') return false;

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

            const suggestion = suggestions[0];
            if (!suggestion) return false;

            const remainingText = suggestion.slice(currentLine.length);
            if (!remainingText) return false;

            // Prevent default tab behavior
            event.preventDefault();

            // Insert the suggestion
            view.dispatch(view.state.tr.insertText(remainingText, pos));

            return true;
          },
          decorations: (state) => {
            const { doc, selection } = state;
            const decorations: Decoration[] = [];

            if (!(selection instanceof TextSelection) || !selection.$cursor) {
              return DecorationSet.empty;
            }

            const pos = selection.$cursor.pos;
            const currentLine = doc.textBetween(doc.resolve(pos).start(), pos, '\n', '\0');

            // Find matching suggestions using the local function
            const suggestions = findMatchingSuggestions(currentLine, options);
            if (!suggestions.length) return DecorationSet.empty;

            const suggestion = suggestions[0];
            if (!suggestion) return DecorationSet.empty;

            const remainingText = suggestion.slice(currentLine.length);

            // Create a decoration with shimmering effect
            const decoration = Decoration.widget(pos, () => {
              const span = document.createElement('span');
              span.textContent = remainingText;
              span.className = 'ghost-text-suggestion';
              return span;
            });

            decorations.push(decoration);
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
