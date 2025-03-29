import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';
import { EditorView } from '@tiptap/pm/view';
import './ghost-text.css';

export interface SenderInfo {
  name?: string;
  email?: string;
}

export interface AutoCompleteOptions {
  suggestions: {
    openers?: string[];
    closers?: string[];
    custom?: string[];
    commonPhrases?: string[];
    timeBased?: string[];
    contextBased?: string[];
  };
  sender?: SenderInfo;
  myInfo?: SenderInfo;
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    dayOfWeek?: string;
    previousEmails?: string[];
  };
  editor?: EditorView;
}

export const AutoComplete = Extension.create<AutoCompleteOptions>({
  name: 'ghostText',

  addProseMirrorPlugins() {
    const key = new PluginKey('ghostText');
    const options = this.options;

    // Track used suggestions to avoid repetition
    const usedSuggestions = new Set<string>();

    const findMatchingSuggestions = (currentText: string, opts: AutoCompleteOptions) => {
      if (!currentText) return [];

      // Get the full document text to check context
      const doc = opts.editor?.state.doc;
      const fullText = doc ? doc.textContent : '';

      // Time-based greetings
      const timeOfDay = opts.context?.timeOfDay;
      if (timeOfDay && opts.sender?.name) {
        const { name } = opts.sender;
        opts.suggestions.timeBased = [
          `Good ${timeOfDay} ${name},`,
          `I hope you're having a good ${timeOfDay} ${name},`,
          `Wishing you a wonderful ${timeOfDay} ${name},`,
        ];
      }

      // Context-based suggestions based on previous emails
      if (opts.context?.previousEmails?.length) {
        const lastEmail = opts.context.previousEmails[opts.context.previousEmails.length - 1];
        opts.suggestions.contextBased = [
          `Thank you for your email regarding ${lastEmail}.`,
          `I received your message about ${lastEmail}.`,
          `I understand your point about ${lastEmail}.`,
        ];
      }

      // Common email phrases
      opts.suggestions.commonPhrases = [
        `I hope this email finds you well.`,
        `I wanted to follow up on our previous conversation.`,
        `I'm writing to discuss...`,
        `I would like to schedule a meeting to discuss...`,
        `Please let me know if you have any questions.`,
        `I look forward to your response.`,
        `I appreciate your time and consideration.`,
        `I'm happy to help with anything else you need.`,
        `Please don't hesitate to reach out if you need any clarification.`,
        `I'll be in touch soon.`,
      ];

      // Sender-based greetings
      if (opts.sender) {
        const { name } = opts.sender;
        if (name) {
          opts.suggestions.openers?.push(
            `Hello ${name},`,
            `Hi ${name},`,
            `Dear ${name},`,
            `Good morning ${name},`,
            `Good afternoon ${name},`,
            `Good evening ${name},`,
            `I hope you're doing well ${name},`,
            `I trust this email finds you well ${name},`,
            `I hope you're having a great day ${name},`,
          );
        }
      }

      // My info-based closings
      if (opts.myInfo) {
        const { name } = opts.myInfo;
        if (name) {
          opts.suggestions.closers?.push(
            `Best regards,\n${name}`,
            `Kind regards,\n${name}`,
            `Sincerely,\n${name}`,
            `Thanks,\n${name}`,
            `Best wishes,\n${name}`,
            `Warm regards,\n${name}`,
            `Cheers,\n${name}`,
            `Take care,\n${name}`,
            `Looking forward to your response,\n${name}`,
            `I look forward to hearing from you,\n${name}`,
          );
        }
      }

      const allSuggestions = [
        ...(opts.suggestions.openers || []),
        ...(opts.suggestions.closers || []),
        ...(opts.suggestions.custom || []),
        ...(opts.suggestions.commonPhrases || []),
        ...(opts.suggestions.timeBased || []),
        ...(opts.suggestions.contextBased || []),
      ];

      return allSuggestions
        .filter((suggestion) => {
          // Check if the suggestion matches the current text
          const matchesCurrentText = suggestion.toLowerCase().startsWith(currentText.toLowerCase()) &&
            suggestion.length > currentText.length;

          // Check if the suggestion has already been used in the email
          const isAlreadyUsed = usedSuggestions.has(suggestion);

          // Check if a similar greeting is already in the email
          const isSimilarGreetingUsed = fullText.includes(suggestion.split(',')[0]);

          // Check if we're in the middle of the email (not at the start)
          const isInMiddleOfEmail = fullText.length > 100;

          // Filter out suggestions that:
          // 1. Don't match the current text
          // 2. Have already been used
          // 3. Are greetings and we're in the middle of the email
          // 4. Are similar to already used greetings
          return matchesCurrentText && 
                 !isAlreadyUsed && 
                 (!isInMiddleOfEmail || !suggestion.includes('Hello') && !suggestion.includes('Hi') && !suggestion.includes('Dear')) &&
                 !isSimilarGreetingUsed;
        })
        .sort((a, b) => {
          // Prioritize exact matches
          const aExactMatch = a.toLowerCase().startsWith(currentText.toLowerCase());
          const bExactMatch = b.toLowerCase().startsWith(currentText.toLowerCase());
          if (aExactMatch && !bExactMatch) return -1;
          if (!aExactMatch && bExactMatch) return 1;
          
          // Then sort by length
          return a.length - b.length;
        });
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

            const suggestions = findMatchingSuggestions(currentLine, {
              ...options,
              editor: view,
            });
            if (!suggestions.length) return false;

            const suggestion = suggestions[0];
            if (!suggestion) return false;

            const remainingText = suggestion.slice(currentLine.length);
            if (!remainingText) return false;

            // Prevent default tab behavior
            event.preventDefault();

            // Mark this suggestion as used
            usedSuggestions.add(suggestion);

            // Create a transaction that:
            // 1. Inserts the remaining text
            // 2. Sets the cursor to the end of the inserted text
            const tr = view.state.tr
              .insertText(remainingText, pos)
              .setSelection(TextSelection.create(
                view.state.doc,
                pos + remainingText.length
              ));

            // Apply the transaction
            view.dispatch(tr);

            return true;
          },
          decorations: (state, view) => {
            const { doc, selection } = state;
            const decorations: Decoration[] = [];

            if (!(selection instanceof TextSelection) || !selection.$cursor) {
              return DecorationSet.empty;
            }

            const pos = selection.$cursor.pos;
            const currentLine = doc.textBetween(doc.resolve(pos).start(), pos, '\n', '\0');

            // Find matching suggestions using the local function
            const suggestions = findMatchingSuggestions(currentLine, {
              ...options,
              editor: view,
            });
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
