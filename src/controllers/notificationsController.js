import { 
  getUserNotifications, 
  getAllNotifications, 
  markNotificationAsRead,
  deleteNotification 
} from "../services/notifications.js";

export const getUserNotificationsController = async (req, res) => {
  const result = await getUserNotifications(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export const getAllNotificationsController = async (req, res) => {
  const result = await getAllNotifications(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export const markNotificationAsReadController = async (req, res) => {
  const result = await markNotificationAsRead(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export const deleteNotificationController = async (req, res) => {
  const result = await deleteNotification(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};
