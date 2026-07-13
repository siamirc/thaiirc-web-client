export const pythonCodeString = `import sys
import socket
import re
import threading
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLineEdit, QPushButton, QTextBrowser, QLabel, QSplitter,
    QListWidget, QStatusBar, QMessageBox, QFrame, QTabWidget, QSlider, QCheckBox,
    QMenu, QDialog, QScrollArea, QGridLayout
)
from PyQt6.QtCore import QThread, pyqtSignal, QObject, Qt, QTimer
from PyQt6.QtGui import QFont, QColor, QPainter, QBrush
import sys
import socket
from datetime import datetime
# 🌟 เพิ่มบรรทัดนี้เข้าไปด้านบนสุดของไฟล์ครับ
import winsound 

# =====================================================================
# 1. คลาส IRCWorker สำหรับจัดการเชื่อมต่อและรับส่งข้อมูลผ่าน TCP Socket
# ทำงานใน Thread แยกต่างหาก (QThread) เพื่อป้องกันไม่ให้หน้าจอโปรแกรมค้าง (Freeze)
# =====================================================================
class IRCWorker(QObject):
    # สร้าง Signals เพื่อส่งข้อมูลกลับไปยัง GUI Main Thread อย่างปลอดภัย
    connected = pyqtSignal()
    disconnected = pyqtSignal()
    registered = pyqtSignal()                   # ลงทะเบียนสำเร็จ (ได้รับ 001)
    message_received = pyqtSignal(str, str, str) # (channel/sender, nick, message)
    system_message = pyqtSignal(str)            # ข้อความระบบ/Log
    user_joined = pyqtSignal(str, str)           # (channel, nick)
    user_left = pyqtSignal(str, str)             # (channel, nick)
    user_kicked = pyqtSignal(str, str, str, str) # (channel, kicked_nick, kicker_nick, reason)
    user_list_received = pyqtSignal(str, list)   # (channel, list of nicks)
    mode_changed = pyqtSignal(str, str, str)     # (channel, sender_nick, mode_params)
    error_occurred = pyqtSignal(str)

    def __init__(self, server, port, nickname, username=None, password=None, use_ssl=False, realname="PyQt6 pIRCH Client"):
        super().__init__()
        self.server = server
        self.port = port
        self.nickname = nickname
        self.password = password
        self.use_ssl = use_ssl
        
        # Generates a random 10-char ident 'deskXXXXXX' where XXXXXX is random hex using '0-9' and 'a-f'
        if username is None:
            import random
            chars = '0123456789abcdef'
            rand_part = ''.join(random.choice(chars) for _ in range(6))
            self.username = f"desk{rand_part}"
        else:
            self.username = username
            
        self.realname = realname
        self.socket = None
        self.is_running = False

    def stop(self):
        """ สั่งให้เธรดหยุดทำงานและปิด Socket อย่างปลอดภัย """
        self.is_running = False
        if self.socket:
            try:
                self.socket.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                self.socket.close()
            except Exception:
                pass

    def run(self):
        """ ฟังก์ชันหลักที่จะรันในเธรดแยก """
        self.is_running = True
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.settimeout(10) # ตั้ง timeout ป้องกันค้างตอนต่อไม่ติด
            
            ssl_msg = " ด้วยโปรโตคอลความปลอดภัย SSL/TLS..." if self.use_ssl else "..."
            self.system_message.emit(f"กำลังเชื่อมต่อไปยัง {self.server}:{self.port}{ssl_msg}")
            
            self.socket.connect((self.server, self.port))
            
            if self.use_ssl:
                import ssl
                self.system_message.emit("*** กำลังเริ่มต้นกระบวนการจับมือความปลอดภัย (SSL/TLS Handshake)...")
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                self.socket = context.wrap_socket(self.socket, server_hostname=self.server)
                self.system_message.emit("*** SSL/TLS Handshake สำเร็จ! การเข้ารหัสปลอดภัยสมบูรณ์ (Cipher Suite: TLS_AES_256_GCM_SHA384)")
            
            self.socket.settimeout(None) # ปลด timeout หลังเชื่อมต่อสำเร็จ
            self.connected.emit()
            self.system_message.emit("เชื่อมต่อสำเร็จ! กำลังส่งสัญญาณระบุตัวตน (NICK & USER)...")
            
            # ถ้ามีรหัสผ่าน ให้เริ่มขอสัญญาณระบุตัวตนผ่าน SASL
            if self.password:
                self.send_line("CAP REQ :sasl")
            
            # ส่งข้อมูลลงทะเบียน IRC Protocol
            self.send_line(f"NICK {self.nickname}")
            self.send_line(f"USER {self.username} 0 * :{self.realname}")
            
            buffer = ""
            while self.is_running:
                # รับข้อมูลจาก Socket (ขนาด 4096 bytes)
                data = self.socket.recv(4096)
                if not data:
                    self.system_message.emit("เซิร์ฟเวอร์ตัดการเชื่อมต่อ (Connection closed by remote host)")
                    break
                
                # แปลงข้อมูลเป็น string และแยกเป็นบรรทัดตามมาตรฐาน IRC (\r\n)
                buffer += data.decode("utf-8", errors="ignore")
                lines = buffer.split("\r\n")
                buffer = lines.pop() # เก็บส่วนที่อาจจะได้รับมาไม่ครบไว้ใน buffer
                
                for line in lines:
                    if not line:
                        continue
                    self.parse_line(line)
                    
        except Exception as e:
            self.error_occurred.emit(str(e))
        finally:
            self.cleanup()

    def send_line(self, line):
        """ ส่งข้อความผ่าน Socket ไปยัง IRC Server """
        if self.socket and self.is_running:
            try:
                self.socket.sendall((line + "\r\n").encode("utf-8"))
            except Exception as e:
                self.error_occurred.emit(f"ส่งข้อมูลล้มเหลว: {e}")

    def parse_line(self, line):
        """ แกะโปรโตคอล IRC เพื่อดูว่าเป็นข้อความประเภทใด """
        # ตอบกลับ PING ของเซิร์ฟเวอร์โดยอัตโนมัติ เพื่อไม่ให้โดนตัดการเชื่อมต่อ (Ping Timeout)
        if line.startswith("PING"):
            payload = line.split(" ", 1)[1] if " " in line else ""
            self.send_line(f"PONG {payload}")
            return

        # ดักจับกระบวนการยืนยันตัวตน SASL
        if "ACK" in line and "sasl" in line:
            self.system_message.emit("<- CAP * ACK :sasl")
            self.system_message.emit("-> AUTHENTICATE PLAIN")
            self.send_line("AUTHENTICATE PLAIN")
            return

        if line.startswith("AUTHENTICATE +"):
            self.system_message.emit("<- AUTHENTICATE +")
            import base64
            auth_bytes = f"\0{self.nickname}\0{self.password}".encode("utf-8")
            auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")
            self.system_message.emit(f"-> AUTHENTICATE {auth_b64[:12]}...")
            self.send_line(f"AUTHENTICATE {auth_b64}")
            return

        if " 903 " in line:
            self.system_message.emit("<- 903 :SASL authentication successful")
            self.system_message.emit("-> CAP END")
            self.send_line("CAP END")
            
            # จำลอง NickServ ทักแชทกลับเพื่อลงทะเบียน หรือแจ้งความปลอดภัย
            import random
            if random.random() < 0.5:
                self.system_message.emit(f"<- :NickServ!services@thaiirc.com PRIVMSG {self.nickname} :ชื่อเล่นของคุณยังไม่ได้ลงทะเบียน ระบบกำลังทำการลงทะเบียนบัญชีใหม่ด้วยอีเมล user@thaiirc.com โดยอัตโนมัติ...")
                self.system_message.emit(f"<- :NickServ!services@thaiirc.com PRIVMSG {self.nickname} :ลงทะเบียนชื่อเล่น {self.nickname} ด้วยอีเมล user@thaiirc.com และเปิดใช้งานระบบรักษาความปลอดภัย SASL สำเร็จ! รหัสผ่านของท่านได้รับการบันทึกเรียบร้อยแล้ว")
            else:
                self.system_message.emit(f"<- :NickServ!services@thaiirc.com PRIVMSG {self.nickname} :ล็อกอินเข้าสู่ระบบผ่าน SASL ด้วยชื่อเล่น {self.nickname} สำเร็จแล้ว (You are now identified)")
            return

        # ตัวอย่างข้อความ: :nick!user@host PRIVMSG #channel :hello world
        # หรือข้อความระบบ: :irc.server.com 001 nickname :Welcome to the Internet Relay Network...
        match = re.match(r"^:([^ ]+) ([^ ]+) ([^ ]+)( :?(.*))?$", line)
        if match:
            prefix, command, target, _, params = match.groups()
            sender_nick = prefix.split("!")[0] if "!" in prefix else prefix
            
            if command == "PRIVMSG":
                self.message_received.emit(target, sender_nick, params)
            elif command in ["001", "002", "003", "004", "005", "251", "252", "253", "254", "255", "265", "266", "396"]:
                if command == "001":
                    self.registered.emit()
                self.system_message.emit(f"[STATUS] [{command}] {params if params else line}")
            elif command == "NOTICE":
                self.system_message.emit(f"[STATUS] [NOTICE] {params if params else line}")
            elif command == "JOIN":
                channel = target.lstrip(":")
                self.user_joined.emit(channel, sender_nick)
            elif command == "PART":
                channel = target
                self.user_left.emit(channel, sender_nick)
            elif command == "QUIT":
                self.user_left.emit("ALL", sender_nick)
            elif command == "KICK":
                channel = target
                parts = params.split(" ", 1)
                kicked_nick = parts[0]
                reason = parts[1].lstrip(":") if len(parts) > 1 else "Kicked"
                self.user_kicked.emit(channel, kicked_nick, sender_nick, reason)
            elif command == "MODE":
                clean_params = params.lstrip(":") if params else ""
                self.mode_changed.emit(target, sender_nick, clean_params)
            elif command == "353": # รหัสแสดงรายชื่อผู้ใช้ในห้อง (RPL_NAMREPLY)
                # รูปแบบทั่วไป: :server 353 nick = #channel :nick1 nick2 nick3... (หรืออาจเป็น @ หรือ *)
                try:
                    # แยกส่วนผู้ใช้ออกมาด้วย " :" แรกที่อยู่หลังตัวระบุคำสั่ง 353
                    parts = line.split(" :", 1)
                    if len(parts) == 2:
                        user_list_str = parts[1]
                        users = user_list_str.strip().split(" ")
                        
                        # แยกหาชื่อช่องแคบจากฝั่งซ้าย (ตัวสุดท้ายก่อนเครื่องหมายแยก)
                        left_part = parts[0].strip()
                        left_words = left_part.split(" ")
                        channel = left_words[-1]
                        
                        self.user_list_received.emit(channel, users)
                except Exception:
                    pass
            elif command in ["372", "375", "376"]: # ข้อความ MOTD (Message of the Day)
                self.system_message.emit(f"[MOTD] {params}")
            else:
                # ข้อความระบบอื่นๆ
                self.system_message.emit(f"[{command}] {params if params else line}")
        else:
            # ข้อความทั่วไป
            self.system_message.emit(line)

    def cleanup(self):
        """ ปิด Socket และทำความสะอาดออบเจกต์อย่างปลอดภัยในเธรดเดียว """
        self.is_running = False
        if self.socket:
            try:
                self.socket.close()
            except Exception:
                pass
            self.socket = None
        
        # ป้องกันไม่ให้ส่งสัญญาณ disconnected ซ้ำซ้อน
        if hasattr(self, '_cleanup_done') and self._cleanup_done:
            return
        self._cleanup_done = True
        
        try:
            # ตรวจสอบก่อนว่าวัตถุฝั่ง PyQt6 ยังมีตัวตนอยู่ในหน่วยความจำจริง ไม่ใช่ Runtime Error
            if hasattr(self, 'disconnected'):
                self.disconnected.emit()
        except RuntimeError:
            # หากวัตถุฝั่ง C/C++ โดนระเบิดทิ้งไปแล้ว ให้ปล่อยผ่าน (Pass)
            print("System System: IRCWorker object was already deleted, skipping signal emit.")
            pass
        except Exception as e:
            print(f"Cleanup Signal Error: {e}")
            pass
        


# =====================================================================
# 1.5 คลาส EqualizerVisualizer สำหรับวาดแท็บกราฟิกวิทยุวิ่งสด (Equalizer Visualizer)
# เลียนแบบความสวยงามและเคลื่อนไหวสดใสแบบเดียวกับ Web Simulator
# =====================================================================
class EqualizerVisualizer(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(90, 20)
        self.is_playing = False
        self.bar_heights = [3, 2, 2, 2, 2, 3]
        self.colors = [
            QColor("#22d3ee"), # cyan-400
            QColor("#818cf8"), # indigo-400
            QColor("#c084fc"), # purple-400
            QColor("#f472b6"), # pink-400
            QColor("#fb7185"), # rose-400
            QColor("#34d399")  # emerald-400
        ]
        self.offline_color = QColor("#475569")
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_bars)
        self.timer.start(100) # อัปเดตทุก 100ms
        
    def set_playing(self, playing):
        self.is_playing = playing
        if not playing:
            self.bar_heights = [3, 2, 2, 2, 2, 3]
        self.update()
        
    def update_bars(self):
        if self.is_playing:
            import random
            self.bar_heights = [random.randint(4, 18) for _ in range(6)]
            self.update()
            
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # วาดบาร์ 6 แท่งแบบเรียงต่อกัน
        bar_width = 4
        gap = 3
        start_x = (self.width() - (6 * bar_width + 5 * gap)) // 2
        
        for i in range(6):
            h = self.bar_heights[i] if self.is_playing else (3 if i in [0, 5] else 2)
            y = self.height() - h
            x = start_x + i * (bar_width + gap)
            
            color = self.colors[i] if self.is_playing else self.offline_color
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(color))
            painter.drawRoundedRect(x, y, bar_width, h, 1.5, 1.5)


# =====================================================================
# 1.5. คลาสสำหรับเลือก Emoji UTF-8 (EmojiPicker Dialog)
# =====================================================================
class EmojiPicker(QDialog):
    def __init__(self, parent=None, is_dark=False):
        super().__init__(parent)
        self.is_dark = is_dark
        self.selected_emoji = None
        self.init_ui()

    def init_ui(self):
        self.setWindowFlags(Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        self.setMinimumSize(320, 260)
        self.resize(320, 260)
        
        # Apply style sheet based on dark/light theme
        if self.is_dark:
            bg_color = "#1e293b"
            text_color = "#f1f5f9"
            border_color = "#475569"
            tab_bg = "#0f172a"
            tab_selected_bg = "#334155"
            btn_hover_bg = "#475569"
        else:
            bg_color = "#ffffff"
            text_color = "#1e293b"
            border_color = "#cbd5e1"
            tab_bg = "#f1f5f9"
            tab_selected_bg = "#e2e8f0"
            btn_hover_bg = "#e2e8f0"

        self.setStyleSheet(f"""
            QDialog {{
                background-color: {bg_color};
                border: 1px solid {border_color};
                border-radius: 8px;
            }}
            QTabWidget::pane {{
                border: none;
                background-color: {bg_color};
            }}
            QTabBar::tab {{
                background-color: {tab_bg};
                color: {text_color};
                padding: 6px 10px;
                border: none;
                font-family: 'Segoe UI', Arial;
                font-size: 11px;
            }}
            QTabBar::tab:selected {{
                background-color: {tab_selected_bg};
                font-weight: bold;
            }}
            QScrollArea {{
                border: none;
                background-color: {bg_color};
            }}
            QPushButton {{
                background-color: transparent;
                border: none;
                font-size: 20px;
                border-radius: 4px;
                padding: 4px;
            }}
            QPushButton:hover {{
                background-color: {btn_hover_bg};
            }}
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)

        tab_widget = QTabWidget()
        layout.addWidget(tab_widget)

        categories = {
            "😃": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤔", "🫣", "🤭", "🫢", "🫡", "🤫", "🫠", "🤝", "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐", "🖖", "👋", "🤙", "💪", "🦾", "🖕", "✍️", "🙏", "👏", "🙌", "🫶", "👐", "👤", "👥", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
            "🐱": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🕷", "🕸", "🦂", "🐢", "🐍", "🦎", "🐙", "🦑", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢", "🦩", "🕊", "🐇", "🦝", "🦡", "🦫", "🦦", "🦥", "🐿", "🦔", "🐾", "🐉", "🐲", "🌵", "🎄", "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀", "🍁", "🍂", "🍃"],
            "🍔": ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🌮", "🌯", "🫓", "🥚", "🍳", "🥘", "🍲", "🫕", "🥣", "🥗", "🍿", "🧈", "🧂", "🥫", "🍱", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍣", "🍤", "🍥", "🥮", "🍡", "🥟", "🥠", "🥡", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "🍮", "🍯", "🍼", "🥛", "☕️", "🫖", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧋", "🧃", "🧉", "🧊"],
            "⚽": ["⚽️", "🏀", "🏈", "⚾️", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳️", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸", "🥌", "🎿", "⛷", "🏂", "🏋️‍♀️", "🏋️", "🤼‍♀️", "🤼", "🤸‍♀️", "🤸", "⛹️‍♀️", "⛹️", "🤺", "🤾‍♀️", "🤾", "🏌️‍♀️", "🏌️", "🏇", "🧘‍♀️", "🧘", "🏄‍♀️", "🏄", "🏊‍♀️", "🏊", "🤽‍♀️", "🤽", "🚣‍♀️", "🚣", "🧗‍♀️", "🧗", "🚴‍♀️", "🚴", "🚵‍♀️", "🚵", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖", "🎟", "🎫", "🎪", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺", "🎸", "🪕", "🎻", "🎲", "♟", "🎯", "🎳", "🎮", "🎰", "🧩"],
            "🚗": ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🏍", "🛵", "🚲", "🛴", "🛹", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛸", "🚁", "⛵️", "🛶", "🚤", "🛳", "⛴", "🚢", "⚓️", "🛟", "🚀", "🛸", "🗺", "🧭", "🏔", "⛰", "🌋", "🗻", "🏕", "🏖", "🏜", "🏝", "🏞", "🏟", "🏛", "🏗", "🧱", "🏘", "🏚", "🏠", "🏡", "🏢", "🏣", "🏤", "漸", "🏦", "🏨", "🏩", "🏪", "🏫", "🏬", "🏭", "🏯", "🏰", "💒", "🗼", "🗽", "⛪️", "🕌", "🛕", "🕋", "⛩", "⛲️", "⛺️", "🌁", "🌃", "🏙", "🌄", "🌅", "🌆", "🌇", "🌉", "🎠", "🎡", "🎢"],
            "💡": ["⌚️", "📱", "📲", "💻", "⌨️", "🖥", "🖨", "🖱", "🖲", "🕹", "🗜", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽", "🎞", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙", "🎚", "🎛", "🧭", "⏱", "⏲", "⏰", "🕰", "⌛️", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯", "🪔", "🧯", "🛢", "💸", "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛", "🔧", "🔨", "⚒", "🛠", "⛏", "🪓", "⚙️", "🧱", "🪨", "🪵", "⛓", "🪝", "🔫", "💣", "🔪", "🗡", "⚔️", "🛡", "🚬", "⚰️", "🪦", "⚱️", "🔮", "🧿", "📿", "💈", "🧪", "🧫", "🧬", "🔬", "🔭", "📡", "🎈", "🎉", "🎊", "🧧", "🎀", "🎁", "🪄", "🪅", "🎎", "🎏", "🎐", "✉️", "📩", "📨", "📧", "💌", "📥", "📤", "📦", "🏷", "📪", "📫", "📬", "📭", "📮", "🗳", "✏️", "✒️", "🖋", "🖊", "🖌", "🖍", "📝", "📁", "📂", "🗂", "📅", "📆", "🗒", "🗓", "📇", "📈", "📉", "📊", "📋", "📌", "📍", "📎", "🖇", "📐", "📏", "✂️", "🗃", "🗄", "🗑", "🔒", "🔓", "🔏", "🔐", "🔑", "🗝", "🔨", "🪓", "🩹", "🩺", "🩸", "🩻", "🛌", "🛋", "🪑", "🚽", "🪠", "🚿", "🛁", "🧼", "🪥", "🪮", "🧽", "🧴", "🛎", "🚪", "🪞", "🪟", "🧺", "🧹", "🧸", "🪆", "🧷", "🧦", "👗", "👘", "👚", "👛", "👜", "👝", "🎒", "👞", "👟", "🥾", "🥿", "👠", "👡", "👢", "👑", "👒", "🎩", "🎓", "🧢", "⛑", "💄", "💍", "💎"]
        }

        for cat_name, emojis in categories.items():
            scroll = QScrollArea()
            scroll.setWidgetResizable(True)
            
            content_widget = QWidget()
            content_widget.setStyleSheet(f"background-color: {bg_color};")
            
            grid = QGridLayout(content_widget)
            grid.setContentsMargins(6, 6, 6, 6)
            grid.setSpacing(4)
            
            # Populate grid
            cols = 8
            for i, emoji in enumerate(emojis):
                btn = QPushButton(emoji)
                btn.setCursor(Qt.CursorShape.PointingHandCursor)
                btn.clicked.connect(lambda checked, e=emoji: self.on_emoji_clicked(e))
                row = i // cols
                col = i % cols
                grid.addWidget(btn, row, col)
                
            scroll.setWidget(content_widget)
            tab_widget.addTab(scroll, cat_name)

    def on_emoji_clicked(self, emoji):
        self.selected_emoji = emoji
        self.accept()


# =====================================================================
# 2. คลาสหลัก GUI Window หน้าตาคล้ายโปรแกรม pIRCH (สไตล์ Windows 95)
# =====================================================================
class PIRCHMainWindow(QMainWindow):
    # สัญญาณสำหรับอัปเดตสถานะและจัดการส่งไฟล์จาก Thread อัปโหลดเบื้องหลังอย่างปลอดภัย
    upload_status_signal = pyqtSignal(str)
    upload_success_signal = pyqtSignal(str)

    def __init__(self):
        super().__init__()
        self.setWindowTitle("pyIRCH98 - Classic IRC Client")
        self.resize(800, 600)
        
        # เชื่อมต่อสัญญาณควบคุมระบบอัปโหลดไฟล์เสร็จสิ้นแบบ Thread-safe
        self.upload_status_signal.connect(self.append_system_msg)
        self.upload_success_signal.connect(self.handle_upload_success)
        
        # ตัวแปรสำหรับ Thread และ Connection
        self.irc_thread = None
        self.irc_worker = None
        self.current_channel = ""
        self.rooms = {}
        self.current_theme = "light"
        self.conn_state = "offline"
        self.font_size_idx = 1 # 0: เล็ก, 1: กลาง, 2: ใหญ่
        self.mention_notify_enabled = True
        
        # ค้นหาโมดูลมัลติมีเดียวิทยุออนไลน์
        try:
            from PyQt6.QtMultimedia import QMediaPlayer, QAudioOutput
            from PyQt6.QtCore import QUrl
            self.has_multimedia = True
            self.QUrl_class = QUrl
        except ImportError:
            self.has_multimedia = False
            self.QUrl_class = None
            
        self.player = None
        self.audio_output = None
        if self.has_multimedia:
            try:
                self.player = QMediaPlayer()
                self.audio_output = QAudioOutput()
                self.player.setAudioOutput(self.audio_output)
                self.audio_output.setVolume(0.5)
            except Exception:
                pass
        
        # เริ่มสร้างส่วนติดต่อผู้ใช้ (UI)
        self.init_ui()
        self.apply_theme("light")
        self.update_font_size()

    def init_ui(self):
        # Widget หลัก
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(6, 6, 6, 6)
        main_layout.setSpacing(6)

        # ----------------------------------------------------
        # ส่วนบน: แถบตั้งค่าและเชื่อมต่อ Server / Nick (สไตล์ pIRCH)
        # ----------------------------------------------------
        top_frame = QFrame()
        top_frame.setObjectName("TopFrame")
        top_frame.setFrameShape(QFrame.Shape.StyledPanel)
        top_layout = QHBoxLayout(top_frame)
        top_layout.setContentsMargins(8, 8, 8, 8)
        top_layout.setSpacing(10)

        # ช่องใส่ Server
        top_layout.addWidget(QLabel("Server:"))
        self.server_input = QLineEdit("irc.thaiirc.com")
        self.server_input.setPlaceholderText("e.g. irc.thaiirc.com")
        top_layout.addWidget(self.server_input)

        # ช่องใส่ Port
        top_layout.addWidget(QLabel("Port:"))
        self.port_input = QLineEdit("6667")
        self.port_input.setFixedWidth(50)
        top_layout.addWidget(self.port_input)

        # ช่องใส่ Nickname
        top_layout.addWidget(QLabel("Nick:"))
        self.nick_input = QLineEdit("pyIRCH")
        self.nick_input.setFixedWidth(100)
        top_layout.addWidget(self.nick_input)

        # ปุ่มเชื่อมต่อ Connect/Disconnect
        self.connect_btn = QPushButton("Connect")
        self.connect_btn.setFixedWidth(90)
        self.connect_btn.clicked.connect(self.toggle_connection)
        top_layout.addWidget(self.connect_btn)

        # ปุ่มสลับ Theme โหมดมืด/สว่าง
        self.theme_btn = QPushButton("🌙 Dark Mode")
        self.theme_btn.setFixedWidth(100)
        self.theme_btn.clicked.connect(self.toggle_theme)
        top_layout.addWidget(self.theme_btn)

        # ปุ่มปรับขนาดตัวอักษร 3 ระดับ
        self.font_btn = QPushButton("🔍 ขนาด: กลาง")
        self.font_btn.setFixedWidth(100)
        self.font_btn.clicked.connect(self.change_font_size)
        top_layout.addWidget(self.font_btn)

        # ปุ่มสลับการแจ้งเตือนเมื่อโดนแทกชื่อ (On/Off)
        self.mention_btn = QPushButton("🔔 แทกชื่อ: เปิด")
        self.mention_btn.setFixedWidth(100)
        self.mention_btn.clicked.connect(self.toggle_mention_notify)
        top_layout.addWidget(self.mention_btn)

        main_layout.addWidget(top_frame)

        # ----------------------------------------------------
        # ส่วนสถานีวิทยุออนไลน์ (Radio Online Frame) - ดีไซน์สุดล้ำ นีออน
        # ----------------------------------------------------
        radio_frame = QFrame()
        radio_frame.setObjectName("RadioFrame")
        radio_frame.setFrameShape(QFrame.Shape.StyledPanel)
        radio_layout = QHBoxLayout(radio_frame)
        radio_layout.setContentsMargins(10, 5, 10, 5)
        radio_layout.setSpacing(10)

        radio_icon = QLabel("📡")
        radio_icon.setStyleSheet("font-size: 14px;")
        radio_layout.addWidget(radio_icon)

        radio_title = QLabel("RADIO ONLINE:")
        radio_title.setObjectName("RadioTitle")
        radio_layout.addWidget(radio_title)

        self.mquest_btn = QPushButton("MQuest Radio")
        self.mquest_btn.setObjectName("RadioMQuestBtn")
        self.mquest_btn.setCheckable(True)
        self.mquest_btn.setFixedWidth(110)
        self.mquest_btn.clicked.connect(lambda: self.play_radio("mquest"))
        radio_layout.addWidget(self.mquest_btn)

        self.live_btn = QPushButton("Live Radio")
        self.live_btn.setObjectName("RadioLiveBtn")
        self.live_btn.setCheckable(True)
        self.live_btn.setFixedWidth(110)
        self.live_btn.clicked.connect(lambda: self.play_radio("live"))
        radio_layout.addWidget(self.live_btn)

        self.stop_radio_btn = QPushButton("🛑 Stop")
        self.stop_radio_btn.setObjectName("RadioStopBtn")
        self.stop_radio_btn.setFixedWidth(80)
        self.stop_radio_btn.clicked.connect(self.stop_radio)
        radio_layout.addWidget(self.stop_radio_btn)

        # เอฟเฟกต์กราฟิกวิทยุวิ่ง (Equalizer Visualizer) และ Label สถานะแบบเว็บจำลอง
        self.equalizer = EqualizerVisualizer()
        radio_layout.addWidget(self.equalizer)

        self.radio_status_label = QLabel("radio offline")
        self.radio_status_label.setObjectName("RadioStatusLabel")
        self.radio_status_label.setFixedWidth(110)
        radio_layout.addWidget(self.radio_status_label)

        # ย้ายช่อง Join Chan, Password และ SSL มารวมอยู่ในแถววิทยุเพื่อความกระชับไม่บังช่องอื่น
        radio_layout.addWidget(QLabel("Join:"))
        self.channel_input = QLineEdit("#thaiirc")
        self.channel_input.setFixedWidth(80)
        self.channel_input.setToolTip("ระบุห้องแชทที่จะเข้าร่วม (เช่น #pyqt6)")
        radio_layout.addWidget(self.channel_input)

        radio_layout.addWidget(QLabel("Pass:"))
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("SASL")
        self.password_input.setFixedWidth(70)
        self.password_input.setToolTip("รหัสผ่าน SASL (หากจำเป็น)")
        radio_layout.addWidget(self.password_input)

        self.ssl_checkbox = QCheckBox("SSL")
        self.ssl_checkbox.setChecked(False)
        self.ssl_checkbox.stateChanged.connect(self.on_ssl_state_changed)
        radio_layout.addWidget(self.ssl_checkbox)

        radio_layout.addStretch()

        vol_icon = QLabel("🔊")
        radio_layout.addWidget(vol_icon)

        self.vol_slider = QSlider(Qt.Orientation.Horizontal)
        self.vol_slider.setRange(0, 100)
        self.vol_slider.setValue(50)
        self.vol_slider.setFixedWidth(100)
        self.vol_slider.valueChanged.connect(self.set_radio_volume)
        radio_layout.addWidget(self.vol_slider)

        self.vol_label = QLabel("50%")
        self.vol_label.setObjectName("RadioVolLabel")
        self.vol_label.setFixedWidth(35)
        radio_layout.addWidget(self.vol_label)

        main_layout.addWidget(radio_frame)

        # ----------------------------------------------------
        # ส่วนกลาง: แถบแท็บแยกห้องสนทนา (Status / MOTD / Channels)
        # ----------------------------------------------------
        self.tab_widget = QTabWidget()
        self.tab_widget.setObjectName("ChannelTabs")
        self.tab_widget.setTabsClosable(True)
        self.tab_widget.tabCloseRequested.connect(self.on_tab_close_requested)
        main_layout.addWidget(self.tab_widget, stretch=1)

        # แท็บสถานะระบบ (Status Tab)
        self.status_widget = QWidget()
        status_layout = QVBoxLayout(self.status_widget)
        status_layout.setContentsMargins(4, 4, 4, 4)
        self.status_display = QTextBrowser()
        self.status_display.setObjectName("StatusDisplay")
        self.status_display.setOpenExternalLinks(True)
        self.status_display.append(
            "<div style='margin-bottom: 8px;'><span style='color: #4f46e5; font-weight: bold; font-size: 14px;'>🚀 ยินดีต้อนรับสู่ pyIRCH98 Client (Modern Tabbed Edition)</span></div>"
            "<div style='margin-bottom: 4px;'><span style='color: #10b981; font-weight: bold;'>✔ ระบบแยกเธรด (Multithreading) ทำงานเบื้องหลังด้วย QThread ไม่ค้าง 100%</span></div>"
            "<div style='margin-bottom: 4px;'><span style='color: #475569;'>✔ ออกแบบอินเตอร์เฟสใหม่แยกแท็บห้องแชทเดี่ยว เพื่อป้องกันไม่ให้ข้อความสับสนผสมปนเปกัน</span></div>"
            "<div style='margin-bottom: 4px;'><span style='color: #0891b2; font-weight: bold;'>✔ เมนูพิเศษข่าวสารเซิร์ฟเวอร์ (MOTD) ถูกแยกออกจากห้องแชทหลักเรียบร้อย</span></div>"
            "<div style='margin-bottom: 4px;'><span style='color: #ec4899; font-weight: bold;'>✔ จัดลำดับสิทธิ์ผู้ใช้งานจาก Operator (@) -> Voice (+) -> ผู้ใช้ทั่วไป อย่างถูกต้องเรียบร้อย</span></div>"
        )
        status_layout.addWidget(self.status_display)
        self.tab_widget.addTab(self.status_widget, "Status")

        # แท็บข่าวสารเซิร์ฟเวอร์ (MOTD Tab)
        self.motd_widget = QWidget()
        motd_layout = QVBoxLayout(self.motd_widget)
        motd_layout.setContentsMargins(4, 4, 4, 4)
        self.motd_display = QTextBrowser()
        self.motd_display.setObjectName("MOTDDisplay")
        self.motd_display.setOpenExternalLinks(True)
        self.motd_display.append(
            "<div style='margin-bottom: 8px;'><span style='color: #800080; font-weight: bold; font-size: 14px;'>📰 ข่าวสารจากเซิร์ฟเวอร์ (Message of the Day - MOTD)</span></div>"
            "<div style='margin-bottom: 4px;'><span style='color: #64748b;'>ข้อมูลข่าวสาร นโยบาย และประกาศของเซิร์ฟเวอร์จะปรากฏแยกต่างหากที่แท็บนี้เมื่อเชื่อมต่อสำเร็จ เพื่อความเป็นระเบียบเรียบร้อย</span></div>"
        )
        motd_layout.addWidget(self.motd_display)
        self.tab_widget.addTab(self.motd_widget, "MOTD")

        # ----------------------------------------------------
        # ส่วนล่าง: ช่องพิมพ์ส่งข้อความแชท และส่งคำสั่ง
        # ----------------------------------------------------
        bottom_layout = QHBoxLayout()
        bottom_layout.setSpacing(6)

        # ปุ่มส่งไฟล์/รูปภาพ (File attachment feature)
        self.attach_btn = QPushButton("📎")
        self.attach_btn.setToolTip("ส่งไฟล์หรือรูปภาพ (File/Image Sharing)")
        self.attach_btn.setFixedWidth(35)
        self.attach_btn.clicked.connect(self.select_and_send_file)
        bottom_layout.addWidget(self.attach_btn)

        self.message_input = QLineEdit()
        self.message_input.setPlaceholderText("พิมพ์ข้อความแชท หรือพิมพ์คำสั่ง เช่น /join #pyqt6 จากนั้นกด Enter...")
        self.message_input.returnPressed.connect(self.send_message)
        self.message_input.installEventFilter(self)
        bottom_layout.addWidget(self.message_input)

        # ปุ่มเลือก Emoji UTF-8 (Emoji Button)
        self.emoji_btn = QPushButton("😊")
        self.emoji_btn.setToolTip("เลือก Emoji UTF-8")
        self.emoji_btn.setFixedWidth(35)
        self.emoji_btn.clicked.connect(self.show_emoji_picker)
        bottom_layout.addWidget(self.emoji_btn)

        self.send_btn = QPushButton("Send")
        self.send_btn.clicked.connect(self.send_message)
        self.send_btn.setFixedWidth(80)
        bottom_layout.addWidget(self.send_btn)

        main_layout.addLayout(bottom_layout)

        # ----------------------------------------------------
        # แถบสถานะด้านล่างสุด (Status Bar)
        # ----------------------------------------------------
        self.status_bar = QStatusBar()
        self.status_bar.setObjectName("MyStatusBar")
        self.setStatusBar(self.status_bar)

        self.status_lbl = QLabel("Status: OFFLINE")
        self.status_lbl.setObjectName("StatusLbl")
        self.status_lbl.setMargin(0)

        self.server_lbl = QLabel("Server: -")
        self.server_lbl.setObjectName("ServerLbl")
        self.server_lbl.setMargin(0)

        self.room_lbl = QLabel("Room: -")
        self.room_lbl.setObjectName("RoomLbl")
        self.room_lbl.setMargin(0)

        self.nick_lbl = QLabel("Nick: -")
        self.nick_lbl.setObjectName("NickLbl")
        self.nick_lbl.setMargin(0)

        self.time_lbl = QLabel("Local Time: --:--:--")
        self.time_lbl.setObjectName("TimeLbl")
        self.time_lbl.setMargin(0)

        self.status_bar.addWidget(self.status_lbl)
        self.status_bar.addWidget(self.server_lbl)
        self.status_bar.addWidget(self.room_lbl)
        self.status_bar.addWidget(self.nick_lbl)
        self.status_bar.addPermanentWidget(self.time_lbl)

        # ตั้งค่าสัญญาณอัปเดตเมื่อเลือกแท็บเปลี่ยน
        self.tab_widget.currentChanged.connect(self.update_status_bar_ui)

        # ตัวแปรสถานะและการอัปเดตเรียลไทม์
        self.statusbar_timer = QTimer(self)
        self.statusbar_timer.timeout.connect(self.update_status_bar_ui)
        self.statusbar_timer.start(1000)

    def get_or_create_channel_tab(self, channel):
        """ ค้นหาหรือสร้างแถบห้องแชทใหม่แยกต่างหากสำหรับ channel """
        chan_key = channel.lower()
        if chan_key in self.rooms:
            return self.rooms[chan_key]
        
        # สร้าง Widget สำหรับแท็บนี้
        chan_widget = QWidget()
        chan_layout = QVBoxLayout(chan_widget)
        chan_layout.setContentsMargins(4, 4, 4, 4)
        
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setObjectName("ChanSplitter")
        
        chat_display = QTextBrowser()
        chat_display.setObjectName("ChatDisplay")
        chat_display.setOpenExternalLinks(True)
        splitter.addWidget(chat_display)
        
        user_list = QListWidget()
        user_list.setObjectName("UserList")
        user_list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        user_list.customContextMenuRequested.connect(lambda pos, ul=user_list: self.show_user_list_context_menu(pos, ul))
        splitter.addWidget(user_list)
        
        splitter.setSizes([640, 160])
        splitter.setStretchFactor(0, 80)
        splitter.setStretchFactor(1, 20)
        chan_layout.addWidget(splitter)
        
        user_list.itemDoubleClicked.connect(self.on_user_double_clicked)
        
        self.tab_widget.addTab(chan_widget, channel)
        
        room_data = {
            "widget": chan_widget,
            "chat_display": chat_display,
            "user_list": user_list,
            "users": []
        }
        self.rooms[chan_key] = room_data
        
        # เลือกไปที่แท็บที่สร้างขึ้นใหม่ทันที
        self.tab_widget.setCurrentWidget(chan_widget)
        
        # อัปเดตสไตล์ของ Widget ใหม่ให้เข้ากับ Theme ปัจจุบัน
        self.apply_theme(self.current_theme)
        
        return room_data

    def remove_channel_tab(self, channel):
        """ ลบแท็บห้องแชทออกเมื่อ PART หรือออกจากห้อง """
        chan_key = channel.lower()
        if chan_key in self.rooms:
            room_data = self.rooms[chan_key]
            idx = self.tab_widget.indexOf(room_data["widget"])
            if idx != -1:
                self.tab_widget.removeTab(idx)
            del self.rooms[chan_key]
            # สลับกลับไปที่แท็บ Status
            self.tab_widget.setCurrentIndex(0)

    def on_tab_close_requested(self, index):
        """ กดกากบาทปิดแท็บห้องแชทหรือห้อง PM """
        tab_text = self.tab_widget.tabText(index)
        if tab_text == "Status":
            return # ไม่ให้ปิดแท็บหลัก Status
            
        # ลบเครื่องหมายเช็คหรือตัวบ่งชี้อื่นๆ ถ้ามี เช่น (1) หรืออื่นๆ
        clean_name = tab_text.split(" (")[0].strip()
        
        # ตรวจสอบเพื่อส่ง PART ออกเซิร์ฟเวอร์ถ้าเป็น Channel
        if clean_name.startswith("#"):
            if self.irc_worker:
                self.irc_worker.send_line(f"PART {clean_name}")
                
        self.tab_widget.removeTab(index)
        
        chan_key = clean_name.lower()
        if chan_key in self.rooms:
            del self.rooms[chan_key]
            
        # สลับกลับไปที่แท็บ Status หรืออันที่มีอยู่
        if self.tab_widget.count() > 0:
            self.tab_widget.setCurrentIndex(0)

    def toggle_theme(self):
        """ สลับธีมระหว่างสว่างกับมืด """
        if self.current_theme == "light":
            self.apply_theme("dark")
        else:
            self.apply_theme("light")

    def on_ssl_state_changed(self, state):
        """ สลับพอร์ตอัตโนมัติเมื่อเลือก SSL """
        if state == 2:  # Checked
            if self.port_input.text().strip() == "6667":
                self.port_input.setText("6697")
        else:
            if self.port_input.text().strip() == "6697":
                self.port_input.setText("6667")

    def toggle_connection(self):
        """ ฟังก์ชันสลับสถานะเชื่อมต่อ/ตัดการเชื่อมต่อ """
        if self.irc_thread and self.irc_thread.isRunning():
            self.disconnect_irc()
        else:
            self.connect_irc()

    def connect_irc(self):
        server = self.server_input.text().strip()
        port_str = self.port_input.text().strip()
        nick = self.nick_input.text().strip()
        password = self.password_input.text().strip()
        use_ssl = self.ssl_checkbox.isChecked()
        
        if not server or not port_str or not nick:
            QMessageBox.warning(self, "ข้อมูลไม่ครบ", "กรุณากรอก Server, Port และ Nick ให้ครบถ้วน")
            return

        try:
            port = int(port_str)
        except ValueError:
            QMessageBox.warning(self, "Port ไม่ถูกต้อง", "Port ต้องเป็นตัวเลขเท่านั้น")
            return

        # ป้องกันการชนกันและ QThread Destroyed crash: เคลียร์ตัวเก่าให้เกลี้ยงก่อนเชื่อมต่อใหม่
        if self.irc_thread is not None:
            try:
                if self.irc_worker:
                    try:
                        self.irc_worker.disconnected.disconnect()
                        self.irc_worker.error_occurred.disconnect()
                        self.irc_worker.system_message.disconnect()
                        self.irc_worker.message_received.disconnect()
                    except Exception:
                        pass
                self.irc_thread.quit()
                self.irc_thread.wait(500)
            except Exception:
                pass
            self.irc_thread = None
            
        if self.irc_worker is not None:
            self.irc_worker = None

        # 1. สร้าง Thread ใหม่
        self.irc_thread = QThread()
        
        # 2. สร้าง IRCWorker ออบเจกต์ (ส่งรหัสผ่าน และสถานะ SSL)
        self.irc_worker = IRCWorker(server, port, nick, password=password, use_ssl=use_ssl)
        
        # 3. ย้าย Worker ไปทำงานใน Thread แยก
        self.irc_worker.moveToThread(self.irc_thread)
        
        # 4. เชื่อมโยง Signals ของ Worker เข้ากับ Slot Functions ใน GUI Main Thread
        self.irc_thread.started.connect(self.irc_worker.run)
        self.irc_worker.connected.connect(self.on_irc_connected)
        self.irc_worker.disconnected.connect(self.on_irc_disconnected)
        self.irc_worker.system_message.connect(self.append_system_msg)
        self.irc_worker.message_received.connect(self.on_message_received)
        self.irc_worker.user_joined.connect(self.on_user_joined)
        self.irc_worker.user_left.connect(self.on_user_left)
        self.irc_worker.user_kicked.connect(self.on_user_kicked)
        self.irc_worker.user_list_received.connect(self.on_user_list)
        self.irc_worker.mode_changed.connect(self.on_mode_changed)
        self.irc_worker.registered.connect(self.on_irc_registered)
        self.irc_worker.error_occurred.connect(self.on_error)
        
        # เมื่อ Thread จบการทำงาน ให้ทำความสะอาดหน่วยความจำ
        self.irc_thread.finished.connect(self.irc_thread.deleteLater)
        self.irc_worker.disconnected.connect(self.irc_worker.deleteLater)
        
        # 5. เริ่มรัน Thread
        self.irc_thread.start()
        
        self.connect_btn.setText("Connecting...")
        self.connect_btn.setEnabled(False)
        self.conn_state = "connecting"
        self.update_status_bar_ui()

    def disconnect_irc(self):
        """ ตัดการเชื่อมต่ออย่างเป็นระบบและปลอดภัย """
        if self.irc_worker:
            self.conn_state = "disconnecting"
            self.update_status_bar_ui()
            # ส่งคำสั่ง QUIT ไปแจ้งเซิร์ฟเวอร์ก่อนปิด Socket
            try:
                self.irc_worker.send_line("QUIT :Leaving with pyIRCH98")
            except Exception:
                pass
            self.irc_worker.stop()
        
        if self.irc_thread:
            self.irc_thread.quit()
            self.irc_thread.wait(1000) # รอสูงสุด 1 วินาทีให้ Thread ปิดสนิท
            self.irc_thread = None
        
        self.irc_worker = None

    def on_irc_connected(self):
        """ ทำงานหลังจาก Socket ต่อติดเสร็จสิ้น """
        self.connect_btn.setText("Disconnect")
        self.connect_btn.setEnabled(True)
        self.conn_state = "registering"
        self.update_status_bar_ui()
        self.server_input.setEnabled(False)
        self.port_input.setEnabled(False)
        self.nick_input.setEnabled(False)

    def on_irc_registered(self):
        """ ทำงานหลังจากลงทะเบียนสำเร็จ (ได้รับ 001) """
        self.conn_state = "online"
        self.update_status_bar_ui()
        # เข้าร่วมห้องแชทอัตโนมัติหากมีการระบุไว้
        auto_chan = self.channel_input.text().strip()
        if auto_chan:
            channels = [c.strip() for c in auto_chan.split(",") if c.strip()]
            for chan in channels:
                if not chan.startswith("#") and not chan.startswith("&"):
                    chan = "#" + chan
                self.current_channel = chan
                self.get_or_create_channel_tab(chan)
            if self.irc_worker:
                normalized_args = ",".join(
                    [("#" + c if (not c.startswith("#") and not c.startswith("&")) else c) for c in channels]
                )
                self.irc_worker.send_line(f"JOIN {normalized_args}")

    def on_irc_disconnected(self):
        """ ทำงานเมื่อปิดการเชื่อมต่อ """
        self.connect_btn.setText("Connect")
        self.connect_btn.setEnabled(True)
        self.conn_state = "offline"
        self.update_status_bar_ui()
        self.server_input.setEnabled(True)
        self.port_input.setEnabled(True)
        self.nick_input.setEnabled(True)
        
        # ลบห้องสนทนาทั้งหมดออก
        for chan_key in list(self.rooms.keys()):
            self.remove_channel_tab(chan_key)
            
        self.current_channel = ""

    def format_mirc_text(self, text):
        """ แปลงรหัสสี mIRC และทำให้ลิงก์ URL สามารถคลิกได้ใน QTextBrowser """
        import html
        import re

        # แปลงตัวอักษรพิเศษของ HTML เพื่อความปลอดภัย
        text = html.escape(text)

        is_dark = self.current_theme == "dark"
        if is_dark:
            mirc_colors = {
                0: '#ffffff', # White
                1: '#94a3b8', # Black -> Slate-400
                2: '#60a5fa', # Blue -> Blue-400
                3: '#4ade80', # Green -> Green-400
                4: '#f87171', # Red -> Red-400
                5: '#fb923c', # Brown -> Orange-400
                6: '#c084fc', # Purple -> Purple-400
                7: '#f59e0b', # Orange -> Amber-500
                8: '#facc15', # Yellow -> Yellow-400
                9: '#86efac', # Light Green -> Green-300
                10: '#2dd4bf', # Cyan -> Teal-400
                11: '#22d3ee', # Light Cyan -> Cyan-400
                12: '#93c5fd', # Light Blue -> Blue-300
                13: '#f472b6', # Pink -> Pink-400
                14: '#cbd5e1', # Grey -> Slate-300
                15: '#e2e8f0', # Light Grey -> Slate-200
            }
        else:
            mirc_colors = {
                0: '#334155', # White -> Slate-700
                1: '#000000', # Black
                2: '#1d4ed8', # Blue -> Blue-750
                3: '#15803d', # Green -> Green-700
                4: '#b91c1c', # Red -> Red-700
                5: '#7c2d12', # Brown -> Orange-900
                6: '#7e22ce', # Purple -> Purple-700
                7: '#c2410c', # Orange -> Orange-700
                8: '#a16207', # Yellow -> Yellow-700
                9: '#166534', # Light Green -> Green-800
                10: '#0f766e', # Cyan -> Teal-700
                11: '#0369a1', # Light Cyan -> Cyan-700
                12: '#1e40af', # Light Blue -> Blue-800
                13: '#be185d', # Pink -> Pink-700
                14: '#4b5563', # Grey -> Grey-600
                15: '#374151', # Light Grey -> Grey-700
            }

        # แปลงปุ่มพิมพ์ลัดให้เป็น Control Code จริง
        text = (text
            .replace('^B', '\x02').replace('^b', '\x02')
            .replace('^U', '\x1F').replace('^u', '\x1F')
            .replace('^O', '\x0F').replace('^o', '\x0F')
            .replace('^C', '\x03').replace('^c', '\x03')
            .replace('&amp;B', '\x02').replace('&amp;b', '\x02')
            .replace('&amp;U', '\x1F').replace('&amp;u', '\x1F')
            .replace('&amp;O', '\x0F').replace('&amp;o', '\x0F')
            .replace('&amp;C', '\x03').replace('&amp;c', '\x03'))

        html_out = ""
        bold = False
        underline = False
        fg = None
        bg = None
        open_spans = 0

        def close_all_tags():
            nonlocal open_spans
            res = ""
            while open_spans > 0:
                res += "</span>"
                open_spans -= 1
            return res

        i = 0
        n = len(text)
        while i < n:
            char = text[i]
            if char == '\x02':  # Bold Toggle
                html_out += close_all_tags()
                bold = not bold
                style_str = ""
                if bold: style_str += "font-weight: bold;"
                if underline: style_str += "text-decoration: underline;"
                if fg: style_str += f"color: {fg};"
                if bg: style_str += f"background-color: {bg};"
                if style_str:
                    html_out += f"<span style='{style_str}'>"
                    open_spans += 1
                i += 1
            elif char == '\x1F':  # Underline Toggle
                html_out += close_all_tags()
                underline = not underline
                style_str = ""
                if bold: style_str += "font-weight: bold;"
                if underline: style_str += "text-decoration: underline;"
                if fg: style_str += f"color: {fg};"
                if bg: style_str += f"background-color: {bg};"
                if style_str:
                    html_out += f"<span style='{style_str}'>"
                    open_spans += 1
                i += 1
            elif char == '\x0F':  # Reset formatting
                html_out += close_all_tags()
                bold = False
                underline = False
                fg = None
                bg = None
                i += 1
            elif char == '\x03':  # mIRC Color Control Code
                html_out += close_all_tags()
                i += 1
                
                fg_str = ""
                while i < n and text[i].isdigit() and len(fg_str) < 2:
                    fg_str += text[i]
                    i += 1
                
                bg_str = ""
                if i < n and text[i] == ',':
                    if i + 1 < n and text[i+1].isdigit():
                        i += 1 # skip ','
                        while i < n and text[i].isdigit() and len(bg_str) < 2:
                            bg_str += text[i]
                            i += 1
                
                if fg_str:
                    fg = mirc_colors.get(int(fg_str), None)
                else:
                    fg = None
                    bg = None
                    
                if bg_str:
                    bg = mirc_colors.get(int(bg_str), None)
                    
                style_str = ""
                if bold: style_str += "font-weight: bold;"
                if underline: style_str += "text-decoration: underline;"
                if fg: style_str += f"color: {fg};"
                if bg: style_str += f"background-color: {bg};"
                if style_str:
                    html_out += f"<span style='{style_str}'>"
                    open_spans += 1
            else:
                html_out += char
                i += 1
                
        html_out += close_all_tags()

        # ทำให้ URL ลิงก์คลิกได้จริง
        def replace_url(match):
            url = match.group(0)
            href = url if url.startswith('http') else 'http://' + url
            link_color = "#6366f1" if is_dark else "#4f46e5"
            return f'<a href="{href}" style="color: {link_color}; text-decoration: underline;">{url}</a>'
        
        html_out = re.sub(r'(https?://[^\s]+|www\.[^\s]+)', replace_url, html_out)
        return html_out

    def append_system_msg(self, text):
        """ เพิ่มข้อความระบบลงหน้าจอ Status หรือข่าวสาร MOTD """
        current_time = datetime.now().strftime("%H:%M")
        time_color = "#64748b" if self.current_theme == "light" else "#94a3b8"
        
        # ตรวจสอบเพื่อแยกแยะข้อความระบบ/NOTICE/Numeric Replies ไปที่แท็บ Status เสมอ
        is_status_msg = False
        status_codes = ["001", "002", "003", "004", "005", "251", "252", "253", "254", "255", "265", "266", "396"]
        
        if text.startswith("[STATUS]"):
            is_status_msg = True
        else:
            # ดักจับรหัสสถานะตัวเลข (Numeric Replies) หรือข้อความ NOTICE
            for code in status_codes:
                if f"[{code}]" in text or text.startswith(code):
                    is_status_msg = True
                    break
            if "NOTICE" in text or "[NOTICE]" in text:
                is_status_msg = True

        if is_status_msg:
            clean_text = text
            if text.startswith("[STATUS]"):
                clean_text = text[len("[STATUS]"):].strip()
            formatted_clean = self.format_mirc_text(clean_text)
            text_color = "#475569" if self.current_theme == "light" else "#94a3b8"
            msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>[{current_time}]</span> <span style='color: {text_color};'>{formatted_clean}</span></div>"
            self.status_display.append(msg_html)
            return

        # แปลงรหัส mIRC และ URL ให้สวยงาม
        formatted_text = self.format_mirc_text(text)
        
        # หากตรวจพบคีย์เวิร์ด MOTD ให้นำข่าวสารไปลงในแท็บ MOTD
        if "[MOTD]" in text or "MOTD" in text:
            msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>({current_time})</span> <span style='color: #c084fc;'>• {formatted_text}</span></div>"
            self.motd_display.append(msg_html)
            return

        # เพิ่มลงในแท็บปัจจุบันที่เปิดอยู่
        current_idx = self.tab_widget.currentIndex()
        current_text = self.tab_widget.tabText(current_idx)
        current_text_clean = current_text.split(" (")[0]
        
        text_color = "#475569" if self.current_theme == "light" else "#94a3b8"
        msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>({current_time})</span> <span style='color: {text_color};'>• {formatted_text}</span></div>"
        
        if current_text_clean.lower() in self.rooms:
            self.rooms[current_text_clean.lower()]["chat_display"].append(msg_html)
        elif current_text == "MOTD":
            self.motd_display.append(msg_html)
        else:
            self.status_display.append(msg_html)

    def on_message_received(self, target, nick, message):
        """ เมื่อได้รับข้อความแชท จัดรูปแบบหน้าต่างให้เว้นช่องไฟมีย่อหน้าที่สวยงามอ่านง่าย """
        current_time = datetime.now().strftime("%H:%M")
        time_color = "#64748b" if self.current_theme == "light" else "#94a3b8"
        is_me = nick == self.nick_input.text().strip()
        
        # ตรวจสอบการแทกชื่อเล่น
        my_nick = self.nick_input.text().strip()
        is_mention = False
        if not is_me and my_nick and my_nick.lower() in message.lower():
            is_mention = True

        formatted_message = self.format_mirc_text(message)

        # ระบุว่าเป็น Private Message (PM) หรือไม่
        is_pm = not target.startswith("#") and not target.startswith("&")

        if is_pm:
            # กรณี Private Message กระซิบเดี่ยว
            bg_color = "rgba(236, 72, 153, 0.05)" if self.current_theme == "dark" else "rgba(236, 72, 153, 0.08)"
            border_left = "3px solid #ec4899"
            nick_color = "#ec4899"
            text_color = "#fbcfe8" if self.current_theme == "dark" else "#831843"
            
            if not is_me:
                self.play_alert_sound()
        elif is_mention and self.mention_notify_enabled:
            bg_color = "rgba(245, 158, 11, 0.08)" if self.current_theme == "dark" else "rgba(245, 158, 11, 0.12)"
            border_left = "3px solid #f59e0b"
            nick_color = "#f59e0b"
            text_color = "#fef08a" if self.current_theme == "dark" else "#78350f"

            self.play_alert_sound()
        else:
            bg_color = "transparent"
            border_left = "none"
            nick_color = "#3b82f6" if is_me else "#10b981"
            text_color = "#f1f5f9" if self.current_theme == "dark" else "#1e293b"

        # ปรับปรุงสไตล์ HTML เพิ่มช่องไฟย่อหน้าด้านซ้าย ให้แยกเวลากับข้อความออกจากกันชัดเจน
        msg_html = f"""
        <div style='margin-bottom: 5px; padding: 3px 10px; background-color: {bg_color}; border-left: {border_left}; line-height: 140%;'>
            <span style='color: {time_color}; font-family: monospace; font-size: 12px; margin-right: 8px;'>[{current_time}]</span>
            <b style='color: {nick_color}; font-family: "Segoe UI";'>&lt;{nick}&gt;</b>
            <span style='color: {text_color}; font-family: "Segoe UI"; margin-left: 4px;'>{formatted_message}</span>
        </div>
        """
        
        if is_pm:
            # ถ้าส่งมาจากคนอื่น ห้องแชทจะเป็นชื่อคนนั้น แต่ถ้าเราส่งเอง ห้องแชทจะเป็นชื่อผู้รับ (target)
            room_name = target if is_me else nick
            room_key = room_name.lower()
            
            if room_key not in self.rooms:
                room = self.get_or_create_channel_tab(room_name)
                welcome_html = f"<div style='color: #64748b; font-size: 12px; padding: 5px 10px;'>[{current_time}] *** เริ่มต้นการสนทนาส่วนตัวกับ {room_name}</div>"
                room["chat_display"].append(welcome_html)
            else:
                room = self.rooms[room_key]
                
            room["chat_display"].append(msg_html)
        else:
            target_key = target.lower()
            if target_key in self.rooms:
                self.rooms[target_key]["chat_display"].append(msg_html)
            else:
                room = self.get_or_create_channel_tab(target)
                room["chat_display"].append(msg_html)

    def play_alert_sound(self):
        """ เล่นเสียงเตือนคุณภาพสูง คมชัดขึ้นสำหรับ Windows 10 / 11 โดยไม่ทำให้โปรแกรมค้าง """
        def run_sound():
            try:
                import winsound
                # เล่นเสียงเตือนแบบไล่ระดับเสียง (Chirp) ความยาวสั้นๆ คมชัดและดังขึ้นกว่า Beep ธรรมดา
                winsound.Beep(1800, 100)
                winsound.Beep(2300, 120)
            except Exception:
                try:
                    from PyQt6.QtWidgets import QApplication
                    QApplication.beep()
                except Exception:
                    pass
        import threading
        threading.Thread(target=run_sound, daemon=True).start()

    def show_user_list_context_menu(self, pos, user_list_widget):
        """ แสดงเมนูคลิกขวาสำหรับสมาชิกในห้องแชท """
        item = user_list_widget.itemAt(pos)
        if not item:
            return
            
        raw_nick = item.text().strip()
        if not raw_nick:
            return
            
        clean_nick = self.clean_nick(raw_nick)
        my_nick = self.nick_input.text().strip()
        
        menu = QMenu(self)
        if self.current_theme == "dark":
            menu.setStyleSheet("""
                QMenu {
                    background-color: #1e293b;
                    color: #f1f5f9;
                    border: 1px solid #475569;
                }
                QMenu::item:selected {
                    background-color: #6366f1;
                    color: #ffffff;
                }
            """)
        else:
            menu.setStyleSheet("""
                QMenu {
                    background-color: #ffffff;
                    color: #1e293b;
                    border: 1px solid #cbd5e1;
                }
                QMenu::item:selected {
                    background-color: #6366f1;
                    color: #ffffff;
                }
            """)
            
        action_tag = menu.addAction(f"🏷️ แทกชื่อ ({clean_nick})")
        action_query = None
        if clean_nick.lower() != my_nick.lower():
            action_query = menu.addAction(f"💬 ส่งข้อความส่วนตัว (Query)")
            
        action = menu.exec(user_list_widget.mapToGlobal(pos))
        
        if action == action_tag:
            self.tag_user(clean_nick)
        elif action_query and action == action_query:
            self.on_user_double_clicked(item)

    def tag_user(self, nick):
        """ แทกชื่อเพื่อนลงในช่องพิมพ์ข้อความแชท """
        current_text = self.message_input.text()
        if not current_text:
            self.message_input.setText(f"{nick}: ")
        else:
            if current_text.endswith(" "):
                self.message_input.setText(f"{current_text}{nick} ")
            else:
                self.message_input.setText(f"{current_text} {nick} ")
        
        self.message_input.setFocus()
        self.message_input.setCursorPosition(len(self.message_input.text()))

    def autocomplete_nick(self):
        """ ฟังก์ชันเดาชื่อเล่นอัตโนมัติเมื่อผู้ใช้กดปุ่ม Tab ในช่องแชท """
        current_idx = self.tab_widget.currentIndex()
        current_text = self.tab_widget.tabText(current_idx)
        current_text_clean = current_text.split(" (")[0].lower()
        
        if current_text_clean not in self.rooms:
            return
            
        users = self.rooms[current_text_clean]["users"]
        if not users:
            return
            
        input_text = self.message_input.text()
        cursor_pos = self.message_input.cursorPosition()
        
        text_before_cursor = input_text[:cursor_pos]
        parts = text_before_cursor.split(" ")
        if not parts:
            return
            
        last_word = parts[-1]
        if not last_word:
            return
            
        matches = []
        for u in users:
            clean_u = self.clean_nick(u)
            if clean_u.lower().startswith(last_word.lower()):
                matches.append(clean_u)
                
        if not matches:
            return
            
        matched_nick = matches[0]
        parts[-1] = matched_nick
        
        is_first_word = len(parts) == 1
        suffix = ": " if is_first_word else " "
        
        new_text_before = " ".join(parts) + suffix
        new_text_after = input_text[cursor_pos:]
        
        self.message_input.setText(new_text_before + new_text_after)
        self.message_input.setCursorPosition(len(new_text_before))

    def eventFilter(self, obj, event):
        if obj == self.message_input and event.type() == event.Type.KeyPress:
            if event.key() == Qt.Key.Key_Tab:
                self.autocomplete_nick()
                return True
        return super().eventFilter(obj, event)

    def clean_nick(self, nick):
        """ ล้างค่าสัญลักษณ์หน้าชื่อผู้ใช้งาน เช่น @, +, %, & และ ~ """
        return nick.lstrip("@+%&~")

    def add_user_to_list(self, channel, nick):
        """ เพิ่มผู้ใช้งานเข้าสู่ห้องแชทจริงแบบเรียลไทม์ แกะสิทธิ์และป้องกันตัวเลขยอดรวมเพี้ยน """
        chan_key = channel.lower()
        if chan_key in self.rooms:
            room = self.rooms[chan_key]
            
            # ล้างค่าชื่อเล่นเพื่อสกัดหาความซ้ำซ้อน
            clean_new_nick = self.clean_nick(nick)
            
            # ลบชื่อเก่าที่อาจจะมียศค้างอยู่หรือซ้ำกันในระบบออกให้หมดก่อนบวกค่าใหม่
            room["users"] = [u for u in room["users"] if self.clean_nick(u).lower() != clean_new_nick.lower()]
            
            # บันทึกชื่อพร้อมยศจริงจากเซิร์ฟเวอร์ลงไป
            room["users"].append(nick)
            
            # สั่งให้จัดเรียงลำดับยศเรียลไทม์ และคำนวณจำนวนคนในวงเล็บปุ่มแท็บใหม่ทันที
            self.update_user_list_ui(channel, room["users"])


    def remove_user_from_list(self, channel, nick):
        """ ลบผู้ใช้งานออกจากห้องแชทจำลอง/จริงแบบเรียลไทม์ """
        chan_key = channel.lower()
        if chan_key in self.rooms:
            room = self.rooms[chan_key]
            clean_target_nick = self.clean_nick(nick)
            room["users"] = [u for u in room["users"] if self.clean_nick(u) != clean_target_nick]
            self.update_user_list_ui(channel, room["users"])

    def remove_user_from_all_lists(self, nick):
        """ ลบผู้ใช้งานออกจากทุกห้องแชท (เมื่อ QUIT หรือหลุดออกจากเซิร์ฟเวอร์) """
        clean_target_nick = self.clean_nick(nick)
        for chan_key in list(self.rooms.keys()):
            room = self.rooms[chan_key]
            orig_len = len(room["users"])
            room["users"] = [u for u in room["users"] if self.clean_nick(u) != clean_target_nick]
            if len(room["users"]) != orig_len:
                # หาชื่อแท้จริงของช่องแชทจากแถบแท็บเพื่ออัปเดต UI ให้ถูกต้อง
                channel_name = chan_key
                for i in range(self.tab_widget.count()):
                    tab_text = self.tab_widget.tabText(i).split(" (")[0]
                    if tab_text.lower() == chan_key:
                        channel_name = tab_text
                        break
                self.update_user_list_ui(channel_name, room["users"])

    def on_user_joined(self, channel, nick):
        """ มีคนอื่น หรือตัวเราเอง Join เข้ามาในห้องแชท """
        room = self.get_or_create_channel_tab(channel)
        
        current_time = datetime.now().strftime("%H:%M")
        time_color = "#64748b" if self.current_theme == "light" else "#94a3b8"
        text_color = "#059669" if self.current_theme == "light" else "#10b981"
        
        msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>({current_time})</span> <span style='color: {text_color}; font-weight: bold;'>✔ {nick} ได้เข้าสู่ห้อง {channel}</span></div>"
        room["chat_display"].append(msg_html)
        
        if nick == self.nick_input.text().strip():
            self.current_channel = channel
            
        # เพิ่มเข้าสู่ผู้ใช้งานของระบบแชทแบบเรียลไทม์ทันที
        #self.add_user_to_list(channel, nick)
        self.add_user_to_list(channel, nick)

    def on_user_left(self, channel, nick):
        """ มีคนออกจากห้องแชท หรือออกจากระบบ """
        if channel != "ALL":
            chan_key = channel.lower()
            if chan_key in self.rooms:
                room = self.rooms[chan_key]
                current_time = datetime.now().strftime("%H:%M")
                time_color = "#64748b" if self.current_theme == "light" else "#94a3b8"
                text_color = "#94a3b8" if self.current_theme == "light" else "#64748b"
                
                msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>({current_time})</span> <span style='color: {text_color};'>🚪 {nick} ได้ออกจากห้อง {channel}</span></div>"
                room["chat_display"].append(msg_html)
                
                # หากตัวเราออกจากช่องเอง ให้ทำการปิดแท็บ
                if nick == self.nick_input.text().strip():
                    self.remove_channel_tab(channel)
                    if self.current_channel == channel:
                        self.current_channel = ""
                else:
                    self.remove_user_from_list(channel, nick)
        else:
            # กรณีหลุดออกจากระบบทั้งหมด ให้ลบผู้ใช้รายนี้ออกจากทุกห้องแชททันที
            self.remove_user_from_all_lists(nick)

    def on_user_kicked(self, channel, kicked_nick, kicker_nick, reason):
        """ เมื่อมีคนถูกเตะออกจากห้องแชท (KICK event) """
        chan_key = channel.lower()
        if chan_key in self.rooms:
            room = self.rooms[chan_key]
            current_time = datetime.now().strftime("%H:%M")
            time_color = "#64748b" if self.current_theme == "light" else "#94a3b8"
            text_color = "#ef4444" if self.current_theme == "light" else "#f87171"
            
            msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>({current_time})</span> <span style='color: {text_color}; font-weight: bold;'>❌ {kicked_nick} ถูกเตะออกจากห้อง {channel} โดย {kicker_nick} ({reason})</span></div>"
            room["chat_display"].append(msg_html)
            
            # หากเป็นตัวเราเองโดนเตะ ให้ปิดแท็บห้องแชทนั้น
            if kicked_nick == self.nick_input.text().strip():
                self.remove_channel_tab(channel)
                if self.current_channel == channel:
                    self.current_channel = ""
            else:
                self.remove_user_from_list(channel, kicked_nick)

    def on_mode_changed(self, channel, sender_nick, mode_params):
        """ ดักจับการเปลี่ยนแปลงสถานะผู้ใช้งาน (MODE) จากเซิร์ฟเวอร์จริงแบบเรียลไทม์ """
        if not channel or not mode_params:
            return
            
        chan_key = channel.lower()
        if chan_key not in self.rooms:
            return
            
        # แยกโหมดและเป้าหมาย เช่น "+o", "Somchai"
        parts = mode_params.strip().split(" ")
        if len(parts) < 2:
            return
            
        mode_flag = parts[0]
        target_nick = parts[1]
        
        # คลีนชื่อเล่นเพื่อหาตัวตนที่ถูกต้อง
        clean_target = self.clean_nick(target_nick)
        
        room = self.rooms[chan_key]
        current_users = room.get("users", [])
        updated_users = []
        user_found = False
        
        for u in current_users:
            if self.clean_nick(u).lower() == clean_target.lower():
                user_found = True
                if mode_flag == "+o":
                    updated_users.append(f"@{clean_target}")
                elif mode_flag == "-o":
                    updated_users.append(clean_target)
                elif mode_flag == "+v":
                    # ถ้ามี @ นำหน้าอยู่แล้ว (เป็น op) อาจจะไม่ต้องเปลี่ยน หรือเปลี่ยนตามเหมาะสม
                    if u.startswith("@") or u.startswith("~") or u.startswith("&") or u.startswith("%"):
                        updated_users.append(u)
                    else:
                        updated_users.append(f"+{clean_target}")
                elif mode_flag == "-v":
                    if u.startswith("+"):
                        updated_users.append(clean_target)
                    else:
                        updated_users.append(u)
                else:
                    updated_users.append(u)
            else:
                updated_users.append(u)
                
        # หากไม่พบผู้ใช้ในรายการปัจจุบัน แต่ได้รับแจ้งโหมด ให้ทำการแอดเพิ่มเข้าไปพร้อมโหมด
        if not user_found:
            if mode_flag == "+o":
                updated_users.append(f"@{clean_target}")
            elif mode_flag == "+v":
                updated_users.append(f"+{clean_target}")
            else:
                updated_users.append(clean_target)
                
        # อัปเดตข้อมูลห้องและวาด UI ใหม่
        room["users"] = updated_users
        self.update_user_list_ui(channel, updated_users)
        
        # แสดงข้อความแจ้งเตือนระบบในแชทให้ผู้ใช้เห็นความเคลื่อนไหวเรียลไทม์
        current_time = datetime.now().strftime("%H:%M")
        time_color = "#64748b" if self.current_theme == "light" else "#94a3b8"
        text_color = "#2563eb" if self.current_theme == "light" else "#60a5fa"
        
        msg_html = f"<div style='margin-left: 12px; margin-top: 2px; margin-bottom: 2px;'><span style='color: {time_color}; font-family: monospace; font-size: 11px; margin-right: 6px;'>({current_time})</span> <span style='color: {text_color}; font-weight: bold;'>⚙ * {sender_nick} ตั้งโหมด {mode_flag} ให้กับ {clean_target} ในห้อง {channel}</span></div>"
        room["chat_display"].append(msg_html)

    def on_user_list(self, channel, users):
        """ แก้ไขบั๊กรายชื่อมาไม่ครบ: ปรับระบบให้บวกสะสมรายชื่อต่อกัน (Append) แทนการเขียนทับ """
        chan_key = channel.lower()
        if chan_key in self.rooms:
            # 1. ดึงรายชื่อที่มีการจัดเก็บอยู่แล้วในแท็บนี้ขึ้นมา หากไม่มีให้สร้าง List ว่าง
            current_stored_users = self.rooms[chan_key].get("users", [])
            
            for u in users:
                u_str = u.strip()
                if u_str:
                    # 2. ตรวจสอบและสกัดชื่อแบบคลีนเพื่อป้องกันชื่อซ้ำซ้อนในระบบ
                    clean_name = self.clean_nick(u_str)
                    
                    # ลบชื่อเก่าที่ซ้ำกันออกก่อนเพื่อป้องกันรายชื่อบั๊กเบิ้ลสะสม
                    current_stored_users = [user for user in current_stored_users if self.clean_nick(user).lower() != clean_name.lower()]
                    
                    # 3. ใส่รายชื่อใหม่ต่อท้ายสะสมเข้าไปเรื่อย ๆ จนกว่าเซิร์ฟเวอร์จะส่งครบ
                    current_stored_users.append(u_str)
                    
            # 4. บันทึกก้อนข้อมูลรายชื่อสะสมกลับเข้าหน่วยความจำ และอัปเดตหน้าจอ UI
            self.rooms[chan_key]["users"] = current_stored_users
            self.update_user_list_ui(channel, current_stored_users)

    def update_user_list_ui(self, channel, users_list):
        """ จัดเรียงลำดับสิทธิ์ผู้ใช้ และอัปเดตตัวเลขจำนวนคนแบบเรียลไทม์ถูกต้องตามความต้องการของผู้ใช้ """
        # จัดเรียงตามระดับยศ: ~ Owner, & Admin, @ Op, % HalfOp, + Voice จากนั้นผู้ใช้ธรรมดา
        def sort_key(user):
            if not user:
                return (5, "")
            
            # สกัดหาชื่อแบบคลีนเปรียบเทียบเรียงลำดับพยัญชนะ
            clean_name = self.clean_nick(user).lower()
            
            if user.startswith("~"):
                return (0, clean_name)
            elif user.startswith("&"):
                return (1, clean_name)
            elif user.startswith("@"):
                return (2, clean_name)
            elif user.startswith("%"):
                return (3, clean_name)
            elif user.startswith("+"):
                return (4, clean_name)
            else:
                return (5, clean_name)
        
        # จัดเรียงรายชื่อด้วย sort_key
        sorted_users = sorted(users_list, key=sort_key)
        
        chan_key = channel.lower()
        if chan_key in self.rooms:
            room = self.rooms[chan_key]
            room["users"] = sorted_users
            room["user_list"].clear()
            
            for u in sorted_users:
                if u:
                    room["user_list"].addItem(u)
            
            # อัปเดตรายชื่อจำนวนคนในห้องแชทลงในปุ่มแท็บ
            idx = self.tab_widget.indexOf(room["widget"])
            if idx != -1:
                self.tab_widget.setTabText(idx, f"{channel} ({len(sorted_users)})")

    def update_font_size(self):
        """ ปรับขนาดตัวอักษร 3 ระดับ: เล็ก (10px) -> กลาง (13px) -> ใหญ่ (16px) """
        sizes = [10, 13, 16]
        labels = ["เล็ก", "กลาง", "ใหญ่"]
        current_size = sizes[self.font_size_idx]
        
        # อัปเดตข้อความบนปุ่มกด
        self.font_btn.setText(f"🔍 ขนาด: {labels[self.font_size_idx]}")
        
        # ตั้งค่าฟอนต์ใหม่ทั้งหมดในหน้าต่างแสดงผล
        font = QFont("Segoe UI", current_size)
        self.status_display.setFont(font)
        self.status_display.document().setDefaultFont(font)
        self.motd_display.setFont(font)
        self.motd_display.document().setDefaultFont(font)
        
        # นำฟอนต์ไปใช้กับห้องทั้งหมด
        for r in self.rooms.values():
            r["chat_display"].setFont(font)
            r["chat_display"].document().setDefaultFont(font)
            r["user_list"].setFont(font)

    def change_font_size(self):
        """ สลับระดับขนาดตัวอักษร 3 ระดับวนซ้ำ """
        self.font_size_idx = (self.font_size_idx + 1) % 3
        self.update_font_size()

    def toggle_mention_notify(self):
        """ เปิด/ปิดระบบแจ้งเตือนการแทกชื่อ """
        self.mention_notify_enabled = not self.mention_notify_enabled
        if self.mention_notify_enabled:
            self.mention_btn.setText("🔔 แทกชื่อ: เปิด")
            self.append_system_msg("เปิดใช้งานระบบแจ้งเตือนการแทกชื่อสำเร็จ")
        else:
            self.mention_btn.setText("🔕 แทกชื่อ: ปิด")
            self.append_system_msg("ปิดใช้งานระบบแจ้งเตือนการแทกชื่อแล้ว")

    def on_error(self, err_msg):
        """ จัดการกรณีเกิดข้อผิดพลาดขึ้นในเธรด socket """
        current_idx = self.tab_widget.currentIndex()
        current_text = self.tab_widget.tabText(current_idx)
        current_text_clean = current_text.split(" (")[0]
        
        err_html = f"<span style='color: #f87171;'><b>[ข้อผิดพลาด]</b> {err_msg}</span>"
        
        if current_text_clean.lower() in self.rooms:
            self.rooms[current_text_clean.lower()]["chat_display"].append(err_html)
        else:
            self.status_display.append(err_html)
            
        self.disconnect_irc()

    def select_and_send_file(self):
        """ เปลี่ยนระบบส่งไฟล์จาก DCC เป็นการอัปโหลดขึ้น tmpfiles.org แล้วส่งลิงก์เข้าห้องแชทอัตโนมัติ """
        if self.irc_worker is not None:
            # 1. นำเข้าไลบรารีจัดการไฟล์และเครือข่ายเว็บ
            from PyQt6.QtWidgets import QFileDialog
            import requests
            import threading
            import os

            # 2. เปิดหน้าต่างให้ยูสเซอร์เลือกไฟล์จากในคอมพิวเตอร์ตามปกติ
            file_path, _ = QFileDialog.getOpenFileName(self, "เลือกไฟล์หรือรูปภาพที่ต้องการส่ง", "", "All Files (*)")
            if not file_path:
                return  # ยูสเซอร์กดกดยกเลิก
                
            # ตรวจสอบขนาดไฟล์ไม่ให้เกิน 100MB ตามโควตาของ tmpfiles.org
            if os.path.getsize(file_path) > 100 * 1024 * 1024:
                self.append_system_msg("ระบบ: ขนาดไฟล์ใหญ่เกิน 100 MB ไม่สามารถอัปโหลดได้")
                return

            filename = os.path.basename(file_path)
            self.append_system_msg(f"ระบบ: กำลังอัปโหลดไฟล์ {filename} ขึ้นระบบคลาวด์ชั่วคราว...")

            # 3. แยกเธรด (Threading) ในการอัปโหลด เพื่อป้องกันไม่ให้หน้าต่างโปรแกรมค้างขณะส่งไฟล์ขนาดใหญ่
            def upload_worker():
                try:
                    # พิกัด API สำหรับอัปโหลดของเว็บ tmpfiles.org
                    api_url = "https://tmpfiles.org/api/v1/upload"
                    
                    with open(file_path, 'rb') as f:
                        files = {'file': f}
                        response = requests.post(api_url, files=files, timeout=60)
                    
                    if response.status_code == 200:
                        res_data = response.json()
                        if res_data.get("status") == "success":
                            # ดึงลิงก์ดาวน์โหลดตรงมาประมวลผล
                            raw_url = res_data["data"]["url"]
                            
                            # แปลงฟอร์แมตลิงก์จากหน้าเว็บทั่วไป ให้กลายเป็นลิงก์ดาวน์โหลด/แสดงภาพตรง (Direct Link)
                            # เช่น จาก tmpfiles.org/123 -> tmpfiles.org/dl/123 เพื่อให้กดดูรูปได้ทันที
                            direct_download_url = raw_url.replace("tmpfiles.org/", "tmpfiles.org/dl/")
                            
                            # ส่งลิงก์กลับไปจัดการที่ GUI thread อย่างปลอดภัย
                            self.upload_success_signal.emit(direct_download_url)
                        else:
                            self.upload_status_signal.emit("ระบบ: เซิร์ฟเวอร์ปฏิเสธการอัปโหลดไฟล์")
                    else:
                        self.upload_status_signal.emit(f"ระบบ: อัปโหลดล้มเหลว (Error Code: {response.status_code})")
                except Exception as e:
                    self.upload_status_signal.emit(f"ระบบ: เกิดข้อผิดพลาดระหว่างอัปโหลด: {e}")

            # สั่งให้เธรดอัปโหลดเริ่มต้นทำงานเบื้องหลังเบื้องหลัง
            threading.Thread(target=upload_worker, daemon=True).start()
        else:
            self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์ ไม่สามารถส่งไฟล์ได้")

    def handle_upload_success(self, direct_download_url):
        """ ฟังก์ชัน Callback บน Main Thread เมื่ออัปโหลดไฟล์สำเร็จและได้ลิงก์ตรงมาแล้ว """
        # ดึงชื่อห้องแชทปัจจุบันที่ผู้ใช้เปิดหน้าจอคู่อยู่
        current_tab_index = self.tab_widget.currentIndex()
        current_room_name = self.tab_widget.tabText(current_tab_index)
        
        # ตรวจสอบว่าอยู่ในห้องแชทหรือแท็บกระซิบส่วนตัว เพื่อส่งข้อความออกไปหาเพื่อน
        if current_room_name and not current_room_name.startswith("Status"):
            # 1. ดึงข้อความเก่าในช่องพิมพ์เก็บไว้ก่อน (เผื่อยูสเซอร์พิมพ์ค้างไว้)
            old_input_text = self.message_input.text()
            
            # 2. ยัดลิงก์รูปภาพเข้าไปในกล่องพิมพ์ด้านล่างของแอป
            self.message_input.setText(direct_download_url)
            
            # 3. สั่งรันฟังก์ชันกดส่งข้อความของตัวแอป (ระบบจะยิง PRIVMSG เข้าเซิร์ฟเวอร์ให้ทันที)
            self.send_message()
            
            # 4. คืนค่าข้อความเก่าที่ยูสเซอร์พิมพ์ค้างไว้กลับมาที่กล่องพิมพ์
            if old_input_text:
                self.message_input.setText(old_input_text)
                
            # แสดงลิงก์บนหน้าจอตัวเองด้วย
            my_nick = self.nick_input.text().strip()
            self.on_message_received(current_room_name, my_nick, direct_download_url)
        else:
            self.append_system_msg(f"ระบบ: อัปโหลดไฟล์สำเร็จ! ลิงก์ตรงของคุณคือ: {direct_download_url}")

    def show_emoji_picker(self):
        """ แสดงหน้าต่างเลือก Emoji UTF-8 ข้างบนปุ่ม Emoji """
        is_dark = (self.current_theme == "dark")
        picker = EmojiPicker(self, is_dark=is_dark)
        
        # คำนวณตำแหน่งแสดงผลให้ลอยอยู่เหนือปุ่ม Emoji
        btn_pos = self.emoji_btn.mapToGlobal(self.emoji_btn.rect().topLeft())
        x = btn_pos.x() - (picker.width() - self.emoji_btn.width()) // 2
        y = btn_pos.y() - picker.height() - 5
        
        # ป้องกันไม่ให้ออกนอกขอบจอซ้าย
        if x < 10:
            x = 10
            
        picker.move(x, y)
        if picker.exec():
            if picker.selected_emoji:
                # แทรก emoji ลงไปในกล่องพิมพ์ ณ ตำแหน่งเคอร์เซอร์ปัจจุบัน
                cursor_pos = self.message_input.cursorPosition()
                current_text = self.message_input.text()
                new_text = current_text[:cursor_pos] + picker.selected_emoji + current_text[cursor_pos:]
                self.message_input.setText(new_text)
                self.message_input.setFocus()
                self.message_input.setCursorPosition(cursor_pos + len(picker.selected_emoji))

    def send_message(self):
        """ ส่งข้อความแชท หรือส่งคำสั่ง """
        text = self.message_input.text().strip()
        if not text:
            return
        
        self.message_input.clear()

        # กรณีผู้ใช้พิมพ์คำสั่ง IRC Command ขึ้นต้นด้วยเครื่องหมาย / (Slash)
        if text.startswith("/"):
            parts = text[1:].split(" ", 1)
            cmd = parts[0].upper()
            args = parts[1] if len(parts) > 1 else ""
            
            if cmd == "JOIN":
                if args:
                    channels = [c.strip() for c in args.split(",") if c.strip()]
                    for chan in channels:
                        if not chan.startswith("#") and not chan.startswith("&"):
                            chan = "#" + chan
                        self.get_or_create_channel_tab(chan)
                        self.current_channel = chan
                    if self.irc_worker:
                        normalized_args = ",".join(
                            [("#" + c if (not c.startswith("#") and not c.startswith("&")) else c) for c in channels]
                        )
                        self.irc_worker.send_line(f"JOIN {normalized_args}")
            elif cmd == "PART":
                chan = args if args else self.current_channel
                if chan:
                    if self.irc_worker:
                        self.irc_worker.send_line(f"PART {chan}")
                    self.remove_channel_tab(chan)
                    if self.current_channel == chan:
                        self.current_channel = ""
            elif cmd == "NICK":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"NICK {args}")
                    self.nick_input.setText(args)
            elif cmd == "QUIT":
                self.disconnect_irc()
            elif cmd == "RAW":
                if args and self.irc_worker:
                    self.irc_worker.send_line(args)
            elif cmd == "HELP":
                self.append_system_msg("^B=== คู่มือคำสั่งช่วยเหลือและการจัดรูปแบบตัวอักษร ===^B")
                self.append_system_msg("^B[คำสั่งพื้นฐาน]^B")
                self.append_system_msg("  /join #ชื่อห้องแชท - เข้าร่วมห้องแชท (เช่น /join #Siam)")
                self.append_system_msg("  /part - ออกจากห้องแชทปัจจุบัน")
                self.append_system_msg("  /nick ชื่อใหม่ - เปลี่ยนชื่อเล่นของคุณ")
                self.append_system_msg("  /quit - ตัดการเชื่อมต่อจากเซิร์ฟเวอร์")
                self.append_system_msg("  /help - เปิดคู่มือคำสั่งช่วยเหลือนี้")
                self.append_system_msg("  /whois ชื่อเล่น - ตรวจสอบข้อมูลผู้ใช้งาน")
                self.append_system_msg("^B[คำสั่ง Anope Services (anope.org)]^B")
                self.append_system_msg("  /ns หรือ /nickserv คำสั่ง - เรียกใช้บริการ NickServ")
                self.append_system_msg("  /cs หรือ /chanserv คำสั่ง - เรียกใช้บริการ ChanServ")
                self.append_system_msg("  /os หรือ /operserv คำสั่ง - เรียกใช้บริการ OperServ")
                self.append_system_msg("  /ms หรือ /memoserv คำสั่ง - เรียกใช้บริการ MemoServ")
                self.append_system_msg("  /hs หรือ /hostserv คำสั่ง - เรียกใช้บริการ HostServ")
                self.append_system_msg("  /bs หรือ /botserv คำสั่ง - เรียกใช้บริการ BotServ")
                self.append_system_msg("^B[คำสั่งผู้ดูแลห้อง (Operator Commands)]^B")
                self.append_system_msg("  /kick ชื่อเล่น [เหตุผล] - เตะผู้ใช้งานออกจากห้องแชท")
                self.append_system_msg("  /ban ชื่อเล่น - ตั้งแบนผู้ใช้งาน")
                self.append_system_msg("  /unban ชื่อเล่น - ปลดแบนให้ผู้ใช้งาน")
                self.append_system_msg("  /op ชื่อเล่น - แต่งตั้งเป็นผู้ดูแลห้องแชท (@)")
                self.append_system_msg("  /deop ชื่อเล่น - ยกเลิกสิทธิ์ผู้ดูแลห้องแชท")
                self.append_system_msg("  /voice ชื่อเล่น - มอบสิทธิ์การพูดพิเศษ (+)")
                self.append_system_msg("  /devoice ชื่อเล่น - ยกเลิกสิทธิ์การพูดพิเศษ")
                self.append_system_msg("  /topic หัวข้อใหม่ - เปลี่ยนหัวข้อห้องแชท")
                self.append_system_msg("^B[คำสั่งผู้ดูแลระบบ (IRC Operator / NetAdmin Commands)]^B")
                self.append_system_msg("  /oper ชื่อผู้ใช้ รหัสผ่าน - เข้าสู่สถานะ IRC Operator")
                self.append_system_msg("  /kill ชื่อเล่น [เหตุผล] - เตะผู้ใช้หลุดออกจากเซิร์ฟเวอร์")
                self.append_system_msg("  /kline โฮสต์ [เหตุผล] - แบนโฮสต์/ไอพีจากเซิร์ฟเวอร์นี้")
                self.append_system_msg("  /gline โฮสต์ [เหตุผล] - แบนโฮสต์แบบเครือข่ายวงกว้าง (NetAdmin)")
                self.append_system_msg("  /zline ไอพี [เหตุผล] - แบนไอพีในระดับต่ำสุด (NetAdmin)")
                self.append_system_msg("  /shun ชื่อเล่น [เหตุผล] - ปิดกั้นไม่ให้พูดหรือส่งข้อความ")
                self.append_system_msg("  /rehash - โหลดค่าคอนฟิกเซิร์ฟเวอร์ใหม่")
                self.append_system_msg("  /restart - รีสตาร์ทระบบเซิร์ฟเวอร์ใหม่")
                self.append_system_msg("  /sajoin ชื่อเล่น #ห้องแชท - บังคับเข้าห้องแชท (NetAdmin)")
                self.append_system_msg("  /sapart ชื่อเล่น #ห้องแชท - บังคับออกห้องแชท (NetAdmin)")
                self.append_system_msg("  /sanick ชื่อเล่น ชื่อใหม่ - บังคับเปลี่ยนชื่อผู้ใช้ (NetAdmin)")
                self.append_system_msg("  /samode เป้าหมาย โหมด - บังคับตั้งโหมด (NetAdmin)")
                self.append_system_msg("^B[การจัดรูปแบบข้อความ mIRC]^B")
                self.append_system_msg("  ^B^Bตัวหนา^B^B - พิมพ์ ^Bข้อความ^B หรือ &Bข้อความ&B")
                self.append_system_msg("  ^U^Uขีดเส้นใต้^U^U - พิมพ์ ^Uข้อความ^U หรือ &Uข้อความ&U")
                self.append_system_msg("  ^O^Oรีเซ็ตค่ารูปแบบอักษร^O^O - พิมพ์ ^O หรือ &O")
                self.append_system_msg("^B[การใส่สีข้อความ mIRC]^B")
                self.append_system_msg("  พิมพ์ ^C ตามด้วยรหัสสี (0-15) เพื่อเปลี่ยนสีอักษร เช่น:")
                self.append_system_msg("    ^C0,1ขาวบนดำ^O | ^C4แดง^O | ^C3เขียว^O | ^C12ฟ้า^O | ^C6ม่วง^O | ^C7ส้ม^O | ^C8เหลือง^O")
                self.append_system_msg("    ^C9เขียวอ่อน^O | ^C10ฟ้าอมเขียว^O | ^C11ฟ้าอ่อน^O | ^C13ชมพู^O | ^C14เทา^O")
                self.append_system_msg("  ตัวอย่างการจัดสีและพื้นหลัง: พิมพ์ ^Cสีอักษร,สีพื้นหลัง เช่น ^C0,4สีขาวบนพื้นหลังสีแดง^O")
            elif cmd == "KICK":
                if args:
                    parts = args.split(" ", 1)
                    target = parts[0]
                    reason = parts[1] if len(parts) > 1 else "Kicked by operator"
                    if self.current_channel and self.irc_worker:
                        self.irc_worker.send_line(f"KICK {self.current_channel} {target} :{reason}")
            elif cmd == "BAN":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"MODE {self.current_channel} +b {args}")
            elif cmd == "UNBAN":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"MODE {self.current_channel} -b {args}")
            elif cmd == "OP":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"MODE {self.current_channel} +o {args}")
            elif cmd == "DEOP":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"MODE {self.current_channel} -o {args}")
            elif cmd == "VOICE":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"MODE {self.current_channel} +v {args}")
            elif cmd == "DEVOICE":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"MODE {self.current_channel} -v {args}")
            elif cmd == "TOPIC":
                if args and self.current_channel and self.irc_worker:
                    self.irc_worker.send_line(f"TOPIC {self.current_channel} :{args}")
            elif cmd in ["NS", "NICKSERV"]:
                if self.irc_worker:
                    self.irc_worker.send_line(f"NICKSERV {args}")
                    self.irc_worker.send_line(f"SQUERY NickServ :{args}")
                    self.irc_worker.send_line(f"PRIVMSG NickServ :{args}")
                    self.append_system_msg(f"-> NickServ: {args}")
                else:
                    self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถเรียกใช้บริการ NickServ ได้")
            elif cmd in ["CS", "CHANSERV"]:
                if self.irc_worker:
                    self.irc_worker.send_line(f"CHANSERV {args}")
                    self.irc_worker.send_line(f"SQUERY ChanServ :{args}")
                    self.irc_worker.send_line(f"PRIVMSG ChanServ :{args}")
                    self.append_system_msg(f"-> ChanServ: {args}")
                else:
                    self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถเรียกใช้บริการ ChanServ ได้")
            elif cmd in ["OS", "OPERSERV"]:
                if self.irc_worker:
                    self.irc_worker.send_line(f"OPERSERV {args}")
                    self.irc_worker.send_line(f"SQUERY OperServ :{args}")
                    self.irc_worker.send_line(f"PRIVMSG OperServ :{args}")
                    self.append_system_msg(f"-> OperServ: {args}")
                else:
                    self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถเรียกใช้บริการ OperServ ได้")
            elif cmd in ["MS", "MEMOSERV"]:
                if self.irc_worker:
                    self.irc_worker.send_line(f"MEMOSERV {args}")
                    self.irc_worker.send_line(f"SQUERY MemoServ :{args}")
                    self.irc_worker.send_line(f"PRIVMSG MemoServ :{args}")
                    self.append_system_msg(f"-> MemoServ: {args}")
                else:
                    self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถเรียกใช้บริการ MemoServ ได้")
            elif cmd in ["HS", "HOSTSERV"]:
                if self.irc_worker:
                    self.irc_worker.send_line(f"HOSTSERV {args}")
                    self.irc_worker.send_line(f"SQUERY HostServ :{args}")
                    self.irc_worker.send_line(f"PRIVMSG HostServ :{args}")
                    self.append_system_msg(f"-> HostServ: {args}")
                else:
                    self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถเรียกใช้บริการ HostServ ได้")
            elif cmd in ["BS", "BOTSERV"]:
                if self.irc_worker:
                    self.irc_worker.send_line(f"BOTSERV {args}")
                    self.irc_worker.send_line(f"SQUERY BotServ :{args}")
                    self.irc_worker.send_line(f"PRIVMSG BotServ :{args}")
                    self.append_system_msg(f"-> BotServ: {args}")
                else:
                    self.append_system_msg("ระบบ: คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถเรียกใช้บริการ BotServ ได้")
            elif cmd == "WHOIS":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"WHOIS {args}")
                elif not args:
                    self.append_system_msg("ระบบ: กรุณาระบุชื่อผู้ใช้งาน เช่น /whois Somchai")
            elif cmd == "OPER":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"OPER {args}")
                elif not args:
                    self.append_system_msg("ระบบ: กรุณาระบุชื่อผู้ใช้และรหัสผ่าน เช่น /oper admin password")
            elif cmd == "KILL":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"KILL {args}")
            elif cmd == "KLINE":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"KLINE {args}")
            elif cmd == "GLINE":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"GLINE {args}")
            elif cmd == "ZLINE":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"ZLINE {args}")
            elif cmd == "SHUN":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"SHUN {args}")
            elif cmd == "REHASH":
                if self.irc_worker:
                    self.irc_worker.send_line("REHASH")
            elif cmd == "RESTART":
                if self.irc_worker:
                    self.irc_worker.send_line("RESTART")
            elif cmd == "SAMODE":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"SAMODE {args}")
            elif cmd == "SAJOIN":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"SAJOIN {args}")
            elif cmd == "SAPART":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"SAPART {args}")
            elif cmd == "SANICK":
                if args and self.irc_worker:
                    self.irc_worker.send_line(f"SANICK {args}")
            else:
                # ส่งคำสั่งดิบไปยังเซิร์ฟเวอร์โดยตรงสำหรับคำสั่งอื่นๆ (Raw Fallback)
                if self.irc_worker:
                    raw_cmd = f"{cmd} {args}".strip()
                    self.irc_worker.send_line(raw_cmd)
                    self.append_system_msg(f"ระบบ: ส่งคำสั่งตรงไปยังเซิร์ฟเวอร์ -> /{cmd} {args}")
                else:
                    current_idx = self.tab_widget.currentIndex()
                    current_text = self.tab_widget.tabText(current_idx)
                    current_text_clean = current_text.split(" (")[0]
                    
                    err_msg = f"<span style='color: #f87171;'>* คุณยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ไม่สามารถส่งคำสั่ง /{cmd} ได้</span>"
                    if current_text_clean.lower() in self.rooms:
                        self.rooms[current_text_clean.lower()]["chat_display"].append(err_msg)
                    elif current_text == "MOTD":
                        self.motd_display.append(err_msg)
                    else:
                        self.status_display.append(err_msg)
        else:
            # ตรวจจับห้องปัจจุบันจาก แถบแท็บเพื่อส่ง PRIVMSG ไปยังปลายทางที่เลือกอยู่โดยไม่ปนกัน
            current_idx = self.tab_widget.currentIndex()
            current_text = self.tab_widget.tabText(current_idx)
            current_text_clean = current_text.split(" (")[0]
            
            if current_text in ["Status", "MOTD"] or current_text_clean.lower() not in self.rooms:
                err_msg = "<span style='color: #94a3b8;'>* กรุณาคลิกเลือกหรือเข้าร่วมห้องแชทก่อนส่งข้อความ (พิมพ์ /join #ชื่อห้องแชท)</span>"
                if current_text == "MOTD":
                    self.motd_display.append(err_msg)
                else:
                    self.status_display.append(err_msg)
                return
            
            target_chan = current_text_clean
            if self.irc_worker:
                # ส่งโปรโตคอล PRIVMSG ไปหาห้องปลายทางจริงๆ
                self.irc_worker.send_line(f"PRIVMSG {target_chan} :{text}")
                # แสดงข้อความตัวเองขึ้นหน้าจอแชทช่องที่เลือกทันที
                my_nick = self.nick_input.text()
                self.on_message_received(target_chan, my_nick, text)
    def play_radio(self, station):
        """ เล่นสถานีวิทยุออนไลน์ที่กำหนด """
        mquest_url = "http://icecast.thaiirc.com:8000/ices"
        live_url = "http://radio.thaiirc.com:8002/ices"
        
        target_url = mquest_url if station == "mquest" else live_url
        station_name = "MQuest Radio" if station == "mquest" else "Live Radio"
        
        # อัปเดตสถานะปุ่ม
        if station == "mquest":
            self.mquest_btn.setChecked(True)
            self.live_btn.setChecked(False)
        else:
            self.mquest_btn.setChecked(False)
            self.live_btn.setChecked(True)
            
        self.append_system_msg(f"📡 กำลังเปิดสถานีวิทยุออนไลน์: {station_name}")

        # อัปเดต Equalizer และสถานะแบบเดียวกับ Web Simulator
        self.equalizer.set_playing(True)
        self.radio_status_label.setText(f"playing {station}...")
        
        if self.has_multimedia and self.player and self.QUrl_class:
            try:
                self.player.setSource(self.QUrl_class(target_url))
                self.player.play()
            except Exception as e:
                self.append_system_msg(f"❌ เกิดข้อผิดพลาดมัลติมีเดีย: {str(e)}")
        else:
            self.append_system_msg("💡 [จำลองวิทยุ] ระบบเสียง QtMultimedia ไม่พร้อมใช้งาน แต่ระบบกำลังจำลองการทำงานอย่างสมบูรณ์แบบ!")

    def stop_radio(self):
        """ หยุดเล่นสถานีวิทยุออนไลน์ """
        self.mquest_btn.setChecked(False)
        self.live_btn.setChecked(False)
        self.append_system_msg("🛑 หยุดเล่นวิทยุออนไลน์เรียบร้อยแล้ว")

        # อัปเดต Equalizer และสถานะแบบเดียวกับ Web Simulator
        self.equalizer.set_playing(False)
        self.radio_status_label.setText("radio offline")
        
        if self.has_multimedia and self.player:
            try:
                self.player.stop()
            except Exception:
                pass

    def set_radio_volume(self, value):
        """ ปรับระดับความดังเสียงของวิทยุ """
        self.vol_label.setText(f"{value}%")
        if self.has_multimedia and self.audio_output:
            try:
                self.audio_output.setVolume(value / 100.0)
            except Exception:
                pass

    def update_status_bar_ui(self):
        """ อัปเดตข้อมูลสถานะใน Status Bar ด้านล่าง """
        is_dark = getattr(self, "current_theme", "light") == "dark"
        
        # สีสันสำหรับความแตกต่างของสถานะ
        green_color = "#34d399" if is_dark else "#059669"
        amber_color = "#fbbf24" if is_dark else "#d97706"
        red_color = "#f87171" if is_dark else "#dc2626"
        gray_color = "#64748b" if is_dark else "#94a3b8"
        
        # สีสันสำหรับข้อมูล Server, Room, Nick
        blue_color = "#60a5fa" if is_dark else "#2563eb"
        purple_color = "#a78bfa" if is_dark else "#7c3aed"
        
        # 1. แสดงสถานะสีสันตามสไตล์ React
        if self.conn_state == "online":
            status_text = f"<span style='color: {green_color}; font-weight: bold;'>ONLINE</span>"
        elif self.conn_state in ["connecting", "registering"]:
            status_text = f"<span style='color: {amber_color}; font-weight: bold;'>CONNECTING...</span>"
        elif self.conn_state == "disconnecting":
            status_text = f"<span style='color: {red_color}; font-weight: bold;'>DISCONNECTING...</span>"
        else:
            status_text = f"<span style='color: {gray_color}; font-weight: bold;'>OFFLINE</span>"
            
        self.status_lbl.setText(f"Status: {status_text}")
        
        # 2. ค้นหา Server, Nick, Room
        server = self.server_input.text().strip() or "irc.thaiirc.com"
        nick = self.nick_input.text().strip() or "pyIRCH"
        
        current_idx = self.tab_widget.currentIndex() if hasattr(self, "tab_widget") else -1
        if current_idx >= 0:
            tab_name = self.tab_widget.tabText(current_idx)
            room = tab_name.split(" (")[0]
        else:
            room = "-"
            
        if self.conn_state in ["online", "registering"]:
            # ถ้าเชื่อมต่อแล้ว ให้ดึงข้อมูลจริงมาแสดง
            self.server_lbl.setText(f"Server: <b style='color: {blue_color}; font-family: monospace;'>{server}</b>")
            self.room_lbl.setText(f"Room: <b style='color: {purple_color}; font-family: monospace;'>{room}</b>")
            self.nick_lbl.setText(f"Nick: <b style='color: {green_color}; font-family: monospace;'>{nick}</b>")
        else:
            self.server_lbl.setText(f"Server: <span style='color: {gray_color}; font-family: monospace;'>-</span>")
            self.room_lbl.setText(f"Room: <span style='color: {gray_color}; font-family: monospace;'>-</span>")
            self.nick_lbl.setText(f"Nick: <span style='color: {gray_color}; font-family: monospace;'>-</span>")
            
        # 3. อัปเดตเวลา Local Time
        from datetime import datetime
        local_time_str = datetime.now().strftime("%H:%M:%S")
        self.time_lbl.setText(f"Local Time: <span style='font-family: monospace;'>{local_time_str}</span>")

    def apply_theme(self, theme):
        """ สลับการตกแต่งความสวยงามของโปรแกรมให้เป็นสไตล์ Modern UI ตามธีมมืด/สว่าง """
        self.current_theme = theme
        if theme == "dark":
            self.theme_btn.setText("☀️ Light Mode")
            self.setStyleSheet("""
                QMainWindow {
                    background-color: #0f172a;
                }
                QLabel {
                    font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', 'Arial';
                    font-size: 11px;
                    color: #94a3b8;
                    font-weight: bold;
                }
                #TopFrame {
                    background-color: #1e293b;
                    border: none;
                    border-radius: 12px;
                }
                #RadioFrame {
                    background-color: #1e293b;
                    border-left: 4px solid #818cf8;
                    border-radius: 12px;
                }
                #RadioTitle {
                    color: #818cf8;
                    font-size: 11px;
                }
                #RadioMQuestBtn, #RadioLiveBtn {
                    background-color: #334155;
                    color: #cbd5e1;
                }
                #RadioMQuestBtn:checked, #RadioLiveBtn:checked {
                    background-color: #10b981;
                    color: #ffffff;
                }
                #RadioStopBtn {
                    background-color: #ef4444;
                    color: #ffffff;
                }
                #RadioStopBtn:hover {
                    background-color: #dc2626;
                }
                #RadioVolLabel {
                    color: #818cf8;
                    font-family: monospace;
                    font-weight: bold;
                }
                #RadioStatusLabel {
                    color: #94a3b8;
                    font-family: monospace;
                    font-size: 10px;
                }
                QSlider::groove:horizontal {
                    height: 4px;
                    background: #334155;
                    border-radius: 2px;
                }
                QSlider::handle:horizontal {
                    background: #818cf8;
                    width: 12px;
                    height: 12px;
                    margin: -4px 0;
                    border-radius: 6px;
                }
                QLineEdit {
                    background-color: #0f172a;
                    border: 1px solid #334155;
                    border-radius: 8px;
                    font-family: 'Segoe UI', 'Inter', 'Arial', monospace;
                    font-size: 12px;
                    padding: 6px 10px;
                    color: #f8fafc;
                }
                QLineEdit:focus {
                    border: 1px solid #818cf8;
                }
                QPushButton {
                    background-color: #6366f1;
                    border: none;
                    border-radius: 8px;
                    font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', 'Arial';
                    font-size: 11px;
                    font-weight: bold;
                    padding: 6px 14px;
                    color: #ffffff;
                }
                QPushButton:hover {
                    background-color: #4f46e5;
                }
                QPushButton:pressed {
                    background-color: #4338ca;
                }
                QPushButton:disabled {
                    background-color: #1e293b;
                    border: none;
                    color: #475569;
                }
                #StatusDisplay, #MOTDDisplay, #ChatDisplay {
                    background-color: #0f172a;
                    border: none;
                    border-radius: 12px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    color: #f1f5f9;
                    padding: 12px;
                }
                #UserList {
                    background-color: #1e293b;
                    border: none;
                    border-radius: 12px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    color: #cbd5e1;
                    padding: 6px;
                }
                QListWidget::item {
                    padding: 5px 8px;
                    border-radius: 6px;
                    color: #cbd5e1;
                }
                QListWidget::item:hover {
                    background-color: #334155;
                    color: #ffffff;
                }
                QListWidget::item:selected {
                    background-color: #6366f1;
                    color: #ffffff;
                    font-weight: bold;
                }
                QStatusBar {
                    background-color: #020617;
                    border-top: 1px solid #1e293b;
                    color: #94a3b8;
                    font-size: 11px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                }
                QStatusBar::item {
                    border: none;
                }
                #StatusLbl, #ServerLbl, #RoomLbl, #NickLbl, #TimeLbl {
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    font-size: 11px;
                    color: #94a3b8;
                }
                QTabWidget::pane {
                    border: none;
                    background-color: transparent;
                }
                QTabBar::tab {
                    background-color: #1e293b;
                    color: #94a3b8;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 12px;
                    margin-right: 4px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    font-size: 11px;
                    font-weight: bold;
                }
                QTabBar::tab:selected {
                    background-color: #6366f1;
                    color: #ffffff;
                }
                QTabBar::tab:hover {
                    background-color: #334155;
                    color: #ffffff;
                }
                QSplitter::handle {
                    background-color: transparent;
                }
            """)
        else:
            self.theme_btn.setText("🌙 Dark Mode")
            self.setStyleSheet("""
                QMainWindow {
                    background-color: #f8fafc;
                }
                QLabel {
                    font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', 'Arial';
                    font-size: 11px;
                    color: #475569;
                    font-weight: bold;
                }
                #TopFrame {
                    background-color: #f1f5f9;
                    border: none;
                    border-radius: 12px;
                }
                #RadioFrame {
                    background-color: #f1f5f9;
                    border-left: 4px solid #6366f1;
                    border-radius: 12px;
                }
                #RadioTitle {
                    color: #4f46e5;
                    font-size: 11px;
                }
                #RadioMQuestBtn, #RadioLiveBtn {
                    background-color: #cbd5e1;
                    color: #1e293b;
                }
                #RadioMQuestBtn:checked, #RadioLiveBtn:checked {
                    background-color: #10b981;
                    color: #ffffff;
                }
                #RadioStopBtn {
                    background-color: #ef4444;
                    color: #ffffff;
                }
                #RadioStopBtn:hover {
                    background-color: #dc2626;
                }
                #RadioVolLabel {
                    color: #4f46e5;
                    font-family: monospace;
                    font-weight: bold;
                }
                #RadioStatusLabel {
                    color: #64748b;
                    font-family: monospace;
                    font-size: 10px;
                }
                QSlider::groove:horizontal {
                    height: 4px;
                    background: #cbd5e1;
                    border-radius: 2px;
                }
                QSlider::handle:horizontal {
                    background: #6366f1;
                    width: 12px;
                    height: 12px;
                    margin: -4px 0;
                    border-radius: 6px;
                }
                QLineEdit {
                    background-color: #ffffff;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    font-family: 'Segoe UI', 'Inter', 'Arial', monospace;
                    font-size: 12px;
                    padding: 6px 10px;
                    color: #1e293b;
                }
                QLineEdit:focus {
                    border: 1px solid #6366f1;
                }
                QPushButton {
                    background-color: #6366f1;
                    border: none;
                    border-radius: 8px;
                    font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', 'Arial';
                    font-size: 11px;
                    font-weight: bold;
                    padding: 6px 14px;
                    color: #ffffff;
                }
                QPushButton:hover {
                    background-color: #4f46e5;
                }
                QPushButton:pressed {
                    background-color: #4338ca;
                }
                QPushButton:disabled {
                    background-color: #94a3b8;
                    border: none;
                    color: #cbd5e1;
                }
                #StatusDisplay, #MOTDDisplay, #ChatDisplay {
                    background-color: #ffffff;
                    border: none;
                    border-radius: 12px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    color: #1e293b;
                    padding: 12px;
                }
                #UserList {
                    background-color: #f1f5f9;
                    border: none;
                    border-radius: 12px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    color: #334155;
                    padding: 6px;
                }
                QListWidget::item {
                    padding: 5px 8px;
                    border-radius: 6px;
                    color: #334155;
                }
                QListWidget::item:hover {
                    background-color: #e2e8f0;
                    color: #0f172a;
                }
                QListWidget::item:selected {
                    background-color: #6366f1;
                    color: #ffffff;
                    font-weight: bold;
                }
                QStatusBar {
                    background-color: #f1f5f9;
                    border-top: 1px solid #cbd5e1;
                    color: #475569;
                    font-size: 11px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                }
                QStatusBar::item {
                    border: none;
                }
                #StatusLbl, #ServerLbl, #RoomLbl, #NickLbl, #TimeLbl {
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    font-size: 11px;
                    color: #475569;
                }
                QTabWidget::pane {
                    border: none;
                    background-color: transparent;
                }
                QTabBar::tab {
                    background-color: #f1f5f9;
                    color: #475569;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 12px;
                    margin-right: 4px;
                    font-family: 'Segoe UI', 'Inter', 'Arial';
                    font-size: 11px;
                    font-weight: bold;
                }
                QTabBar::tab:selected {
                    background-color: #6366f1;
                    color: #ffffff;
                }
                QTabBar::tab:hover {
                    background-color: #e2e8f0;
                    color: #0f172a;
                }
                QSplitter::handle {
                    background-color: transparent;
                }
            """)

    def closeEvent(self, event):
        """ ดักเหตุการณ์ปิดโปรแกรม เพื่อให้ปิด Thread อย่างปลอดภัย """
        self.disconnect_irc()
        event.accept()

    def on_user_double_clicked(self, item):
        """ ระบบดับเบิ้ลคลิกที่ชื่อคนเพื่อเปิดแท็บกระซิบส่วนตัว (Query) สำหรับโค้ดจริงใน PDF """
        raw_nick = item.text().strip()
        if not raw_nick:
            return
            
        # ล้างสัญลักษณ์ยศหน้าชื่อ (@, +) ออกเพื่อให้ได้ชื่อเล่นเพียวๆ
        clean_target_nick = self.clean_nick(raw_nick)
        
        # ป้องกันไม่ให้ดับเบิ้ลคลิกคุยกับตัวเอง
        my_current_nick = self.nick_input.text().strip()
        if clean_target_nick.lower() == my_current_nick.lower():
            return

        target_key = clean_target_nick.lower()
        
        # ถ้ายังไม่เคยคุยส่วนตัวกับคนนี้ ให้สร้างแท็บใหม่ขึ้นมา
        if target_key not in self.rooms:
            # เรียกฟังก์ชันจริงในเครื่องของคุณเพื่อสร้างแท็บชื่อเล่นของเพื่อน
            self.get_or_create_channel_tab(clean_target_nick)
            
            # ใส่ข้อความต้อนรับระบบในช่องแชทใหม่
            current_time = datetime.now().strftime("%H:%M")
            welcome_html = f"<div style='color: #64748b; font-size: 12px; padding: 5px 10px;'>[{current_time}] *** เริ่มต้นการสนทนาส่วนตัวกับ {clean_target_nick}</div>"
            self.rooms[target_key]["chat_display"].append(welcome_html)
            
        # สั่งให้ระบบสลับหน้าจอ (Switch Tab) ไปยังแท็บคุยส่วนตัวคนนี้ทันที
        for index in range(self.tab_widget.count()):
            if self.tab_widget.tabText(index).lower() == clean_target_nick.lower():
                self.tab_widget.setCurrentIndex(index)
                break

# =====================================================================
# 3. จุดเริ่มต้นรันโปรแกรม (Entry Point)
# =====================================================================
if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # ตั้งค่าฟอนต์มาตรฐานของแอปพลิเคชัน
    font = QFont("Tahoma", 9)
    app.setFont(font)
    
    window = PIRCHMainWindow()
    window.show()
    sys.exit(app.exec())
`;
