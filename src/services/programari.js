import { db } from "../utils/admin_fire.js";
import { getIO } from "../utils/socket.js";
import { sendBookingConfirmationEmail } from "./emailService.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const BUCURESTI_TZ = "Europe/Bucharest";

const toBucharestDayjs = (value) => {
  if (value === undefined || value === null) {
    return dayjs.invalid();
  }

  if (dayjs.isDayjs(value)) {
    return value.tz(BUCURESTI_TZ);
  }

  if (value instanceof Date || typeof value === "number") {
    return dayjs(value).tz(BUCURESTI_TZ);
  }

  if (typeof value === "object") {
    if (value.seconds !== undefined && value.nanoseconds !== undefined) {
      return dayjs.unix(value.seconds + value.nanoseconds / 1_000_000_000).tz(BUCURESTI_TZ);
    }

    if (value._seconds !== undefined && value._nanoseconds !== undefined) {
      return dayjs
        .unix(value._seconds + value._nanoseconds / 1_000_000_000)
        .tz(BUCURESTI_TZ);
    }
  }

  if (typeof value === "string") {
    if (value.includes("T")) {
      const asUtc = dayjs.utc(value);
      return asUtc.isValid() ? asUtc.tz(BUCURESTI_TZ) : dayjs.invalid();
    }

    if (value.includes("/")) {
      return dayjs.tz(value, "DD/MM/YYYY", BUCURESTI_TZ);
    }

    if (value.includes("-")) {
      return dayjs.tz(value, "YYYY-MM-DD", BUCURESTI_TZ);
    }
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.tz(BUCURESTI_TZ) : dayjs.invalid();
};

const formatBucharestDate = (value, formatStr = "DD/MM/YYYY") => {
  const date = toBucharestDayjs(value);
  return date.isValid() ? date.format(formatStr) : "";
};

const saveProgramare = async (req, res) => {
  const { programareData } = req.body;

  console.log("Received programareData:", programareData);
  console.log("Date format received:", programareData.date);

  try {
    if (programareData?.user) {
      const userUid = programareData.user.uid;
      if (userUid) {
        try {
          const userDoc = await db.collection("users").doc(userUid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (!programareData.user.telefon && userData.telefon) {
              programareData.user.telefon = userData.telefon;
            }
            if (!programareData.user.email) {
              programareData.user.email =
                userData.google?.email || userData.email || "";
            }
          }
        } catch (lookupError) {
          console.warn("Unable to enrich programare user data:", lookupError);
        }
      }
    }

    // Verificăm dacă există conflict de programare
    const conflictCheck = await checkForConflicts(
      programareData.date,
      programareData.start_interval_time,
      programareData.final_interval_time,
      programareData.machine
    );

    if (conflictCheck.hasConflict) {
      return {
        code: 409, // Conflict status code
        success: false,
        message:
          "Există deja o programare pentru această mașină în intervalul selectat!",
        conflictDetails: conflictCheck.conflicts,
      };
    }

    const proRef = await db.collection("programari").add(programareData);
    const content = await proRef.get();
    const data = { ...content.data(), uid: proRef.id };
    console.log(data);

    // Trimitem email de confirmare
    try {
      // Normalizăm data pentru email
      let normalizedDate = formatBucharestDate(programareData.date);
      if (!normalizedDate) {
        normalizedDate = formatBucharestDate(dayjs().tz(BUCURESTI_TZ));
      }

      const emailData = {
        to: programareData.user.google?.email || programareData.user.email,
        fullName: programareData.user.numeComplet,
        room: programareData.user.camera,
        machine: programareData.machine,
        date: normalizedDate,
        startTime: programareData.start_interval_time,
        duration: calculateDuration(
          programareData.start_interval_time,
          programareData.final_interval_time
        ),
      };

      console.log("Email data being sent:", emailData);

      await sendBookingConfirmationEmail(emailData);
      console.log("Booking confirmation email sent successfully");
    } catch (emailError) {
      console.error("Error sending booking confirmation email:", emailError);
      // Nu oprim procesul dacă email-ul nu se trimite
    }

    return {
      code: 200,
      success: true,
      message: "Programare saved successfully",
      programare: data,
    };
  } catch (error) {
    console.log("Error saving programare:", error);
    return {
      code: 500,
      success: false,
      message: "Error saving programare",
      error: error.message,
    };
  }
};

const getProgramareByUserUid = async (req, res) => {
  const { uid } = req.params;

  try {
    const programariRef = db
      .collection("programari")
      .where("user.uid", "==", uid);
    const snapshot = await programariRef.get();

    if (snapshot.empty) {
      return {
        code: 404,
        success: false,
        message: "No programari found for this user",
      };
    }

    const programari = [];
    snapshot.forEach((doc) => {
      programari.push({ uid: doc.id, ...doc.data() });
    });

    programari.sort((a, b) => {
      const dateA = dayjs(a.date, "DD/MM/YYYY");
      const dateB = dayjs(b.date, "DD/MM/YYYY");
      return dateB.diff(dateA);
    });

    return {
      code: 200,
      success: true,
      programari,
      message: "Programari found for this user",
    };
  } catch (error) {
    console.log("Error fetching programari by user:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching programari",
      error: error.message,
    };
  }
};

const checkForConflicts = async (date, startTime, endTime, machine) => {
  try {
    // Convertim data în format consistent pentru comparare
    const targetDate = formatBucharestDate(date);

    // Query pentru programările din aceeași zi
    const programariRef = db
      .collection("programari")
      .where("active.status", "==", true)
      .where("machine", "==", machine);

    const snapshot = await programariRef.get();

    if (snapshot.empty) {
      return { hasConflict: false, conflicts: [] };
    }

    const conflicts = [];

    snapshot.forEach((doc) => {
      const programare = doc.data();
      const programareDate = formatBucharestDate(programare.date);

      // Verificăm doar programările din aceeași zi
      if (programareDate === targetDate) {
        // Verificăm dacă intervalele se suprapun
        const hasTimeConflict = checkTimeOverlap(
          startTime,
          endTime,
          programare.start_interval_time,
          programare.final_interval_time
        );

        if (hasTimeConflict) {
          conflicts.push({
            uid: doc.id,
            user: programare.user.numeComplet,
            camera: programare.user.camera,
            start_time: programare.start_interval_time,
            end_time: programare.final_interval_time,
          });
        }
      }
    });

    return {
      hasConflict: conflicts.length > 0,
      conflicts: conflicts,
    };
  } catch (error) {
    console.log("Error checking for conflicts:", error);
    throw error;
  }
};

const checkTimeOverlap = (start1, end1, start2, end2) => {
  // Convertim orele în minute pentru comparare mai ușoară
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const start1Minutes = timeToMinutes(start1);
  const end1Minutes = timeToMinutes(end1);
  const start2Minutes = timeToMinutes(start2);
  const end2Minutes = timeToMinutes(end2);

  // Verificăm dacă intervalele se suprapun
  // Două intervale se suprapun dacă:
  // start1 < end2 && start2 < end1
  return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
};

const getAllProgramari = async (req, res) => {
  try {
    const programareRef = db.collection("programari");
    const snapshot = await programareRef.get();
    if (snapshot.empty) {
      return {
        code: 404,
        success: false,
        message: "No programari found",
      };
    }

    const programari = [];
    const userCache = {};

    for (const doc of snapshot.docs) {
      const data = doc.data();

      if (data.active && data.active.status === true) {
        const bookingUser = data.user || {};
        const userUid = bookingUser.uid;

        if (userUid && (!bookingUser.telefon || !bookingUser.email)) {
          if (!userCache[userUid]) {
            try {
              const userDoc = await db.collection("users").doc(userUid).get();
              userCache[userUid] = userDoc.exists ? userDoc.data() : null;
            } catch (lookupError) {
              console.warn(
                "Unable to load user for booking",
                userUid,
                lookupError
              );
              userCache[userUid] = null;
            }
          }

          const cachedUser = userCache[userUid];
          if (cachedUser) {
            data.user = {
              ...bookingUser,
              telefon: bookingUser.telefon || cachedUser.telefon || "",
              email:
                bookingUser.email ||
                cachedUser.google?.email ||
                cachedUser.email ||
                "",
            };
          }
        }

        programari.push({ uid: doc.id, ...data });
      }
    }

    return {
      code: 200,
      success: true,
      programari,
      message: "Programari fetched successfully",
    };
  } catch (error) {
    console.log("Error fetching programari:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching programari",
      error: error.message,
    };
  }
};

const updateProgramare = async (req, res) => {
  const { programareId, updatedData } = req.body;

  try {
    const programareRef = db.collection("programari").doc(programareId);
    const existingDoc = await programareRef.get();

    if (!existingDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Programare not found",
      };
    }

    const existingData = existingDoc.data();
    const shouldValidateConflicts =
      updatedData.date ||
      updatedData.start_interval_time ||
      updatedData.final_interval_time ||
      updatedData.machine;

    if (shouldValidateConflicts) {
      const finalData = {
        date: updatedData.date || existingData.date,
        start_interval_time:
          updatedData.start_interval_time || existingData.start_interval_time,
        final_interval_time:
          updatedData.final_interval_time || existingData.final_interval_time,
        machine: updatedData.machine || existingData.machine,
      };

      const conflictCheck = await checkForConflictsExcluding(
        finalData.date,
        finalData.start_interval_time,
        finalData.final_interval_time,
        finalData.machine,
        programareId
      );

      if (conflictCheck.hasConflict) {
        return {
          code: 409,
          success: false,
          message:
            "Există deja o programare pentru această mașină în intervalul selectat!",
          conflictDetails: conflictCheck.conflicts,
        };
      }
    }

    await programareRef.update(updatedData);
    const updatedDoc = await programareRef.get();
    const updatedProgramare = { uid: programareId, ...updatedDoc.data() };

    getIO().emit("programare", {
      action: "update",
      programare: updatedProgramare,
    });

    return {
      code: 200,
      success: true,
      message: "Programare updated successfully",
      programare: updatedProgramare,
    };
  } catch (error) {
    console.log("Error updating programare:", error);
    return {
      code: 500,
      success: false,
      message: "Error updating programare",
      error: error.message,
    };
  }
};

const checkForConflictsExcluding = async (
  date,
  startTime,
  endTime,
  machine,
  excludeId
) => {
  try {
    const targetDate = formatBucharestDate(date);

    const programariRef = db
      .collection("programari")
      .where("active.status", "==", true)
      .where("machine", "==", machine);

    const snapshot = await programariRef.get();

    if (snapshot.empty) {
      return { hasConflict: false, conflicts: [] };
    }

    const conflicts = [];

    snapshot.forEach((doc) => {
      if (doc.id === excludeId) return;

      const programare = doc.data();
      const programareDate = formatBucharestDate(programare.date);

      if (programareDate === targetDate) {
        const hasTimeConflict = checkTimeOverlap(
          startTime,
          endTime,
          programare.start_interval_time,
          programare.final_interval_time
        );

        if (hasTimeConflict) {
          conflicts.push({
            uid: doc.id,
            user: programare.user.numeComplet,
            camera: programare.user.camera,
            start_time: programare.start_interval_time,
            end_time: programare.final_interval_time,
          });
        }
      }
    });

    return {
      hasConflict: conflicts.length > 0,
      conflicts: conflicts,
    };
  } catch (error) {
    console.log("Error checking for conflicts:", error);
    throw error;
  }
};

const deleteProgramare = async (req, res) => {
  const { uid } = req.params;

  try {
    const programareRef = db.collection("programari").doc(uid);
    const bookingDoc = await programareRef.get();

    if (!bookingDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Programare not found",
      };
    }

    const bookingData = bookingDoc.data();

    await programareRef.delete();

    const userUid = bookingData.user?.uid;
    let userEmail = bookingData.user?.email || "";
    let userData = null;

    if (userUid) {
      try {
        const userDoc = await db.collection("users").doc(userUid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          userEmail = userData.google?.email || userData.email || userEmail;
        }
      } catch (userError) {
        console.warn("Unable to load user for cancellation email", userUid, userError);
      }
    }

    try {
      const { sendCancelledBookingEmail } = await import("./emailService.js");
      await sendCancelledBookingEmail({
        body: {
          to: userEmail,
          fullName: bookingData.user?.numeComplet || "",
          room: bookingData.user?.camera || "",
          machine: bookingData.machine,
          date: formatBucharestDate(bookingData.date),
          startTime: bookingData.start_interval_time,
          endTime: bookingData.final_interval_time,
          reason: "Anulat de utilizator",
        },
      });
    } catch (emailError) {
      console.error("Error sending cancellation email (user delete):", emailError);
    }

    getIO().emit("programare", { action: "delete", programareId: uid });

    return {
      code: 200,
      success: true,
      message: "Programare deleted successfully",
    };
  } catch (error) {
    console.log("Error deleting programare:", error);
    return {
      code: 500,
      success: false,
      message: "Error deleting programare",
      error: error.message,
    };
  }
};

// Delete booking with reason (admin only)
const deleteProgramareWithReason = async (req, res) => {
  const { bookingId, reason } = req.body;

  try {
    // Get booking details
    const bookingRef = db.collection("programari").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Booking not found",
      };
    }

    const bookingData = bookingDoc.data();

    // Get user details
    const userRef = db.collection("users").doc(bookingData.user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(
        `User ${bookingData.user.uid} not found in users collection`
      );
    }

    const userData = userDoc.exists ? userDoc.data() : null;

    // Create notification
    await db.collection("notifications").add({
      userId: bookingData.user.uid,
      date: bookingData.date,
      machine: bookingData.machine,
      startTime: bookingData.start_interval_time,
      endTime: bookingData.final_interval_time,
      duration:
        bookingData.duration ||
        calculateDuration(
          bookingData.start_interval_time,
          bookingData.final_interval_time
        ),
      reason: reason,
      createdAt: new Date(),
      userDetails: {
        numeComplet: bookingData.user.numeComplet,
        camera: bookingData.user.camera,
        email:
          userData?.google?.email || userData?.email || bookingData.user.email,
      },
    });

    // Delete the booking
    await bookingRef.delete();

    try {
      const { sendDeletedBookingEmail } = await import("./emailService.js");
      await sendDeletedBookingEmail({
        body: {
          to: userData?.google?.email || userData?.email || bookingData.user.email,
          fullName: bookingData.user.numeComplet,
          room: bookingData.user.camera,
          machine: bookingData.machine,
          date: formatBucharestDate(bookingData.date),
          startTime: bookingData.start_interval_time,
          duration: calculateDuration(
            bookingData.start_interval_time,
            bookingData.final_interval_time
          ),
          reason: reason || "Anulare administrativă",
        },
      });
    } catch (emailError) {
      console.error("Error sending admin deletion email:", emailError);
    }

    getIO().emit("programare", { action: "delete", programareId: bookingId });

    return {
      code: 200,
      success: true,
      message: "Booking deleted and notification created successfully",
      deletedBooking: {
        id: bookingId,
        ...bookingData,
      },
      userEmail:
        userData?.google?.email || userData?.email || bookingData.user.email,
    };
  } catch (error) {
    console.error("Error deleting booking:", error);
    return {
      code: 500,
      success: false,
      message: "Error deleting booking",
      error: error.message,
    };
  }
};

// Helper function to calculate duration
const calculateDuration = (startTime, endTime) => {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;

  return endTotalMinutes - startTotalMinutes;
};

// Get filtered bookings for admin
const getFilteredBookings = async (req, res) => {
  const { searchTerm, showActiveOnly } = req.query;

  try {
    const programariRef = db.collection("programari");
    const snapshot = await programariRef.get();

    if (snapshot.empty) {
      return {
        code: 200,
        success: true,
        bookings: [],
        message: "No bookings found",
      };
    }

    let bookings = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Only include active bookings for Admin page display
      if (data.active && data.active.status === true) {
        bookings.push({
          uid: doc.id,
          ...data,
          userDetails: {
            numeComplet: data.user?.numeComplet || "N/A",
            camera: data.user?.camera || "N/A",
            email: data.user?.email || "N/A",
          },
        });
      }
    });

    // Filter active bookings if requested
    if (showActiveOnly === "true") {
      const currentDate = dayjs().startOf("day");
      bookings = bookings.filter((booking) => {
        const bookingDate = dayjs(booking.date, "DD/MM/YYYY");
        return bookingDate.isSameOrAfter(currentDate);
      });
    }

    // Filter by search term if provided
    if (searchTerm) {
      bookings = bookings.filter((booking) =>
        booking.user?.numeComplet
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase())
      );
    }

    // Sort by date (newest first)
    bookings.sort((a, b) => {
      const dateA = dayjs(a.date, "DD/MM/YYYY");
      const dateB = dayjs(b.date, "DD/MM/YYYY");
      return dateB.diff(dateA);
    });

    return {
      code: 200,
      success: true,
      bookings: bookings,
      message: "Bookings fetched successfully",
    };
  } catch (error) {
    console.error("Error fetching filtered bookings:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    };
  }
};

// Cancel booking with reason (admin only) - sets active.status = false instead of deleting
const cancelProgramareWithReason = async (req, res) => {
  const { bookingId, reason } = req.body;

  try {
    // Get booking details
    const bookingRef = db.collection("programari").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Booking not found",
      };
    }

    const bookingData = bookingDoc.data();

    // Update the booking to set active.status = false and add cancellation reason
    const updatedData = {
      active: {
        status: false,
        message: reason,
        cancelledAt: new Date(),
        cancelledBy: "admin",
      },
    };

    await bookingRef.update(updatedData);

    // Get user details
    const userRef = db.collection("users").doc(bookingData.user.uid);
    const userDoc = await userRef.get();

    const userData = userDoc.exists ? userDoc.data() : null;

    // Create notification for user to see in MyBooks
    const notificationData = {
      userId: bookingData.user.uid,
      type: "booking_cancelled",
      message: `Programarea ta pentru ${bookingData.machine} din data ${formatBucharestDate(
        bookingData.date
      )} (${bookingData.start_interval_time} - ${
        bookingData.final_interval_time
      }) a fost anulată. Motiv: ${reason}`,
      date: bookingData.date,
      machine: bookingData.machine,
      startTime: bookingData.start_interval_time,
      endTime: bookingData.final_interval_time,
      duration:
        bookingData.duration ||
        calculateDuration(
          bookingData.start_interval_time,
          bookingData.final_interval_time
        ),
      reason: reason,
      createdAt: new Date(),
      read: false,
      userDetails: {
        numeComplet: bookingData.user.numeComplet,
        camera: bookingData.user.camera,
        email:
          userData?.google?.email || userData?.email || bookingData.user.email,
      },
    };

    const notificationRef = await db
      .collection("notifications")
      .add(notificationData);
    const notification = {
      uid: notificationRef.id,
      ...notificationData,
    };

    // Emit socket event for real-time notification
    getIO().emit("notification", {
      userId: bookingData.user.uid,
      notification: notification,
    });

    // Trimitem email de anulare
    try {
      const { sendDeletedBookingEmail } = await import("./emailService.js");

      // Normalizăm data pentru email
      let normalizedDate = formatBucharestDate(bookingData.date);

      const emailData = {
        to:
          userData?.google?.email || userData?.email || bookingData.user.email,
        fullName: bookingData.user.numeComplet,
        room: bookingData.user.camera,
        machine: bookingData.machine,
        date: normalizedDate,
        startTime: bookingData.start_interval_time,
        duration: calculateDuration(
          bookingData.start_interval_time,
          bookingData.final_interval_time
        ),
        reason: reason,
      };

      console.log("Delete email data being sent:", emailData);

      const emailResult = await sendDeletedBookingEmail({ body: emailData });
      console.log("Cancellation email sent successfully:", emailResult);
    } catch (emailError) {
      console.error("Error sending cancellation email:", emailError);
      // Nu oprim procesul dacă email-ul nu se trimite
    }

    // Get updated booking data
    const updatedBookingDoc = await bookingRef.get();
    const cancelledBooking = {
      uid: bookingId,
      ...updatedBookingDoc.data(),
    };

    return {
      code: 200,
      success: true,
      message: "Booking cancelled successfully",
      cancelledBooking: cancelledBooking,
      userEmail:
        userData?.google?.email || userData?.email || bookingData.user.email,
    };
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return {
      code: 500,
      success: false,
      message: "Error cancelling booking",
      error: error.message,
    };
  }
};

export {
  saveProgramare,
  getAllProgramari,
  getProgramareByUserUid,
  updateProgramare,
  deleteProgramare,
  deleteProgramareWithReason,
  cancelProgramareWithReason,
  getFilteredBookings,
};
