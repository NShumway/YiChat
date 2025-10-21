graph TB
    subgraph "Mobile App (React Native + Expo)"
        UI[UI Layer<br/>Expo Router + React Native]
        LocalDB[(SQLite<br/>Local Message Store)]
        State[State Management<br/>Zustand + React Query]
        Cache[Translation Cache<br/>AsyncStorage]
        
        UI --> State
        State --> LocalDB
        State --> Cache
    end
    
    subgraph "Firebase Backend"
        Auth[Firebase Auth<br/>User Authentication]
        Firestore[(Firestore<br/>Messages, Users, Chats)]
        CloudFn[Cloud Functions<br/>AI Orchestration]
        FCM[Firebase Cloud Messaging<br/>Push Notifications]
        Storage[Firebase Storage<br/>Media & Profiles]
        
        CloudFn --> Firestore
        CloudFn --> FCM
    end
    
    subgraph "AI Services"
        OpenAI[OpenAI GPT-4 Turbo<br/>Translation & Context]
        VectorDB[(Pinecone/Chroma<br/>Message Embeddings)]
        Agent[AI SDK Agent<br/>Smart Replies]
        
        Agent --> VectorDB
        Agent --> OpenAI
    end
    
    subgraph "Key Data Flows"
        direction LR
        Send[Send Message] --> Opt[Optimistic UI<br/>Show Immediately]
        Opt --> SaveLocal[Save to SQLite]
        SaveLocal --> Upload[Upload to Firestore]
        Upload --> Translate[Cloud Function:<br/>Detect & Translate]
        Translate --> Notify[Push to Recipients]
    end
    
    UI -->|Real-time Listener| Firestore
    UI -->|Authentication| Auth
    UI -->|Upload Media| Storage
    State -->|Sync Messages| Firestore
    
    Firestore -->|Trigger| CloudFn
    CloudFn -->|API Calls| OpenAI
    CloudFn -->|RAG Query| VectorDB
    CloudFn -->|Agent Tasks| Agent
    
    LocalDB -.->|Offline Queue| State
    State -.->|On Reconnect| Firestore
    
    FCM -->|Push Events| UI
    
    style UI fill:#e1f5ff
    style LocalDB fill:#fff4e1
    style Firestore fill:#ffe1e1
    style CloudFn fill:#f0e1ff
    style OpenAI fill:#e1ffe1
    style Agent fill:#e1ffe1
    
    classDef critical fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    class LocalDB,Firestore critical