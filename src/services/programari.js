import { getCollection } from "../utils/collections.js";
import { getIO } from "../utils/socket.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { deleteProgramariOlderThanThreeDays } from "./cleanup.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const BUCURESTI_TZ = "Europe/Bucharest";
const DRYER_MACHINE = "Uscator";

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
      return dayjs
        .unix(value.seconds + value.nanoseconds / 1_000_000_000)
        .tz(BUCURESTI_TZ);
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

  try {
    if (!programareData?.machine) {
      return {
        code: 400,
        success: false,
        message: "Tipul mașinii este obligatoriu pentru programare.",
      };
    }

    if (programareData?.user) {
      const userUid = programareData.user.uid;
      if (userUid) {
        try {
          const userDoc = await getCollection("users").doc(userUid).get();
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

    const isDryerBooking = programareData.machine === DRYER_MACHINE;

    if (isDryerBooking) {
      const durationMinutes = Number(programareData.durationMinutes);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        return {
          code: 400,
          success: false,
          message: "Durata pentru uscător trebuie să fie un număr pozitiv.",
        };
      }

      const startTimeBucharest = programareData.startTimestamp
        ? toBucharestDayjs(programareData.startTimestamp)
        : toBucharestDayjs(
          `${programareData.date} ${programareData.start_interval_time}`
        );

      if (!startTimeBucharest.isValid()) {
        return {
          code: 400,
          success: false,
          message: "Data pentru uscător nu este validă.",
        };
      }

      const endTimeBucharest = startTimeBucharest.add(durationMinutes, "minute");

      programareData.date = startTimeBucharest.format("DD/MM/YYYY");
      programareData.start_interval_time = startTimeBucharest.format("HH:mm");
      programareData.final_interval_time = endTimeBucharest.format("HH:mm");
      programareData.startsAt = startTimeBucharest.valueOf();
      programareData.endsAt = endTimeBucharest.valueOf();
      programareData.duration = durationMinutes;
      programareData.active =
        programareData.active ||
        {
          status: true,
          message: "Program uscător activ",
          startedAt: new Date(),
        };
    } else {
      programareData.duration = calculateDuration(
        programareData.start_interval_time,
        programareData.final_interval_time
      );
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

    const proRef = await getCollection("programari").add(programareData);
    const content = await proRef.get();
    const data = { ...content.data(), uid: proRef.id };

    return {
      code: 200,
      success: true,
      message: "Programare saved successfully",
      programare: data,
    };
  } catch (error) {
    console.error("Error saving programare:", error);
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
    const programariRef = getCollection("programari").where(
      "user.uid",
      "==",
      uid
    );
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
    console.error("Error fetching programari by user:", error);
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
    const programariRef = getCollection("programari")
      .where("active.status", "==", true)
      .where("machine", "==", machine);

    const snapshot = await programariRef.get();

    if (snapshot.empty) {
      return { hasConflict: false, conflicts: [] };
    }

    const conflicts = [];
    const updates = [];
    const now = dayjs().tz(BUCURESTI_TZ).valueOf();

    await Promise.all(
      snapshot.docs.map(async (doc) => {
        const programare = doc.data();

        if (
          machine === DRYER_MACHINE &&
          programare.active?.status &&
          typeof programare.endsAt === "number" &&
          programare.endsAt <= now
        ) {
          updates.push(
            doc.ref.update({
              active: {
                status: false,
                message: "Program uscător finalizat automat",
                expiredAt: new Date(),
              },
            })
          );
          return;
        }

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
      })
    );

    if (updates.length) {
      try {
        await Promise.all(updates);
      } catch (error) {
        console.warn(
          "Failed to auto-expire dryer bookings during conflict check",
          error
        );
      }
    }

    let maintenanceConflicts = [];

    if (machine === DRYER_MACHINE) {
      const maintenanceRef = getCollection("maintenance")
        .where("machine", "==", DRYER_MACHINE)
        .where("date", "==", targetDate);

      const maintenanceSnapshot = await maintenanceRef.get();

      if (!maintenanceSnapshot.empty) {
        const requestedStartMinutes = parseTimeToMinutes(startTime);
        const requestedEndMinutes = parseTimeToMinutes(endTime);

        maintenanceSnapshot.forEach((doc) => {
          const maintenance = doc.data();
          const maintenanceStartMinutes = parseTimeToMinutes(
            maintenance.startTime || maintenance.start_interval_time
          );
          const maintenanceEndMinutes = parseTimeToMinutes(
            maintenance.endTime || maintenance.final_interval_time
          );

          const overlapsMaintenance =
            requestedStartMinutes < maintenanceEndMinutes &&
            requestedEndMinutes > maintenanceStartMinutes;

          if (overlapsMaintenance) {
            maintenanceConflicts.push({
              maintenanceId: doc.id,
              maintenance,
            });
          }
        });
      }
    }

    return {
      hasConflict:
        conflicts.length > 0 || maintenanceConflicts.length > 0,
      conflicts: conflicts,
      maintenanceConflicts,
    };
  } catch (error) {
    console.error("Error checking for conflicts:", error);
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
    let programareRef = getCollection("programari");
    const snapshot = await programareRef.get();

    // If no bookings at all, return empty list (200 OK)
    if (snapshot.empty) {
      return {
        code: 200,
        success: true,
        programari: [],
        message: "No programari found",
      };
    }

    const programari = [];
    const userCache = {};

    const nowValue = dayjs().tz(BUCURESTI_TZ).valueOf();
    const targetDate = req.query.date;
    const includeInactive = req.query.includeInactive === "true";

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Filter by date if requested
      if (targetDate) {
        const docDate = formatBucharestDate(data.date);

        // Exception: Always include active dryer bookings regardless of date
        // so the frontend knows the dryer is busy right now.
        const isActiveDryer =
          data.machine === DRYER_MACHINE &&
          data.active &&
          data.active.status === true;

        if (docDate !== targetDate && !isActiveDryer) {
          continue;
        }
      }

      const isActive = data.active && data.active.status === true;

      // Logic for auto-expiring dryer bookings (only if they appear active)
      if (isActive && data.machine === DRYER_MACHINE) {
        let endsAtMillis = Number.isFinite(data.endsAt) ? data.endsAt : null;
        if (!Number.isFinite(endsAtMillis) && Number.isFinite(data.endTimestamp)) {
          endsAtMillis = data.endTimestamp;
        }

        if (!Number.isFinite(endsAtMillis)) {
          const bookingDate = formatBucharestDate(data.date);
          if (bookingDate) {
            const endCandidate = dayjs.tz(
              `${bookingDate} ${data.final_interval_time || ""}`,
              "DD/MM/YYYY HH:mm",
              BUCURESTI_TZ
            );
            if (endCandidate.isValid()) {
              endsAtMillis = endCandidate.valueOf();
            }
          }
        }

        if (Number.isFinite(endsAtMillis) && endsAtMillis <= nowValue) {
          const updatedActiveState = {
            status: false,
            message: "Program uscător finalizat automat",
            expiredAt: new Date(),
          };

          try {
            await doc.ref.update({ active: updatedActiveState });
            const expiredProgramare = {
              uid: doc.id,
              ...data,
              active: updatedActiveState,
            };
            getIO().emit("programare", {
              action: "update",
              programare: expiredProgramare,
            });

            // If this booking just expired, and we only want active ones, skip it unless includeInactive is true
            if (!includeInactive) {
              continue;
            }
            // Update local data to reflect expiry
            data.active = updatedActiveState;

          } catch (updateError) {
            console.error(
              "Failed to auto-expire dryer booking",
              doc.id,
              updateError
            );
          }
        }
      }

      // Final decision: do we include this booking in the response?
      // Yes if includeInactive is true OR if it's still active
      if (includeInactive || (data.active && data.active.status === true)) {
        const bookingUser = data.user || {};
        const userUid = bookingUser.uid;

        if (userUid && (!bookingUser.telefon || !bookingUser.email)) {
          if (!userCache[userUid]) {
            try {
              const userDoc = await getCollection("users").doc(userUid).get();
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
    console.error("Error fetching programari:", error);
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
    const programareRef = getCollection("programari").doc(programareId);
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
    console.error("Error updating programare:", error);
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

    const programariRef = getCollection("programari")
      .where("active.status", "==", true)
      .where("machine", "==", machine);

    const snapshot = await programariRef.get();

    if (snapshot.empty) {
      return { hasConflict: false, conflicts: [] };
    }

    const conflicts = [];
    const updates = [];
    const now = dayjs().tz(BUCURESTI_TZ).valueOf();

    await Promise.all(
      snapshot.docs.map(async (doc) => {
        if (doc.id === excludeId) {
          return;
        }

        const programare = doc.data();

        if (
          machine === DRYER_MACHINE &&
          programare.active?.status &&
          typeof programare.endsAt === "number" &&
          programare.endsAt <= now
        ) {
          updates.push(
            doc.ref.update({
              active: {
                status: false,
                message: "Program uscător finalizat automat",
                expiredAt: new Date(),
              },
            })
          );
          return;
        }

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
      })
    );

    if (updates.length) {
      try {
        await Promise.all(updates);
      } catch (error) {
        console.warn(
          "Failed to auto-expire dryer bookings during conflict exclusion check",
          error
        );
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts: conflicts,
    };
  } catch (error) {
    console.error("Error checking for conflicts:", error);
    throw error;
  }
};

const deleteProgramare = async (req, res) => {
  const { uid } = req.params;

  try {
    const programareRef = getCollection("programari").doc(uid);
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
        const userDoc = await getCollection("users").doc(userUid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          userEmail = userData.google?.email || userData.email || userEmail;
        }
      } catch (userError) {
        console.warn(
          "Unable to load user for cancellation email",
          userUid,
          userError
        );
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
      console.error(
        "Error sending cancellation email (user delete):",
        emailError
      );
    }

    getIO().emit("programare", { action: "delete", programareId: uid });

    return {
      code: 200,
      success: true,
      message: "Programare deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting programare:", error);
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
    const bookingRef = getCollection("programari").doc(bookingId);
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
    const userRef = getCollection("users").doc(bookingData.user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(
        `User ${bookingData.user.uid} not found in users collection`
      );
    }

    const userData = userDoc.exists ? userDoc.data() : null;

    // Create notification
    await getCollection("notifications").add({
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
          to:
            userData?.google?.email ||
            userData?.email ||
            bookingData.user.email,
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
    const programariRef = getCollection("programari");
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
    const bookingRef = getCollection("programari").doc(bookingId);
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
    const userRef = getCollection("users").doc(bookingData.user.uid);
    const userDoc = await userRef.get();

    const userData = userDoc.exists ? userDoc.data() : null;

    // Create notification for user to see in MyBooks
    const notificationData = {
      userId: bookingData.user.uid,
      type: "booking_cancelled",
      message: `Programarea ta pentru ${bookingData.machine
        } din data ${formatBucharestDate(bookingData.date)} (${bookingData.start_interval_time
        } - ${bookingData.final_interval_time}) a fost anulată. Motiv: ${reason}`,
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
    };

    const notificationRef = await getCollection("notifications").add(
      notificationData
    );
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

      await sendDeletedBookingEmail({ body: emailData });
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

const runManualCleanup = async (req, res) => {
  const scope = req.body?.scope || "auto";

  try {
    if (!["official", "local", "auto", "remote"].includes(scope)) {
      return {
        code: 400,
        success: false,
        message: "Scope invalid. Folosește official sau local.",
      };
    }

    const { deletedCount, deletedNotifications } =
      await deleteProgramariOlderThanThreeDays(scope);

    return {
      code: 200,
      success: true,
      message: `Ștergere manuală completă pentru scope=${scope}.`,
      deletedProgramari: deletedCount,
      deletedNotifications,
      scope,
    };
  } catch (error) {
    console.error("[Cleanup] Manual run failed:", error);
    return {
      code: 500,
      success: false,
      message: "Curățarea manuală a eșuat.",
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
  runManualCleanup,
};
