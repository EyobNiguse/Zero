'use client';

import { Extension, EditorContent, type KeyboardShortcutCommand, useEditor, generateJSON } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { defaultExtensions } from '@/components/create/extensions';
import { AutoComplete } from './editor-autocomplete';
import { cn } from '@/lib/utils';
import { TextSelection } from 'prosemirror-state';
import { Markdown } from 'tiptap-markdown';
import { useEffect } from 'react';
import React from 'react';

const CustomModEnter = (onModEnter: KeyboardShortcutCommand) => {
  return Extension.create({
    name: 'handleModEnter',
    addKeyboardShortcuts: () => {
      return {
        'Mod-Enter': (props) => {
          return onModEnter(props)
        },
      }
    },
  })
}

const CustomModTab = (onTab: KeyboardShortcutCommand) => {
  return Extension.create({
    name: 'handleTab',
    addKeyboardShortcuts: () => {
      return {
        'Tab': (props) => {
          return onTab(props)
        },
      }
    },
  })
}

const MouseDownSelection = Extension.create({
  name: 'mouseDownSelection',
  addProseMirrorPlugins: () => {
    return [
      new Plugin({
        key: new PluginKey('mouseDownSelection'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const coords = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              if (coords) {
                const pos = coords.pos;
                const tr = view.state.tr;
                const selection = TextSelection.create(view.state.doc, pos);
                tr.setSelection(selection);
                view.dispatch(tr);
                view.focus();
              }

              return false
            }
          }
        }
      })
    ]
  }
})

const AutoCompleteExtension = ({
  sender,
  myInfo,
}: {
  sender?: {
    name?: string
    email?: string
  }
  myInfo?: {
    name?: string
    email?: string
  }
} = {}) => {
  return AutoComplete.configure({
    suggestions: {
      openers: [
        'Hi there,',
        'Hello,',
        'Dear',
        'Greetings,',
        'Good morning,',
        'Good afternoon,',
        'Good evening,',
      ],
      closers: [
        'Best regards,',
        'Kind regards,',
        'Sincerely,',
        'Thanks,',
        'Thank you,',
        'Cheers,',
      ],
      custom: [
        'I hope this email finds you well.',
        'I look forward to hearing from you.',
        'Please let me know if you have any questions.',
      ],
    },
    sender,
    myInfo,
  })
}

export const defaultEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [],
    },
  ],
};

interface EditorProps {
  value?: Record<string, unknown>;
  onChange: (content: string) => void;
  className?: string;
  placeholder?: string;
  onCommandEnter?: () => void;
}

export const NewEditor = ({
  value = defaultEditorContent,
  isReadOnly = false,
  placeholder = 'Start your email here',
  // Events
  onChange,
  onAttachmentsChange,
  onLengthChange,
  onBlur,
  onFocus,
  onKeydown,
  onMousedown,
  // Keyboard Shortcuts
  onModEnter,
  onTab,
  // State Information
  myInfo,
  sender,
}: {
  value?: Record<string, unknown> | null
  isReadOnly?: boolean
  placeholder?: string
  // Events
  onChange?: (content: Record<string, unknown>) => void | Promise<void>
  onAttachmentsChange?: (attachments: File[]) => void | Promise<void>
  onLengthChange?: (length: number) => void | Promise<void>
  onBlur?: NonNullable<Parameters<typeof useEditor>[0]>['onBlur']
  onFocus?: NonNullable<Parameters<typeof useEditor>[0]>['onFocus']
  onKeydown?: (event: KeyboardEvent) => void | Promise<void>
  onMousedown?: (event: MouseEvent) => void | Promise<void>
  // Keyboard Shortcuts
  onModEnter?: KeyboardShortcutCommand
  onTab?: KeyboardShortcutCommand
  // State Information
  myInfo?: {
    name?: string;
    email?: string;
  }
  sender?: {
    name?: string;
    email?: string;
  }
}) => {
  const editor = useEditor({
    editable: !isReadOnly,
    onUpdate: ({ editor }) => {
      void onChange?.(editor.getJSON())
    },
    content: value ?? defaultEditorContent,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      ...defaultExtensions,
      Markdown,
      AutoCompleteExtension({
        myInfo,
        sender,
      }),
      ...onModEnter ? [
        CustomModEnter((props) => {
          return onModEnter(props)
        })
      ] : [],
      ...onTab ? [
        CustomModTab((props) => {
          return onTab(props)
        })
      ] : [],
      ...isReadOnly ? [] : [
        MouseDownSelection,
      ],
    ],
    onFocus: isReadOnly ? undefined : onFocus,
    onBlur: isReadOnly ? undefined : onBlur,
    editorProps: {
      attributes: {
        class: cn(
          'prose dark:prose-invert prose-headings:font-title focus:outline-none max-w-full min-h-[200px]',
          isReadOnly && 'pointer-events-none select-text',
        ),
        'data-placeholder': placeholder,
      },
      handleDOMEvents: {
        mousedown: (_, event) => {
          if (onMousedown && !isReadOnly) {
            void onMousedown(event)
          }

          return false
        },
        keydown: (_, event) => {
          if (onKeydown && !isReadOnly) {
            void onKeydown(event)
          }

          return false
        },
      }
    }
  })

  useEffect(() => {

  }, [])

  return (
    <div>
      <EditorContent
        className="hide-scrollbar relative max-h-[150px] cursor-text overflow-auto"
        editor={editor}
      />
    </div>
  )
}
