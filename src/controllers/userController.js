import { saveUser, getUser, getAllUsers, toggleUserApproval, toggleUserRole } from "../services/users.js";
import { getIO } from "../utils/socket.js";

export const saveUserController = async (req, res) => {
  const result = await saveUser(req, res);
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

export const getUserController = async (req, res) => {
  const result = await getUser(req, res);
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

export const getAllUsersController = async (req, res) => {
  const result = await getAllUsers(req, res);
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

export const toggleUserApprovalController = async (req, res) => {
  const result = await toggleUserApproval(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    // Emit socket event for real-time user status update
    getIO().emit("userUpdate", {
      userId: req.body.userId,
      user: result.user,
      action: "approval_changed"
    });
    
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};

export const toggleUserRoleController = async (req, res) => {
  const result = await toggleUserRole(req, res);
  const code = result.code;
  delete result.code;

  if (code === 200) {
    // Emit socket event for real-time user role update
    getIO().emit("userUpdate", {
      userId: req.body.userId,
      user: result.user,
      action: "role_changed"
    });
    
    return res.status(200).json(result);
  } else if (code === 500) {
    return res.status(500).json(result);
  } else {
    return res.status(404).json(result);
  }
};
