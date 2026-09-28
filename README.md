# Real-time Chat Translator

A lightweight real-time chat application with automatic translation built with React, Socket.IO, and an Express server.

## Features

- Real-time messaging with Socket.IO
- Room-based chat rooms
- Detects and translates incoming messages into each user's preferred language
- Original text + translated text display
- Responsive UI for desktop and mobile use
- Works locally without paid API keys for demo/testing

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express + Socket.IO
- Translation: Argos Translate public endpoint

## Project structure

- `client/`: React frontend
- `server/`: API and WebSocket backend

## Installation

```bash
npm install
```

## Run the app

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Production build

```bash
npm run build
```

## Notes

This project uses a public translation endpoint for local testing. For production usage, consider using Azure Translator, DeepL, or self-hosted translation services.
