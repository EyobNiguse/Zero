'use client';

import React, { useEffect, useRef } from 'react';

interface SignatureDisplayProps {
  html: string;
  className?: string;
}

export default function SignatureDisplay({ html, className = '' }: SignatureDisplayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body {
              font-family: Arial, Helvetica, sans-serif;
              padding: 0;
              margin: 0;
            }
            
            img {
              max-width: 100%;
            }
          </style>
        </head>
        <body>${html}</body>
        </html>
      `);
      doc.close();
      
      // Use a more efficient approach for height measurement
      const measureAndSetHeight = () => {
        if (doc.body) {
          const height = doc.body.scrollHeight;
          if (height > 10) {
            iframe.style.height = `${height}px`;
          }
        }
      };
      
      // Set height after content loads
      measureAndSetHeight();
      
      // Set up listeners for images that might change the height
      const images = doc.getElementsByTagName('img');
      let loadedImages = 0;
      
      if (images.length > 0) {
        Array.from(images).forEach(img => {
          if (img.complete) {
            loadedImages++;
            if (loadedImages === images.length) {
              setTimeout(measureAndSetHeight, 0);
            }
          } else {
            img.onload = () => {
              loadedImages++;
              if (loadedImages === images.length) {
                setTimeout(measureAndSetHeight, 0);
              }
            };
            img.onerror = () => {
              loadedImages++;
              if (loadedImages === images.length) {
                setTimeout(measureAndSetHeight, 0);
              }
            };
          }
        });
      }
      
      // Final height check after a short delay
      const timeoutId = setTimeout(measureAndSetHeight, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    } catch (error) {
      console.error('Error rendering signature:', error);
    }
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      className={`w-full border-0 ${className}`}
      style={{ minHeight: '80px', overflow: 'hidden' }}
      title="Email Signature"
      sandbox="allow-same-origin"
    />
  );
}