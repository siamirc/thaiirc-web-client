import React from 'react';
import IRCClientSim from './components/IRCClientSim';

export default function App() {
  return (
    <div className="w-screen h-screen bg-[#08090c] overflow-hidden flex flex-col relative select-none">
      {/* Immersive Dark Neon Chat Client container */}
      <div className="flex-1 w-full h-full p-2 sm:p-4 md:p-6 flex items-center justify-center relative z-10">
        <IRCClientSim />
      </div>
    </div>
  );
}
