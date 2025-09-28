import express from "express";
import {
  saveUserController,
  getUserController,
  getAllUsersController,
  toggleUserApprovalController,
  toggleUserRoleController,
} from "../controllers/userController.js";

const userRoutes = express.Router();

userRoutes.post("/user", saveUserController);
userRoutes.get("/user/:uid", getUserController);

// Admin routes
userRoutes.get("/users", getAllUsersController);
userRoutes.post("/users/toggle-approval", toggleUserApprovalController);
userRoutes.post("/users/toggle-role", toggleUserRoleController);

export default userRoutes;
