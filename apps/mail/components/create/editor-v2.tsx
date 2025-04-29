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
import { Extension, type Editor, type KeyboardShortcutCommand } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { defaultExtensions } from '@/components/create/extensions';
import { handleImageDrop } from 'novel';
import { AutoComplete } from './editor-autocomplete';
import { cn } from '@/lib/utils';
import { TextSelection } from 'prosemirror-state';
import { Markdown } from 'tiptap-markdown';
import { useRef, type ComponentProps, type RefObject, useImperativeHandle } from 'react';
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
  value?: JSONContent;
  onChange: (content: string) => void;
  className?: string;
  placeholder?: string;
  onCommandEnter?: () => void;
}

export const NewEditor = ({
  ref,
  initialValue = defaultEditorContent,
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
  ref?: RefObject<Editor | null>
  initialValue?: JSONContent
  isReadOnly?: boolean
  placeholder?: string
  // Events
  onChange?: (content: JSONContent) => void | Promise<void>
  onAttachmentsChange?: (attachments: File[]) => void | Promise<void>
  onLengthChange?: (length: number) => void | Promise<void>
  onBlur?: ComponentProps<typeof EditorContent>['onBlur']
  onFocus?: ComponentProps<typeof EditorContent>['onFocus']
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
  console.log('isReadOnly', isReadOnly)

  const editorRef = useRef<Editor | null>(null)

  useImperativeHandle(ref, () => {
    if (!editorRef.current) {
      return {} as Editor
    }

    return editorRef.current
  }, [
    editorRef.current,
  ])

  return (
    <div>
      <EditorRoot>
        <EditorContent
          editable={!isReadOnly}
          onCreate={({ editor }) => {
            editorRef.current = editor
          }}
          onUpdate={({ editor }) => {
            console.log('UPDATED')
            if (onChange) {
              void onChange(editor.getJSON())
            }

            if (onLengthChange) {
              void onLengthChange(editor.getText().length)
            }
          }}
          onDestroy={() => {
            editorRef.current = null
          }}
          initialContent={initialValue}
          immediatelyRender={true}
          shouldRerenderOnTransaction={false}
          extensions={[
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
          ]}
          onFocus={isReadOnly ? undefined : onFocus}
          onBlur={isReadOnly ? undefined : onBlur}
          className="hide-scrollbar relative max-h-[150px] cursor-text overflow-auto"
          editorProps={{
            attributes: {
              class: cn(
                'prose dark:prose-invert prose-headings:font-title focus:outline-none max-w-full min-h-[200px]',
                isReadOnly && 'pointer-events-none select-text',
              ),
              'data-placeholder': placeholder,
            },
            handleDrop: isReadOnly ? undefined : (view, event, _slide, moved) => {
              return handleImageDrop(view, event, moved, (file) => {
                if (onAttachmentsChange) {
                  void onAttachmentsChange([
                    file,
                  ])
                }
              })
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
            },
          }}
        >

        </EditorContent>
      </EditorRoot>
    </div>
  )
}
