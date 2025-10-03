import os from "os";
import { db } from "./admin_fire.js";

const LOCAL_SUFFIX = "_local";

const strIncludesLocalhost = (value = "") => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes("localhost") || normalized.includes("127.0.0.1");
};

const computeShouldUseLocal = () => {
  if (process.env.FORCE_DATA_SCOPE === "local") {
    return true;
  }

  if (process.env.FORCE_DATA_SCOPE === "remote") {
    return false;
  }

  if (process.env.LOCAL_DATA === "true") {
    return true;
  }

  const originCandidates = [
    process.env.SERVER_ORIGIN,
    process.env.APP_ORIGIN,
    process.env.API_BASE_URL,
    process.env.HOST,
    process.env.HOSTNAME,
    process.env.ALLOWED_ORIGINS,
  ].filter(Boolean);

  if (originCandidates.some(strIncludesLocalhost)) {
    return true;
  }

  const hostname = os.hostname().toLowerCase();
  if (hostname === "localhost" || hostname.startsWith("desktop")) {
    return true;
  }

  return (process.env.NODE_ENV || "development") !== "production";
};

const shouldUseLocalCollections = computeShouldUseLocal();

const getCollectionName = (baseName = "") => {
  if (!baseName || typeof baseName !== "string") {
    throw new Error("Base collection name must be a non-empty string");
  }
  console.log(
    shouldUseLocalCollections ? `${baseName}${LOCAL_SUFFIX}` : baseName
  );
  return shouldUseLocalCollections ? `${baseName}${LOCAL_SUFFIX}` : baseName;
};

const getDb = () => db;

const createBatch = () => db.batch();

const getCollection = (baseName) => db.collection(getCollectionName(baseName));

const getCollectionWithScope = (baseName, scope = "auto") => {
  if (!baseName || typeof baseName !== "string") {
    throw new Error("Base collection name must be a non-empty string");
  }

  if (scope === "local") {
    return db.collection(`${baseName}${LOCAL_SUFFIX}`);
  }

  if (scope === "official" || scope === "remote") {
    return db.collection(baseName);
  }

  return getCollection(baseName);
};

export {
  getCollection,
  getCollectionName,
  shouldUseLocalCollections,
  LOCAL_SUFFIX,
  getDb,
  createBatch,
  getCollectionWithScope,
};
