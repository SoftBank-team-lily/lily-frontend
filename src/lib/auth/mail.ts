import "server-only";
import nodemailer from "nodemailer";

export async function sendAuthMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM)
    throw new Error("메일 서버를 설정해 주세요.");
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
    });
  } finally {
    transport.close();
  }
}
