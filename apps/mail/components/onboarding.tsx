'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';

const steps = [
  {
    title: 'Welcome to Zero Email!',
    description: 'Your new intelligent email experience starts here.',
    video: '/onboarding/get-started.png'
  },
  {
    title: 'Chat with your inbox',
    description: 'Zero allows you to chat with your inbox and do tasks on your behalf.',
    video: '/onboarding/step2.gif'
  },
  {
    title: 'AI Compose & Reply',
    description: 'Our AI assistant allows you to write emails with a single click.',
    video: '/onboarding/step1.gif'
  },
  {
    title: 'Label your emails',
    description: 'Zero helps you label your emails and helps you focus on what matters.',
    video: '/onboarding/step3.gif'
  },
  {
    title: 'Ready to start?',
    description: 'Click below to begin your intelligent email experience!',
    video: '/onboarding/ready.png'
  },
];

export function OnboardingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (currentStep === steps.length - 1) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [currentStep]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showOverlay className="sm:max-w-[690px] mx-auto bg-panelLight dark:bg-[#111111] w-full rounded-xl p-4 border">
        <div className="flex flex-col p-6 gap-6">
          <div className="flex items-center justify-center">
            <div className="flex gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 w-16 rounded-full ${
                    index === currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-4xl font-semibold">
              {steps[currentStep]?.title}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {steps[currentStep]?.description}
            </p>
          </div>
          
          {/* Video/GIF Section */}
          <div className="flex justify-center items-center">
            {steps[currentStep]?.video && (
              <div className="w-full max-w-4xl aspect-video rounded-lg overflow-hidden bg-muted">
                <img 
                  src={steps[currentStep].video} 
                  alt={steps[currentStep].title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          <div className="flex mx-auto max-w-xl w-full gap-2">
            <Button
              onClick={() => setCurrentStep(currentStep - 1)}
              variant="outline"
              className="h-8 w-full"
              disabled={currentStep === 0}
            >
              Go back
            </Button>
            <Button 
              onClick={handleNext} 
              className="h-8 w-full"
            >
              {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingWrapper() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('zero-onboarding-seen');
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOpenChange = (open: boolean) => {
    setShowOnboarding(open);
    if (!open) {
      localStorage.setItem('zero-onboarding-seen', 'true');
    }
  };

  return <OnboardingDialog open={showOnboarding} onOpenChange={handleOpenChange} />;
}
