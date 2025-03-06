import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, SlidersHorizontal, CalendarIcon, Trash2, Tag, Bell, AlertTriangle, User, Mail, MailQuestion, UserRound, Users, Star, MailCheck, Paperclip, X } from "lucide-react";
import { useSearchValue } from "@/hooks/use-search-value";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { type DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useDebounce } from "react-use";
import { Toggle } from "../ui/toggle";
import { format } from "date-fns";
import { cn, extractFilterValue, type FilterSuggestion } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import React from "react";


const getFilterSuggestionGridColumns = (
  count: number,
  isMobile: boolean
): string => {
  if (count <= 0) return "grid-cols-1";
  
  if (isMobile) {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    return "grid-cols-3";
  }
  
  if (count <= 4) return `grid-cols-${count}`;
  return count <= 8 ? "grid-cols-4" : "grid-cols-6";
};

const matchFilterPrefix = (text: string): [string, string, string] | null => {
  const match = /(is|has|from|to|after|before):([^\s]*)$/.exec(text);
  if (!match || !match[1]) return null;
  
  return [match[0], match[1], match[2] || ''];
};

const filterSuggestionsFunction = (
  suggestions: FilterSuggestion[],
  prefix: string,
  query: string
): FilterSuggestion[] => {
  if (!suggestions?.length) return [];
  
  if (prefix === 'from' || prefix === 'to') {
    if (!query) {
      return suggestions.filter(
        suggestion => suggestion.prefix === prefix
      );
    }
    
    if (query && query !== 'me') {
      return [{
        prefix,
        filter: `${prefix}:${query.toLowerCase()}`,
        description: prefix === 'from' 
          ? `Emails from senders containing "${query}"`
          : `Emails to recipients containing "${query}"`,
        icon: prefix === 'from' ? <UserRound className="h-5 w-5" /> : <Mail className="h-5 w-5" />
      }];
    }
    
    return suggestions.filter(suggestion => 
      suggestion.prefix === prefix && 
      suggestion.filter.toLowerCase().includes(`${prefix}:${query.toLowerCase()}`)
    );
  }
  
  if (prefix === 'after' || prefix === 'before') {
    return suggestions.filter(suggestion => suggestion.prefix === prefix);
  }
  
  if (!query) {
    return suggestions.filter(suggestion => suggestion.prefix === prefix);
  }
  
  const lowerQuery = query.toLowerCase();
  
  return suggestions.filter(suggestion => {
    if (suggestion.prefix !== prefix) return false;
    
    const colonIndex = suggestion.filter.indexOf(':');
    if (colonIndex === -1) return false;
    
    const filterValue = suggestion.filter.substring(colonIndex + 1).toLowerCase();
    return filterValue.includes(lowerQuery);
  });
};

const inboxes = ["inbox", "spam", "trash", "unread", "starred", "important", "sent", "draft"];

const filterSuggestions: FilterSuggestion[] = [
  // "is:" filters
  { prefix: "is", filter: "is:important", description: "Show important emails", icon: <AlertTriangle className="h-5 w-5" /> },
  { prefix: "is", filter: "is:personal", description: "Show personal emails", icon: <User className="h-5 w-5" /> },
  { prefix: "is", filter: "is:updates", description: "Show update emails", icon: <Bell className="h-5 w-5" /> },
  { prefix: "is", filter: "is:promotions", description: "Show promotional emails", icon: <Tag className="h-5 w-5 rotate-90" /> },
  { prefix: "is", filter: "is:unread", description: "Show unread emails", icon: <MailQuestion className="h-5 w-5" /> },
  { prefix: "is", filter: "is:read", description: "Show read emails", icon: <MailCheck className="h-5 w-5" /> },
  { prefix: "is", filter: "is:starred", description: "Show starred emails", icon: <Star className="h-5 w-5" /> },
  { prefix: "is", filter: "is:social", description: "Show social emails", icon: <Users className="h-5 w-5" /> },

  // "has:" filters
  { prefix: "has", filter: "has:attachment", description: "Emails with attachments", icon: <Paperclip className="h-5 w-5" /> },

  // "from:" filters, maybe enhance this later? only searches for emails
  { prefix: "from", filter: "from:me", description: "Emails you've sent", icon: <UserRound className="h-5 w-5" /> },

  // "to:" filters, maybe enhance this later? only searches for emails
  { prefix: "to", filter: "to:me", description: "Emails where you're the direct recipient", icon: <Mail className="h-5 w-5" /> },
  
  // "date:" filters
  { prefix: "after", filter: "after:date", description: "Emails after a specific date", icon: <CalendarIcon className="h-5 w-5" /> },
  { prefix: "before", filter: "before:date", description: "Emails before a specific date", icon: <CalendarIcon className="h-5 w-5" /> },
];

function DateFilter({ date, setDate }: { date: DateRange; setDate: (date: DateRange) => void }) {
  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "justify-start text-left font-normal",
              !date && "text-muted-foreground",
              "h-10 rounded-md bg-muted/50",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date or a range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-md p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(range) => range && setDate(range)}
            numberOfMonths={useIsMobile() ? 1 : 2}
            disabled={(date) => date > new Date()}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

type SearchForm = {
  subject: string;
  from: string;
  to: string;
  q: string;
  dateRange: DateRange;
  category: string;
  folder: string;
};

export function SearchBar() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [, setSearchValue] = useSearchValue();
  const [value, setValue] = useState<SearchForm>({
    folder: "",
    subject: "",
    from: "",
    to: "",
    q: "",
    dateRange: {
      from: undefined,
      to: undefined,
    },
    category: "",
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<FilterSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [activePrefix, setActivePrefix] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<'after' | 'before' | null>(null);
  const [datePickerPosition, setDatePickerPosition] = useState({ left: 0, top: 0 });
  const datePickerRef = useRef<HTMLDivElement>(null);

  const form = useForm<SearchForm>({
    defaultValues: value,
  });

  const formValues = useMemo(() => ({
    q: form.watch('q'),
  }), [form.watch('q')]);
  
  const filtering = useMemo(() => 
    value.q.length > 0 ||
    value.from.length > 0 ||
    value.to.length > 0 ||
    value.dateRange.from ||
    value.dateRange.to ||
    value.category ||
    value.folder,
  [value]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    
    if (!inputValue.trim()) {
      setShowSuggestions(false);
      setShowDatePicker(false);
      form.setValue('q', '');
      return;
    }
    
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    
    const match = matchFilterPrefix(textBeforeCursor);
    
    if (match) {
      const [, prefix, query] = match;
      const suggestions = filterSuggestionsFunction(filterSuggestions, prefix, query);
      
      setActivePrefix(prefix);
      setFilteredSuggestions(suggestions);
      setShowSuggestions(true);
      setActiveSuggestionIndex(0);
      
      if (prefix === 'after' || prefix === 'before') {
        setDateFilterType(prefix as 'after' | 'before');
        
        const inputEl = inputRef.current;
        if (inputEl) {
          const span = document.createElement('span');
          span.style.visibility = 'hidden';
          span.style.position = 'absolute';
          span.style.whiteSpace = 'pre';
          span.style.font = window.getComputedStyle(inputEl).font;
          span.textContent = textBeforeCursor;
          document.body.appendChild(span);
          
          const rect = inputEl.getBoundingClientRect();
          const spanWidth = span.getBoundingClientRect().width;
          
          document.body.removeChild(span);
          
          setDatePickerPosition({
            left: Math.min(spanWidth, rect.width - 320), 
            top: rect.height
          });
        }
      } else {
        setDateFilterType(null);
      }
    } else {
      setShowDatePicker(false);
      setShowSuggestions(false);
      setActivePrefix(null);
      setDateFilterType(null);
    }
    
    form.setValue('q', inputValue);
  }, [form]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        setActiveSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
      } else {
        setActiveSuggestionIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
      }
      return;
    }
    
    const handleArrowNavigation = (direction: 'right' | 'left' | 'down' | 'up') => {
      e.preventDefault();
      const columns = isMobile ? 3 : Math.min(filteredSuggestions.length, 6);
      
      setActiveSuggestionIndex(prev => {
        let next = prev;
        
        switch (direction) {
          case 'right':
            next = prev < filteredSuggestions.length - 1 ? prev + 1 : prev;
            break;
          case 'left':
            next = prev > 0 ? prev - 1 : 0;
            break;
          case 'down':
            next = prev + columns;
            next = next < filteredSuggestions.length ? next : prev;
            break;
          case 'up':
            next = prev - columns;
            next = next >= 0 ? next : prev;
            break;
        }
        
        return next;
      });
    };
    
    if (e.key === 'ArrowRight') handleArrowNavigation('right');
    else if (e.key === 'ArrowLeft') handleArrowNavigation('left');
    else if (e.key === 'ArrowDown') handleArrowNavigation('down');
    else if (e.key === 'ArrowUp') handleArrowNavigation('up');
    
    if (e.key === 'Enter' && showSuggestions) {
      e.preventDefault();
      if (filteredSuggestions[activeSuggestionIndex]) {
        handleSuggestionClick(filteredSuggestions[activeSuggestionIndex].filter);
      }
      return;
    }
    
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, filteredSuggestions, activeSuggestionIndex, isMobile]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const gridColumns = useMemo(() => {
    return getFilterSuggestionGridColumns(filteredSuggestions.length, isMobile);
  }, [filteredSuggestions.length, isMobile]);
  
  useDebounce(
    () => {
      submitSearch(value);
    },
    250,
    [value],
  );

  const submitSearch = useCallback((data: SearchForm) => {
    let searchTerms = [];
    
    if (data.q) {
      const processedQuery = data.q
        .replace(/from:([^\s]+)/g, (_, address) => 
          address.toLowerCase() === 'me' ? 'from:me' : `from:${address.toLowerCase()}`
        )
        .replace(/to:([^\s]+)/g, (_, address) => 
          address.toLowerCase() === 'me' ? 'to:me' : `to:${address.toLowerCase()}`
        );
      
      searchTerms.push(processedQuery);
    }
    
    if (data.from) searchTerms.push(`from:${data.from.toLowerCase()}`);
    if (data.to) searchTerms.push(`to:${data.to.toLowerCase()}`);
    if (data.subject) searchTerms.push(`subject:(${data.subject})`);
    if (data.dateRange.from) searchTerms.push(`after:${format(data.dateRange.from, "yyyy/MM/dd")}`);
    if (data.dateRange.to) searchTerms.push(`before:${format(data.dateRange.to, "yyyy/MM/dd")}`);
    
    const searchQuery = searchTerms.join(' ');
    const folder = data.folder ? data.folder.toUpperCase() : "";

    setSearchValue({
      value: searchQuery,
      highlight: data.q,
      folder: folder,
    });
  }, [setSearchValue]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    const inputValue = form.getValues().q || '';
    const cursorPosition = inputRef.current?.selectionStart || 0;
    
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const textAfterCursor = inputValue.substring(cursorPosition);
    
    const match = matchFilterPrefix(textBeforeCursor);
    
    if (match) {
      const [fullMatch] = match;
      const startPos = textBeforeCursor.lastIndexOf(fullMatch);
      
      if ((match[1] === 'after' || match[1] === 'before') && suggestion.endsWith('date')) {
        setShowDatePicker(true);
        setShowSuggestions(false);
        return;
      }
      
      const newValue = inputValue.substring(0, startPos) + suggestion + " " + textAfterCursor;
      
      form.setValue('q', newValue);
      
      submitSearch({
        ...form.getValues(),
        q: newValue
      });
    }
    
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [form, submitSearch]);

  const handleDateSelect = useCallback((dateRange: DateRange | undefined) => {
    if (!dateRange || !dateFilterType) return;
    
    let filterText = '';
    
    if (dateFilterType === 'after' && dateRange.from) {
      const formattedDate = format(dateRange.from, "yyyy/MM/dd");
      filterText = `after:${formattedDate}`;
      
      if (dateRange.to) {
        const formattedEndDate = format(dateRange.to, "yyyy/MM/dd");
        filterText += ` before:${formattedEndDate}`;
      }
    } else if (dateFilterType === 'before' && dateRange.to) {
      const formattedDate = format(dateRange.to, "yyyy/MM/dd");
      filterText = `before:${formattedDate}`;
      
      if (dateRange.from) {
        const formattedStartDate = format(dateRange.from, "yyyy/MM/dd");
        filterText = `after:${formattedStartDate} before:${formattedDate}`;
      }
    }
    
    if (!filterText) return;
    
    const inputValue = form.getValues().q || '';
    const cursorPosition = inputRef.current?.selectionStart || 0;
    
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const textAfterCursor = inputValue.substring(cursorPosition);
    
    const match = matchFilterPrefix(textBeforeCursor);
    
    if (match) {
      const [fullMatch] = match;
      const startPos = textBeforeCursor.lastIndexOf(fullMatch);
      const newValue = inputValue.substring(0, startPos) + filterText + " " + textAfterCursor;
      
      form.setValue('q', newValue);
      
      submitSearch({
        ...form.getValues(),
        q: newValue
      });
    }
    
    setShowDatePicker(false);
    inputRef.current?.focus();
  }, [dateFilterType, form, submitSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node) && 
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const renderSuggestions = useCallback(() => {
    if (!showSuggestions || filteredSuggestions.length === 0) return null;
    
    const gridColumns = getFilterSuggestionGridColumns(filteredSuggestions.length, isMobile);
    
    return (
      <div 
        className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-md animate-in fade-in-50 slide-in-from-top-2 duration-150"
        style={{ 
          maxWidth: isMobile ? 'calc(100vw - 24px)' : '600px',
          maxHeight: isMobile ? '50vh' : '400px'
        }}
      >
        <div className="p-3">
          {activePrefix && (
            <div className="mb-2 px-1">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">{activePrefix}:</span> filters
              </div>
            </div>
          )}
          
          <div className={cn("grid gap-3", gridColumns)}>
            {filteredSuggestions.map((suggestion, index) => {
              const value = extractFilterValue(suggestion.filter);
              const isEmailFilter = suggestion.prefix === 'from' || suggestion.prefix === 'to';
              
              return (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion.filter)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-md text-center transition-all gap-1.5",
                    "border hover:border-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    index === activeSuggestionIndex ? 
                      "bg-accent/15 border-accent/30 text-accent-foreground" : 
                      "border-transparent hover:bg-muted/50"
                  )}
                  onMouseEnter={() => !isMobile && setActiveSuggestionIndex(index)}
                  title={suggestion.description}
                >
                  <div className="w-6 h-6 flex items-center justify-center text-foreground">
                    {suggestion.icon}
                  </div>
                  
                  <div className={cn(
                    "text-xs truncate max-w-full",
                    isEmailFilter ? "" : "capitalize"
                  )}>
                    {isEmailFilter ? value.toLowerCase() : value}
                  </div>
                </button>
              );
            })}
          </div>
          
          {!isMobile && filteredSuggestions.length > 1 && (
            <div className="mt-2 text-center text-[9px] text-muted-foreground border-t border-border/15 pt-2">
              <kbd className="px-1 rounded text-[9px] border border-border/30">↹</kbd> to navigate • 
              <kbd className="px-1 rounded text-[9px] border border-border/30 ml-1">↵</kbd> to select
            </div>
          )}
        </div>
      </div>
    );
  }, [showSuggestions, filteredSuggestions, activePrefix, gridColumns, activeSuggestionIndex, isMobile, handleSuggestionClick]);

  const renderDatePicker = useCallback(() => {
    if (!showDatePicker) return null;
    
    return (
      <div 
        ref={datePickerRef}
        className="absolute z-50 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-md animate-in fade-in-50 slide-in-from-top-2 duration-150"
        style={{ 
          left: Math.max(0, datePickerPosition.left - (isMobile ? 160 : 320)), // Adjust based on device
          top: `${datePickerPosition.top}px`,
        }}
      >
        <div className="p-1">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={new Date()}
            selected={undefined}
            onSelect={handleDateSelect}
            numberOfMonths={isMobile ? 1 : 2}
            disabled={(date) => date > new Date()}
            className="rounded-md border-none" 
          />
        </div>
      </div>
    );
  }, [showDatePicker, datePickerPosition, handleDateSelect, isMobile]);

  useEffect(() => {
    const subscription = form.watch((data) => {
      setValue(data as SearchForm);
    });
    return () => subscription.unsubscribe();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [form.watch]);

  const resetSearch = useCallback(() => {
    form.reset();
    setSearchValue({
      value: "",
      highlight: "",
      folder: "",
    });
  }, [form, setSearchValue]);

  return (
    <div className="relative flex-1 md:max-w-[600px]">
      <form className="relative flex items-center" onSubmit={form.handleSubmit(submitSearch)}>
        <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search"
          autoFocus
          ref={inputRef}
          className="h-8 w-full rounded-md border-none bg-muted/50 pl-9 pr-14 text-muted-foreground shadow-none ring-1 ring-muted transition-colors placeholder:text-muted-foreground/70 hover:bg-muted focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring"
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          value={formValues.q}
        />
        {renderSuggestions()}
        {renderDatePicker()}
        <div className="absolute right-1 z-20 flex items-center gap-1">
          {filtering && (
            <button
              type="button"
              onClick={resetSearch}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </button>
          )}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 w-7 rounded-md p-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  popoverOpen && "bg-muted/70 text-foreground"
                )}
                type="button"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="sr-only">Advanced search</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[min(calc(100vw-2rem),400px)] rounded-md border bg-popover p-4 shadow-lg sm:w-[500px] md:w-[600px]"
              side="bottom"
              sideOffset={15}
              alignOffset={-8}
              align="end"
            >
              <div className="space-y-5">
                <div>
                  <h2 className="mb-3 text-xs font-semibold">Quick Filters</h2>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs hover:bg-muted"
                      onClick={() => form.setValue("q", "is:unread")}
                    >
                      Unread
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs hover:bg-muted"
                      onClick={() => form.setValue("q", "has:attachment")}
                    >
                      Has Attachment
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs hover:bg-muted"
                      onClick={() => form.setValue("q", "is:starred")}
                    >
                      Starred
                    </Button>
                  </div>
                </div>

                <Separator className="bg-border/50" />

                <div className="grid gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Search in</label>
                    <Select
                      onValueChange={(value) => form.setValue("folder", value)}
                      value={form.watch("folder")}
                    >
                      <SelectTrigger className="h-8 rounded-md bg-muted/50 capitalize">
                        <SelectValue placeholder="All Mail" />
                      </SelectTrigger>
                      <SelectContent className="rounded-md">
                        {inboxes.map((inbox) => (
                          <SelectItem key={inbox} value={inbox} className="capitalize">
                            {inbox}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Subject</label>
                    <Input
                      placeholder="Email subject"
                      {...form.register("subject")}
                      className="h-8 rounded-md bg-muted/50"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold">From</label>
                      <Input
                        placeholder="Sender"
                        {...form.register("from")}
                        className="h-8 rounded-md bg-muted/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold">To</label>
                      <Input
                        placeholder="Recipient"
                        {...form.register("to")}
                        className="h-8 rounded-md bg-muted/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Date Range</label>
                    <DateFilter
                      date={value.dateRange}
                      setDate={(range) => form.setValue("dateRange", range)}
                    />
                  </div>
                </div>

                <Separator className="bg-border/50" />

                <div>
                  <h2 className="mb-3 text-xs font-semibold">Category</h2>
                  <div className="flex flex-wrap gap-2">
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs transition-colors data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary/20"
                      pressed={form.watch("category") === "primary"}
                      onPressedChange={(pressed) =>
                        form.setValue("category", pressed ? "primary" : "")
                      }
                    >
                      Primary
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs transition-colors data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary/20"
                      pressed={form.watch("category") === "updates"}
                      onPressedChange={(pressed) =>
                        form.setValue("category", pressed ? "updates" : "")
                      }
                    >
                      Updates
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs transition-colors data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary/20"
                      pressed={form.watch("category") === "promotions"}
                      onPressedChange={(pressed) =>
                        form.setValue("category", pressed ? "promotions" : "")
                      }
                    >
                      Promotions
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md bg-muted/50 text-xs transition-colors data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary/20"
                      pressed={form.watch("category") === "social"}
                      onPressedChange={(pressed) =>
                        form.setValue("category", pressed ? "social" : "")
                      }
                    >
                      Social
                    </Toggle>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    onClick={resetSearch}
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 rounded-md bg-primary text-xs text-primary-foreground shadow-none transition-colors hover:bg-primary/90"
                    type="submit"
                    onClick={() => setPopoverOpen(false)}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </form>
    </div>
  );
}
