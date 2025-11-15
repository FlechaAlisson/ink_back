/* eslint-disable no-inner-declarations */
/* eslint-disable valid-jsdoc */
/* eslint-disable max-len */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const express = require("express");
const cors = require("cors");

// ✅ Corrigido: importa FieldValue direto do novo módulo
const {FieldValue} = require("firebase-admin/firestore");

admin.initializeApp();


/**
 * Middleware para validar o token de autenticação Firebase.
 *
 * Este middleware extrai o ID token do cabeçalho Authorization ("Bearer <token>"),
 * verifica sua validade com o Firebase Admin SDK e injeta o UID decodificado em `req.user`.
 * Caso o token esteja ausente, malformado ou inválido, retorna HTTP 401.
 *
 * @param {import('express').Request} req - Objeto da requisição Express.
 * @param {import('express').Response} res - Objeto da resposta Express.
 * @param {import('express').NextFunction} next - Função next() para continuar o fluxo da requisição.
 * @returns {Promise<void>} - Continua o fluxo da requisição se o token for válido.
 */
async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({error: "Token ausente ou formato inválido"});
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.user = decoded; // 🔥 salva o uid no request
    next();
  } catch (err) {
    console.error("Erro de autenticação:", err);
    return res.status(401).json({error: "Token inválido ou expirado"});
  }
}


// ==========================================================
// 🔐 LOGIN DE USUÁRIO
// ==========================================================
const API_KEY = "AIzaSyBWbGExveDH9My2zQCDR_55TwX-dS82wl8";

exports.loginUser = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Método não permitido"});
    }

    const {email, password} = req.body;

    if (!email || !password) {
      return res.status(400).json({error: "Email e senha são obrigatórios"});
    }

    console.log("Usando API Key:", API_KEY);

    const loginResponse = await fetch(
        `http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        },
    );

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      return res.status(401).json({
        error: loginData.error ?
          loginData.error.message :
          "Falha no login",
      });
    }

    const uid = loginData.localId;

    const userSnap = await admin.firestore().collection("users").doc(uid).get();

    if (!userSnap.exists) {
      return res.status(404).json({
        error: "Usuário autenticado, mas não encontrado no Firestore",
      });
    }

    return res.status(200).json({
      message: "Login realizado com sucesso",
      user: userSnap.data(),
      tokens: {
        idToken: loginData.idToken,
        refreshToken: loginData.refreshToken,
        expiresIn: loginData.expiresIn,
      },
    });
  } catch (e) {
    console.error("Erro no login:", e);
    return res.status(500).json({error: "Erro interno no servidor"});
  }
});

// ========================================================== (sem artistId)
// ==========================================================
const db = admin.firestore();
const app = express();
app.use(cors({origin: true}));
app.use(express.json());


const OPEN_HOUR = 9;
const CLOSE_HOUR = 18; // último horário começa 17h
const SLOT_DURATION_HOURS = 1;

/**
 * Gera os horários disponíveis entre 09:00 e 17:00 (1h cada).
 * @param {string} dateStr - Data no formato YYYY-MM-DD.
 * @return {string[]} Lista de horários no formato "HH:00".
 */
function generateSlotsForDay(dateStr) {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    const startAt = `${String(h).padStart(2, "0")}:00`;
    slots.push(startAt);
  }
  return slots;
}

// ----------------------------------------------------------
// GET /slots?date=YYYY-MM-DD  → lista horários disponíveis
// ----------------------------------------------------------
app.get("/slots", verifyAuth, async (req, res) => {
  try {
    const {date} = req.query;
    if (!date) {
      return res
          .status(400)
          .json({error: "Parâmetro 'date' é obrigatório (YYYY-MM-DD)"});
    }

    const slots = generateSlotsForDay(date);

    const snapshot = await db
        .collection("bookings")
        .where("date", "==", date)
        .where("status", "==", "booked")
        .get();

    const occupied = new Set(snapshot.docs.map((doc) => doc.data().startAt));

    const result = slots.map((s) => ({
      startAt: s,
      available: !occupied.has(s),
    }));

    return res.json({date, slots: result});
  } catch (err) {
    console.error("Erro em /slots:", err);
    return res.status(500).json({error: "Erro interno no servidor"});
  }
});

// ----------------------------------------------------------
// POST /book  → cria uma reserva autenticada
// ----------------------------------------------------------
app.post("/book", verifyAuth, async (req, res) => {
  try {
    const {date, startAt} = req.body;

    console.log(date);
    console.log(startAt);

    const [h, m] = startAt.split(":").map(Number);
    const bookingDate = new Date(date);
    bookingDate.setHours(h, m, 0, 0);

    const now = new Date();

    if (bookingDate <= now) {
      return res.status(400).json({
        error: "Não é possível reservar um horário no passado",
      });
    }

    if (!date || !startAt) {
      return res.status(400).json({
        error: "Campos obrigatórios: date, startAt",
      });
    }


    // UID vem do token Firebase
    const uid = req.user.uid;

    // Gera lista de horários válidos
    const slots = generateSlotsForDay(date);
    if (!slots.includes(startAt)) {
      return res.status(400).json({error: "Horário inválido"});
    }

    // ID único: data + hora (impede conflito de horário)
    const docId = `${date}_${startAt}`;

    // Dados mínimos da reserva
    const bookingData = {
      uid,
      date,
      startAt,
      duration: SLOT_DURATION_HOURS * 60, // minutos
      status: "booked",
      createdAt: FieldValue.serverTimestamp(),
    };

    // 🔒 Evita duplicidade
    const ref = db.collection("bookings").doc(docId);
    await ref.create(bookingData);

    return res.status(201).json({ok: true, id: docId});
  } catch (err) {
    if (err.message && err.message.includes("already exists")) {
      return res.status(409).json({error: "Horário já reservado"});
    }

    console.error("Erro em /book:", err);
    return res.status(500).json({error: "Erro interno no servidor"});
  }
});


// ----------------------------------------------------------
// DELETE /booking/:id  → cancela uma reserva
// ----------------------------------------------------------
app.delete("/booking/:id", verifyAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const ref = db.collection("bookings").doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({error: "Reserva não encontrada"});
    }

    await ref.update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
    });

    return res.json({ok: true});
  } catch (err) {
    console.error("Erro em DELETE /booking/:id:", err);
    return res.status(500).json({error: "Erro interno no servidor"});
  }
});


// ----------------------------------------------------------
// GET /bookings/:uid → lista todas as reservas de um usuário
// ----------------------------------------------------------
app.get("/bookings/", verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid; // ✅ UID vem do JWT

    if (!uid) {
      return res.status(401).json({error: "Usuário não autenticado"});
    }


    // ✅ Remove o orderBy que está causando erro
    const snapshot = await db
        .collection("bookings")
        .where("uid", "==", uid)
        .get();

    if (snapshot.empty) {
      return res.json({bookings: []});
    }

    const bookings = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // ✅ Ordena em memória pelo date e startAt
    bookings.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startAt.localeCompare(b.startAt);
    });

    return res.json({bookings});
  } catch (err) {
    console.error("Erro em /bookings/:uid:", err);
    return res.status(500).json({error: "Erro interno no servidor"});
  }
});


// 🔹 Exporta o app Express
exports.api = functions.https.onRequest(app);
