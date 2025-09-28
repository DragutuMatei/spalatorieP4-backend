// import {
//   saveProgramare,
//   getAllProgramari,
//   getProgramareByUserUid,
//   updateProgramare,
//   deleteProgramare,
// } from "../services/programari.js";

// import { getIO } from "../utils/socket.js";

// const handleResponse = (res, result, onSuccess) => {
//   const code = result.code;
//   delete result.code;
//   console.log(result);

//   if (code === 200) {
//     if (onSuccess) {
//       onSuccess(result);
//     }
//     return res.status(200).json(result);
//   } else if (code === 500) {
//     return res.status(500).json(result);
//   } else {
//     return res.status(404).json(result);
//   }
// };

// const saveProgramareController = async (req, res) => {
//   const result = await saveProgramare(req, res);
//   handleResponse(res, result, (result) => {
//     getIO().emit("programare", { action: "create", programare: result });
//   });
// };

// const getAllProgramariController = async (req, res) => {
//   const result = await getAllProgramari(req, res);
//   handleResponse(res, result);
// };

// const getProgramareByUserUidController = async (req, res) => {
//   const result = await getProgramareByUserUid(req, res);
//   handleResponse(res, result);
// };

// const updateProgramareController = async (req, res) => {
//   const result = await updateProgramare(req, res);
//   handleResponse(res, result, (result) => {
//     getIO().emit("programare", { action: "update", programare: result });
//   });
// };

// const deleteProgramareController = async (req, res) => {
//   const result = await deleteProgramare(req, res);
//   handleResponse(res, result, () => {
//     console.log(req.params.uid);
//     getIO().emit("programare", {
//       action: "delete",
//       programareId: req.params.uid,
//     });
//   });
// };

// export {
//   saveProgramareController,
//   getAllProgramariController,
//   getProgramareByUserUidController,
//   updateProgramareController,
//   deleteProgramareController,
// };

// import {
//   saveProgramare,
//   getAllProgramari,
//   getProgramareByUserUid,
//   updateProgramare,
//   deleteProgramare,
// } from "../services/programari.js";
// import { getIO } from "../utils/socket.js";

// const handleResponse = (res, result, onSuccess) => {
//   const { code, ...rest } = result;
//   if (code === 200) {
//     onSuccess?.(rest);
//     return res.status(200).json(rest);
//   }
//   return res.status(code === 500 ? 500 : 404).json(rest);
// };

// const saveProgramareController = async (req, res) => {
//   const result = await saveProgramare(req, res);
//   handleResponse(res, result, (r) =>
//     getIO().emit("programare", { action: "create", programare: r })
//   );
// };

// const getAllProgramariController = async (req, res) => {
//   const result = await getAllProgramari(req, res);
//   handleResponse(res, result);
// };

// const getProgramareByUserUidController = async (req, res) => {
//   const result = await getProgramareByUserUid(req, res);
//   handleResponse(res, result);
// };

// const updateProgramareController = async (req, res) => {
//   const result = await updateProgramare(req, res);
//   handleResponse(res, result, (r) =>
//     getIO().emit("programare", { action: "update", programare: r })
//   );
// };

// const deleteProgramareController = async (req, res) => {
//   const result = await deleteProgramare(req, res);
//   handleResponse(res, result, () =>
//     getIO().emit("programare", {
//       action: "delete",
//       programareId: req.params.uid,
//     })
//   );
// };

// export {
//   saveProgramareController,
//   getAllProgramariController,
//   getProgramareByUserUidController,
//   updateProgramareController,
//   deleteProgramareController,
// };
import {
  saveProgramare,
  getAllProgramari,
  getProgramareByUserUid,
  updateProgramare,
  deleteProgramare,
  deleteProgramareWithReason,
  cancelProgramareWithReason,
  getFilteredBookings,
} from "../services/programari.js";
import { getIO } from "../utils/socket.js";

const handleResponse = (res, result, onSuccess) => {
  const { code, ...rest } = result;
  if (code === 200) {
    onSuccess?.(rest);
    return res.status(200).json(rest);
  }

  // Gestionăm și status code 409 pentru conflicte
  if (code === 409) {
    return res.status(409).json(rest);
  }

  return res.status(code === 500 ? 500 : 404).json(rest);
};

const saveProgramareController = async (req, res) => {
  const result = await saveProgramare(req, res);
  handleResponse(res, result, (r) =>
    getIO().emit("programare", { action: "create", programare: r.programare })
  );
};

const getAllProgramariController = async (req, res) => {
  const result = await getAllProgramari(req, res);
  handleResponse(res, result);
};

const getProgramareByUserUidController = async (req, res) => {
  const result = await getProgramareByUserUid(req, res);
  handleResponse(res, result);
};

const updateProgramareController = async (req, res) => {
  const result = await updateProgramare(req, res);
  handleResponse(res, result, (r) =>
    getIO().emit("programare", { action: "update", programare: r.programare })
  );
};

const deleteProgramareController = async (req, res) => {
  const result = await deleteProgramare(req, res);
  handleResponse(res, result, () =>
    getIO().emit("programare", {
      action: "delete",
      programareId: req.params.uid,
    })
  );
};

const deleteProgramareWithReasonController = async (req, res) => {
  const result = await deleteProgramareWithReason(req, res);
  handleResponse(res, result, () =>
    getIO().emit("programare", {
      action: "delete",
      programareId: req.body.bookingId,
    })
  );
};

const cancelProgramareWithReasonController = async (req, res) => {
  const result = await cancelProgramareWithReason(req, res);
  handleResponse(res, result, (r) =>
    getIO().emit("programare", {
      action: "update",
      programare: r.cancelledBooking,
    })
  );
};

const getFilteredBookingsController = async (req, res) => {
  const result = await getFilteredBookings(req, res);
  handleResponse(res, result);
};

export {
  saveProgramareController,
  getAllProgramariController,
  getProgramareByUserUidController,
  updateProgramareController,
  deleteProgramareController,
  deleteProgramareWithReasonController,
  cancelProgramareWithReasonController,
  getFilteredBookingsController,
};
