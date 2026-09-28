# Secure 1-to-1 Chat Translator

An English-language 1-to-1 chat application with account registration, sign-in, automatic translation, and encrypted messages.

## Features

- Account registration and sign-in
- Password hashing with Node.js `scrypt`
- Private 1-to-1 chat requests
- AES-256-CBC message encryption
- Automatic translation to the recipient's preferred language
- Online contacts and connection status

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Create an account in one browser window, then create a second account in an incognito window or another browser to test 1-to-1 chat.

## Important limitation

Accounts and conversations are currently stored in server memory. They are cleared when the server restarts. For production, add a database, HTTPS/WSS, authentication tokens, rate limiting, and a production translation provider.
