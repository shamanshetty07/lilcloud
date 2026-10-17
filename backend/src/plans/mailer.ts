import nodemailer from "nodemailer";

// waitlist signups are always saved; the notification email only goes out when SMTP_* is configured
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, WAITLIST_NOTIFY_EMAIL } = process.env;
const notifyTo = WAITLIST_NOTIFY_EMAIL || "shamanshetty0007@gmail.com";

const transport = SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: Number(SMTP_PORT || 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
    : null;

export const mailerConfigured = () => transport !== null;

// returns true when the email was handed to the SMTP server
export const sendWaitlistNotification = async (entry: { email: string; plan: string }) => {
    if (!transport) return false;
    await transport.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: notifyTo,
        subject: `lilcloud waitlist: ${entry.plan}`,
        text: `New waitlist signup\n\nEmail: ${entry.email}\nPlan: ${entry.plan}\nTime: ${new Date().toISOString()}\n`,
    });
    return true;
};
