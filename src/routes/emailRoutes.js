import express from "express";
import {
  sendBookingConfirmationEmailController,
  sendDeletedBookingEmailController,
  sendCancelledBookingEmailController,
} from "../controllers/emailController.js";

const emailRoutes = express.Router();

emailRoutes.post("/send-confirmation-email", sendBookingConfirmationEmailController);
emailRoutes.post("/send-deleted-email", sendDeletedBookingEmailController);
emailRoutes.post("/send-cancelled-email", sendCancelledBookingEmailController);

export default emailRoutes;
