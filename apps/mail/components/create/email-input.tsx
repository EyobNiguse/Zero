import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { X } from 'lucide-react';

interface EmailInputProps {
  type: 'to' | 'cc' | 'bcc';
  emails: string[];
  setEmails: (emails: string[]) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  filteredContacts: any[];
  isLoading: boolean;
  onAddEmail: (type: 'to' | 'cc' | 'bcc', email: string) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
}

export function EmailInput({
  type,
  emails,
  setEmails,
  inputValue,
  setInputValue,
  filteredContacts,
  isLoading,
  onAddEmail,
  hasUnsavedChanges,
  setHasUnsavedChanges,
}: EmailInputProps) {
  const t = useTranslations();
  const [selectedContactIndex, setSelectedContactIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEmailInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredContacts.length > 0) {
        const selectedEmail = filteredContacts[selectedContactIndex]?.email;
        if (selectedEmail) {
          onAddEmail(type, selectedEmail);
          setSelectedContactIndex(0);
        }
      } else {
        onAddEmail(type, inputValue);
      }
    } else if (e.key === 'ArrowDown' && filteredContacts.length > 0) {
      e.preventDefault();
      setSelectedContactIndex((prev) => Math.min(prev + 1, filteredContacts.length - 1));
    } else if (e.key === 'ArrowUp' && filteredContacts.length > 0) {
      e.preventDefault();
      setSelectedContactIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const removeEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  return (
    <div className="flex items-center">
      <div className="text-muted-foreground w-20 flex-shrink-0 pr-3 text-right text-[1rem] font-[600] opacity-50 md:w-24">
        {type === 'to' ? t('common.mailDisplay.to') : type.toUpperCase()}
      </div>
      <div className="group relative left-[2px] flex w-full flex-wrap items-center rounded-md border border-none bg-transparent p-1 transition-all focus-within:border-none focus:outline-none">
        {emails.map((email, index) => (
          <div
            key={index}
            className="bg-accent flex items-center gap-1 rounded-md border px-2 text-sm font-medium"
          >
            <span className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
              {email}
            </span>
            <button
              type="button"
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground ml-1 rounded-full"
              onClick={() => removeEmail(index)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            disabled={isLoading}
            type="text"
            className="text-md relative left-[3px] w-full min-w-[120px] bg-transparent placeholder:text-[#616161] placeholder:opacity-50 focus:outline-none"
            placeholder={emails.length ? '' : t('pages.createEmail.example')}
            value={inputValue}
            onChange={(e) => handleEmailInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {inputValue && filteredContacts.length > 0 && (
            <div
              ref={dropdownRef}
              className="bg-background absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border shadow-lg"
            >
              {filteredContacts.map((contact, index) => (
                <button
                  key={contact.email}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    selectedContactIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                  onClick={() => {
                    onAddEmail(type, contact.email);
                    setSelectedContactIndex(0);
                  }}
                >
                  <div className="font-medium">{contact.name || contact.email}</div>
                  {contact.name && (
                    <div className="text-muted-foreground text-xs">{contact.email}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
