'use client';

import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  EditorRoot,
  useEditor,
  type JSONContent,
} from 'novel';
import { useCurrentEditor, Extension, type Editor } from '@tiptap/react';
import { suggestionItems } from '@/components/create/slash-command';
import { defaultExtensions } from '@/components/create/extensions';
import { handleCommandNavigation } from 'novel';
import { handleImageDrop } from 'novel';
import EditorMenu from '@/components/create/editor-menu';
import { AutoComplete } from './editor-autocomplete';
import { cn } from '@/lib/utils';
import { TextSelection } from 'prosemirror-state';
import { useTranslations } from 'next-intl';
import { Markdown } from 'tiptap-markdown';
import { useReducer, useRef, useState, type ComponentProps, useEffect } from 'react';
import React from 'react';
import { debounce } from 'remeda';
import { useDebounceCallback } from 'usehooks-ts';

const DisableModEnter = Extension.create({
  name: 'disableModEnter',
  addKeyboardShortcuts: () => {
    return {
      'Mod-Enter': () => {
        return true
      }
    }
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
  value?: JSONContent;
  onChange: (content: string) => void;
  className?: string;
  placeholder?: string;
  onCommandEnter?: () => void;
}

export const NewEditor = ({
  value = defaultEditorContent,
  onBlur,
  onFocus,
  onKeydown,
  onMousedown,
  isReadOnly = false,
}: {
  value?: JSONContent
  onBlur?: ComponentProps<typeof EditorContent>['onBlur']
  onFocus?: ComponentProps<typeof EditorContent>['onFocus']
  onKeydown?: (event: KeyboardEvent) => void | Promise<void>
  onMousedown?: (event: MouseEvent) => void | Promise<void>
  isReadOnly?: boolean
}) => {
  const editorRef = useRef<Editor | null>(null)

  const debouncedSetCurrentValue = useDebounceCallback((editor: Editor) => {
    editor.commands.setContent(value)
  })

  useEffect(() => {
    if (editorRef.current) {
      debouncedSetCurrentValue(editorRef.current)
    }
  }, [
    value,
  ])

  return (
    <div>
      <EditorRoot>
        <EditorContent
          onCreate={({ editor }) => {
            editorRef.current = editor
          }}
          onUpdate={({ editor }) => {

          }}
          initialContent={debouncedSetCurrentValue}
          immediatelyRender={true}
          shouldRerenderOnTransaction={false}
          extensions={[
            ...defaultExtensions,
            Markdown,
            AutoCompleteExtension(), // TODO: add info
            DisableModEnter,
          ]}
          onFocus={isReadOnly ? undefined : onFocus}
          onBlur={isReadOnly ? undefined : onBlur}
          className="hide-scrollbar relative max-h-[150px] cursor-text overflow-auto"
          editorProps={{
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
            },
          }}
        />
      </EditorRoot>
    </div>
  )
}
