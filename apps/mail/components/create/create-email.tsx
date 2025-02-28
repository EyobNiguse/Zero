"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compressText, decompressText, truncateFileName } from "@/lib/utils";
import { ArrowUpIcon, Paperclip, Plus } from "lucide-react";
import { UploadedFileIcon } from "./uploaded-file-icon";
import { Separator } from "@/components/ui/separator";
import { SidebarToggle } from "../ui/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { sendEmail } from "@/actions/send";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import * as React from "react";
import Editor from "./editor";
import "./prosemirror.css";

const MAX_VISIBLE_ATTACHMENTS = 12;

export const defaultValue = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [],
    },
  ],
};

// Define the state interface
interface EmailState {
  toInput: string;
  subjectInput: string;
  attachments: File[];
  resetEditorKey: number;
  isAISidebarOpen: boolean;
}

// Define the action types
type EmailAction =
  | { type: "SET_TO_INPUT"; payload: string }
  | { type: "SET_SUBJECT_INPUT"; payload: string }
  | { type: "SET_ATTACHMENTS"; payload: File[] }
  | { type: "ADD_ATTACHMENTS"; payload: File[] }
  | { type: "REMOVE_ATTACHMENT"; payload: number }
  | { type: "RESET_EDITOR" }
  | { type: "TOGGLE_AI_SIDEBAR"; payload: boolean }
  | { type: "RESET_FORM" };

// Create the reducer function
function emailReducer(state: EmailState, action: EmailAction): EmailState {
  switch (action.type) {
    case "SET_TO_INPUT":
      return { ...state, toInput: action.payload };
    case "SET_SUBJECT_INPUT":
      return { ...state, subjectInput: action.payload };
    case "SET_ATTACHMENTS":
      return { ...state, attachments: action.payload };
    case "ADD_ATTACHMENTS":
      return { ...state, attachments: [...state.attachments, ...action.payload] };
    case "REMOVE_ATTACHMENT":
      return {
        ...state,
        attachments: state.attachments.filter((_, i) => i !== action.payload),
      };
    case "RESET_EDITOR":
      return { ...state, resetEditorKey: state.resetEditorKey + 1 };
    case "TOGGLE_AI_SIDEBAR":
      return { ...state, isAISidebarOpen: action.payload };
    case "RESET_FORM":
      return {
        ...state,
        toInput: "",
        subjectInput: "",
        attachments: [],
        resetEditorKey: state.resetEditorKey + 1,
      };
    default:
      return state;
  }
}

export function CreateEmail() {
  const [state, dispatch] = React.useReducer(emailReducer, {
    toInput: "",
    subjectInput: "",
    attachments: [],
    resetEditorKey: 0,
    isAISidebarOpen: false,
  });

  const { toInput, subjectInput, attachments, resetEditorKey, isAISidebarOpen } = state;

  const [messageContent, setMessageContent] = useQueryState("body", {
    defaultValue: "",
    parse: (value) => decompressText(value),
    serialize: (value) => compressText(value),
  });

  const hasHiddenAttachments = attachments.length > MAX_VISIBLE_ATTACHMENTS;

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      dispatch({ type: "ADD_ATTACHMENTS", payload: Array.from(e.target.files) });
    }
  };

  const removeAttachment = (index: number) => {
    dispatch({ type: "REMOVE_ATTACHMENT", payload: index });
  };

  const handleSendEmail = async () => {
    // Validate required fields before sending
    if (!toInput.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }

    if (!subjectInput.trim()) {
      toast.error("Please enter a subject");
      return;
    }

    if (!messageContent || messageContent.trim() === "") {
      toast.error("Please enter a message");
      return;
    }

    try {
      await sendEmail({
        to: toInput,
        subject: subjectInput,
        message: messageContent,
        attachments: attachments,
      });

      // Reset form after sending
      dispatch({ type: "RESET_FORM" });
      setMessageContent("");

      toast.success("Email sent successfully!");
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email. Please try again.");
    }
  };

  return (
    <div className="bg-offsetLight dark:bg-offsetDark flex h-full flex-col overflow-hidden shadow-inner md:rounded-2xl md:border md:shadow-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-1.5 p-2 transition-colors">
        <SidebarToggle className="h-fit px-2" />
      </div>

      <div className="relative flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[500px] space-y-12 px-4 pt-4 md:px-2">
            <div className="space-y-3 md:px-1">
              <div className="flex items-center pb-2">
                <div className="text-muted-foreground w-24 flex-shrink-0 pr-3 text-right text-[1rem] font-[600] opacity-50">
                  To
                </div>
                <input
                  type="email"
                  className="placeholder:text-muted-foreground text-md relative left-[6px] w-full bg-transparent font-medium placeholder:opacity-50 focus:outline-none"
                  placeholder="luke@example.com"
                  value={toInput}
                  onChange={(e) => dispatch({ type: "SET_TO_INPUT", payload: e.target.value })}
                />
              </div>

              <div className="flex items-center">
                <div className="text-muted-foreground w-24 flex-shrink-0 pr-3 text-right text-[1rem] font-[600] opacity-50">
                  Subject
                </div>
                <input
                  type="text"
                  className="placeholder:text-muted-foreground text-md relative left-[6px] w-full bg-transparent font-medium placeholder:opacity-50 focus:outline-none"
                  placeholder="Subject"
                  value={subjectInput}
                  onChange={(e) => dispatch({ type: "SET_SUBJECT_INPUT", payload: e.target.value })}
                />
              </div>

              <div className="flex">
                <div className="text-muted-foreground text-md relative -top-[1px] w-24 flex-shrink-0 pr-3 pt-2 text-right font-[600] opacity-50">
                  Body
                </div>
                <div className="w-full">
                  <Editor
                    initialValue={defaultValue}
                    onChange={(newContent) => setMessageContent(newContent)}
                    key={resetEditorKey}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-offsetLight dark:bg-offsetDark sticky bottom-0 left-0 right-0 flex items-center justify-between p-4 pb-6">
          <div>
            {attachments.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    <span>
                      {attachments.length} attachment{attachments.length !== 1 ? "s" : ""}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 touch-auto" align="start">
                  <div className="space-y-2">
                    <div className="px-1">
                      <h4 className="font-medium leading-none">Attachments</h4>
                      <p className="text-muted-foreground text-sm">
                        {attachments.length} file{attachments.length !== 1 ? "s" : ""} attached
                      </p>
                    </div>
                    <Separator />
                    <div className="h-[300px] touch-auto overflow-y-auto overscroll-contain px-1 py-1">
                      <div className="grid grid-cols-2 gap-2">
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="group relative overflow-hidden rounded-md border"
                          >
                            <UploadedFileIcon
                              removeAttachment={removeAttachment}
                              index={index}
                              file={file}
                            />
                            <div className="bg-muted/10 p-2">
                              <p className="text-xs font-medium">
                                {truncateFileName(file.name, 20)}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {(file.size / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              className="group relative w-9 overflow-hidden transition-all duration-200 hover:w-32"
              onClick={() => document?.getElementById("file-upload")?.click()}
            >
              <Plus className="absolute left-[9px] h-6 w-6" />
              <span className="whitespace-nowrap pl-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Attachments
              </span>
            </Button>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              multiple
              onChange={handleAttachment}
            />
            <Button
              variant="default"
              className="group relative w-9 overflow-hidden transition-all duration-200 hover:w-24"
              onClick={handleSendEmail}
              disabled={
                !toInput.trim() ||
                !messageContent.trim() ||
                messageContent === JSON.stringify(defaultValue)
              }
            >
              <ArrowUpIcon className="absolute left-2.5 h-4 w-4" />
              <span className="whitespace-nowrap pl-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Send
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
