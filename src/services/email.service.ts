import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
  const host = process.env.MAIL_HOST;
  const port = process.env.MAIL_PORT;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !port || !user || !pass) {
    console.error('Email configuration missing: MAIL_HOST, MAIL_PORT, MAIL_USER or MAIL_PASS');
    return false;
  }

  const portNumber = parseInt(port, 10);
  const transporter = nodemailer.createTransport({
    host,
    port: portNumber,
    secure: portNumber === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: user,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });

    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};
