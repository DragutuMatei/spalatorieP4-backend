import express from "express";

import {
  saveProgramareController,
  deleteProgramareController,
  getAllProgramariController,
  getProgramareByUserUidController,
  updateProgramareController,
  deleteProgramareWithReasonController,
  cancelProgramareWithReasonController,
  getFilteredBookingsController,
} from "../controllers/programariController.js";

const programariRoutes = express.Router();

programariRoutes.post("/programare", saveProgramareController);
programariRoutes.get("/programare", getAllProgramariController);
programariRoutes.get("/programare/:uid", getProgramareByUserUidController);
programariRoutes.put("/programare/:uid", updateProgramareController);
programariRoutes.delete("/programare/:uid", deleteProgramareController);

// Admin routes
programariRoutes.post("/programare/delete-with-reason", deleteProgramareWithReasonController);
programariRoutes.post("/programare/cancel-with-reason", cancelProgramareWithReasonController);
programariRoutes.get("/bookings/filtered", getFilteredBookingsController);

export default programariRoutes;
