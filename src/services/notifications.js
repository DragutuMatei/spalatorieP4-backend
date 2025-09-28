import { db } from "../utils/admin_fire.js";

// Get notifications for a user
const getUserNotifications = async (req, res) => {
  const { userId } = req.params;

  try {
    const notificationsRef = db.collection("notifications")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc");
    
    const snapshot = await notificationsRef.get();
    
    if (snapshot.empty) {
      return {
        code: 200,
        success: true,
        notifications: [],
        message: "No notifications found",
      };
    }
    
    const notifications = [];
    snapshot.forEach((doc) => {
      notifications.push({ 
        uid: doc.id, 
        ...doc.data() 
      });
    });
    
    return {
      code: 200,
      success: true,
      notifications: notifications,
      message: "Notifications fetched successfully",
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    };
  }
};

// Get all notifications (admin only)
const getAllNotifications = async (req, res) => {
  try {
    const notificationsRef = db.collection("notifications")
      .orderBy("createdAt", "desc");
    
    const snapshot = await notificationsRef.get();
    
    if (snapshot.empty) {
      return {
        code: 200,
        success: true,
        notifications: [],
        message: "No notifications found",
      };
    }
    
    const notifications = [];
    snapshot.forEach((doc) => {
      notifications.push({ 
        uid: doc.id, 
        ...doc.data() 
      });
    });
    
    return {
      code: 200,
      success: true,
      notifications: notifications,
      message: "Notifications fetched successfully",
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    };
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  const { notificationId } = req.params;

  try {
    const notificationRef = db.collection("notifications").doc(notificationId);
    const notificationDoc = await notificationRef.get();
    
    if (!notificationDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Notification not found",
      };
    }
    
    await notificationRef.update({ 
      read: true,
      readAt: new Date()
    });
    
    return {
      code: 200,
      success: true,
      message: "Notification marked as read",
    };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return {
      code: 500,
      success: false,
      message: "Error marking notification as read",
      error: error.message,
    };
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  const { notificationId } = req.params;

  try {
    const notificationRef = db.collection("notifications").doc(notificationId);
    const notificationDoc = await notificationRef.get();
    
    if (!notificationDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "Notification not found",
      };
    }
    
    await notificationRef.delete();
    
    return {
      code: 200,
      success: true,
      message: "Notification deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting notification:", error);
    return {
      code: 500,
      success: false,
      message: "Error deleting notification",
      error: error.message,
    };
  }
};

export {
  getUserNotifications,
  getAllNotifications,
  markNotificationAsRead,
  deleteNotification
};
