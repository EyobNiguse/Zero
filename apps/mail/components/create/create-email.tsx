"use client";
import { SidebarToggle } from "../ui/sidebar-toggle";
import { MailCompose } from "../mail/mail-compose";
import ResponsiveModal from "../responsive-modal";
import { MailEditor } from "./editor";
import { sendEmail } from "@/actions/send";
import { toast } from "sonner";
import { Send, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "../ui/badge";
import { compressText, decompressText, truncateFileName } from "@/lib/utils";
import { useQueryState } from "nuqs";
import * as React from "react";

export function CreateEmail() {
  const [toInput, setToInput] = React.useState("");
  const [subjectInput, setSubjectInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [resetEditorKey, setResetEditorKey] = React.useState(0);

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
      setResetEditorKey(prev => prev + 1); // Force editor to re-render
      
      toast.success("Email sent successfully!");
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email. Please try again.");
    }
  };

  return (
    <div className="bg-offsetLight dark:bg-offsetDark h-full min-h-[500px] flex-1 flex-col overflow-y-auto shadow-inner md:flex md:rounded-2xl md:border md:shadow-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-1.5 p-2 transition-colors">
        <SidebarToggle className="h-fit px-2" />
      </div>
      <div className="mx-auto relative left-14 pt-4">
        <div className="space-y-6">
          <div className="flex items-center">
            <div className="text-muted-foreground w-24 flex-shrink-0 font-medium text-sm opacity-50 text-right pr-3">To</div>
            <input
              type="email"
              className="placeholder:text-muted-foreground placeholder:opacity-50 w-full bg-transparent text-base focus:outline-none"
              placeholder="name@example.com"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
            />
          </div>

          <div className="flex items-center">
            <div className="text-muted-foreground w-24 flex-shrink-0 font-medium text-sm opacity-50 text-right pr-3">Subject</div>
            <input
              type="text"
              className="placeholder:text-muted-foreground placeholder:opacity-50 w-full bg-transparent text-md font-medium focus:outline-none"
              placeholder="Subject"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
            />
          </div>

          <div className="flex">
            <div className="text-muted-foreground w-24 flex-shrink-0 font-medium text-sm opacity-50 text-right pr-3 pt-2">Body</div>
            <div className="w-full">
              <MailEditor 
                key={resetEditorKey}
                content={messageContent} 
                onUpdate={(html) => setMessageContent(html)} 
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

          <div className="flex pt-4">
            <div className="w-24 flex-shrink-0"></div>
            <div className="flex gap-4">
              <label>
                <Button variant="outline">
                  <Paperclip className="mr-2 h-4 w-4" />
                  Attach files
                </Button>
                <input type="file" className="hidden" multiple onChange={handleAttachment} />
              </label>
              <Button onClick={handleSendEmail}>
                Send
                <Send className="ml-2 h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
