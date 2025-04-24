import {
  CurvedArrow,
  Lightning,
  MediumStack,
  ShortStack,
  LongStack,
  Smile,
  ThreeDots,
  X,
} from '../icons/icons';
import {
  Command,
  Paperclip,
  Plus,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import * as React from 'react';
import { cn } from '@/lib/utils';
import Editor from './editor';
import { JSONContent } from 'novel';
import { useMemo } from 'react';

interface EmailComposerProps {
  toEmails: string[];
  setToEmails: (emails: string[]) => void;
  toInput: string;
  setToInput: (input: string) => void;
  ccEmails: string[];
  setCcEmails: (emails: string[]) => void;
  ccInput: string;
  setCcInput: (input: string) => void;
  bccEmails: string[];
  setBccEmails: (emails: string[]) => void;
  bccInput: string;
  setBccInput: (input: string) => void;
  showCc: boolean;
  setShowCc: (show: boolean) => void;
  showBcc: boolean;
  setShowBcc: (show: boolean) => void;
  subjectInput: string;
  setSubjectInput: (subject: string) => void;
  messageContent: string;
  setMessageContent: (content: string) => void;
  messageLength: number;
  setMessageLength: (length: number) => void;
  attachments: File[];
  setAttachments: (files: File[]) => void;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  onSendEmail: () => void;
  className?: string;
}

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export function EmailComposer({
  toEmails,
  setToEmails,
  toInput,
  setToInput,
  ccEmails,
  setCcEmails,
  ccInput,
  setCcInput,
  bccEmails,
  setBccEmails,
  bccInput,
  setBccInput,
  showCc,
  setShowCc,
  showBcc,
  setShowBcc,
  subjectInput,
  setSubjectInput,
  messageContent,
  setMessageContent,
  messageLength,
  setMessageLength,
  attachments,
  setAttachments,
  isLoading,
  hasUnsavedChanges,
  setHasUnsavedChanges,
  onSendEmail,
  className,
}: EmailComposerProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setAttachments([...attachments, ...Array.from(files)]);
      setHasUnsavedChanges(true);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const editorContent = useMemo(() => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: messageContent ? [{ type: 'text', text: messageContent }] : [],
      },
    ],
  } as JSONContent), [messageContent]);

  return (
    <div className={cn("w-full max-w-[750px] rounded-lg bg-white p-0 py-0 dark:bg-[#1A1A1A]", className)}>
      <div className="border-b border-[#252525] pb-2">
        <div className="flex justify-between px-3 pt-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[#8C8C8C]">To:</p>
            <div className="flex flex-wrap items-center gap-2">
              {toEmails.map((email, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1 rounded-full border border-[#2B2B2B] px-1 py-0.5 pr-2"
                >
                  <span className="flex gap-1 py-0.5 text-sm text-black dark:text-white">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="rounded-full bg-[#FFFFFF] text-xs font-bold dark:bg-[#373737]">
                        {email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {email}
                  </span>
                  <button
                    onClick={() => setToEmails(toEmails.filter((_, i) => i !== index))}
                    className="text-white/50 hover:text-white/90"
                  >
                    <X className="mt-0.5 h-3.5 w-3.5 fill-black dark:fill-[#9A9A9A]" />
                  </button>
                </div>
              ))}
              <input
                className="h-6 flex-1 bg-transparent text-sm font-normal leading-normal text-black placeholder:text-[#797979] focus:outline-none dark:text-white"
                placeholder="Enter email"
                value={toInput}
                onChange={(e) => {
                  setToInput(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && toInput.trim()) {
                    e.preventDefault();
                    if (isValidEmail(toInput.trim())) {
                      setToEmails([...toEmails, toInput.trim()]);
                      setToInput('');
                      setHasUnsavedChanges(true);
                    } else {
                      toast.error('Please enter a valid email address');
                    }
                  } else if (e.key === 'Backspace' && !toInput && toEmails.length > 0) {
                    setToEmails(toEmails.slice(0, -1));
                    setHasUnsavedChanges(true);
                  }
                }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="text-sm font-medium text-[#8C8C8C] hover:text-[#A8A8A8]"
              onClick={() => setShowCc(!showCc)}
            >
              Cc
            </button>
            <button
              className="text-sm font-medium text-[#8C8C8C] hover:text-[#A8A8A8]"
              onClick={() => setShowBcc(!showBcc)}
            >
              Bcc
            </button>
          </div>
        </div>

        <div className={`flex flex-col gap-2 ${showCc || showBcc ? 'pt-2' : ''}`}>
          {/* CC Section */}
          {showCc && (
            <div className="flex items-center gap-2 px-3">
              <p className="text-sm font-medium text-[#8C8C8C]">Cc:</p>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {ccEmails.map((email, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1 rounded-full border border-[#2B2B2B] px-2 py-0.5"
                  >
                    <span className="flex gap-1 py-0.5 text-sm text-black dark:text-white">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="rounded-full bg-[#FFFFFF] text-xs font-bold dark:bg-[#373737]">
                          {email.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {email}
                    </span>
                    <button
                      onClick={() => setCcEmails(ccEmails.filter((_, i) => i !== index))}
                      className="text-white/50 hover:text-white/90"
                    >
                      <X className="mt-0.5 h-3.5 w-3.5 fill-black dark:fill-[#9A9A9A]" />
                    </button>
                  </div>
                ))}
                <input
                  className="h-6 flex-1 bg-transparent text-sm font-normal leading-normal text-black placeholder:text-[#797979] focus:outline-none dark:text-white"
                  placeholder="Enter email"
                  value={ccInput}
                  onChange={(e) => {
                    setCcInput(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ccInput.trim()) {
                      e.preventDefault();
                      if (isValidEmail(ccInput.trim())) {
                        setCcEmails([...ccEmails, ccInput.trim()]);
                        setCcInput('');
                        setHasUnsavedChanges(true);
                      } else {
                        toast.error('Please enter a valid email address');
                      }
                    } else if (e.key === 'Backspace' && !ccInput && ccEmails.length > 0) {
                      setCcEmails(ccEmails.slice(0, -1));
                      setHasUnsavedChanges(true);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* BCC Section */}
          {showBcc && (
            <div className="flex items-center gap-2 px-3">
              <p className="text-sm font-medium text-[#8C8C8C]">Bcc:</p>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {bccEmails.map((email, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1 rounded-full border border-[#2B2B2B] px-2 py-0.5"
                  >
                    <span className="flex gap-1 py-0.5 text-sm text-black dark:text-white">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="rounded-full bg-[#FFFFFF] text-xs font-bold dark:bg-[#373737]">
                          {email.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {email}
                    </span>
                    <button
                      onClick={() => setBccEmails(bccEmails.filter((_, i) => i !== index))}
                      className="text-white/50 hover:text-white/90"
                    >
                      <X className="mt-0.5 h-3.5 w-3.5 fill-black dark:fill-[#9A9A9A]" />
                    </button>
                  </div>
                ))}
                <input
                  className="h-6 flex-1 bg-transparent text-sm font-normal leading-normal text-black placeholder:text-[#797979] focus:outline-none dark:text-white"
                  placeholder="Enter email"
                  value={bccInput}
                  onChange={(e) => {
                    setBccInput(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && bccInput.trim()) {
                      e.preventDefault();
                      if (isValidEmail(bccInput.trim())) {
                        setBccEmails([...bccEmails, bccInput.trim()]);
                        setBccInput('');
                        setHasUnsavedChanges(true);
                      } else {
                        toast.error('Please enter a valid email address');
                      }
                    } else if (e.key === 'Backspace' && !bccInput && bccEmails.length > 0) {
                      setBccEmails(bccEmails.slice(0, -1));
                      setHasUnsavedChanges(true);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subject */}
      <div className="flex items-center gap-2 p-3">
        <p className="text-sm font-medium text-[#8C8C8C]">Subject:</p>
        <input
          className="h-4 w-full bg-transparent text-sm font-normal leading-normal text-white/90 placeholder:text-[#797979] focus:outline-none"
          placeholder="Re: Design review feedback"
          value={subjectInput}
          onChange={(e) => {
            setSubjectInput(e.target.value);
            setHasUnsavedChanges(true);
          }}
        />
      </div>

      {/* Message Content */}
      <div className="mb-6 flex flex-col items-start justify-start gap-2 self-stretch rounded-2xl bg-[#202020] px-4 py-3 outline-white/5">
        <div className="flex flex-col items-center justify-center gap-2.5 self-stretch">
          <div className="flex flex-col items-start justify-start gap-3 self-stretch">
            <Editor
              initialValue={editorContent}
              onChange={(content) => {
                // Extract plain text from the HTML content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = content;
                const plainText = tempDiv.textContent || tempDiv.innerText || '';
                
                setMessageContent(plainText);
                setMessageLength(plainText.length);
                setHasUnsavedChanges(true);
              }}
              className="w-full min-h-[200px]"
              placeholder="Write your email..."
              onCommandEnter={onSendEmail}
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="inline-flex items-center justify-between self-stretch">
          <div className="flex items-center justify-start gap-3">
            <div className="flex items-center justify-start">
              <button
                className="flex h-7 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-md bg-black pl-1.5 pr-1 dark:bg-white"
                onClick={onSendEmail}
                disabled={isLoading || !toEmails.length || !messageContent.trim() || !subjectInput.trim()}
              >
                <div className="flex items-center justify-center gap-2.5 pl-0.5">
                  <div className="text-center text-sm leading-none text-white dark:text-black">
                    Send now
                  </div>
                </div>
                <div className="flex h-5 items-center justify-center gap-1 rounded-sm bg-white/10 px-1 dark:bg-black/10">
                  <Command className="h-3.5 w-3.5 text-white dark:text-black" />
                  <CurvedArrow className="mt-1.5 h-4 w-4 fill-white dark:fill-black" />
                </div>
              </button>

              <button
                className="ml-3 flex h-7 items-center gap-0.5 overflow-hidden rounded-md bg-white/5 px-1.5 shadow-sm hover:bg-white/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-3 w-3 fill-[#9A9A9A]" />
                <span className="px-0.5 text-sm">Add files</span>
              </button>

              <Input
                type="file"
                id="attachment-input"
                className="hidden"
                onChange={handleAttachment}
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                ref={fileInputRef}
              />

              {attachments.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="ml-2 flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-sm hover:bg-white/10">
                      <Paperclip className="h-3 w-3 text-[#9A9A9A]" />
                      <span>{attachments.length} files</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 bg-[#202020] p-3" align="start">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white/90">Attachments</h4>
                      <div className="max-h-[200px] space-y-2 overflow-y-auto">
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between gap-2 rounded-md bg-white/5 p-2"
                          >
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-sm text-white/90">{file.name}</p>
                                <p className="text-xs text-[#9A9A9A]">
                                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeAttachment(index)}
                              className="rounded-sm p-1 hover:bg-white/10"
                            >
                              <X className="h-4 w-4 fill-[#9A9A9A]" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <div className="flex items-start justify-start gap-3">
            <button className="flex h-7 items-center gap-0.5 overflow-hidden rounded-md bg-white/5 px-1.5 shadow-sm hover:bg-white/10">
              <Smile className="h-3 w-3 fill-[#9A9A9A]" />
              <span className="px-0.5 text-sm">Casual</span>
            </button>
            <button className="flex h-7 items-center gap-0.5 overflow-hidden rounded-md bg-white/5 px-1.5 shadow-sm hover:bg-white/10">
              {messageLength < 50 && <ShortStack className="h-3 w-3 fill-[#9A9A9A]" />}
              {messageLength >= 50 && messageLength < 200 && (
                <MediumStack className="h-3 w-3 fill-[#9A9A9A]" />
              )}
              {messageLength >= 200 && <LongStack className="h-3 w-3 fill-[#9A9A9A]" />}
              <span className="px-0.5 text-sm">
                {messageLength < 50
                  ? 'short-length'
                  : messageLength < 200
                  ? 'medium-length'
                  : 'long-length'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 