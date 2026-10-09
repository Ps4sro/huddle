# Huddle 💬

A modern, lightweight group video calling web app designed to solve three major communication hurdles:
1. **Cross-Platform:** Works on Android, Windows, iPhone, iPad, Mac, and Linux. No platform lock-in (unlike FaceTime).
2. **Zero-Install & Zero-Login:** Runs 100% inside any modern web browser. Friends simply click an invite link and enter their name—no app store downloads or Google/Apple accounts required.
3. **Background Audio & Multitasking on Mobile:** Overcomes mobile browser throttling using silent audio keep-alive, the OS Media Session API, and one-tap Picture-in-Picture (PiP). You can switch to other apps or lock your phone while continuing to hear and speak to your friends.

---

## 🚀 How It Works

* **WebRTC Full-Mesh Audio & Video:** Audio and video streams flow directly peer-to-peer between participants without passing through the server, ensuring low latency and maximum privacy.
* **Smart Mobile Backgrounding:**
  * **Silent Loop Audio Keep-Alive:** Starts an inaudible audio playback loop on user gesture, telling iOS Safari and Android Chrome that an active media session is running so the OS doesn't mute incoming WebRTC audio when leaving the tab.
  * **OS Media Session:** Integrates with the system lock screen and notification shade with active call controls.
  * **Picture-in-Picture (PiP):** Allows mobile and desktop users to pop the call into a floating window so they can use other apps (texting, gaming, browsing) without interruption.
  * **Auto-Reconnection & Device Restoration:** If iOS momentarily suspends camera hardware when backgrounded, Huddle automatically re-acquires camera/mic upon returning without needing to refresh or rejoin.
* **In-Call Text Chat & Floating Reactions:** Send messages with URL linkification and trigger animated emoji reactions (❤️, 👍, 😂, 🔥, 🎉, ✋, 👏) that float across everyone's screen.
* **Audio & Video Settings:** Switch microphones, cameras, or audio output speakers on the fly with a live microphone volume test meter and speaker chime tester.
* **Keyboard Shortcuts:** Desktop power user controls (`Space` for Push-to-talk, `M` for mute, `V` for camera, `C` for chat, `S` for screen share, `?` for cheat sheet).
* **Native Web Share:** Instant link sharing through iOS/Android native share sheets (iMessage, WhatsApp, Messenger, SMS).
* **Lightweight Signaling Server:** Built on Node.js and Socket.io to coordinate peer connections, room state, and ghost session cleanups.

---

## 📦 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📱 Testing on Phones over Local Wi-Fi

Mobile browsers (especially iOS Safari and Android Chrome) strictly block camera and microphone access on plain `http://` unless the hostname is `localhost`.

To test on your phone over your local network:

1. Run the dev server with HTTPS enabled:
   **PowerShell (Windows):**
   ```powershell
   $env:HTTPS="1"; npm run dev
   ```
   **macOS / Linux:**
   ```bash
   HTTPS=1 npm run dev
   ```
2. Vite will display a local network address (e.g., `https://192.168.1.150:5173`).
3. Open that address on your phone.
4. Accept the browser's self-signed certificate warning ("Advanced" -> "Proceed anyway").
5. Create a room and join!

---

## 🌐 Sharing with Friends over the Internet (Zero Cost)

### Option A: Instant Tunnel (No deployment needed)
If you want to test with your friends right now from your own computer:
1. Build and run production server:
   ```bash
   npm run build
   npm start
   ```
2. In a second terminal, launch a free Cloudflare tunnel:
   ```bash
   npx cloudflared tunnel --url http://localhost:3001
   ```
3. Cloudflare gives you a public HTTPS URL (e.g. `https://random-words.trycloudflare.com`). Send that link to your friends!

### Option B: Free Cloud Hosting (Render, Railway, Fly.io)
You can deploy Huddle to Render or Railway as a standard Node web service:
* **Build Command:** `npm install && npm run build`
* **Start Command:** `npm start`
* **Port:** 3001 (or set via `PORT` env var)

---

## 🛡️ NAT Traversal & TURN Servers

For most home Wi-Fi and residential networks, Huddle connects peers directly using Google's free public STUN servers.

Some mobile carriers or strict corporate firewalls (symmetric NAT) block direct peer-to-peer connections. If two friends on cellular networks cannot hear or see each other, configure a TURN relay server using environment variables:

```bash
TURN_URLS="turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp"
TURN_USERNAME="your-username"
TURN_CREDENTIAL="your-password"
```

> **Tip:** You can get a free TURN server tier from services like [Metered.ca](https://www.metered.ca/tools/openrelay/) (50 GB free TURN bandwidth/month) or self-host [coturn](https://github.com/coturn/coturn).

---

## 🛠️ Project Structure

```
huddle/
├── public/
│   ├── icon.svg              # App icon
│   ├── icon-192.png          # PWA mobile icon (192x192)
│   ├── icon-512.png          # PWA mobile icon (512x512)
│   ├── manifest.webmanifest  # Progressive Web App manifest
│   └── sw.js                 # Service worker for offline shell
├── server/
│   └── index.js              # Express + Socket.io signaling & SPA server
├── src/
│   ├── components/
│   │   ├── Controls.tsx      # In-call action dock (mic, cam, flip, PiP, leave)
│   │   ├── Icons.tsx         # Crisp SVG icons
│   │   ├── Lobby.tsx         # Pre-join preview, device check, name entry
│   │   ├── Room.tsx          # Active meeting grid, PiP, header, toasts
│   │   ├── Toast.tsx         # Floating join/leave notices
│   │   └── VideoTile.tsx     # Participant tile with speaking glow & avatar
│   ├── hooks/
│   │   ├── useAudioLevels.ts # Voice activity detection & active speaker
│   │   └── useGridLayout.ts  # Aspect-ratio maximizing video grid sizing
│   ├── lib/
│   │   ├── audioKeeper.ts    # Silent loop audio keep-alive & PiP helper
│   │   ├── background.ts     # MediaSession, AudioContext & Screen WakeLock
│   │   ├── CallEngine.ts     # WebRTC full-mesh engine (perfect negotiation)
│   │   ├── media.ts          # Camera/mic permissions & facing mode
│   │   └── rooms.ts          # Room ID generator & link parser
│   ├── App.tsx               # Route manager (Lobby <-> Room)
│   ├── main.tsx              # React mounting & SW registration
│   └── styles.css            # Responsive dark mode stylesheet
├── tests/
│   └── signaling.test.mjs    # End-to-end signaling test suite
└── PROTOCOL.md               # WebSocket signaling protocol specification
```

---

## 📱 Mobile Tips for Best Experience

1. **Add to Home Screen (PWA):**
   * On iPhone (Safari): Tap the **Share** button -> **Add to Home Screen**.
   * On Android (Chrome): Tap the **Three Dots** menu -> **Add to Home screen** (or **Install App**).
   * Running as an installed PWA gives the web app background priority.
2. **Background Multitasking:**
   * Tap the **Pop Out** or **PiP** button before switching to other apps or games.
   * On iOS Safari, the operating system pauses the camera feed while the tab is hidden, but voice audio continues uninterrupted. As soon as you switch back to Huddle, your camera automatically restarts.
