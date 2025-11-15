# 🔥 Ink Back — Backend Serverless para Estúdios de Tatuagem

Backend desenvolvido em **Cloud Functions (Node.js)** integrado com **Firebase Authentication** e **Firestore**, responsável por toda a lógica de agendamento, gerenciamento de usuários e operações críticas do aplicativo Ink.

Este repositório contém a lógica completa usada pelo app **Ink Front**.

---

# 📌 Objetivo do Projeto

- Centralizar as regras de negócio do sistema de agendamentos.
- Garantir comunicação segura entre app → backend → Firestore.
- Criar endpoints serverless para operações sensíveis:
  - criação de usuário,
  - validação de agenda,
  - persistência de dados unificada,
  - proteção de regras via segurança do Firebase.

---

# 🏗️ Tecnologias Utilizadas

| Tecnologia                   | Uso                                     |
| ---------------------------- | --------------------------------------- |
| **Node.js**                  | Ambiente das Cloud Functions            |
| **Firebase Cloud Functions** | Backend serverless                      |
| **Firestore**                | Banco de dados NoSQL                    |
| **Firebase Authentication**  | Autenticação centralizada               |
| **Express.js**               | API HTTP interna                        |
| **CORS**                     | Segurança na camada HTTP                |
| **axios / node-fetch**       | Integração externa                      |
| **Firebase Admin SDK**       | Acesso privilegiado ao Auth e Firestore |

---

# 🧩 Estrutura do Projeto

```text
functions/
  src/
    controllers/
    services/
    helpers/
    middlewares/
    routes/
    index.ts
  package.json
  tsconfig.json
```
