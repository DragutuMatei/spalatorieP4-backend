import os from "os";
import { db } from "./admin_fire.js";

const LOCAL_SUFFIX = "_local";

const DEV_ORIGINS = [
  "localhost",
  "127.0.0.1",
  "https://develop.spalatoriep4.osfiir.ro",
];
const PROD_ORIGIN = "https://spalatoriep4.osfiir.ro";

const normalizeOrigins = (value = "") => {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const originMatchesAny = (origin, targets = []) => {
  if (!origin) return false;
  return targets.some((target) => {
    if (!target) return false;
    return origin === target || origin.endsWith(target);
  });
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

  const originCandidatesRaw = [
    process.env.SERVER_ORIGIN,
    process.env.APP_ORIGIN,
    process.env.API_BASE_URL,
    process.env.HOST,
    process.env.HOSTNAME,
    process.env.ALLOWED_ORIGINS,
    process.env.REQUEST_ORIGIN,
  ].filter(Boolean);

  const originCandidates = originCandidatesRaw.flatMap(normalizeOrigins);

  if (originCandidates.some((origin) => originMatchesAny(origin, DEV_ORIGINS))) {
    return true;
  }

  if (originCandidates.some((origin) => origin === PROD_ORIGIN)) {
    return false;
  }

  if (originCandidates.some((origin) => origin.includes("localhost"))) {
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
