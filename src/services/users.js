import { db } from "../utils/admin_fire.js";
import { getIO } from "../utils/socket.js";

const saveUser = async (req, res) => {
  const { uid, userData } = req.body;

  try {
    const userRef = db.collection("users").doc(uid);

    const existingUserDoc = await userRef.get();
    if (existingUserDoc.exists && req?.body?.preventOverwrite) {
      return {
        code: 409,
        success: false,
        message: "Un cont pentru acest utilizator există deja.",
      };
    }

    const existingData = existingUserDoc.exists ? existingUserDoc.data() : {};
    const dataToSave = { ...userData };

    let requiresReapproval = false;
    if (existingUserDoc.exists && !req?.body?.preventOverwrite) {
      const sensitiveFields = ["numeComplet", "camera", "telefon"];
      requiresReapproval = sensitiveFields.some((field) => {
        if (dataToSave[field] === undefined) return false;
        return dataToSave[field] !== existingData[field];
      });

      if (requiresReapproval) {
        dataToSave.validate = false;
      }
    }

    await userRef.set(dataToSave, { merge: true });
    const savedDoc = await userRef.get();

    const programariRef = db
      .collection("programari")
      .where("user.uid", "==", uid);
    const snapshot = await programariRef.get();
    if (!snapshot.empty) {
      const programari = [];
      snapshot.forEach((doc) => {
        programari.push({ uid: doc.id, ...doc.data() });
      });
      for (let i = 0; i < programari.length; i++) {
        console.log(programari[i]);
        const proRef = db.collection("programari").doc(programari[i].uid);
        const a = await proRef.set(
          {
            user: {
              numeComplet: savedDoc.data().numeComplet,
              camera: savedDoc.data().camera,
              uid: savedDoc.id,
              email: savedDoc.data().google.email,
              telefon: savedDoc.data().telefon || "",
            },
          },
          { merge: true }
        );
        const b = await proRef.get();
        a;
        getIO().emit("programare", { action: "update", programare: b.data() });
      }
      console.log("gata");
    } else {
      console.log("===================================================");
    }

    return {
      code: 200,
      success: true,
      message: "User saved successfully",
      user: savedDoc.data(),
      requiresReapproval,
    };
  } catch (error) {
    console.error("Error saving user:", error);
    return {
      code: 500,
      success: false,
      message: "Error saving user",
      error: error.message,
    };
  }
};

const getUser = async (req, res) => {
  const { uid } = req.params;
  try {
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      return { code: 404, success: false, message: "User not found" };
    }
    return {
      code: 200,
      success: true,
      user: doc.data(),
      message: "User found",
    };
  } catch (error) {
    return {
      code: 500,
      success: false,
      message: "Error fetching user",
      error: error.message,
    };
  }
};
// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      return {
        code: 200,
        success: true,
        users: [],
        message: "No users found",
      };
    }

    const users = [];
    snapshot.forEach((doc) => {
      const userData = doc.data();
      users.push({
        uid: doc.id,
        numeComplet: userData.numeComplet || "N/A",
        camera: userData.camera || "N/A",
        telefon: userData.telefon || "N/A",
        email: userData.google?.email || userData.email || "N/A",
        validate: userData.validate ?? false,
        role: userData.role || "user",
        createdAt: userData.createdAt || null,
      });
    });

    // Sort by creation date (newest first)
    users.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime();
    });

    return {
      code: 200,
      success: true,
      users: users,
      message: "Users fetched successfully",
    };
  } catch (error) {
    console.error("Error fetching users:", error);
    return {
      code: 500,
      success: false,
      message: "Error fetching users",
      error: error.message,
    };
  }
};

// Toggle user approval status
const toggleUserApproval = async (req, res) => {
  const { userId, validate } = req.body;

  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "User not found",
      };
    }

    await userRef.update({ validate: !validate });
    
    // Get updated user data
    const updatedUserDoc = await userRef.get();
    const updatedUser = { uid: userId, ...updatedUserDoc.data() };

    return {
      code: 200,
      success: true,
      message: `User ${!validate ? "validated" : "disvalidated"} successfully`,
      user: updatedUser,
    };
  } catch (error) {
    console.error("Error updating user approval:", error);
    return {
      code: 500,
      success: false,
      message: "Error updating user approval",
      error: error.message,
    };
  }
};

// Toggle user admin role
const toggleUserRole = async (req, res) => {
  const { userId, role } = req.body;

  try {
    const allowedRoles = ["admin", "user"];
    if (!allowedRoles.includes(role)) {
      return {
        code: 400,
        success: false,
        message: "Invalid role provided",
      };
    }

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return {
        code: 404,
        success: false,
        message: "User not found",
      };
    }

    await userRef.update({ role });
    
    // Get updated user data
    const updatedUserDoc = await userRef.get();
    const updatedUser = { uid: userId, ...updatedUserDoc.data() };

    return {
      code: 200,
      success: true,
      message: `User role updated to ${role} successfully`,
      user: updatedUser,
    };
  } catch (error) {
    console.error("Error updating user role:", error);
    return {
      code: 500,
      success: false,
      message: "Error updating user role",
      error: error.message,
    };
  }
};

export { saveUser, getUser, getAllUsers, toggleUserApproval, toggleUserRole };
