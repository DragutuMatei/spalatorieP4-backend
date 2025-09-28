import express from "express";
import "dotenv/config";
import bodyParser from "body-parser";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
const app = express();
import userRoutes from "./src/routes/userRoutes.js";
import programariRoutes from "./src/routes/programariRoutes.js";
import maintenanceRoutes from "./src/routes/maintenanceRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import emailRoutes from "./src/routes/emailRoutes.js";

import { createServer } from "http";
import { Server } from "socket.io";
import { setIO } from "./src/utils/socket.js";
import settingsRouter from "./src/routes/settingsRoutes.js";

app.use(bodyParser.json({ limit: "1500mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "1500mb",
    extended: true,
    parameterLimit: 500000,
  })
);
app.use(bodyParser.text({ limit: "1500mb" }));

app.use(express.json());

// Helmet pentru headers de securitate
app.use(helmet());

// CORS strict
const allowedOrigins = [
  "http://localhost:3002",
  "http://localhost:3000",
  "http://localhost:3003",
];
app.use(
  cors({
    origin: function (origin, callback) {
      // Permite requests fără origin (ex: curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Rate limiting global (100 requests/15min per IP)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use("/api", userRoutes);
app.use("/api", programariRoutes);
app.use("/api", maintenanceRoutes);
app.use("/api", notificationRoutes);
app.use("/api", emailRoutes);
app.use("/api", settingsRouter);

app.get("/", (req, res) => {
  console.log("API is running...");
});

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setIO(io);

// In socket.js sau server-ul tău principal
// În server-ul tău Socket.io, adaugă următorul cod:

// Stocare in-memory pentru rezervările temporare (în producție, folosește Redis sau o bază de date)
const tempReservations = new Map();

// Funcție pentru curățarea rezervărilor expirate (opțional)
const cleanExpiredReservations = () => {
  const now = Date.now();
  const EXPIRATION_TIME = 0.5 * 60 * 1000; // 15 minute
  
  for (const [userId, reservation] of tempReservations.entries()) {
    if (reservation.timestamp && (now - reservation.timestamp) > EXPIRATION_TIME) {
      tempReservations.delete(userId);
      console.log(`Expired temp reservation removed for user: ${userId}`);
      
      // Notifică toți clienții că rezervarea a expirat
      io.emit("cancelTempReservation", { userId });
    }
  }
};

// Curățarea automată la fiecare 2 minute
setInterval(cleanExpiredReservations, 1 * 60 * 1000);

// Endpoint pentru generarea fișierului .ics
app.get('/generate-ics', (req, res) => {
  const { type, machine, date, startTime, duration, room, fullName } = req.query;
  
  try {
    const startDateTimeOld = new Date(`${date}T${startTime}:00`);
    const startDateTime = new Date(startDateTimeOld.getTime() + 3 * 60 * 60 * 1000);
    const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60 * 1000);
    
    const formatDate = (date) => {
      return date.toISOString().replace(/[-:]/g, '').slice(0, 15);
    };
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Spălătorie Cămin//EN
BEGIN:VEVENT
UID:${Date.now()}@spalatorie-camin.ro
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startDateTime)}
DTEND:${formatDate(endDateTime)}
SUMMARY:Rezervare ${machine}
DESCRIPTION:Rezervare ${machine} pentru ${fullName} (Camera ${room}) - Durata: ${duration} minute
LOCATION:Spălătorie Cămin
END:VEVENT
END:VCALENDAR`;

    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename="rezervare-${machine}-${date}.ics"`);
    res.send(icsContent);
  } catch (error) {
    console.error('Error generating ICS file:', error);
    res.status(500).json({
      success: false,
      message: 'Eroare la generarea fișierului .ics'
    });
  }
});

// Endpoint API pentru a obține rezervările temporare
app.get('/api/temp-reservations', (req, res) => {
  try {
    const reservationsObject = Object.fromEntries(tempReservations);
    res.json({
      success: true,
      tempReservations: reservationsObject
    });
  } catch (error) {
    console.error('Error getting temp reservations:', error);
    res.status(500).json({
      success: false,
      message: 'Eroare la obținerea rezervărilor temporare'
    });
  }
});

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Când un utilizator se conectează
  socket.on('userConnected', (data) => {
    console.log('User connected event:', data);
    
    // Trimite toate rezervările temporare active către utilizatorul care tocmai s-a conectat
    const reservationsObject = Object.fromEntries(tempReservations);
    socket.emit('syncTempReservations', { tempReservations: reservationsObject });
  });

  // Când cineva solicită sincronizarea rezervărilor temporare
  socket.on('requestTempReservationsSync', () => {
    const reservationsObject = Object.fromEntries(tempReservations);
    socket.emit('syncTempReservations', { tempReservations: reservationsObject });
  });

  // Când cineva face o rezervare temporară
  socket.on('tempReservation', (data) => {
    console.log('Temp reservation received:', data);
    
    if (data.userId && data.reservation) {
      // Adaugă timestamp pentru expirare
      data.reservation.timestamp = Date.now();
      
      // Salvează rezervarea temporară
      tempReservations.set(data.userId, data.reservation);
      
      // Notifică toți ceilalți clienți conectați
      socket.broadcast.emit('tempReservation', data);
      
      console.log(`Temp reservation saved for user ${data.userId} on ${data.reservation.date} for ${data.reservation.machine}`);
    }
  });

  // Când cineva anulează o rezervare temporară
  socket.on('cancelTempReservation', (data) => {
    console.log('Cancel temp reservation:', data);
    
    if (data.userId) {
      // Șterge rezervarea temporară
      tempReservations.delete(data.userId);
      
      // Notifică toți ceilalți clienți conectați
      socket.broadcast.emit('cancelTempReservation', data);
      
      console.log(`Temp reservation cancelled for user ${data.userId}`);
    }
  });

  // Când utilizatorul se deconectează
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Opțional: poți să ștergi rezervarea temporară a utilizatorului deconectat
    // sau să o lași să expire automat după 15 minute
    
    // Dacă vrei să ștergi imediat la deconectare:
    /*
    // Găsește user ID-ul based pe socket ID (trebuie să stochezi mapping-ul)
    const userId = getUserIdFromSocketId(socket.id);
    if (userId && tempReservations.has(userId)) {
      tempReservations.delete(userId);
      socket.broadcast.emit('cancelTempReservation', { userId });
    }
    */
    
  });

  // Event handlers existente pentru programări (păstrează-le)
  socket.on('programare', (data) => {
    // Codul tău existent pentru programări
    console.log('Programare event:', data);
    
    // Când se creează o programare definitivă, șterge rezervarea temporară dacă există
    if (data.action === 'create' && data.programare && data.programare.user) {
      const userId = data.programare.user.uid;
      if (tempReservations.has(userId)) {
        tempReservations.delete(userId);
        io.emit('cancelTempReservation', { userId });
        console.log(`Temp reservation removed after final booking for user: ${userId}`);
      }
    }
    
    // Broadcast către toți clienții
    socket.broadcast.emit('programare', data);
  });
});

// Funcție helper pentru debugging (opțională)
const logCurrentReservations = () => {
  console.log('Current temp reservations:', tempReservations.size);
  for (const [userId, reservation] of tempReservations.entries()) {
    console.log(`- User ${userId}: ${reservation.machine} on ${reservation.date}`);
  }
};

// Log rezervările la fiecare 5 minute (pentru debugging)
setInterval(logCurrentReservations, 5 * 60 * 1000);
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
