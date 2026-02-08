import { getCollection } from "../utils/collections.js";
import { getIO } from "../utils/socket.js";
import dayjs from "dayjs";
import { sendDeletedBookingEmail } from "./emailService.js";

// Add maintenance interval
const addMaintenanceInterval = async (req, res) => {
  const { machine, date, startTime, endTime, slots } = req.body;

  try {
    // Create maintenance record
    const maintenanceData = {
      machine,
      date,
      startTime: `${startTime}`,
      endTime: `${endTime}`,
      slots,
      createdAt: dayjs().valueOf()
    };

    const maintenanceRef = await getCollection("maintenance").add(maintenanceData);

    // Find conflicting bookings
    const programariRef = getCollection("programari")
      .where("machine", "==", machine)
      .where("active.status", "==", true);
    
    const snapshot = await programariRef.get();
    const conflictingBookings = [];

    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        const booking = doc.data();

        let bookingDateObj;
        if (typeof booking.date === "string") {
          bookingDateObj = booking.date.includes("/")
            ? dayjs(booking.date, "DD/MM/YYYY")
            : dayjs(booking.date);
        } else {
          bookingDateObj = dayjs(booking.date);
        }

        const bookingDate = bookingDateObj.format("DD/MM/YYYY");

        if (bookingDate === date) {
          const dateFormatted = bookingDateObj.format("YYYY-MM-DD");
          const bookingStart = dayjs(`${dateFormatted} ${booking.start_interval_time}`);
          const bookingEnd = dayjs(`${dateFormatted} ${booking.final_interval_time}`);
          const maintenanceStart = dayjs(`${dateFormatted} ${startTime}`);
          const maintenanceEnd = dayjs(`${dateFormatted} ${endTime}`);

          if (bookingStart.isBefore(maintenanceEnd) && bookingEnd.isAfter(maintenanceStart)) {
            conflictingBookings.push({
              id: doc.id,
              bookingDateObj,
              ...booking
            });
          }
        }
      });
    }

    const cancelledBookings = [];

    for (const booking of conflictingBookings) {
      try {
        const bookingRef = getCollection("programari").doc(booking.id);
        const cancellationPayload = {
          active: {
            status: false,
            message: "Anulat automat (mentenanță)",
            cancelledAt: dayjs().valueOf(),
            cancelledBy: "maintenance",
          },
        };

        await bookingRef.update(cancellationPayload);

        const updatedDoc = await bookingRef.get();
        const updatedBooking = { uid: booking.id, ...updatedDoc.data() };
        cancelledBookings.push(updatedBooking);

        const userUid = updatedBooking.user?.uid;
        let userEmail = updatedBooking.user?.email || "";
        let userData = null;

        if (userUid) {
          try {
            const userDoc = await getCollection("users").doc(userUid).get();
            if (userDoc.exists) {
              userData = userDoc.data();
              userEmail = userData.google?.email || userData.email || userEmail;
            }
          } catch (userLoadError) {
            console.warn("Unable to load user for maintenance cancellation", userUid, userLoadError);
          }
        }

        const notificationData = {
          userId: userUid,
          type: "maintenance_cancelled",
          message: `Programarea ta pentru ${updatedBooking.machine} din ${dayjs(updatedBooking.date).format("DD/MM/YYYY")} (${updatedBooking.start_interval_time} - ${updatedBooking.final_interval_time}) a fost anulată din cauza mentenanței programate.`,
          date: updatedBooking.date,
          machine: updatedBooking.machine,
          startTime: updatedBooking.start_interval_time,
          endTime: updatedBooking.final_interval_time,
          duration:
            updatedBooking.duration ||
            calculateDuration(
              updatedBooking.start_interval_time,
              updatedBooking.final_interval_time
            ),
          reason: "Mentenanță programată",
          createdAt: dayjs().valueOf(),
          userDetails: {
            numeComplet: updatedBooking.user?.numeComplet || "",
            camera: updatedBooking.user?.camera || "",
            email: userEmail,
          },
        };

        await getCollection("notifications").add(notificationData);

        // Trimite email de anulare către utilizator, dacă avem o adresă validă
        if (userEmail) {
          try {
            await sendDeletedBookingEmail({
              body: {
                to: userEmail,
                fullName: updatedBooking.user?.numeComplet || "",
                room: updatedBooking.user?.camera || "",
                machine: updatedBooking.machine,
                date: dayjs(updatedBooking.date).format("DD/MM/YYYY"),
                startTime: updatedBooking.start_interval_time,
                duration:
                  updatedBooking.duration ||
                  calculateDuration(
                    updatedBooking.start_interval_time,
                    updatedBooking.final_interval_time
                  ),
                reason: "Programarea a fost anulată din cauza mentenanței programate.",
              },
            });
          } catch (emailError) {
            console.error(
              "Failed to send maintenance cancellation email:",
              emailError
            );
          }
        }

        getIO().emit("programare", { action: "update", programare: updatedBooking });
      } catch (cancelError) {
        console.error("Failed to cancel booking during maintenance:", cancelError);
      }
    }

    return {
      code: 200,
      success: true,
      message: cancelledBookings.length
        ? "Maintenance interval added and conflicting bookings cancelled"
        : "Maintenance interval added successfully",
      maintenance: {
        id: maintenanceRef.id,
        ...maintenanceData,
      },
      cancelledBookings,
    };
  } catch (error) {
    console.error("Error adding maintenance interval:", error);
    return {
      code: 500,
      success: false,
      message: "Error adding maintenance interval",
      error: error.message,
    };
  }
};

// Get all maintenance intervals
const getAllMaintenanceIntervals = async (req, res) => {
  try {
    const maintenanceRef = getCollection("maintenance");
    const snapshot = await maintenanceRef.get();
    
    if (snapshot.empty) {
      return {
        code: 200,
        success: true,
        maintenanceIntervals: [],
        message: "No maintenance intervals found",
      };
    }
    
    const intervals = [];
    snapshot.forEach((doc) => {
      intervals.push({ 
        uid: doc.id, 
        ...doc.data() 
      });
    });
    
    // Sort by date (newest first)
    intervals.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    return {
      code: 200,
      success: true,
      maintenanceIntervals: intervals,
      message: "Maintenance intervals fetched successfully",
    };
  } catch (error) {
    console.error("Error fetching maintenance intervals:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching maintenance intervals",
      error: error.message,
    };
  }
};

// Delete maintenance interval
const deleteMaintenanceInterval = async (req, res) => {
  const { maintenanceId } = req.params;

  try {
    const maintenanceRef = getCollection("maintenance").doc(maintenanceId);
    const maintenanceDoc = await maintenanceRef.get();
    
    if (!maintenanceDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Maintenance interval not found",
      };
    }
    
    await maintenanceRef.delete();
    
    return {
      code: 200,
      success: true,
      message: "Maintenance interval deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting maintenance interval:", error);
    return {
      code: 500,
      success: false,
      message: "Error deleting maintenance interval",
      error: error.message,
    };
  }
};

// Delete conflicting bookings for maintenance
const deleteConflictingBookings = async (req, res) => {
  const { bookingIds, reason = "Mentenanță programată" } = req.body;

  try {
    const deletedBookings = [];
    const notifications = [];

    for (const bookingId of bookingIds) {
      const bookingRef = getCollection("programari").doc(bookingId);
      const bookingDoc = await bookingRef.get();
      
      if (bookingDoc.exists) {
        const bookingData = bookingDoc.data();
        
        // Get user details
        const userRef = getCollection("users").doc(bookingData.user.uid);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : null;
        
        // Create notification
        const notification = {
          userId: bookingData.user.uid,
          date: bookingData.date,
          machine: bookingData.machine,
          startTime: bookingData.start_interval_time,
          endTime: bookingData.final_interval_time,
          duration: bookingData.duration || calculateDuration(bookingData.start_interval_time, bookingData.final_interval_time),
          reason: reason,
          createdAt: dayjs().valueOf(),
          userDetails: {
            numeComplet: bookingData.user.numeComplet,
            camera: bookingData.user.camera,
            email: userData?.google?.email || userData?.email || bookingData.user.email
          }
        };
        
        await getCollection("notifications").add(notification);
        notifications.push({
          ...notification,
          userEmail: userData?.google?.email || userData?.email || bookingData.user.email
        });
        
        // Delete booking
        await bookingRef.delete();
        deletedBookings.push({
          id: bookingId,
          ...bookingData
        });
      }
    }

    return {
      code: 200,
      success: true,
      message: "Conflicting bookings deleted successfully",
      deletedBookings,
      notifications
    };
  } catch (error) {
    console.error("Error deleting conflicting bookings:", error);
    return {
      code: 500,
      success: false,
      message: "Error deleting conflicting bookings",
      error: error.message,
    };
  }
};

// Helper function to calculate duration
const calculateDuration = (startTime, endTime) => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  return endTotalMinutes - startTotalMinutes;
};

export {
  addMaintenanceInterval,
  getAllMaintenanceIntervals,
  deleteMaintenanceInterval,
  deleteConflictingBookings
};
