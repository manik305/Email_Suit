import React, { useEffect, useState, useRef } from 'react';
import mascotImg from '../assets/Digio_Her.jpeg';

export type MascotState = 'welcome' | 'running' | 'sleeping' | 'touching' | 'loading';

interface Mascot3DProps {
  state?: MascotState;
  className?: string;
  size?: number;
}

export const Mascot3D: React.FC<Mascot3DProps> = ({
  state = 'welcome',
  className = '',
  size = 280,
}) => {
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Dynamic Background Removal (Black to transparent alpha)
  useEffect(() => {
    const img = new Image();
    img.src = mascotImg;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // Filter black background (RGB below threshold)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // If pixel is black/very dark
        if (r < 35 && g < 35 && b < 35) {
          data[i + 3] = 0; // set alpha transparent
        } else {
          // Boost glowing elements slightly (blue and orange parts)
          // Orange parts
          if (r > 200 && g > 100 && b < 100) {
            data[i] = Math.min(255, r * 1.1);
            data[i+1] = Math.min(255, g * 1.1);
          }
          // Blue parts
          if (b > 180 && r < 120) {
            data[i+2] = Math.min(255, b * 1.15);
            data[i] = Math.min(255, r * 0.9);
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      setProcessedSrc(canvas.toDataURL('image/png'));
      setImgLoaded(true);
    };
  }, []);

  // 3D Parallax Mouse Tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      // Calculate mouse coordinates relative to the center of the container (-0.5 to 0.5)
      const mouseX = (e.clientX - rect.left) / width - 0.5;
      const mouseY = (e.clientY - rect.top) / height - 0.5;

      // Maximum rotation angles (in degrees)
      const maxRotX = 25;
      const maxRotY = 25;

      setRotateX(-mouseY * maxRotX);
      setRotateY(mouseX * maxRotY);
    };

    const handleMouseLeave = () => {
      setRotateX(0);
      setRotateY(0);
      setIsHovered(false);
    };

    const handleMouseEnter = () => {
      setIsHovered(true);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [imgLoaded]);

  // CSS Animations Inline Injector
  const styles = `
    @keyframes bobbing {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    @keyframes fast-bobbing {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      25% { transform: translateY(-4px) rotate(1deg); }
      50% { transform: translateY(0px) rotate(-1deg); }
      75% { transform: translateY(-3px) rotate(0.5deg); }
    }
    @keyframes floating-slow {
      0%, 100% { transform: translateY(0px) rotate(75deg); }
      50% { transform: translateY(-6px) rotate(78deg); }
    }
    @keyframes zzz-float-1 {
      0% { transform: translate(10px, 10px) scale(0.6); opacity: 0; }
      50% { opacity: 0.8; }
      100% { transform: translate(-15px, -50px) scale(1.1); opacity: 0; }
    }
    @keyframes zzz-float-2 {
      0% { transform: translate(15px, 15px) scale(0.5); opacity: 0; }
      50% { opacity: 0.7; }
      100% { transform: translate(-30px, -45px) scale(1.0); opacity: 0; }
    }
    @keyframes ripple-wave {
      0% { transform: scale(0.1); opacity: 0.8; border-color: rgba(75, 167, 201, 0.8); }
      50% { opacity: 0.5; }
      100% { transform: scale(2.2); opacity: 0; border-color: rgba(220, 240, 255, 0); }
    }
    @keyframes screen-glow {
      0%, 100% { opacity: 0.15; box-shadow: 0 0 15px rgba(81, 162, 195, 0.1) inset; }
      50% { opacity: 0.35; box-shadow: 0 0 30px rgba(81, 162, 195, 0.3) inset; }
    }
    @keyframes holo-scan {
      0% { top: 0%; }
      50% { top: 100%; }
      100% { top: 0%; }
    }
    @keyframes particle-up {
      0% { transform: translateY(100px) scale(0.5); opacity: 0; }
      50% { opacity: 0.7; }
      100% { transform: translateY(-100px) scale(1.2); opacity: 0; }
    }
    @keyframes wind-line {
      0% { transform: translateX(110%); opacity: 0; }
      15% { opacity: 0.7; }
      85% { opacity: 0.7; }
      100% { transform: translateX(-110%); opacity: 0; }
    }
    @keyframes ring-spin-1 {
      0% { transform: rotateX(75deg) rotateY(15deg) rotateZ(0deg); }
      100% { transform: rotateX(75deg) rotateY(15deg) rotateZ(360deg); }
    }
    @keyframes ring-spin-2 {
      0% { transform: rotateX(65deg) rotateY(-20deg) rotateZ(360deg); }
      100% { transform: rotateX(65deg) rotateY(-20deg) rotateZ(0deg); }
    }
    @keyframes grid-advance {
      0% { background-position-y: 0px; }
      100% { background-position-y: 60px; }
    }
  `;

  // Get current inline animation style of Mascot wrapper
  const getMascotAnimationStyle = () => {
    if (state === 'sleeping') {
      return {
        animation: 'floating-slow 4s ease-in-out infinite',
        transform: 'rotate(75deg) scale(0.9)',
        filter: 'brightness(0.7) contrast(0.9) drop-shadow(0 4px 15px rgba(0,0,0,0.15))',
      };
    }
    if (state === 'running') {
      return {
        animation: 'fast-bobbing 0.5s ease-in-out infinite',
        transform: 'skewX(-4deg) scale(1.02)',
        filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.12)) drop-shadow(0 0 8px rgba(255, 150, 0, 0.2))',
      };
    }
    if (state === 'touching') {
      return {
        animation: 'bobbing 3.5s ease-in-out infinite',
        transform: 'translateZ(10px) scale(1.04)',
        filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.15)) drop-shadow(0 0 10px rgba(81, 162, 195, 0.3))',
      };
    }
    if (state === 'loading') {
      return {
        animation: 'bobbing 2s ease-in-out infinite',
        transform: 'scale(1.02)',
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.1)) drop-shadow(0 0 12px rgba(81, 162, 195, 0.25))',
      };
    }
    // Default / Welcome
    return {
      animation: 'bobbing 5s ease-in-out infinite',
      transform: 'translateZ(0px)',
      filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.08))',
    };
  };

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} style={{ perspective: '1000px' }}>
      <style>{styles}</style>

      {/* 3D Holographic Chamber Container */}
      <div
        ref={containerRef}
        className="relative flex items-center justify-center transition-transform duration-300 ease-out"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          transform: isHovered ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)` : 'rotateX(0deg) rotateY(0deg) scale(1)',
          transformStyle: 'preserve-3d',
        }}
      >
        
        {/* BACKGROUND EFFECTS BASED ON STATE */}

        {/* 1. Cyber Grid background (Running state) */}
        {state === 'running' && (
          <div 
            className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, transparent 30%, rgba(81, 162, 195, 0.15) 100%)',
              maskImage: 'radial-gradient(ellipse at center, black, transparent)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, black, transparent)',
              transform: 'rotateX(60deg) translateY(20px) translateZ(-40px)',
              transformStyle: 'preserve-3d',
            }}
          >
            <div 
              className="w-full h-[200%] absolute top-[-50%]"
              style={{
                backgroundImage: 'linear-gradient(rgba(81, 162, 195, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(81, 162, 195, 0.3) 1px, transparent 1px)',
                backgroundSize: '25px 25px',
                animation: 'grid-advance 0.8s linear infinite',
              }}
            />
          </div>
        )}

        {/* 2. Rotating Holographic Rings (Loading/Thinking state) */}
        {state === 'loading' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
            {/* Ring 1 */}
            <div 
              className="absolute w-[85%] h-[85%] rounded-full border border-dashed border-indigo-400/40"
              style={{
                animation: 'ring-spin-1 6s linear infinite',
                transformStyle: 'preserve-3d',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.05)',
              }}
            />
            {/* Ring 2 */}
            <div 
              className="absolute w-[95%] h-[95%] rounded-full border border-double border-sky-400/30"
              style={{
                animation: 'ring-spin-2 8s linear infinite',
                transformStyle: 'preserve-3d',
                boxShadow: '0 0 20px rgba(56, 189, 248, 0.05)',
              }}
            />
          </div>
        )}

        {/* 3. Shadow / Ambient Glow Underneath Mascot */}
        <div 
          className={`absolute rounded-full transition-all duration-500 pointer-events-none ${
            state === 'sleeping' 
              ? 'bg-slate-900/10 blur-xl w-[120px] h-[15px] bottom-[10%]' 
              : state === 'running' 
              ? 'bg-orange-500/10 blur-lg w-[140px] h-[20px] bottom-[5%] scale-x-125'
              : 'bg-slate-900/15 blur-lg w-[100px] h-[15px] bottom-[8%]'
          }`}
          style={{
            transform: 'rotateX(75deg) translateZ(-50px)',
          }}
        />

        {/* 4. Speed lines / Wind Trails (Running State) */}
        {state === 'running' && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[25%] left-0 w-24 h-[1px] bg-gradient-to-r from-transparent via-orange-400/50 to-transparent" style={{ animation: 'wind-line 1.2s linear infinite', animationDelay: '0.1s' }} />
            <div className="absolute top-[45%] left-0 w-32 h-[1.5px] bg-gradient-to-r from-transparent via-sky-400/45 to-transparent" style={{ animation: 'wind-line 0.8s linear infinite', animationDelay: '0.4s' }} />
            <div className="absolute top-[70%] left-0 w-20 h-[1px] bg-gradient-to-r from-transparent via-orange-300/40 to-transparent" style={{ animation: 'wind-line 1.5s linear infinite', animationDelay: '0s' }} />
          </div>
        )}

        {/* 5. Zzz Particles (Sleeping state) */}
        {state === 'sleeping' && (
          <div className="absolute pointer-events-none text-slate-400/60 font-bold font-mono text-sm leading-none" style={{ left: '60%', top: '25%', transformStyle: 'preserve-3d' }}>
            <span className="absolute animate-[zzz-float-1_3s_infinite_linear]" style={{ animationDelay: '0s' }}>Z</span>
            <span className="absolute animate-[zzz-float-2_3.5s_infinite_linear] text-xs font-semibold" style={{ animationDelay: '1.2s' }}>z</span>
            <span className="absolute animate-[zzz-float-1_4s_infinite_linear] text-lg font-black" style={{ animationDelay: '2.2s' }}>Z</span>
          </div>
        )}

        {/* 6. Glowing float particles (Loading / Thinking state) */}
        {state === 'loading' && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-sky-400/60 blur-[0.5px]"
                style={{
                  left: `${15 + i * 15}%`,
                  bottom: '10%',
                  animation: `particle-up ${1.5 + i * 0.3}s infinite linear`,
                  animationDelay: `${i * 0.25}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* MASCOT IMAGE RENDER */}
        <div
          className="relative transition-all duration-500 ease-out flex items-center justify-center"
          style={{
            width: `${size * 0.82}px`,
            height: `${size * 0.82}px`,
            transformStyle: 'preserve-3d',
            ...getMascotAnimationStyle(),
          }}
        >
          {processedSrc ? (
            <img
              src={processedSrc}
              alt="Digio Hero Mascot 3D"
              className="w-full h-full object-contain pointer-events-none select-none transition-opacity duration-300"
              style={{
                // Prevent ghost outline or pixelated corners
                imageRendering: 'auto',
              }}
            />
          ) : (
            // Spinner fallback while processing canvas
            <div className="w-16 h-16 border-2 border-slate-200 border-t-sky-400 rounded-full animate-spin" />
          )}

          {/* Holographic scanner line for Loading state */}
          {state === 'loading' && processedSrc && (
            <div
              className="absolute left-0 right-0 h-[2px] bg-sky-400/80 shadow-[0_0_12px_rgba(56,189,248,0.8)] opacity-70 pointer-events-none"
              style={{
                animation: 'holo-scan 2.5s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* FRONT INTERACTIVE INTERFACES */}

        {/* 7. Holographic Screen & Touching ripples (Touching state) */}
        {state === 'touching' && (
          <>
            {/* Semi-transparent holographic screen overlay */}
            <div 
              className="absolute inset-x-[10%] top-[15%] bottom-[15%] rounded-xl border border-sky-400/25 bg-sky-500/5 pointer-events-none"
              style={{
                transform: 'translateZ(35px)',
                animation: 'screen-glow 3s ease-in-out infinite',
                backdropFilter: 'blur(0.5px)',
              }}
            >
              {/* Screen digital grids overlay */}
              <div 
                className="w-full h-full opacity-[0.03]" 
                style={{
                  backgroundImage: 'radial-gradient(circle, #51A2C3 1px, transparent 1px)',
                  backgroundSize: '8px 8px',
                }}
              />
              {/* Cute mini visual indicators */}
              <div className="absolute top-2 left-3 w-8 h-1 bg-sky-400/40 rounded" />
              <div className="absolute bottom-2 right-3 text-[7px] text-sky-400/60 font-mono font-bold tracking-widest">
                DIGIO SECURE UI
              </div>
            </div>

            {/* Glowing Palm Touch Ripples (Matches robot's raised hand) */}
            {/* The robot's hand waving is on the left side of the image (waving right hand from the viewer's perspective, which is top-left quadrant) */}
            <div 
              className="absolute w-12 h-12 flex items-center justify-center pointer-events-none"
              style={{
                left: '18%',
                top: '32%',
                transform: 'translateZ(40px)',
              }}
            >
              {/* Concentric waves */}
              <div className="absolute w-full h-full rounded-full border border-sky-400/85 animate-[ripple-wave_2s_infinite_linear]" style={{ animationDelay: '0s' }} />
              <div className="absolute w-full h-full rounded-full border border-sky-400/60 animate-[ripple-wave_2s_infinite_linear]" style={{ animationDelay: '0.6s' }} />
              <div className="absolute w-full h-full rounded-full border border-sky-400/30 animate-[ripple-wave_2s_infinite_linear]" style={{ animationDelay: '1.2s' }} />
              
              {/* Hotspot core */}
              <div className="w-2.5 h-2.5 rounded-full bg-sky-300 shadow-[0_0_10px_#51A2C3] animate-ping" />
              <div className="absolute w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
            </div>
          </>
        )}

      </div>
    </div>
  );
};
