'use client'

import { useState } from 'react'

import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  type EditorInstance,
  EditorRoot,
  type JSONContent
} from 'novel'

import { ImageResizer, handleCommandNavigation } from 'novel'
import { handleImageDrop, handleImagePaste } from 'novel'

import {
  suggestionItems
} from '@/components/create/slash-command'
import EditorMenu from '@/components/create/editor-menu'
import { uploadFn } from '@/components/create/image-upload'
import { defaultExtensions } from '@/components/create/extensions'
import { TextButtons } from '@/components/create/selectors/text-buttons'
import { LinkSelector } from '@/components/create/selectors/link-selector'
import { NodeSelector } from '@/components/create/selectors/node-selector'


import { Separator } from '@/components/ui/separator'

const hljs = require('highlight.js')

const extensions = [...defaultExtensions]

export const defaultEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: []
    }
  ]
}

interface EditorProps {
  initialValue?: JSONContent
  onChange: (content: string) => void
}

export default function Editor({ initialValue, onChange }: EditorProps) {
  const [openNode, setOpenNode] = useState(false)
  const [openColor, setOpenColor] = useState(false)
  const [openLink, setOpenLink] = useState(false)
  const [openAI, setOpenAI] = useState(false)

  return (
    <div className='relative w-full max-w-[220px] sm:max-w-[400px]'>
      <EditorRoot>
        <EditorContent
          immediatelyRender={false}
          initialContent={initialValue}
          extensions={extensions}
          className='min-h-96 max-w-[220px] sm:max-w-[400px]'
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event)
            },
            handlePaste: (view, event) =>
              handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) =>
              handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class:
                'prose dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full'
            }
          }}
          onUpdate={({ editor }) => {
            onChange(editor.getHTML())
          }}
          slotAfter={<ImageResizer />}
        >
          <EditorCommand className='z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all'>
            <EditorCommandEmpty className='px-2 text-muted-foreground'>
              No results
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map(item => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={val => item.command?.(val)}
                  className='flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-[10px] hover:bg-accent aria-selected:bg-accent'
                  key={item.title}
                >
                  <div className='flex h-8 w-8 items-center justify-center rounded-md border border-muted bg-background'>
                    {item.icon}
                  </div>
                  <div>
                    <p className='font-medium text-xs'>{item.title}</p>
                    <p className='text-[8px] text-muted-foreground'>
                      {item.description}
                    </p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          <EditorMenu open={openAI} onOpenChange={setOpenAI}>
            <Separator orientation='vertical' />
            <NodeSelector open={openNode} onOpenChange={setOpenNode} />

            <Separator orientation='vertical' />
            <LinkSelector open={openLink} onOpenChange={setOpenLink} />

            <Separator orientation='vertical' />
            <TextButtons />

          </EditorMenu>
        </EditorContent>
      </EditorRoot>
    </div>
  )
}
