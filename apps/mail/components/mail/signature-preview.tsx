'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SignaturePreviewProps {
  html: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SignaturePreview({ html, className, style }: SignaturePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(100);
  
  useEffect(() => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const updateIframe = () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;
        
        // Create and inject the content
        iframeDoc.open();
        iframeDoc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <base target="_blank">
            <style>
              html, body {
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: transparent;
              }
              img {
                max-width: 100%;
                height: auto;
              }
              /* Override styles for the preview */
              * {
                line-height: 1.4 !important;
              }
            </style>
          </head>
          <body>${html}</body>
          </html>
        `);
        iframeDoc.close();
        
        // Adjust height
        const adjustHeight = () => {
          const docHeight = iframeDoc.body.scrollHeight;
          if (docHeight > 10) {
            setHeight(docHeight);
            iframe.style.height = `${docHeight}px`;
          }
        };
        
        // Set up image load listeners
        const images = iframeDoc.querySelectorAll('img');
        let imagesLoaded = 0;
        const totalImages = images.length;
        
        if (totalImages > 0) {
          images.forEach(img => {
            if (img.complete) {
              imagesLoaded++;
              if (imagesLoaded === totalImages) {
                setTimeout(adjustHeight, 50);
              }
            } else {
              img.onload = () => {
                imagesLoaded++;
                if (imagesLoaded === totalImages) {
                  setTimeout(adjustHeight, 50);
                }
              };
              img.onerror = () => {
                imagesLoaded++;
                if (imagesLoaded === totalImages) {
                  setTimeout(adjustHeight, 50);
                }
              };
            }
          });
        } else {
          adjustHeight();
        }
        
        // Additional adjustment after everything is loaded
        setTimeout(adjustHeight, 200);
      } catch (error) {
        console.error('Error updating signature iframe:', error);
      }
    };
    
    updateIframe();
    
    // Reapply when html changes
    return () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write('');
          iframeDoc.close();
        }
      } catch (e) {
        // Ignore errors from cross-origin restrictions
      }
    };
  }, [html]);
  
  return (
    <iframe
      ref={iframeRef}
      title="Signature Preview"
      sandbox="allow-same-origin allow-scripts allow-popups"
      className={cn('w-full border-0 overflow-hidden', className)}
      style={{
        height: `${height}px`,
        minHeight: '120px',
        ...style
      }}
    />
  );
}