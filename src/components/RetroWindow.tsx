import React, { useState, useRef, useEffect } from 'react';
import { X, Square, Minus } from 'lucide-react';

interface RetroWindowProps {
  id: string;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  isActive: boolean;
  defaultX?: number;
  defaultY?: number;
  defaultW?: number;
  defaultH?: number;
  icon?: React.ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onFocus: () => void;
  children: React.ReactNode;
}

export default function RetroWindow({
  id,
  title,
  isOpen,
  isMinimized,
  isMaximized,
  zIndex,
  isActive,
  defaultX = 40,
  defaultY = 40,
  defaultW = 750,
  defaultH = 500,
  icon,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  children,
}: RetroWindowProps) {
  const [position, setPosition] = useState({ x: defaultX, y: defaultY });
  const [size, setSize] = useState({ w: defaultW, h: defaultH });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ w: 0, h: 0, x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Focus on window click
  const handleMouseDown = (e: React.MouseEvent) => {
    onFocus();
  };

  // Dragging logic
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    onFocus();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    e.preventDefault();
  };

  // Resizing logic
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    onFocus();
    setIsResizing(true);
    resizeStart.current = {
      w: size.w,
      h: size.h,
      x: e.clientX,
      y: e.clientY,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragStart.current.x));
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragStart.current.y));
        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        const deltaW = e.clientX - resizeStart.current.x;
        const deltaH = e.clientY - resizeStart.current.y;
        const newW = Math.max(300, resizeStart.current.w + deltaW);
        const newH = Math.max(200, resizeStart.current.h + deltaH);
        setSize({ w: newW, h: newH });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing]);

  if (!isOpen || isMinimized) return null;

  const style: React.CSSProperties = isMaximized
    ? {
        position: 'absolute',
        top: '40px',
        left: '0px',
        width: '100%',
        height: 'calc(100% - 80px)', // adjust for menu/taskbar
        zIndex: zIndex,
      }
    : {
        position: 'absolute',
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: `${size.w}px`,
        height: `${size.h}px`,
        zIndex: zIndex,
      };

  return (
    <div
      ref={windowRef}
      style={style}
      className="win95-raised flex flex-col select-none overflow-hidden border border-slate-200/80 shadow-2xl rounded-xl bg-slate-50"
      onMouseDown={handleMouseDown}
      id={`window-${id}`}
    >
      {/* Title Bar */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={onMaximize}
        className={`flex items-center justify-between px-3 py-2 cursor-default transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-[#0054e3] to-[#27c4fb] text-white shadow-sm'
            : 'bg-slate-100 text-slate-500 border-b border-slate-200'
        }`}
        id={`window-titlebar-${id}`}
      >
        <div className="flex items-center gap-2 px-0.5 truncate font-sans text-xs font-semibold">
          {icon && <span className={`w-4 h-4 flex items-center justify-center ${isActive ? 'text-white' : 'text-slate-400'}`}>{icon}</span>}
          <span className="truncate pr-4 font-sans tracking-wide">{title}</span>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={onMinimize}
            className={`w-5.5 h-5.5 rounded-full flex items-center justify-center transition-all ${
              isActive 
                ? 'bg-white/20 hover:bg-white/35 text-white' 
                : 'bg-slate-200/70 hover:bg-slate-300 text-slate-600'
            }`}
            title="Minimize"
            id={`btn-minimize-${id}`}
          >
            <Minus size={10} strokeWidth={3} />
          </button>
          <button
            onClick={onMaximize}
            className={`w-5.5 h-5.5 rounded-full flex items-center justify-center transition-all ${
              isActive 
                ? 'bg-white/20 hover:bg-white/35 text-white' 
                : 'bg-slate-200/70 hover:bg-slate-300 text-slate-600'
            }`}
            title={isMaximized ? 'Restore' : 'Maximize'}
            id={`btn-maximize-${id}`}
          >
            <Square size={8} strokeWidth={3} />
          </button>
          <button
            onClick={onClose}
            className={`w-5.5 h-5.5 rounded-full flex items-center justify-center transition-all ${
              isActive 
                ? 'bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white' 
                : 'bg-red-100/60 hover:bg-red-500 text-red-500 hover:text-white'
            }`}
            title="Close"
            id={`btn-close-${id}`}
          >
            <X size={10} strokeWidth={3} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 bg-slate-50 p-1 flex flex-col relative rounded-b-xl" id={`window-content-${id}`}>
        {children}

        {/* Resize handle */}
        {!isMaximized && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end p-[2px]"
            id={`window-resize-grip-${id}`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-slate-400 fill-current opacity-70 hover:opacity-100 transition-opacity">
              <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.2" />
              <line x1="7" y1="2" x2="2" y2="7" stroke="currentColor" strokeWidth="1.2" />
              <line x1="7" y1="5" x2="5" y2="7" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
