"use client";

import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  EditorRoot,
  type JSONContent,
} from "novel";
import { LinkSelector } from "@/components/create/selectors/link-selector";
import { NodeSelector } from "@/components/create/selectors/node-selector";
import { TextButtons } from "@/components/create/selectors/text-buttons";
import { suggestionItems } from "@/components/create/slash-command";
import { defaultExtensions } from "@/components/create/extensions";
import { ImageResizer, handleCommandNavigation } from "novel";
import { uploadFn } from "@/components/create/image-upload";
import { handleImageDrop, handleImagePaste } from "novel";
import EditorMenu from "@/components/create/editor-menu";
import { Separator } from "@/components/ui/separator";
import { useReducer } from "react";

const hljs = require("highlight.js");

const extensions = [...defaultExtensions];

export const defaultEditorContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [],
    },
  ],
};

interface EditorProps {
  initialValue?: JSONContent;
  onChange: (content: string) => void;
}

interface EditorState {
  openNode: boolean;
  openColor: boolean;
  openLink: boolean;
  openAI: boolean;
}

type EditorAction =
  | { type: "TOGGLE_NODE"; payload: boolean }
  | { type: "TOGGLE_COLOR"; payload: boolean }
  | { type: "TOGGLE_LINK"; payload: boolean }
  | { type: "TOGGLE_AI"; payload: boolean };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "TOGGLE_NODE":
      return { ...state, openNode: action.payload };
    case "TOGGLE_COLOR":
      return { ...state, openColor: action.payload };
    case "TOGGLE_LINK":
      return { ...state, openLink: action.payload };
    case "TOGGLE_AI":
      return { ...state, openAI: action.payload };
    default:
      return state;
  }
}

export default function Editor({ initialValue, onChange }: EditorProps) {
  const [state, dispatch] = useReducer(editorReducer, {
    openNode: false,
    openColor: false,
    openLink: false,
    openAI: false,
  });

  const { openNode, openColor, openLink, openAI } = state;

  return (
    <div className="relative w-full max-w-[220px] sm:max-w-[400px]">
      <EditorRoot>
        <EditorContent
          immediatelyRender={false}
          initialContent={initialValue}
          extensions={extensions}
          className="min-h-96 max-w-[220px] sm:max-w-[400px]"
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
            handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) =>
              handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class:
                "prose dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full",
            },
          }}
          onUpdate={({ editor }) => {
            onChange(editor.getHTML());
          }}
          slotAfter={<ImageResizer />}
        >
          <EditorCommand className="border-muted bg-background z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="text-muted-foreground px-2">
              No results
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={(val) => item.command?.(val)}
                  className="hover:bg-accent aria-selected:bg-accent flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-[10px]"
                  key={item.title}
                >
                  <div className="border-muted bg-background flex h-8 w-8 items-center justify-center rounded-md border">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-[8px]">{item.description}</p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          <EditorMenu
            open={openAI}
            onOpenChange={(open) => dispatch({ type: "TOGGLE_AI", payload: open })}
          >
            <Separator orientation="vertical" />
            <NodeSelector
              open={openNode}
              onOpenChange={(open) => dispatch({ type: "TOGGLE_NODE", payload: open })}
            />

            <Separator orientation="vertical" />
            <LinkSelector
              open={openLink}
              onOpenChange={(open) => dispatch({ type: "TOGGLE_LINK", payload: open })}
            />

            <Separator orientation="vertical" />
            <TextButtons />
          </EditorMenu>
        </EditorContent>
      </EditorRoot>
    </div>
  );
}
