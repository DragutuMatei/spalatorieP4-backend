import { sendBookingConfirmationEmail, sendDeletedBookingEmail, sendCancelledBookingEmail } from "../services/emailService.js";

export const sendDeletedBookingEmailController = async (req, res) => {
  const result = await sendDeletedBookingEmail(req, res);
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

export const sendCancelledBookingEmailController = async (req, res) => {
  const result = await sendCancelledBookingEmail(req, res);
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

export const sendBookingConfirmationEmailController = async (req, res) => {
  try {
    const result = await sendBookingConfirmationEmail(req.body);
    
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error sending booking confirmation email",
      error: error.message
    });
  }
};
