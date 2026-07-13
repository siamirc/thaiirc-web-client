import React, { useState } from 'react';
import { Copy, Download, BookOpen, Code, Check } from 'lucide-react';
import { pythonCodeString } from '../data/pythonCode';

export default function PythonCodeViewer() {
  const [activeTab, setActiveTab] = useState<'code' | 'guide'>('code');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pythonCodeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([pythonCodeString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'irc_client.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans text-xs">
      {/* Tab controls - modern segmented style */}
      <div className="flex bg-slate-100 border-b border-slate-200 p-1.5 gap-1.5 rounded-t-lg shadow-sm">
        <button
          onClick={() => setActiveTab('code')}
          className={`px-3.5 py-1.5 flex items-center gap-2 font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'code'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-transparent text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
          id="tab-code-viewer"
        >
          <Code size={14} />
          <span>โค้ดหลัก Python (PyQt6)</span>
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`px-3.5 py-1.5 flex items-center gap-2 font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'guide'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-transparent text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
          id="tab-guide-viewer"
        >
          <BookOpen size={14} />
          <span>คู่มือการรันและทำไฟล์ติดตั้ง .EXE</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 p-3 flex flex-col">
        {activeTab === 'code' ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Top actions */}
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[11px] text-slate-500 font-medium">
                ไฟล์โค้ดภาษา Python ที่ออกแบบระบบ Threading ป้องกันค้าง พร้อม UI ย้อนยุค pIRCH
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={handleCopy}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg px-3 py-1.5 text-[11px] transition-all active:scale-95 shadow-sm flex items-center gap-1.5 cursor-pointer"
                  id="btn-copy-code"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-emerald-300" />
                      <span className="text-emerald-100 font-bold">คัดลอกแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>คัดลอกโค้ด</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold rounded-lg px-3 py-1.5 text-[11px] transition-all active:scale-95 shadow-sm flex items-center gap-1.5 cursor-pointer"
                  id="btn-download-code"
                >
                  <Download size={12} />
                  <span>ดาวน์โหลดไฟล์ irc_client.py</span>
                </button>
              </div>
            </div>

            {/* Code display */}
            <div className="flex-1 min-h-0 bg-slate-950 text-emerald-400 font-mono text-[13px] overflow-auto p-4 rounded-xl border border-slate-800/80 shadow-inner select-text">
              <code>{pythonCodeString}</code>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-white border border-slate-200/80 rounded-xl p-5 overflow-auto text-xs leading-relaxed select-text shadow-sm">
            <h1 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2.5 font-sans flex items-center gap-2">
              <span>🛠️</span> คู่มือการเปิดใช้งานและคอมไพล์โปรแกรมเป็นไฟล์ติดตั้ง (.EXE)
            </h1>

            <p className="mb-4 text-slate-600">
              โค้ดที่สร้างขึ้นนี้คือแอปพลิเคชัน <strong className="text-slate-900">IRC Client</strong> ที่เขียนด้วยภาษา <strong className="text-slate-900">Python</strong> ร่วมกับไลบรารี <strong className="text-slate-900">PyQt6</strong> มีฟีเจอร์เด่นเรื่องโครงสร้างแยกเธรด (Multithreading) ด้วย <code className="bg-slate-50 text-indigo-600 px-1 py-0.5 rounded font-mono">QThread</code> ทำให้โปรแกรมสามารถรับส่งข้อมูลกับเซิร์ฟเวอร์ IRC ได้ตลอดเวลาโดยที่หน้าต่างแอปพลิเคชัน (GUI) ไม่ค้างหรือค้างชะงัก
            </p>

            <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-5 mb-2">1. การติดตั้งสภาพแวดล้อมสำหรับการรันโค้ด</h2>
            <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-600">
              <li>ตรวจสอบว่าเครื่องคอมพิวเตอร์ของคุณมี <strong className="text-slate-800">Python (เวอร์ชัน 3.8 ขึ้นไป)</strong> ติดตั้งอยู่แล้ว</li>
              <li>เปิด Command Prompt (Windows) หรือ Terminal (Mac/Linux) แล้วรันคำสั่งเพื่อติดตั้งไลบรารี <strong className="text-slate-800">PyQt6</strong>:
                <pre className="bg-slate-900 text-rose-400 p-3 rounded-lg my-2 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                  pip install PyQt6
                </pre>
              </li>
            </ol>

            <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-5 mb-2">2. วิธีการทดสอบรันแอปพลิเคชัน</h2>
            <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-600">
              <li>ดาวน์โหลดไฟล์ <code className="bg-slate-50 text-indigo-600 px-1 py-0.5 rounded font-mono">irc_client.py</code> โดยคลิกปุ่มดาวน์โหลดที่แท็บก่อนหน้า</li>
              <li>นำไฟล์ไปบันทึกไว้ในโฟลเดอร์ที่สะดวก เช่น Desktop</li>
              <li>เปิด Command Prompt ในโฟลเดอร์นั้น แล้วใช้คำสั่งรันโปรแกรม:
                <pre className="bg-slate-900 text-rose-400 p-3 rounded-lg my-2 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                  python irc_client.py
                </pre>
              </li>
            </ol>

            <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-5 mb-2">3. วิธีคอมไพล์โปรแกรมเป็นไฟล์ติดตั้งสำเร็จรูป (.EXE) สำหรับ Windows</h2>
            <p className="mb-2 text-slate-600">
              เพื่ออำนวยความสะดวกให้ผู้ใช้นำไปดับเบิ้ลคลิกรันได้ทันทีโดยไม่ต้องติดตั้ง Python หรือไลบรารีใดๆ ในเครื่อง เราจะใช้เครื่องมือที่ชื่อว่า <strong className="text-slate-800">PyInstaller</strong> ในการแพ็คไฟล์ทั้งหมดให้เหลือเพียงไฟล์ <code className="bg-slate-50 text-indigo-600 px-1 py-0.5 rounded font-mono">.exe</code> ไฟล์เดียว:
            </p>
            <ol className="list-decimal pl-5 mb-4 space-y-2 text-slate-600">
              <li>ติดตั้งไลบรารี PyInstaller ด้วยคำสั่ง:
                <pre className="bg-slate-900 text-rose-400 p-3 rounded-lg my-2 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                  pip install pyinstaller
                </pre>
              </li>
              <li>รันคำสั่งแพ็คเกจโค้ดด้านล่างนี้ (พิมพ์ที่ cmd ในตำแหน่งที่มีไฟล์ <code className="bg-slate-50 text-indigo-600 px-1 py-0.5 rounded font-mono">irc_client.py</code> อยู่):
                <pre className="bg-slate-900 text-rose-400 p-3 rounded-lg my-2 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner">
                  pyinstaller --onefile --windowed --name="pyIRCH98" irc_client.py
                </pre>
                <div className="text-[11px] text-slate-500 mt-1.5 pl-2 border-l-2 border-slate-200">
                  * <code className="text-indigo-600">--onefile</code>: รวมโค้ดและทรัพยากรทุกอย่างให้เป็นไฟล์ .exe เพียงไฟล์เดียว<br />
                  * <code className="text-indigo-600">--windowed</code>: ซ่อนหน้าต่างหน้าจอดำ (Console Window) ของ Python เวลาที่รันโปรแกรมจริง<br />
                  * <code className="text-indigo-600">--name</code>: ตั้งชื่อไฟล์โปรแกรมปลายทาง
                </div>
              </li>
              <li>เมื่อกระบวนการเสร็จสิ้น (จะใช้เวลาประมาณ 1-3 นาที) จะมีโฟลเดอร์เกิดขึ้น 3 โฟลเดอร์ ได้แก่ <code className="font-mono">build</code>, <code className="font-mono">dist</code> และไฟล์ <code className="font-mono">.spec</code></li>
              <li>ให้เข้าไปที่โฟลเดอร์ <strong className="text-slate-800"><code>dist</code></strong> คุณจะพบไฟล์ <strong className="text-slate-800"><code>pyIRCH98.exe</code></strong> ซึ่งสามารถดับเบิ้ลคลิกรันและส่งไฟล์นี้ต่อให้เพื่อนๆ นำไปใช้แชทได้ทันที!</li>
            </ol>

            <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-5 mb-2">💡 รายละเอียดโครงสร้างโค้ดแบบแยก Threading ที่ดีไซน์ไว้</h2>
            <p className="mb-2 text-slate-600">
              ในโปรแกรมนี้มีการแบ่งกลุ่มคำสั่งงานออกเป็น 2 ฝั่งเพื่อทำงานร่วมกัน:
            </p>
            <ul className="list-disc pl-5 mb-4 space-y-1.5 text-slate-600">
              <li>
                <strong className="text-slate-800">GUI Main Thread (PIRCHMainWindow)</strong>: มีหน้าที่วาดภาพหน้าจอโปรแกรม ปุ่มกด รายการผู้ใช้ และรับค่าอินพุตจากแป้นพิมพ์ รวมถึงตอบสนองต่อผู้ใช้งานอย่างรวดเร็วตลอดเวลา
              </li>
              <li>
                <strong className="text-slate-800">Background Network Thread (IRCWorker & QThread)</strong>: จัดเก็บลูปอนันต์สำหรับเชื่อมต่อ TCP Socket เพื่อคอยเปิดหูรับฟังข้อมูล (Socket Recv) จากเซิร์ฟเวอร์ IRC ตลอด 24 ชม. และประมวลผลแปลข้อความโดยอัตโนมัติ (เช่น ระบบตอบกลับ PING ด้วย PONG ทันที เพื่อประคองไม่ให้โดนเซิร์ฟเวอร์เตะออกจากห้อง) เมื่อได้ข้อความแชทใหม่ จะทำการส่งผ่านโครงสร้าง <code className="bg-slate-50 text-indigo-600 px-1 py-0.5 rounded font-mono">pyqtSignal</code> ไปกระตุ้น Main Thread ให้แสดงข้อความขึ้นที่หน้าจอ ซึ่งวิธีนี้ปลอดภัยและถูกหลักการออกแบบ Desktop App สากล
              </li>
            </ul>

            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 my-4 text-indigo-950 rounded-r-xl shadow-sm">
              <strong className="block mb-1 text-indigo-900 font-bold">⚠️ แนะนำเซิร์ฟเวอร์ IRC สำหรับการเชื่อมต่อ:</strong>
              <p className="text-indigo-800 text-[11px]">
                ในโค้ดตั้งค่าเซิร์ฟเวอร์เริ่มต้นเป็น <code className="bg-white/60 px-1 rounded font-mono">irc.libera.chat</code> ซึ่งเป็นเครือข่ายเปิดยอดนิยมของเหล่านักเขียนโปรแกรมทั่วโลก (มีห้องคุยภาษาอื่นๆ และห้อง <code className="bg-white/60 px-1 rounded font-mono">#pyqt6</code> หรือคุณสามารถตั้งค่าเป็นเครือข่ายส่วนตัวอย่าง <code className="bg-white/60 px-1 rounded font-mono">irc.undernet.org</code> หรืออื่นๆ ได้ตามชอบ)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
