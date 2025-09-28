// Simple mailer utility placeholder. In production, integrate nodemailer or an external service.
export const sendMailSafe = async ({ to, subject, text, html }) => {
  try {
    if (!to) return { success: false, message: "No recipient" };
    // TODO: integrate nodemailer using SMTP envs if available
    console.log("[MAILER] To:", to);
    console.log("[MAILER] Subject:", subject);
    console.log("[MAILER] Text:\n", text);
    return { success: true };
  } catch (e) {
    console.error("[MAILER] Error:", e);
    return { success: false, message: e.message };
  }
};
