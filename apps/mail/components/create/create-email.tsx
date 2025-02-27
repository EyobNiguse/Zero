"use client";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn, compressText, decompressText, truncateFileName } from "@/lib/utils";
import { Send, Paperclip, X, ArrowUpIcon } from "lucide-react";
import { SparklesIcon } from "../icons/animated/sparkles";
import { SidebarToggle } from "../ui/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { sendEmail } from "@/actions/send";
import { useQueryState } from "nuqs";
import { Badge } from "../ui/badge";
import { AIChat } from "./ai-chat";
import { toast } from "sonner";
import * as React from "react";
import Editor from "./editor";
import "./prosemirror.css";

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
      setResetEditorKey((prev) => prev + 1); // Force editor to re-render

      toast.success("Email sent successfully!");
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email. Please try again.");
    }
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="rounded-inherit h-[calc(100vh-2rem)] gap-1.5 overflow-hidden"
    >
      <ResizablePanel defaultSize={75} minSize={30} className="h-full border-none !bg-transparent">
        <div className="bg-offsetLight dark:bg-offsetDark flex h-full flex-col overflow-y-auto shadow-inner md:rounded-2xl md:border md:shadow-sm">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-1.5 p-2 transition-colors">
            <SidebarToggle className="h-fit px-2" />
            <Button
              variant="ghost"
              size="icon"
              className="md:h-fit md:px-2"
              onClick={() => setIsAISidebarOpen(!isAISidebarOpen)}
            >
              <SparklesIcon />
            </Button>
          </div>

          <div className="relative mx-auto w-full max-w-[500px] h-full flex-1 pt-4 mt-44 px-4 md:px-0">
            <div className="space-y-6 md:px-1">
              <div className="flex items-center">
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

              {attachments.length > 0 && (
                <div className="flex">
                  <div className="w-24 flex-shrink-0"></div>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file, index) => (
                      <Badge key={index} variant="secondary">
                        {truncateFileName(file.name)}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mr-1 ml-2 h-5 w-5 rounded-full p-0"
                          onClick={() => removeAttachment(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-offsetLight dark:bg-offsetDark left-4 right-4 border-t pt-4">
              <div className="flex justify-end gap-4">
                <label className="group relative">
                  <Button
                    variant="outline"
                    className="relative w-9 overflow-hidden transition-all duration-200 group-hover:w-32"
                  >
                    <Paperclip className="absolute left-2.5 h-4 w-4" />
                    <span className="whitespace-nowrap pl-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      Attachments
                    </span>
                  </Button>
                  <input type="file" className="hidden" multiple onChange={handleAttachment} />
                </label>
                <Button
                  variant="default"
                  className="group relative w-9 overflow-hidden transition-all duration-200 hover:w-24"
                  onClick={handleSendEmail}
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
      </ResizablePanel>

      {isAISidebarOpen && (
        <>
          <ResizableHandle className="md:opacity-0" />
          <ResizablePanel
            defaultSize={40}
            minSize={30}
            className="shadow-sm md:rounded-2xl md:border md:shadow-sm"
          >
            <div className="bg-offsetLight dark:bg-offsetDark flex h-full flex-col overflow-y-auto shadow-inner md:shadow-sm">
              <div className="flex h-full flex-col justify-between">
                <div className="p-2 px-3">
                  <div className="mb-4 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:h-fit md:p-2"
                      onClick={() => setIsAISidebarOpen(false)}
                    >
                      <X size={20} />
                    </Button>
                  </div>
                </div>
                <div>
                  <AIChat />
                </div>
              </div>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
