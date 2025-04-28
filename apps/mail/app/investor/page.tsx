'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function InvestorPage() {
  const [isHovered, setIsHovered] = useState(false);
  
  useEffect(() => {
    // Load the Typeform script if not already loaded
    if (!document.querySelector('script[src="//embed.typeform.com/next/embed.js"]')) {
      const script = document.createElement('script');
      script.src = '//embed.typeform.com/next/embed.js';
      document.body.appendChild(script);
    }
  }, []);

  // Add a style block to ensure the body takes up full height and has no margin/padding
  useEffect(() => {
    // Add global styles to ensure full height display
    const style = document.createElement('style');
    style.innerHTML = `
      html, body {
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <>
      {/* Back to Home Button */}
      <Link href="/">
        <button 
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 1000000,
            background: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            border: 'none',
            borderRadius: '20px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'background 0.2s ease'
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          Go back
        </button>
      </Link>

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}>
        <div 
          data-tf-live="01JSRAJYBDC09X1YQGCC8BXWHM"
          data-tf-medium="snippet"
          data-tf-hidden="scroll=hidden"
          data-tf-full-screen="true"
          style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none'
          }}
        ></div>
      </div>
    </>
  );
} 