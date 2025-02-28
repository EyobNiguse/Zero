"use client";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, compressText, decompressText, truncateFileName } from "@/lib/utils";
import { Send, Paperclip, X, ArrowUpIcon, Plus } from "lucide-react";
import { SparklesIcon } from "../icons/animated/sparkles";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Separator } from "@/components/ui/separator";
import { SidebarToggle } from "../ui/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { sendEmail } from "@/actions/send";
import { FileIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { AIChat } from "./ai-chat";
import Image from "next/image";
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

export function CreateEmail() {
  const [toInput, setToInput] = React.useState("");
  const [subjectInput, setSubjectInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [resetEditorKey, setResetEditorKey] = React.useState(0);
  const [isAISidebarOpen, setIsAISidebarOpen] = React.useState(false);

  const [messageContent, setMessageContent] = useQueryState("body", {
    defaultValue: "",
    parse: (value) => decompressText(value),
    serialize: (value) => compressText(value),
  });

  const hasHiddenAttachments = attachments.length > MAX_VISIBLE_ATTACHMENTS;

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments([...attachments, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
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
      setToInput("");
      setSubjectInput("");
      setMessageContent("");
      setAttachments([]);
      setResetEditorKey((prev) => prev + 1);

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
                  onChange={(e) => setToInput(e.target.value)}
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
                  onChange={(e) => setSubjectInput(e.target.value)}
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
                            <div className="relative h-24 w-full">
                              {file.type.startsWith("image/") ? (
                                <>
                                  <Image
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                    fill
                                    className="object-cover"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1 h-6 w-6 bg-black/20 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/30 group-hover:opacity-100"
                                    onClick={() => removeAttachment(index)}
                                  >
                                    <X className="h-3 w-3 text-white" />
                                  </Button>
                                </>
                              ) : (
                                <div className="bg-muted/20 flex h-full w-full items-center justify-center">
                                  <FileIcon className="text-primary h-8 w-8" />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                                    onClick={() => removeAttachment(index)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
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
