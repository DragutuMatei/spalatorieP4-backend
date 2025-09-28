import nodemailer from "nodemailer";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendBookingConfirmationEmail = async (emailData) => {
  const { to, fullName, room, machine, date, startTime, duration } = emailData;

  try {
    // Handle both ISO format and DD/MM/YYYY format
    let dateForCalendar;
    if (typeof date === "string" && date.includes("T")) {
      // ISO format - extract just the date part
      dateForCalendar = date.split("T")[0];
    } else if (typeof date === "string" && date.includes("/")) {
      // DD/MM/YYYY format - convert to YYYY-MM-DD
      const [day, month, year] = date.split("/");
      dateForCalendar = `${year}-${month.padStart(2, "0")}-${day.padStart(
        2,
        "0"
      )}`;
    } else {
      // Try to parse with dayjs and format
      dateForCalendar = dayjs(date).format("YYYY-MM-DD");
    }

    const startDateTime = dayjs.tz(
      `${dateForCalendar} ${startTime}`,
      "YYYY-MM-DD HH:mm",
      "Europe/Bucharest"
    );

    if (!startDateTime.isValid()) {
      throw new Error(
        `Invalid start datetime: ${dateForCalendar} ${startTime}`
      );
    }

    const endDateTime = startDateTime.add(duration, "minute");

    const formattedDate = startDateTime.format("DD-MMM-YYYY");
    const displayDate = startDateTime.format("DD/MM/YYYY");
    const formattedTime = startDateTime.format("HH:mm");

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      `Rezervare ${machine}`
    )}&dates=${startDateTime.utc().format("YYYYMMDDTHHmmss[Z]")}/${endDateTime
      .utc()
      .format("YYYYMMDDTHHmmss[Z]")}&details=${encodeURIComponent(
      `Rezervare ${machine} pentru ${fullName} (Camera ${room}) - Durata: ${duration} minute`
    )}&location=${encodeURIComponent("Spălătorie Cămin")}&ctz=Europe/Bucharest`;

    const port = process.env.PORT || 3001;
    const icsUrl = `https://eager-crin-osfiir-5be47044.koyeb.app/generate-ics?type=booking&machine=${encodeURIComponent(
      machine
    )}&date=${encodeURIComponent(
      startDateTime.format("YYYY-MM-DD")
    )}&startTime=${encodeURIComponent(
      startDateTime.format("HH:mm")
    )}&duration=${duration}&room=${encodeURIComponent(
      room
    )}&fullName=${encodeURIComponent(fullName)}`;

    await transporter.sendMail({
      from: '"Spălătorie Cămin" <spalatoriep4@osfiir.ro>',
      to,
      subject: `Rezervare ${machine} ${formattedDate} ${formattedTime}`,
      html: `
        <h2>Rezervare Confirmată</h2>
        <p>Bună, ${fullName}!</p>
        <p>Ai rezervat <strong>${machine}</strong> pentru data de <strong>${displayDate}</strong>, începând cu ora <strong>${startTime}</strong>, pentru <strong>${duration} minute</strong>.</p>
        <p>Camera: ${room}</p>
        <p>
          <a href="${googleCalendarUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Adaugă în Google Calendar</a>
          <a href="${icsUrl}" style="background-color: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Descarcă .ics</a>
        </p>
        <p>Mulțumim!</p>
      `,
    });

    return {
      success: true,
      message: "Booking confirmation email sent successfully",
    };
  } catch (error) {
    console.error("Error sending booking confirmation email:", error);
    return {
      success: false,
      message: "Error sending booking confirmation email",
      error: error.message,
    };
  }
};

const sendDeletedBookingEmail = async (req, res) => {
  const { to, fullName, room, machine, date, startTime, duration, reason } =
    req.body;

  try {
    // Handle both ISO format and DD/MM/YYYY format
    let dateForCalendar;
    if (typeof date === "string" && date.includes("T")) {
      // ISO format - extract just the date part
      dateForCalendar = date.split("T")[0];
    } else if (typeof date === "string" && date.includes("/")) {
      // DD/MM/YYYY format - convert to YYYY-MM-DD
      const [day, month, year] = date.split("/");
      dateForCalendar = `${year}-${month.padStart(2, "0")}-${day.padStart(
        2,
        "0"
      )}`;
    } else {
      // Try to parse with dayjs and format
      dateForCalendar = dayjs(date).format("YYYY-MM-DD");
    }

    const startDateTime = dayjs.tz(
      `${dateForCalendar} ${startTime}`,
      "YYYY-MM-DD HH:mm",
      "Europe/Bucharest"
    );

    if (!startDateTime.isValid()) {
      throw new Error(`Invalid date created: ${dateForCalendar} ${startTime}`);
    }

    const formattedDate = startDateTime.format("DD-MMM-YYYY");
    const formattedTime = startDateTime.format("HH:mm");
    const displayDate = startDateTime.format("DD/MM/YYYY");

    await transporter.sendMail({
      from: '"Spălătorie Cămin" <spalatoriep4@osfiir.ro>',
      to,
      subject: `Anulare Rezervare ${machine} ${formattedDate} ${formattedTime}`,
      html: `
        <h2>Rezervare Anulată</h2>
        <p>Bună, ${fullName}!</p>
        <p>Rezervarea ta pentru <strong>${machine}</strong> din data de <strong>${displayDate}</strong>, ora <strong>${startTime}</strong> (${duration} minute) a fost anulată.</p>
        <p>Motiv: ${reason}</p>
        <p>Camera: ${room}</p>
        <p>Contactează adminul pentru detalii.</p>
      `,
    });

    return {
      code: 200,
      success: true,
      message: "Email sent successfully",
      emailDetails: {
        to,
        subject: `Anulare Rezervare ${machine} ${formattedDate} ${formattedTime}`,
        sentAt: new Date(),
      },
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      code: 500,
      success: false,
      message: "Error sending email",
      error: error.message,
    };
  }
};

const sendMaintenanceNotificationEmail = async (emailData) => {
  try {
    console.log("Sending maintenance notification email:", emailData);

    // Mock implementation
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      success: true,
      message: "Maintenance notification email sent successfully",
    };
  } catch (error) {
    console.error("Error sending maintenance notification email:", error);
    return {
      success: false,
      message: "Error sending maintenance notification email",
      error: error.message,
    };
  }
};

const sendCancelledBookingEmail = async (req, res) => {
  const { to, fullName, room, machine, date, startTime, endTime, reason } =
    req.body;

  try {
    console.log("Sending cancelled booking email notification:", {
      to,
      fullName,
      room,
      machine,
      date,
      startTime,
      endTime,
      reason,
    });

    // Simulate email sending delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      code: 200,
      success: true,
      message: "Cancelled booking email sent successfully",
      emailDetails: {
        to,
        subject: "Programare anulată - Spălătorie P4",
        sentAt: new Date(),
      },
    };
  } catch (error) {
    console.error("Error sending cancelled booking email:", error);
    return {
      code: 500,
      success: false,
      message: "Error sending cancelled booking email",
      error: error.message,
    };
  }
};

export {
  sendBookingConfirmationEmail,
  sendDeletedBookingEmail,
  sendCancelledBookingEmail,
  sendMaintenanceNotificationEmail,
};
