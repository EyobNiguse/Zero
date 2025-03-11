"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { X, Cookie } from "lucide-react";

interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const hasConsent = localStorage.getItem("cookieConsent");
    if (!hasConsent) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSavePreferences = () => {
    localStorage.setItem("cookieConsent", JSON.stringify(preferences));
    setOpen(false);
    setShowBanner(false);
  };

  const handleAcceptAll = () => {
    const allAccepted = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    setPreferences(allAccepted);
    localStorage.setItem("cookieConsent", JSON.stringify(allAccepted));
    setOpen(false);
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    const allRejected = {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    setPreferences(allRejected);
    localStorage.setItem("cookieConsent", JSON.stringify(allRejected));
    setOpen(false);
    setShowBanner(false);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full border-zinc-800 bg-blue-600 text-white shadow-lg hover:bg-blue-700"
          onClick={() => setOpen(true)}
        >
          <Cookie className="h-6 w-6" />
          <span className="sr-only">Cookie Settings</span>
        </Button>
      </div>

      {showBanner && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 fixed bottom-4 left-4 right-4 z-40 border-zinc-800 bg-black p-4 shadow-lg duration-300 md:left-auto md:right-4 md:max-w-md">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-zinc-100" />
              <h3 className="font-semibold text-zinc-100">Cookie Consent</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBanner(false)}
              className="text-zinc-400 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            We use cookies to enhance your browsing experience, serve personalized ads or content,
            and analyze our traffic.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(true)}
              className="border-zinc-800 bg-transparent text-zinc-100 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Customize
            </Button>
            <Button
              size="sm"
              onClick={handleAcceptAll}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Accept All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRejectAll}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Reject All
            </Button>
          </div>
        </Card>
      )}

      {/* Cookie settings dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 border-zinc-800 bg-black p-0 outline-none">
          <div className="border-b border-zinc-800 px-6 py-6">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Cookie Settings</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Customize your cookie preferences. You can enable or disable different types of
                cookies below.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
            <div className="space-y-6 py-6">
              {/* Necessary cookies - always enabled */}
              <div className="flex items-start justify-between space-x-4">
                <div>
                  <Label htmlFor="necessary" className="font-medium text-zinc-100">
                    Strictly Necessary
                  </Label>
                  <p className="mt-1 text-sm text-zinc-400">
                    These cookies are essential for the website to function properly.
                  </p>
                </div>
                <Switch
                  id="necessary"
                  checked={preferences.necessary}
                  disabled
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Functional cookies */}
              <div className="flex items-start justify-between space-x-4">
                <div>
                  <Label htmlFor="functional" className="font-medium text-zinc-100">
                    Functional
                  </Label>
                  <p className="mt-1 text-sm text-zinc-400">
                    These cookies enable personalized features and functionality.
                  </p>
                </div>
                <Switch
                  id="functional"
                  checked={preferences.functional}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({ ...prev, functional: checked }))
                  }
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Analytics cookies */}
              <div className="flex items-start justify-between space-x-4">
                <div>
                  <Label htmlFor="analytics" className="font-medium text-zinc-100">
                    Analytics
                  </Label>
                  <p className="mt-1 text-sm text-zinc-400">
                    These cookies help us understand how visitors interact with the website.
                  </p>
                </div>
                <Switch
                  id="analytics"
                  checked={preferences.analytics}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({ ...prev, analytics: checked }))
                  }
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Marketing cookies */}
              <div className="flex items-start justify-between space-x-4">
                <div>
                  <Label htmlFor="marketing" className="font-medium text-zinc-100">
                    Marketing
                  </Label>
                  <p className="mt-1 text-sm text-zinc-400">
                    These cookies are used to track visitors across websites to display relevant
                    advertisements.
                  </p>
                </div>
                <Switch
                  id="marketing"
                  checked={preferences.marketing}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({ ...prev, marketing: checked }))
                  }
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>

              {/* Detailed information accordion */}
              <Accordion type="single" collapsible className="mt-6">
                <AccordionItem value="details" className="border-zinc-800">
                  <AccordionTrigger className="text-zinc-100 hover:text-zinc-100 hover:no-underline">
                    <span className="text-sm font-medium">Detailed Cookie Information</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-zinc-400">
                    <div className="space-y-4 text-sm">
                      <div>
                        <h4 className="font-medium text-zinc-100">Strictly Necessary Cookies</h4>
                        <p className="mt-1">
                          These cookies are essential for the website to function properly and
                          cannot be switched off. They are usually only set in response to actions
                          made by you which amount to a request for services, such as setting your
                          privacy preferences, logging in or filling in forms.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium text-zinc-100">Functional Cookies</h4>
                        <p className="mt-1">
                          These cookies enable the website to provide enhanced functionality and
                          personalization. They may be set by us or by third-party providers whose
                          services we have added to our pages. If you do not allow these cookies,
                          some or all of these services may not function properly.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium text-zinc-100">Analytics Cookies</h4>
                        <p className="mt-1">
                          These cookies allow us to count visits and traffic sources so we can
                          measure and improve the performance of our site. They help us to know
                          which pages are the most and least popular and see how visitors move
                          around the site. All information these cookies collect is aggregated and
                          therefore anonymous.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium text-zinc-100">Marketing Cookies</h4>
                        <p className="mt-1">
                          These cookies may be set through our site by our advertising partners.
                          They may be used by those companies to build a profile of your interests
                          and show you relevant advertisements on other sites. They do not store
                          directly personal information, but are based on uniquely identifying your
                          browser and internet device.
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          <div className="border-t border-zinc-800 bg-black px-6 py-4">
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2">
              <div className="mt-2 flex flex-1 gap-2 sm:mt-0">
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-800 bg-transparent text-zinc-100 hover:bg-zinc-900 hover:text-zinc-100"
                  onClick={handleRejectAll}
                >
                  Reject All
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-800 bg-transparent text-zinc-100 hover:bg-zinc-900 hover:text-zinc-100"
                  onClick={handleAcceptAll}
                >
                  Accept All
                </Button>
              </div>
              <Button
                onClick={handleSavePreferences}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 sm:flex-none"
              >
                Save Preferences
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
