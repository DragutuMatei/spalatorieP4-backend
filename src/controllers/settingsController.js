import {
  getSettings,
  saveSetting,
  MAX_BOOKING_DAYS_AHEAD_LIMIT,
} from "../services/settings.js";
import { cancelBookingsBeyondMaxDaysAhead } from "../services/programari.js";
import { getIO } from "../utils/socket.js";

const saveSettingsController = async (req, res) => {
  const { key } = req.body;
  let { value } = req.body;

  if (key === "maxBookingDaysAhead") {
    value = Number(value);
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > MAX_BOOKING_DAYS_AHEAD_LIMIT
    ) {
      return res.status(400).json({
        success: false,
        message: `Numărul de zile trebuie să fie un număr întreg între 0 și ${MAX_BOOKING_DAYS_AHEAD_LIMIT}.`,
      });
    }
  }

  const result = await saveSetting(key, value);
  const code = result.code;
  delete result.code;
  console.log(result);
  if (code === 200 && key === "maxBookingDaysAhead") {
    try {
      result.cancelledBookings = await cancelBookingsBeyondMaxDaysAhead(value);
    } catch (error) {
      console.error("Error cancelling bookings beyond max days ahead:", error);
      result.cancelledBookings = 0;
      result.cancelError = true;
    }
  }
  if (code === 200) {
    // Emit toate setările pentru live update
    console.log("Emitting socket settings update:", result.settings);
    const socketData = {
      action: "update",
      settings: result,
    };
    console.log("Socket data being emitted:", socketData);
    getIO().emit("settings", socketData);
    console.log("Socket emission completed");
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

const getSettingsController = async (req, res) => {
  const result = await getSettings();
  const code = result.code;
  delete result.code;
  console.log(result);
  if (code === 200) {
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export { saveSettingsController, getSettingsController };
