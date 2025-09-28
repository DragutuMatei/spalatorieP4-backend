import { 
  addMaintenanceInterval, 
  getAllMaintenanceIntervals, 
  deleteMaintenanceInterval,
  deleteConflictingBookings 
} from "../services/maintenance.js";
import { getIO } from "../utils/socket.js";

export const addMaintenanceIntervalController = async (req, res) => {
  const result = await addMaintenanceInterval(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    // Emit socket event for live updates
    getIO().emit("maintenance", { 
      action: "create", 
      maintenanceInterval: result.maintenance 
    });
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export const getAllMaintenanceIntervalsController = async (req, res) => {
  const result = await getAllMaintenanceIntervals(req, res);
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

export const deleteMaintenanceIntervalController = async (req, res) => {
  const result = await deleteMaintenanceInterval(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    // Emit socket event for live updates
    getIO().emit("maintenance", { 
      action: "delete", 
      maintenanceId: req.params.maintenanceId 
    });
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export const deleteConflictingBookingsController = async (req, res) => {
  const result = await deleteConflictingBookings(req, res);
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
