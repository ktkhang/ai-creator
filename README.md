# AI Creator

Ung dung desktop tim kiem bai hat Viet Nam co ban quyen VCPMC, su dung AI de phan tich yeu cau va kiem duyet ket qua.

## Tinh nang

- **Tim kiem thong minh**: Nhap yeu cau bang ngon ngu tu nhien (VD: "nhac tre noi ve tinh yeu", "bai hat chu de 2/9")
- **Xac minh VCPMC**: Tat ca ket qua deu co ban quyen tren [VCPMC](https://www.vcpmc.org)
- **AI kiem duyet**: Claude hoac Gemini phan tich, cham diem va chi giu bai hat noi tieng, tim duoc tren YouTube
- **Hai AI provider**: Ho tro ca Claude (TrollLLM) va Google Gemini, chuyen doi de dang
- **Hien thi thinking process**: Theo doi qua trinh AI phan tich theo tung buoc
- **Thong tin chi tiet**: The loai, nam phat hanh, link VCPMC, link YouTube cho moi bai hat

## Kien truc

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Entry point, IPC handlers
│   ├── preload.ts           # Context bridge API
│   └── services/
│       ├── ai-agent.ts      # IAiAgent interface
│       ├── claude-agent.ts  # Claude implementation
│       ├── claude-client.ts # TrollLLM HTTP client
│       ├── gemini-agent-impl.ts  # Gemini implementation
│       ├── gemini-client.ts # Google Gemini REST client
│       ├── orchestrator.ts  # Search pipeline dieu phoi
│       ├── vcpmc-scraper.ts # VCPMC website scraper
│       ├── itunes-client.ts # iTunes metadata (best-effort)
│       ├── settings.ts      # Settings store (file + env)
│       ├── cache.ts         # LRU cache
│       ├── retry.ts         # Retry with backoff
│       └── logger.ts        # File + console logger
├── renderer/                # React UI (Vite + Tailwind)
│   ├── App.tsx
│   ├── index.css
│   └── components/
│       ├── SearchBar.tsx
│       ├── ResultsTable.tsx
│       ├── SettingsPanel.tsx
│       ├── ThinkingPanel.tsx
│       └── ErrorBoundary.tsx
└── shared/
    └── types.ts             # Shared types & IPC constants
```

## Pipeline tim kiem

```
User nhap: "nhac tre noi ve tinh yeu"
    │
    ▼
AI extract criteria
    ├── artistKeywords: ["Phan Manh Quynh", "Hoang Dung", "Vu.", ...]  (10-20 ten)
    ├── vcpmcKeywords:  ["tinh yeu", "nho em"]
    └── includeGenres:  ["V-pop", "indie"]
    │
    ▼
VCPMC search (song song, 5 keywords/batch)
    ├── Search "Phan Manh Quynh" → 40 records
    ├── Search "Hoang Dung"      → 20 records
    ├── Search "Vu."             → 20 records
    └── ...                      → 300-500 records tong
    │
    ▼
AI curate (batch 20, song song)
    ├── Cham diem 1-10 theo do phu hop + do noi tieng
    ├── Dien genre + year tu knowledge
    └── Chi giu bai >= 6 diem
    │
    ▼
Chua du? → AI suggest them ten nghe si → loop (toi da 4 vong)
    │
    ▼
Ket qua: 15-30 bai hat noi tieng, co ban quyen VCPMC
```

## Cai dat

### Yeu cau

- Node.js >= 18
- npm >= 9

### Cai dat dependencies

```bash
npm install
```

### Cau hinh API key

Tao file `.env` tu `.env.example`:

```bash
cp .env.example .env
```

Dien API key (chon 1 trong 2):

```env
# Claude (TrollLLM)
TROLLLLM_API_KEY=sk-trollllm-...

# Gemini (mien phi)
GEMINI_API_KEY=AIzaSy...
```

Hoac cau hinh trong app tai muc **Cai dat**.

### Chay development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Package thanh app

```bash
# macOS
npm run package:mac

# Windows
npm run package:win
```

Output tai thu muc `release/`.

## Cau hinh

| Bien moi truong | Mo ta |
|---|---|
| `TROLLLLM_API_KEY` | API key Claude tu chat.trollllm.xyz |
| `CLAUDE_API_KEY` | Alias cho TROLLLLM_API_KEY |
| `GEMINI_API_KEY` | API key Google Gemini tu aistudio.google.com |

Cau hinh trong app:
- **AI Provider**: Claude hoac Gemini
- **Model**: Chon model cu the (Claude Sonnet 4.5/4.6/Haiku, Gemini 2.5 Flash/Pro)
- **So luong ket qua**: 1-200 bai hat

## Tech stack

- **Electron** 33 — Desktop framework
- **React** 18 + **Vite** 6 — Renderer UI
- **Tailwind CSS** 4 — Styling
- **TypeScript** 5.6 — Type safety
- **axios** + **cheerio** — HTTP + HTML parsing (VCPMC scraper)
- **electron-builder** 25 — Packaging

## License

Private project.
