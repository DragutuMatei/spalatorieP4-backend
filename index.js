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
import emailRoutes from "./src/routes/emailRoutes.js";

import { createServer } from "http";
import { Server } from "socket.io";
import { setIO } from "./src/utils/socket.js";
import settingsRouter from "./src/routes/settingsRoutes.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import {
  startWeeklyProgramariCleanup,
  deleteExpiredDryerBookings,
} from "./src/services/cleanup.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";

dayjs.extend(utc);
dayjs.extend(timezone);
app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: "1500mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "1500mb",
    extended: true,
    parameterLimit: 500000,
  })
);

app.use(express.json());

// Helmet pentru headers de securitate
app.use(helmet());

// CORS strict
const allowedOrigins = [
  "http://localhost:3002",
  "http://localhost:3000",
  "https://develop.spalatoriep4.osfiir.ro",
  "https://spalatoriep4.osfiir.ro",
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
  res.status(200).json({ message: "API is running" });
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
const dryerLiveSelections = new Map();

// Funcție pentru curățarea rezervărilor expirate (opțional)
const cleanExpiredReservations = () => {
  const now = Date.now();
  const EXPIRATION_TIME = 0.5 * 60 * 1000; // 15 minute

  for (const [userId, reservation] of tempReservations.entries()) {
    if (
      reservation.timestamp &&
      now - reservation.timestamp > EXPIRATION_TIME
    ) {
      tempReservations.delete(userId);
      // Notifică toți clienții că rezervarea a expirat
      io.emit("cancelTempReservation", { userId });
    }
  }
};

// Curățarea automată la fiecare 2 minute
setInterval(cleanExpiredReservations, 1 * 60 * 1000);

// Curățarea automată a programărilor la uscător expirate (la fiecare 1 minut)
setInterval(async () => {
  await deleteExpiredDryerBookings();
}, 60 * 1000);

// Endpoint pentru generarea fișierului .ics
app.get("/generate-ics", (req, res) => {
  const { machine, date, startTime, duration, room, fullName } = req.query;

  try {
    const normalizeDate = (dateStr = "") => {
      if (dateStr.includes("T")) {
        return dayjs(dateStr).format("YYYY-MM-DD");
      }
      if (dateStr.includes("/")) {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
      const parsed = dayjs(dateStr);
      return parsed.isValid() ? parsed.format("YYYY-MM-DD") : dateStr;
    };

    const normalizedDate = normalizeDate(date);
    const startLocal = dayjs.tz(
      `${normalizedDate} ${startTime}`,
      "YYYY-MM-DD HH:mm",
      "Europe/Bucharest"
    );

    if (!startLocal.isValid()) {
      throw new Error(
        `Invalid start date/time received: ${normalizedDate} ${startTime}`
      );
    }

    const durationMinutes = parseInt(duration, 10);
    if (Number.isNaN(durationMinutes)) {
      throw new Error(`Invalid duration received: ${duration}`);
    }

    const endLocal = startLocal.add(durationMinutes, "minute");

    const formatUtc = (value) => value.utc().format("YYYYMMDDTHHmmss[Z]");
    const formatStamp = (value) => value.utc().format("YYYYMMDDTHHmmss[Z]");

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Spălătorie Cămin//EN
BEGIN:VEVENT
UID:${Date.now()}@spalatorie-camin.ro
DTSTAMP:${formatStamp(dayjs())}
DTSTART:${formatUtc(startLocal)}
DTEND:${formatUtc(endLocal)}
SUMMARY:Rezervare ${machine}
DESCRIPTION:Rezervare ${machine} pentru ${fullName} (Camera ${room}) - Durata: ${durationMinutes} minute
LOCATION:Spălătorie Cămin
END:VEVENT
END:VCALENDAR`;

    res.setHeader("Content-Type", "text/calendar");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="rezervare-${machine}-${startLocal.format(
        "YYYY-MM-DD"
      )}.ics"`
    );
    res.send(icsContent);
  } catch (error) {
    console.error("Error generating ICS file:", error);
    res.status(500).json({
      success: false,
      message: "Eroare la generarea fișierului .ics",
    });
  }
});

// Endpoint API pentru a obține rezervările temporare
app.get("/api/temp-reservations", (req, res) => {
  try {
    const reservationsObject = Object.fromEntries(tempReservations);
    res.json({
      success: true,
      tempReservations: reservationsObject,
    });
  } catch (error) {
    console.error("Error getting temp reservations:", error);
    res.status(500).json({
      success: false,
      message: "Eroare la obținerea rezervărilor temporare",
    });
  }
});

// Socket.io event handlers
io.on("connection", (socket) => {

  // Când un utilizator se conectează
  socket.on("userConnected", (data) => {

    // Trimite toate rezervările temporare active către utilizatorul care tocmai s-a conectat
    const reservationsObject = Object.fromEntries(tempReservations);
    socket.emit("syncTempReservations", {
      tempReservations: reservationsObject,
    });

    const dryerSelectionsObject = Object.fromEntries(dryerLiveSelections);
    socket.emit("syncDryerSelection", {
      dryerSelections: dryerSelectionsObject,
    });
  });

  // Când cineva solicită sincronizarea rezervărilor temporare
  socket.on("requestTempReservationsSync", () => {
    const reservationsObject = Object.fromEntries(tempReservations);
    socket.emit("syncTempReservations", {
      tempReservations: reservationsObject,
    });
  });

  socket.on("requestDryerSelectionSync", () => {
    const dryerSelectionsObject = Object.fromEntries(dryerLiveSelections);
    socket.emit("syncDryerSelection", {
      dryerSelections: dryerSelectionsObject,
    });
  });

  // Când cineva face o rezervare temporară
  socket.on("tempReservation", (data) => {

    if (data.userId && data.reservation) {
      // Adaugă timestamp pentru expirare
      data.reservation.timestamp = Date.now();

      // Salvează rezervarea temporară
      tempReservations.set(data.userId, data.reservation);

      // Notifică toți ceilalți clienți conectați
      socket.broadcast.emit("tempReservation", data);
    }
  });

  // Când cineva anulează o rezervare temporară
  socket.on("cancelTempReservation", (data) => {

    if (data.userId) {
      // Șterge rezervarea temporară
      tempReservations.delete(data.userId);

      // Notifică toți ceilalți clienți conectați
      socket.broadcast.emit("cancelTempReservation", data);
    }
  });

  socket.on("dryerSelection", (data) => {
    if (!data?.userId || !data.selection) {
      return;
    }

    dryerLiveSelections.set(data.userId, data.selection);
    socket.broadcast.emit("dryerSelection", data);
  });

  socket.on("cancelDryerSelection", (data) => {
    if (!data?.userId) {
      return;
    }

    if (dryerLiveSelections.has(data.userId)) {
      dryerLiveSelections.delete(data.userId);
    }

    socket.broadcast.emit("cancelDryerSelection", data);
  });

  // Când utilizatorul se deconectează
  socket.on("disconnect", () => {

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
  socket.on("programare", (data) => {
    // Codul tău existent pentru programări

    // Când se creează o programare definitivă, șterge rezervarea temporară dacă există
    if (data.action === "create" && data.programare && data.programare.user) {
      const userId = data.programare.user.uid;
      if (tempReservations.has(userId)) {
        tempReservations.delete(userId);
        io.emit("cancelTempReservation", { userId });
      }

      if (dryerLiveSelections.has(userId)) {
        dryerLiveSelections.delete(userId);
        io.emit("cancelDryerSelection", { userId });
      }
    }

    // Broadcast către toți clienții
    socket.broadcast.emit("programare", data);
  });
});

// Funcție helper pentru debugging (opțională)
httpServer.listen(PORT, () => {
  startWeeklyProgramariCleanup();
});
