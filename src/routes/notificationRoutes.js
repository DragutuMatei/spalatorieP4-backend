import express from "express";
import {
  getUserNotificationsController,
  getAllNotificationsController,
  markNotificationAsReadController,
  deleteNotificationController,
} from "../controllers/notificationsController.js";

const notificationRoutes = express.Router();

notificationRoutes.get("/notifications/user/:userId", getUserNotificationsController);
notificationRoutes.get("/notifications", getAllNotificationsController);
notificationRoutes.put("/notifications/:notificationId/read", markNotificationAsReadController);
notificationRoutes.delete("/notifications/:notificationId", deleteNotificationController);

export default notificationRoutes;
