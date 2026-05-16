import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error('Email configuration missing: RESEND_API_KEY or RESEND_FROM_EMAIL');
    return false;
  }

  const resend = new Resend(apiKey);

  try {
    const { error, data } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });

    if (error) {
      console.error('Error sending email with Resend:', error);
      return false;
    }

    console.log('Email sent with Resend:', data?.id ?? 'without-id');
    return true;
  } catch (error) {
    console.error('Error sending email with Resend:', error);
    return false;
  }
};
