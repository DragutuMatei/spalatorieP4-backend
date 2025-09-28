import { db } from "../utils/admin_fire.js";
import dayjs from "dayjs";

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

    const maintenanceRef = await db.collection("maintenance").add(maintenanceData);

    // Find conflicting bookings
    const programariRef = db.collection("programari")
      .where("machine", "==", machine)
      .where("active.status", "==", true);
    
    const snapshot = await programariRef.get();
    const conflictingBookings = [];

    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        const booking = doc.data();
        const bookingDate = dayjs(booking.date, 'DD/MM/YYYY').format('DD/MM/YYYY');
        
        if (bookingDate === date) {
          // Check if booking time overlaps with maintenance
          const dateFormatted = dayjs(date, 'DD/MM/YYYY').format('YYYY-MM-DD');
          const bookingStart = dayjs(`${dateFormatted} ${booking.start_interval_time}`);
          const bookingEnd = dayjs(`${dateFormatted} ${booking.final_interval_time}`);
          const maintenanceStart = dayjs(`${dateFormatted} ${startTime}`);
          const maintenanceEnd = dayjs(`${dateFormatted} ${endTime}`);
          
          if (bookingStart.isBefore(maintenanceEnd) && bookingEnd.isAfter(maintenanceStart)) {
            conflictingBookings.push({
              id: doc.id,
              ...booking
            });
          }
        }
      });
    }

    return {
      code: 200,
      success: true,
      message: "Maintenance interval added successfully",
      maintenance: {
        id: maintenanceRef.id,
        ...maintenanceData
      },
      conflictingBookings
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
    const maintenanceRef = db.collection("maintenance");
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
    const maintenanceRef = db.collection("maintenance").doc(maintenanceId);
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
      const bookingRef = db.collection("programari").doc(bookingId);
      const bookingDoc = await bookingRef.get();
      
      if (bookingDoc.exists) {
        const bookingData = bookingDoc.data();
        
        // Get user details
        const userRef = db.collection("users").doc(bookingData.user.uid);
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
        
        await db.collection("notifications").add(notification);
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
